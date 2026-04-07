'use strict';

const { ipcMain } = require('electron');
const {
  IPC_CHANNELS,
  ELEVENLABS_AUTH_SOURCES,
  ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS,
  ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION,
} = require('../../constants');
const configModule = require('../system/config-module');
const ttsRequestQueue = require('../system/tts-request-queue');
const speechifyTTS = require('../translator/speechify-tts');
const elevenLabsTTS = require('../translator/elevenlabs-tts');
const mimoTTS = require('../translator/mimo-tts');
const elevenLabsAuth = require('../translator/elevenlabs-auth');
const elevenLabsBrowserAssist = require('../system/elevenlabs-browser-assist');
const elevenLabsExtensionBridge = require('../system/elevenlabs-extension-bridge');
const { IPCResponse } = require('../../utils/ipc-response');
const Logger = require('../../utils/logger');

function buildErrorDetails(error, provider) {
  return {
    provider,
    authCode: error?.authCode || '',
    statusCode: error?.statusCode || error?.response?.status,
    retryable: Boolean(error?.retryable),
    suggestion: error?.suggestion || '请检查配置后重试',
  };
}

function buildValidationError(error, provider = 'ElevenLabs') {
  return {
    message: error?.message || '凭证验证失败',
    ...buildErrorDetails(error, provider),
  };
}

function buildBrowserAssistWarning(browserData = {}) {
  const bearer = browserData?.bearer || {};
  if (bearer.status === ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS.UNTRUSTED) {
    return {
      code: 'browser_assist_bearer_untrusted',
      message: bearer.reasonMessage || '检测到了 Bearer Token，但来源可信度不足，暂不自动导入。',
      suggestion: '请在状态面板检查 Bearer 来源，或手动复制 Bearer Token 后再测试。',
    };
  }

  if (bearer.status === ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS.UNAVAILABLE) {
    return {
      code: 'browser_assist_bearer_unavailable',
      message: '浏览器辅助窗口里还没有检测到可用 Bearer Token。',
      suggestion: '请先在 ElevenReader 窗口完成登录并等待页面稳定，再重新检查。',
    };
  }

  if (bearer.validationStatus === ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION.REJECTED) {
    return {
      code: 'browser_assist_bearer_rejected',
      message: bearer.validationMessage || '检测到的 Bearer Token 未通过 Reader API 验证。',
      suggestion: '请重新登录后再试，或直接手动粘贴最新 Bearer Token。',
    };
  }

  return null;
}

function buildExtensionBridgeWarning(bridgeStatus = {}, candidate = null) {
  const server = bridgeStatus?.server || {};
  const pairing = bridgeStatus?.pairing || {};
  const currentCandidate = candidate || bridgeStatus?.candidate || {};

  if (server.state === 'error') {
    return {
      code: server.lastErrorCode || 'extension_bridge_error',
      message: server.lastErrorMessage || 'Chrome 扩展桥接服务启动失败。',
      suggestion: '请重启应用后重试；如果端口被占用，需要先释放本机 39393 端口。',
    };
  }

  if (server.state !== 'listening') {
    return {
      code: 'extension_bridge_stopped',
      message: 'Chrome 扩展桥接当前未监听。',
      suggestion: '请重启应用，WebSocket 桥接会自动启动。',
    };
  }

  if (!pairing.active && !currentCandidate?.hasBearerToken && !currentCandidate?.values?.bearerToken) {
    return {
      code: 'extension_pairing_inactive',
      message: 'Chrome 扩展尚未连接。',
      suggestion: '请确认已在 Chrome 中加载 FFTrans Bearer Bridge 扩展并启用。扩展会自动通过 WebSocket 连接。',
    };
  }

  if (currentCandidate?.state === 'rejected') {
    return {
      code: currentCandidate.validationCode || 'extension_candidate_rejected',
      message: currentCandidate.validationMessage || '扩展导入的 Bearer Token 验证失败。',
      suggestion: '请在浏览器里重新触发 ElevenReader 请求，再重新检查登录。',
    };
  }

  if (!currentCandidate?.values?.bearerToken && !currentCandidate?.hasBearerToken) {
    return {
      code: 'extension_candidate_unavailable',
      message: 'Chrome 扩展尚未向应用发送 Bearer Token。',
      suggestion: '请确认扩展已安装、已完成配对，并在 ElevenReader 页面触发一次 Reader API 请求。',
    };
  }

  return null;
}

