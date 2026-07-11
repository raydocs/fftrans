'use strict';

const axios = require('axios');
const requestModule = require('../system/request-module');

const aiFunction = require('./ai-function');

const configModule = require('../system/config-module');
const { extractChoicesContent } = require('../../utils/safe-extract');

const chatHistoryList = {};
const axiosInstance = axios.create({
  httpAgent: requestModule.getHttpAgent(),
  httpsAgent: requestModule.getHttpsAgent(),
  headers: {
    'Accept-Encoding': 'gzip, deflate, br',
  },
  decompress: true,
});

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

// translate with streaming (降低首字延迟：边生成边显示)
async function translateStream(text, source, target, type, onChunk) {
  const config = configModule.getConfig();
  const prompt = aiFunction.createTranslationPrompt(source, target, type);
  const apiUrl = normalizeChatCompletionsUrl(config.api.llmApiUrl);

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
    max_tokens: 2000,
    stream: true,
  };

  // 禁用思考模式（gpt-5.6-sol/terra 等推理模型）
  if (config.ai.disableThinking) {
    payload.reasoning_effort = 'none';
  }

  return new Promise((resolve, reject) => {
    axiosInstance.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api.llmApiKey}`,
      },
      responseType: 'stream',
      timeout: Math.max(10000, parseInt(config.translation.timeout) * 1000),
    })
      .then((response) => {
        let fullText = '';
        let buffer = '';
        let pendingDelta = '';
        const MIN_CHUNK_SIZE = 3;
        const MIN_TIME_BETWEEN_UPDATES = 50;
        let lastUpdateTime = 0;

        response.data.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine === '' || trimmedLine === 'data: [DONE]') {
              continue;
            }

            if (trimmedLine.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmedLine.slice(6));
                const delta = data.choices?.[0]?.delta?.content;

                if (delta) {
                  fullText += delta;
                  pendingDelta += delta;

                  const now = Date.now();
                  if (pendingDelta.length >= MIN_CHUNK_SIZE ||
                      pendingDelta.includes('\n') ||
                      now - lastUpdateTime >= MIN_TIME_BETWEEN_UPDATES) {
                    if (onChunk) {
                      onChunk(fullText);
                      lastUpdateTime = now;
                    }
                    pendingDelta = '';
                  }
                }
              } catch {
                // 忽略不完整 JSON 分片
              }
            }
          }
        });

        response.data.on('end', () => {
          if (pendingDelta && onChunk) {
            onChunk(fullText);
          }

          if (config.ai.useChat && type !== 'name') {
            chatHistoryList[prompt].push(
              {
                role: 'user',
                content: text,
              },
              {
                role: 'assistant',
                content: fullText,
              }
            );
          }

          resolve(fullText);
        });

        response.data.on('error', (error) => {
          reject(error);
        });
      })
      .catch(reject);
  });
}

// module exports
module.exports = {
  exec,
  translate,
  translateStream,
};
