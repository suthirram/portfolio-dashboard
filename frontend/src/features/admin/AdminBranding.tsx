import { useState } from 'react'
import { ApiError, type BrandingFont } from '../../lib/api/client'
import { FONT_CATALOG, useBranding } from '../../lib/useBranding'
import { AdminShell } from './AdminShell'

export default function AdminBranding() {
  const { settings, font, loading, error, setFont } = useBranding()
  const [saving, setSaving] = useState<BrandingFont | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

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

  return (
    <AdminShell>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Branding</h1>
      </div>

      {(error || saveError) && (
        <div style={{
          background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)',
          padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13,
        }}>{saveError ?? error}</div>
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
