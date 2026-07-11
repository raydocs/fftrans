'use strict';

/**
 * ElevenLabs TTS Module
 *
 * Provides text-to-speech functionality using ElevenLabs Reader API
 * Uses Bearer Token authentication (Firebase JWT)
 */

const axios = require('axios');
const { FILE_NAMES } = require('../../constants');
const configModule = require('../system/config-module');
const fileModule = require('../system/file-module');
const requestModule = require('../system/request-module');
const { globalTTSAudioCache } = require('../system/tts-audio-cache');
const elevenLabsAuth = require('./elevenlabs-auth');
const Logger = require('../../utils/logger');
const { splitText } = require('../../utils/text-splitter');
const { retryWithBackoff, isTransientError } = require('../../utils/retry');
const PromiseQueue = require('../../utils/promise-queue');

const API_BASE_URL = 'https://api.elevenlabs.io/v1';
const VOICES_ENDPOINT = `${API_BASE_URL}/reader/voices`;
const TTS_ENDPOINT = `${API_BASE_URL}/text-to-speech`;
const USER_AGENT = 'readerapp/405 CFNetwork/3860.100.1 Darwin/25.0.0';
const SYNTHESIS_CONCURRENCY = 2;
const COMMON_PHRASE_WARMUP_CONCURRENCY = 1;
const DEFAULT_COMMON_PRECACHE_LIMIT = 12;
const DEFAULT_COMMON_PRECACHE_PHRASES = Object.freeze([
  'Hello.',
  'Thank you.',
  'Please wait.',
  'Yes.',
  'No.',
  'I understand.',
  'Let’s go.',
  'Goodbye.',
]);
const DEFAULT_RUNTIME_AUTH_OPTIONS = Object.freeze({
  allowRefresh: true,
  cacheResolvedSession: true,
  persistAuthState: true,
  persistGeneratedDeviceId: true,
});
const DEFAULT_PRECACHE_AUTH_OPTIONS = Object.freeze({
  allowRefresh: true,
  cacheResolvedSession: false,
  persistAuthState: false,
  persistGeneratedDeviceId: false,
});
const DEFAULT_PRECACHE_CACHE_OPTIONS = Object.freeze({
  persistOnSuccess: true,
  rememberFailures: false,
  respectRecentFailures: false,
  reusePending: false,
  registerPending: false,
});

function getTextChunks(text = '') {
  return splitText(text).filter((chunk) => chunk && chunk.trim().length > 0);
}

function resolveAuthOptions(authOptions = {}, defaults = DEFAULT_RUNTIME_AUTH_OPTIONS) {
  return {
    ...defaults,
    ...(authOptions || {}),
  };
}

function getBaseConfig(configOverride = null) {
  return configOverride || configModule.getConfig().api.elevenlabs || {};
}

async function resolveTopLevelAuthConfig(configOverride = null, authOptions = {}, defaults = DEFAULT_RUNTIME_AUTH_OPTIONS) {
  return elevenLabsAuth.resolveAuthConfig(
    getBaseConfig(configOverride),
    resolveAuthOptions(authOptions, defaults)
  );
}

function normalizePreCachePhrases(phrases = [], maxPhrases = DEFAULT_COMMON_PRECACHE_LIMIT) {
  const normalized = [];
  const seen = new Set();
  const targetCount = Number.isFinite(maxPhrases)
    ? Math.max(0, maxPhrases)
    : DEFAULT_COMMON_PRECACHE_LIMIT;

  phrases.forEach((phrase) => {
    const normalizedPhrase = typeof phrase === 'string' ? phrase.trim() : '';
    if (!normalizedPhrase || normalizedPhrase.length >= 200 || seen.has(normalizedPhrase)) {
      return;
    }

    seen.add(normalizedPhrase);
    normalized.push(normalizedPhrase);
  });

  return normalized.slice(0, targetCount);
}

function extractCommonPhrasesFromDictionary(dictionary = []) {
  if (!Array.isArray(dictionary)) {
    return [];
  }

  return dictionary.flatMap((item) => {
    if (Array.isArray(item)) {
      return typeof item[0] === 'string' ? [item[0]] : [];
    }

    if (item && typeof item === 'object' && typeof item.en === 'string') {
      return [item.en];
    }

    return [];
  });
}

function getCommonPhrasesPath() {
  return fileModule.getRootPath('src', 'data', 'text', 'cache', FILE_NAMES.COMMON_PHRASES);
}

function loadCommonPhrasesDictionary() {
  const commonPhrasesPath = getCommonPhrasesPath();
  if (!fileModule.exists(commonPhrasesPath)) {
    return [];
  }

  try {
    return require(commonPhrasesPath);
  } catch (error) {
    Logger.warn('elevenlabs-tts', 'Failed to load common phrases dictionary for TTS warmup', error.message);
    return [];
  }
}

