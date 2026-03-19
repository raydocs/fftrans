'use strict';

const { ipcMain } = require('electron');
const dialogModule = require('../system/dialog-module');
const { IPC_CHANNELS } = require('../../constants');

function setDialogChannel() {
    // add log
    ipcMain.on(IPC_CHANNELS.ADD_LOG, (event, dialogData = {}, scroll = false) => {
        dialogModule.updateDialog(dialogData, scroll, false);
    });

    // add notification
    ipcMain.on(IPC_CHANNELS.ADD_NOTIFICATION, (event, text = '') => {
        dialogModule.addNotification(text);
    });

    // reset dialog style
    ipcMain.on(IPC_CHANNELS.RESET_DIALOG_STYLE, (event, resetList = []) => {
        for (let index = 0; index < resetList.length; index++) {
            const element = resetList[index];
            resetList[index].style = dialogModule.getStyle(element.code);
        }

        event.sender.send(IPC_CHANNELS.RESET_DIALOG_STYLE, resetList);
    });

    // show dialog
    ipcMain.on(IPC_CHANNELS.SHOW_DIALOG, () => {
        dialogModule.showDialog();
    });

    // create log name
    ipcMain.handle(IPC_CHANNELS.CREATE_LOG_NAME, (event, milliseconds) => {
        return dialogModule.createLogName(milliseconds);
    });
}

module.exports = {
    setDialogChannel,
};
