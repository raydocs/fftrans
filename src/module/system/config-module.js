'use strict';

const { app } = require('electron');
const fileModule = require('./file-module');
const engineModule = require('./engine-module');
const cryptoHelper = require('../../utils/crypto-helper');
const configValidator = require('../../utils/config-validator');
const { ELEVENLABS_AUTH_STATES, ELEVENLABS_AUTH_SOURCES } = require('../../constants');

function getConfigLocation() {
  return fileModule.getUserDataPath('config', 'config.json');
}

let isConfigDirty = false;
let configRevision = 0;
let savedConfigRevision = 0;
let saveInFlightPromise = null;
let legacyElevenLabsSession = null;

const defaultConfig = {
  indexWindow: {
    x: -1,
    y: -1,
    width: -1,
    height: -1,
    shortcut: true,
    alwaysOnTop: true,
    focusable: true,
    minSize: true,
    hideButton: true,
    hideDialog: true,
    timeout: '15',
    backgroundColor: '#00000000',
    clickThrough: false,
    lock: false,
    speech: false,
    speechSpeed: '1',
    ttsEngine: 'google',
    compactMode: false,
    compactWidth: 320,
    compactHeight: 200,
  },
  dialog: {
    weight: 'normal',
    fontSize: '1',
    spacing: '1',
    radius: '0',
    backgroundColor: '#00000000',
  },
  captureWindow: {
    x: -1,
    y: -1,
    width: -1,
    height: -1,
    type: 'tesseract-ocr',
    split: true,
    edit: true,
  },
  channel: {
    '0039': '#CCCCCC',
    '0839': '#CCCCCC',
    '003D': '#ABD647',
    '0044': '#ABD647',
    '2AB9': '#ABD647',
  },
  translation: {
    autoChange: true,
    fix: true,
    skip: true,
    skipChinese: true,
    replace: true,
    engine: 'NVIDIA',
    engineAlternate: 'OpenRouter',
    from: 'English',
    fromPlayer: 'Auto',
    to: 'Simplified-Chinese',
    timeout: '10',
    },
    api: {
    googleVisionType: 'google-api-key',
    googleVisionApiKey: '',
    geminiApiKey: '',
    geminiModel: 'gemini-3.1-flash-lite-preview',
    gptApiKey: '',
    gptModel: 'gpt-5.4-nano',
    kimiToken: '',
    kimiModel: 'kimi-k2.5',
    llmApiUrl: '',
    llmApiKey: '',
    llmApiModel: '',
    openRouterApiKey: '',
    openRouterModel: 'inception/mercury-2',
    nvidiaApiKey: '',
    nvidiaModel: 'meta/llama-4-maverick-17b-128e-instruct',
    speechify: {
      bearerToken: '',
      voiceId: 'gwyneth',
      audioFormat: 'mp3',
      sentenceSplitting: false,
    },
    elevenlabs: {
      bearerToken: '',
      refreshToken: '',
      appCheckToken: '',
      deviceId: '',
      voiceId: 'nPczCjzI2devNBz1zQrb',
      genderVoiceRoutingEnabled: true,
      femaleVoiceId: 'EXAVITQu4vr4xnSDxMaL',
      maleVoiceId: 'nPczCjzI2devNBz1zQrb',
      modelId: 'eleven_v3',
      stability: '0.5',
      similarityBoost: '0.75',
      style: '0',
      useSpeakerBoost: true,
    },
    mimo: {
      apiKey: '',
      model: 'MiMo-V2-TTS',
      voice: '',
      responseFormat: 'mp3',
      speed: '1',
      style: '',
      emotion: '',
      language: '',
    },
  },
  auth: {
    elevenlabs: {
      state: ELEVENLABS_AUTH_STATES.UNCONFIGURED,
      lastValidatedAt: '',
      lastErrorCode: '',
      lastErrorMessage: '',
      lastAuthSource: ELEVENLABS_AUTH_SOURCES.NONE,
      extensionBridge: {
        installToken: '',
        createdAt: '',
        lastUsedAt: '',
      },
    },
  },
  ai: {
    useChat: false,
    chatLength: '0',
    temperature: '0.7',
    customTranslationPrompt: '',
    useStreaming: true,
  },
  proxy: {
    enable: false,
    protocol: 'http:',
    hostname: '',
    port: '',
    username: '',
    password: '',
  },
  system: {
    firstTime: true,
    appLanguage: '',
    autoDownloadJson: true,
    sslCertificate: true,
    theme: 'dark',
  },
};

