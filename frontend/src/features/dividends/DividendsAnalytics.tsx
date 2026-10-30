import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DividendView } from '../../types'
import { formatMoney } from '../../lib/currency'
import { chartTooltipProps, td, th } from '../history/historyShared'

const panel: CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
}
const title: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }

export default function DividendsAnalytics({ view, currency }: { view: DividendView; currency: string }) {
  const [period, setPeriod] = useState<'year' | 'month'>('year')
  const series = (period === 'year' ? view.by_year : view.by_month).map(p => ({ period: p.period, total: p.total }))
  const money = (n: number) => formatMoney(n, currency)

  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
      <div style={panel}>
        <div style={title}>
          <span>Dividend income over time · {currency}</span>
          <span role="group" aria-label="Chart period" style={{ display: 'inline-flex', gap: 4 }}>
            <button className={period === 'month' ? 'btn btn-current' : 'btn'} onClick={() => setPeriod('month')}>Monthly</button>
            <button className={period === 'year' ? 'btn btn-current' : 'btn'} onClick={() => setPeriod('year')}>Yearly</button>
          </span>
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={11} />
              <YAxis stroke="var(--text-muted)" fontSize={11} width={70} />
              <Tooltip {...chartTooltipProps} formatter={(v: number) => money(v)} />
              <Bar dataKey="total" fill="var(--blue)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr><th style={th}>Year</th><th style={{ ...th, textAlign: 'right' }}>Dividends</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
          <tbody>
            {[...view.by_year].reverse().map(y => (
              <tr key={y.period}>
                <td style={td}>{y.period}</td>
                <td style={{ ...td, textAlign: 'right' }}>{y.count}</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(y.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={panel}>
        <div style={title}><span>By holding · {currency}</span><span style={{ color: 'var(--text-muted)' }}>biggest first</span></div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr><th style={th}>Holding</th><th style={th}>Share</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
          <tbody>
            {view.by_holding.map(h => (
              <tr key={h.holding_id}>
                <td style={td}>{h.script || h.symbol}</td>
                <td style={td}>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--green)', width: `${Math.max(2, h.share * 100)}%` }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(h.share * 100).toFixed(1)}%</span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{money(h.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
