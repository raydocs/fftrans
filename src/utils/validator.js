'use strict';

const path = require('path');
const { ERROR_MESSAGES } = require('../constants');

/**
 * Input validation utilities
 * Provides security and data validation functions
 */
class Validator {
    /**
     * Validate string input
     * @param {any} str - Value to validate
     * @param {number} minLength - Minimum length
     * @param {number} maxLength - Maximum length
     * @returns {boolean}
     */
    static isValidString(str, minLength = 1, maxLength = Infinity) {
        return typeof str === 'string' &&
            str.length >= minLength &&
            str.length <= maxLength;
    }

    /**
     * Validate that value is one of allowed types
     * @param {string} type - Value to check
     * @param {string[]} allowedTypes - Array of allowed values
     * @returns {boolean}
     */
    static isValidType(type, allowedTypes) {
        return allowedTypes.includes(type);
    }

    /**
     * Sanitize text input by removing dangerous characters
     * @param {string} text - Input text
     * @returns {string} Sanitized text
     */
    static sanitize(text) {
        if (typeof text !== 'string') return '';
        return text.trim().replace(/[<>]/g, '');
    }

    /**
     * Validate file path for security
     * @param {string} filePath - File path to validate
     * @returns {{valid: boolean, error?: string}}
     */
    static validatePath(filePath) {
        if (!filePath || typeof filePath !== 'string') {
            return { valid: false, error: ERROR_MESSAGES.INVALID_PATH };
        }

        // Normalize path
        const normalizedPath = path.normalize(filePath);

        // Check if path is absolute
        if (!path.isAbsolute(normalizedPath)) {
            return { valid: false, error: ERROR_MESSAGES.INVALID_PATH };
        }

        // Check for path traversal
        if (normalizedPath.includes('..')) {
            return { valid: false, error: ERROR_MESSAGES.PATH_TRAVERSAL };
        }

        return { valid: true };
    }

    /**
     * Validate file extension
     * @param {string} filePath - File path
     * @param {string[]} allowedExtensions - Array of allowed extensions (e.g., ['.json', '.txt'])
     * @returns {{valid: boolean, error?: string}}
     */
    static validateExtension(filePath, allowedExtensions) {
        if (!filePath || typeof filePath !== 'string') {
            return { valid: false, error: ERROR_MESSAGES.INVALID_PATH };
        }

        const ext = path.extname(filePath).toLowerCase();

        if (!allowedExtensions.includes(ext)) {
            return { valid: false, error: ERROR_MESSAGES.UNSAFE_EXTENSION };
        }

        return { valid: true };
    }

    /**
     * Comprehensive path validation
     * @param {string} filePath - File path to validate
     * @param {string[]} allowedExtensions - Optional array of allowed extensions
     * @returns {{valid: boolean, error?: string}}
     */
    static validateFilePath(filePath, allowedExtensions = null) {
        // Validate path structure
        const pathCheck = this.validatePath(filePath);
        if (!pathCheck.valid) {
            return pathCheck;
        }

        // Validate extension if specified
        if (allowedExtensions && allowedExtensions.length > 0) {
            const extCheck = this.validateExtension(filePath, allowedExtensions);
            if (!extCheck.valid) {
                return extCheck;
            }
        }

        return { valid: true };
    }
}

module.exports = Validator;
