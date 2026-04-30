'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_BASE_URL = process.env.NVIDIA_API_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const API_KEY = process.env.NVIDIA_API_KEY;
const REQUEST_TIMEOUT_MS = parseInteger(process.env.FF14_BENCH_TIMEOUT_MS, 25000);
const OUTPUT_DIR = path.join(__dirname, '..', 'reports');
const OUTPUT_JSON_PATH = path.join(OUTPUT_DIR, 'ff14-nvidia-benchmark.json');
const OUTPUT_HTML_PATH = path.join(OUTPUT_DIR, 'ff14-nvidia-benchmark.html');

const SOURCE_URL = 'https://ffxiv.consolegameswiki.com/wiki/Purple_Flame,_Purple_Flame';

const DATASET = [
  {
    id: 'line-1',
    speaker: 'Estinien',
    text: 'If we are to lure our foes to our position, then we must find a means of producing a signal of purple hue.',
    reference: '若要引敌前来，我们必须想办法发出紫色信号。',
    concepts: [
      /(引|诱).{0,6}敌|敌.{0,6}(引|诱)/,
      /紫/,
      /(信号|讯号|烟|烟雾)/,
    ],
  },
  {
    id: 'line-2',
    speaker: 'Iceheart',
    text: 'So, you seek to stem the Dravanian tide with talk? A romantic notion.',
    reference: '你想靠言语阻止龙族攻势？真是天真的想法。',
    concepts: [
      /(谈|说|言语|交涉|谈判)/,
      /(龙|龙族|攻势|大军|浪潮|进攻|来袭)/,
      /(天真|浪漫|异想天开|不切实际)/,
    ],
  },
  {
    id: 'line-3',
    speaker: 'Iceheart',
    text: 'If you but knew the truth─the spark which lit the flames of this animosity─you would understand the futility of your quest.',
    reference: '若你知晓点燃这场仇恨之火的真相，便会明白你的追求有多徒劳。',
    concepts: [
      /真相/,
      /(仇|怨|敌意|仇恨)/,
      /(徒劳|无用|枉然|白费|无益)/,
    ],
  },
  {
    id: 'line-4',
    speaker: 'Estinien',
    text: 'I believe reason has all but left him. Through the Eye, I feel much of what Nidhogg feels, and the dragon\'s thirst for vengeance will not be quenched by aught less than a sea of blood.',
    reference: '我觉得他几乎已经失去理智。透过龙眼，我能感受到尼德霍格的所思所想，而那条龙对复仇的渴求，唯有血海方能平息。',
    concepts: [
      /(失去理智|丧失理智|疯狂|失去理性)/,
      /(龙眼|眼)/,
      /(尼德霍格|Nidhogg)/,
      /复仇/,
      /(血海|鲜血|血)/,
    ],
  },
  {
    id: 'line-5',
    speaker: 'Iceheart',
    text: 'You still believe that a peaceable solution can be found? Very well. I will take you to him.',
    reference: '你竟还相信能找到和平的办法？也罢，我带你去见他。',
    concepts: [
      /(和平|和解)/,
      /(办法|方案|解决|出路)/,
      /(带|领)/,
      /(见他|去见|带你去)/,
    ],
  },
  {
    id: 'line-6',
    speaker: 'Iceheart',
    text: 'Our road will lead us to Dravania, the homeland of dragonkind. There we shall ascend unto the clouds, where Hraesvelgr resides...',
    reference: '我们的路将通往龙族的故乡德拉瓦尼亚。我们将在那里登上云端，赫拉斯瓦尔格便栖居其上。',
    concepts: [
      /(德拉瓦尼亚|Dravania)/,
      /(龙族|龙裔)/,
      /(云|云端|高空)/,
      /(赫拉斯瓦尔格|Hraesvelgr)/,
    ],
  },
];

