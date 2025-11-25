'use strict';

/*
UPDATE NOTE
- use axios
- dialog update
- error log
fix isch
change icon
*/

// electron
const { app, BrowserWindow, globalShortcut } = require('electron');
//app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-http-cache');

// app module
const appModule = require('./module/system/app-module');

// window module
const windowModule = require('./module/system/window-module');

// sharlayan module
const sharlayanModule = require('./module/system/sharlayan-module');

// translation cache
const { globalCache } = require('./module/system/translation-cache');

// on ready
app.on('ready', () => {
  appModule.startApp();
  windowModule.createWindow('index');
});

// on window all closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// on activate
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) windowModule.createWindow('index');
});

// Cleanup on app exit
app.on('before-quit', async (event) => {
  // Prevent default to allow async cleanup
  event.preventDefault();

  try {
    console.log('Starting app cleanup...');

    // Stop Sharlayan reader process (don't restart)
    sharlayanModule.stop(false);

    // Cleanup translation cache (stop auto-save interval, final save)
    await globalCache.cleanup();

    // Unregister all global shortcuts
    globalShortcut.unregisterAll();

    console.log('App cleanup completed');
  } catch (error) {
    console.error('Error during app cleanup:', error);
  }

  // Now actually quit
  app.exit(0);
});

// ignore uncaughtException
process.on('uncaughtException', (error) => {
  console.log('\r\nuncaughtException');
  console.log(error);

  // write log
  appModule.writeLog('uncaughtException', error);
});

// ignore unhandledRejection
process.on('unhandledRejection', (error) => {
  console.log('\r\nunhandledRejection');
  console.log(error);

  // write log
  appModule.writeLog('unhandledRejection', error);
});

/*
// ignore certificate error
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  console.log('\r\ncertificate-error');
  console.log(error);

  // write log
  appModule.wirteLog('certificate-error', error);

  // Prevent having error
  event.preventDefault();

  // and continue
  callback(true);
});
*/
