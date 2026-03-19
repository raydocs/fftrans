'use strict';

// electron
const { ipcRenderer, clipboard } = require('electron');
const { IPC_CHANNELS } = require('../constants');

let lastElevenLabsAuthStatus = null;
let elevenLabsStatusRequestId = 0;
let elevenLabsBrowserAssistAutoDetectTimer = null;
let elevenLabsBrowserAssistAutoDetectKey = '';
let lastElevenLabsAutoDetectNotificationKey = '';
let pendingElevenLabsBrowserAssistAutoDetect = false;
let elevenLabsBrowserAssistAutoDetectInFlight = false;
let isElevenLabsBrowserAssistAutoDetectPaused = false;
let isConfigWindowClosing = false;
let activeElevenLabsAction = null;
const ELEVENLABS_ACTION_BUTTON_IDS = [
  'btn-validate-elevenlabs-refresh-token',
  'btn-save-elevenlabs-imported',
  'btn-clear-elevenlabs-session',
  'btn-import-elevenlabs-app-check',
  'btn-test-elevenlabs',
];
const ELEVENLABS_COPY_BUTTON_SPECS = [
  {
    id: 'btn-copy-elevenlabs-refresh-source',
    shortLabel: 'R↗',
    getValue: () => lastElevenLabsAuthStatus?.browserAssist?.lastInspection?.sources?.refreshToken || '',
    copiedText: ['已複製 Refresh 來源', '已复制 Refresh 来源', 'Copied Refresh source'],
    titleText: ['複製 Refresh 來源', '复制 Refresh 来源', 'Copy Refresh Source'],
  },
  {
    id: 'btn-copy-elevenlabs-refresh-token',
    shortLabel: 'R🔑',
    getValue: () => lastElevenLabsAuthStatus?.browserAssist?.lastInspection?.refreshToken || '',
    copiedText: ['已複製 Refresh Token', '已复制 Refresh Token', 'Copied Refresh token'],
    titleText: ['複製 Refresh Token', '复制 Refresh Token', 'Copy Refresh Token'],
  },
  {
    id: 'btn-copy-elevenlabs-app-check-source',
    shortLabel: 'A↗',
    getValue: () => lastElevenLabsAuthStatus?.browserAssist?.lastInspection?.sources?.appCheckToken || '',
    copiedText: ['已複製 App Check 來源', '已复制 App Check 来源', 'Copied App Check source'],
    titleText: ['複製 App Check 來源', '复制 App Check 来源', 'Copy App Check Source'],
  },
  {
    id: 'btn-copy-elevenlabs-app-check-token',
    shortLabel: 'A🔐',
    getValue: () => lastElevenLabsAuthStatus?.browserAssist?.lastInspection?.appCheckToken || '',
    copiedText: ['已複製 App Check Token', '已复制 App Check Token', 'Copied App Check token'],
    titleText: ['複製 App Check Token', '复制 App Check Token', 'Copy App Check Token'],
  },
  {
    id: 'btn-copy-elevenlabs-device-source',
    shortLabel: 'D↗',
    getValue: () => lastElevenLabsAuthStatus?.browserAssist?.lastInspection?.sources?.deviceId || '',
    copiedText: ['已複製 Device 來源', '已复制 Device 来源', 'Copied Device source'],
    titleText: ['複製 Device 來源', '复制 Device 来源', 'Copy Device Source'],
  },
  {
    id: 'btn-copy-elevenlabs-device-id',
    shortLabel: 'D🆔',
    getValue: () => lastElevenLabsAuthStatus?.browserAssist?.lastInspection?.deviceId || '',
    copiedText: ['已複製 Device ID', '已复制 Device ID', 'Copied Device ID'],
    titleText: ['複製 Device ID', '复制 Device ID', 'Copy Device ID'],
  },
];

// 折叠切换函数 - 暴露到 window 供 HTML onclick 调用
window.toggleMoreEnginesClick = function() {
  const header = document.getElementById('toggle-more-engines');
  const content = document.getElementById('div-more-engines');
  if (header && content) {
    const isHidden = content.hidden;
    content.hidden = !isHidden;
    header.classList.toggle('expanded', isHidden);
  }
};

// DOMContentLoaded
window.addEventListener('DOMContentLoaded', async () => {
  setIPC();
  await setView();
  setEvent();
  setButton();
});

window.addEventListener('beforeunload', () => {
  isConfigWindowClosing = true;
  stopElevenLabsBrowserAssistAutoDetect();
  elevenLabsBrowserAssistAutoDetectInFlight = false;
});

// set IPC
function setIPC() {
  // change UI text
  ipcRenderer.on(IPC_CHANNELS.CHANGE_UI_TEXT, async () => {
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
    document.dispatchEvent(new CustomEvent('change-ui-text', { detail: config }));
    if (lastElevenLabsAuthStatus) {
      renderElevenLabsAuthStatus(lastElevenLabsAuthStatus);
    }
  });

  // send data
  ipcRenderer.on(IPC_CHANNELS.SEND_DATA, (event, divId) => {
    document.getElementById('select-option').value = divId;
    document.querySelectorAll('.config-page').forEach((value) => {
      document.getElementById(value.id).hidden = true;
    });
    document.getElementById(divId).hidden = false;
  });
}

// set view
async function setView() {
  document.getElementById('select-engine').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_ENGINE_SELECT);

  document.getElementById('select-engine-alternate').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_ENGINE_SELECT);

  document.getElementById('select-from').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_SOURCE_SELECT);

  document.getElementById('select-from-player').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_PLAYER_SOURCE_SELECT);

  document.getElementById('select-to').innerHTML = await ipcRenderer.invoke(IPC_CHANNELS.GET_TARGET_SELECT);

  //document.getElementById('select-app-language').innerHTML = await ipcRenderer.invoke('get-ui-select');

  await readConfig();

  // Initialize prompt preset selector based on current value
  initializePromptPreset();

  const googleVisionType = document.getElementById('select-google-vision-type').value;
  document.getElementById('div-' + googleVisionType).hidden = false;

  // Initialize compact mode settings visibility
  const compactMode = document.getElementById('checkbox-compact-mode').checked;
  document.getElementById('div-compact-settings').hidden = !compactMode;

  // change UI text (立即加载，然后移除 loading 类显示内容)
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
  document.dispatchEvent(new CustomEvent('change-ui-text', { detail: config }));
  
  // 语言加载完成，移除 loading 类显示内容
  requestAnimationFrame(() => {
    document.body.classList.remove('loading');
  });
}

// Initialize prompt preset selector
function initializePromptPreset() {
  const promptPresets = {
    default: '',
    game: 'You are a professional game translator. Translate the ${source} dialogue into natural ${target}, preserving character personality and game terminology. Keep character names untranslated. Provide only the translation without explanations.',
    story: 'Translate the following ${source} text into ${target}, maintaining the original tone, emotion, and cultural nuances. Keep game-specific terms and character names in their original form. Output only the translation.',
    simple: '${source} to ${target}. No explanation.',
  };

  const selectPromptPreset = document.getElementById('select-prompt-preset');
  const textareaPrompt = document.getElementById('textarea-ai-custom-translation-prompt');
  const currentValue = textareaPrompt.value.trim();

  // Determine which preset matches the current value
  let matchedPreset = 'custom';
  for (const [key, value] of Object.entries(promptPresets)) {
    if (currentValue === value) {
      matchedPreset = key;
      break;
    }
  }

  // Set the selector to the matched preset
  selectPromptPreset.value = matchedPreset;
}

// set event
function setEvent() {
  // move window
  document.addEventListener('move-window', (e) => {
    ipcRenderer.send(IPC_CHANNELS.MOVE_WINDOW, e.detail, false);
  });

  // Theme selector - apply theme change immediately and notify all windows
  document.getElementById('select-theme').onchange = () => {
    const theme = document.getElementById('select-theme').value;

    // Apply theme to current window
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);

    // Notify all other windows
    ipcRenderer.send(IPC_CHANNELS.APPLY_THEME_TO_ALL_WINDOWS, theme);
  };

  // background color
  setOnInputEvent('input-background-color', 'span-background-color');

  // background transparency
  setOnInputEvent('input-background-transparency', 'span-background-transparency');

  // speech speed
  setOnInputEvent('input-speech-speed', 'span-speech-speed');

  // dialog color
  setOnInputEvent('input-dialog-color', 'span-dialog-color');

  // dialog transparency
  setOnInputEvent('input-dialog-transparency', 'span-dialog-transparency');

  // select-google-vision-type
  document.getElementById('select-google-vision-type').onchange = () => {
    const googleVisionType = document.getElementById('select-google-vision-type').value;
    const divs = document.getElementsByClassName('div-google-vision-type');

    for (let index = 0; index < divs.length; index++) {
      const element = divs[index];
      element.hidden = true;
    }

    document.getElementById('div-' + googleVisionType).hidden = false;
  };

  // Prompt preset selector
  const promptPresets = {
    default: '',
    game: 'You are a professional game translator. Translate the ${source} dialogue into natural ${target}, preserving character personality and game terminology. Keep character names untranslated. Provide only the translation without explanations.',
    story: 'Translate the following ${source} text into ${target}, maintaining the original tone, emotion, and cultural nuances. Keep game-specific terms and character names in their original form. Output only the translation.',
    simple: '${source} to ${target}. No explanation.',
    custom: ''
  };

  const selectPromptPreset = document.getElementById('select-prompt-preset');
  const textareaPrompt = document.getElementById('textarea-ai-custom-translation-prompt');

  // Handle preset selection
  selectPromptPreset.onchange = () => {
    const selectedPreset = selectPromptPreset.value;
    if (selectedPreset !== 'custom') {
      textareaPrompt.value = promptPresets[selectedPreset];
    }
  };

  // Auto-switch to "custom" when user manually edits the textarea
  textareaPrompt.oninput = () => {
    const currentValue = textareaPrompt.value.trim();
    let matchedPreset = 'custom';

    // Check if current value matches any preset
    for (const [key, value] of Object.entries(promptPresets)) {
      if (currentValue === value) {
        matchedPreset = key;
        break;
      }
    }

    if (selectPromptPreset.value !== matchedPreset) {
      selectPromptPreset.value = matchedPreset;
    }
  };

  // Compact mode toggle - show/hide size settings
  document.getElementById('checkbox-compact-mode').onchange = () => {
    const isCompact = document.getElementById('checkbox-compact-mode').checked;
    document.getElementById('div-compact-settings').hidden = !isCompact;
  };

}

