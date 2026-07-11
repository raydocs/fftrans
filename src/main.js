'use strict';

/*
UPDATE NOTE
- use axios
- dialog update
- error log
fix isch
change icon
*/

// electron
const { app, BrowserWindow, globalShortcut, Menu, Tray } = require('electron');
const path = require('path');
//app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-http-cache');

// app module
const appModule = require('./module/system/app-module');

// window module
const windowModule = require('./module/system/window-module');

// sharlayan module
const sharlayanModule = require('./module/system/sharlayan-module');

// translate module (for cleanup)
const translateModule = require('./module/system/translate-module');

// performance monitor
const { globalMonitor } = require('./module/system/performance-monitor');

// translation cache
const { globalCache } = require('./module/system/translation-cache');
const { globalTTSAudioCache } = require('./module/system/tts-audio-cache');
const elevenLabsExtensionBridge = require('./module/system/elevenlabs-extension-bridge');
const dalamudBridge = require('./module/system/dalamud-bridge');
const configModule = require('./module/system/config-module');
const { IPC_CHANNELS } = require('./constants');

// text detect module
const textDetectModule = require('./module/system/text-detect-module');

let tray = null;
let isQuitting = false;
let cleanupPromise = null;

function getIndexWindow() {
  return windowModule.getWindow('index');
}

function showIndexWindow() {
  const indexWindow = getIndexWindow();
  if (indexWindow && !indexWindow.isDestroyed()) {
    indexWindow.show();
    indexWindow.focus();
  } else {
    createIndexWindow();
  }
}

function createIndexWindow() {
  const indexWindow = windowModule.createWindow('index');
  indexWindow?.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      indexWindow.hide();
    }
  });
  return indexWindow;
}

function setSpeechEnabled(enabled) {
  const config = configModule.getConfig();
  config.indexWindow.speech = enabled;
  configModule.setConfig(config);

  const indexWindow = getIndexWindow();
  if (indexWindow && !indexWindow.isDestroyed()) {
    indexWindow.webContents.setAudioMuted(!enabled);
    indexWindow.webContents.send(IPC_CHANNELS.RESET_VIEW, config);
  }
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'data', 'img', 'tataru.ico'));
  tray.setToolTip('FFTrans');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '显示/隐藏语音控制条',
      click: () => {
        const indexWindow = getIndexWindow();
        if (indexWindow?.isVisible()) indexWindow.hide();
        else showIndexWindow();
      },
    },
    {
      label: '启用英文语音',
      type: 'checkbox',
      checked: Boolean(configModule.getConfig().indexWindow.speech),
      click: menuItem => setSpeechEnabled(menuItem.checked),
    },
    { type: 'separator' },
    {
      label: '退出 FFTrans',
      click: () => app.quit(),
    },
  ]));
  tray.on('double-click', showIndexWindow);
}

// on ready
app.on('ready', () => {
  appModule.startApp();
  createIndexWindow();
  createTray();
});

// on window all closed
app.on('window-all-closed', () => {
  // Keep memory reading and TTS alive while the controller is hidden in the tray.
});

// on activate
app.on('activate', () => {
  showIndexWindow();
});

// Cleanup on app exit
app.on('before-quit', (event) => {
  isQuitting = true;
  // Prevent default to allow async cleanup
  event.preventDefault();

  if (cleanupPromise) return;

  cleanupPromise = (async () => {
    try {
      console.log('Starting app cleanup...');

      // Stop Sharlayan reader process (don't restart)
      sharlayanModule.stop(false);

      // Stop accepting local plugin translations before cleaning up translators.
      await dalamudBridge.shutdown();

      // Cleanup translation batch processor (flush pending batches)
      await translateModule.cleanup();

      // Cleanup translation cache (stop auto-save interval, final save)
      await globalCache.cleanup();
      await globalTTSAudioCache.cleanup();
      await elevenLabsExtensionBridge.shutdown();

      // Cleanup OCR worker
      await textDetectModule.cleanup();

      // Performance monitor final report
      globalMonitor.cleanup();

      // Unregister all global shortcuts
      globalShortcut.unregisterAll();

      console.log('App cleanup completed');
    } catch (error) {
      console.error('Error during app cleanup:', error);
    } finally {
      // Now actually quit
      app.exit(0);
    }
  })();

});

// ignore uncaughtException
process.on('uncaughtException', (error) => {
  console.log('\r\nuncaughtException');
  console.log(error);

  // write log
  appModule.writeLog('uncaughtException', error);
});

// ignore unhandledRejection
process.on('unhandledRejection', (error) => {
  console.log('\r\nunhandledRejection');
  console.log(error);

  // write log
  appModule.writeLog('unhandledRejection', error);
});

/*
// ignore certificate error
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  console.log('\r\ncertificate-error');
  console.log(error);

  // write log
  appModule.wirteLog('certificate-error', error);

  // Prevent having error
  event.preventDefault();

  // and continue
  callback(true);
});
*/
