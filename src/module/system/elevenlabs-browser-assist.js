'use strict';

const { BrowserWindow, shell } = require('electron');
const Logger = require('../../utils/logger');
const elevenLabsAuth = require('../translator/elevenlabs-auth');
const {
  ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS,
  ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION,
} = require('../../constants');

const ASSIST_PARTITION = 'persist:elevenlabs-browser-assist';
const DEFAULT_ASSIST_URL = 'https://elevenreader.io/reader/sign-in';
const ASSIST_ALLOWED_HOSTS = [
  'elevenreader.io',
  'elevenlabs.io',
];
const FALLBACK_DB_NAMES = [
  'firebaseLocalStorageDb',
  'firebase-installations-database',
  'firebase-app-check-database',
];
const BEARER_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

let assistWindow = null;

function createEmptyInspection() {
  return {
    detectedAt: '',
    currentUrl: '',
    title: '',
    bearerToken: '',
    refreshToken: '',
    appCheckToken: '',
    deviceId: '',
    sources: {
      bearerToken: '',
      refreshToken: '',
      appCheckToken: '',
      deviceId: '',
    },
    bearer: {
      status: ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS.UNAVAILABLE,
      confidence: '',
      expiresAt: '',
      reasonCode: 'not_found',
      reasonMessage: '尚未在浏览器辅助窗口中检测到 Bearer Token。',
      validationStatus: ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION.UNTESTED,
      validationCode: '',
      validationMessage: '',
      validatedAt: '',
    },
  };
}

let lastInspection = createEmptyInspection();

function cloneInspectionData(inspection = lastInspection) {
  return {
    ...inspection,
    sources: {
      ...(inspection?.sources || {}),
    },
    bearer: {
      ...(inspection?.bearer || createEmptyInspection().bearer),
    },
  };
}

function buildAssistError(message, code = 'browser_assist_error') {
  const error = new Error(message);
  error.authCode = code;
  error.retryable = false;
  error.suggestion = '请先打开 ElevenReader 旧版浏览器辅助窗口并完成登录';
  return error;
}

function isAllowedAssistUrl(url = '') {
  try {
    const parsed = new URL(url || DEFAULT_ASSIST_URL);
    if (parsed.protocol !== 'https:') {
      return false;
    }

    return ASSIST_ALLOWED_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function getSanitizedAssistUserAgent(webContents) {
  try {
    const defaultUserAgent = webContents?.getUserAgent?.() || '';
    if (!defaultUserAgent) {
      return '';
    }

    return defaultUserAgent
      .replace(/\sElectron\/[^\s]+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function getAssistWindow() {
  if (assistWindow && !assistWindow.isDestroyed()) {
    return assistWindow;
  }

  assistWindow = null;
  return null;
}

function ensureAssistWindow() {
  const existingWindow = getAssistWindow();
  if (existingWindow) {
    return existingWindow;
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 980,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'ElevenReader Legacy Browser Assist',
    backgroundColor: '#101114',
    webPreferences: {
      partition: ASSIST_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const sanitizedUserAgent = getSanitizedAssistUserAgent(window.webContents);
  if (sanitizedUserAgent) {
    window.webContents.setUserAgent(sanitizedUserAgent);
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      window.loadURL(url).catch((error) => {
        Logger.error('elevenlabs-browser-assist', 'Failed to load popup URL in assist window', error);
      });
      return { action: 'deny' };
    }

    if (typeof url === 'string' && url.trim()) {
      shell.openExternal(url).catch((error) => {
        Logger.error('elevenlabs-browser-assist', 'Failed to open external assist popup URL', error);
      });
    }

    return { action: 'deny' };
  });

  window.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) {
      return;
    }

    Logger.error('elevenlabs-browser-assist', `Assist page failed to load: ${validatedURL || DEFAULT_ASSIST_URL} (${errorCode}) ${errorDescription}`);
  });

  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      window.show();
    }
  });

  window.on('closed', () => {
    if (assistWindow === window) {
      assistWindow = null;
      lastInspection = createEmptyInspection();
    }
  });

  window.loadURL(DEFAULT_ASSIST_URL).catch((error) => {
    Logger.error('elevenlabs-browser-assist', 'Failed to load assist URL', error);
  });

  assistWindow = window;
  return window;
}

