import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AppSettingsSchema, DEFAULT_SETTINGS, type AppSettings, type AppSettingsPatch } from '@shared/settings'

/**
 * Atomic JSON settings file. Reads once at startup (falling back to defaults
 * if the file is missing or invalid), writes via temp-file + rename so a crash
 * mid-write can never leave a truncated settings file.
 */
export class SettingsStore {
  private current: AppSettings
  private readonly listeners = new Set<(s: AppSettings) => void>()

  constructor(private readonly file: string) {
    this.current = SettingsStore.load(file)
  }

  static inDir(dir: string): SettingsStore {
    return new SettingsStore(join(dir, 'settings.json'))
  }

  static load(file: string): AppSettings {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, 'utf8'))
      const parsed = AppSettingsSchema.safeParse(raw)
      return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  get(): AppSettings {
    return structuredClone(this.current)
  }

  patch(patch: AppSettingsPatch): AppSettings {
    const next = AppSettingsSchema.parse({ ...this.current, ...patch })
    this.current = next
    this.persist()
    for (const l of this.listeners) l(this.get())
    return this.get()
  }

  onChange(listener: (s: AppSettings) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(this.current, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }
}
