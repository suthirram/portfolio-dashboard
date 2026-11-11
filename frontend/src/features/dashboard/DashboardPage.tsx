import { useEffect, useState, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SummaryCards from '../../components/SummaryCards'
import { PortfolioHero } from '../../components/PortfolioHero'
import { useUiRevamp } from '../../lib/uiMode'
import { notify } from '../../lib/toast'
import { type GoldMetrics } from '../../lib/api/client'
import HoldingsByCurrency from '../holdings/HoldingsByCurrency'
import AddEditModal from '../holdings/AddEditModal'
import TransactionsModal from '../holdings/TransactionsModal'
import OpeningDateModal from '../holdings/OpeningDateModal'
import Charts from '../../components/Charts'
import { useHoldings } from '../holdings/useHoldings'
import { useAuth } from '../auth/AuthContext'
import { api, type Region } from '../../lib/api/client'
import { useTheme } from '../../lib/useTheme'
import ThemePicker from '../../components/ThemePicker'
import type { HoldingWithPrice } from '../../types'
import { canonicalCurrency } from '../../lib/currency'
import { computeGroupDayChange } from '../holdings/dashboardPriceMovement'
import { groupByCurrency, type CurrencyCode } from '../holdings/groupByCurrency'
import {
  ChartLineIcon, CoinsIcon, ListIcon, ShieldIcon, PinIcon, RefreshIcon, PlusIcon,
  UserCheckIcon, UserIcon, SettingsIcon, LogOutIcon, ArrowLeftIcon,
} from '../../components/Icon'

// dividendIncome sums ledger-derived dividends per native currency for the
// income card (PRD-005 §9). It buckets holdings like the backend's CurrencyOf
// (blank → INR), so a legacy USD holding lands in neither line instead of
// being added into the INR one, which keeps the card in step with the tabs.
export function dividendIncome(holdings: HoldingWithPrice[]): { inr: number; eur: number } {
  const income = { inr: 0, eur: 0 }
  for (const holding of holdings) {
    const currency = canonicalCurrency(holding.currency)
    if (currency === 'INR') income.inr += holding.total_dividends ?? 0
    else if (currency === 'EUR') income.eur += holding.total_dividends ?? 0
  }
  return income
}

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
  const { theme, set: setTheme } = useTheme({ premium: user ? user.premium : undefined })
  const {
    holdings,
    enriched,
    summary,
    xirr,
    loadingHoldings,
    loadingPrices,
    lastRefresh,
    refresh,
    fetchPrices,
    remove,
  } = useHoldings(actAsUserId)

  const [modal, setModal] = useState<ModalState>(null)
  const [txnModal, setTxnModal] = useState<HoldingWithPrice | null>(null)
  const [goldMetrics, setGoldMetrics] = useState<GoldMetrics | null>(null)
  const [tab, setTab] = useState<Tab>('table')
  const [filter, setFilter] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [regionLabel, setRegionLabel] = useState<string>('')
  const [openingPromptSkipped, setOpeningPromptSkipped] = useState(false)
  const revamp = useUiRevamp()
  const location = useLocation()
  const navigate = useNavigate()
  // In the glass shell (PD-054) the brand, page links and user menu live in
  // the sidebar, so the header's copies are hidden there. In act-as the page
  // links stay: they point at the target user's pages, the sidebar's don't.
  const shellDup = actAsUserId ? '' : ' shell-dup'

  // The shell's "Add holding" (sidebar button, command palette) lands here
  // with state.openAdd; open the modal once and clear the state so a reload
  // or back navigation doesn't reopen it.
  const openAdd = Boolean((location.state as { openAdd?: boolean } | null)?.openAdd)
  useEffect(() => {
    if (!openAdd || actAsUserId) return
    setModal('add')
    navigate(location.pathname, { replace: true, state: null })
  }, [openAdd, actAsUserId, navigate, location.pathname])

  // Holdings with an opening balance but no opening date set yet. Only prompt on
  // the caller's own dashboard (the admin act-as holdings endpoint isn't
  // enriched with opening status).
  const needsOpeningDate = actAsUserId ? [] : holdings.filter(holding => holding.has_opening && !holding.opening_date)
  const showOpeningPrompt = needsOpeningDate.length > 0 && !openingPromptSkipped && !loadingHoldings

  useEffect(() => {
    if (!user?.gold_enabled || actAsUserId) return
    void api.getGoldMetrics().then(setGoldMetrics).catch(() => null)
  }, [user?.gold_enabled, actAsUserId])

  // Look up the friendly region label for the badge.
  useEffect(() => {
    if (!user?.region) { setRegionLabel(''); return }
    void api.getRegions().then((regions: Region[]) => {
      setRegionLabel(regions.find(region => region.id === user.region)?.label ?? user.region)
    }).catch(() => setRegionLabel(user.region))
  }, [user?.region])

  // Keep the open transactions modal's position footer in sync with the
  // recomputed holding after a ledger write (matched by id).
  useEffect(() => {
    if (!txnModal) return
    const fresh = enriched.find(holding => holding.id === txnModal.id)
    if (fresh && fresh !== txnModal) setTxnModal(fresh)
  }, [enriched, txnModal])

  const handleSaved = async () => {
    setModal(null)
    await refresh()
  }
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this holding?')) return
    try { await remove(id) }
    catch (e) { notify('Delete failed: ' + (e instanceof Error ? e.message : String(e))) }
  }

  // Display enriched if available, else fall back to plain holdings
  const displayHoldings: HoldingWithPrice[] = enriched.length > 0 ? enriched : holdings.map(holding => ({
    ...holding,
    cost_price: (holding.stocks_owned ?? 0) * (holding.avg_cost_price ?? 0),
  }))

  const filtered = displayHoldings.filter(holding =>
    !filter || holding.script?.toLowerCase().includes(filter.toLowerCase()) || holding.symbol?.toLowerCase().includes(filter.toLowerCase())
  )

  // The summary card's day change per currency: the same group sum as the
  // currency cards, over the same groups. Each holding's close is its
  // snapshot's, else Yahoo's (act-as always reads Yahoo's: the owner's
  // History is not loaded there). A currency with a holding that has neither
  // gets null and shows "—"; one with no shares held gets no line.
  const computedDayChangeByCurrency = useMemo(() => {
    const groups = groupByCurrency(enriched)
    const changeOf = (currency: CurrencyCode) => {
      const group = groups.find(candidate => candidate.currency === currency)
      if (!group?.holdings.some(holding => (holding.stocks_owned ?? 0) > 0)) return undefined
      return computeGroupDayChange(group.holdings)
    }
    return { INR: changeOf('INR'), EUR: changeOf('EUR') }
  }, [enriched])
  const income = useMemo(() => dividendIncome(enriched), [enriched])

  const TAB = (key: Tab, label: string) => (
    <button className="seg-btn" aria-pressed={tab === key} onClick={() => setTab(key)}>
      {label}
    </button>
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
    <div className="page-art page-art-dashboard" style={{ minHeight: '100dvh' }}>
      <header className="dash-nav page-nav nav-glass">
          <Link to="/" className="shell-dup" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
            <div className="brand-tile" style={{ width: 32, height: 32 }}><ChartLineIcon size={18} /></div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Portfolio Dashboard</span>
          </Link>
          <h1 className="shell-only page-title">{actAsLabel ? `${actAsLabel}'s portfolio` : 'Portfolio'}</h1>
          {roleBadge}
          {regionLabel && (
            <span style={{
              background: 'var(--bg-card)', color: 'var(--text-secondary)',
              padding: '3px 8px', borderRadius: 'var(--radius-sm)',
              fontSize: 11, border: '1px solid var(--border)',
              display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
            }}><PinIcon size={12} /> {regionLabel}</span>
          )}
          <span aria-hidden className={shellDup} style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          <Link to="/history" className={`btn dash-nav-btn${shellDup}`}>
            <ChartLineIcon size={14} /> <span className="dash-nav-label-sm">History</span>
          </Link>
          {/* Target-aware: this header is also what AdminUserView renders in
              act-as mode, so a hard-coded "/transactions" would drop
              actAsUserId and show the admin's OWN ledger under the target
              user's name. */}
          <Link to={actAsUserId ? `/admin/users/${actAsUserId}/transactions` : '/transactions'}
            className={`btn dash-nav-btn${shellDup}`}>
            <ListIcon size={14} /> <span className="dash-nav-label-sm">Transactions</span>
          </Link>
          {/* Target-aware for act-as, same rule as Transactions above. */}
          <Link to={actAsUserId ? `/admin/users/${actAsUserId}/dividends` : '/dividends'}
            className={`btn dash-nav-btn${shellDup}`}>
            <CoinsIcon size={14} /> <span className="dash-nav-label-sm">Dividends</span>
          </Link>
          {!actAsUserId && user?.gold_enabled && (
            <Link to="/gold" className="btn dash-nav-btn shell-dup">
              <CoinsIcon size={14} /> <span className="dash-nav-label-sm">Gold</span>
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className="btn dash-nav-btn shell-dup">
              <ShieldIcon size={14} /> <span className="dash-nav-label-sm">Admin Panel</span>
            </Link>
          )}
          <span className="dash-nav-spacer" aria-hidden />
          {lastRefresh && (
            <span className="dash-nav-hide-sm" style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchPrices} disabled={loadingPrices} className="btn dash-nav-btn"
            style={{ opacity: loadingPrices ? 0.6 : 1 }}>
            {loadingPrices ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <RefreshIcon size={14} />} <span className="dash-nav-label-sm">Refresh</span>
          </button>
          <button onClick={() => setModal('add')} className="btn-primary dash-nav-btn">
            <PlusIcon size={14} /> <span className="dash-nav-label-sm">Add Holding</span>
          </button>
          <div className="dash-nav-user shell-dup" style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(wasOpen => !wasOpen)} className="btn dash-nav-btn"
              style={{ padding: '6px 12px', color: 'var(--text-primary)' }}>
              <UserIcon size={14} /> <span className="dash-nav-label-sm">{user?.name || user?.username}</span>
            </button>
            {menuOpen && (
              <div className="menu-pop" onMouseLeave={() => setMenuOpen(false)} style={{
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
                <ThemePicker theme={theme} premium={user?.premium} onSelect={setTheme} />
              </div>
            )}
          </div>
      </header>

      <main className="dash-main page-main" style={{ maxWidth: 1600, margin: '0 auto' }}>
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

        {revamp && (
          <PortfolioHero summary={summary} loading={loadingPrices} holdings={enriched}
            dayChange={computedDayChangeByCurrency} />
        )}

        <SummaryCards
          summary={summary}
          loading={loadingPrices}
          goldCurrentInr={goldMetrics?.current ?? null}
          goldInvestedInr={goldMetrics?.invested ?? null}
          goldNettPL={goldMetrics?.nett_in_bees ?? null}
          stocksInvestedInr={enriched.filter(holding => holding.currency === 'INR').reduce((sum, holding) => sum + (holding.cost_price ?? 0), 0)}
          dividendsInr={income.inr}
          dividendsEur={income.eur}
          stocksInvestedEur={enriched.filter(holding => holding.currency === 'EUR').reduce((sum, holding) => sum + (holding.cost_price_eur ?? 0), 0)}
          stocksCurrentInr={enriched.filter(holding => holding.currency === 'INR').reduce((sum, holding) => sum + (holding.cost_price ?? 0) + (holding.unrealized_pnl ?? 0), 0)}
          stocksCurrentEur={enriched.filter(holding => holding.currency === 'EUR').reduce((sum, holding) => sum + (holding.cost_price_eur ?? 0) + (holding.unrealized_pnl_eur ?? 0), 0)}
          stocksUnrealisedInr={enriched.filter(holding => holding.currency === 'INR').reduce((sum, holding) => sum + (holding.unrealized_pnl ?? 0), 0)}
          stocksUnrealisedEur={enriched.filter(holding => holding.currency === 'EUR').reduce((sum, holding) => sum + (holding.unrealized_pnl_eur ?? 0), 0)}
          computedDayChangeInr={computedDayChangeByCurrency.INR}
          computedDayChangeEur={computedDayChangeByCurrency.EUR}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 16px', flexWrap: 'wrap', gap: 10 }}>
          <div className="seg-group">
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
            onEdit={holding => setModal(holding)}
            onDelete={handleDelete}
            // Transaction endpoints target the caller's own portfolio (no
            // admin act-as variant yet), so hide the ledger in act-as mode.
            onTransactions={actAsUserId ? undefined : (holding => setTxnModal(holding))}
            xirr={xirr}
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

      {txnModal && (
        <TransactionsModal
          holding={txnModal}
          onClose={() => setTxnModal(null)}
          onChanged={() => { void refresh() }}
        />
      )}

      {showOpeningPrompt && (
        <OpeningDateModal
          holdings={needsOpeningDate}
          userId={actAsUserId}
          onSkip={() => setOpeningPromptSkipped(true)}
          onSaved={() => { void refresh() }}
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
