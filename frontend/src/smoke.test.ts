import { describe, expect, it } from 'vitest'

describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })

  it('has a jsdom document', () => {
    const div = document.createElement('div')
    div.textContent = 'hello'
    expect(div.textContent).toBe('hello')
  })
})
