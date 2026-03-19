'use strict';

const { BrowserWindow } = require('electron');
const Logger = require('../../utils/logger');

const ASSIST_PARTITION = 'persist:elevenlabs-browser-assist';
const DEFAULT_ASSIST_URL = 'https://elevenlabs.io/sign-in';
const ELEVENLABS_URL_PATTERN = /^https:\/\/([^.]+\.)?elevenlabs\.io/i;
const FALLBACK_DB_NAMES = [
  'firebaseLocalStorageDb',
  'firebase-installations-database',
  'firebase-app-check-database',
];

let assistWindow = null;

function createEmptyInspection() {
  return {
    detectedAt: '',
    currentUrl: '',
    title: '',
    refreshToken: '',
    appCheckToken: '',
    deviceId: '',
    sources: {
      refreshToken: '',
      appCheckToken: '',
      deviceId: '',
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
  };
}

function buildAssistError(message, code = 'browser_assist_error') {
  const error = new Error(message);
  error.authCode = code;
  error.retryable = false;
  error.suggestion = '请先打开 ElevenLabs 浏览器辅助窗口并完成登录';
  return error;
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
    title: 'ElevenLabs Browser Assist',
    backgroundColor: '#101114',
    webPreferences: {
      partition: ASSIST_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
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
    title: window.getTitle() || 'ElevenLabs Browser Assist',
    onElevenLabsOrigin: ELEVENLABS_URL_PATTERN.test(currentUrl || DEFAULT_ASSIST_URL),
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
    title: window.getTitle() || 'ElevenLabs Browser Assist',
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
        refreshTokens: [],
        appCheckTokens: [],
        deviceIds: [],
      };
      const seen = {
        refresh: new Set(),
        appCheck: new Set(),
        device: new Set(),
      };

      function add(kind, value, source) {
        if (typeof value !== 'string') {
          return;
        }

        const trimmed = value.trim();
        if (!trimmed) {
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

      function recordString(value, source) {
        if (typeof value !== 'string') {
          return;
        }

        const trimmed = value.trim();
        if (!trimmed) {
          return;
        }

        if (/refresh[_-]?token/i.test(source) && trimmed.length > 20) {
          add('refresh', trimmed, source);
        }

        if (/device[_-]?id/i.test(source) && trimmed.length >= 6) {
          add('device', trimmed, source);
        }

        const jwtMatches = trimmed.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
        if (/app.?check/i.test(source)) {
          for (const candidate of jwtMatches.length ? jwtMatches : [trimmed]) {
            add('appCheck', candidate, source);
          }
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
              const jwtMatches = nextValue.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [nextValue];
              jwtMatches.forEach((candidate) => add('appCheck', candidate, nextSource));
            }

            if (/device[_-]?id/i.test(key) && nextValue.trim()) {
              add('device', nextValue, nextSource);
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

async function inspectBrowserAssistLogin() {
  const window = getAssistWindow();
  if (!window) {
    throw buildAssistError('请先点击“连接浏览器”打开 ElevenLabs 登录窗口', 'browser_assist_not_open');
  }

  const currentUrl = window.webContents.getURL() || '';
  if (currentUrl && !ELEVENLABS_URL_PATTERN.test(currentUrl)) {
    throw buildAssistError('浏览器辅助窗口当前不在 ElevenLabs 页面，请返回 ElevenLabs 后重试', 'browser_assist_wrong_origin');
  }

  const inspection = await window.webContents.executeJavaScript(buildInspectionScript(), true);
  const refreshTokenCandidate = pickCandidate(inspection?.refreshTokens || []);
  const appCheckCandidate = pickCandidate(inspection?.appCheckTokens || []);
  const deviceIdCandidate = pickCandidate(inspection?.deviceIds || []);

  if (!refreshTokenCandidate && !appCheckCandidate && !deviceIdCandidate) {
    throw buildAssistError('未在浏览器辅助窗口中检测到 ElevenLabs 登录凭证，请确认已经完成登录并等待页面加载完成', 'browser_assist_no_tokens');
  }

  lastInspection = {
    detectedAt: new Date().toISOString(),
    currentUrl: inspection?.currentUrl || currentUrl,
    title: inspection?.title || window.getTitle() || 'ElevenLabs Browser Assist',
    refreshToken: refreshTokenCandidate?.value || '',
    appCheckToken: appCheckCandidate?.value || '',
    deviceId: deviceIdCandidate?.value || '',
    sources: {
      refreshToken: refreshTokenCandidate?.source || '',
      appCheckToken: appCheckCandidate?.source || '',
      deviceId: deviceIdCandidate?.source || '',
    },
  };

  return cloneInspectionData(lastInspection);
}

module.exports = {
  focusBrowserAssistWindow,
  inspectBrowserAssistLogin,
  getBrowserAssistStatus,
};
