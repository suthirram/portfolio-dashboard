# PD-056: Holding sectors and allocation rollout

* **Status**: Grouped design approved in principle; dashboard-compatible docs ready for PR; implementation not started
* **Owner**: project owner
* **PRD**: [PRD-013](../prds/PRD-013-holding-sectors.md)
* **Design**: [DD-013](../designs/DD-013-holding-sectors.md)
* **Decision**: [ADR-0004](../adrs/ADR-0004-direct-yahoo-classification.md)
* **Dependencies**: [Manifest](../feature-deps/PD-056-holding-sectors.md)
* **Visual spec**: [PD-056](../visuals/PD-056-holding-sectors.html)

## 1. Goal and topology

Deliver automatic company sector classification on holding creation, an
idempotent existing-data backfill, explicit user confirmation for missing
classifications and fund types, and separate tables by sector with on-demand
allocation charts. Reuse the Go/React/Mongo stack and existing themes; add no
financial-data library, proxy provider, or new infrastructure.

The backend contacts Yahoo directly over HTTPS, persists only classification
metadata on holdings, and returns it with existing holding/price DTOs. The UI
renders saved metadata and uses a separate authenticated profile preview while
editing. Profile failure leaves holding creation available.

## 2. Branching and PR sequence

Each branch starts from current `main` after its prerequisite merges. Keep backend
and UI PRs separate. The docs PR lands before implementation; generated frontend
types are regenerated during backend verification but committed only in the UI
PR unless a minimal build fix is required. Existing unrelated cookbook/Makefile
changes remain in their original worktree.

| # | Branch | Scope | No regression | Standalone value | Test anchor |
| --- | --- | --- | --- | --- | --- |
| 0 | `docs/holding-sector-design` | PRD, DD, ADR, plan, dependencies, visual spec | Docs only | Reviewable contract and UI before code | Markdown/link checks and visual inspection |
| 1 | `feat/holding-sector-api` | Direct Yahoo service, model/spec/codegen, create/update enrichment, profile/confirmation endpoints, dry-run/apply migration | Optional metadata; provider outage never blocks saves; financial projections untouched | API users can create/read/confirm sectors and operators can backfill | Provider httptest, holding/handler/migration behavioral tests; `go test ./...` |
| 2 | `feat/holding-sector-ui` | Generated TS, add/edit preview, review queue, sector badges/grouped tables, on-demand chart | Existing position views, currency totals, themes, act-as remain available | Owners can classify/review and explore sector allocation | Vitest interaction/aggregation tests and live-stack scenarios |

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `backend/internal/services/company_profile.go` (+ test) | Bounded direct Yahoo protocol and cached profile fetcher |
| Create | `backend/internal/domain/classification.go` | Catalogue and typed classification metadata |
| Modify | `backend/internal/domain/holding.go` | Optional embedded classification |
| Modify | `backend/internal/persistence/holdings.go` (+ test) | Typed scoped writes and migration compare-and-set |
| Modify | `backend/internal/services/holdings.go` (+ test) | Automatic create/identity-change enrichment, confirmation |
| Modify | `backend/internal/services/mapper.go` | Holding/price DTO classification mapping |
| Modify | `backend/internal/controllers/controllers.go` | Shared profile service injection |
| Create | `backend/internal/controllers/classification.go` (+ test) | Profile, own confirmation, act-as confirmation |
| Modify | `backend/internal/httpserver/auth.go` (+ test) | Admin operation tier |
| Modify | `backend/api/specs/openapi.yaml`, domain path files, `portfolio-api.yaml` | Classification schemas/routes, MF enum |
| Regenerate | `backend/api/models.gen.go`, `backend/api/server.gen.go` | Generated Go API |
| Create | `backend/cmd/migrate_sectors.go` (+ test) | Scoped dry-run/apply backfill CLI |
| Modify | Existing persistence user enumeration | Reuse migration owner enumeration without service-level BSON |
| Regenerate | `frontend/src/lib/api/schema.gen.ts` | UI slice generated types |
| Modify | `frontend/src/types.ts`, `lib/api/client.ts`, act-as routing helpers (+ tests) | Typed profile/confirmation calls |
| Create | `frontend/src/features/holdings/classification.ts` (+ test) | Shared bucket/group/color catalogue mapping |
| Create | `frontend/src/features/holdings/ClassificationReview.tsx` (+ test) | Explicit confirmation and review queue |
| Modify | `AddEditModal.tsx`, `HoldingsTable.tsx`, `HoldingsByCurrency.tsx` (+ tests) | Preview, badges, independent category navigation |
| Create | `frontend/src/features/holdings/SectorAllocation.tsx` (+ test) | Native currency allocation and accessible legend |
| Modify | `frontend/src/components/Charts.tsx`, `features/dashboard/DashboardPage.tsx` (+ tests) | On-demand mounting, review banner, chart-to-table selection |
| Modify | `docs/local-setup.md`, cookbook when troubleshooting occurs | Operator guidance and verified recovery evidence |