const MODELS = [
  {
    label: 'MiniMax M2.7',
    id: 'minimaxai/minimax-m2.7',
    strategy: 'Prompt-only no-think instruction; NVIDIA hosted endpoint still tends to leak <think> blocks.',
    payload: {},
  },
  {
    label: 'MiniMax M2.5',
    id: 'minimaxai/minimax-m2.5',
    strategy: 'Prompt-only no-think instruction; NVIDIA hosted endpoint still tends to leak <think> blocks.',
    payload: {},
  },
  {
    label: 'GLM-5',
    id: 'z-ai/glm5',
    strategy: 'Use chat_template_kwargs.enable_thinking=false and clear_thinking=false.',
    payload: {
      chat_template_kwargs: {
        enable_thinking: false,
        clear_thinking: false,
      },
      include_reasoning: false,
    },
  },
  {
    label: 'Step 3.5 Flash',
    id: 'stepfun-ai/step-3.5-flash',
    strategy: 'No reliable no-think switch found on NVIDIA hosted endpoint; prompt-only suppression.',
    payload: {},
  },
  {
    label: 'Kimi K2.5',
    id: 'moonshotai/kimi-k2.5',
    strategy: 'Use chat_template_kwargs.thinking=false; optionally hide reasoning with include_reasoning=false.',
    payload: {
      chat_template_kwargs: {
        thinking: false,
      },
      include_reasoning: false,
    },
  },
  {
    label: 'Llama 4 Maverick',
    id: 'meta/llama-4-maverick-17b-128e-instruct',
    strategy: 'No extra switch needed in practice; returns direct subtitle text.',
    payload: {},
  },
  {
    label: 'Gemma 4 31B',
    id: 'google/gemma-4-31b-it',
    strategy: 'No reliable NVIDIA-hosted no-think switch confirmed; prompt-only suppression.',
    payload: {},
  },
  {
    label: 'Mistral Large 3',
    id: 'mistralai/mistral-large-3-675b-instruct-2512',
    strategy: 'No extra switch needed in practice; returns direct subtitle text.',
    payload: {},
  },
  {
    label: 'Qwen 3.5 122B',
    id: 'qwen/qwen3.5-122b-a10b',
    strategy: 'Use chat_template_kwargs.enable_thinking=false.',
    payload: {
      chat_template_kwargs: {
        enable_thinking: false,
      },
      include_reasoning: false,
    },
  },
];

