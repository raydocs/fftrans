'use strict';

const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');
const { WebSocketServer } = require('ws');
const Logger = require('../../utils/logger');
const configModule = require('./config-module');
const elevenLabsAuth = require('../translator/elevenlabs-auth');
const { ELEVENLABS_AUTH_STATES, ELEVENLABS_AUTH_SOURCES } = require('../../constants');

const DEFAULT_PORT = 39393;
const WS_PATH = '/ext';
const PAIRING_URL_BASE = 'https://elevenreader.io/#fftrans_pair=';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function createEmptyCandidate() {
  return {
    generation: 0,
    fingerprint: '',
    state: 'unavailable',
    receivedAtMs: 0,
    validatedAtMs: 0,
    importedAtMs: 0,
    persistedAtMs: 0,
    expiresAtMs: 0,
    source: '',
    requestUrl: '',
    tabUrl: '',
    extensionVersion: '',
    extensionId: '',
    validationMode: 'none',
    importedAuthSource: '',
    sources: {
      refreshToken: '',
      bearerToken: '',
      appCheckToken: '',
      deviceId: '',
    },
    values: {
      refreshToken: '',
      bearerToken: '',
      appCheckToken: '',
      deviceId: '',
    },
    validationCode: '',
    validationMessage: '',
  };
}

const bridgeState = {
  server: {
    httpServer: null,
    wss: null,
    listenPromise: null,
    state: 'stopped',
    port: null,
    lastErrorCode: '',
    lastErrorMessage: '',
  },
  extension: {
    connected: false,
    connectedAtMs: 0,
    extensionVersion: '',
    extensionId: '',
    ws: null,
  },
  pairing: {
    loginOpenedAtMs: 0,
  },
  candidate: createEmptyCandidate(),
};

let autoValidateInFlight = false;
let autoValidatePromise = null;
let queuedValidationGeneration = 0;
let refreshTimer = null;
let commandIdCounter = 0;
const pendingCommands = new Map();

