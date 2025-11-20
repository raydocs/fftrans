'use strict';

const { ipcMain } = require('electron');
const jsonEntry = require('../fix/json-entry');
const jsonFunction = require('../fix/json-function');
const dialogModule = require('../system/dialog-module');

// No kanji
const regNoKanji = /^[^\u3100-\u312F\u3400-\u4DBF\u4E00-\u9FFF]+$/;

function setJsonChannel() {
    // initialize json
    ipcMain.on('initialize-json', () => {
        jsonEntry.initializeJSON();
    });

    // download json
    ipcMain.on('download-json', () => {
        jsonEntry.downloadJSON();
    });

    // load json
    ipcMain.on('load-json', () => {
        jsonEntry.loadJSON();
    });

    // delete temp
    ipcMain.on('delete-temp', () => {
        jsonFunction.deleteTemp();
        jsonEntry.loadJSON();
        dialogModule.addNotification('TEMP_DELETED');
    });

    // get array
    ipcMain.handle('get-user-array', (event, name = '') => {
        let array = jsonEntry.getUserArray(name);
        return array;
    });

    // save user custom
    ipcMain.on('save-user-custom', (event, textBefore = '', textAfter = '', type = '') => {
        let fileName = '';
        let textBefore2 = textBefore;
        let array = [];

        if (type !== 'custom-overwrite' && textBefore2.length < 3 && regNoKanji.test(textBefore2)) textBefore2 += '#';

        if (type === 'custom-source') {
            fileName = 'custom-source.json';
            array.push([textBefore2, textAfter]);
        } else if (type === 'custom-overwrite') {
            fileName = 'custom-overwrite.json';
            array.push([textBefore2, textAfter]);
        } else if (type === 'player' || type === 'retainer') {
            fileName = 'player-name.json';
            array.push([textBefore2, textAfter, type]);
        } else {
            fileName = 'custom-target.json';
            array.push([textBefore2, textAfter, type]);
        }

        jsonFunction.saveUserCustom(fileName, array);
        jsonEntry.loadJSON();
        event.sender.send('create-table');
    });

    // delete user custom
    ipcMain.on('delete-user-custom', (event, textBefore = '', type = '') => {
        let fileName = '';
        let textBefore2 = textBefore;

        if (type !== 'custom-overwrite' && textBefore2.length < 3 && regNoKanji.test(textBefore2)) {
            textBefore2 += '#';
        }

        if (type === 'custom-source') {
            fileName = 'custom-source.json';
        } else if (type === 'custom-overwrite') {
            fileName = 'custom-overwrite.json';
        } else if (type === 'player' || type === 'retainer') {
            fileName = 'player-name.json';
        } else {
            fileName = 'custom-target.json';
        }

        jsonFunction.editUserCustom(fileName, textBefore2);
        jsonFunction.editUserCustom('temp-name.json', textBefore2);
        jsonEntry.loadJSON();
        event.sender.send('create-table');
    });
}

module.exports = {
    setJsonChannel,
};
