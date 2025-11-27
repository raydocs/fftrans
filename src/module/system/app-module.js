'use strict';

// child process
const { execFile } = require('child_process');

// electron
const { globalShortcut, ipcMain } = require('electron');

// file module
const fileModule = require('./file-module');

// config module
const configModule = require('./config-module');

// chat code module
const chatCodeModule = require('./chat-code-module');

// window module
const windowModule = require('./window-module');

// ipc module
const ipcModule = require('../ipc/index');

// translation cache
const { globalCache } = require('./translation-cache');

// utils
const Logger = require('../../utils/logger');
const { FILE_NAMES } = require('../../constants');

// start app
function startApp() {
  // directory check
  fileModule.directoryCheck();

  // load config
  configModule.loadConfig();

  // load chat code
  chatCodeModule.loadChatCode();

  // detect user language
  detectUserLanguage();

  // 🆕 Preload translation cache with common phrases
  preloadCache();

  // set IPC
  ipcModule.setIPC();

  // set global shortcut
  setGlobalShortcut();

  // set shortcut IPC
  ipcMain.on('set-global-shortcut', () => {
    setGlobalShortcut();
  });
}

// 🆕 Preload cache with common phrases for instant translation
function preloadCache() {
  try {
    const config = configModule.getConfig();

    // Preload for the selected engine AND common fallback engines to boost first-hit latency
    const engines = new Set([
      config.translation?.engine || 'OpenRouter',
      'Google', 'DeepL', 'OpenAI', 'Gemini', 'Kimi', 'Cohere', 'Baidu', 'Youdao', 'Papago'
    ]);

    // Load common phrases dictionary
    const commonPhrasesPath = fileModule.getRootPath('src', 'data', 'text', 'cache', FILE_NAMES.COMMON_PHRASES);

    if (fileModule.exists(commonPhrasesPath)) {
      const commonPhrases = require(commonPhrasesPath);
      let totalCount = 0;

      engines.forEach((engine) => {
        totalCount += globalCache.preload(commonPhrases, engine);
      });

      Logger.info('app-module', `Cache preloaded with ${totalCount} entries across ${engines.size} engines`);
    } else {
      Logger.info('app-module', 'Common phrases file not found, skipping cache preload');
    }
  } catch (error) {
    Logger.error('app-module', 'Cache preload failed', error);
  }
}

// write log
function writeLog(type = '', message = '') {
  // fire-and-forget to avoid blocking the main thread
  fileModule.writeLogAsync(type, message);
}

// Backwards compatibility alias (deprecated - use writeLog instead)
const wirteLog = writeLog;

// detect user language
function detectUserLanguage() {
  const config = configModule.getConfig();

  if (!config.system.appLanguage.includes('app')) {
    configModule.setAppLanguage();
  }
}

// set global shortcut
function setGlobalShortcut() {
  if (configModule.getConfig().indexWindow.shortcut) {
    registerGlobalShortcut();
  } else {
    unregisterGlobalShortcut();
  }
}

// register global shortcut
function registerGlobalShortcut() {
  globalShortcut.unregisterAll();

  globalShortcut.register('CommandOrControl+F9', () => {
    const readmePath = fileModule.getRootPath('src', 'data', 'text', 'readme', 'index.html');
    // Use execFile for security
    execFile('explorer', [readmePath], (error) => {
      if (error) {
        Logger.error('app-module', 'Failed to open readme', error);
      }
    });
  });

  globalShortcut.register('CommandOrControl+F10', () => {
    windowModule.closeWindow('config');
    windowModule.createWindow('config');
  });

  globalShortcut.register('CommandOrControl+F11', () => {
    windowModule.closeWindow('capture');
    windowModule.createWindow('capture');
  });

  globalShortcut.register('CommandOrControl+F12', () => {
    windowModule.openDevTools();
  });
}

// unregister global shortcut
function unregisterGlobalShortcut() {
  globalShortcut.unregisterAll();
}

// module exports
module.exports = {
  startApp,
  writeLog,
  wirteLog, // Deprecated alias for backwards compatibility
};