// set button
function setButton() {
  // close
  document.getElementById('img-button-close').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW);
  };

  // page - 原有下拉菜单逻辑（保留兼容性）
  document.getElementById('select-option').onchange = () => {
    const value = document.getElementById('select-option').value;
    switchTab(value);
  };

  // 标签导航栏点击事件
  document.querySelectorAll('.tab-item').forEach((tab) => {
    tab.onclick = () => {
      const target = tab.getAttribute('data-target');
      switchTab(target);
      // 同步更新隐藏的 select
      document.getElementById('select-option').value = target;
    };
  });

  // 切换标签页函数
  function switchTab(targetId) {
    // 隐藏所有页面
    document.querySelectorAll('.config-page').forEach((page) => {
      page.hidden = true;
    });
    // 显示目标页面
    document.getElementById(targetId).hidden = false;
    // 更新标签激活状态
    document.querySelectorAll('.tab-item').forEach((tab) => {
      tab.classList.remove('active');
      if (tab.getAttribute('data-target') === targetId) {
        tab.classList.add('active');
      }
    });
  }

  // download json
  document.getElementById('button-download-json').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.DOWNLOAD_JSON);
  };

  // delete temp
  document.getElementById('button-delete-temp').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.DELETE_TEMP);
  };

  // restart sharlayan reader
  document.getElementById('button-restart-sharlayan-reader').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.RESTART_SHARLAYAN_READER);
  };

  // version check
  document.getElementById('button-version-check').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.VERSION_CHECK);
  };

  // fix reader
  document.getElementById('button-fix-reader').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.FIX_READER);
  };

  // apply compact size - reset window position to apply new compact size
  document.getElementById('button-apply-compact-size').onclick = async () => {
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
    // Reset window position to trigger recalculation with new compact size
    config.indexWindow.x = -1;
    config.indexWindow.y = -1;
    config.indexWindow.width = -1;
    config.indexWindow.height = -1;
    config.indexWindow.compactWidth = parseInt(document.getElementById('input-compact-width').value) || 280;
    config.indexWindow.compactHeight = parseInt(document.getElementById('input-compact-height').value) || 180;
    await ipcRenderer.invoke(IPC_CHANNELS.SET_CONFIG, config);
    ipcRenderer.send(IPC_CHANNELS.SEND_INDEX, IPC_CHANNELS.RESET_VIEW, config);
    ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'COMPACT_SIZE_APPLIED');
  };

  // get set google vision
  document.getElementById('a-set-google-vision').onclick = async () => {
    const path = await ipcRenderer.invoke(IPC_CHANNELS.GET_ROOT_PATH, 'src', 'data', 'text', 'readme', 'sub-google-vision-api.html');
    ipcRenderer.send(IPC_CHANNELS.EXECUTE_COMMAND, `explorer "${path}"`);
  };

  const aiTestLinks = [
    { id: 'a-test-gemini-api', engine: 'Gemini' },
    { id: 'a-test-openrouter-api', engine: 'OpenRouter' },
    { id: 'a-test-gpt-api', engine: 'GPT' },
    { id: 'a-test-cohere-api', engine: 'Cohere' },
    { id: 'a-test-kimi-api', engine: 'Kimi' },
    { id: 'a-test-llm-api', engine: 'LLM-API' },
  ];

  const TEST_TIMEOUT_MS = 35000;

  function invokeWithTimeout(channel, args, timeoutMs) {
    return Promise.race([
      ipcRenderer.invoke(channel, ...(args || [])),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`请求超时 (${timeoutMs}ms)`)), timeoutMs);
      }),
    ]);
  }

  async function runAiTest(engine, link) {
    const originalText = link.innerText;
    link.style.pointerEvents = 'none';
    link.innerText = '测试中...';

    try {
      const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
      saveOptions(config);
      await ipcRenderer.invoke(IPC_CHANNELS.SET_CONFIG, config);

      const result = await invokeWithTimeout('test-ai-translation', [engine], TEST_TIMEOUT_MS);

      if (result.success) {
        alert(`测试成功\n引擎: ${result.engine}\n耗时: ${result.durationMs}ms\n结果: ${result.result}`);
      } else {
        alert(`测试失败\n${result.message || '未知错误'}`);
      }
    } catch (error) {
      alert(`测试出错\n${error.message}`);
    } finally {
      link.style.pointerEvents = '';
      link.innerText = originalText;
    }
  }

  aiTestLinks.forEach(({ id, engine }) => {
    const link = document.getElementById(id);
    if (!link) {
      return;
    }

    link.onclick = (event) => {
      event.preventDefault();
      runAiTest(engine, link);
    };
  });

  // open google credential
  document.getElementById('button-google-credential').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.SET_GOOGLE_CREDENTIAL);
  };

  // view google credential
  document.getElementById('button-google-credential-view').onclick = async () => {
    const path = await ipcRenderer.invoke(IPC_CHANNELS.GET_USER_DATA_PATH, 'config');
    ipcRenderer.send(IPC_CHANNELS.EXECUTE_COMMAND, `explorer "${path}"`);
  };

  // set token visibility
  const imgVisibilityButtons = document.getElementsByClassName('btn-visibility');
  for (let index = 0; index < imgVisibilityButtons.length; index++) {
    let isVisible = false;
    const element = imgVisibilityButtons[index];
    element.onclick = () => {
      const imgId = element.id;
      const inputId = imgId.replace('img-visibility', 'input');
      isVisible = !isVisible;
      if (isVisible) {
        document.getElementById(imgId).setAttribute('src', './img/ui/visibility_white_48dp.svg');
        document.getElementById(inputId).setAttribute('type', 'text');
      } else {
        document.getElementById(imgId).setAttribute('src', './img/ui/visibility_off_white_48dp.svg');
        document.getElementById(inputId).setAttribute('type', 'password');
      }
    };
  }

  // readme
  document.getElementById('a-readme').onclick = async () => {
    const path = await ipcRenderer.invoke(IPC_CHANNELS.GET_ROOT_PATH, 'src', 'data', 'text', 'readme', 'index.html');
    ipcRenderer.send(IPC_CHANNELS.EXECUTE_COMMAND, `explorer "${path}"`);
  };

  // github
  document.getElementById('a-github').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.EXECUTE_COMMAND, 'explorer "https://github.com/raydocs/fftrans"');
  };


  // default
  document.getElementById('button-save-default-config').onclick = async () => {
    await saveDefaultConfig();
  };

  // save
  document.getElementById('button-save-config').onclick = async () => {
    await saveConfig();
  };

  // Speechify: Open configuration guide
  document.getElementById('a-open-speechify-guide').onclick = async () => {
    const path = await ipcRenderer.invoke(IPC_CHANNELS.GET_ROOT_PATH, 'src', 'data', 'text', 'readme', 'index.html');
    ipcRenderer.send(IPC_CHANNELS.EXECUTE_COMMAND, `explorer "${path}"`);
  };

  // Speechify: Test configuration
  document.getElementById('btn-test-speechify').onclick = async () => {
    const button = document.getElementById('btn-test-speechify');
    const originalText = button.innerText;

    button.disabled = true;
    button.innerText = '测试中...';

    try {
      const speechifyConfig = collectSpeechifyFormConfig();
      const validationMessage = validateSpeechifyFormConfig(speechifyConfig);
      if (validationMessage) {
        alert(`❌ 配置无效\n\n${validationMessage}`);
        return;
      }

      const result = await ipcRenderer.invoke(IPC_CHANNELS.TEST_SPEECHIFY_CONFIG, speechifyConfig);
      if (result.success && result.data) {
        const meta = result.data.meta || {};
        alert(`✅ 测试成功！\n\n语音: ${meta.voiceId || '默认'}\n格式: ${meta.audioFormat || 'mp3'}\n\n本次测试使用当前表单值，若需正式保存请点击“保存设置”。`);
      } else {
        alert(formatTtsErrorAlert(result, '❌ 测试失败'));
      }
    } catch (error) {
      alert(`❌ 测试出错\n\n${error.message}`);
    } finally {
      button.disabled = false;
      button.innerText = originalText;
    };
  };

  // Speechify: Preview voice
  document.getElementById('btn-preview-voice').onclick = async () => {
    const button = document.getElementById('btn-preview-voice');
    const voiceSelect = document.getElementById('select-speechify-voice-id');
    const selectedVoice = voiceSelect.value;
    const originalText = button.innerText;
    let playbackStarted = false;

    const voiceDescriptions = {
      gwyneth: 'Gwyneth Paltrow - 名人语音',
      joanna: 'Joanna - 清晰自然的女声',
      olivia: 'Olivia - 适合游戏对话的女声',
      ivy: 'Ivy - 标准女声',
      salli: 'Salli - 标准女声',
      kimberly: 'Kimberly - 标准女声',
      emma: 'Emma - 标准女声',
      amy: 'Amy - 标准女声',
      nicole: 'Nicole - 标准女声',
      aria: 'Aria - 标准女声',
      snoop: 'Snoop Dogg - 名人语音，独特风格',
      mrbeast: 'MrBeast - 名人语音，年轻活力',
      matthew: 'Matthew - 适合游戏旁白的男声',
      henry: 'Henry - 标准男声',
      justin: 'Justin - 标准男声',
      joey: 'Joey - 标准男声',
      stephen: 'Stephen - 标准男声',
      brian: 'Brian - 标准男声',
      russell: 'Russell - 标准男声'
    };

    try {
      const previewConfig = collectSpeechifyFormConfig();
      const validationMessage = validateSpeechifyFormConfig(previewConfig);
      if (validationMessage) {
        alert(`❌ 配置无效\n\n${validationMessage}`);
        return;
      }

      button.disabled = true;
      button.innerText = '🎧 生成中...';

      const previewText = `Welcome to Final Fantasy XIV! This is ${voiceDescriptions[selectedVoice] || selectedVoice}. I hope you enjoy this voice!`;
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_SPEECHIFY_VOICE, {
        text: previewText,
        config: previewConfig
      });

      if (result.success && result.data?.audioUrl) {
        const audio = new Audio(result.data.audioUrl);
        playbackStarted = true;
        button.innerText = '🎧 播放中...';
        audio.play();

        audio.onended = () => {
          button.disabled = false;
          button.innerText = originalText;
        };

        audio.onerror = () => {
          alert('❌ 音频播放失败');
          button.disabled = false;
          button.innerText = originalText;
        };
      } else {
        alert(formatTtsErrorAlert(result, '❌ 语音生成失败'));
      }
    } catch (error) {
      alert(`❌ 试听出错\n\n${error.message}`);
    } finally {
      if (!playbackStarted) {
        button.disabled = false;
        button.innerText = originalText;
      }
    }
  };

  applyElevenLabsCopyButtonLabels();

  ELEVENLABS_COPY_BUTTON_SPECS.forEach(({ id, getValue, copiedText }) => {
    document.getElementById(id).onclick = () => {
      const value = getValue();
      if (!value) {
        alert(`ℹ️ ${getUiText([
          '目前沒有可複製的內容。',
          '当前没有可复制的内容。',
          'There is nothing to copy right now.',
        ])}`);
        return;
      }

      clipboard.writeText(value);
      ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, getUiText(copiedText));
    };
  });

  document.getElementById('btn-toggle-elevenlabs-auto-detect').onclick = async () => {
    isElevenLabsBrowserAssistAutoDetectPaused = !isElevenLabsBrowserAssistAutoDetectPaused;

    if (isElevenLabsBrowserAssistAutoDetectPaused) {
      stopElevenLabsBrowserAssistAutoDetect();
      ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, getUiText([
        '已暫停 ElevenLabs 自動檢測。',
        '已暂停 ElevenLabs 自动检测。',
        'ElevenLabs auto-detect paused.',
      ]));
    } else {
      elevenLabsBrowserAssistAutoDetectKey = '';
      lastElevenLabsAutoDetectNotificationKey = '';
      ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, getUiText([
        '已恢復 ElevenLabs 自動檢測。',
        '已恢复 ElevenLabs 自动检测。',
        'ElevenLabs auto-detect resumed.',
      ]));
    }

    await refreshElevenLabsAuthStatus();
  };

  // ElevenLabs: Open browser assist
  document.getElementById('btn-open-elevenlabs-browser').onclick = async () => {
    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.BEGIN_BROWSER_ASSIST);
      if (result?.success) {
        await refreshElevenLabsAuthStatus();
        alert(`✅ ${getUiText([
          '已打開 ElevenLabs 瀏覽器輔助視窗。請在該視窗完成登入；登入完成後應會自動檢測並回填憑證。',
          '已打开 ElevenLabs 浏览器辅助窗口。请在该窗口完成登录；登录完成后应会自动检测并回填凭证。',
          'The ElevenLabs browser assist window is open. Sign in there; credentials should be detected and filled automatically after login.',
        ])}`);
      } else {
        alert(formatTtsErrorAlert(result, '❌ 无法打开浏览器辅助窗口'));
      }
    } catch (error) {
      alert(`❌ 无法打开浏览器辅助窗口\n\n${error.message}`);
    }
  };

  // ElevenLabs: Validate refresh token / inspect browser assist login
  document.getElementById('btn-validate-elevenlabs-refresh-token').onclick = async () => {
    const actionToken = beginElevenLabsAction(
      'btn-validate-elevenlabs-refresh-token',
      getUiText(['檢查中...', '检查中...', 'Checking...'])
    );
    if (!actionToken) {
      return;
    }

    try {
      const formAuth = collectElevenLabsAuthOverride();
      let usedBrowserAssist = false;
      let result = await ipcRenderer.invoke(IPC_CHANNELS.CHECK_BROWSER_ASSIST_LOGIN, formAuth);

      if (!result?.success && formAuth.refreshToken && isBrowserAssistFallbackError(result)) {
        result = await ipcRenderer.invoke(IPC_CHANNELS.VALIDATE_REFRESH_TOKEN, formAuth);
      } else if (result?.success) {
        usedBrowserAssist = true;
      }

      if (!isCurrentElevenLabsAction(actionToken)) {
        return;
      }

      if (result.success && result.data) {
        if (usedBrowserAssist) {
          applyBrowserAssistTokens(result.data);
        }

        const status = result.data.status || result.data.validation?.status || null;
        if (status) {
          renderElevenLabsAuthStatus(status);
        }

        if (usedBrowserAssist) {
          const imported = result.data.imported || {};
          const importedParts = [];
          if (imported.refreshToken) {
            importedParts.push(getUiText(['Refresh Token', 'Refresh Token', 'Refresh Token']));
          }
          if (imported.appCheckToken) {
            importedParts.push(getUiText(['App Check Token', 'App Check Token', 'App Check Token']));
          }
          if (imported.deviceId) {
            importedParts.push(getUiText(['Device ID', 'Device ID', 'Device ID']));
          }

          const summaryText = importedParts.length
            ? importedParts.join(' / ')
            : getUiText(['未偵測到可導入欄位', '未检测到可导入字段', 'No importable fields were detected']);

          if (result.data.validationError) {
            alert(`❌ ${getUiText([
              '已從瀏覽器輔助視窗導入欄位，但 Refresh Token 驗證失敗。你仍可檢查欄位內容後再儲存或重試。',
              '已从浏览器辅助窗口导入字段，但 Refresh Token 验证失败。你仍可检查字段内容后再保存或重试。',
              'Fields were imported from the browser assist window, but refresh token validation failed. You can still inspect them and save or retry.',
            ])}\n\n${getUiText(['導入欄位', '导入字段', 'Imported Fields'])}: ${summaryText}\n${getUiText(['錯誤', '错误', 'Error'])}: ${result.data.validationError.message}`);
          } else {
            const saveHint = result.data.refreshToken
              ? getUiText([
                '已從瀏覽器輔助視窗導入並驗證登入。若要持久化可直接按「保存導入內容」。',
                '已从浏览器辅助窗口导入并验证登录。若要持久化可直接按“保存导入内容”。',
                'Imported and validated sign-in from the browser assist window. Click Save Imported to persist it.',
              ])
              : getUiText([
                '已從瀏覽器輔助視窗讀取輔助憑證，但尚未找到 Refresh Token。',
                '已从浏览器辅助窗口读取辅助凭证，但尚未找到 Refresh Token。',
                'Imported helper credentials from the browser assist window, but no refresh token was found yet.',
              ]);
            alert(`✅ ${saveHint}\n\n${getUiText(['導入欄位', '导入字段', 'Imported Fields'])}: ${summaryText}`);
          }
        } else {
          const credentials = result.data.status?.credentials || {};
          const saveHint = credentials.hasRefreshToken && !credentials.hasSavedRefreshToken
            ? getUiText([
              '目前 Refresh Token 只在表單中，若要持久化可直接按「保存導入內容」。',
              '当前 Refresh Token 只在表单中，若要持久化可直接按“保存导入内容”。',
              'The refresh token is only in the form right now; click Save Imported to persist it.',
            ])
            : getUiText([
              'Refresh Token 驗證成功，可繼續導入 App Check Token 或直接測試連線。',
              'Refresh Token 验证成功，可继续导入 App Check Token 或直接测试连接。',
              'Refresh token validation succeeded. You can import the App Check token or test the connection now.',
            ]);
          alert(`✅ ${saveHint}`);
        }
      } else {
        alert(formatTtsErrorAlert(result, '❌ 登录检查失败'));
      }
    } catch (error) {
      if (!isCurrentElevenLabsAction(actionToken)) {
        return;
      }

      alert(`❌ 登录检查失败\n\n${error.message}`);
    } finally {
      await completeElevenLabsAction(actionToken);
    }
  };

  // ElevenLabs: Save imported credentials only
  document.getElementById('btn-save-elevenlabs-imported').onclick = async () => {
    const actionToken = beginElevenLabsAction(
      'btn-save-elevenlabs-imported',
      getUiText(['保存中...', '保存中...', 'Saving...'])
    );
    if (!actionToken) {
      return;
    }

    try {
      const status = lastElevenLabsAuthStatus || buildFallbackElevenLabsStatus();
      if (!hasUnsavedElevenLabsCredentials(status)) {
        alert(`ℹ️ ${getUiText([
          '目前沒有可快速保存的導入憑證。',
          '当前没有可快速保存的导入凭证。',
          'There are no imported credentials to save right now.',
        ])}`);
        return;
      }

      const authOverride = collectElevenLabsAuthOverride();
      const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
      config.api = config.api || {};
      config.api.elevenlabs = {
        ...config.api.elevenlabs,
        ...(authOverride.refreshToken ? { refreshToken: authOverride.refreshToken } : {}),
        ...(authOverride.appCheckToken ? { appCheckToken: authOverride.appCheckToken } : {}),
        ...(authOverride.deviceId ? { deviceId: authOverride.deviceId } : {}),
      };

      await ipcRenderer.invoke(IPC_CHANNELS.SET_CONFIG, config);
      if (!isCurrentElevenLabsAction(actionToken)) {
        return;
      }

      alert(`✅ ${getUiText([
        '已快速保存 ElevenLabs 導入憑證。',
        '已快速保存 ElevenLabs 导入凭证。',
        'The imported ElevenLabs credentials were saved.',
      ])}`);
      ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'SETTINGS_SAVED');
    } catch (error) {
      if (!isCurrentElevenLabsAction(actionToken)) {
        return;
      }

      alert(`❌ ${getUiText([
        '保存導入內容失敗',
        '保存导入内容失败',
        'Failed to save imported credentials',
      ])}\n\n${error.message}`);
    } finally {
      await completeElevenLabsAction(actionToken);
    }
  };

  // ElevenLabs: Clear auth session
  document.getElementById('btn-clear-elevenlabs-session').onclick = async () => {
    const actionToken = beginElevenLabsAction(
      'btn-clear-elevenlabs-session',
      getUiText(['清除中...', '清除中...', 'Clearing...'])
    );
    if (!actionToken) {
      return;
    }

    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.CLEAR_AUTH_SESSION, collectElevenLabsAuthOverride());
      if (!isCurrentElevenLabsAction(actionToken)) {
        return;
      }

      if (result.success && result.data?.status) {
        renderElevenLabsAuthStatus(result.data.status);
        alert(`✅ ${getUiText([
          '已清除當前 ElevenLabs 會話。已儲存的 Refresh Token / App Check Token / Device ID 不會被刪除。',
          '已清除当前 ElevenLabs 会话。已保存的 Refresh Token / App Check Token / Device ID 不会被删除。',
          'The current ElevenLabs session was cleared. Saved refresh token, App Check token, and device ID were preserved.',
        ])}`);
      } else {
        alert(formatTtsErrorAlert(result, '❌ 清除会话失败'));
      }
    } catch (error) {
      if (!isCurrentElevenLabsAction(actionToken)) {
        return;
      }

      alert(`❌ 清除会话失败\n\n${error.message}`);
    } finally {
      await completeElevenLabsAction(actionToken);
    }
  };

  // ElevenLabs: Test configuration
  document.getElementById('btn-test-elevenlabs').onclick = async () => {
    const actionToken = beginElevenLabsAction(
      'btn-test-elevenlabs',
      getUiText(['測試中...', '测试中...', 'Testing...'])
    );
    if (!actionToken) {
      return;
    }

    try {
      const elevenLabsConfig = collectElevenLabsFormConfig();
      const validationMessage = validateElevenLabsFormConfig(elevenLabsConfig);
      if (validationMessage) {
        alert(`❌ 配置无效\n\n${validationMessage}`);
        return;
      }

      const result = await ipcRenderer.invoke(IPC_CHANNELS.TEST_ELEVENLABS_CONFIG, elevenLabsConfig);
      if (!isCurrentElevenLabsAction(actionToken)) {
        return;
      }

      if (result.success && result.data) {
        const meta = result.data.meta || {};
        alert(`✅ 测试成功！\n\n语音: ${meta.voiceId || '默认'}\n模型: ${meta.modelId || '默认'}\n认证方式: ${formatElevenLabsAuthSourceLabel(meta.authSource)}\nToken 刷新: ${meta.didRefreshBearer ? '是' : '否'}\n\n本次测试使用当前表单值。Refresh Token / App Check / Device ID 等保存后会持久化；Bearer Token 不会保存。`);
      } else {
        alert(formatTtsErrorAlert(result, '❌ 测试失败'));
      }
    } catch (error) {
      if (!isCurrentElevenLabsAction(actionToken)) {
        return;
      }

      alert(`❌ 测试出错\n\n${error.message}`);
    } finally {
      await completeElevenLabsAction(actionToken);
    }
  };

  // ElevenLabs: Preview voice
  document.getElementById('btn-preview-elevenlabs-voice').onclick = async () => {
    const button = document.getElementById('btn-preview-elevenlabs-voice');
    const voiceSelect = document.getElementById('select-elevenlabs-voice-id');
    const selectedVoice = voiceSelect.value;
    const originalText = button.innerText;
    let playbackStarted = false;

    try {
      const previewConfig = collectElevenLabsFormConfig();
      const validationMessage = validateElevenLabsFormConfig(previewConfig);
      if (validationMessage) {
        alert(`❌ 配置无效\n\n${validationMessage}`);
        return;
      }

      button.disabled = true;
      button.innerText = '🎧 生成中...';

      const voiceName = voiceSelect.options[voiceSelect.selectedIndex].text;
      const previewText = `Welcome to Final Fantasy XIV! This is ${voiceName}. I hope you enjoy this voice!`;
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_ELEVENLABS_VOICE, {
        text: previewText,
        config: {
          ...previewConfig,
          voiceId: selectedVoice,
        }
      });

      if (result.success && result.data?.audioUrl) {
        const audio = new Audio(result.data.audioUrl);
        playbackStarted = true;
        button.innerText = '🎧 播放中...';
        audio.play();

        audio.onended = () => {
          button.disabled = false;
          button.innerText = originalText;
        };

        audio.onerror = () => {
          alert('❌ 音频播放失败');
          button.disabled = false;
          button.innerText = originalText;
        };
      } else {
        alert(formatTtsErrorAlert(result, '❌ 语音生成失败'));
      }
    } catch (error) {
      alert(`❌ 试听出错\n\n${error.message}`);
    } finally {
      if (!playbackStarted) {
        button.disabled = false;
        button.innerText = originalText;
      }
    }
  };

  // ElevenLabs: Import App Check token from flows file
  document.getElementById('btn-import-elevenlabs-app-check').onclick = async () => {
    const actionToken = beginElevenLabsAction(
      'btn-import-elevenlabs-app-check',
      getUiText(['解析中...', '解析中...', 'Importing...'])
    );
    if (!actionToken) {
      return;
    }

    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PICK_APP_CHECK_TOKEN);
      if (!isCurrentElevenLabsAction(actionToken)) {
        return;
      }

      if (result.success && result.token) {
        document.getElementById('input-elevenlabs-app-check-token').value = result.token;
        const methodText = (() => {
          if (result.method === 'cache') {
            return '已从缓存/上次提取记录读取';
          }
          if (result.method === 'flow') {
            return '已从默认 flows 文件自动提取';
          }
          if (result.method === 'manual') {
            return '已从选定的 flows 文件提取';
          }
          return '已提取 xi-app-check-token';
        })();
        const sourceText = result.source ? `\n来源: ${result.source}` : '';
        const expiryText = result.expiresAt ? `\n过期时间: ${new Date(result.expiresAt).toLocaleString()}` : '';
        alert(`✅ ${methodText}${sourceText}${expiryText}`);
      } else {
        alert(`❌ 未能提取\n${result.message || ''}`);
      }
    } catch (error) {
      if (!isCurrentElevenLabsAction(actionToken)) {
        return;
      }

      alert(`❌ 解析失败\n${error.message}`);
    } finally {
      await completeElevenLabsAction(actionToken);
    }
  };

}

