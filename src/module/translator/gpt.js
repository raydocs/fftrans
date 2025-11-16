'use strict';

const OpenAI = require('openai');

const aiFunction = require('./ai-function');

const configModule = require('../system/config-module');

const chatHistoryList = {};

const regGptModel = /gpt|o1/i; ///gpt-\d.*[^0-9]$/i

// exec
async function exec(option, type) {
  const response = translate(option.text, option.from, option.to, type);
  return response;
}

// translate (non-streaming)
async function translate(text, source, target, type) {
  const config = configModule.getConfig();
  const prompt = aiFunction.createTranslationPrompt(source, target, type);

  // Create OpenAI client with API key
  const openai = new OpenAI({
    apiKey: config.api.gptApiKey,
  });

  // initialize chat history
  aiFunction.initializeChatHistory(chatHistoryList, prompt, config);

  const messages = [
    {
      role: 'system',
      content: prompt,
    },
    ...chatHistoryList[prompt],
    {
      role: 'user',
      content: text,
    },
  ];

  // get response using official OpenAI SDK
  const response = await openai.chat.completions.create({
    model: config.api.gptModel,
    messages: messages,
    temperature: parseFloat(config.ai.temperature),
  });

  const responseText = response.choices[0].message.content;
  const totalTokens = response?.usage?.total_tokens;

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

// translate with streaming
async function translateStream(text, source, target, type, onChunk) {
  const config = configModule.getConfig();
  const prompt = aiFunction.createTranslationPrompt(source, target, type);

  // Create OpenAI client with API key
  const openai = new OpenAI({
    apiKey: config.api.gptApiKey,
  });

  // initialize chat history
  aiFunction.initializeChatHistory(chatHistoryList, prompt, config);

  const messages = [
    {
      role: 'system',
      content: prompt,
    },
    ...chatHistoryList[prompt],
    {
      role: 'user',
      content: text,
    },
  ];

  // get streaming response using official OpenAI SDK
  const stream = await openai.chat.completions.create({
    model: config.api.gptModel,
    messages: messages,
    temperature: parseFloat(config.ai.temperature),
    stream: true,  // Enable streaming
  });

  let fullText = '';

  // Process stream chunks
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;

    if (delta) {
      fullText += delta;
      // Call the chunk callback to update UI in real-time
      if (onChunk) {
        onChunk(fullText);
      }
    }
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

  // log
  console.log('Streaming completed. Total length:', fullText.length);
  console.log('Prompt:', prompt);
  console.log('Model:', config.api.gptModel);

  return fullText;
}

// get image text
async function getImageText(imageBase64 = '') {
  if (imageBase64 === '') {
    return '';
  }

  try {
    const config = configModule.getConfig();

    // Create OpenAI client with API key
    const openai = new OpenAI({
      apiKey: config.api.gptApiKey,
    });

    const response = await openai.chat.completions.create({
      model: config.api.gptModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: aiFunction.createImagePrompt(),
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.log(error);
    return '';
  }
}

// get model list
async function getModelList(apiKey = null) {
  try {
    // Create OpenAI client with API key
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    const response = await openai.models.list();
    const list = [];

    // Convert async iterator to array
    for await (const model of response) {
      list.push(model.id);
    }

    let modelList = [];

    for (let index = 0; index < list.length; index++) {
      const element = list[index];
      regGptModel.lastIndex = 0;
      if (regGptModel.test(element)) {
        modelList.push(element);
      }
    }

    return modelList.sort();
  } catch (error) {
    console.log(error);
    return [];
  }
}

// module exports
module.exports = {
  exec,
  translate,
  translateStream,
  getImageText,
  getModelList,
};
