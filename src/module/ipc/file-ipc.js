'use strict';

const { ipcMain } = require('electron');
const fileModule = require('../system/file-module');

function setFileChannel() {
    // read directory
    ipcMain.handle('read-directory', async (event, pathValue) => {
        return await fileModule.readdirAsync(pathValue);
    });

    // read json
    ipcMain.handle('read-json', async (event, filePath) => {
        return await fileModule.readAsync(filePath, 'json');
    });
}

module.exports = {
    setFileChannel,
};
