// The handoff's asset-page stat grid (PD-059 slices 18–21): four cards, the
// first one the hero. Shared by Dividends and Gold.
import './asset.css'

export interface AssetStat {
  label: string
  value: string
  detail?: string
  tone?: 'positive' | 'negative'
}

export function AssetStats({ stats }: { stats: AssetStat[] }) {
  return (
    <div className="asset-stat-grid">
      {stats.map((stat, index) => (
        <section
          key={stat.label}
          className={index === 0 ? 'asset-stat hero' : 'asset-stat'}
          aria-label={stat.label}
        >
          <div className="eyebrow">{stat.label}</div>
          <strong className={stat.tone === 'positive' ? 'u2-positive' : stat.tone === 'negative' ? 'u2-negative' : undefined}>
            {stat.value}
          </strong>
          {stat.detail && <span className="stat-detail">{stat.detail}</span>}
        </section>
      ))}
    </div>
  )
}
