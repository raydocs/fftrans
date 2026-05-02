'use strict';

const configModule = require('./config-module');
const ttsRequestQueue = require('./tts-request-queue');
const googleTTS = require('../translator/google-tts');
const speechifyTTS = require('../translator/speechify-tts');
const elevenLabsTTS = require('../translator/elevenlabs-tts');
const mimoTTS = require('../translator/mimo-tts');
const msqSpeakerGender = require('./msq-speaker-gender');
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

function isFullAppConfig(config = null) {
  return Boolean(config && typeof config === 'object' && (config.api || config.indexWindow));
}

function getEngineConfigOverride(engine = 'google', options = {}) {
  if (options.configOverride) {
    return options.configOverride;
  }

  const config = options.config || null;
  if (isFullAppConfig(config)) {
    return config.api?.[normalizeEngine(engine)] || null;
  }

  return config;
}

function getElevenLabsBaseConfig(options = {}) {
  if (options.configOverride) {
    return options.configOverride;
  }

  if (isFullAppConfig(options.config)) {
    return options.config.api?.elevenlabs || {};
  }

  if (options.config && typeof options.config === 'object') {
    return options.config;
  }

  return configModule.getConfig().api?.elevenlabs || {};
}

function logVoiceRouting(message = '', details = {}) {
  if (process.env.FFTRANS_TTS_ROUTING_DEBUG === '1') {
    Logger.info('tts-service', message, details);
  }
}

function resolveElevenLabsVoiceRouting(options = {}) {
  const speaker = options.speaker || {};
  if (speaker.isNpc !== true) {
    return null;
  }

  const baseElevenLabsConfig = getElevenLabsBaseConfig(options);
  if (baseElevenLabsConfig.genderVoiceRoutingEnabled === false) {
    logVoiceRouting('MSQ speaker gender routing skipped', {
      speakerName: speaker.name || '',
      reason: 'disabled',
    });
    return null;
  }

  const match = msqSpeakerGender.lookupSpeakerGender(speaker.name);
  if (!match || !['male', 'female'].includes(match.gender)) {
    logVoiceRouting('MSQ speaker gender routing skipped', {
      speakerName: speaker.name || '',
      reason: 'no-gender-match',
    });
    return null;
  }

  const voiceId = String(match.gender === 'female'
    ? baseElevenLabsConfig.femaleVoiceId || ''
    : baseElevenLabsConfig.maleVoiceId || '').trim();

  if (!voiceId) {
    logVoiceRouting('MSQ speaker gender routing skipped', {
      speakerName: speaker.name || '',
      gender: match.gender,
      reason: 'missing-gender-voice-id',
    });
    return null;
  }

  return {
    configOverride: {
      ...baseElevenLabsConfig,
      voiceId,
    },
    routingMeta: {
      source: 'msq-speaker-gender',
      speakerName: speaker.name || '',
      matchedName: match.matchedName,
      matchType: match.matchType,
      gender: match.gender,
      voiceId,
    },
  };
}

function applyElevenLabsVoiceRouting(engine = 'google', options = {}) {
  if (normalizeEngine(engine) !== 'elevenlabs') {
    return options;
  }

  const route = resolveElevenLabsVoiceRouting(options);
  if (!route) {
    return options;
  }

  logVoiceRouting('MSQ speaker gender routing selected voice', route.routingMeta);
  return {
    ...options,
    configOverride: route.configOverride,
    routingMeta: route.routingMeta,
  };
}

async function getAudioUrlForEngine(engine = 'google', text = '', from = 'English', options = {}) {
  const normalizedEngine = normalizeEngine(engine);
  const effectiveOptions = applyElevenLabsVoiceRouting(normalizedEngine, options);
  const configOverride = getEngineConfigOverride(normalizedEngine, effectiveOptions);

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
  const effectiveOptions = applyElevenLabsVoiceRouting(normalizedEngine, options);
  const configOverride = getEngineConfigOverride(normalizedEngine, effectiveOptions);
  const { onChunk = null } = effectiveOptions;

  if (normalizedEngine === 'elevenlabs') {
    return ttsRequestQueue.enqueueSynthesis(() => elevenLabsTTS.getAudioUrlProgressive(text, from, configOverride, effectiveOptions));
  }

  const urls = await getAudioUrlForEngine(normalizedEngine, text, from, effectiveOptions);
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
  _resolveElevenLabsVoiceRouting: resolveElevenLabsVoiceRouting,
};
