# PD-059: Wave 4a amendment — exchange-rate re-fetch (slices 11–12)

* **Status**: Draft amendment; implementation starts after this docs PR merges
* **Owner**: Claude; product decisions remain with the project owner
* **Updated**: 2026-11-19
* **Goal**: Days whose EUR→INR rate is a fallback or missing (`fx_carried`) can be healed by the user: History lists them, and **Fetch rates again** re-fetches the rate, rewrites the day's stock totals and clears the flag.
* **Architecture**: Two endpoints over `portfolio_overall` (DD-015 §2.7). `GET /history/fx-missing` lists the caller's flagged days; `POST /history/fx-refetch` re-fetches the requested flagged days in one Yahoo call (`GetDailyCloses` + the shared `rateOn`; the live quote for the current trading day, as the snapshot job does) and heals each day with a conditional update that matches only a still-flagged document. Snapshot rows are only read. The UI_2.0 History page shows the handoff's notice and dialog; the toast reuses the app's toast queue through a UI_2.0 renderer.
* **Tech stack**: Go (echo strict server, oapi-codegen, mongo-driver, `mtest`), React 18 + TypeScript, CSS under `:root[data-ui="ui2"]`, Vitest + Testing Library.
* **Spec links**: [PRD-015 §4.4](../prds/PRD-015-ui-2.md#44-overall-performance), [DD-015 §2.7](../designs/DD-015-ui-2.md#27-missing-rate-prompt-wave-4), [parent plan PD-059](PD-059-ui-2.md), [status board](PD-059-ui-2-status.md), visual authority `docs/visuals/PD-059-ui-2-reference.html` (History: "Review exchange rates" notice and "Fetch exchange rates again" dialog).

## 1. Scope and owner decisions

Owner answers (2026-11-19) these slices implement:

| # | Decision |
| --- | --- |
| Interfaces | The prompt is UI_2.0 only, as in the handoff. Classic and Glass History are unchanged. |
| Partial result | Healed dates drop off; the dialog stays open with the dates still missing and "N dates are still missing; retry or choose Not now." It closes with the toast only when every date heals. |
| Not now | Hides the notice until the app reloads (in-memory, as the handoff's state). |
| Long list | The dialog lists the 10 most recent dates and "and N more"; the fetch still covers every flagged date in one request. |

Rules from PRD-015 §4.4 and DD-015 §2.7, kept exactly: own rows only, never
in act-as (History has no act-as route); a failed fetch keeps the days
flagged and they are offered again; a stored good rate is never
overwritten.

Behaviour this amendment fixes where the DD was silent:

* A requested day that is not flagged is ignored (already healed, or never
  flagged); the response lists only the requested days still flagged.
* A failed Yahoo call is not an error: `200` with every requested day still
  flagged, so the dialog shows its retry message.
* The current trading day (08:00 IST cut-over) uses the live quote, as the
  snapshot job does; every other day uses its close or the last close
  before it (`rateOn`, shared with the snapshot job and the backfill).
* The heal is one conditional update (`fx_carried: true` in the filter, no
  upsert): a rate the snapshot job stored in the meantime is never
  overwritten and no document is created.
* A flagged day without a snapshot row stays flagged (logged); totals need
  the row's buckets.
* The dialog's production copy replaces the handoff's sample wording; the
  "Demonstrate result" select is a preview control and is not built (as
  slice 10 dropped its preview-state select).

## 2. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Modify | `backend/internal/persistence/overall.go` | `ListCarried`, `HealCarried` |
| Create | `backend/internal/services/overall_refetch.go` | `OverallRefetch`: `Missing`, `Refetch`, `ratesFor` |
| Create | `backend/internal/services/overall_refetch_test.go` | Heal, Yahoo failure, unflagged day, live current day, empty request |
| Modify | `backend/api/specs/openapi.yaml`, `backend/api/specs/history/history.yaml`, `backend/api/specs/portfolio-api.yaml` | Two paths and the `FxDates` schema |
| Generated | `backend/api/models.gen.go`, `backend/api/server.gen.go` | `go generate -tags tools ./...` |
| Modify | `backend/internal/controllers/controllers.go` | Wire `OverallRefetch` |
| Modify | `backend/internal/controllers/overall.go` | `GetFxMissing`, `RefetchFx` |
| Modify | `backend/internal/controllers/overall_test.go` | Scoped flagged read, 400 on no dates |
| Modify | `frontend/src/lib/api/client.ts` | `FxDates`, `getFxMissing`, `refetchFx` |
| Generated | `frontend/src/lib/api/schema.gen.ts` | `npm run gen:api` |
| Create | `frontend/src/ui2/shell/Ui2Toaster.tsx` (+ test) | Handoff toast over the app's toast queue |
| Modify | `frontend/src/ui2/shell/Ui2Shell.tsx` | Mount `Ui2Toaster` |
| Modify | `frontend/src/ui2/primitives.css` | `.ui2-toast`, `.ui2-notice`, `.ui2-note` |
| Create | `frontend/src/ui2/history/Ui2FxPrompt.tsx` (+ test) | Notice + dialog |
| Modify | `frontend/src/ui2/history/Ui2History.tsx`, `history.css`, `Ui2History.test.tsx` | Mount the prompt, dialog spacing, mock the new calls |
| Modify | `docs/plans/PD-059-ui-2-status.md` | Rows 11–12, registry |

## 3. PR sequence

| Order | Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- | --- |
| Amendment | `docs/PD-059-wave4-fx-refetch` | This plan, DD-015 §2.7, board | Docs only | Unlocks slices 11–12 | markdownlint |
| Slice 11 (BE) | `feat/PD-059-fx-refetch` | Tasks 1–3 | Two new routes; existing writes untouched (the heal only matches flagged days) | Flagged days can be listed and healed (curl) | `overall_refetch_test.go`, `overall_test.go` |
| Slice 12 (FE) | `feat/PD-059-fx-prompt` | Tasks 4–7, after slice 11 merges | UI_2.0 History only; Classic and Glass unchanged; the toast queue is shared, not changed | The handoff's notice and dialog heal days from History | `Ui2FxPrompt.test.tsx`, `Ui2Toaster.test.tsx` |

Backend first, frontend after it merges; label `ui-2.0`; branched from `main`.

## 4. Tasks

### Task 1: Store: list and heal flagged days

**Files:** `backend/internal/persistence/overall.go` (modify)

`ListCarried` reads only dates (projection), newest first, so the prompt
lists the latest days first. `HealCarried` is the safety net: its filter
adds `fx_carried: true` and it never upserts, so a good rate written by
the snapshot job between the read and the write is left alone.

* [ ] **`overall.go`:**

Current:

```go
    return err == nil, err
}

// Get returns one day's document, or ErrNotFound.
func (s *OverallStore) Get(ctx context.Context, userId primitive.ObjectID, date time.Time) (domain.OverallDay, error) {
    ctx, cancel := context.WithTimeout(ctx, readTimeout)
```

Replace with:

```go
    return err == nil, err
}

// ListCarried returns the dates of the user's flagged days, newest first:
// fx_carried marks a fallback rate after a failed fetch, or no rate yet.
// These are the days History offers to re-fetch (DD-015 §2.7).
func (s *OverallStore) ListCarried(ctx context.Context, userId primitive.ObjectID) ([]time.Time, error) {
    ctx, cancel := context.WithTimeout(ctx, readTimeout)
    defer cancel()
    opts := options.Find().SetSort(bson.D{{Key: "date", Value: -1}}).SetProjection(bson.M{"date": 1})
    cursor, err := s.col.Find(ctx, bson.M{"user_id": userId, "fx_carried": true}, opts)
    if err != nil {
        return nil, err
    }
    defer func() { _ = cursor.Close(ctx) }()
    var days []domain.OverallDay
    if err := cursor.All(ctx, &days); err != nil {
        return nil, err
    }
    dates := make([]time.Time, 0, len(days))
    for _, day := range days {
        dates = append(dates, day.Date.UTC())
    }
    return dates, nil
}

// HealCarried writes a re-fetched rate and the totals at that rate only
// while the day is still flagged, so a good rate the snapshot job stored
// in the meantime is never overwritten and no document is created.
func (s *OverallStore) HealCarried(ctx context.Context, userId primitive.ObjectID, date time.Time, rate domain.FxRate, buckets map[string]domain.RegionSnapshot) error {
    ctx, cancel := context.WithTimeout(ctx, writeTimeout)
    defer cancel()
    filter := overallFilter(userId, date)
    filter["fx_carried"] = true
    _, err := s.col.UpdateOne(ctx, filter, overallUpdate(rate, buckets))
    return err
}

// Get returns one day's document, or ErrNotFound.
func (s *OverallStore) Get(ctx context.Context, userId primitive.ObjectID, date time.Time) (domain.OverallDay, error) {
    ctx, cancel := context.WithTimeout(ctx, readTimeout)
```

* [ ] **Verify:** `cd backend && go build ./...` — Expected: no output.
* [ ] **Commit:** `git add backend/internal/persistence/overall.go && git commit -m "✨ List and heal flagged overall days"`

### Task 2: Service: `OverallRefetch`

**Files:** `backend/internal/services/overall_refetch.go`, `backend/internal/services/overall_refetch_test.go` (create)

`Refetch` intersects the request with the stored flagged days, so a
client can only heal its own flagged days and never creates one. Rates
come from one Yahoo call over the whole span (`GetDailyCloses` from the
earliest day − 7, as the snapshot job does) and `rateOn`, so a weekend or
holiday gets the last close with its own `fx_date`, unflagged. The current
trading day uses the live quote. A day Yahoo has no close for (before the
series starts) stays flagged. Totals are recomputed from the snapshot
row's buckets through `overallUpdate`, the same maths every other write
uses.

```go
package services

import (
    "context"
    "errors"
    "time"

    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.uber.org/zap"

    "portfolio-dashboard/internal/domain"
    "portfolio-dashboard/internal/logging"
    "portfolio-dashboard/internal/persistence"
)

// OverallRefetch re-fetches the EUR→INR rate of a user's flagged
// portfolio_overall days (PD-059, DD-015 §2.7). fx_carried marks a
// fallback rate after a failed fetch, or no rate yet (a History add for a
// new date). Snapshot rows are only read, to recompute each healed day's
// totals at its new rate.
type OverallRefetch struct {
    overall   *persistence.OverallStore
    snapshots *persistence.SnapshotStore
    prices    PriceFetcher
    closer    DailyCloser
    logger    *zap.Logger
    Now       func() time.Time
}

// NewOverallRefetch wires an OverallRefetch; overall may be nil
// (unattached) and closer may be nil (no historical closes: past days stay
// flagged).
func NewOverallRefetch(overall *persistence.OverallStore, snapshots *persistence.SnapshotStore, prices PriceFetcher, closer DailyCloser, logger *zap.Logger) *OverallRefetch {
    return &OverallRefetch{overall: overall, snapshots: snapshots, prices: prices, closer: closer, logger: logger, Now: func() time.Time { return time.Now().UTC() }}
}

func (r *OverallRefetch) log(ctx context.Context) *zap.Logger {
    return logging.FromContextOr(ctx, r.logger)
}

// Missing lists the user's flagged days, newest first, as YYYY-MM-DD.
func (r *OverallRefetch) Missing(ctx context.Context, userId primitive.ObjectID) (_ []string, retErr error) {
    ctx, span := tracer.Start(ctx, "OverallRefetch.Missing")
    defer endSpan(span, &retErr)
    if r.overall == nil {
        return nil, ErrOverallUnavailable
    }
    days, err := r.overall.ListCarried(ctx, userId)
    if err != nil {
        logger := r.log(ctx)
        logger.Error("fx missing read failed", zap.Error(err))
        return nil, err
    }
    dates := make([]string, 0, len(days))
    for _, day := range days {
        dates = append(dates, day.Format(time.DateOnly))
    }
    return dates, nil
}

// Refetch re-fetches the requested days that are still flagged and heals
// each one a rate is found for. It returns the requested days that remain
// flagged, newest first; days that are not flagged are ignored. A failed
// Yahoo call is not an error: the days stay flagged and History offers
// them again (PRD-015 §4.4).
func (r *OverallRefetch) Refetch(ctx context.Context, userId primitive.ObjectID, dates []time.Time) (_ []string, retErr error) {
    ctx, span := tracer.Start(ctx, "OverallRefetch.Refetch")
    defer endSpan(span, &retErr)
    if len(dates) == 0 {
        return nil, ErrInvalidDate
    }
    flagged, err := r.Missing(ctx, userId)
    if err != nil {
        return nil, err
    }
    requested := make(map[string]bool, len(dates))
    for _, date := range dates {
        requested[domain.UTCDate(date).Format(time.DateOnly)] = true
    }
    pending := make([]string, 0, len(dates))
    for _, date := range flagged {
        if requested[date] {
            pending = append(pending, date)
        }
    }
    logger := r.log(ctx)
    rates := r.ratesFor(ctx, logger, pending)
    missing := make([]string, 0, len(pending))
    for _, date := range pending {
        rate, found := rates[date]
        if !found {
            missing = append(missing, date)
            continue
        }
        day, _ := time.Parse(time.DateOnly, date)
        row, err := r.snapshots.Get(ctx, userId, day)
        if errors.Is(err, persistence.ErrNotFound) {
            logger.Warn("fx refetch: flagged day has no snapshot row", zap.String("date", date))
            missing = append(missing, date)
            continue
        }
        if err != nil {
            logger.Error("fx refetch: snapshot read failed", zap.String("date", date), zap.Error(err))
            return nil, err
        }
        if err := r.overall.HealCarried(ctx, userId, day, rate, row.Buckets); err != nil {
            logger.Error("fx refetch: overall write failed", zap.String("date", date), zap.Error(err))
            return nil, err
        }
    }
    return missing, nil
}

// ratesFor finds a rate for each pending day (newest first): the live
// quote for the current trading day on a weekday, as the snapshot job uses
// it, and otherwise the day's close or the last close before it (rateOn)
// from one Yahoo call over the whole span. A day without a rate is left
// out of the map.
func (r *OverallRefetch) ratesFor(ctx context.Context, logger *zap.Logger, pending []string) map[string]domain.FxRate {
    rates := make(map[string]domain.FxRate, len(pending))
    currentDay := SnapshotTradingDay(r.Now())
    past := make([]string, 0, len(pending))
    for _, date := range pending {
        day, _ := time.Parse(time.DateOnly, date)
        if !day.Equal(currentDay) || isWeekend(day) {
            past = append(past, date)
            continue
        }
        rate, _, err := r.prices.GetPrice(ctx, eurInrSymbol)
        if err != nil || rate <= 0 {
            logger.Warn("fx refetch: EUR→INR quote failed", zap.Float64("rate", rate), zap.Error(err))
            continue
        }
        rates[date] = domain.FxRate{EurInr: &rate, FxDate: date}
    }
    if len(past) == 0 {
        return rates
    }
    if r.closer == nil {
        logger.Warn("fx refetch: no historical closes source; past days stay flagged")
        return rates
    }
    earliest, _ := time.Parse(time.DateOnly, past[len(past)-1])
    latest, _ := time.Parse(time.DateOnly, past[0])
    closes, err := r.closer.GetDailyCloses(ctx, eurInrSymbol, earliest.AddDate(0, 0, -7), latest)
    if err != nil {
        logger.Warn("fx refetch: EUR→INR closes fetch failed", zap.Error(err))
        return rates
    }
    days := sortedDays(closes)
    for _, date := range past {
        if rate := rateOn(days, closes, date); rate.EurInr != nil {
            rates[date] = rate
        }
    }
    return rates
}
```

Tests (mtest, the backfill fakes `snapshotRow`, `eurQuote`, `eurCloses`):
a flagged past day heals with one Yahoo call, the filter carries
`fx_carried: true`, no upsert, totals 1100 + 11 × 90 = 2090 and the flag
cleared; a failed fetch writes nothing and returns the day; an unflagged
day needs no fetch; the current trading day uses the live quote only; no
dates is `ErrInvalidDate`.

```go
package services

import (
    "context"
    "errors"
    "testing"
    "time"

    "go.mongodb.org/mongo-driver/bson"
    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.mongodb.org/mongo-driver/mongo/integration/mtest"
    "go.uber.org/zap"

    "portfolio-dashboard/internal/persistence"
)

// failingCloses is a DailyCloser whose Yahoo call fails.
type failingCloses struct{}

func (failingCloses) GetDailyCloses(context.Context, string, time.Time, time.Time) (map[string]float64, error) {
    return nil, errors.New("yahoo down")
}

// flaggedDay is a stored overall document carrying a fallback rate.
func flaggedDay(userId primitive.ObjectID, date time.Time) bson.D {
    return bson.D{{Key: "user_id", Value: userId}, {Key: "date", Value: date}, {Key: "fx_carried", Value: true}}
}

// refetchFor wires an OverallRefetch at Saturday 2026-11-14 10:00 UTC, so
// Friday 2026-11-13 is a past day and the current trading day is Saturday.
func refetchFor(mt *mtest.T, prices PriceFetcher, closer DailyCloser) *OverallRefetch {
    store := persistence.New(mt.DB)
    store.AttachOverall()
    refetch := NewOverallRefetch(store.Overall, store.Snapshots, prices, closer, zap.NewNop())
    refetch.Now = func() time.Time { return time.Date(2026, 11, 14, 10, 0, 0, 0, time.UTC) }
    return refetch
}

// overallUpdates returns the update statements sent to portfolio_overall.
func overallUpdates(mt *mtest.T) []bson.Raw {
    var updates []bson.Raw
    for _, event := range mt.GetAllStartedEvents() {
        if event.CommandName == "update" {
            updates = append(updates, event.Command.Lookup("updates").Array().Index(0).Value().Document())
        }
    }
    return updates
}

func TestOverallRefetchHealsAFlaggedPastDay(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
    mt.Run("heal", func(mt *mtest.T) {
        userId := primitive.NewObjectID()
        mt.AddMockResponses(
            mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, flaggedDay(userId, backfillFriday)),
            mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, snapshotRow(userId, backfillFriday, 11)),
            mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}),
        )
        calls := 0
        missing, err := refetchFor(mt, eurQuote{calls: new(int)}, eurCloses{closes: map[string]float64{"2026-11-13": 90}, calls: &calls}).
            Refetch(context.Background(), userId, []time.Time{backfillFriday})
        if err != nil {
            t.Fatalf("Refetch: %v", err)
        }
        if len(missing) != 0 || calls != 1 {
            t.Errorf("missing = %v, Yahoo calls = %d; want none missing after one call", missing, calls)
        }
        updates := overallUpdates(mt)
        if len(updates) != 1 {
            t.Fatalf("overall updates = %d; want 1", len(updates))
        }
        if carried, ok := updates[0].Lookup("q", "fx_carried").BooleanOK(); !ok || !carried {
            t.Error("the heal must only match a day that is still flagged, never a good stored rate")
        }
        if upsert, _ := updates[0].Lookup("upsert").BooleanOK(); upsert {
            t.Error("the heal must never create a document")
        }
        set := updates[0].Lookup("u", "$set")
        if got := set.Document().Lookup("stocks_current_inr").Double(); got != 2090 {
            t.Errorf("stocks_current_inr = %v; want 1100 + 11×90 = 2090", got)
        }
        if carried := set.Document().Lookup("fx_carried").Boolean(); carried {
            t.Error("a healed day must clear fx_carried")
        }
    })
}

func TestOverallRefetchKeepsDaysFlaggedWhenYahooFails(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
    mt.Run("failure", func(mt *mtest.T) {
        userId := primitive.NewObjectID()
        mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, flaggedDay(userId, backfillFriday)))
        missing, err := refetchFor(mt, eurQuote{calls: new(int)}, failingCloses{}).
            Refetch(context.Background(), userId, []time.Time{backfillFriday})
        if err != nil {
            t.Fatalf("a failed fetch must not be an error: %v", err)
        }
        if len(missing) != 1 || missing[0] != "2026-11-13" {
            t.Errorf("missing = %v; want [2026-11-13]", missing)
        }
        if len(overallUpdates(mt)) != 0 {
            t.Error("a failed fetch must write nothing")
        }
    })
}

func TestOverallRefetchIgnoresDaysThatAreNotFlagged(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
    mt.Run("not flagged", func(mt *mtest.T) {
        userId := primitive.NewObjectID()
        mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch))
        calls := 0
        missing, err := refetchFor(mt, eurQuote{calls: new(int)}, eurCloses{calls: &calls}).
            Refetch(context.Background(), userId, []time.Time{backfillThursday})
        if err != nil {
            t.Fatalf("Refetch: %v", err)
        }
        if len(missing) != 0 || calls != 0 || len(overallUpdates(mt)) != 0 {
            t.Errorf("missing = %v, Yahoo calls = %d; an unflagged day needs no fetch and no write", missing, calls)
        }
    })
}

func TestOverallRefetchUsesTheLiveQuoteForTheCurrentTradingDay(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
    mt.Run("current day", func(mt *mtest.T) {
        userId := primitive.NewObjectID()
        monday := time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
        mt.AddMockResponses(
            mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, flaggedDay(userId, monday)),
            mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, snapshotRow(userId, monday, 11)),
            mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}),
        )
        quotes, closes := 0, 0
        refetch := refetchFor(mt, eurQuote{rate: 91, calls: &quotes}, eurCloses{calls: &closes})
        refetch.Now = func() time.Time { return time.Date(2026, 11, 16, 6, 0, 0, 0, time.UTC) } // 11:30 IST Monday
        missing, err := refetch.Refetch(context.Background(), userId, []time.Time{monday})
        if err != nil {
            t.Fatalf("Refetch: %v", err)
        }
        if len(missing) != 0 || quotes != 1 || closes != 0 {
            t.Errorf("missing = %v, quotes = %d, closes calls = %d; want the live quote only", missing, quotes, closes)
        }
        updates := overallUpdates(mt)
        if len(updates) != 1 || updates[0].Lookup("u", "$set", "eur_inr").Double() != 91 {
            t.Errorf("updates = %v; want eur_inr 91 from the live quote", updates)
        }
    })
}

func TestOverallRefetchRequiresDates(t *testing.T) {
    t.Parallel()
    refetch := NewOverallRefetch(nil, nil, nil, nil, zap.NewNop())
    if _, err := refetch.Refetch(context.Background(), primitive.NewObjectID(), nil); !errors.Is(err, ErrInvalidDate) {
        t.Errorf("err = %v; want ErrInvalidDate", err)
    }
}
```

* [ ] **Verify:** `cd backend && go test ./internal/services/ -run OverallRefetch -v`
  Expected: `5` tests `PASS`, `ok`.
* [ ] **Commit:** `git add backend/internal/services/overall_refetch.go backend/internal/services/overall_refetch_test.go && git commit -m "✨ Re-fetch flagged EUR→INR rates"`

### Task 3: Endpoints

**Files:** specs (3, modify), generated `models.gen.go` / `server.gen.go`, `controllers.go`, `overall.go`, `overall_test.go` (modify)

One schema, `FxDates`, serves the list, the request and the response.
The routes sit under `/history` (own portfolio); act-as uses
`/admin/users/{id}/…` and has no equivalent. `newWithDeps` takes the
closes source from the price service by interface, so test fakes without
`GetDailyCloses` simply leave past days flagged.

* [ ] **`openapi.yaml`:**

Current:

```yaml
    $ref: "./history/history.yaml#/history"
  /history/overall:
    $ref: "./history/history.yaml#/history_overall"
  /history/{date}/regions:
    $ref: "./history/history.yaml#/history_date_regions"
  /history/{date}:
```

Replace with:

```yaml
    $ref: "./history/history.yaml#/history"
  /history/overall:
    $ref: "./history/history.yaml#/history_overall"
  /history/fx-missing:
    $ref: "./history/history.yaml#/history_fx_missing"
  /history/fx-refetch:
    $ref: "./history/history.yaml#/history_fx_refetch"
  /history/{date}/regions:
    $ref: "./history/history.yaml#/history_date_regions"
  /history/{date}:
```

* [ ] **`history/history.yaml`** (appended):

Current:

```yaml
              $ref: "../portfolio-api.yaml#/components/schemas/OverallHistory"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
```

Replace with:

```yaml
              $ref: "../portfolio-api.yaml#/components/schemas/OverallHistory"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"

history_fx_missing:
  get:
    tags: [History]
    summary: The caller's days with a fallback or missing EUR→INR rate
    description: |
      PD-059 (DD-015 §2.7). Days whose portfolio_overall rate is flagged
      (fx_carried): a fallback after a failed fetch, or no rate yet. History
      offers to re-fetch them. Own portfolio only; act-as has no route here.
    operationId: getFxMissing
    responses:
      "200":
        description: Flagged days, newest first
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/FxDates"

history_fx_refetch:
  post:
    tags: [History]
    summary: Re-fetch the EUR→INR rate for flagged days
    description: |
      PD-059 (DD-015 §2.7). Fetches the rate of each requested day that is
      still flagged (one Yahoo call; the live quote for the current trading
      day), rewrites the day's rate and stock totals and clears its flag.
      Days that are not flagged are ignored. A failed fetch is not an
      error: the response lists the days that stay flagged.
    operationId: refetchFx
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/FxDates"
    responses:
      "200":
        description: The requested days still flagged, newest first
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/FxDates"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
```

* [ ] **`portfolio-api.yaml`:**

Current:

```yaml
          type: boolean
          description: Gold could not be read for a gold-enabled account; every amount is absent

    HistoryList:
      type: object
      required: [currency, rows]
```

Replace with:

```yaml
          type: boolean
          description: Gold could not be read for a gold-enabled account; every amount is absent

    FxDates:
      type: object
      required: [dates]
      properties:
        dates:
          type: array
          items:
            type: string
            format: date
          description: Days with a flagged EUR→INR rate (PD-059)

    HistoryList:
      type: object
      required: [currency, rows]
```

* [ ] **Generate:** `cd backend && go generate -tags tools ./...`
  Expected: `api/models.gen.go` gains `FxDates`; `api/server.gen.go` gains `GetFxMissing` / `RefetchFx`.
* [ ] **`controllers.go`:**

Current:

```go
    stockXirr    *services.StockXirrService
    history      *services.HistoryService
    overall      *services.OverallService
    dividends    *services.DividendsService
    tradeImport  *services.TradeImportService
    gold         *services.GoldService // nil when Postgres is not configured (DD-003 §1) — gold routes answer 503
```

Replace with:

```go
    stockXirr    *services.StockXirrService
    history      *services.HistoryService
    overall      *services.OverallService
    fxRefetch    *services.OverallRefetch
    dividends    *services.DividendsService
    tradeImport  *services.TradeImportService
    gold         *services.GoldService // nil when Postgres is not configured (DD-003 §1) — gold routes answer 503
```

Current:

```go
// unclassified.
func newWithDeps(store *persistence.Store, priceService services.PriceFetcher, profiles services.ProfileFetcher, logger *zap.Logger, cookieSecure bool) *Controller {
    recomputer := services.NewSnapshotRecomputer(store.Holdings, store.Transactions, store.Snapshots, logger)
    return &Controller{
        store:        store,
        priceService: priceService,
```

Replace with:

```go
// unclassified.
func newWithDeps(store *persistence.Store, priceService services.PriceFetcher, profiles services.ProfileFetcher, logger *zap.Logger, cookieSecure bool) *Controller {
    recomputer := services.NewSnapshotRecomputer(store.Holdings, store.Transactions, store.Snapshots, logger)
    // PriceService also serves daily closes; a test fake without them
    // leaves past days flagged on a re-fetch.
    closer, _ := priceService.(services.DailyCloser)
    return &Controller{
        store:        store,
        priceService: priceService,
```

Current:

```go
        stockXirr:    services.NewStockXirrService(store.Holdings, store.Transactions, priceService, logger),
        history:      services.NewHistoryService(store.Snapshots, logger),
        overall:      services.NewOverallService(store.Overall, logger),
        dividends:    services.NewDividendsService(store.Transactions, store.Holdings, store, logger),
        tradeImport:  services.NewTradeImportService(store.Transactions, store.Holdings, store, recomputer, logger),
        logger:       logger,
```

Replace with:

```go
        stockXirr:    services.NewStockXirrService(store.Holdings, store.Transactions, priceService, logger),
        history:      services.NewHistoryService(store.Snapshots, logger),
        overall:      services.NewOverallService(store.Overall, logger),
        fxRefetch:    services.NewOverallRefetch(store.Overall, store.Snapshots, priceService, closer, logger),
        dividends:    services.NewDividendsService(store.Transactions, store.Holdings, store, logger),
        tradeImport:  services.NewTradeImportService(store.Transactions, store.Holdings, store, recomputer, logger),
        logger:       logger,
```

* [ ] **`overall.go`:**

Current:

```go
    "errors"
    "time"

    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.uber.org/zap"
```

Replace with:

```go
    "errors"
    "time"

    openapi_types "github.com/oapi-codegen/runtime/types"
    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.uber.org/zap"
```

Current:

```go
    return api.GetOverallHistory200JSONResponse(out), nil
}

// overallGold reads the gold side for the days: the overlay History uses
// plus whether gold was held each day (to tell "no price yet" from "no gold
// yet"). Unavailable is set for a gold-enabled caller whenever gold cannot
```

Replace with:

```go
    return api.GetOverallHistory200JSONResponse(out), nil
}

// GetFxMissing lists the caller's days with a flagged EUR→INR rate, newest
// first, for History's re-fetch prompt (PD-059, DD-015 §2.7). Own portfolio
// only: act-as has no route here.
func (h *Controller) GetFxMissing(ctx context.Context, _ api.GetFxMissingRequestObject) (api.GetFxMissingResponseObject, error) {
    currentUserId, err := currentUserID(ctx)
    if err != nil {
        return nil, err
    }
    dates, err := h.fxRefetch.Missing(ctx, currentUserId)
    if err != nil {
        return nil, err
    }
    return api.GetFxMissing200JSONResponse(toAPIFxDates(dates)), nil
}

// RefetchFx re-fetches the rate of the requested flagged days and answers
// with the ones still flagged. A failed fetch is not an error.
func (h *Controller) RefetchFx(ctx context.Context, request api.RefetchFxRequestObject) (api.RefetchFxResponseObject, error) {
    currentUserId, err := currentUserID(ctx)
    if err != nil {
        return nil, err
    }
    if request.Body == nil || len(request.Body.Dates) == 0 {
        return api.RefetchFx400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new("dates required")}}, nil
    }
    dates := make([]time.Time, 0, len(request.Body.Dates))
    for _, date := range request.Body.Dates {
        dates = append(dates, date.Time)
    }
    missing, err := h.fxRefetch.Refetch(ctx, currentUserId, dates)
    if err != nil {
        return nil, err
    }
    return api.RefetchFx200JSONResponse(toAPIFxDates(missing)), nil
}

func toAPIFxDates(dates []string) api.FxDates {
    out := api.FxDates{Dates: make([]openapi_types.Date, 0, len(dates))}
    for _, date := range dates {
        out.Dates = append(out.Dates, mustParseAPIDate(date))
    }
    return out
}

// overallGold reads the gold side for the days: the overlay History uses
// plus whether gold was held each day (to tell "no price yet" from "no gold
// yet"). Unavailable is set for a gold-enabled caller whenever gold cannot
```

* [ ] **`overall_test.go`** (appended): the list is scoped to the caller
  and filters `fx_carried`; an empty request is `400`.

Current:

```go
        }
    })
}
```

Replace with:

```go
        }
    })
}

func TestGetFxMissing(t *testing.T) {
    t.Parallel()
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

    mt.Run("lists the caller's flagged days", func(mt *mtest.T) {
        caller := scopedUser()
        flagged := bson.D{
            {Key: "user_id", Value: caller.ID},
            {Key: "date", Value: time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)},
            {Key: "fx_carried", Value: true},
        }
        mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, flagged))
        resp, err := overallHandler(mt).GetFxMissing(userCtx(caller), api.GetFxMissingRequestObject{})
        if err != nil {
            t.Fatalf("GetFxMissing: %v", err)
        }
        got, ok := resp.(api.GetFxMissing200JSONResponse)
        if !ok || len(got.Dates) != 1 || got.Dates[0].Format("2006-01-02") != "2026-11-13" {
            t.Fatalf("response = %#v; want 200 with 2026-11-13", resp)
        }
        command := mt.GetStartedEvent().Command
        userId, ok := commandFilterUserID(t, command, "find")
        if !ok || userId != caller.ID {
            t.Errorf("read scoped to %v; want the caller %v", userId, caller.ID)
        }
        if carried, _ := command.Lookup("filter", "fx_carried").BooleanOK(); !carried {
            t.Error("the read must select only flagged days")
        }
    })
}

func TestRefetchFxRequiresDates(t *testing.T) {
    t.Parallel()
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

    mt.Run("empty dates is a 400", func(mt *mtest.T) {
        resp, err := overallHandler(mt).RefetchFx(userCtx(scopedUser()), api.RefetchFxRequestObject{Body: &api.FxDates{}})
        if err != nil {
            t.Fatalf("RefetchFx: %v", err)
        }
        if _, ok := resp.(api.RefetchFx400JSONResponse); !ok {
            t.Fatalf("response = %T, want 400", resp)
        }
    })
}
```

* [ ] **Verify:** `cd backend && go test ./... && golangci-lint run ./...`
  Expected: every package `ok`; `0 issues.`
* [ ] **Commit:** `git add backend/api backend/internal/controllers && git commit -m "✨ Serve fx-missing and fx-refetch"`
* [ ] **PR description curl** (dev stack):

```bash
curl -s -c /tmp/pd.jar -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' -H 'X-Requested-With: portfolio-dashboard' \
  -d '{"username":"admin","password":"<dev password>"}' -o /dev/null -w '%{http_code}\n'   # 200
curl -s -b /tmp/pd.jar http://localhost:8080/api/history/fx-missing
# 200 {"dates":["2026-11-18",…]} newest first
curl -s -b /tmp/pd.jar -X POST http://localhost:8080/api/history/fx-refetch \
  -H 'Content-Type: application/json' -H 'X-Requested-With: portfolio-dashboard' \
  -d '{"dates":["2026-11-18"]}'
# 200 {"dates":[]} once healed; still-flagged days are listed
curl -s -b /tmp/pd.jar -X POST http://localhost:8080/api/history/fx-refetch \
  -H 'Content-Type: application/json' -H 'X-Requested-With: portfolio-dashboard' \
  -d '{"dates":[]}' -o /dev/null -w '%{http_code}\n'   # 400
```

### Task 4: API client

**Files:** `frontend/src/lib/api/client.ts` (modify), generated `schema.gen.ts`

Slice 12 starts after slice 11 merges: regenerate the types from the
merged spec, then add the two calls.

* [ ] **Generate:** `cd frontend && npm run gen:api` — Expected: `schema.gen.ts` gains `FxDates`.
* [ ] **`client.ts`:**

Current:

```ts
export type GoldMetrics = Schemas['GoldMetrics']
export type OverallPoint = Schemas['OverallPoint']
export type OverallHistory = Schemas['OverallHistory']

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
```

Replace with:

```ts
export type GoldMetrics = Schemas['GoldMetrics']
export type OverallPoint = Schemas['OverallPoint']
export type OverallHistory = Schemas['OverallHistory']
export type FxDates = Schemas['FxDates']

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
```

Current:

```ts
  patchHistoryRegions:(date: string, body: PatchHistoryRegionsInput) => request<HistoryRow>('PUT', `/history/${date}/regions`, body),
  deleteHistoryRow:   (date: string) => request<void>('DELETE', `/history/${date}`),
  pasteHistory:       (body: PasteHistoryInput) => request<PasteHistoryReport>('POST', '/history/paste', body),

  // Admin.
  adminListUsers:       (includeHidden = false) => request<User[]>('GET', `/admin/users${includeHidden ? '?include_hidden=1' : ''}`),
```

Replace with:

```ts
  patchHistoryRegions:(date: string, body: PatchHistoryRegionsInput) => request<HistoryRow>('PUT', `/history/${date}/regions`, body),
  deleteHistoryRow:   (date: string) => request<void>('DELETE', `/history/${date}`),
  pasteHistory:       (body: PasteHistoryInput) => request<PasteHistoryReport>('POST', '/history/paste', body),
  getFxMissing:       () => request<FxDates>('GET', '/history/fx-missing'),
  refetchFx:          (dates: string[]) => request<FxDates>('POST', '/history/fx-refetch', { dates }),

  // Admin.
  adminListUsers:       (includeHidden = false) => request<User[]>('GET', `/admin/users${includeHidden ? '?include_hidden=1' : ''}`),
```

* [ ] **Verify:** `cd frontend && npx tsc -b` — Expected: no output.
* [ ] **Commit:** `git add frontend/src/lib/api/client.ts frontend/src/lib/api/schema.gen.ts && git commit -m "✨ Add the fx re-fetch API calls"`

### Task 5: UI_2.0 toast

**Files:** `frontend/src/ui2/shell/Ui2Toaster.tsx`, `Ui2Toaster.test.tsx` (create), `Ui2Shell.tsx`, `primitives.css` (modify)

The handoff confirms a successful re-fetch with its `.toast`. The app
already has a toast queue (`lib/toast`, PD-054) rendered by the Glass
`Toaster`; UI_2.0 gets its own renderer of the same queue, so `toast()`
works in every interface and nothing is duplicated. It shows the newest
message, centred at the bottom, in a polite live region. `primitives.css`
also gains the handoff's `.asset-alert` (`.ui2-notice`) and `.asset-note`
(`.ui2-note`) for any page that needs them.

```tsx
// The handoff's toast (#toast): one message centred at the bottom of the
// screen. It renders the app's toast queue (lib/toast), so toast() works
// the same in every interface; UI_2.0 shows the newest message. A polite
// live region announces it without moving focus.
import { useSyncExternalStore } from 'react'
import { currentToasts, subscribeToasts } from '../../lib/toast'
import '../primitives.css'

export function Ui2Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, currentToasts, currentToasts)
  const newest = toasts.at(-1)
  return (
    <div role="status" aria-live="polite">
      {newest && <div key={newest.id} className="ui2-toast">{newest.message}</div>}
    </div>
  )
}
```

```tsx
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetToastsForTests, toast } from '../../lib/toast'
import { Ui2Toaster } from './Ui2Toaster'

describe('Ui2Toaster', () => {
  beforeEach(() => __resetToastsForTests())

  it('shows the newest toast in a polite live region', () => {
    render(<Ui2Toaster />)
    act(() => { toast('First') })
    act(() => { toast('Exchange rates restored', 'success') })
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('Exchange rates restored')
    expect(region).not.toHaveTextContent('First')
  })
})
```

`Ui2Shell.tsx`:

Current:

```tsx
import '../ui2.css'
import '../cyberEntrance.css'
import { useCyberEntrance } from './useCyberEntrance'

// Ui2Shell is the UI_2.0 app frame (PD-059), built 1:1 from the owner's
// handoff mockup (docs/visuals/PD-059-ui-2-reference.html): a fixed sidebar
```

Replace with:

```tsx
import '../ui2.css'
import '../cyberEntrance.css'
import { useCyberEntrance } from './useCyberEntrance'
import { Ui2Toaster } from './Ui2Toaster'

// Ui2Shell is the UI_2.0 app frame (PD-059), built 1:1 from the owner's
// handoff mockup (docs/visuals/PD-059-ui-2-reference.html): a fixed sidebar
```

Current:

```tsx
        </header>
        {children}
      </div>
    </div>
  )
}
```

Replace with:

```tsx
        </header>
        {children}
      </div>
      <Ui2Toaster />
    </div>
  )
}
```

`primitives.css`:

Current:

```css

  :root[data-ui="ui2"] .ui2-dialog-actions { flex-wrap: wrap; }
}
```

Replace with:

```css

  :root[data-ui="ui2"] .ui2-dialog-actions { flex-wrap: wrap; }
}

/* ---------- toast and notice (handoff .toast, .asset-alert, .asset-note) ---------- */

:root[data-ui="ui2"] .ui2-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--u2-text);
  color: var(--u2-bg);
  padding: 13px 20px;
  border-radius: 10px;
  z-index: 110;
  font: 12px var(--u2-font);
  box-shadow: 0 5px 30px #0002;
  max-width: calc(100% - 32px);
}

:root[data-ui="ui2"] .ui2-notice {
  border: 1px solid #c59544;
  background: color-mix(in srgb, #c59544 10%, var(--u2-panel));
  color: var(--u2-text);
  padding: 14px 18px;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
}

:root[data-ui="ui2"] .ui2-notice strong {
  display: block;
  font-size: 12px;
  margin-bottom: 5px;
}

:root[data-ui="ui2"] .ui2-notice span {
  font-size: 11px;
  color: var(--u2-muted);
}

:root[data-ui="ui2"] .ui2-note {
  color: var(--u2-muted);
  font-size: 11px;
  line-height: 1.6;
  margin: 0;
}

@media (max-width: 600px) {
  :root[data-ui="ui2"] .ui2-notice {
    align-items: flex-start;
    flex-direction: column;
  }
}
```

* [ ] **Verify:** `cd frontend && npx vitest run src/ui2/shell` — Expected: all pass, including `Ui2Toaster`.
* [ ] **Commit:** `git add frontend/src/ui2/shell/Ui2Toaster.tsx frontend/src/ui2/shell/Ui2Toaster.test.tsx frontend/src/ui2/shell/Ui2Shell.tsx frontend/src/ui2/primitives.css && git commit -m "✨ Add the UI_2.0 toast"`

### Task 6: The exchange-rate prompt

**Files:** `frontend/src/ui2/history/Ui2FxPrompt.tsx`, `Ui2FxPrompt.test.tsx` (create), `Ui2History.tsx`, `Ui2History.test.tsx`, `history.css` (modify)

The notice sits under the intro, as the handoff prepends it to the page.
The dialog reuses `Ui2Dialog`; while a fetch runs it cannot close and
both buttons are disabled. Not now is module state, so it survives
navigation and clears on reload (owner). A failed list read shows
nothing: the days stay flagged for the next visit. Dates read "16 Nov
2026" (`formatDayMonthName` + year).

```tsx
// The handoff's "Review exchange rates" notice and its "Fetch exchange
// rates again" dialog (PD-059 slice 12, DD-015 §2.7). Days whose EUR→INR
// rate is a fallback or missing are listed by GET /history/fx-missing; the
// user triggers the re-fetch. Healed dates drop off and the rest stay in
// the dialog (owner, 2026-11-19). Not now hides the notice until the app
// reloads. History is always the caller's own portfolio, so act-as never
// reaches this.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api/client'
import { formatDayMonthName } from '../../lib/formDates'
import { toast } from '../../lib/toast'
import { Ui2Dialog } from '../shell/Ui2Dialog'

// Dates listed in the dialog; the rest are counted (owner, 2026-11-19).
export const FX_LISTED_DATES = 10

// Not now lasts until the app reloads: module state, not storage.
let dismissed = false

// Test-only: forget Not now between cases.
export function __resetFxPromptForTests() {
  dismissed = false
}

function datesPhrase(count: number) {
  return count === 1 ? '1 date has' : `${count} dates have`
}

function longDate(iso: string) {
  return `${formatDayMonthName(iso)} ${iso.slice(0, 4)}`
}

export function Ui2FxPrompt() {
  const [dates, setDates] = useState<string[]>([])
  const [hidden, setHidden] = useState(dismissed)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (dismissed) return
    let active = true
    // A failed read shows no notice: the days stay flagged for next time.
    api.getFxMissing().then(result => { if (active) setDates(result.dates) }).catch(() => {})
    return () => { active = false }
  }, [])

  if (hidden || dates.length === 0) return null

  const notNow = () => {
    dismissed = true
    setOpen(false)
    setHidden(true)
  }
  const fetchAgain = async () => {
    setBusy(true)
    setFeedback('')
    try {
      const result = await api.refetchFx(dates)
      if (result.dates.length === 0) {
        setOpen(false)
        setDates([])
        toast('Exchange rates restored', 'success')
        return
      }
      setDates(result.dates)
      const count = result.dates.length
      setFeedback(`${count === 1 ? '1 date is' : `${count} dates are`} still missing; retry or choose Not now.`)
    } catch {
      setFeedback('The fetch failed. The dates remain flagged; retry or choose Not now.')
    } finally {
      setBusy(false)
    }
  }
  const listed = dates.slice(0, FX_LISTED_DATES)
  const more = dates.length - listed.length

  return (
    <>
      <div className="ui2-notice">
        <div>
          <strong>Review exchange rates</strong>
          <span>{datesPhrase(dates.length)} missing or carried FX rates.</span>
        </div>
        <button type="button" className="ui2-btn" onClick={() => { setFeedback(''); setOpen(true) }}>Fetch rates again</button>
      </div>
      {open && (
        <Ui2Dialog title="Fetch exchange rates again" onClose={() => setOpen(false)} busy={busy}>
          <div className="u2h-fx">
            <p>{dates.length === 1 ? 'One day uses' : `${dates.length} days use`} a carried or missing rate. Yahoo is queried only for your own flagged dates.</p>
            <ul>
              {listed.map(date => <li key={date}>{longDate(date)}</li>)}
              {more > 0 && <li>and {more} more</li>}
            </ul>
            <p className="ui2-note">A failed fetch keeps the dates flagged for the next visit.</p>
            <p role="status">{feedback}</p>
          </div>
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn" onClick={notNow} disabled={busy} autoFocus>Not now</button>
            <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => void fetchAgain()} disabled={busy}>
              {busy ? 'Fetching…' : 'Fetch rates again'}
            </button>
          </div>
        </Ui2Dialog>
      )}
    </>
  )
}
```

Tests: nothing flagged renders nothing; all healed closes with the toast
and removes the notice; a partial result keeps the dialog with the rest
and the message; a failed fetch keeps every date; 12 dates list 10 and
"and 2 more"; Not now survives a remount without a new request.

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { __resetToastsForTests, currentToasts } from '../../lib/toast'

const mockApi = vi.hoisted(() => ({
  getFxMissing: vi.fn(),
  refetchFx: vi.fn(),
}))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import { Ui2FxPrompt, __resetFxPromptForTests } from './Ui2FxPrompt'

const openDialog = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Fetch rates again' }))
  return screen.getByRole('dialog', { name: 'Fetch exchange rates again' })
}

describe('UI_2.0 exchange-rate prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetFxPromptForTests()
    __resetToastsForTests()
  })

  it('shows nothing when no day is flagged', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: [] })
    const { container } = render(<Ui2FxPrompt />)
    await waitFor(() => expect(mockApi.getFxMissing).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the flagged dates and restores them all', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: ['2026-11-17', '2026-11-16'] })
    mockApi.refetchFx.mockResolvedValue({ dates: [] })
    render(<Ui2FxPrompt />)
    expect(await screen.findByText('Review exchange rates')).toBeInTheDocument()
    expect(screen.getByText('2 dates have missing or carried FX rates.')).toBeInTheDocument()
    const dialog = await openDialog()
    expect(within(dialog).getAllByRole('listitem').map(item => item.textContent)).toEqual(['17 Nov 2026', '16 Nov 2026'])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fetch rates again' }))
    await waitFor(() => expect(screen.queryByText('Review exchange rates')).not.toBeInTheDocument())
    expect(mockApi.refetchFx).toHaveBeenCalledWith(['2026-11-17', '2026-11-16'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(currentToasts().map(queued => queued.message)).toEqual(['Exchange rates restored'])
  })

  it('keeps the dialog open with the dates still missing', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: ['2026-11-17', '2026-11-16'] })
    mockApi.refetchFx.mockResolvedValue({ dates: ['2026-11-16'] })
    render(<Ui2FxPrompt />)
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fetch rates again' }))
    expect(await within(dialog).findByText('1 date is still missing; retry or choose Not now.')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('listitem').map(item => item.textContent)).toEqual(['16 Nov 2026'])
    expect(screen.getByText('1 date has missing or carried FX rates.')).toBeInTheDocument()
  })

  it('keeps every date when the fetch fails', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: ['2026-11-16'] })
    mockApi.refetchFx.mockRejectedValue(new Error('500'))
    render(<Ui2FxPrompt />)
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fetch rates again' }))
    expect(await within(dialog).findByText('The fetch failed. The dates remain flagged; retry or choose Not now.')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
  })

  it('lists the first ten dates and counts the rest', async () => {
    const dates = Array.from({ length: 12 }, (_, i) => `2026-10-${String(30 - i).padStart(2, '0')}`)
    mockApi.getFxMissing.mockResolvedValue({ dates })
    render(<Ui2FxPrompt />)
    const items = within(await openDialog()).getAllByRole('listitem')
    expect(items).toHaveLength(11)
    expect(items[10]).toHaveTextContent('and 2 more')
  })

  it('Not now hides the notice until the app reloads', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: ['2026-11-16'] })
    const { unmount } = render(<Ui2FxPrompt />)
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText('Review exchange rates')).not.toBeInTheDocument()
    unmount()
    // Coming back to History in the same app session: no notice, no request.
    mockApi.getFxMissing.mockClear()
    render(<Ui2FxPrompt />)
    expect(screen.queryByText('Review exchange rates')).not.toBeInTheDocument()
    expect(mockApi.getFxMissing).not.toHaveBeenCalled()
  })
})
```

`Ui2History.tsx`:

Current:

```tsx
import { longMonthLabel, monthOptions, visibleAssets, type AssetFilter, type HistoryAsset } from './historyCells'
import { Ui2AssetCharts } from './Ui2AssetCharts'
import { Ui2DailyRecords } from './Ui2DailyRecords'
import { Ui2MonthReview } from './Ui2MonthReview'
import './history.css'
```

Replace with:

```tsx
import { longMonthLabel, monthOptions, visibleAssets, type AssetFilter, type HistoryAsset } from './historyCells'
import { Ui2AssetCharts } from './Ui2AssetCharts'
import { Ui2DailyRecords } from './Ui2DailyRecords'
import { Ui2FxPrompt } from './Ui2FxPrompt'
import { Ui2MonthReview } from './Ui2MonthReview'
import './history.css'
```

Current:

```tsx
      <Ui2PageIntro title="Your portfolio through time"
        subtitle="Daily snapshots, monthly perspective, and the details behind every day." />

      <div className="u2h-toolbar">
        <div className="u2h-month-nav">
          <button type="button" className="ui2-btn" aria-label="Previous month" disabled={atMin}
