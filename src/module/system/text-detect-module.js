'use strict';

// tesseract
const { createWorker } = require('tesseract.js');

// google vision
const cloudVision = require('../translator/google-vision');

// config module
const configModule = require('./config-module');

// dialog module
const dialogModule = require('./dialog-module');

// window module
const windowModule = require('./window-module');

// engine module
const engineModule = require('./engine-module');

// fix entry
const { addTask } = require('../fix/fix-entry');

// AI
// gemini
const gemini = require('../translator/gemini');
// gpt
const gpt = require('../translator/gpt');
// kimi
const kimi = require('../translator/kimi');

// OCR Rate Limiter
const PromiseQueue = require('../../utils/promise-queue');
const ocrQueue = new PromiseQueue(1); // Max 1 concurrent OCR request

// Singleton OCR Workers (per language)
const ocrWorkerPromises = {};

// Get or create OCR worker (singleton per language)
async function getOcrWorker(lang = 'eng') {
  if (!ocrWorkerPromises[lang]) {
    ocrWorkerPromises[lang] = createWorker(lang);
  }
  return ocrWorkerPromises[lang];
}

// Cleanup OCR workers
async function cleanup() {
  for (const lang of Object.keys(ocrWorkerPromises)) {
    try {
      const worker = await ocrWorkerPromises[lang];
      await worker.terminate();
      delete ocrWorkerPromises[lang];
    } catch (error) {
      console.warn('[TextDetect] Worker cleanup failed:', error.message);
    }
  }
}

// start reconizing
async function startReconizing(captureData) {
  const imageBase64 = captureData.imageBuffer ? captureData.imageBuffer.toString('base64') : '';
  captureData.text = '';

  // google vision
  if (captureData.type === 'google-vision') {
    captureData.text = await ocrQueue.add(() => googleVision(captureData));
  }
  // gemini vision
  else if (captureData.type === 'gemini-vision') {
    captureData.text = await ocrQueue.add(() => gemini.getImageText(imageBase64, captureData.from));
  }
  // gpt vision
  else if (captureData.type === 'gpt-vision') {
    captureData.text = await ocrQueue.add(() => gpt.getImageText(imageBase64, captureData.from));
  }
  // kimi vision
  else if (captureData.type === 'kimi-vision') {
    captureData.text = await ocrQueue.add(() => kimi.getImageText(imageBase64, captureData.from));
  }
  // tesseract ocr
  else {
    captureData.text = await ocrQueue.add(() => tesseractOCR(captureData));

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
    return await cloudVision.textDetection(captureData.imageBuffer);
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
    // Get singleton worker (per language) - reuse across all OCR requests
    const lang = captureData.from === engineModule.languageEnum.ja ? 'jpn' : 'eng';
    const worker = await getOcrWorker(lang);

    // recognize text
    const ret = await worker.recognize(captureData.imageBuffer);

    // fix or show error
    text = ret.data.text;

    // Worker is kept alive for reuse - no terminate
  } catch (error) {
    console.log(error);
    dialogModule.addNotification(error);
  }

  return text;
}

// fix image text
function fixText(captureData) {
  let text = captureData.text;
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

module.exports = {
  startReconizing,
  translateImageText,
  cleanup,
};
