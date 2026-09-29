import { describe, expect, it } from 'vitest'
import { PRIORITY, type CoachPriority } from '@core/persona'
import { MAX_WAITING, STALE_AFTER_MS, SpeechQueue, watchdogMs, type Timers, type Utterance, type Voice } from './speech-queue'

function fakeVoice(opts: { refuse?: boolean } = {}) {
  const spoken: string[] = []
  let cancels = 0
  let onEnd: (() => void) | null = null
  const voice: Voice = {
    speak: (u, end) => {
      if (opts.refuse) return false
      spoken.push(u.text)
      onEnd = end
      return true
    },
    cancel: () => {
      cancels++
    },
  }
  return {
    voice,
    spoken,
    cancels: () => cancels,
    /** The current line finishes (or a stale end event arrives). */
    end: () => onEnd?.(),
    endWith: (fn: (() => void) | null) => fn?.(),
    lastEnd: () => onEnd,
  }
}

function fakeTimers() {
  const pending = new Map<number, () => void>()
  let id = 0
  const timers: Timers = {
    set: (fn) => {
      pending.set(++id, fn)
      return id
    },
    clear: (h) => void pending.delete(h as number),
  }
  return { timers, fire: () => [...pending.values()].forEach((f) => f()), count: () => pending.size }
}

const line = (text: string, priority: CoachPriority, at = 0): Utterance => ({ text, priority, at, personaId: 'roast-comic' })

describe('SpeechQueue', () => {
  it('speaks at once when quiet, and in turn after that', () => {
    const v = fakeVoice()
    const q = new SpeechQueue(v.voice, () => 0, fakeTimers().timers)
    q.say(line('one', PRIORITY.coaching))
    q.say(line('two', PRIORITY.coaching))
    expect(v.spoken).toEqual(['one'])
    v.end()
    expect(v.spoken).toEqual(['one', 'two'])
  })

  it('lets a more important line cut in, and ignores the cut line’s late end event', () => {
    const v = fakeVoice()
    const q = new SpeechQueue(v.voice, () => 0, fakeTimers().timers)
    q.say(line('banter', PRIORITY.banter))
    const bantersEnd = v.lastEnd()
    q.say(line('ten seconds', PRIORITY.cue))
    expect(v.cancels()).toBe(1)
    expect(v.spoken).toEqual(['banter', 'ten seconds'])
    q.say(line('coaching', PRIORITY.coaching))
    // the browser reports the cancelled banter as ended: nothing may start yet
    v.endWith(bantersEnd)
    expect(q.current?.text).toBe('ten seconds')
    expect(v.spoken).toHaveLength(2)
    v.end()
    expect(v.spoken).toEqual(['banter', 'ten seconds', 'coaching'])
  })

  it('never cuts in on an equal or more important line', () => {
    const v = fakeVoice()
    const q = new SpeechQueue(v.voice, () => 0, fakeTimers().timers)
    q.say(line('safety', PRIORITY.safety))
    q.say(line('cue', PRIORITY.cue))
    q.say(line('another safety', PRIORITY.safety))
    expect(v.cancels()).toBe(0)
    expect(q.pending.map((u) => u.text)).toEqual(['another safety', 'cue'])
  })

  it('drops lines that waited too long', () => {
    const v = fakeVoice()
    let now = 0
    const q = new SpeechQueue(v.voice, () => now, fakeTimers().timers)
    q.say(line('long speech', PRIORITY.cue, 0))
    q.say(line('ten seconds', PRIORITY.cue, 0))
    q.say(line('easy now', PRIORITY.coaching, 0))
    now = STALE_AFTER_MS[PRIORITY.cue] + 1
    v.end()
    // the countdown is history; the coaching line still stands
    expect(v.spoken).toEqual(['long speech', 'easy now'])
  })

  it('keeps only a few lines waiting, the most important ones', () => {
    const v = fakeVoice()
    const q = new SpeechQueue(v.voice, () => 0, fakeTimers().timers)
    q.say(line('speaking', PRIORITY.safety))
    for (let i = 0; i < 5; i++) q.say(line(`banter ${i}`, PRIORITY.banter, i))
    q.say(line('cue', PRIORITY.cue, 9))
    expect(q.pending.map((u) => u.text)).toEqual(['cue', 'banter 0', 'banter 1'])
    expect(q.pending).toHaveLength(MAX_WAITING)
  })

  it('moves on when a voice never reports the end', () => {
    const v = fakeVoice()
    const t = fakeTimers()
    const q = new SpeechQueue(v.voice, () => 0, t.timers)
    q.say(line('stuck', PRIORITY.coaching))
    q.say(line('next', PRIORITY.coaching))
    expect(t.count()).toBe(1)
    t.fire()
    expect(v.spoken).toEqual(['stuck', 'next'])
    expect(watchdogMs('a much longer line than that')).toBeGreaterThan(watchdogMs('short'))
  })

  it('clear() stops talking and forgets the queue', () => {
    const v = fakeVoice()
    const q = new SpeechQueue(v.voice, () => 0, fakeTimers().timers)
    q.say(line('one', PRIORITY.coaching))
    q.say(line('two', PRIORITY.coaching))
    q.clear()
    expect(v.cancels()).toBe(1)
    expect(q.current).toBeNull()
    expect(q.pending).toEqual([])
    v.end()
    expect(v.spoken).toEqual(['one'])
  })

  it('skips lines the voice cannot speak', () => {
    const v = fakeVoice({ refuse: true })
    const q = new SpeechQueue(v.voice, () => 0, fakeTimers().timers)
    q.say(line('one', PRIORITY.coaching))
    expect(q.current).toBeNull()
  })
})

describe('SpeechQueue busy signal (music ducking)', () => {
  it('reports busy once per talking spell, across back-to-back and pre-empting lines', () => {
    const ends: (() => void)[] = []
    const voice = { speak: (_u: unknown, onEnd: () => void) => (ends.push(onEnd), true), cancel: () => undefined }
    const timers = { set: () => 0, clear: () => undefined }
    const busy: boolean[] = []
    const q = new SpeechQueue(voice, () => 0, timers, (b) => busy.push(b))
    const line = (text: string, priority: number) => ({ text, priority, at: 0, personaId: 'zen' }) as Parameters<typeof q.say>[0]
    q.say(line('one', 1))
    q.say(line('two', 1)) // waits
    q.say(line('urgent', 3)) // cuts in
    expect(busy).toEqual([true])
    ends.at(-1)!() // "urgent" ends → "two" starts
    expect(busy).toEqual([true])
    ends.at(-1)!() // "two" ends, nothing waiting
    expect(busy).toEqual([true, false])
    q.say(line('three', 1))
    q.clear()
    expect(busy).toEqual([true, false, true, false])
  })
})