function getBrowserAssistStatus() {
  const window = getAssistWindow();
  if (!window) {
    return {
      isOpen: false,
      currentUrl: '',
      title: '',
      onElevenLabsOrigin: false,
      isLoading: false,
      lastInspection: cloneInspectionData(),
    };
  }

  const currentUrl = window.webContents.getURL() || '';
  return {
    isOpen: true,
    currentUrl,
    title: window.getTitle() || 'ElevenReader Legacy Browser Assist',
    onElevenLabsOrigin: isAllowedAssistUrl(currentUrl),
    isLoading: window.webContents.isLoading(),
    lastInspection: cloneInspectionData(),
  };
}

function focusBrowserAssistWindow() {
  const window = ensureAssistWindow();

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();

  return {
    opened: true,
    url: window.webContents.getURL() || DEFAULT_ASSIST_URL,
    title: window.getTitle() || 'ElevenReader Legacy Browser Assist',
    browserAssist: getBrowserAssistStatus(),
  };
}

function buildInspectionScript() {
  return `
    (async () => {
      const fallbackDbNames = ${JSON.stringify(FALLBACK_DB_NAMES)};
      const results = {
        currentUrl: location.href,
        title: document.title || '',
        bearerTokens: [],
        refreshTokens: [],
        appCheckTokens: [],
        deviceIds: [],
      };
      const seen = {
        bearer: new Map(),
        refresh: new Set(),
        appCheck: new Set(),
        device: new Set(),
      };

      function confidenceScore(value) {
        return value === 'high' ? 2 : value === 'medium' ? 1 : 0;
      }

      function add(kind, value, source, meta = {}) {
        if (typeof value !== 'string') {
          return;
        }

        const trimmed = value.trim();
        if (!trimmed) {
          return;
        }

        if (kind === 'bearer') {
          const existingIndex = seen.bearer.get(trimmed);
          const nextEntry = {
            value: trimmed,
            source,
            confidence: meta.confidence || 'low',
          };

          if (typeof existingIndex === 'number') {
            const existingEntry = results.bearerTokens[existingIndex];
            if (!existingEntry || confidenceScore(nextEntry.confidence) > confidenceScore(existingEntry.confidence)) {
              results.bearerTokens[existingIndex] = nextEntry;
            }
            return;
          }

          seen.bearer.set(trimmed, results.bearerTokens.length);
          results.bearerTokens.push(nextEntry);
          return;
        }

        const bucket = kind === 'refresh'
          ? results.refreshTokens
          : kind === 'appCheck'
            ? results.appCheckTokens
            : results.deviceIds;
        const seenBucket = kind === 'refresh'
          ? seen.refresh
          : kind === 'appCheck'
            ? seen.appCheck
            : seen.device;

        if (seenBucket.has(trimmed)) {
          return;
        }

        seenBucket.add(trimmed);
        bucket.push({ value: trimmed, source });
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

      function getJwtCandidates(value) {
        if (typeof value !== 'string') {
          return [];
        }

        return value.match(/(?:Bearer[ 	
]+)?eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+/g) || [];
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
        const isAppCheckSource = /app.?check/.test(lowerSource);
        const isRefreshSource = /refresh[_-]?token/.test(lowerSource);
        const isDeviceSource = /device[_-]?id/.test(lowerSource);
        const isHighConfidenceBearerSource = /(firebase:authuser|ststokenmanager[.]accesstoken|authorization|bearer|(^|[^a-z])(access|id)[_-]?token([^a-z]|$))/.test(lowerSource);

        if (isRefreshSource && trimmed.length > 20) {
          add('refresh', trimmed, source);
        }

        if (isDeviceSource && trimmed.length >= 6) {
          add('device', trimmed, source);
        }

        if (isAppCheckSource) {
          for (const candidate of jwtMatches.length ? jwtMatches : [trimmed]) {
            add('appCheck', candidate, source);
          }
          return;
        }

        if (jwtMatches.length > 0) {
          jwtMatches.forEach((candidate) => {
            add('bearer', candidate, source, { confidence: isHighConfidenceBearerSource ? 'high' : 'low' });
          });
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
            scanValue(parsed, source + '::json', depth + 1);
          }
          return;
        }

        if (typeof value !== 'object') {
          return;
        }

        if (Array.isArray(value)) {
          value.slice(0, 50).forEach((entry, index) => {
            scanValue(entry, source + '[' + index + ']', depth + 1);
          });
          return;
        }

        Object.keys(value).slice(0, 80).forEach((key) => {
          const nextValue = value[key];
          const nextSource = source ? source + '.' + key : key;

          if (typeof nextValue === 'string') {
            if (/refresh[_-]?token/i.test(key) && nextValue.trim().length > 20) {
              add('refresh', nextValue, nextSource);
            }

            if (/app.?check/i.test(key)) {
              const jwtMatches = getJwtCandidates(nextValue);
              jwtMatches.length ? jwtMatches.forEach((candidate) => add('appCheck', candidate, nextSource)) : add('appCheck', nextValue, nextSource);
            }

            if (/device[_-]?id/i.test(key) && nextValue.trim()) {
              add('device', nextValue, nextSource);
            }

            if (/(^|[^a-z])(access|id)[_-]?token([^a-z]|$)|authorization|bearer/i.test(key)) {
              const jwtMatches = getJwtCandidates(nextValue);
              jwtMatches.forEach((candidate) => add('bearer', candidate, nextSource, { confidence: 'high' }));
            }
          }

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

            const value = storage.getItem(key);
            scanValue(value, storageName + '[' + key + ']', 0);
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
                    getAllRequest.onsuccess = () => {
                      storeResolve([{ storeName, values: getAllRequest.result || [] }]);
                    };
                    getAllRequest.onerror = () => storeResolve([]);
                    return;
                  }

                  const values = [];
                  const cursorRequest = store.openCursor();
                  cursorRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
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
            scanValue(entry, 'indexedDB:' + databaseName + '/' + storeName + '[' + index + ']', 0);
          });
        });
      }

      return results;
    })();
  `;
}