let currentConfig = getDefaultConfig();

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function areValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function markConfigDirty() {
  isConfigDirty = true;
  configRevision += 1;
}

function mergeWithDefaults(currentNode, defaultNode, path = []) {
  if (Array.isArray(defaultNode)) {
    return Array.isArray(currentNode) ? deepClone(currentNode) : deepClone(defaultNode);
  }

  if (!isPlainObject(defaultNode)) {
    return typeof currentNode === typeof defaultNode ? currentNode : deepClone(defaultNode);
  }

  const preserveUnknownKeys = path.length === 1 && path[0] === 'channel';
  const merged = preserveUnknownKeys && isPlainObject(currentNode) ? { ...currentNode } : {};
  const sourceNode = isPlainObject(currentNode) ? currentNode : {};

  Object.keys(defaultNode).forEach((key) => {
    merged[key] = mergeWithDefaults(sourceNode[key], defaultNode[key], [...path, key]);
  });

  return merged;
}

function normalizeConfigShape(config) {
  if (!isPlainObject(config)) {
    return getDefaultConfig();
  }

  return mergeWithDefaults(config, defaultConfig);
}

function captureLegacyElevenLabsSession(config) {
  legacyElevenLabsSession = null;

  const bearerToken = typeof config?.api?.elevenlabs?.bearerToken === 'string'
    ? config.api.elevenlabs.bearerToken.trim()
    : '';
  const expiresAt = typeof config?.api?.elevenlabs?.bearerTokenExpiresAt === 'string'
    ? config.api.elevenlabs.bearerTokenExpiresAt.trim()
    : '';

  if (!bearerToken || !expiresAt) {
    return;
  }

  legacyElevenLabsSession = {
    bearerToken,
    expiresAt,
    source: ELEVENLABS_AUTH_SOURCES.LEGACY_BEARER_MIGRATION,
  };
}

function normalizePersistedElevenLabsAuthState(config) {
  const savedRefreshToken = typeof config?.api?.elevenlabs?.refreshToken === 'string'
    ? config.api.elevenlabs.refreshToken.trim()
    : '';
  const savedBearerToken = typeof config?.api?.elevenlabs?.bearerToken === 'string'
    ? config.api.elevenlabs.bearerToken.trim()
    : '';
  const savedBridgeToken = typeof config?.auth?.elevenlabs?.extensionBridge?.installToken === 'string'
    ? config.auth.elevenlabs.extensionBridge.installToken.trim()
    : '';

  if (savedRefreshToken || savedBearerToken || savedBridgeToken || legacyElevenLabsSession) {
    return;
  }

  const defaultAuthState = deepClone(defaultConfig.auth.elevenlabs);
  const currentAuthState = config?.auth?.elevenlabs;

  if (!areValuesEqual(currentAuthState || {}, defaultAuthState)) {
    config.auth = isPlainObject(config.auth) ? config.auth : {};
    config.auth.elevenlabs = defaultAuthState;
  }
}

function loadConfig() {
  try {
    currentConfig = fileModule.read(getConfigLocation(), 'json');
    currentConfig = cryptoHelper.decryptApiKeys(currentConfig);
    captureLegacyElevenLabsSession(currentConfig);

    if (
      typeof currentConfig !== 'object' ||
      currentConfig === null ||
      Array.isArray(currentConfig) ||
      (typeof currentConfig === 'object' && Object.keys(currentConfig).length === 0)
    ) {
      throw 'Use default config.';
    }

    const configBeforeFix = JSON.stringify(currentConfig);
    fixConfig0(currentConfig);
    fixConfig1(currentConfig);
    fixConfig2(currentConfig);
    currentConfig = normalizeConfigShape(currentConfig);
    normalizePersistedElevenLabsAuthState(currentConfig);

    const configAfterFix = JSON.stringify(currentConfig);
    if (configBeforeFix !== configAfterFix) {
      markConfigDirty();
    }

    if (currentConfig.system.firstTime === true) {
      currentConfig.system.firstTime = false;
      markConfigDirty();
    }
  } catch (error) {
    console.log(error);
    legacyElevenLabsSession = null;
    currentConfig = getDefaultConfig();
    markConfigDirty();
  }

  const validationResult = configValidator.validate(currentConfig, defaultConfig);
  if (!validationResult.valid) {
    console.warn('[ConfigModule] Configuration validation warnings:', validationResult.errors);
  }

  setSSLCertificate();

  if (isConfigDirty) {
    saveConfig();
  }

  return currentConfig;
}

