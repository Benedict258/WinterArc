import { Fragment } from 'react'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let remaining = text
  let key = 0
  const patterns: { regex: RegExp; render: (m: RegExpMatchArray) => React.ReactNode }[] = [
    { regex: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/, render: (m) => <a key={`${keyPrefix}-lk-${key++}`} href={m[2]} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 break-all">{m[1]}</a> },
    { regex: /`([^`]+)`/, render: (m) => <code key={`${keyPrefix}-cd-${key++}`} className="px-1 py-0.5 rounded bg-secondary text-[0.9em] font-mono">{m[1]}</code> },
    { regex: /\*\*([^*]+)\*\*/, render: (m) => <strong key={`${keyPrefix}-b-${key++}`}>{m[1]}</strong> },
    { regex: /\*([^*]+)\*/, render: (m) => <em key={`${keyPrefix}-i-${key++}`}>{m[1]}</em> },
  ]

  while (remaining.length > 0) {
    let earliest: { index: number; len: number; node: React.ReactNode } | null = null
    for (const p of patterns) {
      const m = remaining.match(p.regex)
      if (m && m.index !== undefined && (earliest === null || m.index < earliest.index)) {
        earliest = { index: m.index, len: m[0].length, node: p.render(m) }
      }
    }
    if (earliest === null) {
      nodes.push(remaining)
      break
    }
    if (earliest.index > 0) {
      nodes.push(remaining.slice(0, earliest.index))
    }
    nodes.push(earliest.node)
    remaining = remaining.slice(earliest.index + earliest.len)
  }

  return nodes
}

export default function Markdown({ source }: { source: string }) {
  if (!source) return <p className="text-sm text-muted-foreground italic">No notes yet.</p>
  const lines = source.split('\n')
  const blocks: { type: 'h1' | 'h2' | 'p' | 'ul' | 'ol' | 'blank'; content: string; items?: string[] }[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', content: line.slice(3) })
      i++
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', content: line.slice(2) })
      i++
      continue
    }
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'ul', content: '', items })
      continue
    }
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      blocks.push({ type: 'ol', content: '', items })
      continue
    }
    const paragraph: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('#') && !lines[i].startsWith('- ') && !/^\d+\.\s/.test(lines[i])) {
      paragraph.push(lines[i])
      i++
    }
    blocks.push({ type: 'p', content: paragraph.join(' ') })
  }

  return (
    <div className="space-y-3 text-sm">
      {blocks.map((block, idx) => {
        const key = `md-${idx}`
        switch (block.type) {
          case 'h1':
            return <h1 key={key} className="text-xl font-bold tracking-tight">{renderInline(block.content, key)}</h1>
          case 'h2':
            return <h2 key={key} className="text-base font-semibold tracking-tight">{renderInline(block.content, key)}</h2>
          case 'ul':
            return (
              <ul key={key} className="list-disc pl-5 space-y-1">
                {block.items!.map((it, j) => <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>)}
              </ul>
            )
          case 'ol':
            return (
              <ol key={key} className="list-decimal pl-5 space-y-1">
                {block.items!.map((it, j) => <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>)}
              </ol>
            )
          case 'p':
          default:
            return <p key={key} className="leading-relaxed break-words">{renderInline(block.content, key)}</p>
        }
      })}
    </div>
  )
}
