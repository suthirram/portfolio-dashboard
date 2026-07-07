-- chennai_rate is a free-text remark ("Ditto", a rate, a note), not a
-- number to validate (owner, 2026-07-07). Widen the column to TEXT;
-- existing numeric values cast cleanly to their text form.
ALTER TABLE gold_transactions
    ALTER COLUMN chennai_rate TYPE TEXT USING chennai_rate::TEXT;
