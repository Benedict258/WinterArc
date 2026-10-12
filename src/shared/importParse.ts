// Turning files from other apps into rows WinterArc can import. Pure, so the screen previews with the same
// rules the server checks. The server never trusts these results: it validates every row again.

export type ImportRow = {
  title: string
  /** 'YYYY-MM-DD' the person plans to do it */
  date?: string | null
  /** 'YYYY-MM-DD' deadline */
  dueDate?: string | null
  status?: 'pending' | 'done'
  priority?: 'low' | 'medium' | 'high'
  intensity?: 'light' | 'medium' | 'heavy'
  /** thread name; created or matched by name on import */
  thread?: string | null
}

export type Source = 'generic' | 'todoist' | 'notion'
export type DateOrder = 'mdy' | 'dmy'

// ---------------------------------------------------------------- CSV

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, BOM; comma, semicolon or tab separated. */
export function parseCsv(input: string): string[][] {
  const text = stripBom(input)
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (c: string) => firstLine.split(c).length - 1
  const delimiter = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0]
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(cell => cell.trim() !== ''))
}

// ---------------------------------------------------------------- dates

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}
const key = (y: number, m: number, d: number) => (valid(y, m, d) && y >= 1970 && y <= 2100 ? `${y}-${pad(m)}-${pad(d)}` : null)
const FULL_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
/** 1-12 for a full month name or its usual abbreviation (Sep, Sept); 0 for anything else. */
const monthIndex = (s: string) => {
  const w = s.toLowerCase().replace(/\.$/, '')
  const full = FULL_MONTHS.indexOf(w)
  if (full >= 0) return full + 1
  return w === 'sept' ? 9 : w.length === 3 ? MONTHS.indexOf(w) + 1 : 0
}

/**
 * A day from the many ways other apps write one: 2026-10-12, 10/12/2026, 12.10.2026, October 12, 2026,
 * 12 Oct 2026, Oct 12 (this year, or next if that has passed by months). Takes the first date in a range
 * and ignores times. Anything else (including "every day") gives null.
 */
