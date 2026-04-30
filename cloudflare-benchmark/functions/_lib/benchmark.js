export const GAME_DATASETS = {
  ff14: {
    id: 'ff14',
    label: 'Final Fantasy XIV',
    shortLabel: 'FF14',
    sourceUrl: 'https://ffxiv.consolegameswiki.com/wiki/Purple_Flame,_Purple_Flame',
    description: 'Heavensward quest dialogue benchmarked as English-to-Chinese realtime subtitle translation.',
    voiceSupport: false,
    lines: [
      {
        id: 'ff14-line-1',
        speaker: 'Estinien',
        text: 'If we are to lure our foes to our position, then we must find a means of producing a signal of purple hue.',
        reference: '若要引敌前来，我们必须想办法发出紫色信号。',
        concepts: [
          '(引|诱).{0,6}敌|敌.{0,6}(引|诱)',
          '紫',
          '(信号|讯号|烟|烟雾)',
        ],
      },
      {
        id: 'ff14-line-2',
        speaker: 'Iceheart',
        text: 'So, you seek to stem the Dravanian tide with talk? A romantic notion.',
        reference: '你想靠言语阻止龙族攻势？真是天真的想法。',
        concepts: [
          '(谈|说|言语|交涉|谈判)',
          '(龙|龙族|攻势|大军|浪潮|进攻|来袭)',
          '(天真|浪漫|异想天开|不切实际)',
        ],
      },
      {
        id: 'ff14-line-3',
        speaker: 'Iceheart',
        text: 'If you but knew the truth-the spark which lit the flames of this animosity-you would understand the futility of your quest.',
        reference: '若你知晓点燃这场仇恨之火的真相，便会明白你的追求有多徒劳。',
        concepts: [
          '真相',
          '(仇|怨|敌意|仇恨)',
          '(徒劳|无用|枉然|白费|无益)',
        ],
      },
      {
        id: 'ff14-line-4',
        speaker: 'Estinien',
        text: "I believe reason has all but left him. Through the Eye, I feel much of what Nidhogg feels, and the dragon's thirst for vengeance will not be quenched by aught less than a sea of blood.",
        reference: '我觉得他几乎已经失去理智。透过龙眼，我能感受到尼德霍格的所思所想，而那条龙对复仇的渴求，唯有血海方能平息。',
        concepts: [
          '(失去理智|丧失理智|疯狂|失去理性)',
          '(龙眼|眼)',
          '(尼德霍格|Nidhogg)',
          '复仇',
          '(血海|鲜血|血)',
        ],
      },
      {
        id: 'ff14-line-5',
        speaker: 'Iceheart',
        text: 'You still believe that a peaceable solution can be found? Very well. I will take you to him.',
        reference: '你竟还相信能找到和平的办法？也罢，我带你去见他。',
        concepts: [
          '(和平|和解)',
          '(办法|方案|解决|出路)',
          '(带|领)',
          '(见他|去见|带你去)',
        ],
      },
      {
        id: 'ff14-line-6',
        speaker: 'Iceheart',
        text: 'Our road will lead us to Dravania, the homeland of dragonkind. There we shall ascend unto the clouds, where Hraesvelgr resides...',
        reference: '我们的路将通往龙族的故乡德拉瓦尼亚。我们将在那里登上云端，赫拉斯瓦尔格便栖居其上。',
        concepts: [
          '(德拉瓦尼亚|Dravania)',
          '(龙族|龙裔)',
          '(云|云端|高空)',
          '(赫拉斯瓦尔格|Hraesvelgr)',
        ],
      },
    ],
  },
  hsr: {
    id: 'hsr',
    label: 'Honkai: Star Rail',
    shortLabel: 'HSR',
    sourceUrl: 'https://honkai-star-rail.fandom.com/wiki/Hero,_Return_to_Dawn_in_Mortality',
    description: 'Mission dialogue benchmarked as English-to-Chinese subtitle translation, with direct wiki voice links for playable samples.',
    voiceSupport: true,
    lines: [
      {
        id: 'hsr-line-1',
        speaker: 'Mydeimos, Lance of Fury',
        text: "Since you've taken up her pen, then write, stand with us, and fight destiny with all your strength, until all is settled.",
        reference: '既然你已接过她的笔，那就书写吧，与我们并肩，用尽全力去对抗命运，直到一切尘埃落定。',
        concepts: [
          '(接过|拿起|执起)',
          '(笔|书写)',
          '(并肩|站在我们这边|与我们同行)',
          '(命运)',
          '(全力|竭尽全力)',
        ],
        voiceUrl: 'https://static.wikia.nocookie.net/houkai-star-rail/images/2/25/VO_chapter4_73_mydei_112.ogg/revision/latest?cb=20260327171411',
      },
      {
        id: 'hsr-line-2',
        speaker: 'Mydei',
        text: 'March on, heroes. March into the abyss, and fulfill that long-cherished wish of Amphoreus.',
        reference: '前进吧，英雄们。迈向深渊，去实现安弗罗斯那久藏心中的夙愿。',
        concepts: [
          '(前进|进军|迈进)',
          '(英雄)',
          '(深渊)',
          '(夙愿|愿望|心愿)',
          '(安弗罗斯|Amphoreus)',
        ],
        voiceUrl: 'https://static.wikia.nocookie.net/houkai-star-rail/images/e/ee/VO_chapter4_73_mydei_133.ogg/revision/latest?cb=20260327171440',
      },
      {
        id: 'hsr-line-3',
        speaker: 'Castorice',
        text: 'Casting off the name of death - Castorice, Servant of the Afterlife - may her name be etched into the stars...',
        reference: '褪去“死亡”之名——身为冥界侍者的卡斯特丽丝——愿她的名字铭刻于群星之上……',
        concepts: [
          '(褪去|抛下|舍弃)',
          '(死亡)',
          '(卡斯特丽丝|Castorice)',
          '(铭刻|镌刻)',
          '(群星|星辰|星空)',
        ],
        voiceUrl: 'https://static.wikia.nocookie.net/houkai-star-rail/images/7/70/VO_chapter4_73_castorice_122.ogg/revision/latest?cb=20260327170720',
      },
      {
        id: 'hsr-line-4',
        speaker: 'Castorice',
        text: 'And then, live as a human... And die as one.',
        reference: '然后，像人一样活着……再像人一样死去。',
        concepts: [
          '(像人|作为人|以人的身份)',
          '活',
          '死',
        ],
        voiceUrl: 'https://static.wikia.nocookie.net/houkai-star-rail/images/0/06/VO_chapter4_73_castorice_124.ogg/revision/latest?cb=20260327170723',
      },
      {
        id: 'hsr-line-5',
        speaker: 'Cyrene',
        text: 'Let us walk through the final page of this saga with everyone one step at a time, shall we?',
        reference: '让我们与大家一起，一步一步走过这段传奇的最后一页吧，好吗？',
        concepts: [
          '(一起|与大家|同行)',
          '(一步一步|逐步)',
          '(最后一页|终章)',
          '(传奇|史诗|故事)',
        ],
        voiceUrl: 'https://static.wikia.nocookie.net/houkai-star-rail/images/0/0e/VO_chapter4_74_cyrene_104.ogg/revision/latest?cb=20260327171643',
      },
      {
        id: 'hsr-line-6',
        speaker: 'Trailblazer',
        text: "We'll reject this false answer!",
        reference: '我们会否定这个错误的答案！',
        concepts: [
          '(否定|拒绝|驳斥)',
          '(错误|虚假|伪)',
          '(答案|回应)',
        ],
        voiceUrl: 'https://static.wikia.nocookie.net/houkai-star-rail/images/b/b3/VO_chapter4_74_player_110_f.ogg/revision/latest?cb=20260327171838',
      },
    ],
  },
};

