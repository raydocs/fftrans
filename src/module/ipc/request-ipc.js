'use strict';

const { app, ipcMain } = require('electron');
const requestModule = require('../system/request-module');
const versionModule = require('../system/version-module');
const windowModule = require('../system/window-module');
const dialogModule = require('../system/dialog-module');
const { IPC_CHANNELS } = require('../../constants');

const appVersion = app.getVersion();

function setRequestChannel() {
    // set UA
    ipcMain.on(IPC_CHANNELS.SET_UA, (event, scuValue, uaValue) => {
        requestModule.setUA(scuValue, uaValue);
    });

    // version check
    ipcMain.on(IPC_CHANNELS.VERSION_CHECK, (event) => {
        // get lastest version
        requestModule
            .get('https://api.github.com/repos/raydocs/fftrans/releases/latest')
            .then((response) => {
                // compare with app version
                const latestVersion = response?.data?.tag_name;

                if (latestVersion) {
                    if (versionModule.isLatest(appVersion, latestVersion)) {
                        windowModule.sendIndex(IPC_CHANNELS.HIDE_UPDATE_BUTTON, true);
                        console.log('latest version');
                    } else {
                        windowModule.sendIndex(IPC_CHANNELS.HIDE_UPDATE_BUTTON, false);
                        dialogModule.addNotification('UPDATE_AVAILABLE');
                    }
                } else {
                    throw 'VERSION_CHECK_ERRORED';
                }
            })
            .catch((error) => {
                console.log(error);
                windowModule.sendIndex(IPC_CHANNELS.HIDE_UPDATE_BUTTON, false);
                dialogModule.addNotification(error);
            });

        // get info
        requestModule
            .get('https://raw.githubusercontent.com/winw1010/tataru-assistant-text/main/info.json')
            .then((response) => {
                if (response?.data?.show) {
                    // show info
                    dialogModule.showInfo(event.sender, '' + response.data.message);
                }
            })
            .catch((error) => {
                console.log(error);
                dialogModule.addNotification(error);
            });
    });

    // post form
    ipcMain.on(IPC_CHANNELS.POST_FORM, (event, path) => {
        requestModule.post('https://docs.google.com' + path).catch(console.log);
    });
}

module.exports = {
    setRequestChannel,
};
