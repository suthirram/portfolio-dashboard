import type { User } from '../../lib/api/client'

/** What a guard wants to do this render. */
export type GuardDecision =
  | { kind: 'loading' }
  | { kind: 'render' }
  | { kind: 'redirect'; to: string; withFrom?: boolean }

interface AuthState {
  user: User | null
  loading: boolean
}

interface RequireAuthInput extends AuthState {
  /** Current route pathname — used to suppress redirect from /onboarding to itself. */
  pathname: string
}

/** Logged-in users only; forces onboarding when must_change_password is set. */
export function requireAuthDecision({ user, loading, pathname }: RequireAuthInput): GuardDecision {
  if (loading) return { kind: 'loading' }
  if (!user) return { kind: 'redirect', to: '/login', withFrom: true }
  if (user.must_change_password && pathname !== '/onboarding') {
    return { kind: 'redirect', to: '/onboarding' }
  }
  return { kind: 'render' }
}

/** Admin or super admin only; everyone else lands on the personal dashboard. */
export function requireAdminDecision({ user, loading }: AuthState): GuardDecision {
  if (loading) return { kind: 'loading' }
  if (!user) return { kind: 'redirect', to: '/login' }
  if (user.role !== 'admin' && user.role !== 'superadmin') {
    return { kind: 'redirect', to: '/' }
  }
  return { kind: 'render' }
}

/** Super admin only; regional admins drop back to the dashboard. */
export function requireSuperAdminDecision({ user, loading }: AuthState): GuardDecision {
  if (loading) return { kind: 'loading' }
  if (!user) return { kind: 'redirect', to: '/login' }
  if (user.role !== 'superadmin') return { kind: 'redirect', to: '/' }
  return { kind: 'render' }
}

/** Gold-enabled users only (PRD-003 §2.4); everyone else silently lands on the dashboard. */
export function requireGoldDecision({ user, loading }: AuthState): GuardDecision {
  if (loading) return { kind: 'loading' }
  if (!user) return { kind: 'redirect', to: '/login' }
  if (user.must_change_password) return { kind: 'redirect', to: '/onboarding' }
  if (!user.gold_enabled) return { kind: 'redirect', to: '/' }
  return { kind: 'render' }
}

/** Keep already-logged-in users out of /login, /signup, /forgot. */
export function redirectIfAuthedDecision({ user, loading }: AuthState): GuardDecision {
  if (loading) return { kind: 'loading' }
  if (!user) return { kind: 'render' }
  if (user.must_change_password) return { kind: 'redirect', to: '/onboarding' }
  return { kind: 'redirect', to: '/' }
}
