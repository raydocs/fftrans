#!/usr/bin/env node
'use strict';

const { performance } = require('perf_hooks');
const aiFunction = require('../src/module/translator/ai-function');

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.split('=');
  return [key.replace(/^--/, ''), value || true];
}));

const samples = parseInt(args.get('samples') || '200', 10);
const batchSize = parseInt(args.get('batch') || '1000', 10);
const source = args.get('source') || 'English';
const target = args.get('target') || 'Chinese';
const type = args.get('type') || 'sentence';
const temperature = parseFloat(args.get('temperature') || '0.7');

const text = 'Alphinaud adjusts the aetherometer while Krile watches the Crystal Tower shimmer.';
const table = [
  ['//comment', '-------------', '-------------', '-------------'],
  ['アルフィノ', 'Alphinaud', '阿尔菲诺', '阿尔菲诺'],
  ['クルル', 'Krile', '可露儿', '可露儿'],
  ['クリスタルタワー', 'Crystal Tower', '水晶塔', '水晶塔'],
  ['N/A', 'aetherometer', '以太测量仪', '以太测量仪'],
  ['エオルゼア', 'Eorzea', '艾欧泽亚', '艾欧泽亚'],
  ['暁の血盟', 'Scions of the Seventh Dawn', '拂晓血盟', '拂晓血盟'],
  ['タタル', 'Tataru', '塔塔露', '塔塔露'],
  ['シャーレアン', 'Sharlayan', '萨雷安', '萨雷安'],
  ['サンクレッド', 'Thancred', '桑克瑞德', '桑克瑞德'],
  ['ヤ・シュトラ', 'Y\'shtola', '雅·修特拉', '雅·修特拉'],
  ['ウリエンジェ', 'Urianger', '于里昂热', '于里昂热'],
  ['エスティニアン', 'Estinien', '埃斯蒂尼安', '埃斯蒂尼安'],
  ['アラミゴ', 'Ala Mhigo', '阿拉米格', '阿拉米格'],
  ['イシュガルド', 'Ishgard', '伊修加德', '伊修加德'],
  ['リムサ・ロミンサ', 'Limsa Lominsa', '利姆萨·罗敏萨', '利姆萨·罗敏萨'],
  ['ウルダハ', 'Ul\'dah', '乌尔达哈', '乌尔达哈'],
  ['グリダニア', 'Gridania', '格里达尼亚', '格里达尼亚'],
  ['ガレマルド', 'Garlemald', '加雷马', '加雷马'],
  ['ハイデリン', 'Hydaelyn', '海德林', '海德林'],
  ['ゾディアーク', 'Zodiark', '佐迪亚克', '佐迪亚克'],
  ['N/A', 'N/A', '应过滤', '应过滤'],
];

const safetySettings = [
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
];

function createPrompt(withGlossary) {
  return aiFunction.createTranslationPrompt(source, target, type, withGlossary);
}

function createGlossary() {
  return aiFunction.createGlossary(source, target, table);
}

function buildPromptOnlyRequest() {
  const prompt = createPrompt(false);

  return {
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [
      {
        role: 'user',
        parts: [{ text }],
      },
    ],
    generationConfig: { temperature },
    safetySettings,
  };
}

function buildGlossaryRequest() {
  const prompt = createPrompt(true);
  const glossary = createGlossary();

  return {
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: JSON.stringify({ text, glossary }),
          },
        ],
      },
    ],
    generationConfig: { temperature },
    safetySettings,
  };
}

function measure(name, build) {
  const timings = [];
  let lastPayload = null;

  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    for (let index = 0; index < batchSize; index++) {
      lastPayload = build();
    }
    const elapsed = performance.now() - start;
    timings.push(elapsed / batchSize);
  }

  timings.sort((a, b) => a - b);
  const median = timings[Math.floor(timings.length / 2)];
  const p95 = timings[Math.floor(timings.length * 0.95)];
  const payloadBytes = Buffer.byteLength(JSON.stringify(lastPayload), 'utf8');

  return { name, median, p95, payloadBytes };
}

const promptOnly = measure('prompt-only', buildPromptOnlyRequest);
const glossary = measure('glossary', buildGlossaryRequest);
const overhead = {
  median: glossary.median - promptOnly.median,
  p95: glossary.p95 - promptOnly.p95,
  payloadBytes: glossary.payloadBytes - promptOnly.payloadBytes,
};

console.log(JSON.stringify({ samples, batchSize, promptOnly, glossary, overhead }, null, 2));
console.log('| mode | median ms/op | p95 ms/op | payload bytes |');
console.log('|---|---:|---:|---:|');
for (const row of [promptOnly, glossary]) {
  console.log(`| ${row.name} | ${row.median.toFixed(6)} | ${row.p95.toFixed(6)} | ${row.payloadBytes} |`);
}
console.log(`| overhead | ${overhead.median.toFixed(6)} | ${overhead.p95.toFixed(6)} | ${overhead.payloadBytes} |`);
