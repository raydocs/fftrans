import { classifyModel } from '../_lib/benchmark.js';

function getBaseUrl(env) {
  return env.NVIDIA_API_BASE_URL || 'https://integrate.api.nvidia.com/v1';
}

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.NVIDIA_API_KEY) {
    return Response.json({ error: 'Missing NVIDIA_API_KEY secret' }, { status: 500 });
  }

  const response = await fetch(`${getBaseUrl(env)}/models`, {
    headers: {
      Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = await response.json();
  const models = Array.isArray(payload?.data) ? payload.data : [];
  const normalized = models
    .map((item) => {
      const id = item?.id || '';
      return {
        id,
        created: item?.created || null,
        ...classifyModel(id),
      };
    })
    .sort((left, right) => {
      if (left.favorite !== right.favorite) {
        return left.favorite ? -1 : 1;
      }
      if (left.benchmarkable !== right.benchmarkable) {
        return left.benchmarkable ? -1 : 1;
      }
      return left.id.localeCompare(right.id);
    });

  return Response.json({
    models: normalized,
    total: normalized.length,
    benchmarkable: normalized.filter((item) => item.benchmarkable).length,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=120',
    },
  });
}
