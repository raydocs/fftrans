'use strict';

/**
 * Error Handler - Centralized Error Handling
 *
 * Provides consistent error handling across the application:
 * - Logging with context
 * - User-friendly error messages
 * - Error categorization
 */

const Logger = require('./logger');

// Error severity levels
const ErrorLevel = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// Error categories for better organization
const ErrorCategory = {
  NETWORK: 'network',
  TRANSLATION: 'translation',
  OCR: 'ocr',
  CONFIG: 'config',
  FILE: 'file',
  IPC: 'ipc',
  WINDOW: 'window',
  UNKNOWN: 'unknown'
};

/**
 * Handle an error with logging and optional user notification
 * @param {string} context - The module/function where error occurred
 * @param {Error|string} error - The error object or message
 * @param {object} options - Optional configuration
 * @param {string} options.userMessage - User-friendly message to display
 * @param {string} options.level - Error severity level
 * @param {string} options.category - Error category
 * @param {boolean} options.notify - Whether to notify user (default: false)
 * @param {function} options.notifyFn - Custom notification function
 */
function handle(context, error, options = {}) {
  const {
    userMessage = null,
    level = ErrorLevel.ERROR,
    category = ErrorCategory.UNKNOWN,
    notify = false,
    notifyFn = null
  } = options;

  // Extract error message
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : '';

  // Log the error
  logError(context, errorMessage, errorStack, level, category);

  // Notify user if requested
  if (notify && userMessage) {
    if (notifyFn && typeof notifyFn === 'function') {
      notifyFn(userMessage);
    } else {
      // Lazy load dialog module to avoid circular dependency
      try {
        const dialogModule = require('../module/system/dialog-module');
        dialogModule.addNotification(userMessage);
      } catch (e) {
        console.error('[ErrorHandler] Failed to notify user:', e.message);
      }
    }
  }
}

/**
 * Log error with context and metadata
 */
function logError(context, message, stack, level, category) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${category}] ${message}`;

  switch (level) {
    case ErrorLevel.INFO:
      Logger.info(context, logMessage);
      break;
    case ErrorLevel.WARNING:
      Logger.warn(context, logMessage);
      break;
    case ErrorLevel.CRITICAL:
      Logger.error(context, `CRITICAL: ${logMessage}`, stack);
      // Could add crash reporting here
      break;
    case ErrorLevel.ERROR:
    default:
      Logger.error(context, logMessage, stack);
  }
}

/**
 * Handle network-related errors
 */
function handleNetworkError(context, error, options = {}) {
  return handle(context, error, {
    ...options,
    category: ErrorCategory.NETWORK,
    userMessage: options.userMessage || 'Network error. Please check your connection.',
  });
}

/**
 * Handle translation-related errors
 */
function handleTranslationError(context, error, options = {}) {
  return handle(context, error, {
    ...options,
    category: ErrorCategory.TRANSLATION,
    userMessage: options.userMessage || 'Translation failed. Please try again.',
  });
}

/**
 * Handle OCR-related errors
 */
function handleOCRError(context, error, options = {}) {
  return handle(context, error, {
    ...options,
    category: ErrorCategory.OCR,
    userMessage: options.userMessage || 'Text recognition failed. Please try again.',
  });
}

/**
 * Handle configuration-related errors
 */
function handleConfigError(context, error, options = {}) {
  return handle(context, error, {
    ...options,
    category: ErrorCategory.CONFIG,
    userMessage: options.userMessage || 'Configuration error. Please check settings.',
  });
}

/**
 * Wrap an async function with error handling
 * @param {function} fn - Async function to wrap
 * @param {string} context - Context for error logging
 * @param {object} options - Error handling options
 * @returns {function} Wrapped function
 */
function wrapAsync(fn, context, options = {}) {
  return async function(...args) {
    try {
      return await fn(...args);
    } catch (error) {
      handle(context, error, options);
      throw error; // Re-throw unless specified otherwise
    }
  };
}

/**
 * Safe wrapper that catches and logs errors without re-throwing
 * Useful for non-critical operations
 */
function safe(fn, context, options = {}) {
  return async function(...args) {
    try {
      return await fn(...args);
    } catch (error) {
      handle(context, error, {
        ...options,
        level: options.level || ErrorLevel.WARNING
      });
      return options.defaultValue !== undefined ? options.defaultValue : null;
    }
  };
}

module.exports = {
  handle,
  handleNetworkError,
  handleTranslationError,
  handleOCRError,
  handleConfigError,
  wrapAsync,
  safe,
  ErrorLevel,
  ErrorCategory
};
