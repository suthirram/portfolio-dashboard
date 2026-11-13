import { useEffect, useState } from 'react'
import { api } from '../../lib/api/client'
import type { ProfileLookup } from '../../types'

export default function ProfilePreview({ symbol }: { symbol: string }) {
  const normalized = symbol.trim().toUpperCase()
  const [result, setResult] = useState<{ symbol: string; profile: ProfileLookup | null } | null>(null)
  useEffect(() => {
    let active = true
    if (!/^[A-Z0-9.\-^=_]{1,64}$/.test(normalized)) return
    const timer = setTimeout(async () => {
      let profile: ProfileLookup | null = null
      try { profile = await api.getMarketProfile(normalized) } catch { /* Saving and manual review remain available. */ }
      if (active) setResult({ symbol: normalized, profile })
    }, 350)
    return () => { active = false; clearTimeout(timer) }
  }, [normalized])
  if (!normalized) return null
  const profile = result?.symbol === normalized ? result.profile : undefined
  return <div role="status" className="profile-preview">
    {!/^[A-Z0-9.\-^=_]{1,64}$/.test(normalized) ? 'Enter a valid Yahoo symbol to preview its sector.' :
      profile === undefined ? 'Checking Yahoo sector…' :
      !profile || profile.lookup_status === 'unavailable' ? 'Yahoo sector unavailable. You can save and classify this holding manually.' :
      <>
        <div>Yahoo: {profile.sector || 'No company sector found'}</div>
        {profile.industry && <div>{profile.industry}</div>}
        {profile.suggested_type && <div>Suggested type: {profile.suggested_type.replace('_', ' ')} (confirm fund types yourself)</div>}
      </>}
  </div>
}
