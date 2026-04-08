'use strict';

// electron
const { ipcRenderer } = require('electron');
const { IPC_CHANNELS } = require('../constants');

// DOMContentLoaded
window.addEventListener('DOMContentLoaded', async () => {
  setIPC();
  await setView();
  setEvent();
  setButton();
});

// set IPC
function setIPC() {
  // change UI text
  ipcRenderer.on(IPC_CHANNELS.CHANGE_UI_TEXT, async () => {
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
    document.dispatchEvent(new CustomEvent('change-ui-text', { detail: config }));
  });
}

// set view
async function setView() {
  await readLogList();

  // change UI text
  ipcRenderer.send(IPC_CHANNELS.CHANGE_UI_TEXT);
}

// set enevt
function setEvent() {
  // move window
  document.addEventListener('move-window', (e) => {
    ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, e.detail, false);
  });
}

// set button
function setButton() {
  // read
  document.getElementById('button-read-log').onclick = async () => {
    const file = document.getElementById('select-log').value;
    await readLog(file);
  };

  // view
  document.getElementById('button-view-log').onclick = async () => {
    const logPath = await ipcRenderer.invoke(IPC_CHANNELS.GET_USER_DATA_PATH, 'log');
    const result = await ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH, logPath);
    if (!result?.success) {
      alert(`打开路径失败\n${result?.message || '未知错误'}`);
    }
  };

  // close
  document.getElementById('img-button-close').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW);
  };
}

async function readLogList() {
  try {
    const logPath = await ipcRenderer.invoke(IPC_CHANNELS.GET_USER_DATA_PATH, 'log');
    const logs = await ipcRenderer.invoke(IPC_CHANNELS.READ_DIRECTORY, logPath);

    if (logs.length > 0) {
      const select = document.getElementById('select-log');

      let innerHTML = '';
      for (let index = 0; index < logs.length; index++) {
        const log = logs[index];
        innerHTML += `<option value="${log}">${log?.replace('.json', '')}</option>`;
      }

      select.innerHTML = innerHTML;
      select.value = logs[logs.length - 1];
    }
  } catch (error) {
    console.log(error);
  }
}

async function readLog(fileName) {
  if (fileName === 'none') {
    ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'FILE_NOT_FOUND');
    return;
  }

  try {
    const logPath = await ipcRenderer.invoke(IPC_CHANNELS.GET_USER_DATA_PATH, 'log');
    const fileLocation = await ipcRenderer.invoke(IPC_CHANNELS.GET_PATH, logPath, fileName);
    const log = await ipcRenderer.invoke(IPC_CHANNELS.READ_JSON, fileLocation, false);
    const logNames = Object.keys(log);

    if (logNames.length > 0) {
      ipcRenderer.send(IPC_CHANNELS.SEND_INDEX, IPC_CHANNELS.CLEAR_DIALOG);

      for (let index = 0; index < logNames.length; index++) {
        const logItem = log[logNames[index]];

        if (logItem.code !== 'FFFF') {
          const dialogData = {
            id: logItem.id,
            code: logItem.code,
            translatedName: logItem.translated_name,
            translatedText: logItem.translated_text,
            translation: logItem.translation,
          };

          const scroll = index === logNames.length - 1;

          ipcRenderer.send(IPC_CHANNELS.ADD_LOG, dialogData, scroll);
        }
      }
    }
  } catch (error) {
    console.log(error);
    ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'UNABLE_TO_READ_THE_FILE');
  }
}
