// A headless rig: simulated KICKR + HR strap, the real drivers, device
// manager, controller and engine, all on a FakeClock. Time only moves when a
// test calls advance(), so scenarios are fast and deterministic.
import { TrainerController } from '@core/control/trainer-controller'
import { defaultDriverFactory } from '@core/devices/drivers'
import { DeviceManager } from '@core/devices/manager'
import type { DeviceRole } from '@core/devices/types'
import { LiveEngine } from '@core/ride/live-engine'
import { SensorHub } from '@core/sensors/hub'
import { applyDefaultPriorities } from '@core/sensors/priorities'
import { SimWorld } from '@core/sim/world'
import { FakeClock } from '@core/time/clock'
import { EMPTY_FRAME, type LiveFrame } from '@shared/live'

const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

export function simRig(opts: { seed?: number; ftpW?: number } = {}) {
  const clock = new FakeClock(Date.UTC(2026, 8, 29, 17, 0, 0))
  const world = new SimWorld({ clock, seed: opts.seed ?? 7, ftpW: opts.ftpW ?? 250 })
  const hub = new SensorHub()
  applyDefaultPriorities(hub)
  const devices = new DeviceManager({ transport: world.transport, hub, clock, driverFactory: defaultDriverFactory })
  const controller = new TrainerController()
  const bind = () => {
    const d = devices.trainer()
    controller.bind(d ? { send: (c) => d.send(c), powerRange: d.caps.powerRange } : null)
  }
  devices.onEvent((e) => {
    if (e.role === 'trainer' && (e.type === 'connected' || e.type === 'reconnected' || e.type === 'disconnected')) bind()
  })
  let frame: LiveFrame = EMPTY_FRAME
  const engine = new LiveEngine({ clock, hub, controller, trainerConnected: () => devices.trainer() !== null, simulated: () => true, onFrame: (f) => (frame = f) })
  engine.start()

  /** Moves simulated time forward in small slices, letting promises settle in between. */
  const advance = async (ms: number, sliceMs = 50) => {
    for (let done = 0; done < ms; done += sliceMs) {
      clock.advance(Math.min(sliceMs, ms - done))
      await flush()
    }
  }
  /** Advances time until `p` settles (at most `limitMs` of simulated time). */
  const until = async <T>(p: Promise<T>, limitMs = 10_000): Promise<T> => {
    let settled = false
    void p.then(
      () => (settled = true),
      () => (settled = true),
    )
    for (let t = 0; !settled && t < limitMs; t += 10) {
      clock.advance(10)
      await flush()
    }
    return p
  }
  const connect = (role: DeviceRole) => until(devices.connect(role))
  const power = () => hub.value('power', clock.now())

  return { clock, world, hub, devices, controller, engine, advance, until, connect, power, frame: () => frame }
}
