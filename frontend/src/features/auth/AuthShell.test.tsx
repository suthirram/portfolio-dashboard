import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthShell, FormError, FormField, LinkText, PrimaryButton } from './AuthShell'

const show = () => render(
  <MemoryRouter>
    <AuthShell title="Create your account" subtitle="Takes a minute." footer={<>Have one? <LinkText to="/login">Log in</LinkText></>}>
      <FormError error="That username is taken." />
      <FormField label="Username" hint="3–32 characters"><input /></FormField>
      <FormField label="Region" error="Pick a region"><select><option>India</option></select></FormField>
      <PrimaryButton>Create account</PrimaryButton>
    </AuthShell>
  </MemoryRouter>)

describe('AuthShell', () => {
  it('renders the login’s sunrise card with the title as the page heading', () => {
    show()
    const heading = screen.getByRole('heading', { level: 1, name: 'Create your account' })
    expect(heading.closest('section')).toHaveClass('sunrise-login-card')
    expect(heading.closest('main')).toHaveClass('sunrise-login', 'sunrise-auth')
    expect(screen.getByText('Takes a minute.')).toHaveClass('sunrise-login-subtitle')
  })

  it('names every control by its label', () => {
    show()
    expect(screen.getByLabelText('Username').tagName).toBe('INPUT')
    expect(screen.getByLabelText('Region').tagName).toBe('SELECT')
  })

  it('announces form errors and shows hints and field errors', () => {
    show()
    expect(screen.getByRole('alert')).toHaveTextContent('That username is taken.')
    expect(screen.getByText('3–32 characters')).toHaveClass('sunrise-auth-hint')
    expect(screen.getByText('Pick a region')).toHaveClass('sunrise-auth-field-error')
  })

  it('uses the sunrise submit button and footer link', () => {
    show()
    expect(screen.getByRole('button', { name: 'Create account' })).toHaveClass('sunrise-login-submit')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})