const TTS_TEST_DISPATCHERS = {
  speechify: (config) => speechifyTTS.testConfiguration(config),
  elevenlabs: (config) => elevenLabsTTS.testConfiguration(config),
  mimo: (config) => mimoTTS.testConfiguration(config),
};

const TTS_VOICE_DISPATCHERS = {
  elevenlabs: (config) => elevenLabsTTS.getVoices(config),
  mimo: (config) => mimoTTS.getVoices(config),
};

function setTTSChannel() {
  // Unified: test current TTS engine
  ipcMain.handle(IPC_CHANNELS.TEST_CURRENT_TTS_ENGINE, async (event, payload = {}) => {
    const { engine = '', config = {} } = payload;

    if (engine === 'google') {
      return IPCResponse.success({
        engine: 'google',
        provider: 'Google',
        supported: false,
        message: 'Google TTS 无需配置测试，可直接使用。',
      }, 'Google TTS 无需测试');
    }

    const dispatcher = TTS_TEST_DISPATCHERS[engine];
    if (!dispatcher) {
      return IPCResponse.error(new Error('Unknown engine'), `不支持的 TTS 引擎: ${engine}`);
    }

    try {
      const result = await ttsRequestQueue.enqueue(() => dispatcher(config));
      return IPCResponse.success({ engine, provider: result.provider, supported: true, result }, `${result.provider} 测试成功`);
    } catch (error) {
      Logger.error('tts-ipc', `Failed to test TTS engine: ${engine}`, error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, error.provider || engine));
    }
  });

  // Unified: get TTS voices for a provider
  ipcMain.handle(IPC_CHANNELS.GET_TTS_VOICES, async (event, payload = {}) => {
    const { engine = '', config = {} } = payload;

    const dispatcher = TTS_VOICE_DISPATCHERS[engine];
    if (!dispatcher) {
      return IPCResponse.success({ engine, voices: [] }, `${engine} 不支持语音列表获取`);
    }

    try {
      const result = await ttsRequestQueue.enqueue(() => dispatcher(config));
      return IPCResponse.success({ engine, ...result });
    } catch (error) {
      Logger.error('tts-ipc', `Failed to get voices for: ${engine}`, error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, engine));
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEST_SPEECHIFY_CONFIG, async (event, configOverride = {}) => {
    try {
      const result = await ttsRequestQueue.enqueue(() => speechifyTTS.testConfiguration(configOverride));
      return IPCResponse.success(result, 'Speechify 配置测试成功');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to test Speechify config', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'Speechify'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_SPEECHIFY_CONFIG, () => {
    const config = configModule.getConfig();
    return config.api.speechify || {};
  });

  ipcMain.handle(IPC_CHANNELS.SET_SPEECHIFY_CONFIG, (event, speechifyConfig) => {
    const config = configModule.getConfig();
    config.api.speechify = {
      ...config.api.speechify,
      ...speechifyConfig,
    };
    configModule.setConfig(config);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.GET_TTS_ENGINE, () => {
    const config = configModule.getConfig();
    return config.indexWindow.ttsEngine || 'google';
  });

  ipcMain.handle(IPC_CHANNELS.SET_TTS_ENGINE, (event, engine) => {
    const config = configModule.getConfig();
    config.indexWindow.ttsEngine = engine;
    configModule.setConfig(config);
    return { success: true };
  });

  // --- Browser Assist & Extension Bridge: DISABLED (simplified to Refresh Token only) ---
  // GET_AUTH_STATUS, BEGIN_BROWSER_ASSIST, BEGIN_EXTENSION_BRIDGE_PAIRING,
  // CHECK_EXTENSION_BRIDGE_IMPORT, CHECK_BROWSER_ASSIST_LOGIN
  // are all commented out for now. Re-enable when browser assist is fixed.

  ipcMain.handle(IPC_CHANNELS.VALIDATE_ELEVENLABS_CONFIG, async (event, configOverride = {}) => {
    try {
      const result = await ttsRequestQueue.enqueue(() => elevenLabsTTS.validateConfiguration(configOverride));
      return IPCResponse.success(result, 'ElevenLabs 凭证验证成功');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to validate ElevenLabs config', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.VALIDATE_REFRESH_TOKEN, async (event, configOverride = {}) => {
    try {
      const result = await ttsRequestQueue.enqueue(() => elevenLabsAuth.validateRefreshToken(configOverride));
      return IPCResponse.success(result, 'ElevenLabs Refresh Token 验证成功');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to validate ElevenLabs refresh token', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.CLEAR_AUTH_SESSION, (event, configOverride = {}) => {
    try {
      const status = elevenLabsAuth.clearAuthSession(configOverride);
      return IPCResponse.success({
        cleared: true,
        status,
      }, 'ElevenLabs 会话已清除');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to clear ElevenLabs auth session', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PREVIEW_SPEECHIFY_VOICE, async (event, payload = {}) => {
    const { text = '', config = {} } = payload;

    try {
      const audioUrl = await ttsRequestQueue.enqueue(() => speechifyTTS.synthesizeSpeech(text, 'English', config));
      return IPCResponse.success({
        provider: 'Speechify',
        audioUrl,
        meta: {
          voiceId: config.voiceId,
          audioFormat: config.audioFormat,
          sentenceSplitting: Boolean(config.sentenceSplitting),
        },
      });
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to preview Speechify voice', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'Speechify'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEST_ELEVENLABS_CONFIG, async (event, configOverride = {}) => {
    try {
      const result = await ttsRequestQueue.enqueue(() => elevenLabsTTS.testConfiguration(configOverride));
      return IPCResponse.success(result, 'ElevenLabs 配置测试成功');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to test ElevenLabs config', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  // MiMo: Test configuration
  ipcMain.handle(IPC_CHANNELS.TEST_MIMO_CONFIG, async (event, configOverride = {}) => {
    try {
      const result = await ttsRequestQueue.enqueue(() => mimoTTS.testConfiguration(configOverride));
      return IPCResponse.success(result, 'MiMo 配置测试成功');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to test MiMo config', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'MiMo'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.GET_MIMO_CONFIG, () => {
    const config = configModule.getConfig();
    return config.api.mimo || {};
  });

  ipcMain.handle(IPC_CHANNELS.SET_MIMO_CONFIG, (event, mimoConfig) => {
    const config = configModule.getConfig();
    config.api.mimo = {
      ...config.api.mimo,
      ...mimoConfig,
    };
    configModule.setConfig(config);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.PREVIEW_MIMO_VOICE, async (event, payload = {}) => {
    const { text = '', config = {} } = payload;

    try {
      const audioUrl = await ttsRequestQueue.enqueue(() => mimoTTS.synthesizeSpeech(text, 'English', config));
      return IPCResponse.success({
        provider: 'MiMo',
        audioUrl,
        meta: {
          model: config.model,
          voice: config.voice,
          responseFormat: config.responseFormat,
          speed: config.speed,
        },
      });
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to preview MiMo voice', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'MiMo'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PREVIEW_ELEVENLABS_VOICE, async (event, payload = {}) => {
    const { text = '', config = {} } = payload;

    try {
      const audioUrl = await ttsRequestQueue.enqueue(() => elevenLabsTTS.synthesizeSpeech(text, 'English', config, {
        authOptions: {
          allowRefresh: true,
          cacheResolvedSession: false,
          persistAuthState: false,
          persistGeneratedDeviceId: false,
        },
      }));
      return IPCResponse.success({
        provider: 'ElevenLabs',
        audioUrl,
        meta: {
          voiceId: config.voiceId,
          modelId: config.modelId,
          usedAppCheck: Boolean(config.appCheckToken),
        },
      });
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to preview ElevenLabs voice', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });
}

module.exports = {
  setTTSChannel,
};
