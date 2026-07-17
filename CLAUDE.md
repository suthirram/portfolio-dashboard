# CLAUDE.md

## Context (read on demand)

* **Full instruction index + load-when table:** `docs/ai/ai-instructions.md`
* **Project intent + scope + roles:** `docs/agent/PROJECT_INTENT.md` — read before building any feature.
* **Architecture map** — backend services, frontend features, data flow: `docs/agent/ARCHITECTURE.md`
* **Conventions** — Go style, naming, logging, error handling, auth, ledger, snapshots: `docs/agent/CONVENTIONS.md`
* **Existing docs** — PRDs, ADRs, deployment, local setup: `docs/`

## Git

* Never commit to `main`. Branch → commit → push → `gh pr create` → squash-merge. A pre-commit hook blocks direct commits. After "commit"/"push"/"open a PR" requests, follow this flow without asking.
* **MUST NOT add `Co-Authored-By` trailers** to any commit.

## Security (non-negotiable)

* **Never read `scripts/seed.env`** — it contains production secrets. Do not ask permission to read it.

## Stack

Go (`echo` + `cobra` + `zap`) backend on `:8080`. React 18 + Vite frontend on `:3000`. MongoDB for all portfolio data. Postgres optional — only for gold tracking (DD-003); missing/unreachable → gold endpoints return 503.

## Key Locations

| What | Where |
|------|-------|
| Backend entry | `backend/main.go` → `cmd/` subcommands |
| HTTP routes + middleware | `backend/internal/httpserver/` |
| Data access (Mongo) | `backend/internal/persistence/` |
| Domain structs | `backend/internal/domain/` |
| Business logic | `backend/internal/services/` |
| OpenAPI specs | `backend/api/specs/` (root: `openapi.yaml`, components: `portfolio-api.yaml`) |
| Generated Go types | `backend/api/models.gen.go`, `backend/api/server.gen.go` |
| Frontend features | `frontend/src/features/{auth,dashboard,holdings,history,gold,admin}/` |
| Shared UI | `frontend/src/components/` |
| API client | `frontend/src/lib/api/client.ts` |
| Generated TS types | `frontend/src/lib/api/schema.gen.ts` |
| Postgres migrations | `backend/internal/db/migrations/*.sql` |

## Environment Variables

| Var | Default | Notes |
|-----|---------|-------|
| `MONGODB_URI` | `mongodb://localhost:27017/portfolio` | |
| `POSTGRES_URI` | `postgres://portfolio:portfolio@localhost:5432/portfolio?sslmode=disable` | Optional — nil pool disables gold |
| `PORT` | `8080` | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:5173` | **Required in prod** — credentialed CORS forbids `*` |
| `COOKIE_SECURE` | `false` | `true` in prod; drives `Secure`/`SameSite=None`; do not derive from `c.Scheme()` |
| `PD_NEW_PASSWORD` | — | Read by `admin set-password` to avoid shell-history leaks |
| `VITE_API_URL` | — | Frontend prod only; dev uses Vite proxy |

## Meta

* **Prefer skills over rules.** When a repeated task or workflow emerges, create a Claude Code skill (`~/.claude/commands/`) rather than adding more inline rules here.

## Hard Rules

* **Ledger is source of truth.** Never write `stocks_owned`/`avg_cost_price`/`realized_pnl`/`total_dividends` directly — only via `recomputeAndPersist`.
* **Every state-changing request must carry `X-Requested-With: portfolio-dashboard`** (CSRF). `lib/api/client.ts` handles this automatically.
* **Per-user scoping:** every holdings/transactions query pins `user_id` via `scopedFilter`. Mismatched id → `404`. Detail: `docs/ai/instructions/mongodb.md`.
* **`Id` not `ID`** in Go identifiers — intentional project convention, never flag it.
* **Split FE/BE PRs.** Never mix frontend + backend changes in one PR — backend first, UI follow-up.
* **Endpoint PRs** must include ready-to-run `curl` commands in the How-to-test section.
* After editing `backend/api/specs/`, regen both Go and TS types; `deprecated: true` fields require `x-deprecated-reason` — see `docs/ai/instructions/openapi-specs.md`.

## Commands

```bash
# Local dev
make dev-db        # start MongoDB (Docker)
make backend       # Go server on :8080
make frontend      # Vite dev server on :3000
make tidy          # go mod tidy
make install       # npm install (frontend)

# Full Docker stack
make prod          # MongoDB + backend + frontend (docker compose up --build)
make down          # stop all containers

# Frontend build
cd frontend && npm run build     # production build → frontend/dist
cd frontend && npm run preview   # preview prod build

# Code generation
cd backend && go generate -tags tools ./...   # regen Go API types
cd frontend && npm run gen:api                # regen TS types from OpenAPI specs
```
