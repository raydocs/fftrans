'use strict';

/**
 * Config Validator - Validate configuration objects
 *
 * Ensures config values are valid before use to prevent runtime errors
 */

const Logger = require('./logger');
const { ELEVENLABS_AUTH_STATES, ELEVENLABS_AUTH_SOURCES } = require('../constants');

function validate(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: ['Config must be an object']
    };
  }

  if (config.indexWindow) {
    validateIndexWindow(config.indexWindow, errors);
  }

  if (config.translation) {
    validateTranslation(config.translation, errors);
  }

  if (config.api) {
    validateAPI(config.api, errors);
  }

  if (config.auth) {
    validateAuth(config.auth, errors);
  }

  if (config.dialog) {
    validateDialog(config.dialog, errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function validateIndexWindow(indexWindow, errors) {
  if (indexWindow.timeout !== undefined) {
    const timeout = parseInt(indexWindow.timeout, 10);
    if (Number.isNaN(timeout) || timeout < 0 || timeout > 300) {
      errors.push('indexWindow.timeout must be a number between 0 and 300');
    }
  }

  if (indexWindow.ttsEngine !== undefined) {
    const validEngines = ['google', 'speechify', 'elevenlabs', 'mimo'];
    if (!validEngines.includes(indexWindow.ttsEngine)) {
      errors.push(`indexWindow.ttsEngine must be one of: ${validEngines.join(', ')}`);
    }
  }

  const booleanFields = ['shortcut', 'alwaysOnTop', 'focusable', 'minSize', 'hideButton', 'hideDialog', 'clickThrough', 'lock', 'speech', 'compactMode'];
  booleanFields.forEach((field) => {
    if (indexWindow[field] !== undefined && typeof indexWindow[field] !== 'boolean') {
      errors.push(`indexWindow.${field} must be a boolean`);
    }
  });

  const numericFields = ['x', 'y', 'width', 'height', 'compactWidth', 'compactHeight'];
  numericFields.forEach((field) => {
    if (indexWindow[field] !== undefined && typeof indexWindow[field] !== 'number') {
      errors.push(`indexWindow.${field} must be a number`);
    }
  });

  if (indexWindow.speechSpeed !== undefined) {
    const speed = parseFloat(indexWindow.speechSpeed);
    if (Number.isNaN(speed) || speed < 0.1 || speed > 10) {
      errors.push('indexWindow.speechSpeed must be between 0.1 and 10');
    }
  }
}

function validateTranslation(translation, errors) {
  if (translation.engine !== undefined && typeof translation.engine !== 'string') {
    errors.push('translation.engine must be a string');
  }

  ['from', 'fromPlayer', 'to'].forEach((field) => {
    if (translation[field] !== undefined && typeof translation[field] !== 'string') {
      errors.push(`translation.${field} must be a string`);
    }
  });

  if (translation.timeout !== undefined) {
    const timeout = parseInt(translation.timeout, 10);
    if (Number.isNaN(timeout) || timeout < 1 || timeout > 120) {
      errors.push('translation.timeout must be between 1 and 120 seconds');
    }
  }

  ['autoChange', 'fix', 'skip', 'skipChinese', 'replace'].forEach((field) => {
    if (translation[field] !== undefined && typeof translation[field] !== 'boolean') {
      errors.push(`translation.${field} must be a boolean`);
    }
  });
}

function validateAPI(api, errors) {
  const apiKeyFields = [
    'googleVisionApiKey',
    'geminiApiKey',
    'gptApiKey',
    'kimiToken',
    'llmApiKey',
    'openRouterApiKey',
    'nvidiaApiKey'
  ];

  apiKeyFields.forEach((field) => validateStringField(api[field], `api.${field}`, errors));

  const modelFields = ['geminiModel', 'gptModel', 'kimiModel', 'llmApiModel', 'openRouterModel', 'nvidiaModel'];
  modelFields.forEach((field) => validateStringField(api[field], `api.${field}`, errors));

  if (api.llmApiUrl !== undefined) {
    if (typeof api.llmApiUrl !== 'string') {
      errors.push('api.llmApiUrl must be a string');
    } else if (api.llmApiUrl && !isValidURL(api.llmApiUrl)) {
      errors.push('api.llmApiUrl must be a valid URL');
    }
  }

  if (api.speechify !== undefined) {
    if (!isPlainObject(api.speechify)) {
      errors.push('api.speechify must be an object');
    } else {
      validateSpeechifyConfig(api.speechify, errors);
    }
  }

  if (api.elevenlabs !== undefined) {
    if (!isPlainObject(api.elevenlabs)) {
      errors.push('api.elevenlabs must be an object');
    } else {
      validateElevenLabsConfig(api.elevenlabs, errors);
    }
  }

  if (api.mimo !== undefined) {
    if (!isPlainObject(api.mimo)) {
      errors.push('api.mimo must be an object');
    } else {
      validateMiMoConfig(api.mimo, errors);
    }
  }
}

function validateSpeechifyConfig(config, errors) {
  validateStringField(config.bearerToken, 'api.speechify.bearerToken', errors);
  validateStringField(config.voiceId, 'api.speechify.voiceId', errors);
  validateStringField(config.audioFormat, 'api.speechify.audioFormat', errors);
  validateBooleanField(config.sentenceSplitting, 'api.speechify.sentenceSplitting', errors);

  if (config.audioFormat !== undefined && !['mp3', 'ogg', 'wav'].includes(config.audioFormat)) {
    errors.push('api.speechify.audioFormat must be one of: mp3, ogg, wav');
  }
}

function validateElevenLabsConfig(config, errors) {
  [
    'bearerToken',
    'refreshToken',
    'appCheckToken',
    'deviceId',
    'voiceId',
    'modelId'
  ].forEach((field) => validateStringField(config[field], `api.elevenlabs.${field}`, errors));

  ['stability', 'similarityBoost', 'style'].forEach((field) => {
    validateNumberStringField(config[field], `api.elevenlabs.${field}`, errors, 0, 1);
  });

  validateBooleanField(config.useSpeakerBoost, 'api.elevenlabs.useSpeakerBoost', errors);
}

function validateMiMoConfig(config, errors) {
  ['apiKey', 'model', 'voice', 'responseFormat', 'style', 'emotion', 'language'].forEach((field) => {
    validateStringField(config[field], `api.mimo.${field}`, errors);
  });

  if (config.responseFormat !== undefined && !['mp3', 'ogg', 'wav'].includes(config.responseFormat)) {
    errors.push('api.mimo.responseFormat must be one of: mp3, ogg, wav');
  }

  if (config.speed !== undefined) {
    const speed = Number(config.speed);
    if (Number.isNaN(speed) || speed < 0.25 || speed > 4) {
      errors.push('api.mimo.speed must be between 0.25 and 4');
    }
  }
}

function validateAuth(auth, errors) {
  if (!isPlainObject(auth)) {
    errors.push('auth must be an object');
    return;
  }

  if (auth.elevenlabs !== undefined) {
    if (!isPlainObject(auth.elevenlabs)) {
      errors.push('auth.elevenlabs must be an object');
    } else {
      validateElevenLabsAuthState(auth.elevenlabs, errors);
    }
  }
}

function validateElevenLabsAuthState(config, errors) {
  validateStringField(config.state, 'auth.elevenlabs.state', errors);
  validateStringField(config.lastValidatedAt, 'auth.elevenlabs.lastValidatedAt', errors);
  validateStringField(config.lastErrorCode, 'auth.elevenlabs.lastErrorCode', errors);
  validateStringField(config.lastErrorMessage, 'auth.elevenlabs.lastErrorMessage', errors);
  validateStringField(config.lastAuthSource, 'auth.elevenlabs.lastAuthSource', errors);

  if (config.extensionBridge !== undefined) {
    if (!isPlainObject(config.extensionBridge)) {
      errors.push('auth.elevenlabs.extensionBridge must be an object');
    } else {
      validateStringField(config.extensionBridge.installToken, 'auth.elevenlabs.extensionBridge.installToken', errors);
      validateStringField(config.extensionBridge.createdAt, 'auth.elevenlabs.extensionBridge.createdAt', errors);
      validateStringField(config.extensionBridge.lastUsedAt, 'auth.elevenlabs.extensionBridge.lastUsedAt', errors);
    }
  }

  if (config.state !== undefined && !Object.values(ELEVENLABS_AUTH_STATES).includes(config.state)) {
    errors.push(`auth.elevenlabs.state must be one of: ${Object.values(ELEVENLABS_AUTH_STATES).join(', ')}`);
  }

  if (config.lastAuthSource !== undefined && !Object.values(ELEVENLABS_AUTH_SOURCES).includes(config.lastAuthSource)) {
    errors.push(`auth.elevenlabs.lastAuthSource must be one of: ${Object.values(ELEVENLABS_AUTH_SOURCES).join(', ')}`);
  }
}

function validateDialog(dialog, errors) {
  if (dialog.weight !== undefined) {
    const validWeights = ['normal', 'bold', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
    if (!validWeights.includes(String(dialog.weight))) {
      errors.push('dialog.weight must be a valid font-weight value');
    }
  }

  ['fontSize', 'spacing', 'radius'].forEach((field) => {
    if (dialog[field] !== undefined) {
      const value = parseFloat(dialog[field]);
      if (Number.isNaN(value) || value < 0 || value > 10) {
        errors.push(`dialog.${field} must be between 0 and 10`);
      }
    }
  });

  if (dialog.backgroundColor !== undefined) {
    if (typeof dialog.backgroundColor !== 'string' || !isValidHexColor(dialog.backgroundColor)) {
      errors.push('dialog.backgroundColor must be a valid hex color (e.g., #RRGGBBAA)');
    }
  }
}

function validateStringField(value, path, errors) {
  if (value !== undefined && typeof value !== 'string') {
    errors.push(`${path} must be a string`);
  }
}

function validateBooleanField(value, path, errors) {
  if (value !== undefined && typeof value !== 'boolean') {
    errors.push(`${path} must be a boolean`);
  }
}

function validateNumberStringField(value, path, errors, min, max) {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    errors.push(`${path} must be a numeric string`);
    return;
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue) || numericValue < min || numericValue > max) {
    errors.push(`${path} must be between ${min} and ${max}`);
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidURL(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidHexColor(str) {
  return /^#[0-9A-F]{6}([0-9A-F]{2})?$/i.test(str);
}

function sanitize(config, defaultConfig) {
  const result = validate(config, defaultConfig);

  if (result.valid) {
    return config;
  }

  Logger.warn('config-validator', `Configuration has ${result.errors.length} validation errors:`, result.errors.join('; '));
  return JSON.parse(JSON.stringify(config));
}

module.exports = {
  validate,
  sanitize,
  isValidURL,
  isValidHexColor
};
