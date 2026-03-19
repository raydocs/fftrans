'use strict';

/**
 * Crypto Helper - Secure API Key Storage
 *
 * Uses Electron's safeStorage API to encrypt/decrypt sensitive data
 * like API keys before storing in config.json
 */

const { safeStorage } = require('electron');
const Logger = require('./logger');

// Prefix to identify encrypted values
const ENCRYPTED_PREFIX = 'enc:';

/**
 * Check if encryption is available on this platform
 */
function isEncryptionAvailable() {
  try {
    return safeStorage && safeStorage.isEncryptionAvailable();
  } catch (error) {
    Logger.warn('crypto-helper', 'Encryption check failed', error.message);
    return false;
  }
}

/**
 * Encrypt a string value
 * @param {string} value - Plain text value to encrypt
 * @returns {string} Encrypted value with prefix, or original if encryption unavailable
 */
function encryptString(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  if (value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  try {
    if (isEncryptionAvailable()) {
      const buffer = safeStorage.encryptString(value);
      const base64 = buffer.toString('base64');
      return ENCRYPTED_PREFIX + base64;
    }

    Logger.warn('crypto-helper', 'Encryption not available, storing in plain text');
    return value;
  } catch (error) {
    Logger.error('crypto-helper', 'Encryption failed', error.message);
    return value;
  }
}

/**
 * Decrypt a string value
 * @param {string} value - Encrypted value with prefix
 * @returns {string} Decrypted plain text value, or original if not encrypted
 */
function decryptString(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  try {
    if (isEncryptionAvailable()) {
      const base64 = value.substring(ENCRYPTED_PREFIX.length);
      const buffer = Buffer.from(base64, 'base64');
      return safeStorage.decryptString(buffer);
    }

    Logger.warn('crypto-helper', 'Decryption not available');
    return value.substring(ENCRYPTED_PREFIX.length);
  } catch (error) {
    Logger.error('crypto-helper', 'Decryption failed', error.message);
    return '';
  }
}

/**
 * Check if a value is encrypted
 * @param {string} value - Value to check
 * @returns {boolean} True if value is encrypted
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

function cloneNestedApiConfig(config) {
  const cloned = { ...config };
  cloned.api = { ...config.api };

  if (config.api?.speechify && typeof config.api.speechify === 'object') {
    cloned.api.speechify = { ...config.api.speechify };
  }

  if (config.api?.elevenlabs && typeof config.api.elevenlabs === 'object') {
    cloned.api.elevenlabs = { ...config.api.elevenlabs };
  }

  return cloned;
}

/**
 * Encrypt API keys in config object
 * @param {object} config - Configuration object
 * @returns {object} Config with encrypted API keys
 */
function encryptApiKeys(config) {
  if (!config || !config.api) {
    return config;
  }

  const apiKeyFields = [
    'googleVisionApiKey',
    'geminiApiKey',
    'gptApiKey',
    'cohereToken',
    'kimiToken',
    'llmApiKey',
    'openRouterApiKey'
  ];

  const encrypted = cloneNestedApiConfig(config);

  apiKeyFields.forEach((field) => {
    if (encrypted.api[field]) {
      encrypted.api[field] = encryptString(encrypted.api[field]);
    }
  });

  if (encrypted.api.speechify?.bearerToken) {
    encrypted.api.speechify.bearerToken = encryptString(encrypted.api.speechify.bearerToken);
  }

  if (encrypted.api.elevenlabs?.refreshToken) {
    encrypted.api.elevenlabs.refreshToken = encryptString(encrypted.api.elevenlabs.refreshToken);
  }

  if (encrypted.api.elevenlabs?.appCheckToken) {
    encrypted.api.elevenlabs.appCheckToken = encryptString(encrypted.api.elevenlabs.appCheckToken);
  }

  return encrypted;
}

/**
 * Decrypt API keys in config object
 * @param {object} config - Configuration object with encrypted keys
 * @returns {object} Config with decrypted API keys
 */
function decryptApiKeys(config) {
  if (!config || !config.api) {
    return config;
  }

  const apiKeyFields = [
    'googleVisionApiKey',
    'geminiApiKey',
    'gptApiKey',
    'cohereToken',
    'kimiToken',
    'llmApiKey',
    'openRouterApiKey'
  ];

  const decrypted = cloneNestedApiConfig(config);

  apiKeyFields.forEach((field) => {
    if (decrypted.api[field]) {
      decrypted.api[field] = decryptString(decrypted.api[field]);
    }
  });

  if (decrypted.api.speechify?.bearerToken) {
    decrypted.api.speechify.bearerToken = decryptString(decrypted.api.speechify.bearerToken);
  }

  if (decrypted.api.elevenlabs?.bearerToken) {
    decrypted.api.elevenlabs.bearerToken = decryptString(decrypted.api.elevenlabs.bearerToken);
  }

  if (decrypted.api.elevenlabs?.refreshToken) {
    decrypted.api.elevenlabs.refreshToken = decryptString(decrypted.api.elevenlabs.refreshToken);
  }

  if (decrypted.api.elevenlabs?.appCheckToken) {
    decrypted.api.elevenlabs.appCheckToken = decryptString(decrypted.api.elevenlabs.appCheckToken);
  }

  return decrypted;
}

module.exports = {
  isEncryptionAvailable,
  encryptString,
  decryptString,
  isEncrypted,
  encryptApiKeys,
  decryptApiKeys,
};
