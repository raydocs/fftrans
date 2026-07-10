'use strict';

// electron
const { ipcRenderer } = require('electron');
const { IPC_CHANNELS } = require('../constants');

// all language list
const allLanguageList = ['Japanese', 'English', 'Traditional-Chinese', 'Simplified-Chinese', 'Korean', 'Russian', 'Italian'];

// target log
let targetLog = null;

// current audio URLs
let currentAudioUrls = [];
let currentAudioRequestId = '';
let audioRequestSequence = 0;
let progressiveAudioState = createProgressiveAudioState();

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
  ipcRenderer.on(IPC_CHANNELS.SEND_DATA, async (event, id) => {
    await readLog(id);
  });

  ipcRenderer.on(IPC_CHANNELS.ELEVENLABS_TTS_PROGRESSIVE_CHUNK, (event, payload = {}) => {
    handleElevenLabsProgressiveChunk(payload);
  });

  ipcRenderer.on(IPC_CHANNELS.ELEVENLABS_TTS_PROGRESSIVE_COMPLETE, (event, payload = {}) => {
    handleElevenLabsProgressiveComplete(payload);
  });

  ipcRenderer.on(IPC_CHANNELS.ELEVENLABS_TTS_PROGRESSIVE_ERROR, (event, payload = {}) => {
    handleElevenLabsProgressiveError(payload);
  });
}

// set view
async function setView() {
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);

  document.getElementById('select-engine').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_ENGINE_SELECT);
  document.getElementById('select-from').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_SOURCE_SELECT);
  document.getElementById('select-to').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_TARGET_SELECT);

  document.getElementById('select-engine').value = config.translation.engine;
  document.getElementById('select-from').value = config.translation.from;
  document.getElementById('select-to').value = config.translation.to;

  document.getElementById('checkbox-replace').checked = config.translation.replace;

  // Set TTS engine from config
  const ttsEngine = config.indexWindow.ttsEngine || 'elevenlabs';
  document.getElementById('select-tts-engine').value = ttsEngine;

  // change UI text
  ipcRenderer.send(IPC_CHANNELS.CHANGE_UI_TEXT);
}

// set event
function setEvent() {
  // move window
  document.addEventListener('move-window', (e) => {
    ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, e.detail, false);
  });

  document.getElementById('checkbox-replace').oninput = async () => {
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
    config.translation.replace = document.getElementById('checkbox-replace').checked;
    await ipcRenderer.invoke(IPC_CHANNELS.SET_CONFIG, config);
  };
}

// set button
function setButton() {
  // play audio
  document.getElementById('button-play-audio').onclick = async () => {
    await playAudio();
  };

  // download audio
  document.getElementById('button-download-audio').onclick = async () => {
    await downloadAudio();
  };

  // TTS engine change
  document.getElementById('select-tts-engine').onchange = async () => {
    const engine = document.getElementById('select-tts-engine').value;
    await ipcRenderer.invoke(IPC_CHANNELS.SET_TTS_ENGINE, engine);
  };

  // restart
  document.getElementById('button-restart-translate').onclick = async () => {
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);

    const dialogData = {
      id: targetLog.id,
      code: targetLog.code,
      name: targetLog.name,
      text: targetLog.text,
      timestamp: targetLog.timestamp,
      translation: config.translation,
    };

    if (!dialogData.translation.replace) {
      // clear id and timestamp
      dialogData.id = null;
      dialogData.timestamp = null;
    }

    dialogData.translation.engine = document.getElementById('select-engine').value;
    dialogData.translation.from = document.getElementById('select-from').value;
    dialogData.translation.fromPlayer = document.getElementById('select-from').value;
    dialogData.translation.to = document.getElementById('select-to').value;

    ipcRenderer.send(IPC_CHANNELS.ADD_TASK, dialogData);
  };

  // remove dialog
  document.getElementById('button-remove-dialog').onclick = () => {
    if (targetLog) {
      ipcRenderer.send(IPC_CHANNELS.REMOVE_DIALOG, targetLog.id);
    }
  };

  // load json
  document.getElementById('button-load-json').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.LOAD_JSON);
  };

  // report translation
  document.getElementById('button-report-translation').onclick = async () => {
    const result = await ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL_URL, 'https://forms.gle/1iX2Gq4G1itCy3UH9');
    if (!result?.success) {
      alert(`打开链接失败\n${result?.message || '未知错误'}`);
    }
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

  // edit custom
  document.getElementById('button-edit-custom').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CREATE_WINDOW, 'custom');
  };

  // close
  document.getElementById('img-button-close').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW);
  };
}

