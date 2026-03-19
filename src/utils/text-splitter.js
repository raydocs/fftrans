'use strict';

// punctuations for text splitting
const punctuations = {
  first: /。|！|？|\.|!|\?/i,
  second: /、|,/i,
  third: /\u3000| /i,
};

// split text into chunks (max 200 chars at punctuation)
function splitText(text = '') {
  let startIndex = 0;
  let textArray = [text];

  while (textArray[startIndex] && textArray[startIndex].length >= 200) {
    const result = splitText2(textArray[startIndex]);
    textArray[startIndex] = result[0].trim();
    textArray.push(result[1].trim());
    startIndex++;
  }

  return textArray.filter(t => t.length > 0);
}

// split text at punctuation (internal helper)
function splitText2(text = '') {
  for (let index = 199; index >= 0; index--) {
    const char = text[index];
    if (punctuations.first.test(char)) {
      return [text.slice(0, index + 1), text.slice(index + 1)];
    }
  }

  for (let index = 199; index >= 0; index--) {
    const char = text[index];
    if (punctuations.second.test(char)) {
      return [text.slice(0, index + 1), text.slice(index + 1)];
    }
  }

  for (let index = 199; index >= 0; index--) {
    const char = text[index];
    if (punctuations.third.test(char)) {
      return [text.slice(0, index + 1), text.slice(index + 1)];
    }
  }

  return [text.slice(0, 200), text.slice(200)];
}

module.exports = { splitText };
