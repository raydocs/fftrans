'use strict';

// electron
const { app } = require('electron');

// fs
const fs = require('fs');
const fsp = fs.promises;

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

async function directoryCheckAsync() {
  const subPath = [
    '',
    appName,
    path.join(appName, 'config'),
    path.join(appName, 'image'),
    path.join(appName, 'log'),
    path.join(appName, 'text')
  ];

  await Promise.all(subPath.map(async (value) => {
    try {
      const dir = getPath(getDocumentsPathInternal(), value);
      await fsp.mkdir(dir, { recursive: true });
    } catch (error) {
      Logger.error('file-module', 'Failed to create directory (async)', error);
    }
  }));
}

// readdir
function readdir(path) {
  let result = [];

  try {
    result = fs.readdirSync(path);
  } catch (error) {
    Logger.error('file-module', 'Failed to read directory', error);
  }

  return result;
}

async function readdirAsync(pathValue) {
  try {
    return await fsp.readdir(pathValue);
  } catch (error) {
    Logger.error('file-module', 'Failed to read directory async', error);
    return [];
  }
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

async function existsAsync(filePath = './') {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// rmdir
function rmdir(filePath = './') {
  try {
    fs.rmSync(filePath, { recursive: true, force: true });
  } catch (error) {
    Logger.error('file-module', 'Failed to remove directory', error);
  }
}

async function rmdirAsync(filePath = './') {
  try {
    await fsp.rm(filePath, { recursive: true, force: true });
  } catch (error) {
    Logger.error('file-module', 'Failed to remove directory async', error);
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

async function unlinkAsync(filePath = './') {
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    Logger.error('file-module', 'Failed to unlink file async', error);
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

// read async
async function readAsync(filePath = './', type = '') {
  try {
    let data = null;

    switch (type) {
      case 'json':
        data = JSON.parse((await fsp.readFile(filePath)).toString());
        break;

      case 'image':
        data = await fsp.readFile(filePath, 'base64');
        break;

      case 'txt':
        data = (await fsp.readFile(filePath)).toString();
        break;

      default:
        data = await fsp.readFile(filePath);
        break;
    }
    return data;
  } catch (error) {
    Logger.error('file-module', `Failed to read file async: ${filePath}`, error);
    return null;
  }
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

// write async
async function writeAsync(filePath = './', data = '', type = '') {
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
          await fsp.writeFile(filePath, dataString);
        }
        break;

      case 'image':
        await fsp.writeFile(filePath, Buffer.from(data, 'base64'));
        break;

      default:
        await fsp.writeFile(filePath, data);
        break;
    }
  } catch (error) {
    Logger.error('file-module', `Failed to write file async: ${filePath}`, error);
  }
}

// write log
function writeLog(type = '', message = '') {
  try {
    const logPath = getUserDataPath('config', 'log.txt');
    const currentTime = new Date().toLocaleString();
    const log = '\r\n' + currentTime + '\r\n' + type + '\r\n' + message + '\r\n\r\n';
    fs.appendFileSync(logPath, log, { encoding: 'utf8' });
  } catch (error) {
    Logger.error('file-module', 'Failed to write log', error);
  }
}

async function writeLogAsync(type = '', message = '') {
  try {
    const logPath = getUserDataPath('config', 'log.txt');
    const currentTime = new Date().toLocaleString();
    const log = '\r\n' + currentTime + '\r\n' + type + '\r\n' + message + '\r\n\r\n';
    await fsp.appendFile(logPath, log, { encoding: 'utf8' });
  } catch (error) {
    Logger.error('file-module', 'Failed to write log async', error);
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
  directoryCheckAsync,

  readdir,
  readdirAsync,
  exists,
  existsAsync,
  rmdir,
  rmdirAsync,
  unlink,
  unlinkAsync,
  read,
  readAsync,
  write,
  writeAsync,
  writeLog,
  writeLogAsync,

  getPath,
  getAppPath,
  getRootPath,
  getRootDataPath,
  getUserDataPath,
  getOldUserDataPath,
  getDownloadsPath,
};
