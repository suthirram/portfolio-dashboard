import { matchPath } from 'react-router-dom'

// Act-as in UI_2.0 (PD-059 slice 22): while an admin views another account,
// the portfolio pages that support act-as keep pointing at that account, and
// the ones that do not (History, Gold: owner decision, gold stays out) say so
// instead of silently switching to the admin's own data.

const ACT_AS_ROUTES: Record<string, (userId: string) => string> = {
  '/': userId => `/admin/users/${userId}`,
  '/transactions': userId => `/admin/users/${userId}/transactions`,
  '/dividends': userId => `/admin/users/${userId}/dividends`,
}

const OUTSIDE_ACT_AS = new Set(['/history', '/gold'])

// actAsUserIdOf is the viewed account's id when pathname is an act-as route.
export function actAsUserIdOf(pathname: string): string | null {
  return matchPath('/admin/users/:userId/*', pathname)?.params.userId ?? null
}

// actAsLink is where a nav item leads during act-as: the target's page, null
// when the page is outside act-as, or the item's own route (Administration,
// Branding) which leaves act-as.
export function actAsLink(to: string, userId: string): string | null {
  if (OUTSIDE_ACT_AS.has(to)) return null
  return ACT_AS_ROUTES[to]?.(userId) ?? to
}
