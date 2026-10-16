import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Timer } from 'lucide-react'
import { useSettings } from '@/hooks/useSettings'
import { useFocusTimer } from '@/hooks/useFocusTimer'
import { focusTimer } from '@/lib/focusTimer'
import { formatClock, normalizeFocusPrefs } from '@/shared/focus'
import { normalizeModules } from '@/shared/appearance'

let started = false

/** Starts the shared timer once, keeps it in step with the saved settings, shows the time in the tab title and a small pill on other pages. */
export default function FocusRuntime() {
  const { data: settings } = useSettings()
  const { state, remaining } = useFocusTimer()
  const { pathname } = useLocation()
  const enabled = normalizeModules(settings?.modules).focus

  useEffect(() => {
    if (!started) { started = true; focusTimer.init() }
  }, [])
  useEffect(() => { focusTimer.setPrefs(normalizeFocusPrefs(settings?.focus)) }, [JSON.stringify(settings?.focus)]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = state.status !== 'idle'
  useEffect(() => {
    const base = 'WinterArc'
    document.title = active ? `${formatClock(remaining)} · ${state.phase === 'focus' ? 'Focus' : 'Break'}` : base
    return () => { document.title = base }
  }, [active, remaining, state.phase])

  if (!enabled || !active || pathname === '/focus') return null
  return (
    <Link to="/focus" className="fixed top-3 right-3 z-30 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-mono shadow-lg hover:bg-secondary" aria-label={`Timer ${formatClock(remaining)}`}>
      <Timer size={14} className="text-primary" />
      {formatClock(remaining)}
      {state.status === 'paused' && <span className="text-xs text-muted-foreground">paused</span>}
    </Link>
  )
}
