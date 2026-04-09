'use strict';

// electron
const { ipcRenderer } = require('electron');
const { IPC_CHANNELS } = require('../constants');

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

let elevenLabsAuthUiState = {
  authUsable: false,
  pending: false,
  validationMode: 'none',
  status: null,
  warning: null,
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
    await openPath(path);
  };

  const aiTestLinks = [
    { id: 'a-test-gemini-api', engine: 'Gemini' },
    { id: 'a-test-openrouter-api', engine: 'OpenRouter' },
    { id: 'a-test-gpt-api', engine: 'GPT' },
    { id: 'a-test-kimi-api', engine: 'Kimi' },
    { id: 'a-test-nvidia-api', engine: 'NVIDIA' },
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

  async function openExternalUrl(url) {
    const result = await ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL_URL, url);
    if (!result?.success) {
      throw new Error(result?.message || '打开链接失败');
    }

    return true;
  }

  async function openPath(path) {
    const result = await ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH, path);
    if (!result?.success) {
      alert(`打开路径失败\n${result?.message || '未知错误'}`);
    }
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
    await openPath(path);
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
    await openPath(path);
  };

  // github
  document.getElementById('a-github').onclick = async () => {
    try {
      await openExternalUrl('https://github.com/raydocs/fftrans');
    } catch (error) {
      alert(`打开链接失败\n${error.message}`);
    }
  };


  // default
  const buttonSaveDefaultConfig = document.getElementById('button-save-default-config');
  if (buttonSaveDefaultConfig) {
    buttonSaveDefaultConfig.onclick = async () => {
      await saveDefaultConfig();
    };
  }

  // save
  document.getElementById('button-save-config').onclick = async () => {
    await saveConfig();
  };

  // Unified: Test current TTS engine
  document.getElementById('btn-test-current-tts-engine').onclick = async () => {
    const button = document.getElementById('btn-test-current-tts-engine');
    const originalText = button.innerText;
    const engine = document.getElementById('select-tts-engine').value;

    button.disabled = true;
    button.innerText = '测试中...';

    try {
      const configForEngine = collectConfigForEngine(engine);
      const validationMessage = validateConfigForEngine(engine, configForEngine);
      if (validationMessage) {
        alert(`❌ 配置无效\n\n${validationMessage}`);
        return;
      }

      const result = await ipcRenderer.invoke(IPC_CHANNELS.TEST_CURRENT_TTS_ENGINE, { engine, config: configForEngine });
      if (result.success && result.data) {
        if (result.data.supported === false) {
          alert(`ℹ️ ${result.data.message || 'Google TTS 无需配置测试'}`);
        } else {
          alert(`✅ ${result.data.provider || engine} 测试成功！`);
        }
      } else {
        alert(formatTtsErrorAlert(result, '❌ 测试失败'));
      }
    } catch (error) {
      alert(`❌ 测试出错\n\n${error.message}`);
    } finally {
      button.disabled = false;
      button.innerText = originalText;
    }
  };

  // MiMo: Test configuration
  document.getElementById('btn-test-mimo').onclick = async () => {
    const button = document.getElementById('btn-test-mimo');
    const originalText = button.innerText;

    button.disabled = true;
    button.innerText = '测试中...';

    try {
      const mimoConfig = collectMiMoFormConfig();
      const validationMessage = validateMiMoFormConfig(mimoConfig);
      if (validationMessage) {
        alert(`❌ 配置无效\n\n${validationMessage}`);
        return;
      }

      const result = await ipcRenderer.invoke(IPC_CHANNELS.TEST_MIMO_CONFIG, mimoConfig);
      if (result.success && result.data) {
        const meta = result.data.meta || {};
        alert(`✅ 测试成功！\n\n模型: ${meta.model || 'MiMo-V2-TTS'}\n语音: ${meta.voice || '默认'}\n格式: ${meta.responseFormat || 'mp3'}\n\n本次测试使用当前表单值，若需正式保存请点击"保存设置"。`);
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

  // MiMo: Preview voice
  document.getElementById('btn-preview-mimo-voice').onclick = async () => {
    const button = document.getElementById('btn-preview-mimo-voice');
    const originalText = button.innerText;
    let playbackStarted = false;

    try {
      const previewConfig = collectMiMoFormConfig();
      const validationMessage = validateMiMoFormConfig(previewConfig);
      if (validationMessage) {
        alert(`❌ 配置无效\n\n${validationMessage}`);
        return;
      }

      button.disabled = true;
      button.innerText = '🎧 生成中...';

      const previewText = 'Welcome to Final Fantasy XIV! This is a MiMo TTS preview. I hope you enjoy this voice!';
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_MIMO_VOICE, {
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

  // MiMo: Voice select change handler
  document.getElementById('select-mimo-voice-option').onchange = () => {
    syncMiMoVoiceFromSelect();
  };

  document.getElementById('input-mimo-voice-custom').oninput = () => {
    document.getElementById('input-mimo-voice').value = document.getElementById('input-mimo-voice-custom').value.trim();
  };

  // MiMo: Refresh voices
  document.getElementById('btn-refresh-mimo-voices').onclick = async () => {
    await loadMiMoVoices();
  };

  // ElevenLabs: refresh gated actions when engine selection changes
  document.getElementById('select-tts-engine').addEventListener('change', () => {
    updateElevenLabsActionAvailability();
  });

  // ElevenLabs: Begin browser pairing
  document.getElementById('btn-elevenlabs-begin-pairing').onclick = async () => {
    const button = document.getElementById('btn-elevenlabs-begin-pairing');
    const originalText = button.innerText;

    button.disabled = true;
    button.innerText = 'Opening...';

    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.BEGIN_EXTENSION_BRIDGE_PAIRING);
      if (!result?.success) {
        alert(formatTtsErrorAlert(result, '❌ 无法开始浏览器连接'));
        return;
      }

      await refreshElevenLabsAuthStatus();
    } catch (error) {
      alert(`❌ 无法开始浏览器连接\n\n${error.message}`);
    } finally {
      button.disabled = false;
      button.innerText = originalText;
      updateElevenLabsActionAvailability();
    }
  };

  // ElevenLabs: Copy pairing link for the Chromium profile that has the extension installed
  document.getElementById('btn-elevenlabs-copy-pairing-link').onclick = async () => {
    let pairingUrl = elevenLabsAuthUiState?.status?.extensionBridge?.pairing?.pairingUrl || '';
    if (!pairingUrl) {
      const refreshed = await refreshElevenLabsAuthStatus();
      pairingUrl = refreshed?.status?.extensionBridge?.pairing?.pairingUrl || '';
    }

    if (!pairingUrl) {
      alert('Start “Connect ElevenReader” first to generate a pairing link.');
      return;
    }

    try {
      await navigator.clipboard.writeText(pairingUrl);
      alert('Pairing link copied. Open it in the Chromium browser/profile where the FFTrans extension is installed.');
    } catch {
      alert(`Open this pairing link in the Chromium browser/profile with the FFTrans extension installed:\n\n${pairingUrl}`);
    }
  };

  // ElevenLabs: Check browser / extension import state
  document.getElementById('btn-elevenlabs-check-auth').onclick = async () => {
    const button = document.getElementById('btn-elevenlabs-check-auth');
    const originalText = button.innerText;

    button.disabled = true;
    button.innerText = 'Checking...';

    try {
      await refreshElevenLabsAuthStatus({
        useImportCheck: true,
        showErrorAlert: true,
        loadVoices: true,
      });
    } finally {
      button.disabled = false;
      button.innerText = originalText;
      updateElevenLabsActionAvailability();
    }
  };

  // ElevenLabs: Save shortcut for the new onboarding flow
  document.getElementById('btn-elevenlabs-save-finish').onclick = async () => {
    await saveConfig();
  };

  // ElevenLabs: Refresh voices
  document.getElementById('btn-refresh-elevenlabs-voices').onclick = async () => {
    await loadElevenLabsVoices();
  };

  // ElevenLabs: Open bundled extension folder
  document.getElementById('btn-elevenlabs-open-extension-folder').onclick = async () => {
    const path = await ipcRenderer.invoke(IPC_CHANNELS.GET_ROOT_PATH, 'extension', 'elevenreader-bearer');
    await openPath(path);
  };

  // ElevenLabs: Open legacy browser-assist window
  document.getElementById('btn-elevenlabs-open-browser-assist').onclick = async () => {
    const button = document.getElementById('btn-elevenlabs-open-browser-assist');
    const originalText = button.innerText;

    button.disabled = true;
    button.innerText = 'Opening...';

    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.BEGIN_BROWSER_ASSIST);
      if (!result?.success) {
        alert(formatTtsErrorAlert(result, '❌ 无法打开旧版浏览器辅助窗口'));
        return;
      }

      await refreshElevenLabsAuthStatus();
    } catch (error) {
      alert(`❌ 无法打开旧版浏览器辅助窗口\n\n${error.message}`);
    } finally {
      button.disabled = false;
      button.innerText = originalText;
      updateElevenLabsActionAvailability();
    }
  };

  // ElevenLabs: Import from legacy browser-assist window
  document.getElementById('btn-elevenlabs-import-browser-assist').onclick = async () => {
    const button = document.getElementById('btn-elevenlabs-import-browser-assist');
    const originalText = button.innerText;

    button.disabled = true;
    button.innerText = 'Importing...';

    try {
      await runLegacyBrowserAssistImport({
        showErrorAlert: true,
        loadVoices: true,
      });
    } finally {
      button.disabled = false;
      button.innerText = originalText;
      updateElevenLabsActionAvailability();
    }
  };

  // ElevenLabs: Open fallback guide
  document.getElementById('a-open-elevenlabs-token-helper').onclick = async () => {
    const path = await ipcRenderer.invoke(IPC_CHANNELS.GET_ROOT_PATH, 'src', 'data', 'text', 'readme', 'elevenlabs-token-helper.html');
    await openPath(path);
  };

  // Speechify: Open configuration guide
  document.getElementById('a-open-speechify-guide').onclick = async () => {
    const path = await ipcRenderer.invoke(IPC_CHANNELS.GET_ROOT_PATH, 'src', 'data', 'text', 'readme', 'index.html');
    await openPath(path);
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

  // ElevenLabs: Direct Refresh Token validation (advanced fallback)
  document.getElementById('btn-validate-refresh-token-direct').onclick = async () => {
    const button = document.getElementById('btn-validate-refresh-token-direct');
    const originalText = button.innerText;
    const refreshToken = document.getElementById('input-elevenlabs-refresh-token').value.trim();

    if (!refreshToken) {
      alert('请先填写 Refresh Token');
      return;
    }

    button.disabled = true;
    button.innerText = 'Validating...';

    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.VALIDATE_REFRESH_TOKEN, { refreshToken });
      if (result.success) {
        await refreshElevenLabsAuthStatus({ loadVoices: true });
        alert(`✅ Refresh Token 验证成功！\n\nBearer Token 已自动获取。\n过期时间: ${result.data?.bearerTokenExpiresAt || '未知'}\n\n现在可以继续试听，并在完成后点击 “Save and finish”。`);
      } else {
        alert(formatTtsErrorAlert(result, '❌ Refresh Token 验证失败'));
      }
    } catch (error) {
      alert(`❌ 验证出错\n\n${error.message}`);
    } finally {
      button.disabled = false;
      button.innerText = originalText;
      updateElevenLabsActionAvailability();
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

  updateElevenLabsActionAvailability();
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

function collectMiMoFormConfig() {
  return {
    apiKey: document.getElementById('input-mimo-api-key').value.trim(),
    model: document.getElementById('input-mimo-model').value.trim(),
    voice: document.getElementById('input-mimo-voice').value.trim(),
    responseFormat: document.getElementById('select-mimo-response-format').value,
    speed: document.getElementById('input-mimo-speed').value,
    style: document.getElementById('input-mimo-style').value.trim(),
    emotion: document.getElementById('input-mimo-emotion').value.trim(),
    language: document.getElementById('input-mimo-language').value.trim(),
  };
}

function validateMiMoFormConfig(config = {}) {
  if (!config.apiKey) {
    return '请先填写 MiMo API Key';
  }

  if (!config.voice) {
    return '请先填写 MiMo 语音 ID (Voice)';
  }

  if (!['mp3', 'ogg', 'wav'].includes(config.responseFormat)) {
    return 'MiMo 音频格式无效';
  }

  if (config.speed) {
    const speed = Number(config.speed);
    if (Number.isNaN(speed) || speed < 0.25 || speed > 4) {
      return 'MiMo 速度必须在 0.25 到 4 之间';
    }
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

function collectElevenLabsAuthOverride() {
  const config = collectElevenLabsFormConfig();
  return {
    bearerToken: config.bearerToken,
    refreshToken: config.refreshToken,
    appCheckToken: config.appCheckToken,
    deviceId: config.deviceId,
  };
}

function isElevenLabsAuthUsable(status = {}) {
  if (!status || status.auth?.state === 'error') {
    return false;
  }

  return Boolean(
    status?.credentials?.hasRefreshToken ||
    status?.session?.hasActiveBearer ||
    (status?.auth?.state === 'session-only' && status?.credentials?.hasBearerToken)
  );
}

function hasElevenLabsPersistedRefreshToken(status = {}) {
  return Boolean(status?.credentials?.hasRefreshToken);
}

function isElevenLabsSessionOnlyAuth(status = {}) {
  return isElevenLabsAuthUsable(status) && !hasElevenLabsPersistedRefreshToken(status);
}

function applyElevenLabsImportedFields(authInput = {}, options = {}) {
  const { allowBearer = false } = options;

  if (typeof authInput.refreshToken === 'string' && authInput.refreshToken.trim()) {
    document.getElementById('input-elevenlabs-refresh-token').value = authInput.refreshToken.trim();
  }

  if (typeof authInput.appCheckToken === 'string' && authInput.appCheckToken.trim()) {
    document.getElementById('input-elevenlabs-app-check-token').value = authInput.appCheckToken.trim();
  }

  if (typeof authInput.deviceId === 'string' && authInput.deviceId.trim()) {
    document.getElementById('input-elevenlabs-device-id').value = authInput.deviceId.trim();
  }

  if (allowBearer && typeof authInput.bearerToken === 'string' && authInput.bearerToken.trim()) {
    document.getElementById('input-elevenlabs-bearer-token').value = authInput.bearerToken.trim();
  }
}

function setElevenLabsStatusPill(elementId = '', text = '', tone = 'muted') {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  element.innerText = text;
  element.className = `elevenlabs-status-pill tone-${tone}`;
}

function updateElevenLabsActionAvailability() {
  const authUsable = Boolean(elevenLabsAuthUiState.authUsable);
  const status = elevenLabsAuthUiState.status || {};
  const sessionOnlyAuth = isElevenLabsSessionOnlyAuth(status);
  const previewButton = document.getElementById('btn-preview-elevenlabs-voice');
  const refreshButton = document.getElementById('btn-refresh-elevenlabs-voices');
  const saveButton = document.getElementById('btn-elevenlabs-save-finish');
  const currentTtsTestButton = document.getElementById('btn-test-current-tts-engine');
  const isElevenLabsSelected = document.getElementById('select-tts-engine').value === 'elevenlabs';
  const unavailableTitle = 'Complete the Chromium extension flow or validate a manual Refresh Token first';

  if (previewButton) {
    previewButton.disabled = !authUsable;
    previewButton.title = authUsable ? '' : unavailableTitle;
  }

  if (refreshButton) {
    refreshButton.disabled = !authUsable;
    refreshButton.title = authUsable ? '' : unavailableTitle;
  }

  if (saveButton) {
    saveButton.disabled = !authUsable;
    saveButton.innerText = sessionOnlyAuth ? 'Save settings only' : 'Save and finish';
    saveButton.title = !authUsable
      ? 'Save becomes available after auth is ready'
      : sessionOnlyAuth
        ? 'This login is session-only; save will keep your settings, but you may need to reconnect after restart'
        : '';
  }

  if (currentTtsTestButton && isElevenLabsSelected) {
    currentTtsTestButton.disabled = !authUsable;
    currentTtsTestButton.title = authUsable ? '' : unavailableTitle;
  } else if (currentTtsTestButton && !isElevenLabsSelected) {
    currentTtsTestButton.disabled = false;
    currentTtsTestButton.title = '';
  }
}

async function syncElevenLabsPersistedAuthFields() {
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
  const elevenLabsConfig = config?.api?.elevenlabs || {};

  document.getElementById('input-elevenlabs-bearer-token').value = elevenLabsConfig.bearerToken || '';
  document.getElementById('input-elevenlabs-refresh-token').value = elevenLabsConfig.refreshToken || '';
  document.getElementById('input-elevenlabs-app-check-token').value = elevenLabsConfig.appCheckToken || '';
  document.getElementById('input-elevenlabs-device-id').value = elevenLabsConfig.deviceId || '';
}

function renderElevenLabsAuthStatus(resultModel = {}) {
  const status = resultModel.status || {};
  const bridge = status.extensionBridge || {};
  const pairing = bridge.pairing || {};
  const candidate = resultModel.candidate || bridge.candidate || {};
  const warning = resultModel.warning;
  const authUsable = isElevenLabsAuthUsable(status);
  const sessionOnlyAuth = isElevenLabsSessionOnlyAuth(status);
  const hasRefreshBackedAuth = hasElevenLabsPersistedRefreshToken(status);

  let bridgeText = 'Browser: idle';
  let bridgeTone = 'muted';
  if (pairing.active) {
    bridgeText = 'Browser: connected';
    bridgeTone = 'success';
  } else if (pairing.state === 'waiting') {
    bridgeText = 'Browser: waiting';
    bridgeTone = 'warning';
  } else if (pairing.state === 'unpaired') {
    bridgeText = 'Browser: not connected';
  }

  let authText = 'Auth: not ready';
  let authTone = 'muted';
  if (authUsable) {
    authText = sessionOnlyAuth ? 'Auth: session only' : 'Auth: ready';
    authTone = sessionOnlyAuth ? 'warning' : 'success';
  } else if (resultModel.pending || ['pending', 'validating'].includes(candidate.state)) {
    authText = 'Auth: checking';
    authTone = 'info';
  } else if (candidate.state === 'rejected' || status.auth?.state === 'error') {
    authText = 'Auth: needs attention';
    authTone = 'danger';
  } else if (pairing.state === 'waiting' || pairing.active) {
    authText = 'Auth: waiting';
    authTone = 'warning';
  }

  let title = 'Connect ElevenReader to begin.';
  let body = 'FFTrans will open the pairing/login page in your browser. After you log in, come back and click “Check again”.';
  let meta = '';

  if (resultModel.pending || ['pending', 'validating'].includes(candidate.state)) {
    title = 'Checking browser login...';
    body = 'FFTrans is validating the login imported from the extension. Please wait a moment, then check again if needed.';
  } else if (authUsable && resultModel.validationMode === 'refresh') {
    title = 'ElevenReader connected and ready.';
    body = 'The browser flow imported a usable login. You can preview voices now, then click “Save and finish”.';
  } else if (authUsable && hasRefreshBackedAuth && !pairing.active && pairing.state !== 'waiting') {
    title = 'Saved ElevenLabs login found.';
    body = 'This config already has usable ElevenLabs auth. You can preview voices now or reconnect the browser if you want to re-authorize.';
  } else if (sessionOnlyAuth) {
    title = 'Session-only login ready.';
    body = 'ElevenLabs works for this session, but this login may need to be re-imported after restart. For a durable fallback, use the manual Refresh Token section below.';
    meta = status.session?.expiresAt
      ? `Session expires at: ${status.session.expiresAt}`
      : 'Session-only login detected.';

    if (status.auth?.lastAuthSource === 'manual-bearer') {
      body += ' If this came from the legacy browser-assist fallback, saving may keep only a temporary bearer token.';
    }
  } else if (authUsable) {
    title = 'Browser session ready.';
    body = 'ElevenLabs auth is usable for this session. You can preview voices now and save when finished.';
  } else if (candidate.state === 'rejected' || status.auth?.state === 'error') {
    title = 'Connection needs attention.';
    body = warning?.message || status.auth?.lastErrorMessage || 'The imported login could not be validated yet.';
    meta = warning?.suggestion || '';
  } else if (pairing.state === 'waiting' || pairing.active) {
    title = 'Open and log in in your browser.';
    body = 'Finish logging into ElevenReader in Chrome / Chromium, then return here and click “Check again”.';
  }

  if (!meta && (pairing.state === 'waiting' || pairing.active) && pairing.pairingUrl) {
    meta = 'If FFTrans opened the wrong browser, use “Copy pairing link” and reopen it in the Chromium profile that has the extension installed.';
  } else if (!meta && status.session?.expiresAt) {
    meta = `Session expires at: ${status.session.expiresAt}`;
  } else if (!meta && status.auth?.lastAuthSource && status.auth.lastAuthSource !== 'none') {
    meta = `Auth source: ${status.auth.lastAuthSource}`;
  }

  document.getElementById('text-elevenlabs-status-title').innerText = title;
  document.getElementById('text-elevenlabs-status-body').innerText = body;
  document.getElementById('text-elevenlabs-status-meta').innerText = meta;

  setElevenLabsStatusPill('pill-elevenlabs-bridge', bridgeText, bridgeTone);
  setElevenLabsStatusPill('pill-elevenlabs-auth', authText, authTone);

  const hint = document.getElementById('text-elevenlabs-action-hint');
  if (hint) {
    if (!authUsable) {
      hint.hidden = false;
      hint.innerText = 'Primary path: Chromium + extension. If that is unavailable, use the manual Refresh Token fallback or the legacy browser-assist flow below.';
    } else if (sessionOnlyAuth) {
      hint.hidden = false;
      hint.innerText = 'This login is session-only. Preview works now, but it may not survive restart unless you also save a Refresh Token.';

      if (status.auth?.lastAuthSource === 'manual-bearer') {
        hint.innerText += ' Legacy browser-assist bearer imports are temporary and should not be treated as durable auth.';
      }
    } else {
      hint.hidden = true;
    }
  }

  const advancedDetails = document.getElementById('details-elevenlabs-advanced');
  if (advancedDetails && (sessionOnlyAuth || !authUsable || candidate.state === 'rejected' || status.auth?.state === 'error')) {
    advancedDetails.open = true;
  }

  elevenLabsAuthUiState = {
    ...elevenLabsAuthUiState,
    authUsable,
    pending: Boolean(resultModel.pending),
    validationMode: resultModel.validationMode || 'none',
    status,
    warning,
  };

  updateElevenLabsActionAvailability();
}

function normalizeElevenLabsStatusResult(result = {}) {
  const data = result?.data || {};
  const status = data?.status || data;
  const bridge = status?.extensionBridge || data;

  return {
    status,
    warning: data?.warning || null,
    pending: Boolean(data?.pending || ['pending', 'validating'].includes(bridge?.candidate?.state)),
    imported: data?.imported || null,
    validationMode: data?.validationMode || bridge?.candidate?.validationMode || 'none',
    candidate: data?.candidate || bridge?.candidate || {},
  };
}

async function refreshElevenLabsAuthStatus(options = {}) {
  const {
    useImportCheck = false,
    showErrorAlert = false,
    loadVoices = false,
  } = options;
  const channel = useImportCheck ? IPC_CHANNELS.CHECK_EXTENSION_BRIDGE_IMPORT : IPC_CHANNELS.GET_AUTH_STATUS;
  const result = await ipcRenderer.invoke(channel, collectElevenLabsAuthOverride());

  if (!result?.success) {
    if (showErrorAlert) {
      alert(formatTtsErrorAlert(result, '❌ ElevenLabs 状态检查失败'));
    }
    return null;
  }

  const normalized = normalizeElevenLabsStatusResult(result);

  if (useImportCheck && (normalized.imported?.refreshToken || normalized.imported?.appCheckToken || normalized.imported?.deviceId)) {
    await syncElevenLabsPersistedAuthFields();
  }

  renderElevenLabsAuthStatus(normalized);

  if (loadVoices && elevenLabsAuthUiState.authUsable) {
    await loadElevenLabsVoices();
  }

  return normalized;
}

async function runLegacyBrowserAssistImport(options = {}) {
  const {
    showErrorAlert = false,
    loadVoices = false,
  } = options;

  const result = await ipcRenderer.invoke(
    IPC_CHANNELS.CHECK_BROWSER_ASSIST_LOGIN,
    collectElevenLabsAuthOverride(),
    { background: false },
  );

  if (!result?.success) {
    if (showErrorAlert) {
      alert(formatTtsErrorAlert(result, '❌ 旧版浏览器辅助导入失败'));
    }
    return null;
  }

  const data = result?.data || {};
  applyElevenLabsImportedFields({
    refreshToken: data?.imported?.refreshToken ? data.refreshToken : '',
    appCheckToken: data?.imported?.appCheckToken ? data.appCheckToken : '',
    deviceId: data?.imported?.deviceId ? data.deviceId : '',
    bearerToken: data?.imported?.bearerToken ? data.bearerToken : '',
  }, { allowBearer: true });

  const normalized = normalizeElevenLabsStatusResult(result);
  renderElevenLabsAuthStatus(normalized);

  if (loadVoices && elevenLabsAuthUiState.authUsable) {
    await loadElevenLabsVoices();
  }

  return normalized;
}

function validateElevenLabsFormConfig(config = {}) {
  if (!elevenLabsAuthUiState.authUsable) {
    return '请先完成 ElevenReader 浏览器连接，或在高级区域验证 Refresh Token';
  }

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

// --- Unified TTS test helpers ---

function collectConfigForEngine(engine) {
  switch (engine) {
    case 'speechify': return collectSpeechifyFormConfig();
    case 'elevenlabs': return collectElevenLabsFormConfig();
    case 'mimo': return collectMiMoFormConfig();
    case 'google': return {};
    default: return {};
  }
}

function validateConfigForEngine(engine, config) {
  switch (engine) {
    case 'speechify': return validateSpeechifyFormConfig(config);
    case 'elevenlabs': return validateElevenLabsFormConfig(config);
    case 'mimo': return validateMiMoFormConfig(config);
    case 'google': return '';
    default: return '';
  }
}

// --- MiMo voice select/custom sync ---

function syncMiMoVoiceFromSelect() {
  const select = document.getElementById('select-mimo-voice-option');
  const customRow = document.getElementById('mimo-custom-voice-row');
  const hiddenInput = document.getElementById('input-mimo-voice');
  const customInput = document.getElementById('input-mimo-voice-custom');

  if (select.value === '__custom__') {
    customRow.style.display = '';
    hiddenInput.value = customInput.value.trim();
  } else {
    customRow.style.display = 'none';
    hiddenInput.value = select.value;
  }
}

function syncMiMoVoiceControlsFromStoredValue(storedVoice = '') {
  const select = document.getElementById('select-mimo-voice-option');
  const customRow = document.getElementById('mimo-custom-voice-row');
  const customInput = document.getElementById('input-mimo-voice-custom');

  // Try to match stored voice to an option
  let found = false;
  for (let i = 0; i < select.options.length; i++) {
    if (select.options[i].value === storedVoice && storedVoice !== '__custom__') {
      select.value = storedVoice;
      found = true;
      break;
    }
  }

  if (!found && storedVoice) {
    // Switch to custom mode
    select.value = '__custom__';
    customInput.value = storedVoice;
    customRow.style.display = '';
  } else if (found) {
    customRow.style.display = 'none';
  }
}

// --- Voice list loading ---

let elevenLabsVoiceRequestId = 0;
let mimoVoiceRequestId = 0;

async function loadElevenLabsVoices() {
  const requestId = ++elevenLabsVoiceRequestId;
  const select = document.getElementById('select-elevenlabs-voice-id');
  const currentValue = select.value;
  const btn = document.getElementById('btn-refresh-elevenlabs-voices');
  const originalText = btn.innerText;

  if (!elevenLabsAuthUiState.authUsable) {
    updateElevenLabsActionAvailability();
    return;
  }

  try {
    btn.disabled = true;
    btn.innerText = '...';

    const result = await ipcRenderer.invoke(IPC_CHANNELS.GET_TTS_VOICES, {
      engine: 'elevenlabs',
      config: collectElevenLabsFormConfig(),
    });

    if (requestId !== elevenLabsVoiceRequestId) return; // Stale response

    if (result.success && result.data?.voices?.length > 0) {
      const voices = result.data.voices;

      // Group voices
      const groups = {};
      voices.forEach((v) => {
        const group = v.group || 'Other';
        if (!groups[group]) groups[group] = [];
        groups[group].push(v);
      });

      // Rebuild select
      select.innerHTML = '';
      Object.keys(groups).forEach((groupName) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        groups[groupName].forEach((v) => {
          const option = document.createElement('option');
          option.value = v.value;
          option.textContent = v.label;
          optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
      });

      // Restore selection or add synthetic option
      if (currentValue) {
        let found = false;
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].value === currentValue) {
            found = true;
            break;
          }
        }
        if (!found) {
          const option = document.createElement('option');
          option.value = currentValue;
          option.textContent = `${currentValue} (当前)`;
          select.insertBefore(option, select.firstChild);
        }
        select.value = currentValue;
      }
    }
  } catch (error) {
    console.warn('[Config] Failed to load ElevenLabs voices:', error.message);
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

async function loadMiMoVoices() {
  const requestId = ++mimoVoiceRequestId;
  const select = document.getElementById('select-mimo-voice-option');
  const hiddenInput = document.getElementById('input-mimo-voice');
  const currentValue = hiddenInput.value;
  const btn = document.getElementById('btn-refresh-mimo-voices');
  const originalText = btn.innerText;

  try {
    btn.disabled = true;
    btn.innerText = '...';

    const mimoConfig = collectMiMoFormConfig();
    if (!mimoConfig.apiKey) {
      return; // No API key, keep fallback
    }

    const result = await ipcRenderer.invoke(IPC_CHANNELS.GET_TTS_VOICES, {
      engine: 'mimo',
      config: mimoConfig,
    });

    if (requestId !== mimoVoiceRequestId) return; // Stale response

    if (result.success && result.data?.voices?.length > 0) {
      const voices = result.data.voices;

      // Group voices
      const groups = {};
      voices.forEach((v) => {
        const group = v.group || 'Other';
        if (!groups[group]) groups[group] = [];
        groups[group].push(v);
      });

      // Rebuild select (keep __custom__ sentinel)
      select.innerHTML = '';
      Object.keys(groups).forEach((groupName) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        groups[groupName].forEach((v) => {
          const option = document.createElement('option');
          option.value = v.value;
          option.textContent = v.label;
          optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
      });

      // Re-add custom sentinel
      const customOption = document.createElement('option');
      customOption.value = '__custom__';
      customOption.textContent = '自定义语音 ID...';
      select.appendChild(customOption);

      // Restore selection
      syncMiMoVoiceControlsFromStoredValue(currentValue);
    }
  } catch (error) {
    console.warn('[Config] Failed to load MiMo voices:', error.message);
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
}


// read config
async function readConfig() {
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
  const chatCode = await ipcRenderer.invoke(IPC_CHANNELS.GET_CHAT_CODE);
  const version = await ipcRenderer.invoke(IPC_CHANNELS.GET_VERSION);

  // read options
  readOptions(config);

  // Sync MiMo voice controls from stored value
  syncMiMoVoiceControlsFromStoredValue(config?.api?.mimo?.voice || '');

  await refreshElevenLabsAuthStatus({ loadVoices: true });

  // Async voice loading (non-blocking)
  loadMiMoVoices().catch(() => {});

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
      ['input-nvidia-api-key', 'value'],
      ['api', 'nvidiaApiKey'],
    ],
    [
      ['input-nvidia-model', 'value'],
      ['api', 'nvidiaModel'],
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

    // MiMo TTS
    [
      ['input-mimo-api-key', 'value'],
      ['api', 'mimo', 'apiKey'],
    ],
    [
      ['input-mimo-model', 'value'],
      ['api', 'mimo', 'model'],
    ],
    [
      ['input-mimo-voice', 'value'],
      ['api', 'mimo', 'voice'],
    ],
    [
      ['select-mimo-response-format', 'value'],
      ['api', 'mimo', 'responseFormat'],
    ],
    [
      ['input-mimo-speed', 'value'],
      ['api', 'mimo', 'speed'],
    ],
    [
      ['input-mimo-style', 'value'],
      ['api', 'mimo', 'style'],
    ],
    [
      ['input-mimo-emotion', 'value'],
      ['api', 'mimo', 'emotion'],
    ],
    [
      ['input-mimo-language', 'value'],
      ['api', 'mimo', 'language'],
    ],

    // ElevenLabs TTS
    [
      ['input-elevenlabs-bearer-token', 'value'],
      ['api', 'elevenlabs', 'bearerToken'],
    ],
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
