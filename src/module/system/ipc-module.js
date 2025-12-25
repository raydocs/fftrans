'use strict';

// electron
const { dialog } = require('electron');

// child process
const childProcess = require('child_process');

// electron
const { app, ipcMain, screen, BrowserWindow } = require('electron');

// Default timeout for IPC operations (30 seconds)
const DEFAULT_IPC_TIMEOUT = 30000;

/**
 * Wraps a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} operationName - Name of the operation for error message
 * @returns {Promise} - Promise that rejects on timeout
 */
function withTimeout(promise, ms = DEFAULT_IPC_TIMEOUT, operationName = 'Operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${operationName} timed out after ${ms}ms`)), ms)
    )
  ]);
}

// chat code module
const chatCodeModule = require('./chat-code-module');

// config module
const configModule = require('./config-module');

// dialog module
const dialogModule = require('./dialog-module');

// engine module
const engineModule = require('./engine-module');

// file module
const fileModule = require('./file-module');

// image module
const imageModule = require('./image-module');

// request module
const requestModule = require('./request-module');

// sharlayan module
const sharlayanModule = require('./sharlayan-module');

// text detect module
const textDetectModule = require('./text-detect-module');

// translate module
const translateModule = require('./translate-module');

// version module
const versionModule = require('./version-module');

// window module
const windowModule = require('./window-module');

// fix entry
const { addTask } = require('../fix/fix-entry');

// speechify tts
const speechifyTTS = require('../translator/speechify-tts');

// json entry
const jsonEntry = require('../fix/json-entry');

// json function
const jsonFunction = require('../fix/json-function');

// google tts
const googleTTS = require('../translator/google-tts');

// gpt
//const gpt = require('../translator/gpt');

// app version
const appVersion = app.getVersion();

// No kanji
const regNoKanji = /^[^\u3100-\u312F\u3400-\u4DBF\u4E00-\u9FFF]+$/;

// Track registered IPC channels for cleanup
const registeredChannels = {
  handlers: new Set(),
  listeners: new Set()
};

// Clean up all IPC handlers before re-registering (prevents memory leaks)
function cleanupIPC() {
  // Remove all handlers
  registeredChannels.handlers.forEach(channel => {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      // Handler might not exist, ignore
    }
  });

  // Remove all listeners
  registeredChannels.listeners.forEach(channel => {
    try {
      ipcMain.removeAllListeners(channel);
    } catch {
      // Listener might not exist, ignore
    }
  });

  // Clear tracking sets
  registeredChannels.handlers.clear();
  registeredChannels.listeners.clear();
}

// set ipc
function setIPC() {
  // Clean up old handlers first (prevent memory leaks on reload)
  cleanupIPC();

  setSystemChannel();
  setWindowChannel();
  setDialogChannel();
  setCaptureChannel();
  setJsonChannel();
  setRequestChannel();
  setTranslateChannel();
  setTTSChannel();
  setFileChannel();
}

