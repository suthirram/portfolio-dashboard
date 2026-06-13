import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import {
  type GuardDecision,
  redirectIfAuthedDecision,
  requireAdminDecision,
  requireAuthDecision,
  requireSuperAdminDecision,
} from './guardRules'

function Center({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      {children}
    </div>
  )
}

function render(decision: GuardDecision, children: ReactNode, fromPath?: string): ReactNode {
  switch (decision.kind) {
    case 'loading':
      return <Center><span className="spinner" /></Center>
    case 'redirect':
      return (
        <Navigate
          to={decision.to}
          replace
          state={decision.withFrom && fromPath ? { from: fromPath } : undefined}
        />
      )
    case 'render':
      return <>{children}</>
  }
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  return render(
    requireAuthDecision({ user, loading, pathname: location.pathname }),
    children,
    location.pathname,
  )
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  return render(requireAdminDecision({ user, loading }), children)
}

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  return render(requireSuperAdminDecision({ user, loading }), children)
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  return render(redirectIfAuthedDecision({ user, loading }), children)
}