export const DEFAULT_GAME_ID = 'ff14';

export const FAVORITE_MODELS = [
  'meta/llama-4-maverick-17b-128e-instruct',
  'moonshotai/kimi-k2.5',
  'mistralai/mistral-large-3-675b-instruct-2512',
  'z-ai/glm5',
  'qwen/qwen3.5-122b-a10b',
  'google/gemma-4-31b-it',
  'minimaxai/minimax-m2.7',
  'minimaxai/minimax-m2.5',
  'stepfun-ai/step-3.5-flash',
];

const NON_CHAT_PATTERNS = [
  /embed/i,
  /rerank/i,
  /ocr/i,
  /asr/i,
  /speech/i,
  /tts/i,
  /clip/i,
  /guard/i,
  /parse$/i,
  /translate-\d/i,
  /vision-?language-model/i,
];

export function buildBootstrapPayload() {
  const games = Object.values(GAME_DATASETS).map((game) => ({
    id: game.id,
    label: game.label,
    shortLabel: game.shortLabel,
    sourceUrl: game.sourceUrl,
    description: game.description,
    voiceSupport: game.voiceSupport,
    lineCount: game.lines.length,
  }));

  return {
    defaultGameId: DEFAULT_GAME_ID,
    games,
    datasets: Object.fromEntries(Object.values(GAME_DATASETS).map((game) => [
      game.id,
      game.lines.map((line) => ({
        id: line.id,
        speaker: line.speaker,
        text: line.text,
        reference: line.reference,
        voiceUrl: line.voiceUrl || null,
      })),
    ])),
    favoriteModels: FAVORITE_MODELS,
    notes: [
      'The site benchmarks English game dialogue against Chinese subtitle-style output.',
      'Known no-think heuristics are applied per model family when enabled.',
      'NVIDIA API key stays on the server as a Cloudflare secret.',
      'HSR lines can optionally play original quest voice directly from wiki-hosted OGG files.',
    ],
  };
}

