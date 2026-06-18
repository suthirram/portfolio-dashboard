import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SummaryCards from '../../components/SummaryCards'
import HoldingsByCurrency from '../holdings/HoldingsByCurrency'
import AddEditModal from '../holdings/AddEditModal'
import Charts from '../../components/Charts'
import { useHoldings } from '../holdings/useHoldings'
import { useAuth } from '../auth/AuthContext'
import { api, type Region } from '../../lib/api/client'
import { useTheme } from '../../lib/useTheme'
import type { HoldingWithPrice } from '../../types'
import {
  ChartLineIcon, ShieldIcon, PinIcon, RefreshIcon, PlusIcon, UserCheckIcon,
  UserIcon, SettingsIcon, LogOutIcon, ArrowLeftIcon,
} from '../../components/Icon'

type ModalState = 'add' | HoldingWithPrice | null
type Tab = 'table' | 'charts'

interface Props {
  /** When set, this dashboard is showing the portfolio of another user
   * (admin act-as flow). All CRUD targets that user's holdings. */
  actAsUserId?: string
  /** Friendly label shown in the act-as banner ("alice's portfolio"). */
  actAsLabel?: string
}

export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
  const { user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const {
    holdings,
    enriched,
    summary,
    loadingHoldings,
    loadingPrices,
    lastRefresh,
    refresh,
    fetchPrices,
    remove,
  } = useHoldings(actAsUserId)

  const [modal, setModal] = useState<ModalState>(null)
  const [tab, setTab] = useState<Tab>('table')
  const [filter, setFilter] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [regionLabel, setRegionLabel] = useState<string>('')

  // Look up the friendly region label for the badge.
  useEffect(() => {
    if (!user?.region) { setRegionLabel(''); return }
    void api.getRegions().then((rs: Region[]) => {
      setRegionLabel(rs.find(r => r.id === user.region)?.label ?? user.region)
    }).catch(() => setRegionLabel(user.region))
  }, [user?.region])

  const handleSaved = async () => {
    setModal(null)
    await refresh()
  }
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this holding?')) return
    try { await remove(id) }
    catch (e) { alert('Delete failed: ' + (e instanceof Error ? e.message : String(e))) }
  }

  // Display enriched if available, else fall back to plain holdings
  const displayHoldings: HoldingWithPrice[] = enriched.length > 0 ? enriched : holdings.map(h => ({
    ...h,
    cost_price: (h.stocks_owned ?? 0) * (h.avg_cost_price ?? 0),
  }))

  const filtered = displayHoldings.filter(h =>
    !filter || h.script?.toLowerCase().includes(filter.toLowerCase()) || h.symbol?.toLowerCase().includes(filter.toLowerCase())
  )

  const TAB = (key: Tab, label: string) => (
    <button onClick={() => setTab(key)} style={{
      background: tab === key ? 'var(--blue)' : 'transparent',
      color: tab === key ? '#fff' : 'var(--text-secondary)',
      padding: '6px 16px',
      borderRadius: 'var(--radius-sm)',
      border: `1px solid ${tab === key ? 'var(--blue)' : 'var(--border)'}`,
      fontWeight: tab === key ? 600 : 400,
    }}>{label}</button>
  )

  const roleBadge = user && (() => {
    const map = {
      user: { label: 'User', bg: 'var(--blue-dim)', color: 'var(--blue)' },
      admin: { label: 'Admin', bg: 'var(--green-dim)', color: 'var(--green)' },
      superadmin: { label: 'Super Admin', bg: 'rgba(167,139,250,0.12)', color: 'var(--purple)' },
    }[user.role]
    if (!map) return null
    return <span style={{
      background: map.bg, color: map.color, padding: '3px 8px',
      borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 600,
    }}>{map.label}</span>
  })()

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)' }}>
      <header className="dash-nav" style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        padding: '0 28px',
        height: 'var(--nav-height)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div className="dash-nav-side" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              width: 32, height: 32, background: 'var(--blue)', color: '#fff',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}><ChartLineIcon size={18} /></div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Portfolio Dashboard</span>
          </Link>
          {roleBadge}
          {regionLabel && (
            <span style={{
              background: 'var(--bg-card)', color: 'var(--text-secondary)',
              padding: '3px 8px', borderRadius: 'var(--radius-sm)',
              fontSize: 11, border: '1px solid var(--border)',
              display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            }}><PinIcon size={12} /> {regionLabel}</span>
          )}
        </div>
        <div className="dash-nav-side" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/history" className="dash-nav-btn" style={{
            background: 'var(--bg-card)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            padding: '6px 14px', fontSize: 13, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <ChartLineIcon size={14} /> <span className="dash-nav-label-sm">History</span>
          </Link>
          <button onClick={toggleTheme} className="dash-nav-btn"
            aria-label="Toggle theme"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'var(--bg-card)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              padding: '6px 10px', fontSize: 13, cursor: 'pointer',
            }}>
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
          {isAdmin && (
            <Link to="/admin" className="dash-nav-btn" style={{
              background: 'var(--bg-card)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              padding: '6px 14px', fontSize: 13, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <ShieldIcon size={14} /> <span className="dash-nav-label-sm">Admin Panel</span>
            </Link>
          )}
          {lastRefresh && (
            <span className="dash-nav-hide-sm" style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchPrices} disabled={loadingPrices} className="dash-nav-btn"
            style={{
              background: 'var(--bg-card)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', padding: '6px 14px',
              display: 'flex', alignItems: 'center', gap: 6, opacity: loadingPrices ? 0.6 : 1,
            }}>
            {loadingPrices ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <RefreshIcon size={14} />} <span className="dash-nav-label-sm">Refresh</span>
          </button>
          <button onClick={() => setModal('add')} className="dash-nav-btn"
            style={{
              background: 'var(--blue)', color: '#fff', padding: '6px 16px', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <PlusIcon size={14} /> <span className="dash-nav-label-sm">Add Holding</span>
          </button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(o => !o)} className="dash-nav-btn"
              style={{
                background: 'var(--bg-card)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', padding: '6px 12px',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <UserIcon size={14} /> <span className="dash-nav-label-sm">{user?.name || user?.username}</span>
            </button>
            {menuOpen && (
              <div onMouseLeave={() => setMenuOpen(false)} style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', minWidth: 180, boxShadow: 'var(--shadow)', zIndex: 100,
              }}>
                <Link to="/profile" onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13,
                  }}>
                  <SettingsIcon size={14} /> Account settings
                </Link>
                <button onClick={logout} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', textAlign: 'left', padding: '8px 12px',
                  background: 'transparent', color: 'var(--text-primary)', fontSize: 13,
                }}>
                  <LogOutIcon size={14} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="dash-main" style={{ padding: '24px 28px', maxWidth: 1600, margin: '0 auto' }}>
        {actAsUserId && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link to="/admin" aria-label="Back to admin" title="Back to admin" style={{
              color: 'var(--blue)', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--blue-dim)', border: '1px solid var(--blue)',
              borderRadius: 'var(--radius-sm)', padding: '0 14px', alignSelf: 'stretch',
            }}>
              <ArrowLeftIcon size={14} />
            </Link>
            <div style={{
              background: 'var(--blue-dim)', border: '1px solid var(--blue)',
              color: 'var(--blue)', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
              display: 'flex', alignItems: 'center', flex: 1,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <UserCheckIcon size={14} /> Acting as <strong>{actAsLabel || 'user'}</strong> — all changes will save to their portfolio.
              </span>
            </div>
          </div>
        )}

        <SummaryCards summary={summary} loading={loadingPrices} />

        <div style={{ height: 24 }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {TAB('table', 'Holdings')}
            {TAB('charts', 'Charts')}
          </div>
          {tab === 'table' && (
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter by script or symbol…"
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '6px 12px',
                color: 'var(--text-primary)', outline: 'none', width: 220, fontSize: 13,
              }}
            />
          )}
        </div>

        {tab === 'table' && (
          <HoldingsByCurrency
            holdings={filtered}
            loading={loadingHoldings || loadingPrices}
            onEdit={h => setModal(h)}
            onDelete={handleDelete}
            perCurrency={summary?.per_currency}
          />
        )}
        {tab === 'charts' && <Charts holdings={enriched} />}
      </main>

      {modal && (
        <AddEditModal
          holding={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          userId={actAsUserId}
        />
      )}

      <footer style={{
        padding: '16px 24px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--text-secondary)',
        borderTop: '1px solid var(--border)',
      }}>
        © {new Date().getUTCFullYear()} Suthir. All rights reserved.
      </footer>
    </div>
  )
}
