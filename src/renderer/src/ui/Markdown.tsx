import type { ReactNode } from 'react'

/**
 * Tiny, safe Markdown subset for AI output: headings, bullet/numbered lists,
 * paragraphs, **bold**, *italic* and `code`. Everything is rendered as React
 * text nodes; no HTML from the model ever reaches the DOM.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length} className="leading-relaxed">{inline(para.join(' '))}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="list-decimal space-y-1 pl-5">{items}</ol>
      ) : (
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">{items}</ul>
      ),
    )
    list = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (h) {
      flushPara()
      flushList()
      blocks.push(<div key={blocks.length} className="pt-1 font-display font-semibold text-ink">{inline(h[2]!)}</div>)
    } else if (ul || ol) {
      flushPara()
      const ordered = !!ol
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push((ul ?? ol)![1]!)
    } else if (line.trim() === '') {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return <div className="space-y-2 text-sm text-ink-dim">{blocks}</div>
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={out.length} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={out.length} className="rounded bg-panel-3 px-1 text-xs">{tok.slice(1, -1)}</code>)
    else out.push(<em key={out.length}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}
