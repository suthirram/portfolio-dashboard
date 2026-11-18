import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuthOptional } from '../../features/auth/AuthContext'
import { useTheme, type ThemeName } from '../../lib/useTheme'
import { navItems, type NavItem } from '../../components/shell/navItems'
import '../ui2.css'

// Ui2Shell is the UI_2.0 app frame (PD-059), built 1:1 from the owner's
// handoff mockup (docs/visuals/PD-059-ui-2-reference.html): a fixed sidebar
// with the brand, the WORKSPACE navigation, Appearance (Light / Dark /
// Cyber; Cyber stays premium-gated in useTheme) and the account card with
// its menu, plus a breadcrumb bar above the page. Below 760px the sidebar
// becomes a drawer behind the ☰ button. Pages render inside unchanged.

// The mockup's own icons and names for the shared routes.
const ICON_PATHS: Record<string, ReactNode> = {
  '/': <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  '/history': <path d="M3 12a9 9 0 1 0 3-7M3 3v6h6m3-3v6l4 2" />,
  '/transactions': <path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" />,
  '/dividends': <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 12h1m10 0h1" /></>,
  '/gold': <path d="m7 6-4 13h18L17 6H7zm-2 7h14M12 6v7" />,
  '/admin': <><path d="M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z" /><path d="m8 12 3 3 5-6" /></>,
  '/admin/branding': <path d="m4 19 6-14 6 14M6 14h8M18 9h3m-1.5 0v10" />,
}
const LABELS: Record<string, string> = { '/': 'Overview', '/admin': 'Administration' }

// The mockup gives the super admin a direct Branding link after
// Administration; it opens the existing /admin/branding page.
const BRANDING: NavItem = { to: '/admin/branding', label: 'Branding', icon: null }

const THEMES: { theme: ThemeName; label: string }[] = [
  { theme: 'light', label: '☀ Light' },
  { theme: 'dark', label: '☾ Dark' },
  { theme: 'cyberpunk', label: 'ϟ Cyber' },
]

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join('')

export function Ui2Shell({ children }: { children: ReactNode }) {
  const auth = useAuthOptional()
  const user = auth?.user ?? null
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { theme, set: setTheme } = useTheme({ premium: user ? user.premium : undefined })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const items = [...navItems(Boolean(user?.gold_enabled), isAdmin), ...(user?.role === 'superadmin' ? [BRANDING] : [])]
  const labelOf = (to: string, label: string) => LABELS[to] ?? label
  const matches = (item: NavItem) => (item.end ? pathname === item.to : pathname.startsWith(item.to))
  // The most specific link wins: /admin/branding is Branding, not Administration.
  const current = items.filter(matches).sort((first, second) => second.to.length - first.to.length)[0]
  const pageLabel = current ? labelOf(current.to, current.label) : pathname.startsWith('/profile') ? 'Profile & security' : ''
  const userName = user?.name || user?.username || 'Account'

  // The account menu closes on any click outside the account card.
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  // The open drawer covers the ☰ button, so it closes from its own ✕, the
  // backdrop or Escape, and focus goes back to ☰ (restoreFocusRef asks the
  // effect below to do it once ☰ is no longer inert).
  const restoreFocusRef = useRef(false)
  const closeDrawer = () => {
    restoreFocusRef.current = true
    setDrawerOpen(false)
  }
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      restoreFocusRef.current = true
      setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // Widening past the drawer breakpoint shows the sidebar in place, so an
  // open drawer is reset rather than leaving the page inert.
  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 761px)')
    if (!desktop) return
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setDrawerOpen(false) }
    desktop.addEventListener('change', onChange)
    return () => desktop.removeEventListener('change', onChange)
  }, [])

  // While the drawer is open the page behind it is inert and focus starts
  // on the drawer's ✕; a closed drawer is hidden from focus by ui2.css.
  // Focus returns to ☰ only after inert is lifted, or it would land on body.
  useEffect(() => {
    mainRef.current?.toggleAttribute('inert', drawerOpen)
    if (drawerOpen) {
      closeButtonRef.current?.focus()
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false
      menuButtonRef.current?.focus()
    }
  }, [drawerOpen])

  const go = (to: string) => { setMenuOpen(false); setDrawerOpen(false); navigate(to) }

  return (
    <div className="ui2-shell">
      <aside id="ui2-sidebar" className={drawerOpen ? 'ui2-sidebar open' : 'ui2-sidebar'} aria-label="Sidebar">
        <button ref={closeButtonRef} type="button" className="ui2-drawer-close" aria-label="Close navigation" onClick={closeDrawer}>✕</button>
        <Link to="/" className="ui2-brand" aria-label="Portfolio home">
          <span className="ui2-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19V5m0 14h16M8 15l4-5 3 2 5-7" /></svg>
          </span>
          Portfolio<span className="ui2-brand-dot">.</span>
        </Link>
        <div className="ui2-nav-label">WORKSPACE</div>
        <nav className="ui2-nav" aria-label="Main navigation">
          {items.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setDrawerOpen(false)}
              className={() => (current?.to === item.to ? 'active' : undefined)}
              aria-current={current?.to === item.to ? 'page' : 'false'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{ICON_PATHS[item.to]}</svg>
              {labelOf(item.to, item.label)}
            </NavLink>
          ))}
        </nav>
        <div className="ui2-sidebar-bottom">
          <div className="ui2-theme-title">Appearance</div>
          <div className="ui2-themes" role="group" aria-label="Choose theme">
            {THEMES.map(option => (
              <button key={option.theme} type="button" className={theme === option.theme ? 'selected' : undefined}
                aria-pressed={theme === option.theme} hidden={option.theme === 'cyberpunk' && !user?.premium}
                onClick={() => setTheme(option.theme)}>
                {option.label}
              </button>
            ))}
          </div>
          <div ref={accountRef} className="ui2-account" role="button" tabIndex={0} aria-haspopup="menu" aria-expanded={menuOpen}
            aria-label={`Open ${userName} account menu`}
            onClick={e => { if (!(e.target as HTMLElement).closest('.ui2-account-menu')) setMenuOpen(open => !open) }}
            onKeyDown={e => {
              if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setMenuOpen(open => !open) }
              if (e.key === 'Escape') setMenuOpen(false)
            }}>
            <span className="ui2-avatar" aria-hidden="true">{initialsOf(userName)}</span>
            <span><strong>{userName}</strong><small>{user?.role === 'user' ? 'Portfolio' : user?.role === 'admin' ? 'Admin' : 'Super admin'}</small></span>
            <span className="ui2-account-caret" aria-hidden="true">⌄</span>
            {menuOpen && (
              <div className="ui2-account-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => go('/profile')}>Profile &amp; security</button>
                {isAdmin && <button type="button" role="menuitem" onClick={() => go('/admin')}>Administration</button>}
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void auth?.logout() }}>Log out</button>
              </div>
            )}
          </div>
        </div>
      </aside>
      {drawerOpen && <button type="button" className="ui2-backdrop" aria-label="Close navigation" tabIndex={-1} onClick={closeDrawer} />}
      <div ref={mainRef} className="ui2-main">
        <header className="ui2-topbar">
          <div className="ui2-breadcrumb">
            <button ref={menuButtonRef} type="button" className="ui2-mobile-menu" aria-label="Toggle navigation" aria-controls="ui2-sidebar"
              aria-expanded={drawerOpen} onClick={() => setDrawerOpen(open => !open)}>☰</button>
            Workspace <span>/ &nbsp;<b>{pageLabel}</b></span>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
