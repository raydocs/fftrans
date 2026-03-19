'use strict';

const axios = require('axios');
const crypto = require('crypto');

const configModule = require('../system/config-module');
const requestModule = require('../system/request-module');
const Logger = require('../../utils/logger');
const { retryWithBackoff, isTransientError } = require('../../utils/retry');
const { ELEVENLABS_AUTH_STATES, ELEVENLABS_AUTH_SOURCES } = require('../../constants');

const FIREBASE_API_KEY = 'AIzaSyDhSxLJa_WaR8I69a1BmlUG7ckfZHu7-ig';
const SECURE_TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const sessionState = {
  bearerToken: '',
  expiresAtMs: 0,
  source: ELEVENLABS_AUTH_SOURCES.NONE,
  refreshTokenKey: '',
  refreshInFlight: null,
  generation: 0,
};

function abortRefreshInFlight(reason = 'refresh_cancelled') {
  const currentRefresh = sessionState.refreshInFlight;
  if (!currentRefresh?.abortController) {
    return;
  }

  try {
    currentRefresh.abortController.abort(reason);
  } catch (error) {
    Logger.warn('elevenlabs-auth', 'Failed to abort in-flight refresh', error.message);
  }
}

function base64UrlDecode(str = '') {
  try {
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch (error) {
    Logger.warn('elevenlabs-auth', 'Failed to decode base64 token payload', error.message);
    return null;
  }
}

function decodeTokenExpiry(token = '') {
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(parts[1]) || '{}');
    if (payload.exp) {
      return payload.exp * 1000;
    }
  } catch (error) {
    Logger.warn('elevenlabs-auth', 'Failed to decode token expiry', error.message);
  }

  return null;
}

function shouldRefreshToken(bearerToken = '', expiresAt) {
  if (!bearerToken) {
    return true;
  }

  if (!expiresAt) {
    return false;
  }

  return Date.now() + EXPIRY_BUFFER_MS >= expiresAt;
}

function buildAuthError(message, error, overrides = {}) {
  const statusCode = overrides.statusCode || error?.statusCode || error?.response?.status;
  const retryable = typeof overrides.retryable === 'boolean' ? overrides.retryable : isTransientError(error || {});
  const authError = new Error(message || error?.message || 'ElevenLabs 认证失败');

  authError.provider = 'ElevenLabs';
  authError.authCode = overrides.authCode || error?.authCode || '';
  authError.statusCode = statusCode;
  authError.retryable = retryable;
  authError.suggestion = overrides.suggestion || '请检查 ElevenLabs Refresh Token 或临时 Bearer Token 配置';
  authError.cause = error;
  return authError;
}

function parseExpiry(expiresAt, fallbackToken = '') {
  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
    return expiresAt;
  }

  if (typeof expiresAt === 'string' && expiresAt.trim()) {
    const parsed = Date.parse(expiresAt);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return decodeTokenExpiry(fallbackToken) || 0;
}

function resetSessionState() {
  sessionState.bearerToken = '';
  sessionState.expiresAtMs = 0;
  sessionState.source = ELEVENLABS_AUTH_SOURCES.NONE;
  sessionState.refreshTokenKey = '';
}

function bumpSessionGeneration() {
  sessionState.generation += 1;
}

function buildDefaultAuthState() {
  return {
    state: ELEVENLABS_AUTH_STATES.UNCONFIGURED,
    lastValidatedAt: '',
    lastErrorCode: '',
    lastErrorMessage: '',
    lastAuthSource: ELEVENLABS_AUTH_SOURCES.NONE,
  };
}

function sanitizeAuthOverride(configOverride = {}) {
  return {
    refreshToken: typeof configOverride?.refreshToken === 'string' ? configOverride.refreshToken.trim() : '',
    appCheckToken: typeof configOverride?.appCheckToken === 'string' ? configOverride.appCheckToken.trim() : '',
    deviceId: typeof configOverride?.deviceId === 'string' ? configOverride.deviceId.trim() : '',
  };
}

