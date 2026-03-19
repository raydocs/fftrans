'use strict';

const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const configModule = require('../system/config-module');
const sharlayanModule = require('../system/sharlayan-module');
const chatCodeModule = require('../system/chat-code-module');
const windowModule = require('../system/window-module');
const dialogModule = require('../system/dialog-module');
const elevenLabsAuth = require('../translator/elevenlabs-auth');
const { execFile } = require('child_process');
const Logger = require('../../utils/logger');
const appCheckHelper = require('../system/app-check-helper');
const { IPC_CHANNELS } = require('../../constants');

const appVersion = app.getVersion();

function setSystemChannel() {
  // get app version
  ipcMain.handle(IPC_CHANNELS.GET_VERSION, () => {
    return appVersion;
  });

  // close app
  ipcMain.on(IPC_CHANNELS.CLOSE_APP, () => {
    sharlayanModule.stop(false);
    app.quit();
  });

  // get config
  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () => {
    return configModule.getConfig();
  });

  // set config
  ipcMain.handle(IPC_CHANNELS.SET_CONFIG, (event, newConfig) => {
    const previousConfig = configModule.getConfig();
    configModule.setConfig(newConfig);
    const nextConfig = configModule.getConfig();
    elevenLabsAuth.handlePersistedConfigChange(previousConfig, nextConfig);
    return nextConfig;
  });

  // get theme
  ipcMain.handle(IPC_CHANNELS.GET_THEME, () => {
    const config = configModule.getConfig();
    return config.system.theme || 'dark';
  });

  // apply theme to all windows
  ipcMain.on(IPC_CHANNELS.APPLY_THEME_TO_ALL_WINDOWS, (event, theme) => {
    const { BrowserWindow } = require('electron');
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.SET_THEME, theme);
      }
    });
  });

  // set default config
  ipcMain.handle(IPC_CHANNELS.SET_DEFAULT_CONFIG, () => {
    configModule.setDefaultConfig();
    elevenLabsAuth.clearSession();
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
  ipcMain.handle(IPC_CHANNELS.GET_CHAT_CODE, () => {
    return chatCodeModule.getChatCode();
  });

  // extract ElevenLabs App Check token from a flows file
  ipcMain.handle(IPC_CHANNELS.PICK_APP_CHECK_TOKEN, async () => {
    try {
      const autoExtracted = appCheckHelper.extractFromKnownLocations();
      if (autoExtracted?.token) {
        configModule.updateElevenLabsConfig({ appCheckToken: autoExtracted.token });

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

      configModule.updateElevenLabsConfig({ appCheckToken: tokenInfo.token });

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
  ipcMain.handle(IPC_CHANNELS.SET_CHAT_CODE, (event, newChatCode) => {
    chatCodeModule.setChatCode(newChatCode);
    return chatCodeModule.getChatCode();
  });

  // set default chat code
  ipcMain.handle(IPC_CHANNELS.SET_DEFAULT_CHAT_CODE, () => {
    chatCodeModule.setDefaultChatCode();
    return chatCodeModule.getChatCode();
  });

  // restart sharlayan reader
  ipcMain.on(IPC_CHANNELS.RESTART_SHARLAYAN_READER, () => {
    sharlayanModule.stop(true);
  });

  // fix reader
  ipcMain.on(IPC_CHANNELS.FIX_READER, (event) => {
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
  ipcMain.on(IPC_CHANNELS.CONSOLE_LOG, (event, ...args) => {
    console.log(...args);
  });
}

module.exports = {
  setSystemChannel,
};
