import { useState } from 'react'
import { ApiError, type BrandingFont } from '../../lib/api/client'
import { FONT_CATALOG, useBranding } from '../../lib/useBranding'
import { useUiRevamp } from '../../lib/uiMode'
import { AdminShell } from './AdminShell'

export default function AdminBranding() {
  const { settings, font, loading, error, setFont } = useBranding()
  const [saving, setSaving] = useState<BrandingFont | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const revamp = useUiRevamp()

  const options = settings?.allowed_fonts ?? FONT_CATALOG

  const choose = async (next: BrandingFont) => {
    if (next === font || saving) return
    setSaving(next)
    setSaveError(null)
    try {
      await setFont(next)
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Could not save branding')
    } finally {
      setSaving(null)
    }
  }

  const errorText = saveError ?? error

  // The glass UI (PD-054): the branding settings as a settings page — the
  // groups in a side list (Font today; logo or colours would join it) and
  // the chosen group's options as preview tiles. Same choices, same save.
  if (revamp) {
    return (
      <AdminShell>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Branding</h1>
        </div>
        <div className="admin-md">
          <aside className="admin-md-list glass-panel" aria-label="Branding settings">
            <ul className="admin-md-items">
              <li>
                <button type="button" className="admin-md-item" aria-current="true">
                  <span className="admin-avatar" aria-hidden>Aa</span>
                  <span className="admin-md-who">
                    <span className="admin-md-name">Font</span>
                    <span className="admin-md-meta">{options.find(option => option.id === font)?.label ?? '—'}</span>
                  </span>
                </button>
              </li>
            </ul>
          </aside>
          <section className="admin-md-detail" aria-label="Font settings">
            {errorText && <div className="alert-danger" role="alert">{errorText}</div>}
            <section className="glass-panel admin-section" aria-label="Font">
              <h3 className="admin-section-title">Font</h3>
              <p className="admin-row-desc" style={{ margin: '0 0 12px' }}>The typeface every page uses, for every user.</p>
              <div role="radiogroup" aria-label="Brand font" className="font-tiles">
                {options.map(option => {
                  const active = option.id === font
                  return (
                    <button key={option.id} type="button" role="radio" aria-checked={active} aria-label={option.label}
                      className="font-tile" disabled={loading || saving !== null} onClick={() => choose(option.id)}>
                      <span className="font-tile-sample" style={{ fontFamily: option.css_family }} aria-hidden>Aa</span>
                      <span className="font-tile-name" style={{ fontFamily: option.css_family }}>{option.label}</span>
                      <span className="font-tile-text" style={{ fontFamily: option.css_family }} aria-hidden>₹1,23,456.78 · Portfolio</span>
                      {saving === option.id
                        ? <span className="spinner font-tile-mark" style={{ width: 14, height: 14 }} />
                        : active && <span className="font-tile-mark" aria-hidden>✓</span>}
                    </button>
                  )
                })}
              </div>
            </section>
          </section>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Branding</h1>
      </div>

      {errorText && (
        <div style={{
          background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)',
          padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13,
        }}>{errorText}</div>
      )}

      <section style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16,
      }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0, marginBottom: 10 }}>
          Font
        </div>
        <div role="radiogroup" aria-label="Brand font" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {options.map(option => {
            const active = option.id === font
            const busy = saving === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={loading || saving !== null}
                onClick={() => choose(option.id)}
                style={{
                  minWidth: 180,
                  background: active ? 'var(--blue-dim)' : 'var(--bg-card)',
                  color: active ? 'var(--blue)' : 'var(--text-primary)',
                  border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  opacity: loading ? 0.7 : 1,
                }}>
                <span style={{ fontFamily: option.css_family, fontSize: 15, fontWeight: 600 }}>
                  {option.label}
                </span>
                {busy && <span className="spinner" style={{ width: 12, height: 12 }} />}
              </button>
            )
          })}
        </div>
      </section>
    </AdminShell>
  )
}
