// 从评测历史里算出"最优解"推荐：性价比 top3 + 翻译质量 top3
//
// 筛选逻辑（对应应用需求）：
//   - 翻译要求快 + 便宜 + 质量好
//   - 不能带 thinking（泄漏率过高的排除）
//   - 延迟太久的不行（平均延迟超过上限的排除）
//
// NVIDIA 模型全免费，"性价比"= 综合分（已含延迟权重）；"质量"= 纯准确度。

// 明显的非文本/非聊天模型（漏进 D1 的也不推荐）
const NON_TEXT_NAME = /diffusion|vision|image|video|audio|speech|tts|\bocr\b|embed|rerank|clip|fuyu|whisper|sana|flux|sdxl|stable-?diffusion/i;

export const DEFAULT_LATENCY_CAP_MS = 3000; // 质量档延迟上限：3 秒
export const REALTIME_LATENCY_CAP_MS = 1000; // 实时/性价比档延迟上限：1 秒（游戏字幕）
export const DEFAULT_MAX_LEAK_RATE = 20; // 思考泄漏率上限：20%
export const DEFAULT_MIN_USABLE_RATE = 50; // 可用率下限：50%
export const DEFAULT_MAX_AGE_DAYS = 60; // 时效：只看最近 N 天内测过的（退役/过期模型自动掉出）
export const DEFAULT_TOP_N = 3;

// 计算测试时间距今多少天（拿不到 now 或 testedAt 时返回 0，即不因时效排除）
function ageInDays(testedAt, nowIso) {
  if (!testedAt || !nowIso) return 0;
  const t = Date.parse(testedAt);
  const n = Date.parse(nowIso);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return 0;
  return (n - t) / (1000 * 60 * 60 * 24);
}

function toNumber(value) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// 把历史条目聚合成"每个模型的最新一次评测"（附测试时间）
export function aggregateLatestByModel(historyEntries = []) {
  const latest = new Map();

  // 历史条目里 models 数组来自 summarizeModelResults
  for (const entry of historyEntries) {
    const generatedAt = entry?.generatedAt || entry?.generated_at || '';
    const models = Array.isArray(entry?.models) ? entry.models : [];

    for (const model of models) {
      const modelId = model?.modelId;
      if (!modelId) {
        continue;
      }

      const prev = latest.get(modelId);
      // 只保留最近一次评测（generatedAt 更晚的覆盖旧的）
      if (!prev || String(generatedAt) > String(prev.testedAt)) {
        latest.set(modelId, {
          modelId,
          provider: model.provider || String(modelId).split('/')[0] || 'unknown',
          verdict: model.verdict || '',
          accuracyAverage: toNumber(model.accuracyAverage),
          overallAverage: toNumber(model.overallAverage),
          averageLatencyMs: toNumber(model.averageLatencyMs),
          leakRate: toNumber(model.leakRate),
          usableRate: toNumber(model.usableRate),
          testedAt: generatedAt,
        });
      }
    }
  }

  return Array.from(latest.values());
}

// 判断一个模型是否满足推荐门槛
export function isEligible(model, options = {}) {
  const latencyCapMs = options.latencyCapMs ?? DEFAULT_LATENCY_CAP_MS;
  const maxLeakRate = options.maxLeakRate ?? DEFAULT_MAX_LEAK_RATE;
  const minUsableRate = options.minUsableRate ?? DEFAULT_MIN_USABLE_RATE;

  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;

  if (NON_TEXT_NAME.test(String(model.modelId))) {
    return false; // 非文本模型（扩散/视觉等）不进推荐
  }
  if (maxAgeDays > 0 && ageInDays(model.testedAt, options.now) > maxAgeDays) {
    return false; // 太久没测（退役/过期模型自动掉出）
  }
  if (model.averageLatencyMs == null || model.averageLatencyMs > latencyCapMs) {
    return false; // 延迟太久
  }
  if (model.leakRate == null || model.leakRate > maxLeakRate) {
    return false; // 带 thinking（泄漏）
  }
  if (model.usableRate == null || model.usableRate < minUsableRate) {
    return false; // 可用率太低
  }
  if (model.accuracyAverage == null) {
    return false;
  }
  return true;
}

function rankTop(models, keyFn, topN) {
  return [...models]
    .sort((a, b) => (keyFn(b) ?? -Infinity) - (keyFn(a) ?? -Infinity))
    .slice(0, topN);
}

// 主函数：给出推荐
export function computeRecommendations(historyEntries = [], options = {}) {
  const topN = options.topN ?? DEFAULT_TOP_N;
  const latencyCapMs = options.latencyCapMs ?? DEFAULT_LATENCY_CAP_MS;

  const aggregated = aggregateLatestByModel(historyEntries);
  // 可选：只看某个提供方（nvidia / openrouter），用于分别出 NVIDIA / OpenRouter 榜单
  const providerFilter = options.provider ? String(options.provider).toLowerCase() : null;
  const scoped = providerFilter
    ? aggregated.filter((model) => String(model.provider).toLowerCase() === providerFilter)
    : aggregated;
  const eligible = scoped.filter((model) => isEligible(model, options));
  const realtimeCapMs = options.realtimeCapMs ?? REALTIME_LATENCY_CAP_MS;

  // 性价比/实时档：延迟 ≤ 1s（游戏字幕实时），按综合分排序
  const realtimeEligible = eligible.filter((m) => m.averageLatencyMs != null && m.averageLatencyMs <= realtimeCapMs);
  const topValue = rankTop(realtimeEligible, (m) => m.overallAverage, topN);
  // 质量档：延迟 ≤ 3s，按纯准确度排序（看剧情/精读，慢一点没关系）
  const topQuality = rankTop(eligible, (m) => m.accuracyAverage, topN);

  return {
    generatedAt: options.now || null,
    latencyCapMs,
    realtimeCapMs,
    filters: {
      latencyCapMs,
      realtimeCapMs,
      maxLeakRate: options.maxLeakRate ?? DEFAULT_MAX_LEAK_RATE,
      minUsableRate: options.minUsableRate ?? DEFAULT_MIN_USABLE_RATE,
      maxAgeDays: options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
    },
    provider: providerFilter,
    totalEvaluated: scoped.length,
    totalEligible: eligible.length,
    topValue,
    topQuality,
  };
}
