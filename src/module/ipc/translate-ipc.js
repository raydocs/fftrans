'use strict';

const { ipcMain } = require('electron');
const { IPC_CHANNELS } = require('../../constants');
const engineModule = require('../system/engine-module');
const translateModule = require('../system/translate-module');
const configModule = require('../system/config-module');
const ttsRequestQueue = require('../system/tts-request-queue');
const googleTTS = require('../translator/google-tts');
const speechifyTTS = require('../translator/speechify-tts');
const mimoTTS = require('../translator/mimo-tts');
const Logger = require('../../utils/logger');
const { addTask } = require('../fix/fix-entry');

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        )
    ]);
}

function setTranslateChannel() {
    // get engine select
    ipcMain.handle(IPC_CHANNELS.GET_ENGINE_SELECT, () => {
        return engineModule.getEngineSelect();
    });

    // get all language select
    ipcMain.handle(IPC_CHANNELS.GET_ALL_LANGUAGE_SELECT, () => {
        return engineModule.getAllLanguageSelect();
    });

    // get source select
    ipcMain.handle(IPC_CHANNELS.GET_SOURCE_SELECT, () => {
        return engineModule.getSourceSelect();
    });

    // get source select
    ipcMain.handle(IPC_CHANNELS.GET_PLAYER_SOURCE_SELECT, () => {
        return engineModule.getPlayerSourceSelect();
    });

    // get target select
    ipcMain.handle(IPC_CHANNELS.GET_TARGET_SELECT, () => {
        return engineModule.getTargetSelect();
    });

    // get UI select
    ipcMain.handle(IPC_CHANNELS.GET_UI_SELECT, () => {
        return engineModule.getUISelect();
    });

    // get AI list
    ipcMain.handle(IPC_CHANNELS.GET_AI_LIST, () => {
        return engineModule.aiList;
    });

    ipcMain.handle(IPC_CHANNELS.TEST_AI_TRANSLATION, async (event, engine) => {
        const engineName = typeof engine === 'string' ? engine.trim() : '';
        if (!engineName || !engineModule.aiList.includes(engineName)) {
            return { success: false, message: 'Invalid AI engine' };
        }

        const config = configModule.getConfig();
        const apiConfig = config.api || {};
        let missingMessage = '';

        switch (engineName) {
            case 'OpenRouter':
                if (!apiConfig.openRouterApiKey) missingMessage = 'OpenRouter API Key 未设置';
                break;
            case 'GPT':
                if (!apiConfig.gptApiKey) missingMessage = 'OpenAI API Key 未设置';
                break;
            case 'Gemini':
                if (!apiConfig.geminiApiKey) missingMessage = 'Gemini API Key 未设置';
                break;
            case 'Cohere':
                if (!apiConfig.cohereToken) missingMessage = 'Cohere API Token 未设置';
                break;
            case 'Kimi':
                if (!apiConfig.kimiToken) missingMessage = 'Kimi API Token 未设置';
                break;
            case 'LLM-API':
                if (!apiConfig.llmApiUrl) missingMessage = 'LLM API URL 未设置';
                else if (!apiConfig.llmApiKey) missingMessage = 'LLM API Key 未设置';
                break;
            default:
                break;
        }

        if (missingMessage) {
            return { success: false, message: missingMessage };
        }

        const from = config.translation?.from || 'English';
        let to = config.translation?.to || 'Simplified-Chinese';
        if (from === to) {
            to = from === 'English' ? 'Simplified-Chinese' : 'English';
        }

        const translation = {
            ...config.translation,
            engine: engineName,
            engineAlternate: engineName,
            autoChange: false,
            from,
            to,
        };

        const sampleText = 'hi';
        const startTime = Date.now();
        const configTimeout = parseInt(config.translation?.timeout, 10);
        const timeoutMs = Math.max(30000, Number.isNaN(configTimeout) ? 30000 : configTimeout * 1000);

        try {
            const result = await withTimeout(
                translateModule.translate(sampleText, translation, [], 'sentence'),
                timeoutMs,
                'AI translation test'
            );
            const durationMs = Date.now() - startTime;

            if (typeof result !== 'string' || result.trim().length === 0) {
                return { success: false, message: 'Empty response from translation' };
            }

            return {
                success: true,
                engine: engineName,
                durationMs,
                result,
            };
        } catch (error) {
            return { success: false, message: error.message || String(error) };
        }
    });

    // add task
    ipcMain.on(IPC_CHANNELS.ADD_TASK, (event, dialogData) => {
        addTask(dialogData);
    });

    // get translation
    ipcMain.on(IPC_CHANNELS.TRANSLATE_TEXT, async (event, dialogData) => {
        event.sender.send(IPC_CHANNELS.SHOW_TRANSLATION, await translateModule.translate(dialogData.text, dialogData.translation), dialogData.translation.to);
    });

    // get translation with streaming (for OpenRouter, GPT, Gemini)
    ipcMain.on(IPC_CHANNELS.TRANSLATE_TEXT_STREAM, async (event, dialogData) => {
        try {
            const config = configModule.getConfig();

            // Check if streaming is enabled and engine supports it
            const streamingSupportedEngines = ['OpenRouter', 'GPT', 'Gemini'];
            const useStreaming = config.ai?.useStreaming !== false && streamingSupportedEngines.includes(dialogData.translation.engine);

            if (useStreaming) {
                // Throttle streaming updates to reduce IPC overhead
                let lastUpdate = 0;
                let lastChunk = '';
                const THROTTLE_MS = 50;

                // Use streaming translation with throttled real-time updates
                const result = await translateModule.translateStream(
                    dialogData.text,
                    dialogData.translation,
                    dialogData.table || [],
                    dialogData.type || 'sentence',
                    (chunk) => {
                        lastChunk = chunk;
                        const now = Date.now();

                        // Only send update if throttle period has passed
                        if (now - lastUpdate > THROTTLE_MS) {
                            lastUpdate = now;
                            event.sender.send(IPC_CHANNELS.TRANSLATION_CHUNK, chunk, dialogData.translation.to);
                        }
                    }
                );

                // Send final result (ensure last chunk is sent)
                if (lastChunk && Date.now() - lastUpdate <= THROTTLE_MS) {
                    event.sender.send(IPC_CHANNELS.TRANSLATION_CHUNK, lastChunk, dialogData.translation.to);
                }
                event.sender.send(IPC_CHANNELS.SHOW_TRANSLATION, result, dialogData.translation.to);
            } else {
                // Fall back to regular translation
                const result = await translateModule.translate(dialogData.text, dialogData.translation);
                event.sender.send(IPC_CHANNELS.SHOW_TRANSLATION, result, dialogData.translation.to);
            }
        } catch (error) {
            console.error('Streaming translation error:', error);
            event.sender.send(IPC_CHANNELS.SHOW_TRANSLATION, String(error), dialogData.translation.to);
        }
    });

    // google tts
    ipcMain.handle(IPC_CHANNELS.GOOGLE_TTS, (event, text, from) => {
        return googleTTS.getAudioUrl(text, from);
    });

    // elevenlabs tts
    ipcMain.handle(IPC_CHANNELS.ELEVENLABS_TTS, async (event, text, from) => {
        const elevenLabsTTS = require('../translator/elevenlabs-tts');
        try {
            return await ttsRequestQueue.enqueue(() => elevenLabsTTS.getAudioUrl(text, from));
        } catch (error) {
            Logger.error('translate-ipc', 'Failed to generate ElevenLabs audio', error);
            throw error;
        }
    });

    // speechify tts
    ipcMain.handle(IPC_CHANNELS.SPEECHIFY_TTS, async (event, text, from) => {
        try {
            return await ttsRequestQueue.enqueue(() => speechifyTTS.getAudioUrl(text, from));
        } catch (error) {
            Logger.error('translate-ipc', 'Failed to generate Speechify audio', error);
            throw error;
        }
    });

    // mimo tts
    ipcMain.handle(IPC_CHANNELS.MIMO_TTS, async (event, text, from) => {
        try {
            return await ttsRequestQueue.enqueue(() => mimoTTS.getAudioUrl(text, from));
        } catch (error) {
            Logger.error('translate-ipc', 'Failed to generate MiMo audio', error);
            throw error;
        }
    });

    // translation cache statistics
    ipcMain.handle(IPC_CHANNELS.CACHE_GET_STATS, () => {
        return translateModule.translationCache.getStats();
    });

    // clear translation cache
    ipcMain.handle(IPC_CHANNELS.CACHE_CLEAR, () => {
        translateModule.translationCache.clear();
        return { success: true };
    });

    // reset cache statistics
    ipcMain.handle(IPC_CHANNELS.CACHE_RESET_STATS, () => {
        translateModule.translationCache.resetStats();
        return { success: true };
    });
}

module.exports = {
    setTranslateChannel,
};