function collectSpeechifyFormConfig() {
  return {
    bearerToken: document.getElementById('input-speechify-bearer-token').value.trim(),
    voiceId: document.getElementById('select-speechify-voice-id').value,
    audioFormat: document.getElementById('select-speechify-audio-format').value,
    sentenceSplitting: document.getElementById('checkbox-speechify-sentence-splitting').checked,
  };
}

function validateSpeechifyFormConfig(config = {}) {
  if (!config.bearerToken) {
    return '请先填写 Speechify Bearer Token';
  }

  if (!['mp3', 'ogg', 'wav'].includes(config.audioFormat)) {
    return 'Speechify 音频格式无效';
  }

  return '';
}

function collectElevenLabsFormConfig() {
  return {
    bearerToken: document.getElementById('input-elevenlabs-bearer-token').value.trim(),
    refreshToken: document.getElementById('input-elevenlabs-refresh-token').value.trim(),
    appCheckToken: document.getElementById('input-elevenlabs-app-check-token').value.trim(),
    deviceId: document.getElementById('input-elevenlabs-device-id').value.trim(),
    voiceId: document.getElementById('select-elevenlabs-voice-id').value,
    modelId: document.getElementById('select-elevenlabs-model').value,
    stability: document.getElementById('input-elevenlabs-stability').value,
    similarityBoost: document.getElementById('input-elevenlabs-similarity-boost').value,
    style: document.getElementById('input-elevenlabs-style').value,
    useSpeakerBoost: document.getElementById('checkbox-elevenlabs-speaker-boost').checked,
  };
}

