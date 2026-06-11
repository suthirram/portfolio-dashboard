# PD-012: Cloudflare Pages + Fly.io + Atlas deploy runbook

Status: deployed (2026-06-11)
Owner: project owner
Related: [ADR-0001](../adrs/ADR-0001-deploy-stack.md)

Step-by-step runbook for getting portfolio-dashboard onto the internet.
See ADR-0001 for *why* this stack; this doc is the *how*.

## Prerequisites

* `flyctl` installed locally (`curl -L https://fly.io/install.sh | sh`)
* `mongosh` installed (used to dry-run the connection string before
  handing it to Fly)
* GitHub repo pushed and accessible to the deploy targets
* Accounts on: MongoDB Atlas, Fly.io, Cloudflare

## Step 1 — MongoDB Atlas cluster

1. Sign in to [cloud.mongodb.com](https://cloud.mongodb.com).
2. Create a project → "Build a Database" → **M0 Free**.
3. Region: **AWS eu-west-1** (Dublin) — closest to Fly's `ams` region.
4. Cluster name: any (the auto-generated name works fine).
5. Database Access → Add user:
   * Username: `portfolio_app`
   * Authentication: SCRAM, "Autogenerate Secure Password", **copy the
     password**, then **Update User**.
   * Built-in role: `readWrite` on database `portfolio`.
6. Network Access → Add IP Address → **0.0.0.0/0**. Wait for the entry
   to flip from PENDING to ACTIVE. (Auth-only model is documented in
   ADR-0001.)
7. From "Connect" → "Drivers", copy the connection string. Atlas hands
   you a URI of this shape:

   ```
   mongodb+srv://<user>:<password>@<host>.mongodb.net/?appName=<cluster>
   ```

   Turn it into the final URI by inserting the database name `portfolio`
   between the host and the `?`:

   ```
   mongodb+srv://portfolio_app:PASSWORD@<host>.mongodb.net/portfolio?retryWrites=true&w=majority&appName=<cluster>
   ```

8. Dry-run the URI before continuing — this catches the entire class of
   password / URI / network-access problems before Fly gets involved:

   ```bash
   mongosh '<paste full URI here>' --eval 'db.runCommand({ping:1})'
   # Expect: { ok: 1 }
   ```

## Step 2 — Fly.io API deploy

All `flyctl` commands in this section are run from `backend/`, which is
where `fly.toml` and `Dockerfile` live.

1. Authenticate:

   ```bash
   flyctl auth signup     # or: flyctl auth login
   ```

2. Register the app on Fly, reusing the committed `fly.toml`:

   ```bash
   cd backend
   flyctl launch --no-deploy --copy-config --name portfolio-dashboard-api
   ```

   Decline if prompted to overwrite `fly.toml`.

3. Set secrets. Single-quote the URI so the shell doesn't interpret `&`:

   ```bash
   flyctl secrets set \
     MONGODB_URI='mongodb+srv://portfolio_app:PASSWORD@<host>.mongodb.net/portfolio?retryWrites=true&w=majority&appName=<cluster>' \
     CORS_ALLOWED_ORIGINS='https://placeholder.pages.dev'
   ```

   `CORS_ALLOWED_ORIGINS` is a placeholder — overwrite it in Step 3 once
   Cloudflare assigns the real Pages URL.

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

1. Cloudflare dashboard → Workers & Pages → **Create application** →
   **Pages** tab → Connect to Git.
2. Repo `suthirram/portfolio-dashboard`, production branch `main`.
3. Build configuration:
   * Framework preset: **Vite**
   * Root directory: **`frontend`**
   * Build command: `npm ci && npm run build`
   * Build output: `dist`
   * Deploy command: *(leave empty)*
4. Environment variables (Production):
   * `VITE_API_URL` = `https://portfolio-dashboard-api.fly.dev`
     (no `/api` suffix, no trailing slash, no whitespace)
5. Save & Deploy. Cloudflare assigns a production URL of the form
   `https://<project>.pages.dev`.
6. Update the Fly CORS secret to the real Pages URL:

   ```bash
   cd backend
   flyctl secrets set CORS_ALLOWED_ORIGINS='https://<project>.pages.dev'
   # Fly auto-redeploys on secret change
   ```

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
# → Access-Control-Allow-Origin echoes the Pages origin (not "*")
```

Frontend, in a fresh browser tab:

* Open the **production** Pages URL (`https://<project>.pages.dev`).
* DevTools Network: every `/api/*` request hits `*.fly.dev` and returns 200.
* Add a holding via the modal → reload → row persists.
* Console clean — no CORS errors, no `ERR_NAME_NOT_RESOLVED`.

## FAQ

### What's the right shape for the MongoDB URI?

```
mongodb+srv://<user>:<password>@<host>.mongodb.net/<database>?<options>
```

The database name (`portfolio`) goes **before** the `?`, not as a query
parameter and not concatenated onto `appName`. When the database name is
omitted from the path, the MongoDB driver authenticates against `admin`
by default — which is not where the `portfolio_app` user lives, so auth
fails even though the password is correct. Driver default + Atlas user
scoping make this an easy off-by-one in the URI to make.

### Why dry-run the URI with `mongosh`?

`flyctl deploy` failures surface as `machine exited with max retries`,
which is a generic wrapper around any startup error. Failing fast in
`mongosh` locally tells you immediately whether the failure is password,
URI shape, or network-access — instead of waiting for Fly's retry loop
to give up and then digging through `flyctl logs`.

### Why must `flyctl` commands run from `backend/`?

`flyctl` reads `fly.toml` from the current working directory and
auto-generates a stub `fly.toml` if it doesn't find one. Run it from
elsewhere and the stub gets created in the wrong directory, `flyctl
deploy` then builds against the wrong build context (no `Dockerfile`)
and fails with `app does not have a Dockerfile or buildpacks configured`.

### Why single-quote `MONGODB_URI`?

The URI contains `&` (in `&w=majority`) which the shell would otherwise
treat as backgrounding the command. Single quotes pass the entire value
verbatim to `flyctl`.

### Build fails with `go: go.mod requires go >= 1.X (running go 1.Y)`.

The `Dockerfile` builder image (`FROM golang:1.Y-alpine`) is older than
the `go` directive in `backend/go.mod`. Bump the `FROM` line to a tag
that satisfies `go.mod` and re-deploy.

### The frontend build fails with `ENOENT … /opt/buildhome/repo/package.json`.

Cloudflare Pages ran `npm run build` at the repo root, which has no
`package.json`. Set **Root directory** to `frontend` in the Pages build
configuration (rather than putting `cd frontend && …` in the build
command — compound commands are not honoured consistently across
Cloudflare UI versions).

### The Pages deploy created a Worker instead of a static site.

The **Deploy command** field had `npx wrangler deploy`, which is the
Workers publish command. Pages publishes from `dist/` directly; leave
the Deploy command field empty. Delete the Worker (Workers & Pages →
the project → Settings → Delete) and re-create as a Pages app.

### Browser shows `ERR_NAME_NOT_RESOLVED` for `*.fly.dev<spaces>/api/...`.

`VITE_API_URL` was saved with leading or trailing whitespace. Vite
inlines this value as a string literal into the JS bundle at build time,
so the whitespace ends up in every API call. Edit the env var, trim
whitespace, and **retry the Pages deployment** — refreshing isn't
enough; the bundle needs rebuilding.

### Browser shows CORS errors despite Fly returning the right origin.

The browser is on a **per-commit preview URL**
(`https://<sha>.<project>.pages.dev`), but Fly's `CORS_ALLOWED_ORIGINS`
only lists the production alias (`https://<project>.pages.dev`). Echo's
CORS middleware does exact-string matching on `AllowOrigins`, so previews
don't match. Test against the production URL, or switch to
`AllowOriginFunc` in `backend/internal/httpserver/server.go` if previews
need to work too.

### `flyctl status` reports `stopped`. Is the deploy broken?

No. `fly.toml` sets `auto_stop_machines = "stop"` and
`min_machines_running = 0` so the machine scales to zero when idle. The
first request after idle pays a 2–4 s cold start and the machine flips
back to `started`.

## Out of scope (follow-ups)

* Custom domain (both Pages and Fly support it; do once usage justifies it)
* GitHub Actions CI/CD — v1 is manual `flyctl deploy` + Pages git auto-deploy
* Multi-region Fly deploy
* Atlas IP allow-list tightening (requires a paid Fly dedicated egress IP)
* API authentication (currently public; pre-existing, but more visible
  now — see issue #14 for an interim rate-limit mitigation)
* `AllowOriginFunc` so Pages preview URLs also pass CORS

## Rollback

* **Frontend**: Cloudflare Pages → Deployments tab → "Rollback to this
  deployment" on the previous successful build.
* **Backend**: `flyctl releases` to list, then
  `flyctl releases rollback <version>`.
* **Database**: M0 has automated daily snapshots; restore via Atlas UI.
