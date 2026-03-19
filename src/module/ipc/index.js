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

let ipcRegistered = false;

// Active runtime IPC entrypoint.
// This function is intentionally idempotent so accidental re-entry does not
// register duplicate handlers/listeners.
function setIPC() {
    if (ipcRegistered) {
        return;
    }

    setSystemChannel();
    setWindowChannel();
    setDialogChannel();
    setCaptureChannel();
    setJsonChannel();
    setRequestChannel();
    setTranslateChannel();
    setTTSChannel();
    setFileChannel();

    ipcRegistered = true;
}

module.exports = {
    setIPC,
};
