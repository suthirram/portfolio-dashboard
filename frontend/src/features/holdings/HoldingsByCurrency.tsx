import { useState, useEffect, useRef } from 'react'
import type React from 'react'
import type { HoldingWithPrice } from '../../types'
import HoldingsTable from './HoldingsTable'
import { filterByView, viewCounts, type HoldingView } from './holdingViews'
import { groupByCurrency, type CurrencyCode } from './groupByCurrency'
import { sumTotals, nativeView, nativeSymbols } from './currencyTotals'
import { computeGroupDayChange, type GroupDayChange, type HoldingWithPreviousClose } from './dashboardPriceMovement'
import { xirrNote, type XirrIndex } from './stockXirr'
import { formatRate, rateTone } from '../../lib/rate'
import { formatDate } from '../../lib/formDates'
import { groupBySector, sectorSectionId, type SectorSelection } from './classification'
import { SectorColorsContext, type SectorColorMap } from './sectorColors'

export type HoldingsLayout = 'holding' | 'sector'

interface Props {
  renderRows?: (rows: HoldingWithPrice[]) => React.ReactNode
  holdings: HoldingWithPreviousClose[]
  loading: boolean
  onEdit: (holding: HoldingWithPrice) => void
  onDelete: (id: string) => void
  onTransactions?: (holding: HoldingWithPrice) => void
  /** Stock XIRR (PD-055); null while loading or when /xirr failed. */
  xirr?: XirrIndex | null
  searchActive?: boolean
  view?: HoldingView
  onViewChange?: (view: HoldingView) => void
  layout?: HoldingsLayout
  onLayoutChange?: (layout: HoldingsLayout) => void
  sectorTarget?: SectorSelection | null
  onSectorTargetHandled?: () => void
  /** Per-currency sector colours (sectorColorsByCurrency over the whole portfolio). */
  sectorColors?: Map<CurrencyCode, SectorColorMap>
  /** UI_2.0: wrap in a bordered panel with search/filter tools, compact headers, and a footer. */
  ui2Panel?: boolean
  /** UI_2.0: controlled search value rendered inside the panel tools row. */
  searchValue?: string
  /** UI_2.0: search change handler rendered inside the panel tools row. */
  onSearch?: (value: string) => void
}

const CURRENCY_LABEL: Record<CurrencyCode, string> = {
  INR: 'Indian Rupee',
  EUR: 'Euro',
  OTHER: 'Other',
}

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  INR: '₹',
  EUR: '€',
  OTHER: '',
}

const fmt = (amount: number, sym: string) => {
  if (!isFinite(amount)) return '—'
  const abs = Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return (amount < 0 ? `-${sym}` : sym) + abs
}


