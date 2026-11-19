// The handoff's page intro: the page's h1 and subtitle on the left, its
// primary actions on the right. Every UI_2.0 page opens with one (PD-059).
import type { ReactNode } from 'react'
import '../primitives.css'

export function Ui2PageIntro({ title, subtitle, actions }: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <section className="ui2-intro">
      <div>
        <h1>{title}</h1>
        <p className="ui2-subtitle">{subtitle}</p>
      </div>
      {actions && <div className="ui2-intro-actions">{actions}</div>}
    </section>
  )
}