function validateZeroToOne(value = '', label = '数值') {
  const numericValue = Number(value);
  if (Number.isNaN(numericValue) || numericValue < 0 || numericValue > 1) {
    return `${label} 必须在 0 到 1 之间`;
  }

  return '';
}

function validateElevenLabsFormConfig(config = {}) {
  return [
    validateZeroToOne(config.stability, 'Stability'),
    validateZeroToOne(config.similarityBoost, 'Similarity Boost'),
    validateZeroToOne(config.style, 'Style'),
  ].find(Boolean) || '';
}

function formatTtsErrorAlert(result, title = '请求失败') {
  const details = result?.details || {};
  const lines = [title, result?.message || '未知错误'];

  if (details.authCode) {
    lines.push(`认证代码: ${details.authCode}`);
  }

  if (details.statusCode) {
    lines.push(`状态码: ${details.statusCode}`);
  }

  if (details.suggestion) {
    lines.push(`建议: ${details.suggestion}`);
  }

  if (typeof details.retryable === 'boolean') {
    lines.push(`可重试: ${details.retryable ? '是' : '否'}`);
  }

  return lines.join('\n\n');
}

function clearEphemeralElevenLabsBearerInput() {
  const bearerInput = document.getElementById('input-elevenlabs-bearer-token');
  if (bearerInput) {
    bearerInput.value = '';
  }
}

