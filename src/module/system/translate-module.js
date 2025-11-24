'use strict';

const crypto = require('crypto');

// dialog module
const dialogModule = require('./dialog-module');

// engine module
const engineModule = require('./engine-module');

// translation cache
const { globalCache: translationCache } = require('./translation-cache');
const pendingTranslations = new Map();
const tableHashes = new Map();

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

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function generateTableHash(table = []) {
  try {
    const serialized = stableStringify(table);
    return crypto.createHash('md5').update(serialized).digest('hex');
  } catch (error) {
    console.warn('Failed to hash table, falling back to length-based key', error);
    return `len:${(Array.isArray(table) ? table.length : 0)}`;
  }
}

function getTableHash(table = []) {
  if (!table || (Array.isArray(table) && table.length === 0)) {
    return 'no-table';
  }

  if (tableHashes.has(table)) {
    return tableHashes.get(table);
  }

  const hash = generateTableHash(table);
  tableHashes.set(table, hash);
  return hash;
}

function getCacheKey(text = '', translation = {}, table = [], type = 'sentence') {
  const normalizedText = (text || '')
    .replace(/[\r\n]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\[r\]/gi, '');
  const textHash = crypto.createHash('md5').update(normalizedText).digest('hex');
  const tableHash = getTableHash(table);
  const target = translation.to || '';
  const engine = translation.engine || 'unknown';
  return `${engine}:${textHash}:${tableHash}:${target}:${type || 'sentence'}`;
}

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

    const cacheKey = getCacheKey(text, translation, table, type);

    // ✨ Check cache first (OPTIMIZED: hashed/stable key)
    const cached = translationCache.get(cacheKey, translation.engine);

    if (cached) {
      // Cache hit - return immediately
      return cached;
    }

    // ✅ Deduplicate in-flight requests
    if (pendingTranslations.has(cacheKey)) {
      return pendingTranslations.get(cacheKey);
    }

    const promise = (async () => {
      // Cache miss - perform translation
      const rawResult = await translate2(text, translation, type);

      // zh convert
      const finalResult = zhConvert(clearCode(rawResult, table), translation.to);

      // ✨ Store in cache (hashed key)
      translationCache.set(cacheKey, translation.engine, finalResult);

      return finalResult;
    })();

    pendingTranslations.set(cacheKey, promise);

    try {
      const resolved = await promise;
      return resolved;
    } finally {
      pendingTranslations.delete(cacheKey);
    }

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

    const cacheKey = getCacheKey(text, translation, table, type);

    // Cache short-circuit
    const cached = translationCache.get(cacheKey, translation.engine);
    if (cached) {
      if (onChunk) {
        onChunk(cached);
      }
      return cached;
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

        let processedText = '';
        let lastLength = 0;

        // Call stream translation with chunk callback
        result = await streamFunction(
          option.text,
          option.from,
          option.to,
          type,
          (chunk) => {
            if (typeof chunk !== 'string') {
              return;
            }

            // Only process the newly received delta to avoid O(n^2) work
            let delta = '';
            if (chunk.length >= lastLength) {
              delta = chunk.slice(lastLength);
              lastLength = chunk.length;
            } else {
              // If upstream sends pure deltas, just consume as-is
              delta = chunk;
              lastLength += chunk.length;
            }

            if (!delta) {
              return;
            }

            const processed = zhConvert(clearCode(delta, table), translation.to);
            processedText += processed;

            if (onChunk) {
              onChunk(processedText);
            }
          }
        );

        // zh convert final result (fallback to processed stream buffer)
        const finalResult = processedText || zhConvert(clearCode(result, table), translation.to);

        // ✅ cache after streaming completes
        translationCache.set(cacheKey, translation.engine, finalResult);

        return finalResult;
      }

      // If no option, fall back to regular translation
      return await translate(text, translation, table, type);
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
