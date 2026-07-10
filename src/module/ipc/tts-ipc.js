'use strict';

const { ipcMain } = require('electron');
const {
  IPC_CHANNELS,
  ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS,
  ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION,
} = require('../../constants');
const configModule = require('../system/config-module');
const ttsRequestQueue = require('../system/tts-request-queue');
const speechifyTTS = require('../translator/speechify-tts');
const elevenLabsTTS = require('../translator/elevenlabs-tts');
const mimoTTS = require('../translator/mimo-tts');
const fishTTS = require('../translator/fish-tts');
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
      suggestion: '请优先改用 Chromium + 扩展主流程；如果无法使用，再改用手动 Refresh Token 回退。',
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
      suggestion: '请重新登录后再试；如果主流程不可用，请改用手动 Refresh Token 回退。',
    };
  }

  return null;
}

function buildExtensionBridgeWarning(bridgeStatus = {}) {
  const server = bridgeStatus?.server || {};
  const pairing = bridgeStatus?.pairing || {};
  const currentCandidate = bridgeStatus?.candidate || {};

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

  if (pairing.state === 'unpaired') {
    return {
      code: 'extension_pairing_required',
      message: 'Chrome 扩展尚未完成配对。',
      suggestion: '请先开始扩展配对，FFTrans 会在默认浏览器中打开 ElevenReader 登录页。',
    };
  }

  if (currentCandidate?.state === 'rejected') {
    return {
      code: currentCandidate.validationCode || 'extension_candidate_rejected',
      message: currentCandidate.validationMessage || '扩展导入的认证信息验证失败。',
      suggestion: '请在浏览器里重新完成登录并等待扩展重新导入。',
    };
  }

  if (!currentCandidate?.hasRefreshToken && !currentCandidate?.hasBearerToken) {
    return {
      code: pairing.active ? 'extension_candidate_unavailable' : 'extension_pairing_waiting',
      message: pairing.active
        ? 'Chrome 扩展已连接，但尚未捕获到可导入的认证信息。'
        : 'Chrome 扩展已配对，等待 ElevenReader 登录页产生认证信息。',
      suggestion: '请确认浏览器已打开 ElevenReader 并完成登录；扩展会自动导入 Refresh Token 或 Bearer Token。',
    };
  }

  return null;
}

const TTS_TEST_DISPATCHERS = {
  speechify: (config) => speechifyTTS.testConfiguration(config),
  elevenlabs: (config) => elevenLabsTTS.testConfiguration(config),
  mimo: (config) => mimoTTS.testConfiguration(config),
  fish: (config) => fishTTS.testConfiguration(config),
};

const TTS_VOICE_DISPATCHERS = {
  elevenlabs: (config) => elevenLabsTTS.getVoices(config),
  mimo: (config) => mimoTTS.getVoices(config),
  fish: (config) => fishTTS.getVoices(config),
};

function enqueueControl(task) {
  return ttsRequestQueue.enqueueControl(task);
}

function enqueueSynthesis(task) {
  return ttsRequestQueue.enqueueSynthesis(task);
}