function getAuthContext(configOverride = {}) {
  const config = configModule.getConfig();
  const savedConfig = config?.api?.elevenlabs || {};
  const savedAuth = config?.auth?.elevenlabs || {};
  const override = sanitizeAuthOverride(configOverride);
  const hasActiveBearer = isSessionValid(sessionState.bearerToken, sessionState.expiresAtMs);
  const savedRefreshToken = typeof savedConfig.refreshToken === 'string' ? savedConfig.refreshToken.trim() : '';
  const savedAppCheckToken = typeof savedConfig.appCheckToken === 'string' ? savedConfig.appCheckToken.trim() : '';
  const savedDeviceId = typeof savedConfig.deviceId === 'string' ? savedConfig.deviceId.trim() : '';
  const mergedRefreshToken = override.refreshToken || savedRefreshToken;
  const mergedAppCheckToken = override.appCheckToken || savedAppCheckToken;
  const mergedDeviceId = override.deviceId || savedDeviceId;

  return {
    config,
    savedConfig,
    savedAuth,
    override,
    hasActiveBearer,
    savedRefreshToken,
    savedAppCheckToken,
    savedDeviceId,
    mergedRefreshToken,
    mergedAppCheckToken,
    mergedDeviceId,
  };
}

function clearRefreshBackedSession() {
  const hasRefreshBackedSession = Boolean(sessionState.refreshTokenKey);
  const hasRefreshInFlight = Boolean(sessionState.refreshInFlight);

  if (!hasRefreshBackedSession && !hasRefreshInFlight) {
    return;
  }

  bumpSessionGeneration();
  abortRefreshInFlight('refresh_cancelled');

  if (hasRefreshBackedSession) {
    resetSessionState();
  }

  sessionState.refreshInFlight = null;
}

function clearSession() {
  bumpSessionGeneration();
  abortRefreshInFlight('refresh_cancelled');
  resetSessionState();
  sessionState.refreshInFlight = null;
}

function setSession({ bearerToken = '', expiresAt = 0, source = ELEVENLABS_AUTH_SOURCES.NONE, refreshTokenKey = '' } = {}) {
  sessionState.bearerToken = (bearerToken || '').trim();
  sessionState.expiresAtMs = parseExpiry(expiresAt, sessionState.bearerToken);
  sessionState.source = source;
  sessionState.refreshTokenKey = (refreshTokenKey || '').trim();
}

function hydrateSession(seed = {}) {
  const bearerToken = (seed?.bearerToken || '').trim();
  if (!bearerToken) {
    return false;
  }

  setSession({
    bearerToken,
    expiresAt: seed?.expiresAt || seed?.expiresAtMs,
    source: seed?.source || ELEVENLABS_AUTH_SOURCES.LEGACY_BEARER_MIGRATION,
    refreshTokenKey: '',
  });

  return true;
}

function isSessionValid(bearerToken = '', expiresAtMs = 0) {
  if (!bearerToken) {
    return false;
  }

  if (!expiresAtMs) {
    return true;
  }

  return Date.now() < expiresAtMs;
}

function getRefreshBackedSession(refreshToken = '', options = {}) {
  const { allowRefreshWindowFallback = false } = options;
  const trimmedRefreshToken = (refreshToken || '').trim();

  if (!trimmedRefreshToken || sessionState.refreshTokenKey !== trimmedRefreshToken) {
    return null;
  }

  if (!isSessionValid(sessionState.bearerToken, sessionState.expiresAtMs)) {
    clearRefreshBackedSession();
    return null;
  }

  if (!allowRefreshWindowFallback && shouldRefreshToken(sessionState.bearerToken, sessionState.expiresAtMs)) {
    return null;
  }

  return {
    bearerToken: sessionState.bearerToken,
    expiresAt: sessionState.expiresAtMs,
  };
}

function getLegacySession() {
  if (sessionState.source !== ELEVENLABS_AUTH_SOURCES.LEGACY_BEARER_MIGRATION || sessionState.refreshTokenKey) {
    return null;
  }

  if (!isSessionValid(sessionState.bearerToken, sessionState.expiresAtMs)) {
    clearSession();
    return null;
  }

  return {
    bearerToken: sessionState.bearerToken,
    expiresAt: sessionState.expiresAtMs,
  };
}

function persistAuthState(patch = {}, enabled = true) {
  if (!enabled) {
    return;
  }

  try {
    configModule.updateElevenLabsAuthState(patch);
  } catch (error) {
    Logger.warn('elevenlabs-auth', 'Failed to persist auth state', error.message);
  }
}

