'use strict';

// Expose setText globally so config.js can call it directly
window.tataru_setText = function (appLanguage) {
  console.log('🎯 language.js: tataru_setText called with language:', appLanguage);
  setText(appLanguage);
};

// Also keep the event listener as backup
document.addEventListener('change-ui-text', (e) => {
  console.log('🎯 language.js: change-ui-text event received!', e.detail);
  const config = e.detail;
  setText(config.system.appLanguage);
});

// set text
function setText(appLanguage) {
  console.log('🎯 language.js: setText called with language:', appLanguage);
  // get element text list
  const elementTextList = getElementTextList();
  const propertyNames = Object.keys(elementTextList);

  // get text index
  const textIndex = getTextIndex(appLanguage);
  console.log('🎯 language.js: textIndex =', textIndex);

  // set title
  // const title = document.getElementsByTagName('title').item(0);
  // if (title) title.innerText = 'Tataru Assistant';

  // set UI text
  // loop of property names
  for (let index = 0; index < propertyNames.length; index++) {
    const propertyName = propertyNames[index];
    const elementNames = Object.keys(elementTextList[propertyName]);

    // loop of element names
    for (let index = 0; index < elementNames.length; index++) {
      const elementName = elementNames[index];
      const elements = document.getElementsByTagName(elementName);

      // loop of elements
      for (let index = 0; index < elements.length; index++) {
        const element = elements.item(index);

        if (!element) continue;

        let elementId = element.id;

        switch (elementName) {
          case 'label':
            elementId = element.getAttribute('for') || '';
            break;

          case 'option':
            elementId = element.value || '';
            break;

          default:
            break;
        }

        try {
          // set text
          element[propertyName] = elementTextList[propertyName][elementName][elementId][textIndex];
        } catch (error) {
          console.log(error);
        }
      }
    }
  }
}

// get text index
function getTextIndex(appLanguage) {
  let index;

  switch (appLanguage) {
    case 'app-zht':
      index = 0;
      break;

    case 'app-zhs':
      index = 1;
      break;

    default:
      index = 2;
      break;
  }

  return index;
}

