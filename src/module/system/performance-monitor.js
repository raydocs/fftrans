'use strict';

/**
 * Performance Monitoring System
 *
 * Tracks key metrics to quantify optimization benefits:
 * - Translation latency (cache hit vs miss)
 * - Cache hit rate
 * - IPC frequency
 * - Batch processing statistics
 * - Text processing time
 */

const Logger = require('../../utils/logger');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      // Translation metrics
      translations: {
        total: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgLatency: 0,
        avgCacheHitLatency: 0,
        avgCacheMissLatency: 0,
        totalLatency: 0,
        cacheHitLatency: 0,
        cacheMissLatency: 0,
      },

      // Batch processing metrics
      batches: {
        total: 0,
        totalRequests: 0,
        avgBatchSize: 0,
        savedRoundTrips: 0,
      },

      // UI update metrics
      uiUpdates: {
        total: 0,
        batched: 0,
        avgBatchDelay: 0,
      },

      // Text processing metrics
      textProcessing: {
        total: 0,
        avgDuration: 0,
        totalDuration: 0,
      },
    };

    // Performance timers
    this.timers = new Map();

    // Auto-report interval (5 minutes)
    this.reportInterval = setInterval(() => {
      this.logReport();
    }, 5 * 60 * 1000);
  }

  /**
   * Start timing an operation
   */
  startTimer(id, category = 'general') {
    this.timers.set(id, {
      category,
      startTime: Date.now(),
    });
  }

  /**
   * End timing and record metric
   */
  endTimer(id, metadata = {}) {
    const timer = this.timers.get(id);
    if (!timer) {
      return 0;
    }

    const duration = Date.now() - timer.startTime;
    this.timers.delete(id);

    // Record based on category
    switch (timer.category) {
      case 'translation':
        this.recordTranslation(duration, metadata);
        break;
      case 'textProcessing':
        this.recordTextProcessing(duration);
        break;
      case 'uiUpdate':
        this.recordUIUpdate(duration, metadata);
        break;
    }

    return duration;
  }

  /**
   * Record translation metrics
   */
  recordTranslation(duration, { cacheHit = false } = {}) {
    const t = this.metrics.translations;

    t.total++;
    t.totalLatency += duration;
    t.avgLatency = t.totalLatency / t.total;

    if (cacheHit) {
      t.cacheHits++;
      t.cacheHitLatency += duration;
      t.avgCacheHitLatency = t.cacheHitLatency / t.cacheHits;
    } else {
      t.cacheMisses++;
      t.cacheMissLatency += duration;
      t.avgCacheMissLatency = t.cacheMissLatency / t.cacheMisses;
    }
  }

  /**
   * Record batch processing
   */
  recordBatch(batchSize) {
    const b = this.metrics.batches;

    b.total++;
    b.totalRequests += batchSize;
    b.avgBatchSize = b.totalRequests / b.total;

    // Each batch saves (batchSize - 1) round trips
    b.savedRoundTrips += (batchSize - 1);
  }

  /**
   * Record text processing time
   */
  recordTextProcessing(duration) {
    const tp = this.metrics.textProcessing;

    tp.total++;
    tp.totalDuration += duration;
    tp.avgDuration = tp.totalDuration / tp.total;
  }

  /**
   * Record UI update
   */
  recordUIUpdate(duration, { batched = false } = {}) {
    const ui = this.metrics.uiUpdates;

    ui.total++;
    if (batched) {
      ui.batched++;
    }
  }

  /**
   * Get cache hit rate percentage
   */
  getCacheHitRate() {
    const t = this.metrics.translations;
    if (t.total === 0) return 0;
    return ((t.cacheHits / t.total) * 100).toFixed(1);
  }

  /**
   * Get batch efficiency percentage
   */
  getBatchEfficiency() {
    const b = this.metrics.batches;
    if (b.total === 0) return 0;
    return ((b.batched / b.total) * 100).toFixed(1);
  }

  /**
   * Get UI batching rate
   */
  getUIBatchingRate() {
    const ui = this.metrics.uiUpdates;
    if (ui.total === 0) return 0;
    return ((ui.batched / ui.total) * 100).toFixed(1);
  }

  /**
   * Get performance summary
   * OPTIMIZATION: Includes cache statistics from translation cache
   */
  getSummary() {
    const t = this.metrics.translations;
    const b = this.metrics.batches;
    const tp = this.metrics.textProcessing;

    // Get cache stats from global cache instance (if available)
    let cacheStats = null;
    try {
      const { globalCache } = require('./translation-cache');
      cacheStats = globalCache.getStats();
    } catch (e) {
      // Cache module not available
    }

    // Get multi-line batching stats (if available)
    let multilineBatchingStats = null;
    try {
      const { globalMultilineBatcher } = require('./multiline-batcher');
      multilineBatchingStats = globalMultilineBatcher.getStats();
    } catch (e) {
      // Multi-line batcher not available
    }

    return {
      translations: {
        total: t.total,
        cacheHitRate: this.getCacheHitRate() + '%',
        avgLatency: Math.round(t.avgLatency) + 'ms',
        avgCacheHitLatency: Math.round(t.avgCacheHitLatency) + 'ms',
        avgCacheMissLatency: Math.round(t.avgCacheMissLatency) + 'ms',
        speedup: t.avgCacheMissLatency > 0
          ? ((t.avgCacheMissLatency / Math.max(1, t.avgCacheHitLatency)).toFixed(1) + 'x')
          : 'N/A',
      },
      batches: {
        total: b.total,
        avgBatchSize: b.avgBatchSize.toFixed(1),
        savedRoundTrips: b.savedRoundTrips,
        efficiency: b.total > 0 ? ((1 - 1/b.avgBatchSize) * 100).toFixed(1) + '%' : '0%',
      },
      multilineBatching: multilineBatchingStats,
      textProcessing: {
        total: tp.total,
        avgDuration: Math.round(tp.avgDuration) + 'ms',
      },
      cache: cacheStats,
    };
  }

  /**
   * Log performance report
   * OPTIMIZATION: Includes multi-level cache statistics
   */
  logReport() {
    const summary = this.getSummary();

    let report = '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '📊 Performance Report\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '🔄 Translations:\n' +
      `   Total: ${summary.translations.total}\n` +
      `   Cache Hit Rate: ${summary.translations.cacheHitRate}\n` +
      `   Avg Latency: ${summary.translations.avgLatency}\n` +
      `   Cache Hit: ${summary.translations.avgCacheHitLatency}\n` +
      `   Cache Miss: ${summary.translations.avgCacheMissLatency}\n` +
      `   Speedup: ${summary.translations.speedup}\n` +
      '\n' +
      '📦 Batch Processing:\n' +
      `   Total Batches: ${summary.batches.total}\n` +
      `   Avg Batch Size: ${summary.batches.avgBatchSize}\n` +
      `   Saved Round Trips: ${summary.batches.savedRoundTrips}\n` +
      `   Efficiency: ${summary.batches.efficiency}\n` +
      '\n' +
      '⚙️  Text Processing:\n' +
      `   Total: ${summary.textProcessing.total}\n` +
      `   Avg Duration: ${summary.textProcessing.avgDuration}\n`;

    // Add multi-level cache stats if available
    if (summary.cache) {
      report += '\n' +
        '💾 Multi-Level Cache:\n' +
        `   Main Cache: ${summary.cache.size}/${summary.cache.maxSize} (${summary.cache.usage})\n` +
        `   Session Cache: ${summary.cache.sessionCacheSize}/500 hot items\n` +
        `   Total Hit Rate: ${summary.cache.hitRate}\n` +
        `   Session Hit Rate: ${summary.cache.sessionHitRate}\n` +
        `   Frequency Promotions: ${summary.cache.frequencyPromotions}\n` +
        `   Tracked Items: ${summary.cache.trackedItems}\n`;
    }

    report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

    Logger.info('PerformanceMonitor', report);
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      translations: {
        total: 0,
        cacheHits: 0,
        cacheMisses: 0,
        avgLatency: 0,
        avgCacheHitLatency: 0,
        avgCacheMissLatency: 0,
        totalLatency: 0,
        cacheHitLatency: 0,
        cacheMissLatency: 0,
      },
      batches: {
        total: 0,
        totalRequests: 0,
        avgBatchSize: 0,
        savedRoundTrips: 0,
      },
      uiUpdates: {
        total: 0,
        batched: 0,
        avgBatchDelay: 0,
      },
      textProcessing: {
        total: 0,
        avgDuration: 0,
        totalDuration: 0,
      },
    };

    Logger.info('PerformanceMonitor', 'Metrics reset');
  }

  /**
   * Cleanup on app exit
   */
  cleanup() {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }

    // Final report
    this.logReport();
  }
}

// Global instance
const globalMonitor = new PerformanceMonitor();

module.exports = {
  globalMonitor,
  PerformanceMonitor,
};
