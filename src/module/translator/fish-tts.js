'use strict';

const axios = require('axios');
const configModule = require('../system/config-module');
const requestModule = require('../system/request-module');
const { globalTTSAudioCache } = require('../system/tts-audio-cache');
const Logger = require('../../utils/logger');
const { splitText } = require('../../utils/text-splitter');
const { retryWithBackoff, isTransientError } = require('../../utils/retry');
const PromiseQueue = require('../../utils/promise-queue');

const FISH_TTS_API_URL = 'https://api.fish.audio/v1/tts';
const FISH_MODEL_LIST_URL = 'https://api.fish.audio/model';
const SUPPORTED_AUDIO_FORMATS = ['mp3', 'wav', 'opus'];
// s2.1-pro-free 为 2026 年 7 月限免模型
const SUPPORTED_MODELS = ['s2.1-pro-free', 's2.1-pro'];
const DEFAULT_MODEL = 's2.1-pro-free';
const SYNTHESIS_CONCURRENCY = 1;

function getMergedConfig(configOverride = null) {
  const config = configModule.getConfig();
  return {
    ...(config.api.fish || {}),
    ...(configOverride || {}),
  };
}

function normalizeFishConfig(configOverride = null) {
  const mergedConfig = getMergedConfig(configOverride);
  const format = SUPPORTED_AUDIO_FORMATS.includes(mergedConfig.responseFormat) ? mergedConfig.responseFormat : 'mp3';
  const model = SUPPORTED_MODELS.includes(mergedConfig.model) ? mergedConfig.model : DEFAULT_MODEL;

  return {
    apiKey: (mergedConfig.apiKey || '').trim(),
    model,
    referenceId: (mergedConfig.referenceId || '').trim(),
    responseFormat: format,
  };
}

function isRetryableTtsError(error) {
  if (typeof error?.retryable === 'boolean') {
    return error.retryable;
  }

  return isTransientError(error || {});
}

function buildFishError(error, overrides = {}) {
  const statusCode = overrides.statusCode || error?.statusCode || error?.response?.status;
  const retryable = typeof overrides.retryable === 'boolean' ? overrides.retryable : isRetryableTtsError(error);

  let message = overrides.message || error?.message || 'Fish Audio TTS 请求失败';
  let suggestion = overrides.suggestion || '请检查 Fish Audio 配置后重试';

  if (statusCode === 401 || statusCode === 403) {
    message = overrides.message || 'Fish Audio 认证失败';
    suggestion = overrides.suggestion || '请检查 Fish Audio API Key 是否正确';
  } else if (statusCode === 402) {
    message = overrides.message || 'Fish Audio 余额不足';
    suggestion = overrides.suggestion || '请检查账户余额，或切换到 s2.1-pro-free 限免模型';
  } else if (statusCode === 400 || statusCode === 422) {
    message = overrides.message || 'Fish Audio 请求参数无效';
    suggestion = overrides.suggestion || '请检查模型名称、Reference ID 等参数是否正确';
  } else if (statusCode === 429) {
    message = overrides.message || 'Fish Audio 请求过于频繁';
    suggestion = overrides.suggestion || '请稍后重试，或降低连续朗读频率';
  } else if (statusCode >= 500) {
    message = overrides.message || 'Fish Audio 服务暂时不可用';
    suggestion = overrides.suggestion || '请稍后再试';
  } else if (error?.code === 'ECONNABORTED') {
    message = overrides.message || 'Fish Audio 请求超时';
    suggestion = overrides.suggestion || '请检查网络或代理设置后重试';
  }

  const normalizedError = new Error(message);
  normalizedError.provider = 'Fish Audio';
  normalizedError.statusCode = statusCode;
  normalizedError.status = statusCode;
  normalizedError.retryable = retryable;
  normalizedError.suggestion = suggestion;
  normalizedError.cause = error;
  return normalizedError;
}

function buildFishCacheKey(text = '', config = {}) {
  return [
    'fish',
    config.model || DEFAULT_MODEL,
    config.referenceId || '',
    config.responseFormat || 'mp3',
    (text || '').trim(),
  ].join(':');
}

function convertBinaryToDataUrl(binaryData, format = 'mp3') {
  const mimeType = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    opus: 'audio/ogg',
  }[format] || `audio/${format}`;
  const base64 = Buffer.from(binaryData).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

