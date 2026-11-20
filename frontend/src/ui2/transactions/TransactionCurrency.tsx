import type { CSSProperties } from 'react'
import type { ThemeName } from '../../lib/useTheme'
import { CURRENCY_PILL_COLOURS, type CurrencyCode } from './currencyPillConfig'

const FLAGS: Record<CurrencyCode, string> = { INR: '🇮🇳', EUR: '🇪🇺' }

export function currencyFlag(currency: string): string {
  return currency === 'INR' || currency === 'EUR' ? FLAGS[currency] : ''
}

const EU_STARS = [
  [12, 5.5], [15.25, 6.37], [17.63, 8.75], [18.5, 12],
  [17.63, 15.25], [15.25, 17.63], [12, 18.5], [8.75, 17.63],
  [6.37, 15.25], [5.5, 12], [6.37, 8.75], [8.75, 6.37],
]

function CircleFlag({ currency, ringColor }: { currency: CurrencyCode; ringColor: string }) {
  const wrapperStyle: CSSProperties = {
    width: 15, height: 15, borderRadius: '9999px', overflow: 'hidden', flexShrink: 0,
    boxShadow: `0 0 0 1px ${ringColor}`, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
  }

  return <span style={wrapperStyle} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="15" height="15">
      {currency === 'INR' ? <>
        <rect width="24" height="8" y="0" fill="#FF9933" />
        <rect width="24" height="8" y="8" fill="#FFFFFF" />
        <rect width="24" height="8" y="16" fill="#138808" />
        <circle cx="12" cy="12" r="3" fill="none" stroke="#000080" strokeWidth="0.9" />
        <circle cx="12" cy="12" r="0.8" fill="#000080" />
      </> : <>
        <rect width="24" height="24" fill="#003399" />
        <g fill="#FFCC00">{EU_STARS.map(([starX, starY]) =>
          <circle key={`${starX}-${starY}`} cx={starX} cy={starY} r="0.85" />)}</g>
      </>}
    </svg>
  </span>
}

export function CurrencyPill({ currency, theme }: { currency: string; theme: ThemeName }) {
  if (currency !== 'INR' && currency !== 'EUR') return <>{currency}</>
  const palette = CURRENCY_PILL_COLOURS[theme][currency]
  return <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px 3px 5px',
    borderRadius: '9999px', fontSize: 11.5, fontWeight: 600, lineHeight: 1,
    letterSpacing: '0.02em', backgroundColor: palette.bg, color: palette.text,
    border: `1px solid ${palette.border}`, boxShadow: palette.glow ?? 'none',
    userSelect: 'none', whiteSpace: 'nowrap',
  }}>
    <CircleFlag currency={currency} ringColor={palette.flagRing} />
    <span>{currency}</span>
  </span>
}
