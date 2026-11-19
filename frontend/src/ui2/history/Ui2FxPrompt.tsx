// The handoff's "Review exchange rates" notice and its "Fetch exchange
// rates again" dialog (PD-059 slice 12, DD-015 §2.7). Days whose EUR→INR
// rate is a fallback or missing are listed by GET /history/fx-missing; the
// user triggers the re-fetch. Healed dates drop off and the rest stay in
// the dialog (owner, 2026-11-19). Not now hides the notice until the app
// reloads. The list is read again whenever History reloads its rows
// (refreshKey), so a day an add or paste flags shows without leaving the
// page. History is always the caller's own portfolio, so act-as never
// reaches this.
import { useEffect, useRef, useState } from 'react'
import { useAuthOptional } from '../../features/auth/AuthContext'
import { api } from '../../lib/api/client'
import { formatDayMonthName } from '../../lib/formDates'
import { toast } from '../../lib/toast'
import { Ui2Dialog } from '../shell/Ui2Dialog'

// Dates listed in the dialog; the rest are counted (owner, 2026-11-19).
export const FX_LISTED_DATES = 10

// Not now lasts until the app reloads: module state, not storage. It
// belongs to the account that chose it, so another login in the same tab
// (logout does not reload) still sees its own notice, and each account that
// dismissed keeps its choice when others sign in and out.
const dismissedFor = new Set<string>()

// Test-only: forget Not now between cases.
export function __resetFxPromptForTests() {
  dismissedFor.clear()
}

function datesPhrase(count: number) {
  return count === 1 ? '1 date has' : `${count} dates have`
}

function longDate(iso: string) {
  return `${formatDayMonthName(iso)} ${iso.slice(0, 4)}`
}

export function Ui2FxPrompt({ refreshKey }: {
  // Changes whenever History reloads its rows (after a save or a month change).
  refreshKey?: unknown
}) {
  const userId = useAuthOptional()?.user?.id ?? ''
  const [dates, setDates] = useState<string[]>([])
  // Bumped by Not now so the module-level choice re-renders the notice away.
  const [, setDismissals] = useState(0)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const dismissed = dismissedFor.has(userId)
  // Only the newest list read may set the dates: a re-fetch (or a later read)
  // bumps it, so a slow earlier GET cannot put healed dates back.
  const latestRead = useRef(0)

  useEffect(() => {
    if (dismissedFor.has(userId)) return
    let active = true
    const token = ++latestRead.current
    // A failed read shows no notice: the days stay flagged for next time.
    api.getFxMissing().then(result => {
      if (active && token === latestRead.current) setDates(result.dates)
    }).catch(() => {})
    return () => { active = false }
  }, [userId, refreshKey])

  if (dismissed || dates.length === 0) return null

  const notNow = () => {
    dismissedFor.add(userId)
    setOpen(false)
    setDismissals(count => count + 1)
  }
  const fetchAgain = async () => {
    setBusy(true)
    setFeedback('')
    // A list read still in flight predates this fetch.
    latestRead.current++
    try {
      const result = await api.refetchFx(dates)
      // So does one started while it ran: the answer below is the newest state.
      latestRead.current++
      if (result.dates.length === 0) {
        setOpen(false)
        setDates([])
        toast('Exchange rates restored', 'success')
        return
      }
      setDates(result.dates)
      const count = result.dates.length
      setFeedback(`${count === 1 ? '1 date is' : `${count} dates are`} still missing; retry or choose Not now.`)
    } catch {
      setFeedback('The fetch failed. The dates remain flagged; retry or choose Not now.')
    } finally {
      setBusy(false)
    }
  }
  const listed = dates.slice(0, FX_LISTED_DATES)
  const more = dates.length - listed.length

  return (
    <>
      <div className="ui2-notice">
        <div>
          <strong>Review exchange rates</strong>
          <span>{datesPhrase(dates.length)} missing or carried FX rates.</span>
        </div>
        <button type="button" className="ui2-btn" onClick={() => { setFeedback(''); setOpen(true) }}>Fetch rates again</button>
      </div>
      {open && (
        <Ui2Dialog title="Fetch exchange rates again" onClose={() => setOpen(false)} busy={busy}>
          <div className="u2h-fx">
            <p>{dates.length === 1 ? 'One day uses' : `${dates.length} days use`} a carried or missing rate. Yahoo is queried only for your own flagged dates.</p>
            <ul>
              {listed.map(date => <li key={date}>{longDate(date)}</li>)}
              {more > 0 && <li>and {more} more</li>}
            </ul>
            <p className="ui2-note">A failed fetch keeps the dates flagged for the next visit.</p>
            <p role="status">{feedback}</p>
          </div>
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn" onClick={notNow} disabled={busy}>Not now</button>
            <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => void fetchAgain()} disabled={busy}>
              {busy ? 'Fetching…' : 'Fetch rates again'}
            </button>
          </div>
        </Ui2Dialog>
      )}
    </>
  )
}
