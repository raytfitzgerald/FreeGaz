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

export const TrainerPrefsSchema = z.object({
  /** SIM "feel" (FulGaz-style slope scaling). Speed always uses the true grade. */
  uphillPct: z.number().min(0).max(150).default(100),
  downhillPct: z.number().min(0).max(150).default(50),
  gradeLimitPct: z.number().min(2).max(25).default(20),
  ergSoftStartS: z.number().min(0).max(30).default(10),
  spiralGuard: z.boolean().default(true),
  /** Physics for virtual speed. */
  bikeKg: z.number().min(4).max(30).default(8.5),
  cda: z.number().min(0.15).max(0.7).default(0.35),
  crr: z.number().min(0.001).max(0.02).default(0.0033),
  autoPause: z.boolean().default(true),
  /** With power pedals connected, correct ERG so the pedals read the target. */
  powerMatch: z.boolean().default(true),
})

export const CoachPrefsSchema = z.object({
  enabled: z.boolean().default(true),
  personaId: z.string().max(60).default('drill-sergeant'),
  spice: z.number().int().min(1).max(5).default(3),
  profanity: z.boolean().default(false),
  voice: z.boolean().default(true),
  voiceName: z.string().max(120).nullable().default(null),
  rate: z.number().min(0.6).max(1.6).default(1.05),
  volume: z.number().min(0).max(1).default(0.9),
  /** Use AI-generated lines (quip packs / live lines) when an AI provider is set. */
  useAi: z.boolean().default(false),
})

export const FuelingPrefsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Target carbohydrate intake for rides over 60 min. */
  carbsPerHourG: z.number().min(0).max(150).default(60),
  drinkEveryMin: z.number().min(5).max(60).default(15),
})

/** HUD tile layouts per ride view; null = the built-in preset. */
export const HudPrefsSchema = z.object({
  free: z.array(z.string().max(40)).max(24).nullable().default(null),
  workout: z.array(z.string().max(40)).max(24).nullable().default(null),
  route: z.array(z.string().max(40)).max(24).nullable().default(null),
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
  /** Upload finished (non-simulated) rides automatically. */
  autoUpload: z.object({ strava: z.boolean().default(false), intervals: z.boolean().default(false) }).default({ strava: false, intervals: false }),
  trainer: TrainerPrefsSchema.default(TrainerPrefsSchema.parse({})),
  coach: CoachPrefsSchema.default(CoachPrefsSchema.parse({})),
  fueling: FuelingPrefsSchema.default(FuelingPrefsSchema.parse({})),
  hud: HudPrefsSchema.default(HudPrefsSchema.parse({})),
})

export type AppSettings = z.infer<typeof AppSettingsSchema>
export type TrainerPrefs = z.infer<typeof TrainerPrefsSchema>
export type CoachPrefs = z.infer<typeof CoachPrefsSchema>
export type FuelingPrefs = z.infer<typeof FuelingPrefsSchema>
export type HudPrefs = z.infer<typeof HudPrefsSchema>
export type RememberedDeviceSetting = z.infer<typeof RememberedDeviceSchema>

export const DEFAULT_SETTINGS: AppSettings = AppSettingsSchema.parse({})

/** Partial update accepted over IPC. Arrays replace wholesale. */
export const AppSettingsPatchSchema = AppSettingsSchema.partial().omit({ version: true })
export type AppSettingsPatch = z.infer<typeof AppSettingsPatchSchema>
