'use strict';

// electron
const { ipcRenderer } = require('electron');
const { IPC_CHANNELS } = require('../constants');

let elevenLabsAuthUiState = {
  authUsable: false,
  pending: false,
  validationMode: 'none',
  status: null,
  warning: null,
};

let activeTabId = 'div-appearance';
let isDirty = false;
let suppressDirtyTracking = false;
let settingsSearchState = {
  lastMatches: [],
  highlightTimer: null,
};

const ELEVENLABS_VOICE_SELECT_IDS = [
  'select-elevenlabs-voice-id',
  'select-elevenlabs-female-voice-id',
  'select-elevenlabs-male-voice-id',
];

const ELEVENLABS_PREVIEW_CONTROLS = [
  {
    selectId: 'select-elevenlabs-voice-id',
    buttonId: 'btn-preview-elevenlabs-voice',
    roleLabel: 'default voice',
  },
  {
    selectId: 'select-elevenlabs-female-voice-id',
    buttonId: 'btn-preview-elevenlabs-female-voice',
    roleLabel: 'female NPC voice',
  },
  {
    selectId: 'select-elevenlabs-male-voice-id',
    buttonId: 'btn-preview-elevenlabs-male-voice',
    roleLabel: 'male NPC voice',
  },
];

const UI_COPY = {
  toastSuccessTitle: ['成功', '成功', 'Success'],
  toastErrorTitle: ['錯誤', '错误', 'Error'],
  toastInfoTitle: ['提示', '提示', 'Info'],
  toastWarningTitle: ['提醒', '提醒', 'Warning'],
  unsavedChanges: ['有未儲存的變更', '有未保存的更改', 'Unsaved changes'],
  settingsSearchLabel: ['快速查找', '快速查找', 'Quick find'],
  settingsSearchPlaceholder: ['搜尋設定、引擎、API 或語音', '搜索设置、引擎、API 或语音', 'Search settings, engines, API, or voices'],
  settingsSearchClear: ['清除', '清除', 'Clear'],
  settingsSearchHelp: ['輸入關鍵字可快速跳轉到相關設定', '输入关键词可快速跳转到相关设置', 'Type to jump to related settings'],
  settingsSearchEmpty: ['找不到相符設定', '找不到匹配设置', 'No matching settings found'],
  settingsSearchCount: ['找到 {count} 個設定，Enter 可開啟第一個結果', '找到 {count} 个设置，Enter 可打开第一个结果', '{count} settings found. Press Enter to open the first result'],
  settingsSearchCapped: ['顯示前 {shown} 個，共 {count} 個結果', '显示前 {shown} 个，共 {count} 个结果', 'Showing first {shown} of {count} results'],
  settingsSaved: ['設定已儲存', '设置已保存', 'Settings saved'],
  defaultsRestored: ['已還原預設設定', '已恢复默认设置', 'Defaults restored'],
  compactSizeApplied: ['緊湊尺寸已套用', '紧凑尺寸已应用', 'Compact size applied'],
  testing: ['測試中...', '测试中...', 'Testing...'],
  generating: ['生成中...', '生成中...', 'Generating...'],
  playing: ['播放中...', '播放中...', 'Playing...'],
  opening: ['開啟中...', '打开中...', 'Opening...'],
  checking: ['檢查中...', '检查中...', 'Checking...'],
  importing: ['導入中...', '导入中...', 'Importing...'],
  validating: ['驗證中...', '验证中...', 'Validating...'],
  comparing: ['測試中…', '测试中…', 'Testing…'],
  fastest: ['最快', '最快', 'Fastest'],
  preview: ['試聽', '试听', 'Preview'],
  moreEnginesConfigured: ['已設定 {count} 個', '已配置 {count} 个', '{count} configured'],
  toggleVisibility: ['切換顯示狀態', '切换显示状态', 'Toggle visibility'],
  elevenlabsUnavailableTitle: [
    '請先完成 Chromium 擴充套件流程，或改用手動 Refresh Token',
    '请先完成 Chromium 扩展流程，或改用手动 Refresh Token',
    'Complete the Chromium extension flow or validate a manual Refresh Token first',
  ],
  elevenlabsBrowserIdle: ['瀏覽器：閒置', '浏览器：空闲', 'Browser: idle'],
  elevenlabsBrowserConnected: ['瀏覽器：已連線', '浏览器：已连接', 'Browser: connected'],
  elevenlabsBrowserWaiting: ['瀏覽器：等待中', '浏览器：等待中', 'Browser: waiting'],
  elevenlabsBrowserUnpaired: ['瀏覽器：未連線', '浏览器：未连接', 'Browser: not connected'],
  elevenlabsAuthNotReady: ['驗證：未就緒', '验证：未就绪', 'Auth: not ready'],
  elevenlabsAuthReady: ['驗證：已就緒', '验证：已就绪', 'Auth: ready'],
  elevenlabsAuthSessionOnly: ['驗證：僅限本次會話', '验证：仅限本次会话', 'Auth: session only'],
  elevenlabsAuthChecking: ['驗證：檢查中', '验证：检查中', 'Auth: checking'],
  elevenlabsAuthAttention: ['驗證：需要處理', '验证：需要处理', 'Auth: needs attention'],
  elevenlabsAuthWaiting: ['驗證：等待中', '验证：等待中', 'Auth: waiting'],
  elevenlabsTitleStart: ['先連接 ElevenReader', '先连接 ElevenReader', 'Connect ElevenReader to begin.'],
  elevenlabsBodyStart: [
    'FFTrans 會在瀏覽器中開啟配對 / 登入頁面，登入後回來點「再次檢查」。',
    'FFTrans 会在浏览器中打开配对 / 登录页面，登录后回来点“再次检查”。',
    'FFTrans will open the pairing/login page in your browser. After you log in, come back and click “Check again”.',
  ],
  elevenlabsTitlePending: ['正在檢查瀏覽器登入…', '正在检查浏览器登录…', 'Checking browser login...'],
  elevenlabsBodyPending: [
    'FFTrans 正在驗證從擴充套件導入的登入狀態，請稍候後再檢查一次。',
    'FFTrans 正在验证从扩展导入的登录状态，请稍候后再检查一次。',
    'FFTrans is validating the login imported from the extension. Please wait a moment, then check again if needed.',
  ],
  elevenlabsTitleReadyRefresh: ['ElevenReader 已連接，可直接使用', 'ElevenReader 已连接，可直接使用', 'ElevenReader connected and ready.'],
  elevenlabsBodyReadyRefresh: [
    '瀏覽器流程已導入可用登入，現在可先試聽語音，再儲存設定。',
    '浏览器流程已导入可用登录，现在可先试听语音，再保存设置。',
    'The browser flow imported a usable login. You can preview voices now, then save settings.',
  ],
  elevenlabsTitleSavedAuth: ['已偵測到已保存的 ElevenLabs 登入', '已检测到已保存的 ElevenLabs 登录', 'Saved ElevenLabs login found.'],
  elevenlabsBodySavedAuth: [
    '目前設定已具備可用的 ElevenLabs 驗證，可直接試聽語音；若要重新授權，也可以重新連接瀏覽器。',
    '当前配置已具备可用的 ElevenLabs 验证，可直接试听语音；如果想重新授权，也可以重新连接浏览器。',
    'This config already has usable ElevenLabs auth. You can preview voices now or reconnect the browser if you want to re-authorize.',
  ],
  elevenlabsTitleSessionOnly: ['會話登入已可使用', '会话登录已可使用', 'Session-only login ready.'],
  elevenlabsBodySessionOnly: [
    'ElevenLabs 現在可用，但這份登入在重啟後可能失效；若要更穩定，請改用下方手動 Refresh Token。',
    'ElevenLabs 现在可用，但这份登录在重启后可能失效；如果想更稳定，请改用下方手动 Refresh Token。',
    'ElevenLabs works for this session, but this login may need to be re-imported after restart. For a durable fallback, use the manual Refresh Token section below.',
  ],
  elevenlabsLegacyBearerNote: [
    '如果這是舊版 browser-assist 導入的 bearer，通常只屬於臨時登入。',
    '如果这是旧版 browser-assist 导入的 bearer，通常只属于临时登录。',
    'If this came from the legacy browser-assist fallback, saving may keep only a temporary bearer token.',
  ],
  elevenlabsTitleBrowserReady: ['瀏覽器工作階段已就緒', '浏览器会话已就绪', 'Browser session ready.'],
  elevenlabsBodyBrowserReady: [
    'ElevenLabs 驗證已可用，現在可試聽語音，確認沒問題後再儲存設定。',
    'ElevenLabs 验证已可用，现在可试听语音，确认没问题后再保存设置。',
    'ElevenLabs auth is usable for this session. You can preview voices now and save when finished.',
  ],
  elevenlabsTitleNeedsAttention: ['連線需要處理', '连接需要处理', 'Connection needs attention.'],
  elevenlabsTitleWaiting: ['請回到瀏覽器完成登入', '请回到浏览器完成登录', 'Open and log in in your browser.'],
  elevenlabsBodyWaiting: [
    '請在 Chrome / Chromium 中完成 ElevenReader 登入，再回來點「再次檢查」。',
    '请在 Chrome / Chromium 中完成 ElevenReader 登录，再回来点“再次检查”。',
    'Finish logging into ElevenReader in Chrome / Chromium, then return here and click “Check again”.',
  ],
  elevenlabsMetaSessionExpires: ['會話到期時間：{value}', '会话到期时间：{value}', 'Session expires at: {value}'],
  elevenlabsMetaSessionOnly: ['偵測到僅限本次會話的登入。', '检测到仅限本次会话的登录。', 'Session-only login detected.'],
  elevenlabsMetaAuthSource: ['驗證來源：{value}', '验证来源：{value}', 'Auth source: {value}'],
  elevenlabsMetaPairingHint: [
    '如果 FFTrans 開錯瀏覽器，請複製配對連結，改在已安裝擴充套件的 Chromium 使用者資料中開啟。',
    '如果 FFTrans 打开了错误浏览器，请复制配对链接，改在已安装扩展的 Chromium 用户资料中打开。',
    'If FFTrans opened the wrong browser, use “Copy pairing link” and reopen it in the Chromium profile that has the extension installed.',
  ],
  elevenlabsHintPrimary: [
    '首選路徑是 Chromium + 擴充套件；若不可用，再改用手動 Refresh Token 或下方舊版 browser-assist。',
    '首选路径是 Chromium + 扩展；如果不可用，再改用手动 Refresh Token 或下方旧版 browser-assist。',
    'Primary path: Chromium + extension. If that is unavailable, use the manual Refresh Token fallback or the legacy browser-assist flow below.',
  ],
  elevenlabsHintSessionOnly: [
    '目前登入僅限本次會話，現在可試聽，但若沒有保存 Refresh Token，重啟後可能失效。',
    '当前登录仅限本次会话，现在可试听，但如果没有保存 Refresh Token，重启后可能失效。',
    'This login is session-only. Preview works now, but it may not survive restart unless you also save a Refresh Token.',
  ],
  elevenlabsHintLegacy: [
    '舊版 browser-assist 導入的 bearer 屬於暫時登入，不建議視為持久授權。',
    '旧版 browser-assist 导入的 bearer 属于临时登录，不建议视为持久授权。',
    'Legacy browser-assist bearer imports are temporary and should not be treated as durable auth.',
  ],
};

