import { useState } from 'react'
import SummaryCards from './components/SummaryCards'
import HoldingsTable from './features/holdings/HoldingsTable'
import AddEditModal from './features/holdings/AddEditModal'
import Charts from './components/Charts'
import { useHoldings } from './features/holdings/useHoldings'
import type { HoldingWithPrice } from './types'

type ModalState = 'add' | HoldingWithPrice | null
type Tab = 'table' | 'charts'

export default function App() {
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
  } = useHoldings()

  const [modal, setModal] = useState<ModalState>(null)
  const [tab, setTab] = useState<Tab>('table')
  const [filter, setFilter] = useState('')

  const handleSaved = async () => {
    setModal(null)
    await refresh()
  }

  const handleDelete = async (id: string) => {
    try {
      await remove(id)
    } catch (e) {
      alert('Delete failed: ' + (e instanceof Error ? e.message : String(e)))
    }
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
    }}>
      {label}
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        padding: '0 28px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, background: 'var(--blue)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>📈</div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Portfolio Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchPrices} disabled={loadingPrices}
            style={{
              background: 'var(--bg-card)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', padding: '6px 14px',
              display: 'flex', alignItems: 'center', gap: 6, opacity: loadingPrices ? 0.6 : 1,
            }}>
            {loadingPrices ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↻'} Refresh
          </button>
          <button onClick={() => setModal('add')}
            style={{ background: 'var(--blue)', color: '#fff', padding: '6px 16px', fontWeight: 600 }}>
            + Add Holding
          </button>
        </div>
      </header>

      {/* Main */}
      <main style={{ padding: '24px 28px', maxWidth: 1600, margin: '0 auto' }}>
        {/* Summary cards */}
        <SummaryCards summary={summary} loading={loadingPrices} />

        <div style={{ height: 24 }} />

        {/* Tabs + filter */}
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

        {/* Content */}
        {tab === 'table' && (
          <HoldingsTable
            holdings={filtered}
            loading={loadingHoldings || loadingPrices}
            onEdit={h => setModal(h)}
            onDelete={handleDelete}
          />
        )}
        {tab === 'charts' && <Charts holdings={enriched} />}
      </main>

      {/* Modal */}
      {modal && (
        <AddEditModal
          holding={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
