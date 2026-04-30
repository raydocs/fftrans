const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 200;

export function isHistoryAvailable(env) {
  return Boolean(env.DB);
}

export async function listHistoryEntries(env, { gameId = null, limit = DEFAULT_HISTORY_LIMIT } = {}) {
  if (!isHistoryAvailable(env)) {
    return [];
  }

  const normalizedLimit = clampLimit(limit);
  const baseSql = `
    SELECT id, generated_at, game_id, game_label, game_short_label, options_json, models_json
    FROM benchmark_history
  `;

  const statement = gameId
    ? env.DB.prepare(`${baseSql} WHERE game_id = ? ORDER BY generated_at DESC LIMIT ?`).bind(gameId, normalizedLimit)
    : env.DB.prepare(`${baseSql} ORDER BY generated_at DESC LIMIT ?`).bind(normalizedLimit);

  const result = await statement.all();
  return (result.results || []).map(normalizeHistoryRow);
}

export async function saveHistoryEntry(env, entry) {
  if (!isHistoryAvailable(env)) {
    throw new Error('Missing DB binding');
  }

  const normalized = normalizeHistoryEntry(entry);

  await env.DB.prepare(`
    INSERT OR REPLACE INTO benchmark_history (
      id,
      generated_at,
      game_id,
      game_label,
      game_short_label,
      options_json,
      models_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    normalized.id,
    normalized.generatedAt,
    normalized.gameId,
    normalized.gameLabel,
    normalized.gameShortLabel,
    JSON.stringify(normalized.options),
    JSON.stringify(normalized.models),
  ).run();

  return normalized;
}

export async function clearHistoryEntries(env, { gameId = null } = {}) {
  if (!isHistoryAvailable(env)) {
    throw new Error('Missing DB binding');
  }

  if (gameId) {
    await env.DB.prepare('DELETE FROM benchmark_history WHERE game_id = ?').bind(gameId).run();
    return;
  }

  await env.DB.prepare('DELETE FROM benchmark_history').run();
}

function normalizeHistoryRow(row) {
  return {
    id: row.id,
    generatedAt: row.generated_at,
    gameId: row.game_id,
    gameLabel: row.game_label,
    gameShortLabel: row.game_short_label,
    options: parseJsonObject(row.options_json),
    models: parseJsonArray(row.models_json),
  };
}

function normalizeHistoryEntry(entry) {
  const id = String(entry?.id || '').trim();
  const generatedAt = String(entry?.generatedAt || '').trim();
  const gameId = String(entry?.gameId || '').trim();
  const gameLabel = String(entry?.gameLabel || '').trim();
  const gameShortLabel = String(entry?.gameShortLabel || '').trim();
  const options = entry?.options && typeof entry.options === 'object' ? entry.options : {};
  const models = Array.isArray(entry?.models) ? entry.models : [];

  if (!id || !generatedAt || !gameId || !gameLabel || !gameShortLabel) {
    throw new Error('Invalid history entry');
  }

  return {
    id,
    generatedAt,
    gameId,
    gameLabel,
    gameShortLabel,
    options,
    models,
  };
}

function parseJsonObject(value) {
  try {
    const parsed = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clampLimit(limit) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_HISTORY_LIMIT;
  }
  return Math.min(MAX_HISTORY_LIMIT, Math.max(1, parsed));
}