function pickCandidate(candidates = []) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  return candidates[0];
}

function isJwtLikeToken(token = '') {
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

function getNormalizedBearerToken(token = '') {
  return elevenLabsAuth.normalizeBearerToken(token).trim();
}

function getBearerExpiry(candidate = {}) {
  const normalizedToken = getNormalizedBearerToken(candidate?.value || '');
  const rawToken = normalizedToken.replace(/^Bearer\s+/i, '').trim();
  const expiresAtMs = elevenLabsAuth.decodeTokenExpiry(rawToken);

  return {
    normalizedToken,
    rawToken,
    expiresAtMs,
    expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : '',
  };
}

function isHighConfidenceBearerCandidate(candidate = {}) {
  if ((candidate?.confidence || '').toLowerCase() === 'high') {
    return true;
  }

  const source = String(candidate?.source || '');
  return /(firebase:authUser|stsTokenManager\.accessToken|(^|[.[])(accessToken|idToken)(?:$|[.\]])|authorization|bearer)/i.test(source);
}

function compareBearerCandidates(a = {}, b = {}) {
  const confidenceDelta = (b.confidenceScore || 0) - (a.confidenceScore || 0);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  const expiryDelta = (b.expiresAtMs || 0) - (a.expiresAtMs || 0);
  if (expiryDelta !== 0) {
    return expiryDelta;
  }

  return String(b.source || '').length - String(a.source || '').length;
}

function classifyBearerCandidates(candidates = []) {
  const unavailable = createEmptyInspection().bearer;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      bearerToken: '',
      source: '',
      bearer: unavailable,
    };
  }

  const trustedCandidates = [];
  const fallbackCandidates = [];

  candidates.forEach((candidate) => {
    const { normalizedToken, rawToken, expiresAtMs, expiresAt } = getBearerExpiry(candidate);
    const highConfidence = isHighConfidenceBearerCandidate(candidate);
    const confidence = highConfidence ? 'high' : 'low';
    const confidenceScore = highConfidence ? 2 : 0;

    if (!normalizedToken || !isJwtLikeToken(rawToken)) {
      fallbackCandidates.push({
        bearerToken: normalizedToken,
        source: candidate?.source || '',
        confidence,
        confidenceScore,
        expiresAtMs,
        expiresAt,
        reasonCode: 'invalid_format',
        reasonMessage: '检测到的 Bearer 值不是有效 JWT。',
      });
      return;
    }

    if (expiresAtMs && expiresAtMs <= Date.now() + BEARER_EXPIRY_BUFFER_MS) {
      fallbackCandidates.push({
        bearerToken: normalizedToken,
        source: candidate?.source || '',
        confidence,
        confidenceScore,
        expiresAtMs,
        expiresAt,
        reasonCode: 'expired',
        reasonMessage: '检测到的 Bearer 已过期或即将过期。',
      });
      return;
    }

    if (!highConfidence) {
      fallbackCandidates.push({
        bearerToken: normalizedToken,
        source: candidate?.source || '',
        confidence,
        confidenceScore,
        expiresAtMs,
        expiresAt,
        reasonCode: 'low_confidence',
        reasonMessage: '检测到 JWT，但来源路径可信度不足，暂不自动导入。',
      });
      return;
    }

    trustedCandidates.push({
      bearerToken: normalizedToken,
      source: candidate?.source || '',
      confidence,
      confidenceScore,
      expiresAtMs,
      expiresAt,
    });
  });

  if (trustedCandidates.length > 0) {
    trustedCandidates.sort(compareBearerCandidates);
    const selected = trustedCandidates[0];
    return {
      bearerToken: selected.bearerToken,
      source: selected.source,
      bearer: {
        status: ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS.TRUSTED,
        confidence: selected.confidence,
        expiresAt: selected.expiresAt,
        reasonCode: '',
        reasonMessage: '',
        validationStatus: ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION.UNTESTED,
        validationCode: '',
        validationMessage: '',
        validatedAt: '',
      },
    };
  }

  if (fallbackCandidates.length > 0) {
    fallbackCandidates.sort((a, b) => {
      const reasonPriority = {
        low_confidence: 0,
        expired: 1,
        invalid_format: 2,
      };
      const reasonDelta = (reasonPriority[a.reasonCode] ?? 9) - (reasonPriority[b.reasonCode] ?? 9);
      if (reasonDelta !== 0) {
        return reasonDelta;
      }
      return compareBearerCandidates(a, b);
    });

    const selected = fallbackCandidates[0];
    return {
      bearerToken: selected.bearerToken,
      source: selected.source,
      bearer: {
        status: ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS.UNTRUSTED,
        confidence: selected.confidence,
        expiresAt: selected.expiresAt,
        reasonCode: selected.reasonCode,
        reasonMessage: selected.reasonMessage,
        validationStatus: ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION.UNTESTED,
        validationCode: '',
        validationMessage: '',
        validatedAt: '',
      },
    };
  }

  return {
    bearerToken: '',
    source: '',
    bearer: unavailable,
  };
}

