'use strict';

/**
 * Unified logging system for FFTrans
 * Provides consistent logging with context, timestamps, and log levels
 */

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
};

const currentLogLevel = process.env.LOG_LEVEL
    ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()]
    : (process.env.NODE_ENV === 'production' ? LOG_LEVELS.WARN : LOG_LEVELS.INFO);

/**
 * Format timestamp for logs
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Format log message with context
 */
function formatMessage(level, context, message, data) {
    const timestamp = getTimestamp();
    let formatted = `[${timestamp}] [${level}] [${context}] ${message}`;

    if (data !== undefined) {
        formatted += '\n' + JSON.stringify(data, null, 2);
    }

    return formatted;
}

class Logger {
    /**
     * Log error message
     * @param {string} context - Module or function context
     * @param {string} message - Error message
     * @param {Error|any} error - Error object or additional data
     */
    static error(context, message, error) {
        if (currentLogLevel >= LOG_LEVELS.ERROR) {
            console.error(formatMessage('ERROR', context, message));
            if (error) {
                console.error(error);
            }
        }

        // Note: Persistent logging should be handled by the caller if needed
        // to avoid circular dependencies with app-module
    }

    /**
     * Log warning message
     * @param {string} context - Module or function context
     * @param {string} message - Warning message
     * @param {any} data - Optional additional data
     */
    static warn(context, message, data) {
        if (currentLogLevel >= LOG_LEVELS.WARN) {
            console.warn(formatMessage('WARN', context, message, data));
        }
    }

    /**
     * Log info message (only in development)
     * @param {string} context - Module or function context
     * @param {string} message - Info message
     * @param {any} data - Optional additional data
     */
    static info(context, message, data) {
        if (currentLogLevel >= LOG_LEVELS.INFO) {
            console.log(formatMessage('INFO', context, message, data));
        }
    }

    /**
     * Log debug message (only in development)
     * @param {string} context - Module or function context
     * @param {string} message - Debug message
     * @param {any} data - Optional additional data
     */
    static debug(context, message, data) {
        if (currentLogLevel >= LOG_LEVELS.DEBUG) {
            console.debug(formatMessage('DEBUG', context, message, data));
        }
    }
}

module.exports = Logger;
