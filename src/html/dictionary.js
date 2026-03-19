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

  // show translation
  ipcRenderer.on(IPC_CHANNELS.SHOW_TRANSLATION, async (event, translatedText, target) => {
    // show translated text
    if (translatedText !== '') {
      document.getElementById('span-translated-text').innerText = translatedText;
      document.getElementById('div-audio').innerHTML = await getAudioHtml(translatedText, target);
    } else {
      document.getElementById('span-translated-text').innerText = '';
      document.getElementById('div-audio').innerHTML = '';
    }
  });
}

// set view
async function setView() {
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);

  document.getElementById('select-engine').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_ENGINE_SELECT);
  document.getElementById('select-from').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_LANGUAGE_SELECT);
  document.getElementById('select-to').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_LANGUAGE_SELECT);

  document.getElementById('select-engine').value = config.translation.engine;
  document.getElementById('select-from').value = config.translation.from;
  document.getElementById('select-to').value = config.translation.to;

  // change UI text
  ipcRenderer.send(IPC_CHANNELS.CHANGE_UI_TEXT);
}

// set enevt
function setEvent() {
  // move window
  document.addEventListener('move-window', (e) => {
    ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, e.detail, false);
  });

  // Tataru
  document.getElementById('checkbox-tataru').onchange = () => {
    const checked = document.getElementById('checkbox-tataru').checked;
    document.getElementById('div-original-name').hidden = !checked;
  };
}

// set button
function setButton() {
  // close
  document.getElementById('img-button-close').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW);
  };

  // exchange
  document.getElementById('button-switch').onclick = () => {
    const valueFrom = document.getElementById('select-from').value;
    document.getElementById('select-from').value = document.getElementById('select-to').value;
    document.getElementById('select-to').value = valueFrom;
  };

  // translate
  document.getElementById('button-translate').onclick = async () => {
    const inputName = document.getElementById('input-original-name').value;
    const inputText = document.getElementById('textarea-original-text').value;
    const dialogData = await createDialogData(inputName, inputText);

    document.getElementById('span-translated-text').innerText = '...';
    document.getElementById('div-audio').innerHTML = '';

    if (inputText !== '') {
      if (document.getElementById('checkbox-tataru').checked) {
        ipcRenderer.send(IPC_CHANNELS.ADD_TASK, dialogData);
      } else {
        ipcRenderer.send(IPC_CHANNELS.TRANSLATE_TEXT, dialogData);
      }
    } else {
      document.getElementById('span-translated-text').innerText = '';
      document.getElementById('div-audio').innerHTML = '';
    }
  };
}

// create dialog data
async function createDialogData(name = '', text = '') {
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);

  let dialogData = {
    id: null,
    playerName: '',
    code: '003D',
    name: name,
    text: text,
    timestamp: null,
    translation: config.translation,
  };

  dialogData.translation.from = document.getElementById('select-from').value;
  dialogData.translation.fromPlayer = document.getElementById('select-from').value;
  dialogData.translation.to = document.getElementById('select-to').value;
  dialogData.translation.engine = document.getElementById('select-engine').value;
  dialogData.translation.autoChange = false;

  return dialogData;
}

// get audio html
async function getAudioHtml(translatedText, languageTo) {
  if (translatedText !== '') {
    try {
      const urlList = await ipcRenderer.invoke(IPC_CHANNELS.GOOGLE_TTS, translatedText, languageTo);
      console.log('TTS url:', urlList);

      let innerHTML = '';
      for (let index = 0; index < urlList.length; index++) {
        const url = urlList[index];

        innerHTML += `
                    <audio controls preload="metadata">
                        <source src="${url}" type="audio/ogg">
                        <source src="${url}" type="audio/mpeg">
                    </audio>
                    <br>
                `;
      }

      return innerHTML;
    } catch (error) {
      console.log(error);
      return '';
    }
  }
}