function formatElevenLabsAuthSourceLabel(authSource = '') {
  switch (authSource) {
    case 'refresh-token':
      return getUiText([
        '已用 Refresh Token 刷新臨時 Bearer',
        '已用 Refresh Token 刷新临时 Bearer',
        'Refreshed a temporary bearer from the refresh token',
      ]);
    case 'session-cache':
      return getUiText([
        '已重用目前會話中的臨時 Bearer',
        '已复用当前会话中的临时 Bearer',
        'Reused the temporary bearer from the current session',
      ]);
    case 'manual-bearer':
      return getUiText([
        '使用臨時 Bearer（不會保存）',
        '使用临时 Bearer（不会保存）',
        'Using a temporary bearer (not persisted)',
      ]);
    case 'legacy-bearer-migration':
      return getUiText([
        '使用升級前遷移到記憶體的臨時 Bearer',
        '使用升级前迁移到内存的临时 Bearer',
        'Using the temporary bearer migrated into memory from an older config',
      ]);
    default:
      return getUiText(['未提供', '未提供', 'Not provided']);
  }
}

function getUiText(entries = ['', '', '']) {
  const appLanguage = document.getElementById('select-app-language')?.value || 'app-zhs';
  const index = appLanguage === 'app-zht' ? 0 : appLanguage === 'app-zhs' ? 1 : 2;
  return entries[index] || entries[1] || entries[2] || '';
}

function beginElevenLabsAction(activeButtonId = '', pendingText = '') {
  if (activeElevenLabsAction) {
    return null;
  }

  const originalTexts = {};
  for (let index = 0; index < ELEVENLABS_ACTION_BUTTON_IDS.length; index++) {
    const buttonId = ELEVENLABS_ACTION_BUTTON_IDS[index];
    const button = document.getElementById(buttonId);
    if (!button) {
      continue;
    }

    originalTexts[buttonId] = button.innerText;
    button.disabled = true;
  }

  if (activeButtonId && pendingText) {
    const activeButton = document.getElementById(activeButtonId);
    if (activeButton) {
      activeButton.innerText = pendingText;
    }
  }

  activeElevenLabsAction = {
    token: Date.now() + Math.random(),
    originalTexts,
  };

  return activeElevenLabsAction.token;
}

function isCurrentElevenLabsAction(token) {
  return !isConfigWindowClosing && Boolean(activeElevenLabsAction) && activeElevenLabsAction.token === token;
}

function finishElevenLabsAction(token) {
  if (!isCurrentElevenLabsAction(token)) {
    return false;
  }

  const { originalTexts } = activeElevenLabsAction;
  for (let index = 0; index < ELEVENLABS_ACTION_BUTTON_IDS.length; index++) {
    const buttonId = ELEVENLABS_ACTION_BUTTON_IDS[index];
    const button = document.getElementById(buttonId);
    if (!button) {
      continue;
    }

    button.disabled = false;
    if (Object.prototype.hasOwnProperty.call(originalTexts, buttonId)) {
      button.innerText = originalTexts[buttonId];
    }
  }

  activeElevenLabsAction = null;
  return true;
}

async function completeElevenLabsAction(token) {
  if (!finishElevenLabsAction(token)) {
    return false;
  }

  await refreshElevenLabsAuthStatus();
  await flushPendingElevenLabsBrowserAssistAutoDetect();
  return true;
}

function getElevenLabsStateLabel(state = '') {
  switch (state) {
    case 'ready':
      return getUiText(['已就緒', '已就绪', 'Ready']);
    case 'session-only':
      return getUiText(['僅當前會話', '仅当前会话', 'Session Only']);
    case 'error':
      return getUiText(['驗證失敗', '验证失败', 'Error']);
    default:
      return getUiText(['未配置', '未配置', 'Unconfigured']);
  }
}

function getCredentialPresenceLabel(hasSaved = false, hasAny = false) {
  if (hasSaved) {
    return getUiText(['已儲存', '已保存', 'Saved']);
  }

  if (hasAny) {
    return getUiText(['僅表單中', '仅表单中', 'Form Only']);
  }

  return getUiText(['未提供', '未提供', 'Missing']);
}

function getElevenLabsNextStep(status = {}) {
  const credentials = status.credentials || {};
  const auth = status.auth || {};
  const browserAssist = status.browserAssist || {};

  if (!credentials.hasRefreshToken) {
    if (browserAssist.isOpen) {
      return getUiText([
        '瀏覽器輔助視窗已開啟；在其中完成登入後，回來點擊「檢查登入」。',
        '浏览器辅助窗口已开启；在其中完成登录后，回来点击“检查登录”。',
        'The browser assist window is open. Finish signing in there, then come back and click Check Login.',
      ]);
    }

    return getUiText([
      '先打開瀏覽器輔助視窗登入 ElevenLabs，然後回來點擊「檢查登入」。',
      '先打开浏览器辅助窗口登录 ElevenLabs，然后回来点击“检查登录”。',
      'Open the browser assist window, sign in to ElevenLabs, then come back and click Check Login.',
    ]);
  }

  if (!credentials.hasSavedRefreshToken || !credentials.hasSavedAppCheckToken || !credentials.hasSavedDeviceId) {
    return getUiText([
      '目前有尚未保存的憑證；可點「保存導入內容」快速持久化。',
      '当前有尚未保存的凭证；可点“保存导入内容”快速持久化。',
      'Some credentials are not saved yet. Click Save Imported to persist them quickly.',
    ]);
  }

  if (!credentials.hasAppCheckToken) {
    return getUiText([
      '下一步導入 App Check Token，再做正式連線測試。',
      '下一步导入 App Check Token，再做正式连接测试。',
      'Next, import the App Check token and then run the connection test.',
    ]);
  }

  if (auth.state === 'error') {
    return getUiText([
      '請檢查瀏覽器輔助視窗中的登入狀態、Refresh Token 或代理設定後重試。',
      '请检查浏览器辅助窗口中的登录状态、Refresh Token 或代理设置后重试。',
      'Check the browser assist window login state, refresh token, or proxy settings and try again.',
    ]);
  }

  return getUiText([
    '可直接測試連線，或按「保存導入內容」供正式 TTS 使用。',
    '可直接测试连接，或按“保存导入内容”供正式 TTS 使用。',
    'You can test the connection now or click Save Imported for runtime TTS.',
  ]);
}

function buildFallbackElevenLabsStatus(message = '') {
  return {
    auth: {
      state: 'unconfigured',
      lastValidatedAt: '',
      lastErrorCode: '',
      lastErrorMessage: message,
      lastAuthSource: 'none',
    },
    session: {
      hasActiveBearer: false,
      source: 'none',
      expiresAt: '',
      expiresSoon: false,
      refreshInFlight: false,
    },
    browserAssist: {
      isOpen: false,
      currentUrl: '',
      title: '',
      onElevenLabsOrigin: false,
      isLoading: false,
    },
    credentials: {
      hasRefreshToken: false,
      hasSavedRefreshToken: false,
      hasAppCheckToken: false,
      hasSavedAppCheckToken: false,
      hasDeviceId: false,
      hasSavedDeviceId: false,
    },
  };
}

function collectElevenLabsAuthOverride() {
  return {
    refreshToken: document.getElementById('input-elevenlabs-refresh-token').value.trim(),
    appCheckToken: document.getElementById('input-elevenlabs-app-check-token').value.trim(),
    deviceId: document.getElementById('input-elevenlabs-device-id').value.trim(),
  };
}

function applyBrowserAssistTokens(browserData = {}) {
  if (browserData.refreshToken) {
    document.getElementById('input-elevenlabs-refresh-token').value = browserData.refreshToken;
  }

  if (browserData.appCheckToken) {
    document.getElementById('input-elevenlabs-app-check-token').value = browserData.appCheckToken;
  }

  if (browserData.deviceId) {
    document.getElementById('input-elevenlabs-device-id').value = browserData.deviceId;
  }
}

function isBrowserAssistFallbackError(result = {}) {
  const authCode = result?.details?.authCode || '';
  return /^browser_assist_/.test(authCode);
}

function hasUnsavedElevenLabsCredentials(status = {}) {
  const credentials = status.credentials || {};
  return Boolean(
    (credentials.hasRefreshToken && !credentials.hasSavedRefreshToken) ||
    (credentials.hasAppCheckToken && !credentials.hasSavedAppCheckToken) ||
    (credentials.hasDeviceId && !credentials.hasSavedDeviceId)
  );
}

function formatBrowserAssistSource(source = '') {
  if (!source) {
    return '';
  }

  return source.length > 96 ? `${source.slice(0, 93)}...` : source;
}

function applyElevenLabsCopyButtonLabels() {
  ELEVENLABS_COPY_BUTTON_SPECS.forEach(({ id, shortLabel, titleText }) => {
    const button = document.getElementById(id);
    if (!button) {
      return;
    }

    button.innerText = shortLabel;
    button.title = getUiText(titleText);
    button.setAttribute('aria-label', getUiText(titleText));
  });
}

function getElevenLabsAutoDetectNotificationKey(data = {}) {
  return [data.refreshToken || '', data.appCheckToken || '', data.deviceId || ''].join('|');
}

function getElevenLabsAutoDetectToggleText(paused = isElevenLabsBrowserAssistAutoDetectPaused) {
  return paused
    ? getUiText(['恢復自動檢測', '恢复自动检测', 'Resume Auto Detect'])
    : getUiText(['暫停自動檢測', '暂停自动检测', 'Pause Auto Detect']);
}

