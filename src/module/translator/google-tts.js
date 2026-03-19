'use strict';

// text splitter
const { splitText } = require('../../utils/text-splitter');

// language code
const languageCode = {
  Japanese: 'ja',
  English: 'en',
  'Traditional-Chinese': 'zh-TW',
  'Simplified-Chinese': 'zh-CN',
};

// get audio url
function getAudioUrl(text = '', from = 'English') {
  let textArray = splitText(text);
  let urlArray = [];

  for (let index = 0; index < textArray.length; index++) {
    const text = textArray[index];

    if (text.length > 0) {
      const params =
        `ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(languageCode[from] || 'en')}&total=1&idx=0` +
        `&textlen=${text.length}&client=tw-ob&prev=input&ttsspeed=1`;
      urlArray.push(`https://translate.google.com/translate_tts?${params}`);
    }
  }

  return urlArray;
}

// module exports
module.exports = { getAudioUrl };
