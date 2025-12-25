'use strict';

/**
 * Unified logging system for FFTrans
 * Provides consistent logging with context, timestamps, and log levels
 * Includes file rotation to prevent log files from growing too large
 */

const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
};

const currentLogLevel = process.env.LOG_LEVEL
    ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()]
    : (process.env.NODE_ENV === 'production' ? LOG_LEVELS.WARN : LOG_LEVELS.INFO);

// Log rotation settings
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5; // Keep last 5 log files
let logFilePath = null;
let fileLoggingEnabled = false;

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

/**
 * Initialize file logging
 * @param {string} logPath - Path to log file
 */
function initFileLogging(logPath) {
    logFilePath = logPath;
    fileLoggingEnabled = true;

    // Rotate logs if needed on startup
    rotateLogsIfNeeded();
}

/**
 * Write to log file
 */
function writeToFile(message) {
    if (!fileLoggingEnabled || !logFilePath) {
        return;
    }

    try {
        // Check if rotation is needed before writing
        rotateLogsIfNeeded();

        // Append to log file
        fs.appendFileSync(logFilePath, message + '\n', 'utf8');
    } catch (error) {
        // Don't use Logger.error here to avoid infinite recursion
        console.error('[Logger] Failed to write to log file:', error.message);
    }
}

/**
 * Rotate logs if current log file exceeds max size
 */
function rotateLogsIfNeeded() {
    if (!logFilePath || !fs.existsSync(logFilePath)) {
        return;
    }

    try {
        const stats = fs.statSync(logFilePath);

        if (stats.size > MAX_LOG_SIZE) {
            const logDir = path.dirname(logFilePath);
            const logName = path.basename(logFilePath);
            const timestamp = Date.now();

            // Rename current log file
            const rotatedPath = path.join(logDir, `${logName}.${timestamp}`);
            fs.renameSync(logFilePath, rotatedPath);

            // Clean up old log files
            cleanOldLogs(logDir, logName);

            console.log(`[Logger] Log rotated: ${rotatedPath}`);
        }
    } catch (error) {
        console.error('[Logger] Log rotation failed:', error.message);
    }
}

/**
 * Remove old log files, keeping only MAX_LOG_FILES most recent
 */
function cleanOldLogs(logDir, logName) {
    try {
        const files = fs.readdirSync(logDir);

        // Find all rotated log files
        const logFiles = files
            .filter(file => file.startsWith(logName + '.'))
            .map(file => ({
                name: file,
                path: path.join(logDir, file),
                time: fs.statSync(path.join(logDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time); // Sort by time, newest first

        // Delete old files beyond MAX_LOG_FILES
        logFiles.slice(MAX_LOG_FILES).forEach(file => {
            try {
                fs.unlinkSync(file.path);
                console.log(`[Logger] Deleted old log: ${file.name}`);
            } catch (error) {
                console.error(`[Logger] Failed to delete ${file.name}:`, error.message);
            }
        });
    } catch (error) {
        console.error('[Logger] Failed to clean old logs:', error.message);
    }
}

class Logger {
    /**
     * Initialize logger with file path
     * @param {string} logPath - Path to log file
     */
    static init(logPath) {
        initFileLogging(logPath);
    }

    /**
     * Log error message
     * @param {string} context - Module or function context
     * @param {string} message - Error message
     * @param {Error|any} error - Error object or additional data
     */
    static error(context, message, error) {
        const formatted = formatMessage('ERROR', context, message);

        if (currentLogLevel >= LOG_LEVELS.ERROR) {
            console.error(formatted);
            if (error) {
                console.error(error);
            }
        }

        // Write to file
        writeToFile(formatted);
        if (error) {
            writeToFile(String(error));
        }
    }

    /**
     * Log warning message
     * @param {string} context - Module or function context
     * @param {string} message - Warning message
     * @param {any} data - Optional additional data
     */
    static warn(context, message, data) {
        const formatted = formatMessage('WARN', context, message, data);

        if (currentLogLevel >= LOG_LEVELS.WARN) {
            console.warn(formatted);
        }

        // Write to file
        writeToFile(formatted);
    }

    /**
     * Log info message
     * @param {string} context - Module or function context
     * @param {string} message - Info message
     * @param {any} data - Optional additional data
     */
    static info(context, message, data) {
        const formatted = formatMessage('INFO', context, message, data);

        if (currentLogLevel >= LOG_LEVELS.INFO) {
            console.log(formatted);
        }

        // Only write INFO to file in development/debug mode
        if (process.env.NODE_ENV !== 'production') {
            writeToFile(formatted);
        }
    }

    /**
     * Log debug message (only in development)
     * @param {string} context - Module or function context
     * @param {string} message - Debug message
     * @param {any} data - Optional additional data
     */
    static debug(context, message, data) {
        const formatted = formatMessage('DEBUG', context, message, data);

        if (currentLogLevel >= LOG_LEVELS.DEBUG) {
            console.debug(formatted);
        }

        // DEBUG logs are not written to file to save space
    }

    /**
     * Get current log file size
     * @returns {number} Size in bytes, or 0 if file doesn't exist
     */
    static getLogFileSize() {
        if (!logFilePath || !fs.existsSync(logFilePath)) {
            return 0;
        }

        try {
            return fs.statSync(logFilePath).size;
        } catch {
            return 0;
        }
    }

    /**
     * Manually trigger log rotation
     */
    static rotate() {
        rotateLogsIfNeeded();
    }
}

module.exports = Logger;
