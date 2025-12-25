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
    this.isDirty = false; // Track if cache needs saving

    // OPTIMIZATION: Multi-level cache strategy
    this.sessionCache = new Map();  // L1: High-priority session cache (current quest/instance)
    this.frequencyMap = new Map();  // Track access frequency for smart eviction
    this.sessionMaxSize = 500;      // Session cache size (current gameplay context)

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSaved: 0,  // Time saved in ms
      sessionHits: 0, // Session cache hits
      frequencyPromotions: 0, // Items promoted due to frequency
    };

    // Auto-save interval (5 minutes) - only saves if dirty
    this.autoSaveInterval = setInterval(() => this.save(), 5 * 60 * 1000);

    // Session cleanup interval (10 minutes) - demote low-frequency items
    this.sessionCleanupInterval = setInterval(() => this.cleanupSession(), 10 * 60 * 1000);

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
   * Save cache to disk (only if dirty)
   */
  async save() {
    if (!this.isDirty) {
      return; // Skip save if cache hasn't changed
    }

    try {
      const path = this.getCachePath();
      // Convert Map to array of entries for JSON serialization
      const data = Array.from(this.cache.entries());
      await fileModule.writeAsync(path, data, 'json');
      this.isDirty = false; // Clear dirty flag after successful save
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
   * Get translation from cache using pre-computed key
   * OPTIMIZATION: Multi-level cache lookup (session → main)
   * Tracks frequency for smart promotion/eviction
   */
  getByKey(key) {
    // OPTIMIZATION: L1 - Check session cache first (hot items)
    if (this.sessionCache.has(key)) {
      const value = this.sessionCache.get(key);

      // Track frequency
      this.trackAccess(key);

      // Update statistics
      this.stats.sessionHits++;
      this.stats.hits++;
      this.stats.totalSaved += 1000;

      if (process.env.NODE_ENV !== 'production') {
        console.log(`⚡ Session Cache HIT: ${key.substring(0, 60)}`);
      }

      return value.translation;
    }

    // OPTIMIZATION: L2 - Check main LRU cache
    if (this.cache.has(key)) {
      // LRU: Move to end (most recently used)
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);

      // Track frequency and potentially promote to session cache
      const frequency = this.trackAccess(key);
      if (frequency >= 3) {  // Accessed 3+ times → promote to session cache
        this.promoteToSession(key, value);
      }

      // Update statistics
      this.stats.hits++;
      this.stats.totalSaved += 1000;

      if (process.env.NODE_ENV !== 'production') {
        const preview = key.substring(0, 60);
        console.log(`✅ Cache HIT [${this.stats.hits}/${this.stats.hits + this.stats.misses}]: "${preview}${key.length > 60 ? '...' : ''}"`);
      }

      return value.translation;
    }

    this.stats.misses++;

    if (process.env.NODE_ENV !== 'production') {
      const preview = key.substring(0, 60);
      console.log(`❌ Cache MISS [${this.stats.hits}/${this.stats.hits + this.stats.misses}]: "${preview}${key.length > 60 ? '...' : ''}"`);
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

    // Mark cache as dirty (needs saving)
    this.isDirty = true;
  }

  /**
   * Store translation in cache using pre-computed key
   * OPTIMIZATION: Avoids double key generation when caller already has key
   * Implements LRU eviction when full
   */
  setByKey(key, translation) {
    // LRU eviction: Remove oldest (first) entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }

    // Simplified cache value (only translation)
    this.cache.set(key, { translation });

    // Mark cache as dirty (needs saving)
    this.isDirty = true;
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
   * OPTIMIZATION: Includes multi-level cache stats
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(1) : 0;
    const sessionHitRate = this.stats.hits > 0 ? (this.stats.sessionHits / this.stats.hits * 100).toFixed(1) : 0;

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
      // Multi-level cache stats
      sessionCacheSize: this.sessionCache.size,
      sessionHits: this.stats.sessionHits,
      sessionHitRate: sessionHitRate + '%',
      frequencyPromotions: this.stats.frequencyPromotions,
      trackedItems: this.frequencyMap.size,
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
    this.isDirty = true; // Mark dirty
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
    this.stats.sessionHits = 0;
    this.stats.frequencyPromotions = 0;
  }

  /**
   * OPTIMIZATION: Track access frequency for smart caching
   * Returns current frequency count
   */
  trackAccess(key) {
    const currentCount = this.frequencyMap.get(key) || 0;
    const newCount = currentCount + 1;
    this.frequencyMap.set(key, newCount);
    return newCount;
  }

  /**
   * OPTIMIZATION: Promote frequently accessed item to session cache
   */
  promoteToSession(key, value) {
    // Check if already in session cache
    if (this.sessionCache.has(key)) {
      return;
    }

    // Session cache full - evict least frequently used item
    if (this.sessionCache.size >= this.sessionMaxSize) {
      // Find item with lowest frequency
      let minFreq = Infinity;
      let minKey = null;

      for (const sessionKey of this.sessionCache.keys()) {
        const freq = this.frequencyMap.get(sessionKey) || 0;
        if (freq < minFreq) {
          minFreq = freq;
          minKey = sessionKey;
        }
      }

      if (minKey) {
        this.sessionCache.delete(minKey);
      }
    }

    // Add to session cache
    this.sessionCache.set(key, value);
    this.stats.frequencyPromotions++;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`📈 Promoted to session cache: ${key.substring(0, 60)} (freq: ${this.frequencyMap.get(key)})`);
    }
  }

  /**
   * OPTIMIZATION: Clean up session cache periodically
   * Demote items with low frequency back to main cache
   */
  cleanupSession() {
    const threshold = 2; // Keep items accessed 2+ times in last period
    let demoted = 0;

    for (const [key, value] of this.sessionCache.entries()) {
      const frequency = this.frequencyMap.get(key) || 0;

      if (frequency < threshold) {
        // Demote to main cache
        this.sessionCache.delete(key);
        this.frequencyMap.delete(key);
        demoted++;
      } else {
        // Decay frequency (halve it) to allow new items to rise
        this.frequencyMap.set(key, Math.floor(frequency / 2));
      }
    }

    if (demoted > 0 && process.env.NODE_ENV !== 'production') {
      console.log(`🧹 Session cache cleanup: ${demoted} items demoted`);
    }
  }

  /**
   * Cleanup resources (call on app exit)
   * Clears auto-save interval and performs final save
   */
  async cleanup() {
    try {
      // Clear auto-save interval
      if (this.autoSaveInterval) {
        clearInterval(this.autoSaveInterval);
        this.autoSaveInterval = null;
      }

      // Clear session cleanup interval
      if (this.sessionCleanupInterval) {
        clearInterval(this.sessionCleanupInterval);
        this.sessionCleanupInterval = null;
      }

      // Final save
      await this.save();
      console.log('Translation cache cleanup completed');
    } catch (error) {
      console.error('Translation cache cleanup failed:', error);
    }
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
