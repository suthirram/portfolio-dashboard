-- Physical gold tracking (PRD-003 / DD-003). Only user-entered fields are
-- stored; every derived column (gold cost, GST, nett per gram, ...) is
-- computed in the service layer at read time.

CREATE TABLE gold_transactions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       TEXT          NOT NULL, -- Mongo user ObjectID hex
    txn_date      DATE          NOT NULL,
    gm_price      NUMERIC(14,2) NOT NULL CHECK (gm_price > 0),
    weight_grams  NUMERIC(12,3) NOT NULL CHECK (weight_grams > 0),
    quote_price   NUMERIC(14,2),
    bill_amount   NUMERIC(14,2),
    actual_paid   NUMERIC(14,2) NOT NULL CHECK (actual_paid >= 0),
    billed_weight NUMERIC(12,3),
    chennai_rate  NUMERIC(14,2),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX gold_txn_user_date ON gold_transactions (user_id, txn_date);

CREATE TABLE gold_daily_prices (
    user_id        TEXT          NOT NULL,
    price_date     DATE          NOT NULL,
    price_per_gram NUMERIC(14,2) NOT NULL CHECK (price_per_gram > 0),
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, price_date)
);
