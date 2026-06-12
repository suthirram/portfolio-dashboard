export interface DashboardRouteUser {
  id?: string | null
}

export interface AccountNavigationUser {
  role?: string | null
}

export type AccountNavigationKey = 'dashboard' | 'users' | 'profile' | 'logout'
export type AccountNavigationIcon = 'home' | 'users' | 'profile' | 'logout'

export interface AccountNavigationItem {
  key: AccountNavigationKey
  label: string
  icon: AccountNavigationIcon
}

export function resolveDashboardActingUser<T extends DashboardRouteUser>(
  currentUser: DashboardRouteUser | null | undefined,
  targetUser: T | null | undefined,
): T | null {
  if (!targetUser?.id) return null
  if (currentUser?.id === targetUser.id) return null
  return targetUser || null
}

export function shouldShowActingBanner(
  currentUser: DashboardRouteUser | null | undefined,
  actingUser: DashboardRouteUser | null | undefined,
): boolean {
  return Boolean(resolveDashboardActingUser(currentUser, actingUser))
}

export function getAccountNavigationItems(user: AccountNavigationUser): AccountNavigationItem[] {
  const items: AccountNavigationItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: 'home' },
  ]
  if (user.role === 'admin' || user.role === 'superadmin') {
    items.push({ key: 'users', label: 'Users', icon: 'users' })
  }
  items.push(
    { key: 'profile', label: 'Profile', icon: 'profile' },
    { key: 'logout', label: 'Logout', icon: 'logout' },
  )
  return items
}