// element text list
function getElementTextList() {
  return {
    innerText: {
      a: {
        // config
        'a-set-google-vision': ['說明', '说明', 'Guide'],
        'a-test-gemini-api': ['測試連結', '测试链接', 'Test Connection'],
        'a-test-kimi-api': ['測試連結', '测试链接', 'Test Connection'],
        'a-test-openrouter-api': ['測試連結', '测试链接', 'Test Connection'],
        'a-test-nvidia-api': ['測試連結', '测试链接', 'Test Connection'],
        'a-test-gpt-api': ['測試連結', '测试链接', 'Test Connection'],
        'a-test-llm-api': ['測試連結', '测试链接', 'Test Connection'],

        'a-readme': ['使用說明書', '使用说明书', 'User Guide'],
        'a-open-elevenlabs-token-helper': ['Token 提取工具', 'Token 提取工具', 'Token Helper'],
        'a-open-speechify-guide': ['配置指南', '配置指南', 'Setup Guide'],
        'a-github': ['GitHub', 'GitHub', 'GitHub'],
      },
      button: {
        // config
        'button-save-config': ['儲存', '储存', 'Save'],
        'button-save-default-config': ['預設', '预设', 'Default'],
        
        // 新标签导航栏
        'tab-appearance': ['通用', '通用', 'General'],
        'tab-translation': ['翻譯', '翻译', 'Translation'],
        'tab-speech': ['語音', '语音', 'Speech'],
        'tab-system': ['系統', '系统', 'System'],
        'tab-about': ['關於', '关于', 'About'],
        'summary-advanced-appearance': ['進階外觀', '高级外观', 'Advanced Appearance'],
        'summary-advanced-translation': ['進階設定', '高级设置', 'Advanced'],
        'p-engine-no-config': ['該引擎免費直連，無需填寫 API 密鑰，選好即可使用。', '该引擎免费直连，无需填写 API 密钥，选好即可使用。', 'This engine is free and needs no API key — just select it.'],
        
        // 保存按钮文本
        'btn-save-text': ['儲存設定', '储存设定', 'Save Settings'],

        'button-google-credential': ['開啟Google憑證檔案', '开启Google凭证档案', 'Open Google Credential File'],
        'button-google-credential-view': ['查看檔案', '查看档案', 'View File'],

        'button-download-json': ['重新下載翻譯對照表', '重新下载翻译对照表', 'Download Table'],
        'button-delete-temp': ['清除暫存', '清除暂存', 'Clear Temp Files'],
        'button-restart-sharlayan-reader': ['重新啟動字幕讀取器', '重新启动字幕读取器', 'Restart Chat Reader'],
        'button-fix-reader': ['修復字幕讀取器', '修復字幕读取器', 'Fix Chat Reader'],
        'button-version-check': ['檢查更新', '检查更新', 'Check For Updates'],
        'button-apply-compact-size': ['套用緊湊尺寸', '应用紧凑尺寸', 'Apply Compact Size'],


        // capture
        'button-screenshot': ['All', 'All', 'All'],

        // capture edit
        'button-translate': ['翻譯', '翻译', 'Translate'],

        // custom
        'button-view-files': ['檢視檔案', '检视档案', 'View Files'],
        'button-clear-cache': ['清除快取', '清除快取', 'Clear Cache'],
        'button-search': ['查詢', '查询', 'Search'],
        'button-view-all': ['全部', '全部', 'All'],

        // dictionary
        'button-switch': ['切換', '切换', 'Exchange'],

        // edit
        'button-restart-translate': ['重新翻譯', '重新翻译', 'Translate Again'],
        'button-load-json': ['重新讀取對照表', '重新读取对照表', 'Reload Table'],
        'button-report-translation': ['回報翻譯', '回报翻译', 'Report'],
        'button-remove-dialog': ['刪除本句', '删除本句', 'Delete Sentence'],

        'button-save-custom': ['儲存', '储存', 'Save'],
        'button-delete-custom': ['刪除', '删除', 'Delete'],
        'button-edit-custom': ['編輯', '编辑', 'Edit'],

        // read log
        'button-read-log': ['讀取', '读取', 'Open'],
        'button-view-log': ['檢視檔案', '检视档案', 'View Chat Logs'],
        'btn-test-current-tts-engine': ['測試連線', '测试连接', 'Test'],
        'btn-test-mimo': ['測試', '测试', 'Test'],
        'btn-preview-mimo-voice': ['試聽', '试听', 'Preview'],
        'btn-refresh-mimo-voices': ['刷新', '刷新', 'Refresh'],
        'btn-test-fish': ['測試', '测试', 'Test'],
        'btn-preview-fish-voice': ['試聽', '试听', 'Preview'],
        'btn-refresh-fish-voices': ['刷新', '刷新', 'Refresh'],
        'btn-refresh-elevenlabs-voices': ['刷新', '刷新', 'Refresh'],
        'btn-test-speechify': ['測試', '测试', 'Test'],
        'btn-preview-voice': ['試聽', '试听', 'Preview'],
        'btn-preview-elevenlabs-voice': ['試聽', '试听', 'Preview'],
        'btn-elevenlabs-open-extension-folder': ['開啟擴充套件資料夾', '打开扩展文件夹', 'Open extension folder'],
        'btn-elevenlabs-begin-pairing': ['連接 ElevenReader', '连接 ElevenReader', 'Connect ElevenReader'],
        'btn-elevenlabs-copy-pairing-link': ['複製配對連結', '复制配对链接', 'Copy pairing link'],
        'btn-elevenlabs-check-auth': ['再次檢查', '再次检查', 'Check again'],
        'btn-validate-refresh-token-direct': ['驗證', '验证', 'Validate'],
        'btn-elevenlabs-open-browser-assist': ['開啟舊版 browser-assist', '打开旧版 browser-assist', 'Open legacy browser-assist'],
        'btn-elevenlabs-import-browser-assist': ['從舊版視窗導入', '从旧版窗口导入', 'Import from legacy window'],
      },
      label: {
        // config
        'checkbox-top': ['顯示在最上層', '显示在最上层', 'Always On Top'],
        'checkbox-focusable': ['可被選取', '可被选取', 'Focusable'],
        'checkbox-shortcut': ['啟用快捷鍵', '启用快捷键', 'Shortcut'],
        'checkbox-min-size': ['最小尺寸限制', '最小尺寸限制', 'Minimum Size Limit'],
        'checkbox-compact-mode': ['緊湊模式（掌機適用）', '紧凑模式（掌机适用）', 'Compact Mode (Handheld)'],
        'input-compact-width': ['緊湊寬度(px)', '紧凑宽度(px)', 'Compact Width(px)'],
        'input-compact-height': ['緊湊高度(px)', '紧凑高度(px)', 'Compact Height(px)'],
        'checkbox-hide-button': ['自動隱藏按鈕', '自动隐藏按钮', 'Hide Buttons Automatically'],
        'checkbox-hide-dialog': ['自動隱藏視窗', '自动隐藏视窗', 'Hide Window Automatically'],
        'input-hide-dialog-timeout': ['隱藏間隔(秒)', '隐藏间隔(秒)', 'Hide Window After(Sec)'],
        'input-background-color': ['背景顏色', '背景颜色', 'Color'],
        'input-background-transparency': ['背景透明度', '背景透明度', 'Transparency'],
        'input-speech-speed': ['朗讀速度', '朗读速度', 'Speech Speed'],

        'select-font-weight': ['文字粗細', '文字粗细', 'Font Weight'],
        'input-font-size': ['文字大小(Rem)', '文字大小(Rem)', 'Font Size(Rem)'],
        'input-dialog-spacing': ['對話框間隔(Rem)', '对话框间隔(Rem)', 'Dialog Spacing(Rem)'],
        'input-dialog-radius': ['對話框圓角(Rem)', '对话框圆角(Rem)', 'Dialog Radius(Rem)'],
        'input-dialog-color': ['對話框顏色', '对话框颜色', 'Dialog Color'],
        'input-dialog-transparency': ['對話框透明度', '对话框透明度', 'Dialog Transparency'],

        'checkbox-auto-change': ['翻譯失敗時切換翻譯器', '翻译失败时切换翻译器', 'Change Translator Automatically'],
        'checkbox-fix-translation': ['翻譯修正', '翻译修正', 'Fix Translation'],
        'checkbox-skip-system': ['忽略常見系統訊息', '忽略常见系统讯息', 'Ignore System Message'],
        'checkbox-skip-chinese': ['不翻譯漢化字幕', '不翻译汉化字幕', "Don't translate Chinese text"],
        'select-engine': ['翻譯器', '翻译器', 'Translator'],
        'select-engine-alternate': ['翻譯器(備用)', '翻译器(备用)', 'Translator(Alternate)'],
        'select-from': ['遊戲語言', '游戏语言', 'Game Language'],
        'select-from-player': ['隊伍語言', '队伍语言', 'Party Language'],
        'select-to': ['目標語言', '目标语言', 'Target Language'],

        'select-google-vision-type': ['認證方式', '认证方式', 'Type'],
        'input-google-vision-api-key': ['API Key', 'API金钥', 'API Key'],

        'input-gemini-api-key': ['API Key', 'API金钥', 'API Key'],
        'input-gemini-model': ['模型', '模型', 'Model'],

        'input-kimi-token': ['API Key', 'API金钥', 'API Key'],
        'input-kimi-model': ['模型', '模型', 'Model'],

        'input-openrouter-api-key': ['API Key', 'API金钥', 'API Key'],
        'input-openrouter-model': ['模型', '模型', 'Model'],

        'input-nvidia-api-key': ['API Key', 'API金钥', 'API Key'],
        'input-nvidia-model': ['模型', '模型', 'Model'],

        'input-gpt-api-key': ['API Key', 'API金钥', 'API Key'],
        'input-gpt-model': ['模型', '模型', 'Model'],

        'input-llm-api-key': ['API Key', 'API金钥', 'API Key'],
        'input-llm-model': ['模型', '模型', 'Model'],
        'input-llm-api-url': ['API URL', 'API URL', 'API URL'],

        'select-app-language': ['語言(Language)', '语言(Language)', 'Language'],
        'select-theme': ['介面主題', '界面主题', 'Theme'],
        'checkbox-auto-download-json': ['啟動時下載翻譯對照表', '启动时下载翻译对照表', 'Download Table When Started'],
        'checkbox-ssl-certificate': ['SSL驗證', 'SSL验证', 'SSL Certificate'],

        'input-ai-chat-enable': ['使用多輪對話', '使用多轮对话', 'Multi-Turn Conversation'],
        'input-ai-chat-length': ['對話長度', '对话长度', 'Turn Length'],
        'input-ai-temperature': ['溫度', '温度', 'Temperature'],
        'checkbox-ai-streaming': ['啟用流式響應 (OpenRouter/GPT/Gemini)', '启用流式响应 (OpenRouter/GPT/Gemini)', 'Enable Streaming (OpenRouter/GPT/Gemini)'],
        'textarea-ai-custom-translation-prompt': [
          '自訂翻譯Prompt(System Role)',
          '自订翻译Prompt(System Role)',
          'Custom Translation Prompt(System Role)',
        ],
        'label-prompt-preset': ['Prompt預設', 'Prompt预设', 'Prompt Preset'],
        'p-prompt-tip': [
          '留空使用預設prompt，或選擇上方預設模板',
          '留空使用预设prompt，或选择上方预设模板',
          'Keep blank for default prompt, or select a preset above'
        ],

        'input-proxy-enable': ['使用Proxy', '使用Proxy', 'Enable Proxy'],
        'select-proxy-protocol': ['Protocol', 'Protocol', 'Protocol'],
        'input-proxy-hostname': ['Hostname', 'Hostname', 'Hostname'],
        'input-proxy-port': ['Port', 'Port', 'Port'],
        'input-proxy-username': ['Username', 'Username', 'Username'],
        'input-proxy-password': ['Password', 'Password', 'Password'],


        // capture
        'checkbox-split': ['換行切割', '换行切割', 'Split New Line'],
        'checkbox-edit': ['編輯文字', '编辑文字', 'Edit'],

        // capture edit
        'input-capture-text': ['文字', '文字', 'Txt'],
        'input-capture-image': ['圖片', '图片', 'Img'],

        // edit
        'checkbox-replace': ['取代原本翻譯', '取代原本翻译', 'Replace The Result'],
        'textarea-before': ['原文', '原文', 'Original Text'],
        'textarea-after': ['取代為', '取代为', 'Replace With'],
        'select-type': ['類別', '类别', 'Type'],

        // dictionary
        'checkbox-tataru': ['使用Tataru翻譯', '使用Tataru翻译', 'Translate By Tataru'],

        // read log
        'select-log': ['選擇對話紀錄', '选择对话纪录', 'Chat Log'],
      },
      option: {
        // config (新 Tab 结构)
        'div-appearance': ['外觀', '外观', 'Appearance'],
        'div-translation': ['翻譯', '翻译', 'Translation'],
        'div-speech': ['語音', '语音', 'Speech'],
        'div-api': ['API', 'API', 'API'],
        'div-ai': ['AI', 'AI', 'AI'],
        'div-system': ['系統', '系统', 'System'],
        'div-about': ['關於', '关于', 'About'],

        normal: ['細', '细', 'Normal'],
        bold: ['粗', '粗', 'Bold'],

        // 提示词预设
        'default': ['使用預設', '使用预设', 'Use Default'],
        'game': ['遊戲對話', '游戏对话', 'Game Dialogue'],
        'story': ['劇情翻譯', '剧情翻译', 'Story'],
        'simple': ['簡潔翻譯', '简洁翻译', 'Simple'],
        'custom': ['自訂', '自定义', 'Custom'],

        '#Web-Translator': ['#線上翻譯', '#在线翻译', '#Web'],
        Youdao: ['有道翻譯', '有道翻译', 'Youdao'],
        Baidu: ['百度翻譯', '百度翻译', 'Baidu'],
        Caiyun: ['彩雲小譯', '彩云小译', 'Caiyun'],
        Papago: ['Papago', 'Papago', 'Papago'],
        DeepL: ['DeepL', 'DeepL', 'DeepL'],
        '#AI-Translator': ['#AI翻譯', '#AI翻译', '#AI'],
        GPT: ['ChatGPT', 'ChatGPT', 'ChatGPT'],
        Gemini: ['Gemini', 'Gemini', 'Gemini'],
        Kimi: ['Kimi', 'Kimi', 'Kimi'],
        OpenRouter: ['OpenRouter', 'OpenRouter', 'OpenRouter'],
        NVIDIA: ['NVIDIA', 'NVIDIA', 'NVIDIA'],
        'LLM-API': ['自訂OpenAI', '自订OpenAI', 'Custom OpenAI'],

        Auto: ['自動偵測', '自动侦测', 'Auto'],
        Japanese: ['日文', '日语', 'Japanese'],
        English: ['英文', '英语', 'English'],
        'Traditional-Chinese': ['繁體中文', '繁体中文', 'Traditional Chinese'],
        'Simplified-Chinese': ['簡體中文', '简体中文', 'Simplified Chinese'],

        Korean: ['韓文', '韩語', 'Korean'],
        Russian: ['俄文', '俄语', 'Russian'],
        Italian: ['義大利文', '意大利语', 'Italian'],
        Portuguese: ['葡萄牙文', '葡萄牙文', 'Portuguese'],
        Brazilian: ['巴西葡萄牙文', '巴西葡萄牙文', 'Brazilian Portuguese'],
        Arabic: ['阿拉伯文', '阿拉伯文', 'Arabic'],

        'google-json': ['JSON檔案', 'JSON档案', 'JSON File'],
        'google-api-key': ['API Key', 'API Key', 'API Key'],

        // tts engine options
        'mimo': ['MiMo TTS', 'MiMo TTS', 'MiMo TTS'],
        'fish': ['Fish Audio', 'Fish Audio', 'Fish Audio'],

        // capture
        'tesseract-ocr': ['Tesseract OCR', 'Tesseract OCR', 'Tesseract OCR'],
        'google-vision': ['Google Vision', 'Google Vision', 'Google Vision'],
        'gpt-vision': ['ChatGPT Vision', 'ChatGPT Vision', 'ChatGPT Vision'],

        // edit
        '#player-name': ['#玩家', '#玩家', '#Player'],
        player: ['玩家名稱', '玩家名称', 'Player'],
        retainer: ['雇員名稱', '雇员名称', 'Retainer'],
        '#custom-target': ['#原文->自訂翻譯', '#原文->自订翻译', '#Source->Custom'],
        npc: ['NPC名稱', 'NPC名称', 'NPC'],
        title: ['稱呼', '称呼', 'Title'],
        group: ['組織', '组织', 'Group'],
        monster: ['魔物', '魔物', 'Foe'],
        things: ['事物', '事物', 'Things'],
        skill: ['技能', '技能', 'Skill'],
        map: ['地名', '地名', 'Map'],
        other: ['其他', '其他', 'Other'],
        '#custom-overwrite': ['#原文->自訂翻譯(整句)', '#原文->自订翻译(整句)', '#Source->Custom(Full Text)'],
        'custom-overwrite': ['自訂翻譯(整句)', '自订翻译(整句)', 'Custom(Full Text)'],
        '#custom-source': ['#原文->原文', '#原文->原文', '#Source->Source'],
        'custom-source': ['原文替換', '原文替换', 'Edit Source'],

        // custom
        'player-name-table': ['#玩家', '#玩家', '#Player'],
        'custom-target-table': ['#原文->自訂翻譯', '#原文->自订翻译', '#Source->Custom'],
        'custom-overwrite-table': ['#原文->自訂翻譯(整句)', '#原文->自订翻译(整句)', '#Source->Custom(Full Text)'],
        'custom-source-table': ['#原文->原文', '#原文->原文', '#Source->Source'],
        'temp-name-table': ['#暫存(全)', '#暂存(全)', '#Cache(All)'],
        'temp-name-table-valid': ['#暫存(有效)', '#暂存(有效)', '#Cache(Valid)'],

        // read log
        none: ['無', '无', 'None'],
      },
      div: {
        'section-interface-preferences': ['介面偏好', '界面偏好', 'Interface Preferences'],
        'label-app-language': ['介面語言', '界面语言', 'Language'],
        'desc-app-language': ['應用介面顯示的語言', '应用界面显示的语言', 'App interface language'],
        'label-theme': ['主題', '主题', 'Theme'],
        'desc-theme': ['選擇深色或淺色主題', '选择深色或浅色主题', 'Choose dark or light theme'],
        'label-google-tts-ready': ['無需額外設定', '无需额外配置', 'No extra setup required'],
        'desc-google-tts-ready': [
          'Google TTS 目前無需單獨填寫參數，可直接測試連線，確認後再儲存設定。',
          'Google TTS 当前无需单独填写参数，可直接测试连接，确认后再保存设置。',
          'Google TTS does not require extra parameters here. You can test the connection directly, then save settings once it looks good.',
        ],
        'label-elevenlabs-recommended-setup': ['推薦流程', '推荐流程', 'Recommended setup'],
        'desc-elevenlabs-recommended-setup': [
          '首選方式：使用 Chrome / Chromium 搭配內建 ElevenReader 擴充套件自動導入登入；手動 Token 與舊版 browser-assist 僅作備援。',
          '首选方式：使用 Chrome / Chromium 搭配内置 ElevenReader 扩展自动导入登录；手动 Token 与旧版 browser-assist 仅作备选。',
          'Primary path: use Chrome / Chromium + the bundled ElevenReader extension to import login automatically. Manual token entry and legacy browser-assist remain fallbacks only.',
        ],
        'label-elevenlabs-extension-files': ['擴充套件檔案', '扩展文件', 'Extension files'],
        'desc-elevenlabs-extension-files': [
          '若仍需在 chrome://extensions 手動載入，可直接開啟內建 Chromium 擴充套件資料夾。',
          '如果仍需在 chrome://extensions 手动加载，可直接打开内置 Chromium 扩展文件夹。',
          'Open the bundled Chromium extension folder if you still need to load it in chrome://extensions.',
        ],
        'label-elevenlabs-browser-connection': ['瀏覽器連接', '浏览器连接', 'Browser connection'],
        'desc-elevenlabs-browser-connection': [
          '先開始配對，在 ElevenReader 中完成登入，再回來這裡檢查。',
          '先开始配对，在 ElevenReader 中完成登录，再回来这里检查。',
          'Start pairing, finish login in ElevenReader, then check again here.',
        ],
        'label-elevenlabs-connection-status': ['連接狀態', '连接状态', 'Connection status'],
        'desc-elevenlabs-connection-status': [
          '在驗證就緒前，試聽、刷新語音與 ElevenLabs 測試都會維持停用。',
          '在验证就绪前，试听、刷新语音与 ElevenLabs 测试都会保持禁用。',
          'Preview, refresh voices, and ElevenLabs test actions stay disabled until auth is ready.',
        ],
        'label-elevenlabs-manual-fallback': ['手動備援', '手动备选', 'Manual fallback'],
        'desc-elevenlabs-manual-fallback': [
          '當 Chrome / Chromium 或擴充套件不可用時使用；FFTrans 會在儲存前先驗證 Refresh Token。',
          '当 Chrome / Chromium 或扩展不可用时使用；FFTrans 会在保存前先验证 Refresh Token。',
          'Use this when Chrome / Chromium or the extension is unavailable. FFTrans will validate the Refresh Token before you save.',
        ],
        'label-elevenlabs-refresh-token': ['Refresh Token', 'Refresh Token', 'Refresh Token'],
        'desc-elevenlabs-refresh-token': [
          '適合非 Chromium 或無法安裝擴充套件的備援方案。',
          '适合非 Chromium 或无法安装扩展的备选方案。',
          'Recommended fallback for non-Chromium or no-extension setups.',
        ],
        'label-elevenlabs-legacy-browser-assist': ['舊版 browser-assist', '旧版 browser-assist', 'Legacy browser-assist'],
        'desc-elevenlabs-legacy-browser-assist': [
          '除非主流程不可用，否則不建議使用；這個舊版內建瀏覽器仍可導入可用會話或 Token。',
          '除非主流程不可用，否则不建议使用；这个旧版内置浏览器仍可导入可用会话或 Token。',
          'Not recommended unless the primary extension flow is unavailable. This older in-app browser window can still import a usable session or tokens.',
        ],
        'label-elevenlabs-fallback-guide': ['備援說明', '备选说明', 'Fallback guide'],
        'desc-elevenlabs-fallback-guide': [
          '打開手動 Refresh Token、bearer / 會話注意事項，以及舊版 browser-assist 流程說明。',
          '打开手动 Refresh Token、bearer / 会话注意事项，以及旧版 browser-assist 流程说明。',
          'Open the guide for manual Refresh Token entry, bearer/session caveats, and the legacy browser-assist flow.',
        ],
      },
      p: {
        'p-ai-warning': [
          '* 注意：AI翻譯需事先設定API才能使用',
          '* 注意：AI翻译需事先设定API才能使用',
          '* Remember to set API options before using AI translator',
        ],
        'p-google-vision': ['Google Vision設定', 'Google Vision设定', 'Google Vision'],
        'p-gemini': ['Gemini設定', 'Gemini设定', 'Gemini'],
        'p-chat-gpt': ['ChatGPT設定', 'ChatGPT设定', 'ChatGPT'],
        'p-kimi': ['Kimi設定', 'Kimi设定', 'Kimi'],
        'p-openrouter': ['OpenRouter設定', 'OpenRouter设定', 'OpenRouter'],
        'p-nvidia': ['NVIDIA設定', 'NVIDIA设定', 'NVIDIA'],
        'p-llm-api': ['自訂OpenAI設定', '自订OpenAI设定', 'Custom OpenAI'],
        'p-ssl-warning': [
          '若您的API不支援SSL驗證，請至【系統設定】關閉SSL驗證',
          '若您的API不支援SSL验证，请至【系统设定】关闭SSL验证',
          'Set SSL certificate off in "System Config" if your API can\'t access ChatGPT',
        ],
      },
      span: {
        // window title
        'span-title-capture-edit': ['編輯擷取文字', '编辑撷取文字', 'Edit Text'],
        'span-title-config': ['設定', '设定', 'Settings'],
        'settings-subtitle': ['配置 FFTrans 偏好設定', '配置 FFTrans 偏好设置', 'Configure FFTrans preferences'],
        'span-title-custom': ['自訂翻譯', '自订翻译', 'Custom Translation'],
        'span-title-dictionary': ['翻譯查詢', '翻译查询', 'Translator'],
        'span-title-edit': ['編輯翻譯', '编辑翻译', 'Edit Translation'],
        'span-title-read-log': ['讀取對話紀錄', '读取对话纪录', 'Read Logs'],

        // index - click through hint
        'span-click-through-text': ['滑鼠穿透已啟用', '鼠标穿透已启用', 'Click Through Enabled'],

        // config
        'span-channel-comment': ['滾動滑鼠中鍵可以捲動頻道清單', '滚动鼠标中键可以捲动频道清单', 'Use middle mouse button to sroll the page'],
        'section-google-tts-ready': ['Google TTS', 'Google TTS', 'Google TTS'],
        'section-more-engines': ['更多翻譯引擎', '更多翻译引擎', 'More translation engines'],
        'step-elevenlabs-install': ['1. 安裝內建擴充套件', '1. 安装内置扩展', '1. Install bundled extension'],
        'step-elevenlabs-connect': ['2. 連接 ElevenReader', '2. 连接 ElevenReader', '2. Connect ElevenReader'],
        'step-elevenlabs-login': ['3. 在 Chromium 中開啟並登入', '3. 在 Chromium 中打开并登录', '3. Open / login in Chromium'],
        'step-elevenlabs-save': ['4. 再次檢查後儲存', '4. 再次检查后保存', '4. Check again, then save'],
        
        // Window 页面分组标题
        'section-window-behavior': ['視窗行為', '窗口行为', 'Window Behavior'],
        'section-compact-mode': ['緊湊模式', '紧凑模式', 'Compact Mode'],
        'section-display': ['顯示設定', '显示设置', 'Display'],
        'section-background': ['背景樣式', '背景样式', 'Background'],
        'section-speech': ['語音設定', '语音设置', 'Speech'],
        
        // Window 页面设置标签
        'label-checkbox-top': ['置頂顯示', '置顶显示', 'Always on Top'],
        'label-checkbox-focusable': ['允許視窗獲取焦點', '允许窗口获取焦点', 'Focusable'],
        'label-checkbox-min-size': ['限制視窗最小大小', '限制窗口最小大小', 'Limit minimum window size'],
        'label-checkbox-compact-mode': ['緊湊模式', '紧凑模式', 'Compact Mode'],
        'label-compact-width': ['寬度', '宽度', 'Width'],
        'label-compact-height': ['高度', '高度', 'Height'],
        'label-checkbox-hide-button': ['隱藏視窗控制按鈕', '隐藏窗口控制按钮', 'Hide window control buttons'],
        'label-checkbox-hide-dialog': ['自動隱藏對話', '自动隐藏对话', 'Auto Hide Dialog'],
        'label-hide-dialog-timeout': ['隱藏超時', '隐藏超时', 'Hide Timeout'],
        'label-background-color': ['背景顏色', '背景颜色', 'Background Color'],
        'label-background-transparency': ['背景透明度', '背景透明度', 'Transparency'],
        'label-speech-speed': ['語音速度', '语音速度', 'Speech Speed'],
        'label-tts-engine': ['語音引擎', '语音引擎', 'TTS Engine'],
        'p-mimo-tts': ['MiMo TTS', 'MiMo TTS', 'MiMo TTS'],
        'label-mimo-api-key': ['API Key', 'API Key', 'API Key'],
        'desc-mimo-api-key': ['MiMo TTS API 密鑰', 'MiMo TTS API 密钥', 'MiMo TTS API Key'],
        'label-mimo-model': ['模型', '模型', 'Model'],
        'desc-mimo-model': ['MiMo-V2.5-TTS（限時免費）', 'MiMo-V2.5-TTS（限时免费）', 'MiMo-V2.5-TTS (free for now)'],
        'label-mimo-voice': ['語音', '语音', 'Voice'],
        'desc-mimo-voice': ['選擇 MiMo 預設音色；克隆模式下填入參考音頻 data URL', '选择 MiMo 预设音色；克隆模式下填入参考音频 data URL', 'Select a MiMo preset voice; for cloning enter a reference audio data URL'],
        'label-mimo-voice-custom': ['自定義音色 / 參考音頻', '自定义音色 / 参考音频', 'Custom voice / reference audio'],
        'desc-mimo-voice-custom': ['預設音色名，或克隆用 data:audio 參考音頻', '预设音色名，或克隆用 data:audio 参考音频', 'Preset voice name, or data:audio reference for cloning'],
        'label-mimo-response-format': ['音頻格式', '音频格式', 'Audio Format'],
        'desc-mimo-response-format': ['輸出音頻的格式', '输出音频的格式', 'Output audio format'],
        'label-mimo-style': ['風格描述', '风格描述', 'Style Instructions'],
        'desc-mimo-style': ['自然語言描述情感/語氣/方言（可選）', '自然语言描述情感/语气/方言（可选）', 'Natural-language style/emotion/dialect (optional)'],
        'p-fish-tts': ['Fish Audio', 'Fish Audio', 'Fish Audio'],
        'label-fish-api-key': ['API Key', 'API Key', 'API Key'],
        'desc-fish-api-key': ['Fish Audio API 密鑰 (fish.audio 控制台獲取)', 'Fish Audio API 密钥 (fish.audio 控制台获取)', 'Fish Audio API key (from fish.audio console)'],
        'label-fish-model': ['模型', '模型', 'Model'],
        'desc-fish-model': ['s2.1-pro-free 為 7 月限免模型', 's2.1-pro-free 为 7 月限免模型', 's2.1-pro-free is free during July'],
        'label-fish-voice': ['克隆語音', '克隆语音', 'Cloned Voice'],
        'desc-fish-voice': ['選擇你在 fish.audio 克隆的語音模型，或輸入自定義 Reference ID；留空使用默認語音', '选择你在 fish.audio 克隆的语音模型，或输入自定义 Reference ID；留空使用默认语音', 'Select a voice cloned on fish.audio or enter a custom Reference ID; leave empty for default voice'],
        'label-fish-voice-custom': ['自定義 Reference ID', '自定义 Reference ID', 'Custom Reference ID'],
        'desc-fish-voice-custom': ['手動輸入 fish.audio 語音模型 ID', '手动输入 fish.audio 语音模型 ID', 'Manually enter fish.audio voice model ID'],
        'label-fish-response-format': ['音頻格式', '音频格式', 'Audio Format'],
        'desc-fish-response-format': ['輸出音頻的格式', '输出音频的格式', 'Output audio format'],
        'p-speechify-tts': ['Speechify TTS', 'Speechify TTS', 'Speechify TTS'],
        'p-elevenlabs-tts': ['ElevenLabs Reader', 'ElevenLabs Reader', 'ElevenLabs Reader'],
        // Speech tab section header
        'section-speech-engine': ['語音引擎', '语音引擎', 'Speech Engine'],

        // Window 页面设置描述
        'desc-checkbox-top': ['視窗始終顯示在最前面', '窗口始终显示在最前面', 'Window stays on top of other windows'],
        'desc-checkbox-focusable': ['允許視窗獲取焦點', '允许窗口获取焦点', 'Allow window to receive focus'],
        'desc-checkbox-min-size': ['限制視窗最小大小', '限制窗口最小大小', 'Limit minimum window size'],
        'desc-checkbox-compact-mode': ['適用於掌機設備的小視窗模式', '适用于掌机设备的小窗口模式', 'Small window mode for handheld devices'],
        'desc-checkbox-hide-button': ['隱藏視窗控制按鈕', '隐藏窗口控制按钮', 'Hide window control buttons'],
        'desc-checkbox-hide-dialog': ['超時後自動隱藏對話框', '超时后自动隐藏对话框', 'Auto hide dialog after timeout'],
        'desc-hide-dialog-timeout': ['對話框自動隱藏的等待秒數', '对话框自动隐藏的等待秒数', 'Seconds before dialog auto-hides'],
        'desc-background-color': ['設定視窗背景色', '设置窗口背景色', 'Set window background color'],
        'desc-background-transparency': ['調整背景的透明程度', '调整背景的透明程度', 'Adjust background transparency'],
        'desc-speech-speed': ['TTS 播放速度倍率', 'TTS 播放速度倍率', 'TTS playback speed multiplier'],
        'desc-tts-engine': ['選擇 TTS 語音合成引擎', '选择 TTS 语音合成引擎', 'Select TTS speech synthesis engine'],
        'span-author': [
          '作者: raydocs',
          '作者: raydocs',
          'Author: raydocs',
        ],
      },
      summary: {
        'summary-elevenlabs-advanced': [
          '備援流程：手動 Refresh Token / 舊版 browser-assist',
          '备选流程：手动 Refresh Token / 旧版 browser-assist',
          'Fallbacks: manual Refresh Token / legacy browser-assist',
        ],
      },
      title: {
        'title-capture-edit': ['編輯擷取文字', '编辑撷取文字', 'Edit Text'],
        'title-capture': ['擷取文字', '撷取文字', 'Recognize Screen Text'],
        'title-config': ['設定', '设定', 'Config'],
        'title-custom': ['自訂翻譯', '自订翻译', 'Custom Translation'],
        'title-dictionary': ['翻譯查詢', '翻译查询', 'Translator'],
        'title-edit': ['編輯翻譯', '编辑翻译', 'Edit Translation'],
        'title-index': ['Tataru Assistant', 'Tataru Assistant', 'Tataru Assistant'],
        'title-read-log': ['讀取對話紀錄', '读取对话纪录', 'Read Logs'],
      },
      th: {
        'th-custom-before': ['原文', '原文', 'Original Text'],
        'th-custom-after': ['取代為', '取代为', 'Replace With'],
        'th-custom-type': ['類別', '类别', 'Type'],
        'th-custom-edit': ['編輯', '编辑', 'Edit'],
      },
    },
    placeholder: {
      input: {
        // config
        'input-google-vision-api-key': ['API Key', 'API金钥', 'API Key'],

        'input-gemini-api-key': ['API Key', 'API金钥', 'API Key'],
        'input-gemini-model': ['Model', 'Model', 'Model'],

        'input-gpt-api-key': ['API Key', 'API金钥', 'API Key'],
        'input-gpt-model': ['Model', 'Model', 'Model'],

        'input-kimi-token': ['API Key', 'API金钥', 'API Key'],
        'input-kimi-model': ['Model', 'Model', 'Model'],

        'input-llm-api-key': ['API Key', 'API金钥', 'API Key'],
        'input-llm-model': ['Model', 'Model', 'Model'],
        'input-llm-api-url': ['API URL', 'API URL', 'API URL'],

        'input-nvidia-api-key': ['API Key', 'API金钥', 'API Key'],
        'input-nvidia-model': ['Model', 'Model', 'Model'],

        // custom
        'input-Keyword': ['關鍵字', '关键字', 'Keyword'],

        // dictionary
        'input-original-name': ['Name', 'Name', 'Name'],
      },
      textarea: {
        // dictionary
        'textarea-original-text': ['Text', 'Text', 'Text'],

        // edit
        'textarea-before': ['原文', '原文', 'Original Text'],
        'textarea-after': ['取代為', '取代为', 'Replace With'],
      },
    },
    title: {
      img: {
        // index
        'img-button-drag': ['拖曳', '拖曳', 'Drag'],
        'img-button-config': ['設定', '设定', 'Config'],
        'img-button-capture': ['螢幕截圖翻譯', '萤幕截图翻译', 'Screenshot Translation'],
        'img-button-through': ['滑鼠穿透', '鼠标穿透', 'Mouse Pass'],
        'img-button-update': ['下載最新版本', '下载最新版本', 'Download The Latest Version'],
        'img-button-minimize': ['縮小', '缩小', 'Minimize'],
        'img-button-close': ['關閉', '关闭', 'Close'],

        'img-button-speech': ['朗讀文字', '朗读文字', 'Text To Speech'],
        'img-button-custom': ['自訂翻譯', '自订翻译', 'Custom Word'],
        'img-button-dictionary': ['翻譯查詢', '翻译查询', 'Translate'],
        'img-button-read-log': ['讀取對話紀錄', '读取对话纪录', 'Read Chat Log'],
        'img-button-backspace': ['刪除最後一句', '删除最后一句', 'Delete Last'],
        'img-button-clear': ['刪除全部對話', '删除全部对话', 'Delete All'],
        'img-button-compact': ['緊湊模式', '紧凑模式', 'Compact Mode'],
      },
      button: {
        // index
        'img-button-drag': ['拖曳', '拖曳', 'Drag'],
        'img-button-config': ['設定', '设定', 'Config'],
        'img-button-capture': ['螢幕截圖翻譯', '萤幕截图翻译', 'Screenshot Translation'],
        'img-button-through': ['滑鼠穿透', '鼠标穿透', 'Mouse Pass'],
        'img-button-update': ['下載最新版本', '下载最新版本', 'Download The Latest Version'],
        'img-button-minimize': ['縮小', '缩小', 'Minimize'],
        'img-button-close': ['關閉', '关闭', 'Close'],

        'img-button-speech': ['朗讀文字', '朗读文字', 'Text To Speech'],
        'img-button-custom': ['自訂翻譯', '自订翻译', 'Custom Word'],
        'img-button-dictionary': ['翻譯查詢', '翻译查询', 'Translate'],
        'img-button-read-log': ['讀取對話紀錄', '读取对话纪录', 'Read Chat Log'],
        'img-button-backspace': ['刪除最後一句', '删除最后一句', 'Delete Last'],
        'img-button-clear': ['刪除全部對話', '删除全部对话', 'Delete All'],
        'img-button-compact': ['緊湊模式', '紧凑模式', 'Compact Mode'],
      },
    },
  };
}
