import type { ReactNode } from 'react'
import { ChartLineIcon, CoinsIcon, HomeIcon, ListIcon, ShieldIcon } from '../Icon'

// The signed-in pages every app shell links to: the glass shell (PD-054) and
// the UI_2.0 shell (PD-059) share this list, so a new page appears in both.

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
  keywords?: string
}

export function navItems(goldEnabled: boolean, isAdmin: boolean): NavItem[] {
  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: <HomeIcon size={16} />, end: true, keywords: 'home holdings portfolio' },
    { to: '/history', label: 'History', icon: <ChartLineIcon size={16} />, keywords: 'snapshots charts month' },
    { to: '/transactions', label: 'Transactions', icon: <ListIcon size={16} />, keywords: 'ledger trades buys sells import' },
    { to: '/dividends', label: 'Dividends', icon: <CoinsIcon size={16} />, keywords: 'income payouts' },
  ]
  if (goldEnabled) items.push({ to: '/gold', label: 'Gold', icon: <CoinsIcon size={16} />, keywords: 'physical jeweler' })
  if (isAdmin) items.push({ to: '/admin', label: 'Admin', icon: <ShieldIcon size={16} />, keywords: 'users panel switches' })
  return items
}
