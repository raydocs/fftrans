'use strict';

/**
 * OPTIMIZATION: Multi-line text batcher for reducing API calls
 *
 * Problem: Game dialogues often contain multiple lines (3-5 lines in a dialog box)
 *          Each line triggers a separate translation request
 *          Example: 3 lines × 500ms = 1500ms total
 *
 * Solution: Batch multiple lines into a single request
 *          Combined request: 1 × 600ms = 600ms (60% faster)
 *          API calls reduced by 66% (3 → 1)
 *
 * Usage:
 *   const batcher = require('./multiline-batcher');
 *   const result = await batcher.addLine(text, translation, table, type);
 */

const configModule = require('./config-module');
const Logger = require('../../utils/logger');

class MultilineBatcher {
  constructor() {
    // Pending lines waiting to be batched
    this.pendingLines = [];

    // Timer for batch window
    this.batchTimer = null;

    // Configuration
    this.config = {
      enabled: true,              // Enable/disable batching
      batchWindow: 100,           // Wait 100ms to collect lines
      maxBatchSize: 10,           // Maximum lines per batch
      separator: '\n||||SEP||||\n' // Separator between lines
    };

    // Statistics
    this.stats = {
      totalLines: 0,
      totalBatches: 0,
      linesPerBatch: [],
      savedApiCalls: 0
    };
  }

  /**
   * Check if batching is enabled
   */
  isEnabled() {
    try {
      const config = configModule.getConfig();
      return config.translation?.multilineBatching !== false && this.config.enabled;
    } catch {
      return this.config.enabled;
    }
  }

  /**
   * Add a line to the batch queue
   * Returns a promise that resolves with the translated text
   *
   * @param {string} text - Text to translate
   * @param {Object} translation - Translation config (engine, from, to, etc.)
   * @param {Array} table - Code table for text processing
   * @param {string} type - Text type (sentence, name, dialogue)
   * @returns {Promise<string>} - Translated text
   */
  addLine(text, translation, table, type) {
    // If batching disabled, return null to use normal translation
    if (!this.isEnabled()) {
      return null;
    }

    this.stats.totalLines++;

    return new Promise((resolve, reject) => {
      // Add to pending queue
      this.pendingLines.push({
        text,
        translation,
        table,
        type,
        resolve,
        reject,
        timestamp: Date.now()
      });

      // If we hit max batch size, process immediately
      if (this.pendingLines.length >= this.config.maxBatchSize) {
        this._processBatch();
        return;
      }

      // Reset batch timer
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }

      // Set new timer
      this.batchTimer = setTimeout(() => {
        this._processBatch();
      }, this.config.batchWindow);
    });
  }

  /**
   * Process the current batch of lines
   * Groups lines by translation config and sends batched requests
   */
  async _processBatch() {
    if (this.pendingLines.length === 0) {
      return;
    }

    // Take all pending lines
    const batch = this.pendingLines;
    this.pendingLines = [];
    this.batchTimer = null;

    Logger.info('multiline-batcher', `Processing batch of ${batch.length} lines`);

    // Group by translation config (engine, from, to must match)
    const groups = this._groupByConfig(batch);

    // Process each group
    for (const [configKey, items] of groups.entries()) {
      try {
        await this._processBatchGroup(items);
        this.stats.totalBatches++;
        this.stats.linesPerBatch.push(items.length);

        if (items.length > 1) {
          this.stats.savedApiCalls += (items.length - 1);
        }
      } catch (error) {
        Logger.error('multiline-batcher', `Batch processing failed for group ${configKey}`, error);
        // Reject all items in this group
        items.forEach(item => item.reject(error));
      }
    }
  }

  /**
   * Process a group of lines with the same translation config
   */
  async _processBatchGroup(items) {
    if (items.length === 1) {
      // Single item - process directly without batching
      return this._processSingleItem(items[0]);
    }

    // Multiple items - batch them
    Logger.info('multiline-batcher', `Batching ${items.length} lines into single request`);

    // Combine all texts with separator
    const combinedText = items.map(item => item.text).join(this.config.separator);

    try {
      // Import translate module (avoid circular dependency)
      const translateModule = require('./translate-module');

      // Single translation request for all lines
      const combinedResult = await translateModule.translate(
        combinedText,
        items[0].translation,
        items[0].table,
        items[0].type
      );

      // Split result back into individual lines
      const results = combinedResult.split(this.config.separator);

      // Handle edge case: AI might not preserve exact separator count
      if (results.length !== items.length) {
        Logger.warn('multiline-batcher',
          `Result count mismatch: expected ${items.length}, got ${results.length}`);

        // Fallback: process individually if split failed
        return this._processFallbackIndividual(items);
      }

      // Resolve individual promises with their results
      items.forEach((item, idx) => {
        const result = (results[idx] || '').trim();
        Logger.info('multiline-batcher', `Line ${idx + 1}/${items.length}: "${item.text}" → "${result}"`);
        item.resolve(result);
      });

    } catch (error) {
      Logger.error('multiline-batcher', 'Batch translation failed, falling back to individual', error);

      // Fallback: process each line individually
      return this._processFallbackIndividual(items);
    }
  }

  /**
   * Process a single item (no batching needed)
   */
  async _processSingleItem(item) {
    try {
      const translateModule = require('./translate-module');
      const result = await translateModule.translate(
        item.text,
        item.translation,
        item.table,
        item.type
      );
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    }
  }

  /**
   * Fallback: Process items individually when batching fails
   */
  async _processFallbackIndividual(items) {
    const translateModule = require('./translate-module');

    for (const item of items) {
      try {
        const result = await translateModule.translate(
          item.text,
          item.translation,
          item.table,
          item.type
        );
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }
  }

  /**
   * Group batch items by translation configuration
   * Items with same engine, from, to, and type can be batched together
   */
  _groupByConfig(batch) {
    const groups = new Map();

    batch.forEach(item => {
      // Create a key based on translation config
      const key = this._getConfigKey(item);

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(item);
    });

    return groups;
  }

  /**
   * Generate a unique key for a translation configuration
   */
  _getConfigKey(item) {
    return [
      item.translation.engine || 'unknown',
      item.translation.from || '',
      item.translation.to || '',
      item.type || 'sentence'
    ].join(':');
  }

  /**
   * Get batching statistics
   */
  getStats() {
    const avgLinesPerBatch = this.stats.linesPerBatch.length > 0
      ? this.stats.linesPerBatch.reduce((a, b) => a + b, 0) / this.stats.linesPerBatch.length
      : 0;

    return {
      enabled: this.isEnabled(),
      totalLines: this.stats.totalLines,
      totalBatches: this.stats.totalBatches,
      avgLinesPerBatch: avgLinesPerBatch.toFixed(2),
      savedApiCalls: this.stats.savedApiCalls,
      apiCallReduction: this.stats.totalLines > 0
        ? `${((this.stats.savedApiCalls / this.stats.totalLines) * 100).toFixed(1)}%`
        : '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalLines: 0,
      totalBatches: 0,
      linesPerBatch: [],
      savedApiCalls: 0
    };
  }

  /**
   * Cleanup: process any pending batches immediately
   */
  async cleanup() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingLines.length > 0) {
      Logger.info('multiline-batcher', `Cleanup: processing ${this.pendingLines.length} pending lines`);
      await this._processBatch();
    }
  }
}

// Global singleton instance
const globalMultilineBatcher = new MultilineBatcher();

module.exports = {
  globalMultilineBatcher,
  MultilineBatcher,
};
