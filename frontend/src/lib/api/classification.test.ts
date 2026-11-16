import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('classification API', () => {
  it('encodes the public-symbol preview and retains unavailable responses', async () => {
    const profile = { symbol: '^NSEI', lookup_status: 'unavailable' }
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(profile)))
    vi.stubGlobal('fetch', fetcher)
    expect(await api.getMarketProfile('^NSEI')).toEqual(profile)
    expect(fetcher).toHaveBeenCalledWith('/api/market/profile?symbol=%5ENSEI', expect.objectContaining({
      method: 'GET', credentials: 'include',
    }))
  })

  it.each([
    [undefined, '/api/holdings/holding-1/classification'],
    ['owner-2', '/api/admin/users/owner-2/holdings/holding-1/classification'],
    [' ', '/api/holdings/holding-1/classification'],
  ])('confirms for the correct owner (%s), with CSRF', async (userId, path) => {
    const holding = { id: 'holding-1', classification: { status: 'resolved', source: 'user' } }
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(holding)))
    vi.stubGlobal('fetch', fetcher)
    const body = { type: 'stock' as const, sector: 'FMCG' }
    expect(await api.confirmClassification('holding-1', body, userId)).toEqual(holding)
    expect(fetcher).toHaveBeenCalledWith(path, expect.objectContaining({
      method: 'PUT', credentials: 'include', body: JSON.stringify(body),
      headers: expect.objectContaining({ 'X-Requested-With': 'portfolio-dashboard' }),
    }))
  })

  it('surfaces confirmation conflicts for the review form to retain input', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"reload and retry"}', { status: 409 })))
    await expect(api.confirmClassification('holding-1', { type: 'etf', sector: null })).rejects.toMatchObject({
      status: 409, message: 'reload and retry', constructor: ApiError,
    })
  })
})
