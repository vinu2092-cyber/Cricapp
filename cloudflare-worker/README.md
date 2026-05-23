# CricApp Cloudflare Worker — Edge Cache + RapidAPI Proxy

Zero-cost commercial-safe replacement for Vercel proxy.

## Why Cloudflare Workers?

| Factor | Cloudflare Workers Free |
|---|---|
| Commercial use | Explicitly allowed (AdMob-safe) |
| Free quota | 100,000 requests/day |
| Edge cache hits | UNLIMITED & FREE (don't count) |
| Bandwidth | Unlimited |
| Edge POPs | 330+ worldwide |
| Cold start | 0 ms (V8 isolates) |

For 10K DAU with 99% cache hit ratio → ~1,000 actual worker invocations/day = 1% of free limit.

## Setup (one-time)

See `/app/CLOUDFLARE_SETUP.md` for the full step-by-step guide (Hindi + English).

Quick version:

```bash
npm install -g wrangler
wrangler login                                     # browser OAuth (one time)

cd /app/cloudflare-worker

# Set RapidAPI keys (comma-separated if multiple)
wrangler secret put CRICBUZZ_KEYS_HOST1
wrangler secret put CRICBUZZ_KEYS_HOST2

wrangler deploy
```

You get a URL like `https://cricapp-proxy.<your-subdomain>.workers.dev`.

Add this URL to Firestore (`app_config/settings/cloudflare_proxy_url`) and the app picks it up on next launch.

## Endpoints

| Endpoint | Cached for | Purpose |
|---|---|---|
| `GET /api/v1/cricbuzz/matches/v1/live` | 45s | Live match list |
| `GET /api/v1/cricbuzz/matches/v1/recent` | 3 min | Recent matches |
| `GET /api/v1/cricbuzz/matches/v1/upcoming` | 10 min | Upcoming matches |
| `GET /api/v1/cricbuzz/mcenter/v1/:id` | 20s | Match detail |
| `GET /api/v1/cricbuzz/mcenter/v1/:id/comm` | 10s | Commentary |
| `GET /api/v1/cricbuzz/mcenter/v1/:id/scard` | 25s | Scorecard |
| `GET /api/v1/cricbuzz/mcenter/v1/:id/team/:teamId` | 1 hour | Squad |
| `GET /api/v1/version` | 5 min | App version control |
| `GET /api/v1/health` | no-cache | Health check |

Add `?host=host2` to any cricbuzz endpoint to use Host 2 (cricbuzz-cricket2).

## Security

- RapidAPI keys live ONLY in Cloudflare secrets (never in app binary)
- Per-IP rate limit: 120 requests/minute (cache hits exempt)
- CORS configurable via `ALLOWED_ORIGIN` in `wrangler.toml`
- Health endpoint is the only no-auth public endpoint

## Monitoring

```bash
wrangler tail              # live log stream
```

Cloudflare dashboard → Workers & Pages → cricapp-proxy → Metrics tab:
- Requests/day (budget tracker)
- Cache hit ratio (target: >95%)
- Error rate (target: <1%)
- CPU time per request (target: <5ms)
