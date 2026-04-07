'use strict';

const axios = require('axios');
const configModule = require('../system/config-module');
const requestModule = require('../system/request-module');
const { globalTTSAudioCache } = require('../system/tts-audio-cache');
const Logger = require('../../utils/logger');
const { splitText } = require('../../utils/text-splitter');
const { retryWithBackoff, isTransientError } = require('../../utils/retry');
const PromiseQueue = require('../../utils/promise-queue');

const MIMO_API_URL = 'https://api.xiaomimimo.com/v1/audio/speech';
const SUPPORTED_AUDIO_FORMATS = ['mp3', 'ogg', 'wav'];
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
  const responseFormat = SUPPORTED_AUDIO_FORMATS.includes(mergedConfig.responseFormat) ? mergedConfig.responseFormat : 'mp3';
  const speedNum = Number(mergedConfig.speed);
  const speed = (!Number.isNaN(speedNum) && speedNum >= 0.25 && speedNum <= 4) ? speedNum : 1;

  return {
    apiKey: (mergedConfig.apiKey || '').trim(),
    model: (mergedConfig.model || 'MiMo-V2-TTS').trim(),
    voice: (mergedConfig.voice || '').trim(),
    responseFormat,
    speed,
    style: (mergedConfig.style || '').trim(),
    emotion: (mergedConfig.emotion || '').trim(),
    language: (mergedConfig.language || '').trim(),
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
    suggestion = overrides.suggestion || '请检查模型名称、语音 ID 等参数是否正确';
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
    config.model || 'MiMo-V2-TTS',
    config.voice || '',
    config.responseFormat || 'mp3',
    String(config.speed || 1),
    config.style || '',
    config.emotion || '',
    config.language || '',
    (text || '').trim(),
  ].join(':');
}

function convertBinaryToDataUrl(binaryData, format = 'mp3') {
  const mimeType = {
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
  }[format] || `audio/${format}`;
  const base64 = Buffer.from(binaryData).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

async function synthesizeSpeech(text, language, config) {
  const resolvedConfig = normalizeMiMoConfig(config);
  const { apiKey, model, voice, responseFormat, speed, style, emotion, language: mimoLanguage } = resolvedConfig;

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

  if (!voice) {
    throw buildMiMoError(new Error('Missing voice'), {
      message: '缺少 MiMo 语音 ID',
      retryable: false,
      suggestion: '请先在设置中填写语音 ID (Voice)',
    });
  }

  try {
    const payload = {
      model,
      voice,
      input: text.trim(),
      speed,
      response_format: responseFormat,
    };

    if (style) payload.style = style;
    if (emotion) payload.emotion = emotion;
    if (mimoLanguage) payload.language = mimoLanguage;

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const response = await axios.post(
      MIMO_API_URL,
      payload,
      requestModule.buildAxiosConfig({
        headers,
        timeoutMs: 30000,
        responseType: 'arraybuffer',
      })
    );

    return convertBinaryToDataUrl(response.data, responseFormat);
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

  if (!resolvedConfig.voice) {
    throw buildMiMoError(new Error('Missing voice'), {
      message: '缺少 MiMo 语音 ID',
      retryable: false,
      suggestion: '请先在设置中填写语音 ID (Voice)',
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

  if (!resolvedConfig.voice) {
    throw buildMiMoError(new Error('Missing voice'), {
      message: '缺少 MiMo 语音 ID',
      retryable: false,
      suggestion: '请先填写语音 ID (Voice)，再执行测试',
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
      speed: resolvedConfig.speed,
      style: resolvedConfig.style,
      emotion: resolvedConfig.emotion,
      language: resolvedConfig.language,
    },
  };
}

async function getVoices(configOverride = null) {
  const resolvedConfig = normalizeMiMoConfig(configOverride);

  if (!resolvedConfig.apiKey) {
    return { source: 'unavailable', supportsRemoteDiscovery: false, voices: [] };
  }

  // Attempt to fetch voices from MiMo's OpenAI-compatible API
  try {
    const response = await axios.get(
      'https://api.xiaomimimo.com/v1/voices',
      requestModule.buildAxiosConfig({
        headers: {
          Authorization: `Bearer ${resolvedConfig.apiKey}`,
        },
        timeoutMs: 10000,
      })
    );

    const rawVoices = Array.isArray(response.data?.voices)
      ? response.data.voices
      : Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
          ? response.data
          : [];

    const voices = rawVoices
      .map((v) => {
        const value = v.voice_id || v.id || v.name || '';
        const label = v.display_name || v.name || value;
        const group = v.category || v.language || '';
        return value ? { value, label, group } : null;
      })
      .filter(Boolean);

    if (voices.length > 0) {
      return { source: 'api', supportsRemoteDiscovery: true, voices };
    }

    return { source: 'unavailable', supportsRemoteDiscovery: false, voices: [] };
  } catch {
    // Discovery endpoint not available — this is expected and not an error
    return { source: 'unavailable', supportsRemoteDiscovery: false, voices: [] };
  }
}

module.exports = {
  getAudioUrl,
  synthesizeSpeech,
  testConfiguration,
  getVoices,
};
