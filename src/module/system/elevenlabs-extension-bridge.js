'use strict';

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const Logger = require('../../utils/logger');
const elevenLabsAuth = require('../translator/elevenlabs-auth');
const { ELEVENLABS_AUTH_SOURCES } = require('../../constants');

const DEFAULT_PORT = 39393;
const WS_PATH = '/ext';

function createEmptyCandidate() {
  return {
    generation: 0,
    fingerprint: '',
    state: 'unavailable',
    receivedAtMs: 0,
    validatedAtMs: 0,
    expiresAtMs: 0,
    source: '',
    requestUrl: '',
    tabUrl: '',
    extensionVersion: '',
    extensionId: '',
    sources: {
      bearerToken: '',
      appCheckToken: '',
      deviceId: '',
    },
    values: {
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
  candidate: createEmptyCandidate(),
};

function isJwtLikeToken(token = '') {
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
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
      candidate.values?.bearerToken || '',
      candidate.values?.appCheckToken || '',
      candidate.values?.deviceId || '',
      candidate.tabUrl || '',
      candidate.requestUrl || '',
    ].join('|'))
    .digest('hex');
}

function normalizeCandidatePayload(payload = {}) {
  const bearerToken = elevenLabsAuth.normalizeBearerToken(payload?.bearerToken || '');
  const rawToken = bearerToken.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken || !isJwtLikeToken(rawToken)) {
    return null;
  }

  return {
    source: 'chrome-webrequest-ws',
    requestUrl: typeof payload?.requestUrl === 'string' ? payload.requestUrl.trim() : '',
    tabUrl: typeof payload?.tabUrl === 'string' ? payload.tabUrl.trim() : '',
    extensionVersion: typeof payload?.extensionVersion === 'string' ? payload.extensionVersion.trim() : '',
    extensionId: typeof payload?.extensionId === 'string' ? payload.extensionId.trim() : '',
    sources: {
      bearerToken: 'chrome.webRequest.Authorization',
      appCheckToken: payload?.appCheckToken ? 'chrome.webRequest.xi-app-check-token' : '',
      deviceId: payload?.deviceId ? 'chrome.webRequest.Device-ID' : '',
    },
    values: {
      bearerToken,
      appCheckToken: typeof payload?.appCheckToken === 'string' ? payload.appCheckToken.trim() : '',
      deviceId: typeof payload?.deviceId === 'string' ? payload.deviceId.trim() : '',
    },
    expiresAtMs: elevenLabsAuth.decodeTokenExpiry(rawToken) || 0,
  };
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
  const candidate = bridgeState.candidate || createEmptyCandidate();
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

function getStatus() {
  const candidate = bridgeState.candidate || createEmptyCandidate();
  return {
    server: {
      state: bridgeState.server.state,
      port: bridgeState.server.port,
      lastErrorCode: bridgeState.server.lastErrorCode,
      lastErrorMessage: bridgeState.server.lastErrorMessage,
    },
    pairing: {
      active: bridgeState.extension.connected,
      mode: 'websocket',
      token: '',
      issuedAt: '',
      expiresAt: '',
      lastUsedAt: bridgeState.extension.connectedAtMs ? new Date(bridgeState.extension.connectedAtMs).toISOString() : '',
    },
    extension: {
      connected: bridgeState.extension.connected,
      connectedAt: bridgeState.extension.connectedAtMs ? new Date(bridgeState.extension.connectedAtMs).toISOString() : '',
      extensionVersion: bridgeState.extension.extensionVersion,
      extensionId: bridgeState.extension.extensionId,
    },
    candidate: {
      state: candidate.state,
      receivedAt: candidate.receivedAtMs ? new Date(candidate.receivedAtMs).toISOString() : '',
      validatedAt: candidate.validatedAtMs ? new Date(candidate.validatedAtMs).toISOString() : '',
      expiresAt: candidate.expiresAtMs ? new Date(candidate.expiresAtMs).toISOString() : '',
      source: candidate.source,
      requestUrl: candidate.requestUrl,
      tabUrl: candidate.tabUrl,
      extensionVersion: candidate.extensionVersion,
      extensionId: candidate.extensionId || '',
      hasBearerToken: Boolean(candidate.values?.bearerToken),
      hasAppCheckToken: Boolean(candidate.values?.appCheckToken),
      hasDeviceId: Boolean(candidate.values?.deviceId),
      sources: {
        ...(candidate.sources || {}),
      },
      validationCode: candidate.validationCode || '',
      validationMessage: candidate.validationMessage || '',
    },
  };
}

function sendToExtension(message) {
  const ws = bridgeState.extension.ws;
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      Logger.warn('elevenlabs-extension-bridge', 'Failed to send message to extension', error.message);
    }
  }
}

function handleBearerImport(payload = {}) {
  const candidatePayload = normalizeCandidatePayload(payload);
  if (!candidatePayload) {
    Logger.warn('elevenlabs-extension-bridge', 'Received invalid bearer from extension');
    return { ok: false, error: 'bearer_missing_or_invalid' };
  }

  const nextGeneration = (bridgeState.candidate?.generation || 0) + 1;
  const nextCandidate = {
    generation: nextGeneration,
    state: 'pending',
    receivedAtMs: Date.now(),
    validatedAtMs: 0,
    validationCode: '',
    validationMessage: '',
    ...candidatePayload,
  };
  nextCandidate.fingerprint = buildCandidateFingerprint(nextCandidate);
  setCandidateState(nextCandidate);

  Logger.info('elevenlabs-extension-bridge', `Bearer token received via WebSocket (gen ${nextGeneration})`);

  void autoValidateAndHydrate(nextGeneration);

  return { ok: true, state: 'pending' };
}

