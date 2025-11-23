'use strict';

const { ipcMain } = require('electron');
const configModule = require('../system/config-module');
const speechifyTTS = require('../translator/speechify-tts');
const elevenLabsTTS = require('../translator/elevenlabs-tts');
const { IPCResponse } = require('../../utils/ipc-response');
const Logger = require('../../utils/logger');

function setTTSChannel() {
    // Test Speechify configuration
    ipcMain.handle('test-speechify-config', async () => {
        try {
            const result = await speechifyTTS.testConfiguration();
            return IPCResponse.success(result);
        } catch (error) {
            Logger.error('tts-ipc', 'Failed to test Speechify config', error);
            return IPCResponse.error(error);
        }
    });

    // Get Speechify configuration
    ipcMain.handle('get-speechify-config', () => {
        const config = configModule.getConfig();
        return config.api.speechify || {};
    });

    // Set Speechify configuration
    ipcMain.handle('set-speechify-config', (event, speechifyConfig) => {
        const config = configModule.getConfig();
        config.api.speechify = {
            ...config.api.speechify,
            ...speechifyConfig,
        };
        configModule.setConfig(config);
        return { success: true };
    });

    // Get TTS engine
    ipcMain.handle('get-tts-engine', () => {
        const config = configModule.getConfig();
        return config.indexWindow.ttsEngine || 'google';
    });

    // Set TTS engine
    ipcMain.handle('set-tts-engine', (event, engine) => {
        const config = configModule.getConfig();
        config.indexWindow.ttsEngine = engine;
        configModule.setConfig(config);
        return { success: true };
    });

    // Preview Speechify voice
    ipcMain.handle('preview-speechify-voice', async (event, { text, config }) => {
        try {
            const audioUrl = await speechifyTTS.synthesizeSpeech(text, 'en', config);
            return IPCResponse.success({ audioUrl });
        } catch (error) {
            Logger.error('tts-ipc', 'Failed to preview Speechify voice', error);
            return IPCResponse.error(error);
        }
    });

    // Test ElevenLabs configuration
    ipcMain.handle('test-elevenlabs-config', async () => {
        try {
            const result = await elevenLabsTTS.testConfiguration();
            return IPCResponse.success(result);
        } catch (error) {
            Logger.error('tts-ipc', 'Failed to test ElevenLabs config', error);
            return IPCResponse.error(error);
        }
    });

    // Preview ElevenLabs voice
    ipcMain.handle('preview-elevenlabs-voice', async (event, { text, config }) => {
        try {
            const audioUrl = await elevenLabsTTS.synthesizeSpeech(text, 'en', config);
            return IPCResponse.success({ audioUrl });
        } catch (error) {
            Logger.error('tts-ipc', 'Failed to preview ElevenLabs voice', error);
            return IPCResponse.error(error);
        }
    });
}

module.exports = {
    setTTSChannel,
};
