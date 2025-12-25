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

  // Already encrypted
  if (value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  try {
    if (isEncryptionAvailable()) {
      const buffer = safeStorage.encryptString(value);
      const base64 = buffer.toString('base64');
      return ENCRYPTED_PREFIX + base64;
    } else {
      Logger.warn('crypto-helper', 'Encryption not available, storing in plain text');
      return value;
    }
  } catch (error) {
    Logger.error('crypto-helper', 'Encryption failed', error.message);
    return value; // Fallback to plain text
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

  // Not encrypted
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    return value;
  }

  try {
    if (isEncryptionAvailable()) {
      const base64 = value.substring(ENCRYPTED_PREFIX.length);
      const buffer = Buffer.from(base64, 'base64');
      return safeStorage.decryptString(buffer);
    } else {
      Logger.warn('crypto-helper', 'Decryption not available');
      return value.substring(ENCRYPTED_PREFIX.length); // Return without prefix
    }
  } catch (error) {
    Logger.error('crypto-helper', 'Decryption failed', error.message);
    return ''; // Return empty string on failure
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

  const encrypted = { ...config };
  encrypted.api = { ...config.api };

  apiKeyFields.forEach(field => {
    if (encrypted.api[field]) {
      encrypted.api[field] = encryptString(encrypted.api[field]);
    }
  });

  // Encrypt nested API keys
  if (encrypted.api.speechify?.bearerToken) {
    encrypted.api.speechify.bearerToken = encryptString(encrypted.api.speechify.bearerToken);
  }

  if (encrypted.api.elevenlabs?.bearerToken) {
    encrypted.api.elevenlabs.bearerToken = encryptString(encrypted.api.elevenlabs.bearerToken);
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

  const decrypted = { ...config };
  decrypted.api = { ...config.api };

  apiKeyFields.forEach(field => {
    if (decrypted.api[field]) {
      decrypted.api[field] = decryptString(decrypted.api[field]);
    }
  });

  // Decrypt nested API keys
  if (decrypted.api.speechify?.bearerToken) {
    decrypted.api.speechify.bearerToken = decryptString(decrypted.api.speechify.bearerToken);
  }

  if (decrypted.api.elevenlabs?.bearerToken) {
    decrypted.api.elevenlabs.bearerToken = decryptString(decrypted.api.elevenlabs.bearerToken);
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
