import { useState } from 'react'
import type { DividendNameResolution, Holding } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'

export type Answers = Record<string, string | null>

const OTHER = '__other__'
const NONE = '__none__'

export default function NameConfirmDialog({ names, holdings, currencyLabel, onBack, onConfirm }: {
  names: DividendNameResolution[]
  holdings: Holding[]
  currencyLabel: string
  onBack: () => void
  onConfirm: (answers: Answers) => void
}) {
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(names.map(n => [n.sheet_name, n.preselect ?? ''])))
  const [other, setOther] = useState<Record<string, string>>({})

  const answered = names.every(n => {
    const c = choice[n.sheet_name]
    return c === NONE || (c === OTHER ? !!other[n.sheet_name] : !!c)
  })

  const confirm = () => {
    const answers: Answers = {}
    for (const n of names) {
      const c = choice[n.sheet_name]
      answers[n.sheet_name] = c === NONE ? null : c === OTHER ? other[n.sheet_name] : c
    }
    onConfirm(answers)
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Confirm share names">
      <div style={{ ...modalCard, width: 'min(620px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Confirm share names · {currencyLabel}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          These names in your sheet don't exactly match a holding. Choose the holding each one means. Your answers are remembered for next time.
        </p>
        {names.map(n => (
          <fieldset key={n.sheet_name} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <legend style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--yellow)' }}>
              {n.sheet_name} <span style={{ color: 'var(--text-muted)' }}>· {n.rows} rows{n.status === 'ambiguous' ? ' · matches more than one holding' : ''}</span>
            </legend>
            {n.suggestions.map(s => (
              <label key={s.holding_id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <input type="radio" name={n.sheet_name} checked={choice[n.sheet_name] === s.holding_id}
                  onChange={() => setChoice(c => ({ ...c, [n.sheet_name]: s.holding_id }))} />
                {s.script} · {s.symbol}{n.preselect === s.holding_id && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>suggested</span>}
              </label>
            ))}
            <label style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
              <input type="radio" name={n.sheet_name} checked={choice[n.sheet_name] === OTHER}
                onChange={() => setChoice(c => ({ ...c, [n.sheet_name]: OTHER }))} />
              Other holding…
              <select aria-label={`Other holding for ${n.sheet_name}`} value={other[n.sheet_name] ?? ''}
                onChange={e => { setOther(o => ({ ...o, [n.sheet_name]: e.target.value })); setChoice(c => ({ ...c, [n.sheet_name]: OTHER })) }}>
                <option value="">Choose…</option>
                {holdings.map(h => <option key={h.id} value={h.id}>{h.script} · {h.symbol}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <input type="radio" name={n.sheet_name} checked={choice[n.sheet_name] === NONE}
                onChange={() => setChoice(c => ({ ...c, [n.sheet_name]: NONE }))} />
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
