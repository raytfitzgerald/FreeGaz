import { describe, expect, it } from 'vitest'
import { AppSettingsPatchSchema, AppSettingsSchema, DEFAULT_SETTINGS } from './settings'

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
