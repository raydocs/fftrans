'use strict';

const requestModule = require('../system/request-module');

const aiFunction = require('./ai-function');

const configModule = require('../system/config-module');

const { retryWithBackoff } = require('../../utils/retry');
const { extractChoicesContent } = require('../../utils/safe-extract');

const chatHistoryList = {};

// exec
async function exec(option, type) {
  const response = translate(option.text, option.from, option.to, type);
  return response;
}

// translate (non-streaming) with retry logic
async function translate(text, source, target, type) {
  const config = configModule.getConfig();
  const prompt = aiFunction.createTranslationPrompt(source, target, type);
  const apiUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.api.nvidiaApiKey}`,
  };

  // initialize chat history
  aiFunction.initializeChatHistory(chatHistoryList, prompt, config);

  const payload = {
    model: config.api.nvidiaModel || 'nvidia/nemotron-3-super-120b-a12b',
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
    // 某些 NVIDIA 模型不带 max_tokens 会返回空 choices，必须显式设置
    max_tokens: 2000,
  };

  // Execute with retry logic for transient failures
  const response = await retryWithBackoff(
    () => requestModule.post(apiUrl, payload, headers),
    {
      maxRetries: 2,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      onRetry: ({ attempt, error }) => {
        console.log(`[NVIDIA] Retry attempt ${attempt} due to: ${error.message}`);
      }
    }
  );

  const responseText = extractChoicesContent(response, 'NVIDIA');
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
  console.log('Model:', config.api.nvidiaModel);

  return responseText;
}

// module exports
module.exports = {
  exec,
};
