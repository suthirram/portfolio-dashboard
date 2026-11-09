# PD-053: History-first day gain fallback

* **Status**: Backend implemented and tested; frontend pending backend merge
* **Owner**: project owner
* **PRD**: [PRD-010](../prds/PRD-010-day-gain-fallback.md)
* **Design**: [DD-010](../designs/DD-010-day-gain-fallback.md)

## 1. Goal and topology

Yahoo quote metadata → existing symbol cache → shared prices mapper →
owner/admin prices response → history-first dashboard baseline.
Go backend and React frontend; no new dependencies or services.

## 2. Branching and PR sequence

Each slice branches from main; frontend starts after backend merges unless
the owner explicitly authorizes a combined change.

| Branch | Scope and value | No regression | Test anchor |
| --- | --- | --- | --- |
| `fix/day-gain-yahoo-fallback` | Docs, spec, quote cache, mapper; usable previous close in owner/admin API | Optional additive field; snapshots unchanged | Yahoo parsing/cache and endpoint response tests |
| `fix/day-gain-history-first-ui` | Generated types, baseline selection, rows/cards | Historical closes remain preferred | History/Yahoo precedence and unavailable-baseline tests |

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Modify | `backend/internal/services/price.go` | Parse and cache richer quotes |
| Modify | `backend/internal/services/mapper.go` | Expose previous close |
| Modify | `backend/api/specs/portfolio-api.yaml` | Optional response field |
| Regenerate | `backend/api/models.gen.go` | Backend API models |
| Regenerate | `frontend/src/lib/api/schema.gen.ts` | Frontend API types |
| Modify | `frontend/src/features/holdings/dashboardPriceMovement.ts` | History-first baseline |
| Modify | `frontend/src/features/holdings/HoldingsTable.tsx` | Consistent daily movement |
| Modify | `frontend/src/features/dashboard/DashboardPage.tsx` | Currency overview overrides |

## 4. Backend verification

* [x] Add parsing/cache and response tests that fail without previous close.
* [x] Implement optional metadata without changing current-price consumers.
* [x] Regenerate with `go generate -tags tools ./...` in `backend` and
  `npm run gen:api` in `frontend` (type-only output belongs in UI follow-up).
* [x] Run `go test ./...` in `backend`. Expected: all packages pass.

Backend tests, Markdown lint, YAML lint, and diff whitespace checks pass.
Initial Go lint findings came from stale external-worktree cache entries.
All commit hooks, including full Go lint, pass with an isolated lint cache
(`GOLANGCI_LINT_CACHE=/tmp/pd-daygain-pr-lint-cache`).
Frontend types were regenerated to verify the contract; their additive output
is deferred to the UI slice to keep this branch backend-only.

Manual verification after deploying the backend (replace placeholders):

```bash
curl -i -c /tmp/pd-daygain.cookies http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: portfolio-dashboard' \
  -d '{"username":"<dev username>","password":"<dev password>"}'
# Expected: 200, session cookie set.
curl -i -b /tmp/pd-daygain.cookies http://localhost:8080/api/prices
# Expected: 200; holdings include previous_close_price when Yahoo provides it.
curl -i -b /tmp/pd-daygain.cookies \
  'http://localhost:8080/api/admin/users/<userId>/prices'
# Expected: 200 for an authorized admin; same optional previous-close field.
```

## 5. Frontend verification

* [ ] Test history wins over different Yahoo close, Yahoo survives missing
  history, and no baseline produces an unavailable row/total.
* [ ] Use previous close consistently instead of average purchase cost.
* [ ] Run `npm run test:run` and `npm run build` in `frontend`.
  Expected: tests and build pass.
* [ ] Verify owner and admin views; keep snapshot writes unchanged.

## 6. Environment, rollout, and rollback

No environment or data changes. Deploy backend first, then frontend. Verify
both prices endpoints return optional native-currency previous close. Revert
frontend before backend if needed; no stored data needs repair.

## 7. Done

* [x] Review repository rules, task-breakdown, run-app, and snapshot ADR.
* [x] Record historical-close priority and closed-market limitations.

Next: review and merge the backend slice, then ship the frontend consumer.
