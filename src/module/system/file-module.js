'use strict';

// electron
const { app } = require('electron');

// fs
const fs = require('fs');

// path
const path = require('path');

// Logger
const Logger = require('../../utils/logger');

// App name constants
const appName = 'Tataru Assistant';
const oldName = 'Tataru Helper Node';

// Lazy initialization - paths are computed on first access
let _appPath = null;
let _rootPath = null;
let _documentsPath = null;
let _downloadsPath = null;
let hasAppWarningLogged = false;

function getElectronApp() {
  if (app && typeof app.getPath === 'function') {
    return app;
  }

  // Fallback for environments that run Electron as a plain Node process (ELECTRON_RUN_AS_NODE=1)
  if (!hasAppWarningLogged) {
    Logger.warn('file-module', 'Electron app module is not available; falling back to process.cwd() paths');
    hasAppWarningLogged = true;
  }
  return null;
}

function getAppPathInternal() {
  if (_appPath === null) {
    const electronApp = getElectronApp();

    if (electronApp) {
      try {
        _appPath = electronApp.getAppPath();
      } catch (error) {
        Logger.warn('file-module', 'Failed to get Electron app path, falling back to process.cwd()', error);
      }
    }

    // If app path is still not resolved, use working directory as a safe fallback
    if (_appPath === null) {
      return process.cwd();
    }
  }
  return _appPath;
}

function getRootPathInternal() {
  if (_rootPath === null) {
    _rootPath = process.cwd();
  }
  return _rootPath;
}

function getDocumentsPathInternal() {
  if (_documentsPath === null) {
    const electronApp = getElectronApp();

    if (electronApp) {
      try {
        _documentsPath = electronApp.getPath('documents');
      } catch (error) {
        Logger.warn('file-module', 'Failed to get documents path, falling back to working directory', error);
      }
    }

    // If documents path is still not resolved, fall back to working directory (not cached so we can retry after app is ready)
    if (_documentsPath === null) {
      return path.join(process.cwd(), 'documents');
    }
  }
  return _documentsPath;
}

function getDownloadsPathInternal() {
  if (_downloadsPath === null) {
    const electronApp = getElectronApp();

    if (electronApp) {
      try {
        _downloadsPath = electronApp.getPath('downloads');
      } catch (error) {
        Logger.warn('file-module', 'Failed to get downloads path, falling back to working directory', error);
      }
    }

    // If downloads path is still not resolved, fall back to working directory (not cached so we can retry after app is ready)
    if (_downloadsPath === null) {
      return path.join(process.cwd(), 'downloads');
    }
  }
  return _downloadsPath;
}

// directory check
function directoryCheck() {
  const subPath = [
    '',
    appName,
    path.join(appName, 'config'),
    path.join(appName, 'image'),
    path.join(appName, 'log'),
    path.join(appName, 'text')
  ];

  subPath.forEach((value) => {
    try {
      const dir = getPath(getDocumentsPathInternal(), value);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      Logger.error('file-module', 'Failed to create directory', error);
    }
  });
}

// readdir
function readdir(path) {
  let result = [];

  try {
    result = fs.readdirSync(path);
  } catch (error) {
    error;
  }

  return result;
}

// exists
function exists(filePath = './') {
  let result = false;

  try {
    result = fs.existsSync(filePath);
  } catch (error) {
    Logger.error('file-module', 'Failed to check file existence', error);
  }

  return result;
}

// rmdir
function rmdir(filePath = './') {
  try {
    fs.rmSync(filePath, { recursive: true, force: true });
  } catch (error) {
    Logger.error('file-module', 'Failed to remove directory', error);
  }
}

// unlink
function unlink(filePath = './') {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    Logger.error('file-module', 'Failed to unlink file', error);
  }
}

// read
function read(filePath = './', type = '') {
  let data = null;

  try {
    switch (type) {
      case 'json':
        data = JSON.parse(fs.readFileSync(filePath).toString());
        break;

      case 'image':
        data = fs.readFileSync(filePath, 'base64');
        break;

      case 'txt':
        data = fs.readFileSync(filePath).toString();
        break;

      default:
        data = fs.readFileSync(filePath);
        break;
    }
  } catch (error) {
    Logger.error('file-module', `Failed to read file: ${filePath}`, error);
  }

  return data;
}

// write
function write(filePath = './', data = '', type = '') {
  try {
    switch (type) {
      case 'json':
        {
          let dataString = JSON.stringify(data).includes('{')
            ? JSON.stringify(data, null, '\t')
            : JSON.stringify(data)
              .replaceAll('[[', '[\n\t[')
              .replaceAll('],', '],\n\t')
              .replaceAll(']]', ']\n]')
              .replaceAll('","', '", "');
          dataString = dataString.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n');
          fs.writeFileSync(filePath, dataString);
        }
        break;

      case 'image':
        fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
        break;

      default:
        fs.writeFileSync(filePath, data);
        break;
    }
  } catch (error) {
    Logger.error('file-module', `Failed to write file: ${filePath}`, error);
  }
}

// write log
function writeLog(type = '', message = '') {
  try {
    const logPath = getUserDataPath('config', 'log.txt');
    const currentTime = new Date().toLocaleString();
    let log = read(logPath, 'txt') || '';
    log += '\r\n' + currentTime + '\r\n' + type + '\r\n' + message + '\r\n\r\n';
    write(logPath, log);
  } catch (error) {
    Logger.error('file-module', 'Failed to write log', error);
  }
}

// get path
function getPath(...args) {
  return path.join(...args);
}

// get app path
function getAppPath(...args) {
  return path.join(getAppPathInternal(), ...args);
}

// get root path
function getRootPath(...args) {
  return path.join(getRootPathInternal(), ...args);
}

// get root data path
function getRootDataPath(...args) {
  return path.join(getRootPathInternal(), 'src', 'data', ...args);
}

// get user data path
function getUserDataPath(...args) {
  return path.join(getDocumentsPathInternal(), appName, ...args);
}

// get old user data path
function getOldUserDataPath(...args) {
  return path.join(getDocumentsPathInternal(), oldName, ...args);
}

// get downloads path
function getDownloadsPath(...args) {
  return path.join(getDownloadsPathInternal(), ...args);
}

// module exports
module.exports = {
  directoryCheck,

  readdir,
  exists,
  rmdir,
  unlink,
  read,
  write,
  writeLog,

  getPath,
  getAppPath,
  getRootPath,
  getRootDataPath,
  getUserDataPath,
  getOldUserDataPath,
  getDownloadsPath,
};
