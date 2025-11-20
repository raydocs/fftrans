'use strict';

const { ipcMain } = require('electron');
const configModule = require('../system/config-module');
const speechifyTTS = require('../translator/speechify-tts');

function setTTSChannel() {
    // Test Speechify configuration
    ipcMain.handle('test-speechify-config', async () => {
        try {
            const result = await speechifyTTS.testConfiguration();
            return result;
        } catch (error) {
            return {
                success: false,
                message: error.message,
                error: error.toString(),
            };
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
            return {
                success: true,
                audioUrl: audioUrl
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
                error: error.toString()
            };
        }
    });

    // Test ElevenLabs configuration
    ipcMain.handle('test-elevenlabs-config', async () => {
        try {
            const elevenLabsTTS = require('../translator/elevenlabs-tts');
            const result = await elevenLabsTTS.testConfiguration();
            return result;
        } catch (error) {
            return {
                success: false,
                message: error.message,
                error: error.toString(),
            };
        }
    });

    // Preview ElevenLabs voice
    ipcMain.handle('preview-elevenlabs-voice', async (event, { text, config }) => {
        try {
            const elevenLabsTTS = require('../translator/elevenlabs-tts');
            const audioUrl = await elevenLabsTTS.synthesizeSpeech(text, 'en', config);
            return {
                success: true,
                audioUrl: audioUrl
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
                error: error.toString()
            };
        }
    });
}

module.exports = {
    setTTSChannel,
};
