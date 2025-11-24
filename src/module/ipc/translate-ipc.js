'use strict';

const { ipcMain } = require('electron');
const engineModule = require('../system/engine-module');
const translateModule = require('../system/translate-module');
const configModule = require('../system/config-module');
const googleTTS = require('../translator/google-tts');
const speechifyTTS = require('../translator/speechify-tts');
const { addTask } = require('../fix/fix-entry');

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
                // Use streaming translation with real-time updates
                const result = await translateModule.translateStream(
                    dialogData.text,
                    dialogData.translation,
                    dialogData.table || [],
                    dialogData.type || 'sentence',
                    (chunk) => {
                        // Send each chunk as it arrives
                        event.sender.send('translation-chunk', chunk, dialogData.translation.to);
                    }
                );

                // Send final result
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