export function classifyModel(modelId) {
  const benchmarkable = !NON_CHAT_PATTERNS.some((pattern) => pattern.test(modelId));
  return {
    benchmarkable,
    favorite: FAVORITE_MODELS.includes(modelId),
    provider: modelId.split('/')[0] || 'unknown',
  };
}

export function applyNoThinkHeuristics(modelId, payload, enabled) {
  if (!enabled) {
    return payload;
  }

  const nextPayload = structuredClone(payload);

  if (modelId === 'moonshotai/kimi-k2.5') {
    nextPayload.chat_template_kwargs = {
      ...(nextPayload.chat_template_kwargs || {}),
      thinking: false,
    };
    nextPayload.include_reasoning = false;
    return nextPayload;
  }

  if (modelId.startsWith('z-ai/glm')) {
    nextPayload.chat_template_kwargs = {
      ...(nextPayload.chat_template_kwargs || {}),
      enable_thinking: false,
      clear_thinking: false,
    };
    nextPayload.include_reasoning = false;
    return nextPayload;
  }

  if (modelId.startsWith('qwen/qwen3.5')) {
    nextPayload.chat_template_kwargs = {
      ...(nextPayload.chat_template_kwargs || {}),
      enable_thinking: false,
    };
    nextPayload.include_reasoning = false;
    return nextPayload;
  }

  if (modelId.startsWith('nvidia/llama-3.3-nemotron-super-49b-v1.5')) {
    nextPayload.messages[0].content = `/no_think ${nextPayload.messages[0].content}`;
    return nextPayload;
  }

  if (modelId.startsWith('nvidia/')) {
    nextPayload.messages[0].content = `detailed thinking off ${nextPayload.messages[0].content}`;
    return nextPayload;
  }

  return nextPayload;
}

export function findGame(gameId) {
  return GAME_DATASETS[gameId] || null;
}

export function findLine(gameId, lineId) {
  const game = findGame(gameId);
  if (!game) {
    return null;
  }
  return game.lines.find((line) => line.id === lineId) || null;
}

export function buildEvaluationPayload({ modelId, line, maxTokens, temperature }) {
  return {
    model: modelId,
    temperature,
    max_tokens: maxTokens,
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
  };
}

