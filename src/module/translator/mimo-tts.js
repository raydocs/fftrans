'use strict';

const axios = require('axios');
const configModule = require('../system/config-module');
const requestModule = require('../system/request-module');
const { globalTTSAudioCache } = require('../system/tts-audio-cache');
const Logger = require('../../utils/logger');
const { splitText } = require('../../utils/text-splitter');
const { retryWithBackoff, isTransientError } = require('../../utils/retry');
const PromiseQueue = require('../../utils/promise-queue');

// MiMo v2.5 采用 OpenAI 兼容的 chat/completions 接口（旧的 /v1/audio/speech 已随 V2 于 2026-06-30 下线）
const MIMO_API_URL = 'https://api.xiaomimimo.com/v1/chat/completions';
// v2.5 支持 wav / pcm16；pcm16 为裸流用于拼接，无法直接播放，本应用只用 wav
const SUPPORTED_AUDIO_FORMATS = ['wav'];
const SUPPORTED_MODELS = ['mimo-v2.5-tts', 'mimo-v2.5-tts-voiceclone'];
const DEFAULT_MODEL = 'mimo-v2.5-tts';
const DEFAULT_VOICE = 'mimo_default';
const SYNTHESIS_CONCURRENCY = 1;

function getMergedConfig(configOverride = null) {
  const config = configModule.getConfig();
  return {
    ...(config.api.mimo || {}),
    ...(configOverride || {}),
  };
}

function normalizeMiMoConfig(configOverride = null) {
  const mergedConfig = getMergedConfig(configOverride);
  const responseFormat = SUPPORTED_AUDIO_FORMATS.includes(mergedConfig.responseFormat) ? mergedConfig.responseFormat : 'wav';
  const model = SUPPORTED_MODELS.includes(mergedConfig.model) ? mergedConfig.model : DEFAULT_MODEL;

  return {
    apiKey: (mergedConfig.apiKey || '').trim(),
    model,
    // 预设音色名，或克隆时的参考音频 data URL（data:audio/...;base64,...）
    voice: (mergedConfig.voice || '').trim() || DEFAULT_VOICE,
    responseFormat,
    // v2.5 用自然语言描述控制风格/情感/语言，写入 user message
    styleInstructions: (mergedConfig.styleInstructions || '').trim(),
  };
}

function isRetryableTtsError(error) {
  if (typeof error?.retryable === 'boolean') {
    return error.retryable;
  }

  return isTransientError(error || {});
}

function buildMiMoError(error, overrides = {}) {
  const statusCode = overrides.statusCode || error?.statusCode || error?.response?.status;
  const retryable = typeof overrides.retryable === 'boolean' ? overrides.retryable : isRetryableTtsError(error);

  let message = overrides.message || error?.message || 'MiMo TTS 请求失败';
  let suggestion = overrides.suggestion || '请检查 MiMo 配置后重试';

  if (statusCode === 401 || statusCode === 403) {
    message = overrides.message || 'MiMo 认证失败';
    suggestion = overrides.suggestion || '请检查 MiMo API Key 是否正确';
  } else if (statusCode === 400 || statusCode === 422) {
    message = overrides.message || 'MiMo 请求参数无效';
    suggestion = overrides.suggestion || '请检查模型名称、音色等参数是否正确';
  } else if (statusCode === 429) {
    message = overrides.message || 'MiMo 请求过于频繁';
    suggestion = overrides.suggestion || '请稍后重试，或降低连续朗读频率';
  } else if (statusCode >= 500) {
    message = overrides.message || 'MiMo 服务暂时不可用';
    suggestion = overrides.suggestion || '请稍后再试';
  } else if (error?.code === 'ECONNABORTED') {
    message = overrides.message || 'MiMo 请求超时';
    suggestion = overrides.suggestion || '请检查网络或代理设置后重试';
  }

  const normalizedError = new Error(message);
  normalizedError.provider = 'MiMo';
  normalizedError.statusCode = statusCode;
  normalizedError.status = statusCode;
  normalizedError.retryable = retryable;
  normalizedError.suggestion = suggestion;
  normalizedError.cause = error;
  return normalizedError;
}

function buildMiMoCacheKey(text = '', config = {}) {
  return [
    'mimo',
    config.model || DEFAULT_MODEL,
    config.voice || DEFAULT_VOICE,
    config.responseFormat || 'wav',
    config.styleInstructions || '',
    (text || '').trim(),
  ].join(':');
}

function convertBinaryToDataUrl(base64Audio, format = 'wav') {
  const mimeType = {
    wav: 'audio/wav',
    pcm16: 'audio/wav',
  }[format] || 'audio/wav';
  return `data:${mimeType};base64,${base64Audio}`;
}

function extractAudioBase64(response) {
  const message = response?.data?.choices?.[0]?.message;
  const data = message?.audio?.data;
  return typeof data === 'string' && data.length > 0 ? data : '';
}

