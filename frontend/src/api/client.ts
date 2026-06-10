import type {
  ForexRate,
  Holding,
  HoldingInput,
  MarketPrice,
  PricesResponse,
  Summary,
} from '../types'

const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data as T
}

export const api = {
  // Holdings CRUD
  listHoldings:   ()                               => request<Holding[]>('GET', '/holdings'),
  getHolding:     (id: string)                     => request<Holding>('GET', `/holdings/${id}`),
  createHolding:  (body: HoldingInput)             => request<Holding>('POST', '/holdings', body),
  updateHolding:  (id: string, body: HoldingInput) => request<Holding>('PUT', `/holdings/${id}`, body),
  deleteHolding:  (id: string)                     => request<void>('DELETE', `/holdings/${id}`),

  // Market data
  getPrices:      ()                               => request<PricesResponse>('GET', '/prices'),
  getSummary:     ()                               => request<Summary>('GET', '/summary'),
  getMarketPrice: (symbol: string)                 => request<MarketPrice>('GET', `/market/price?symbol=${encodeURIComponent(symbol)}`),
  getForexRate:   (from = 'INR', to = 'EUR')       => request<ForexRate>('GET', `/market/forex?from=${from}&to=${to}`),
}