```

Replace with:

```tsx
      <Ui2PageIntro title="Your portfolio through time"
        subtitle="Daily snapshots, monthly perspective, and the details behind every day." />

      <Ui2FxPrompt />

      <div className="u2h-toolbar">
        <div className="u2h-month-nav">
          <button type="button" className="ui2-btn" aria-label="Previous month" disabled={atMin}
```

`history.css` — the handoff dialog's default paragraph and list spacing:

Current:

```css

  :root[data-ui="ui2"] .u2h-intro { align-items: flex-start; }
}
```

Replace with:

```css

  :root[data-ui="ui2"] .u2h-intro { align-items: flex-start; }
}

/* ---------- exchange-rate prompt (slice 12): the handoff's default p / ul spacing ---------- */

:root[data-ui="ui2"] .u2h-fx p,
:root[data-ui="ui2"] .u2h-fx ul {
  margin: 0 0 14px;
  line-height: 1.7;
}

:root[data-ui="ui2"] .u2h-fx ul { padding-left: 22px; }

:root[data-ui="ui2"] .u2h-fx p[role="status"]:empty { display: none; }
```

`Ui2History.test.tsx` — the page now calls `getFxMissing` on mount:

Current:

```tsx
  pasteHistory: vi.fn(),
  getPrices: vi.fn(),
  getGoldMetrics: vi.fn(),
}))

