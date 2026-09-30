import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, Send, Square, Trash2 } from 'lucide-react'
import type { AiMessage } from '@core/ai/types'
import { PROFESSIONAL, packById } from '@core/persona'
import { coachVoiceNow, streamAi, trainingContext, type StreamHandle } from '../../ai/client'
import { trimChat, type ChatMessage } from '../../ai/chat-history'
import { handoffMessage, takeHandoff, type ChatHandoff } from '../../ai/handoff'
import { PersonaAvatar } from '../../coach/PersonaAvatar'
import { db } from '../../db/db'
import { useSettings } from '../../stores/settings'
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
const DATA_PREFIX = 'My training data (JSON):\n'
const SPICE = ['gentle', 'cheeky', 'snarky', 'savage', 'feral']

/** What the rider sees for their own message. Older chats stored only the content. */
function shownText(m: ChatMessage): string {
  if (m.asked !== undefined) return m.asked
  return m.content.startsWith(DATA_PREFIX) ? (m.content.split('Question: ').pop() ?? '') : m.content
}

/** The messages as sent: the latest rider message leads with the coach's current voice settings. */
function forAi(history: readonly ChatMessage[]): AiMessage[] {
  const last = history.length - 1
  return history.map((m, i) => ({ role: m.role, content: i === last && m.role === 'user' ? `${coachVoiceNow()}\n\n${m.content}` : m.content }))
}

/** Chat with the coach about your training (local rides only), in the persona picked in Settings. */
export function CoachChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [running, setRunning] = useState<StreamHandle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  // set synchronously, so a double click (or a click while a handoff loads) can't start a second request
  const busy = useRef(false)
  const stream = useRef<StreamHandle | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const coach = useSettings((s) => s.coach)
  const persona = (packById(coach.personaId) ?? PROFESSIONAL).meta

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const ask = async (prior: readonly ChatMessage[], turn: ChatMessage) => {
    if (busy.current) return
    busy.current = true
    try {
      await askOnce(prior, turn)
    } finally {
      busy.current = false
      stream.current = null
    }
  }

  const askOnce = async (prior: readonly ChatMessage[], turn: ChatMessage) => {
    setError(null)
    // The first rider turn carries the training data; later turns keep it in history.
    const first = prior.length === 0
    const user: ChatMessage = first ? { ...turn, asked: turn.shared ? undefined : turn.content, content: `${DATA_PREFIX}${await trainingContext()}\n\n${turn.shared ? turn.content : `Question: ${turn.content}`}` } : turn
    const history = [...prior, user]
    setMessages([...history, { role: 'assistant', content: '' }])
    let acc = ''
    const h = streamAi('chat', forAi(history), (d) => {
      acc += d
      setMessages([...history, { role: 'assistant', content: acc }])
    })
    stream.current = h
    setRunning(h)
    const res = await h.done
    setRunning(null)
    if (res.error) {
      setError(res.code === 'not-configured' ? 'not-configured' : res.error)
      setMessages(history)
      return
    }
    const final = trimChat([...history, { role: 'assistant', content: res.text ?? acc }])
    setMessages(final)
    await db().kv.put({ key: KV_KEY, value: final })
    input.current?.focus()
  }

  useEffect(() => {
    let live = true
    void db()
      .kv.get(KV_KEY)
      .then((row) => {
        if (!live) return
        const stored = Array.isArray(row?.value) ? (row.value as ChatMessage[]) : []
        setMessages(stored)
        // Something handed over from another page (the Fitness overview): share it, and let the coach say it's ready.
        const h = takeHandoff()
        if (h) void ask(stored, { role: 'user', content: handoffMessage(h), shared: h })
      })
    return () => {
      live = false
      // leaving the page stops the answer, so a stale stream can't overwrite a newer chat later
      stream.current?.cancel()
    }
    // once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = (text: string) => {
    if (!text.trim() || busy.current) return
    setDraft('')
    void ask(messages, { role: 'user', content: text.trim() })
  }

  const clear = async () => {
    setMessages([])
    await db().kv.delete(KV_KEY)
  }

  const language = persona.id === PROFESSIONAL.meta.id ? 'clean' : coach.profanity
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col px-4 md:px-8 pb-6">
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
      <div className="mb-3 flex items-center gap-3 text-sm text-ink-dim" data-testid="chat-persona">
        <PersonaAvatar persona={persona} />
        <div className="min-w-0">
          <div className="font-semibold text-ink">{persona.name}</div>
          <div className="text-xs">
            {persona.id === PROFESSIONAL.meta.id ? 'Straight answers' : `Spice ${coach.spice} (${SPICE[coach.spice - 1]})`}, {language} language.{' '}
            <Link to="/settings" className="text-accent underline">
              Change the coach
            </Link>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto pb-4">
        {messages.length === 0 && (
          <div className="grid grid-cols-2 gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="rounded-xl border border-line bg-panel px-4 py-3 text-left text-sm text-ink-dim hover:border-line-strong hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            m.shared ? (
              <SharedCard key={i} shared={m.shared} />
            ) : (
              <div key={i} className="ml-auto max-w-[80%] rounded-2xl bg-panel-3 px-4 py-3 text-sm">
                {shownText(m)}
              </div>
            )
          ) : (
            <div key={i} className="flex max-w-[90%] items-start gap-2.5">
              <PersonaAvatar persona={persona} className="mt-1" />
              <div className="min-w-0 rounded-2xl border border-line bg-panel px-4 py-3">{m.content ? <Markdown text={m.content} /> : <span className="text-sm text-ink-faint">…</span>}</div>
            </div>
          ),
        )}
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
          send(draft)
        }}
      >
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Ask ${persona.name}…`}
          aria-label="Message the coach"
          className="no-drag h-11 flex-1 rounded-xl border border-line bg-panel-2 px-4 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        {running ? (
          <Button type="button" onClick={() => running.cancel()} aria-label="Stop">
            <Square className="size-4" />
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={!draft.trim()} aria-label="Send">
            <Send className="size-4" />
          </Button>
        )}
      </form>
    </div>
  )
}

/** A handed-over page (the Fitness overview), folded to its title. */
function SharedCard({ shared }: { shared: ChatHandoff }) {
  return (
    <details className="group ml-auto max-w-[80%] rounded-2xl border border-line bg-panel-2 px-4 py-2.5 text-sm" data-testid="chat-shared">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-ink-dim">
        Shared your {shared.title.toLowerCase()} with the coach
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-2 leading-relaxed text-ink">{shared.text}</p>
    </details>
  )
}
