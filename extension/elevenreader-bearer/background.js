'use strict';

const BRIDGE_PORT = 39393;
const BRIDGE_WS_URL = `ws://127.0.0.1:${BRIDGE_PORT}/ext`;
const RECONNECT_BASE_DELAY = 2000;
const RECONNECT_MAX_DELAY = 60000;
const PING_INTERVAL_MS = 30000;
const ALLOWED_ORIGINS = ['elevenreader.io', 'elevenlabs.io'];

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let pingTimer = null;
let lastFingerprint = '';
let lastForwardedAt = 0;
let pendingBearer = null;
let lastTokenStatus = '';
let lastTokenStatusAt = 0;
let lastBearerSentAt = 0;

// --- WebSocket connection (opencli pattern) ---

function connect() {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  try {
    ws = new WebSocket(BRIDGE_WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  let authenticated = false;

  ws.onopen = () => {
    console.log('[fftrans-bridge] Connected, waiting for challenge...');
    reconnectAttempts = 0;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);

      if (!authenticated && message.type === 'challenge') {
        ws.send(JSON.stringify({
          type: 'hello',
          nonce: message.nonce,
          extensionVersion: chrome.runtime.getManifest().version,
          extensionId: chrome.runtime.id,
        }));
        return;
      }

      if (!authenticated && message.type === 'welcome') {
        authenticated = true;
        console.log(`[fftrans-bridge] Authenticated (server ${message.serverVersion || '?'})`);
        chrome.action.setBadgeText({ text: 'ON' });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
        startPing();
        flushPendingBearer();
        return;
      }

      if (message.type === 'status') {
        console.log(`[fftrans-bridge] Token status: ${message.state}`);
        lastTokenStatus = message.state || '';
        lastTokenStatusAt = Date.now();
        return;
      }

      if (message.type === 'request-refresh') {
        handleRefreshRequest();
        return;
      }

      if (message.type === 'command') {
        handleCommand(message);
        return;
      }
    } catch {
      // ignore parse errors
    }
  };

  ws.onclose = () => {
    console.log('[fftrans-bridge] Disconnected from FFTrans');
    ws = null;
    stopPing();
    chrome.action.setBadgeText({ text: '' });
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.warn('[fftrans-bridge] WebSocket error:', err?.message || 'unknown');
  };
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(
    RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts - 1),
    RECONNECT_MAX_DELAY,
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function startPing() {
  stopPing();
  pingTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // ignore send failures
      }
    }
  }, PING_INTERVAL_MS);
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

// --- Bearer buffering & sending ---

