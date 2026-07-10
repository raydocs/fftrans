# FFTrans NVIDIA Benchmark Site

Cloudflare Pages + Pages Functions site for benchmarking NVIDIA-hosted models on FF14 and HSR subtitle-style translation tasks.

## What It Does

- Fetches live model IDs from `https://integrate.api.nvidia.com/v1/models`
- Lets you search, select, and benchmark models from the browser
- Proxies all model calls through Cloudflare Pages Functions
- Keeps the NVIDIA API key in Cloudflare secrets instead of exposing it to the browser
- Produces an in-browser HTML benchmark with latency, usable subtitle rate, thinking leakage, and heuristic translation quality
- Stores benchmark history in Cloudflare D1 so rankings persist across devices and deployments

## Local Development

Create a local secrets file:

```bash
cp .dev.vars.example .dev.vars
```

Create the local D1 schema:

```bash
npm run d1:migrate:local
```

Then start Pages local dev:

```bash
npm run dev
```

## Deploy To Cloudflare

From this directory:

```bash
npm run d1:create
```

Copy the returned `database_id` into [wrangler.jsonc](file:///Users/ruirui/Downloads/GitHub/fftrans/cloudflare-benchmark/wrangler.jsonc), then run the remote migration:

```bash
npm run d1:migrate:remote
```

Then deploy:

```bash
npm run deploy
```

Then set the secret in Cloudflare:

```bash
npx wrangler secret put NVIDIA_API_KEY
```

Optional base URL override:

```bash
npx wrangler secret put NVIDIA_API_BASE_URL
```

If you deploy through the Cloudflare dashboard instead of CLI, make sure the Pages project is linked to the same D1 database with binding name `DB`.

## Notes

- The browser never receives the raw NVIDIA API key.
- Some models require model-specific "no thinking" parameters. The site applies known heuristics when that toggle is enabled.
- Large all-model runs can take a while. The UI supports stopping an active run.
- If the `DB` binding is missing, the benchmark UI still works, but cloud history/rankings will show as unavailable.

## Recommendations & Monthly Auto-Benchmark

FFTrans consumes this site's scored history to recommend NVIDIA models in-app.

### `GET /api/recommendations`

Returns the current best models from D1 history, split into two lists:

- **`topValue`** — top 3 by overall score (accuracy 45% + usability 35% + latency 20%)
- **`topQuality`** — top 3 by pure translation accuracy

Both are filtered by: average latency ≤ 3000ms, thinking-leak rate ≤ 20%, usable rate ≥ 50%. Each entry keeps its last-tested timestamp. CORS-enabled so the desktop app can fetch it. Query params: `latencyCap` (ms), `top` (N), `gameId`.

### `POST /api/auto-benchmark`

Discovers new models and benchmarks the untested ones, then writes results to D1 with a timestamp. Intended to run monthly.

- Fetches the **NVIDIA** model list (all free) and the **OpenRouter** model list **filtered to free models only** (`pricing.prompt == 0`) — this is a cost guard; paid OpenRouter models are never auto-benchmarked.
- Skips models already in history (dedup) and non-chat models (embeddings/rerank/tts/…).
- Applies no-think heuristics; if a model still leaks thinking on the first line, it aborts early (saves calls) and the model naturally fails the recommendation filter.
- Caps new models per call (`MAX_NEW_MODELS_PER_RUN`, default 10) to bound time/cost.

Requires header `x-auto-benchmark-secret: <AUTO_BENCHMARK_SECRET>`.

### Extra secrets

```bash
npx wrangler secret put OPENROUTER_API_KEY   # for benchmarking free OpenRouter models
npx wrangler secret put AUTO_BENCHMARK_SECRET # shared secret to protect the auto endpoint
```

### Monthly schedule

`.github/workflows/monthly-benchmark.yml` (in the app repo) triggers the endpoint on the 1st of each month. Add the same secret as a **GitHub repo secret** named `AUTO_BENCHMARK_SECRET`, and optionally a repo variable `BENCHMARK_ENDPOINT` to override the site URL.
