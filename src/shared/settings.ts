// App-level settings owned by the main process (atomic JSON in userData).
// Rides, workouts, the athlete profile and FTP history live in the renderer's
// IndexedDB; this file holds what main needs at startup or across windows.
import { z } from 'zod'

export const DeviceRoleSchema = z.enum(['trainer', 'hr', 'power', 'cadence', 'coreTemp', 'smo2', 'fan'])

export const RememberedDeviceSchema = z.object({
  role: DeviceRoleSchema,
  chooserId: z.string().min(1).max(200),
  name: z.string().max(200),
  lastConnectedAt: z.number(),
})

export const AppSettingsSchema = z.object({
  version: z.literal(1).default(1),
  /** One remembered device per role, auto-selected on launch. */
  rememberedDevices: z.array(RememberedDeviceSchema).default([]),
  /** Reconnect remembered devices automatically when the app starts. */
  autoConnect: z.boolean().default(true),
  /** Folder for automatic FIT export; null = ~/Documents/FreeGaz/Rides. */
  exportDir: z.string().nullable().default(null),
  units: z.enum(['metric', 'imperial']).default('metric'),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>
export type RememberedDeviceSetting = z.infer<typeof RememberedDeviceSchema>

export const DEFAULT_SETTINGS: AppSettings = AppSettingsSchema.parse({})

/** Partial update accepted over IPC. Arrays replace wholesale. */
export const AppSettingsPatchSchema = AppSettingsSchema.partial().omit({ version: true })
export type AppSettingsPatch = z.infer<typeof AppSettingsPatchSchema>
