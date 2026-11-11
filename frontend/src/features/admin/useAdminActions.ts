import { useState } from 'react'
import { api, ApiError, type User } from '../../lib/api/client'
import { useAuth } from '../auth/AuthContext'
import { notify, toast } from '../../lib/toast'
import type { FeatureSwitch } from './AdminUserSettings'

// The admin pages' account actions, shared by Users and Admins: runAction
// asks first when there is a confirm message, calls the API, reloads the
// list and reports a failure; toggleFeature flips one per-account switch.
export function useAdminActions(reload: () => Promise<void>) {
  const { user: caller, refresh: refreshCaller } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)

  const runAction = async (id: string, action: () => Promise<unknown>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusy(id)
    try {
      await action()
      await reload()
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  // One path for the four per-account switches, shared by the table's
  // buttons and the glass settings' switches. On the caller's own account
  // the session user is refreshed, so the delta panel and the look follow
  // without a page reload.
  const toggleFeature = (listedUser: User, feature: FeatureSwitch) => {
    const enabled = !listedUser[feature.key]
    const body = { enabled }
    const calls: Record<FeatureSwitch['key'], () => Promise<unknown>> = {
      gold_enabled: () => api.adminSetUserGold(listedUser.id, body),
      premium: () => api.adminSetUserPremium(listedUser.id, body),
      delta_from_history: () => api.adminSetUserDeltaFromHistory(listedUser.id, body),
      ui_revamp: () => api.adminSetUserUiRevamp(listedUser.id, body),
    }
    return runAction(listedUser.id, async () => {
      await calls[feature.key]()
      if (listedUser.id === caller?.id && (feature.key === 'delta_from_history' || feature.key === 'ui_revamp')) await refreshCaller()
      if (feature.key === 'ui_revamp') toast(`${enabled ? 'Glass UI' : 'Current UI'} on for ${listedUser.username}`, 'success')
    }, !enabled && feature.offConfirm ? feature.offConfirm(listedUser.username) : undefined)
  }

  return { caller, busy, runAction, toggleFeature }
}