export function normalizeEvaluationResult({ line, responseMs, rawMessage, finishReason, usage, httpStatus, errorMessage }) {
  const rawContent = typeof rawMessage?.content === 'string' ? rawMessage.content : '';
  const cleanedContent = cleanSubtitleOutput(rawContent);
  const thinkingLeak = detectThinkingLeak(rawMessage, rawContent);
  const usable = Boolean(cleanedContent) && !containsAsciiEcho(cleanedContent) && finishReason !== 'length' && !errorMessage;
  const accuracyScore = cleanedContent ? calculateAccuracyScore(cleanedContent, line.reference, line.concepts) : 0;
  const latencyScore = calculateLatencyScore(responseMs);
  const usabilityScore = calculateUsabilityScore({ cleanedContent, thinkingLeak, finishReason, error: errorMessage });
  const overallScore = roundNumber((accuracyScore * 0.45) + (usabilityScore * 0.35) + (latencyScore * 0.20), 1);

  return {
    lineId: line.id,
    speaker: line.speaker,
    source: line.text,
    reference: line.reference,
    responseMs,
    finishReason: finishReason || null,
    rawContent,
    cleanedContent,
    reasoning: pickFirstString(rawMessage?.reasoning, rawMessage?.reasoning_content, rawMessage?.thinking),
    thinkingLeak,
    usable,
    accuracyScore,
    latencyScore,
    usabilityScore,
    overallScore,
    usage: usage || null,
    httpStatus: httpStatus || null,
    error: errorMessage || null,
  };
}

export function summarizeModelResults(modelId, results) {
  const successful = results.filter((item) => !item.error);
  const usable = results.filter((item) => item.usable);
  const leaks = results.filter((item) => item.thinkingLeak);
  const averageLatencyMs = averageNumber(successful.map((item) => item.responseMs));
  const accuracyAverage = averageNumber(successful.map((item) => item.accuracyScore));
  const overallAverage = averageNumber(successful.map((item) => item.overallScore));
  const usableRate = results.length ? usable.length / results.length : 0;
  const leakRate = results.length ? leaks.length / results.length : 0;

  return {
    modelId,
    verdict: determineVerdict({ usableRate, averageLatencyMs, accuracyAverage, leakRate }),
    usableRate: roundNumber(usableRate * 100, 1),
    leakRate: roundNumber(leakRate * 100, 1),
    averageLatencyMs: averageLatencyMs == null ? null : roundNumber(averageLatencyMs, 1),
    accuracyAverage: roundNumber(accuracyAverage, 1),
    overallAverage: roundNumber(overallAverage, 1),
    results,
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

function detectThinkingLeak(rawMessage, rawContent) {
  return Boolean(
    pickFirstString(rawMessage?.reasoning, rawMessage?.reasoning_content, rawMessage?.thinking)
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

function calculateAccuracyScore(output, reference, conceptPatterns) {
  const similarity = calculateDiceSimilarity(normalizeChineseText(output), normalizeChineseText(reference));
  const hits = conceptPatterns.filter((pattern) => new RegExp(pattern).test(output)).length;
  const conceptScore = conceptPatterns.length ? hits / conceptPatterns.length : 1;
  return roundNumber(((conceptScore * 0.65) + (similarity * 0.35)) * 100, 1);
}

function calculateLatencyScore(responseMs) {
  if (responseMs <= 2000) return 100;
  if (responseMs <= 4000) return 85;
  if (responseMs <= 8000) return 65;
  if (responseMs <= 15000) return 40;
  if (responseMs <= 30000) return 15;
  return 0;
}

function calculateUsabilityScore({ cleanedContent, thinkingLeak, finishReason, error }) {
  if (error) return 0;
  if (!cleanedContent) return 10;
  if (thinkingLeak && finishReason === 'length') return 20;
  if (finishReason === 'length') return 45;
  if (thinkingLeak) return 65;
  return 100;
}

function normalizeChineseText(value) {
  return (value || '').replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()【】\[\]<>《》-]/g, '').trim();
}

function calculateDiceSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);

  if (!leftBigrams.length || !rightBigrams.length) return 0;

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
    return text ? [text] : [];
  }
  const result = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    result.push(text.slice(index, index + 2));
  }
  return result;
}

function averageNumber(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundNumber(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return 0;
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
