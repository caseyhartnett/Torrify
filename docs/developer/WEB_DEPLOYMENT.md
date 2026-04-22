# Web Deployment (Phase 1 + Phase 2)

This guide deploys Torrify as a static web app while keeping managed chat, licensing, and analytics on the Railway-hosted gateway.

## What This Release Includes

- Static frontend deployment (Cloudflare Pages supported).
- Managed LLM access only (gateway / PRO path).
- No BYOK in the web app.
- Free usage path with optional license key upgrade in Settings.
- OpenSCAD rendering in-browser via WebAssembly (WASM-first).
- Optional server render API fallback for edge/browser compatibility.
- First-party anonymous product analytics sent to the managed gateway.

## Prerequisites

1. Gatekeeper service running on Railway.
2. Gateway policy configured to support:
- limited anonymous/free usage by IP
- higher limits when `X-License-Key` is present and valid
3. Analytics endpoint deployed on the same Railway gateway base URL:
- `POST /api/analytics/events`
- request validation, rate limiting, and Postgres persistence enabled
- CORS allowlist includes the final web app origin
4. Railway Postgres analytics migration applied.
5. If using API render fallback, render API service deployed and reachable.

## 1) Build Commands

Use the web build target:

```bash
npm install
npm run build:web
```

Local web dev mode:

```bash
npm run dev:web
```

## 2) Required Frontend Environment Variables

Set these in your static hosting build environment:

- `VITE_RUNTIME_TARGET=web`
  Note: already set by `dev:web` and `build:web` scripts.
- `VITE_GATEWAY_URL=https://<your-gateway-domain>`

Optional:

- `VITE_GATEWAY_FALLBACK_URLS=https://<fallback-gateway-1>,https://<fallback-gateway-2>`
  - Optional comma-separated list of alternate gateway base URLs.
- `VITE_GATEWAY_MODEL=<managed-default-model>`
  - This is the only model used by the web runtime; users cannot select BYOK or local provider models.
- `VITE_WEB_RENDER_MODE=wasm`
  - Default is `wasm`. Set to `api` to force server render API only.
- `VITE_WEB_WASM_RENDER_TIMEOUT_MS=45000`
  - Per-render timeout for browser-side WASM rendering.
- `VITE_WEB_GATEWAY_TIMEOUT_MS=30000`
  - Client-side timeout for managed chat requests before the browser surface fails fast.
- `VITE_WEB_RENDER_TIMEOUT_MS=45000`
  - Client-side timeout for render API requests.
- `VITE_WEB_WASM_API_FALLBACK=true`
  - If `true`, fallback to API when WASM render fails and `VITE_RENDER_API_URL` is configured.
- `VITE_RENDER_API_URL=https://<your-render-api-domain>`
  - Needed only if you want API fallback or `VITE_WEB_RENDER_MODE=api`.

## 3) Railway Gateway Release Requirements

Deploy the backend changes before you publish the new static web bundle.

Required Railway env vars for analytics:

- `ANALYTICS_ENABLED=true`
- `ANALYTICS_ALLOWED_ORIGINS=https://<your-web-app-domain>`
- `ANALYTICS_MAX_BATCH_SIZE=50`
- `ANALYTICS_MAX_BODY_BYTES=65536`
- `ANALYTICS_RETENTION_DAYS=180`
- `ANALYTICS_IP_HASH_SALT=<secret>`

Required gateway behavior:

- Accept `POST /api/analytics/events`.
- Return `202 Accepted` for valid batches.
- Reject oversized or invalid payloads.
- Hash IPs before persistence; do not store raw IP addresses.
- Keep analytics independent from chat and render behavior so analytics failures do not break the app.

Database work:

- Apply [railway_analytics_events.sql](../architecture/railway_analytics_events.sql)
- Confirm `analytics_events` table exists.
- Confirm `analytics_daily_event_counts` and `analytics_torrify_file_activity` views exist.

Full backend contract and frontend event list:

- [Web Analytics Handoff](./WEB_ANALYTICS.md)