async function refreshBearerToken(refreshToken = '', options = {}) {
  const trimmedRefreshToken = (refreshToken || '').trim();
  const { signal } = options;
  if (!trimmedRefreshToken) {
    throw buildAuthError('缺少 ElevenLabs Refresh Token', new Error('Missing refresh token'), {
      authCode: 'missing_refresh_token',
      retryable: false,
      suggestion: '请填写 ElevenLabs Refresh Token 后重试',
    });
  }

  const payload = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: trimmedRefreshToken,
  }).toString();

  try {
    const response = await retryWithBackoff(
      () => axios.post(
        SECURE_TOKEN_URL,
        payload,
        requestModule.buildAxiosConfig({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'FirebaseAuth.iOS/11.14.0 io.elevenlabs.readerapp/1.4.45 iPhone/26.0 hw/iPhone16_2',
            'X-Client-Version': 'iOS/FirebaseSDK/11.14.0/FirebaseCore-iOS',
            'X-iOS-Bundle-Identifier': 'io.elevenlabs.readerapp',
            Accept: '*/*',
          },
          timeoutMs: 20000,
          signal,
        })
      ),
      {
        maxRetries: 2,
        isRetryable: isTransientError,
        onRetry: ({ attempt, delayMs, error }) => {
          Logger.warn('elevenlabs-auth', 'Retrying bearer token refresh', {
            attempt,
            delayMs,
            statusCode: error?.response?.status || null,
          });
        },
      }
    );

    const accessToken = response.data?.access_token;
    if (!accessToken) {
      throw buildAuthError('刷新响应缺少 access_token', new Error('Missing access_token'), {
        authCode: 'refresh_request_failed',
        retryable: false,
        suggestion: '请重新获取 ElevenLabs Refresh Token',
      });
    }

    const expiresIn = Number(response.data?.expires_in) || 3600;
    return {
      bearerToken: accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
  } catch (error) {
    if (error?.provider === 'ElevenLabs') {
      throw error;
    }

    const statusCode = error?.response?.status;
    const firebaseMessage = error?.response?.data?.error?.message || error?.message || 'Unknown error';
    let message = `刷新 ElevenLabs Bearer Token 失败：${firebaseMessage}`;
    let suggestion = '请检查 Refresh Token 是否仍然有效';
    let retryable = isTransientError(error || {});

    if (error?.code === 'ERR_CANCELED' || signal?.aborted) {
      message = '刷新 ElevenLabs Bearer Token 已取消';
      suggestion = '请求已被新的认证状态替代，请重试当前操作';
      retryable = false;
      error.authCode = 'refresh_cancelled';
    } else if (statusCode === 400 || statusCode === 401 || /invalid_grant/i.test(firebaseMessage)) {
      message = 'ElevenLabs Refresh Token 无效或已过期';
      suggestion = '请重新登录 ElevenLabs Reader 并更新 Refresh Token';
      retryable = false;
      error.authCode = 'invalid_refresh_token';
    } else if (error?.code === 'ECONNABORTED') {
      message = '刷新 ElevenLabs Bearer Token 超时';
      suggestion = '请检查网络或代理设置后重试';
      error.authCode = 'refresh_timeout';
    } else {
      error.authCode = 'refresh_request_failed';
    }

    Logger.error('elevenlabs-auth', 'Failed to refresh bearer token', firebaseMessage);
    throw buildAuthError(message, error, {
      authCode: error.authCode,
      statusCode,
      retryable,
      suggestion,
    });
  }
}

function persistDeviceId(deviceId) {
  try {
    configModule.updateElevenLabsConfig({ deviceId });
  } catch (error) {
    Logger.warn('elevenlabs-auth', 'Failed to persist device id', error.message);
  }
}

function resolveDeviceId(existingId = '', persist = false) {
  const id = (existingId || '').trim();
  if (id) {
    return { deviceId: id, didGenerateDeviceId: false };
  }

  const deviceId = crypto.randomUUID().toUpperCase();
  if (persist) {
    persistDeviceId(deviceId);
  }

  return { deviceId, didGenerateDeviceId: true };
}

function getMergedConfig(configOverride = {}) {
  const config = configModule.getConfig();
  return {
    ...config.api.elevenlabs,
    ...configOverride,
  };
}

