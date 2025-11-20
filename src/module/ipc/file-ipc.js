'use strict';

const { ipcMain } = require('electron');
const fileModule = require('../system/file-module');

function setFileChannel() {
    // read directory
    ipcMain.handle('read-directory', (event, path) => {
        return fileModule.readdir(path);
    });

    // read json
    ipcMain.handle('read-json', (event, filePath) => {
        return fileModule.read(filePath, 'json');
    });
}

module.exports = {
    setFileChannel,
};
