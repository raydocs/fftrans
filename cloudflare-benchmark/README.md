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
