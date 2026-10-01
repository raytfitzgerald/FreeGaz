// Watches the ride on screen and captures its best moments: the hardest
// effort so far, and a coach line picked at random from the whole ride.
import { useEffect } from 'react'
import { MomentPicker, HARD_WINDOW_S } from '@core/ride/moment-picker'
import { PRIORITY, packById, PROFESSIONAL } from '@core/persona'
import { coachTalkStore } from '../coach/talk'
import { liveStore } from '../stores/live'
import { rideStore } from '../stores/ride'
import { settingsStore } from '../stores/settings'
import { formatDuration } from '../ui/format'
import { composeMoment } from './compose'
import { keepMoment } from './store'

/** How long after a line appears before its bubble is on screen and worth a picture. */
const BUBBLE_SETTLE_MS = 700

const rideAlongOpen = () => document.querySelector('[data-testid="ride-along"][data-mode="open"]') !== null

export function useRideMoments(): void {
  useEffect(() => {
    if (__FREEGAZ_WEB__) return
    let picker = new MomentPicker()
    let rideId: string | null = null
    let lastS = -1
    let busy = false
    const timers = new Set<ReturnType<typeof setTimeout>>()

    const capture = (kind: 'hard' | 'coach', caption: string) => {
      const id = rideId
      if (busy || !id || !settingsStore.getState().rideSnapshots) return
      busy = true
      const title = rideStore.getState().snapshot?.name ?? 'Ride'
      void composeMoment(title, caption)
        .then((bytes) => {
          if (bytes && rideStore.getState().rideId === id) keepMoment(id, { kind, bytes, caption })
        })
        .catch(() => undefined)
        .finally(() => (busy = false))
    }

    const offRide = rideStore.subscribe((s) => {
      if (s.rideId !== rideId) {
        rideId = s.rideId
        picker = new MomentPicker()
        lastS = -1
      }
      const snap = s.snapshot
      if (!rideId || !snap || snap.state !== 'riding' || snap.movingS === lastS) return
      lastS = snap.movingS
      if (picker.onTick(snap.movingS, liveStore.getState().power3s)) {
        capture('hard', `Hardest ${HARD_WINDOW_S} s · ${picker.hardestW} W · ${formatDuration(snap.movingS)} in`)
      }
    })

    const offTalk = coachTalkStore.subscribe((s, prev) => {
      const line = s.line
      if (!line || line.id === prev.line?.id || line.personaId === null || line.priority >= PRIORITY.safety) return
      const snap = rideStore.getState().snapshot
      if (!rideId || !snap || snap.state !== 'riding' || !rideAlongOpen() || !settingsStore.getState().coach.enabled) return
      if (!picker.onCoachLine(snap.movingS, Math.random())) return
      const name = (packById(line.personaId) ?? PROFESSIONAL).meta.name
      const t = setTimeout(() => {
        timers.delete(t)
        // only while that line is still the one in the bubble
        if (coachTalkStore.getState().line?.id === line.id) capture('coach', `${name} · ${formatDuration(snap.movingS)} in`)
      }, BUBBLE_SETTLE_MS)
      timers.add(t)
    })

    return () => {
      offRide()
      offTalk()
      for (const t of timers) clearTimeout(t)
    }
  }, [])
}
