'use strict';

// json function
const jsonFunction = require('./json-function');

// language table
const { languageEnum, fixTargetList } = require('../system/engine-module');

// ch array
const chArray = {};

// en array
const enArray = {};

// user array
const userArray = {};

// load
function load(targetLanguage) {
  // OPTIMIZED: Simplified for English → Simplified Chinese only
  // No need for srcIndex/rplIndex with new 2-column dictionary format
  const isChinese = fixTargetList.includes(targetLanguage);

  // user array
  jsonFunction.readUserArray(userArray);

  // ch
  chArray.overwrite = [];
  chArray.afterTranslation = [];

  // en
  enArray.subtitle = jsonFunction.combineArray2(userArray.customSource, jsonFunction.readSubtitleEN());
  enArray.ignore = jsonFunction.readText(jsonFunction.getTextPath('en', 'ignore.json'));
  enArray.en1 = jsonFunction.readText(jsonFunction.getTextPath('en', 'en1.json'));
  enArray.en2 = jsonFunction.readText(jsonFunction.getTextPath('en', 'en2.json'));
  enArray.uncountable = jsonFunction.readText(jsonFunction.getTextPath('en', 'uncountable.json'));

  // main
  chArray.main = [];

  // non AI
  chArray.nonAI = [];

  // chinese (OPTIMIZED: Now using 2-column format directly)
  if (isChinese) {
    const ch = targetLanguage === languageEnum.zht ? 'cht' : 'chs';

    // ch
    chArray.overwrite = jsonFunction.readOverwriteEN(2);  // Still using old index for overwrite files
    chArray.afterTranslation = jsonFunction.readText(jsonFunction.getTextPath('ch', `after-translation-${ch}.json`));

    // main (OPTIMIZED: Direct load, no mapping needed for 2-column format)
    chArray.main = jsonFunction.readMain(0, 1);

    // non AI (OPTIMIZED: Direct load)
    chArray.nonAI = jsonFunction.readNonAI(0, 1);
  }

  // overwrite
  chArray.overwrite = jsonFunction.combineArray2(userArray.customOverwrite, chArray.overwrite);

  // combine
  chArray.combine = jsonFunction.combineArray2(
    userArray.playerName,
    userArray.customTarget,
    chArray.main,
    userArray.tempNameValid
  );

  // clear temp name
  jsonFunction.clearTempName(jsonFunction.combineArray2(userArray.customTarget, chArray.main), userArray.tempName);

  // version fix
  if (isChinese) versionFix();
}

// version fix
function versionFix() {
  // clear combine
  for (let index = chArray.combine.length - 1; index >= 0; index--) {
    const element0 = chArray.combine[index][0];
    const element1 = chArray.combine[index][1];

    // 1 character words
    if (/(^.$)/.test(element0)) {
      console.log('Illegal single word:', chArray.combine[index]);
      chArray.combine.splice(index, 1);
    }
    // blank word
    else if (element0 === '' || element1 === '') {
      //console.log('blank word:', chArray.combine[index]);
      chArray.combine.splice(index, 1);
    }
    // error message
    else if (/error/gi.test(element0)) {
      chArray.combine.splice(index, 1);
    }
    // wrong AI translation (ex: Sorry Message)
    else if (/sorry/gi.test(element0) || element1.length > element0.length * 2) {
      chArray.combine.splice(index, 1);
    }
  }

  // update temp name
  // jsonFunction.writeUserText('temp-name.json', userArray.tempName);
}

// get ch array
function getChArray() {
  return chArray;
}

// get en array
function getEnArray() {
  return enArray;
}

// get user array
function getUserArray() {
  return userArray;
}

// module exports
module.exports = {
  load,
  getChArray,
  getEnArray,
  getUserArray,
};