let autoValidateInFlight = false;

async function autoValidateAndHydrate(expectedGeneration) {
  if (autoValidateInFlight) {
    return;
  }

  autoValidateInFlight = true;

  try {
    const candidate = bridgeState.candidate;
    if (!candidate?.values?.bearerToken || candidate.generation !== expectedGeneration) {
      return;
    }

    const elevenLabsTTS = require('../translator/elevenlabs-tts');
    const ttsRequestQueue = require('../system/tts-request-queue');

    const mergedConfig = {
      bearerToken: candidate.values.bearerToken,
      appCheckToken: candidate.values.appCheckToken || '',
      deviceId: candidate.values.deviceId || '',
    };

    await ttsRequestQueue.enqueue(() => elevenLabsTTS.validateConfiguration(mergedConfig));

    if (bridgeState.candidate?.generation !== expectedGeneration) {
      return;
    }

    markCandidateValidated('扩展导入的 Bearer Token 已自动验证通过。');

    const rawToken = candidate.values.bearerToken.replace(/^Bearer\s+/i, '').trim();
    elevenLabsAuth.hydrateSession({
      bearerToken: candidate.values.bearerToken,
      expiresAtMs: elevenLabsAuth.decodeTokenExpiry(rawToken) || 0,
      source: ELEVENLABS_AUTH_SOURCES.EXTENSION_BRIDGE,
    });

    Logger.info('elevenlabs-extension-bridge', 'Bearer auto-validated and injected into auth session');
  } catch (error) {
    const candidate = bridgeState.candidate;
    if (candidate?.generation === expectedGeneration) {
      markCandidateRejected(
        error?.authCode || 'auto_validation_failed',
        error?.message || '自动验证失败',
      );
    }
    Logger.warn('elevenlabs-extension-bridge', 'Auto-validation failed:', error.message);
  } finally {
    autoValidateInFlight = false;
  }
}

function handleWsMessage(data) {
  try {
    const message = JSON.parse(data);

    if (message.type === 'command-response' && message.id) {
      handleCommandResponse(message);
      return null;
    }

    switch (message.type) {
      case 'bearer':
        return handleBearerImport(message);

      case 'hello': {
        bridgeState.extension.extensionVersion = message.extensionVersion || '';
        bridgeState.extension.extensionId = message.extensionId || '';
        Logger.info('elevenlabs-extension-bridge', `Extension identified: v${message.extensionVersion || '?'} id=${message.extensionId || '?'}`);
        return { ok: true, type: 'welcome', serverVersion: '0.3.0' };
      }

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

function handleWsConnection(ws) {
  if (bridgeState.extension.ws) {
    try {
      bridgeState.extension.ws.close(1000, 'Replaced by new connection');
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
    ws.send(JSON.stringify({ type: 'challenge', nonce }));
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
      try { return JSON.parse(String(data)); } catch { return null; }
    })();

    if (!message) {
      return;
    }

    if (!authenticated) {
      if (message.type === 'hello' && message.nonce === nonce) {
        authenticated = true;
        clearTimeout(authTimeout);
        bridgeState.extension.connected = true;
        bridgeState.extension.connectedAtMs = Date.now();
        bridgeState.extension.extensionVersion = message.extensionVersion || '';
        bridgeState.extension.extensionId = message.extensionId || '';
        Logger.info('elevenlabs-extension-bridge', `Extension authenticated: v${message.extensionVersion || '?'} id=${message.extensionId || '?'}`);
        try {
          ws.send(JSON.stringify({ ok: true, type: 'welcome', serverVersion: '0.3.0' }));
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
    if (bridgeState.extension.ws === ws) {
      bridgeState.extension.ws = null;
      bridgeState.extension.connected = false;
      Logger.info('elevenlabs-extension-bridge', 'Extension disconnected');
    }
  });

  ws.on('error', (error) => {
    Logger.warn('elevenlabs-extension-bridge', 'WebSocket error', error.message);
  });
}

function writeJson(response, statusCode, payload) {
  response.setHeader('Access-Control-Allow-Origin', '*');
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
  return getStatus();
}

function markCandidateValidated(validationMessage = 'Extension bearer validated successfully.') {
  if (!bridgeState.candidate?.values?.bearerToken) {
    return getStatus();
  }

  setCandidateState({
    ...bridgeState.candidate,
    state: 'validated',
    validatedAtMs: Date.now(),
    validationCode: '',
    validationMessage,
  });

  sendToExtension({ type: 'status', state: 'validated' });
  scheduleRefreshReminder();
  return getStatus();
}

function markCandidateRejected(code = '', message = 'Extension bearer validation failed.') {
  if (!bridgeState.candidate?.values?.bearerToken) {
    return getStatus();
  }

  setCandidateState({
    ...bridgeState.candidate,
    state: 'rejected',
    validatedAtMs: Date.now(),
    validationCode: code,
    validationMessage: message,
  });

  sendToExtension({ type: 'status', state: 'rejected', code, message });
  return getStatus();
}

// --- Token expiry-aware refresh (#2) ---

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
let refreshTimer = null;

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

// --- Bidirectional command (#4) ---

let commandIdCounter = 0;
const pendingCommands = new Map();

function sendCommand(action, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!bridgeState.extension.ws || bridgeState.extension.ws.readyState !== 1) {
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
};
