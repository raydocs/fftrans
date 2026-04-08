'use strict';

const { ipcMain, BrowserWindow, shell } = require('electron');
const path = require('path');
const windowModule = require('../system/window-module');
const configModule = require('../system/config-module');
const dialogModule = require('../system/dialog-module');
const { IPC_CHANNELS } = require('../../constants');

function setWindowChannel() {
    // create window
    ipcMain.on(IPC_CHANNELS.CREATE_WINDOW, (event, windowName, data = null) => {
        windowModule.closeWindow(windowName);
        windowModule.createWindow(windowName, data);
    });

    // restart window
    ipcMain.on(IPC_CHANNELS.RESTART_WINDOW, (event, windowName, data = null) => {
        windowModule.restartWindow(windowName, data);
    });

    ipcMain.on(IPC_CHANNELS.MOVE_WINDOW, (event, detail) => {
        BrowserWindow.fromWebContents(event.sender).setContentBounds(detail);
    });

    // minimize window
    ipcMain.on(IPC_CHANNELS.MINIMIZE_WINDOW, (event) => {
        try {
            const targetWindow = BrowserWindow.fromWebContents(event.sender);

            if (targetWindow) {
                windowModule.minimizeWindow(targetWindow);
            }
        } catch (error) {
            console.log(error);
        }
    });

    // restore window
    ipcMain.on(IPC_CHANNELS.RESTORE_WINDOW, (event) => {
        try {
            BrowserWindow.fromWebContents(event.sender).restore();
        } catch (error) {
            console.log(error);
        }
    });

    // close window
    ipcMain.on(IPC_CHANNELS.CLOSE_WINDOW, (event) => {
        try {
            BrowserWindow.fromWebContents(event.sender).close();
        } catch (error) {
            console.log(error);
        }
    });

    // always on top
    ipcMain.on(IPC_CHANNELS.SET_ALWAYS_ON_TOP, (event, isAlwaysOnTop) => {
        try {
            BrowserWindow.fromWebContents(event.sender).setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
        } catch (error) {
            console.log(error);
        }
    });

    // focusable
    ipcMain.on(IPC_CHANNELS.SET_FOCUSABLE, (event, value = true) => {
        windowModule.setFocusable(value);
    });

    // set min size
    ipcMain.on(IPC_CHANNELS.SET_MIN_SIZE, (event, minSize) => {
        if (minSize) {
            BrowserWindow.fromWebContents(event.sender).setMinimumSize(300, 300);
        } else {
            BrowserWindow.fromWebContents(event.sender).setMinimumSize(1, 1);
        }
    });

    // set click through
    ipcMain.on(IPC_CHANNELS.SET_CLICK_THROUGH, (event, ignore) => {
        try {
            const indexWindow = BrowserWindow.fromWebContents(event.sender);
            indexWindow.setIgnoreMouseEvents(ignore, { forward: true });
            indexWindow.setResizable(!ignore);
        } catch (error) {
            console.log(error);
        }
    });

    // get click through config
    ipcMain.handle(IPC_CHANNELS.GET_CLICK_THROUGH_CONFIG, () => {
        return configModule.getConfig().indexWindow.clickThrough;
    });

    // set click through config
    ipcMain.on(IPC_CHANNELS.SET_CLICK_THROUGH_CONFIG, (event, value) => {
        let config = configModule.getConfig();
        config.indexWindow.clickThrough = value;
        configModule.setConfig(config);
    });

    // mute window
    ipcMain.on(IPC_CHANNELS.MUTE_WINDOW, (event, autoPlay) => {
        event.sender.setAudioMuted(!autoPlay);
    });

    // send index
    ipcMain.on(IPC_CHANNELS.SEND_INDEX, (event, channel, ...args) => {
        windowModule.sendIndex(channel, ...args);
    });

    // change UI text
    ipcMain.on(IPC_CHANNELS.CHANGE_UI_TEXT, () => {
        windowModule.forEachWindow((appWindow) => {
            appWindow.webContents.send(IPC_CHANNELS.CHANGE_UI_TEXT);
        });
    });

    ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL_URL, async (event, url) => {
        if (typeof url !== 'string' || url.trim() === '') {
            return { success: false, message: 'Invalid URL' };
        }

        try {
            const parsedUrl = new URL(url);
            const allowedProtocols = new Set(['https:', 'chrome:', 'chrome-extension:']);
            if (!allowedProtocols.has(parsedUrl.protocol)) {
                return { success: false, message: 'Only HTTPS or Chrome extension URLs are allowed' };
            }

            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            return { success: false, message: error?.message || 'Failed to open external URL' };
        }
    });

    ipcMain.handle(IPC_CHANNELS.OPEN_PATH, async (event, pathValue) => {
        if (typeof pathValue !== 'string' || pathValue.trim() === '') {
            return { success: false, message: 'Invalid path' };
        }

        try {
            if (!path.isAbsolute(pathValue) || pathValue.startsWith('\\\\')) {
                return { success: false, message: 'Only absolute local paths are allowed' };
            }

            const errorMessage = await shell.openPath(pathValue);
            if (errorMessage) {
                return { success: false, message: errorMessage };
            }

            return { success: true };
        } catch (error) {
            return { success: false, message: error?.message || 'Failed to open path' };
        }
    });

    ipcMain.on(IPC_CHANNELS.SHOW_INFO, (event, message = '') => {
        dialogModule.showInfo(event.sender, message);
    });
}

module.exports = {
    setWindowChannel,
};
