import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Volume2, VolumeX } from 'lucide-react'
import { MAX_GAP_M, RIDE_ALONG_START, coachPaceW, gapLabel, stepRideAlong } from '@core/coach'
import { PRIORITY, packById, PROFESSIONAL } from '@core/persona'
import { useFtp } from '../../db/use-athlete'
import { getRuntime } from '../../runtime/composition'
import { liveStore } from '../../stores/live'
import { rideStore, useRide } from '../../stores/ride'
import { patchSettings, settingsStore, useSettings } from '../../stores/settings'
import { Button } from '../../ui/Button'
import { cn } from '../../ui/cn'
import { useReducedMotion } from '../../ui/use-reduced-motion'
import { avatarColors, monogram } from '../avatar'
import { ParodyBadge } from '../ParodyBadge'
import { useCoachTalk } from '../talk'
import { CoachToon } from '../toon/CoachToon'
import { toonFor } from '../toon/heads'
import { Cyclist, MonogramHead } from './Cyclist'

// The ride-along: you and your coach on a little road, the coach pacing at
// the target. Ease off and they ride away and shout; push and you drop them.
// Coach lines land in a speech bubble here instead of the cue banner.

const SCENE_H = 190
const BIKE_H = 104
/** Where the rider sits across the scene, and how far the coach can roam either side (fractions of the width). */
const RIDER_X = 0.3
const ROAM = 0.28
const BUBBLE_MS = 9_000
const COACH_RPM = 88
const coachCadence = () => COACH_RPM
const riderCadence = () => liveStore.getState().cadence

const toggleMute = () => getRuntime().rides.command({ type: 'muteCoach' })

