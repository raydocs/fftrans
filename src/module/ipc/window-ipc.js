'use strict';

const { ipcMain, BrowserWindow } = require('electron');
const windowModule = require('../system/window-module');
const configModule = require('../system/config-module');
const dialogModule = require('../system/dialog-module');
const childProcess = require('child_process');

function setWindowChannel() {
    // create window
    ipcMain.on('create-window', (event, windowName, data = null) => {
        try {
            windowModule.closeWindow(windowName);
        } catch (error) {
            error;
            windowModule.createWindow(windowName, data);
        }
    });

    // restart window
    ipcMain.on('restart-window', (event, windowName, data = null) => {
        windowModule.restartWindow(windowName, data);
    });

    ipcMain.on('move-window', (event, detail) => {
        BrowserWindow.fromWebContents(event.sender).setContentBounds(detail);
    });

    // minimize window
    ipcMain.on('minimize-window', (event) => {
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
    ipcMain.on('restore-window', (event) => {
        try {
            BrowserWindow.fromWebContents(event.sender).restore();
        } catch (error) {
            console.log(error);
        }
    });

    // close window
    ipcMain.on('close-window', (event) => {
        try {
            BrowserWindow.fromWebContents(event.sender).close();
        } catch (error) {
            console.log(error);
        }
    });

    // always on top
    ipcMain.on('set-always-on-top', (event, isAlwaysOnTop) => {
        try {
            BrowserWindow.fromWebContents(event.sender).setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
        } catch (error) {
            console.log(error);
        }
    });

    // focusable
    ipcMain.on('set-focusable', (event, value = true) => {
        windowModule.setFocusable(value);
    });

    // set min size
    ipcMain.on('set-min-size', (event, minSize) => {
        if (minSize) {
            BrowserWindow.fromWebContents(event.sender).setMinimumSize(300, 300);
        } else {
            BrowserWindow.fromWebContents(event.sender).setMinimumSize(1, 1);
        }
    });

    // set click through
    ipcMain.on('set-click-through', (event, ignore) => {
        try {
            const indexWindow = BrowserWindow.fromWebContents(event.sender);
            indexWindow.setIgnoreMouseEvents(ignore, { forward: true });
            indexWindow.setResizable(!ignore);
        } catch (error) {
            console.log(error);
        }
    });

    // get click through config
    ipcMain.handle('get-click-through-config', () => {
        return configModule.getConfig().indexWindow.clickThrough;
    });

    // set click through config
    ipcMain.on('set-click-through-config', (event, value) => {
        let config = configModule.getConfig();
        config.indexWindow.clickThrough = value;
        configModule.setConfig(config);
    });

    // mute window
    ipcMain.on('mute-window', (event, autoPlay) => {
        event.sender.setAudioMuted(!autoPlay);
    });

    // send index
    ipcMain.on('send-index', (event, channel, ...args) => {
        windowModule.sendIndex(channel, ...args);
    });

    // change UI text
    ipcMain.on('change-ui-text', () => {
        windowModule.forEachWindow((appWindow) => {
            appWindow.webContents.send('change-ui-text');
        });
    });

    // execute command
    ipcMain.on('execute-command', (event, command) => {
        childProcess.exec(command, () => {
            //console.log(error.message);
        });
    });

    ipcMain.on('show-info', (event, message = '') => {
        dialogModule.showInfo(event.sender, message);
    });
}

module.exports = {
    setWindowChannel,
};
