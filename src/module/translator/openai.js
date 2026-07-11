'use strict';

const requestModule = require('../system/request-module');

const aiFunction = require('./ai-function');

const configModule = require('../system/config-module');
const { extractChoicesContent } = require('../../utils/safe-extract');

const chatHistoryList = {};

// 兼容用户填「Base URL」(如 http://host/v1) 或「完整端点」(.../chat/completions)
function normalizeChatCompletionsUrl(url = '') {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  return /\/chat\/completions$/i.test(trimmed) ? trimmed : `${trimmed}/chat/completions`;
}

// exec
async function exec(option, type) {
  const response = translate(option.text, option.from, option.to, type);
  return response;
}

// translate
async function translate(text, source, target, type) {
  const config = configModule.getConfig();
  const prompt = aiFunction.createTranslationPrompt(source, target, type);
  // 兼容填「Base URL」或「完整端点」：没带 /chat/completions 就补上
  const apiUrl = normalizeChatCompletionsUrl(config.api.llmApiUrl);
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.api.llmApiKey}`,
  };

  // initialize chat history
  aiFunction.initializeChatHistory(chatHistoryList, prompt, config);

  const payload = {
    model: config.api.llmApiModel,
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
    // 部分 OpenAI 兼容模型不带 max_tokens 会返回空 choices
    max_tokens: 2000,
    //top_p: 1,
  };

  // 禁用思考模式（针对 gpt-5.6-sol/terra 这类推理模型）：不生成 reasoning
  if (config.ai.disableThinking) {
    payload.reasoning_effort = 'none';
  }

  // get response
  const response = await requestModule.post(apiUrl, payload, headers);
  const responseText = extractChoicesContent(response, 'LLM-API');
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

// module exports
module.exports = {
  exec,
};
