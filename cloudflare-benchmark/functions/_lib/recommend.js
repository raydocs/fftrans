// 从评测历史里算出"最优解"推荐：性价比 top3 + 翻译质量 top3
//
// 筛选逻辑（对应应用需求）：
//   - 翻译要求快 + 便宜 + 质量好
//   - 不能带 thinking（泄漏率过高的排除）
//   - 延迟太久的不行（平均延迟超过上限的排除）
//
// NVIDIA 模型全免费，"性价比"= 综合分（已含延迟权重）；"质量"= 纯准确度。

export const DEFAULT_LATENCY_CAP_MS = 3000; // 延迟上限：3 秒
export const DEFAULT_MAX_LEAK_RATE = 20; // 思考泄漏率上限：20%
export const DEFAULT_MIN_USABLE_RATE = 50; // 可用率下限：50%
export const DEFAULT_TOP_N = 3;

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

  // 性价比：综合分（准确度45+可用性35+延迟20）；质量：纯准确度
  const topValue = rankTop(eligible, (m) => m.overallAverage, topN);
  const topQuality = rankTop(eligible, (m) => m.accuracyAverage, topN);

  return {
    generatedAt: options.now || null,
    latencyCapMs,
    filters: {
      latencyCapMs,
      maxLeakRate: options.maxLeakRate ?? DEFAULT_MAX_LEAK_RATE,
      minUsableRate: options.minUsableRate ?? DEFAULT_MIN_USABLE_RATE,
    },
    provider: providerFilter,
    totalEvaluated: scoped.length,
    totalEligible: eligible.length,
    topValue,
    topQuality,
  };
}
