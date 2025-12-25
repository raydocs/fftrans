'use strict';

const { ipcMain } = require('electron');
const engineModule = require('../system/engine-module');
const translateModule = require('../system/translate-module');
const configModule = require('../system/config-module');
const googleTTS = require('../translator/google-tts');
const speechifyTTS = require('../translator/speechify-tts');
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
    ipcMain.handle('get-engine-select', () => {
        return engineModule.getEngineSelect();
    });

    // get all language select
    ipcMain.handle('get-all-language-select', () => {
        return engineModule.getAllLanguageSelect();
    });

    // get source select
    ipcMain.handle('get-source-select', () => {
        return engineModule.getSourceSelect();
    });

    // get source select
    ipcMain.handle('get-player-source-select', () => {
        return engineModule.getPlayerSourceSelect();
    });

    // get target select
    ipcMain.handle('get-target-select', () => {
        return engineModule.getTargetSelect();
    });

    // get UI select
    ipcMain.handle('get-ui-select', () => {
        return engineModule.getUISelect();
    });

    // get AI list
    ipcMain.handle('get-ai-list', () => {
        return engineModule.aiList;
    });

    ipcMain.handle('test-ai-translation', async (event, engine) => {
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
    ipcMain.on('add-task', (event, dialogData) => {
        addTask(dialogData);
    });

    // get translation
    ipcMain.on('translate-text', async (event, dialogData) => {
        event.sender.send('show-translation', await translateModule.translate(dialogData.text, dialogData.translation), dialogData.translation.to);
    });

    // get translation with streaming (for OpenRouter, GPT, Gemini)
    ipcMain.on('translate-text-stream', async (event, dialogData) => {
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
                            event.sender.send('translation-chunk', chunk, dialogData.translation.to);
                        }
                    }
                );

                // Send final result (ensure last chunk is sent)
                if (lastChunk && Date.now() - lastUpdate <= THROTTLE_MS) {
                    event.sender.send('translation-chunk', lastChunk, dialogData.translation.to);
                }
                event.sender.send('show-translation', result, dialogData.translation.to);
            } else {
                // Fall back to regular translation
                const result = await translateModule.translate(dialogData.text, dialogData.translation);
                event.sender.send('show-translation', result, dialogData.translation.to);
            }
        } catch (error) {
            console.error('Streaming translation error:', error);
            event.sender.send('show-translation', String(error), dialogData.translation.to);
        }
    });

    // TTS Rate Limiter
    const PromiseQueue = require('../../utils/promise-queue');
    const ttsQueue = new PromiseQueue(2); // Max 2 concurrent TTS requests

    // google tts
    ipcMain.handle('google-tts', (event, text, from) => {
        return ttsQueue.add(() => googleTTS.getAudioUrl(text, from));
    });

    // elevenlabs tts
    ipcMain.handle('elevenlabs-tts', async (event, text, from) => {
        const elevenLabsTTS = require('../translator/elevenlabs-tts');
        return ttsQueue.add(() => elevenLabsTTS.getAudioUrl(text, from));
    });

    // speechify tts
    ipcMain.handle('speechify-tts', async (event, text, from) => {
        return ttsQueue.add(() => speechifyTTS.getAudioUrl(text, from));
    });

    // translation cache statistics
    ipcMain.handle('cache-get-stats', () => {
        return translateModule.translationCache.getStats();
    });

    // clear translation cache
    ipcMain.handle('cache-clear', () => {
        translateModule.translationCache.clear();
        return { success: true };
    });

    // reset cache statistics
    ipcMain.handle('cache-reset-stats', () => {
        translateModule.translationCache.resetStats();
        return { success: true };
    });
}

module.exports = {
    setTranslateChannel,
};
