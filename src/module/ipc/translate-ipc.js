'use strict';

const { ipcMain } = require('electron');
const { IPC_CHANNELS } = require('../../constants');
const engineModule = require('../system/engine-module');
const translateModule = require('../system/translate-module');
const configModule = require('../system/config-module');
const ttsService = require('../system/tts-service');
const requestModule = require('../system/request-module');
const fileModule = require('../system/file-module');
const Logger = require('../../utils/logger');

// 引擎 → 当前模型名
function getEngineModel(config, engine) {
  const a = config.api || {};
  return {
    Gemini: a.geminiModel, GPT: a.gptModel, Kimi: a.kimiModel,
    OpenRouter: a.openRouterModel, NVIDIA: a.nvidiaModel, 'LLM-API': a.llmApiModel,
  }[engine] || '';
}

// 把测试结果追加到延迟记录文件，方便日后查看
function appendLatencyLog(engine, model, durationMs, ok, note = '') {
  try {
    const p = fileModule.getUserDataPath('config', 'latency-test-log.txt');
    const line = `${new Date().toISOString()} | ${engine} | ${model || '-'} | ${ok ? durationMs + 'ms' : 'FAIL'} | ${ok ? (note || 'OK') : note}`.trim();
    fileModule.appendFileAsync ? fileModule.appendFileAsync(p, line + '\n') : require('fs').appendFileSync(p, line + '\n');
  } catch (error) {
    Logger.warn('translate-ipc', 'appendLatencyLog failed', error.message);
  }
}
const { addTask } = require('../fix/fix-entry');

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        )
    ]);
}

