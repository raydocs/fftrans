'use strict';

const { ipcMain, screen, dialog } = require('electron');
const imageModule = require('../system/image-module');
const windowModule = require('../system/window-module');
const textDetectModule = require('../system/text-detect-module');
const fileModule = require('../system/file-module');
const dialogModule = require('../system/dialog-module');
const Logger = require('../../utils/logger');
const Validator = require('../../utils/validator');
const { IPC_CHANNELS, NOTIFICATIONS } = require('../../constants');

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
    ipcMain.on(IPC_CHANNELS.SET_GOOGLE_CREDENTIAL, () => {
        dialog
            .showOpenDialog({
                defaultPath: fileModule.getDownloadsPath(),
                filters: [{ name: 'JSON', extensions: ['json'] }],
            })
            .then((value) => {
                if (!value.canceled && value.filePaths.length > 0 && value.filePaths[0].length > 0) {
                    const filePath = value.filePaths[0];

                    // Validate file path for security
                    const pathValidation = Validator.validateFilePath(filePath, ['.json']);
                    if (!pathValidation.valid) {
                        Logger.error('capture-ipc', 'Invalid file path selected', pathValidation.error);
                        dialogModule.addNotification(NOTIFICATIONS.INVALID_PATH);
                        return;
                    }

                    let data = fileModule.read(filePath, 'json');

                    if (data) {
                        fileModule.write(fileModule.getUserDataPath('config', 'google-vision-credential.json'), data, 'json');
                        dialogModule.addNotification(NOTIFICATIONS.GOOGLE_CREDENTIAL_SAVED);
                        Logger.info('capture-ipc', 'Google credential saved successfully');
                    } else {
                        dialogModule.addNotification(NOTIFICATIONS.INCORRECT_FILE);
                        Logger.warn('capture-ipc', 'Invalid JSON file selected');
                    }
                }
            })
            .catch((error) => {
                Logger.error('capture-ipc', 'Failed to set Google credential', error);
                dialogModule.addNotification(NOTIFICATIONS.GOOGLE_CREDENTIAL_ERROR);
            });
    });
}

module.exports = {
    setCaptureChannel,
};
