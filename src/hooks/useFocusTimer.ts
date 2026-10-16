import { useSyncExternalStore } from 'react'
import { focusTimer } from '@/lib/focusTimer'
import { remainingMs } from '@/shared/focus'

/** The shared timer plus the milliseconds left right now (re-renders about twice a second while running). */
export function useFocusTimer() {
  useSyncExternalStore(focusTimer.subscribe, focusTimer.getVersion)
  const state = focusTimer.getState()
  return { state, prefs: focusTimer.getPrefs(), remaining: remainingMs(state, Date.now()), pending: focusTimer.pendingCount(), actions: focusTimer }
}
