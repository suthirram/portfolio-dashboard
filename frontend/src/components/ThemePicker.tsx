import { useState } from 'react'
import type { ThemeName } from '../lib/useTheme'

// ThemePicker: direct one-click theme selection (no cycling). Rendered
// inside the dashboard's user menu. Page headers use the inline variant,
// which shows the current theme first and opens the options on click. The
// Cyber option appears only for premium accounts.

const OPTIONS: { id: ThemeName; label: string; premiumOnly?: boolean }[] = [
  { id: 'cyberpunk', label: '⚡ Cyber', premiumOnly: true },
    { id: 'light', label: '☀ Light' },
    { id: 'dark', label: '🌙 Dark' },

]

export default function ThemePicker({ theme, premium, onSelect, variant = 'menu' }: {
  theme: ThemeName
  premium?: boolean
  onSelect: (t: ThemeName) => void
  /** 'menu' = direct choices inside a dropdown; 'inline' = compact page-header dropdown. */
  variant?: 'menu' | 'inline'
}) {
  const [open, setOpen] = useState(false)
  const options = OPTIONS.filter(o => !o.premiumOnly || premium)
  const current = OPTIONS.find(o => o.id === theme) ?? OPTIONS[0]
  const buttons = (
    <div role="group" aria-label="Theme" style={{ display: 'flex', gap: 6 }}>
      {options.map(o => {
        const active = theme === o.id
        return (
          <button key={o.id} onClick={() => {
            onSelect(o.id)
            setOpen(false)
          }} aria-pressed={active}
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
  if (variant === 'inline') {
    return (
      <div
        onBlur={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
        }}
        style={{ position: 'relative', display: 'inline-flex' }}
      >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Theme: ${current.label}`}
          onClick={() => setOpen(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap',
            background: 'var(--blue-dim)', color: 'var(--blue)',
            border: '1px solid var(--blue)', borderRadius: 'var(--radius-sm)',
          }}
        >
          <span>{current.label}</span>
          <span aria-hidden="true" style={{ fontSize: 10, lineHeight: 1 }}>▾</span>
        </button>
        {open && (
          <div
            className="menu-pop"
            role="menu"
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0,
              minWidth: 132, padding: 8, zIndex: 120,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow)',
            }}
          >
            <div style={{ display: 'grid', gap: 6 }}>
              {options.map(o => {
                const active = theme === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onSelect(o.id)
                      setOpen(false)
                    }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%', padding: '6px 8px', fontSize: 12, whiteSpace: 'nowrap',
                      background: active ? 'var(--blue-dim)' : 'transparent',
                      color: active ? 'var(--blue)' : 'var(--text-primary)',
                      border: `1px solid ${active ? 'var(--blue)' : 'transparent'}`,
                      borderRadius: 'var(--radius-sm)', textAlign: 'left',
                    }}
                  >
                    <span>{o.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }
  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6,
      }}>Theme</div>
      {buttons}
    </div>
  )
}