async function synthesizeSpeech(text, language, config) {
  const resolvedConfig = normalizeFishConfig(config);
  const { apiKey, model, referenceId, responseFormat } = resolvedConfig;

  if (!text || text.trim() === '') {
    throw buildFishError(new Error('Text is required'), {
      message: '缺少要朗读的文本',
      retryable: false,
      suggestion: '请传入非空文本后重试',
    });
  }

  if (!apiKey) {
    throw buildFishError(new Error('Missing API key'), {
      message: '缺少 Fish Audio API Key',
      retryable: false,
      suggestion: '请先在设置中填写 Fish Audio API Key',
    });
  }

  try {
    const payload = {
      text: text.trim(),
      format: responseFormat,
      normalize: true,
      latency: 'normal',
    };

    if (referenceId) {
      payload.reference_id = referenceId;
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Fish Audio 通过 model 请求头选择模型
      model,
    };

    const response = await axios.post(
      FISH_TTS_API_URL,
      payload,
      requestModule.buildAxiosConfig({
        headers,
        timeoutMs: 30000,
        responseType: 'arraybuffer',
        transportProfile: requestModule.TRANSPORT_PROFILES.TTS,
      })
    );

    return convertBinaryToDataUrl(response.data, responseFormat);
  } catch (error) {
    if (error?.provider === 'Fish Audio') {
      throw error;
    }

    let errorMessage = '';
    if (error?.response?.data) {
      try {
        const errorBody = Buffer.isBuffer(error.response.data)
          ? JSON.parse(Buffer.from(error.response.data).toString('utf-8'))
          : error.response.data;
        errorMessage = errorBody?.detail || errorBody?.error?.message || errorBody?.message || '';
        if (typeof errorMessage !== 'string') {
          errorMessage = JSON.stringify(errorMessage);
        }
      } catch {
        // ignore parse errors
      }
    }

    throw buildFishError(error, errorMessage ? { message: `Fish Audio: ${errorMessage}` } : {});
  }
}

async function synthesizeSpeechWithRetry(text, language, config, chunkIndex = 0, options = {}) {
  const cacheKey = buildFishCacheKey(text, config);
  const { useCache = true } = options;

  return globalTTSAudioCache.getOrCreate(
    cacheKey,
    () => retryWithBackoff(
      () => synthesizeSpeech(text, language, config),
      {
        maxRetries: 2,
        isRetryable: isRetryableTtsError,
        onRetry: ({ attempt, delayMs, error }) => {
          Logger.warn('fish-tts', `Retrying Fish Audio synthesis for chunk ${chunkIndex + 1}`, {
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
  const resolvedConfig = normalizeFishConfig(configOverride);

  if (!resolvedConfig.apiKey) {
    throw buildFishError(new Error('Missing API key'), {
      message: '缺少 Fish Audio API Key',
      retryable: false,
      suggestion: '请先在设置中填写 Fish Audio API Key',
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
    throw buildFishError(failures[0]);
  }

  if (failures.length > 0) {
    Logger.warn('fish-tts', 'Fish Audio TTS partially succeeded', {
      chunks: textArray.length,
      successCount: urls.length,
      failureCount: failures.length,
      firstError: failures[0]?.message || String(failures[0]),
    });
  }

  return urls;
}

async function testConfiguration(configOverride = null) {
  const resolvedConfig = normalizeFishConfig(configOverride);

  if (!resolvedConfig.apiKey) {
    throw buildFishError(new Error('Missing API key'), {
      message: '缺少 Fish Audio API Key',
      retryable: false,
      suggestion: '请先填写 API Key，再执行测试',
    });
  }

  const audioUrl = await synthesizeSpeechWithRetry('Hello, this is a Fish Audio TTS test.', 'English', resolvedConfig, 0, { useCache: false });
  return {
    provider: 'Fish Audio',
    audioUrl,
    meta: {
      model: resolvedConfig.model,
      referenceId: resolvedConfig.referenceId,
      responseFormat: resolvedConfig.responseFormat,
    },
  };
}

// 获取用户在 fish.audio 上克隆/收藏的语音模型列表
async function getVoices(configOverride = null) {
  const resolvedConfig = normalizeFishConfig(configOverride);

  if (!resolvedConfig.apiKey) {
    return { source: 'unavailable', supportsRemoteDiscovery: false, voices: [] };
  }

  try {
    const response = await axios.get(
      FISH_MODEL_LIST_URL,
      requestModule.buildAxiosConfig({
        headers: {
          Authorization: `Bearer ${resolvedConfig.apiKey}`,
        },
        timeoutMs: 10000,
        params: {
          self: true,
          page_size: 100,
        },
        transportProfile: requestModule.TRANSPORT_PROFILES.TTS,
      })
    );

    const rawVoices = Array.isArray(response.data?.items) ? response.data.items : [];

    const voices = rawVoices
      .map((v) => {
        const value = v._id || v.id || '';
        const label = v.title || value;
        const group = Array.isArray(v.languages) && v.languages.length > 0 ? v.languages.join('/') : 'My Voices';
        return value ? { value, label, group } : null;
      })
      .filter(Boolean);

    if (voices.length > 0) {
      return { source: 'api', supportsRemoteDiscovery: true, voices };
    }

    return { source: 'unavailable', supportsRemoteDiscovery: false, voices: [] };
  } catch (error) {
    Logger.warn('fish-tts', 'Failed to fetch Fish Audio voice models', {
      statusCode: error?.response?.status || null,
      message: error?.message || String(error),
    });
    return { source: 'unavailable', supportsRemoteDiscovery: false, voices: [] };
  }
}

module.exports = {
  getAudioUrl,
  synthesizeSpeech,
  testConfiguration,
  getVoices,
};
