import { describe, expect, it } from 'vitest'
import {
  redirectIfAuthedDecision,
  requireAdminDecision,
  requireAuthDecision,
  requireSuperAdminDecision,
} from './guardRules'
import type { User } from '../../lib/api/client'

const baseUser = (over: Partial<User> = {}): User => ({
  id: 'u1',
  username: 'alice',
  name: 'Alice',
  role: 'user',
  region: 'india',
  must_change_password: false,
  disabled: false,
  locked: false,
  ...(over as object),
})

describe('requireAuthDecision', () => {
  it('returns loading while auth resolves', () => {
    expect(requireAuthDecision({ user: null, loading: true, pathname: '/' })).toEqual({ kind: 'loading' })
  })

  it('redirects anonymous to /login with from-state', () => {
    expect(requireAuthDecision({ user: null, loading: false, pathname: '/holdings' })).toEqual({
      kind: 'redirect', to: '/login', withFrom: true,
    })
  })

  it('forces onboarding when must_change_password is set', () => {
    expect(requireAuthDecision({
      user: baseUser({ must_change_password: true }), loading: false, pathname: '/',
    })).toEqual({ kind: 'redirect', to: '/onboarding' })
  })

  it('does not redirect from /onboarding to itself', () => {
    expect(requireAuthDecision({
      user: baseUser({ must_change_password: true }), loading: false, pathname: '/onboarding',
    })).toEqual({ kind: 'render' })
  })

  it('renders children when logged in and onboarded', () => {
    expect(requireAuthDecision({ user: baseUser(), loading: false, pathname: '/' })).toEqual({ kind: 'render' })
  })
})

describe('requireAdminDecision', () => {
  it('returns loading while auth resolves', () => {
    expect(requireAdminDecision({ user: null, loading: true })).toEqual({ kind: 'loading' })
  })

  it('sends anonymous to /login', () => {
    expect(requireAdminDecision({ user: null, loading: false })).toEqual({ kind: 'redirect', to: '/login' })
  })

  it('sends a plain user back to the dashboard', () => {
    expect(requireAdminDecision({ user: baseUser({ role: 'user' }), loading: false })).toEqual({
      kind: 'redirect', to: '/',
    })
  })

  it('renders for admin', () => {
    expect(requireAdminDecision({ user: baseUser({ role: 'admin' }), loading: false })).toEqual({ kind: 'render' })
  })

  it('renders for superadmin', () => {
    expect(requireAdminDecision({ user: baseUser({ role: 'superadmin' }), loading: false })).toEqual({ kind: 'render' })
  })
})

describe('requireSuperAdminDecision', () => {
  it('sends a regional admin back to /', () => {
    expect(requireSuperAdminDecision({ user: baseUser({ role: 'admin' }), loading: false })).toEqual({
      kind: 'redirect', to: '/',
    })
  })

  it('renders only for superadmin', () => {
    expect(requireSuperAdminDecision({ user: baseUser({ role: 'superadmin' }), loading: false })).toEqual({ kind: 'render' })
  })
})

describe('redirectIfAuthedDecision', () => {
  it('renders the public screen when no user', () => {
    expect(redirectIfAuthedDecision({ user: null, loading: false })).toEqual({ kind: 'render' })
  })

  it('routes a forced-onboarding user straight to /onboarding', () => {
    expect(redirectIfAuthedDecision({
      user: baseUser({ must_change_password: true }), loading: false,
    })).toEqual({ kind: 'redirect', to: '/onboarding' })
  })

  it('sends a normal logged-in user to /', () => {
    expect(redirectIfAuthedDecision({ user: baseUser(), loading: false })).toEqual({ kind: 'redirect', to: '/' })
  })
})
