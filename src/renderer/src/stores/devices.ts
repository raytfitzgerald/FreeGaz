import { createStore, useStore } from 'zustand'
import type { CaptureEntry } from '@core/devices/driver'
import type { ManagedDevice } from '@core/devices/manager'
import type { DeviceRole } from '@core/devices/types'
import type { EventMap } from '@shared/ipc/contract'

export type ChooserState = EventMap['ble.chooser']

export interface DeviceNotice {
  id: number
  role: DeviceRole
  message: string
  at: number
}

interface DevicesState {
  devices: ManagedDevice[]
  chooser: ChooserState | null
  /** Roles currently being connected (chooser open or connecting). */
  connecting: DeviceRole[]
  notices: DeviceNotice[]
  capturing: boolean
  captures: CaptureEntry[]
}

const MAX_CAPTURES = 2000

export const devicesStore = createStore<DevicesState>(() => ({
  devices: [],
  chooser: null,
  connecting: [],
  notices: [],
  capturing: false,
  captures: [],
}))

export function useDevices<T>(selector: (s: DevicesState) => T): T {
  return useStore(devicesStore, selector)
}

let noticeSeq = 0
export function pushNotice(role: DeviceRole, message: string): void {
  devicesStore.setState((s) => ({
    notices: [...s.notices.slice(-19), { id: ++noticeSeq, role, message, at: Date.now() }],
  }))
}

export function pushCapture(entry: CaptureEntry): void {
  if (!devicesStore.getState().capturing) return
  devicesStore.setState((s) => {
    const next = s.captures.length >= MAX_CAPTURES ? s.captures.slice(-MAX_CAPTURES + 1) : s.captures.slice()
    next.push(entry)
    return { captures: next }
  })
}