export default function HoldingsByCurrency({ holdings, loading, onEdit, onDelete, onTransactions, renderRows, xirr, searchActive = false,
  view: viewProp, onViewChange, layout: layoutProp, onLayoutChange, sectorTarget, onSectorTargetHandled, sectorColors,
  ui2Panel, searchValue, onSearch }: Props) {
  const [internalView, setInternalView] = useState<HoldingView>('active')
  const [internalLayout, setInternalLayout] = useState<HoldingsLayout>('holding')
  const [targetMessage, setTargetMessage] = useState('')
  const [marketFilter, setMarketFilter] = useState<'all' | 'INR' | 'EUR'>('all')
  const statusRef = useRef<HTMLParagraphElement>(null)
  const view = viewProp ?? internalView
  const layout = layoutProp ?? internalLayout
  const setView = (next: HoldingView) => { setTargetMessage(''); if (onViewChange) onViewChange(next); else setInternalView(next) }
  const setLayout = (next: HoldingsLayout) => { setTargetMessage(''); if (onLayoutChange) onLayoutChange(next); else setInternalLayout(next) }

  const counts = viewCounts(holdings)
  const visible = filterByView(holdings, view)
  const groups = groupByCurrency(visible)
  const displayGroups = ui2Panel && marketFilter !== 'all'
    ? groups.filter(group => group.currency === marketFilter)
    : groups
  const membership = visible.map(holding => holding.id).join(',')
  const previousMembership = useRef(membership)
  useEffect(() => {
    if (previousMembership.current !== membership && !sectorTarget) setTargetMessage('')
    previousMembership.current = membership
  }, [membership, sectorTarget])
  useEffect(() => {
    if (!sectorTarget || loading) return
    if (layout !== 'sector') { setLayout('sector'); return }
    const heading = document.getElementById(sectorSectionId(sectorTarget.currency, sectorTarget.key))
    if (heading) {
      setTargetMessage('')
      heading.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
      heading.focus({ preventScroll: true })
    } else {
      setTargetMessage('The selected sector has no matching holdings in the current position view or search. Adjust those controls to see it.')
    }
    onSectorTargetHandled?.()
  }, [sectorTarget, loading, holdings, view, layout, onSectorTargetHandled])
  useEffect(() => { if (targetMessage) statusRef.current?.focus() }, [targetMessage])

  const segBtn = (key: HoldingView, label: string, count: number) => (
    <button
      key={key}
      type="button"
      className={ui2Panel ? `ui2-btn${view === key ? ' ui2-btn-primary' : ''}` : 'seg-btn'}
      aria-pressed={view === key}
      onClick={() => setView(key)}>
      {label}
      <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500,
        color: view === key && ui2Panel ? 'inherit' : 'var(--text-muted)', opacity: 0.8 }}>
        {count}
      </span>
    </button>
  )

  const displayedCount = displayGroups.reduce((sum, group) => sum + group.holdings.length, 0)

  const groupRows = displayGroups.map(group => {
    const totals = sumTotals(group.holdings)
    const native = group.currency === 'EUR' ? 'EUR' : 'INR'
    const { native: nativeSym, foreign: foreignSym } = nativeSymbols(group.currency)
    const cost = nativeView(group.currency, totals.cost, totals.costEur)
    const value = nativeView(group.currency, totals.value, totals.valueEur)
    const unreal = nativeView(group.currency, totals.unreal, totals.unrealEur)
    const real = nativeView(group.currency, totals.real, totals.realEur)

    const dayChange = computeGroupDayChange(group.holdings)
    // OTHER groups have no XIRR bucket (the backend skips them).
    const bucket = group.currency === 'OTHER' ? undefined : xirr?.byCurrency[group.currency]
    const colors = sectorColors?.get(group.currency)

    return (
      <SectorColorsContext.Provider key={group.currency} value={colors}>
      <section style={ui2Panel ? undefined : { marginBottom: 24 }}>
        {ui2Panel ? (
          <div className="u2-market-header">
            <div>
              <span className="u2-market-symbol-badge" aria-hidden="true">{CURRENCY_SYMBOL[group.currency]}</span>
              <strong>{CURRENCY_LABEL[group.currency]}</strong>
              <small>{group.holdings.length} {group.holdings.length === 1 ? 'holding' : 'holdings'}{searchActive && ' · filtered'}</small>
            </div>
            <div className="u2-market-bucket">
              Current value{' '}
              <strong>{fmt(value.primary, nativeSym)}</strong>
            </div>
          </div>
        ) : (
          <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {CURRENCY_SYMBOL[group.currency]} {CURRENCY_LABEL[group.currency]}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {group.holdings.length} {group.holdings.length === 1 ? 'holding' : 'holdings'}
              {searchActive && ' · visible selection'}
            </span>
          </header>
        )}

        {!ui2Panel && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 12,
            display: 'flex', flexWrap: 'wrap', gap: 16,
          }}>
            <Stat label={`Cost (${native})`} primary={fmt(cost.primary, nativeSym)} secondary={fmt(cost.secondary, foreignSym)} />
            <Stat label={`Current value (${native})`} primary={fmt(value.primary, nativeSym)} secondary={fmt(value.secondary, foreignSym)} />
            <Stat label="Unrealised" primary={fmt(unreal.primary, nativeSym)} secondary={fmt(unreal.secondary, foreignSym)} tone={unreal.primary >= 0 ? 'pos' : 'neg'} />
            <Stat label="Realised" primary={fmt(real.primary, nativeSym)} secondary={fmt(real.secondary, foreignSym)} tone={real.primary >= 0 ? 'pos' : 'neg'} />
            {dayChange !== null && <ChangeStat dayChange={dayChange} symbol={nativeSym} />}
            {bucket && xirr && (
              <Stat label="XIRR" primary={formatRate(bucket.xirr)}
                secondary={bucket.since ? `since ${formatDate(bucket.since)}` : 'no flows'}
                tone={rateTone(bucket.xirr)}
                title={xirrNote(bucket.since, xirr.asOf, bucket.undated_openings > 0)} />
            )}
          </div>
        )}

        {layout === 'holding' ? (renderRows ? renderRows(group.holdings) : <HoldingsTable
          holdings={group.holdings}
          loading={loading}
          onEdit={onEdit}
          onDelete={onDelete}
          onTransactions={onTransactions}
          view="all"
          nativeCurrency={group.currency === 'EUR' ? 'EUR' : 'INR'}
          xirr={xirr}
          totalXirr={bucket ?? null}
          totalLabel={searchActive ? 'VISIBLE TOTAL' : 'TOTAL'}
        />) : groupBySector(group.holdings).map(sector => {
          const subtotal = sumTotals(sector.holdings)
          const current = nativeView(group.currency, subtotal.value, subtotal.valueEur).primary
          const sectionId = sectorSectionId(group.currency, sector.key)
          return <div key={sector.key} className="sector-group" aria-labelledby={sectionId}>
            <h3 id={sectionId} tabIndex={-1} className="sector-heading">
              <span><span aria-hidden="true" className="sector-dot" style={{ background: colors?.get(sector.key) ?? sector.color }} />{sector.label}</span>
              <span className="sector-group-meta">{sector.holdings.length} {sector.holdings.length === 1 ? 'holding' : 'holdings'} · {fmt(current, nativeSym)} current value</span>
            </h3>
            {renderRows ? renderRows(sector.holdings) : <HoldingsTable holdings={sector.holdings} loading={loading} onEdit={onEdit} onDelete={onDelete}
              onTransactions={onTransactions} view="all" nativeCurrency={group.currency === 'EUR' ? 'EUR' : 'INR'}
              xirr={xirr} totalXirr={null} totalLabel={`${sector.label} subtotal${searchActive ? ' (visible selection)' : ''}`} />}
          </div>
        })}
      </section>
      </SectorColorsContext.Provider>
    )
  })

  const emptyState = displayGroups.length === 0 && !loading && (
    <div className={ui2Panel ? 'u2-holdings-empty' : undefined} style={ui2Panel ? undefined : {
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: 48, textAlign: 'center', color: 'var(--text-muted)',
    }}>
      {counts.all === 0
        ? 'No holdings yet. Click "Add Holding" to get started.'
        : ui2Panel && marketFilter !== 'all' && groups.length > 0
          ? `No ${marketFilter} holdings in your portfolio.`
          : view === 'nil'
            ? 'No nil holdings. Fully-exited positions (0 shares) will appear here.'
            : 'No active holdings — all positions exited. Switch to "Nil" to see them.'}
    </div>
  )

  if (ui2Panel) {
    return (
      <section className="ui2-panel u2-holdings-panel" aria-label="Holdings">
        <div className="u2-holdings-tools">
          <div className="u2-holdings-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" />
            </svg>
            <input
              type="search"
              aria-label="Search holdings"
              placeholder="Search name or symbol"
              value={searchValue ?? ''}
              onChange={event => onSearch?.(event.target.value)}
            />
          </div>
          <select
            className="u2-holdings-market-select"
            aria-label="Filter holdings by currency"
            value={marketFilter}
            onChange={event => setMarketFilter(event.target.value as typeof marketFilter)}
          >
            <option value="all">All currencies</option>
            <option value="INR">INR holdings</option>
            <option value="EUR">EUR holdings</option>
          </select>
        </div>
        <div className="u2-holdings-controls" role="group" aria-label="Holdings controls">
          <div className="u2-holdings-view" role="group" aria-label="Position view">
            {segBtn('active', 'Holdings', counts.active)}
            {segBtn('all', 'All', counts.all)}
            {segBtn('nil', 'Nil', counts.nil)}
          </div>
          <div role="group" aria-label="Group holdings" style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {(['holding', 'sector'] as const).map(option => (
              <button key={option} type="button"
                className={`ui2-btn${layout === option ? ' ui2-btn-primary' : ''}`}
                aria-pressed={layout === option}
                onClick={() => setLayout(option)}>
                By {option}
              </button>
            ))}
          </div>
        </div>
        <p role="status" tabIndex={-1} ref={statusRef} hidden={!targetMessage}>{targetMessage}</p>
        {emptyState}
        {ui2Panel && renderRows && layout === 'holding' ? renderRows(visible) : groupRows}
        <div className="u2-holdings-footer">
          <span>
            {displayedCount === visible.length
              ? `${displayedCount} ${displayedCount === 1 ? 'holding' : 'holdings'}`
              : `${displayedCount} of ${visible.length} holdings`}
          </span>
          <span>Open a holding for all metrics ↗</span>
        </div>
      </section>
    )
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div className="seg-group">
          {segBtn('active', 'Holdings', counts.active)}
          {segBtn('all', 'All', counts.all)}
          {segBtn('nil', 'Nil', counts.nil)}
        </div>
        <div className="seg-group" aria-label="Group holdings" style={{ marginLeft: 'auto' }}>
          {(['holding', 'sector'] as const).map(option => <button key={option} type="button" className="seg-btn"
            aria-pressed={layout === option} onClick={() => setLayout(option)}>
            By {option}
          </button>)}
        </div>
      </div>
      <p role="status" tabIndex={-1} ref={statusRef} hidden={!targetMessage}>{targetMessage}</p>
      {emptyState}
      {groupRows}
    </>
  )
}

