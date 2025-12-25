'use strict';

/**
 * Config Validator - Validate configuration objects
 *
 * Ensures config values are valid before use to prevent runtime errors
 */

const Logger = require('./logger');

/**
 * Validate configuration object
 * @param {object} config - Configuration to validate
 * @param {object} defaultConfig - Default configuration for reference
 * @returns {object} Validation result { valid: boolean, errors: [] }
 */
function validate(config, defaultConfig) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: ['Config must be an object']
    };
  }

  // Validate indexWindow
  if (config.indexWindow) {
    validateIndexWindow(config.indexWindow, errors);
  }

  // Validate translation
  if (config.translation) {
    validateTranslation(config.translation, errors);
  }

  // Validate api
  if (config.api) {
    validateAPI(config.api, errors);
  }

  // Validate dialog
  if (config.dialog) {
    validateDialog(config.dialog, errors);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate indexWindow configuration
 */
function validateIndexWindow(indexWindow, errors) {
  // Validate timeout (must be numeric string)
  if (indexWindow.timeout !== undefined) {
    const timeout = parseInt(indexWindow.timeout);
    if (isNaN(timeout) || timeout < 0 || timeout > 300) {
      errors.push('indexWindow.timeout must be a number between 0 and 300');
    }
  }

  // Validate ttsEngine
  if (indexWindow.ttsEngine !== undefined) {
    const validEngines = ['google', 'speechify', 'elevenlabs'];
    if (!validEngines.includes(indexWindow.ttsEngine)) {
      errors.push(`indexWindow.ttsEngine must be one of: ${validEngines.join(', ')}`);
    }
  }

  // Validate boolean fields
  const booleanFields = ['shortcut', 'alwaysOnTop', 'focusable', 'minSize', 'hideButton', 'hideDialog', 'clickThrough', 'lock', 'speech', 'compactMode'];
  booleanFields.forEach(field => {
    if (indexWindow[field] !== undefined && typeof indexWindow[field] !== 'boolean') {
      errors.push(`indexWindow.${field} must be a boolean`);
    }
  });

  // Validate numeric fields
  const numericFields = ['x', 'y', 'width', 'height', 'compactWidth', 'compactHeight'];
  numericFields.forEach(field => {
    if (indexWindow[field] !== undefined && typeof indexWindow[field] !== 'number') {
      errors.push(`indexWindow.${field} must be a number`);
    }
  });

  // Validate speechSpeed (must be numeric string)
  if (indexWindow.speechSpeed !== undefined) {
    const speed = parseFloat(indexWindow.speechSpeed);
    if (isNaN(speed) || speed < 0.1 || speed > 10) {
      errors.push('indexWindow.speechSpeed must be between 0.1 and 10');
    }
  }
}

/**
 * Validate translation configuration
 */
function validateTranslation(translation, errors) {
  // Validate engine (will be checked against engineModule.engineList at runtime)
  if (translation.engine !== undefined && typeof translation.engine !== 'string') {
    errors.push('translation.engine must be a string');
  }

  // Validate languages
  const langFields = ['from', 'fromPlayer', 'to'];
  langFields.forEach(field => {
    if (translation[field] !== undefined && typeof translation[field] !== 'string') {
      errors.push(`translation.${field} must be a string`);
    }
  });

  // Validate timeout
  if (translation.timeout !== undefined) {
    const timeout = parseInt(translation.timeout);
    if (isNaN(timeout) || timeout < 1 || timeout > 120) {
      errors.push('translation.timeout must be between 1 and 120 seconds');
    }
  }

  // Validate boolean fields
  const booleanFields = ['autoChange', 'fix', 'skip', 'skipChinese', 'replace'];
  booleanFields.forEach(field => {
    if (translation[field] !== undefined && typeof translation[field] !== 'boolean') {
      errors.push(`translation.${field} must be a boolean`);
    }
  });
}

/**
 * Validate API configuration
 */
function validateAPI(api, errors) {
  // Validate API keys are strings (empty is ok)
  const apiKeyFields = [
    'googleVisionApiKey',
    'geminiApiKey',
    'gptApiKey',
    'cohereToken',
    'kimiToken',
    'llmApiKey',
    'openRouterApiKey'
  ];

  apiKeyFields.forEach(field => {
    if (api[field] !== undefined && typeof api[field] !== 'string') {
      errors.push(`api.${field} must be a string`);
    }
  });

  // Validate model names
  const modelFields = ['geminiModel', 'gptModel', 'cohereModel', 'kimiModel', 'llmApiModel', 'openRouterModel'];
  modelFields.forEach(field => {
    if (api[field] !== undefined && typeof api[field] !== 'string') {
      errors.push(`api.${field} must be a string`);
    }
  });

  // Validate URLs
  if (api.llmApiUrl !== undefined) {
    if (typeof api.llmApiUrl !== 'string') {
      errors.push('api.llmApiUrl must be a string');
    } else if (api.llmApiUrl && !isValidURL(api.llmApiUrl)) {
      errors.push('api.llmApiUrl must be a valid URL');
    }
  }

  // Validate nested objects
  if (api.speechify !== undefined && typeof api.speechify !== 'object') {
    errors.push('api.speechify must be an object');
  }

  if (api.elevenlabs !== undefined && typeof api.elevenlabs !== 'object') {
    errors.push('api.elevenlabs must be an object');
  }
}

/**
 * Validate dialog configuration
 */
function validateDialog(dialog, errors) {
  // Validate weight
  if (dialog.weight !== undefined) {
    const validWeights = ['normal', 'bold', 'lighter', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
    if (!validWeights.includes(String(dialog.weight))) {
      errors.push('dialog.weight must be a valid font-weight value');
    }
  }

  // Validate numeric string fields
  const numericFields = ['fontSize', 'spacing', 'radius'];
  numericFields.forEach(field => {
    if (dialog[field] !== undefined) {
      const value = parseFloat(dialog[field]);
      if (isNaN(value) || value < 0 || value > 10) {
        errors.push(`dialog.${field} must be between 0 and 10`);
      }
    }
  });

  // Validate backgroundColor (hex color)
  if (dialog.backgroundColor !== undefined) {
    if (typeof dialog.backgroundColor !== 'string' || !isValidHexColor(dialog.backgroundColor)) {
      errors.push('dialog.backgroundColor must be a valid hex color (e.g., #RRGGBBAA)');
    }
  }
}

/**
 * Check if a string is a valid URL
 */
function isValidURL(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if a string is a valid hex color
 */
function isValidHexColor(str) {
  return /^#[0-9A-F]{6}([0-9A-F]{2})?$/i.test(str);
}

/**
 * Sanitize configuration by removing invalid values
 * @param {object} config - Configuration to sanitize
 * @param {object} defaultConfig - Default configuration to use for invalid values
 * @returns {object} Sanitized configuration
 */
function sanitize(config, defaultConfig) {
  const result = validate(config, defaultConfig);

  if (result.valid) {
    return config;
  }

  // Log validation errors
  Logger.warn('config-validator', `Configuration has ${result.errors.length} validation errors:`, result.errors.join('; '));

  // Return a deep copy to avoid mutation
  return JSON.parse(JSON.stringify(config));
}

module.exports = {
  validate,
  sanitize,
  isValidURL,
  isValidHexColor
};