## 4. Task 1: Lock the reviewable contract

**Files:** PRD-013, DD-013, ADR-0004, this plan, dependency manifest, visual spec.

The docs keep asset type separate from company sector and make provider failure
a review state. Resolve product questions in PRD §10 in place after owner review;
do not relabel proposed defaults as accepted without that review.

* [x] Draft the linked product, technical, and rollout documents.
* [x] Owner reviewed grouped layout and requested existing dashboard values and
  controls. Subsequent correction: retain sector subtotals and flat overall
  footer, remove bottom overall total from sector layout; keep currency summary.
* [x] Updated visual spec and contract to retain the existing 12-column table,
  currency summary and controls. jsdom checks passed for group/row counts,
  subtotal alignment, overall money sums, XIRR scope, and layout switching.
* [x] After owner review and browser authorization, verify table geometry in
  Chrome at 1440 px and 390 px for both layouts. All action buttons stay inside
  their cells, clear of XIRR; no page overflow or script errors. Screenshots
  inspected. [Diagnosis and fix](../cookbook/holding-table-actions-overflow.md).
* [ ] Finish rendered chart/review-dialog interaction verification; table
  geometry checks do not establish those interactions.
* [x] Run Markdown checks. Expected: no errors in these new Markdown files.

  The check is limited to the new feature documents so unrelated local drafts
  and generated files do not enter this docs slice.

  ```bash
  markdownlint docs/prds/PRD-013-holding-sectors.md docs/designs/DD-013-holding-sectors.md docs/plans/PD-056-holding-sectors.md docs/adrs/ADR-0004-direct-yahoo-classification.md docs/feature-deps/PD-056-holding-sectors.md --config .markdownlintrc
  ```

* [ ] Commit the docs slice, push, open a docs PR, and merge only after the five
  protected checks pass and the design is reviewed.

  Stage only the feature documents to preserve earlier work.

  ```bash
  git add docs/prds/PRD-013-holding-sectors.md docs/designs/DD-013-holding-sectors.md docs/plans/PD-056-holding-sectors.md docs/adrs/ADR-0004-direct-yahoo-classification.md docs/feature-deps/PD-056-holding-sectors.md docs/visuals/PD-056-holding-sectors.html
  git commit -m '📝 Specify holding sectors and allocation'
  git push -u origin docs/holding-sector-design
  ```

## 5. Task 2: Provider and API slice

**Files:** backend profile/domain/store/service/controllers/spec/auth files in
§3, generated API files, and adjacent tests.

Complete this as one useful backend PR: auto-enrichment, confirmation, reads,
and backfill are usable without the UI. New classification code uses typed
persistence methods and bound loggers. Tests inject a profile fetcher and use
httptest for provider behavior; CI never depends on Yahoo being reachable.

* [ ] Implement the catalogue, normalized profile model, Yahoo host restrictions,
  cookie/crumb session, response bounds, timeout, cache, deduplication, and cooldown
  exactly as DD §3. Verify the direct protocol using public sample symbols from
  the dev runtime; preserve no cookie/crumb in logs or committed fixtures.
* [ ] Add typed optional holding classification, scoped compare-and-set writes,
  and automatic create/identity-change enrichment. Preserve unresolved holding
  saves and manual confirmation on unrelated edits.
* [ ] Add profile/own-confirmation/act-as-confirmation schemas and handlers,
  `mutual_fund` enum, validation, CSRF, role/region scoping, and mapper fields.
