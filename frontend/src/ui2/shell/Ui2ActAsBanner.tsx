import { Link } from 'react-router-dom'
import { useAuthOptional } from '../../features/auth/AuthContext'
import './actAsBanner.css'

// The handoff's act-as banner (PRD-015 §4.9): whenever an admin reads or
// changes another account, it names that account, who is signed in, and
// offers the way back. Every UI_2.0 act-as page renders it first.
export function Ui2ActAsBanner({ label }: { label: string }) {
  const caller = useAuthOptional()?.user
  return (
    <section className="u2-actas-banner" aria-label="Act-as session">
      <div>
        <strong>Viewing {label}</strong>
        {caller && <small>You are signed in as {caller.name || caller.username}</small>}
      </div>
      <Link to="/admin" className="ui2-btn">Exit act-as</Link>
    </section>
  )
}
