'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;

const fileModule = require('./file-module');
const Logger = require('../../utils/logger');

class TTSAudioCache {
  constructor(maxSize = 200) {
    this.maxSize = maxSize;
    this.entries = new Map();
    this.memoryCache = new Map();
    this.pending = new Map();
    this.isDirty = false;
    this.initialized = false;
    this.initializePromise = this.load();
    this.autoSaveInterval = setInterval(() => {
      this.save();
    }, 5 * 60 * 1000);
  }

  getIndexPath() {
    return fileModule.getUserDataPath('config', 'tts-audio-cache.json');
  }

  getCacheDir() {
    return fileModule.getUserDataPath('cache', 'tts-audio');
  }

  getFileName(key = '') {
    return `${crypto.createHash('sha1').update(key).digest('hex')}.txt`;
  }

  async ensureReady() {
    if (!this.initialized) {
      await this.initializePromise;
    }
  }

  async ensureCacheDir() {
    const cacheDir = this.getCacheDir();
    await fsp.mkdir(cacheDir, { recursive: true });
  }

  touchEntry(key, entry) {
    entry.updatedAt = Date.now();
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.isDirty = true;
  }

  async removeEntryFile(entry) {
    if (!entry?.fileName) {
      return;
    }

    const filePath = fileModule.getPath(this.getCacheDir(), entry.fileName);
    try {
      await fsp.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        Logger.warn('tts-audio-cache', 'Failed to remove cached audio file', error.message);
      }
    }
  }

  async cleanupOrphanFiles() {
    const referencedFiles = new Set();

    for (const [key, entry] of this.entries.entries()) {
      if (!entry?.fileName || typeof entry.fileName !== 'string') {
        this.entries.delete(key);
        this.memoryCache.delete(key);
        this.isDirty = true;
        continue;
      }

      referencedFiles.add(entry.fileName);
    }

    const cacheDir = this.getCacheDir();
    const files = await fsp.readdir(cacheDir);
    await Promise.all(files.map(async (fileName) => {
      if (!referencedFiles.has(fileName)) {
        await this.removeEntryFile({ fileName });
      }
    }));
  }

  async load() {
    try {
      await this.ensureCacheDir();
      const indexPath = this.getIndexPath();

      if (fs.existsSync(indexPath)) {
        const data = JSON.parse(await fsp.readFile(indexPath, 'utf8'));
        if (Array.isArray(data)) {
          this.entries = new Map(data.filter((item) => Array.isArray(item) && item.length === 2));
        }
      }

      await this.cleanupOrphanFiles();
      await this.evictIfNeeded();
    } catch (error) {
      Logger.warn('tts-audio-cache', 'Failed to load TTS audio cache index', error.message);
    } finally {
      this.initialized = true;
    }
  }

  async save() {
    await this.ensureReady();
    if (!this.isDirty) {
      return;
    }

    try {
      await this.ensureCacheDir();
      const serialized = JSON.stringify(Array.from(this.entries.entries()), null, 2);
      await fsp.writeFile(this.getIndexPath(), serialized, 'utf8');
      this.isDirty = false;
    } catch (error) {
      Logger.warn('tts-audio-cache', 'Failed to save TTS audio cache index', error.message);
      throw error;
    }
  }

  async get(key = '') {
    await this.ensureReady();
    if (!key) {
      return null;
    }

    if (this.memoryCache.has(key)) {
      const entry = this.entries.get(key);
      if (entry) {
        this.touchEntry(key, entry);
      }
      return this.memoryCache.get(key);
    }

    const entry = this.entries.get(key);
    if (!entry?.fileName) {
      return null;
    }

    const filePath = fileModule.getPath(this.getCacheDir(), entry.fileName);
    if (!fs.existsSync(filePath)) {
      this.entries.delete(key);
      this.memoryCache.delete(key);
      this.isDirty = true;
      return null;
    }

    try {
      const dataUrl = await fsp.readFile(filePath, 'utf8');
      if (!dataUrl) {
        return null;
      }

      this.memoryCache.set(key, dataUrl);
      this.touchEntry(key, entry);
      return dataUrl;
    } catch (error) {
      Logger.warn('tts-audio-cache', 'Failed to read cached audio file', error.message);
      return null;
    }
  }

  async set(key = '', dataUrl = '') {
    await this.ensureReady();
    if (!key || !dataUrl) {
      return dataUrl;
    }

    await this.ensureCacheDir();

    const fileName = this.getFileName(key);
    const filePath = fileModule.getPath(this.getCacheDir(), fileName);
    await fsp.writeFile(filePath, dataUrl, 'utf8');

    const entry = {
      fileName,
      updatedAt: Date.now(),
      size: dataUrl.length,
    };

    this.entries.set(key, entry);
    this.memoryCache.set(key, dataUrl);
    this.isDirty = true;
    await this.evictIfNeeded();
    return dataUrl;
  }

  async getOrCreate(key = '', factory = async () => null, options = {}) {
    await this.ensureReady();
    const { useCache = true } = options;

    if (useCache) {
      const cached = await this.get(key);
      if (cached) {
        return cached;
      }

      if (this.pending.has(key)) {
        return this.pending.get(key);
      }
    }

    const promise = (async () => {
      const value = await factory();
      if (useCache) {
        await this.set(key, value);
      }
      return value;
    })();

    if (useCache) {
      this.pending.set(key, promise);
    }

    try {
      return await promise;
    } finally {
      if (useCache) {
        this.pending.delete(key);
      }
    }
  }

  async evictIfNeeded() {
    while (this.entries.size > this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      const oldestEntry = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      this.memoryCache.delete(oldestKey);
      await this.removeEntryFile(oldestEntry);
      this.isDirty = true;
    }
  }

  async cleanup() {
    try {
      if (this.autoSaveInterval) {
        clearInterval(this.autoSaveInterval);
        this.autoSaveInterval = null;
      }
      await this.save();
    } catch (error) {
      Logger.warn('tts-audio-cache', 'Failed to cleanup TTS audio cache', error.message);
    }
  }
}

const globalTTSAudioCache = new TTSAudioCache(200);

module.exports = {
  TTSAudioCache,
  globalTTSAudioCache,
};
