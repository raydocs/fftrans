import { isHistoryAvailable, listHistoryEntries } from '../_lib/history.js';
import {
  computeRecommendations,
  DEFAULT_LATENCY_CAP_MS,
} from '../_lib/recommend.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!isHistoryAvailable(env)) {
    return Response.json(
      { available: false, topValue: [], topQuality: [] },
      { headers: CORS_HEADERS }
    );
  }

  const url = new URL(request.url);
  const gameId = (url.searchParams.get('gameId') || '').trim() || null;
  const provider = (url.searchParams.get('provider') || '').trim().toLowerCase() || null;
  const latencyCapMs = clampInt(url.searchParams.get('latencyCap'), 500, 60000, DEFAULT_LATENCY_CAP_MS);
  const topN = clampInt(url.searchParams.get('top'), 1, 10, 3);

  // 拉取最近的评测历史（跨所有评测轮次，recommend 内部按模型取最新一次）
  const entries = await listHistoryEntries(env, { gameId, limit: 500 });
  const recommendations = computeRecommendations(entries, {
    latencyCapMs,
    topN,
    provider,
    now: new Date().toISOString(),
  });

  return Response.json(
    { available: true, ...recommendations },
    {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=300',
      },
    }
  );
}

function clampInt(value, min, max, fallbackValue) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.min(max, Math.max(min, parsed));
}
