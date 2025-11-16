'use strict';

// child process
const { exec } = require('child_process');

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
const ipcModule = require('./ipc-module');

// translation cache
const { globalCache } = require('./translation-cache');

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
    const engine = config.translation?.engine || 'OpenRouter';

    // Load common phrases dictionary
    const commonPhrasesPath = fileModule.getRootPath('src', 'data', 'text', 'cache', 'common-phrases-en-chs.json');

    if (fileModule.exists(commonPhrasesPath)) {
      const commonPhrases = require(commonPhrasesPath);
      const count = globalCache.preload(commonPhrases, engine);
      console.log(`🚀 Cache preloaded with ${count} common phrases for faster translation`);
    } else {
      console.log('ℹ️  Common phrases file not found, skipping cache preload');
    }
  } catch (error) {
    console.error('⚠️  Cache preload failed:', error.message);
  }
}

// write log
function wirteLog(type = '', message = '') {
  fileModule.writeLog(type, message);
}

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
    exec(`explorer "${fileModule.getRootPath('src', 'data', 'text', 'readme', 'index.html')}"`);
  });

  globalShortcut.register('CommandOrControl+F10', () => {
    try {
      windowModule.closeWindow('config');
    } catch (error) {
      error;
      windowModule.createWindow('config');
    }
  });

  globalShortcut.register('CommandOrControl+F11', () => {
    try {
      windowModule.closeWindow('capture');
    } catch (error) {
      error;
      windowModule.createWindow('capture');
    }
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
  wirteLog,
};
