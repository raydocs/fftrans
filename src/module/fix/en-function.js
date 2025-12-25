'use strict';

// fix function
const fixFunction = require('./fix-function');

// en json
const enJson = require('./en-json');

// OPTIMIZATION: Cache for plural and adjective forms to avoid recalculation
const morphologyCache = new Map(); // "word" -> { plural, adjective }

// OPTIMIZATION: Pre-compile common regex patterns
const WORD_BOUNDARY_REGEX = /\b[A-Za-z]+\b/gi;
const CAPITALIZED_WORD_REGEX = /\b[A-Z]+[a-z]+\b/g;
const UPPERCASE_CHAR_REGEX = /[A-Z]/g;

// en text function (OPTIMIZED: Uses Set for faster lookups)
function replaceTextByCode(text = '', array = []) {
  if (text === '' || !Array.isArray(array) || !array.length > 0) {
    return {
      text: text,
      table: [],
      aiTable: [],
    };
  }

  // set parameters
  const srcIndex = 0;
  const rplIndex = 1;
  let codeIndex = 0;
  let codeString = 'BCFGJLMNPRSTVWXYZ';
  let tempText = text;

  // OPTIMIZED: Pre-filter using word boundaries to reduce items to check
  const wordsInText = new Set(text.match(WORD_BOUNDARY_REGEX) || []);
  let tempTable = [];

  // OPTIMIZED: Only check items that might match (instead of all items)
  // Convert words to lowercase for faster comparison
  const lowerText = text.toLowerCase();
  const lowerWords = new Set(Array.from(wordsInText).map(w => w.toLowerCase()));

  for (const item of array) {
    const word = item[srcIndex];
    if (word && typeof word === 'string') {
      const wordLower = word.toLowerCase();

      // Quick check: does text contain this word?
      if (!lowerText.includes(wordLower)) continue;

      // Check if any word in text matches
      let found = false;
      for (const textWord of lowerWords) {
        if (textWord.includes(wordLower) || wordLower.includes(textWord)) {
          found = true;
          break;
        }
      }

      if (found) {
        tempTable.push(item);
      }
    }
  }

  let table = [];
  let aiTable = [];

  // sort temp table (longer matches first to avoid conflicts)
  tempTable = tempTable.sort((a, b) => b[0].length - a[0].length);

  // set temp text (OPTIMIZED: Use pre-compiled regex)
  const tempTextArray = tempText.match(CAPITALIZED_WORD_REGEX);
  if (tempTextArray) {
    for (let index = 0; index < tempTextArray.length; index++) {
      const element = tempTextArray[index];
      tempText = tempText.replaceAll(element, element.toUpperCase());
    }
  }

  // clear code (OPTIMIZED: Use pre-compiled regex)
  const characters = tempText.match(UPPERCASE_CHAR_REGEX);
  if (characters) {
    for (let index = 0; index < characters.length; index++) {
      codeString = codeString.replaceAll(characters[index].toUpperCase(), '');
    }
  }

  // search and replace
  for (let index = 0; index < tempTable.length && codeIndex < codeString.length; index++) {
    const element = tempTable[index];
    const searchElement = fixFunction.removeRegSymbol(element[srcIndex]);

    // OPTIMIZED: Check cache for morphology forms
    let morphology = morphologyCache.get(searchElement);
    if (!morphology) {
      morphology = {
        plural: getPluralType(searchElement),
        adjective: getAdjectiveType(searchElement),
      };
      morphologyCache.set(searchElement, morphology);
    }

    const searchElementPlural = morphology.plural;
    const searchElementAdjective = morphology.adjective;
    let searchReg = null;

    if (enJson.getEnArray().uncountable.includes(searchElement)) {
      searchReg = new RegExp(`\\b(${searchElement}|${searchElementAdjective})\\b`, 'gi');
    } else {
      searchReg = new RegExp(`\\b(${searchElementPlural}|${searchElement}|${searchElementAdjective})\\b`, 'gi');
    }

    if (searchReg.test(text)) {
      text = text.replace(searchReg, codeString[codeIndex]);
      table.push([codeString[codeIndex], element[rplIndex]]);
      aiTable.push([element[srcIndex], element[rplIndex]]);
      codeIndex++;
    }
  }

  const result = {
    text,
    table,
    aiTable,
  };

  // OPTIMIZED: Only log in development mode
  if (process.env.NODE_ENV !== 'production' && tempTable.length > 0) {
    console.log('replaceTextByCode - matches:', tempTable.length);
  }

  return result;
}

function needTranslation(text = '', table = []) {
  // remove table index
  const enReg = '(' + table.map((value) => value[0]).join(')|(') + ')';
  if (enReg !== '') {
    text = text.replace(new RegExp(enReg, 'gi'), '');
  }

  // remove marks
  text = text.replace(/[^A-Za-z]/g, '');

  // OPTIMIZED: Only log in development mode
  if (process.env.NODE_ENV !== 'production') {
    console.log('needTranslation:', text !== '');
  }

  return text !== '';
}

function getPluralType(text = '') {
  if (/(s|x|z|sh|ch)$/gi.test(text)) {
    return text + 'es';
  } else if (/(f|fe)$/gi.test(text)) {
    return text.replace(/(f|fe)$/gi, 'ves');
  } else if (/[^aeiou]y$/gi.test(text)) {
    return text.replace(/y$/gi, 'ies');
  } else if (/[^aeiou]o$/gi.test(text)) {
    return text + 'es';
  }

  return text + 's';
}

function getAdjectiveType(text = '') {
  if (/(s|x|z|sh|ch)$/gi.test(text)) {
    return text + 'en';
  } else if (/(f|fe)$/gi.test(text)) {
    return text.replace(/(f|fe)$/gi, 'ven');
  } else if (/[^aeiou]y$/gi.test(text)) {
    return text.replace(/y$/gi, 'ien');
  } else if (/(a|e|i|o|u)$/gi.test(text)) {
    return text.replace(/(a|e|i|o|u)$/gi, 'an');
  }

  return text + 'an';
}

function isChinese(text = '') {
  const chLength = text.match(/[\u3400-\u9FFF]/gi)?.length || 0;
  return chLength > 0;
}

// module exports
module.exports = {
  replaceTextByCode,
  needTranslation,
  isChinese,
};