function getSmartPreCachePhrases(options = {}) {
  const { maxPhrases = DEFAULT_COMMON_PRECACHE_LIMIT, includeDefaults = true } = options;
  const phrases = [
    ...extractCommonPhrasesFromDictionary(loadCommonPhrasesDictionary()),
    ...(includeDefaults ? DEFAULT_COMMON_PRECACHE_PHRASES : []),
  ];

  return normalizePreCachePhrases(phrases, maxPhrases);
}

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

  // ElevenLabs 免费额度用尽会返回 401，但 code 是 quota_exceeded——
  // 此时不是 Token 失效，避免误导用户去查 Token
  const quotaProbe = `${overrides.message || ''} ${error?.message || ''} ${decodeErrorBody(error)}`;
  const isQuotaExceeded = /quota[_\s]?exceeded/i.test(quotaProbe);
  if (isQuotaExceeded) {
    message = overrides.message || 'ElevenLabs 配额已用尽';
    suggestion = '当前 ElevenReader 账号的免费额度已用尽：请更换其他账号的 Refresh Token，或等待额度按月重置，或临时改用 Fish Audio / MiMo 引擎';
  }

  const normalizedError = new Error(message);
  normalizedError.provider = 'ElevenLabs';
  normalizedError.authCode = isQuotaExceeded ? 'quota_exceeded' : (overrides.authCode || error?.authCode || '');
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
  const { authOptions = {}, skipAuthResolve = false } = options;

  if (!text || text.trim() === '') {
    throw buildElevenLabsError(new Error('Text is required'), {
      message: '缺少要朗读的文本',
      retryable: false,
      suggestion: '请传入非空文本后重试',
    });
  }

  const authConfig = skipAuthResolve
    ? (config || {})
    : await elevenLabsAuth.resolveAuthConfig(config, authOptions);

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

  const authorizationHeader = elevenLabsAuth.normalizeBearerToken(bearerToken);

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
          Authorization: authorizationHeader,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
          'User-Agent': USER_AGENT,
          ...(deviceId ? { 'Device-ID': deviceId } : {}),
          ...(appCheckToken ? { 'xi-app-check-token': appCheckToken } : {}),
        },
        responseType: 'arraybuffer',
        timeoutMs: 30000,
        transportProfile: requestModule.TRANSPORT_PROFILES.TTS,
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
  const {
    useCache = true,
    cacheOptions = {},
    ...synthesisOptions
  } = options;

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
    {
      useCache,
      ...cacheOptions,
    }
  );
}

async function emitProgressiveChunk(onChunk, payload) {
  if (typeof onChunk !== 'function') {
    return;
  }

  try {
    await onChunk(payload);
  } catch (error) {
    Logger.warn('elevenlabs-tts', 'ElevenLabs progressive chunk callback failed', {
      chunkIndex: payload?.chunkIndex,
      error: error?.message || String(error),
    });
  }
}

async function synthesizeChunksProgressive(texts = [], language = 'English', authConfig = {}, options = {}) {
  const {
    onChunk = null,
    useCache = true,
    cacheOptions = {},
  } = options;

  if (texts.length === 0) {
    return {
      urls: [],
      failures: [],
      totalChunks: 0,
    };
  }

  const queue = new PromiseQueue(SYNTHESIS_CONCURRENCY);
  const settledChunks = new Array(texts.length);
  let nextEmitIndex = 0;
  let emitChain = Promise.resolve();

  function scheduleOrderedEmission() {
    if (typeof onChunk !== 'function') {
      return;
    }

    emitChain = emitChain.then(async () => {
      while (nextEmitIndex < settledChunks.length && settledChunks[nextEmitIndex]) {
        const chunkResult = settledChunks[nextEmitIndex];
        if (chunkResult.status === 'fulfilled' && chunkResult.value) {
          await emitProgressiveChunk(onChunk, {
            chunkIndex: chunkResult.chunkIndex,
            totalChunks: texts.length,
            text: chunkResult.text,
            audioUrl: chunkResult.value,
          });
        }
        nextEmitIndex++;
      }
    });
  }

  const tasks = texts.map((chunk, index) => queue.add(() => synthesizeSpeechWithRetry(
    chunk,
    language,
    authConfig,
    {
      skipAuthResolve: true,
      useCache,
      cacheOptions,
    },
    index
  )).then(
    (value) => {
      settledChunks[index] = {
        status: 'fulfilled',
        value,
        chunkIndex: index,
        text: chunk,
      };
      scheduleOrderedEmission();
      return value;
    },
    (error) => {
      settledChunks[index] = {
        status: 'rejected',
        reason: error,
        chunkIndex: index,
        text: chunk,
      };
      scheduleOrderedEmission();
      throw error;
    }
  ));

  const results = await Promise.allSettled(tasks);
  await emitChain;

  const urls = [];
  const failures = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      urls.push(result.value);
      return;
    }

    if (result.status === 'rejected') {
      failures.push({
        chunkIndex: index,
        text: texts[index],
        error: result.reason,
      });
    }
  });

  return {
    urls,
    failures,
    totalChunks: texts.length,
  };
}

