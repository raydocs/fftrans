'use strict';

/**
 * Retry utility with exponential backoff
 * Provides robust error handling for network requests and API calls
 */

/**
 * Default function to determine if an error is transient (retryable)
 * @param {Error} error - The error to check
 * @returns {boolean} - True if the error is transient
 */
function isTransientError(error) {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  // HTTP status codes that are retryable
  const status = error.response?.status || error.status;
  if (status) {
    // 429 = Rate limited, 5xx = Server errors
    return status === 429 || (status >= 500 && status < 600);
  }

  // Axios timeout
  if (error.code === 'ECONNABORTED') {
    return true;
  }

  return false;
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Configuration options
 * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
 * @param {number} [options.initialDelayMs=1000] - Initial delay before first retry
 * @param {number} [options.maxDelayMs=10000] - Maximum delay between retries
 * @param {number} [options.backoffMultiplier=2] - Multiplier for exponential backoff
 * @param {Function} [options.isRetryable] - Function to determine if error is retryable
 * @param {Function} [options.onRetry] - Callback called before each retry
 * @returns {Promise<*>} - Result of the function
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    isRetryable = isTransientError,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt or error is not retryable
      if (attempt === maxRetries || !isRetryable(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
      const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
      const delayMs = Math.min(baseDelay + jitter, maxDelayMs);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry({
          attempt: attempt + 1,
          maxRetries,
          error,
          delayMs
        });
      }

      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delayMs)}ms...`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Create a retry wrapper for a specific function
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Retry options
 * @returns {Function} - Wrapped function with retry logic
 */
function withRetry(fn, options = {}) {
  return async (...args) => {
    return retryWithBackoff(() => fn(...args), options);
  };
}

module.exports = {
  retryWithBackoff,
  withRetry,
  isTransientError,
  sleep
};
