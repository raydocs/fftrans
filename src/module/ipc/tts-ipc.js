'use strict';

const { ipcMain } = require('electron');
const { IPC_CHANNELS } = require('../../constants');
const configModule = require('../system/config-module');
const ttsRequestQueue = require('../system/tts-request-queue');
const speechifyTTS = require('../translator/speechify-tts');
const elevenLabsTTS = require('../translator/elevenlabs-tts');
const elevenLabsAuth = require('../translator/elevenlabs-auth');
const elevenLabsBrowserAssist = require('../system/elevenlabs-browser-assist');
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

function setTTSChannel() {
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

  ipcMain.handle(IPC_CHANNELS.GET_AUTH_STATUS, (event, configOverride = {}) => {
    try {
      return IPCResponse.success({
        ...elevenLabsAuth.getAuthStatus(configOverride),
        browserAssist: elevenLabsBrowserAssist.getBrowserAssistStatus(),
      });
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to get ElevenLabs auth status', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.BEGIN_BROWSER_ASSIST, () => {
    try {
      return IPCResponse.success(elevenLabsBrowserAssist.focusBrowserAssistWindow(), '已打开 ElevenLabs 浏览器辅助窗口');
    } catch (error) {
      Logger.error('tts-ipc', 'Failed to open ElevenLabs browser assist', error);
      return IPCResponse.error(error, error.message, buildErrorDetails(error, 'ElevenLabs'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.CHECK_BROWSER_ASSIST_LOGIN, async (event, configOverride = {}, options = {}) => {
    const { background = false } = options;

    try {
      const browserData = await ttsRequestQueue.enqueue(() => elevenLabsBrowserAssist.inspectBrowserAssistLogin());
      const fallbackRefreshToken = (configOverride?.refreshToken || '').trim();
      const mergedAuthInput = {
        refreshToken: browserData.refreshToken || fallbackRefreshToken,
        appCheckToken: browserData.appCheckToken || (configOverride?.appCheckToken || '').trim(),
        deviceId: browserData.deviceId || (configOverride?.deviceId || '').trim(),
      };

      let validation = null;
      let validationError = null;

      if (mergedAuthInput.refreshToken) {
        try {
          validation = await ttsRequestQueue.enqueue(() => elevenLabsAuth.validateRefreshToken(mergedAuthInput));
        } catch (error) {
          validationError = {
            message: error.message,
            ...buildErrorDetails(error, 'ElevenLabs'),
          };
        }
      }

      return IPCResponse.success({
        ...browserData,
        ...mergedAuthInput,
        imported: {
          refreshToken: Boolean(browserData.refreshToken),
          appCheckToken: Boolean(browserData.appCheckToken),
          deviceId: Boolean(browserData.deviceId),
        },
        validation,
        validationError,
        status: {
          ...(validation?.status || elevenLabsAuth.getAuthStatus(mergedAuthInput)),
          browserAssist: elevenLabsBrowserAssist.getBrowserAssistStatus(),
        },
      }, validation && !validationError ? '已从浏览器辅助窗口导入并验证登录' : '已从浏览器辅助窗口读取辅助凭证');
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
