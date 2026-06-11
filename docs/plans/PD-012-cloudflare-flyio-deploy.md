# PD-012: Cloudflare Pages + Fly.io + Atlas deploy runbook

Status: deployed (2026-06-11)
Owner: project owner
Related: [ADR-0001](../adrs/ADR-0001-deploy-stack.md)

Step-by-step runbook for getting portfolio-dashboard onto the internet. See
ADR-0001 for *why* this stack; this doc is the *how*.

## Prerequisites

* `flyctl` installed locally (`curl -L https://fly.io/install.sh | sh`)
* `mongosh` installed (used to smoke-test the connection string before
  shipping it to Fly — saves debugging cycles)
* GitHub repo `suthirram/portfolio-dashboard` pushed and accessible
* Accounts on: MongoDB Atlas, Fly.io, Cloudflare

## Step 1 — MongoDB Atlas cluster

1. Sign in to [cloud.mongodb.com](https://cloud.mongodb.com).
2. Create a new project → "Build a Database" → **M0 Free**.
3. Region: **AWS eu-west-1** (Dublin) — closest to Fly's `ams` region.
4. Cluster name: anything you like (the auto-generated `Cluster0` works).
   The connection-string host is independent of the display name.
5. Database Access → Add user:
   * Username: `portfolio_app`
   * Authentication: SCRAM, **click "Autogenerate Secure Password" → Copy
     immediately** (Atlas hides it after you close the modal), then
     **Update User**. If you forget to click Update, the password change
     is silently dropped and the next deploy will hit `Authentication failed`.
   * Built-in role: `readWrite` on database `portfolio`.
6. Network Access → Add IP Address → **0.0.0.0/0** (allow from anywhere).
   Auth-only is acceptable here; see ADR-0001 consequences. Wait for the
   entry to flip from PENDING to ACTIVE before testing.
7. From "Connect" → "Drivers", copy the connection string. Atlas hands you
   a URI of the form:

   ```
   mongodb+srv://<db_username>:<db_password>@<cluster-host>/?appName=<cluster-name>
   ```

   You need to (a) replace `<db_password>`, and (b) **insert the database
   name `portfolio` between the host and the `?`** so the driver picks
   it up. Final shape:

   ```
   mongodb+srv://portfolio_app:PASSWORD@<cluster-host>.mongodb.net/portfolio?retryWrites=true&w=majority&appName=<cluster-name>
   ```

   ⚠ **Common mistake:** leaving `portfolio` *inside* the query string
   (e.g. `...mongodb.net/?appName=Cluster0/portfolio`) silently routes
   auth to the `admin` database, where `portfolio_app` doesn't exist —
   you'll see `Authentication failed` in Fly logs even though the
   password is correct.

8. **Smoke-test it locally before shipping it to Fly:**

   ```bash
   mongosh '<paste full URI here>' --eval 'db.runCommand({ping:1})'
   # → { ok: 1 }
   ```

   If this fails, fix the URI / password / IP allow-list *now* — Fly's
   "max retries exceeded" loop is a much slower way to diagnose the same
   problem.

## Step 2 — Fly.io API deploy

> ⚠ **Run every `flyctl` command from `backend/`.** The `fly.toml` and
> `Dockerfile` live there. Running `flyctl` from the repo root or from
> `docs/plans/` makes Fly auto-generate a stub `fly.toml` in the wrong
> directory and then fail with `app does not have a Dockerfile`.

1. Authenticate:

   ```bash
   flyctl auth signup     # or: flyctl auth login
   ```

2. Launch (without deploying) so Fly registers the app but keeps the
   committed `fly.toml`:

   ```bash
   cd backend
   flyctl launch --no-deploy --copy-config --name portfolio-dashboard-api
   ```

   If prompted to overwrite `fly.toml`, say **no** — we want the
   committed one.

3. Set secrets. **Single-quote the URI**, otherwise the shell will treat
   `&w=majority` as backgrounding the command:

   ```bash
   flyctl secrets set \
     MONGODB_URI='mongodb+srv://portfolio_app:PASSWORD@<host>.mongodb.net/portfolio?retryWrites=true&w=majority&appName=<cluster>' \
     CORS_ALLOWED_ORIGINS='https://<placeholder>.pages.dev'
   ```

   The CORS value is a placeholder — you'll overwrite it in Step 3 once
   Cloudflare assigns the real Pages URL.

4. Deploy:

   ```bash
   flyctl deploy
   ```

   If the build fails with `go: go.mod requires go >= 1.X` — the
   `Dockerfile` builder image is behind the toolchain pin in `go.mod`.
   Bump `FROM golang:1.X-alpine AS builder` to match `go.mod`'s `go`
   directive and commit.

5. Verify:

   ```bash
   curl https://portfolio-dashboard-api.fly.dev/api/healthz
   # → {"status":"ok"}
   ```

   Note: `auto_stop_machines = "stop"` in `fly.toml` means the machine
   scales to zero when idle. `flyctl status` reporting `stopped` is
   normal — the first request after idle pays a ~2-4s cold start and
   the machine flips to `started` automatically.

## Step 3 — Cloudflare Pages frontend

1. Cloudflare dashboard → Workers & Pages → **Create application** →
   **Pages** tab (not Workers — that's a different runtime and not what
   we want) → Connect to Git.
2. Select repo `suthirram/portfolio-dashboard`, production branch `main`.
3. Build configuration:
   * Framework preset: **Vite**
   * **Root directory**: `frontend` — this is the key. With root set,
     Cloudflare runs `npm` from inside `frontend/` and finds
     `package.json`. Don't try to use a `cd frontend && …` build command
     from the repo root — Cloudflare ignores compound commands in some
     UI versions and falls back to running `npm run build` at repo root,
     which fails with `ENOENT: no such file or directory, open
     '/opt/buildhome/repo/package.json'`.
   * **Build command**: `npm ci && npm run build`
   * **Build output**: `dist` (relative to root, so the actual path is
     `frontend/dist`)
   * **Deploy command**: *(leave empty)* — Pages uploads `dist/` directly.
     Do NOT put `npx wrangler deploy` here; that's a Workers command and
     it will silently create a Worker instead of a static site.
4. Environment variables (Production):
   * `VITE_API_URL` = `https://portfolio-dashboard-api.fly.dev`
     * No `/api` suffix, no trailing slash — `frontend/src/lib/api/client.ts`
       appends `/api`.
     * **No leading or trailing whitespace.** Vite inlines this value
       into the built JS bundle as a string literal — a stray space ends
       up in the URL and the browser fails with `ERR_NAME_NOT_RESOLVED`.
5. Save & Deploy. Cloudflare assigns a URL like
   `https://<project-name>-<5-char-hash>.pages.dev`.
6. Update the Fly CORS secret with the actual Pages URL:

   ```bash
   cd backend
   flyctl secrets set CORS_ALLOWED_ORIGINS='https://<project>-<hash>.pages.dev'
   # Fly auto-redeploys after the secret change
   ```

   ⚠ **Use the production alias, not the per-commit preview URL.**
   Cloudflare assigns each commit a preview URL like
   `https://<commit-sha>.<project>.pages.dev`. The Fly CORS allow-list
   only matches the exact origin string, so previews are blocked. Open
   the production URL (`https://<project>.pages.dev`) to test. If you
   need previews to work too, swap Echo's `AllowOrigins` for
   `AllowOriginFunc` in `backend/internal/httpserver/server.go` — but
   that's a code change.

## Step 4 — Smoke test

Backend:

```bash
curl https://portfolio-dashboard-api.fly.dev/api/healthz
# → {"status":"ok"}

curl 'https://portfolio-dashboard-api.fly.dev/api/market/price?symbol=AAPL'
# → {"currency":"USD","price":...,"symbol":"AAPL"}
```

CORS preflight:

```bash
curl -i -H "Origin: https://<project>.pages.dev" -X OPTIONS \
     https://portfolio-dashboard-api.fly.dev/api/holdings
# → Access-Control-Allow-Origin should echo the Pages origin (not "*")
```

Frontend, in a fresh browser tab:

* Open `https://<project>.pages.dev`
* DevTools Network: all `/api/*` calls hit `*.fly.dev`, all 200
* Add a holding via the modal → reload → row persists
* Console is clean — no CORS errors, no `ERR_NAME_NOT_RESOLVED`

## Common gotchas (consolidated)

* **`flyctl` from wrong directory** → "app does not have a Dockerfile".
  Always `cd backend` first.
* **Unquoted Mongo URI** → shell eats `&w=majority`. Always single-quote
  the value passed to `flyctl secrets set`.
* **DB name inside `appName`** instead of before the `?` → auth runs
  against `admin` and fails. See Step 1.7.
* **Forgot to click "Update User" on Atlas password rotation** → next
  deploy authenticates with the old password and fails.
* **`Dockerfile` Go version behind `go.mod`** → build fails with
  `go.mod requires go >= 1.X (running go 1.Y)`. Bump the `FROM`.
* **Cloudflare build runs `npm run build` at repo root** → no
  `package.json`. Set **Root directory** to `frontend`.
* **`VITE_API_URL` with trailing whitespace** → `ERR_NAME_NOT_RESOLVED`
  because the URL is baked into JS at build time.
* **Pages env var change without rebuild** → still shows old value.
  `VITE_*` is build-time. Retry the deployment, don't just refresh.
* **Preview URL CORS-blocked** → Echo's `AllowOrigins` is exact-match.
  Use the production `pages.dev` alias to test.
* **Fly shows `stopped`** → expected with `auto_stop_machines = "stop"`.
  Any HTTP request wakes it.

## Out of scope (follow-ups)

* Custom domain (both Pages and Fly support it; do once usage justifies it)
* GitHub Actions CI/CD — v1 is manual `flyctl deploy` + Pages git auto-deploy
* Multi-region Fly deploy
* Atlas IP allow-list tightening (requires paid Fly dedicated egress IP)
* API authentication (currently public; pre-existing, but more visible now;
  see issue #14 for an interim rate-limit mitigation)
* `AllowOriginFunc` so Pages preview URLs also pass CORS

## Rollback

If a deploy goes bad:

* **Frontend**: Cloudflare Pages → Deployments tab → "Rollback to this
  deployment" on the previous successful build.
* **Backend**: `flyctl releases` to list, then
  `flyctl releases rollback <version>`.
* **Database**: M0 has automated daily snapshots; restore via Atlas UI.
* **Leaked secret**: rotate the Atlas password (Database Access → Edit
  → Edit Password → **Update User**), then re-set `MONGODB_URI` on Fly
  with the new password. Old password is invalidated immediately on
  Atlas side.