// ChangeStat shows the native-amount move vs the previous close (no FX), as a
// "Today" entry inside the currency group card. The gain and its percentage
// come from the holdings' own previous closes (snapshot first, else Yahoo),
// so intraday buys/sells don't inflate them and no History row is needed.
function ChangeStat({ dayChange, symbol }: { dayChange: GroupDayChange; symbol: string }) {
  const up = dayChange.gain >= 0
  const pct = dayChange.pct === null ? '—' : `${up ? '+' : '-'}${Math.abs(dayChange.pct).toFixed(2)}%`
  return (
    <Stat
      label="Today"
      primary={`${up ? '▲' : '▼'} ${fmt(Math.abs(dayChange.gain), symbol)}`}
      secondary={pct}
      tone={up ? 'pos' : 'neg'}
    />
  )
}

function Stat({ label, primary, secondary, tone, title }: {
  label: string; primary: string; secondary: string; tone?: ReturnType<typeof rateTone>; title?: string
}) {
  return (
    <div style={{ flex: '1 1 140px', minWidth: 120 }} title={title || undefined}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div className={tone ? `mono ${tone}` : 'mono'} style={{ fontSize: 18, fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {primary}
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap' }}>
        ({secondary})
      </div>
      {title && <span className="sr-only">{title}</span>}
    </div>
  )
}