// set system channel
function setSystemChannel() {
  // get app version
  ipcMain.handle('get-version', () => {
    return appVersion;
  });

  // close app
  ipcMain.on('close-app', () => {
    sharlayanModule.stop(false);
    app.quit();
  });

  // get config
  ipcMain.handle('get-config', () => {
    return configModule.getConfig();
  });

  // set config
  ipcMain.handle('set-config', (event, newConfig) => {
    configModule.setConfig(newConfig);
    return configModule.getConfig();
  });

  // get theme
  ipcMain.handle('get-theme', () => {
    const config = configModule.getConfig();
    return config.system.theme || 'dark';
  });

  // apply theme to all windows
  ipcMain.on('apply-theme-to-all-windows', (event, theme) => {
    const { BrowserWindow } = require('electron');
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('set-theme', theme);
      }
    });
  });

  // set default config
  ipcMain.handle('set-default-config', () => {
    configModule.setDefaultConfig();
    const defaultConfig = configModule.getConfig();

    try {
      // reset index bounds
      const defaultIndexBounds = windowModule.getWindowSize('index', defaultConfig);
      windowModule.getWindow('index').setContentBounds(defaultIndexBounds);

      // reset config bounds
      const defaultConfigBounds = windowModule.getWindowSize('config', defaultConfig);
      windowModule.getWindow('config').setContentBounds(defaultConfigBounds);
    } catch (error) {
      console.log(error);
    }

    return defaultConfig;
  });

  // get chat code
  ipcMain.handle('get-chat-code', () => {
    return chatCodeModule.getChatCode();
  });

  // set chat code
  ipcMain.handle('set-chat-code', (event, newChatCode) => {
    chatCodeModule.setChatCode(newChatCode);
    return chatCodeModule.getChatCode();
  });

  // set default chat code
  ipcMain.handle('set-default-chat-code', () => {
    chatCodeModule.setDefaultChatCode();
    return chatCodeModule.getChatCode();
  });

  // restart sharlayan reader
  ipcMain.on('restart-sharlayan-reader', () => {
    sharlayanModule.stop(true);
  });

  // fix reader - Uses execFile with fixed arguments for security (no shell injection)
  ipcMain.on('fix-reader', (event) => {
    // Using execFile instead of exec to prevent command injection
    // This command resets Windows security settings to fix Sharlayan reader issues
    childProcess.execFile(
      'secedit',
      ['/configure', '/cfg', `${process.env.windir}\\inf\\defltbase.inf`, '/db', 'defltbase.sdb', '/verbose'],
      (error) => {
        let message = '';

        if (error && error.code === 740) {
          message = 'You must run Tataru Assistant as administrator. (Error 740)';
        } else if (error) {
          message = `Operation failed: ${error.message}`;
          console.error('[IPC] fix-reader error:', error);
        } else {
          message = 'Completed.';
        }

        dialogModule.showInfo(event.sender, message);
      }
    );
  });

  // console log
  ipcMain.on('console-log', (event, ...args) => {
    console.log(...args);
  });
}

