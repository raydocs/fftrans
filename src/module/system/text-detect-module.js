'use strict';

// tesseract
const { createWorker } = require('tesseract.js');

// google vision
const cloudVision = require('../translator/google-vision');

// config module
const configModule = require('./config-module');

// dialog module
const dialogModule = require('./dialog-module');

// file module
const fileModule = require('./file-module');

// window module
const windowModule = require('./window-module');

// engine module
const engineModule = require('./engine-module');

// fix entry
const { addTask } = require('../fix/fix-entry');

// gpt module
const gptModule = require('../translator/gpt');

// image dir
const imageDir = fileModule.getRootPath('src', 'data', 'img');

// start reconizing
async function startReconizing(captureData) {
  captureData.text = '';

  // gpt vision
  if (captureData.type === 'gpt-vision') {
    const imageBase64 = fileModule.read(captureData.imagePath, 'image');
    captureData.text = await gptModule.getImageText(imageBase64);
  }
  // google vision
  else if (captureData.type === 'google-vision') {
    captureData.text = await googleVision(captureData);
  }
  // tesseract ocr
  else {
    captureData.text = await tesseractOCR(captureData);

    // fix ocr text
    captureData.text = fixText(captureData);
  }

  // check text length
  if (captureData.text === '') {
    dialogModule.addNotification('RECOGNITION_EMPTY');
    return;
  }

  // add notification
  dialogModule.addNotification('RECOGNITION_COMPLETED');

  // open edit window if edit is true
  if (captureData.edit) {
    windowModule.restartWindow('capture-edit', captureData);
    return;
  }

  // translate image text
  translateImageText(captureData);
}

// google vision
async function googleVision(captureData) {
  let text = '';

  try {
    return await cloudVision.textDetection(captureData.imagePath);
  } catch (error) {
    console.log(error);
    dialogModule.addNotification(error);
  }

  return text;
}

// tesseract ocr
async function tesseractOCR(captureData) {
  let text = '';

  try {
    // set worker - 只使用英文OCR引擎
    const worker = await createWorker('eng');

    // recognize text
    const ret = await worker.recognize(captureData.imagePath);

    // fix or show error
    text = ret.data.text;

    // terminate worker
    await worker.terminate();
  } catch (error) {
    console.log(error);
    dialogModule.addNotification(error);
  }

  return text;
}

// fix image text
function fixText(captureData) {
  let text = '';
  text = captureData.text;

  console.log(text);

  // fix new line - 简化为仅英文处理
  text = text.replaceAll('\n\n', '\n');

  return text;
}

// translate image text
async function translateImageText(captureData) {
  // set translation
  const translation = configModule.getConfig().translation;
  translation.from = captureData.from;

  // set text array
  const textArray = [];

  if (captureData.split) {
    const array = captureData.text.split(/[\r\n]/);

    for (let index = 0; index < array.length; index++) {
      const text = array[index];
      textArray.push(text);
    }
  } else {
    // 英文处理：将换行符替换为空格
    textArray.push(captureData.text.replace(/[\r\n]/g, ' ').replaceAll('  ', ' '));
  }

  // delete images
  deleteImages();

  // start translation
  for (let index = 0; index < textArray.length; index++) {
    const text = textArray[index];

    if (text === '') continue;

    const dialogData = {
      code: '003D',
      name: '',
      text: text,
      translation,
    };

    await engineModule.sleep(100);
    addTask(dialogData);
  }
}

// delete images
function deleteImages() {
  fileModule.readdir(imageDir).forEach((fileName) => {
    if (fileName.includes('.png')) {
      fileModule.unlink(fileModule.getPath(imageDir, fileName));
    }
  });
}

module.exports = {
  startReconizing,
  translateImageText,
};
