'use strict';

// function
const enFunction = require('./en-function');
const fixFunction = require('./fix-function');

// en json
const enJson = require('./en-json');

// json function
const jsonFunction = require('./json-function');

// translate module
const translateModule = require('../system/translate-module');

// engine module
const { aiList } = require('../system/engine-module');

// OPTIMIZATION: Pre-compile frequently used regex patterns
const MIXED_CASE_REGEX = /(?<=[a-z])[A-Z](?=[a-z\b])/g;
const STUTTER_REGEX = /(?<=\b)(\w{1,2})-\1/gi;

// array
const enArray = enJson.getEnArray();
const chArray = enJson.getChArray();

/*
fix start
*/

// skip translation
function skipTranslation(dialogData) {
  return dialogData.translation.skip && fixFunction.skipCheck(dialogData, enArray.ignore);
}

// start
async function start(dialogData = {}) {
  const name = dialogData.name;
  const text = dialogData.text;
  const translation = dialogData.translation;

  let translatedName = '';
  let translatedText = '';

  try {
    // Preserve speaker names exactly as shown in game.
    translatedName = name;

    // fix text
    if (translation.skipChinese && enFunction.isChinese(text)) {
      translatedText = fixFunction.replaceText(text, chArray.combine);
    } else {
      if (aiList.includes(translation.engine)) {
        translatedText = await fixTextAI2(dialogData);
      } else {
        translatedText = await fixText(dialogData);
      }
    }

  } catch (error) {
    console.log(error);
    translatedName = '';
    translatedText = error;
  }

  // set text
  dialogData.translatedName = translatedName;
  dialogData.translatedText = translatedText;

  return dialogData;
}

/*
fix text
*/

// fix text
async function fixText(dialogData = {}) {
  const name = dialogData.name;
  const text = dialogData.text;
  const translation = dialogData.translation;

  let text2 = text;
  let translatedText = '';

  if (text === '') {
    return '';
  }

  // force overwrite
  const target = fixFunction.sameAsArrayItem(text, chArray.overwrite);
  if (target) {
    return fixFunction.replaceText(target[1], chArray.combine, true);
  }

  // en1
  text2 = fixFunction.replaceText(text2, enArray.en1, true);

  // special fix
  text2 = specialFix(name, text2);

  // combine
  const codeResult = enFunction.replaceTextByCode(text2, jsonFunction.combineArray2(chArray.combine, chArray.nonAI));
  text2 = codeResult.text;

  // en2
  text2 = fixFunction.replaceText(text2, enArray.en2, true);

  // mark fix
  // text2 = fixFunction.markFix(text2);

  // value fix before
  // const valueResult = fixFunction.valueFixBefore(text2);
  // text2 = valueResult.text;

  // skip check
  if (enFunction.needTranslation(text2, codeResult.table)) {
    // translate
    translatedText = await translateModule.translate(text2, translation, codeResult.table);
  } else {
    translatedText = text2;
  }

  // value fix after
  // translatedText = fixFunction.valueFixAfter(translatedText, valueResult.table);

  // mark fix
  // translatedText = fixFunction.markFix(translatedText, true);

  // table
  translatedText = fixFunction.replaceWord(translatedText, codeResult.table);

  // after translation
  translatedText = fixFunction.replaceText(translatedText, chArray.afterTranslation);

  return translatedText;
}

// fix text with AI 2 (TESTING)
async function fixTextAI2(dialogData = {}) {
  const name = dialogData.name;
  const text = dialogData.text;
  const translation = dialogData.translation;

  let text2 = text;
  let translatedText = '';

  if (text === '') {
    return '';
  }

  // special fix
  text2 = specialFix(name, text2);

  // combine
  const codeResult = enFunction.replaceTextByCode(text2, chArray.combine);
  text2 = codeResult.text;

  // skip check
  if (enFunction.needTranslation(text2, codeResult.table)) {
    // translate
    translatedText = await translateModule.translate(text2, translation, codeResult.table, 'sentence');
  } else {
    translatedText = text2;
  }

  // table replace
  translatedText = fixFunction.replaceWord(translatedText, codeResult.table);

  // after translation
  translatedText = fixFunction.replaceText(translatedText, chArray.afterTranslation);

  return translatedText;
}

// special fix
function specialFix(name = '', text = '') {
  let loopCount = 0;

  if (name) {
    // do something
  }

  // Clive
  if (/^Clive$/gi.test(name)) {
    text = text
      .replaceAll('Dominant', 'Dominant#')
      .replaceAll('Bearer', 'Bearer#')
      .replaceAll('The Fallen', 'The Fallen#');
  }

  // ApPlE => Apple (OPTIMIZED: Use pre-compiled regex)
  if (MIXED_CASE_REGEX.test(text)) {
    let textArray = text.split(' ');
    for (let index = 0; index < textArray.length; index++) {
      const element = textArray[index];
      textArray[index] = element[0].toUpperCase() + element.slice(1).toLowerCase();
    }
    text = textArray.join(' ');
  }

  // A-Apple => Apple (OPTIMIZED: Use pre-compiled regex)
  loopCount = 0;
  while (STUTTER_REGEX.test(text) && loopCount < 10) {
    text = text.replace(STUTTER_REGEX, '$1');
    loopCount++;
  }

  return text;
}

module.exports = {
  skipTranslation,
  start,
};
