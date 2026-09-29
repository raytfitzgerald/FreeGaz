// Composition root: builds the engine object graph exactly once, outside
// React (StrictMode double-mounts and HMR must never create a second engine
// or double Bluetooth subscriptions).
import type { BleTransport } from '@core/ble/transport'
import { TrainerController } from '@core/control/trainer-controller'
import { defaultDriverFactory } from '@core/devices/drivers'
import type { TrainerDriver } from '@core/devices/driver'
import { DeviceManager } from '@core/devices/manager'
import type { DeviceRole } from '@core/devices/types'
import { LiveEngine } from '@core/ride/live-engine'
import { SensorHub } from '@core/sensors/hub'
import { applyDefaultPriorities } from '@core/sensors/priorities'
import { SimWorld } from '@core/sim/world'
import { SystemClock, WarpClock, type Clock } from '@core/time/clock'
import type { InvokeRes } from '@shared/ipc/contract'
import { WebBluetoothTransport } from '../ble/web-bluetooth'
import { createCoachRuntime, type CoachRuntime } from '../coach/runtime'
import { bridge } from '../platform/bridge'
import { devicesStore, pushCapture, pushNotice } from '../stores/devices'
import { liveStore } from '../stores/live'
import { patchSettings, settingsStore } from '../stores/settings'
import { RideRunner } from './ride-runner'

export type AppInfo = InvokeRes<'app.info'>

export interface Runtime {
  info: AppInfo
  clock: Clock
  hub: SensorHub
  transport: BleTransport
  devices: DeviceManager
  controller: TrainerController
  engine: LiveEngine
  rides: RideRunner
  /** The live coach: lines on screen and spoken during rides. */
  coach: CoachRuntime
  sim: SimWorld | null
  connect(role: DeviceRole): Promise<void>
  disconnect(role: DeviceRole): void
  forget(role: DeviceRole): Promise<void>
  autoConnect(): Promise<void>
}

let runtime: Runtime | null = null

export function getRuntime(): Runtime {
  if (!runtime) throw new Error('Runtime not initialised')
  return runtime
}


