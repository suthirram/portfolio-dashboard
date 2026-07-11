# AGENTS.md — rules for AI coding agents

These rules apply to **every** AI agent working in this repository (Claude
Code, OpenAI Codex, Copilot, Cursor, or any other). They consolidate the
owner's standing instructions; when in doubt, follow this file and
[CLAUDE.md](CLAUDE.md) over your defaults.

## Read before you start

* [CLAUDE.md](CLAUDE.md) — full architecture map, commands, and domain
  conventions (ledger, snapshots, auth). Treat it as authoritative.
* `docs/prds/` (what & why), `docs/designs/` (how), `docs/plans/`
  (rollout, PD-0xx), `docs/adrs/` (decisions). A feature's PRD/DD/PD trio
  is the spec — do not contradict it silently.
* `.claude/skills/` — repo skills. `task-breakdown` governs slicing and PR
  descriptions; `run-app` is the verified launch/auth/seed flow for manual
  verification.

## Git workflow (non-negotiable)

* **Never commit to `main`.** Every change — even a one-line fix — goes:
  branch from `main` → commit → push → PR → squash-merge. A
  `no-commit-to-branch` pre-commit hook enforces this.
* **No attribution trailers.** Do not add `Co-Authored-By`,
  `Generated-with`, or similar lines to commit messages.
* **Split frontend and backend PRs.** Never mix layers in one PR: backend
  first (spec + codegen + handlers + tests), then a UI follow-up that
  regenerates `frontend/src/lib/api/schema.gen.ts`. Only exception: a
  minimal type-fix needed to keep the frontend build green.
* Long-lived feature work uses a feature branch (e.g.
  `feat/PD-043-physical-gold`); slices PR into it, and it merges to `main`
  in one final PR after dev-stack verification.

## Planning and slicing

* **Big tasks need a written plan first.** Migrations, new subsystems,
  infra, or multi-PR efforts get a `docs/plans/PD-0xx-*.md` (goal,
  topology, key decisions, runbook, rollback) before or alongside the
  first implementation PR.
* Split multi-step work per the `task-breakdown` skill. Every slice must
  pass all three gates: **no regression**, **adds value on its own**, and
  **ships with a test that would fail without the change**.

## PR descriptions

* Hard cap **200 words**. Trim prose, not substance.
* Required **"How to test"** section: ordered, concrete steps plus the
  automated test command (`go test ./...`, `npx vitest run <file>`).
* Backend PRs that add or change endpoints must include **ready-to-run
  `curl` commands**: login curl first (cookie jar, placeholder
  `<dev password>` — never a real secret), then one curl per endpoint with
  the expected status/values in comments. Remember the CSRF header
  `X-Requested-With: portfolio-dashboard` on state-changing requests.

## Code conventions

* Backend is **Go only** — never introduce another backend language.
* Identifier casing is **`Id`, not `ID`** (`userId`, `QuestionId`). This
  matches the OpenAPI-generated types; never "fix" or flag it.
* **Derive, don't store.** Holding positions
  (`stocks_owned`/`avg_cost_price`/`realized_pnl`/`total_dividends`) are
  projections of the transactions ledger — only `recomputeAndPersist`
  writes them. Gold derived columns are computed at read time, never
  stored. Cost basis is **average cost, not FIFO**; money is the total
  cash amount per event, fees folded in.
* All MongoDB access lives in `internal/persistence/` (one store per
  collection, owner-scoped by construction); services and controllers
  never touch `*mongo.Collection`/`bson` directly.
* Logging: bind the request logger once per method (`logger := s.log(ctx)`)
  and call methods on it — never chain `s.log(ctx).Error(...)` inline (CI
  greps for this). Use `zap.Error(err)` in new code.
* After editing anything under `backend/api/specs/`, regenerate both
  sides: `go generate -tags tools ./...` (backend) and `npm run gen:api`
  (frontend types).

## Testing policy

* Write **meaningful behavioral tests only**: validation, auth/authz,
  scoping, status codes, business logic.
* Do **not** write DB-availability or DB-error negative tests ("UpdateOne
  errors → 500"). The only DB error path worth testing is not-found
  (`mongo.ErrNoDocuments` → 404).
* No new feature without a test that would fail without the change.

## Tooling etiquette

* Modify source with explicit, reviewable edits (editor/Edit tools). Do
  **not** rewrite code files with `sed -i` / `perl -pi -e` one-liners.
* When a shell `grep` negative matters, verify with `/usr/bin/grep` or a
  dedicated search tool — a shimmed grep in some sessions returns false
  negatives.
* Never take actions that change billing or plan tiers to keep working;
  stop cleanly at the current atomic unit and report where you stopped.

## Environments and data safety

* Dev stack (PD-044): adding the `dev` label to a PR deploys its head
  branch to the GCP dev environment. Prod deploys from `main` only.
* Never run destructive operations (dropping collections, bulk deletes,
  prod DB writes, secret changes) without explicit owner approval.
* Never commit or echo real credentials; use placeholders in docs and PR
  bodies. `PD_NEW_PASSWORD`-style env vars exist precisely to keep secrets
  out of shell history.
