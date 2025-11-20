'use strict';

const { setSystemChannel } = require('./system-ipc');
const { setWindowChannel } = require('./window-ipc');
const { setDialogChannel } = require('./dialog-ipc');
const { setCaptureChannel } = require('./capture-ipc');
const { setRequestChannel } = require('./request-ipc');
const { setJsonChannel } = require('./json-ipc');
const { setTranslateChannel } = require('./translate-ipc');
const { setTTSChannel } = require('./tts-ipc');
const { setFileChannel } = require('./file-ipc');

// set ipc
function setIPC() {
    setSystemChannel();
    setWindowChannel();
    setDialogChannel();
    setCaptureChannel();
    setJsonChannel();
    setRequestChannel();
    setTranslateChannel();
    setTTSChannel();
    setFileChannel();
}

module.exports = {
    setIPC,
};