async function synthesizeSpeech(text, language, config) {
  const resolvedConfig = normalizeMiMoConfig(config);
  const { apiKey, model, voice, responseFormat, styleInstructions } = resolvedConfig;

  if (!text || text.trim() === '') {
    throw buildMiMoError(new Error('Text is required'), {
      message: '缺少要朗读的文本',
      retryable: false,
      suggestion: '请传入非空文本后重试',
    });
  }

  if (!apiKey) {
    throw buildMiMoError(new Error('Missing API key'), {
      message: '缺少 MiMo API Key',
      retryable: false,
      suggestion: '请先在设置中填写 MiMo API Key',
    });
  }

  try {
    const messages = [
      {
        role: 'user',
        // 风格描述为空时给一个中性指令，保持 messages 结构完整
        content: styleInstructions || 'Read the following text naturally.',
      },
      {
        role: 'assistant',
        content: text.trim(),
      },
    ];

    const payload = {
      model,
      messages,
      audio: {
        format: responseFormat,
        voice,
      },
      stream: false,
    };

    const headers = {
      // 官方要求 api-key；同时附带 Authorization 以兼容 OpenAI 风格网关
      'api-key': apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const response = await axios.post(
      MIMO_API_URL,
      payload,
      requestModule.buildAxiosConfig({
        headers,
        timeoutMs: 30000,
        transportProfile: requestModule.TRANSPORT_PROFILES.TTS,
      })
    );

    const base64Audio = extractAudioBase64(response);
    if (!base64Audio) {
      throw buildMiMoError(new Error('Empty audio in response'), {
        message: 'MiMo 未返回音频数据',
        suggestion: '请检查音色与模型是否匹配后重试',
      });
    }

    return convertBinaryToDataUrl(base64Audio, responseFormat);
  } catch (error) {
    if (error?.provider === 'MiMo') {
      throw error;
    }

    let errorMessage = '';
    if (error?.response?.data) {
      try {
        const errorBody = Buffer.isBuffer(error.response.data)
          ? JSON.parse(Buffer.from(error.response.data).toString('utf-8'))
          : error.response.data;
        errorMessage = errorBody?.error?.message || errorBody?.message || '';
        if (typeof errorMessage !== 'string') {
          errorMessage = JSON.stringify(errorMessage);
        }
      } catch {
        // ignore parse errors
      }
    }

    throw buildMiMoError(error, errorMessage ? { message: `MiMo: ${errorMessage}` } : {});
  }
}

async function synthesizeSpeechWithRetry(text, language, config, chunkIndex = 0, options = {}) {
  const cacheKey = buildMiMoCacheKey(text, config);
  const { useCache = true } = options;

  return globalTTSAudioCache.getOrCreate(
    cacheKey,
    () => retryWithBackoff(
      () => synthesizeSpeech(text, language, config),
      {
        maxRetries: 2,
        isRetryable: isRetryableTtsError,
        onRetry: ({ attempt, delayMs, error }) => {
          Logger.warn('mimo-tts', `Retrying MiMo synthesis for chunk ${chunkIndex + 1}`, {
            attempt,
            delayMs,
            statusCode: error?.response?.status || error?.statusCode || null,
          });
        },
      }
    ),
    { useCache }
  );
}

async function getAudioUrl(text = '', from = 'English', configOverride = null) {
  const resolvedConfig = normalizeMiMoConfig(configOverride);

  if (!resolvedConfig.apiKey) {
    throw buildMiMoError(new Error('Missing API key'), {
      message: '缺少 MiMo API Key',
      retryable: false,
      suggestion: '请先在设置中填写 MiMo API Key',
    });
  }

  const textArray = splitText(text).filter((chunk) => chunk && chunk.trim().length > 0);
  if (textArray.length === 0) {
    return [];
  }

  const queue = new PromiseQueue(SYNTHESIS_CONCURRENCY);
  const results = await Promise.allSettled(
    textArray.map((chunk, index) => queue.add(() => synthesizeSpeechWithRetry(chunk, from, resolvedConfig, index)))
  );

  const urls = [];
  const failures = [];

  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value) {
      urls.push(result.value);
      return;
    }

    if (result.status === 'rejected') {
      failures.push(result.reason);
    }
  });

  if (urls.length === 0 && failures.length > 0) {
    throw buildMiMoError(failures[0]);
  }

  if (failures.length > 0) {
    Logger.warn('mimo-tts', 'MiMo TTS partially succeeded', {
      chunks: textArray.length,
      successCount: urls.length,
      failureCount: failures.length,
      firstError: failures[0]?.message || String(failures[0]),
    });
  }

  return urls;
}

async function testConfiguration(configOverride = null) {
  const resolvedConfig = normalizeMiMoConfig(configOverride);

  if (!resolvedConfig.apiKey) {
    throw buildMiMoError(new Error('Missing API key'), {
      message: '缺少 MiMo API Key',
      retryable: false,
      suggestion: '请先填写 API Key，再执行测试',
    });
  }

  const audioUrl = await synthesizeSpeechWithRetry('Hello, this is a MiMo TTS test.', 'English', resolvedConfig, 0, { useCache: false });
  return {
    provider: 'MiMo',
    audioUrl,
    meta: {
      model: resolvedConfig.model,
      voice: resolvedConfig.voice,
      responseFormat: resolvedConfig.responseFormat,
    },
  };
}

// v2.5 使用固定预设音色，UI 已内置；无远程发现接口，返回预设列表
const PRESET_VOICES = [
  { value: 'mimo_default', label: 'mimo_default', group: 'Default' },
  { value: '冰糖', label: '冰糖 (女声)', group: '中文' },
  { value: '茉莉', label: '茉莉 (女声)', group: '中文' },
  { value: '苏打', label: '苏打 (男声)', group: '中文' },
  { value: '白桦', label: '白桦 (男声)', group: '中文' },
  { value: 'Mia', label: 'Mia (Female)', group: 'English' },
  { value: 'Chloe', label: 'Chloe (Female)', group: 'English' },
  { value: 'Milo', label: 'Milo (Male)', group: 'English' },
  { value: 'Dean', label: 'Dean (Male)', group: 'English' },
];

async function getVoices() {
  return { source: 'preset', supportsRemoteDiscovery: false, voices: PRESET_VOICES };
}

module.exports = {
  getAudioUrl,
  synthesizeSpeech,
  testConfiguration,
  getVoices,
  PRESET_VOICES,
};
