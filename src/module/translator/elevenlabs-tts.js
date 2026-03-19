'use strict';

/**
 * ElevenLabs TTS Module
 *
 * Provides text-to-speech functionality using ElevenLabs Reader API
 * Uses Bearer Token authentication (Firebase JWT)
 */

const axios = require('axios');
const configModule = require('../system/config-module');
const requestModule = require('../system/request-module');
const { globalTTSAudioCache } = require('../system/tts-audio-cache');
const elevenLabsAuth = require('./elevenlabs-auth');
const Logger = require('../../utils/logger');
const { splitText } = require('../../utils/text-splitter');
const { retryWithBackoff, isTransientError } = require('../../utils/retry');
const PromiseQueue = require('../../utils/promise-queue');

const API_BASE_URL = 'https://api.elevenlabs.io/v1';
const TTS_ENDPOINT = `${API_BASE_URL}/text-to-speech`;
const USER_AGENT = 'readerapp/405 CFNetwork/3860.100.1 Darwin/25.0.0';
const SYNTHESIS_CONCURRENCY = 1;

function clampVoiceSetting(value, fallback) {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numericValue));
}

function normalizeVoiceSettings(config = {}) {
  return {
    stability: clampVoiceSetting(config.stability, 0.5),
    similarity_boost: clampVoiceSetting(config.similarityBoost, 0.75),
    style: clampVoiceSetting(config.style, 0),
    use_speaker_boost: typeof config.useSpeakerBoost === 'boolean' ? config.useSpeakerBoost : true,
  };
}

function isRetryableTtsError(error) {
  if (typeof error?.retryable === 'boolean') {
    return error.retryable;
  }

  return isTransientError(error || {});
}

function buildElevenLabsError(error, overrides = {}) {
  const statusCode = overrides.statusCode || error?.statusCode || error?.response?.status;
  const retryable = typeof overrides.retryable === 'boolean' ? overrides.retryable : isRetryableTtsError(error);

  let message = overrides.message || error?.message || 'ElevenLabs TTS 请求失败';
  let suggestion = overrides.suggestion || '请检查 ElevenLabs 配置后重试';

  if (statusCode === 401 || statusCode === 403) {
    message = overrides.message || 'ElevenLabs 认证失败';
    suggestion = overrides.suggestion || '请检查 Bearer Token / Refresh Token / App Check Token 是否有效';
  } else if (statusCode === 400 || statusCode === 422) {
    message = overrides.message || 'ElevenLabs 请求参数无效';
    suggestion = overrides.suggestion || '请检查 Voice / Model / Voice Settings 配置';
  } else if (statusCode === 429) {
    message = overrides.message || 'ElevenLabs 请求过于频繁';
    suggestion = overrides.suggestion || '请稍后重试，或降低连续朗读频率';
  } else if (statusCode >= 500) {
    message = overrides.message || 'ElevenLabs 服务暂时不可用';
    suggestion = overrides.suggestion || '请稍后再试';
  } else if (error?.code === 'ECONNABORTED') {
    message = overrides.message || 'ElevenLabs 请求超时';
    suggestion = overrides.suggestion || '请检查网络或代理设置';
  }

  const normalizedError = new Error(message);
  normalizedError.provider = 'ElevenLabs';
  normalizedError.statusCode = statusCode;
  normalizedError.status = statusCode;
  normalizedError.retryable = retryable;
  normalizedError.suggestion = suggestion;
  normalizedError.cause = error;
  return normalizedError;
}

function buildElevenLabsCacheKey(text = '', config = {}) {
  const voiceSettings = normalizeVoiceSettings(config);
  return [
    'elevenlabs',
    config.voiceId || 'nPczCjzI2devNBz1zQrb',
    config.modelId || 'eleven_turbo_v2_5',
    voiceSettings.stability,
    voiceSettings.similarity_boost,
    voiceSettings.style,
    voiceSettings.use_speaker_boost ? 'boost' : 'noboost',
    (text || '').trim(),
  ].join(':');
}

function decodeErrorBody(error) {
  const responseData = error?.response?.data;
  if (!responseData) {
    return '';
  }

  try {
    if (Buffer.isBuffer(responseData)) {
      return responseData.toString('utf8');
    }

    if (typeof responseData === 'string') {
      return responseData;
    }

    return JSON.stringify(responseData);
  } catch {
    return '';
  }
}