// DOMContentLoaded
window.addEventListener('DOMContentLoaded', async () => {
  setIPC();
  setEvent();
  setButton();
  await setView();
  initializeSettingsSearch();
  hydrateInteractiveAccessibility();
  bindDirtyTracking();
  setDirtyState(false);
});

// set IPC
function setIPC() {
  // change UI text
  ipcRenderer.on(IPC_CHANNELS.CHANGE_UI_TEXT, async () => {
    const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
    document.dispatchEvent(new CustomEvent('change-ui-text', { detail: config }));
    requestAnimationFrame(() => {
      updateSettingsSearchCopy();
      refreshSettingsSearchResults();
    });
  });

  // send data
  ipcRenderer.on(IPC_CHANNELS.SEND_DATA, (event, divId) => {
    switchTab(divId);
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

  initializeElevenLabsGenderVoiceSelects();
  await readConfig();

  // Initialize prompt preset selector based on current value
  initializePromptPreset();

  updateGoogleVisionTypeVisibility();
  updateTtsEngineSections();
  updateTranslationEngineSections();
  updateMoreEnginesConfiguredCount();

  // change UI text (立即加载，然后移除 loading 类显示内容)
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
  document.dispatchEvent(new CustomEvent('change-ui-text', { detail: config }));
  switchTab(activeTabId);
  updateSettingsSearchCopy();
  
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

function getCurrentAppLanguage() {
  return document.getElementById('select-app-language')?.value || 'app-zhs';
}

function getCurrentLanguageIndex() {
  switch (getCurrentAppLanguage()) {
    case 'app-zht':
      return 0;
    case 'app-zhs':
      return 1;
    default:
      return 2;
  }
}

function getUiText(key, replacements = {}) {
  const entry = UI_COPY[key];
  let text = Array.isArray(entry) ? entry[getCurrentLanguageIndex()] || entry[2] : key;

  Object.entries(replacements).forEach(([token, value]) => {
    text = text.replaceAll(`{${token}}`, value);
  });

  return text;
}

function switchTab(targetId, options = {}) {
  const { focusTab = false } = options;
  const nextPanel = document.getElementById(targetId);
  if (!nextPanel) {
    return;
  }

  activeTabId = targetId;

  document.querySelectorAll('.config-page').forEach((page) => {
    const isActive = page.id === targetId;
    page.hidden = !isActive;
  });

  document.querySelectorAll('.tab-item').forEach((tab) => {
    const isActive = tab.getAttribute('data-target') === targetId;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tab.setAttribute('tabindex', isActive ? '0' : '-1');

    if (isActive && focusTab) {
      tab.focus();
    }
  });
}

function initializeSettingsSearch() {
  const input = document.getElementById('input-settings-search');
  const clearButton = document.getElementById('button-settings-search-clear');
  const results = document.getElementById('settings-search-results');

  if (!input || !clearButton || !results) {
    return;
  }

  updateSettingsSearchCopy();

  input.addEventListener('input', refreshSettingsSearchResults);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      clearSettingsSearch({ focusInput: true });
      return;
    }

    if (event.key === 'Enter' && settingsSearchState.lastMatches.length > 0) {
      event.preventDefault();
      activateSettingsSearchResult(0);
    }
  });

  clearButton.addEventListener('click', () => clearSettingsSearch({ focusInput: true }));

  results.addEventListener('click', (event) => {
    const button = event.target.closest('.settings-search-result');
    if (!button) {
      return;
    }

    activateSettingsSearchResult(Number(button.dataset.resultIndex));
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus();
      input.select();
    }
  });
}

function updateSettingsSearchCopy() {
  const label = document.getElementById('label-settings-search');
  const input = document.getElementById('input-settings-search');
  const clearButton = document.getElementById('button-settings-search-clear');
  const status = document.getElementById('settings-search-status');

  if (label) {
    label.textContent = getUiText('settingsSearchLabel');
  }

  if (input) {
    input.placeholder = getUiText('settingsSearchPlaceholder');
    input.setAttribute('aria-label', getUiText('settingsSearchPlaceholder'));
  }

  if (clearButton) {
    clearButton.textContent = getUiText('settingsSearchClear');
  }

  if (status && !normalizeSearchText(input?.value)) {
    status.textContent = getUiText('settingsSearchHelp');
  }
}

