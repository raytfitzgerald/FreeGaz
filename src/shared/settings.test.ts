import { describe, expect, it } from 'vitest'
import { AppSettingsPatchSchema, AppSettingsSchema, DEFAULT_SETTINGS, mergeSettings, migrateStoredSettings } from './settings'

describe('AppSettingsPatchSchema', () => {
  it('keeps absent keys absent, so a patch never resets other settings', () => {
    expect(AppSettingsPatchSchema.parse({ coach: DEFAULT_SETTINGS.coach })).toEqual({ coach: DEFAULT_SETTINGS.coach })
    expect(AppSettingsPatchSchema.parse({})).toEqual({})
  })

  it('a coach patch over IPC leaves the theme and units alone', () => {
    const current = AppSettingsSchema.parse({ appearance: 'light', units: 'imperial' })
    const patch = AppSettingsPatchSchema.parse({ coach: { ...current.coach, spice: 5 } })
    const next = AppSettingsSchema.parse({ ...current, ...patch })
    expect(next.appearance).toBe('light')
    expect(next.units).toBe('imperial')
    expect(next.coach.spice).toBe(5)
  })

  it('still validates what is present', () => {
    expect(AppSettingsPatchSchema.safeParse({ appearance: 'sepia' }).success).toBe(false)
    expect(AppSettingsPatchSchema.safeParse({ version: 1 }).data).toEqual({})
  })
})

describe('CoachPrefsSchema profanity', () => {
  it('reads the old boolean setting as Clean or Unhinged', () => {
    expect(AppSettingsSchema.parse({ coach: { profanity: true } }).coach.profanity).toBe('unhinged')
    expect(AppSettingsSchema.parse({ coach: { profanity: false } }).coach.profanity).toBe('clean')
    expect(AppSettingsSchema.parse({ coach: { profanity: 'mild' } }).coach.profanity).toBe('mild')
    expect(DEFAULT_SETTINGS.coach.profanity).toBe('clean')
  })
})

describe('speed and weight units', () => {
  it('new installs get km/h and kg', () => {
    expect(DEFAULT_SETTINGS.speedUnit).toBe('kmh')
    expect(DEFAULT_SETTINGS.weightUnit).toBe('kg')
  })

  it('an older imperial settings file keeps mph and lb', () => {
    const next = AppSettingsSchema.parse(migrateStoredSettings({ units: 'imperial' }))
    expect(next.speedUnit).toBe('mph')
    expect(next.weightUnit).toBe('lb')
    expect(AppSettingsSchema.parse(migrateStoredSettings({ units: 'metric' })).speedUnit).toBe('kmh')
  })

  it('an explicit choice survives migration and a units-only patch', () => {
    const current = AppSettingsSchema.parse(migrateStoredSettings({ units: 'imperial', weightUnit: 'kg' }))
    expect(current.weightUnit).toBe('kg')
    expect(current.speedUnit).toBe('mph')
    const patch = AppSettingsPatchSchema.parse({ units: 'metric' })
    expect(patch).toEqual({ units: 'metric' })
    expect(AppSettingsSchema.parse({ ...current, ...patch }).speedUnit).toBe('mph')
  })

  it('leaves non-objects for the schema to reject', () => {
    expect(migrateStoredSettings(null)).toBeNull()
    expect(migrateStoredSettings([1])).toEqual([1])
  })
})

describe('mergeSettings', () => {
  const current = AppSettingsSchema.parse({ units: 'imperial', coach: { personaId: 'zen', profanity: 'mild' } })

  it('ignores keys sent as undefined', () => {
    const patch = AppSettingsPatchSchema.parse({ units: undefined })
    expect(mergeSettings(current, patch).units).toBe('imperial')
  })

  it('merges a partial nested object without resetting its other fields', () => {
    const patch = AppSettingsPatchSchema.parse({ coach: { rideAlong: 'off' } })
    expect(patch).toEqual({ coach: { rideAlong: 'off' } })
    const next = mergeSettings(current, patch)
    expect(next.coach).toMatchObject({ rideAlong: 'off', personaId: 'zen', profanity: 'mild' })
  })

  it('still replaces arrays wholesale', () => {
    const next = mergeSettings(current, { rememberedDevices: [] })
    expect(next.rememberedDevices).toEqual([])
  })
})