async function getAudioUrlProgressive(text = '', from = 'English', configOverride = null, options = {}) {
  const {
    onChunk = null,
    authOptions = {},
    authDefaults = DEFAULT_RUNTIME_AUTH_OPTIONS,
    resolvedAuthConfig = null,
    useCache = true,
    cacheOptions = {},
  } = options;

  let authConfig = resolvedAuthConfig;

  if (!authConfig) {
    try {
      authConfig = await resolveTopLevelAuthConfig(configOverride, authOptions, authDefaults);
    } catch (error) {
      Logger.warn('elevenlabs-tts', 'ElevenLabs TTS auth resolution failed', error.message);
      throw buildElevenLabsError(error);
    }
  }

  const texts = getTextChunks(text);
  if (texts.length === 0) {
    return {
      urls: [],
      failures: [],
      totalChunks: 0,
    };
  }

  const result = await synthesizeChunksProgressive(texts, from, authConfig, {
    onChunk,
    useCache,
    cacheOptions,
  });

  if (result.urls.length === 0 && result.failures.length > 0) {
    const topLevelError = buildElevenLabsError(result.failures[0].error);
    topLevelError.failures = result.failures;
    topLevelError.totalChunks = result.totalChunks;
    throw topLevelError;
  }

  if (result.failures.length > 0) {
    Logger.warn('elevenlabs-tts', 'ElevenLabs TTS partially succeeded', {
      chunks: result.totalChunks,
      successCount: result.urls.length,
      failureCount: result.failures.length,
      firstError: result.failures[0]?.error?.message || String(result.failures[0]?.error),
      failedChunkIndexes: result.failures.map((failure) => failure.chunkIndex),
    });
  }

  return result;
}

async function getAudioUrl(text = '', from = 'English', configOverride = null) {
  const result = await getAudioUrlProgressive(text, from, configOverride);
  return result.urls;
}

async function preCacheText(text = '', from = 'English', configOverride = null, options = {}) {
  const {
    throwOnError = false,
    authOptions = {},
    cacheOptions = {},
    resolvedAuthConfig = null,
  } = options;

  try {
    const result = await getAudioUrlProgressive(text, from, configOverride, {
      useCache: true,
      authDefaults: DEFAULT_PRECACHE_AUTH_OPTIONS,
      authOptions,
      resolvedAuthConfig,
      cacheOptions: {
        ...DEFAULT_PRECACHE_CACHE_OPTIONS,
        ...cacheOptions,
      },
    });

    return {
      text,
      urls: result.urls,
      totalChunks: result.totalChunks,
      successCount: result.urls.length,
      failureCount: result.failures.length,
      failures: result.failures,
    };
  } catch (error) {
    Logger.warn('elevenlabs-tts', 'ElevenLabs background pre-cache failed', {
      text: typeof text === 'string' ? text.slice(0, 80) : '',
      error: error?.message || String(error),
    });

    if (throwOnError) {
      throw error;
    }

    return {
      text,
      urls: [],
      totalChunks: getTextChunks(text).length,
      successCount: 0,
      failureCount: Array.isArray(error?.failures) && error.failures.length > 0 ? error.failures.length : 1,
      failures: Array.isArray(error?.failures) && error.failures.length > 0
        ? error.failures
        : [{ chunkIndex: -1, text, error }],
      error,
    };
  }
}