function normalizeSearchText(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

function getElementSearchText(element) {
  const textParts = [];
  const section = element.closest('.settings-section');
  const page = element.closest('.config-page');
  const tab = page ? document.querySelector(`.tab-item[data-target="${page.id}"]`) : null;
  const details = element.closest('details');

  textParts.push(tab?.textContent || '');
  textParts.push(section?.querySelector('.settings-section-header')?.textContent || '');
  textParts.push(details?.querySelector('summary')?.textContent || '');
  textParts.push(page?.getAttribute('aria-labelledby') || '');
  textParts.push(element.querySelector('.setting-label, .setting-nested-label, .form-check-label')?.textContent || '');
  textParts.push(element.querySelector('.setting-description')?.textContent || '');
  textParts.push(element.id || '');

  element.querySelectorAll('button, a, select, textarea, input').forEach((control) => {
    textParts.push(control.id || '');
    textParts.push(control.getAttribute('aria-label') || '');
    textParts.push(control.getAttribute('placeholder') || '');

    if (!['password', 'hidden'].includes(control.type)) {
      textParts.push(control.textContent || '');
    }
  });

  return textParts.join(' ');
}

function isSearchCandidateHiddenByState(element) {
  let current = element;

  while (current && current !== document.body) {
    if (current.hidden) {
      if (current.classList.contains('config-page') || current.id === 'div-more-engines') {
        current = current.parentElement;
        continue;
      }

      return true;
    }

    current = current.parentElement;
  }

  return false;
}

function getSettingsSearchCandidates() {
  return Array.from(document.querySelectorAll('main .setting-item, main .setting-nested-row, #div-channel-list > .row'))
    .filter((element) => !isSearchCandidateHiddenByState(element))
    .map((element) => {
      const page = element.closest('.config-page');
      const section = element.closest('.settings-section');
      const tab = page ? document.querySelector(`.tab-item[data-target="${page.id}"]`) : null;
      const details = element.closest('details');
      const detailsSummary = details?.querySelector('summary')?.textContent?.trim();
      const label = element.querySelector('.setting-label, .setting-nested-label, .form-check-label')?.textContent?.trim()
        || section?.querySelector('.settings-section-header')?.textContent?.trim()
        || tab?.textContent?.trim()
        || '';
      const description = element.querySelector('.setting-description')?.textContent?.trim() || '';
      const location = [tab?.textContent?.trim(), section?.querySelector('.settings-section-header')?.textContent?.trim(), detailsSummary]
        .filter(Boolean)
        .join(' / ');

      return {
        element,
        pageId: page?.id || '',
        label,
        description,
        location,
        searchText: normalizeSearchText(getElementSearchText(element)),
      };
    })
    .filter((candidate) => candidate.pageId && candidate.searchText);
}

function refreshSettingsSearchResults() {
  const input = document.getElementById('input-settings-search');
  const clearButton = document.getElementById('button-settings-search-clear');
  const status = document.getElementById('settings-search-status');
  const results = document.getElementById('settings-search-results');

  if (!input || !clearButton || !status || !results) {
    return;
  }

  const query = normalizeSearchText(input.value);
  clearButton.hidden = !query;
  results.replaceChildren();
  results.hidden = !query;
  settingsSearchState.lastMatches = [];

  document.querySelectorAll('.tab-item').forEach((tab) => {
    tab.classList.remove('has-search-results');
    tab.removeAttribute('data-search-count');
  });

  if (!query) {
    status.textContent = getUiText('settingsSearchHelp');
    return;
  }

  const matches = getSettingsSearchCandidates().filter((candidate) => candidate.searchText.includes(query));
  settingsSearchState.lastMatches = matches;
  const shownMatches = matches.slice(0, 10);

  if (matches.length === 0) {
    status.textContent = getUiText('settingsSearchEmpty');
    const empty = document.createElement('div');
    empty.className = 'settings-search-empty';
    empty.textContent = getUiText('settingsSearchEmpty');
    results.append(empty);
    return;
  }

  status.textContent = matches.length > shownMatches.length
    ? getUiText('settingsSearchCapped', { shown: String(shownMatches.length), count: String(matches.length) })
    : getUiText('settingsSearchCount', { count: String(matches.length) });

  const countsByPage = matches.reduce((accumulator, match) => {
    accumulator[match.pageId] = (accumulator[match.pageId] || 0) + 1;
    return accumulator;
  }, {});

  Object.entries(countsByPage).forEach(([pageId, count]) => {
    const tab = document.querySelector(`.tab-item[data-target="${pageId}"]`);
    if (tab) {
      tab.classList.add('has-search-results');
      tab.setAttribute('data-search-count', String(count));
    }
  });

  shownMatches.forEach((match, index) => {
    const result = document.createElement('button');
    result.type = 'button';
    result.className = 'settings-search-result';
    result.dataset.resultIndex = String(index);

    const title = document.createElement('div');
    title.className = 'settings-search-result-title';

    const titleText = document.createElement('span');
    titleText.textContent = match.label;

    const location = document.createElement('span');
    location.className = 'settings-search-result-location';
    location.textContent = match.location;

    title.append(titleText, location);
    result.append(title);

    if (match.description) {
      const description = document.createElement('div');
      description.className = 'settings-search-result-description';
      description.textContent = match.description;
      result.append(description);
    }

    results.append(result);
  });
}

function clearSettingsSearch(options = {}) {
  const { focusInput = false } = options;
  const input = document.getElementById('input-settings-search');
  if (!input) {
    return;
  }

  input.value = '';
  refreshSettingsSearchResults();

  if (focusInput) {
    input.focus();
  }
}

function activateSettingsSearchResult(index) {
  const match = settingsSearchState.lastMatches[index];
  if (!match) {
    return;
  }

  switchTab(match.pageId);

  if (match.element.closest('#div-more-engines')) {
    toggleMoreEngines(true);
  }

  const details = match.element.closest('details');
  if (details) {
    details.open = true;
  }

  const results = document.getElementById('settings-search-results');
  if (results) {
    results.hidden = true;
  }

  window.clearTimeout(settingsSearchState.highlightTimer);

  requestAnimationFrame(() => {
    match.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    match.element.classList.add('setting-search-focused');

    const focusTarget = match.element.querySelector('select, input:not([type="hidden"]), textarea, button, a[href]');
    if (focusTarget) {
      focusTarget.focus({ preventScroll: true });
    }

    settingsSearchState.highlightTimer = window.setTimeout(() => {
      match.element.classList.remove('setting-search-focused');
    }, 1500);
  });
}

function toggleMoreEngines(forceExpanded) {
  const header = document.getElementById('toggle-more-engines');
  const content = document.getElementById('div-more-engines');
  if (!header || !content) {
    return;
  }

  const expanded = typeof forceExpanded === 'boolean' ? forceExpanded : content.hidden;
  content.hidden = !expanded;
  header.classList.toggle('expanded', expanded);
  header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function updateGoogleVisionTypeVisibility() {
  const googleVisionType = document.getElementById('select-google-vision-type')?.value;
  const divs = document.getElementsByClassName('div-google-vision-type');

  for (let index = 0; index < divs.length; index++) {
    divs[index].hidden = true;
  }

  if (googleVisionType) {
    const target = document.getElementById(`div-${googleVisionType}`);
    if (target) {
      target.hidden = false;
    }
  }
}

function updateTtsEngineSections(options = {}) {
  const { scrollIntoView = false } = options;
  const selectedEngine = document.getElementById('select-tts-engine')?.value || 'elevenlabs';
  let activeSection = null;

  document.querySelectorAll('.tts-engine-config').forEach((section) => {
    const isVisible = section.dataset.engine === selectedEngine;
    section.hidden = !isVisible;
    section.setAttribute('aria-hidden', isVisible ? 'false' : 'true');

    if (isVisible) {
      activeSection = section;
    }
  });

  if (scrollIntoView && activeSection) {
    requestAnimationFrame(() => {
      activeSection.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }
}

// AI 类引擎（需要密钥 + AI 参数），其余为传统免费引擎
const AI_ENGINES = ['Gemini', 'GPT', 'Kimi', 'OpenRouter', 'NVIDIA', 'LLM-API'];

// 评测站：NVIDIA 模型推荐（性价比 top3 + 质量 top3，实测排名）
const BENCHMARK_RECOMMEND_URL = 'https://ff14-nvidia-benchmark.pages.dev/api/recommendations';
// 内置兜底选项（评测站不可达时保留）
const NVIDIA_FALLBACK_OPTIONS = [
  { value: 'deepseek-ai/deepseek-v4-pro', label: 'DeepSeek V4 Pro — 翻译质量最高 (实测推荐)' },
  { value: 'abacusai/dracarys-llama-3.1-70b-instruct', label: 'Dracarys Llama 3.1 70B — 质量与速度均衡' },
  { value: 'qwen/qwen3-next-80b-a3b-instruct', label: 'Qwen 3 Next 80B — 中文自然，游戏术语准确' },
  { value: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B — 速度最快 ~400ms' },
];

function shortModelName(modelId = '') {
  return String(modelId).split('/').pop() || modelId;
}

function appendModelOptgroup(select, label, models, formatLabel) {
  if (!Array.isArray(models) || models.length === 0) return;
  const optgroup = document.createElement('optgroup');
  optgroup.label = label;
  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.modelId;
    option.textContent = formatLabel(model);
    optgroup.appendChild(option);
  }
  select.appendChild(optgroup);
}

// 从评测站拉取 NVIDIA 推荐，重建下拉（保留用户当前选择；失败则回退内置项）
async function loadNvidiaRecommendations() {
  const select = document.getElementById('input-nvidia-model');
  const status = document.getElementById('nvidia-recommend-status');
  const button = document.getElementById('btn-refresh-nvidia-recommend');
  if (!select) return;

  const currentValue = select.value;
  if (button) button.disabled = true;
  if (status) { status.hidden = false; status.innerText = getUiText('comparing') || '加载中…'; }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${BENCHMARK_RECOMMEND_URL}?latencyCap=3000`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await resp.json();

    const topValue = Array.isArray(data?.topValue) ? data.topValue : [];
    const topQuality = Array.isArray(data?.topQuality) ? data.topQuality : [];

    if (topValue.length === 0 && topQuality.length === 0) {
      if (status) status.innerText = '评测站暂无推荐数据，已显示内置模型';
      return;
    }

    // 质量组去掉已在性价比组里的，避免重复
    const valueIds = new Set(topValue.map((m) => m.modelId));
    const qualityOnly = topQuality.filter((m) => !valueIds.has(m.modelId));

    select.innerHTML = '';
    appendModelOptgroup(select, '⚡ 实时推荐 (≤1s，快)', topValue, (m) =>
      `${shortModelName(m.modelId)} — 综合 ${m.overallAverage} · ${Math.round(m.averageLatencyMs)}ms`);
    appendModelOptgroup(select, '🎯 质量推荐 (慢，看剧情)', qualityOnly, (m) =>
      `${shortModelName(m.modelId)} — 准确 ${m.accuracyAverage} · ${Math.round(m.averageLatencyMs)}ms`);
    appendModelOptgroup(select, '内置备选', NVIDIA_FALLBACK_OPTIONS.filter(
      (o) => !valueIds.has(o.value) && !topQuality.some((m) => m.modelId === o.value)
    ), (o) => o.label);

    // 保留用户之前的选择；没有则默认 #1 性价比
    const allValues = Array.from(select.options).map((o) => o.value);
    if (currentValue && allValues.includes(currentValue)) {
      select.value = currentValue;
    } else if (topValue[0]) {
      select.value = topValue[0].modelId;
    }

    const testedAt = topValue[0]?.testedAt || topQuality[0]?.testedAt || '';
    const testedDate = testedAt ? testedAt.slice(0, 10) : '';
    if (status) status.innerText = testedDate ? `推荐基于 ${testedDate} 的实测排名` : '已更新推荐';
  } catch (error) {
    if (status) status.innerText = '评测站不可达，已显示内置模型';
    console.warn('[Config] Failed to load NVIDIA recommendations:', error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

// OpenRouter 推荐（≤$6/M、纯文本、最新优先）→ 填进 datalist 供自动补全（不限制手填）
async function loadOpenRouterRecommendations() {
  const datalist = document.getElementById('openrouter-model-suggestions');
  const status = document.getElementById('openrouter-recommend-status');
  const button = document.getElementById('btn-refresh-openrouter-recommend');
  if (!datalist) return;

  if (button) button.disabled = true;
  if (status) { status.hidden = false; status.innerText = getUiText('comparing') || '加载中…'; }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${BENCHMARK_RECOMMEND_URL}?provider=openrouter&latencyCap=3000`, { signal: controller.signal });
    clearTimeout(timer);
    const data = await resp.json();

    const topValue = Array.isArray(data?.topValue) ? data.topValue : [];
    const topQuality = Array.isArray(data?.topQuality) ? data.topQuality : [];
    const merged = [];
    const seen = new Set();
    for (const model of [...topValue, ...topQuality]) {
      if (model?.modelId && !seen.has(model.modelId)) {
        seen.add(model.modelId);
        merged.push(model);
      }
    }

    if (merged.length === 0) {
      if (status) status.innerText = '评测站暂无 OpenRouter 推荐（等每月评测跑出数据）';
      return;
    }

    datalist.innerHTML = '';
    for (const model of merged) {
      const option = document.createElement('option');
      option.value = model.modelId;
      option.label = `综合 ${model.overallAverage} · 准确 ${model.accuracyAverage} · ${Math.round(model.averageLatencyMs)}ms`;
      datalist.appendChild(option);
    }

    const testedAt = merged[0]?.testedAt || '';
    const testedDate = testedAt ? testedAt.slice(0, 10) : '';
    if (status) status.innerText = testedDate
      ? `${merged.length} 个推荐（基于 ${testedDate} 实测），点输入框查看`
      : `${merged.length} 个推荐，点输入框查看`;
  } catch (error) {
    if (status) status.innerText = '评测站不可达，可手动填写模型名';
    console.warn('[Config] Failed to load OpenRouter recommendations:', error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

// 根据所选主/备翻译引擎，只显示相关引擎的配置（镜像 updateTtsEngineSections）
function updateTranslationEngineSections(options = {}) {
  const { scrollIntoView = false } = options;
  const primaryEngine = document.getElementById('select-engine')?.value || '';
  const alternateEngine = document.getElementById('select-engine-alternate')?.value || '';
  // 主引擎和备用引擎的配置都要能填（备用引擎也可能是需要密钥的 AI 引擎）
  const activeEngines = [primaryEngine, alternateEngine].filter(Boolean);
  const hasAiEngine = activeEngines.some((engine) => AI_ENGINES.includes(engine));
  let firstShownSection = null;
  let shownConfigCount = 0;

  document.querySelectorAll('#translation-engine-configs .engine-config').forEach((section) => {
    const isVisible = activeEngines.includes(section.dataset.engine);
    section.hidden = !isVisible;
    if (isVisible) {
      shownConfigCount += 1;
      if (!firstShownSection) {
        firstShownSection = section;
      }
    }
  });

  const aiParams = document.querySelector('#translation-engine-configs .engine-config-ai');
  if (aiParams) {
    aiParams.hidden = !hasAiEngine;
  }

  const noConfig = document.querySelector('#translation-engine-configs .engine-config-none');
  if (noConfig) {
    // 选了引擎、但没有任何需要填写的配置块（纯传统引擎）→ 提示无需配置
    noConfig.hidden = !(activeEngines.length > 0 && shownConfigCount === 0 && !hasAiEngine);
  }

  if (scrollIntoView && firstShownSection) {
    requestAnimationFrame(() => {
      firstShownSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

// 各语音引擎（对比测速用）
const TTS_ENGINES = ['elevenlabs', 'speechify', 'mimo', 'fish'];
const TTS_ENGINE_LABELS = {
  elevenlabs: 'ElevenLabs',
  speechify: 'Speechify',
  mimo: 'MiMo TTS',
  fish: 'Fish Audio',
};

function escapeHtml(text = '') {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function createCompareRow(engineLabel) {
  const row = document.createElement('div');
  row.className = 'compare-row';
  row.innerHTML = `
    <span class="compare-row__engine">${escapeHtml(engineLabel)}</span>
    <span class="compare-row__status">${getUiText('comparing') || '测试中…'}</span>`;
  return row;
}

// 完成后按延迟排序、标记最快
function finalizeCompareRows(container) {
  const rows = Array.from(container.querySelectorAll('.compare-row'));
  rows
    .filter((r) => Number.isFinite(Number(r.dataset.latency)))
    .sort((a, b) => Number(a.dataset.latency) - Number(b.dataset.latency))
    .forEach((r, index) => {
      container.appendChild(r); // 重新排序
      r.classList.toggle('compare-row--best', index === 0);
      const badge = r.querySelector('.compare-row__badge');
      if (badge) badge.remove();
      if (index === 0) {
        const b = document.createElement('span');
        b.className = 'compare-row__badge';
        b.textContent = getUiText('fastest') || '最快';
        r.querySelector('.compare-row__latency')?.after(b);
      }
    });
  // 失败/未配置的行排到最后
  rows.filter((r) => !Number.isFinite(Number(r.dataset.latency))).forEach((r) => container.appendChild(r));
}

async function runAiComparison() {
  const button = document.getElementById('btn-compare-ai');
  const container = document.getElementById('compare-ai-results');
  if (!button || !container) return;

  const sampleText = document.getElementById('input-compare-ai-text')?.value.trim() || '';
  button.disabled = true;
  const originalLabel = button.innerText;
  button.innerText = getUiText('comparing') || '测试中…';
  container.hidden = false;
  container.innerHTML = '';

  for (const engine of AI_ENGINES) {
    const row = createCompareRow(engine);
    container.appendChild(row);
    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.TEST_AI_TRANSLATION, engine, sampleText);
      if (result?.success) {
        row.dataset.latency = String(result.durationMs);
        row.innerHTML = `
          <span class="compare-row__engine">${escapeHtml(engine)}</span>
          <span class="compare-row__latency">${result.durationMs} ms</span>
          <span class="compare-row__text">${escapeHtml(result.result)}</span>`;
      } else {
        row.classList.add('compare-row--error');
        row.innerHTML = `
          <span class="compare-row__engine">${escapeHtml(engine)}</span>
          <span class="compare-row__status">${escapeHtml(result?.message || '失败')}</span>`;
      }
    } catch (error) {
      row.classList.add('compare-row--error');
      row.innerHTML = `
        <span class="compare-row__engine">${escapeHtml(engine)}</span>
        <span class="compare-row__status">${escapeHtml(error.message || String(error))}</span>`;
    }
  }

  finalizeCompareRows(container);
  button.disabled = false;
  button.innerText = originalLabel;
}

async function runTtsComparison() {
  const button = document.getElementById('btn-compare-tts');
  const container = document.getElementById('compare-tts-results');
  if (!button || !container) return;

  button.disabled = true;
  const originalLabel = button.innerText;
  button.innerText = getUiText('comparing') || '测试中…';
  container.hidden = false;
  container.innerHTML = '';

  for (const engine of TTS_ENGINES) {
    const label = TTS_ENGINE_LABELS[engine] || engine;
    const row = createCompareRow(label);
    container.appendChild(row);
    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.BENCHMARK_TTS, engine, '');
      if (result?.success) {
        row.dataset.latency = String(result.durationMs);
        row.innerHTML = `
          <span class="compare-row__engine">${escapeHtml(label)}</span>
          <span class="compare-row__latency">${result.durationMs} ms</span>
          <span class="compare-row__text"></span>`;
        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = 'btn btn-secondary btn-sm';
        playBtn.textContent = getUiText('preview') || '试听';
        playBtn.onclick = () => { try { new Audio(result.audioUrl).play(); } catch { /* ignore */ } };
        row.querySelector('.compare-row__text').appendChild(playBtn);
      } else {
        row.classList.add('compare-row--error');
        row.innerHTML = `
          <span class="compare-row__engine">${escapeHtml(label)}</span>
          <span class="compare-row__status">${escapeHtml(result?.message || '未配置或失败')}</span>`;
      }
    } catch (error) {
      row.classList.add('compare-row--error');
      row.innerHTML = `
        <span class="compare-row__engine">${escapeHtml(label)}</span>
        <span class="compare-row__status">${escapeHtml(error.message || String(error))}</span>`;
    }
  }

  finalizeCompareRows(container);
  button.disabled = false;
  button.innerText = originalLabel;
}

function setDirtyState(nextValue) {
  isDirty = Boolean(nextValue);
  const saveButton = document.getElementById('button-save-config');
  if (!saveButton) {
    return;
  }

  saveButton.classList.toggle('btn-save--dirty', isDirty);
  saveButton.title = isDirty ? getUiText('unsavedChanges') : '';
}

function bindDirtyTracking() {
  const main = document.querySelector('main');
  if (!main) {
    return;
  }

  ['input', 'change'].forEach((eventName) => {
    main.addEventListener(eventName, (event) => {
      if (suppressDirtyTracking) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches('input, select, textarea')) {
        return;
      }

      setDirtyState(true);
      updateMoreEnginesConfiguredCount();
    });
  });
}

function updateMoreEnginesConfiguredCount() {
  const countElement = document.getElementById('text-more-engines-count');
  if (!countElement) {
    return;
  }

  const configuredCount = [
    document.getElementById('input-gpt-api-key')?.value.trim(),
    document.getElementById('input-kimi-token')?.value.trim(),
    document.getElementById('input-llm-api-key')?.value.trim() || document.getElementById('input-llm-api-url')?.value.trim(),
    document.getElementById('input-nvidia-api-key')?.value.trim(),
    document.getElementById('input-google-vision-api-key')?.value.trim(),
  ].filter(Boolean).length;

  countElement.innerText = getUiText('moreEnginesConfigured', { count: String(configuredCount) });
}

function controlHasAccessibleName(control) {
  const ariaLabel = control.getAttribute('aria-label')?.trim();
  const ariaLabelledBy = control.getAttribute('aria-labelledby')?.trim();

  return Boolean(
    ariaLabel
    || ariaLabelledBy
    || (control.labels && control.labels.length > 0)
  );
}

function resolveSettingsControlLabel(control) {
  const directLabelMap = {
    'textarea-ai-custom-translation-prompt': 'section-ai-params',
  };
  const directLabelId = directLabelMap[control.id];

  if (directLabelId) {
    const directLabel = document.getElementById(directLabelId);
    if (directLabel) {
      return directLabel;
    }
  }

  const settingLabel = control
    .closest('.setting-item')
    ?.querySelector('.setting-info .setting-label');

  if (settingLabel) {
    return settingLabel;
  }

  const nestedLabel = control
    .closest('.setting-nested-row')
    ?.querySelector('.setting-nested-label');

  if (nestedLabel) {
    return nestedLabel;
  }

  return control
    .closest('#div-channel-list .row')
    ?.querySelector('.form-check-label');
}

function ensureLabelId(label, control) {
  if (label.id) {
    return label.id;
  }

  if (!control.id) {
    return '';
  }

  const generatedId = `a11y-label-for-${control.id}`;
  const existingElement = document.getElementById(generatedId);
  if (existingElement && existingElement !== label) {
    return '';
  }

  label.id = generatedId;
  return generatedId;
}

function hydrateSettingsControlLabels() {
  document.querySelectorAll('main input, main select, main textarea').forEach((control) => {
    if (!(control instanceof HTMLElement) || control.type === 'hidden' || controlHasAccessibleName(control)) {
      return;
    }

    const label = resolveSettingsControlLabel(control);
    if (!label) {
      return;
    }

    const labelId = ensureLabelId(label, control);
    if (labelId) {
      control.setAttribute('aria-labelledby', labelId);
    }
  });
}

function preventHashActionLinkNavigation() {
  document.querySelectorAll('a[href="#"]').forEach((link) => {
    if (link.dataset.preventHashNavigation === 'true') {
      return;
    }

    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
    link.dataset.preventHashNavigation = 'true';
  });
}

function hydrateInteractiveAccessibility() {
  preventHashActionLinkNavigation();

  document.querySelectorAll('.btn-visibility').forEach((button) => {
    const inputId = button.id.replace('btn-visibility', 'input');
    const relatedInput = document.getElementById(inputId);
    const labelText = relatedInput
      ?.closest('.setting-control')
      ?.previousElementSibling
      ?.querySelector('.setting-label')
      ?.innerText;

    button.setAttribute('aria-label', `${getUiText('toggleVisibility')}${labelText ? `: ${labelText}` : ''}`);
    if (!button.hasAttribute('aria-pressed')) {
      button.setAttribute('aria-pressed', relatedInput?.type === 'text' ? 'true' : 'false');
    }
  });

  document.querySelectorAll('.form-check-input[role="switch"]').forEach((control) => {
    const label = control.closest('.setting-control')?.previousElementSibling?.querySelector('.setting-label');
    if (label?.id) {
      control.setAttribute('aria-labelledby', label.id);
    }
  });

  hydrateSettingsControlLabels();

  document.querySelectorAll('.setting-item-link[data-click-target]').forEach((item) => {
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
  });
}

function inferAlertType(message = '') {
  if (message.includes('❌') || message.includes('失败') || message.includes('錯誤') || message.includes('错误')) {
    return 'error';
  }

  if (message.includes('✅') || message.includes('成功')) {
    return 'success';
  }

  if (message.includes('⚠️') || message.includes('提醒') || message.includes('注意')) {
    return 'warning';
  }

  return 'info';
}

function showToast(message = '', type = 'info', options = {}) {
  const region = document.getElementById('settings-toast-region');
  if (!region) {
    return;
  }

  const duration = options.duration ?? (type === 'error' ? 5200 : 3200);
  const title = options.title || getUiText(
    type === 'success'
      ? 'toastSuccessTitle'
      : type === 'error'
        ? 'toastErrorTitle'
        : type === 'warning'
          ? 'toastWarningTitle'
          : 'toastInfoTitle',
  );

  const toast = document.createElement('div');
  toast.className = `settings-toast settings-toast--${type}`;
  const header = document.createElement('div');
  header.className = 'settings-toast-header';
  const titleElement = document.createElement('div');
  titleElement.className = 'settings-toast-title';
  titleElement.textContent = title;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'settings-toast-close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.textContent = '×';
  const messageElement = document.createElement('p');
  messageElement.className = 'settings-toast-message';
  messageElement.innerText = String(message);

  header.appendChild(titleElement);
  header.appendChild(closeButton);
  toast.appendChild(header);
  toast.appendChild(messageElement);

  let timeoutId = null;
  const removeToast = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    toast.remove();
  };
  closeButton.addEventListener('click', removeToast);

  region.appendChild(toast);
  while (region.children.length > 4) {
    region.firstElementChild?.remove();
  }

  if (duration > 0) {
    timeoutId = setTimeout(removeToast, duration);
  }
}

window.alert = function(message = '') {
  showToast(message, inferAlertType(String(message)));
};

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
    updateGoogleVisionTypeVisibility();
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

  document.getElementById('select-tts-engine').addEventListener('change', () => {
    updateTtsEngineSections({ scrollIntoView: true });
    updateElevenLabsActionAvailability();
  });

  document.getElementById('select-engine').addEventListener('change', () => {
    updateTranslationEngineSections({ scrollIntoView: true });
  });

  document.getElementById('select-engine-alternate').addEventListener('change', () => {
    updateTranslationEngineSections();
  });

  const btnRefreshNvidia = document.getElementById('btn-refresh-nvidia-recommend');
  if (btnRefreshNvidia) {
    btnRefreshNvidia.addEventListener('click', loadNvidiaRecommendations);
  }

  const btnRefreshOpenRouter = document.getElementById('btn-refresh-openrouter-recommend');
  if (btnRefreshOpenRouter) {
    btnRefreshOpenRouter.addEventListener('click', loadOpenRouterRecommendations);
  }

  const btnCompareAi = document.getElementById('btn-compare-ai');
  if (btnCompareAi) {
    btnCompareAi.addEventListener('click', runAiComparison);
  }
  const btnCompareTts = document.getElementById('btn-compare-tts');
  if (btnCompareTts) {
    btnCompareTts.addEventListener('click', runTtsComparison);
  }

}

// set button
function setButton() {
  // close
  document.getElementById('img-button-close').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW);
  };

  // 标签导航栏点击事件
  document.querySelectorAll('.tab-item').forEach((tab) => {
    tab.onclick = () => {
      switchTab(tab.getAttribute('data-target'), { focusTab: true });
    };
    tab.onkeydown = (event) => {
      const tabs = Array.from(document.querySelectorAll('.tab-item'));
      const currentIndex = tabs.indexOf(tab);
      let nextIndex;

      switch (event.key) {
        case 'ArrowRight':
          nextIndex = (currentIndex + 1) % tabs.length;
          break;
        case 'ArrowLeft':
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      switchTab(tabs[nextIndex].getAttribute('data-target'), { focusTab: true });
    };
  });

  const moreEnginesToggle = document.getElementById('toggle-more-engines');
  if (moreEnginesToggle) {
    moreEnginesToggle.onclick = () => {
      toggleMoreEngines();
    };
  }

  // download json
  document.getElementById('button-download-json').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.DOWNLOAD_JSON);
  };

  // restart sharlayan reader
  document.getElementById('button-restart-sharlayan-reader').onclick = () => {
    ipcRenderer.send(IPC_CHANNELS.RESTART_SHARLAYAN_READER);
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
    showToast(getUiText('compactSizeApplied'), 'success');
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
    link.innerText = getUiText('testing');

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
  const visibilityButtons = document.getElementsByClassName('btn-visibility');
  for (let index = 0; index < visibilityButtons.length; index++) {
    const element = visibilityButtons[index];
    element.onclick = () => {
      const inputId = element.id.replace('btn-visibility', 'input');
      const input = document.getElementById(inputId);
      if (!input) {
        return;
      }

      const isVisible = input.type !== 'text';
      const icon = element.querySelector('.btn-visibility-icon');
      input.setAttribute('type', isVisible ? 'text' : 'password');
      element.setAttribute('aria-pressed', isVisible ? 'true' : 'false');
      icon?.setAttribute(
        'src',
        isVisible
          ? './img/ui/visibility_white_48dp.svg'
          : './img/ui/visibility_off_white_48dp.svg',
      );
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
    button.innerText = getUiText('testing');

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
    button.innerText = getUiText('testing');

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
        alert(`✅ 测试成功！\n\n模型: ${meta.model || 'mimo-v2.5-tts'}\n音色: ${meta.voice || 'mimo_default'}\n格式: ${meta.responseFormat || 'wav'}\n\n本次测试使用当前表单值，若需正式保存请点击"保存设置"。`);
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
      button.innerText = `🎧 ${getUiText('generating')}`;

      const previewText = 'Welcome to Final Fantasy XIV! This is a MiMo TTS preview. I hope you enjoy this voice!';
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_MIMO_VOICE, {
        text: previewText,
        config: previewConfig
      });

      if (result.success && result.data?.audioUrl) {
        const audio = new Audio(result.data.audioUrl);
        playbackStarted = true;
        button.innerText = `🎧 ${getUiText('playing')}`;
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

  // Fish Audio: Test configuration
  document.getElementById('btn-test-fish').onclick = async () => {
    const button = document.getElementById('btn-test-fish');
    const originalText = button.innerText;

    button.disabled = true;
    button.innerText = getUiText('testing');

    try {
      const fishConfig = collectFishFormConfig();
      const validationMessage = validateFishFormConfig(fishConfig);
      if (validationMessage) {
        alert(`❌ 配置无效\n\n${validationMessage}`);
        return;
      }

      const result = await ipcRenderer.invoke(IPC_CHANNELS.TEST_FISH_CONFIG, fishConfig);
      if (result.success && result.data) {
        const meta = result.data.meta || {};
        alert(`✅ 测试成功！\n\n模型: ${meta.model || 's2.1-pro-free'}\n克隆语音: ${meta.referenceId || '默认'}\n格式: ${meta.responseFormat || 'mp3'}\n\n本次测试使用当前表单值，若需正式保存请点击"保存设置"。`);
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

  // Fish Audio: Preview voice
  document.getElementById('btn-preview-fish-voice').onclick = async () => {
    const button = document.getElementById('btn-preview-fish-voice');
    const originalText = button.innerText;
    let playbackStarted = false;

    try {
      const previewConfig = collectFishFormConfig();
      const validationMessage = validateFishFormConfig(previewConfig);
      if (validationMessage) {
        alert(`❌ 配置无效\n\n${validationMessage}`);
        return;
      }

      button.disabled = true;
      button.innerText = `🎧 ${getUiText('generating')}`;

      const previewText = 'Welcome to Final Fantasy XIV! This is a Fish Audio preview. I hope you enjoy this voice!';
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_FISH_VOICE, {
        text: previewText,
        config: previewConfig
      });

      if (result.success && result.data?.audioUrl) {
        const audio = new Audio(result.data.audioUrl);
        playbackStarted = true;
        button.innerText = `🎧 ${getUiText('playing')}`;
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

  // Fish Audio: Voice select change handler
  document.getElementById('select-fish-voice-option').onchange = () => {
    syncFishVoiceFromSelect();
  };

  document.getElementById('input-fish-voice-custom').oninput = () => {
    document.getElementById('input-fish-voice').value = document.getElementById('input-fish-voice-custom').value.trim();
  };

  // Fish Audio: Refresh voices
  document.getElementById('btn-refresh-fish-voices').onclick = async () => {
    await loadFishVoices();
  };

  // ElevenLabs: Begin browser pairing
  document.getElementById('btn-elevenlabs-begin-pairing').onclick = async () => {
    const button = document.getElementById('btn-elevenlabs-begin-pairing');
    const originalText = button.innerText;

    button.disabled = true;
    button.innerText = getUiText('opening');

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
    button.innerText = getUiText('checking');

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
    button.innerText = getUiText('opening');

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
    button.innerText = getUiText('importing');

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
    button.innerText = getUiText('testing');

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
      button.innerText = `🎧 ${getUiText('generating')}`;

      const previewText = `Welcome to Final Fantasy XIV! This is ${voiceDescriptions[selectedVoice] || selectedVoice}. I hope you enjoy this voice!`;
      const result = await ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_SPEECHIFY_VOICE, {
        text: previewText,
        config: previewConfig
      });

      if (result.success && result.data?.audioUrl) {
        const audio = new Audio(result.data.audioUrl);
        playbackStarted = true;
        button.innerText = `🎧 ${getUiText('playing')}`;
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
    button.innerText = getUiText('validating');

    try {
      const result = await ipcRenderer.invoke(IPC_CHANNELS.VALIDATE_REFRESH_TOKEN, { refreshToken });
      if (result.success) {
        await refreshElevenLabsAuthStatus({ loadVoices: true });
        alert(`✅ Refresh Token 验证成功！\n\nBearer Token 已自动获取。\n过期时间: ${result.data?.bearerTokenExpiresAt || '未知'}\n\n现在可以继续试听，确认无误后再点击“保存设置”。`);
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

  // ElevenLabs: Preview default / per-gender voices
  bindElevenLabsPreviewButtons();

  updateElevenLabsActionAvailability();

  document.querySelectorAll('.setting-item-link[data-click-target]').forEach((item) => {
    const triggerTarget = () => {
      const target = document.getElementById(item.dataset.clickTarget);
      if (target) {
        target.click();
      }
    };

    item.addEventListener('click', (event) => {
      if (event.target.closest('a, button')) {
        return;
      }

      triggerTarget();
    });

    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        triggerTarget();
      }
    });
  });
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

function collectFishFormConfig() {
  return {
    apiKey: document.getElementById('input-fish-api-key').value.trim(),
    model: document.getElementById('select-fish-model').value,
    referenceId: document.getElementById('input-fish-voice').value.trim(),
    responseFormat: document.getElementById('select-fish-response-format').value,
  };
}

function validateFishFormConfig(config = {}) {
  if (!config.apiKey) {
    return '请先填写 Fish Audio API Key';
  }

  if (!['s2.1-pro-free', 's2.1-pro'].includes(config.model)) {
    return 'Fish Audio 模型无效';
  }

  if (!['mp3', 'wav', 'opus'].includes(config.responseFormat)) {
    return 'Fish Audio 音频格式无效';
  }

  return '';
}

function collectMiMoFormConfig() {
  return {
    apiKey: document.getElementById('input-mimo-api-key').value.trim(),
    model: document.getElementById('select-mimo-model').value,
    voice: document.getElementById('input-mimo-voice').value.trim(),
    responseFormat: document.getElementById('select-mimo-response-format').value,
    styleInstructions: document.getElementById('input-mimo-style').value.trim(),
  };
}

function validateMiMoFormConfig(config = {}) {
  if (!config.apiKey) {
    return '请先填写 MiMo API Key';
  }

  if (!config.voice) {
    return '请先填写 MiMo 音色 (Voice)';
  }

  if (!['mimo-v2.5-tts', 'mimo-v2.5-tts-voiceclone'].includes(config.model)) {
    return 'MiMo 模型无效';
  }

  if (!['wav'].includes(config.responseFormat)) {
    return 'MiMo 音频格式无效';
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
    genderVoiceRoutingEnabled: document.getElementById('checkbox-elevenlabs-gender-voice-routing').checked,
    femaleVoiceId: document.getElementById('select-elevenlabs-female-voice-id').value,
    maleVoiceId: document.getElementById('select-elevenlabs-male-voice-id').value,
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

function getElevenLabsPreviewButtons() {
  return ELEVENLABS_PREVIEW_CONTROLS
    .map(({ buttonId }) => document.getElementById(buttonId))
    .filter(Boolean);
}

function setElevenLabsPreviewBusy(isBusy) {
  getElevenLabsPreviewButtons().forEach((previewButton) => {
    previewButton.disabled = Boolean(isBusy);
  });

  if (!isBusy) {
    updateElevenLabsActionAvailability();
  }
}

async function previewElevenLabsVoiceBySelect(control = {}) {
  const button = document.getElementById(control.buttonId);
  const voiceSelect = document.getElementById(control.selectId);
  if (!button || !voiceSelect) {
    return;
  }

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

    setElevenLabsPreviewBusy(true);
    button.innerText = `🎧 ${getUiText('generating')}`;

    const selectedOption = voiceSelect.options[voiceSelect.selectedIndex];
    const voiceName = selectedOption?.text || selectedVoice || control.roleLabel;
    const previewText = `Welcome to Final Fantasy XIV! This is ${voiceName}. I hope you enjoy this voice!`;
    const result = await ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_ELEVENLABS_VOICE, {
      text: previewText,
      config: {
        ...previewConfig,
        voiceId: selectedVoice,
      },
    });

    if (result.success && result.data?.audioUrl) {
      const audio = new Audio(result.data.audioUrl);
      playbackStarted = true;
      button.innerText = `🎧 ${getUiText('playing')}`;
      audio.play();

      audio.onended = () => {
        button.innerText = originalText;
        setElevenLabsPreviewBusy(false);
      };

      audio.onerror = () => {
        alert('❌ 音频播放失败');
        button.innerText = originalText;
        setElevenLabsPreviewBusy(false);
      };
    } else {
      alert(formatTtsErrorAlert(result, '❌ 语音生成失败'));
    }
  } catch (error) {
    alert(`❌ 试听出错\n\n${error.message}`);
  } finally {
    if (!playbackStarted) {
      button.innerText = originalText;
      setElevenLabsPreviewBusy(false);
    }
  }
}

function bindElevenLabsPreviewButtons() {
  ELEVENLABS_PREVIEW_CONTROLS.forEach((control) => {
    const button = document.getElementById(control.buttonId);
    if (button) {
      button.onclick = () => previewElevenLabsVoiceBySelect(control);
    }
  });
}

function updateElevenLabsActionAvailability() {
  const authUsable = Boolean(elevenLabsAuthUiState.authUsable);
  const refreshButton = document.getElementById('btn-refresh-elevenlabs-voices');
  const currentTtsTestButton = document.getElementById('btn-test-current-tts-engine');
  const isElevenLabsSelected = document.getElementById('select-tts-engine').value === 'elevenlabs';
  const unavailableTitle = getUiText('elevenlabsUnavailableTitle');

  getElevenLabsPreviewButtons().forEach((previewButton) => {
    previewButton.disabled = !authUsable;
    previewButton.title = authUsable ? '' : unavailableTitle;
  });

  if (refreshButton) {
    refreshButton.disabled = !authUsable;
    refreshButton.title = authUsable ? '' : unavailableTitle;
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

  let bridgeText = getUiText('elevenlabsBrowserIdle');
  let bridgeTone = 'muted';
  if (pairing.active) {
    bridgeText = getUiText('elevenlabsBrowserConnected');
    bridgeTone = 'success';
  } else if (pairing.state === 'waiting') {
    bridgeText = getUiText('elevenlabsBrowserWaiting');
    bridgeTone = 'warning';
  } else if (pairing.state === 'unpaired') {
    bridgeText = getUiText('elevenlabsBrowserUnpaired');
  }

  let authText = getUiText('elevenlabsAuthNotReady');
  let authTone = 'muted';
  if (authUsable) {
    authText = sessionOnlyAuth ? getUiText('elevenlabsAuthSessionOnly') : getUiText('elevenlabsAuthReady');
    authTone = sessionOnlyAuth ? 'warning' : 'success';
  } else if (resultModel.pending || ['pending', 'validating'].includes(candidate.state)) {
    authText = getUiText('elevenlabsAuthChecking');
    authTone = 'info';
  } else if (candidate.state === 'rejected' || status.auth?.state === 'error') {
    authText = getUiText('elevenlabsAuthAttention');
    authTone = 'danger';
  } else if (pairing.state === 'waiting' || pairing.active) {
    authText = getUiText('elevenlabsAuthWaiting');
    authTone = 'warning';
  }

  let title = getUiText('elevenlabsTitleStart');
  let body = getUiText('elevenlabsBodyStart');
  let meta = '';

  if (resultModel.pending || ['pending', 'validating'].includes(candidate.state)) {
    title = getUiText('elevenlabsTitlePending');
    body = getUiText('elevenlabsBodyPending');
  } else if (authUsable && resultModel.validationMode === 'refresh') {
    title = getUiText('elevenlabsTitleReadyRefresh');
    body = getUiText('elevenlabsBodyReadyRefresh');
  } else if (authUsable && hasRefreshBackedAuth && !pairing.active && pairing.state !== 'waiting') {
    title = getUiText('elevenlabsTitleSavedAuth');
    body = getUiText('elevenlabsBodySavedAuth');
  } else if (sessionOnlyAuth) {
    title = getUiText('elevenlabsTitleSessionOnly');
    body = getUiText('elevenlabsBodySessionOnly');
    meta = status.session?.expiresAt
      ? getUiText('elevenlabsMetaSessionExpires', { value: status.session.expiresAt })
      : getUiText('elevenlabsMetaSessionOnly');

    if (status.auth?.lastAuthSource === 'manual-bearer') {
      body += ` ${getUiText('elevenlabsLegacyBearerNote')}`;
    }
  } else if (authUsable) {
    title = getUiText('elevenlabsTitleBrowserReady');
    body = getUiText('elevenlabsBodyBrowserReady');
  } else if (candidate.state === 'rejected' || status.auth?.state === 'error') {
    title = getUiText('elevenlabsTitleNeedsAttention');
    body = warning?.message || status.auth?.lastErrorMessage || 'The imported login could not be validated yet.';
    meta = warning?.suggestion || '';
  } else if (pairing.state === 'waiting' || pairing.active) {
    title = getUiText('elevenlabsTitleWaiting');
    body = getUiText('elevenlabsBodyWaiting');
  }

  if (!meta && (pairing.state === 'waiting' || pairing.active) && pairing.pairingUrl) {
    meta = getUiText('elevenlabsMetaPairingHint');
  } else if (!meta && status.session?.expiresAt) {
    meta = getUiText('elevenlabsMetaSessionExpires', { value: status.session.expiresAt });
  } else if (!meta && status.auth?.lastAuthSource && status.auth.lastAuthSource !== 'none') {
    meta = getUiText('elevenlabsMetaAuthSource', { value: status.auth.lastAuthSource });
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
      hint.innerText = getUiText('elevenlabsHintPrimary');
    } else if (sessionOnlyAuth) {
      hint.hidden = false;
      hint.innerText = getUiText('elevenlabsHintSessionOnly');

      if (status.auth?.lastAuthSource === 'manual-bearer') {
        hint.innerText += ` ${getUiText('elevenlabsHintLegacy')}`;
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
    case 'fish': return collectFishFormConfig();
    case 'google': return {};
    default: return {};
  }
}

function validateConfigForEngine(engine, config) {
  switch (engine) {
    case 'speechify': return validateSpeechifyFormConfig(config);
    case 'elevenlabs': return validateElevenLabsFormConfig(config);
    case 'mimo': return validateMiMoFormConfig(config);
    case 'fish': return validateFishFormConfig(config);
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
    customRow.hidden = false;
    hiddenInput.value = customInput.value.trim();
  } else {
    customRow.hidden = true;
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
    customRow.hidden = false;
  } else if (found) {
    customRow.hidden = true;
  }
}

// --- Fish Audio voice select/custom sync ---

function syncFishVoiceFromSelect() {
  const select = document.getElementById('select-fish-voice-option');
  const customRow = document.getElementById('fish-custom-voice-row');
  const hiddenInput = document.getElementById('input-fish-voice');
  const customInput = document.getElementById('input-fish-voice-custom');

  if (select.value === '__custom__') {
    customRow.hidden = false;
    hiddenInput.value = customInput.value.trim();
  } else {
    customRow.hidden = true;
    hiddenInput.value = select.value;
  }
}

function syncFishVoiceControlsFromStoredValue(storedVoice = '') {
  const select = document.getElementById('select-fish-voice-option');
  const customRow = document.getElementById('fish-custom-voice-row');
  const customInput = document.getElementById('input-fish-voice-custom');

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
    customRow.hidden = false;
  } else if (found) {
    customRow.hidden = true;
  }
}

// --- Voice list loading ---

let elevenLabsVoiceRequestId = 0;
let mimoVoiceRequestId = 0;
let fishVoiceRequestId = 0;

function getElevenLabsVoiceSelects() {
  return ELEVENLABS_VOICE_SELECT_IDS
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function initializeElevenLabsGenderVoiceSelects() {
  const defaultSelect = document.getElementById('select-elevenlabs-voice-id');
  if (!defaultSelect) return;

  ['select-elevenlabs-female-voice-id', 'select-elevenlabs-male-voice-id'].forEach((selectId) => {
    const select = document.getElementById(selectId);
    if (select && select.options.length === 0) {
      select.innerHTML = defaultSelect.innerHTML;
    }
  });
}

function restoreElevenLabsVoiceSelection(select, currentValue = '') {
  if (!select || !currentValue) return;

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

function rebuildElevenLabsVoiceSelect(select, groups = {}) {
  if (!select) return;

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
}

async function loadElevenLabsVoices() {
  const requestId = ++elevenLabsVoiceRequestId;
  const selects = getElevenLabsVoiceSelects();
  const currentValues = new Map(selects.map((select) => [select.id, select.value]));
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

      selects.forEach((select) => {
        rebuildElevenLabsVoiceSelect(select, groups);
        restoreElevenLabsVoiceSelection(select, currentValues.get(select.id));
      });
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


async function loadFishVoices() {
  const requestId = ++fishVoiceRequestId;
  const select = document.getElementById('select-fish-voice-option');
  const hiddenInput = document.getElementById('input-fish-voice');
  const currentValue = hiddenInput.value;
  const btn = document.getElementById('btn-refresh-fish-voices');
  const originalText = btn.innerText;

  try {
    btn.disabled = true;
    btn.innerText = '...';

    const fishConfig = collectFishFormConfig();
    if (!fishConfig.apiKey) {
      return; // No API key, keep fallback
    }

    const result = await ipcRenderer.invoke(IPC_CHANNELS.GET_TTS_VOICES, {
      engine: 'fish',
      config: fishConfig,
    });

    if (requestId !== fishVoiceRequestId) return; // Stale response

    if (result.success && result.data?.voices?.length > 0) {
      const voices = result.data.voices;

      // Group voices
      const groups = {};
      voices.forEach((v) => {
        const group = v.group || 'My Voices';
        if (!groups[group]) groups[group] = [];
        groups[group].push(v);
      });

      // Rebuild select (keep default + __custom__ sentinels)
      select.innerHTML = '';
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '默认语音';
      select.appendChild(defaultOption);

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

      const customOption = document.createElement('option');
      customOption.value = '__custom__';
      customOption.textContent = '自定义 Reference ID...';
      select.appendChild(customOption);

      // Restore selection
      syncFishVoiceControlsFromStoredValue(currentValue);
    }
  } catch (error) {
    console.warn('[Config] Failed to load Fish Audio voices:', error.message);
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

// read config
async function readConfig() {
  suppressDirtyTracking = true;
  const config = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONFIG);
  const chatCode = await ipcRenderer.invoke(IPC_CHANNELS.GET_CHAT_CODE);
  const version = await ipcRenderer.invoke(IPC_CHANNELS.GET_VERSION);

  // read options
  readOptions(config);

  // Sync MiMo voice controls from stored value
  syncMiMoVoiceControlsFromStoredValue(config?.api?.mimo?.voice || '');

  // Sync Fish Audio voice controls from stored value
  syncFishVoiceControlsFromStoredValue(config?.api?.fish?.referenceId || '');

  await refreshElevenLabsAuthStatus({ loadVoices: true });

  // Async voice loading (non-blocking)
  loadMiMoVoices().catch(() => {});
  loadFishVoices().catch(() => {});
  // 模型推荐（评测站实测排名，非阻塞）
  loadNvidiaRecommendations().catch(() => {});
  loadOpenRouterRecommendations().catch(() => {});

  // channel
  readChannel(config, chatCode);
  hydrateInteractiveAccessibility();
  updateMoreEnginesConfiguredCount();
  updateGoogleVisionTypeVisibility();
  updateTtsEngineSections();
  updateTranslationEngineSections();

  // about
  document.getElementById('span-version').innerText = version;
  suppressDirtyTracking = false;
  setDirtyState(false);
}

// save config
async function saveConfig() {
  suppressDirtyTracking = true;
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
  showToast(getUiText('settingsSaved'), 'success');
  suppressDirtyTracking = false;
  setDirtyState(false);
}

// save default config
async function saveDefaultConfig() {
  suppressDirtyTracking = true;
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
  showToast(getUiText('defaultsRestored'), 'success');
  suppressDirtyTracking = false;
  setDirtyState(false);
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
      ['select-mimo-model', 'value'],
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
      ['input-mimo-style', 'value'],
      ['api', 'mimo', 'styleInstructions'],
    ],

    // Fish Audio TTS
    [
      ['input-fish-api-key', 'value'],
      ['api', 'fish', 'apiKey'],
    ],
    [
      ['select-fish-model', 'value'],
      ['api', 'fish', 'model'],
    ],
    [
      ['input-fish-voice', 'value'],
      ['api', 'fish', 'referenceId'],
    ],
    [
      ['select-fish-response-format', 'value'],
      ['api', 'fish', 'responseFormat'],
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
      ['checkbox-elevenlabs-gender-voice-routing', 'checked'],
      ['api', 'elevenlabs', 'genderVoiceRoutingEnabled'],
    ],
    [
      ['select-elevenlabs-female-voice-id', 'value'],
      ['api', 'elevenlabs', 'femaleVoiceId'],
    ],
    [
      ['select-elevenlabs-male-voice-id', 'value'],
      ['api', 'elevenlabs', 'maleVoiceId'],
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
