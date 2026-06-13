# PD-027: holdings update — single round-trip

Last of the PD-022 review punch-list. The update path on
`/api/holdings/:id` (and its admin act-as twin) currently does two Mongo
calls: `HoldingStore.UpdateScoped` returns a `bool` "matched", and then
the handler immediately fires `HoldingStore.GetScoped` to read the
authoritative post-update document for the response. Two round-trips
where one will do — `FindOneAndUpdate(..., ReturnDocument: After)`
returns the post-image atomically.

## Goals

* Replace `UpdateScoped(ctx, uid, id, set) (bool, error)` with
  `UpdateScopedAndReturn(ctx, uid, id, set) (domain.Holding, error)`.
  Returns the post-update holding or `persistence.ErrNotFound` when no
  document matched the owner-scoped filter.
* Update the `updateHoldingFor` handler (called by both
  `/api/holdings/:id` and `/api/admin/users/:id/holdings/:holdingId`)
  to call the new method and skip the follow-up `GetScoped`.
* Keep the wire-level scoping guarantee — the issued Mongo command must
  still include `user_id` in its filter.

## Non-goals

* Same treatment for users / sessions stores. Out of scope; the auth
  paths read-then-write a different shape (cumulative counters etc.) and
  aren't a simple atomic post-image. Track separately if useful.
* Schema changes. Pure refactor.
* Anything else from PRD-001 v2 (rate-limit, uniform error text).

## Build order (each step = test-first)

1. **Wire-level test for the new method** — `persistence/holdings_test.go`
   adds `TestUpdateScopedAndReturnIssuesFindOneAndUpdateWithUserScope`
   that inspects the issued Mongo command (`mtest.GetStartedEvent`)
   and asserts:
     * the command name is `findAndModify` (the wire equivalent of
       `FindOneAndUpdate`),
     * the filter pins both `_id` and `user_id`,
     * `new: true` (mongo wire form of `ReturnDocument: After`),
     * the decoded post-image is returned to the caller.
   Also covers the `ErrNotFound` path (mtest replies with `value: null`).
2. **Implementation** — `UpdateScopedAndReturn` uses
   `s.col.FindOneAndUpdate(ctx, scopedFilter(uid, bson.M{"_id": id}),
   bson.M{"$set": set}, options.FindOneAndUpdate().SetReturnDocument(
   options.After))`. Translate `mongo.ErrNoDocuments` to
   `persistence.ErrNotFound`. Drop the now-unused `UpdateScoped` method
   if no caller remains; otherwise leave it but note its single
   surviving caller.
3. **Handler swap** — `updateHoldingFor` calls the new method, returns
   `(holdingToAPI(post), true, nil)` on success and `(_, false, nil)` on
   `ErrNotFound`. Delete the follow-up `GetScoped` call and its
   "update holding re-read failed" log line. Existing handler tests
   stay green.

## Verification run

* `go test ./...` — all packages `ok`.
* `golangci-lint run ./...` — 0 issues.
* `pre-commit run --all-files` — passes.

## Deviations from the design doc

None. DD-001 §6 doesn't pin the implementation strategy; the wire
contract (request body, response body, 404 on missing) is unchanged.

## Known follow-ups

* Mirror the pattern in `users.go` admin mutations (`Hide`,
  `Reactivate`, `ResetLockout`, `Promote`, `Demote`, `SetRegion`) where
  the handler today does `Update` + `FindByID`. Each is its own small
  PR.

## Rollout

Pure refactor; no schema, contract, or behaviour change. Rollback:
revert.
