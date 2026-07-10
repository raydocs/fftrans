// 每月自动评测：拉取 NVIDIA + OpenRouter(仅免费) 最新模型，跳过已测过的，
// 评测新模型并存入 D1（带测试时间）。由 GitHub Actions 每月 cron 触发。
//
// 需要的 Cloudflare 环境：
//   - Secret: NVIDIA_API_KEY, OPENROUTER_API_KEY, AUTO_BENCHMARK_SECRET
//   - D1 binding: DB
//
// 成本护栏：OpenRouter 只测「免费」模型（pricing.prompt == 0），并对每次新增
// 模型数量设上限，避免烧钱 / 超时。
import { classifyModel, findGame } from '../_lib/benchmark.js';
import { benchmarkModel } from '../_lib/runner.js';
import { listHistoryEntries, saveHistoryEntry } from '../_lib/history.js';

const DEFAULT_GAME_ID = 'ff14';
const MAX_NEW_MODELS_PER_RUN = 10; // 每次最多新测的模型数（护栏）
const LINE_LIMIT = 4; // 每个模型跑几句
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

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

  // 已测过的模型（跨全部历史）→ 跳过
  const history = await listHistoryEntries(env, { limit: 500 });
  const tested = new Set();
  for (const entry of history) {
    for (const model of entry.models || []) {
      if (model?.modelId) tested.add(model.modelId);
    }
  }

  // 待测候选：NVIDIA(全免费) + OpenRouter(仅免费)
  const candidates = [];
  if (env.NVIDIA_API_KEY) {
    candidates.push(...(await fetchNvidiaCandidates(env, tested)));
  }
  if (env.OPENROUTER_API_KEY) {
    candidates.push(...(await fetchOpenRouterFreeCandidates(env, tested)));
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

async function fetchOpenRouterFreeCandidates(env, tested) {
  try {
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    });
    const payload = await response.json();
    const models = Array.isArray(payload?.data) ? payload.data : [];
    return models
      .filter((item) => {
        const id = item?.id || '';
        // 只要免费模型：prompt 与 completion 单价都为 0
        const promptPrice = Number.parseFloat(item?.pricing?.prompt ?? '1');
        const completionPrice = Number.parseFloat(item?.pricing?.completion ?? '1');
        const isFree = promptPrice === 0 && completionPrice === 0;
        return id && isFree && classifyModel(id).benchmarkable && !tested.has(id);
      })
      .map((item) => ({ provider: 'openrouter', modelId: item.id }));
  } catch {
    return [];
  }
}