async function synthesizeSpeech(text, language, config = {}, options = {}) {
  const { persistTokens = false, skipAuthResolve = false } = options;

  if (!text || text.trim() === '') {
    throw buildElevenLabsError(new Error('Text is required'), {
      message: '缺少要朗读的文本',
      retryable: false,
      suggestion: '请传入非空文本后重试',
    });
  }

  const authConfig = skipAuthResolve
    ? (config || {})
    : await elevenLabsAuth.resolveAuthConfig(config, { persistTokens });

  const {
    bearerToken,
    voiceId = 'nPczCjzI2devNBz1zQrb',
    modelId = 'eleven_turbo_v2_5',
    appCheckToken,
    deviceId,
  } = authConfig;

  if (!bearerToken) {
    throw buildElevenLabsError(new Error('Missing bearer token'), {
      message: '缺少 ElevenLabs Bearer Token',
      retryable: false,
      suggestion: '请先填写 Bearer Token 或 Refresh Token',
    });
  }

  try {
    const response = await axios.post(
      `${TTS_ENDPOINT}/${voiceId}`,
      {
        text: text.trim(),
        model_id: modelId,
        voice_settings: normalizeVoiceSettings(authConfig),
      },
      requestModule.buildAxiosConfig({
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
          'User-Agent': USER_AGENT,
          ...(deviceId ? { 'Device-ID': deviceId } : {}),
          ...(appCheckToken ? { 'xi-app-check-token': appCheckToken } : {}),
        },
        responseType: 'arraybuffer',
        timeoutMs: 30000,
      })
    );

    const base64Audio = Buffer.from(response.data).toString('base64');
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error) {
    const rawMessage = decodeErrorBody(error);
    throw buildElevenLabsError(error, rawMessage ? {
      message: `${error?.response?.status ? `ElevenLabs API 错误 (${error.response.status})：` : ''}${rawMessage}`,
    } : {});
  }
}

async function synthesizeSpeechWithRetry(text, language, config, options = {}, chunkIndex = 0) {
  const cacheKey = buildElevenLabsCacheKey(text, config);
  const { useCache = true, ...synthesisOptions } = options;

  return globalTTSAudioCache.getOrCreate(
    cacheKey,
    () => retryWithBackoff(
      () => synthesizeSpeech(text, language, config, synthesisOptions),
      {
        maxRetries: 2,
        isRetryable: isRetryableTtsError,
        onRetry: ({ attempt, delayMs, error }) => {
          Logger.warn('elevenlabs-tts', `Retrying ElevenLabs synthesis for chunk ${chunkIndex + 1}`, {
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
  let authConfig;

  try {
    const baseConfig = configOverride || configModule.getConfig().api.elevenlabs || {};
    authConfig = await elevenLabsAuth.resolveAuthConfig(baseConfig, { persistTokens: true });
  } catch (error) {
    Logger.warn('elevenlabs-tts', 'ElevenLabs TTS auth resolution failed', error.message);
    throw buildElevenLabsError(error);
  }

  const texts = splitText(text).filter((chunk) => chunk && chunk.trim().length > 0);
  if (texts.length === 0) {
    return [];
  }

  const queue = new PromiseQueue(SYNTHESIS_CONCURRENCY);
  const results = await Promise.allSettled(
    texts.map((chunk, index) => queue.add(() => synthesizeSpeechWithRetry(chunk, from, authConfig, { skipAuthResolve: true }, index)))
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
    throw buildElevenLabsError(failures[0]);
  }

  if (failures.length > 0) {
    Logger.warn('elevenlabs-tts', 'ElevenLabs TTS partially succeeded', {
      chunks: texts.length,
      successCount: urls.length,
      failureCount: failures.length,
      firstError: failures[0]?.message || String(failures[0]),
    });
  }

  return urls;
}

async function testConfiguration(configOverride = null) {
  const baseConfig = configOverride || configModule.getConfig().api.elevenlabs || {};
  const authConfig = await elevenLabsAuth.resolveAuthConfig(baseConfig, { persistTokens: false });
  const audioUrl = await synthesizeSpeechWithRetry(
    'Hello from ElevenLabs TTS!',
    'English',
    authConfig,
    { skipAuthResolve: true, useCache: false },
    0
  );

  return {
    provider: 'ElevenLabs',
    audioUrl,
    meta: {
      voiceId: authConfig.voiceId,
      modelId: authConfig.modelId,
      didRefreshBearer: Boolean(authConfig.didRefreshBearer),
      usedAppCheck: Boolean(authConfig.appCheckToken),
    },
  };
}

module.exports = {
  synthesizeSpeech,
  getAudioUrl,
  testConfiguration
};