* [ ] Audit existing type switches and trade/dividend import paths. Keep old
  stock/ETF behavior; add explicit MF handling only where existing types are
  assumed exhaustive. Imported holdings missing metadata join the review queue.
* [ ] Regenerate both sides after spec edits and verify generated contracts.

  Generation follows the repository's split-PR convention: frontend type output
  is verified now and regenerated again for the UI commit.

  ```bash
  (cd backend && go generate -tags tools ./...)
  (cd frontend && npm run gen:api)
  (cd backend && go test ./...)
  (cd backend && golangci-lint run --timeout=1m ./...)
  ```

  Expected: Go generation succeeds, tests pass, linter passes, generated TS
  includes optional classification without forcing existing fixtures to change.

* [ ] Verify ready-to-run endpoint curls in the backend PR description: login
  into a cookie jar first, GET profile, create and read a classified holding,
  PUT own confirmation, PUT act-as confirmation. Use `<dev password>` and CSRF
  header on every write, with expected statuses in comments. Keep prose <200
  words with What / How to test / No regression sections.
* [ ] Stage only backend spec/source/tests/generated Go plus this plan's status;
  commit with `✨ Add automatic holding sector classification`, push the backend
  branch, and open its PR. Merge after green CI; never mix UI source into it.

## 6. Task 3: Backfill command and runbook

**Files:** `backend/cmd/migrate_sectors.go`, typed holdings/user persistence,
profile classification helper and migration tests. Ships with Task 2's backend
PR so backfill cannot precede classification on new holding creation.

* [ ] Add explicit owner/all-users scope, default dry-run, `--apply`, limit,
  retry-unresolved, pacing, cancellation, aggregate report, and conflict skips.
* [ ] Test no writes in dry-run; successful first apply; rerun skip; manual
  preservation; concurrent symbol/confirmation preservation; rate-limit stop;
  one owner's scope; and no financial-field writes.
* [ ] Run help and tests. Expected: help documents default dry-run and required
  scope; tests pass without a live database or provider.

  Operators need discoverable scope and write semantics before touching data.

  ```bash
  cd backend
  go run . migrate sectors --help
  go test ./cmd ./internal/persistence ./internal/services
  ```

* [ ] On local/dev only, inspect the dry-run counts for a selected owner before
  applying. Use an actual approved owner id; placeholder below is intentional.

  First preview a small batch; apply only after checking target environment and
  the report. Neither command logs portfolio values or session secrets.

  ```bash
  cd backend
  go run . migrate sectors --user '<owner-object-id>' --limit 10
  go run . migrate sectors --user '<owner-object-id>' --limit 10 --apply
  ```

  Expected: initial report classifies or queues eligible rows; applying the same
  completed batch twice adds no writes. Retry needs-review only deliberately.

* [ ] Update backend PR validation evidence and this plan with observed counts,
  environment, and limitations, excluding personal portfolio data.

## 7. Task 4: UI slice

**Files:** generated frontend types, API/routing helpers, classification helper,
review component, AddEditModal, table/currency views, SectorAllocation, Charts,
DashboardPage, and tests listed in §3.

* [ ] Branch `feat/holding-sector-ui` from `main` only after the backend PR lands.
* [ ] Regenerate TS and wire profile preview and scoped confirmation methods.
  Implement stale-response protection and preserve entered data on failure.
* [ ] Implement the accessible confirmation/review flow with an explicit
  Review later path, no duplicate creation, and act-as target routing.
* [ ] Add text sector badges and By holding / By sector layouts, with separate
  sector headings and rounded tables based on the owner's reference. Retain
  existing active/all/nil navigation and clearly labelled currency/group totals.
  Add invested/current/unrealised sector subtotal rows, keeping the flat table's
  overall footer and existing currency summary. No bottom overall total in By
  sector. Reuse existing summation. Verify group sums
  reconcile, layout switching preserves totals, percentages use aggregate cost,
  and zero invested shows no invalid return.
* [ ] Adapt the existing dashboard rather than replacing it: retain all 12
  holdings columns, table interactions, price/day movement, realised gain,
  dividends, row XIRR/caveats, existing actions/guards, search, refresh, hero,
  summary cards and native/converted currency stats. Keep currency XIRR on the
  overall total only; sector XIRR stays unavailable. Add regression tests for
  monetary/day-gain sums and correctly aligned footer cells in both layouts.
