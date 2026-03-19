'use strict';

const { ipcMain } = require('electron');
const fileModule = require('../system/file-module');
const dialogModule = require('../system/dialog-module');
const jsonEntry = require('../fix/json-entry');
const { IPC_CHANNELS } = require('../../constants');

function setFileChannel() {
    // read directory
    ipcMain.handle(IPC_CHANNELS.READ_DIRECTORY, async (event, pathValue) => {
        return await fileModule.readdirAsync(pathValue);
    });

    // read json
    ipcMain.handle(IPC_CHANNELS.READ_JSON, async (event, filePath) => {
        return await fileModule.readAsync(filePath, 'json');
    });

    // get path
    ipcMain.handle(IPC_CHANNELS.GET_PATH, (event, ...args) => {
        return fileModule.getPath(...args);
    });

    // get root path
    ipcMain.handle(IPC_CHANNELS.GET_ROOT_PATH, (event, ...args) => {
        return fileModule.getRootPath(...args);
    });

    // get user data path
    ipcMain.handle(IPC_CHANNELS.GET_USER_DATA_PATH, (event, ...args) => {
        return fileModule.getUserDataPath(...args);
    });

    // clear temp cache
    ipcMain.on(IPC_CHANNELS.CLEAR_CACHE, async (event) => {
        const response = await dialogModule.showInfo(event.sender, 'Delete cache file?', ['YES', 'NO'], 1);
        if (response === 0) {
            await fileModule.unlinkAsync(fileModule.getUserDataPath('text', 'temp-name.json'));
            jsonEntry.loadJSON();
        }
    });
}

module.exports = {
    setFileChannel,
};
