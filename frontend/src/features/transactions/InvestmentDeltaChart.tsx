// The Transactions page's investment delta chart (PD-050): one bar per month
// for the money added (green) or sold (red), and a line for the invested
// amount at each month end, on its own axis.
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { ThemeName } from '../../lib/useTheme'
import {
  GOLD_PALETTE, MONTHS, PERFORMANCE_COLUMN_SYMBOL, REGION_COLOURS, chartTooltipProps, fmtAxisAmount,
  fmtCurrency, fmtSignedCurrency, type MonthlyInvestment, type PerformanceColumn,
} from '../history/historyShared'

const DELTA = 'Investment delta'

export function InvestmentDeltaChart({ months, column, theme }: {
  months: MonthlyInvestment[]
  column: PerformanceColumn
  theme: ThemeName
}) {
  const symbol = PERFORMANCE_COLUMN_SYMBOL[column]
  const lineColour = column === 'GOLD' ? GOLD_PALETTE[theme].invested : REGION_COLOURS[theme][column].invested
  const data = months.map(month => ({ ...month, label: MONTHS[month.month0] }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="delta" tick={{ fontSize: 11 }} tickFormatter={fmtAxisAmount} width={64} />
        <YAxis yAxisId="invested" orientation="right" tick={{ fontSize: 11 }} tickFormatter={fmtAxisAmount}
          width={64} domain={['auto', 'auto']} />
        <Tooltip {...chartTooltipProps}
          formatter={(value, name) => name === DELTA
            ? fmtSignedCurrency(Number(value), symbol)
            : fmtCurrency(Number(value), symbol)} />
        <ReferenceLine yAxisId="delta" y={0} stroke="var(--text-muted)" strokeDasharray="2 2" />
        <Bar yAxisId="delta" dataKey="delta" name={DELTA} radius={[3, 3, 0, 0]}>
          {data.map(month => (
            <Cell key={month.month0} fill={(month.delta ?? 0) < 0 ? 'var(--red)' : 'var(--green)'} />
          ))}
        </Bar>
        <Line yAxisId="invested" dataKey="invested" name={`Invested (${symbol})`} stroke={lineColour}
          strokeWidth={2} dot connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
