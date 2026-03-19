'use strict';

/**
 * Safely extract nested response text from AI API responses.
 * Throws descriptive error instead of crashing on undefined access.
 */

// OpenAI-compatible: choices[0].message.content (OpenRouter, GPT, Kimi, LLM-API)
function extractChoicesContent(response, label = 'AI') {
  const choices = response?.data?.choices ?? response?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(`[${label}] Empty or missing choices in response`);
  }
  const content = choices[0]?.message?.content;
  if (content == null) {
    throw new Error(`[${label}] Missing message.content in response`);
  }
  return content;
}

// Gemini: candidates[0].content.parts[0].text
function extractGeminiContent(response, label = 'Gemini') {
  const candidates = response?.data?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`[${label}] Empty or missing candidates in response`);
  }
  const text = candidates[0]?.content?.parts?.[0]?.text;
  if (text == null) {
    throw new Error(`[${label}] Missing text in candidates response`);
  }
  return text;
}

// Cohere: message.content[0].text
function extractCohereContent(response, label = 'Cohere') {
  const content = response?.data?.message?.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error(`[${label}] Empty or missing message.content in response`);
  }
  const text = content[0]?.text;
  if (text == null) {
    throw new Error(`[${label}] Missing text in message.content`);
  }
  return text;
}

module.exports = {
  extractChoicesContent,
  extractGeminiContent,
  extractCohereContent,
};
