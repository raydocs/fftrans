'use strict';

const requestModule = require('../system/request-module');

const aiFunction = require('./ai-function');

const configModule = require('../system/config-module');
const { extractChoicesContent } = require('../../utils/safe-extract');

const chatHistoryList = {};

// exec
async function exec(option, type) {
  const response = translate(option.text, option.from, option.to, type);
  return response;
}

// translate
async function translate(text, source, target, type) {
  const config = configModule.getConfig();
  const prompt = aiFunction.createTranslationPrompt(source, target, type);
  const apiUrl = 'https://api.moonshot.cn/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.api.kimiToken}`,
  };

  // initialize chat history
  aiFunction.initializeChatHistory(chatHistoryList, prompt, config);

  const payload = {
    model: config.api.kimiModel,
    messages: [
      {
        role: 'system',
        content: prompt,
      },
      ...chatHistoryList[prompt],
      {
        role: 'user',
        content: text,
      },
    ],
    temperature: parseFloat(config.ai.temperature),
    //top_p: 1,
  };

  // get response
  const response = await requestModule.post(apiUrl, payload, headers);
  const responseText = extractChoicesContent(response, 'Kimi');
  const totalTokens = response?.data?.usage?.total_tokens;

  // push history
  if (config.ai.useChat && type !== 'name') {
    chatHistoryList[prompt].push(
      {
        role: 'user',
        content: text,
      },
      {
        role: 'assistant',
        content: responseText,
      }
    );
  }

  // log
  console.log('Total Tokens:', totalTokens);
  console.log('Prompt:', prompt);

  return responseText;
}

// get image text (vision OCR)
async function getImageText(imageBase64 = '', language = 'Japanese') {
  if (imageBase64 === '') {
    return '';
  }

  try {
    const config = configModule.getConfig();
    const apiUrl = 'https://api.moonshot.cn/v1/chat/completions';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.api.kimiToken}`,
    };

    const payload = {
      model: config.api.kimiModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: aiFunction.createImagePrompt(language) },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ],
        },
      ],
      temperature: parseFloat(config.ai.temperature),
    };

    const response = await requestModule.post(apiUrl, payload, headers);
    return extractChoicesContent(response, 'Kimi');
  } catch (error) {
    console.warn('[Kimi] getImageText failed:', error.message);
    return '';
  }
}

// module exports
module.exports = {
  exec,
  getImageText,
};