function updateBearerValidationResult(bearerToken = '', {
  validationStatus = ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION.UNTESTED,
  validationCode = '',
  validationMessage = '',
} = {}) {
  const normalizedToken = getNormalizedBearerToken(bearerToken);
  const currentToken = getNormalizedBearerToken(lastInspection?.bearerToken || '');
  if (!normalizedToken || !currentToken || normalizedToken !== currentToken) {
    return cloneInspectionData();
  }

  lastInspection = {
    ...lastInspection,
    bearer: {
      ...(lastInspection?.bearer || createEmptyInspection().bearer),
      validationStatus,
      validationCode,
      validationMessage,
      validatedAt: new Date().toISOString(),
    },
  };

  return cloneInspectionData();
}

async function inspectBrowserAssistLogin() {
  const window = getAssistWindow();
  if (!window) {
    throw buildAssistError('请先点击“打开旧版浏览器辅助窗口”打开 ElevenReader 登录窗口', 'browser_assist_not_open');
  }

  const currentUrl = window.webContents.getURL() || '';
  if (currentUrl && !isAllowedAssistUrl(currentUrl)) {
    throw buildAssistError('浏览器辅助窗口当前不在 ElevenReader / ElevenLabs 页面，请返回目标站点后重试', 'browser_assist_wrong_origin');
  }

  const inspection = await window.webContents.executeJavaScript(buildInspectionScript(), true);
  const bearerCandidate = classifyBearerCandidates(inspection?.bearerTokens || []);
  const refreshTokenCandidate = pickCandidate(inspection?.refreshTokens || []);
  const appCheckCandidate = pickCandidate(inspection?.appCheckTokens || []);
  const deviceIdCandidate = pickCandidate(inspection?.deviceIds || []);

  lastInspection = {
    detectedAt: new Date().toISOString(),
    currentUrl: inspection?.currentUrl || currentUrl,
    title: inspection?.title || window.getTitle() || 'ElevenReader Legacy Browser Assist',
    bearerToken: bearerCandidate.bearerToken || '',
    refreshToken: refreshTokenCandidate?.value || '',
    appCheckToken: appCheckCandidate?.value || '',
    deviceId: deviceIdCandidate?.value || '',
    sources: {
      bearerToken: bearerCandidate.source || '',
      refreshToken: refreshTokenCandidate?.source || '',
      appCheckToken: appCheckCandidate?.source || '',
      deviceId: deviceIdCandidate?.source || '',
    },
    bearer: {
      ...createEmptyInspection().bearer,
      ...(bearerCandidate.bearer || {}),
    },
  };

  return cloneInspectionData(lastInspection);
}

module.exports = {
  focusBrowserAssistWindow,
  inspectBrowserAssistLogin,
  getBrowserAssistStatus,
  updateBearerValidationResult,
};