async function saveConfig() {
  if (saveInFlightPromise) {
    return saveInFlightPromise;
  }

  if (!isConfigDirty) {
    return;
  }

  saveInFlightPromise = (async () => {
    while (isConfigDirty) {
      const revisionToSave = configRevision;
      try {
        const encryptedConfig = cryptoHelper.encryptApiKeys(deepClone(currentConfig));
        await fileModule.writeAsync(getConfigLocation(), encryptedConfig, 'json');
        savedConfigRevision = revisionToSave;
        isConfigDirty = savedConfigRevision < configRevision;
      } catch (error) {
        console.log(error);
        markConfigDirty();
        break;
      }
    }
  })();

  try {
    await saveInFlightPromise;
  } finally {
    saveInFlightPromise = null;
  }
}

function getConfig() {
  return deepClone(currentConfig);
}

function setConfig(newConfig) {
  currentConfig = normalizeConfigShape(newConfig);
  markConfigDirty();
  setSSLCertificate();
  saveConfig();
}

function getDefaultConfig() {
  return deepClone(defaultConfig);
}

function setDefaultConfig() {
  legacyElevenLabsSession = null;
  currentConfig = getDefaultConfig();
  setSSLCertificate();
  setAppLanguage();
}

function mergeConfigPatch(pathSegments = [], patch = {}) {
  if (!isPlainObject(patch)) {
    return getConfig();
  }

  if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
    const previousValue = isPlainObject(currentConfig) ? currentConfig : {};
    const nextValue = {
      ...previousValue,
      ...patch,
    };

    if (areValuesEqual(previousValue, nextValue)) {
      return getConfig();
    }

    currentConfig = nextValue;
    markConfigDirty();
    saveConfig();
    return getConfig();
  }

  let current = currentConfig;
  for (let index = 0; index < pathSegments.length - 1; index++) {
    const segment = pathSegments[index];
    if (!isPlainObject(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }

  const targetKey = pathSegments[pathSegments.length - 1];
  const previousValue = isPlainObject(current[targetKey]) ? current[targetKey] : {};
  const nextValue = {
    ...previousValue,
    ...patch,
  };

  if (areValuesEqual(previousValue, nextValue)) {
    return getConfig();
  }

  current[targetKey] = nextValue;
  markConfigDirty();
  saveConfig();
  return getConfig();
}

function setSSLCertificate() {
  if (currentConfig.system.sslCertificate) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = 1;
  } else {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
  }
}

