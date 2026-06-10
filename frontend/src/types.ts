// Public API types. Sourced from generated OpenAPI schema (schema.gen.ts) —
// regenerate via `npm run gen:api` whenever backend/api/openapi.yaml changes.

import type { components, operations } from './lib/api/schema.gen'

type Schemas = components['schemas']

export type Holding = Schemas['Holding']
export type HoldingInput = Schemas['HoldingInput']
export type HoldingWithPrice = Schemas['HoldingWithPrice']
export type PricesResponse = Schemas['PricesResponse']
export type Summary = Schemas['Summary']

export type Exchange = NonNullable<Holding['exchange']>
export type HoldingType = NonNullable<Holding['type']>
export type Currency = NonNullable<Holding['currency']>

// MarketPrice / ForexRate are declared inline in the spec; extract from
// the generated operations type rather than redefining by hand.
export type MarketPrice = operations['getMarketPrice']['responses'][200]['content']['application/json']
export type ForexRate = operations['getForexRate']['responses'][200]['content']['application/json']
