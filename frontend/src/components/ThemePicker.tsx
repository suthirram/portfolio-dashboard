import type { ThemeName } from '../lib/useTheme'

// ThemePicker: direct one-click theme selection (no cycling). Rendered
// inside the dashboard's user menu; the Cyber option appears only for
// premium accounts.

const OPTIONS: { id: ThemeName; label: string; premiumOnly?: boolean }[] = [
  { id: 'dark', label: '🌙 Dark' },
  { id: 'light', label: '☀ Light' },
  { id: 'cyberpunk', label: '⚡ Cyber', premiumOnly: true },
]

export default function ThemePicker({ theme, premium, onSelect, variant = 'menu' }: {
  theme: ThemeName
  premium?: boolean
  onSelect: (t: ThemeName) => void
  /** 'menu' = labelled section for a dropdown; 'inline' = bare button row for page headers. */
  variant?: 'menu' | 'inline'
}) {
  const options = OPTIONS.filter(o => !o.premiumOnly || premium)
  const row = (
    <div role="group" aria-label="Theme" style={{ display: 'flex', gap: 6 }}>
      {options.map(o => {
        const active = theme === o.id
        return (
          <button key={o.id} onClick={() => onSelect(o.id)} aria-pressed={active}
            style={{
              flex: variant === 'menu' ? 1 : undefined, padding: '5px 8px', fontSize: 12, whiteSpace: 'nowrap',
              background: active ? 'var(--blue-dim)' : 'transparent',
              color: active ? 'var(--blue)' : 'var(--text-secondary)',
              border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
  if (variant === 'inline') return row
  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
      }}>Theme</div>
      {row}
    </div>
  )
}
