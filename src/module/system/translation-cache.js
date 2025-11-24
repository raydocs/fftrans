'use strict';

/**
 * Translation Cache System - Optimized for English to Simplified Chinese
 *
 * Implements LRU (Least Recently Used) caching for translations
 * to significantly reduce API calls and improve response time.
 *
 * OPTIMIZATIONS (v2):
 * - Removed fromLang/toLang parameters (fixed: English → Simplified Chinese)
 * - Increased cache size to 10000 entries
 * - Simplified cache value structure
 * - Removed import/export functionality (unused)
 * - Added preload capability for common phrases
 *
 * Features:
 * - LRU eviction policy
 * - Configurable cache size
 * - Cache statistics
 * - Preloading support
 */

const fileModule = require('./file-module');

class TranslationCache {
  constructor(maxSize = 10000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSaved: 0,  // Time saved in ms
    };

    // Auto-save interval (5 minutes)
    this.autoSaveInterval = setInterval(() => this.save(), 5 * 60 * 1000);

    // Load cache on startup
    this.load();
  }

  /**
   * Get cache file path
   */
  getCachePath() {
    return fileModule.getUserDataPath('config', 'translation-cache.json');
  }

  /**
   * Load cache from disk
   */
  load() {
    try {
      const path = this.getCachePath();
      if (fileModule.exists(path)) {
        const data = fileModule.read(path, 'json');
        if (data && Array.isArray(data)) {
          // Reconstruct Map from array of entries
          this.cache = new Map(data);
          console.log(`✅ Translation cache loaded: ${this.cache.size} entries`);
        }
      }
    } catch (error) {
      console.error('Failed to load translation cache:', error);
    }
  }

  /**
   * Save cache to disk
   */
  async save() {
    try {
      const path = this.getCachePath();
      // Convert Map to array of entries for JSON serialization
      const data = Array.from(this.cache.entries());
      await fileModule.writeAsync(path, data, 'json');
      if (process.env.NODE_ENV !== 'production') {
        console.log(`💾 Translation cache saved: ${this.cache.size} entries`);
      }
    } catch (error) {
      console.error('Failed to save translation cache:', error);
    }
  }

  /**
   * Generate cache key from translation parameters
   * Normalizes text to improve cache hit rate
   * OPTIMIZED: Only engine + text (no fromLang/toLang)
   */
  getCacheKey(text, engine) {
    // Normalize: trim, lowercase, collapse whitespace, remove [r] tags
    const normalized = text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\[r\]/g, '');

    return `${engine}:${normalized}`;
  }

  /**
   * Get translation from cache
   * Updates LRU order on hit
   * OPTIMIZED: Simplified parameters (text, engine)
   */
  get(text, engine) {
    const key = this.getCacheKey(text, engine);

    if (this.cache.has(key)) {
      // LRU: Move to end (most recently used)
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);

      // Update statistics (fixed 1000ms saved per hit)
      this.stats.hits++;
      this.stats.totalSaved += 1000;

      // Simplified logging (only in dev mode)
      if (process.env.NODE_ENV !== 'production') {
        const preview = text.substring(0, 40);
        console.log(`✅ Cache HIT [${this.stats.hits}/${this.stats.hits + this.stats.misses}]: "${preview}${text.length > 40 ? '...' : ''}"`);
      }

      return value.translation;
    }

    this.stats.misses++;

    if (process.env.NODE_ENV !== 'production') {
      const preview = text.substring(0, 40);
      console.log(`❌ Cache MISS [${this.stats.hits}/${this.stats.hits + this.stats.misses}]: "${preview}${text.length > 40 ? '...' : ''}"`);
    }

    return null;
  }

  /**
   * Store translation in cache
   * Implements LRU eviction when full
   * OPTIMIZED: Simplified parameters and value structure
   */
  set(text, engine, translation) {
    const key = this.getCacheKey(text, engine);

    // LRU eviction: Remove oldest (first) entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }

    // Simplified cache value (only translation)
    this.cache.set(key, { translation });
  }

  /**
   * Preload translations from dictionary
   * Used for cache warming with common phrases
   */
  preload(dictionary, engine) {
    let count = 0;

    if (!Array.isArray(dictionary)) {
      console.warn('⚠️  Cache preload failed: dictionary is not an array');
      return 0;
    }

    dictionary.forEach((item) => {
      // Support both [en, zh] and {en, zh} formats
      const english = Array.isArray(item) ? item[0] : item.en;
      const chinese = Array.isArray(item) ? item[1] : item.zh;

      if (english && chinese && typeof english === 'string' && typeof chinese === 'string') {
        // Only preload reasonable-length phrases
        if (english.length > 0 && english.length < 200) {
          this.set(english, engine, chinese);
          count++;
        }
      }
    });

    console.log(`✅ Cache preloaded: ${count} entries for engine "${engine}"`);
    return count;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(1) : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      usage: (this.cache.size / this.maxSize * 100).toFixed(1) + '%',
      hits: this.stats.hits,
      misses: this.stats.misses,
      total,
      hitRate: hitRate + '%',
      evictions: this.stats.evictions,
      timeSaved: this.formatTime(this.stats.totalSaved),
      timeSavedMs: this.stats.totalSaved,
    };
  }

  /**
   * Format time in human-readable format
   */
  formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.save(); // Save empty cache
    console.log(`🗑️  Cache cleared: ${size} entries removed`);
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
    this.stats.totalSaved = 0;
  }

  /**
   * Log current status
   */
  logStatus() {
    const stats = this.getStats();
    console.log('\n📊 Translation Cache Status');
    console.log('─────────────────────────────────');
    console.log(`Size: ${stats.size}/${stats.maxSize} (${stats.usage})`);
    console.log(`Hit Rate: ${stats.hitRate} (${stats.hits} hits, ${stats.misses} misses)`);
    console.log(`Evictions: ${stats.evictions}`);
    console.log(`Time Saved: ${stats.timeSaved}`);
    console.log('─────────────────────────────────\n');
  }
}

// Create global cache instance (increased to 10000)
const globalCache = new TranslationCache(10000);

// Module exports
module.exports = {
  globalCache,
  TranslationCache,
};