async function refreshBearerTokenWithDedup(refreshToken = '') {
  const trimmedRefreshToken = (refreshToken || '').trim();

  if (sessionState.refreshInFlight && sessionState.refreshInFlight.refreshTokenKey === trimmedRefreshToken) {
    return sessionState.refreshInFlight.promise;
  }

  const abortController = new AbortController();
  const promise = refreshBearerToken(trimmedRefreshToken, { signal: abortController.signal });
  sessionState.refreshInFlight = {
    refreshTokenKey: trimmedRefreshToken,
    abortController,
    promise,
  };

  try {
    return await promise;
  } finally {
    if (sessionState.refreshInFlight?.promise === promise) {
      sessionState.refreshInFlight = null;
    }
  }
}

function buildResolvedConfig(mergedConfig = {}, {
  bearerToken = '',
  refreshToken = '',
  deviceId = '',
  didGenerateDeviceId = false,
  didRefreshBearer = false,
  authSource = ELEVENLABS_AUTH_SOURCES.NONE,
  appCheckToken = '',
  expiresAt = 0,
} = {}) {
  return {
    ...mergedConfig,
    bearerToken: (bearerToken || '').trim(),
    refreshToken: (refreshToken || '').trim(),
    deviceId: (deviceId || '').trim(),
    didRefreshBearer: Boolean(didRefreshBearer),
    didGenerateDeviceId: Boolean(didGenerateDeviceId),
    authSource,
    bearerTokenExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : '',
    appCheckToken: (appCheckToken || '').trim(),
  };
}

function buildMissingCredentialsError() {
  return buildAuthError('缺少 ElevenLabs 凭证，请填写 Refresh Token，或仅在测试时粘贴 Bearer Token', new Error('Missing credentials'), {
    authCode: 'missing_bearer_token',
    retryable: false,
    suggestion: '请保存 Refresh Token；Bearer Token 仅用于临时测试或调试',
  });
}

function persistReadyState(authSource, enabled) {
  persistAuthState({
    state: ELEVENLABS_AUTH_STATES.READY,
    lastValidatedAt: new Date().toISOString(),
    lastErrorCode: '',
    lastErrorMessage: '',
    lastAuthSource: authSource,
  }, enabled);
}

function persistLegacySessionState(enabled) {
  const currentState = configModule.getConfig()?.auth?.elevenlabs || {};
  if (
    currentState.state === ELEVENLABS_AUTH_STATES.SESSION_ONLY &&
    currentState.lastAuthSource === ELEVENLABS_AUTH_SOURCES.LEGACY_BEARER_MIGRATION &&
    !currentState.lastErrorCode &&
    !currentState.lastErrorMessage
  ) {
    return;
  }

  persistAuthState({
    state: ELEVENLABS_AUTH_STATES.SESSION_ONLY,
    lastValidatedAt: new Date().toISOString(),
    lastErrorCode: '',
    lastErrorMessage: '',
    lastAuthSource: ELEVENLABS_AUTH_SOURCES.LEGACY_BEARER_MIGRATION,
  }, enabled);
}

function getAuthStatus(configOverride = {}) {
  const context = getAuthContext(configOverride);
  const auth = {
    ...buildDefaultAuthState(),
    ...context.savedAuth,
  };

  if (!context.mergedRefreshToken && !context.hasActiveBearer) {
    Object.assign(auth, buildDefaultAuthState());
  } else if (!context.mergedRefreshToken && context.hasActiveBearer && sessionState.source === ELEVENLABS_AUTH_SOURCES.LEGACY_BEARER_MIGRATION) {
    auth.state = ELEVENLABS_AUTH_STATES.SESSION_ONLY;
    auth.lastAuthSource = ELEVENLABS_AUTH_SOURCES.LEGACY_BEARER_MIGRATION;
  }

  return {
    auth,
    session: {
      hasActiveBearer: context.hasActiveBearer,
      source: context.hasActiveBearer ? sessionState.source : ELEVENLABS_AUTH_SOURCES.NONE,
      expiresAt: context.hasActiveBearer && sessionState.expiresAtMs ? new Date(sessionState.expiresAtMs).toISOString() : '',
      expiresSoon: context.hasActiveBearer ? shouldRefreshToken(sessionState.bearerToken, sessionState.expiresAtMs) : false,
      refreshInFlight: Boolean(sessionState.refreshInFlight),
    },
    credentials: {
      hasRefreshToken: Boolean(context.mergedRefreshToken),
      hasSavedRefreshToken: Boolean(context.savedRefreshToken),
      hasAppCheckToken: Boolean(context.mergedAppCheckToken),
      hasSavedAppCheckToken: Boolean(context.savedAppCheckToken),
      hasDeviceId: Boolean(context.mergedDeviceId),
      hasSavedDeviceId: Boolean(context.savedDeviceId),
    },
  };
}

