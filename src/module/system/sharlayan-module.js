'use strict';

// BYTES: 488941104488492C4C8949244C89491C4584C07412488B4218488905********48890D
// RECENT BASE ADDRESS: "ffxiv_dx11.exe"+028F8418
// NAME 118 F8 20 38A8 238 F2
// TEXT 118 F8 20 38A8 350 0
// CUTSCENE 118 F8 68 288 0

// FIND ASMSignature (UNUSED):
// 1. FINDOUT TARGET'S BASE ADDRESS, THEN FIND OUT WHAT ACCESS TO THIS ADDRESS
// 2. SELECT ONE OF THE INSTRUCTIONS, THEN CLICK 'SHOW DISASSEMBLER'
// 3. IF BYTE NOT LONG ENOUGH, SELECT OTHER INSTRUCTION
// 4. COPY THE BYTES, ATLEAST 3 ROWS, AND DON'T COPY CONTINUOUS 8 BYTES

// CHECK ASMSignature:
// 1. SCAN OPTION: VALUE TYPE: ARRAY OF BYTE, CHECK HEX, CHECK 'WRITABLE' AND 'EXECUTABLE' TO SQUARE
// 2. PASTE THE BYTES, THEN CLICK FIRST SCAN (BYTES: 488941104488492C4C8949244C89491C4584C07412488B4218488905********48890D)
// 3. ONLY 1 RESULT = CORRECT BYTES
// 4. RIGHT CLICK AND SELECT 'DISASSEMBLE THIS MEMORY REGION' TO VIEW THE BASE ADDRESS ("ffxiv_dx11.exe"+XXXXXXX)

// FIND POINTER PATH
// 1. LOG IN THE GAME, AND CHANGE MAP ATLEAST ONE TIME, AND SCAN THE STRING BELOW, RIGHT CLICK THE ADDRESS, SELECT 'GENERATE POINTERMAP'
// 2. RESTART THE GAME, AND CHANGE MAP ATLEAST ONE TIME, AND SCAN THE STRING BELOW AGAIN, THEN RIGHT CLICK THE ADDRESS, SELECT 'POINTER SCAN FOR THIS ADDRESS'
// 3. TEST THE PROBABLY RESULT

// MAX DIFFERENT OFFSETS PER NODE: 4
// MAXIUM OFFSET VALUE: 65535
// MAX LEVEL: 7

// ASMSignature path[0,0]: TARGET'S BASE ADDRESS (VALUE OF ["ffxiv_dx11.exe"+XXXXXXX])
// DIALOG AND CUTSCENE HAVE SAME BASE ADDRESS

// DIALOG NAME
// PATH: 20 38A8 ...OTHER
// NOT ACTION, NOT OBJECT, NOT SKILL
// REMEMBER ADD 2 TO THE LAST OFFSET
// サブクエスト：ヴォイドの旁観者
// カットシーン3： 分裂した目玉 NEXT 深窓の令嬢 NEXT 粗暴な口調の父親

// DIALOG TEXT
// PATH: 20 38A8 ...OTHER
// NOT ACTION, NOT OBJECT, NOT SKILL, NO NEW LINE
// サブクエスト：ヴォイドの旁観者
// カットシーン3： ついたあだ名は、野蛮な女（バルバリシア）

// CUTSCENE
// PATH: F8 F8 68 ...OTHER
// メインクエスト：暁月のフィナーレ やがて流れは海へと注ぐ
// カットシーン3：北洋諸島唯一の都市国家 シャーレアン――

// CUTSCENE DETECTOR
// IN CUTSCENE: 0
// NOT IN CUTSCENE: 1
// GREEN ADDRESS

// HEX TO DECIMAL: console.log(0x38A8)
// DECIMAL TO HEX: console.log((14504).toString(16))

// child process
const childProcess = require('child_process');

// file module
const fileModule = require('./file-module');

// server module
const serverModule = require('./server-module');

// sharlayan history path
// const sharlayanHistoryPath = fileModule.getRootPath('src', 'data', readerName, 'history.json');

// reader name
const readerName = 'tataru-assistant-reader';

// sharlayan.exe path
const sharlayanExePath = fileModule.getRootPath('src', 'data', readerName, readerName + '.exe');

// data signatures path
const dataSignaturesPath = fileModule.getRootPath('src', 'data', 'text', 'signatures.json');

// root signatures path
const rootSignaturesPath = fileModule.getRootPath('signatures.json');

// reader process
let readerProcess = null;

// stdout line buffer for handling chunked data
let stdoutBuffer = '';

// do restart
let restartReader = true;

// dialog history
const dialogHistory = [];

// text history
const textHistory = {};

// pure text
const regexInvalidCharacter = /[^0-9a-z０-９ａ-ｚＡ-Ｚぁ-ゖァ-ヺ一-龯]/gi;

