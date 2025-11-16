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

// translate (non-streaming)
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

// translate with streaming (faster perceived response)
async function translateStream(text, source, target, type, onChunk) {
  const axios = require('axios');
  const config = configModule.getConfig();
  const prompt = aiFunction.createTranslationPrompt(source, target, type);
  const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

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
    stream: true,  // Enable streaming
  };

  return new Promise((resolve, reject) => {
    axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api.openRouterApiKey}`,
        'HTTP-Referer': 'https://github.com/raydocs/tataru',
        'X-Title': 'Tataru Assistant',
      },
      responseType: 'stream',
      timeout: Math.max(10000, parseInt(config.translation.timeout) * 1000),
    })
    .then(response => {
      let fullText = '';
      let buffer = '';

      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');

        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine === '' || trimmedLine === 'data: [DONE]') {
            continue;
          }

          if (trimmedLine.startsWith('data: ')) {
            try {
              const jsonStr = trimmedLine.slice(6); // Remove 'data: ' prefix
              const data = JSON.parse(jsonStr);
              const delta = data.choices?.[0]?.delta?.content;

              if (delta) {
                fullText += delta;
                // Call the chunk callback to update UI in real-time
                if (onChunk) {
                  onChunk(fullText);
                }
              }
            } catch (error) {
              console.error('Error parsing SSE data:', error, trimmedLine);
            }
          }
        }
      });

      response.data.on('end', () => {
        // push history
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

        console.log('Streaming completed. Total length:', fullText.length);
        console.log('Prompt:', prompt);
        console.log('Model:', config.api.openRouterModel);

        resolve(fullText);
      });

      response.data.on('error', (error) => {
        console.error('Stream error:', error);
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
