// What a bug report says about the app, gathered when the reporter opens the
// form and shown to them in full before anything leaves the Mac. No names,
// paths, keys or ride data: versions, device kinds, a few settings, and the
// last few warnings.
import type { Diagnostics } from '@core/support/bug-report'
import { bridge } from '../platform/bridge'
import { devicesStore } from '../stores/devices'
import { rideStore } from '../stores/ride'
import { settingsStore } from '../stores/settings'

export async function collectDiagnostics(): Promise<Diagnostics> {
  const [info, ai] = await Promise.all([bridge().invoke('app.info', {}), bridge().invoke('ai.status', {}).catch(() => null)])
  const s = settingsStore.getState()
  const devices = devicesStore.getState()
  const ride = rideStore.getState()
  const recent = [
    ...devices.notices.slice(-6).map((n) => `${n.role}: ${n.message}`),
    ...(ride.error ? [`ride: ${ride.error}`] : []),
  ]
  return {
    version: info.version,
    electron: info.electron,
    chrome: info.chrome,
    os: info.os,
    arch: info.arch,
    simulated: info.sim,
    // the model and protocol, not the name: names carry serial numbers
    devices: devices.devices.map((d) => `${d.role}: ${[d.info.manufacturer, d.info.model].filter(Boolean).join(' ') || 'device'} via ${d.drivers.join('+') || 'unknown'} (${d.state}${d.info.firmware ? `, firmware ${d.info.firmware}` : ''})`),
    settings: {
      Theme: s.appearance,
      Units: `${s.units}, ${s.speedUnit}, ${s.weightUnit}`,
      Coach: s.coach.enabled ? `${s.coach.personaId}, spice ${s.coach.spice}, ${s.coach.profanity}, voice ${s.coach.voice ? 'on' : 'off'}` : 'off',
      AI: ai?.provider ? `${ai.provider}${ai.configured ? '' : ' (not set up)'}` : 'off',
      Ride: ride.active ? `recording (${ride.snapshot?.state ?? 'riding'})` : 'none',
    },
    recent,
  }
}