function enqueueBackground(task) {
  return ttsRequestQueue.enqueueBackground(task);
}

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
      const result = await enqueueSynthesis(() => dispatcher(config));
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
      const result = await enqueueControl(() => dispatcher(config));
      return IPCResponse.success({ engine, ...result });
    } catch (error) {
      Logger.error('tts-ipc', `Failed to get voices for: ${engine}`, error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, engine));
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEST_SPEECHIFY_CONFIG, async (event, configOverride = {}) => {
    try {
      const result = await enqueueSynthesis(() => speechifyTTS.testConfiguration(configOverride));
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

  ipcMain.handle(IPC_CHANNELS.GET_AUTH_STATUS, (event, configOverride = {}) => {
    try {
      return IPCResponse.success({
        ...elevenLabsAuth.getAuthStatus(configOverride),
        browserAssist: elevenLabsBrowserAssist.getBrowserAssistStatus(),
        extensionBridge: elevenLabsExtensionBridge.getStatus(),
      });
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to get ElevenLabs auth status', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.BEGIN_BROWSER_ASSIST, () => {
    try {
      return IPCResponse.success(elevenLabsBrowserAssist.focusBrowserAssistWindow(), '已打开 ElevenReader 浏览器辅助窗口');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to open ElevenLabs browser assist', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.BEGIN_EXTENSION_BRIDGE_PAIRING, async () => {
    try {
      const status = await elevenLabsExtensionBridge.beginPairingSession();
      return IPCResponse.success(status, 'Chrome 扩展配对已开始');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to begin ElevenLabs extension bridge pairing', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.CHECK_EXTENSION_BRIDGE_IMPORT, async (event, configOverride = {}) => {
    try {
      await elevenLabsExtensionBridge.waitForValidation();
      const bridgeStatus = elevenLabsExtensionBridge.getStatus();
      const candidate = bridgeStatus?.candidate || {};
      const warning = buildExtensionBridgeWarning(bridgeStatus);
      const pending = ['pending', 'validating'].includes(candidate.state);
      const imported = {
        bearerToken: candidate.state === 'validated' && candidate.validationMode === 'bearer',
        refreshToken: candidate.state === 'validated' && candidate.validationMode === 'refresh',
        appCheckToken: candidate.state === 'validated' && Boolean(candidate.hasAppCheckToken),
        deviceId: candidate.state === 'validated' && Boolean(candidate.hasDeviceId),
      };

      return IPCResponse.success({
        imported,
        validationMode: candidate.validationMode || 'none',
        candidate,
        warning: candidate.state === 'validated' ? null : warning,
        pending,
        status: {
          ...elevenLabsAuth.getAuthStatus(configOverride),
          browserAssist: elevenLabsBrowserAssist.getBrowserAssistStatus(),
          extensionBridge: bridgeStatus,
        },
      }, imported.refreshToken
        ? '已从 Chrome 扩展导入并验证 Refresh Token'
        : imported.bearerToken
          ? '已从 Chrome 扩展导入并验证 Bearer 会话'
          : '已刷新 Chrome 扩展桥接状态');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to inspect ElevenLabs extension bridge import', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.CHECK_BROWSER_ASSIST_LOGIN, async (event, configOverride = {}, options = {}) => {
    const { background = false } = options;
    const enqueueLane = background ? enqueueBackground : enqueueControl;

    try {
      const browserData = await enqueueLane(() => elevenLabsBrowserAssist.inspectBrowserAssistLogin());
      const mergedAuthInput = {
        refreshToken: (configOverride?.refreshToken || '').trim() || browserData.refreshToken,
        appCheckToken: (configOverride?.appCheckToken || '').trim() || browserData.appCheckToken,
        deviceId: (configOverride?.deviceId || '').trim() || browserData.deviceId,
      };
      const imported = {
        bearerToken: false,
        refreshToken: false,
        appCheckToken: Boolean(browserData.appCheckToken),
        deviceId: Boolean(browserData.deviceId),
      };

      let validatedBearerToken = '';
      let validation = null;
      let validationMode = 'none';
      let validationError = null;

      if (browserData?.bearerToken && browserData?.bearer?.status === ELEVENLABS_BROWSER_ASSIST_BEARER_STATUS.TRUSTED) {
        try {
          validation = await enqueueLane(() => elevenLabsTTS.validateConfiguration({
            bearerToken: browserData.bearerToken,
            appCheckToken: mergedAuthInput.appCheckToken,
            deviceId: mergedAuthInput.deviceId,
          }));
          validatedBearerToken = browserData.bearerToken;
          validationMode = 'bearer';
          imported.bearerToken = true;
          elevenLabsBrowserAssist.updateBearerValidationResult(browserData.bearerToken, {
            validationStatus: ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION.VALIDATED,
            validationMessage: 'Bearer Token 已通过 Reader API 验证。',
          });
        } catch (error) {
          validationError = buildValidationError(error, 'ElevenLabs');
          elevenLabsBrowserAssist.updateBearerValidationResult(browserData.bearerToken, {
            validationStatus: ELEVENLABS_BROWSER_ASSIST_BEARER_VALIDATION.REJECTED,
            validationCode: validationError.authCode || '',
            validationMessage: validationError.message,
          });
        }
      }

      if (!validatedBearerToken && mergedAuthInput.refreshToken) {
        try {
          validation = await enqueueLane(() => elevenLabsAuth.validateRefreshToken(mergedAuthInput));
          validationMode = 'refresh';
          imported.refreshToken = Boolean(browserData.refreshToken);
        } catch (error) {
          validationError = validationError || buildValidationError(error, 'ElevenLabs');
        }
      }

      const warning = buildBrowserAssistWarning(elevenLabsBrowserAssist.getBrowserAssistStatus().lastInspection || browserData);
      const statusInput = {
        bearerToken: validatedBearerToken,
        refreshToken: validationMode === 'refresh' ? mergedAuthInput.refreshToken : '',
        appCheckToken: mergedAuthInput.appCheckToken,
        deviceId: mergedAuthInput.deviceId,
      };
      const pending = !validation && !imported.bearerToken && !imported.refreshToken;

      return IPCResponse.success({
        ...browserData,
        bearerToken: validatedBearerToken,
        refreshToken: imported.refreshToken ? mergedAuthInput.refreshToken : '',
        appCheckToken: mergedAuthInput.appCheckToken,
        deviceId: mergedAuthInput.deviceId,
        imported,
        validationMode,
        validation,
        validationError,
        warning,
        pending,
        status: {
          ...(validation?.status || elevenLabsAuth.getAuthStatus(statusInput)),
          browserAssist: elevenLabsBrowserAssist.getBrowserAssistStatus(),
          extensionBridge: elevenLabsExtensionBridge.getStatus(),
        },
      }, validationMode === 'bearer'
        ? '已从浏览器辅助窗口导入并验证 Bearer Token'
        : validationMode === 'refresh'
          ? '已从浏览器辅助窗口读取并验证辅助凭证'
          : '已更新浏览器辅助窗口状态');
    } catch (error) {
      if (background && /^browser_assist_/.test(error?.authCode || '')) {
        return IPCResponse.success({
          pending: true,
          status: {
            ...elevenLabsAuth.getAuthStatus(configOverride),
            browserAssist: elevenLabsBrowserAssist.getBrowserAssistStatus(),
          },
        }, '等待浏览器辅助窗口中的登录状态更新');
      }

      Logger.error('tts-ipc', 'Failed to inspect ElevenLabs browser assist login', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.VALIDATE_ELEVENLABS_CONFIG, async (event, configOverride = {}) => {
    try {
      const result = await enqueueControl(() => elevenLabsTTS.validateConfiguration(configOverride));
      return IPCResponse.success(result, 'ElevenLabs 凭证验证成功');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to validate ElevenLabs config', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.VALIDATE_REFRESH_TOKEN, async (event, configOverride = {}) => {
    try {
      const result = await enqueueControl(() => elevenLabsAuth.validateRefreshToken(configOverride));
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
      const audioUrl = await enqueueSynthesis(() => speechifyTTS.synthesizeSpeech(text, 'English', config));
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
      const result = await enqueueSynthesis(() => elevenLabsTTS.testConfiguration(configOverride));
      return IPCResponse.success(result, 'ElevenLabs 配置测试成功');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to test ElevenLabs config', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  // MiMo: Test configuration
  ipcMain.handle(IPC_CHANNELS.TEST_MIMO_CONFIG, async (event, configOverride = {}) => {
    try {
      const result = await enqueueSynthesis(() => mimoTTS.testConfiguration(configOverride));
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

  // Fish Audio: Test configuration
  ipcMain.handle(IPC_CHANNELS.TEST_FISH_CONFIG, async (event, configOverride = {}) => {
    try {
      const result = await enqueueSynthesis(() => fishTTS.testConfiguration(configOverride));
      return IPCResponse.success(result, 'Fish Audio 配置测试成功');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to test Fish Audio config', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'Fish Audio'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PREVIEW_FISH_VOICE, async (event, payload = {}) => {
    const { text = '', config = {} } = payload;

    try {
      const audioUrl = await enqueueSynthesis(() => fishTTS.synthesizeSpeech(text, 'English', config));
      return IPCResponse.success({
        provider: 'Fish Audio',
        audioUrl,
        meta: {
          model: config.model,
          referenceId: config.referenceId,
          responseFormat: config.responseFormat,
        },
      });
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to preview Fish Audio voice', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'Fish Audio'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PREVIEW_MIMO_VOICE, async (event, payload = {}) => {
    const { text = '', config = {} } = payload;

    try {
      const audioUrl = await enqueueSynthesis(() => mimoTTS.synthesizeSpeech(text, 'English', config));
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
      const audioUrl = await enqueueSynthesis(() => elevenLabsTTS.synthesizeSpeech(text, 'English', config, {
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
