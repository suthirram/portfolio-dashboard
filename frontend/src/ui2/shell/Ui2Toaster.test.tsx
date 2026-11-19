import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetToastsForTests, toast } from '../../lib/toast'
import { Ui2Toaster } from './Ui2Toaster'

describe('Ui2Toaster', () => {
  beforeEach(() => __resetToastsForTests())

  it('shows the newest toast in a polite live region', () => {
    render(<Ui2Toaster />)
    act(() => { toast('First') })
    act(() => { toast('Exchange rates restored', 'success') })
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('Exchange rates restored')
    expect(region).not.toHaveTextContent('First')
  })
})