async function validateRefreshToken(configOverride = {}, options = {}) {
  const {
    persistAuthState: shouldPersistAuthState = true,
    cacheResolvedSession = true,
  } = options;
  const context = getAuthContext(configOverride);
  const refreshToken = context.mergedRefreshToken;

  if (!refreshToken) {
    const error = buildAuthError('缺少 ElevenLabs Refresh Token', new Error('Missing refresh token'), {
      authCode: 'missing_refresh_token',
      retryable: false,
      suggestion: '请先填写或保存 Refresh Token',
    });

    persistAuthState({
      state: ELEVENLABS_AUTH_STATES.ERROR,
      lastValidatedAt: '',
      lastErrorCode: error.authCode,
      lastErrorMessage: error.message,
      lastAuthSource: ELEVENLABS_AUTH_SOURCES.NONE,
    }, shouldPersistAuthState);

    throw error;
  }

  const generationAtStart = sessionState.generation;

  try {
    const refreshed = await refreshBearerTokenWithDedup(refreshToken);
    const generationMatches = generationAtStart === sessionState.generation;

    if (generationMatches && cacheResolvedSession) {
      setSession({
        bearerToken: refreshed.bearerToken,
        expiresAt: refreshed.expiresAt,
        source: ELEVENLABS_AUTH_SOURCES.REFRESH_TOKEN,
        refreshTokenKey: refreshToken,
      });
    }

    if (generationMatches) {
      persistReadyState(ELEVENLABS_AUTH_SOURCES.REFRESH_TOKEN, shouldPersistAuthState);
    }

    return {
      authSource: ELEVENLABS_AUTH_SOURCES.REFRESH_TOKEN,
      didRefreshBearer: true,
      bearerTokenExpiresAt: refreshed.expiresAt ? new Date(refreshed.expiresAt).toISOString() : '',
      status: getAuthStatus(configOverride),
    };
  } catch (error) {
    if (generationAtStart === sessionState.generation) {
      persistAuthState({
        state: ELEVENLABS_AUTH_STATES.ERROR,
        lastValidatedAt: '',
        lastErrorCode: error.authCode || '',
        lastErrorMessage: error.message || '',
        lastAuthSource: ELEVENLABS_AUTH_SOURCES.NONE,
      }, shouldPersistAuthState);
    }

    throw error;
  }
}

function clearAuthSession(configOverride = {}, options = {}) {
  const { persistAuthState: shouldPersistAuthState = true } = options;

  clearSession();
  persistAuthState(buildDefaultAuthState(), shouldPersistAuthState);

  return getAuthStatus(configOverride);
}

