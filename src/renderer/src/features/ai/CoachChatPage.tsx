import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Send, Square, Trash2 } from 'lucide-react'
import type { AiMessage } from '@core/ai/types'
import { streamAi, trainingContext, type StreamHandle } from '../../ai/client'
import { db } from '../../db/db'
import { Button } from '../../ui/Button'
import { Markdown } from '../../ui/Markdown'
import { PageHeader } from '../../ui/PageHeader'

const KV_KEY = 'coach.chat'
const SUGGESTIONS = [
  'Am I getting fitter? Be honest.',
  'What should I ride tomorrow?',
  'Give me a 45-minute workout that hurts.',
  'Why did my HR drift so much last ride?',
]

/** Chat with the coach about your training (local rides only). */
export function CoachChatPage() {
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState<StreamHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void db()
      .kv.get(KV_KEY)
      .then((row) => Array.isArray(row?.value) && setMessages(row.value as AiMessage[]))
  }, [])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const send = async (text: string) => {
    if (!text.trim() || running) return
    setError(null)
    setDraft('')
    // The first user turn carries the training context; later turns keep it in history.
    const content = messages.length === 0 ? `My training data (JSON):\n${await trainingContext()}\n\nQuestion: ${text}` : text
    const history: AiMessage[] = [...messages, { role: 'user', content }]
    setMessages([...history, { role: 'assistant', content: '' }])
    let acc = ''
    const h = streamAi('chat', history, (d) => {
      acc += d
      setMessages([...history, { role: 'assistant', content: acc }])
    })
    setRunning(h)
    const res = await h.done
    setRunning(null)
    if (res.error) {
      setError(res.code === 'not-configured' ? 'not-configured' : res.error)
      setMessages(history.slice(0, -1).concat(history.slice(-1)))
      return
    }
    const final = [...history, { role: 'assistant' as const, content: res.text ?? acc }]
    setMessages(final)
    await db().kv.put({ key: KV_KEY, value: final.slice(-40) })
  }

  const clear = async () => {
    setMessages([])
    await db().kv.delete(KV_KEY)
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col px-8 pb-6">
      <PageHeader
        title="Coach"
        subtitle="Ask about your training. Only rides recorded in FreeGaz are shared with your AI provider."
        actions={
          messages.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => void clear()}>
              <Trash2 className="size-3.5" /> New chat
            </Button>
          )
        }
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto pb-4">
        {messages.length === 0 && (
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => void send(s)} className="rounded-xl border border-line bg-panel px-4 py-3 text-left text-sm text-ink-dim hover:border-line-strong hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ml-auto max-w-[80%] rounded-2xl bg-panel-3 px-4 py-3 text-sm' : 'max-w-[90%] rounded-2xl border border-line bg-panel px-4 py-3'}>
            {m.role === 'user' ? (m.content.startsWith('My training data') ? m.content.split('Question: ').pop() : m.content) : m.content ? <Markdown text={m.content} /> : <span className="text-sm text-ink-faint">…</span>}
          </div>
        ))}
        {error === 'not-configured' && (
          <div className="text-sm text-ink-dim">
            Pick an AI provider in{' '}
            <Link to="/settings" className="text-accent underline">
              Settings → AI
            </Link>{' '}
            first.
          </div>
        )}
        {error && error !== 'not-configured' && <div className="text-sm text-bad">{error}</div>}
        <div ref={bottom} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask your coach…"
          className="no-drag h-11 flex-1 rounded-xl border border-line bg-panel-2 px-4 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        {running ? (
          <Button type="button" onClick={() => running.cancel()}>
            <Square className="size-4" />
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={!draft.trim()}>
            <Send className="size-4" />
          </Button>
        )}
      </form>
    </div>
  )
}