// read log
async function readLog(id = '') {
  const logPath = await ipcRenderer.invoke(IPC_CHANNELS.GET_USER_DATA_PATH, 'log');

  try {
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
    const milliseconds = parseInt(id.slice(2));
    const filePath = await ipcRenderer.invoke(IPC_CHANNELS.GET_PATH, logPath, await createLogName(milliseconds));
    const log = await ipcRenderer.invoke(IPC_CHANNELS.READ_JSON, filePath, false);

    targetLog = log[id];

    if (targetLog) {
      // show audio
      await showAudio();

      // show text
      showText();

      // set select-engine
      if (targetLog?.translation?.engine) {
        document.getElementById('select-engine').value = fixLogValue(
          targetLog.translation.engine,
          ['Youdao', 'Baidu', 'Caiyun', 'Papago', 'DeepL', 'GPT', 'Gemini', 'Kimi', 'OpenRouter', 'NVIDIA', 'LLM-API'],
          config.translation.engine
        );
      }

      // set select-from
      if (targetLog?.translation?.from) {
        document.getElementById('select-from').value = fixLogValue(targetLog.translation.from, allLanguageList, config.translation.from);
      }

      // set select-to
      if (targetLog?.translation?.to) {
        document.getElementById('select-to').value = fixLogValue(targetLog.translation.to, allLanguageList, config.translation.to);
      }
    }
  } catch (error) {
    console.log(error);
  }
}

function createProgressiveAudioState(requestId = '') {
  return {
    requestId,
    elements: new Map(),
    skippedIndexes: new Set(),
    playingAudio: null,
    playingIndex: null,
    lastCompletedIndex: -1,
  };
}

function createAudioRequestId() {
  audioRequestSequence += 1;
  return `edit-tts-${Date.now()}-${audioRequestSequence}`;
}

function isCurrentAudioRequest(requestId = '') {
  return Boolean(requestId) && requestId === currentAudioRequestId;
}

function resetAudioRequestState(requestId = '') {
  try {
    document.querySelectorAll('#div-audio audio').forEach((audio) => {
      try {
        audio.pause();
      } catch (error) {
        console.log(error);
      }
    });
  } catch (error) {
    console.log(error);
  }

  currentAudioRequestId = requestId;
  currentAudioUrls = [];
  progressiveAudioState = createProgressiveAudioState(requestId);
  resetAudioView('⏳ 正在生成语音...');
}

function resetAudioView(statusText = '') {
  const divAudio = document.getElementById('div-audio');
  divAudio.innerHTML = '';

  const status = document.createElement('p');
  status.id = 'tts-status';
  status.innerText = statusText;

  const audioList = document.createElement('div');
  audioList.id = 'tts-audio-list';

  divAudio.appendChild(status);
  divAudio.appendChild(audioList);
}

function getAudioViewElements() {
  let status = document.getElementById('tts-status');
  let audioList = document.getElementById('tts-audio-list');

  if (!status || !audioList) {
    resetAudioView('');
    status = document.getElementById('tts-status');
    audioList = document.getElementById('tts-audio-list');
  }

  return { status, audioList };
}

function updateAudioStatus(message = '', color = '') {
  const { status } = getAudioViewElements();
  status.innerText = message;
  status.style.color = color;
}

