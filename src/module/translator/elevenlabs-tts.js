/**
 * ElevenLabs TTS Module
 *
 * Provides text-to-speech functionality using ElevenLabs Reader API
 * Uses Bearer Token authentication (Firebase JWT)
 */

const axios = require('axios');
const configModule = require('../system/config-module');
const elevenLabsAuth = require('./elevenlabs-auth');
const { splitText } = require('../../utils/text-splitter');
const PromiseQueue = require('../../utils/promise-queue');

// ElevenLabs API configuration
const API_BASE_URL = 'https://api.elevenlabs.io/v1';
const TTS_ENDPOINT = `${API_BASE_URL}/text-to-speech`;
const USER_AGENT = 'readerapp/405 CFNetwork/3860.100.1 Darwin/25.0.0';
const SYNTHESIS_CONCURRENCY = 4;

/**
 * Synthesize speech using ElevenLabs API
 * @param {string} text - Text to synthesize
 * @param {string} language - Language code (not used by ElevenLabs, accepts all)
 * @param {Object} config - Configuration object
 * @param {string} config.voiceId - Voice ID
 * @param {string} config.modelId - Model ID (default: eleven_turbo_v2_5)
 * @param {Object} options - Additional options
 * @param {boolean} options.persistTokens - Persist refreshed tokens/deviceId to config
 * @param {boolean} options.skipAuthResolve - Use provided config without resolving auth
 * @returns {Promise<string>} Data URL of audio
 */
async function synthesizeSpeech(text, language, config = {}, options = {}) {
  const { persistTokens = false, skipAuthResolve = false } = options;

  if (!text || text.trim() === '') {
    throw new Error('Text is required');
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
    throw new Error('Bearer Token is required');
  }

  try {
    const url = `${TTS_ENDPOINT}/${voiceId}`;

    const payload = {
      text: text.trim(),
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true
      }
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'User-Agent': USER_AGENT,
        ...(deviceId ? { 'Device-ID': deviceId } : {}),
        ...(appCheckToken ? { 'xi-app-check-token': appCheckToken } : {}),
      },
      responseType: 'arraybuffer',
      timeout: 30000
    });

    // Convert binary audio to data URL
    const base64Audio = Buffer.from(response.data).toString('base64');
    const dataUrl = `data:audio/mpeg;base64,${base64Audio}`;

    return dataUrl;
  } catch (error) {
    console.error('[ElevenLabs TTS] Synthesis failed:', error.message);

    if (error.response) {
      const errorMsg = error.response.data ?
        Buffer.from(error.response.data).toString('utf-8') :
        error.response.statusText;
      throw new Error(`ElevenLabs API error (${error.response.status}): ${errorMsg}`);
    }

    throw error;
  }
}

/**
 * Get audio URL for text (with automatic splitting for long text)
 * @param {string} text - Text to synthesize
 * @param {string} from - Source language (English only)
 * @returns {Promise<Array<string>>} Array of audio data URLs
 */
async function getAudioUrl(text = '', from = 'English') {
  const config = configModule.getConfig();
  let authConfig;

  try {
    authConfig = await elevenLabsAuth.resolveAuthConfig(config.api.elevenlabs || {}, { persistTokens: true });
  } catch (error) {
    console.error('[ElevenLabs TTS] Not configured. Please set Bearer Token or Refresh Token in settings.', error.message);
    return [];
  }

  // Language mapping (ElevenLabs doesn't use language codes for synthesis)
  // But we keep the parameter for consistency with other TTS engines
  const languageMap = {
    'Japanese': 'ja',
    'English': 'en',
    'Traditional-Chinese': 'zh-TW',
    'Simplified-Chinese': 'zh-CN',
  };
  const language = languageMap[from] || 'en';

  // Split text and synthesize chunks in parallel
  const texts = splitText(text);
  const queue = new PromiseQueue(SYNTHESIS_CONCURRENCY);
  const results = await Promise.allSettled(
    texts.map(chunk => queue.add(() => synthesizeSpeech(chunk, language, authConfig, { skipAuthResolve: true })))
  );

  return results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
}

/**
 * Test ElevenLabs configuration
 * @returns {Promise<Object>} Test result
 */
async function testConfiguration() {
  try {
    const config = configModule.getConfig();
    const elevenLabsConfig = config.api.elevenlabs || {};

    const authConfig = await elevenLabsAuth.resolveAuthConfig(elevenLabsConfig, { persistTokens: true });

    // Test with a short text
    const testText = 'Hello from ElevenLabs TTS!';
    const audioUrl = await synthesizeSpeech(testText, 'en', authConfig, { skipAuthResolve: true });

    return {
      success: true,
      message: '配置测试成功',
      audioUrl: audioUrl
    };
  } catch (error) {
    return {
      success: false,
      message: error.message
    };
  }
}

module.exports = {
  synthesizeSpeech,
  getAudioUrl,
  testConfiguration
};
