import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthOptional } from '../../features/auth/AuthContext'
import { useUiRevamp } from '../../lib/uiMode'
import { useTheme, type ThemeName } from '../../lib/useTheme'
import ThemePicker from '../ThemePicker'
import {
  ChartLineIcon, CoinsIcon, HomeIcon, ListIcon, LogOutIcon, MenuIcon, PlusIcon, SearchIcon, ShieldIcon, UserIcon,
} from '../Icon'
import { CommandPalette, type Command } from './CommandPalette'
import { Toaster } from './Toaster'

// The glass UI's app shell (PD-054): a sticky glass sidebar with the page
// navigation, search (⌘K), theme and account, a bottom tab bar on narrow
// screens, the command palette and the toaster. Pages render inside it
// unchanged; their headers become page toolbars, and the copies of what the
// shell already offers (brand, page links, theme picker, user menu) carry
// .shell-dup so glass.css hides them here.

interface NavItem {
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

// The sidebar's collapsed state, kept per browser like the theme.
const SIDEBAR_KEY = 'pd_sidebar'

function readCollapsed(): boolean {
  try { return window.localStorage?.getItem(SIDEBAR_KEY) === 'collapsed' } catch { return false }
}

// ShellLayout wraps the signed-in routes: the shell for glass accounts, the
// page alone (the current UI) for everyone else.
export function ShellLayout() {
  const revamp = useUiRevamp()
  if (!revamp) return <Outlet />
  return <AppShell><Outlet /></AppShell>
}

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuthOptional()
  const user = auth?.user ?? null
  const navigate = useNavigate()
  const { theme, set: setTheme } = useTheme({ premium: user ? user.premium : undefined })
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggleSidebar = () => {
    setCollapsed(wasCollapsed => {
      const next = !wasCollapsed
      try { window.localStorage?.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'open') } catch { /* private mode / jsdom */ }
      return next
    })
  }
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const goldEnabled = Boolean(user?.gold_enabled)
  const items = useMemo(() => navItems(goldEnabled, isAdmin), [goldEnabled, isAdmin])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(wasOpen => !wasOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const commands = useMemo<Command[]>(() => {
    const themes: { id: ThemeName; label: string }[] = [
      { id: 'dark', label: 'Dark' },
      { id: 'light', label: 'Light' },
      ...(user?.premium ? [{ id: 'cyberpunk' as ThemeName, label: 'Cyber' }] : []),
    ]
    return [
      ...items.map(item => ({
        id: `go-${item.to}`, group: 'Go to', label: item.label, keywords: item.keywords,
        run: () => navigate(item.to),
      })),
      { id: 'go-profile', group: 'Go to', label: 'Account settings', keywords: 'profile password security', run: () => navigate('/profile') },
      { id: 'add-holding', group: 'Action', label: 'Add holding', keywords: 'new stock buy', run: () => navigate('/', { state: { openAdd: true } }) },
      ...themes.map(option => ({
        id: `theme-${option.id}`, group: 'Theme', label: `${option.label} theme`, keywords: 'appearance colour color',
        run: () => setTheme(option.id),
      })),
      { id: 'log-out', group: 'Account', label: 'Log out', keywords: 'sign out exit', run: () => { void auth?.logout() } },
      {
        id: 'toggle-sidebar', group: 'Action', label: collapsed ? 'Expand sidebar' : 'Collapse sidebar',
        keywords: 'menu hamburger navigation pane', run: toggleSidebar,
      },
    ]
  }, [items, navigate, setTheme, user?.premium, auth, collapsed])

  // Collapsed, the sidebar is an icon rail: the labels are hidden, so every
  // control carries its name as aria-label (and a title tooltip).
  const userName = user?.name || user?.username || 'Account'
  return (
    <div className={collapsed ? 'shell shell-collapsed' : 'shell'}>
      <aside id="shell-sidebar" className="shell-sidebar" aria-label="Main navigation">
        <div className="shell-top">
          <button type="button" className="shell-menu" onClick={toggleSidebar}
            aria-controls="shell-sidebar" aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <MenuIcon size={18} />
          </button>
          <Link to="/" className="shell-brand" aria-label="Portfolio" title="Portfolio">
            <span className="brand-tile" style={{ width: 34, height: 34 }}><ChartLineIcon size={18} /></span>
            <span className="shell-label shell-brand-name">Portfolio</span>
          </Link>
        </div>
        <button type="button" className="shell-search" onClick={() => setPaletteOpen(true)} aria-label="Search" title="Search (⌘K)">
          <SearchIcon size={14} /> <span className="shell-label">Search</span> <kbd className="shell-label">⌘K</kbd>
        </button>
        <nav className="shell-nav">
          {items.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className="shell-nav-link" aria-label={item.label} title={item.label}>
              {item.icon} <span className="shell-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button type="button" className="btn-primary shell-cta" aria-label="Add holding" title="Add holding"
          onClick={() => navigate('/', { state: { openAdd: true } })}>
          <PlusIcon size={14} /> <span className="shell-label">Add holding</span>
        </button>
        <div className="shell-foot">
          <div className="shell-label shell-theme"><ThemePicker theme={theme} premium={user?.premium} onSelect={setTheme} /></div>
          <NavLink to="/profile" className="shell-nav-link shell-user" aria-label={userName} title={userName}>
            <UserIcon size={16} /> <span className="shell-label">{userName}</span>
          </NavLink>
          <button type="button" className="shell-nav-link shell-logout" aria-label="Log out" title="Log out"
            onClick={() => { void auth?.logout() }}>
            <LogOutIcon size={16} /> <span className="shell-label">Log out</span>
          </button>
        </div>
      </aside>

      <div className="shell-content">{children}</div>

      <nav className="shell-tabbar" aria-label="Quick navigation">
        {items.slice(0, 4).map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} className="shell-tab">
            {item.icon} <span>{item.label}</span>
          </NavLink>
        ))}
        <button type="button" className="shell-tab" onClick={() => setPaletteOpen(true)}>
          <SearchIcon size={16} /> <span>More</span>
        </button>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <Toaster />
    </div>
  )
}
