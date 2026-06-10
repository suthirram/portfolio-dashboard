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
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // Non-JSON body (e.g. an HTML error page from an upstream proxy);
      // fall through and surface the raw text via the HTTP status below.
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string')
        ? (data as { error: string }).error
        : text || `HTTP ${res.status}`
    throw new Error(msg)
  }

  return data as T
}

interface DeleteResponse {
  message?: string
}

export const api = {
  // Holdings CRUD
  listHoldings:   ()                               => request<Holding[]>('GET', '/holdings'),
  getHolding:     (id: string)                     => request<Holding>('GET', `/holdings/${id}`),
  createHolding:  (body: HoldingInput)             => request<Holding>('POST', '/holdings', body),
  updateHolding:  (id: string, body: HoldingInput) => request<Holding>('PUT', `/holdings/${id}`, body),
  deleteHolding:  (id: string)                     => request<DeleteResponse>('DELETE', `/holdings/${id}`),

  // Market data
  getPrices:      ()                               => request<PricesResponse>('GET', '/prices'),
  getSummary:     ()                               => request<Summary>('GET', '/summary'),
  getMarketPrice: (symbol: string)                 => request<MarketPrice>('GET', `/market/price?symbol=${encodeURIComponent(symbol)}`),
  getForexRate:   (from = 'INR', to = 'EUR')       => request<ForexRate>('GET', `/market/forex?from=${from}&to=${to}`),
}