function safeSendTtsEvent(webContents, channel, payload) {
    try {
        if (!webContents || typeof webContents.isDestroyed !== 'function' || webContents.isDestroyed()) {
            return false;
        }

        webContents.send(channel, payload);
        return true;
    } catch (error) {
        Logger.warn('translate-ipc', `Failed to send TTS event: ${channel}`, error);
        return false;
    }
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

    ipcMain.handle(IPC_CHANNELS.TEST_AI_TRANSLATION, async (event, engine, sampleTextArg) => {
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
            case 'NVIDIA':
                if (!apiConfig.nvidiaApiKey) missingMessage = 'NVIDIA API Key 未设置';
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
            skipCache: true, // 测试连接测真实延迟，不走缓存
        };

        const sampleText = (typeof sampleTextArg === 'string' && sampleTextArg.trim())
            ? sampleTextArg.trim()
            : 'The adventurer arrived at the ancient ruins as dusk fell.';
        const startTime = Date.now();
        const configTimeout = parseInt(config.translation?.timeout, 10);
        const timeoutMs = Math.max(30000, Number.isNaN(configTimeout) ? 30000 : configTimeout * 1000);

        // 支持流式的引擎按「首字延迟」计时，反映实际游戏中看到第一个字的速度
        const streamingSupportedEngines = ['OpenRouter', 'GPT', 'Gemini', 'LLM-API'];
        const useStreaming = config.ai?.useStreaming !== false && streamingSupportedEngines.includes(engineName);

        try {
            let firstChunkMs = null;
            const result = await withTimeout(
                useStreaming
                    ? translateModule.translateStream(sampleText, translation, [], 'sentence', () => {
                        if (firstChunkMs === null) firstChunkMs = Date.now() - startTime;
                    })
                    : translateModule.translate(sampleText, translation, [], 'sentence'),
                timeoutMs,
                'AI translation test'
            );
            const totalMs = Date.now() - startTime;
            // 流式：优先报首字延迟；非流式：总耗时
            const durationMs = (useStreaming && firstChunkMs !== null) ? firstChunkMs : totalMs;
            const model = getEngineModel(config, engineName);

            if (typeof result !== 'string' || result.trim().length === 0) {
                appendLatencyLog(engineName, model, durationMs, false, 'empty response');
                return { success: false, message: 'Empty response from translation' };
            }

            // 引擎失败时可能把错误文本当译文返回，识别后判为失败，避免误标为最快
            if (/^(assistant\s+)?error[:：]|translation failed/i.test(result.trim())) {
                appendLatencyLog(engineName, model, durationMs, false, result.trim().slice(0, 60));
                return { success: false, message: result.trim() };
            }

            appendLatencyLog(engineName, model, durationMs, true, useStreaming ? `首字${durationMs}ms 全句${totalMs}ms` : '');
            return {
                success: true,
                engine: engineName,
                model,
                durationMs,
                totalMs,
                streaming: useStreaming,
                result,
            };
        } catch (error) {
            appendLatencyLog(engineName, getEngineModel(config, engineName), 0, false, error.message || String(error));
            return { success: false, message: error.message || String(error) };
        }
    });

    // 自定义 LLM API：拉取可用模型列表（GET {base}/models）
    ipcMain.handle(IPC_CHANNELS.GET_LLM_MODELS, async (event, override = {}) => {
        const config = configModule.getConfig();
        const rawUrl = (typeof override.url === 'string' && override.url.trim()) ? override.url.trim() : (config.api?.llmApiUrl || '');
        const key = (typeof override.key === 'string' && override.key.trim()) ? override.key.trim() : (config.api?.llmApiKey || '');
        if (!rawUrl) {
            return { success: false, message: '请先填写 API URL' };
        }

        // 由 base / 完整端点推出 /models 地址
        const base = rawUrl.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
        const modelsUrl = `${base}/models`;

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (key) headers.Authorization = `Bearer ${key}`;
            const response = await withTimeout(requestModule.get(modelsUrl, headers), 15000, 'Get LLM models');
            const data = response?.data;
            const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : (Array.isArray(data) ? data : []));
            const models = list.map((m) => (typeof m === 'string' ? m : (m?.id || m?.name || ''))).filter(Boolean);
            return { success: true, models, url: modelsUrl };
        } catch (error) {
            return { success: false, message: `${error?.response?.status ? `HTTP ${error.response.status} ` : ''}${error?.message || String(error)}`, url: modelsUrl };
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
            const streamingSupportedEngines = ['OpenRouter', 'GPT', 'Gemini', 'LLM-API'];
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

    // 通用朗读（字典/编辑窗口）：用用户选定的 TTS 引擎（Google TTS 已移除）
    ipcMain.handle(IPC_CHANNELS.GOOGLE_TTS, async (event, text, from) => {
        try {
            return await ttsService.getConfiguredAudioUrl(text, from);
        } catch (error) {
            Logger.error('translate-ipc', 'Failed to generate TTS audio', error);
            return [];
        }
    });

    // elevenlabs tts
    ipcMain.handle(IPC_CHANNELS.ELEVENLABS_TTS, async (event, text, from) => {
        try {
            return await ttsService.getAudioUrlForEngine('elevenlabs', text, from);
        } catch (error) {
            Logger.error('translate-ipc', 'Failed to generate ElevenLabs audio', error);
            throw error;
        }
    });

    ipcMain.handle(IPC_CHANNELS.ELEVENLABS_TTS_PROGRESSIVE, async (event, payload = {}) => {
        const {
            requestId = `elevenlabs-${Date.now()}`,
            text = '',
            from = 'English',
        } = payload;
        const webContents = event.sender;

        void (async () => {
            try {
                const result = await ttsService.getAudioUrlProgressiveForEngine('elevenlabs', text, from, {
                    onChunk: ({ chunkIndex, totalChunks, text: chunkText, audioUrl }) => {
                        safeSendTtsEvent(webContents, IPC_CHANNELS.ELEVENLABS_TTS_PROGRESSIVE_CHUNK, {
                            requestId,
                            chunkIndex,
                            totalChunks,
                            text: chunkText,
                            audioUrl,
                        });
                    },
                });

                safeSendTtsEvent(webContents, IPC_CHANNELS.ELEVENLABS_TTS_PROGRESSIVE_COMPLETE, {
                    requestId,
                    totalChunks: result.totalChunks,
                    urls: result.urls,
                    failureCount: Array.isArray(result.failures) ? result.failures.length : 0,
                    failedChunkIndexes: Array.isArray(result.failures)
                        ? result.failures.map((failure) => failure.chunkIndex)
                        : [],
                });
            } catch (error) {
                Logger.error('translate-ipc', 'Failed to stream ElevenLabs audio', error);
                safeSendTtsEvent(webContents, IPC_CHANNELS.ELEVENLABS_TTS_PROGRESSIVE_ERROR, {
                    requestId,
                    message: error?.message || 'ElevenLabs TTS progressive request failed',
                    failureCount: Array.isArray(error?.failures) ? error.failures.length : 0,
                    failedChunkIndexes: Array.isArray(error?.failures)
                        ? error.failures.map((failure) => failure.chunkIndex)
                        : [],
                });
            }
        })();

        return {
            success: true,
            requestId,
        };
    });

    // speechify tts
    ipcMain.handle(IPC_CHANNELS.SPEECHIFY_TTS, async (event, text, from) => {
        try {
            return await ttsService.getAudioUrlForEngine('speechify', text, from);
        } catch (error) {
            Logger.error('translate-ipc', 'Failed to generate Speechify audio', error);
            throw error;
        }
    });

    // mimo tts
    ipcMain.handle(IPC_CHANNELS.MIMO_TTS, async (event, text, from) => {
        try {
            return await ttsService.getAudioUrlForEngine('mimo', text, from);
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