async function preCacheCommonPhrases(configOverride = null, options = {}) {
  const {
    phrases = null,
    from = 'English',
    maxPhrases = DEFAULT_COMMON_PRECACHE_LIMIT,
    concurrency = COMMON_PHRASE_WARMUP_CONCURRENCY,
    throwOnError = false,
    authOptions = {},
    cacheOptions = {},
  } = options;

  const phraseList = normalizePreCachePhrases(
    Array.isArray(phrases) && phrases.length > 0 ? phrases : getSmartPreCachePhrases({ maxPhrases }),
    maxPhrases
  );

  if (phraseList.length === 0) {
    return {
      phraseCount: 0,
      warmedCount: 0,
      failedCount: 0,
      chunkCount: 0,
      results: [],
    };
  }

  let resolvedAuthConfig = null;
  try {
    resolvedAuthConfig = await resolveTopLevelAuthConfig(
      configOverride,
      authOptions,
      DEFAULT_PRECACHE_AUTH_OPTIONS
    );
  } catch (error) {
    Logger.warn('elevenlabs-tts', 'ElevenLabs common-phrase pre-cache auth resolution failed', error.message);

    if (throwOnError) {
      throw buildElevenLabsError(error);
    }

    return {
      phraseCount: phraseList.length,
      warmedCount: 0,
      failedCount: phraseList.length,
      chunkCount: 0,
      results: phraseList.map((phrase) => ({
        text: phrase,
        urls: [],
        totalChunks: getTextChunks(phrase).length,
        successCount: 0,
        failureCount: 1,
        failures: [{ chunkIndex: -1, text: phrase, error }],
        error,
      })),
    };
  }

  const queue = new PromiseQueue(Math.max(1, Number(concurrency) || COMMON_PHRASE_WARMUP_CONCURRENCY));
  const results = await Promise.all(
    phraseList.map((phrase) => queue.add(() => preCacheText(phrase, from, configOverride, {
      throwOnError,
      cacheOptions,
      resolvedAuthConfig,
    })))
  );

  return {
    phraseCount: phraseList.length,
    warmedCount: results.filter((result) => result.successCount > 0).length,
    failedCount: results.filter((result) => result.successCount === 0).length,
    chunkCount: results.reduce((sum, result) => sum + result.successCount, 0),
    results,
  };
}

async function fetchVoicesRaw(authConfig) {
  return axios.get(
    VOICES_ENDPOINT,
    requestModule.buildAxiosConfig({
      headers: {
        Authorization: elevenLabsAuth.normalizeBearerToken(authConfig.bearerToken),
        Accept: '*/*',
        'User-Agent': USER_AGENT,
        ...(authConfig.deviceId ? { 'Device-ID': authConfig.deviceId } : {}),
        ...(authConfig.appCheckToken ? { 'xi-app-check-token': authConfig.appCheckToken } : {}),
      },
      timeoutMs: 10000,
      transportProfile: requestModule.TRANSPORT_PROFILES.TTS,
    })
  );
}

async function validateConfiguration(configOverride = null) {
  const baseConfig = configOverride || configModule.getConfig().api.elevenlabs || {};
  const authConfig = await elevenLabsAuth.resolveAuthConfig(baseConfig, {
    allowRefresh: true,
    cacheResolvedSession: false,
    persistAuthState: false,
    persistGeneratedDeviceId: false,
  });

  const response = await fetchVoicesRaw(authConfig);

  return {
    provider: 'ElevenLabs',
    meta: {
      voiceCount: Array.isArray(response.data?.voices) ? response.data.voices.length : 0,
      didRefreshBearer: Boolean(authConfig.didRefreshBearer),
      usedAppCheck: Boolean(authConfig.appCheckToken),
      authSource: authConfig.authSource || '',
    },
  };
}

async function getVoices(configOverride = null) {
  const baseConfig = configOverride || configModule.getConfig().api.elevenlabs || {};
  const authConfig = await elevenLabsAuth.resolveAuthConfig(baseConfig, {
    allowRefresh: true,
    cacheResolvedSession: false,
    persistAuthState: false,
    persistGeneratedDeviceId: false,
  });

  const response = await fetchVoicesRaw(authConfig);
  const rawVoices = Array.isArray(response.data?.voices) ? response.data.voices : [];

  const voices = rawVoices
    .map((v) => {
      const value = v.voice_id || v.voiceId || v.id || '';
      const label = v.name || v.display_name || value;
      const group = v.category || v.labels?.accent || '';
      return value ? { value, label, group } : null;
    })
    .filter(Boolean);

  return { voices };
}

async function testConfiguration(configOverride = null) {
  const baseConfig = configOverride || configModule.getConfig().api.elevenlabs || {};
  const authConfig = await elevenLabsAuth.resolveAuthConfig(baseConfig, {
    allowRefresh: true,
    cacheResolvedSession: false,
    persistAuthState: false,
    persistGeneratedDeviceId: false,
  });
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
      authSource: authConfig.authSource || '',
    },
  };
}

module.exports = {
  synthesizeSpeech,
  getAudioUrl,
  getAudioUrlProgressive,
  preCacheText,
  preCacheCommonPhrases,
  getSmartPreCachePhrases,
  validateConfiguration,
  testConfiguration,
  getVoices,
};
