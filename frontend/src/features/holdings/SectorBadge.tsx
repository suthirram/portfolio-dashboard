import type { Holding } from '../../types'
import { classificationBucket } from './classification'
import { useSectorColor } from './sectorColors'

export default function SectorBadge({ holding }: { holding: Holding }) {
  const bucket = classificationBucket(holding)
  const color = useSectorColor(bucket)
  const provider = holding.classification?.provider_sector
  return <div className="sector-badge">
    <span aria-hidden="true" className="sector-dot" style={{ background: color }} />
    {bucket.label}
    {bucket.key.startsWith('sector:') && provider && provider !== bucket.label &&
      <span className="sector-provider"> · Yahoo: {provider}</span>}
  </div>
}