// start
function start() {
  // Sharlayan reader binary is Windows-only; skip on other platforms to avoid spawn loops
  if (process.platform !== 'win32') {
    restartReader = false;
    console.log(`${readerName}.exe skipped: non-Windows platform (${process.platform})`);
    return;
  }

  if (!fileModule.exists(sharlayanExePath)) {
    restartReader = false;
    console.log(`${readerName}.exe not found at: ${sharlayanExePath}`);
    return;
  }

  try {
    /*
    // read history
    if (fileModule.exists(sharlayanHistoryPath)) {
      const history = fileModule.read(sharlayanHistoryPath, 'json');
      dialogHistory = history.dialogHistory || [];
      textHistory = history.textHistory || {};
      textHistory['FFFF'] = '';
    }
    */

    // update signatures.json
    if (fileModule.exists(dataSignaturesPath)) {
      fileModule.readAsync(dataSignaturesPath, 'json')
        .then((signatures) => {
          if (signatures) {
            return fileModule.writeAsync(rootSignaturesPath, signatures, 'json');
          }
          return null;
        })
        .catch((error) => {
          console.log('Failed to sync signatures.json', error);
        });
    }

    // spawn reader process
    readerProcess = childProcess.spawn(sharlayanExePath);

    // reset line buffer on new process
    stdoutBuffer = '';

    // event handlers (stored for cleanup)
    const onClose = (code) => {
      console.log(`${readerName}.exe closed (code: ${code})`);
      cleanup();
      if (restartReader) {
        start();
      }
    };

    const onError = (err) => {
      console.log(err.message);
    };

    const onStdoutError = (err) => {
      console.log(err.message);
    };

    const onStdoutData = (data) => {
      // Append to buffer to handle chunked JSON lines
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\r\n');

      // Keep the last potentially incomplete line in the buffer
      stdoutBuffer = lines.pop() || '';

      for (let index = 0; index < lines.length; index++) {
        try {
          const jsonString = lines[index];

          if (jsonString.length > 0) {
            const dialogData = JSON.parse(jsonString);
            console.log('\r\nDialog Data:', dialogData);

            // skip invalid characters(EF BF BD, DEL)
            if (/[\uFFFD\u007F]/.test(dialogData.name) || /[\uFFFD\u007F]/.test(dialogData.text)) {
              continue;
            }

            fixText(dialogData);

            // check repetition
            if (isValidData(dialogData)) {
              serverModule.dataProcess(dialogData);
            } else {
              console.log('Repeated text');
            }
          }
        } catch (error) {
          console.log(error);
        }
      }
    };

    // cleanup function to remove all listeners
    function cleanup() {
      if (readerProcess) {
        readerProcess.removeListener('close', onClose);
        readerProcess.removeListener('error', onError);
        if (readerProcess.stdout) {
          readerProcess.stdout.removeListener('error', onStdoutError);
          readerProcess.stdout.removeListener('data', onStdoutData);
        }
      }
    }

    readerProcess.on('close', onClose);
    readerProcess.on('error', onError);
    readerProcess.stdout.on('error', onStdoutError);
    readerProcess.stdout.on('data', onStdoutData);
  } catch (error) {
    console.log(error);
  }
}

// stop
function stop(restart = true) {
  restartReader = restart;
  try {
    if (readerProcess && !readerProcess.killed) {
      readerProcess.kill('SIGINT');
    }
  } catch (error) {
    console.log('[sharlayan-module] Stop error:', error.message);
  }
}

// fix text
function fixText(dialogData) {
  if (dialogData.type !== 'CONSOLE') {
    dialogData.text = dialogData.text.replaceAll(/^#/gi, '').replaceAll(')*', '').replaceAll('%&', '').replaceAll('「+,', '「');
  }
}

// fix text 2
function fixText2(text = '') {
  return text
    .replaceAll('[r]', '')
    .replace(/（.*?）/gi, '')
    .replace(/\(.*?\)/gi, '')
    .replace(/FE/g, ''); // Temporary fix
}

// is valid data
function isValidData(dialogData) {
  const code = dialogData.code;
  const text = fixText2(dialogData.text);

  // DIALOG 003D
  if (dialogData.type === 'DIALOG') {
    if (text !== dialogHistory.slice(-1)[0]) {
      dialogHistory.push(text);

      if (dialogHistory.length > 20) {
        dialogHistory.splice(0, 10);
      }
    } else {
      return false;
    }
  }
  // other 003D
  else if (dialogData.code === '003D') {
    let count = 0;
    for (let index = dialogHistory.length - 1; index >= 0; index--) {
      const dialogText = dialogHistory[index];

      if (isSameText(dialogText, text)) {
        return false;
      }

      count++;
      if (count >= 10) {
        break;
      }
    }
  }
  // other code
  else {
    if (textHistory[code] === text) {
      return false;
    } else {
      textHistory[code] = text;
    }
  }

  return true;
}

// is same text
function isSameText(str1 = '', str2 = '') {
  str1 = str1.replace(regexInvalidCharacter, '');
  str2 = str2.replace(regexInvalidCharacter, '');
  return str1 === str2;
}

// module exports
module.exports = {
  start,
  stop,
};

/*
const exec = require('child_process').exec;

const isRunning = (query, cb) => {
    let platform = process.platform;
    let cmd = '';
    switch (platform) {
        case 'win32':
            cmd = `tasklist`;
            break;
        case 'darwin':
            cmd = `ps -ax | grep ${query}`;
            break;
        case 'linux':
            cmd = `ps -A`;
            break;
        default:
            break;
    }
    exec(cmd, (err, stdout, stderr) => {
        cb(stdout.toLowerCase().indexOf(query.toLowerCase()) > -1);
    });
};

isRunning('chrome.exe', (status) => {
    console.log(status); // true|false
});
*/
