'use strict';

const { ipcMain } = require('electron');
const dialogModule = require('../system/dialog-module');

function setDialogChannel() {
    // add log
    ipcMain.on('add-log', (event, dialogData = {}, scroll = false) => {
        dialogModule.updateDialog(dialogData, scroll, false);
    });

    // add notification
    ipcMain.on('add-notification', (event, text = '') => {
        dialogModule.addNotification(text);
    });

    // reset dialog style
    ipcMain.on('reset-dialog-style', (event, resetList = []) => {
        for (let index = 0; index < resetList.length; index++) {
            const element = resetList[index];
            resetList[index].style = dialogModule.getStyle(element.code);
        }

        event.sender.send('reset-dialog-style', resetList);
    });

    // show dialog
    ipcMain.on('show-dialog', () => {
        dialogModule.showDialog();
    });

    // create log name
    ipcMain.handle('create-log-name', (event, milliseconds) => {
        return dialogModule.createLogName(milliseconds);
    });
}

module.exports = {
    setDialogChannel,
};