function syncElevenLabsAutoDetectToggleButton(status = lastElevenLabsAuthStatus) {
  const button = document.getElementById('btn-toggle-elevenlabs-auto-detect');
  if (!button) {
    return;
  }

  const browserAssist = status?.browserAssist || {};
  const currentFormAuth = collectElevenLabsAuthOverride();
  const canToggle = Boolean(browserAssist.isOpen) && !currentFormAuth.refreshToken;

  button.innerText = getElevenLabsAutoDetectToggleText();
  button.disabled = !canToggle;
  button.title = canToggle
    ? getUiText([
        '控制登入完成後的自動檢測。',
        '控制登录完成后的自动检测。',
        'Control automatic detection after sign-in.',
      ])
    : currentFormAuth.refreshToken
      ? getUiText([
          '表單已有 Refresh Token，暫時不需要自動檢測。',
          '表单已有 Refresh Token，暂时不需要自动检测。',
          'Auto-detect is not needed while a refresh token is already filled in.',
        ])
      : getUiText([
          '請先打開瀏覽器輔助視窗。',
          '请先打开浏览器辅助窗口。',
          'Open the browser assist window first.',
        ]);
}

function stopElevenLabsBrowserAssistAutoDetect() {
  if (elevenLabsBrowserAssistAutoDetectTimer) {
    clearInterval(elevenLabsBrowserAssistAutoDetectTimer);
    elevenLabsBrowserAssistAutoDetectTimer = null;
  }

  pendingElevenLabsBrowserAssistAutoDetect = false;
}

async function flushPendingElevenLabsBrowserAssistAutoDetect() {
  if (
    !pendingElevenLabsBrowserAssistAutoDetect ||
    activeElevenLabsAction ||
    isElevenLabsBrowserAssistAutoDetectPaused ||
    elevenLabsBrowserAssistAutoDetectInFlight
  ) {
    return;
  }

  pendingElevenLabsBrowserAssistAutoDetect = false;
  await runElevenLabsBrowserAssistAutoDetect();
}

async function runElevenLabsBrowserAssistAutoDetect() {
  if (isConfigWindowClosing) {
    return;
  }

  if (activeElevenLabsAction || elevenLabsBrowserAssistAutoDetectInFlight) {
    pendingElevenLabsBrowserAssistAutoDetect = true;
    return;
  }

  pendingElevenLabsBrowserAssistAutoDetect = false;

  const currentFormAuth = collectElevenLabsAuthOverride();
  if (currentFormAuth.refreshToken) {
    stopElevenLabsBrowserAssistAutoDetect();
    return;
  }

  elevenLabsBrowserAssistAutoDetectInFlight = true;

  try {
    const result = await ipcRenderer.invoke(IPC_CHANNELS.CHECK_BROWSER_ASSIST_LOGIN, currentFormAuth, { background: true });
    if (isConfigWindowClosing || !result?.success || !result.data) {
      return;
    }

    if (result.data.status) {
      renderElevenLabsAuthStatus(result.data.status);
    }

    const detectedKey = [result.data.refreshToken || '', result.data.appCheckToken || '', result.data.deviceId || ''].join('|');
    if (!detectedKey || detectedKey === '||' || detectedKey === elevenLabsBrowserAssistAutoDetectKey) {
      return;
    }

    elevenLabsBrowserAssistAutoDetectKey = detectedKey;
    applyBrowserAssistTokens(result.data);
    await refreshElevenLabsAuthStatus();

    const notificationKey = getElevenLabsAutoDetectNotificationKey(result.data);
    if (notificationKey && notificationKey !== lastElevenLabsAutoDetectNotificationKey) {
      lastElevenLabsAutoDetectNotificationKey = notificationKey;
      ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, getUiText([
        '已自動檢測到 ElevenLabs 登入，憑證已回填。',
        '已自动检测到 ElevenLabs 登录，凭证已回填。',
        'ElevenLabs sign-in detected automatically; credentials were filled in.',
      ]));
    }
  } catch {
    // Ignore background polling failures; the panel will refresh on the next visible action.
  } finally {
    elevenLabsBrowserAssistAutoDetectInFlight = false;

    const latestFormAuth = collectElevenLabsAuthOverride();
    if (
      pendingElevenLabsBrowserAssistAutoDetect &&
      !activeElevenLabsAction &&
      !isElevenLabsBrowserAssistAutoDetectPaused &&
      !latestFormAuth.refreshToken
    ) {
      setTimeout(() => {
        runElevenLabsBrowserAssistAutoDetect();
      }, 0);
    }
  }
}

function syncElevenLabsBrowserAssistAutoDetect(status = {}) {
  const browserAssist = status.browserAssist || {};
  const currentFormAuth = collectElevenLabsAuthOverride();
  const shouldPoll = Boolean(browserAssist.isOpen) && !currentFormAuth.refreshToken && !isElevenLabsBrowserAssistAutoDetectPaused;

  if (!shouldPoll) {
    stopElevenLabsBrowserAssistAutoDetect();
    syncElevenLabsAutoDetectToggleButton(status);
    return;
  }

  if (!elevenLabsBrowserAssistAutoDetectTimer) {
    elevenLabsBrowserAssistAutoDetectKey = '';
    lastElevenLabsAutoDetectNotificationKey = '';
    runElevenLabsBrowserAssistAutoDetect();
    elevenLabsBrowserAssistAutoDetectTimer = setInterval(() => {
      runElevenLabsBrowserAssistAutoDetect();
    }, 4000);
  }

  syncElevenLabsAutoDetectToggleButton(status);
}

function renderElevenLabsAuthStatus(status = null) {
  const safeStatus = status || buildFallbackElevenLabsStatus();
  lastElevenLabsAuthStatus = safeStatus;

  const auth = safeStatus.auth || {};
  const session = safeStatus.session || {};
  const browserAssist = safeStatus.browserAssist || {};
  const credentials = safeStatus.credentials || {};
  const currentFormAuth = collectElevenLabsAuthOverride();
  const badge = document.getElementById('span-elevenlabs-auth-badge');
  const summary = document.getElementById('p-elevenlabs-auth-status-summary');
  const sessionLine = document.getElementById('p-elevenlabs-auth-status-session');
  const browserLine = document.getElementById('p-elevenlabs-auth-status-browser');
  const browserDetailLine = document.getElementById('p-elevenlabs-auth-status-browser-detail');
  const browserActions = document.getElementById('div-elevenlabs-auth-status-browser-actions');
  const credentialsLine = document.getElementById('p-elevenlabs-auth-status-credentials');
  const nextStepLine = document.getElementById('p-elevenlabs-auth-status-next-step');
  const detailsLine = document.getElementById('p-elevenlabs-auth-status-details');
  const clearButton = document.getElementById('btn-clear-elevenlabs-session');
  const saveImportedButton = document.getElementById('btn-save-elevenlabs-imported');

  if (!badge || !summary || !sessionLine || !browserLine || !browserDetailLine || !browserActions || !credentialsLine || !nextStepLine || !detailsLine) {
    return;
  }

  badge.className = `elevenlabs-auth-badge elevenlabs-auth-badge-${auth.state || 'unconfigured'}`;
  badge.innerText = getElevenLabsStateLabel(auth.state);

  summary.innerText = `${getUiText(['認證來源', '认证来源', 'Auth Source'])}: ${formatElevenLabsAuthSourceLabel(auth.lastAuthSource || session.source || 'none')}`;

  const sessionParts = [];
  sessionParts.push(`${getUiText(['會話', '会话', 'Session'])}: ${session.hasActiveBearer ? getUiText(['有效', '有效', 'Active']) : getUiText(['無', '无', 'None'])}`);
  if (session.hasActiveBearer && session.expiresAt) {
    sessionParts.push(`${getUiText(['到期', '到期', 'Expires'])}: ${new Date(session.expiresAt).toLocaleString()}`);
  }
  if (session.refreshInFlight) {
    sessionParts.push(getUiText(['刷新中', '刷新中', 'Refreshing']));
  }
  sessionLine.innerText = sessionParts.join(' · ');

  const browserParts = [];
  browserParts.push(`${getUiText(['瀏覽器輔助', '浏览器辅助', 'Browser Assist'])}: ${browserAssist.isOpen ? getUiText(['已開啟', '已开启', 'Open']) : getUiText(['未開啟', '未开启', 'Closed'])}`);
  if (browserAssist.isLoading) {
    browserParts.push(getUiText(['載入中', '载入中', 'Loading']));
  }
  if (browserAssist.currentUrl) {
    browserParts.push(`${getUiText(['頁面', '页面', 'Page'])}: ${browserAssist.currentUrl}`);
  }
  const autoDetectState = currentFormAuth.refreshToken
    ? getUiText(['已停用', '已停用', 'Disabled'])
    : isElevenLabsBrowserAssistAutoDetectPaused
      ? getUiText(['已暫停', '已暂停', 'Paused'])
      : elevenLabsBrowserAssistAutoDetectTimer
        ? getUiText(['運行中', '运行中', 'Active'])
        : getUiText(['待命', '待命', 'Idle']);
  browserParts.push(`${getUiText(['自動檢測', '自动检测', 'Auto Detect'])}: ${autoDetectState}`);
  browserLine.innerText = browserParts.join(' · ');

  const sourceParts = [];
  const lastInspection = browserAssist.lastInspection || {};
  const sourceMap = lastInspection.sources || {};
  if (sourceMap.refreshToken) {
    sourceParts.push(`${getUiText(['Refresh 來源', 'Refresh 来源', 'Refresh Source'])}: ${formatBrowserAssistSource(sourceMap.refreshToken)}`);
  }
  if (sourceMap.appCheckToken) {
    sourceParts.push(`${getUiText(['App Check 來源', 'App Check 来源', 'App Check Source'])}: ${formatBrowserAssistSource(sourceMap.appCheckToken)}`);
  }
  if (sourceMap.deviceId) {
    sourceParts.push(`${getUiText(['Device ID 來源', 'Device ID 来源', 'Device ID Source'])}: ${formatBrowserAssistSource(sourceMap.deviceId)}`);
  }
  if (lastInspection.detectedAt) {
    sourceParts.push(`${getUiText(['最近提取', '最近提取', 'Last Extracted'])}: ${new Date(lastInspection.detectedAt).toLocaleString()}`);
  }
  browserDetailLine.hidden = sourceParts.length === 0;
  browserDetailLine.innerText = sourceParts.join(' · ');

  applyElevenLabsCopyButtonLabels();

  const copyButtonStates = {
    'btn-copy-elevenlabs-refresh-source': Boolean(sourceMap.refreshToken),
    'btn-copy-elevenlabs-refresh-token': Boolean(lastInspection.refreshToken),
    'btn-copy-elevenlabs-app-check-source': Boolean(sourceMap.appCheckToken),
    'btn-copy-elevenlabs-app-check-token': Boolean(lastInspection.appCheckToken),
    'btn-copy-elevenlabs-device-source': Boolean(sourceMap.deviceId),
    'btn-copy-elevenlabs-device-id': Boolean(lastInspection.deviceId),
  };
  browserActions.hidden = !Object.values(copyButtonStates).some(Boolean);
  Object.entries(copyButtonStates).forEach(([buttonId, enabled]) => {
    const button = document.getElementById(buttonId);
    if (button) {
      button.disabled = !enabled;
    }
  });

  credentialsLine.innerText = [
    `${getUiText(['Refresh', 'Refresh', 'Refresh'])}: ${getCredentialPresenceLabel(credentials.hasSavedRefreshToken, credentials.hasRefreshToken)}`,
    `${getUiText(['App Check', 'App Check', 'App Check'])}: ${getCredentialPresenceLabel(credentials.hasSavedAppCheckToken, credentials.hasAppCheckToken)}`,
    `${getUiText(['Device ID', 'Device ID', 'Device ID'])}: ${getCredentialPresenceLabel(credentials.hasSavedDeviceId, credentials.hasDeviceId)}`,
  ].join(' · ');

  nextStepLine.innerText = getElevenLabsNextStep(safeStatus);

  const detailParts = [];
  if (auth.lastErrorCode) {
    detailParts.push(`${getUiText(['代碼', '代码', 'Code'])}: ${auth.lastErrorCode}`);
  }
  if (auth.lastErrorMessage) {
    detailParts.push(`${getUiText(['訊息', '消息', 'Message'])}: ${auth.lastErrorMessage}`);
  }
  if (auth.lastValidatedAt) {
    detailParts.push(`${getUiText(['上次驗證', '上次验证', 'Last Validated'])}: ${new Date(auth.lastValidatedAt).toLocaleString()}`);
  }

  detailsLine.hidden = detailParts.length === 0;
  detailsLine.innerText = detailParts.join(' · ');

  if (clearButton) {
    clearButton.disabled = !session.hasActiveBearer && !auth.lastErrorCode && auth.state === 'unconfigured';
  }

  if (saveImportedButton) {
    saveImportedButton.disabled = !hasUnsavedElevenLabsCredentials(safeStatus);
  }

  syncElevenLabsAutoDetectToggleButton(safeStatus);
  syncElevenLabsBrowserAssistAutoDetect(safeStatus);
}

