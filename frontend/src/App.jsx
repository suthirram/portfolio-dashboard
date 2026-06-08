import React, { useState, useEffect, useCallback } from 'react'
import { api } from './api/client.js'
import SummaryCards from './components/SummaryCards.jsx'
import HoldingsTable from './components/HoldingsTable.jsx'
import AddEditModal from './components/AddEditModal.jsx'
import Charts from './components/Charts.jsx'

export default function App() {
  const [holdings, setHoldings] = useState([])      // raw from /api/holdings
  const [enriched, setEnriched] = useState([])      // from /api/prices (with live prices)
  const [summary, setSummary] = useState(null)
  const [loadingHoldings, setLoadingHoldings] = useState(false)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [modal, setModal] = useState(null)           // null | 'add' | holding-object
  const [tab, setTab] = useState('table')            // 'table' | 'charts'
  const [lastRefresh, setLastRefresh] = useState(null)
  const [filter, setFilter] = useState('')

  // Load holdings list (fast, no price fetch)
  const fetchHoldings = useCallback(async () => {
    setLoadingHoldings(true)
    try {
      const data = await api.listHoldings()
      setHoldings(data)
    } catch (e) {
      console.error('listHoldings:', e)
    } finally {
      setLoadingHoldings(false)
    }
  }, [])

  // Load enriched prices (slower, hits Yahoo Finance)
  const fetchPrices = useCallback(async () => {
    setLoadingPrices(true)
    try {
      const data = await api.getPrices()
      setEnriched(data.holdings || [])
      // Derive summary from prices response
      const totals = (data.holdings || []).reduce((acc, h) => {
        acc.total_cost += h.cost_price || 0
        acc.total_current_value += h.current_value || 0
        acc.total_unrealized += h.unrealized_pnl || 0
        acc.total_realized += h.realized_pnl || 0
        acc.total_cost_eur += h.cost_price_eur || 0
        acc.total_current_value_eur += h.current_value_eur || 0
        acc.total_unrealized_eur += h.unrealized_pnl_eur || 0
        acc.total_realized_eur += h.realized_pnl_eur || 0
        return acc
      }, {
        total_cost: 0, total_current_value: 0, total_unrealized: 0, total_realized: 0,
        total_cost_eur: 0, total_current_value_eur: 0, total_unrealized_eur: 0, total_realized_eur: 0,
      })
      setSummary({ ...totals, eur_rate: data.eur_rate })
      setLastRefresh(new Date())
    } catch (e) {
      console.error('getPrices:', e)
    } finally {
      setLoadingPrices(false)
    }
  }, [])

  useEffect(() => {
    fetchHoldings()
    fetchPrices()
  }, [])

  const handleSaved = async () => {
    setModal(null)
    await fetchHoldings()
    await fetchPrices()
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteHolding(id)
      await fetchHoldings()
      await fetchPrices()
    } catch (e) {
      alert('Delete failed: ' + e.message)
    }
  }

  // Display enriched if available, else fall back to plain holdings
  const displayHoldings = enriched.length > 0 ? enriched : holdings.map(h => ({
    ...h,
    cost_price: h.stocks_owned * h.avg_cost_price,
  }))

  const filtered = displayHoldings.filter(h =>
    !filter || h.script?.toLowerCase().includes(filter.toLowerCase()) || h.symbol?.toLowerCase().includes(filter.toLowerCase())
  )

  const TAB = (key, label) => (
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