* [ ] Implement native-currency sector allocation with explicit fund, pending,
  and unclassified buckets, priced-value denominator, unpriced count, empty
  state, and category-to-group scrolling/focus. Render only after Sectors selection.
* [ ] Test interactions and aggregation, then run the normal frontend checks.

  These commands exercise the UI slice without broadening the backend PR.

  ```bash
  cd frontend
  npm run gen:api
  npm run typecheck
  npm run test:run
  npm run lint:changed -- origin/main
  npm run build
  ```

  Expected: generation/build/typecheck/lint succeed; all frontend tests pass.

* [ ] Stage only frontend source/types/tests plus plan status; commit with
  `✨ Show holding sectors and allocation`, push the UI branch, and open its PR.
  Validate manually before merging; do not rerun local suites after merge.

## 8. Environment and production rollout

No new environment variable, secret, paid plan, service account, image, or
infrastructure resource. Backend egress must allow the exact Yahoo HTTPS hosts
in DD §3. Existing no-tracing defaults and optional tracing remain unchanged.

* [ ] Deploy the backend slice to dev using the existing PR `dev` label.
* [ ] Validate public-symbol profile access from the deployed runtime; a successful
  price lookup alone does not prove profile access works.
* [ ] Backfill dev after previewing scope and counts. Deploy and verify the UI
  slice against that dev backend, including owner and act-as flows.
* [ ] After backend/UI merge, normal `main` deployment publishes to production.
  Take a normal backup and obtain explicit owner approval before any production
  backfill writes. Do not run production migration automatically at startup.
* [ ] Owner previews production with `migrate sectors --all-users --limit 100`,
  inspects aggregate results, then explicitly authorizes the corresponding
  `--apply`. Resume in bounded batches; retry unresolved only after diagnosing
  the provider failure. Review queue works before backfill completes.

## 9. Rollback

Roll back UI independently to hide the new surfaces. Roll back backend code
without deleting additive classification metadata; old code ignores the fields.
Do not bulk-unset metadata or revert valid manual decisions. Once `mutual_fund`
has been saved, verify the old frontend's enum assumptions before deploying an
old UI; prefer a forward UI fix if it cannot render that type. On provider
failure, cached/manual values and needs-review remain the safe fallback.
No financial or ledger rollback is necessary because those fields are untouched.

## 10. End-to-end verification

* [ ] Create a stock with a recognized sector; skip preview and confirm backend
  enrichment still persists. Reload and check sector badge and chart membership.
* [ ] Simulate unavailable profile and missing-sector stock: save succeeds,
  pending banner appears, no fund conversion occurs, Review later works.
* [ ] Confirm stock sector, explicitly unclassified stock, ETF, and MF; reload
  and verify badge/group/bucket behavior and rerun backfill preservation.
* [ ] Change symbol while a preview is in flight; only the new symbol's result
  is displayed and persisted. Change notes only; manual classification survives.
* [ ] Backfill a legacy owner twice; verify default no-write behavior, owner
  scope, idempotence, and unchanged ledger/quantity/cost/snapshot fields.
* [ ] Check INR and EUR separately: 60/20/20 example, unpriced holding warning,
  zero-value empty state, no fund look-through implication, category navigation.
* [ ] Combine active/all/nil with both table layouts, empty groups, row sort,
  and edit/delete/transaction controls. Currency summary remains labelled;
  chart navigation scrolls to the chosen group without hiding other groups.
* [ ] Confirm act-as mutations target the selected owner; out-of-region and
  unrelated-owner requests return 404; writes without CSRF are refused.
* [ ] Inspect all supported themes, legacy/glass UI, narrow layout, keyboard
  focus, dialog dismissal/restoration, and accessible chart legend.

## 11. Done and next

* [x] Repository flow inspected and docs slice drafted.
* [ ] Docs reviewed and merged.
* [ ] Backend and migration slice implemented, tested, deployed to dev, merged.
* [ ] UI slice implemented, tested, verified in dev, merged.
* [ ] Production backfill explicitly approved and observed.

Next: review the visual spec and resolve PRD §10, then implement the backend
slice after the docs PR lands.
