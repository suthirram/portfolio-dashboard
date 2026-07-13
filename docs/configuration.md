# Environment variables

## Backend

| Var / Flag | Default | Description |
|---|---|---|
| `MONGODB_URI` / `--mongo-uri` | `mongodb://localhost:27017/portfolio` | MongoDB connection string |
| `MONGODB_DATABASE` / `--mongo-db` | `portfolio` | Database name |
| `POSTGRES_URI` | `postgres://portfolio:portfolio@localhost:5432/portfolio?sslmode=disable` | Gold-tracking DB (DD-003). Optional at boot: unreachable/empty ⇒ the server runs with gold features disabled. Embedded migrations apply on connect. |
| `PORT` / `--port` | `8080` | Server port |
| `LOG_LEVEL` / `--log-level` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `LOG_FORMAT` / `--log-format` | `json` | `json` \| `text` |
| `CORS_ALLOWED_ORIGINS` | dev: `http://localhost:3000,http://localhost:5173` | Comma-separated allow-list. **Required in production** — credentialed CORS forbids `*`, so set the real origin (e.g. `https://<app>.pages.dev`). |
| `COOKIE_SECURE` | `false` | Set to `true` in production so the session cookie is emitted with `Secure; SameSite=None`. Driven by config, not `c.Scheme()`, so the hardening does not silently degrade if the proxy stops forwarding `X-Forwarded-Proto`. |
| `PD_NEW_PASSWORD` | *(unset)* | Read only by `admin set-password` so the new password stays out of shell history |

Flags take precedence over env vars, which take precedence over defaults.
Example: `PORT=9090 go run . serve` or `go run . serve --port 9090`.

## Frontend

| Var | Default | Description |
|---|---|---|
| `VITE_API_URL` | (proxied via Vite) | Backend URL for production builds |

Cross-origin auth needs HTTPS: the session cookie is `SameSite=None; Secure`
in production. In local dev the Vite proxy keeps `/api` same-origin, so the
cookie falls back to `SameSite=Lax` and plain HTTP works.
