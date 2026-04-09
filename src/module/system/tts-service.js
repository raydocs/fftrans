'use strict';

const configModule = require('./config-module');
const ttsRequestQueue = require('./tts-request-queue');
const googleTTS = require('../translator/google-tts');
const speechifyTTS = require('../translator/speechify-tts');
const elevenLabsTTS = require('../translator/elevenlabs-tts');
const mimoTTS = require('../translator/mimo-tts');
const Logger = require('../../utils/logger');

const RUNTIME_TTS_DISPATCHERS = Object.freeze({
  speechify: (text, from, configOverride = null) => speechifyTTS.getAudioUrl(text, from, configOverride),
  elevenlabs: (text, from, configOverride = null) => elevenLabsTTS.getAudioUrl(text, from, configOverride),
  mimo: (text, from, configOverride = null) => mimoTTS.getAudioUrl(text, from, configOverride),
});

async function emitBatchChunks(onChunk = null, text = '', urls = []) {
  if (typeof onChunk !== 'function' || !Array.isArray(urls) || urls.length === 0) {
    return;
  }

  for (let index = 0; index < urls.length; index++) {
    try {
      await onChunk({
        chunkIndex: index,
        totalChunks: urls.length,
        text,
        audioUrl: urls[index],
      });
    } catch (error) {
      Logger.warn('tts-service', 'Progressive fallback chunk callback failed', {
        chunkIndex: index,
        error: error?.message || String(error),
      });
    }
  }
}

async function emitBufferedChunks(onChunk = null, chunks = []) {
  if (typeof onChunk !== 'function' || !Array.isArray(chunks) || chunks.length === 0) {
    return;
  }

  for (const chunk of chunks) {
    try {
      await onChunk(chunk);
    } catch (error) {
      Logger.warn('tts-service', 'Buffered progressive chunk callback failed', {
        chunkIndex: chunk?.chunkIndex,
        error: error?.message || String(error),
      });
    }
  }
}

function normalizeEngine(engine = 'google') {
  return typeof engine === 'string' && engine.trim()
    ? engine.trim().toLowerCase()
    : 'google';
}

function getConfiguredEngine(config = configModule.getConfig()) {
  return normalizeEngine(config?.indexWindow?.ttsEngine || 'google');
}

async function getAudioUrlForEngine(engine = 'google', text = '', from = 'English', options = {}) {
  const normalizedEngine = normalizeEngine(engine);
  const configOverride = options.configOverride ?? options.config ?? null;

  if (normalizedEngine === 'google') {
    return googleTTS.getAudioUrl(text, from);
  }

  const dispatcher = RUNTIME_TTS_DISPATCHERS[normalizedEngine];
  if (!dispatcher) {
    throw new Error(`Unsupported TTS engine: ${engine}`);
  }

  return ttsRequestQueue.enqueueSynthesis(() => dispatcher(text, from, configOverride));
}

async function getConfiguredAudioUrl(text = '', from = 'English', options = {}) {
  const config = options.config || configModule.getConfig();
  const engine = options.engine || getConfiguredEngine(config);

  return getAudioUrlForEngine(engine, text, from, options);
}

async function getAudioUrlProgressiveForEngine(engine = 'google', text = '', from = 'English', options = {}) {
  const normalizedEngine = normalizeEngine(engine);
  const configOverride = options.configOverride ?? options.config ?? null;
  const { onChunk = null } = options;

  if (normalizedEngine === 'elevenlabs') {
    return ttsRequestQueue.enqueueSynthesis(() => elevenLabsTTS.getAudioUrlProgressive(text, from, configOverride, options));
  }

  const urls = await getAudioUrlForEngine(normalizedEngine, text, from, options);
  await emitBatchChunks(onChunk, text, urls);
  return {
    urls,
    failures: [],
    totalChunks: Array.isArray(urls) ? urls.length : 0,
  };
}

async function getConfiguredAudioUrlProgressive(text = '', from = 'English', options = {}) {
  const config = options.config || configModule.getConfig();
  const engine = options.engine || getConfiguredEngine(config);

  return getAudioUrlProgressiveForEngine(engine, text, from, options);
}

async function getConfiguredAudioUrlWithFallback(text = '', from = 'English', options = {}) {
  const config = options.config || configModule.getConfig();
  const engine = options.engine || getConfiguredEngine(config);
  const { fallbackToGoogle = true, onError = null } = options;

  try {
    return await getAudioUrlForEngine(engine, text, from, options);
  } catch (error) {
    if (typeof onError === 'function') {
      onError(error, normalizeEngine(engine));
    }

    if (fallbackToGoogle) {
      return googleTTS.getAudioUrl(text, from);
    }

    throw error;
  }
}

async function getConfiguredAudioUrlProgressiveWithFallback(text = '', from = 'English', options = {}) {
  const config = options.config || configModule.getConfig();
  const engine = options.engine || getConfiguredEngine(config);
  const normalizedEngine = normalizeEngine(engine);
  const { fallbackToGoogle = true, onError = null, onChunk = null } = options;
  const shouldBufferPrimaryChunks = fallbackToGoogle && normalizedEngine === 'elevenlabs' && typeof onChunk === 'function';
  const bufferedChunks = [];
  const progressiveOptions = shouldBufferPrimaryChunks
    ? {
      ...options,
      onChunk: async (payload = {}) => {
        bufferedChunks.push(payload);
      },
    }
    : options;

  try {
    const result = await getAudioUrlProgressiveForEngine(engine, text, from, progressiveOptions);

    if (fallbackToGoogle && Array.isArray(result?.failures) && result.failures.length > 0) {
      const partialFailureError = new Error(`${normalizedEngine} progressive TTS returned partial audio`);
      partialFailureError.failures = result.failures;
      partialFailureError.totalChunks = result.totalChunks;
      partialFailureError.partialUrls = result.urls;
      throw partialFailureError;
    }

    if (shouldBufferPrimaryChunks) {
      await emitBufferedChunks(onChunk, bufferedChunks);
    }

    return result;
  } catch (error) {
    if (typeof onError === 'function') {
      onError(error, normalizedEngine);
    }

    if (fallbackToGoogle) {
      Logger.warn('tts-service', 'Progressive TTS failed; falling back to Google', {
        engine: normalizedEngine,
        message: error?.message || String(error),
        failureCount: Array.isArray(error?.failures) ? error.failures.length : 0,
      });

      const urls = googleTTS.getAudioUrl(text, from);
      await emitBatchChunks(onChunk, text, urls);
      return {
        urls,
        failures: [],
        totalChunks: Array.isArray(urls) ? urls.length : 0,
      };
    }

    throw error;
  }
}

module.exports = {
  getConfiguredEngine,
  getAudioUrlForEngine,
  getAudioUrlProgressiveForEngine,
  getConfiguredAudioUrl,
  getConfiguredAudioUrlProgressive,
  getConfiguredAudioUrlWithFallback,
  getConfiguredAudioUrlProgressiveWithFallback,
};