// set window channel
function setWindowChannel() {
  // create window
  ipcMain.on('create-window', (event, windowName, data = null) => {
    // Validate window name against whitelist (security)
    if (!windowModule.isValidWindowName(windowName)) {
      console.error(`[IPC] Invalid window name rejected: ${windowName}`);
      return;
    }

    try {
      // Try to close existing window first
      windowModule.closeWindow(windowName);
    } catch {
      // Window doesn't exist or already closed, this is expected
      console.log(`[IPC] Window ${windowName} not found or already closed, creating new one`);
    }

    // Always try to create the window
    try {
      windowModule.createWindow(windowName, data);
    } catch (createError) {
      console.error(`[IPC] Failed to create window ${windowName}:`, createError);
    }
  });

  // restart window
  ipcMain.on('restart-window', (event, windowName, data = null) => {
    // Validate window name against whitelist (security)
    if (!windowModule.isValidWindowName(windowName)) {
      console.error(`[IPC] Invalid window name for restart rejected: ${windowName}`);
      return;
    }
    windowModule.restartWindow(windowName, data);
  });

  ipcMain.on('move-window', (event, detail) => {
    BrowserWindow.fromWebContents(event.sender).setContentBounds(detail);
  });

  // minimize window
  ipcMain.on('minimize-window', (event) => {
    try {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (targetWindow) {
        windowModule.minimizeWindow(targetWindow);
      }
    } catch (error) {
      console.log(error);
    }
  });

  // restore window
  ipcMain.on('restore-window', (event) => {
    try {
      BrowserWindow.fromWebContents(event.sender).restore();
    } catch (error) {
      console.log(error);
    }
  });

  // close window
  ipcMain.on('close-window', (event) => {
    try {
      BrowserWindow.fromWebContents(event.sender).close();
    } catch (error) {
      console.log(error);
    }
  });

  // always on top
  ipcMain.on('set-always-on-top', (event, isAlwaysOnTop) => {
    try {
      BrowserWindow.fromWebContents(event.sender).setAlwaysOnTop(isAlwaysOnTop, 'screen-saver');
    } catch (error) {
      console.log(error);
    }
  });

  // focusable
  ipcMain.on('set-focusable', (event, value = true) => {
    windowModule.setFocusable(value);
  });

  // set min size
  ipcMain.on('set-min-size', (event, minSize) => {
    if (minSize) {
      BrowserWindow.fromWebContents(event.sender).setMinimumSize(300, 300);
    } else {
      BrowserWindow.fromWebContents(event.sender).setMinimumSize(1, 1);
    }
  });

  // set click through
  ipcMain.on('set-click-through', (event, ignore) => {
    try {
      const indexWindow = BrowserWindow.fromWebContents(event.sender);
      indexWindow.setIgnoreMouseEvents(ignore, { forward: true });
      indexWindow.setResizable(!ignore);
    } catch (error) {
      console.log(error);
    }
  });

  // get click through config
  ipcMain.handle('get-click-through-config', () => {
    return configModule.getConfig().indexWindow.clickThrough;
  });

  // set click through config
  ipcMain.on('set-click-through-config', (event, value) => {
    let config = configModule.getConfig();
    config.indexWindow.clickThrough = value;
    configModule.setConfig(config);
  });

  // mute window
  ipcMain.on('mute-window', (event, autoPlay) => {
    event.sender.setAudioMuted(!autoPlay);
  });

  // send index
  ipcMain.on('send-index', (event, channel, ...args) => {
    windowModule.sendIndex(channel, ...args);
  });

  // change UI text
  ipcMain.on('change-ui-text', () => {
    windowModule.forEachWindow((appWindow) => {
      appWindow.webContents.send('change-ui-text');
    });
  });

  // execute command - REMOVED for security (command injection vulnerability)
  // If you need to execute specific commands, use a whitelist approach instead
  // ipcMain.on('execute-command', ...) - DEPRECATED

  ipcMain.on('show-info', (event, message = '') => {
    dialogModule.showInfo(event.sender, message);
  });
}

// set dialog channel
function setDialogChannel() {
  // add log
  ipcMain.on('add-log', (event, dialogData = {}, scroll = false) => {
    dialogModule.updateDialog(dialogData, scroll, false);
  });

  // add notification
  ipcMain.on('add-notification', (event, text = '') => {
    dialogModule.addNotification(text);
  });

  // reset dialog style
  ipcMain.on('reset-dialog-style', (event, resetList = []) => {
    for (let index = 0; index < resetList.length; index++) {
      const element = resetList[index];
      resetList[index].style = dialogModule.getStyle(element.code);
    }

    event.sender.send('reset-dialog-style', resetList);
  });

  // show dialog
  ipcMain.on('show-dialog', () => {
    dialogModule.showDialog();
  });

  // create log name
  ipcMain.handle('create-log-name', (event, milliseconds) => {
    return dialogModule.createLogName(milliseconds);
  });
}

