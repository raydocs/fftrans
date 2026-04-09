'use strict';
/* global chrome */

const BRIDGE_PORT = 39393;
const BRIDGE_WS_URL = `ws://127.0.0.1:${BRIDGE_PORT}/ext`;
const RECONNECT_BASE_DELAY = 2000;
const RECONNECT_MAX_DELAY = 60000;
const PING_INTERVAL_MS = 30000;
const ALLOWED_ORIGINS = ['elevenreader.io', 'elevenlabs.io'];
const PAIRING_TOKEN_KEYS = ['fftrans_pair', 'fftrans_bridge_token'];
const STORAGE_KEYS = {
  installToken: 'fftrans.installToken',
};
const FALLBACK_DB_NAMES = ['firebaseLocalStorageDb'];

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let pingTimer = null;
let currentInstallToken = '';
let lastFingerprint = '';
let lastForwardedAt = 0;
let pendingAuthPayload = null;
let lastTokenStatus = '';
let lastTokenStatusAt = 0;
let lastAuthSentAt = 0;
let initialized = false;

function normalizeString(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeHeaderValue(value = '') {
  return normalizeString(value);
}

function getHeaderValue(headers = [], headerName = '') {
  const loweredName = headerName.toLowerCase();
  const match = headers.find((header) => (header?.name || '').toLowerCase() === loweredName);
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

function normalizePairingToken(value = '') {
  return /^[a-f0-9]{32,128}$/i.test(normalizeString(value)) ? normalizeString(value) : '';
}

function extractPairingToken(url = '') {
  try {
    const parsed = new URL(url);
    const candidates = [parsed.hash.replace(/^#/, ''), parsed.search.replace(/^\?/, '')]
      .filter(Boolean)
      .map((segment) => new URLSearchParams(segment));

    for (const params of candidates) {
      for (const key of PAIRING_TOKEN_KEYS) {
        const token = normalizePairingToken(params.get(key) || '');
        if (token) {
          return token;
        }
      }
    }
  } catch {
    // ignore URL parse failures
  }

  return '';
}

function loadStoredInstallToken(callback = () => {}) {
  chrome.storage.local.get([STORAGE_KEYS.installToken], (result) => {
    currentInstallToken = normalizePairingToken(result?.[STORAGE_KEYS.installToken] || '');
    callback(currentInstallToken);
  });
}

function persistInstallToken(token = '', callback = () => {}) {
  const normalizedToken = normalizePairingToken(token);
  currentInstallToken = normalizedToken;
  chrome.storage.local.set({ [STORAGE_KEYS.installToken]: normalizedToken }, () => {
    callback(normalizedToken);
  });
}

function syncPairingTokenFromUrl(url = '') {
  const token = extractPairingToken(url);
  if (!token || token === currentInstallToken) {
    return false;
  }

  persistInstallToken(token, () => {
    console.log('[fftrans-bridge] Pairing token captured from ElevenReader URL');
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.close(4000, 'Pairing token updated');
      } catch {
        // ignore close failures
      }
    }
    connect();
  });
  return true;
}

function buildPayloadFingerprint(payload = {}) {
  return [
    payload.refreshToken || '',
    payload.bearerToken || '',
    payload.appCheckToken || '',
    payload.deviceId || '',
    payload.tabUrl || '',
    payload.requestUrl || '',
  ].join('|');
}

function flushPendingAuth() {
  if (!pendingAuthPayload || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const payload = pendingAuthPayload;
  pendingAuthPayload = null;
  lastFingerprint = '';
  lastForwardedAt = 0;
  sendAuth(payload);
}

function sendAuth(payload = {}) {
  const fingerprint = buildPayloadFingerprint(payload);
  const now = Date.now();

  if (fingerprint && fingerprint === lastFingerprint && now - lastForwardedAt < 15000) {
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingAuthPayload = payload;
    console.log('[fftrans-bridge] WS not connected, auth payload buffered for reconnect');
    connect();
    return;
  }

  ws.send(JSON.stringify({
    type: 'auth',
    refreshToken: payload.refreshToken || '',
    bearerToken: payload.bearerToken || '',
    appCheckToken: payload.appCheckToken || '',
    deviceId: payload.deviceId || '',
    requestUrl: payload.requestUrl || '',
    tabUrl: payload.tabUrl || '',
    extensionVersion: chrome.runtime.getManifest().version,
    extensionId: chrome.runtime.id,
    source: 'chromium-extension',
    sources: {
      refreshToken: payload.sources?.refreshToken || '',
      bearerToken: payload.sources?.bearerToken || '',
      appCheckToken: payload.sources?.appCheckToken || '',
      deviceId: payload.sources?.deviceId || '',
    },
  }));

  lastFingerprint = fingerprint;
  lastForwardedAt = now;
  lastAuthSentAt = now;
  pendingAuthPayload = null;
  console.log('[fftrans-bridge] Auth payload sent to FFTrans');
}

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
        if (!currentInstallToken) {
          console.warn('[fftrans-bridge] Challenge received before pairing token was captured');
          return;
        }

        ws.send(JSON.stringify({
          type: 'hello',
          nonce: message.nonce,
          installToken: currentInstallToken,
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
        flushPendingAuth();
        inspectOpenElevenReaderTabs();
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

  ws.onerror = (error) => {
    console.warn('[fftrans-bridge] WebSocket error:', error?.message || 'unknown');
  };
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectAttempts += 1;
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

function inspectTabAuthScript(fallbackDbNames = []) {
  return (async () => {
    const results = {
      bearerCandidates: [],
      refreshCandidates: [],
      appCheckCandidates: [],
      deviceCandidates: [],
    };
    const seen = {
      bearer: new Set(),
      refresh: new Set(),
      appCheck: new Set(),
      device: new Set(),
    };

    function push(bucket, seenBucket, value, source, confidence = 0) {
      if (typeof value !== 'string') {
        return;
      }

      const trimmed = value.trim();
      if (!trimmed || seenBucket.has(trimmed)) {
        return;
      }

      seenBucket.add(trimmed);
      bucket.push({ value: trimmed, source, confidence });
    }

    function getJwtCandidates(value) {
      if (typeof value !== 'string') {
        return [];
      }

      return value.match(/(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
    }

    function tryParseJson(value) {
      if (typeof value !== 'string') {
        return value;
      }

      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    function recordString(value, source) {
      if (typeof value !== 'string') {
        return;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }

      const lowerSource = String(source || '').toLowerCase();
      const jwtMatches = getJwtCandidates(trimmed);

      if (/refresh[_-]?token/.test(lowerSource) && trimmed.length > 20) {
        push(results.refreshCandidates, seen.refresh, trimmed, source);
      }

      if (/app.?check/.test(lowerSource)) {
        const candidates = jwtMatches.length ? jwtMatches : [trimmed];
        candidates.forEach((candidate) => push(results.appCheckCandidates, seen.appCheck, candidate, source));
      }

      if (/device[_-]?id/.test(lowerSource) && trimmed.length >= 6) {
        push(results.deviceCandidates, seen.device, trimmed, source);
      }

      if (jwtMatches.length) {
        const confidence = /(authorization|bearer|accesstoken|idtoken|ststokenmanager\.accesstoken)/.test(lowerSource) ? 2 : 1;
        jwtMatches.forEach((candidate) => push(results.bearerCandidates, seen.bearer, candidate, source, confidence));
      }
    }

    function scanValue(value, source, depth = 0) {
      if (depth > 6 || value === null || value === undefined) {
        return;
      }

      if (typeof value === 'string') {
        recordString(value, source);
        const parsed = tryParseJson(value);
        if (parsed !== value) {
          scanValue(parsed, `${source}::json`, depth + 1);
        }
        return;
      }

      if (typeof value !== 'object') {
        return;
      }

      if (Array.isArray(value)) {
        value.slice(0, 50).forEach((entry, index) => scanValue(entry, `${source}[${index}]`, depth + 1));
        return;
      }

      Object.keys(value).slice(0, 80).forEach((key) => {
        const nextValue = value[key];
        const nextSource = source ? `${source}.${key}` : key;
        scanValue(nextValue, nextSource, depth + 1);
      });
    }

    function scanStorage(storage, storageName) {
      try {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key) {
            continue;
          }

          scanValue(storage.getItem(key), `${storageName}[${key}]`, 0);
        }
      } catch {
        // ignore storage scan failures
      }
    }

    function readDatabase(databaseName) {
      return new Promise((resolve) => {
        try {
          const openRequest = indexedDB.open(databaseName);
          openRequest.onerror = () => resolve([]);
          openRequest.onupgradeneeded = () => {
            try {
              openRequest.result.close();
            } catch {
              // ignore close failures
            }
            resolve([]);
          };
          openRequest.onsuccess = () => {
            const db = openRequest.result;
            const storeNames = Array.from(db.objectStoreNames || []);
            if (!storeNames.length) {
              db.close();
              resolve([]);
              return;
            }

            Promise.all(storeNames.map((storeName) => new Promise((storeResolve) => {
              try {
                const transaction = db.transaction(storeName, 'readonly');
                const store = transaction.objectStore(storeName);
                if (typeof store.getAll === 'function') {
                  const getAllRequest = store.getAll();
                  getAllRequest.onsuccess = () => storeResolve([{ storeName, values: getAllRequest.result || [] }]);
                  getAllRequest.onerror = () => storeResolve([]);
                  return;
                }

                const values = [];
                const cursorRequest = store.openCursor();
                cursorRequest.onsuccess = (cursorEvent) => {
                  const cursor = cursorEvent.target.result;
                  if (cursor) {
                    values.push(cursor.value);
                    cursor.continue();
                  } else {
                    storeResolve([{ storeName, values }]);
                  }
                };
                cursorRequest.onerror = () => storeResolve([]);
              } catch {
                storeResolve([]);
              }
            }))).then((chunks) => {
              try {
                db.close();
              } catch {
                // ignore close failures
              }
              resolve(chunks.flat());
            }).catch(() => {
              try {
                db.close();
              } catch {
                // ignore close failures
              }
              resolve([]);
            });
          };
        } catch {
          resolve([]);
        }
      });
    }

    scanStorage(localStorage, 'localStorage');
    scanStorage(sessionStorage, 'sessionStorage');

    let databaseNames = [];
    if (indexedDB && typeof indexedDB.databases === 'function') {
      try {
        const databaseInfo = await indexedDB.databases();
        databaseNames = databaseInfo.map((entry) => entry && entry.name).filter(Boolean);
      } catch {
        // ignore database listing failures
      }
    }

    if (!databaseNames.length) {
      databaseNames = fallbackDbNames;
    }

    const uniqueDatabaseNames = Array.from(new Set(databaseNames.concat(fallbackDbNames)));
    for (const databaseName of uniqueDatabaseNames) {
      const stores = await readDatabase(databaseName);
      stores.forEach(({ storeName, values }) => {
        values.slice(0, 80).forEach((entry, index) => {
          scanValue(entry, `indexedDB:${databaseName}/${storeName}[${index}]`, 0);
        });
      });
    }

    results.bearerCandidates.sort((left, right) => (right.confidence || 0) - (left.confidence || 0));

    return {
      refreshToken: results.refreshCandidates[0]?.value || '',
      bearerToken: results.bearerCandidates[0]?.value || '',
      appCheckToken: results.appCheckCandidates[0]?.value || '',
      deviceId: results.deviceCandidates[0]?.value || '',
      sources: {
        refreshToken: results.refreshCandidates[0]?.source || '',
        bearerToken: results.bearerCandidates[0]?.source || '',
        appCheckToken: results.appCheckCandidates[0]?.source || '',
        deviceId: results.deviceCandidates[0]?.source || '',
      },
    };
  })();
}

function inspectTabForAuth(tabId, tabUrl = '', options = {}) {
  const { requestUrl = '', headerPayload = null } = options;

  if (!Number.isInteger(tabId) || tabId < 0) {
    if (headerPayload?.bearerToken) {
      sendAuth({
        ...headerPayload,
        requestUrl,
        tabUrl,
        sources: {
          refreshToken: '',
          bearerToken: 'chrome.webRequest.Authorization',
          appCheckToken: headerPayload.appCheckToken ? 'chrome.webRequest.xi-app-check-token' : '',
          deviceId: headerPayload.deviceId ? 'chrome.webRequest.Device-ID' : '',
        },
      });
    }
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [FALLBACK_DB_NAMES],
    func: inspectTabAuthScript,
  }).then((results) => {
    const inspection = results?.[0]?.result || {};
    const bearerToken = normalizeBearerToken(headerPayload?.bearerToken || inspection.bearerToken || '');
    const refreshToken = normalizeString(inspection.refreshToken || '');
    const appCheckToken = normalizeString(headerPayload?.appCheckToken || inspection.appCheckToken || '');
    const deviceId = normalizeString(headerPayload?.deviceId || inspection.deviceId || '');

    if (!refreshToken && !bearerToken) {
      return;
    }

    sendAuth({
      refreshToken,
      bearerToken,
      appCheckToken,
      deviceId,
      requestUrl,
      tabUrl,
      sources: {
        refreshToken: inspection?.sources?.refreshToken || '',
        bearerToken: headerPayload?.bearerToken
          ? 'chrome.webRequest.Authorization'
          : (inspection?.sources?.bearerToken || ''),
        appCheckToken: headerPayload?.appCheckToken
          ? 'chrome.webRequest.xi-app-check-token'
          : (inspection?.sources?.appCheckToken || ''),
        deviceId: headerPayload?.deviceId
          ? 'chrome.webRequest.Device-ID'
          : (inspection?.sources?.deviceId || ''),
      },
    });
  }).catch(() => {
    if (headerPayload?.bearerToken) {
      sendAuth({
        ...headerPayload,
        requestUrl,
        tabUrl,
        sources: {
          refreshToken: '',
          bearerToken: 'chrome.webRequest.Authorization',
          appCheckToken: headerPayload.appCheckToken ? 'chrome.webRequest.xi-app-check-token' : '',
          deviceId: headerPayload.deviceId ? 'chrome.webRequest.Device-ID' : '',
        },
      });
    }
  });
}

function inspectOpenElevenReaderTabs() {
  chrome.tabs.query({ url: ['*://elevenreader.io/*', '*://*.elevenreader.io/*', '*://elevenlabs.io/*', '*://*.elevenlabs.io/*'] }, (tabs) => {
    (tabs || []).forEach((tab) => {
      if (Number.isInteger(tab?.id) && isAllowedOrigin(tab?.url || '')) {
        inspectTabForAuth(tab.id, tab.url || '', { requestUrl: tab.url || '' });
      }
    });
  });
}

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  initialize();

  const requestHeaders = details.requestHeaders || [];
  const tabUrl = details.initiator || details.documentUrl || '';
  syncPairingTokenFromUrl(tabUrl || details.url || '');

  if (!isAllowedOrigin(tabUrl) && !isAllowedOrigin(details.url || '')) {
    return;
  }

  const bearerToken = normalizeBearerToken(getHeaderValue(requestHeaders, 'authorization'));
  if (!bearerToken) {
    return;
  }

  inspectTabForAuth(details.tabId, tabUrl, {
    requestUrl: details.url || '',
    headerPayload: {
      bearerToken,
      appCheckToken: getHeaderValue(requestHeaders, 'xi-app-check-token'),
      deviceId: getHeaderValue(requestHeaders, 'device-id'),
    },
  });
}, {
  urls: [
    'https://api.elevenlabs.io/*',
  ],
}, ['requestHeaders', 'extraHeaders']);

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
      const tabUrl = tabs[0].url || 'https://elevenreader.io/';
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [FIREBASE_REFRESH_SCRIPT],
        func: (script) => new Function('return ' + script)(),
      }).then((results) => {
        console.log('[fftrans-bridge] Firebase refresh result:', results?.[0]?.result);
        setTimeout(() => {
          inspectTabForAuth(tabId, tabUrl, { requestUrl: tabUrl });
        }, 1500);
      }).catch(() => {
        chrome.tabs.reload(tabId);
        console.log('[fftrans-bridge] Script injection failed, fell back to tab reload');
      });
    } else {
      chrome.tabs.create({ url: 'https://elevenreader.io/', active: true }, () => {
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
        lastAuthSentAt,
        lastTokenStatus,
        lastTokenStatusAt,
        extensionVersion: chrome.runtime.getManifest().version,
        extensionId: chrome.runtime.id,
        paired: Boolean(currentInstallToken),
      });
      break;

    case 'navigate': {
      const url = message.url;
      if (!url || !isAllowedOrigin(url)) {
        respond(false, null, 'URL not allowed');
        return;
      }
      chrome.tabs.create({ url, active: true }, (tab) => {
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
    paired: Boolean(currentInstallToken),
    lastAuthSentAt,
    lastBearerSentAt: lastAuthSentAt,
    lastTokenStatus,
    lastTokenStatusAt,
    hasPendingAuth: Boolean(pendingAuthPayload),
    hasPendingBearer: Boolean(pendingAuthPayload),
  };
}

function initialize() {
  if (initialized) {
    return;
  }

  initialized = true;
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  loadStoredInstallToken(() => {
    connect();
    console.log('[fftrans-bridge] Extension initialized');
  });
}

chrome.runtime.onInstalled.addListener(() => initialize());
chrome.runtime.onStartup.addListener(() => initialize());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    connect();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const targetUrl = changeInfo.url || tab?.url || '';
  if (targetUrl) {
    syncPairingTokenFromUrl(targetUrl);
  }

  if (changeInfo.status === 'complete' && isAllowedOrigin(targetUrl)) {
    inspectTabForAuth(tabId, targetUrl, { requestUrl: targetUrl });
  }
});

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
