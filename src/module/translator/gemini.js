'use strict';

// https://ai.google.dev/api/generate-content#v1beta.GenerationConfig

const requestModule = require('../system/request-module');

const aiFunction = require('./ai-function');

const configModule = require('../system/config-module');

const chatHistoryList = {};

const safetySettings = [
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_NONE',
  },
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    threshold: 'BLOCK_NONE',
  },
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    threshold: 'BLOCK_NONE',
  },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_NONE',
  },
];

// exec
async function exec(option, type) {
  const response = translate(option.text, option.from, option.to, type);
  return response;
}

// translate (non-streaming)
async function translate(text, source, target, type) {
  const config = configModule.getConfig();
  const model = config.api.geminiModel;
  const apiKey = config.api.geminiApiKey;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const headers = {
    'Content-Type': 'application/json',
  };

  const prompt = aiFunction.createTranslationPrompt(source, target, type);

  // initialize chat history
  aiFunction.initializeChatHistory(chatHistoryList, prompt, config);

  const payload = {
    systemInstruction: {
      parts: [{ text: prompt }],
    },
    contents: [
      ...chatHistoryList[prompt],
      {
        role: 'user',
        parts: [{ text: text }],
      },
    ],
    generationConfig: {
      //stopSequences: ['Title'],
      temperature: parseFloat(config.ai.temperature),
      //maxOutputTokens: 800,
      //topP: 0.8,
      //topK: 10,
    },
  };

  payload.safetySettings = safetySettings;

  const response = await requestModule.post(apiUrl, payload, headers);
  const responseText = response.data.candidates[0].content.parts[0].text.replace(/\r|\n/g, '');

  // push history
  if (config.ai.useChat && type !== 'name') {
    chatHistoryList[prompt].push(
      {
        role: 'user',
        parts: [{ text: text }],
      },
      {
        role: 'model',
        parts: [{ text: responseText }],
      }
    );
  }

  console.log('Prompt:', prompt);

  return responseText;
}

// translate with streaming
async function translateStream(text, source, target, type, onChunk) {
  const axios = require('axios');
  const config = configModule.getConfig();
  const model = config.api.geminiModel;
  const apiKey = config.api.geminiApiKey;
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const prompt = aiFunction.createTranslationPrompt(source, target, type);

  // initialize chat history
  aiFunction.initializeChatHistory(chatHistoryList, prompt, config);

  const payload = {
    systemInstruction: {
      parts: [{ text: prompt }],
    },
    contents: [
      ...chatHistoryList[prompt],
      {
        role: 'user',
        parts: [{ text: text }],
      },
    ],
    generationConfig: {
      temperature: parseFloat(config.ai.temperature),
    },
    safetySettings: safetySettings,
  };

  return new Promise((resolve, reject) => {
    axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
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
              const delta = data.candidates?.[0]?.content?.parts?.[0]?.text;

              if (delta) {
                fullText += delta;
                // Call the chunk callback to update UI in real-time
                if (onChunk) {
                  onChunk(fullText.replace(/\r|\n/g, ''));
                }
              }
            } catch (error) {
              console.error('Error parsing Gemini SSE data:', error, trimmedLine);
            }
          }
        }
      });

      response.data.on('end', () => {
        const cleanText = fullText.replace(/\r|\n/g, '');

        // push history
        if (config.ai.useChat && type !== 'name') {
          chatHistoryList[prompt].push(
            {
              role: 'user',
              parts: [{ text: text }],
            },
            {
              role: 'model',
              parts: [{ text: cleanText }],
            }
          );
        }

        console.log('Streaming completed. Total length:', cleanText.length);
        console.log('Prompt:', prompt);
        console.log('Model:', model);

        resolve(cleanText);
      });

      response.data.on('error', (error) => {
        console.error('Gemini stream error:', error);
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
