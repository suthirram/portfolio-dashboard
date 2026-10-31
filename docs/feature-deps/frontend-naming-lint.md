# Frontend naming lint — Dependency manifest

* **Feature**: ESLint `id-length` naming rule on the frontend files each PR changes
* **Decision**: [#221](https://github.com/suthirram/portfolio-dashboard/issues/221) (option B: lint changed files only)
* **Convention**: `CLAUDE.md` → Project rules → Code → Naming
* **No PD plan**: a tooling change, not a product feature, so it has no `PD-0xx` number

Every library, npm package, Go module, container image, or external
service the naming lint introduces, and the vulnerability check run
before adopting it.

## 1. Go backend

**No Go modules added or changed.** The lint is frontend-only.

## 2. Frontend (npm)

Both packages are **`devDependencies`**: they run in CI and on developer
machines only, never ship in the `vite build` bundle.

| Package | Version | Used by | Why it's needed |
|---|---|---|---|
| `eslint` | `^9.39.5` (locked 9.39.5) | `frontend/eslint.config.js`; `npm run lint`; `npm run lint:changed` (spawns `npx eslint`) | Runs the core `id-length` rule. Nothing in the existing toolchain checks identifier names: `tsc` checks types only, and `vitest` only runs tests. |
| `typescript-eslint` | `^8.72.1` (locked 8.72.1) | `frontend/eslint.config.js` (`tseslint.config`, `tseslint.parser`) | ESLint's default parser cannot read TypeScript or TSX. This package supplies the parser so the rule sees `.ts`/`.tsx` sources. No `typescript-eslint` rules are turned on; only the parser and config helper are used. |

Together they add 97 packages to `frontend/package-lock.json`, all
transitive dev-only dependencies of these two.

`frontend/scripts/lint-changed.mjs` and its test use only Node built-ins
(`node:child_process`, `node:fs`, `node:path`, `node:url`, `node:os`)
plus the existing `vitest`.

**Vulnerability check:**

* `npm audit --omit=dev`: 0 vulnerabilities, so the shipped app is
  unaffected.
* `npm audit` (dev included) reports one advisory through this chain:
  [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
  (moderate, `minimatch` < 11.0.1, denial of service via glob-pattern
  amplification). It is transitive: `minimatch@3.1.5` comes through
  `eslint` and `@eslint/*`, and `minimatch@10.2.6` through
  `@typescript-eslint/typescript-estree`. `minimatch` was already in
  the tree before this change (`openapi-typescript` →
  `@redocly/openapi-core` pulls in `minimatch@5.1.9`).
* **Accepted risk:** the only glob patterns these packages match come
  from our own `eslint.config.js` and the file list `git diff` returns.
  No untrusted input reaches `minimatch`, and none of it runs in
  production. The fix `npm audit` proposes is a semver-major *downgrade*
  (`eslint@4`, `typescript-eslint@8.14`), so it doesn't apply here.
  Re-run `npm audit` when bumping either package, and pick up a patched
  `minimatch` once ESLint releases one.

## 3. Infrastructure additions

**None.** The CI step `lint changed files` runs inside the existing
`Frontend (tsc + vitest)` job in `.github/workflows/lint.yml`, on pull
requests only. The job's checkout gains `fetch-depth: 0` so the diff
against the PR base has history. No new images, services, or secrets.

## 4. Auditing this file

If you change either package's version or add an ESLint plugin, edit
this file in the same PR. Reviewers should reject dependency changes
that come without a matching edit here.
