// 每月自动评测：拉取 NVIDIA + OpenRouter(仅免费) 最新模型，跳过已测过的，
// 评测新模型并存入 D1（带测试时间）。由 GitHub Actions 每月 cron 触发。
//
// 需要的 Cloudflare 环境：
//   - Secret: NVIDIA_API_KEY, OPENROUTER_API_KEY, AUTO_BENCHMARK_SECRET
//   - D1 binding: DB
//
// 成本护栏：OpenRouter 只测「≤ $6/M 且纯文本」的模型，最新优先；每次限量，避免烧钱/超时。
// 每个模型只测一次（历史里有就跳过），除非在请求体里显式 retest。
import { classifyModel, findGame } from '../_lib/benchmark.js';
import { benchmarkModel } from '../_lib/runner.js';
import { listHistoryEntries, saveHistoryEntry } from '../_lib/history.js';

const DEFAULT_GAME_ID = 'ff14';
const MAX_NEW_MODELS_PER_RUN = 8; // 每次最多新测的模型数（护栏，兼顾 Function 超时）
const LINE_LIMIT = 4; // 每个模型跑几句
const PRICE_CAP_PER_M = 6; // OpenRouter 价格上限：$6 / 百万 token
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

// 只保留纯文本模型（排除 image / audio / video / file 多模态）
function isTextOnlyModel(item) {
  const arch = item?.architecture || {};
  const inputs = Array.isArray(arch.input_modalities) ? arch.input_modalities : null;
  const outputs = Array.isArray(arch.output_modalities) ? arch.output_modalities : null;

  if (inputs) {
    if (!inputs.every((m) => m === 'text')) return false;
  }
  if (outputs) {
    if (!outputs.includes('text')) return false;
  }
  // 退化到 modality 字符串（如 "text->text" / "text+image->text"）
  if (!inputs && typeof arch.modality === 'string') {
    if (/image|audio|video|file/i.test(arch.modality)) return false;
  }
  return true;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 鉴权：防止别人触发昂贵的评测
  const secret = request.headers.get('x-auto-benchmark-secret') || '';
  if (!env.AUTO_BENCHMARK_SECRET || secret !== env.AUTO_BENCHMARK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!env.DB) {
    return Response.json({ error: 'Missing DB binding' }, { status: 503 });
  }

  const gameId = DEFAULT_GAME_ID;
  const game = findGame(gameId);

  // 请求体可选：{ retest: ["modelId", ...] } 用于 bug 后强制重测指定模型
  let requestBody = {};
  try {
    requestBody = await request.json();
  } catch {
    requestBody = {};
  }
  const retestSet = new Set(Array.isArray(requestBody?.retest) ? requestBody.retest : []);

  // 已测过的模型（跨全部历史）→ 跳过；但 retest 列表里的强制重测
  const history = await listHistoryEntries(env, { limit: 500 });
  const tested = new Set();
  for (const entry of history) {
    for (const model of entry.models || []) {
      if (model?.modelId && !retestSet.has(model.modelId)) tested.add(model.modelId);
    }
  }

  // 待测候选：NVIDIA(全免费) + OpenRouter(≤ $6/M、纯文本、最新优先)
  const candidates = [];
  if (env.NVIDIA_API_KEY) {
    candidates.push(...(await fetchNvidiaCandidates(env, tested)));
  }
  if (env.OPENROUTER_API_KEY) {
    candidates.push(...(await fetchOpenRouterCandidates(env, tested)));
  }

  const toTest = candidates.slice(0, MAX_NEW_MODELS_PER_RUN);
  const models = [];

  for (const candidate of toTest) {
    try {
      const summary = await benchmarkModel({
        provider: candidate.provider,
        modelId: candidate.modelId,
        gameId,
        apiKey: candidate.provider === 'nvidia' ? env.NVIDIA_API_KEY : env.OPENROUTER_API_KEY,
        lineLimit: LINE_LIMIT,
        abortOnLeak: true,
      });
      models.push(summary);
    } catch (error) {
      models.push({ modelId: candidate.modelId, provider: candidate.provider, error: error?.message || String(error) });
    }
  }

  // 存入 D1（这一批新测的模型 + 时间戳）
  const generatedAt = new Date().toISOString();
  let saved = false;
  if (models.length > 0) {
    try {
      await saveHistoryEntry(env, {
        id: `auto-${generatedAt}`,
        generatedAt,
        gameId,
        gameLabel: game.label,
        gameShortLabel: game.shortLabel,
        options: { source: 'auto-benchmark', lineLimit: LINE_LIMIT },
        models,
      });
      saved = true;
    } catch (error) {
      return Response.json({ error: `Save failed: ${error.message}`, tested: models.length }, { status: 500 });
    }
  }

  return Response.json({
    generatedAt,
    alreadyTested: tested.size,
    candidatesFound: candidates.length,
    newlyTested: models.length,
    remaining: Math.max(0, candidates.length - toTest.length),
    saved,
    models: models.map((m) => ({ modelId: m.modelId, provider: m.provider, verdict: m.verdict, leakRate: m.leakRate, averageLatencyMs: m.averageLatencyMs })),
  });
}

async function fetchNvidiaCandidates(env, tested) {
  try {
    const response = await fetch(`${NVIDIA_BASE}/models`, {
      headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}` },
    });
    const payload = await response.json();
    const models = Array.isArray(payload?.data) ? payload.data : [];
    return models
      .map((item) => item?.id)
      .filter(Boolean)
      .filter((id) => classifyModel(id).benchmarkable && !tested.has(id))
      .map((id) => ({ provider: 'nvidia', modelId: id }));
  } catch {
    return [];
  }
}

async function fetchOpenRouterCandidates(env, tested) {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    });
    const payload = await response.json();
    const models = Array.isArray(payload?.data) ? payload.data : [];
    const capPerToken = PRICE_CAP_PER_M / 1_000_000; // $6/M → 每 token 单价上限

    return models
      .filter((item) => {
        const id = item?.id || '';
        if (!id || tested.has(id)) return false;
        // 纯文本 + 可评测（非 embed/rerank/tts 等）
        if (!isTextOnlyModel(item) || !classifyModel(id).benchmarkable) return false;
        // 价格：prompt 与 completion 单价都 ≤ $6/M
        const promptPrice = Number.parseFloat(item?.pricing?.prompt ?? '999');
        const completionPrice = Number.parseFloat(item?.pricing?.completion ?? '999');
        return Number.isFinite(promptPrice) && Number.isFinite(completionPrice)
          && promptPrice <= capPerToken && completionPrice <= capPerToken;
      })
      // 最新的很火的模型优先（按 created 时间倒序）
      .sort((a, b) => (b?.created || 0) - (a?.created || 0))
      .map((item) => ({ provider: 'openrouter', modelId: item.id }));
  } catch {
    return [];
  }
}