async function refreshElevenLabsAuthStatus() {
  if (isConfigWindowClosing) {
    return;
  }

  const requestId = ++elevenLabsStatusRequestId;

  try {
    const result = await ipcRenderer.invoke(IPC_CHANNELS.GET_AUTH_STATUS, collectElevenLabsAuthOverride());
    if (isConfigWindowClosing || requestId !== elevenLabsStatusRequestId) {
      return;
    }

    if (result?.success && result.data) {
      renderElevenLabsAuthStatus(result.data);
      return;
    }

    renderElevenLabsAuthStatus(buildFallbackElevenLabsStatus(result?.message || ''));
  } catch (error) {
    if (isConfigWindowClosing || requestId !== elevenLabsStatusRequestId) {
      return;
    }

    renderElevenLabsAuthStatus(buildFallbackElevenLabsStatus(error.message || ''));
  }
}

// read config
async function readConfig() {
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
  const chatCode = await ipcRenderer.invoke(IPC_CHANNELS.GET_CHAT_CODE);
  const version = await ipcRenderer.invoke(IPC_CHANNELS.GET_VERSION);

  // read options
  readOptions(config);
  clearEphemeralElevenLabsBearerInput();
  await refreshElevenLabsAuthStatus();

  // channel
  readChannel(config, chatCode);

  // about
  document.getElementById('span-version').innerText = version;
}

// save config
async function saveConfig() {
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
  const chatCode = await ipcRenderer.invoke(IPC_CHANNELS.GET_CHAT_CODE);

  // save options
  saveOptions(config);

  // window backgroundColor
  const windowColor = document.getElementById('input-background-color').value;
  const windowTransparent = parseInt(document.getElementById('input-background-transparency').value).toString(16);
  config.indexWindow.backgroundColor = windowColor + windowTransparent.padStart(2, '0');

  // dialog backgroundColor
  const dialogColor = document.getElementById('input-dialog-color').value;
  const dialogTransparent = parseInt(document.getElementById('input-dialog-transparency').value).toString(16);
  config.dialog.backgroundColor = dialogColor + dialogTransparent.padStart(2, '0');

  // save channel
  saveChannel(config, chatCode);

  // set config
  await ipcRenderer.invoke(IPC_CHANNELS.SET_CONFIG, config);

  // set chat code
  await ipcRenderer.invoke(IPC_CHANNELS.SET_CHAT_CODE, chatCode);

  // reset app
  resetApp(config);

  // reset config
  await readConfig();

  // add notification
  ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'SETTINGS_SAVED');
}

// save default config
async function saveDefaultConfig() {
  // set default config
  const config = await ipcRenderer.invoke(IPC_CHANNELS.SET_DEFAULT_CONFIG);

  // set default chat code
  await ipcRenderer.invoke(IPC_CHANNELS.SET_DEFAULT_CHAT_CODE);

  // reset app
  resetApp(config);

  // reset config
  await readConfig();

  // add notification
  ipcRenderer.send(IPC_CHANNELS.ADD_NOTIFICATION, 'RESTORED_TO_DEFAULT_SETTINGS');
}

// reset app
function resetApp(config) {
  // load json
  ipcRenderer.send(IPC_CHANNELS.LOAD_JSON);

  // reset view
  ipcRenderer.send(IPC_CHANNELS.SEND_INDEX, IPC_CHANNELS.RESET_VIEW, config);
  
  // change UI text
  ipcRenderer.send(IPC_CHANNELS.CHANGE_UI_TEXT);

  // set global shortcut
  ipcRenderer.send(IPC_CHANNELS.SET_GLOBAL_SHORTCUT);
}

// set on input event
function setOnInputEvent(inputId = '', spanId = '') {
  document.getElementById(inputId).oninput = () => {
    document.getElementById(spanId).innerText = document.getElementById(inputId).value;
  };
}

// read channel
function readChannel(config, chatCode) {
  const channel = document.getElementById('div-channel-list');
  let newInnerHTML = '';

  for (let index = 0; index < chatCode.length; index++) {
    const element = chatCode[index];
    const checkboxId = `checkbox-${element.ChatCode}`;
    const labelId = `label-${element.ChatCode}`;
    const spanId = `span-${element.ChatCode}`;
    const inputId = `input-${element.ChatCode}`;
    const checked = config.channel[element.ChatCode] ? 'checked' : '';
    const color = element.Color;

    newInnerHTML += `
            <hr />
            <div class="row align-items-center">
                <div class="col">
                    <div class="form-check form-switch">
                        <input type="checkbox" class="form-check-input" role="switch" value="" id="${checkboxId}" ${checked} />
                        <label class="form-check-label" for="${checkboxId}" id="${labelId}">${element.Name}</label>
                    </div>
                </div>
                <div class="col-auto">
                    <span id="${spanId}" style="color:${color};">${color}</span>
                </div>
                <div class="col-auto">
                    <input type="color" class="form-control form-control-color" value="${color}" id="${inputId}" />
                </div>
            </div>
        `;
  }

  channel.innerHTML = newInnerHTML;

  for (let index = 0; index < chatCode.length; index++) {
    const element = chatCode[index];
    setOnInputEvent(`input-${element.ChatCode}`, `span-${element.ChatCode}`);
  }
}

function saveChannel(config = {}, chatCode = {}) {
  config.channel = {};

  // save checked name
  const checkedArray = document.querySelectorAll('#div-channel-list input[type="checkbox"]:checked');
  for (let index = 0; index < checkedArray.length; index++) {
    const code = checkedArray[index].id.replaceAll('checkbox-', '');
    const label = document.getElementById(`label-${code}`);

    if (label) {
      config.channel[code] = label.innerText;
    }
  }

  // save color
  const channelArray = document.querySelectorAll('#div-channel-list input[type="checkbox"]');
  for (let index = 0; index < channelArray.length; index++) {
    const code = channelArray[index].id.replaceAll('checkbox-', '');
    const input = document.getElementById(`input-${code}`);

    if (input) {
      chatCode[index].Color = input.value;
    }
  }
}

function readOptions(config = {}) {
  getOptionList().forEach((value) => {
    const elementId = value[0][0];
    const elementProperty = value[0][1];
    const configPath = value[1];
    const valueFunction = value[2];

    // Support nested config paths of any depth
    let configValue = config;
    for (let i = 0; i < configPath.length; i++) {
      if (configValue && typeof configValue === 'object') {
        configValue = configValue[configPath[i]];
      } else {
        configValue = undefined;
        break;
      }
    }

    if (valueFunction) {
      configValue = valueFunction(configValue);
    }

    try {
      if (configValue !== undefined) {
        document.getElementById(elementId)[elementProperty] = configValue;
      }
    } catch (error) {
      console.log(error);
    }
  });
}

