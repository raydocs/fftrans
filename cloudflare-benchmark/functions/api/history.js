import {
  clearHistoryEntries,
  isHistoryAvailable,
  listHistoryEntries,
  saveHistoryEntry,
} from '../_lib/history.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!isHistoryAvailable(env)) {
    return Response.json({ available: false, entries: [] });
  }

  const url = new URL(request.url);
  const gameId = (url.searchParams.get('gameId') || '').trim() || null;
  const limit = url.searchParams.get('limit') || '100';
  const entries = await listHistoryEntries(env, { gameId, limit });

  return Response.json({
    available: true,
    entries,
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!isHistoryAvailable(env)) {
    return Response.json({ available: false, error: 'Missing DB binding' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const entry = await saveHistoryEntry(env, body?.entry);
    const entries = await listHistoryEntries(env, {
      gameId: entry.gameId,
      limit: 100,
    });

    return Response.json({
      available: true,
      entries,
    });
  } catch (error) {
    return Response.json({
      available: true,
      error: error.message || String(error),
    }, {
      status: 400,
    });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;

  if (!isHistoryAvailable(env)) {
    return Response.json({ available: false, error: 'Missing DB binding' }, { status: 503 });
  }

  const url = new URL(request.url);
  const gameId = (url.searchParams.get('gameId') || '').trim() || null;

  await clearHistoryEntries(env, { gameId });

  return Response.json({
    available: true,
    entries: [],
  });
}
