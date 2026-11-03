// The "which holding does this sheet name mean?" step shared by the CSV
// imports (PRD-005 §6, PRD-008 §5). Answers are a holding id or null
// (unresolved); `created` lists the names the user chose to create a new
// holding for, offered only when the import supports it (createLabel).
import { useState } from 'react'
import type { DividendNameResolution, Holding } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'

export type Answers = Record<string, string | null>

const OTHER = '__other__'
const NONE = '__none__'
const CREATE = '__create__'

export default function NameConfirmDialog({ names, holdings, heading, context, intro, createLabel, onBack, onConfirm }: {
  names: DividendNameResolution[]
  holdings: Holding[]
  heading: string // also the dialog's accessible name
  context?: string // shown after the heading, e.g. the dividend tab "₹ INR"
  intro: string
  // When set, each name also offers "Create a new holding" with this label.
  createLabel?: (sheetName: string) => string
  onBack: () => void
  onConfirm: (answers: Answers, created: string[]) => void
}) {
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(names.map(name => [name.sheet_name, name.preselect ?? ''])))
  const [other, setOther] = useState<Record<string, string>>({})

  const answered = names.every(name => {
    const chosen = choice[name.sheet_name]
    return chosen === NONE || chosen === CREATE || (chosen === OTHER ? !!other[name.sheet_name] : !!chosen)
  })

  const confirm = () => {
    const answers: Answers = {}
    const created: string[] = []
    for (const name of names) {
      const chosen = choice[name.sheet_name]
      if (chosen === CREATE) created.push(name.sheet_name)
      else answers[name.sheet_name] = chosen === NONE ? null : chosen === OTHER ? other[name.sheet_name] : chosen
    }
    onConfirm(answers, created)
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label={heading}>
      <div style={{ ...modalCard, width: 'min(620px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{heading}{context && ` · ${context}`}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{intro}</p>
        {names.map(name => (
          <fieldset key={name.sheet_name} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <legend style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--yellow)' }}>
              {name.sheet_name} <span style={{ color: 'var(--text-muted)' }}>· {name.rows} rows{name.status === 'ambiguous' ? ' · matches more than one holding' : ''}</span>
            </legend>
            {name.suggestions.map(suggestion => (
              <label key={suggestion.holding_id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <input type="radio" name={name.sheet_name} checked={choice[name.sheet_name] === suggestion.holding_id}
                  onChange={() => setChoice(previous => ({ ...previous, [name.sheet_name]: suggestion.holding_id }))} />
                {suggestion.script} · {suggestion.symbol}{name.preselect === suggestion.holding_id && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>suggested</span>}
              </label>
            ))}
            <label style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
              <input type="radio" name={name.sheet_name} checked={choice[name.sheet_name] === OTHER}
                onChange={() => setChoice(previous => ({ ...previous, [name.sheet_name]: OTHER }))} />
              Other holding…
              <select aria-label={`Other holding for ${name.sheet_name}`} value={other[name.sheet_name] ?? ''}
                onChange={e => { setOther(previous => ({ ...previous, [name.sheet_name]: e.target.value })); setChoice(previous => ({ ...previous, [name.sheet_name]: OTHER })) }}>
                <option value="">Choose…</option>
                {holdings.map(holding => <option key={holding.id} value={holding.id}>{holding.script} · {holding.symbol}</option>)}
              </select>
            </label>
            {createLabel && (
              <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <input type="radio" name={name.sheet_name} checked={choice[name.sheet_name] === CREATE}
                  onChange={() => setChoice(previous => ({ ...previous, [name.sheet_name]: CREATE }))} />
                {createLabel(name.sheet_name)}
              </label>
            )}
            <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <input type="radio" name={name.sheet_name} checked={choice[name.sheet_name] === NONE}
                onChange={() => setChoice(previous => ({ ...previous, [name.sheet_name]: NONE }))} />
              Leave unresolved <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>its rows become invalid</span>
            </label>
          </fieldset>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onBack}>Back</button>
          <button className="btn-primary" disabled={!answered} onClick={confirm}>Continue to preview</button>
        </div>
      </div>
    </div>
  )
}