/** The ride-along panel for the ride screens, or the strip it folds into. Hidden when turned off in Settings. */
export function RideAlong() {
  const mode = useSettings((s) => s.coach.rideAlong)
  const coachOn = useSettings((s) => s.coach.enabled)
  const personaId = useSettings((s) => s.coach.personaId)
  const muted = useCoachTalk((s) => s.muted)
  const active = useRide((s) => s.active)
  const { ftpW } = useFtp()
  if (mode === 'off') return null
  const meta = (packById(personaId) ?? PROFESSIONAL).meta
  const setMode = (rideAlong: 'open' | 'minimized') => void patchSettings({ coach: { ...settingsStore.getState().coach, rideAlong } })

  const controls = (
    <div className="flex items-center gap-1">
      {coachOn && active && (
        <Button size="sm" variant="ghost" onClick={toggleMute} aria-pressed={muted} title="Mute the coach for this ride (C)" data-testid="ride-along-mute">
          {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          {muted ? 'Unmute coach' : 'Mute coach'}
        </Button>
      )}
      <Button
        size="iconSm"
        variant="ghost"
        onClick={() => setMode(mode === 'open' ? 'minimized' : 'open')}
        aria-label={mode === 'open' ? 'Minimize ride-along' : 'Show ride-along'}
        aria-expanded={mode === 'open'}
        data-testid="ride-along-toggle"
      >
        {mode === 'open' ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </Button>
    </div>
  )

  return (
    <section className="rounded-2xl border border-line bg-panel" aria-label="Ride-along" data-testid="ride-along" data-mode={mode}>
      <div className="flex items-center justify-between gap-3 px-4 pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="eyebrow text-ink-faint">Ride-along</span>
          {meta.parody && <ParodyBadge />}
          <GapReadout name={meta.name} ftpW={ftpW} />
        </div>
        {controls}
      </div>
      {mode === 'open' ? <Scene personaId={meta.id} name={meta.name} parody={!!meta.parody} coachOn={coachOn} muted={muted} ftpW={ftpW} /> : <div className="h-2" />}
    </section>
  )
}

/** The gap in words, updated a few times a second from the race below (or from its own loop when folded). */
function GapReadout({ name, ftpW }: { name: string; ftpW: number }) {
  const [label, setLabel] = useState(() => gapLabel(race.state.gapM, name))
  useEffect(() => {
    const id = setInterval(() => {
      advance(performance.now(), ftpW)
      setLabel(gapLabel(race.state.gapM, name))
    }, 500)
    return () => clearInterval(id)
  }, [name, ftpW])
  return (
    <span className="truncate text-sm text-ink-dim" aria-live="off" data-testid="ride-along-gap">
      {label}
    </span>
  )
}

/**
 * One race for the whole app, so folding the panel or switching ride views
 * doesn't reset who's ahead. Advanced by whichever scene is on screen, and
 * started over for every new ride.
 */
const race = { state: RIDE_ALONG_START, rideId: null as string | null, last: 0 }

function advance(now: number, ftpW: number): void {
  const ride = rideStore.getState()
  if (ride.rideId !== race.rideId) {
    race.rideId = ride.rideId
    race.state = RIDE_ALONG_START
  }
  const dt = race.last === 0 ? 0 : (now - race.last) / 1000
  race.last = now
  const f = liveStore.getState()
  const paused = ride.snapshot?.state === 'paused'
  // nobody is riding: hold still rather than let the coach ride off
  if (paused || (!ride.active && !(f.power3s ?? f.power))) return
  race.state = stepRideAlong(race.state, dt, { watts: f.power3s ?? f.power, kmh: f.speedKmh }, coachPaceW(f.trainer.targetW, ftpW))
}

function Scene({ personaId, name, parody, coachOn, muted, ftpW }: { personaId: string; name: string; parody: boolean; coachOn: boolean; muted: boolean; ftpW: number }) {
  const reduced = useReducedMotion()
  const sceneRef = useRef<HTMLDivElement>(null)
  const coachRef = useRef<HTMLDivElement>(null)
  const roadRef = useRef<HTMLDivElement>(null)
  const fenceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let timer: ReturnType<typeof setInterval> | null = null
    const draw = () => {
      advance(performance.now(), ftpW)
      const w = sceneRef.current?.clientWidth ?? 0
      const x = (race.state.gapM / MAX_GAP_M) * ROAM * w
      if (coachRef.current) coachRef.current.style.transform = `translateX(${x.toFixed(1)}px)`
      // lane markings scroll by at the rider's speed: 1 m of road is 8 px
      if (!reduced) {
        if (roadRef.current) roadRef.current.style.backgroundPositionX = `${(-(race.state.roadM * 8) % 64).toFixed(1)}px`
        // the fence is further away, so it drifts by slower
        if (fenceRef.current) fenceRef.current.style.backgroundPositionX = `${(-(race.state.roadM * 3) % 56).toFixed(1)}px`
      }
    }
    if (reduced) timer = setInterval(draw, 1000)
    else {
      const step = () => {
        draw()
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }
    return () => {
      cancelAnimationFrame(raf)
      if (timer) clearInterval(timer)
    }
  }, [ftpW, reduced])

  const toon = toonFor(personaId)
  const bubble = useBubble(personaId, coachOn)
  const colors = avatarColors(personaId)

  return (
    <div ref={sceneRef} className="relative mx-1 mb-1 overflow-hidden rounded-xl" style={{ height: SCENE_H }}>
      {/* a fence along the far verge, then two lanes of tarmac with a dashed line between */}
      <div
        ref={fenceRef}
        className="absolute inset-x-0 bottom-16 h-5 border-b border-line"
        style={{ backgroundImage: 'linear-gradient(90deg, var(--color-line-strong) 0 3px, transparent 3px 56px)', backgroundSize: '56px 100%' }}
        aria-hidden
      />
      <div
        ref={roadRef}
        className="absolute inset-x-0 bottom-0 h-16 bg-panel-3"
        style={{ backgroundImage: 'linear-gradient(90deg, var(--color-line-strong) 0 32px, transparent 32px 64px)', backgroundSize: '64px 3px', backgroundRepeat: 'repeat-x', backgroundPositionY: '55%' }}
        aria-hidden
      />
      {/* the coach in the far lane, roaming ahead or behind; the rider fixed in the near one */}
      <div ref={coachRef} className="absolute bottom-10 will-change-transform" style={{ left: `${RIDER_X * 100}%` }} data-testid="ride-along-coach">
        <div className="relative -translate-x-1/2">
          {bubble && (
            <div
              key={bubble.id}
              className={cn(
                'absolute bottom-full left-1/2 mb-1 line-clamp-3 w-max max-w-[min(20rem,55vw)] -translate-x-1/4 rounded-xl border border-line-strong bg-panel-2 px-3 py-1.5 text-sm font-medium leading-snug shadow',
                muted && 'text-ink-faint',
              )}
              role="status"
              aria-live="polite"
              data-testid="ride-along-bubble"
            >
              {bubble.text}
            </div>
          )}
          {toon ? (
            <CoachToon
              heads={toon.heads}
              setKey={personaId}
              tie={toon.tie}
              lineKey={bubble?.id ?? null}
              text={bubble?.text ?? ''}
              speaking={bubble?.speaking ?? false}
              words={bubble?.words ?? 0}
              cadence={coachCadence}
              height={BIKE_H + 14}
              label={`${name}, ${parody ? 'parody caricature, ' : ''}riding next to you`}
            />
          ) : (
            <Cyclist jersey={colors.background} cadence={coachCadence} height={BIKE_H} label={`${name}, riding next to you`} head={<MonogramHead text={monogram(name)} {...colors} />} />
          )}
        </div>
      </div>
      <div className="absolute -bottom-1" style={{ left: `${RIDER_X * 100}%`, transform: 'translateX(-50%)' }}>
        <Cyclist
          jersey="var(--color-accent)"
          cadence={riderCadence}
          height={BIKE_H}
          label="You, riding"
          testId="ride-along-rider"
          head={<MonogramHead text="You" background="var(--color-panel-2)" color="var(--color-ink)" helmet="var(--color-accent)" />}
        />
      </div>
    </div>
  )
}

/** The coach's latest line, for a few seconds. Safety prompts stay in the cue banner. */
function useBubble(personaId: string, coachOn: boolean) {
  const line = useCoachTalk((s) => s.line)
  const speaking = useCoachTalk((s) => s.speaking)
  const words = useCoachTalk((s) => s.words)
  const [expired, setExpired] = useState<number | null>(null)
  const current = coachOn && line && line.personaId !== null && line.priority < PRIORITY.safety ? line : null
  useEffect(() => {
    if (!current) return
    const id = setTimeout(() => setExpired(current.id), BUBBLE_MS)
    return () => clearTimeout(id)
  }, [current])
  if (!current || expired === current.id) return null
  // lines said while the rider switched persona still show, but the jaw only moves for its owner
  return { id: current.id, text: current.text, speaking: speaking && current.personaId === personaId, words }
}
