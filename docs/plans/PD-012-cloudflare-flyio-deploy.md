# PD-012: Cloudflare Pages + Fly.io + Atlas deploy runbook

Status: in progress
Owner: project owner
Related: [ADR-0001](../adrs/ADR-0001-deploy-stack.md)

This is the step-by-step runbook for getting portfolio-dashboard onto the
internet. See ADR-0001 for *why* this stack; this doc is the *how*.

## Prerequisites

* `flyctl` installed locally (`curl -L https://fly.io/install.sh | sh`)
* GitHub repo `suthirram/portfolio-dashboard` pushed and accessible
* Accounts on: MongoDB Atlas, Fly.io, Cloudflare

## Step 1 — MongoDB Atlas cluster

1. Sign in to [cloud.mongodb.com](https://cloud.mongodb.com).
2. Create a new project → "Build a Database" → **M0 Free**.
3. Region: **AWS eu-west-1** (Dublin) — closest to Fly's `ams` region.
4. Cluster name: `portfolio-dashboard`.
5. Database Access → Add user:
   * Username: `portfolio_app`
   * Authentication: SCRAM, generate a strong password, save it.
   * Built-in role: `readWrite` on database `portfolio`.
6. Network Access → Add IP Address → **0.0.0.0/0** (allow from anywhere).
   Auth-only is acceptable here; see ADR-0001 consequences.
7. From "Connect" → "Drivers", copy the connection string. It looks like:
   ```
   mongodb+srv://portfolio_app:<password>@portfolio-dashboard.xxxxx.mongodb.net/portfolio?retryWrites=true&w=majority
   ```
   Replace `<password>` and append the DB name (`/portfolio`) if missing.
   Save it — needed in Step 2.

## Step 2 — Fly.io API deploy

1. Authenticate:
   ```bash
   flyctl auth signup     # or: flyctl auth login
   ```
2. From the repo root, launch (without deploying) so Fly registers the app
   but keeps the `fly.toml` we committed:
   ```bash
   cd backend
   flyctl launch --no-deploy --copy-config --name portfolio-dashboard-api
   ```
   When prompted to overwrite `fly.toml`, say **no** — we want the committed
   one.
3. Set secrets:
   ```bash
   flyctl secrets set \
     MONGODB_URI="mongodb+srv://portfolio_app:<password>@portfolio-dashboard.xxxxx.mongodb.net/portfolio?retryWrites=true&w=majority" \
     CORS_ALLOWED_ORIGINS="https://portfolio-dashboard.pages.dev"
   ```
   (You can update `CORS_ALLOWED_ORIGINS` after Step 3 if the Pages URL ends
   up different.)
4. Deploy:
   ```bash
   flyctl deploy
   ```
5. Verify:
   ```bash
   curl https://portfolio-dashboard-api.fly.dev/api/healthz
   # → {"status":"ok"}
   ```

## Step 3 — Cloudflare Pages frontend

1. Cloudflare dashboard → Workers & Pages → **Create application** → Pages
   → Connect to Git.
2. Select repo `suthirram/portfolio-dashboard`, production branch `main`.
3. Build configuration:
   * Framework preset: **Vite**
   * Build command: `cd frontend && npm ci && npm run build`
   * Build output directory: `frontend/dist`
   * Root directory: `/` (repo root)
4. Environment variables (Production):
   * `VITE_API_URL` = `https://portfolio-dashboard-api.fly.dev`
     (no `/api` suffix, no trailing slash — `client.ts` appends `/api`)
5. Save & Deploy. Note the assigned `*.pages.dev` URL.
6. If the URL differs from the placeholder used in Step 2:
   ```bash
   cd backend
   flyctl secrets set CORS_ALLOWED_ORIGINS="https://<actual>.pages.dev"
   # Fly auto-redeploys after a secret change
   ```

## Step 4 — Smoke test

Run all three from a clean browser session:

* `curl https://portfolio-dashboard-api.fly.dev/api/healthz` → 200 `{"status":"ok"}`
* `curl 'https://portfolio-dashboard-api.fly.dev/api/market/price?symbol=AAPL'` → live JSON
* Browser → open `https://<your>.pages.dev`
  * DevTools Network: all `/api/*` calls go to `*.fly.dev`, all 200
  * Add a holding via the modal → reload → row persists
  * Console clean, no CORS errors

CORS preflight sanity check:
```bash
curl -i -H "Origin: https://<your>.pages.dev" \
     -X OPTIONS \
     https://portfolio-dashboard-api.fly.dev/api/holdings
# → Access-Control-Allow-Origin should echo the Pages origin (not "*")
```

## Out of scope (follow-ups)

* Custom domain (both Pages and Fly support it; do once usage justifies it)
* GitHub Actions CI/CD — v1 is manual `flyctl deploy` + Pages git auto-deploy
* Multi-region Fly deploy
* Atlas IP allow-list tightening (requires paid Fly dedicated egress IP)
* API authentication (currently public; pre-existing, but more visible now)

## Rollback

If a deploy goes bad:

* Frontend: in Cloudflare Pages → Deployments tab → "Rollback to this
  deployment" on the previous successful build.
* Backend: `flyctl releases` to list, then `flyctl releases rollback <version>`.
* Database: M0 has automated daily snapshots; restore via Atlas UI if needed.
