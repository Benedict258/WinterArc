// Per-user look and feel and which modules are on. Shared by the server (validation) and the screens.

export type Mode = 'dark' | 'light' | 'system'
export type Density = 'comfortable' | 'compact'
export const MODULE_IDS = ['wishlist', 'goals', 'drop', 'events', 'ai', 'partners', 'focus', 'routines', 'habits', 'fitness', 'nutrition'] as const
export type ModuleId = (typeof MODULE_IDS)[number]

export type Accent = { id: string; label: string; /** 'H S% L%' for the --primary variable */ hsl: string; /** text on top of it */ foreground: string }

export const ACCENTS: Accent[] = [
  { id: 'lime', label: 'Lime', hsl: '72 98% 74%', foreground: '0 0% 0%' },
  { id: 'sky', label: 'Sky', hsl: '199 89% 60%', foreground: '0 0% 0%' },
  { id: 'violet', label: 'Violet', hsl: '262 83% 68%', foreground: '0 0% 100%' },
  { id: 'rose', label: 'Rose', hsl: '347 85% 62%', foreground: '0 0% 100%' },
  { id: 'amber', label: 'Amber', hsl: '38 95% 58%', foreground: '0 0% 0%' },
  { id: 'emerald', label: 'Emerald', hsl: '152 65% 48%', foreground: '0 0% 0%' },
  { id: 'orange', label: 'Orange', hsl: '22 95% 58%', foreground: '0 0% 0%' },
  { id: 'teal', label: 'Teal', hsl: '175 70% 45%', foreground: '0 0% 0%' },
]

export type Appearance = { mode: Mode; accent: string; density: Density }
export const DEFAULT_APPEARANCE: Appearance = { mode: 'dark', accent: 'lime', density: 'comfortable' }

export const MODULES: { id: ModuleId; label: string; blurb: string }[] = [
  { id: 'wishlist', label: 'Wishlist', blurb: 'Things you want to get or do someday' },
  { id: 'goals', label: 'Goals & analytics', blurb: 'Goals, streaks and progress charts' },
  { id: 'drop', label: 'Drop', blurb: 'Files, links and notes you want to move between devices' },
  { id: 'events', label: 'Events & sessions', blurb: 'Fixed-time sessions on threads and one-off events' },
  { id: 'partners', label: 'Partners', blurb: 'Share your progress with accountability partners you choose' },
  { id: 'ai', label: 'AI assistant', blurb: 'Chat about your plan; it suggests changes and you approve each one' },
  { id: 'focus', label: 'Focus timer', blurb: 'Pomodoro sessions for work and study, with a history of your focus time' },
  { id: 'routines', label: 'Routines', blurb: 'Reusable morning, study or evening routines you can add to any day' },
]
export type Modules = Record<ModuleId, boolean>
export const DEFAULT_MODULES = Object.fromEntries(MODULE_IDS.map(id => [id, true])) as Modules

export const accentById = (id: string | undefined) => ACCENTS.find(a => a.id === id) ?? ACCENTS[0]

export function normalizeAppearance(raw: Partial<Appearance> | null | undefined): Appearance {
  return {
    mode: raw?.mode === 'light' || raw?.mode === 'system' ? raw.mode : 'dark',
    accent: accentById(raw?.accent).id,
    density: raw?.density === 'compact' ? 'compact' : 'comfortable',
  }
}

export function normalizeModules(raw: Partial<Modules> | null | undefined): Modules {
  return Object.fromEntries(MODULE_IDS.map(id => [id, raw?.[id] !== false])) as Modules
}