## 4) Cloudflare Pages Setup

Recommended settings:

- Framework preset: `Vite`
- Build command: `npm run build:web`
- Build output directory: `dist-web`
- Node version: 18+
- Environment variables: set values listed above

After deploy, verify the site loads over HTTPS.

## 5) Release Order

Use this order for production rollout:

1. Apply the analytics SQL migration in Railway Postgres.
2. Deploy the Gatekeeper changes that add `/api/analytics/events`.
3. Verify the Railway service env vars and CORS allowlist.
4. Deploy the static web bundle.
5. Run the post-release validation checklist below.

Do not deploy the web bundle first. This frontend now attempts to send analytics batches to the managed gateway, and release-day validation will be noisy if the endpoint is missing.

## 6) LLM Access Behavior (Web)

- Web runtime always uses managed gateway mode.
- Users can chat without entering an API key (free tier behavior is enforced server-side).
- Users can enter a Lemon Squeezy license key in Settings for higher usage.
- License key input is a password field and includes password-manager-friendly attributes.
- The optional license key is stored in browser local storage on that device/profile.

## 7) Analytics Behavior (Web)

- Analytics is anonymous-by-default in the web runtime.
- Users can disable it in `Settings > AI Configuration`.
- Events are batched client-side and flushed to the gateway.
- Analytics captures product actions such as renders, exports, and `.torrify` uploads/downloads.
- Analytics does not send:
- code or editor contents
- chat text
- file contents
- license keys
- full file paths

## 8) Abuse Controls And Guardrails

Before public launch, ensure the gateway, render, and analytics services enforce policy server-side:

- Rate-limit anonymous/free traffic by IP/device/session.
- Apply higher limits only after successful license validation.
- Enforce request body size limits for prompts and image attachments.
- Enforce analytics batch size and request body limits.
- Enforce render timeouts and output-size limits on the render API.
- Add monitoring and alerts for request volume, error rate, analytics ingest failures, and render latency.
- Keep gateway and render endpoints behind HTTPS only.

## 9) Post-Release Validation Checklist

1. Open the app in a clean browser profile.
2. Open `Settings > AI Configuration`.
3. Confirm there is no BYOK provider flow.
4. Confirm the optional license key field is present and uses a password input.
5. Confirm the analytics toggle is visible and enabled by default.
6. Send chat without a license key and confirm the free path still works.
7. Send chat with a valid license key and confirm the paid path still works.
8. Render STL in browser (WASM path).
9. Save a `.torrify` project and confirm the browser download succeeds.
10. Load a `.torrify` project and confirm it parses correctly.
11. Export SCAD/Python and STL and confirm downloads succeed.
12. In Railway logs or DB, confirm analytics events are being ingested.
13. Run a quick SQL sanity check:

```sql
select event_name, count(*)
from analytics_events
where received_at > now() - interval '15 minutes'
group by 1
order by 2 desc;
```

14. Confirm browser console is free of unexpected CSP or network errors.
15. Confirm timeout and error states are understandable when gateway or render API is unavailable.

## 10) Browser Support

Recommended support target for launch:

- Latest Chrome / Edge
- Latest Firefox
- Latest Safari on macOS

If you support mobile browsers, validate them separately. WASM-first rendering can behave differently across devices.

## 11) Troubleshooting

- `Web render endpoint is not configured`
  This only applies if `VITE_WEB_RENDER_MODE=api` or fallback is enabled. Set `VITE_RENDER_API_URL` and redeploy.

- Chat fails with unauthorized
  Check gateway anonymous policy and `VITE_GATEWAY_URL`.

- License key not accepted
  Verify Lemon Squeezy sync/webhook state in gateway DB and key status.

- Analytics requests return `404`
  Deploy the Gatekeeper analytics endpoint before releasing the static web bundle.

- Analytics requests return `403`
  Check `ANALYTICS_ALLOWED_ORIGINS` and the deployed web app origin.

- Analytics requests return `429`
  Check gateway-side rate limits and confirm they are sized for batched browser events rather than chat-only traffic.
