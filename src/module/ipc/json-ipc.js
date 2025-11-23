'use strict';

const { ipcMain } = require('electron');
const jsonEntry = require('../fix/json-entry');
const jsonFunction = require('../fix/json-function');
const dialogModule = require('../system/dialog-module');
const Logger = require('../../utils/logger');
const Validator = require('../../utils/validator');
const { CUSTOM_TYPES, FILE_NAMES, REGEX_PATTERNS, NOTIFICATIONS } = require('../../constants');

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
    if (type !== CUSTOM_TYPES.CUSTOM_OVERWRITE &&
        textBefore.length < 3 &&
        REGEX_PATTERNS.NO_KANJI.test(textBefore)) {
        return textBefore + '#';
    }
    return textBefore;
}

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
        dialogModule.addNotification(NOTIFICATIONS.TEMP_DELETED);
        Logger.info('json-ipc', 'Temp data deleted successfully');
    });

    // get array
    ipcMain.handle('get-user-array', (event, name = '') => {
        let array = jsonEntry.getUserArray(name);
        return array;
    });

    // save user custom
    ipcMain.on('save-user-custom', (event, textBefore = '', textAfter = '', type = '') => {
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
    ipcMain.on('delete-user-custom', (event, textBefore = '', type = '') => {
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
