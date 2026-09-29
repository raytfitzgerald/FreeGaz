// Keeps a connected smart fan (KICKR Headwind) in step with the rider, from
// the live frame and the fan settings. Runs on the engine tick.
import { liveQuery } from 'dexie'
import { FanController } from '@core/control/fan-controller'
import { isFanDriver } from '@core/devices/driver'
import { currentFtp, DEFAULT_FTP_W } from '../db/athlete-repo'
import { liveStore } from '../stores/live'
import { rideStore } from '../stores/ride'
import { settingsStore } from '../stores/settings'
import type { Runtime } from './composition'

export function startFanControl(rt: Pick<Runtime, 'engine' | 'devices'>): () => void {
  const fan = new FanController()
  let ftpW = DEFAULT_FTP_W
  const sub = liveQuery(() => currentFtp()).subscribe({ next: (f) => (ftpW = f?.ftpW ?? DEFAULT_FTP_W) })
  const offEvents = rt.devices.onEvent((e) => {
    if (e.role === 'fan' && (e.type === 'connected' || e.type === 'reconnected')) fan.reset()
  })
  const offTick = rt.engine.onTick((now) => {
    const driver = rt.devices.drivers('fan').find(isFanDriver)
    if (!driver) return
    const f = liveStore.getState()
    const planSpeed = rideStore.getState().plan?.speed
    const pct = fan.update(settingsStore.getState().fan, {
      now,
      hr: f.hr,
      speedKmh: planSpeed != null ? planSpeed * 3.6 : f.speedKmh,
      power3s: f.power3s,
      ftpW,
    })
    if (pct !== null) void driver.setSpeed(pct).catch(() => fan.reset())
  })
  return () => {
    offTick()
    offEvents()
    sub.unsubscribe()
  }
}
