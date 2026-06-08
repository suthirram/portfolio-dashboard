const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  // Holdings CRUD
  listHoldings:   ()         => request('GET',    '/holdings'),
  getHolding:     (id)       => request('GET',    `/holdings/${id}`),
  createHolding:  (body)     => request('POST',   '/holdings', body),
  updateHolding:  (id, body) => request('PUT',    `/holdings/${id}`, body),
  deleteHolding:  (id)       => request('DELETE', `/holdings/${id}`),

  // Market data
  getPrices:      ()         => request('GET', '/prices'),
  getSummary:     ()         => request('GET', '/summary'),
  getMarketPrice: (symbol)   => request('GET', `/market/price?symbol=${encodeURIComponent(symbol)}`),
  getForexRate:   (from = 'INR', to = 'EUR') =>
                               request('GET', `/market/forex?from=${from}&to=${to}`),
}
