# PRD-012: Stock XIRR

* **Status**: Accepted (owner request, 2026-11-11)
* **Owner**: project owner
* **Design**: [DD-012](../designs/DD-012-stock-xirr.md)
* **Rollout**: [PD-055](../plans/PD-055-stock-xirr.md)
* **Visual spec**: [PD-055-stock-xirr.html](../visuals/PD-055-stock-xirr.html)

## 1. Problem

The dashboard's P/L % compares value with cost, so it cannot say how well
money did once *when* it went in matters: a purchase just before a rally and
one just after it read alike. The History card's investment performance is
time-weighted and monthly. Physical gold already shows an XIRR (PRD-003);
stocks do not.

## 2. Goals

Show the money-weighted annual return (XIRR) of the stock ledger:

* one rate per currency (INR, EUR), pooling every holding in it;
* one rate per holding, from that holding's own ledger;
* in admin act-as, the target user's rates.

## 3. Non-goals

Combining currencies (no FX-converted rate), a benchmark comparison, a
time-weighted return, XIRR on the History page, tax or fee adjustments
beyond what the ledger amounts already include.

## 4. Who uses this

Portfolio owners on their dashboard; admins viewing a user in act-as.

## 5. Behaviour

* Buys and opening balances are money out, sells and dividends money in;
  what is still held counts as money in today at the live price.
* A sold-out holding keeps its rate from the realised cash alone.
* A rate measured over less than a year is shown but starred, with a hover
  note that annualising a short window magnifies it.
* An opening balance without a user-set date is counted from when it was
  recorded, and the rate is starred with that note.
* No rate (no flows, or flows of one sign) shows "—". A failed rates request
  hides the figures without affecting prices or totals.

## 6. Open questions

PROPOSED (design default, for owner review in the docs PR): place the
currency rate in each currency group's summary strip and TOTAL row, and the
holding rate as a table column. The top Portfolio Overview cards stay as
they are, since they mix currencies and XIRR here is per currency.

## 7. Success criteria

₹1,000 worth ₹1,100 a year later reads 10%. The same price path gives a
higher rate when more money went in before a rise. Admin act-as shows the
target's rates and is region-scoped like every act-as read.
