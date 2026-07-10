'use strict';

// electron
const { ipcRenderer } = require('electron');
const { IPC_CHANNELS } = require('../constants');

const arrayParameters = {
  'player-name-table': { type: 'user', name: 'playerName' },
  'custom-target-table': { type: 'user', name: 'customTarget' },
  'temp-name-table': { type: 'user', name: 'tempName' },
  'temp-name-table-valid': { type: 'user', name: 'tempNameValid' },
};

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

  // create table
  ipcRenderer.on(IPC_CHANNELS.CREATE_TABLE, async () => {
    await createTable();
  });
}

// set view
async function setView() {
  await createTable();

  // change UI text
  ipcRenderer.send(IPC_CHANNELS.CHANGE_UI_TEXT);
}

// set enevt
function setEvent() {
  // move window
  document.addEventListener('move-window', (e) => {
    ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, e.detail, false);
  });

  document.getElementById('select-table-type').onchange = async () => {
    await createTable();
  };
}

// set button
function setButton() {
  // close
  document.getElementById('img-button-close').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW);
  };

  // save custom
  document.getElementById('button-save-custom').onclick = () => {
    const textBefore = document.getElementById('textarea-before').value.replaceAll('\n', '').trim();
    const textAfter = document.getElementById('textarea-after').value.replaceAll('\n', '').trim();
    const type = document.getElementById('select-type').value;

    if (textBefore.length > 1) {
      ipcRenderer.send(IPC_CHANNELS.SAVE_USER_CUSTOM, textBefore, textAfter, type);
      ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'WORD_SAVED');
    } else {
      ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'LENGTH_TOO_SHORT');
    }
  };

  // delete custom
  document.getElementById('button-delete-custom').onclick = () => {
    const textBefore = document.getElementById('textarea-before').value.replaceAll('\n', '').trim();
    const type = document.getElementById('select-type').value;

    if (textBefore.length > 1) {
      ipcRenderer.send(IPC_CHANNELS.DELETE_USER_CUSTOM, textBefore, type);
      ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'WORD_DELETED');
    } else {
      ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'LENGTH_TOO_SHORT');
    }
  };

  // search
  document.getElementById('button-search').onclick = async () => {
    let keyword = document.getElementById('input-Keyword').value;
    await createTable(keyword);
  };

  // view all
  document.getElementById('button-view-all').onclick = async () => {
    await createTable();
  };

  // view files
  document.getElementById('button-view-files').onclick = async () => {
    const path = await ipcRenderer.invoke(IPC_CHANNELS.GET_USER_DATA_PATH, 'text');
    const result = await ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH, path);
    if (!result?.success) {
      alert(`打开路径失败\n${result?.message || '未知错误'}`);
    }
  };

  // clear cache
  document.getElementById('button-clear-cache').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CLEAR_CACHE);
  };
}

// create table
async function createTable(keyword = '') {
  const tableType = document.getElementById('select-table-type').value;
  const arrayParameter = arrayParameters[tableType];
  const array = await ipcRenderer.invoke(IPC_CHANNELS.GET_USER_ARRAY, arrayParameter.name);
  const tbody = document.getElementById('tbody-custom-table');
  let innerHTML = '';

  if (array.length > 0) {
    for (let index = 0; index < array.length; index++) {
      const element = array[index];
      const text = element[0] || '';
      const translatedText = element[1] || '';
      const textType = element[2] || '';

      if (keyword !== '' && !text.includes(keyword) && !translatedText.includes(keyword)) continue;

      innerHTML += `
      <tr>
      <td id="text1-${index}">${text}</td>
      <td id="text2-${index}">${translatedText}</td>
      <td id="type-${index}">${textType}</td>
      <td><a id="edit-${index}" href="#">編輯</a></td>
      </tr>
      `;
    }
  } else {
    innerHTML += '<tr><td colspan="4">No data</td></tr>';
  }

  tbody.innerHTML = innerHTML;

  for (let index = 0; index < array.length; index++) {
    const editButton = document.getElementById(`edit-${index}`);

    if (editButton) {
      editButton.onclick = () => {
        document.getElementById('textarea-before').value = document.getElementById(`text1-${index}`).innerText;
        document.getElementById('textarea-after').value = document.getElementById(`text2-${index}`).innerText;
      };
    }
  }
}
