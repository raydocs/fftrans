'use strict';

/**
 * Translation Batch Processor
 *
 * Merges multiple translation requests for the same engine within a time window
 * to reduce network round trips and improve throughput.
 *
 * OPTIMIZATION:
 * - Batches requests in 30ms windows (configurable)
 * - Uses unique delimiter to separate texts
 * - Only applies to non-streaming engines (Baidu, Youdao, Papago, DeepL)
 * - Limits batch size to avoid overly long requests
 */

// OPTIMIZATION: performance monitoring
const { globalMonitor } = require('./performance-monitor');

// Batch configuration
const BATCH_WINDOW_MS = 30; // Time window to collect requests
const MAX_BATCH_SIZE = 10;  // Maximum number of requests per batch
const MAX_BATCH_LENGTH = 1000; // Maximum total character length per batch
const DELIMITER = '\n###TATARU_SEP###\n'; // Unique separator for text segments

// Engines that support batching (non-streaming)
const BATCHABLE_ENGINES = new Set(['Baidu', 'Youdao', 'Papago', 'DeepL']);

// Per-engine batch queues
const engineQueues = new Map(); // engine -> { requests: [], timer: null }

/**
 * Check if an engine supports batching
 */
function isBatchable(engine) {
  return BATCHABLE_ENGINES.has(engine);
}

/**
 * Add a translation request to the batch queue
 * Returns a promise that resolves with the translation result
 */
function addToBatch(text, translation, translateFn) {
  const engine = translation.engine;

  // Validate engine
  if (!isBatchable(engine)) {
    // Not batchable - execute immediately
    return translateFn(text, translation);
  }

  // Create or get queue for this engine
  if (!engineQueues.has(engine)) {
    engineQueues.set(engine, {
      requests: [],
      timer: null,
    });
  }

  const queue = engineQueues.get(engine);

  // Create promise for this request
  return new Promise((resolve, reject) => {
    // Add to queue
    queue.requests.push({
      text,
      translation,
      resolve,
      reject,
    });

    // Check if we should flush immediately (queue full or too long)
    const totalLength = queue.requests.reduce((sum, req) => sum + req.text.length, 0);
    if (queue.requests.length >= MAX_BATCH_SIZE || totalLength >= MAX_BATCH_LENGTH) {
      // Flush immediately
      if (queue.timer) {
        clearTimeout(queue.timer);
        queue.timer = null;
      }
      flushQueue(engine, translateFn);
      return;
    }

    // Schedule batch execution if not already scheduled
    if (!queue.timer) {
      queue.timer = setTimeout(() => {
        queue.timer = null;
        flushQueue(engine, translateFn);
      }, BATCH_WINDOW_MS);
    }
  });
}

/**
 * Flush the batch queue for an engine
 * Combines all pending requests into a single translation call
 */
async function flushQueue(engine, translateFn) {
  const queue = engineQueues.get(engine);
  if (!queue || queue.requests.length === 0) {
    return;
  }

  // Extract requests
  const requests = queue.requests.slice();
  queue.requests = [];

  // Single request - no batching needed
  if (requests.length === 1) {
    const { text, translation, resolve, reject } = requests[0];
    try {
      const result = await translateFn(text, translation);
      resolve(result);
    } catch (error) {
      reject(error);
    }
    return;
  }

  // Multiple requests - batch them
  console.log(`[Batcher] Batching ${requests.length} ${engine} requests`);

  // PERF: Record batch statistics
  globalMonitor.recordBatch(requests.length);

  // Combine texts with delimiter
  const combinedText = requests.map(req => req.text).join(DELIMITER);
  const firstTranslation = requests[0].translation;

  try {
    // Execute single batched translation
    const combinedResult = await translateFn(combinedText, firstTranslation);

    // Split result by delimiter
    const results = combinedResult.split(DELIMITER);

    // Validate result count
    if (results.length !== requests.length) {
      console.warn(
        `[Batcher] Result count mismatch: expected ${requests.length}, got ${results.length}`
      );

      // Fallback: resolve all with proportional text
      const avgLength = combinedResult.length / requests.length;
      for (let i = 0; i < requests.length; i++) {
        const start = Math.floor(i * avgLength);
        const end = Math.floor((i + 1) * avgLength);
        requests[i].resolve(combinedResult.substring(start, end).trim());
      }
      return;
    }

    // Resolve each request with its result
    for (let i = 0; i < requests.length; i++) {
      requests[i].resolve(results[i].trim());
    }

  } catch (error) {
    console.error(`[Batcher] Batch translation failed for ${engine}:`, error);

    // On error, reject all requests
    for (const req of requests) {
      req.reject(error);
    }
  }
}

/**
 * Cleanup: flush all pending batches
 * Call this on app shutdown
 */
async function cleanup() {
  const flushPromises = [];

  for (const [engine, queue] of engineQueues.entries()) {
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = null;
    }

    if (queue.requests.length > 0) {
      console.log(`[Batcher] Flushing ${queue.requests.length} pending ${engine} requests`);
      // Note: We can't actually flush without translateFn, so just reject them
      for (const req of queue.requests) {
        req.reject(new Error('Application shutting down'));
      }
      queue.requests = [];
    }
  }

  engineQueues.clear();
}

/**
 * Get batch statistics
 */
function getStats() {
  const stats = {};
  for (const [engine, queue] of engineQueues.entries()) {
    stats[engine] = {
      pending: queue.requests.length,
      scheduled: queue.timer !== null,
    };
  }
  return stats;
}

module.exports = {
  addToBatch,
  isBatchable,
  cleanup,
  getStats,
  BATCHABLE_ENGINES,
};
