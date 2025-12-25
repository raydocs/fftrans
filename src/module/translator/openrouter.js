'use strict';

const axios = require('axios');
const requestModule = require('../system/request-module');

const aiFunction = require('./ai-function');

const configModule = require('../system/config-module');

// Retry utility for resilient API calls
const { retryWithBackoff } = require('../../utils/retry');

const chatHistoryList = {};
const axiosInstance = axios.create({
  httpAgent: requestModule.getHttpAgent(),
  httpsAgent: requestModule.getHttpsAgent(),
  headers: {
    'Accept-Encoding': 'gzip, deflate, br',  // OPTIMIZATION: Enable compression
  },
  decompress: true,  // Automatically decompress responses
});

// OPTIMIZATION: Connection warmup state
let connectionWarmedUp = false;

/**
 * OPTIMIZATION: Warm up connection to OpenRouter
 * Establishes TCP+TLS connection in advance to reduce first request latency
 * Call this during application startup
 */
async function warmupConnection() {
  if (connectionWarmedUp) {
    return;
  }

  try {
    console.log('[OpenRouter] Warming up connection...');
    const config = configModule.getConfig();

    // Make a lightweight request to establish connection
    // Using /models endpoint which is fast and doesn't consume tokens
    const apiUrl = 'https://openrouter.ai/api/v1/models';

    await axiosInstance.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${config.api.openRouterApiKey}`,
        'HTTP-Referer': 'https://github.com/raydocs/tataru',
        'X-Title': 'Tataru Assistant',
      },
      timeout: 5000,
    });

    connectionWarmedUp = true;
    console.log('[OpenRouter] ✅ Connection warmed up successfully');
  } catch (error) {
    // Warmup failure is non-critical
    console.warn('[OpenRouter] ⚠️  Warmup failed (non-critical):', error.message);
  }
}

function buildProxyConfig(config) {
  if (!config.proxy?.enable) {
    return false;
  }

  const proxy = {
    protocol: (config.proxy.protocol || '').replace(':', ''),
    host: config.proxy.hostname,
    port: parseInt(config.proxy.port),
  };

  if (config.proxy.username && config.proxy.password) {
    proxy.auth = {
      username: config.proxy.username,
      password: config.proxy.password,
    };
  }

  return proxy;
}

// exec
async function exec(option, type) {
  const response = translate(option.text, option.from, option.to, type);
  return response;
}

// translate (non-streaming) with retry logic
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

  // Execute with retry logic for transient failures
  const response = await retryWithBackoff(
    () => requestModule.post(apiUrl, payload, headers),
    {
      maxRetries: 2,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      onRetry: ({ attempt, error }) => {
        console.log(`[OpenRouter] Retry attempt ${attempt} due to: ${error.message}`);
      }
    }
  );

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
    axiosInstance.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api.openRouterApiKey}`,
        'HTTP-Referer': 'https://github.com/raydocs/tataru',
        'X-Title': 'Tataru Assistant',
      },
      responseType: 'stream',
      timeout: Math.max(10000, parseInt(config.translation.timeout) * 1000),
      proxy: buildProxyConfig(config),
      // Reuse connection pool for better performance
      httpAgent: requestModule.getHttpAgent(),
      httpsAgent: requestModule.getHttpsAgent(),
    })
    .then(response => {
      let fullText = '';
      let buffer = '';
      // OPTIMIZATION: Buffer small deltas before triggering callback
      let pendingDelta = '';
      const MIN_CHUNK_SIZE = 3;  // Increased from 1 to reduce callback frequency
      const MIN_TIME_BETWEEN_UPDATES = 50;  // Minimum 50ms between updates
      let lastUpdateTime = 0;

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
                pendingDelta += delta;

                // OPTIMIZATION: Trigger callback based on:
                // 1. Chunk size threshold (reduce frequency)
                // 2. Newline character (sentence boundary)
                // 3. Time threshold (ensure smooth streaming)
                const now = Date.now();
                const timeSinceLastUpdate = now - lastUpdateTime;

                if (pendingDelta.length >= MIN_CHUNK_SIZE ||
                    pendingDelta.includes('\n') ||
                    timeSinceLastUpdate >= MIN_TIME_BETWEEN_UPDATES) {
                  if (onChunk) {
                    onChunk(fullText);
                    lastUpdateTime = now;
                  }
                  pendingDelta = '';
                }
              }
            } catch {
              // Silently ignore parse errors for incomplete JSON
              if (process.env.NODE_ENV !== 'production') {
                console.debug('SSE parse skip:', trimmedLine.substring(0, 50));
              }
            }
          }
        }
      });

      response.data.on('end', () => {
        // Flush any remaining pending delta
        if (pendingDelta && onChunk) {
          onChunk(fullText);
        }

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
  warmupConnection,  // OPTIMIZATION: Export warmup function
};