vi.mock('../../lib/api/client', async () => {
```

Replace with:

```tsx
  pasteHistory: vi.fn(),
  getPrices: vi.fn(),
  getGoldMetrics: vi.fn(),
  getFxMissing: vi.fn(),
  refetchFx: vi.fn(),
}))

vi.mock('../../lib/api/client', async () => {
```

Current:

```tsx
    mockAuth.user = { id: 'u1', role: 'user', ui_mode: 'ui2', premium: false, gold_enabled: false }
    mockApi.listHistory.mockResolvedValue(list(novemberRows))
    mockApi.getPrices.mockResolvedValue({ holdings: [], eur_rate: 0.011 })
    try { window.localStorage.removeItem('pd_history_charts_top') } catch { /* private mode */ }
  })
```

Replace with:

```tsx
    mockAuth.user = { id: 'u1', role: 'user', ui_mode: 'ui2', premium: false, gold_enabled: false }
    mockApi.listHistory.mockResolvedValue(list(novemberRows))
    mockApi.getPrices.mockResolvedValue({ holdings: [], eur_rate: 0.011 })
    mockApi.getFxMissing.mockResolvedValue({ dates: [] })
    try { window.localStorage.removeItem('pd_history_charts_top') } catch { /* private mode */ }
  })
```

* [ ] **Verify:** `cd frontend && npx tsc -b && npx vitest run && npm run lint:changed`
  Expected: no type errors; `806 passed` at time of writing; lint clean.
* [ ] **Commit:** `git add frontend/src/ui2/history && git commit -m "✨ Prompt to re-fetch exchange rates on History"`

### Task 7: Board and registry

**Files:** `docs/plans/PD-059-ui-2-status.md` (modify)

* [ ] Row 11 (in the slice 11 PR) and row 12 (in the slice 12 PR): owner Claude, branch, PR number, `in review` (→ `merged` on merge).
* [ ] Registry (slice 12 PR): `Ui2Toaster` (`ui2/shell/Ui2Toaster.tsx`; renders `lib/toast`; mounted by `Ui2Shell`), `.ui2-toast` / `.ui2-notice` / `.ui2-note` in `primitives.css`.
* [ ] **Verify:** `npx markdownlint-cli2 docs/plans/PD-059-ui-2-status.md` — Expected: `0 error(s)` for the edited rows.
* [ ] **Commit:** `git add docs/plans/PD-059-ui-2-status.md && git commit -m "📝 Record slice 11 on the status board"` (slice 12: "📝 Record slice 12 on the status board")

### Task 8: End-to-end verification

**Files:** none (throwaway stack)

Throwaway backend (`PORT=8091 MONGODB_DATABASE=portfolio_s11check`) and
Vite on :3091 proxied to it; never the owner's :8080/:3000. A `ui2` user
with November INR + EUR snapshot rows; three overall days flagged
(one with a carried rate, two without) and one flagged day in 1999,
before Yahoo's EUR→INR series.

* [ ] History shows "Review exchange rates · 4 dates have missing or carried FX rates." under the intro.
* [ ] The dialog lists the four dates newest first; Fetch rates again heals the three 2026 days (real Yahoo closes, `fx_carried: false`, `fx_date` = the day, totals recomputed) and keeps 04 Jan 1999 with "1 date is still missing; retry or choose Not now."
* [ ] With only healable days flagged, the dialog closes, the notice goes and the toast reads "Exchange rates restored".
* [ ] Not now hides the notice across navigation; a reload shows it again.
* [ ] `POST /history/fx-refetch {"dates":[]}` is `400`.
* [ ] Light and Dark at 1280 px, Light at 390 px: no horizontal page scroll, no console errors; the dialog covers the sidebar.
* [ ] A Glass account's History shows no notice.
* [ ] Drop the throwaway database and stop both servers.

The draft behind this plan passed these checks on 2026-11-19 (Cyber was
not checked: the test user is not premium).

## 5. Done

* [ ] Flagged days are listed and healed through two own-portfolio endpoints, without overwriting a good rate.
* [ ] UI_2.0 History shows the handoff's notice and dialog with the owner's partial, Not now and long-list rules.
* [ ] `Ui2Toaster` and the notice classes registered for reuse.

**Next:** slice 9b (migration step, after the owner's prod dry run);
wave 2 Overview (Codex, #347) mounts `OverallPerformance`, whose FX
carried / missing states these slices heal.
