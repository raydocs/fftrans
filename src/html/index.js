'use strict';

// electron
const { ipcRenderer } = require('electron');
const { IPC_CHANNELS } = require('../constants');

// click through
let clickThrough = false;

// hide update button
let hideUpdateButton = true;

// timeout
let rafScroll = null;
let rafMove = null;
let revealControlsTimeout = null;

// DOMContentLoaded
window.addEventListener('DOMContentLoaded', async () => {
  setIPC();
  await setView();
  setEvent();
  setButton();
  startApp();
});

// set IPC
function setIPC() {
  // change UI text
  ipcRenderer.on(IPC_CHANNELS.CHANGE_UI_TEXT, async () => {
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
    document.dispatchEvent(new CustomEvent('change-ui-text', { detail: config }));
  });

  // reset view
  ipcRenderer.on(IPC_CHANNELS.RESET_VIEW, (event, config) => {
    resetView(config);
  });

  ipcRenderer.on(IPC_CHANNELS.REVEAL_COMPACT_CONTROLS, () => {
    clearTimeout(revealControlsTimeout);
    document.body.classList.add('controls-revealed');
    revealControlsTimeout = setTimeout(() => {
      document.body.classList.remove('controls-revealed');
    }, 5000);
  });

  // hide button
  ipcRenderer.on(IPC_CHANNELS.HIDE_BUTTON, (event, value) => {
    hideButton(value.isMouseOut, value.hideButton);
  });

  // hide update button
  ipcRenderer.on(IPC_CHANNELS.HIDE_UPDATE_BUTTON, (event, isHidden) => {
    hideUpdateButton = isHidden;
  });

  // add audio
  ipcRenderer.on(IPC_CHANNELS.ADD_TO_PLAYLIST, (event, urlList) => {
    document.dispatchEvent(new CustomEvent('add-to-playlist', { detail: urlList }));
  });

  // Fish 流式 TTS：转成 DOM 事件交给 speech.js 的 MediaSource 播放
  ipcRenderer.on(IPC_CHANNELS.FISH_TTS_STREAM_START, (event, payload) => {
    document.dispatchEvent(new CustomEvent('fish-stream-start', { detail: payload }));
  });
  ipcRenderer.on(IPC_CHANNELS.FISH_TTS_STREAM_CHUNK, (event, payload) => {
    document.dispatchEvent(new CustomEvent('fish-stream-chunk', { detail: payload }));
  });
  ipcRenderer.on(IPC_CHANNELS.FISH_TTS_STREAM_END, (event, payload) => {
    document.dispatchEvent(new CustomEvent('fish-stream-end', { detail: payload }));
  });
  ipcRenderer.on(IPC_CHANNELS.FISH_TTS_STREAM_ERROR, (event, payload) => {
    document.dispatchEvent(new CustomEvent('fish-stream-error', { detail: payload }));
  });

  // console log
  ipcRenderer.on(IPC_CHANNELS.CONSOLE_LOG, (event, text) => {
    console.log(text);
  });

  // add dialog
  ipcRenderer.on(IPC_CHANNELS.ADD_DIALOG, (event, dialogData = {}) => {
    let dialog = document.getElementById(dialogData.id);

    if (!dialog) {
      dialog = addDialog(dialogData.id, dialogData.code);
      dialog.style.display = 'none';
    }
  });

  // update dialog
  ipcRenderer.on(IPC_CHANNELS.UPDATE_DIALOG, (event, dialogData = {}, style = {}, scroll = true) => {
    let dialog = document.getElementById(dialogData.id);

    if (!dialog) {
      dialog = addDialog(dialogData.id, dialogData.code);
    }

    dialog.style.display = 'block';

    if (dialogData.translatedName !== '') {
      dialogData.translatedName += '</br>';
    }

    setDialogContent(dialog, dialogData.translatedName + dialogData.translatedText);
    setDialogStyle(dialog, style);

    if (dialog.className !== 'FFFF') {
      dialog.style.cursor = 'pointer';
      dialog.onclick = () => {
        ipcRenderer.send(IPC_CHANNELS.RESTART_WINDOW, 'edit', dialogData.id);
      };
    }

    if (scroll) {
      scrollIntoView(dialogData.id);
    }
  });

  // add notification
  ipcRenderer.on(IPC_CHANNELS.ADD_NOTIFICATION, (event, id, code, text = '', style = {}) => {
    const dialog = addDialog(id, code);
    setDialogStyle(dialog, style);
    setDialogContent(dialog, text);
    scrollIntoView(id);
  });

  // remove dialog
  ipcRenderer.on(IPC_CHANNELS.REMOVE_DIALOG, (event, id) => {
    try {
      document.getElementById(id).remove();
    } catch (error) {
      error;
    }
  });

  // reset dialog style
  ipcRenderer.on(IPC_CHANNELS.RESET_DIALOG_STYLE, (event, resetList = []) => {
    for (let index = 0; index < resetList.length; index++) {
      const element = resetList[index];
      setDialogStyle(document.getElementById(element.id), element.style);
    }
  });

  // hide dialog
  ipcRenderer.on(IPC_CHANNELS.HIDE_DIALOG, (event, isHidden) => {
    document.getElementById('div-dialog').hidden = isHidden;
  });

  // clear dialog
  ipcRenderer.on(IPC_CHANNELS.CLEAR_DIALOG, () => {
    document.getElementById('div-dialog').innerHTML = '';
  });

  // move to bottom
  ipcRenderer.on(IPC_CHANNELS.MOVE_TO_BOTTOM, () => {
    moveToBottom();
  });
}