function normalizeString(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSourceLabel(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

function cloneCandidate(candidate = createEmptyCandidate()) {
  return {
    ...candidate,
    sources: {
      ...(candidate.sources || {}),
    },
    values: {
      ...(candidate.values || {}),
    },
  };
}

function isJwtLikeToken(token = '') {
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

function secureTokenEquals(left = '', right = '') {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');

  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function setServerError(code = 'bridge_error', message = '') {
  bridgeState.server.state = 'error';
  bridgeState.server.lastErrorCode = code;
  bridgeState.server.lastErrorMessage = message;
}

function clearServerError() {
  bridgeState.server.lastErrorCode = '';
  bridgeState.server.lastErrorMessage = '';
  if (bridgeState.server.httpServer) {
    bridgeState.server.state = 'listening';
  }
}

function buildCandidateFingerprint(candidate = {}) {
  return crypto
    .createHash('sha256')
    .update([
      candidate.values?.refreshToken || '',
      candidate.values?.bearerToken || '',
      candidate.values?.appCheckToken || '',
      candidate.values?.deviceId || '',
      candidate.tabUrl || '',
      candidate.requestUrl || '',
      candidate.extensionId || '',
    ].join('|'))
    .digest('hex');
}

function normalizeCandidatePayload(payload = {}) {
  const refreshToken = normalizeString(payload?.refreshToken || '');
  const bearerToken = elevenLabsAuth.normalizeBearerToken(payload?.bearerToken || '');
  const rawBearerToken = bearerToken.replace(/^Bearer\s+/i, '').trim();
  const normalizedBearerToken = rawBearerToken && isJwtLikeToken(rawBearerToken) ? bearerToken : '';

  if (!refreshToken && !normalizedBearerToken) {
    return null;
  }

  const incomingSources = payload?.sources && typeof payload.sources === 'object' ? payload.sources : {};

  return {
    source: normalizeString(payload?.source || '') || 'chrome-extension',
    requestUrl: normalizeString(payload?.requestUrl || ''),
    tabUrl: normalizeString(payload?.tabUrl || ''),
    extensionVersion: normalizeString(payload?.extensionVersion || ''),
    extensionId: normalizeString(payload?.extensionId || ''),
    sources: {
      refreshToken: refreshToken
        ? normalizeSourceLabel(incomingSources.refreshToken) || 'browser.storage'
        : '',
      bearerToken: normalizedBearerToken
        ? normalizeSourceLabel(incomingSources.bearerToken) || 'chrome.webRequest.Authorization'
        : '',
      appCheckToken: payload?.appCheckToken
        ? normalizeSourceLabel(incomingSources.appCheckToken) || 'browser.storage_or_header'
        : '',
      deviceId: payload?.deviceId
        ? normalizeSourceLabel(incomingSources.deviceId) || 'browser.storage_or_header'
        : '',
    },
    values: {
      refreshToken,
      bearerToken: normalizedBearerToken,
      appCheckToken: normalizeString(payload?.appCheckToken || ''),
      deviceId: normalizeString(payload?.deviceId || ''),
    },
    expiresAtMs: normalizedBearerToken ? elevenLabsAuth.decodeTokenExpiry(rawBearerToken) || 0 : 0,
  };
}

function getInstallToken() {
  const config = configModule.getConfig();
  return normalizeString(config?.auth?.elevenlabs?.extensionBridge?.installToken || '');
}

function ensureInstallToken({ rotate = false } = {}) {
  const currentInstallToken = getInstallToken();
  if (currentInstallToken && !rotate) {
    return currentInstallToken;
  }

  const installToken = crypto.randomBytes(24).toString('hex');
  const nowIso = new Date().toISOString();
  configModule.updateElevenLabsExtensionBridgeState({
    installToken,
    createdAt: nowIso,
    lastUsedAt: rotate ? '' : (configModule.getConfig()?.auth?.elevenlabs?.extensionBridge?.lastUsedAt || ''),
  });
  return installToken;
}

function markInstallTokenUsed() {
  configModule.updateElevenLabsExtensionBridgeState({
    lastUsedAt: new Date().toISOString(),
  });
}

function clearCandidateState() {
  setCandidateState(createEmptyCandidate());
}

function setCandidateState(nextCandidate = {}) {
  bridgeState.candidate = {
    ...createEmptyCandidate(),
    ...nextCandidate,
    sources: {
      ...createEmptyCandidate().sources,
      ...(nextCandidate.sources || {}),
    },
    values: {
      ...createEmptyCandidate().values,
      ...(nextCandidate.values || {}),
    },
  };
}

function getCandidate() {
  return cloneCandidate(bridgeState.candidate || createEmptyCandidate());
}

function buildPublicCandidate(candidate = createEmptyCandidate()) {
  return {
    state: candidate.state,
    receivedAt: candidate.receivedAtMs ? new Date(candidate.receivedAtMs).toISOString() : '',
    validatedAt: candidate.validatedAtMs ? new Date(candidate.validatedAtMs).toISOString() : '',
    importedAt: candidate.importedAtMs ? new Date(candidate.importedAtMs).toISOString() : '',
    persistedAt: candidate.persistedAtMs ? new Date(candidate.persistedAtMs).toISOString() : '',
    expiresAt: candidate.expiresAtMs ? new Date(candidate.expiresAtMs).toISOString() : '',
    source: candidate.source,
    requestUrl: candidate.requestUrl,
    tabUrl: candidate.tabUrl,
    extensionVersion: candidate.extensionVersion,
    extensionId: candidate.extensionId || '',
    validationMode: candidate.validationMode || 'none',
    importedAuthSource: candidate.importedAuthSource || '',
    hasRefreshToken: Boolean(candidate.values?.refreshToken),
    hasBearerToken: Boolean(candidate.values?.bearerToken),
    hasAppCheckToken: Boolean(candidate.values?.appCheckToken),
    hasDeviceId: Boolean(candidate.values?.deviceId),
    sources: {
      ...(candidate.sources || {}),
    },
    validationCode: candidate.validationCode || '',
    validationMessage: candidate.validationMessage || '',
  };
}

function getStatus() {
  const candidate = bridgeState.candidate || createEmptyCandidate();
  const config = configModule.getConfig();
  const extensionBridgeConfig = config?.auth?.elevenlabs?.extensionBridge || {};
  const installToken = normalizeString(extensionBridgeConfig.installToken || '');
  const hasInstallToken = Boolean(installToken);
  const pairingUrl = hasInstallToken ? `${PAIRING_URL_BASE}${encodeURIComponent(installToken)}` : '';

  return {
    server: {
      state: bridgeState.server.state,
      port: bridgeState.server.port,
      lastErrorCode: bridgeState.server.lastErrorCode,
      lastErrorMessage: bridgeState.server.lastErrorMessage,
    },
    pairing: {
      state: bridgeState.extension.connected
        ? 'paired'
        : hasInstallToken
          ? 'waiting'
          : 'unpaired',
      active: bridgeState.extension.connected,
      mode: 'install-token',
      tokenReady: hasInstallToken,
      pairingUrl,
      createdAt: normalizeString(extensionBridgeConfig.createdAt || ''),
      lastUsedAt: normalizeString(extensionBridgeConfig.lastUsedAt || ''),
      loginOpenedAt: bridgeState.pairing.loginOpenedAtMs ? new Date(bridgeState.pairing.loginOpenedAtMs).toISOString() : '',
    },
    extension: {
      connected: bridgeState.extension.connected,
      connectedAt: bridgeState.extension.connectedAtMs ? new Date(bridgeState.extension.connectedAtMs).toISOString() : '',
      extensionVersion: bridgeState.extension.extensionVersion,
      extensionId: bridgeState.extension.extensionId,
    },
    candidate: buildPublicCandidate(candidate),
    validation: {
      inFlight: autoValidateInFlight,
      queued: Boolean(queuedValidationGeneration),
    },
  };
}

function sendToExtension(message) {
  const ws = bridgeState.extension.ws;
  if (ws && ws.readyState === 1 && bridgeState.extension.connected) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      Logger.warn('elevenlabs-extension-bridge', 'Failed to send message to extension', error.message);
    }
  }
}

function queueCandidateValidation(expectedGeneration) {
  queuedValidationGeneration = Math.max(queuedValidationGeneration, Number(expectedGeneration) || 0);

  if (!autoValidatePromise) {
    autoValidatePromise = drainCandidateValidationQueue()
      .catch((error) => {
        Logger.warn('elevenlabs-extension-bridge', 'Candidate validation loop failed', error.message);
      })
      .finally(() => {
        autoValidatePromise = null;
        if (queuedValidationGeneration) {
          queueCandidateValidation(queuedValidationGeneration);
        }
      });
  }

  return autoValidatePromise;
}

async function waitForValidation(timeoutMs = 15000) {
  if (!autoValidatePromise) {
    return;
  }

  await Promise.race([
    autoValidatePromise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function buildPersistedConfigPatch(candidate = {}, validationMode = 'none') {
  const patch = {};

  if (validationMode === 'refresh' && candidate.values?.refreshToken) {
    patch.refreshToken = candidate.values.refreshToken;
  }

  if (candidate.values?.appCheckToken) {
    patch.appCheckToken = candidate.values.appCheckToken;
  }

  if (candidate.values?.deviceId) {
    patch.deviceId = candidate.values.deviceId;
  }

  return patch;
}

function persistImportedCandidate(candidate = {}, validationMode = 'none') {
  const patch = buildPersistedConfigPatch(candidate, validationMode);
  if (!Object.keys(patch).length) {
    return 0;
  }

  configModule.updateElevenLabsConfig(patch);
  return Date.now();
}

function persistImportedReadyState() {
  configModule.updateElevenLabsAuthState({
    state: ELEVENLABS_AUTH_STATES.READY,
    lastValidatedAt: new Date().toISOString(),
    lastErrorCode: '',
    lastErrorMessage: '',
    lastAuthSource: ELEVENLABS_AUTH_SOURCES.EXTENSION_BRIDGE,
  });
}

async function validateCandidateGeneration(expectedGeneration) {
  const candidate = getCandidate();
  if (candidate.generation !== expectedGeneration) {
    return;
  }

  if (!candidate.values?.refreshToken && !candidate.values?.bearerToken) {
    return;
  }

  setCandidateState({
    ...candidate,
    state: 'validating',
    validationCode: '',
    validationMessage: '',
  });

  try {
    let validationMode = 'none';

    if (candidate.values.refreshToken) {
      validationMode = 'refresh';

      await elevenLabsAuth.validateRefreshToken({
        refreshToken: candidate.values.refreshToken,
        appCheckToken: candidate.values.appCheckToken || '',
        deviceId: candidate.values.deviceId || '',
      }, {
        persistAuthState: true,
        cacheResolvedSession: true,
      });

      elevenLabsAuth.setExtensionBridgeRuntimeAuth({
        refreshToken: candidate.values.refreshToken,
        appCheckToken: candidate.values.appCheckToken || '',
        deviceId: candidate.values.deviceId || '',
      });
    } else {
      validationMode = 'bearer';

      const elevenLabsTTS = require('../translator/elevenlabs-tts');
      const ttsRequestQueue = require('./tts-request-queue');
      await ttsRequestQueue.enqueue(() => elevenLabsTTS.validateConfiguration({
        bearerToken: candidate.values.bearerToken,
        refreshToken: '',
        appCheckToken: candidate.values.appCheckToken || '',
        deviceId: candidate.values.deviceId || '',
      }));

      elevenLabsAuth.setExtensionBridgeRuntimeAuth({
        appCheckToken: candidate.values.appCheckToken || '',
        deviceId: candidate.values.deviceId || '',
      });
      elevenLabsAuth.hydrateSession({
        bearerToken: candidate.values.bearerToken,
        expiresAtMs: candidate.expiresAtMs || 0,
        source: ELEVENLABS_AUTH_SOURCES.EXTENSION_BRIDGE,
      });
    }

    if (bridgeState.candidate?.generation !== expectedGeneration) {
      return;
    }

    const persistedAtMs = persistImportedCandidate(candidate, validationMode);
    persistImportedReadyState();
    markCandidateValidated(
      validationMode === 'refresh'
        ? '扩展导入的 Refresh Token 已验证并保存。'
        : '扩展导入的 Bearer Token 已验证并注入当前会话。',
      {
        validationMode,
        importedAuthSource: ELEVENLABS_AUTH_SOURCES.EXTENSION_BRIDGE,
        persistedAtMs,
      }
    );

    Logger.info('elevenlabs-extension-bridge', `Extension auth imported via ${validationMode} flow (gen ${expectedGeneration})`);
  } catch (error) {
    if (bridgeState.candidate?.generation === expectedGeneration) {
      markCandidateRejected(
        error?.authCode || 'auto_validation_failed',
        error?.message || '自动验证失败',
        {
          validationMode: candidate.values.refreshToken ? 'refresh' : 'bearer',
        }
      );
    }
    Logger.warn('elevenlabs-extension-bridge', 'Auto-validation failed', error.message);
  }
}

async function drainCandidateValidationQueue() {
  if (autoValidateInFlight) {
    return;
  }

  autoValidateInFlight = true;

  try {
    while (queuedValidationGeneration) {
      const nextGeneration = queuedValidationGeneration;
      queuedValidationGeneration = 0;
      await validateCandidateGeneration(nextGeneration);

      if (bridgeState.candidate?.generation > nextGeneration) {
        queuedValidationGeneration = Math.max(queuedValidationGeneration, bridgeState.candidate.generation);
      }
    }
  } finally {
    autoValidateInFlight = false;
  }
}

function handleAuthImport(payload = {}) {
  const candidatePayload = normalizeCandidatePayload(payload);
  if (!candidatePayload) {
    Logger.warn('elevenlabs-extension-bridge', 'Received invalid auth candidate from extension');
    return { ok: false, error: 'auth_candidate_missing_or_invalid' };
  }

  const nextGeneration = (bridgeState.candidate?.generation || 0) + 1;
  const nextCandidate = {
    generation: nextGeneration,
    state: 'pending',
    receivedAtMs: Date.now(),
    validatedAtMs: 0,
    importedAtMs: 0,
    persistedAtMs: 0,
    validationMode: 'none',
    importedAuthSource: '',
    validationCode: '',
    validationMessage: '',
    ...candidatePayload,
  };
  nextCandidate.fingerprint = buildCandidateFingerprint(nextCandidate);
  setCandidateState(nextCandidate);

  Logger.info('elevenlabs-extension-bridge', 'Auth candidate received via WebSocket', {
    generation: nextGeneration,
    hasRefreshToken: Boolean(nextCandidate.values.refreshToken),
    hasBearerToken: Boolean(nextCandidate.values.bearerToken),
  });

  void queueCandidateValidation(nextGeneration);

  return {
    ok: true,
    state: 'pending',
    generation: nextGeneration,
    hasRefreshToken: Boolean(nextCandidate.values.refreshToken),
    hasBearerToken: Boolean(nextCandidate.values.bearerToken),
  };
}

function handleWsMessage(data) {
  try {
    const message = JSON.parse(data);

    if (message.type === 'command-response' && message.id) {
      handleCommandResponse(message);
      return null;
    }

    switch (message.type) {
      case 'auth':
      case 'bearer':
        return handleAuthImport(message);

      case 'ping':
        return { ok: true, type: 'pong' };

      default:
        return { ok: false, error: `Unknown message type: ${message.type}` };
    }
  } catch (error) {
    Logger.error('elevenlabs-extension-bridge', 'Failed to handle WebSocket message', error);
    return { ok: false, error: error.message };
  }
}

function rejectNewConnection(ws, reason = 'Bridge already connected') {
  try {
    ws.close(4008, reason);
  } catch {
    // ignore close failures
  }
}

function handleWsConnection(ws) {
  if (bridgeState.extension.ws && bridgeState.extension.ws !== ws && bridgeState.extension.connected) {
    Logger.warn('elevenlabs-extension-bridge', 'Rejected replacement WebSocket client while a trusted extension is active');
    rejectNewConnection(ws, 'Extension already connected');
    return;
  }

  const installToken = getInstallToken();
  if (!installToken) {
    Logger.warn('elevenlabs-extension-bridge', 'Rejected extension connection before pairing completed');
    rejectNewConnection(ws, 'Pairing required');
    return;
  }

  if (bridgeState.extension.ws && bridgeState.extension.ws !== ws && !bridgeState.extension.connected) {
    try {
      bridgeState.extension.ws.close(4000, 'Superseded during pairing');
    } catch {
      // ignore close failures
    }
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  let authenticated = false;

  bridgeState.extension.ws = ws;
  bridgeState.extension.connected = false;
  bridgeState.extension.connectedAtMs = 0;
  Logger.info('elevenlabs-extension-bridge', 'New WebSocket connection, sending challenge');

  try {
    ws.send(JSON.stringify({ type: 'challenge', nonce, serverVersion: '0.4.0' }));
  } catch {
    // ignore send failures
  }

  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      Logger.warn('elevenlabs-extension-bridge', 'Client failed to authenticate in time');
      ws.close(4001, 'Authentication timeout');
    }
  }, 10000);

  ws.on('message', (data) => {
    const message = (() => {
      try {
        return JSON.parse(String(data));
      } catch {
        return null;
      }
    })();

    if (!message) {
      return;
    }

    if (!authenticated) {
      if (
        message.type === 'hello' &&
        message.nonce === nonce &&
        secureTokenEquals(normalizeString(message.installToken || ''), installToken)
      ) {
        authenticated = true;
        clearTimeout(authTimeout);
        bridgeState.extension.connected = true;
        bridgeState.extension.connectedAtMs = Date.now();
        bridgeState.extension.extensionVersion = message.extensionVersion || '';
        bridgeState.extension.extensionId = message.extensionId || '';
        markInstallTokenUsed();
        Logger.info('elevenlabs-extension-bridge', `Extension authenticated: v${message.extensionVersion || '?'} id=${message.extensionId || '?'}`);
        try {
          ws.send(JSON.stringify({ ok: true, type: 'welcome', serverVersion: '0.4.0' }));
        } catch {
          // ignore send failures
        }
        return;
      }

      Logger.warn('elevenlabs-extension-bridge', 'Unauthenticated message rejected');
      ws.close(4003, 'Authentication required');
      return;
    }

    const result = handleWsMessage(String(data));
    if (result) {
      try {
        ws.send(JSON.stringify(result));
      } catch {
        // ignore send failures
      }
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);

    if (bridgeState.extension.ws === ws) {
      bridgeState.extension.ws = null;
      bridgeState.extension.connected = false;
      bridgeState.extension.connectedAtMs = 0;
      Logger.info('elevenlabs-extension-bridge', 'Extension disconnected');
    }
  });

  ws.on('error', (error) => {
    Logger.warn('elevenlabs-extension-bridge', 'WebSocket error', error.message);
  });
}

function writeJson(response, statusCode, payload) {
  response.setHeader('Cache-Control', 'no-store');
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function ensureServer() {
  if (bridgeState.server.httpServer) {
    return;
  }

  if (bridgeState.server.listenPromise) {
    await bridgeState.server.listenPromise;
    return;
  }

  const listenPromise = new Promise((resolve, reject) => {
    const httpServer = http.createServer((request, response) => {
      if (request.method === 'GET' && request.url === '/health') {
        writeJson(response, 200, { success: true, state: getStatus() });
        return;
      }
      writeJson(response, 404, { success: false, message: 'Use WebSocket at /ext' });
    });

    const wss = new WebSocketServer({ server: httpServer, path: WS_PATH });
    wss.on('connection', handleWsConnection);

    httpServer.on('error', (error) => {
      setServerError('bridge_listen_failed', error.message || 'Failed to start extension bridge');
      bridgeState.server.httpServer = null;
      bridgeState.server.wss = null;
      bridgeState.server.listenPromise = null;
      reject(error);
    });

    httpServer.listen(DEFAULT_PORT, '127.0.0.1', () => {
      bridgeState.server.httpServer = httpServer;
      bridgeState.server.wss = wss;
      bridgeState.server.port = DEFAULT_PORT;
      bridgeState.server.state = 'listening';
      bridgeState.server.listenPromise = null;
      clearServerError();
      Logger.info('elevenlabs-extension-bridge', `WebSocket bridge listening on ws://127.0.0.1:${DEFAULT_PORT}${WS_PATH}`);
      resolve();
    });
  });

  bridgeState.server.listenPromise = listenPromise;
  await listenPromise;
}

async function initialize() {
  try {
    await ensureServer();
  } catch (error) {
    Logger.error('elevenlabs-extension-bridge', 'Failed to initialize extension bridge', error);
  }
}

async function shutdown() {
  clearCandidateState();
  clearRefreshTimer();
  queuedValidationGeneration = 0;

  for (const [id, pending] of pendingCommands) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Bridge shutting down'));
    pendingCommands.delete(id);
  }

  if (bridgeState.extension.ws) {
    try {
      bridgeState.extension.ws.close(1000, 'Server shutting down');
    } catch {
      // ignore close failures
    }
    bridgeState.extension.ws = null;
    bridgeState.extension.connected = false;
  }

  if (bridgeState.server.wss) {
    bridgeState.server.wss.close();
    bridgeState.server.wss = null;
  }

  if (!bridgeState.server.httpServer) {
    bridgeState.server.state = 'stopped';
    return;
  }

  await new Promise((resolve) => {
    bridgeState.server.httpServer.close(() => resolve());
  });

  bridgeState.server.httpServer = null;
  bridgeState.server.listenPromise = null;
  bridgeState.server.state = 'stopped';
  bridgeState.server.port = null;
}

async function beginPairingSession() {
  await ensureServer();
  clearCandidateState();

  const installToken = ensureInstallToken({ rotate: true });
  const pairingUrl = `${PAIRING_URL_BASE}${encodeURIComponent(installToken)}`;
  bridgeState.pairing.loginOpenedAtMs = Date.now();

  try {
    await shell.openExternal(pairingUrl);
  } catch (error) {
    Logger.warn('elevenlabs-extension-bridge', 'Failed to open pairing URL in default browser', error.message);
  }

  return getStatus();
}

function markCandidateValidated(validationMessage = 'Extension auth validated successfully.', options = {}) {
  if (!bridgeState.candidate?.values?.refreshToken && !bridgeState.candidate?.values?.bearerToken) {
    return getStatus();
  }

  setCandidateState({
    ...bridgeState.candidate,
    state: 'validated',
    validatedAtMs: Date.now(),
    importedAtMs: Date.now(),
    persistedAtMs: options.persistedAtMs || bridgeState.candidate.persistedAtMs || 0,
    validationMode: options.validationMode || bridgeState.candidate.validationMode || 'none',
    importedAuthSource: options.importedAuthSource || bridgeState.candidate.importedAuthSource || '',
    validationCode: '',
    validationMessage,
  });

  sendToExtension({
    type: 'status',
    state: 'validated',
    validationMode: bridgeState.candidate.validationMode,
  });
  scheduleRefreshReminder();
  return getStatus();
}

function markCandidateRejected(code = '', message = 'Extension auth validation failed.', options = {}) {
  if (!bridgeState.candidate?.values?.refreshToken && !bridgeState.candidate?.values?.bearerToken) {
    return getStatus();
  }

  setCandidateState({
    ...bridgeState.candidate,
    state: 'rejected',
    validatedAtMs: Date.now(),
    validationMode: options.validationMode || bridgeState.candidate.validationMode || 'none',
    validationCode: code,
    validationMessage: message,
  });

  sendToExtension({
    type: 'status',
    state: 'rejected',
    validationMode: bridgeState.candidate.validationMode,
    code,
    message,
  });
  return getStatus();
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleRefreshReminder() {
  clearRefreshTimer();

  const expiresAtMs = bridgeState.candidate?.expiresAtMs || 0;
  if (!expiresAtMs) {
    return;
  }

  const refreshAtMs = expiresAtMs - REFRESH_BUFFER_MS;
  const delay = refreshAtMs - Date.now();
  if (delay <= 0) {
    requestTokenRefresh();
    return;
  }

  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    requestTokenRefresh();
  }, delay);

  Logger.info('elevenlabs-extension-bridge', `Token refresh scheduled in ${Math.round(delay / 1000)}s`);
}

function requestTokenRefresh() {
  if (!bridgeState.extension.connected) {
    Logger.warn('elevenlabs-extension-bridge', 'Cannot request refresh: extension not connected');
    return;
  }

  Logger.info('elevenlabs-extension-bridge', 'Requesting token refresh from extension');
  sendToExtension({ type: 'request-refresh' });
}

function sendCommand(action, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!bridgeState.extension.ws || bridgeState.extension.ws.readyState !== 1 || !bridgeState.extension.connected) {
      reject(new Error('Extension not connected'));
      return;
    }

    const id = ++commandIdCounter;
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error(`Command ${action} timed out`));
    }, timeoutMs);

    pendingCommands.set(id, { resolve, reject, timer });
    sendToExtension({ id, type: 'command', action, ...params });
  });
}

function handleCommandResponse(message) {
  const pending = pendingCommands.get(message.id);
  if (!pending) {
    return;
  }

  pendingCommands.delete(message.id);
  clearTimeout(pending.timer);

  if (message.ok) {
    pending.resolve(message.data);
  } else {
    pending.reject(new Error(message.error || 'Command failed'));
  }
}

module.exports = {
  DEFAULT_PORT,
  initialize,
  shutdown,
  beginPairingSession,
  getStatus,
  getCandidate,
  markCandidateValidated,
  markCandidateRejected,
  sendCommand,
  requestTokenRefresh,
  waitForValidation,
};
