import { useState } from 'react'
import { ApiError, type BrandingFont } from '../../lib/api/client'
import { FONT_CATALOG, useBranding } from '../../lib/useBranding'
import { toast } from '../../lib/toast'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { Ui2AdminTabs } from './Ui2AdminUsers'
import './admin.css'

// The handoff's Branding section (super admin): pick a typeface by comparing
// letters and financial figures, then apply it for every user. The choices
// are the server's allowed_fonts, so a font added on the server appears here
// with no frontend change.
export function Ui2AdminBranding() {
  const { settings, font, loading, error, setFont } = useBranding()
  const options = settings?.allowed_fonts ?? FONT_CATALOG
  const [choice, setChoice] = useState<BrandingFont | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const selected = choice ?? font
  const appliedLabel = options.find(option => option.id === font)?.label ?? '—'

  const apply = async () => {
    if (selected === font) return
    setSaving(true)
    setSaveError(null)
    try {
      await setFont(selected)
      setChoice(null)
      toast(`${options.find(option => option.id === selected)?.label ?? selected} applied for every user`, 'success')
    } catch (failure) {
      setSaveError(failure instanceof ApiError ? failure.message : 'Could not save branding')
    } finally {
      setSaving(false)
    }
  }

  const errorText = saveError ?? error

  return (
    <>
      <Ui2PageIntro title="Make Portfolio feel like yours." subtitle="Choose a typeface for the shared application look." />
      <section className="u2-admin-root" aria-label="Administration">
        <Ui2AdminTabs isSuper />
        <section className="ui2-panel u2-admin-section">
          <div className="u2-brand-heading">
            <div>
              <span className="u2-brand-eyebrow">SUPER ADMIN · BRANDING</span>
              <h2>Find your portfolio’s typeface</h2>
              <p className="ui2-note">Select a font, compare its letters and financial figures, then apply it for every user.</p>
            </div>
            <span className="u2-brand-badge">{options.length} FONTS</span>
          </div>
          <p className="u2-brand-applied" role="status">Applied: {appliedLabel}</p>
          {errorText && <p className="ui2-note" role="alert" style={{ color: 'var(--u2-red)' }}>{errorText}</p>}
          <form onSubmit={event => { event.preventDefault(); void apply() }} aria-label="Brand font settings">
            <fieldset className="u2-brand-fonts" disabled={loading || saving}>
              <legend>Brand font</legend>
              {options.map(option => (
                <label key={option.id} className="u2-brand-card">
                  <span className="u2-brand-choice">
                    <input type="radio" name="font" value={option.id} checked={selected === option.id}
                      onChange={() => setChoice(option.id)} />
                    <strong>{option.label}</strong>
                  </span>
                  <span className="u2-brand-sample" style={{ fontFamily: option.css_family }} aria-hidden>
                    <span className="u2-brand-alphabet">Aa Bb 0123</span>
                    <span>Portfolio performance</span>
                    <span>₹1,23,456.78 · €2,610.50</span>
                    <span>+12.34% · −0.56%</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="ui2-dialog-actions">
              <button type="submit" className="ui2-btn ui2-btn-primary" disabled={saving || selected === font}>
                {saving ? 'Applying…' : 'Apply font'}
              </button>
            </div>
          </form>
        </section>
      </section>
    </>
  )
}
