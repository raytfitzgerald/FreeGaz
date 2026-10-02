import { beforeEach, describe, expect, it, vi } from 'vitest'

const ble = vi.hoisted(() => ({
  initialize: vi.fn(async () => undefined),
  isEnabled: vi.fn(async () => true),
  getDevices: vi.fn(async (_ids: string[]) => [] as { deviceId: string; name?: string }[]),
  requestDevice: vi.fn(async (_o: unknown) => ({ deviceId: 'KICKR-1', name: 'KICKR CORE 1234' })),
  connect: vi.fn(async (_id: string, _onDrop?: (id: string) => void) => undefined),
  disconnect: vi.fn(async (_id: string) => undefined),
  getServices: vi.fn(async (_id: string) => [{ uuid: '00001826-0000-1000-8000-00805f9b34fb', characteristics: [{ uuid: '00002ad9-0000-1000-8000-00805f9b34fb' }] }]),
  read: vi.fn(async () => new DataView(new Uint8Array([1]).buffer)),
  write: vi.fn(async () => undefined),
  writeWithoutResponse: vi.fn(async () => undefined),
  startNotifications: vi.fn(async (_d: string, _s: string, _c: string, _cb: (v: DataView) => void) => undefined),
  stopNotifications: vi.fn(async () => undefined),
}))
vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: ble }))

const { NativeBleTransport, mapError } = await import('./native-bluetooth')
const FTMS = '00001826-0000-1000-8000-00805f9b34fb'
const CONTROL = '00002ad9-0000-1000-8000-00805f9b34fb'
const req = { role: 'trainer' as const, filterServices: ['1826'], optionalServices: ['1826', '180a'] }

describe('NativeBleTransport (the iPhone app)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks iOS for devices advertising the role’s services, as full 128-bit UUIDs', async () => {
    const p = await new NativeBleTransport().acquire(req)
    expect(p.name).toBe('KICKR CORE 1234')
    expect(p.chooserId).toBe('KICKR-1')
    expect(ble.requestDevice).toHaveBeenCalledWith({ services: [FTMS], optionalServices: [FTMS, '0000180a-0000-1000-8000-00805f9b34fb'] })
  })

  it('reconnects a remembered device without showing the list', async () => {
    ble.getDevices.mockResolvedValueOnce([{ deviceId: 'KICKR-1', name: 'KICKR CORE 1234' }])
    const p = await new NativeBleTransport().acquire({ ...req, preferredChooserId: 'KICKR-1' })
    expect(p.id).toBe('KICKR-1')
    expect(ble.requestDevice).not.toHaveBeenCalled()
  })

  it('connects, discovers, writes and subscribes through the plugin', async () => {
    const p = await new NativeBleTransport().acquire(req)
    const gatt = await p.connect()
    expect(p.connected).toBe(true)
    expect(await gatt.services()).toEqual([FTMS])
    expect(await gatt.characteristics('1826')).toEqual([CONTROL])
    await gatt.write(FTMS, CONTROL, Uint8Array.from([0x00]))
    expect(ble.write).toHaveBeenCalledWith('KICKR-1', FTMS, CONTROL, expect.any(DataView))
    await gatt.write(FTMS, CONTROL, Uint8Array.from([0x05, 0xc8, 0x00]), { withResponse: false })
    expect(ble.writeWithoutResponse).toHaveBeenCalledTimes(1)
    const seen: number[] = []
    const off = await gatt.subscribe(FTMS, CONTROL, (v) => seen.push(v.getUint8(0)))
    ble.startNotifications.mock.calls[0]![3](new DataView(new Uint8Array([7]).buffer))
    expect(seen).toEqual([7])
    await off()
    expect(ble.stopNotifications).toHaveBeenCalledWith('KICKR-1', FTMS, CONTROL)
  })

  it('tells the app when the link drops, but not when it hung up itself', async () => {
    const p = await new NativeBleTransport().acquire(req)
    await p.connect()
    const dropped = vi.fn()
    p.onDisconnect(dropped)
    const onDrop = ble.connect.mock.calls[0]![1]!
    onDrop('KICKR-1')
    expect(dropped).toHaveBeenCalledTimes(1)
    expect(p.connected).toBe(false)
    await p.connect()
    p.disconnect()
    ble.connect.mock.calls[1]![1]!('KICKR-1')
    expect(dropped).toHaveBeenCalledTimes(1)
  })

  it('maps iOS’s errors to the ones the app handles', () => {
    expect(mapError(new Error('requestDevice cancelled.')).code).toBe('cancelled')
    expect(mapError(new Error('Bluetooth not enabled.')).code).toBe('unavailable')
    expect(mapError(new Error('Connection timeout')).code).toBe('timeout')
    expect(mapError(new Error('Not connected to device.')).code).toBe('disconnected')
    expect(mapError(new Error('Characteristic not found.')).code).toBe('not-found')
  })
})