function renderBatchAudio(urlList = []) {
  const { audioList } = getAudioViewElements();
  audioList.innerHTML = '';

  urlList.forEach((url, index) => {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = url;
    if (index === 0) {
      audio.autoplay = true;
    }

    audioList.appendChild(audio);
    audioList.appendChild(document.createElement('br'));
  });
}

function tryPlayNextProgressiveAudio(requestId = '') {
  if (!isCurrentAudioRequest(requestId) || progressiveAudioState.playingAudio) {
    return;
  }

  let nextIndex = progressiveAudioState.lastCompletedIndex + 1;
  while (!progressiveAudioState.elements.has(nextIndex) && progressiveAudioState.skippedIndexes.has(nextIndex)) {
    progressiveAudioState.lastCompletedIndex = nextIndex;
    nextIndex += 1;
  }

  const nextAudio = progressiveAudioState.elements.get(nextIndex);
  if (!nextAudio) {
    return;
  }

  progressiveAudioState.playingAudio = nextAudio;
  progressiveAudioState.playingIndex = nextIndex;

  const playResult = nextAudio.play();
  if (playResult && typeof playResult.catch === 'function') {
    playResult.catch((error) => {
      if (!isCurrentAudioRequest(requestId)) {
        return;
      }

      console.error('Progressive audio playback failed:', error);
      progressiveAudioState.playingAudio = null;
      progressiveAudioState.playingIndex = null;
    });
  }
}

function appendProgressiveAudioElement(requestId = '', chunkIndex = 0, audioUrl = '') {
  if (!isCurrentAudioRequest(requestId) || !audioUrl || progressiveAudioState.elements.has(chunkIndex)) {
    return;
  }

  const { audioList } = getAudioViewElements();
  const wrapper = document.createElement('div');
  wrapper.className = 'tts-progressive-audio-item';
  wrapper.dataset.chunkIndex = `${chunkIndex}`;

  const label = document.createElement('p');
  label.innerText = `第 ${chunkIndex + 1} 段`;

  const audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'metadata';
  audio.src = audioUrl;
  audio.dataset.requestId = requestId;
  audio.dataset.chunkIndex = `${chunkIndex}`;

  audio.onplay = () => {
    if (!isCurrentAudioRequest(requestId)) {
      return;
    }
    progressiveAudioState.playingAudio = audio;
    progressiveAudioState.playingIndex = chunkIndex;
  };

  audio.onended = () => {
    if (!isCurrentAudioRequest(requestId)) {
      return;
    }

    progressiveAudioState.playingAudio = null;
    progressiveAudioState.playingIndex = null;
    progressiveAudioState.lastCompletedIndex = Math.max(progressiveAudioState.lastCompletedIndex, chunkIndex);
    tryPlayNextProgressiveAudio(requestId);
  };

  audio.onerror = () => {
    if (!isCurrentAudioRequest(requestId)) {
      return;
    }

    progressiveAudioState.playingAudio = null;
    progressiveAudioState.playingIndex = null;
    progressiveAudioState.lastCompletedIndex = Math.max(progressiveAudioState.lastCompletedIndex, chunkIndex);
    tryPlayNextProgressiveAudio(requestId);
  };

  wrapper.appendChild(label);
  wrapper.appendChild(audio);
  audioList.appendChild(wrapper);

  progressiveAudioState.elements.set(chunkIndex, audio);
  tryPlayNextProgressiveAudio(requestId);
}

function handleElevenLabsProgressiveChunk(payload = {}) {
  const {
    requestId = '',
    chunkIndex = -1,
    totalChunks = 0,
    audioUrl = '',
  } = payload;

  if (!isCurrentAudioRequest(requestId) || chunkIndex < 0 || !audioUrl) {
    return;
  }

  for (let index = progressiveAudioState.lastCompletedIndex + 1; index < chunkIndex; index++) {
    if (!progressiveAudioState.elements.has(index)) {
      progressiveAudioState.skippedIndexes.add(index);
    }
  }

  currentAudioUrls[chunkIndex] = audioUrl;
  appendProgressiveAudioElement(requestId, chunkIndex, audioUrl);

  const receivedCount = currentAudioUrls.filter(Boolean).length;
  updateAudioStatus(`⏳ 正在接收语音片段...（${receivedCount}/${totalChunks || receivedCount}）`);
}

