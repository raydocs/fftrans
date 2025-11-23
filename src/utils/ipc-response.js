'use strict';

/**
 * Standardized IPC response format
 * Ensures consistent response structure across all IPC handlers
 */
class IPCResponse {
    /**
     * Create a success response
     * @param {any} data - Response data
     * @param {string} message - Optional success message
     * @returns {{success: true, data: any, message?: string}}
     */
    static success(data = null, message = '') {
        const response = { success: true };

        if (data !== null && data !== undefined) {
            response.data = data;
        }

        if (message) {
            response.message = message;
        }

        return response;
    }

    /**
     * Create an error response
     * @param {Error|string} error - Error object or message
     * @param {string} message - Optional custom error message
     * @returns {{success: false, message: string, error?: string}}
     */
    static error(error, message = '') {
        const response = { success: false };

        if (typeof error === 'string') {
            response.message = message || error;
            response.error = error;
        } else if (error instanceof Error) {
            response.message = message || error.message;
            response.error = error.toString();
        } else {
            response.message = message || 'Unknown error occurred';
            response.error = String(error);
        }

        return response;
    }
}

/**
 * Wrapper for async IPC handlers with automatic error handling
 * @param {Function} handlerFn - Async handler function
 * @param {string} context - Context name for logging
 * @returns {Function} Wrapped handler
 */
function createAsyncHandler(handlerFn, context) {
    const Logger = require('./logger');

    return async (...args) => {
        try {
            const result = await handlerFn(...args);
            return IPCResponse.success(result);
        } catch (error) {
            Logger.error(context, 'IPC handler failed', error);
            return IPCResponse.error(error);
        }
    };
}

module.exports = {
    IPCResponse,
    createAsyncHandler,
};