function saveOptions(config = {}) {
  getOptionList().forEach((value) => {
    const elementId = value[0][0];
    const elementProperty = value[0][1];
    const configPath = value[1];

    // Skip backgroundColor
    if (configPath[configPath.length - 1] === 'backgroundColor') {
      return;
    }

    try {
      const elementValue = document.getElementById(elementId)[elementProperty];

      // Support nested config paths of any depth
      let current = config;
      for (let i = 0; i < configPath.length - 1; i++) {
        if (!current[configPath[i]]) {
          current[configPath[i]] = {};
        }
        current = current[configPath[i]];
      }
      current[configPath[configPath.length - 1]] = elementValue;
    } catch (error) {
      console.log(error);
    }
  });
}


function getOptionList() {
  return [
    // window
    [
      ['checkbox-shortcut', 'checked'],
      ['indexWindow', 'shortcut'],
    ],
    [
      ['checkbox-top', 'checked'],
      ['indexWindow', 'alwaysOnTop'],
    ],
    [
      ['checkbox-focusable', 'checked'],
      ['indexWindow', 'focusable'],
    ],
    [
      ['checkbox-min-size', 'checked'],
      ['indexWindow', 'minSize'],
    ],
    [
      ['checkbox-hide-button', 'checked'],
      ['indexWindow', 'hideButton'],
    ],
    [
      ['checkbox-hide-dialog', 'checked'],
      ['indexWindow', 'hideDialog'],
    ],
    [
      ['input-hide-dialog-timeout', 'value'],
      ['indexWindow', 'timeout'],
    ],
    [
      ['span-background-color', 'innerText'],
      ['indexWindow', 'backgroundColor'],
      (value) => {
        return value.slice(0, 7);
      },
    ],
    [
      ['input-background-color', 'value'],
      ['indexWindow', 'backgroundColor'],
      (value) => {
        return value.slice(0, 7);
      },
    ],
    [
      ['span-background-transparency', 'innerText'],
      ['indexWindow', 'backgroundColor'],
      (value) => {
        return parseInt(value.slice(7), 16);
      },
    ],
    [
      ['input-background-transparency', 'value'],
      ['indexWindow', 'backgroundColor'],
      (value) => {
        return parseInt(value.slice(7), 16);
      },
    ],
    [
      ['span-speech-speed', 'innerText'],
      ['indexWindow', 'speechSpeed'],
    ],
    [
      ['input-speech-speed', 'value'],
      ['indexWindow', 'speechSpeed'],
    ],

    // compact mode
    [
      ['checkbox-compact-mode', 'checked'],
      ['indexWindow', 'compactMode'],
    ],
    [
      ['input-compact-width', 'value'],
      ['indexWindow', 'compactWidth'],
    ],
    [
      ['input-compact-height', 'value'],
      ['indexWindow', 'compactHeight'],
    ],

    // font
    [
      ['select-font-weight', 'value'],
      ['dialog', 'weight'],
    ],
    [
      ['input-font-size', 'value'],
      ['dialog', 'fontSize'],
    ],
    [
      ['input-dialog-spacing', 'value'],
      ['dialog', 'spacing'],
    ],
    [
      ['input-dialog-radius', 'value'],
      ['dialog', 'radius'],
    ],
    [
      ['span-dialog-color', 'innerText'],
      ['dialog', 'backgroundColor'],
      (value) => {
        return value.slice(0, 7);
      },
    ],
    [
      ['input-dialog-color', 'value'],
      ['dialog', 'backgroundColor'],
      (value) => {
        return value.slice(0, 7);
      },
    ],
    [
      ['span-dialog-transparency', 'innerText'],
      ['dialog', 'backgroundColor'],
      (value) => {
        return parseInt(value.slice(7), 16);
      },
    ],
    [
      ['input-dialog-transparency', 'value'],
      ['dialog', 'backgroundColor'],
      (value) => {
        return parseInt(value.slice(7), 16);
      },
    ],

    // translation
    [
      ['checkbox-auto-change', 'checked'],
      ['translation', 'autoChange'],
    ],
    [
      ['checkbox-fix-translation', 'checked'],
      ['translation', 'fix'],
    ],
    [
      ['checkbox-skip-system', 'checked'],
      ['translation', 'skip'],
    ],
    [
      ['checkbox-skip-chinese', 'checked'],
      ['translation', 'skipChinese'],
    ],
    [
      ['select-engine', 'value'],
      ['translation', 'engine'],
    ],
    [
      ['select-engine-alternate', 'value'],
      ['translation', 'engineAlternate'],
    ],
    [
      ['select-from', 'value'],
      ['translation', 'from'],
    ],
    [
      ['select-from-player', 'value'],
      ['translation', 'fromPlayer'],
    ],
    [
      ['select-to', 'value'],
      ['translation', 'to'],
    ],
    // api
    [
      ['select-google-vision-type', 'value'],
      ['api', 'googleVisionType'],
    ],
    [
      ['input-google-vision-api-key', 'value'],
      ['api', 'googleVisionApiKey'],
    ],
    [
      ['input-gemini-api-key', 'value'],
      ['api', 'geminiApiKey'],
    ],
    [
      ['input-gemini-model', 'value'],
      ['api', 'geminiModel'],
    ],

    [
      ['input-gpt-api-key', 'value'],
      ['api', 'gptApiKey'],
    ],
    [
      ['input-gpt-model', 'value'],
      ['api', 'gptModel'],
    ],

    [
      ['input-cohere-token', 'value'],
      ['api', 'cohereToken'],
    ],
    [
      ['input-cohere-model', 'value'],
      ['api', 'cohereModel'],
    ],

    [
      ['input-kimi-token', 'value'],
      ['api', 'kimiToken'],
    ],
    [
      ['input-kimi-model', 'value'],
      ['api', 'kimiModel'],
    ],

    [
      ['input-openrouter-api-key', 'value'],
      ['api', 'openRouterApiKey'],
    ],
    [
      ['input-openrouter-model', 'value'],
      ['api', 'openRouterModel'],
    ],

    [
      ['input-llm-api-url', 'value'],
      ['api', 'llmApiUrl'],
    ],
    [
      ['input-llm-api-key', 'value'],
      ['api', 'llmApiKey'],
    ],
    [
      ['input-llm-model', 'value'],
      ['api', 'llmApiModel'],
    ],

    // Speechify TTS
    [
      ['input-speechify-bearer-token', 'value'],
      ['api', 'speechify', 'bearerToken'],
    ],
    [
      ['select-speechify-voice-id', 'value'],
      ['api', 'speechify', 'voiceId'],
    ],
    [
      ['select-speechify-audio-format', 'value'],
      ['api', 'speechify', 'audioFormat'],
    ],
    [
      ['checkbox-speechify-sentence-splitting', 'checked'],
      ['api', 'speechify', 'sentenceSplitting'],
    ],

    // ElevenLabs TTS
    [
      ['input-elevenlabs-refresh-token', 'value'],
      ['api', 'elevenlabs', 'refreshToken'],
    ],
    [
      ['input-elevenlabs-app-check-token', 'value'],
      ['api', 'elevenlabs', 'appCheckToken'],
    ],
    [
      ['input-elevenlabs-device-id', 'value'],
      ['api', 'elevenlabs', 'deviceId'],
    ],
    [
      ['select-elevenlabs-voice-id', 'value'],
      ['api', 'elevenlabs', 'voiceId'],
    ],
    [
      ['select-elevenlabs-model', 'value'],
      ['api', 'elevenlabs', 'modelId'],
    ],
    [
      ['input-elevenlabs-stability', 'value'],
      ['api', 'elevenlabs', 'stability'],
    ],
    [
      ['input-elevenlabs-similarity-boost', 'value'],
      ['api', 'elevenlabs', 'similarityBoost'],
    ],
    [
      ['input-elevenlabs-style', 'value'],
      ['api', 'elevenlabs', 'style'],
    ],
    [
      ['checkbox-elevenlabs-speaker-boost', 'checked'],
      ['api', 'elevenlabs', 'useSpeakerBoost'],
    ],

    // TTS Engine (window page)
    [
      ['select-tts-engine', 'value'],
      ['indexWindow', 'ttsEngine'],
    ],

    // AI settings
    [
      ['input-ai-chat-enable', 'checked'],
      ['ai', 'useChat'],
    ],
    [
      ['input-ai-chat-length', 'value'],
      ['ai', 'chatLength'],
    ],
    [
      ['input-ai-temperature', 'value'],
      ['ai', 'temperature'],
    ],
    [
      ['checkbox-ai-streaming', 'checked'],
      ['ai', 'useStreaming'],
    ],
    [
      ['textarea-ai-custom-translation-prompt', 'value'],
      ['ai', 'customTranslationPrompt'],
    ],

    // proxy
    [
      ['input-proxy-enable', 'checked'],
      ['proxy', 'enable'],
    ],
    [
      ['select-proxy-protocol', 'value'],
      ['proxy', 'protocol'],
    ],
    [
      ['input-proxy-hostname', 'value'],
      ['proxy', 'hostname'],
    ],
    [
      ['input-proxy-port', 'value'],
      ['proxy', 'port'],
    ],
    [
      ['input-proxy-username', 'value'],
      ['proxy', 'username'],
    ],
    [
      ['input-proxy-password', 'value'],
      ['proxy', 'password'],
    ],


    // system
    [
      ['select-app-language', 'value'],
      ['system', 'appLanguage'],
    ],
    [
      ['select-theme', 'value'],
      ['system', 'theme'],
    ],
    [
      ['checkbox-auto-download-json', 'checked'],
      ['system', 'autoDownloadJson'],
    ],
    [
      ['checkbox-ssl-certificate', 'checked'],
      ['system', 'sslCertificate'],
    ],
  ];
}