// set view
async function setView() {
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);

  resetView(config);
  setClickThrough(config.indexWindow.clickThrough);
  updateCompactButton(config.indexWindow.compactMode);

  if (config.system.firstTime) {
    ipcRenderer.send(IPC_CHANNELS.CREATE_WINDOW, 'config', 'div-translation');
  }

  ipcRenderer.send(IPC_CHANNELS.CHANGE_UI_TEXT);
}

// set event
function setEvent() {
  document.addEventListener('move-window', (e) => {
    ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, e.detail, false);
  });

  document.getElementById('img-button-drag').addEventListener('mousedown', () => {
    clickThrough = false;
  });

  document.getElementById('img-button-drag').addEventListener('mouseup', async () => {
    clickThrough = await ipcRenderer.invoke(IPC_CHANNELS.GET_CLICK_THROUGH_CONFIG);
  });

  document.addEventListener('mouseenter', () => {
    if (clickThrough) {
      ipcRenderer.send(IPC_CHANNELS.SET_CLICK_THROUGH, true);
    } else {
      ipcRenderer.send(IPC_CHANNELS.SET_CLICK_THROUGH, false);
    }
  });

  document.addEventListener('mouseleave', () => {
    ipcRenderer.send(IPC_CHANNELS.SET_CLICK_THROUGH, false);
  });

  const buttonArray = document.getElementsByClassName('btn-icon');
  for (let index = 0; index < buttonArray.length; index++) {
    const element = buttonArray[index];

    element.addEventListener('mouseenter', () => {
      ipcRenderer.send(IPC_CHANNELS.SET_CLICK_THROUGH, false);
    });

    element.addEventListener('mouseleave', () => {
      if (clickThrough) {
        ipcRenderer.send(IPC_CHANNELS.SET_CLICK_THROUGH, true);
      } else {
        ipcRenderer.send(IPC_CHANNELS.SET_CLICK_THROUGH, false);
      }
    });
  }
}

