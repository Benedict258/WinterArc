import { useState } from 'react'

// Small, dependency-free charts that follow the theme. One measure per chart, thin marks, quiet grid,
// a readout line for hover/focus/tap, and a hidden table so screen readers get the numbers.

export type Datum = { key: string; label: string; value: number }

function DataTable({ caption, data, format }: { caption: string; data: Datum[]; format: (v: number) => string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>{data.map(d => <tr key={d.key}><th scope="row">{d.label}</th><td>{format(d.value)}</td></tr>)}</tbody>
    </table>
  )
}

export function BarChart({ data, caption, goal, format = v => String(v), height = 96, tickEvery = 7 }: {
  data: Datum[]; caption: string; goal?: number; format?: (v: number) => string; height?: number; tickEvery?: number
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, goal ?? 0, ...data.map(d => d.value))
  const shown = active !== null ? data[active] : null
  return (
    <figure className="space-y-1" aria-label={caption}>
      <div className="relative flex items-end gap-px" style={{ height }} onMouseLeave={() => setActive(null)}>
        {goal ? <div className="absolute inset-x-0 border-t border-dashed border-muted-foreground/50 pointer-events-none" style={{ bottom: `${(goal / max) * 100}%` }} aria-hidden="true" /> : null}
        {data.map((d, i) => (
          <button key={d.key} type="button" className="relative flex-1 h-full flex items-end focus:outline-none group" aria-label={`${d.label}: ${format(d.value)}`}
            onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)} onClick={() => setActive(i)}>
            <span className={`w-full rounded-t-sm transition-colors ${d.value >= (goal ?? Infinity) ? 'bg-primary' : 'bg-primary/55'} group-hover:bg-primary group-focus-visible:ring-2 ring-ring`}
              style={{ height: `${Math.max(d.value ? 3 : 1, (d.value / max) * 100)}%`, opacity: d.value ? 1 : 0.25 }} />
          </button>
        ))}
      </div>
      <figcaption className="flex justify-between text-[11px] text-muted-foreground min-h-4">
        <span>{data.length ? data[0].label : ''}</span>
        <span className="text-foreground" aria-live="polite">{shown ? `${shown.label} · ${format(shown.value)}` : tickEvery ? '' : ''}</span>
        <span>{data.length ? data[data.length - 1].label : ''}</span>
      </figcaption>
      <DataTable caption={caption} data={data} format={format} />
    </figure>
  )
}

export function LineChart({ data, caption, format = v => String(v), height = 120, unit = '' }: {
  data: Datum[]; caption: string; format?: (v: number) => string; height?: number; unit?: string
}) {
  const [active, setActive] = useState<number | null>(null)
  if (data.length === 0) return null
  const W = 300
  const H = height
  const pad = 8
  const values = data.map(d => d.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const lower = lo - span * 0.15
  const upper = hi + span * 0.15
  const x = (i: number) => (data.length === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (data.length - 1))
  const y = (v: number) => H - pad - ((v - lower) / (upper - lower)) * (H - pad * 2)
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const shown = active !== null ? data[active] : data[data.length - 1]

  const onMove = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect()
    const rel = ((clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - rel) < Math.abs(x(best) - rel)) best = i
    setActive(best)
  }
  return (
    <figure className="space-y-1" aria-label={caption}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y" style={{ height }} role="img" aria-label={caption}
        onMouseMove={e => onMove(e.clientX, e.currentTarget)} onMouseLeave={() => setActive(null)} onTouchStart={e => onMove(e.touches[0].clientX, e.currentTarget)}>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={pad} x2={W - pad} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} className="stroke-border" strokeWidth="1" />)}
        <path d={path} fill="none" className="stroke-primary" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.length <= 40 && data.map((d, i) => <circle key={d.key} cx={x(i)} cy={y(d.value)} r={active === i ? 4.5 : 2.5} className="fill-primary" stroke="hsl(var(--background))" strokeWidth="2" />)}
        {active !== null && <line x1={x(active)} x2={x(active)} y1={pad} y2={H - pad} className="stroke-muted-foreground/50" strokeWidth="1" strokeDasharray="3 3" />}
      </svg>
      <figcaption className="flex justify-between text-[11px] text-muted-foreground">
        <span>{data[0].label}</span>
        <span className="text-foreground" aria-live="polite">{shown.label} · {format(shown.value)}{unit}</span>
        <span>{data[data.length - 1].label}</span>
      </figcaption>
      <DataTable caption={caption} data={data} format={format} />
    </figure>
  )
}

/** A ring showing progress toward a goal (steps today, workouts this week). */
export function Ring({ value, goal, size = 96, label, sub }: { value: number; goal: number; size?: number; label: string; sub: string }) {
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const f = Math.min(1, goal > 0 ? value / goal : 0)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${sub}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-secondary" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-primary" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)} style={{ transition: 'stroke-dashoffset .4s' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        <span className="text-lg font-bold tabular-nums">{label}</span>
        <span className="text-[10px] text-muted-foreground">{sub}</span>
      </div>
    </div>
  )
}
