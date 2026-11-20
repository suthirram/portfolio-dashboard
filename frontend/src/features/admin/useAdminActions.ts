import { useState } from 'react'
import { api, ApiError, type User } from '../../lib/api/client'
import { useAuth } from '../auth/AuthContext'
import { notify, toast } from '../../lib/toast'
import { UI_MODE_LABELS, type UiMode } from '../../lib/uiMode'
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

  // One path for the per-account switches, shared by the table's buttons and
  // the glass settings' switches. On the caller's own account the session
  // user is refreshed, so the delta panel follows without a page reload.
  // confirmed skips the browser prompt when the caller already asked in its
  // own dialog (UI_2.0).
  const toggleFeature = (listedUser: User, feature: FeatureSwitch, confirmed = false) => {
    const enabled = !listedUser[feature.key]
    const body = { enabled }
    const calls: Record<FeatureSwitch['key'], () => Promise<unknown>> = {
      gold_enabled: () => api.adminSetUserGold(listedUser.id, body),
      premium: () => api.adminSetUserPremium(listedUser.id, body),
      delta_from_history: () => api.adminSetUserDeltaFromHistory(listedUser.id, body),
    }
    return runAction(listedUser.id, async () => {
      await calls[feature.key]()
      if (listedUser.id === caller?.id && feature.key === 'delta_from_history') await refreshCaller()
    }, !confirmed && !enabled && feature.offConfirm ? feature.offConfirm(listedUser.username) : undefined)
  }

  // setUiMode sets the account's interface (PD-059). On the caller's own
  // account the session is refreshed, so the look follows at once.
  const setUiMode = (listedUser: User, mode: UiMode) =>
    runAction(listedUser.id, async () => {
      await api.adminSetUserUiMode(listedUser.id, { mode })
      if (listedUser.id === caller?.id) await refreshCaller()
      toast(`${UI_MODE_LABELS[mode]} on for ${listedUser.username}`, 'success')
    })

  return { caller, busy, runAction, toggleFeature, setUiMode }
}
