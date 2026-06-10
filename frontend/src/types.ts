// API types mirroring backend/api/openapi.yaml.
//
// Fields are marked optional where the OpenAPI spec leaves them so —
// the wire contract is the source of truth, even if the current backend
// happens to always populate a given field.

export type Exchange = 'NSE' | 'BSE' | 'NYSE' | 'NASDAQ' | 'OTHER'
export type HoldingType = 'stock' | 'etf'
export type Currency = 'INR' | 'EUR'

export interface Holding {
  id?: string
  script?: string
  symbol?: string
  exchange?: Exchange
  type?: HoldingType
  stocks_owned?: number
  avg_cost_price?: number
  realized_pnl?: number
  currency?: Currency
  notes?: string
  created_at?: string
  updated_at?: string
}

// HoldingInput is the only schema that declares required fields in the
// spec; mirror that here so the form payload stays type-checked.
export interface HoldingInput {
  script: string
  exchange: Exchange
  type: HoldingType
  symbol?: string
  stocks_owned?: number
  avg_cost_price?: number
  realized_pnl?: number
  currency?: Currency
  notes?: string
}

export interface HoldingWithPrice extends Holding {
  current_price?: number
  cost_price?: number
  current_value?: number
  unrealized_pnl?: number
  cost_price_eur?: number
  current_value_eur?: number
  unrealized_pnl_eur?: number
  realized_pnl_eur?: number
  price_error?: string
}

export interface PricesResponse {
  holdings?: HoldingWithPrice[]
  eur_rate?: number
}

export interface Summary {
  total_cost?: number
  total_current_value?: number
  total_unrealized?: number
  total_realized?: number
  total_cost_eur?: number
  total_current_value_eur?: number
  total_unrealized_eur?: number
  total_realized_eur?: number
  eur_rate?: number
}

export interface MarketPrice {
  symbol?: string
  price?: number
  currency?: string
}

export interface ForexRate {
  from?: string
  to?: string
  rate?: number
}
