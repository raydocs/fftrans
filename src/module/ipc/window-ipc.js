'use strict';

const { ipcMain, BrowserWindow } = require('electron');
const windowModule = require('../system/window-module');
const configModule = require('../system/config-module');
const dialogModule = require('../system/dialog-module');
const childProcess = require('child_process');
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

    // execute command
    ipcMain.on(IPC_CHANNELS.EXECUTE_COMMAND, (event, command) => {
        childProcess.exec(command, () => {
            //console.log(error.message);
        });
    });

    ipcMain.on(IPC_CHANNELS.SHOW_INFO, (event, message = '') => {
        dialogModule.showInfo(event.sender, message);
    });
}

module.exports = {
    setWindowChannel,
};
