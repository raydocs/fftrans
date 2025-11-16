'use strict';

// dialog module
const dialogModule = require('./dialog-module');

// engine module
const engineModule = require('./engine-module');

// translation cache
const { globalCache: translationCache } = require('./translation-cache');

// translator
const baidu = require('../translator/baidu');
const youdao = require('../translator/youdao');
const caiyun = require('../translator/caiyun');
const papago = require('../translator/papago');
const deepl = require('../translator/deepl');
//const google = require('../translator/google');
const gpt = require('../translator/gpt');
const openai = require('../translator/openai');
const cohere = require('../translator/cohere');
const gemini = require('../translator/gemini');
const kimi = require('../translator/kimi');
const openRouter = require('../translator/openrouter');
const zhConverter = require('../translator/zh-convert');

// translate
async function translate(text = '', translation = {}, table = [], type = 'sentence') {
  let result = '';

  try {
    // clear newline
    text = text.replace(/[\r\n]/g, '');

    // check text
    if (text === '' || translation.from === translation.to) {
      return text;
    }

    // ✨ Check cache first (OPTIMIZED: simplified parameters)
    const cacheKey = `${text}:${JSON.stringify(table)}:${translation.to}`;
    const cached = translationCache.get(cacheKey, translation.engine);

    if (cached) {
      // Cache hit - return immediately
      return cached;
    }

    // Cache miss - perform translation
    result = await translate2(text, translation, type);

    // zh convert
    const finalResult = zhConvert(clearCode(result, table), translation.to);

    // ✨ Store in cache (OPTIMIZED: simplified parameters)
    translationCache.set(cacheKey, translation.engine, finalResult);

    return finalResult;
  } catch (error) {
    console.log(error);
    result = '' + error;
  }

  return result;
}

// translate with streaming (supports OpenRouter, GPT, Gemini)
async function translateStream(text = '', translation = {}, table = [], type = 'sentence', onChunk) {
  let result = '';

  try {
    // clear newline
    text = text.replace(/[\r\n]/g, '');

    // check text
    if (text === '' || translation.from === translation.to) {
      return text;
    }

    // Check if engine supports streaming
    const streamingSupportedEngines = ['OpenRouter', 'GPT', 'Gemini'];

    if (streamingSupportedEngines.includes(translation.engine)) {
      const option = engineModule.getTranslateOption(text, translation.engine, translation);

      if (option) {
        console.log(`\r\nEngine: ${translation.engine} (Streaming)`);

        // Select appropriate streaming function based on engine
        let streamFunction;
        switch (translation.engine) {
          case 'OpenRouter':
            streamFunction = openRouter.translateStream;
            break;
          case 'GPT':
            streamFunction = gpt.translateStream;
            break;
          case 'Gemini':
            streamFunction = gemini.translateStream;
            break;
          default:
            // Fallback to regular translation
            return await translate(text, translation, table, type);
        }

        // Call stream translation with chunk callback
        result = await streamFunction(
          option.text,
          option.from,
          option.to,
          type,
          (chunk) => {
            // Process and send each chunk
            const processed = zhConvert(clearCode(chunk, table), translation.to);
            if (onChunk) {
              onChunk(processed);
            }
          }
        );

        // zh convert final result
        return zhConvert(clearCode(result, table), translation.to);
      }
    } else {
      // Fall back to regular translate for non-streaming engines
      return await translate(text, translation, table, type);
    }
  } catch (error) {
    console.log(error);
    result = '' + error;
  }

  return result;
}

// translate 2
async function translate2(text = '', translation = {}, type = 'sentence') {
  const autoChange = translation.autoChange;
  const engineList = engineModule.getEngineList(translation.engine, translation.engineAlternate);
  const result = { isError: false, text: '' };

  do {
    const engine = engineList.shift();
    const option = engineModule.getTranslateOption(text, engine, translation);

    console.log('\r\nEngine:', engine);

    if (result.isError) {
      dialogModule.addNotification(`Change to ${engine}.`);
    }

    if (option) {
      const result2 = await getTranslation(engine, option, type);
      result.isError = result2.isError;
      result.text = result2.text;
    } else {
      continue;
    }
  } while (result.isError && autoChange && engineList.length > 0);

  return result.text;
}

// get translation
async function getTranslation(engine = '', option = {}, type = 'sentence') {
  console.log('Before:', option?.text);

  let isError = false;
  let text = '';

  try {
    switch (engine) {
      case 'Baidu':
        text = await baidu.exec(option);
        break;

      case 'Youdao':
        text = await youdao.exec(option);
        break;

      case 'Caiyun':
        text = await caiyun.exec(option);
        break;

      case 'Papago':
        text = await papago.exec(option);
        break;

      case 'DeepL':
        text = await deepl.exec(option);
        break;

      case 'GPT':
        text = await gpt.exec(option, type);
        break;

      case 'LLM-API':
        text = await openai.exec(option, type);
        break;

      case 'Cohere':
        text = await cohere.exec(option, type);
        break;

      case 'Gemini':
        text = await gemini.exec(option, type);
        break;
      case 'Kimi':
        text = await kimi.exec(option, type);
        break;

      case 'OpenRouter':
        text = await openRouter.exec(option, type);
        break;

      /*
      case 'Google':
        result = await google.exec(option);
        break;
      */

      default:
        break;
    }
  } catch (error) {
    console.log(error);
    dialogModule.addNotification(error);
    text = '';
    isError = true;
  }

  console.log('After:', text);

  return {
    isError,
    text,
  };
}

// zh convert
function zhConvert(text = '', languageTo = '') {
  if (languageTo === engineModule.languageEnum.zht) {
    text = zhConverter.exec({ text: text, tableName: 'zh2Hant' });
  } else if (languageTo === engineModule.languageEnum.zhs) {
    text = zhConverter.exec({ text: text, tableName: 'zh2Hans' });
  }

  return text;
}

// clear code
function clearCode(text = '', table = []) {
  let halfText = '';
  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    halfText += fullToHalf(ch);
  }
  text = halfText;

  if (table.length > 0) {
    table.forEach((value) => {
      const code = value[0];
      text = text.replaceAll(new RegExp(`${code}+`, 'gi'), code.toUpperCase());
    });
  }

  return text;
}

function fullToHalf(str = '') {
  // full-width English letters: [\uff21-\uff3a\uff41-\uff5a]
  // full-width characters: [\uff01-\uff5e]
  return str
    .replace(/[\uff21-\uff3a\uff41-\uff5a]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    })
    .replace(/\u3000/g, ' ');
}

// module exports
module.exports = {
  translate,
  translateStream,
  getTranslation,
  zhConvert,
  translationCache,  // Export cache for statistics
};