// set capture channel
function setCaptureChannel() {
  // get screen bounds
  ipcMain.handle('get-screen-bounds', () => {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
  });

  // get mouse position
  ipcMain.handle('get-mouse-position', () => {
    return screen.getCursorScreenPoint();
  });

  // start recognize
  ipcMain.on('start-recognize', (event, captureData) => {
    // get display nearest point
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

    // find display's index
    const displayIDs = screen.getAllDisplays().map((x) => x.id);
    captureData.displayIndex = displayIDs.indexOf(display.id);

    // take screenshot
    imageModule.takeScreenshot(captureData);
  });

  // minimize all windows
  ipcMain.on('minimize-all-windows', () => {
    windowModule.forEachWindow((myWindow) => {
      windowModule.minimizeWindow(myWindow);
    });
  });

  // translate image text
  ipcMain.on('translate-image-text', (event, captureData) => {
    textDetectModule.translateImageText(captureData);
  });

  // set google credential
  ipcMain.on('set-google-credential', () => {
    dialog
      .showOpenDialog({
        defaultPath: fileModule.getDownloadsPath(),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      .then((value) => {
        if (!value.canceled && value.filePaths.length > 0 && value.filePaths[0].length > 0) {
          let data = fileModule.read(value.filePaths[0], 'json');

          if (data) {
            fileModule.write(fileModule.getUserDataPath('config', 'google-vision-credential.json'), data, 'json');
            dialogModule.addNotification('GOOGLE_CREDENTIAL_SAVED');
          } else {
            dialogModule.addNotification('INCORRECT_FILE');
          }
        }
      })
      .catch(console.log);
  });
}

// set request channel
function setRequestChannel() {
  // set UA
  ipcMain.on('set-ua', (event, scuValue, uaValue) => {
    requestModule.setUA(scuValue, uaValue);
  });

  // version check (with timeout and proper error handling)
  ipcMain.on('version-check', (event) => {
    // get lastest version
    withTimeout(
      requestModule.get('https://api.github.com/repos/raydocs/fftrans/releases/latest'),
      15000,
      'Version check'
    )
      .then((response) => {
        // compare with app version
        const latestVersion = response?.data?.tag_name;

        if (latestVersion) {
          if (versionModule.isLatest(appVersion, latestVersion)) {
            windowModule.sendIndex('hide-update-button', true);
            console.log('[IPC] Latest version confirmed');
          } else {
            windowModule.sendIndex('hide-update-button', false);
            dialogModule.addNotification('UPDATE_AVAILABLE');
          }
        } else {
          throw new Error('VERSION_CHECK_ERRORED');
        }
      })
      .catch((error) => {
        console.error('[IPC] Version check failed:', error.message || error);
        windowModule.sendIndex('hide-update-button', false);
        // Show user-friendly error message instead of raw error
        dialogModule.addNotification('VERSION_CHECK_FAILED');
      });

    // get info
    requestModule
      .get('https://raw.githubusercontent.com/winw1010/tataru-assistant-text/main/info.json')
      .then((response) => {
        if (response?.data?.show) {
          // show info
          dialogModule.showInfo(event.sender, '' + response.data.message);
        }
      })
      .catch((error) => {
        console.log(error);
        dialogModule.addNotification(error);
      });
  });

  // post form
  ipcMain.on('post-form', (event, path) => {
    requestModule.post('https://docs.google.com' + path).catch(console.log);
  });
}

// set json channel
function setJsonChannel() {
  // initialize json
  ipcMain.on('initialize-json', () => {
    jsonEntry.initializeJSON();
  });

  // download json
  ipcMain.on('download-json', () => {
    jsonEntry.downloadJSON();
  });

  // load json
  ipcMain.on('load-json', () => {
    jsonEntry.loadJSON();
  });

  // delete temp
  ipcMain.on('delete-temp', () => {
    jsonFunction.deleteTemp();
    jsonEntry.loadJSON();
    dialogModule.addNotification('TEMP_DELETED');
  });

  // get array
  ipcMain.handle('get-user-array', (event, name = '') => {
    let array = jsonEntry.getUserArray(name);
    return array;
  });

  // save user custom
  ipcMain.on('save-user-custom', (event, textBefore = '', textAfter = '', type = '') => {
    let fileName = '';
    let textBefore2 = textBefore;
    let array = [];

    if (type !== 'custom-overwrite' && textBefore2.length < 3 && regNoKanji.test(textBefore2)) textBefore2 += '#';

    if (type === 'custom-source') {
      fileName = 'custom-source.json';
      array.push([textBefore2, textAfter]);
    } else if (type === 'custom-overwrite') {
      fileName = 'custom-overwrite.json';
      array.push([textBefore2, textAfter]);
    } else if (type === 'player' || type === 'retainer') {
      fileName = 'player-name.json';
      array.push([textBefore2, textAfter, type]);
    } else {
      fileName = 'custom-target.json';
      array.push([textBefore2, textAfter, type]);
    }

    jsonFunction.saveUserCustom(fileName, array);
    jsonEntry.loadJSON();
    event.sender.send('create-table');
  });

  // delete user custom
  ipcMain.on('delete-user-custom', (event, textBefore = '', type = '') => {
    let fileName = '';
    let textBefore2 = textBefore;

    if (type !== 'custom-overwrite' && textBefore2.length < 3 && regNoKanji.test(textBefore2)) {
      textBefore2 += '#';
    }

    if (type === 'custom-source') {
      fileName = 'custom-source.json';
    } else if (type === 'custom-overwrite') {
      fileName = 'custom-overwrite.json';
    } else if (type === 'player' || type === 'retainer') {
      fileName = 'player-name.json';
    } else {
      fileName = 'custom-target.json';
    }

    jsonFunction.editUserCustom(fileName, textBefore2);
    jsonFunction.editUserCustom('temp-name.json', textBefore2);
    jsonEntry.loadJSON();
    event.sender.send('create-table');
  });
}

// set translate channel
function setTranslateChannel() {
  // get engine select
  ipcMain.handle('get-engine-select', () => {
    return engineModule.getEngineSelect();
  });

  // get all language select
  ipcMain.handle('get-all-language-select', () => {
    return engineModule.getAllLanguageSelect();
  });

  // get source select
  ipcMain.handle('get-source-select', () => {
    return engineModule.getSourceSelect();
  });

  // get source select
  ipcMain.handle('get-player-source-select', () => {
    return engineModule.getPlayerSourceSelect();
  });

  // get target select
  ipcMain.handle('get-target-select', () => {
    return engineModule.getTargetSelect();
  });

  // get UI select
  ipcMain.handle('get-ui-select', () => {
    return engineModule.getUISelect();
  });

  // get AI list
  ipcMain.handle('get-ai-list', () => {
    return engineModule.aiList;
  });

  ipcMain.handle('test-ai-translation', async (event, engine) => {
    const engineName = typeof engine === 'string' ? engine.trim() : '';
    if (!engineName || !engineModule.aiList.includes(engineName)) {
      return { success: false, message: 'Invalid AI engine' };
    }

    const config = configModule.getConfig();
    const from = config.translation?.from || 'English';
    let to = config.translation?.to || 'Simplified-Chinese';
    if (from === to) {
      to = from === 'English' ? 'Simplified-Chinese' : 'English';
    }

    const translation = {
      ...config.translation,
      engine: engineName,
      engineAlternate: engineName,
      autoChange: false,
      from,
      to,
    };

    const sampleText = 'Test connection.';
    const startTime = Date.now();

    try {
      const result = await withTimeout(
        translateModule.translate(sampleText, translation, [], 'sentence'),
        30000,
        'AI translation test'
      );
      const durationMs = Date.now() - startTime;

      if (typeof result !== 'string' || result.trim().length === 0) {
        return { success: false, message: 'Empty response from translation' };
      }

      return {
        success: true,
        engine: engineName,
        durationMs,
        result,
      };
    } catch (error) {
      return { success: false, message: error.message || String(error) };
    }
  });

  // add task
  ipcMain.on('add-task', (event, dialogData) => {
    addTask(dialogData);
  });

  // get translation (with timeout)
  ipcMain.on('translate-text', async (event, dialogData) => {
    try {
      const result = await withTimeout(
        translateModule.translate(dialogData.text, dialogData.translation),
        60000, // 60 second timeout for translation
        'Translation'
      );
      event.sender.send('show-translation', result, dialogData.translation.to);
    } catch (error) {
      console.error('[IPC] translate-text error:', error.message);
      event.sender.send('show-translation', `Error: ${error.message}`, dialogData.translation.to);
    }
  });

  // get translation with streaming (for OpenRouter, GPT, Gemini) - with timeout
  ipcMain.on('translate-text-stream', async (event, dialogData) => {
    try {
      const config = configModule.getConfig();

      // Check if streaming is enabled and engine supports it
      const streamingSupportedEngines = ['OpenRouter', 'GPT', 'Gemini'];
      const useStreaming = config.ai?.useStreaming !== false && streamingSupportedEngines.includes(dialogData.translation.engine);

      if (useStreaming) {
        // Use streaming translation with real-time updates (90 second timeout for streaming)
        const result = await withTimeout(
          translateModule.translateStream(
            dialogData.text,
            dialogData.translation,
            dialogData.table || [],
            dialogData.type || 'sentence',
            (chunk) => {
              // Send each chunk as it arrives
              event.sender.send('translation-chunk', chunk, dialogData.translation.to);
            }
          ),
          90000,
          'Streaming translation'
        );

        // Send final result
        event.sender.send('show-translation', result, dialogData.translation.to);
      } else {
        // Fall back to regular translation (60 second timeout)
        const result = await withTimeout(
          translateModule.translate(dialogData.text, dialogData.translation),
          60000,
          'Translation'
        );
        event.sender.send('show-translation', result, dialogData.translation.to);
      }
    } catch (error) {
      console.error('[IPC] translate-text-stream error:', error.message);
      event.sender.send('show-translation', `Error: ${error.message}`, dialogData.translation.to);
    }
  });

  // google tts (with timeout)
  ipcMain.handle('google-tts', async (event, text, from) => {
    try {
      return await withTimeout(
        googleTTS.getAudioUrl(text, from),
        15000, // 15 second timeout for TTS
        'Google TTS'
      );
    } catch (error) {
      console.error('[IPC] google-tts error:', error.message);
      throw error;
    }
  });

  // elevenlabs tts (with timeout)
  ipcMain.handle('elevenlabs-tts', async (event, text, from) => {
    try {
      const elevenLabsTTS = require('../translator/elevenlabs-tts');
      return await withTimeout(
        elevenLabsTTS.getAudioUrl(text, from),
        15000, // 15 second timeout for TTS
        'ElevenLabs TTS'
      );
    } catch (error) {
      console.error('[IPC] elevenlabs-tts error:', error.message);
      throw error;
    }
  });

  // speechify tts (with timeout)
  ipcMain.handle('speechify-tts', async (event, text, from) => {
    try {
      return await withTimeout(
        speechifyTTS.getAudioUrl(text, from),
        15000, // 15 second timeout for TTS
        'Speechify TTS'
      );
    } catch (error) {
      console.error('[IPC] speechify-tts error:', error.message);
      throw error;
    }
  });

  // translation cache statistics
  ipcMain.handle('cache-get-stats', () => {
    return translateModule.translationCache.getStats();
  });

  // clear translation cache
  ipcMain.handle('cache-clear', () => {
    translateModule.translationCache.clear();
    return { success: true };
  });

  // reset cache statistics
  ipcMain.handle('cache-reset-stats', () => {
    translateModule.translationCache.resetStats();
    return { success: true };
  });

  /*
  // check API
  ipcMain.on('check-api', (event, engine) => {
    if ([].concat(engineModule.aiList, ['google-vision']).includes(engine)) {
      const config = configModule.getConfig();
      let message = '';

      if (engine === 'Gemini') {
        if (config.api.geminiApiKey === '') message = '請至【API設定】輸入API key';
      } else if (engine === 'GPT') {
        if (config.api.gptApiKey === '' || config.api.gptModel === '') message = '請至【API設定】輸入API key和模型';
      } else if (engine === 'Cohere') {
        if (config.api.cohereToken === '') message = '請至【API設定】輸入API key';
      } else if (engine === 'Kimi') {
        if (config.api.kimiToken === '') message = '請至【API設定】輸入API key';
      } else if (engine === 'google-vision') {
        const keyPath = fileModule.getUserDataPath('config', 'google-vision-credential.json');
        if (!fileModule.exists(keyPath)) {
          message = '尚未設定Google憑證，請至【設定】>【API設定】輸入憑證';
        }
      }

      if (message !== '') {
        dialogModule.showInfo(event.sender, message);
      }
    }
  });
  */

  /*
  // get GPT model list
  ipcMain.handle('get-gpt-model-list', (event, apiKey) => {
    return gpt.getModelList(apiKey);
  });
  */
}

// set TTS channel
function setTTSChannel() {
  // Test Speechify configuration
  ipcMain.handle('test-speechify-config', async () => {
    try {
      const result = await speechifyTTS.testConfiguration();
      return result;
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.toString(),
      };
    }
  });

  // Get Speechify configuration
  ipcMain.handle('get-speechify-config', () => {
    const config = configModule.getConfig();
    return config.api.speechify || {};
  });

  // Set Speechify configuration
  ipcMain.handle('set-speechify-config', (event, speechifyConfig) => {
    const config = configModule.getConfig();
    config.api.speechify = {
      ...config.api.speechify,
      ...speechifyConfig,
    };
    configModule.setConfig(config);
    return { success: true };
  });

  // Get TTS engine
  ipcMain.handle('get-tts-engine', () => {
    const config = configModule.getConfig();
    return config.indexWindow.ttsEngine || 'google';
  });

  // Set TTS engine
  ipcMain.handle('set-tts-engine', (event, engine) => {
    const config = configModule.getConfig();
    config.indexWindow.ttsEngine = engine;
    configModule.setConfig(config);
    return { success: true };
  });

  // Preview Speechify voice
  ipcMain.handle('preview-speechify-voice', async (event, { text, config }) => {
    try {
      const audioUrl = await speechifyTTS.synthesizeSpeech(text, 'en', config);
      return {
        success: true,
        audioUrl: audioUrl
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.toString()
      };
    }
  });

  // Test ElevenLabs configuration
  ipcMain.handle('test-elevenlabs-config', async () => {
    try {
      const elevenLabsTTS = require('../translator/elevenlabs-tts');
      const result = await elevenLabsTTS.testConfiguration();
      return result;
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.toString(),
      };
    }
  });

  // Preview ElevenLabs voice
  ipcMain.handle('preview-elevenlabs-voice', async (event, { text, config }) => {
    try {
      const elevenLabsTTS = require('../translator/elevenlabs-tts');
      const audioUrl = await elevenLabsTTS.synthesizeSpeech(text, 'en', config);
      return {
        success: true,
        audioUrl: audioUrl
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.toString()
      };
    }
  });
}

// set file channel
function setFileChannel() {
  // read directory
  ipcMain.handle('read-directory', (event, path) => {
    return fileModule.readdir(path);
  });

  // read json
  ipcMain.handle('read-json', (event, filePath, returnArray) => {
    return fileModule.read(filePath, 'json') || (returnArray ? [] : {});
  });

  // get path
  ipcMain.handle('get-path', (event, ...args) => {
    return fileModule.getPath(...args);
  });

  // get root path
  ipcMain.handle('get-root-path', (event, ...args) => {
    return fileModule.getRootPath(...args);
  });

  // get user data path
  ipcMain.handle('get-user-data-path', (event, ...args) => {
    return fileModule.getUserDataPath(...args);
  });

  ipcMain.on('clear-cache', async (event) => {
    const response = await dialogModule.showInfo(event.sender, 'Delete cache file?', ['YES', 'NO'], 1);
    if (response === 0) {
      fileModule.unlink(fileModule.getUserDataPath('text', 'temp-name.json'));
      jsonEntry.loadJSON();
    }
  });
}

// module exports
module.exports = {
  setIPC,
  cleanupIPC
};
