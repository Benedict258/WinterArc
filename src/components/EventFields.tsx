import { cn } from '@/lib/utils'

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type EventValue = { eventStart: string; eventEnd: string; eventDays: number[] }

export const emptyEvent: EventValue = { eventStart: '18:00', eventEnd: '19:00', eventDays: [] }

export const eventFromThread = (t: any): EventValue => ({
  eventStart: t?.eventStart || emptyEvent.eventStart,
  eventEnd: t?.eventEnd || emptyEvent.eventEnd,
  eventDays: t?.eventDays || [],
})

export const eventValid = (v: EventValue) => v.eventDays.length > 0 && !!v.eventStart && !!v.eventEnd && v.eventEnd > v.eventStart

export const describeEvent = (t: { eventStart?: string | null; eventEnd?: string | null; eventDays?: number[] }) =>
  `${(t.eventDays ?? []).slice().sort().map(d => DAY_SHORT[d]).join(', ') || 'No days set'} · ${t.eventStart ?? '--:--'}–${t.eventEnd ?? '--:--'}`

/** Day + time pickers for an event/session thread. */
export default function EventFields({ value, onChange }: { value: EventValue; onChange: (v: EventValue) => void }) {
  const toggle = (day: number) =>
    onChange({ ...value, eventDays: value.eventDays.includes(day) ? value.eventDays.filter(d => d !== day) : [...value.eventDays, day] })
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <label className="block text-sm font-medium mb-1">Repeats on</label>
        <div className="flex flex-wrap gap-1.5">
          {DAY_SHORT.map((label, day) => (
            <button
              key={label}
              type="button"
              onClick={() => toggle(day)}
              aria-pressed={value.eventDays.includes(day)}
              className={cn(
                'h-9 min-w-11 rounded-md border px-2 text-xs font-medium',
                value.eventDays.includes(day) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Starts</label>
          <input type="time" value={value.eventStart} onChange={e => onChange({ ...value, eventStart: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Ends</label>
          <input type="time" value={value.eventEnd} onChange={e => onChange({ ...value, eventEnd: e.target.value })} className="w-full px-3 py-2 border rounded-md bg-background text-sm" />
        </div>
      </div>
      {!eventValid(value) && <p className="text-xs text-muted-foreground">Pick at least one day, and an end time after the start.</p>}
    </div>
  )
}