// set button
function setButton() {
  document.getElementById('img-button-config').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CREATE_WINDOW, 'config');
  };

  document.getElementById('img-button-capture').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CREATE_WINDOW, 'capture');
  };

  document.getElementById('img-button-through').onclick = () => {
    setClickThrough(!clickThrough);
    ipcRenderer.send(IPC_CHANNELS.SET_CLICK_THROUGH_CONFIG, clickThrough);
  };

  document.getElementById('img-button-update').onclick = async () => {
    const result = await ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL_URL, 'https://github.com/raydocs/fftrans/releases/latest/');
    if (!result?.success) {
      alert(`打开链接失败\n${result?.message || '未知错误'}`);
    }
  };

  document.getElementById('img-button-compact').onclick = async () => {
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
    config.indexWindow.compactMode = !config.indexWindow.compactMode;
    if (config.indexWindow.compactMode) {
      config.indexWindow.compactWidth = 232;
      config.indexWindow.compactHeight = 56;
    }
    config.indexWindow.x = -1;
    config.indexWindow.y = -1;
    config.indexWindow.width = -1;
    config.indexWindow.height = -1;
    await ipcRenderer.invoke(IPC_CHANNELS.SET_CONFIG, config);
    ipcRenderer.send(IPC_CHANNELS.SEND_INDEX, IPC_CHANNELS.RESET_VIEW, config);
    if (config.indexWindow.compactMode) {
      ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, {
        x: window.screenX,
        y: window.screenY,
        width: config.indexWindow.compactWidth,
        height: config.indexWindow.compactHeight,
      });
    }
    updateCompactButton(config.indexWindow.compactMode);
    ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, config.indexWindow.compactMode ? 'COMPACT_MODE_ON' : 'COMPACT_MODE_OFF');
  };

  document.getElementById('img-button-minimize').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.MINIMIZE_WINDOW);
  };

  document.getElementById('img-button-close').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CLOSE_APP);
  };

  document.getElementById('img-button-speech').onclick = async () => {
    console.log('[TTS] Button clicked');
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
    config.indexWindow.speech = !config.indexWindow.speech;
    console.log('[TTS] Speech enabled:', config.indexWindow.speech);
    await ipcRenderer.invoke(IPC_CHANNELS.SET_CONFIG, config);
    ipcRenderer.send(IPC_CHANNELS.MUTE_WINDOW, config.indexWindow.speech);
    setSpeech(config.indexWindow.speech);
  };

  document.getElementById('img-button-custom').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CREATE_WINDOW, 'custom');
  };

  document.getElementById('img-button-read-log').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CREATE_WINDOW, 'read-log');
  };

  document.getElementById('img-button-dictionary').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CREATE_WINDOW, 'dictionary');
  };

  document.getElementById('img-button-backspace').onclick = () => {
    try {
      document.getElementById('div-dialog').lastElementChild.remove();
    } catch (error) {
      console.log(error);
    }
  };

  document.getElementById('img-button-clear').onclick = () => {
    document.getElementById('div-dialog').innerHTML = '';
  };
}

// start app
function startApp() {
  ipcRenderer.send(IPC_CHANNELS.SET_UA, navigator?.userAgentData?.brands, navigator?.userAgent);
  ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'VIEW_README');
  ipcRenderer.send(IPC_CHANNELS.VERSION_CHECK);
  ipcRenderer.send(IPC_CHANNELS.INITIALIZE_JSON);
}

// reset view
function resetView(config) {
  document.body.classList.toggle('voice-only-mode', Boolean(config.indexWindow.compactMode));
  setSpeech(config.indexWindow.speech);
  ipcRenderer.send(IPC_CHANNELS.RESTORE_WINDOW);
  ipcRenderer.send(IPC_CHANNELS.SET_ALWAYS_ON_TOP, config.indexWindow.alwaysOnTop);
  ipcRenderer.send(IPC_CHANNELS.SET_FOCUSABLE, config.indexWindow.focusable);

  document.dispatchEvent(new CustomEvent('set-speech-speed', { detail: config.indexWindow.speechSpeed }));

  document.querySelectorAll('.img-hidden').forEach((value) => {
    document.getElementById(value.id).hidden = config.indexWindow.hideButton;
  });

  resetDialogStyle();
  ipcRenderer.send(IPC_CHANNELS.SHOW_DIALOG);
  document.getElementById('div-dialog').style.backgroundColor = config.indexWindow.backgroundColor;
  ipcRenderer.send(
    IPC_CHANNELS.SET_MIN_SIZE,
    config.indexWindow.minSize,
    config.indexWindow.compactMode,
    config.indexWindow.compactWidth,
    config.indexWindow.compactHeight,
  );
}

// add dialog
function addDialog(id = '', code = '') {
  const dialog = document.createElement('div');
  dialog.id = id;
  dialog.className = code;
  document.getElementById('div-dialog').append(dialog);
  return dialog;
}

// set dialog content (OPTIMIZED: reuse span to avoid DOM reconstruction)
function setDialogContent(dialog, text = '') {
  if (dialog) {
    let content = dialog.querySelector('span');

    if (!content) {
      content = document.createElement('span');
      dialog.appendChild(content);
    }

    content.innerHTML = text;
  }
}