function handleElevenLabsProgressiveComplete(payload = {}) {
  const {
    requestId = '',
    totalChunks = 0,
    failureCount = 0,
    failedChunkIndexes = [],
  } = payload;

  if (!isCurrentAudioRequest(requestId)) {
    return;
  }

  failedChunkIndexes.forEach((index) => {
    if (!progressiveAudioState.elements.has(index)) {
      progressiveAudioState.skippedIndexes.add(index);
    }
  });
  tryPlayNextProgressiveAudio(requestId);

  const successCount = currentAudioUrls.filter(Boolean).length;
  if (successCount === 0) {
    updateAudioStatus('⚠️ 未生成可播放音频，请先到设置页测试当前 TTS 配置。', 'orange');
    return;
  }

  if (failureCount > 0) {
    const displayIndexes = failedChunkIndexes.map((index) => index + 1).join(', ');
    updateAudioStatus(`⚠️ 已收到 ${successCount}/${totalChunks || successCount} 段语音，失败片段：${displayIndexes}`, 'orange');
    return;
  }

  updateAudioStatus(`✅ 已收到全部 ${successCount} 段语音`, 'green');
}

function handleElevenLabsProgressiveError(payload = {}) {
  const {
    requestId = '',
    message = '生成语音失败',
  } = payload;

  if (!isCurrentAudioRequest(requestId)) {
    return;
  }

  const successCount = currentAudioUrls.filter(Boolean).length;
  if (successCount > 0) {
    updateAudioStatus(`⚠️ 已收到部分语音，但后续处理失败：${message}`, 'orange');
    return;
  }

  updateAudioStatus(`❌ 生成语音失败: ${message}`, 'red');
}

// play audio
async function playAudio() {
  if (!targetLog) {
    return;
  }

  const text = targetLog.audio_text || targetLog.text;
  if (text === '') {
    return;
  }

  const ttsEngine = document.getElementById('select-tts-engine').value;
  const fromLang = targetLog.translation.from;
  const requestId = createAudioRequestId();
  resetAudioRequestState(requestId);

  try {
    if (ttsEngine === 'elevenlabs') {
      const startResult = await ipcRenderer.invoke(IPC_CHANNELS.ELEVENLABS_TTS_PROGRESSIVE, {
        requestId,
        text,
        from: fromLang,
      });

      if (!startResult?.success) {
        updateAudioStatus('❌ 启动 ElevenLabs 渐进语音失败', 'red');
      }
      return;
    }

    let urlList = [];

    switch (ttsEngine) {
      case 'google':
        urlList = await ipcRenderer.invoke(IPC_CHANNELS.GOOGLE_TTS, text, fromLang);
        break;
      case 'speechify':
        urlList = await ipcRenderer.invoke(IPC_CHANNELS.SPEECHIFY_TTS, text, fromLang);
        break;
      case 'mimo':
        urlList = await ipcRenderer.invoke(IPC_CHANNELS.MIMO_TTS, text, fromLang);
        break;
      default:
        urlList = await ipcRenderer.invoke(IPC_CHANNELS.GOOGLE_TTS, text, fromLang);
    }

    if (!isCurrentAudioRequest(requestId)) {
      return;
    }

    console.log(`[${ttsEngine}] TTS urls:`, urlList);

    currentAudioUrls = Array.isArray(urlList) ? [...urlList] : [];

    if (!Array.isArray(urlList) || urlList.length === 0) {
      updateAudioStatus('⚠️ 未生成可播放音频，请先到设置页测试当前 TTS 配置。', 'orange');
      currentAudioUrls = [];
      return;
    }

    updateAudioStatus(`✅ 已生成 ${urlList.length} 段语音`, 'green');
    renderBatchAudio(urlList);
  } catch (error) {
    if (!isCurrentAudioRequest(requestId)) {
      return;
    }

    console.error('Error generating audio:', error);
    updateAudioStatus(`❌ 生成语音失败: ${error.message}`, 'red');
  }
}

