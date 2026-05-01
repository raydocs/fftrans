'use strict';

/*
// old prompts
'I want you to act as an expert translator.'
`You will be provided with a ${type} in ${source}, and your task is to translate it into ${target}. Your response should not be in ${source}.`
`Translate the following text from ${source} to ${target} and do not include any explanation.`
`You are a professional translation machine, your job is to translate the ${source} name and sentence provided by the user into ${target} and do not include any explanation. Use homophonic translation if it is not a word or phrase in ${source}.`
`Translate the following ${type} from ${source} into ${target} and do not include any explanation.`;
`Translate ${source} ${type} provided by user into ${target} and do not make any explanation.`;
`Translate ${source} text into ${target} and don't make any explanations.`;

const role = source && target ? `${source}-${target} translator` : 'translator';
`Act as a professional ${role}, your job is translating everything what user provided.`
*/

const configModule = require('../system/config-module');

function appendNamePreservationRules(prompt = '') {
  const rules = [
    'Preserve all character, player, NPC, place, and proper names exactly as written in the source text.',
    'Do not translate, localize, romanize, transliterate, or annotate names.',
    'Do not add Japanese readings, pronunciation notes, parentheses, explanations, or metadata.',
    'Return only the translated line.'
  ];

  return `${prompt.trim()} ${rules.join(' ')}`.trim();
}

function createTranslationPrompt(source = 'English', target = 'Chinese', type = 'sentence', withGlossary = false) {
  const customPrompt = configModule.getConfig().ai.customTranslationPrompt?.trim();
  const glossaryRule = withGlossary
    ? ' The user input is JSON; translate only the "text" field, use glossary entries when relevant, and return only the translated text.'
    : '';

  if (customPrompt) {
    if (source === '') {
      source = 'any languages';
    }

    return appendNamePreservationRules(
      `${customPrompt.replaceAll('${source}', source).replaceAll('${target}', target).replaceAll('${type}', type)}${glossaryRule}`
    );
  } else {
    return appendNamePreservationRules(`Translate ${source} text into ${target}, and don't provide any explanations.${glossaryRule}`);
  }
}

function createImagePrompt() {
  return `Copy the text from the image, and don't provide any explanations.`;
}

// initialize chat history
function initializeChatHistory(chatHistoryList = {}, prompt = '', config = {}) {
  const chatLength = parseInt(config.ai.useChat ? config.ai.chatLength : '0');

  if (!Array.isArray(chatHistoryList[prompt])) {
    chatHistoryList[prompt] = [];
  }

  while (chatHistoryList[prompt].length > chatLength * 2) {
    chatHistoryList[prompt].shift();
    chatHistoryList[prompt].shift();
  }
}

// create glossary
const GLOSSARY_LANGUAGE_INDEXES = {
  Japanese: [0],
  English: [1],
  Chinese: [3, 2],
  'Traditional-Chinese': [2],
  'Simplified-Chinese': [3],
};

function isValidGlossaryValue(value) {
  return typeof value === 'string' && value.trim() !== '' && value !== 'N/A';
}

function isUsableGlossaryEntry(entry = []) {
  return Array.isArray(entry)
    && entry.length >= 2
    && typeof entry[0] === 'string'
    && !entry[0].trim().startsWith('//');
}

function pickGlossaryValue(entry = [], language = '', fallbackIndex = 0) {
  if (entry.length >= 4 && GLOSSARY_LANGUAGE_INDEXES[language]) {
    for (const index of GLOSSARY_LANGUAGE_INDEXES[language]) {
      const value = entry[index];
      if (isValidGlossaryValue(value)) {
        return value;
      }
    }

    return undefined;
  }

  const fallbackValue = entry[fallbackIndex];
  return isValidGlossaryValue(fallbackValue) ? fallbackValue : undefined;
}

function createGlossary(source = 'English', target = 'Chinese', table = []) {
  if (!Array.isArray(table) || table.length === 0) {
    return [];
  }

  const sourceLabel = source || 'source';
  const targetLabel = target || 'target';

  return table
    .filter(isUsableGlossaryEntry)
    .map((entry) => ({
      sourceValue: pickGlossaryValue(entry, sourceLabel, 0),
      targetValue: pickGlossaryValue(entry, targetLabel, 1),
    }))
    .filter(({ sourceValue, targetValue }) => sourceValue && targetValue)
    .map(({ sourceValue, targetValue }) => ({
      [sourceLabel]: sourceValue,
      [targetLabel]: targetValue,
    }));
}

module.exports = {
  createTranslationPrompt,
  createImagePrompt,
  initializeChatHistory,
  createGlossary,
};