function flushPendingBearer() {
  if (!pendingBearer || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const payload = pendingBearer;
  pendingBearer = null;
  lastFingerprint = '';
  lastForwardedAt = 0;
  sendBearer(payload);
}

function sendBearer(payload) {
  const fingerprint = [
    payload.bearerToken || '',
    payload.appCheckToken || '',
    payload.deviceId || '',
  ].join('|');

  const now = Date.now();
  if (fingerprint && fingerprint === lastFingerprint && now - lastForwardedAt < 15000) {
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingBearer = payload;
    console.log('[fftrans-bridge] WS not connected, bearer buffered for reconnect');
    connect();
    return;
  }

  ws.send(JSON.stringify({
    type: 'bearer',
    bearerToken: payload.bearerToken || '',
    appCheckToken: payload.appCheckToken || '',
    deviceId: payload.deviceId || '',
    requestUrl: payload.requestUrl || '',
    tabUrl: payload.tabUrl || '',
    extensionVersion: chrome.runtime.getManifest().version,
    extensionId: chrome.runtime.id,
  }));

  lastFingerprint = fingerprint;
  lastForwardedAt = now;
  lastBearerSentAt = now;
  pendingBearer = null;
  console.log('[fftrans-bridge] Bearer sent to FFTrans');
}

// --- Bearer interception ---

function normalizeHeaderValue(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

function getHeaderValue(headers = [], headerName = '') {
  const loweredName = headerName.toLowerCase();
  const match = headers.find((h) => (h?.name || '').toLowerCase() === loweredName);
  return normalizeHeaderValue(match?.value || '');
}

function normalizeBearerToken(value = '') {
  const trimmed = normalizeHeaderValue(value);
  return /^Bearer\s+/i.test(trimmed) ? trimmed : '';
}

function isAllowedOrigin(url = '') {
  try {
    const parsed = new URL(url);
    return ALLOWED_ORIGINS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  initialize();

  const requestHeaders = details.requestHeaders || [];
  const tabUrl = details.initiator || details.documentUrl || '';

  if (!isAllowedOrigin(tabUrl) && !isAllowedOrigin(details.url || '')) {
    return;
  }

  const bearerToken = normalizeBearerToken(getHeaderValue(requestHeaders, 'authorization'));
  if (!bearerToken) {
    return;
  }

  sendBearer({
    bearerToken,
    appCheckToken: getHeaderValue(requestHeaders, 'xi-app-check-token'),
    deviceId: getHeaderValue(requestHeaders, 'device-id'),
    requestUrl: details.url || '',
    tabUrl,
  });
}, {
  urls: [
    'https://api.elevenlabs.io/*',
  ],
}, ['requestHeaders', 'extraHeaders']);

// --- Bidirectional commands & refresh ---

const FIREBASE_REFRESH_SCRIPT = `
(async () => {
  try {
    const app = globalThis._firebase_app || (await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js')).getApps?.()[0];
    if (!app) {
      const openReq = indexedDB.open('firebaseLocalStorageDb');
      openReq.onsuccess = () => {
        const db = openReq.result;
        const tx = db.transaction('firebaseLocalStorage', 'readonly');
        const store = tx.objectStore('firebaseLocalStorage');
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          const entries = getAll.result || [];
          for (const entry of entries) {
            if (entry?.value?.stsTokenManager?.accessToken) {
              fetch('https://api.elevenlabs.io/v1/user', {
                headers: { Authorization: 'Bearer ' + entry.value.stsTokenManager.accessToken }
              }).catch(() => {});
              break;
            }
          }
          db.close();
        };
      };
      return 'fallback-idb';
    }
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const auth = getAuth(app);
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken(true);
      await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { Authorization: 'Bearer ' + token }
      });
      return 'refreshed';
    }
    return 'no-user';
  } catch (e) {
    return 'error: ' + e.message;
  }
})();
`;

function handleRefreshRequest() {
  console.log('[fftrans-bridge] FFTrans requested token refresh');
  lastFingerprint = '';
  lastForwardedAt = 0;

  chrome.tabs.query({ url: ['*://elevenreader.io/*', '*://*.elevenreader.io/*'] }, (tabs) => {
    if (tabs && tabs.length > 0) {
      const tabId = tabs[0].id;
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [FIREBASE_REFRESH_SCRIPT],
        func: (script) => {
          return new Function('return ' + script)();
        },
      }).then((results) => {
        console.log('[fftrans-bridge] Firebase refresh result:', results?.[0]?.result);
      }).catch(() => {
        chrome.tabs.reload(tabId);
        console.log('[fftrans-bridge] Script injection failed, fell back to tab reload');
      });
    } else {
      chrome.tabs.create({ url: 'https://elevenreader.io/', active: false }, () => {
        console.log('[fftrans-bridge] Opened ElevenReader tab to trigger token refresh');
      });
    }
  });
}

function handleCommand(message) {
  const { id, action } = message;
  const respond = (ok, data, error) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'command-response', id, ok, data, error }));
    }
  };

  switch (action) {
    case 'get-extension-status':
      respond(true, {
        connected: ws?.readyState === WebSocket.OPEN,
        lastBearerSentAt,
        lastTokenStatus,
        lastTokenStatusAt,
        extensionVersion: chrome.runtime.getManifest().version,
        extensionId: chrome.runtime.id,
      });
      break;

    case 'navigate': {
      const url = message.url;
      if (!url || !isAllowedOrigin(url)) {
        respond(false, null, 'URL not allowed');
        return;
      }
      chrome.tabs.create({ url, active: false }, (tab) => {
        respond(true, { tabId: tab?.id, url });
      });
      break;
    }

    case 'refresh-token':
      handleRefreshRequest();
      respond(true, { triggered: true });
      break;

    default:
      respond(false, null, `Unknown command: ${action}`);
  }
}

function getExtensionState() {
  return {
    connected: ws?.readyState === WebSocket.OPEN,
    lastBearerSentAt,
    lastTokenStatus,
    lastTokenStatusAt,
    hasPendingBearer: Boolean(pendingBearer),
  };
}

// --- Lifecycle (opencli pattern) ---

let initialized = false;

function initialize() {
  if (initialized) {
    return;
  }

  initialized = true;
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  connect();
  console.log('[fftrans-bridge] Extension initialized');
}

chrome.runtime.onInstalled.addListener(() => initialize());
chrome.runtime.onStartup.addListener(() => initialize());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    connect();
  }
});

// --- Popup communication ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get-state') {
    sendResponse(getExtensionState());
    return true;
  }

  if (message.type === 'trigger-refresh') {
    handleRefreshRequest();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