// download audio
async function downloadAudio() {
  const audioEntries = currentAudioUrls
    .map((url, index) => (url ? { url, chunkIndex: index } : null))
    .filter(Boolean);
  if (audioEntries.length === 0) {
    alert('请先点击"播放语音"生成音频');
    return;
  }

  const ttsEngine = document.getElementById('select-tts-engine').value;
  const timestamp = Date.now();

  try {
    for (let index = 0; index < audioEntries.length; index++) {
      const { url, chunkIndex } = audioEntries[index];

      // Create hidden link and trigger download
      const link = document.createElement('a');
      link.href = url;

      // Determine file extension
      let ext = 'mp3';
      if (url.startsWith('data:audio/ogg')) {
        ext = 'ogg';
      } else if (url.startsWith('data:audio/wav') || url.startsWith('data:audio/wave')) {
        ext = 'wav';
      } else if (url.startsWith('data:audio/mpeg')) {
        ext = 'mp3';
      }

      // Create filename with dialogue info
      const nameInfo = targetLog.name ? `${targetLog.name.substring(0, 10)}_` : '';
      const textInfo = (targetLog.text || '').substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
      link.download = `${ttsEngine}_${nameInfo}${textInfo}_part${chunkIndex + 1}_${timestamp}.${ext}`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Small delay between downloads
      if (index < audioEntries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, `已下载 ${audioEntries.length} 个音频文件`);
  } catch (error) {
    console.error('Download error:', error);
    alert(`下载失败: ${error.message}`);
  }
}

// show audio (called automatically when log loads)
async function showAudio() {
  // Auto-play with default TTS engine when log loads
  await playAudio();
}

// show text
function showText() {
  const divText1 = document.getElementById('div-text1');
  const name1 = targetLog.name;
  const text1 = targetLog.text;

  const divText2 = document.getElementById('div-text2');
  const name2 = targetLog.translated_name;
  const text2 = targetLog.translated_text;

  divText1.innerHTML = `<span>${name1 !== '' ? name1 + '：<br>' : ''}${text1}</span>`;
  divText2.innerHTML = `<span>${name2 !== '' ? name2 + '：<br>' : ''}${text2}</span>`;
}

/*
// report translation
function reportTranslation() {
  // google form
  const formId = '1FAIpQLScj8LAAHzy_nTIbbJ1BSqNzyZy3w5wFrLxDVUMbY0BIAjaIAg';
  const entry1 = 'entry.195796166';
  const entry2 = 'entry.1834106335';
  const entry3 = 'entry.2057890818';
  const entry4 = 'entry.654133178';

  try {
    const text1 = (targetLog.name !== '' ? targetLog.name + ': ' : '') + targetLog.text;
    const text2 =
      (targetLog.translated_name !== '' ? targetLog.translated_name + ': ' : '') + targetLog.translated_text;
    const path =
      `/forms/d/e/${formId}/formResponse?` +
      `${entry1}=待處理` +
      `&${entry2}=${targetLog.translation.engine}` +
      `&${entry3}=${text1}` +
      `&${entry4}=${text2}`;

    ipcRenderer.send(IPC_CHANNELS.POST_FORM, encodeURI(path));
    ipcRenderer.send(IPC_CHANNELS.SHOW_INFO, '回報完成');
  } catch (error) {
    console.log(error);
    ipcRenderer.send(IPC_CHANNELS.SHOW_INFO, '' + error);
  }
}
*/

// fix log value
function fixLogValue(value = '', valueArray = [], defaultValue = '') {
  if (!valueArray.includes(value)) value = defaultValue;
  return value;
}

// create log name
async function createLogName(milliseconds = null) {
  return await ipcRenderer.invoke(IPC_CHANNELS.CREATE_LOG_NAME, milliseconds);
}
