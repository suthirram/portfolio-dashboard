import { describe, expect, it } from 'vitest'
import { actAsLink, actAsUserIdOf } from './actAsNav'

describe('actAsUserIdOf', () => {
  it('finds the viewed account on every act-as route', () => {
    expect(actAsUserIdOf('/admin/users/u9')).toBe('u9')
    expect(actAsUserIdOf('/admin/users/u9/transactions')).toBe('u9')
    expect(actAsUserIdOf('/admin/users/u9/dividends')).toBe('u9')
  })

  it('is null outside act-as', () => {
    expect(actAsUserIdOf('/admin')).toBeNull()
    expect(actAsUserIdOf('/transactions')).toBeNull()
  })
})

describe('actAsLink', () => {
  it('keeps Overview, Transactions and Dividends on the viewed account', () => {
    expect(actAsLink('/', 'u9')).toBe('/admin/users/u9')
    expect(actAsLink('/transactions', 'u9')).toBe('/admin/users/u9/transactions')
    expect(actAsLink('/dividends', 'u9')).toBe('/admin/users/u9/dividends')
  })

  it('marks History and Gold as outside act-as', () => {
    expect(actAsLink('/history', 'u9')).toBeNull()
    expect(actAsLink('/gold', 'u9')).toBeNull()
  })

  it('leaves Administration and Branding as they are', () => {
    expect(actAsLink('/admin', 'u9')).toBe('/admin')
    expect(actAsLink('/admin/branding', 'u9')).toBe('/admin/branding')
  })
})
