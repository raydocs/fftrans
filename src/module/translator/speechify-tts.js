'use strict';

// axios for HTTP requests
const axios = require('axios');

// config module
const configModule = require('../system/config-module');

// Speechify API endpoint (fixed)
const SPEECHIFY_API_URL = 'https://audio.api.speechify.com/v3/synthesis/get';

// Voice ID mapping for different languages
const voiceMapping = {
  Japanese: 'gwyneth',  // Can be customized
  English: 'gwyneth',
  'Traditional-Chinese': 'gwyneth',
  'Simplified-Chinese': 'gwyneth',
};

// punctuations for text splitting
const punctuations = {
  first: /。|！|？|\.|!|\?/i,
  second: /、|,/i,
  third: /\u3000| /i,
};

/**
 * Get audio URLs from Speechify API
 * @param {string} text - Text to synthesize
 * @param {string} from - Source language (English only)
 * @returns {Promise<string[]>} Array of audio data URLs
 */
async function getAudioUrl(text = '', from = 'English') {
  const config = configModule.getConfig();
  const speechifyConfig = config.api.speechify || {};

  // Check if Speechify is configured
  if (!speechifyConfig.bearerToken) {
    console.error('[Speechify TTS] Not configured. Please set Bearer Token in settings.');
    return [];
  }

  // Split text into chunks
  const textArray = splitText(text);
  const urlArray = [];

  for (let index = 0; index < textArray.length; index++) {
    const textChunk = textArray[index];

    if (textChunk.length > 0) {
      try {
        const audioDataUrl = await synthesizeSpeech(textChunk, from, speechifyConfig);
        if (audioDataUrl) {
          urlArray.push(audioDataUrl);
        }
      } catch (error) {
        console.error(`[Speechify TTS] Error synthesizing chunk ${index}:`, error.message);
        // Don't stop on error, continue with next chunk
      }
    }
  }

  return urlArray;
}

/**
 * Synthesize speech using Speechify API
 * @param {string} text - Text to synthesize
 * @param {string} language - Language code
 * @param {object} config - Speechify configuration
 * @returns {Promise<string>} Audio data URL
 */
async function synthesizeSpeech(text, language, config) {
  const {
    bearerToken,
    voiceId,
    audioFormat = 'ogg',
  } = config;

  try {
    // Build SSML text
    const ssml = `<speak>${escapeXml(text)}</speak>`;

    // Build request payload (Speechify format)
    const payload = {
      ssml: ssml,
      voice: voiceId || voiceMapping[language] || 'gwyneth',
      forcedAudioFormat: audioFormat,
      forwardContext: {
        type: 'text',
        data: text
      }
    };

    // Build headers with Bearer Token and required Speechify headers
    const headers = {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'X-Speechify-Client': 'DesktopExtension',
      'X-Speechify-Client-Version': '12.13.1',
      'X-Speechify-Synthesis-Options': 'sentence-splitting=false',
    };

    console.log('[Speechify TTS] Requesting audio for text:', text.substring(0, 50) + '...');

    // Make API request - response is binary audio data
    const response = await axios.post(SPEECHIFY_API_URL, payload, {
      headers,
      timeout: 30000,
      responseType: 'arraybuffer',  // Binary data
    });

    // Convert binary audio to data URL
    const audioDataUrl = convertBinaryToDataUrl(response.data, audioFormat);

    console.log('[Speechify TTS] Audio generated successfully');
    return audioDataUrl;

  } catch (error) {
    if (error.response) {
      console.error('[Speechify TTS] API Error:', error.response.status, error.response.statusText);
      if (error.response.status === 401 || error.response.status === 403) {
        console.error('[Speechify TTS] Authentication failed. Please update your Bearer Token in settings.');
      }
    } else {
      console.error('[Speechify TTS] Network Error:', error.message);
    }
    throw error;
  }
}

/**
 * Escape XML special characters for SSML
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert binary audio to data URL
 * @param {Buffer} binaryData - Binary audio data
 * @param {string} format - Audio format (ogg, mp3, etc.)
 * @returns {string} Data URL
 */
function convertBinaryToDataUrl(binaryData, format = 'ogg') {
  const base64 = Buffer.from(binaryData).toString('base64');
  const mimeType = format === 'ogg' ? 'audio/ogg' : `audio/${format}`;
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Split text into chunks (max 200 chars at punctuation)
 */
function splitText(text = '') {
  let startIndex = 0;
  let textArray = [text];

  while (textArray[startIndex] && textArray[startIndex].length >= 200) {
    const result = splitText2(textArray[startIndex]);
    textArray[startIndex] = result[0].trim();
    textArray.push(result[1].trim());
    startIndex++;
  }

  return textArray.filter(t => t.length > 0);
}

/**
 * Split text at punctuation (internal helper)
 */
function splitText2(text = '') {
  // Try to split at first-level punctuation
  for (let index = 199; index >= 0; index--) {
    const char = text[index];
    if (punctuations.first.test(char)) {
      return [text.slice(0, index + 1), text.slice(index + 1)];
    }
  }

  // Try second-level punctuation
  for (let index = 199; index >= 0; index--) {
    const char = text[index];
    if (punctuations.second.test(char)) {
      return [text.slice(0, index + 1), text.slice(index + 1)];
    }
  }

  // Try third-level punctuation (spaces)
  for (let index = 199; index >= 0; index--) {
    const char = text[index];
    if (punctuations.third.test(char)) {
      return [text.slice(0, index + 1), text.slice(index + 1)];
    }
  }

  // Force split at 200
  return [text.slice(0, 200), text.slice(200)];
}

/**
 * Test Speechify configuration
 * @returns {Promise<object>} Test result
 */
async function testConfiguration() {
  const testText = 'Hello, this is a test.';

  try {
    const urls = await getAudioUrl(testText, 'English');
    if (urls.length > 0) {
      return {
        success: true,
        message: 'Configuration test successful',
        audioUrl: urls[0],
      };
    } else {
      return {
        success: false,
        message: 'No audio URL returned',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error.message,
      error: error,
    };
  }
}

// module exports
module.exports = {
  getAudioUrl,
  testConfiguration,
};