// set dialog style
function setDialogStyle(dialog = null, style = {}) {
  if (dialog) {
    Object.keys(style).forEach((key) => {
      try {
        dialog.style[key] = style[key];
      } catch (error) {
        console.log(error);
      }
    });
  }
}

// reset dialog style
function resetDialogStyle() {
  const dialogCollection = document.getElementById('div-dialog').children;
  const resetList = [];

  for (let index = 0; index < dialogCollection.length; index++) {
    const element = dialogCollection[index];
    resetList.push({
      id: element.id,
      code: element.className,
    });
  }

  ipcRenderer.send(IPC_CHANNELS.RESET_DIALOG_STYLE, resetList);
}

// scroll into view - optimized for streaming translation
let lastScrollId = '';
let scrollPending = false;

function scrollIntoView(id = '') {
  lastScrollId = id;

  if (!scrollPending) {
    scrollPending = true;
    requestAnimationFrame(() => {
      scrollPending = false;

      const container = document.getElementById('div-dialog');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }
}

// move to bottom
function moveToBottom() {
  if (rafMove) {
    cancelAnimationFrame(rafMove);
  }
  rafMove = requestAnimationFrame(() => {
    clearSelection();
    const div = document.getElementById('div-dialog');
    if (div) {
      div.scrollTop = div.scrollHeight;
    }
  });
}

// clear selection
function clearSelection() {
  if (window.getSelection) {
    window.getSelection().removeAllRanges();
  } else if (document.selection) {
    document.selection.empty();
  }
}

// hide button
function hideButton(isMouseOut, hideButton) {
  if (isMouseOut) {
    document.querySelectorAll('.img-hidden').forEach((value) => {
      document.getElementById(value.id).hidden = hideButton;
    });
  } else {
    document.querySelectorAll('.img-hidden').forEach((value) => {
      document.getElementById(value.id).hidden = false;
    });

    document.getElementById('img-button-update').hidden = hideUpdateButton;
    ipcRenderer.send(IPC_CHANNELS.SHOW_DIALOG);
  }
}

// set click through button
let clickThroughHintTimeout = null;
function setClickThrough(value) {
  clickThrough = value;
  const hint = document.getElementById('div-click-through-hint');
  const button = document.getElementById('img-button-through');

  if (clickThroughHintTimeout) {
    clearTimeout(clickThroughHintTimeout);
    clickThroughHintTimeout = null;
  }

  if (clickThrough) {
    if (hint) {
      hint.hidden = false;
      clickThroughHintTimeout = setTimeout(() => {
        hint.hidden = true;
      }, 2000);
    }
    if (button) button.style.opacity = '0.5';
  } else {
    if (hint) hint.hidden = true;
    if (button) button.style.opacity = '1';
  }
}

function setSpeech(value) {
  console.log('[TTS] setSpeech called with:', value);
  const button = document.getElementById('img-button-speech');
  const iconPath = button?.querySelector('svg path:last-child');
  const enabledIcon = 'M3 9v6h4l5 5V4L7 9H3zm11 6.54c1.19-.69 2-1.97 2-3.54s-.81-2.85-2-3.54v7.08zm0-11.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z';
  const disabledIcon = 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z';

  if (iconPath) iconPath.setAttribute('d', value ? enabledIcon : disabledIcon);
  if (button) {
    button.title = value ? 'Mute TTS' : 'Enable TTS';
    button.setAttribute('aria-label', button.title);
  }

  if (value) {
    if (button) button.style.opacity = '1';
    console.log('[TTS] Dispatching start-playing event');
    document.dispatchEvent(new CustomEvent('start-playing'));
  } else {
    if (button) button.style.opacity = '0.5';
    console.log('[TTS] Dispatching stop-playing event');
    document.dispatchEvent(new CustomEvent('stop-playing'));
  }
}

// update compact button appearance
function updateCompactButton(isCompact) {
  const btn = document.getElementById('img-button-compact');
  if (btn) {
    btn.style.opacity = isCompact ? '1' : '0.5';
    btn.title = isCompact ? 'Voice-only Mode (ON)' : 'Voice-only Mode (OFF)';
  }
}
