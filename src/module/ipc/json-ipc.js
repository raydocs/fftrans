'use strict';

const { ipcMain } = require('electron');
const jsonEntry = require('../fix/json-entry');
const jsonFunction = require('../fix/json-function');
const dialogModule = require('../system/dialog-module');
const Logger = require('../../utils/logger');
const Validator = require('../../utils/validator');
const { IPC_CHANNELS, CUSTOM_TYPES, FILE_NAMES, NOTIFICATIONS, shouldAppendShortTextMarker } = require('../../constants');

/**
 * Get filename for custom type
 * @param {string} type - Custom type
 * @returns {string} Filename
 */
function getFileNameForType(type) {
    const fileMap = {
        [CUSTOM_TYPES.CUSTOM_SOURCE]: FILE_NAMES.CUSTOM_SOURCE,
        [CUSTOM_TYPES.CUSTOM_OVERWRITE]: FILE_NAMES.CUSTOM_OVERWRITE,
        [CUSTOM_TYPES.PLAYER]: FILE_NAMES.PLAYER_NAME,
        [CUSTOM_TYPES.RETAINER]: FILE_NAMES.PLAYER_NAME,
    };
    return fileMap[type] || FILE_NAMES.CUSTOM_TARGET;
}

/**
 * Prepare text before saving (add # for short non-kanji text)
 * @param {string} textBefore - Original text
 * @param {string} type - Custom type
 * @returns {string} Processed text
 */
function prepareTextBefore(textBefore, type) {
    return shouldAppendShortTextMarker(textBefore, type)
        ? textBefore + '#'
        : textBefore;
}

function setJsonChannel() {
    // initialize json
      ipcMain.on(IPC_CHANNELS.INITIALIZE_JSON, () => {
        jsonEntry.initializeJSON();
    });

    // download json
      ipcMain.on(IPC_CHANNELS.DOWNLOAD_JSON, () => {
        jsonEntry.downloadJSON();
    });

    // load json
      ipcMain.on(IPC_CHANNELS.LOAD_JSON, () => {
        jsonEntry.loadJSON();
    });

    // delete temp
      ipcMain.on(IPC_CHANNELS.DELETE_TEMP, () => {
        jsonFunction.deleteTemp();
        jsonEntry.loadJSON();
        dialogModule.addNotification(NOTIFICATIONS.TEMP_DELETED);
        Logger.info('json-ipc', 'Temp data deleted successfully');
    });

    // get array
      ipcMain.handle(IPC_CHANNELS.GET_USER_ARRAY, (event, name = '') => {
        let array = jsonEntry.getUserArray(name);
        return array;
    });

    // save user custom
      ipcMain.on(IPC_CHANNELS.SAVE_USER_CUSTOM, (event, textBefore = '', textAfter = '', type = '') => {
        // Validate inputs
        if (!Validator.isValidString(textBefore) || !Validator.isValidString(textAfter)) {
            Logger.warn('json-ipc', 'Invalid input for save-user-custom');
            return;
        }

        const allowedTypes = Object.values(CUSTOM_TYPES);
        if (!Validator.isValidType(type, allowedTypes)) {
            Logger.error('json-ipc', `Invalid type for save-user-custom: ${type}`);
            return;
        }

        // Sanitize inputs
        textBefore = Validator.sanitize(textBefore);
        textAfter = Validator.sanitize(textAfter);

        // Use helper functions
        const fileName = getFileNameForType(type);
        const processedTextBefore = prepareTextBefore(textBefore, type);

        const array = [[processedTextBefore, textAfter, type]];

        jsonFunction.saveUserCustom(fileName, array);
        jsonEntry.loadJSON();
        event.sender.send('create-table');

        Logger.info('json-ipc', `Saved user custom: ${type}`);
    });

    // delete user custom
      ipcMain.on(IPC_CHANNELS.DELETE_USER_CUSTOM, (event, textBefore = '', type = '') => {
        // Validate inputs
        if (!Validator.isValidString(textBefore)) {
            Logger.warn('json-ipc', 'Invalid input for delete-user-custom');
            return;
        }

        const allowedTypes = Object.values(CUSTOM_TYPES);
        if (!Validator.isValidType(type, allowedTypes)) {
            Logger.error('json-ipc', `Invalid type for delete-user-custom: ${type}`);
            return;
        }

        // Sanitize input
        textBefore = Validator.sanitize(textBefore);

        // Use helper functions
        const fileName = getFileNameForType(type);
        const processedTextBefore = prepareTextBefore(textBefore, type);

        jsonFunction.editUserCustom(fileName, processedTextBefore);
        jsonFunction.editUserCustom(FILE_NAMES.TEMP_NAME, processedTextBefore);
        jsonEntry.loadJSON();
        event.sender.send('create-table');

        Logger.info('json-ipc', `Deleted user custom: ${type}`);
    });
}

module.exports = {
    setJsonChannel,
};
