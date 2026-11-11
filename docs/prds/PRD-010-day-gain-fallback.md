# PRD-010: History-first day gain fallback

* **Status**: Accepted (owner request, 2026-11-09)
* **Owner**: project owner
* **Design**: [DD-010](../designs/DD-010-day-gain-fallback.md)
* **Rollout**: [PD-053](../plans/PD-053-day-gain-fallback.md)

## 1. Problem

Day Gain uses average purchase cost when a historical close is missing,
displaying lifetime gains as daily movement. Admin views skip history lookup.

## 2. Goals

Use each holding's historical close first, Yahoo previous close second, and
show an unavailable indicator when neither exists. Preserve history priority
because Yahoo prices can drift while markets are closed.

## 3. Non-goals

Changing snapshot valuation, backfilling history, adding admin history access,
or guaranteeing stable live current prices during closed-market hours.

## 4. Who uses this

Portfolio owners and authorized admins viewing another user's dashboard.

## 5. Dashboard

Rows and currency totals use the same selected baseline. Missing baselines
must not silently become purchase cost or a partial daily total. Existing
history matching and historical date selection remain unchanged.

## 6. Open questions

RESOLVED (owner, 2026-11-09): history remains preferred; Yahoo is only the
fallback. Both normal and admin prices expose the fallback data.

## 7. Success criteria

History overrides Yahoo when both exist; missing history uses Yahoo; missing
both displays unavailable. Snapshot carry-forward behavior remains unchanged.
