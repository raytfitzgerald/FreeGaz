import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { SettingsStore } from './settings-store'

const dir = () => mkdtempSync(join(tmpdir(), 'freegaz-settings-'))

describe('SettingsStore', () => {
  it('starts from defaults when no file exists', () => {
    expect(SettingsStore.inDir(dir()).get()).toEqual(DEFAULT_SETTINGS)
  })

  it('persists patches atomically and reloads them', () => {
    const d = dir()
    const store = SettingsStore.inDir(d)
    store.patch({ rememberedDevices: [{ role: 'trainer', chooserId: 'abc', name: 'KICKR 1234', lastConnectedAt: 1 }] })
    const reloaded = SettingsStore.inDir(d).get()
    expect(reloaded.rememberedDevices[0]?.name).toBe('KICKR 1234')
    expect(JSON.parse(readFileSync(join(d, 'settings.json'), 'utf8')).version).toBe(1)
  })

  it('falls back to defaults on a corrupt file', () => {
    const d = dir()
    writeFileSync(join(d, 'settings.json'), '{not json')
    expect(SettingsStore.inDir(d).get()).toEqual(DEFAULT_SETTINGS)
  })

  it('rejects invalid patches without changing state', () => {
    const store = SettingsStore.inDir(dir())
    // @ts-expect-error invalid enum on purpose
    expect(() => store.patch({ units: 'furlongs' })).toThrow()
    expect(store.get().units).toBe('metric')
  })

  it('notifies listeners', () => {
    const store = SettingsStore.inDir(dir())
    const seen: boolean[] = []
    store.onChange((s) => seen.push(s.autoConnect))
    store.patch({ autoConnect: false })
    expect(seen).toEqual([false])
  })
})
