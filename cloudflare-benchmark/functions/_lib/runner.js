// 服务端评测编排：把浏览器里"逐句评测"的流程搬到服务端，供每月自动跑复用。
import {
  applyNoThinkHeuristics,
  buildEvaluationPayload,
  findGame,
  normalizeEvaluationResult,
  summarizeModelResults,
} from './benchmark.js';

export const PROVIDER_ENDPOINTS = {
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

// 评测单个模型（跑 lineLimit 句）。第一句就泄漏 thinking → 提前中止，省调用。
export async function benchmarkModel(options) {
  const {
    provider,
    modelId,
    gameId,
    apiKey,
    fetchFn = fetch,
    baseUrl = PROVIDER_ENDPOINTS[provider],
    lineLimit = 4,
    maxTokens = 160,
    temperature = 0.1,
    timeoutMs = 25000,
    abortOnLeak = true,
  } = options;

  const game = findGame(gameId);
  if (!game) {
    throw new Error(`Unknown gameId: ${gameId}`);
  }

  const lines = game.lines.slice(0, lineLimit);
  const results = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let payload = buildEvaluationPayload({ modelId, line, maxTokens, temperature });
    payload = applyNoThinkHeuristics(modelId, payload, true);

    const startedAt = Date.now();
    let normalized;

    try {
      const response = await withTimeout(fetchFn(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // OpenRouter 要求这两个头
          'HTTP-Referer': 'https://ff14-nvidia-benchmark.pages.dev',
          'X-Title': 'FFTrans Benchmark',
        },
        body: JSON.stringify(payload),
      }), timeoutMs);

      const data = await response.json();
      const choice = data?.choices?.[0] || {};
      normalized = normalizeEvaluationResult({
        line,
        responseMs: Date.now() - startedAt,
        rawMessage: choice?.message || {},
        finishReason: choice?.finish_reason || null,
        usage: data?.usage || null,
        httpStatus: response.status,
        errorMessage: response.ok ? null : (data?.error?.message || `HTTP ${response.status}`),
      });
    } catch (error) {
      normalized = normalizeEvaluationResult({
        line,
        responseMs: Date.now() - startedAt,
        rawMessage: {},
        finishReason: null,
        usage: null,
        httpStatus: null,
        errorMessage: error?.message || String(error),
      });
    }

    results.push(normalized);

    // 第一句就泄漏 thinking（无法关闭）→ 不再浪费后续调用
    if (abortOnLeak && index === 0 && normalized.thinkingLeak) {
      break;
    }
  }

  const summary = summarizeModelResults(modelId, results);
  return { ...summary, provider };
}
