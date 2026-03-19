'use strict';

const axios = require('axios');
const configModule = require('../system/config-module');
const requestModule = require('../system/request-module');
const { globalTTSAudioCache } = require('../system/tts-audio-cache');
const Logger = require('../../utils/logger');
const { splitText } = require('../../utils/text-splitter');
const { retryWithBackoff, isTransientError } = require('../../utils/retry');
const PromiseQueue = require('../../utils/promise-queue');

const SPEECHIFY_API_URL = 'https://audio.api.speechify.com/v3/synthesis/get';
const SUPPORTED_AUDIO_FORMATS = ['mp3', 'ogg', 'wav'];
const SYNTHESIS_CONCURRENCY = 1;

const voiceMapping = {
  Japanese: 'gwyneth',
  English: 'gwyneth',
  'Traditional-Chinese': 'gwyneth',
  'Simplified-Chinese': 'gwyneth',
};

function getMergedConfig(configOverride = null) {
  const config = configModule.getConfig();
  return {
    ...(config.api.speechify || {}),
    ...(configOverride || {}),
  };
}

function normalizeSpeechifyConfig(configOverride = null) {
  const mergedConfig = getMergedConfig(configOverride);
  const audioFormat = SUPPORTED_AUDIO_FORMATS.includes(mergedConfig.audioFormat) ? mergedConfig.audioFormat : 'mp3';

  return {
    bearerToken: (mergedConfig.bearerToken || '').trim(),
    voiceId: (mergedConfig.voiceId || '').trim(),
    audioFormat,
    sentenceSplitting: Boolean(mergedConfig.sentenceSplitting),
  };
}

function isRetryableTtsError(error) {
  if (typeof error?.retryable === 'boolean') {
    return error.retryable;
  }

  return isTransientError(error || {});
}

function buildSpeechifyError(error, overrides = {}) {
  const statusCode = overrides.statusCode || error?.statusCode || error?.response?.status;
  const retryable = typeof overrides.retryable === 'boolean' ? overrides.retryable : isRetryableTtsError(error);

  let message = overrides.message || error?.message || 'Speechify TTS 请求失败';
  let suggestion = overrides.suggestion || '请检查 Speechify 配置后重试';

  if (statusCode === 401 || statusCode === 403) {
    message = overrides.message || 'Speechify 认证失败';
    suggestion = overrides.suggestion || '请更新或重新获取 Speechify Bearer Token';
  } else if (statusCode === 429) {
    message = overrides.message || 'Speechify 请求过于频繁';
    suggestion = overrides.suggestion || '请稍后重试，或降低连续朗读频率';
  } else if (statusCode >= 500) {
    message = overrides.message || 'Speechify 服务暂时不可用';
    suggestion = overrides.suggestion || '请稍后再试';
  } else if (error?.code === 'ECONNABORTED') {
    message = overrides.message || 'Speechify 请求超时';
    suggestion = overrides.suggestion || '请检查网络或代理设置后重试';
  }

  const normalizedError = new Error(message);
  normalizedError.provider = 'Speechify';
  normalizedError.statusCode = statusCode;
  normalizedError.status = statusCode;
  normalizedError.retryable = retryable;
  normalizedError.suggestion = suggestion;
  normalizedError.cause = error;
  return normalizedError;
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSpeechifyCacheKey(text = '', config = {}) {
  return [
    'speechify',
    config.voiceId || voiceMapping.English,
    config.audioFormat,
    config.sentenceSplitting ? 'split' : 'nosplit',
    (text || '').trim(),
  ].join(':');
}

function convertBinaryToDataUrl(binaryData, format = 'ogg') {
  const mimeType = {
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
  }[format] || `audio/${format}`;
  const base64 = Buffer.from(binaryData).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

async function synthesizeSpeech(text, language, config) {
  const resolvedConfig = normalizeSpeechifyConfig(config);
  const {
    bearerToken,
    voiceId,
    audioFormat,
    sentenceSplitting,
  } = resolvedConfig;

  if (!text || text.trim() === '') {
    throw buildSpeechifyError(new Error('Text is required'), {
      message: '缺少要朗读的文本',
      retryable: false,
      suggestion: '请传入非空文本后重试',
    });
  }

  if (!bearerToken) {
    throw buildSpeechifyError(new Error('Missing bearer token'), {
      message: '缺少 Speechify Bearer Token',
      retryable: false,
      suggestion: '请先在设置中填写 Speechify Bearer Token',
    });
  }

  try {
    const payload = {
      ssml: `<speak>${escapeXml(text.trim())}</speak>`,
      voice: voiceId || voiceMapping[language] || 'gwyneth',
      forcedAudioFormat: audioFormat,
      forwardContext: {
        type: 'text',
        data: text,
      },
    };

    const headers = {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
      Accept: '*/*',
      'X-Speechify-Client': 'DesktopExtension',
      'X-Speechify-Client-Version': '12.13.1',
      'X-Speechify-Synthesis-Options': `sentence-splitting=${sentenceSplitting}`,
    };

    const response = await axios.post(
      SPEECHIFY_API_URL,
      payload,
      requestModule.buildAxiosConfig({
        headers,
        timeoutMs: 30000,
        responseType: 'arraybuffer',
      })
    );

    return convertBinaryToDataUrl(response.data, audioFormat);
  } catch (error) {
    throw buildSpeechifyError(error);
  }
}

async function synthesizeSpeechWithRetry(text, language, config, chunkIndex = 0, options = {}) {
  const cacheKey = buildSpeechifyCacheKey(text, config);
  const { useCache = true } = options;

  return globalTTSAudioCache.getOrCreate(
    cacheKey,
    () => retryWithBackoff(
      () => synthesizeSpeech(text, language, config),
      {
        maxRetries: 2,
        isRetryable: isRetryableTtsError,
        onRetry: ({ attempt, delayMs, error }) => {
          Logger.warn('speechify-tts', `Retrying Speechify synthesis for chunk ${chunkIndex + 1}`, {
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
  const resolvedConfig = normalizeSpeechifyConfig(configOverride);

  if (!resolvedConfig.bearerToken) {
    throw buildSpeechifyError(new Error('Missing bearer token'), {
      message: '缺少 Speechify Bearer Token',
      retryable: false,
      suggestion: '请先在设置中填写 Speechify Bearer Token',
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
    throw buildSpeechifyError(failures[0]);
  }

  if (failures.length > 0) {
    Logger.warn('speechify-tts', 'Speechify TTS partially succeeded', {
      chunks: textArray.length,
      successCount: urls.length,
      failureCount: failures.length,
      firstError: failures[0]?.message || String(failures[0]),
    });
  }

  return urls;
}

async function testConfiguration(configOverride = null) {
  const resolvedConfig = normalizeSpeechifyConfig(configOverride);

  if (!resolvedConfig.bearerToken) {
    throw buildSpeechifyError(new Error('Missing bearer token'), {
      message: '缺少 Speechify Bearer Token',
      retryable: false,
      suggestion: '请先填写 Bearer Token，再执行测试',
    });
  }

  const audioUrl = await synthesizeSpeechWithRetry('Hello, this is a Speechify test.', 'English', resolvedConfig, 0, { useCache: false });
  return {
    provider: 'Speechify',
    audioUrl,
    meta: {
      voiceId: resolvedConfig.voiceId || voiceMapping.English,
      audioFormat: resolvedConfig.audioFormat,
      sentenceSplitting: resolvedConfig.sentenceSplitting,
    },
  };
}

module.exports = {
  getAudioUrl,
  synthesizeSpeech,
  testConfiguration,
};
