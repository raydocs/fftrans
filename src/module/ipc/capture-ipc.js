'use strict';

const { ipcMain, screen, dialog } = require('electron');
const imageModule = require('../system/image-module');
const windowModule = require('../system/window-module');
const textDetectModule = require('../system/text-detect-module');
const fileModule = require('../system/file-module');
const dialogModule = require('../system/dialog-module');

function setCaptureChannel() {
    // get screen bounds
    ipcMain.handle('get-screen-bounds', () => {
        return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
    });

    // get mouse position
    ipcMain.handle('get-mouse-position', () => {
        return screen.getCursorScreenPoint();
    });

    // start recognize
    ipcMain.on('start-recognize', (event, captureData) => {
        // get display nearest point
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

        // find display's index
        const displayIDs = screen.getAllDisplays().map((x) => x.id);
        captureData.displayIndex = displayIDs.indexOf(display.id);

        // take screenshot
        imageModule.takeScreenshot(captureData);
    });

    // minimize all windows
    ipcMain.on('minimize-all-windows', () => {
        windowModule.forEachWindow((myWindow) => {
            windowModule.minimizeWindow(myWindow);
        });
    });

    // translate image text
    ipcMain.on('translate-image-text', (event, captureData) => {
        textDetectModule.translateImageText(captureData);
    });

    // set google credential
    ipcMain.on('set-google-credential', () => {
        dialog
            .showOpenDialog({
                defaultPath: fileModule.getDownloadsPath(),
                filters: [{ name: 'JSON', extensions: ['json'] }],
            })
            .then((value) => {
                if (!value.canceled && value.filePaths.length > 0 && value.filePaths[0].length > 0) {
                    let data = fileModule.read(value.filePaths[0], 'json');

                    if (data) {
                        fileModule.write(fileModule.getUserDataPath('config', 'google-vision-credential.json'), data, 'json');
                        dialogModule.addNotification('GOOGLE_CREDENTIAL_SAVED');
                    } else {
                        dialogModule.addNotification('INCORRECT_FILE');
                    }
                }
            })
            .catch(console.log);
    });
}

module.exports = {
    setCaptureChannel,
};