async function main() {
  if (!API_KEY) {
    console.error('Missing NVIDIA_API_KEY. Example: NVIDIA_API_KEY=nvapi-... node scripts/benchmark-ff14-nvidia.js');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Running FF14 subtitle benchmark against ${MODELS.length} models x ${DATASET.length} lines...`);

  const startedAt = new Date();
  const modelResults = [];

  for (const model of MODELS) {
    console.log(`\n=== ${model.label} (${model.id}) ===`);
    const lineResults = [];

    for (const line of DATASET) {
      console.log(`-> ${line.id} ${line.speaker}`);
      const result = await runLineBenchmark(model, line);
      lineResults.push(result);

      const statusLabel = result.error
        ? `error: ${result.error}`
        : `${result.finishReason || 'unknown-finish'} | usable=${result.usable ? 'yes' : 'no'} | ${result.responseMs}ms`;
      console.log(`   ${statusLabel}`);
    }

    modelResults.push(summarizeModel(model, lineResults));
  }

  const finishedAt = new Date();
  const report = {
    meta: {
      title: 'FF14 NVIDIA Hosted Subtitle Benchmark',
      sourceUrl: SOURCE_URL,
      apiBaseUrl: API_BASE_URL,
      generatedAt: finishedAt.toISOString(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      timeoutMs: REQUEST_TIMEOUT_MS,
      methodology: [
        'Use six FF14 quest dialogue lines from Purple Flame, Purple Flame as subtitle-style English input.',
        'Send one request per subtitle line with a subtitle-only localization prompt.',
        'Apply per-model no-think switches where NVIDIA documentation or live tests showed them to work.',
        'Measure end-to-end latency, usable subtitle rate, finish reason, visible thinking leakage, and heuristic translation accuracy.',
        'Accuracy score is heuristic: concept coverage plus reference-string similarity. It is good for side-by-side comparison, not a human localization replacement.',
      ],
      datasetSize: DATASET.length,
      models: MODELS.map((model) => ({
        label: model.label,
        id: model.id,
        strategy: model.strategy,
      })),
    },
    dataset: DATASET,
    models: modelResults,
  };

  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(report, null, 2));
  fs.writeFileSync(OUTPUT_HTML_PATH, renderHtmlReport(report));

  console.log(`\nSaved JSON report to ${OUTPUT_JSON_PATH}`);
  console.log(`Saved HTML report to ${OUTPUT_HTML_PATH}`);
}

async function runLineBenchmark(model, line) {
  const payload = {
    model: model.id,
    temperature: 0.1,
    max_tokens: 160,
    stream: false,
    messages: [
      {
        role: 'system',
        content: [
          'You are localizing Final Fantasy XIV quest dialogue into concise, natural Simplified Chinese subtitle lines.',
          'Return only the final Chinese subtitle text.',
          'Do not output reasoning, thinking tags, analysis, bullet points, or explanations.',
          'Keep lore names consistent and natural for Chinese RPG subtitles.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `${line.speaker}: ${line.text}`,
      },
    ],
    ...model.payload,
  };

  const start = Date.now();

  try {
    const response = await axios.post(`${API_BASE_URL}/chat/completions`, payload, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      validateStatus(status) {
        return status >= 200 && status < 500;
      },
    });

    const responseMs = Date.now() - start;
    const choice = response.data?.choices?.[0] || {};
    const message = choice.message || {};
    const rawContent = typeof message.content === 'string' ? message.content : '';
    const cleanedContent = cleanSubtitleOutput(rawContent);
    const thinkingLeak = detectThinkingLeak(message, rawContent);
    const usable = Boolean(cleanedContent) && !containsAsciiEcho(cleanedContent) && choice.finish_reason !== 'length';
    const accuracyScore = cleanedContent
      ? calculateAccuracyScore(cleanedContent, line.reference, line.concepts)
      : 0;
    const latencyScore = calculateLatencyScore(responseMs);
    const usabilityScore = calculateUsabilityScore({ cleanedContent, thinkingLeak, finishReason: choice.finish_reason, error: null });
    const overallScore = roundNumber((accuracyScore * 0.45) + (usabilityScore * 0.35) + (latencyScore * 0.20), 1);

    return {
      lineId: line.id,
      speaker: line.speaker,
      source: line.text,
      reference: line.reference,
      responseMs,
      finishReason: choice.finish_reason || null,
      rawContent,
      cleanedContent,
      reasoning: pickFirstString(message.reasoning, message.reasoning_content, message.thinking),
      usage: response.data?.usage || null,
      thinkingLeak,
      usable,
      accuracyScore,
      latencyScore,
      usabilityScore,
      overallScore,
      error: null,
      httpStatus: response.status,
    };
  } catch (error) {
    const responseMs = Date.now() - start;
    return {
      lineId: line.id,
      speaker: line.speaker,
      source: line.text,
      reference: line.reference,
      responseMs,
      finishReason: null,
      rawContent: '',
      cleanedContent: '',
      reasoning: null,
      usage: null,
      thinkingLeak: false,
      usable: false,
      accuracyScore: 0,
      latencyScore: 0,
      usabilityScore: 0,
      overallScore: 0,
      error: extractErrorMessage(error),
      httpStatus: error.response?.status || null,
    };
  }
}

function summarizeModel(model, lineResults) {
  const successful = lineResults.filter((result) => !result.error);
  const usable = lineResults.filter((result) => result.usable);
  const leaks = lineResults.filter((result) => result.thinkingLeak);
  const accuracyValues = successful.map((result) => result.accuracyScore);
  const latencyValues = successful.map((result) => result.responseMs).sort((left, right) => left - right);
  const overallValues = successful.map((result) => result.overallScore);

  const averageLatencyMs = averageNumber(latencyValues);
  const p95LatencyMs = latencyValues.length > 0
    ? latencyValues[Math.min(latencyValues.length - 1, Math.floor(latencyValues.length * 0.95))]
    : null;
  const accuracyAverage = averageNumber(accuracyValues);
  const overallAverage = averageNumber(overallValues);
  const usableRate = lineResults.length > 0 ? usable.length / lineResults.length : 0;
  const leakRate = lineResults.length > 0 ? leaks.length / lineResults.length : 0;
  const successRate = lineResults.length > 0 ? successful.length / lineResults.length : 0;

  return {
    label: model.label,
    id: model.id,
    strategy: model.strategy,
    verdict: determineVerdict({ usableRate, averageLatencyMs, accuracyAverage, leakRate }),
    successRate: roundNumber(successRate * 100, 1),
    usableRate: roundNumber(usableRate * 100, 1),
    leakRate: roundNumber(leakRate * 100, 1),
    averageLatencyMs: averageLatencyMs == null ? null : roundNumber(averageLatencyMs, 1),
    p95LatencyMs,
    accuracyAverage: roundNumber(accuracyAverage, 1),
    overallAverage: roundNumber(overallAverage, 1),
    lineResults,
  };
}

function determineVerdict({ usableRate, averageLatencyMs, accuracyAverage, leakRate }) {
  if (usableRate >= 0.8 && averageLatencyMs != null && averageLatencyMs <= 3000 && accuracyAverage >= 70 && leakRate <= 0.2) {
    return 'Recommended for realtime subtitles';
  }

  if (usableRate >= 0.6 && averageLatencyMs != null && averageLatencyMs <= 8000 && accuracyAverage >= 60) {
    return 'Usable with caveats';
  }

  if (usableRate >= 0.4 && accuracyAverage >= 45) {
    return 'Borderline for live subtitles';
  }

  return 'Not suitable for low-latency subtitles';
}

function cleanSubtitleOutput(rawContent) {
  if (!rawContent) {
    return '';
  }

  let cleaned = rawContent
    .replace(/<\s*(think|thinking|reasoning|reflection|scratchpad|inner_monologue)[^>]*>[\s\S]*?<\s*\/\s*(think|thinking|reasoning|reflection|scratchpad|inner_monologue)\s*>/gi, '')
    .replace(/<\s*\/?\s*(think|thinking|reasoning|reflection|scratchpad|inner_monologue)[^>]*>/gi, '')
    .replace(/^[\s\n\r]+/, '')
    .trim();

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return '';
  }

  cleaned = lines.join(' ');
  cleaned = cleaned.replace(/^['"“”‘’\-–—:：]+/, '').trim();
  return cleaned;
}

function detectThinkingLeak(message, rawContent) {
  return Boolean(
    pickFirstString(message.reasoning, message.reasoning_content, message.thinking)
    || /<\s*(think|thinking|reasoning|reflection|scratchpad|inner_monologue)/i.test(rawContent || '')
  );
}

function containsAsciiEcho(text) {
  if (!text) {
    return false;
  }

  const asciiLetters = (text.match(/[A-Za-z]/g) || []).length;
  return asciiLetters > 12 && asciiLetters / text.length > 0.4;
}

function calculateAccuracyScore(output, reference, concepts) {
  const similarity = calculateDiceSimilarity(normalizeChineseText(output), normalizeChineseText(reference));
  const conceptHits = concepts.filter((pattern) => pattern.test(output)).length;
  const conceptScore = concepts.length === 0 ? 1 : conceptHits / concepts.length;
  return roundNumber(((conceptScore * 0.65) + (similarity * 0.35)) * 100, 1);
}

function calculateLatencyScore(responseMs) {
  if (responseMs <= 2000) {
    return 100;
  }
  if (responseMs <= 4000) {
    return 85;
  }
  if (responseMs <= 8000) {
    return 65;
  }
  if (responseMs <= 15000) {
    return 40;
  }
  if (responseMs <= REQUEST_TIMEOUT_MS) {
    return 15;
  }
  return 0;
}

function calculateUsabilityScore({ cleanedContent, thinkingLeak, finishReason, error }) {
  if (error) {
    return 0;
  }
  if (!cleanedContent) {
    return 10;
  }
  if (thinkingLeak && finishReason === 'length') {
    return 20;
  }
  if (finishReason === 'length') {
    return 45;
  }
  if (thinkingLeak) {
    return 65;
  }
  return 100;
}

function normalizeChineseText(value) {
  return (value || '')
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()【】\[\]<>《》]/g, '')
    .trim();
}

function calculateDiceSimilarity(left, right) {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }

  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);

  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return 0;
  }

  const counts = new Map();
  for (const token of leftBigrams) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  let overlap = 0;
  for (const token of rightBigrams) {
    const count = counts.get(token) || 0;
    if (count > 0) {
      counts.set(token, count - 1);
      overlap += 1;
    }
  }

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function buildBigrams(text) {
  if (text.length < 2) {
    return [text];
  }
  const result = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    result.push(text.slice(index, index + 2));
  }
  return result;
}

function averageNumber(values) {
  if (!values || values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundNumber(value, digits = 0) {
  if (value == null || Number.isNaN(value)) {
    return 0;
  }
  return Number(value.toFixed(digits));
}

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return null;
}

function extractErrorMessage(error) {
  if (error.response?.data?.error?.message) {
    return String(error.response.data.error.message);
  }
  if (error.response?.data?.message) {
    return String(error.response.data.message);
  }
  if (error.code === 'ECONNABORTED') {
    return `timeout after ${REQUEST_TIMEOUT_MS}ms`;
  }
  return error.message || String(error);
}

function parseInteger(value, fallbackValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtmlReport(report) {
  const rankedModels = [...report.models].sort((left, right) => {
    if (right.overallAverage !== left.overallAverage) {
      return right.overallAverage - left.overallAverage;
    }
    return (left.averageLatencyMs || Number.MAX_SAFE_INTEGER) - (right.averageLatencyMs || Number.MAX_SAFE_INTEGER);
  });

  const summaryRows = rankedModels.map((model, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(model.label)}</td>
      <td><code>${escapeHtml(model.id)}</code></td>
      <td>${escapeHtml(model.verdict)}</td>
      <td>${model.usableRate}%</td>
      <td>${model.leakRate}%</td>
      <td>${formatMs(model.averageLatencyMs)}</td>
      <td>${formatMs(model.p95LatencyMs)}</td>
      <td>${model.accuracyAverage}</td>
      <td>${model.overallAverage}</td>
    </tr>
  `).join('');

  const detailSections = rankedModels.map((model) => {
    const lineRows = model.lineResults.map((line) => `
      <tr>
        <td>${escapeHtml(line.lineId)}</td>
        <td>${escapeHtml(line.speaker)}</td>
        <td>${formatMs(line.responseMs)}</td>
        <td>${escapeHtml(line.finishReason || line.error || '-')}</td>
        <td>${line.thinkingLeak ? 'Yes' : 'No'}</td>
        <td>${line.usable ? 'Yes' : 'No'}</td>
        <td>${line.accuracyScore}</td>
        <td>${line.overallScore}</td>
        <td class="source-cell">${escapeHtml(line.source)}</td>
        <td class="output-cell">${escapeHtml(line.cleanedContent || line.rawContent || line.error || '')}</td>
      </tr>
    `).join('');

    return `
      <section class="model-section">
        <h2>${escapeHtml(model.label)}</h2>
        <p class="strategy"><strong>No-think strategy:</strong> ${escapeHtml(model.strategy)}</p>
        <div class="stats-grid">
          <div class="stat-card"><span>Verdict</span><strong>${escapeHtml(model.verdict)}</strong></div>
          <div class="stat-card"><span>Usable rate</span><strong>${model.usableRate}%</strong></div>
          <div class="stat-card"><span>Thinking leak rate</span><strong>${model.leakRate}%</strong></div>
          <div class="stat-card"><span>Avg latency</span><strong>${formatMs(model.averageLatencyMs)}</strong></div>
          <div class="stat-card"><span>Accuracy</span><strong>${model.accuracyAverage}</strong></div>
          <div class="stat-card"><span>Overall</span><strong>${model.overallAverage}</strong></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>Speaker</th>
              <th>Latency</th>
              <th>Finish</th>
              <th>Think leak</th>
              <th>Usable</th>
              <th>Accuracy</th>
              <th>Overall</th>
              <th>Source</th>
              <th>Output</th>
            </tr>
          </thead>
          <tbody>${lineRows}</tbody>
        </table>
      </section>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FF14 NVIDIA Hosted Subtitle Benchmark</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f4ef;
      --panel: #fffdf7;
      --ink: #1d1a17;
      --muted: #6d655b;
      --line: #ddd3c3;
      --accent: #8b2f2f;
      --accent-soft: #efe2d1;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Georgia, "Iowan Old Style", "Noto Serif SC", serif;
      background: radial-gradient(circle at top, #fff9ef 0%, var(--bg) 55%, #ece6db 100%);
      color: var(--ink);
      line-height: 1.6;
    }

    main {
      width: min(1400px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 72px;
    }

    .hero,
    .panel,
    .model-section {
      background: color-mix(in srgb, var(--panel) 94%, white 6%);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: 0 16px 48px rgba(50, 33, 20, 0.08);
    }

    .hero {
      padding: 28px;
      margin-bottom: 24px;
      background: linear-gradient(145deg, rgba(139, 47, 47, 0.08), rgba(255, 250, 240, 0.95));
    }

    .panel,
    .model-section {
      padding: 24px;
      margin-bottom: 24px;
    }

    h1,
    h2,
    h3,
    p {
      margin-top: 0;
    }

    h1 {
      font-size: clamp(2rem, 3vw, 3.2rem);
      line-height: 1.1;
      margin-bottom: 16px;
    }

    h2 {
      font-size: 1.8rem;
      margin-bottom: 12px;
    }

    .subtle,
    .strategy,
    li {
      color: var(--muted);
    }

    .meta-grid,
    .stats-grid {
      display: grid;
      gap: 12px;
    }

    .meta-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      margin-top: 20px;
    }

    .stats-grid {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      margin-bottom: 18px;
    }

    .meta-card,
    .stat-card {
      padding: 16px;
      border-radius: 18px;
      background: rgba(255, 250, 242, 0.9);
      border: 1px solid var(--line);
    }

    .meta-card span,
    .stat-card span {
      display: block;
      font-size: 0.85rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 8px;
    }

    .meta-card strong,
    .stat-card strong {
      font-size: 1.1rem;
    }

    code {
      padding: 2px 6px;
      border-radius: 8px;
      background: var(--accent-soft);
      color: var(--accent);
      font-family: "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: 0.9em;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: white;
    }

    th,
    td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
      font-size: 0.94rem;
    }

    thead {
      background: #f3ebdf;
    }

    tbody tr:nth-child(even) {
      background: rgba(250, 245, 237, 0.5);
    }

    .source-cell,
    .output-cell {
      min-width: 260px;
    }

    ul {
      padding-left: 18px;
      margin-bottom: 0;
    }

    @media (max-width: 900px) {
      main {
        width: min(100% - 20px, 100%);
      }

      .panel,
      .model-section,
      .hero {
        padding: 18px;
      }

      table,
      thead,
      tbody,
      th,
      td,
      tr {
        display: block;
      }

      thead {
        display: none;
      }

      td {
        border-bottom: 0;
        padding: 8px 0;
      }

      tbody tr {
        padding: 14px 0;
        border-bottom: 1px solid var(--line);
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="subtle">Final Fantasy XIV subtitle benchmark on NVIDIA hosted OpenAI-compatible API</p>
      <h1>FF14 英译中实时字幕对比</h1>
      <p>
        语料来自 <a href="${escapeHtml(report.meta.sourceUrl)}">Purple Flame, Purple Flame</a>。
        本测试重点看三件事：字幕能不能直接用、响应够不够快、在尽量关闭 thinking 后是否还能稳定翻译。
      </p>
      <div class="meta-grid">
        <div class="meta-card"><span>API Base</span><strong>${escapeHtml(report.meta.apiBaseUrl)}</strong></div>
        <div class="meta-card"><span>Models</span><strong>${report.meta.models.length}</strong></div>
        <div class="meta-card"><span>Dialogue Lines</span><strong>${report.meta.datasetSize}</strong></div>
        <div class="meta-card"><span>Timeout Per Call</span><strong>${report.meta.timeoutMs} ms</strong></div>
      </div>
    </section>

    <section class="panel">
      <h2>Methodology</h2>
      <ul>
        ${report.meta.methodology.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </section>

    <section class="panel">
      <h2>Overall Ranking</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Model</th>
            <th>Model ID</th>
            <th>Verdict</th>
            <th>Usable Rate</th>
            <th>Think Leak</th>
            <th>Avg Latency</th>
            <th>P95</th>
            <th>Accuracy</th>
            <th>Overall</th>
          </tr>
        </thead>
        <tbody>${summaryRows}</tbody>
      </table>
    </section>

    ${detailSections}
  </main>
</body>
</html>`;
}

function formatMs(value) {
  if (value == null) {
    return '-';
  }
  return `${roundNumber(value, 1)} ms`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
