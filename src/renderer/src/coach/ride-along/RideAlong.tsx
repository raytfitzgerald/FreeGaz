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
import { useNow } from '../../ui/useNow'
import { avatarColors } from '../avatar'
import { useCoachTalk } from '../talk'
import { CoachToon } from '../toon/CoachToon'
import { toonFor } from '../toon/heads'
import { useRider, riderInitials } from '../../db/rider'
import { CoachHead, RiderHead } from '../heads'
import { Cyclist } from './Cyclist'

// The ride-along: you and your coach on a little road, the coach pacing at
// the target. Ease off and they ride away and shout; push and you drop them.
// Coach lines land in a speech bubble here instead of the cue banner.

const SCENE_H = 168
const BIKE_H = 104
/** Where the rider sits across the scene, and how far the coach can roam either side (fractions of the width). */
const RIDER_X = 0.32
const ROAM = 0.25
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
  // mute works while a ride is on and not yet being saved
  const riding = useRide((s) => s.active && !s.saving && s.snapshot?.state !== 'finished')
  const { ftpW } = useFtp()
  if (mode === 'off') return null
  const meta = (packById(personaId) ?? PROFESSIONAL).meta
  const setMode = (rideAlong: 'open' | 'minimized') => void patchSettings({ coach: { ...settingsStore.getState().coach, rideAlong } })

  const controls = (
    <div className="flex items-center gap-1" data-snap-hide>
      {coachOn && riding && (
        <Button size="sm" variant="ghost" onClick={toggleMute} aria-pressed={muted} title={muted ? 'Muted for this ride. Press again, or C, to unmute.' : 'Mute the coach for this ride (C)'} data-testid="ride-along-mute">
          {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          Mute coach
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
    <section className="rounded-2xl border border-line bg-panel" aria-label="Ride-along" data-testid="ride-along" data-mode={mode} data-snap>
      <div className="flex items-center justify-between gap-3 px-4 pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="eyebrow text-ink-faint">Ride-along</span>
          <GapReadout name={meta.name} ftpW={ftpW} />
        </div>
        {controls}
      </div>
      {mode === 'open' ? <Scene personaId={meta.id} name={meta.name} coachOn={coachOn} muted={muted} ftpW={ftpW} /> : <div className="h-2" />}
    </section>
  )
}

/** The gap in words, updated a few times a second from the race below (or from its own loop when folded). */
function GapReadout({ name, ftpW }: { name: string; ftpW: number }) {
  const units = useSettings((s) => s.units)
  const [label, setLabel] = useState(() => gapLabel(race.state.gapM, name, units))
  useEffect(() => {
    const id = setInterval(() => {
      advance(performance.now(), ftpW)
      setLabel(gapLabel(race.state.gapM, name, units))
    }, 500)
    return () => clearInterval(id)
  }, [name, ftpW, units])
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

function Scene({ personaId, name, coachOn, muted, ftpW }: { personaId: string; name: string; coachOn: boolean; muted: boolean; ftpW: number }) {
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

  const rider = useRider()
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
                // beside the head, where there is always room: the coach never roams past the middle of the scene
                'absolute bottom-[42%] left-[82%] line-clamp-4 w-max max-w-[min(18rem,40vw)] rounded-xl rounded-bl-sm border border-line-strong bg-panel-2 px-3 py-1.5 text-sm font-medium leading-snug shadow',
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
              label={`${name}, riding next to you`}
            />
          ) : (
            <Cyclist jersey={colors.background} cadence={coachCadence} height={BIKE_H} label={`${name}, riding next to you`} head={<CoachHead personaId={personaId} />} />
          )}
        </div>
      </div>
      <div className="absolute -bottom-1" style={{ left: `${RIDER_X * 100}%`, transform: 'translateX(-50%)' }}>
        <Cyclist
          jersey="var(--color-accent)"
          cadence={riderCadence}
          height={BIKE_H}
          label={`${rider.name ?? 'You'}, riding`}
          testId="ride-along-rider"
          head={<RiderHead photo={rider.photo} initials={riderInitials(rider.name)} />}
        />
      </div>
    </div>
  )
}

/** The coach's latest line, for a few seconds after it was said. Safety prompts stay in the cue banner. */
function useBubble(personaId: string, coachOn: boolean) {
  const line = useCoachTalk((s) => s.line)
  const speaking = useCoachTalk((s) => s.speaking)
  const words = useCoachTalk((s) => s.words)
  const now = useNow(1000)
  const current = coachOn && line && line.personaId !== null && line.priority < PRIORITY.safety ? line : null
  // an old line (from before the panel was opened, or the last ride) never comes back
  if (!current || now - current.at >= BUBBLE_MS) return null
  // lines said while the rider switched persona still show, but the jaw only moves for its owner
  return { id: current.id, text: current.text, speaking: speaking && current.personaId === personaId, words }
}
