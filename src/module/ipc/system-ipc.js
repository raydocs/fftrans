'use strict';

const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const configModule = require('../system/config-module');
const sharlayanModule = require('../system/sharlayan-module');
const chatCodeModule = require('../system/chat-code-module');
const windowModule = require('../system/window-module');
const dialogModule = require('../system/dialog-module');
const { execFile } = require('child_process');
const Logger = require('../../utils/logger');
const appCheckHelper = require('../system/app-check-helper');

const appVersion = app.getVersion();

function setSystemChannel() {
  // get app version
  ipcMain.handle('get-version', () => {
    return appVersion;
  });

  // close app
  ipcMain.on('close-app', () => {
    sharlayanModule.stop(false);
    app.quit();
  });

  // get config
  ipcMain.handle('get-config', () => {
    return configModule.getConfig();
  });

  // set config
  ipcMain.handle('set-config', (event, newConfig) => {
    configModule.setConfig(newConfig);
    return configModule.getConfig();
  });

  // get theme
  ipcMain.handle('get-theme', () => {
    const config = configModule.getConfig();
    return config.system.theme || 'dark';
  });

  // apply theme to all windows
  ipcMain.on('apply-theme-to-all-windows', (event, theme) => {
    const { BrowserWindow } = require('electron');
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('set-theme', theme);
      }
    });
  });

  // set default config
  ipcMain.handle('set-default-config', () => {
    configModule.setDefaultConfig();
    const defaultConfig = configModule.getConfig();

    try {
      // reset index bounds
      const defaultIndexBounds = windowModule.getWindowSize('index', defaultConfig);
      windowModule.getWindow('index').setContentBounds(defaultIndexBounds);

      // reset config bounds
      const defaultConfigBounds = windowModule.getWindowSize('config', defaultConfig);
      windowModule.getWindow('config').setContentBounds(defaultConfigBounds);
    } catch (error) {
      Logger.error('system-ipc', 'Failed to reset window bounds', error);
    }

    return defaultConfig;
  });

  // get chat code
  ipcMain.handle('get-chat-code', () => {
    return chatCodeModule.getChatCode();
  });

  // extract ElevenLabs App Check token from a flows file
  ipcMain.handle('pick-app-check-token', async () => {
    try {
      const autoExtracted = appCheckHelper.extractFromKnownLocations();
      if (autoExtracted?.token) {
        const config = configModule.getConfig();
        config.api.elevenlabs.appCheckToken = autoExtracted.token;
        configModule.setConfig(config);

        return {
          success: true,
          token: autoExtracted.token,
          source: autoExtracted.source,
          method: autoExtracted.method,
          expiresAt: autoExtracted.expiresAt,
        };
      }

      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '选择 ElevenLabs 流量文件 (flows.elevenlabsio)',
        properties: ['openFile'],
        filters: [{ name: 'Flows', extensions: ['elevenlabsio', 'txt', '*'] }],
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, message: '已取消' };
      }

      const tokenInfo = appCheckHelper.extractBestTokenFromFile(filePaths[0]);
      if (!tokenInfo?.token) {
        return { success: false, message: '未在文件中找到 xi-app-check-token' };
      }

      const config = configModule.getConfig();
      config.api.elevenlabs.appCheckToken = tokenInfo.token;
      configModule.setConfig(config);

      return {
        success: true,
        token: tokenInfo.token,
        source: filePaths[0],
        method: 'manual',
        expiresAt: tokenInfo.expiresAt,
      };
    } catch (error) {
      Logger.error('system-ipc', 'Failed to extract app check token', error);
      return { success: false, message: error.message || '提取失败' };
    }
  });

  // set chat code
  ipcMain.handle('set-chat-code', (event, newChatCode) => {
    chatCodeModule.setChatCode(newChatCode);
    return chatCodeModule.getChatCode();
  });

  // set default chat code
  ipcMain.handle('set-default-chat-code', () => {
    chatCodeModule.setDefaultChatCode();
    return chatCodeModule.getChatCode();
  });

  // restart sharlayan reader
  ipcMain.on('restart-sharlayan-reader', () => {
    sharlayanModule.stop(true);
  });

  // fix reader
  ipcMain.on('fix-reader', (event) => {
    // Use execFile instead of exec to prevent command injection
    const command = 'secedit';
    const args = [
      '/configure',
      '/cfg',
      path.join(process.env.WINDIR || 'C:\\Windows', 'inf', 'defltbase.inf'),
      '/db',
      'defltbase.sdb',
      '/verbose'
    ];

    execFile(command, args, (error) => {
      let message = '';

      if (error && error.code === 740) {
        message = 'You must run Tataru Assistant as administrator. (Error 740)';
        Logger.warn('system-ipc', 'Fix reader requires administrator privileges');
      } else if (error) {
        message = 'Failed to fix reader. Check logs for details.';
        Logger.error('system-ipc', 'Fix reader command failed', error);
      } else {
        message = 'Completed.';
        Logger.info('system-ipc', 'Reader fix completed successfully');
      }

      dialogModule.showInfo(event.sender, message);
    });
  });

  // console log
  ipcMain.on('console-log', (event, ...args) => {
    console.log(...args);
  });
}

module.exports = {
  setSystemChannel,
};