export function initRuntime(info: AppInfo): Runtime {
  if (runtime) return runtime

  const simulated = info.sim
  // Time warp is only ever allowed while every device is simulated.
  const clock: Clock = simulated && info.warp > 1 ? new WarpClock(info.warp) : new SystemClock()
  const hub = new SensorHub()
  applyDefaultPriorities(hub)

  const sim = simulated ? new SimWorld({ clock }) : null
  const transport: BleTransport = sim ? sim.transport : new WebBluetoothTransport(bridge())

  const devices = new DeviceManager({
    transport,
    hub,
    clock,
    driverFactory: defaultDriverFactory,
    onCapture: pushCapture,
  })
  const controller = new TrainerController()

  let trainerOffControlLost: (() => void) | null = null
  const bindTrainer = () => {
    trainerOffControlLost?.()
    trainerOffControlLost = null
    const driver: TrainerDriver | null = devices.trainer()
    if (!driver) {
      controller.bind(null)
      return
    }
    controller.bind({ send: (cmd) => driver.send(cmd), powerRange: driver.caps.powerRange })
    trainerOffControlLost = driver.onControlLost(() =>
      pushNotice('trainer', 'Another app (Zwift, the Wahoo app or a head unit) took control of your trainer. Close it to continue.'),
    )
  }

  devices.subscribe((list) => devicesStore.setState({ devices: list }))
  devices.onEvent((e) => {
    if (e.role === 'trainer' && (e.type === 'connected' || e.type === 'reconnected' || e.type === 'disconnected')) bindTrainer()
    if (e.type === 'warning') pushNotice(e.role, e.message)
    if (e.type === 'disconnected') pushNotice(e.role, 'Connection lost. Reconnecting…')
    if (e.type === 'reconnected') pushNotice(e.role, 'Reconnected.')
  })

  let rides: RideRunner | null = null
  const engine = new LiveEngine({
    clock,
    hub,
    controller,
    trainerConnected: () => devices.trainer() !== null,
    simulated: () => simulated,
    powerMatch: () => settingsStore.getState().trainer.powerMatch,
    onFrame: (frame) => {
      liveStore.setState(frame, true)
      rides?.publish(frame)
    },
  })
  rides = new RideRunner({ clock, hub, controller, engine, simulated })
  // The coach follows every ride. Automated test runs never make the Mac talk.
  const coach = createCoachRuntime({ rides, engine, clock, hub, controller }, { speak: !info.isTest })
  coach.start()
  engine.start()
  void rides.loadRecoveries()

  // Trainer feel settings drive the controller.
  const applyTrainerPrefs = () => {
    const t = settingsStore.getState().trainer
    controller.updateSettings({
      ergSoftStartS: t.ergSoftStartS,
      spiralGuard: { ...controller.currentSettings.spiralGuard, enabled: t.spiralGuard },
      slope: { uphillPct: t.uphillPct, downhillPct: t.downhillPct, limitPct: t.gradeLimitPct },
      sim: { ...controller.currentSettings.sim, crr: t.crr, cwKgPerM: 0.5 * 1.225 * t.cda },
    })
  }
  applyTrainerPrefs()
  settingsStore.subscribe(applyTrainerPrefs)

  bridge().on('ble.chooser', (state) => devicesStore.setState({ chooser: state.open ? state : null }))

  const connect = async (role: DeviceRole) => {
    devicesStore.setState((s) => ({ connecting: [...new Set([...s.connecting, role])] }))
    try {
      const remembered = settingsStore.getState().rememberedDevices.find((d) => d.role === role)
      const dev = await devices.connect(role, { preferredChooserId: remembered?.chooserId })
      if (!simulated) {
        const others = settingsStore.getState().rememberedDevices.filter((d) => d.role !== role)
        await patchSettings({
          rememberedDevices: [...others, { role, chooserId: dev.chooserId, name: dev.name, lastConnectedAt: Date.now() }],
        })
      }
    } finally {
      devicesStore.setState((s) => ({ connecting: s.connecting.filter((r) => r !== role) }))
    }
  }

  runtime = {
    info,
    clock,
    hub,
    transport,
    devices,
    controller,
    engine,
    rides,
    coach,
    sim,
    connect,
    disconnect: (role) => devices.disconnect(role),
    forget: async (role) => {
      devices.disconnect(role)
      await patchSettings({ rememberedDevices: settingsStore.getState().rememberedDevices.filter((d) => d.role !== role) })
    },
    autoConnect: async () => {
      const roles: DeviceRole[] = simulated
        ? ['trainer', 'hr']
        : settingsStore.getState().rememberedDevices.map((d) => d.role)
      // One requestDevice at a time: Chromium allows a single pending chooser.
      for (const role of roles) {
        if (devices.get(role)?.state === 'connected') continue
        try {
          await connect(role)
        } catch (e) {
          pushNotice(role, `Auto-connect failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    },
  }

  // Launch auto-connect: main runs this hook with a user gesture.
  ;(window as unknown as { __freegazAutoConnect?: () => Promise<void> }).__freegazAutoConnect = runtime.autoConnect
  // E2E hook: only when launched by the test suite (FREEGAZ_TEST=1).
  if (info.isTest) (window as unknown as { __freegazTest?: unknown }).__freegazTest = { runtime }

  return runtime
}

/** Kicks off launch auto-connect for remembered devices (or the simulator). */
export async function startAutoConnect(rt: Runtime): Promise<void> {
  if (rt.sim) {
    await rt.autoConnect()
    return
  }
  const s = settingsStore.getState()
  if (!s.autoConnect || s.rememberedDevices.length === 0) return
  await bridge().invoke('ble.requestAutoConnect', {})
}

if (import.meta.hot) {
  // Never hot-swap the engine (it would duplicate BLE subscriptions and clocks):
  // any change to the composition root reloads the whole page instead.
  import.meta.hot.accept(() => window.location.reload())
}
