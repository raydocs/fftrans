'use strict';

const axios = require('axios');
const crypto = require('crypto');

const configModule = require('../system/config-module');
const requestModule = require('../system/request-module');
const Logger = require('../../utils/logger');
const { retryWithBackoff, isTransientError } = require('../../utils/retry');

const FIREBASE_API_KEY = 'AIzaSyDhSxLJa_WaR8I69a1BmlUG7ckfZHu7-ig';
const SECURE_TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

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
  authError.statusCode = statusCode;
  authError.retryable = retryable;
  authError.suggestion = overrides.suggestion || '请检查 ElevenLabs Bearer Token / Refresh Token 配置';
  authError.cause = error;
  return authError;
}

async function refreshBearerToken(refreshToken = '') {
  const trimmedRefreshToken = (refreshToken || '').trim();
  if (!trimmedRefreshToken) {
    throw buildAuthError('缺少 ElevenLabs Refresh Token', new Error('Missing refresh token'), {
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

    if (statusCode === 400 || statusCode === 401 || /invalid_grant/i.test(firebaseMessage)) {
      message = 'ElevenLabs Refresh Token 无效或已过期';
      suggestion = '请重新登录 ElevenLabs Reader 并更新 Refresh Token';
      retryable = false;
    } else if (error?.code === 'ECONNABORTED') {
      message = '刷新 ElevenLabs Bearer Token 超时';
      suggestion = '请检查网络或代理设置后重试';
    }

    Logger.error('elevenlabs-auth', 'Failed to refresh bearer token', firebaseMessage);
    throw buildAuthError(message, error, {
      statusCode,
      retryable,
      suggestion,
    });
  }
}

function persistBearerToken(bearerToken, expiresAtIso) {
  try {
    const current = configModule.getConfig();
    current.api.elevenlabs = {
      ...current.api.elevenlabs,
      bearerToken,
      bearerTokenExpiresAt: expiresAtIso,
    };
    configModule.setConfig(current);
  } catch (error) {
    Logger.warn('elevenlabs-auth', 'Failed to persist bearer token', error.message);
  }
}

function persistDeviceId(deviceId) {
  try {
    const current = configModule.getConfig();
    current.api.elevenlabs = {
      ...current.api.elevenlabs,
      deviceId,
    };
    configModule.setConfig(current);
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

async function resolveAuthConfig(configOverride = {}, options = {}) {
  const { persistTokens = false, allowRefresh = true } = options;
  const mergedConfig = getMergedConfig(configOverride);

  let bearerToken = (mergedConfig.bearerToken || '').trim();
  const refreshToken = (mergedConfig.refreshToken || '').trim();
  const storedExpiry = mergedConfig.bearerTokenExpiresAt ? Date.parse(mergedConfig.bearerTokenExpiresAt) : null;
  let expiresAt = storedExpiry || decodeTokenExpiry(bearerToken);
  let didRefreshBearer = false;

  if (allowRefresh && shouldRefreshToken(bearerToken, expiresAt) && refreshToken) {
    try {
      const refreshed = await refreshBearerToken(refreshToken);
      bearerToken = refreshed.bearerToken;
      expiresAt = refreshed.expiresAt;
      didRefreshBearer = true;

      if (persistTokens) {
        persistBearerToken(bearerToken, new Date(expiresAt).toISOString());
      }
    } catch (error) {
      const tokenStillValid = bearerToken && expiresAt && Date.now() < expiresAt;
      if (tokenStillValid) {
        Logger.warn('elevenlabs-auth', 'Bearer token refresh failed but existing token is still valid', {
          expiresAt,
          message: error.message,
        });
      } else {
        throw error;
      }
    }
  }

  if (!bearerToken) {
    throw buildAuthError('缺少 Bearer Token，请填写 Bearer Token 或 Firebase Refresh Token', new Error('Missing bearer token'), {
      retryable: false,
      suggestion: '请填写 Bearer Token，或提供 Refresh Token 以自动刷新',
    });
  }

  const { deviceId, didGenerateDeviceId } = resolveDeviceId(mergedConfig.deviceId, persistTokens);

  return {
    ...mergedConfig,
    bearerToken,
    refreshToken,
    deviceId,
    didRefreshBearer,
    didGenerateDeviceId,
    bearerTokenExpiresAt: expiresAt ? new Date(expiresAt).toISOString() : (mergedConfig.bearerTokenExpiresAt || ''),
    appCheckToken: (mergedConfig.appCheckToken || '').trim(),
  };
}

module.exports = {
  resolveAuthConfig,
  refreshBearerToken,
  decodeTokenExpiry,
};
