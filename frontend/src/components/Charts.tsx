import { useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import type { HoldingWithPrice } from '../types'

const COLORS = ['#4f8ef7', '#00c896', '#a78bfa', '#fbbf24', '#ff4d6d', '#38bdf8', '#fb923c', '#34d399', '#f472b6', '#60a5fa']

const fmt = (v: number) => `₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

const CustomTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  const value = typeof entry.value === 'number' ? entry.value : 0
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{entry.name}</div>
      <div style={{ color: 'var(--text-secondary)' }}>{fmt(value)}</div>
    </div>
  )
}

const PnLTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={String(p.name ?? '')} style={{ color: p.fill, marginBottom: 2 }}>
          {p.name}: {fmt(typeof p.value === 'number' ? p.value : 0)}
        </div>
      ))}
    </div>
  )
}

type ChartView = 'allocation' | 'pnl' | 'exchange'

interface ChartsProps {
  holdings: HoldingWithPrice[]
}

export default function Charts({ holdings }: ChartsProps) {
  const [view, setView] = useState<ChartView>('allocation')

  if (!holdings?.length) return null

  // Allocation by current value
  const allocationData = holdings
    .filter(h => (h.current_value ?? 0) > 0)
    .map(h => ({ name: h.script, value: h.current_value ?? 0 }))
    .sort((a, b) => b.value - a.value)

  // P&L bar chart
  const pnlData = holdings
    .filter(h => h.unrealized_pnl !== 0 || h.realized_pnl !== 0)
    .map(h => ({
      name: h.script,
      unrealised: h.unrealized_pnl || 0,
      realised: h.realized_pnl || 0,
    }))
    .sort((a, b) => (b.unrealised + b.realised) - (a.unrealised + a.realised))
    .slice(0, 15) // top 15

  // Exchange breakdown
  const byExchange = holdings.reduce<Record<string, number>>((acc, h) => {
    const key = h.exchange || 'OTHER'
    acc[key] = (acc[key] || 0) + (h.current_value || h.cost_price || 0)
    return acc
  }, {})
  const exchangeData = Object.entries(byExchange).map(([name, value]) => ({ name, value }))

  const BTN = (k: ChartView, label: string) => (
    <button key={k} onClick={() => setView(k)} style={{
      background: view === k ? 'var(--blue)' : 'var(--bg-input)',
      color: view === k ? '#fff' : 'var(--text-secondary)',
      border: `1px solid ${view === k ? 'var(--blue)' : 'var(--border)'}`,
      padding: '5px 14px', fontWeight: view === k ? 600 : 400,
    }}>
      {label}
    </button>
  )

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>Charts</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {BTN('allocation', 'Allocation')}
          {BTN('pnl', 'P&L')}
          {BTN('exchange', 'By Exchange')}
        </div>
      </div>

      {view === 'allocation' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center' }}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                innerRadius={70} outerRadius={110} paddingAngle={2}>
                {allocationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {allocationData.map((d, i) => {
              const total = allocationData.reduce((s, x) => s + x.value, 0)
              const pct = total ? ((d.value / total) * 100).toFixed(1) : 0
              return (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{d.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {view === 'pnl' && (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={pnlData} margin={{ left: 20, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} angle={-30} textAnchor="end" interval={0} height={60} />
            <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <Tooltip content={<PnLTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
            <Bar dataKey="unrealised" name="Unrealised" fill="#4f8ef7" radius={[3, 3, 0, 0]} />
            <Bar dataKey="realised" name="Realised" fill="#00c896" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {view === 'exchange' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center' }}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={exchangeData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={110} paddingAngle={3} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={{ stroke: 'var(--text-muted)' }}>
                {exchangeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {exchangeData.map((d, i) => {
              const total = exchangeData.reduce((s, x) => s + x.value, 0)
              return (
                <div key={d.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block' }} />
                      {d.name}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmt(d.value)}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                    <div style={{ height: '100%', background: COLORS[i % COLORS.length], borderRadius: 2, width: `${total ? (d.value / total) * 100 : 0}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
