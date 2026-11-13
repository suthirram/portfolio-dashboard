import { useEffect, useState } from 'react'
import { api } from '../../lib/api/client'
import type { ProfileLookup } from '../../types'

const PROFILE_SYMBOL = /^[A-Z0-9.\-^=_]{1,64}$/

/** Canonical form the preview compares symbols in (trimmed, upper-case). */
export const previewSymbolKey = (symbol: string) => symbol.trim().toUpperCase()

/**
 * Yahoo sector preview for a committed symbol. The form commits the symbol on
 * blur or Test, never per keystroke, so partial tickers (T, TC, TCS.) never
 * reach Yahoo and its rate limit. A late response for an earlier symbol is
 * ignored.
 */
export default function ProfilePreview({ symbol }: { symbol: string }) {
  const normalized = previewSymbolKey(symbol)
  const valid = PROFILE_SYMBOL.test(normalized)
  const [result, setResult] = useState<{ symbol: string; profile: ProfileLookup | null } | null>(null)
  useEffect(() => {
    if (!valid) return
    let active = true
    api.getMarketProfile(normalized)
      .catch(() => null) // Saving and manual review remain available.
      .then(profile => { if (active) setResult({ symbol: normalized, profile }) })
    return () => { active = false }
  }, [normalized, valid])
  if (!normalized) return null
  const profile = result?.symbol === normalized ? result.profile : undefined
  return <div role="status" className="profile-preview">
    {!valid ? 'Enter a valid Yahoo symbol to preview its sector.' :
      profile === undefined ? 'Checking Yahoo sector…' :
      !profile || profile.lookup_status === 'unavailable' ? 'Yahoo sector unavailable. You can save and classify this holding manually.' :
      <>
        <div>Yahoo: {profile.sector || 'No company sector found'}</div>
        {profile.industry && <div>{profile.industry}</div>}
        {profile.suggested_type && <div>Suggested type: {profile.suggested_type.replace('_', ' ')} (confirm fund types yourself)</div>}
      </>}
  </div>
}
