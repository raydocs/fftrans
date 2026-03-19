'use strict';

const { ipcMain } = require('electron');
const { IPC_CHANNELS } = require('../../constants');
const configModule = require('../system/config-module');
const ttsRequestQueue = require('../system/tts-request-queue');
const speechifyTTS = require('../translator/speechify-tts');
const elevenLabsTTS = require('../translator/elevenlabs-tts');
const { IPCResponse } = require('../../utils/ipc-response');
const Logger = require('../../utils/logger');

function buildErrorDetails(error, provider) {
  return {
    provider,
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
      const audioUrl = await ttsRequestQueue.enqueue(() => elevenLabsTTS.synthesizeSpeech(text, 'English', config, { persistTokens: false }));
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
