import { describe, it, expect } from 'vitest'
import { parseCsv, parseLooseDate, guessMapping, detectSource, buildRows, parseChecklist, parsePriority, parseStatus, NO_COLUMN } from './importParse'

const TODAY = new Date('2026-10-12T00:00:00Z')

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, embedded commas and newlines, CRLF and a BOM', () => {
    const text = '﻿name,note\r\n"Smith, J","say ""hi"""\r\n"multi\nline",x\r\n'
    expect(parseCsv(text)).toEqual([['name', 'note'], ['Smith, J', 'say "hi"'], ['multi\nline', 'x']])
  })
  it('detects semicolons and tabs, drops blank lines, keeps a last row without a newline', () => {
    expect(parseCsv('a;b\n1;2\n\n3;4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv('')).toEqual([])
  })
  it('keeps empty cells', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([['a', 'b', 'c'], ['1', '', '3']])
  })
})

describe('parseLooseDate', () => {
  const d = (s: string, o: 'mdy' | 'dmy' = 'mdy') => parseLooseDate(s, o, TODAY)
  it('reads the common formats', () => {
    expect(d('2026-10-20')).toBe('2026-10-20')
    expect(d('2026-10-20T14:30:00Z')).toBe('2026-10-20')
    expect(d('2026/1/5')).toBe('2026-01-05')
    expect(d('October 20, 2026')).toBe('2026-10-20')
    expect(d('Oct 20 2026')).toBe('2026-10-20')
    expect(d('20 Oct 2026')).toBe('2026-10-20')
    expect(d('20th October 2026')).toBe('2026-10-20')
    expect(d('Oct 20')).toBe('2026-10-20')
    expect(d('20 Oct 10:00')).toBe('2026-10-20')
  })
  it('follows the chosen order for ambiguous numeric dates, but the numbers win when they can', () => {
    expect(d('03/04/2026', 'mdy')).toBe('2026-03-04')
    expect(d('03/04/2026', 'dmy')).toBe('2026-04-03')
    expect(d('25/12/2026', 'mdy')).toBe('2026-12-25')
    expect(d('12/25/2026', 'dmy')).toBe('2026-12-25')
    expect(d('12.10.26', 'dmy')).toBe('2026-10-12')
  })
  it('takes the first date of a range', () => {
    expect(d('October 12, 2026 → October 14, 2026')).toBe('2026-10-12')
    expect(d('2026-10-12 to 2026-10-14')).toBe('2026-10-12')
  })
  it('rolls a month-day with no year to next year when it is long past', () => {
    expect(d('Jan 5')).toBe('2027-01-05')
    expect(d('Sep 30')).toBe('2026-09-30')
  })
  it('refuses nonsense', () => {
    for (const bad of ['', 'every day', 'tomorrow', '2026-13-40', '31 Feb 2026', 'Octember 5', '99/99/9999']) expect(d(bad)).toBeNull()
    expect(parseLooseDate(null)).toBeNull()
  })
})

describe('mapping and sources', () => {
  it('detects Todoist and Notion exports', () => {
    expect(detectSource(['TYPE', 'CONTENT', 'DESCRIPTION', 'PRIORITY', 'INDENT', 'AUTHOR', 'RESPONSIBLE', 'DATE', 'DATE_LANG', 'TIMEZONE'])).toBe('todoist')
    expect(detectSource(['Name', 'Status', 'Due', 'Tags'])).toBe('notion')
    expect(detectSource(['Task', 'Owner'])).toBe('generic')
  })
  it('guesses columns by header name', () => {
    const m = guessMapping(['Name', 'Status', 'Due date', 'Priority', 'Tags'])
    expect(m).toMatchObject({ title: 0, status: 1, dueDate: 2, priority: 3, thread: 4, date: NO_COLUMN, intensity: NO_COLUMN })
    expect(guessMapping(['Task', 'Date']).dueDate).toBe(1)
    expect(guessMapping(['Task', 'Date']).date).toBe(NO_COLUMN)
  })
})

