'use strict';

// language code
const languageCode = {
  Japanese: 'ja',
  English: 'en',
  'Traditional-Chinese': 'zh-TW',
  'Simplified-Chinese': 'zh-CN',
};

// punctuations
const punctuations = {
  first: /。|！|？|\.|!|\?/i,
  second: /、|,/i,
  third: /\u3000| /i,
};

// get audio url
function getAudioUrl(text = '', from = 'English') {
  let textArray = splitText(text);
  let urlArray = [];

  for (let index = 0; index < textArray.length; index++) {
    const text = textArray[index];

    if (text.length > 0) {
      const params =
        `ie=UTF-8&q=${text}&tl=${languageCode[from]}&total=1&idx=0` +
        `&textlen=${text.length}&client=tw-ob&prev=input&ttsspeed=1`;
      urlArray.push(`https://translate.google.com/translate_tts?${encodeURI(params)}`);
    }
  }

  return urlArray;
}

// split text
function splitText(text = '') {
  let startIndex = 0;
  let textArray = [text];

  // 添加安全检查，与 Speechify/ElevenLabs 保持一致
  while (textArray[startIndex] && textArray[startIndex].length >= 200) {
    const result = splitText2(textArray[startIndex]);

    textArray[startIndex] = result[0].trim();
    textArray.push(result[1].trim());

    startIndex++;
  }

  // 过滤空字符串，与 Speechify/ElevenLabs 保持一致
  return textArray.filter(t => t.length > 0);
}

// split text 2
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

// module exports
module.exports = { getAudioUrl };
