import {
  applyNoThinkHeuristics,
  buildEvaluationPayload,
  findLine,
  normalizeEvaluationResult,
} from '../_lib/benchmark.js';

function getBaseUrl(env) {
  return env.NVIDIA_API_BASE_URL || 'https://integrate.api.nvidia.com/v1';
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.NVIDIA_API_KEY) {
    return Response.json({ error: 'Missing NVIDIA_API_KEY secret' }, { status: 500 });
  }

  const body = await request.json();
  const gameId = String(body?.gameId || '').trim();
  const modelId = String(body?.modelId || '').trim();
  const lineId = String(body?.lineId || '').trim();
  const useNoThink = body?.useNoThink !== false;
  const maxTokens = clampNumber(body?.maxTokens, 32, 512, 160);
  const temperature = clampFloat(body?.temperature, 0, 2, 0.1);
  const timeoutMs = clampNumber(body?.timeoutMs, 3000, 60000, 25000);

  if (!modelId) {
    return Response.json({ error: 'Missing modelId' }, { status: 400 });
  }

  const line = findLine(gameId, lineId);
  if (!line) {
    return Response.json({ error: `Unknown gameId/lineId combination: ${gameId}/${lineId}` }, { status: 400 });
  }

  let payload = buildEvaluationPayload({
    modelId,
    line,
    maxTokens,
    temperature,
  });

  payload = applyNoThinkHeuristics(modelId, payload, useNoThink);

  const startedAt = Date.now();

  try {
    const response = await withTimeout(fetch(`${getBaseUrl(env)}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }), timeoutMs);

    const data = await response.json();
    const choice = data?.choices?.[0] || {};
    const normalized = normalizeEvaluationResult({
      line,
      responseMs: Date.now() - startedAt,
      rawMessage: choice?.message || {},
      finishReason: choice?.finish_reason || null,
      usage: data?.usage || null,
      httpStatus: response.status,
      errorMessage: response.ok ? null : (data?.error?.message || `HTTP ${response.status}`),
    });

    return Response.json({
      gameId,
      modelId,
      lineId,
      useNoThink,
      normalized,
    });
  } catch (error) {
    const normalized = normalizeEvaluationResult({
      line,
      responseMs: Date.now() - startedAt,
      rawMessage: {},
      finishReason: null,
      usage: null,
      httpStatus: null,
      errorMessage: error.message || String(error),
    });

    return Response.json({
      gameId,
      modelId,
      lineId,
      useNoThink,
      normalized,
    }, {
      status: 200,
    });
  }
}

function clampNumber(value, min, max, fallbackValue) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.min(max, Math.max(min, parsed));
}

function clampFloat(value, min, max, fallbackValue) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.min(max, Math.max(min, parsed));
}