function fixConfig0(config) {
  try {
    if (config?.indexWindow) {
      const width = parseInt(config.indexWindow.width, 10);
      const height = parseInt(config.indexWindow.height, 10);
      config.indexWindow.width = Number.isNaN(width) ? defaultConfig.indexWindow.width : width;
      config.indexWindow.height = Number.isNaN(height) ? defaultConfig.indexWindow.height : height;
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig0 - fix index window size failed:', error.message);
  }

  try {
    if (config?.captureWindow) {
      const width = parseInt(config.captureWindow.width, 10);
      const height = parseInt(config.captureWindow.height, 10);
      config.captureWindow.width = Number.isNaN(width) ? defaultConfig.captureWindow.width : width;
      config.captureWindow.height = Number.isNaN(height) ? defaultConfig.captureWindow.height : height;
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig0 - fix capture window size failed:', error.message);
  }
}

function fixConfig1(config) {
  try {
    if (config?.api?.unofficialApi) {
      config.translation.engine = 'LLM-API';
      config.api.llmApiUrl = config.api.unofficialApiUrl.replace(/\/$/, '') + '/chat/completions';
      config.api.llmApiKey = config.api.gptApiKey;
      config.api.llmApiModel = config.api.gptModel;
      config.api.gptApiKey = '';
      config.api.gptModel = '';
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig1 - fix custom API failed:', error.message);
  }

  try {
    if (!['https:', 'http:'].includes(config.proxy.protocol)) {
      if (config.proxy.protocol.includes('https')) {
        config.proxy.protocol = 'https:';
      } else {
        config.proxy.protocol = 'http:';
      }
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig1 - fix protocol failed:', error.message);
  }

  try {
    if (config.proxy.host) {
      config.proxy.hostname = config.proxy.host;
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig1 - fix hostname failed:', error.message);
  }

  try {
    if (config.api.kimiCustomPrompt) {
      config.ai.customTranslationPrompt = config.api.kimiCustomPrompt;
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig1 - fix custom prompt failed:', error.message);
  }
}

function fixConfig2(config) {
  try {
    if (!engineModule.engineList.includes(config.translation.engine)) {
      config.translation.engine = defaultConfig.translation.engine;
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig2 - fix engine failed:', error.message);
  }

  try {
    if (!engineModule.sourceList.includes(config.translation.from)) {
      config.translation.from = defaultConfig.translation.from;
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig2 - fix source failed:', error.message);
  }

  try {
    if (!engineModule.sourceList.includes(config.translation.fromPlayer)) {
      config.translation.fromPlayer = defaultConfig.translation.fromPlayer;
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig2 - fix player failed:', error.message);
  }

  try {
    if (!engineModule.targetList.includes(config.translation.to)) {
      config.translation.to = defaultConfig.translation.to;
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig2 - fix target failed:', error.message);
  }

  try {
    if (!engineModule.visionList.includes(config.captureWindow.type)) {
      if (config.captureWindow.type === 'google') {
        config.captureWindow.type = 'google-vision';
      } else {
        config.captureWindow.type = 'tesseract-ocr';
      }
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig2 - fix text detect failed:', error.message);
  }

  try {
    const googleJsonPath = fileModule.getUserDataPath('config', 'google-credential.json');
    const googleJsonPathNew = fileModule.getUserDataPath('config', 'google-vision-credential.json');
    if (fileModule.exists(googleJsonPath)) {
      const googleJson = fileModule.read(googleJsonPath, 'json');
      fileModule.write(googleJsonPathNew, googleJson, 'json');
      fileModule.unlink(googleJsonPath);
      config.api.googleVisionType = 'google-json';
    }
  } catch (error) {
    console.warn('[ConfigModule] fixConfig2 - fix google vision failed:', error.message);
  }
}

function setAppLanguage() {
  const config = getConfig();
  const locale = app.getSystemLocale();

  config.translation.from = engineModule.languageEnum.en;

  if (/zh-(TW|HK|MO|CHT|Hant)/i.test(locale)) {
    config.translation.to = engineModule.languageEnum.zht;
    config.system.appLanguage = 'app-zht';
  } else if (/zh-(CN|CHS|Hans)/i.test(locale)) {
    config.translation.to = engineModule.languageEnum.zhs;
    config.system.appLanguage = 'app-zhs';
  } else {
    config.translation.to = engineModule.languageEnum.en;
    config.system.appLanguage = 'app-en';
  }

  setConfig(config);
}

function updateElevenLabsConfig(patch = {}) {
  return mergeConfigPatch(['api', 'elevenlabs'], patch);
}

function updateElevenLabsAuthState(patch = {}) {
  return mergeConfigPatch(['auth', 'elevenlabs'], patch);
}

function updateElevenLabsExtensionBridgeState(patch = {}) {
  const currentBridgeState = getConfig()?.auth?.elevenlabs?.extensionBridge || {};
  return updateElevenLabsAuthState({
    extensionBridge: {
      ...currentBridgeState,
      ...patch,
    },
  });
}

function consumeLegacyElevenLabsSession() {
  const session = legacyElevenLabsSession ? deepClone(legacyElevenLabsSession) : null;
  legacyElevenLabsSession = null;
  return session;
}

module.exports = {
  loadConfig,
  saveConfig,
  getConfig,
  setConfig,
  getDefaultConfig,
  setDefaultConfig,
  setAppLanguage,
  updateElevenLabsConfig,
  updateElevenLabsAuthState,
  updateElevenLabsExtensionBridgeState,
  consumeLegacyElevenLabsSession,
};