describe('values', () => {
  it('statuses', () => {
    for (const v of ['Done', 'completed', 'YES', 'true', '✓', 'x']) expect(parseStatus(v)).toBe('done')
    for (const v of ['Not started', 'In progress', '', 'no', undefined]) expect(parseStatus(v)).toBe('pending')
  })
  it('priorities, including Todoist numbers', () => {
    expect(parsePriority('High')).toBe('high')
    expect(parsePriority('P1')).toBe('high')
    expect(parsePriority('low')).toBe('low')
    expect(parsePriority('1', 'todoist')).toBe('high')
    expect(parsePriority('2', 'todoist')).toBe('high')
    expect(parsePriority('4', 'todoist')).toBe('medium')
    expect(parsePriority('3')).toBe('low')
    expect(parsePriority('whatever')).toBeUndefined()
  })
})

describe('buildRows', () => {
  it('imports a Todoist export: only tasks, due dates, priorities, thread from the default', () => {
    const csv = [
      'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE',
      'section,Errands,,,,,,,,',
      'task,Buy milk,2 litres,4,1,me,,12 Nov 2026,en,UTC',
      'task,File taxes,,1,1,me,,every year,en,UTC',
      'task,,,4,1,me,,,en,UTC',
      'note,A note,,,,,,,,',
    ].join('\n')
    const table = parseCsv(csv)
    const out = buildRows(table, guessMapping(table[0]), { source: 'todoist', dateOrder: 'dmy', today: TODAY, defaultThread: 'Todoist' })
    expect(out.rows).toEqual([
      { title: 'Buy milk', date: null, dueDate: '2026-11-12', status: 'pending', priority: 'medium', intensity: undefined, thread: 'Todoist' },
      { title: 'File taxes', date: null, dueDate: null, status: 'pending', priority: 'high', intensity: undefined, thread: 'Todoist' },
    ])
    expect(out.skipped).toBe(3)
    expect(out.unreadableDates).toBe(1)
  })
  it('imports a Notion database export', () => {
    const csv = 'Name,Status,Due,Priority,Tags\nWrite spec,Done,"October 12, 2026",High,"Work, Docs"\nPlan trip,Not started,,Low,Personal\n'
    const table = parseCsv(csv)
    const out = buildRows(table, guessMapping(table[0]), { source: 'notion', dateOrder: 'mdy', today: TODAY })
    expect(out.rows[0]).toMatchObject({ title: 'Write spec', status: 'done', dueDate: '2026-10-12', priority: 'high', thread: 'Work' })
    expect(out.rows[1]).toMatchObject({ title: 'Plan trip', status: 'pending', dueDate: null, priority: 'low', thread: 'Personal' })
  })
  it('collapses whitespace and caps long titles', () => {
    const table = [['Task'], ['  a \n  b  '], ['x'.repeat(500)]]
    const out = buildRows(table, guessMapping(table[0]), { source: 'generic', dateOrder: 'mdy' })
    expect(out.rows[0].title).toBe('a b')
    expect(out.rows[1].title).toHaveLength(200)
  })
})

describe('parseChecklist', () => {
  const page = `# Work
- [ ] Draft the proposal
- [x] Send invoice
Some prose line
## Home
* [ ] Fix the **tap** with [this guide](https://x.example)
1. [X] Pay rent
- plain bullet
`
  it('reads checkboxes, with headings as threads when asked', () => {
    const out = parseChecklist(page, { headingsAsThreads: true })
    expect(out.rows).toEqual([
      { title: 'Draft the proposal', status: 'pending', thread: 'Work' },
      { title: 'Send invoice', status: 'done', thread: 'Work' },
      { title: 'Fix the tap with this guide', status: 'pending', thread: 'Home' },
      { title: 'Pay rent', status: 'done', thread: 'Home' },
    ])
    expect(out.skipped).toBe(2) // the prose line and the plain bullet
  })
  it('can take plain bullets too, and ignores headings when not wanted', () => {
    const out = parseChecklist(page, { plainBullets: true })
    expect(out.rows).toHaveLength(5)
    expect(out.rows.every(r => r.thread === null)).toBe(true)
  })
  it('copes with empty input', () => {
    expect(parseChecklist('').rows).toEqual([])
  })
})
