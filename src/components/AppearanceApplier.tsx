import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useSettings } from '@/hooks/useSettings'
import { accentById, normalizeAppearance } from '@/shared/appearance'

export const LOOK_KEY = 'winterarc.look'

/** Applies the signed-in user's accent, density and light/dark choice. Renders nothing. */
export default function AppearanceApplier() {
  const { data: settings } = useSettings()
  const { setTheme } = useTheme()
  const look = normalizeAppearance(settings?.appearance)
  const loaded = !!settings

  useEffect(() => {
    if (!loaded) return
    const accent = accentById(look.accent)
    const root = document.documentElement
    root.style.setProperty('--primary', accent.hsl)
    root.style.setProperty('--ring', accent.hsl)
    root.style.setProperty('--primary-foreground', accent.foreground)
    root.dataset.density = look.density
    setTheme(look.mode)
    // read again before first paint next time (see index.html)
    try { localStorage.setItem(LOOK_KEY, JSON.stringify({ hsl: accent.hsl, fg: accent.foreground, density: look.density })) } catch { /* storage unavailable */ }
  }, [loaded, look.accent, look.density, look.mode, setTheme])

  return null
}
