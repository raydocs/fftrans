'use strict';

const requestModule = require('../system/request-module');

const aiFunction = require('./ai-function');

const configModule = require('../system/config-module');

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
  const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.api.openRouterApiKey}`,
    'HTTP-Referer': 'https://github.com/raydocs/tataru', // Optional, for rankings
    'X-Title': 'Tataru Assistant', // Optional, shows in rankings
  };

  // initialize chat history
  aiFunction.initializeChatHistory(chatHistoryList, prompt, config);

  const payload = {
    model: config.api.openRouterModel || 'openrouter/polaris-alpha',
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
  };

  // get response
  const response = await requestModule.post(apiUrl, payload, headers);
  const responseText = response.data.choices[0].message.content;
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
  console.log('Model:', config.api.openRouterModel);

  return responseText;
}

// module exports
module.exports = {
  exec,
};
