import { buildBootstrapPayload } from '../_lib/benchmark.js';

export async function onRequestGet() {
  return Response.json(buildBootstrapPayload(), {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
