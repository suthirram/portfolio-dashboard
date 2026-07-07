-- The owner's real ledger includes return/correction rows with a negative
-- weight and a negative amount paid (e.g. a -1 g adjustment). These are
-- valid history; the > 0 / >= 0 CHECKs from 0001 rejected them. Relax to
-- non-zero weight and unconstrained paid. gm_price stays > 0 — a per-gram
-- rate is always positive, even on a return. (The app's manual-entry form
-- still requires positive purchases; returns are loaded as data.)
ALTER TABLE gold_transactions DROP CONSTRAINT IF EXISTS gold_transactions_weight_grams_check;
ALTER TABLE gold_transactions ADD  CONSTRAINT gold_transactions_weight_grams_check CHECK (weight_grams <> 0);
ALTER TABLE gold_transactions DROP CONSTRAINT IF EXISTS gold_transactions_actual_paid_check;
