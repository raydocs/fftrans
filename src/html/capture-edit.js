'use strict';

// electron
const { ipcRenderer } = require('electron');
const { IPC_CHANNELS } = require('../constants');

// capture data
let captureData = {};

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

  // send data
  ipcRenderer.on(IPC_CHANNELS.SEND_DATA, (event, data) => {
    captureData = data;
    document.getElementById('textarea-screen-text').value = captureData.text;
  });
}

// set view
async function setView() {
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
  document.getElementById('checkbox-split').checked = config.captureWindow.split;
  document.getElementById('img-captured').setAttribute('src', await ipcRenderer.invoke(IPC_CHANNELS.GET_ROOT_PATH, 'src', 'data', 'img', 'cropped.png'));

  // change UI text
  ipcRenderer.send(IPC_CHANNELS.CHANGE_UI_TEXT);
}

// set event
function setEvent() {
  // move window
  document.addEventListener('move-window', (e) => {
    ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, e.detail, false);
  });

  // checkbox
  document.getElementById('checkbox-split').oninput = async () => {
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
    config.captureWindow.split = document.getElementById('checkbox-split').checked;
    await ipcRenderer.invoke(IPC_CHANNELS.SET_CONFIG, config);
  };
}

// set button
function setButton() {
  // close
  document.getElementById('img-button-close').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW);
  };

  // page
  document.getElementsByName('btnradio').forEach((btnradio) => {
    btnradio.onclick = () => {
      document.querySelectorAll('.div-page').forEach((page) => {
        document.getElementById(page.id).hidden = true;
      });
      document.getElementById(btnradio.value).hidden = false;
    };
  });

  // translate
  document.getElementById('button-translate').onclick = () => {
    captureData.text = document.getElementById('textarea-screen-text').value;
    captureData.split = document.getElementById('checkbox-split').checked;
    ipcRenderer.send(IPC_CHANNELS.TRANSLATE_IMAGE_TEXT, captureData);
  };
}
