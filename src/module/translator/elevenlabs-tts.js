/**
 * ElevenLabs TTS Module
 *
 * Provides text-to-speech functionality using ElevenLabs Reader API
 * Uses Bearer Token authentication (Firebase JWT)
 */

const axios = require('axios');
const configModule = require('../system/config-module');

// ElevenLabs API configuration
const API_BASE_URL = 'https://api.elevenlabs.io/v1';
const VOICES_ENDPOINT = `${API_BASE_URL}/reader/voices`;
const TTS_ENDPOINT = `${API_BASE_URL}/text-to-speech`;

// punctuations for text splitting (same as Google TTS)
const punctuations = {
  first: /。|！|？|\.|!|\?/i,
  second: /、|,/i,
  third: /\u3000| /i,
};

/**
 * Get list of available voices
 * @param {string} bearerToken - Firebase JWT token
 * @returns {Promise<Array>} Array of voice objects
 */
async function getVoices(bearerToken) {
  try {
    const response = await axios.get(VOICES_ENDPOINT, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Accept': '*/*'
      },
      timeout: 10000
    });

    return response.data.voices || [];
  } catch (error) {
    console.error('[ElevenLabs TTS] Failed to fetch voices:', error.message);
    throw error;
  }
}

/**
 * Synthesize speech using ElevenLabs API
 * @param {string} text - Text to synthesize
 * @param {string} language - Language code (not used by ElevenLabs, accepts all)
 * @param {Object} config - Configuration object
 * @param {string} config.bearerToken - Firebase JWT token
 * @param {string} config.voiceId - Voice ID
 * @param {string} config.modelId - Model ID (default: eleven_turbo_v2_5)
 * @returns {Promise<string>} Data URL of audio
 */
async function synthesizeSpeech(text, language, config) {
  const { bearerToken, voiceId = 'nPczCjzI2devNBz1zQrb', modelId = 'eleven_turbo_v2_5' } = config;

  if (!bearerToken) {
    throw new Error('Bearer Token is required');
  }

  if (!text || text.trim() === '') {
    throw new Error('Text is required');
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
        'Accept': 'audio/mpeg'
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
  const elevenLabsConfig = config.api.elevenlabs || {};

  if (!elevenLabsConfig.bearerToken) {
    console.error('[ElevenLabs TTS] Not configured. Please set Bearer Token in settings.');
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

  // Split text using the same logic as Google TTS
  const texts = splitText(text);

  // Synthesize each chunk
  const audioUrls = [];
  for (const chunk of texts) {
    try {
      const audioUrl = await synthesizeSpeech(chunk, language, elevenLabsConfig);
      if (audioUrl) {
        audioUrls.push(audioUrl);
      }
    } catch (error) {
      console.error('[ElevenLabs TTS] Failed to synthesize chunk:', error.message);
      // Continue with next chunk instead of failing completely
    }
  }

  return audioUrls;
}

/**
 * Test ElevenLabs configuration
 * @returns {Promise<Object>} Test result
 */
async function testConfiguration() {
  try {
    const config = configModule.getConfig();
    const elevenLabsConfig = config.api.elevenlabs || {};

    if (!elevenLabsConfig.bearerToken) {
      return {
        success: false,
        message: 'Bearer Token 未配置'
      };
    }

    // Test with a short text
    const testText = 'Hello from ElevenLabs TTS!';
    const audioUrl = await synthesizeSpeech(testText, 'en', elevenLabsConfig);

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

/**
 * Split text into chunks (same logic as Google TTS)
 * @param {string} text - Text to split
 * @returns {Array<string>} Array of text chunks
 */
function splitText(text = '') {
  let startIndex = 0;
  let textArray = [text];

  // Split if text exceeds 200 characters (same as Google TTS)
  while (textArray[startIndex] && textArray[startIndex].length >= 200) {
    const result = splitText2(textArray[startIndex]);

    textArray[startIndex] = result[0].trim();
    textArray.push(result[1].trim());

    startIndex++;
  }

  return textArray.filter(t => t.length > 0);
}

/**
 * Split text at punctuation boundaries
 * @param {string} text - Text to split
 * @returns {Array<string>} Two-element array [before, after]
 */
function splitText2(text = '') {
  // Try to split at primary punctuation (。！？.!?)
  for (let index = 199; index >= 0; index--) {
    const char = text[index];
    if (punctuations.first.test(char)) {
      return [text.slice(0, index + 1), text.slice(index + 1)];
    }
  }

  // Try to split at secondary punctuation (、,)
  for (let index = 199; index >= 0; index--) {
    const char = text[index];
    if (punctuations.second.test(char)) {
      return [text.slice(0, index + 1), text.slice(index + 1)];
    }
  }

  // Try to split at spaces
  for (let index = 199; index >= 0; index--) {
    const char = text[index];
    if (punctuations.third.test(char)) {
      return [text.slice(0, index + 1), text.slice(index + 1)];
    }
  }

  // If no good split point found, split at 200 characters
  return [text.slice(0, 200), text.slice(200)];
}

module.exports = {
  getVoices,
  synthesizeSpeech,
  getAudioUrl,
  testConfiguration
};
