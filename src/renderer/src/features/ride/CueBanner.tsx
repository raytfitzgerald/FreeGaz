import { useEffect, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { PRIORITY, packById } from '@core/persona'
import { ParodyBadge } from '../../coach/ParodyBadge'
import { useCoachTalk, type TalkLine } from '../../coach/talk'
import { CoachToon } from '../../coach/toon/CoachToon'
import { toonFor } from '../../coach/toon/heads'
import { LEAVE_MS } from '../../coach/toon/motion'
import { liveStore } from '../../stores/live'
import { useRide } from '../../stores/ride'
import { useSettings } from '../../stores/settings'
import { cn } from '../../ui/cn'

const SHOW_MS = 10_000
const riderCadence = () => liveStore.getState().cadence

/** The latest workout cue or coach line, shown for ~10 s. A persona with a caricature says its own lines. */
export function CueBanner() {
  const cue = useRide((s) => s.cue)
  const coach = useRide((s) => s.snapshot?.coachLine ?? null)
  const talk = useCoachTalk((s) => s.line)
  // the open ride-along says the coach's own lines in a bubble; the banner keeps cues, notices and safety
  const alongside = useSettings((s) => s.coach.rideAlong === 'open' && s.coach.enabled)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const showCue = cue !== null && now - cue.at < SHOW_MS
  const inBubble = alongside && !showCue && coach !== null && talk?.text === coach && talk.personaId !== null && talk.priority < PRIORITY.safety
  const text = showCue ? cue.text : inBubble ? null : coach
  // safety prompts stay plain, whoever's pack they came from
  const toonLine = !showCue && !inBubble && coach !== null && talk?.text === coach && talk.priority < PRIORITY.safety && toonFor(talk.personaId) ? talk : null
  const stage = useToonStage(toonLine, text !== null)
  if (stage.line) return <ToonBanner line={stage.line} leaving={stage.leaving} />
  if (!text) return null
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 px-5 py-3 text-base font-medium" role="status" aria-live="polite" data-testid="cue">
      <MessageSquareText className="size-5 shrink-0 text-accent" /> {text}
    </div>
  )
}

/**
 * The caricature's line, kept on stage for a moment after it's over so the
 * toon can ride off. Anything else waiting to be shown (a workout cue) goes on
 * straight away instead.
 */
function useToonStage(line: TalkLine | null, otherText: boolean): { line: TalkLine | null; leaving: boolean } {
  const [shown, setShown] = useState<TalkLine | null>(line)
  const [prev, setPrev] = useState<TalkLine | null>(line)
  if (line !== prev) {
    setPrev(line)
    if (line) setShown(line)
  }
  // something else takes the banner: no ride-off, and nothing left to ride off later
  if (line === null && otherText && shown !== null) setShown(null)
  const leaving = line === null && shown !== null && !otherText
  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => setShown(null), LEAVE_MS)
    return () => clearTimeout(id)
  }, [leaving])
  return { line: line ?? (leaving ? shown : null), leaving }
}

function ToonBanner({ line, leaving }: { line: TalkLine; leaving: boolean }) {
  const speaking = useCoachTalk((s) => s.speaking)
  const words = useCoachTalk((s) => s.words)
  const toon = toonFor(line.personaId)
  if (!toon || !line.personaId) return null
  const meta = packById(line.personaId)?.meta
  const name = meta?.name ?? 'Coach'
  return (
    <div
      className={cn('flex items-center gap-3 overflow-x-clip rounded-2xl border border-accent/40 bg-accent/10 py-1.5 pl-3 pr-5 transition-opacity duration-500', leaving && 'opacity-0')}
      role="status"
      aria-live="polite"
      data-testid="cue"
    >
      <CoachToon
        heads={toon.heads}
        setKey={line.personaId}
        tie={toon.tie}
        lineKey={line.id}
        text={line.text}
        speaking={speaking}
        words={words}
        enter
        leaving={leaving}
        cadence={riderCadence}
        height={76}
        label={`${name}, ${meta?.parody ? 'parody caricature, ' : ''}riding a bike`}
      />
      <p className="min-w-0 text-base font-medium">
        {meta?.parody && <ParodyBadge className="mr-2 align-[2px]" />}
        {line.text}
      </p>
    </div>
  )
}