async function resolveAuthConfig(configOverride = {}, options = {}) {
  const {
    allowRefresh = true,
    cacheResolvedSession = true,
    persistAuthState: shouldPersistAuthState = true,
    persistGeneratedDeviceId = true,
  } = options;
  const mergedConfig = getMergedConfig(configOverride);
  const manualBearerToken = (configOverride?.bearerToken || '').trim();
  const refreshToken = (mergedConfig.refreshToken || '').trim();
  const appCheckToken = (mergedConfig.appCheckToken || '').trim();
  const { deviceId, didGenerateDeviceId } = resolveDeviceId(mergedConfig.deviceId, persistGeneratedDeviceId);

  if (manualBearerToken) {
    return buildResolvedConfig(mergedConfig, {
      bearerToken: manualBearerToken,
      refreshToken,
      deviceId,
      didGenerateDeviceId,
      didRefreshBearer: false,
      authSource: ELEVENLABS_AUTH_SOURCES.MANUAL_BEARER,
      appCheckToken,
      expiresAt: decodeTokenExpiry(manualBearerToken),
    });
  }

  const cachedRefreshSession = getRefreshBackedSession(refreshToken);
  if (cachedRefreshSession) {
    return buildResolvedConfig(mergedConfig, {
      bearerToken: cachedRefreshSession.bearerToken,
      refreshToken,
      deviceId,
      didGenerateDeviceId,
      didRefreshBearer: false,
      authSource: ELEVENLABS_AUTH_SOURCES.SESSION_CACHE,
      appCheckToken,
      expiresAt: cachedRefreshSession.expiresAt,
    });
  }

  if (allowRefresh && refreshToken) {
    const generationAtStart = sessionState.generation;

    try {
      const refreshed = await refreshBearerTokenWithDedup(refreshToken);
      const generationMatches = generationAtStart === sessionState.generation;

      if (generationMatches && cacheResolvedSession) {
        setSession({
          bearerToken: refreshed.bearerToken,
          expiresAt: refreshed.expiresAt,
          source: ELEVENLABS_AUTH_SOURCES.REFRESH_TOKEN,
          refreshTokenKey: refreshToken,
        });
      }

      if (generationMatches) {
        persistReadyState(ELEVENLABS_AUTH_SOURCES.REFRESH_TOKEN, shouldPersistAuthState);
      }

      return buildResolvedConfig(mergedConfig, {
        bearerToken: refreshed.bearerToken,
        refreshToken,
        deviceId,
        didGenerateDeviceId,
        didRefreshBearer: true,
        authSource: ELEVENLABS_AUTH_SOURCES.REFRESH_TOKEN,
        appCheckToken,
        expiresAt: refreshed.expiresAt,
      });
    } catch (error) {
      const fallbackSession = getRefreshBackedSession(refreshToken, { allowRefreshWindowFallback: true });
      if (fallbackSession) {
        Logger.warn('elevenlabs-auth', 'Bearer token refresh failed but existing token is still valid', {
          expiresAt: fallbackSession.expiresAt,
          message: error.message,
        });

        return buildResolvedConfig(mergedConfig, {
          bearerToken: fallbackSession.bearerToken,
          refreshToken,
          deviceId,
          didGenerateDeviceId,
          didRefreshBearer: false,
          authSource: ELEVENLABS_AUTH_SOURCES.SESSION_CACHE,
          appCheckToken,
          expiresAt: fallbackSession.expiresAt,
        });
      }

      const generationMatches = generationAtStart === sessionState.generation;
      if (generationMatches && error.authCode !== 'refresh_cancelled') {
        persistAuthState({
          state: ELEVENLABS_AUTH_STATES.ERROR,
          lastValidatedAt: '',
          lastErrorCode: error.authCode || '',
          lastErrorMessage: error.message || '',
          lastAuthSource: ELEVENLABS_AUTH_SOURCES.NONE,
        }, shouldPersistAuthState);
      }
      throw error;
    }
  }

  const legacySession = getLegacySession();
  if (legacySession) {
    persistLegacySessionState(shouldPersistAuthState);
    return buildResolvedConfig(mergedConfig, {
      bearerToken: legacySession.bearerToken,
      refreshToken,
      deviceId,
      didGenerateDeviceId,
      didRefreshBearer: false,
      authSource: ELEVENLABS_AUTH_SOURCES.LEGACY_BEARER_MIGRATION,
      appCheckToken,
      expiresAt: legacySession.expiresAt,
    });
  }

  const authError = buildMissingCredentialsError();
  persistAuthState({
    state: ELEVENLABS_AUTH_STATES.UNCONFIGURED,
    lastValidatedAt: '',
    lastErrorCode: authError.authCode,
    lastErrorMessage: authError.message,
    lastAuthSource: ELEVENLABS_AUTH_SOURCES.NONE,
  }, shouldPersistAuthState);
  throw authError;
}

function handlePersistedConfigChange(previousConfig = {}, nextConfig = {}) {
  const previousRefreshToken = (previousConfig?.api?.elevenlabs?.refreshToken || '').trim();
  const nextRefreshToken = (nextConfig?.api?.elevenlabs?.refreshToken || '').trim();

  if (previousRefreshToken !== nextRefreshToken) {
    clearRefreshBackedSession();

    if (!nextRefreshToken) {
      persistAuthState(buildDefaultAuthState(), true);
    }
  }
}

module.exports = {
  resolveAuthConfig,
  refreshBearerToken,
  decodeTokenExpiry,
  hydrateSession,
  clearSession,
  handlePersistedConfigChange,
  getAuthStatus,
  validateRefreshToken,
  clearAuthSession,
};
