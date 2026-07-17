---
applyTo: "internal/persistence/**.go"
---

## MongoDB / Persistence Layer

### Layer contract

* All Mongo reads/writes live in `internal/persistence/`. Controllers and services never touch `*mongo.Collection` or `bson` directly.
* `persistence.New(db)` returns `*Store` — one store type per collection.
* Collection names are constants — never hardcode strings in query methods.

### DAO layer responsibilities

* Encapsulate all MongoDB queries, updates, inserts, and deletes in DAO methods.
* Use `context.Context` on every DB call to support cancellation and timeouts.
* Return domain-specific sentinel errors to the service layer — never raw mongo errors.
* Prefer returning typed domain structs over raw `bson.M` or `interface{}`.

### Per-user scoping

`scopedFilter(uid, extra bson.D)` pins `user_id` on every `holdings`/`transactions` query. Never bypass it. Mismatched id → `404` (no enumeration leak).

### Sentinel errors

Return these — don't invent new ones:

* `persistence.ErrNotFound` — document missing
* `persistence.ErrDuplicate` — unique key violation
* `persistence.ErrCronProtected` — attempt to delete a cron-source snapshot row

### Indexing

* Prefer compound indexes; avoid single-field indexes on high-cardinality fields.
* Avoid indexing raw string fields — use enums or short codes where possible.
* If using projections, design the index to cover all projected fields (index-only scan).
* Existing indexes are defined in `internal/db/mongo.go` — add new ones there, not ad-hoc.

### Error handling

* Wrap DB errors with enough context for debugging: `fmt.Errorf("findHolding %s: %w", id, err)`.
* Never leak internal Mongo error messages in HTTP responses.

### Gold exception

`gold.go` uses a Postgres `GoldDao` — only file in `persistence/` that touches Postgres. Pattern is otherwise identical: DAO layer, typed returns, context propagation.