export function parseLooseDate(raw: string | null | undefined, order: DateOrder = 'mdy', today = new Date()): string | null {
  if (!raw) return null
  const s = raw.trim().split(/\s+(?:→|->|to|–|—)\s+/)[0].replace(/^"|"$/g, '')
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return key(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(s)
  if (m) {
    const a = +m[1], b = +m[2]
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    // 13+ in one slot says which is the day; otherwise follow the chosen order
    const dayFirst = a > 12 ? true : b > 12 ? false : order === 'dmy'
    return dayFirst ? key(year, b, a) : key(year, a, b)
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(s)
  if (m && monthIndex(m[1]) > 0) return withYear(monthIndex(m[1]), +m[2], m[3] ? +m[3] : null, today)
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?(?:,?\s+(\d{4}))?\b/.exec(s)
  if (m && monthIndex(m[2]) > 0) return withYear(monthIndex(m[2]), +m[1], m[3] ? +m[3] : null, today)
  return null
}

function withYear(month: number, day: number, year: number | null, today: Date) {
  if (year) return key(year, month, day)
  const y = today.getUTCFullYear()
  const thisYear = key(y, month, day)
  if (!thisYear) return null
  // "Jan 5" written in December means next January
  const gap = (Date.UTC(y, month - 1, day) - today.getTime()) / 86_400_000
  return gap < -180 ? key(y + 1, month, day) : thisYear
}

// ------------------------------------------------------- column mapping

export type Mapping = { title: number; date: number; dueDate: number; status: number; priority: number; intensity: number; thread: number }
export const NO_COLUMN = -1

const HEADERS: Record<keyof Mapping, string[]> = {
  title: ['title', 'name', 'task', 'task name', 'content', 'summary', 'subject', 'to do', 'todo'],
  date: ['scheduled', 'scheduled date', 'start date', 'start', 'do date', 'planned'],
  dueDate: ['due', 'due date', 'deadline', 'date', 'due on', 'target date'],
  status: ['status', 'done', 'completed', 'complete', 'checked', 'state'],
  priority: ['priority', 'importance'],
  intensity: ['intensity', 'effort', 'size', 'energy'],
  thread: ['thread', 'project', 'list', 'category', 'area', 'tags', 'tag', 'section', 'group'],
}

/** Best guess of which column holds what, by header name. */
export function guessMapping(headers: string[]): Mapping {
  const norm = headers.map(h => h.trim().toLowerCase())
  const find = (names: string[]) => {
    for (const n of names) { const i = norm.indexOf(n); if (i >= 0) return i }
    return NO_COLUMN
  }
  const m = {} as Mapping
  for (const k of Object.keys(HEADERS) as (keyof Mapping)[]) m[k] = find(HEADERS[k])
  // a lone "date" column is a deadline; only treat it as scheduled when an explicit due column exists elsewhere
  if (m.date === m.dueDate) m.date = NO_COLUMN
  return m
}

export function detectSource(headers: string[]): Source {
  const h = new Set(headers.map(x => x.trim().toLowerCase()))
  if (h.has('type') && h.has('content') && h.has('priority') && (h.has('indent') || h.has('date'))) return 'todoist'
  if ((h.has('name') || h.has('title')) && (h.has('status') || h.has('tags') || h.has('created time') || h.has('last edited time') || h.has('due') || h.has('due date'))) return 'notion'
  return 'generic'
}

const DONE = new Set(['done', 'complete', 'completed', 'closed', 'finished', 'yes', 'true', 'checked', 'x', '✓', '✔', '1'])
const norm = (s: string) => s.trim().toLowerCase()

export function parseStatus(raw: string | undefined): 'pending' | 'done' {
  return raw && DONE.has(norm(raw)) ? 'done' : 'pending'
}

/** High/medium/low from words (High, Urgent, P1, !!!) or numbers. Todoist's 1 is the most urgent. */
export function parsePriority(raw: string | undefined, source: Source = 'generic'): ImportRow['priority'] | undefined {
  if (!raw) return undefined
  const v = norm(raw)
  if (!v) return undefined
  if (['high', 'urgent', 'critical', 'highest', 'p1', 'p0', 'important', '!!!'].includes(v)) return 'high'
  if (['medium', 'normal', 'med', 'mid', 'p2', '!!'].includes(v)) return 'medium'
  if (['low', 'lowest', 'minor', 'p3', 'p4', '!'].includes(v)) return 'low'
  if (/^[1-4]$/.test(v)) {
    const n = Number(v)
    if (source === 'todoist') return n <= 2 ? 'high' : 'medium' // 4 is Todoist's "no priority"
    return n === 1 ? 'high' : n === 2 ? 'medium' : 'low'
  }
  return undefined
}

export function parseIntensity(raw: string | undefined): ImportRow['intensity'] | undefined {
  if (!raw) return undefined
  const v = norm(raw)
  if (['light', 'low', 'easy', 'small', 's', 'xs'].includes(v)) return 'light'
  if (['medium', 'med', 'normal', 'm'].includes(v)) return 'medium'
  if (['heavy', 'high', 'hard', 'large', 'l', 'xl'].includes(v)) return 'heavy'
  return undefined
}

export type BuildOptions = { source: Source; dateOrder: DateOrder; today?: Date; defaultThread?: string }
export type BuildResult = {
  rows: ImportRow[]
  /** rows left out, with why (blank title, section row, …) */
  skipped: number
  /** how many dates couldn't be read (recurring, free text) and were left empty */
  unreadableDates: number
}

/** Rows (header excluded) → import rows using the column mapping. */
export function buildRows(table: string[][], mapping: Mapping, opts: BuildOptions): BuildResult {
  const header = table[0] ?? []
  const typeCol = opts.source === 'todoist' ? header.findIndex(h => h.trim().toLowerCase() === 'type') : -1
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')
  const rows: ImportRow[] = []
  let skipped = 0
  let unreadableDates = 0
  for (const r of table.slice(1)) {
    if (typeCol >= 0 && norm(cell(r, typeCol)) !== 'task') { skipped++; continue }
    const title = cell(r, mapping.title).replace(/\s+/g, ' ').slice(0, 200)
    if (!title) { skipped++; continue }
    const date = (c: number) => {
      const raw = cell(r, c)
      if (!raw) return null
      const d = parseLooseDate(raw, opts.dateOrder, opts.today)
      if (!d) unreadableDates++
      return d
    }
    // Notion's multi-select/relations come as "A, B": the first is the thread
    const thread = (cell(r, mapping.thread).split(',')[0] || opts.defaultThread || '').trim().slice(0, 100)
    rows.push({
      title,
      date: date(mapping.date),
      dueDate: date(mapping.dueDate),
      status: parseStatus(cell(r, mapping.status)),
      priority: parsePriority(cell(r, mapping.priority), opts.source),
      intensity: parseIntensity(cell(r, mapping.intensity)),
      thread: thread || null,
    })
  }
  return { rows, skipped, unreadableDates }
}

// ------------------------------------------------- checklists (Notion pages, Markdown, notes)

/**
 * Tasks from pasted text or a Markdown/Notion page export: "- [ ] task", "- [x] done", "* [ ]", "1. [ ]".
 * With `plainBullets`, ordinary "- item" lines count too. With `headingsAsThreads`, the latest heading names the thread.
 */
export function parseChecklist(text: string, opts: { plainBullets?: boolean; headingsAsThreads?: boolean } = {}): BuildResult {
  const rows: ImportRow[] = []
  let skipped = 0
  let heading: string | null = null
  for (const line of stripBom(text).split(/\r?\n/)) {
    const h = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (h) { heading = h[1].replace(/[*_`]/g, '').trim().slice(0, 100); continue }
    const box = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX✓✔])\]\s+(.*\S)\s*$/.exec(line)
    const bullet = !box && opts.plainBullets ? /^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/.exec(line) : null
    if (!box && !bullet) { if (line.trim()) skipped++; continue }
    const title = (box ? box[2] : bullet![1]).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
    if (!title) { skipped++; continue }
    rows.push({ title, status: box && box[1].trim() ? 'done' : 'pending', thread: opts.headingsAsThreads ? heading : null })
  }
  return { rows, skipped, unreadableDates: 0 }
}
