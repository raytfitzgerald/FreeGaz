// The single source of truth for renderer <-> main communication.
//
//  * invoke channels: request/response. Main validates every request with the
//    zod schema below and rejects senders that are not our own window.
//  * events: main -> renderer pushes (typed, fire-and-forget).
//  * streams: long-running cancellable responses (AI). See `StreamChunk`.
//
// The preload script only forwards channel names listed in ./channels.ts, and
// a unit test keeps that list identical to the keys of `invoke`.
import { z } from 'zod'
import { AppSettingsPatchSchema, AppSettingsSchema, DeviceRoleSchema, type AppSettings } from '../settings'
import { RideCommandSchema, type LiveBroadcast, type RideCommand } from '../live'

const Empty = z.object({}).strict()
const Ok = z.object({ ok: z.boolean() })
const RequestId = z.string().min(1).max(100)
const RideId = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/)
export const MusicStatusSchema = z.object({
  player: z.enum(['spotify', 'music']).nullable(),
  state: z.enum(['playing', 'paused', 'stopped']).nullable(),
  track: z.string().nullable(),
  artist: z.string().nullable(),
  volume: z.number().nullable(),
})

export const OutboxItemSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  provider: z.enum(['strava', 'intervals']),
  fitPath: z.string(),
  fileName: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['queued', 'uploading', 'done', 'error']),
  attempts: z.number(),
  nextAttemptAt: z.number(),
  activityId: z.string().optional(),
  lastError: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type OutboxItemDto = z.infer<typeof OutboxItemSchema>
const RemoteStatusSchema = z.object({
  running: z.boolean(),
  url: z.string().nullable(),
  qrDataUrl: z.string().nullable(),
  allowControl: z.boolean(),
  clients: z.array(z.object({ id: z.string(), address: z.string(), connectedAt: z.number() })),
})
const AiProviderSchema = z.enum(['anthropic', 'openai', 'ollama'])
const AiStatusSchema = z.object({
  provider: AiProviderSchema.nullable(),
  configured: z.boolean(),
  model: z.string().nullable(),
  keys: z.object({ anthropic: z.boolean(), openai: z.boolean() }),
  ollamaHost: z.string().optional(),
  breakerOpen: z.boolean(),
})
const AiResultSchema = z.object({ ok: z.boolean(), text: z.string().optional(), model: z.string().optional(), error: z.string().optional(), code: z.string().optional() })

export const invoke = {
  'app.ping': {
    req: z.object({ msg: z.string().max(200) }),
    res: z.object({ pong: z.string(), version: z.string(), platform: z.string() }),
  },
  'app.info': {
    req: Empty,
    res: z.object({
      version: z.string(),
      electron: z.string(),
      chrome: z.string(),
      node: z.string(),
      userData: z.string(),
      documents: z.string(),
      isPackaged: z.boolean(),
      isTest: z.boolean(),
      /** Start with simulated devices (FREEGAZ_SIM=1). */
      sim: z.boolean(),
      /** Allow time warp > 1x (only ever honoured while all devices are simulated). */
      warp: z.number(),
    }),
  },

  // ---- settings (main-owned JSON) ----
  'settings.get': { req: Empty, res: AppSettingsSchema },
  'settings.patch': { req: AppSettingsPatchSchema, res: AppSettingsSchema },

  // ---- Bluetooth chooser bridge (see src/main/ble/chooser.ts) ----
  'ble.prepare': {
    req: z.object({ requestId: RequestId, role: DeviceRoleSchema, preferredChooserId: z.string().max(200).optional() }),
    res: Ok,
  },
  'ble.choose': {
    req: z.object({ requestId: RequestId, deviceId: z.string().max(200).nullable() }),
    res: Ok,
  },
  /** Asks main to run the renderer's auto-connect hook with a user gesture (requestDevice needs one). */
  'ble.requestAutoConnect': { req: Empty, res: Ok },

  // ---- crash-safe ride journal (see src/main/ride/journal-store.ts) ----
  'journal.begin': { req: z.object({ rideId: RideId, meta: z.string().max(200_000) }), res: Ok },
  'journal.append': {
    req: z.object({ rideId: RideId, seq: z.number().int().nonnegative(), lines: z.array(z.string().max(20_000)).max(600) }),
    res: z.object({ durableSeq: z.number() }),
  },
  'journal.close': { req: z.object({ rideId: RideId }), res: Ok },
  'journal.remove': { req: z.object({ rideId: RideId }), res: Ok },
  'journal.pending': {
    req: Empty,
    res: z.object({
      journals: z.array(z.object({ rideId: z.string(), name: z.string().nullable(), startedAt: z.number().nullable(), records: z.number(), lastTs: z.number().nullable(), simulated: z.boolean() })),
    }),
  },
  'journal.read': { req: z.object({ rideId: RideId }), res: z.object({ text: z.string() }) },

  // ---- files ----
  'files.saveFit': {
    req: z.object({ fileName: z.string().min(1).max(200), bytes: z.instanceof(Uint8Array) }),
    res: z.object({ path: z.string(), fileName: z.string() }),
  },
  'files.exportDir': { req: Empty, res: z.object({ dir: z.string() }) },
  'files.chooseExportDir': { req: Empty, res: z.object({ dir: z.string().nullable() }) },
  'files.reveal': { req: z.object({ path: z.string().max(2000) }), res: Ok },
  /** Native save dialog for user-initiated exports (backups, workout files). */
  'files.saveAs': {
    req: z.object({ defaultName: z.string().min(1).max(200), bytes: z.instanceof(Uint8Array), filters: z.array(z.object({ name: z.string().max(60), extensions: z.array(z.string().max(10)).max(5) })).max(4).optional() }),
    res: z.object({ path: z.string().nullable() }),
  },
  'files.openUrl': { req: z.object({ url: z.string().url().max(2000) }), res: Ok },
  /** Spotify / Apple Music via AppleScript (macOS asks for Automation permission once). */
  'music.status': { req: Empty, res: MusicStatusSchema },
  'music.command': { req: z.object({ action: z.enum(['playpause', 'next', 'previous', 'duck', 'unduck']) }), res: MusicStatusSchema },
  /** FIT files in the export folder (for "rebuild history from folder"). */
  'files.listFits': { req: Empty, res: z.object({ dir: z.string(), files: z.array(z.object({ name: z.string(), size: z.number(), mtime: z.number() })) }) },
  /** Reads one FIT file from the export folder, by plain file name (no paths). */
  'files.readFit': { req: z.object({ name: z.string().min(5).max(255).regex(/^[^/\\]+\.fit$/i) }), res: z.object({ bytes: z.instanceof(Uint8Array) }) },
  /** Writes a .zwo into every Zwift account folder under ~/Documents/Zwift/Workouts. */
  'files.exportZwift': {
    req: z.object({ fileName: z.string().min(1).max(120), text: z.string().max(2_000_000) }),
    res: z.object({ paths: z.array(z.string()), error: z.string().nullable() }),
  },

  // ---- integrations (secrets never leave main) ----
  'strava.status': {
    req: Empty,
    res: z.object({ configured: z.boolean(), connected: z.boolean(), athleteName: z.string().optional(), clientId: z.string().optional() }),
  },
  'strava.setApp': {
    req: z.object({ clientId: z.string().regex(/^\d{1,12}$/), clientSecret: z.string().regex(/^[A-Za-z0-9]{20,80}$/) }),
    res: Ok,
  },
  'strava.connect': { req: Empty, res: z.object({ ok: z.boolean(), athleteName: z.string().optional(), error: z.string().optional() }) },
  'strava.disconnect': { req: Empty, res: Ok },
  'intervals.status': { req: Empty, res: z.object({ configured: z.boolean(), athleteId: z.string().optional() }) },
  'intervals.configure': { req: z.object({ apiKey: z.string().min(8).max(200), athleteId: z.string().max(40).default('0') }), res: Ok },
  'intervals.clear': { req: Empty, res: Ok },
  'uploads.enqueue': {
    req: z.object({
      rideId: RideId,
      provider: z.enum(['strava', 'intervals']),
      fitPath: z.string().max(2000),
      fileName: z.string().max(200),
      name: z.string().max(200),
      description: z.string().max(5000).optional(),
    }),
    res: z.object({ id: z.string(), status: z.string() }),
  },
  'uploads.list': { req: Empty, res: z.object({ items: z.array(OutboxItemSchema) }) },
  'uploads.retry': { req: z.object({ id: z.string().max(200) }), res: Ok },

  // ---- AI (keys and prompts stay in main) ----
  'ai.status': { req: Empty, res: AiStatusSchema },
  'ai.configure': {
    req: z.object({
      provider: AiProviderSchema.nullable().optional(),
      model: z.string().max(120).optional(),
      apiKey: z.string().max(300).nullable().optional(),
      ollamaHost: z.string().url().max(300).optional(),
    }),
    res: AiStatusSchema,
  },
  'ai.models': { req: z.object({ provider: AiProviderSchema }), res: z.object({ models: z.array(z.string()), error: z.string().optional() }) },
  'ai.complete': {
    req: z.object({ purpose: z.enum(['live-line', 'ride-title']), input: z.string().max(20_000) }),
    res: AiResultSchema,
  },
  'ai.structured': {
    req: z.object({ purpose: z.enum(['workout', 'quip-pack', 'ride-title']), input: z.string().max(40_000) }),
    res: z.object({ ok: z.boolean(), value: z.unknown().optional(), model: z.string().optional(), error: z.string().optional(), code: z.string().optional() }),
  },
  'ai.stream.start': {
    req: z.object({
      streamId: z.string().min(6).max(64),
      purpose: z.enum(['debrief', 'chat']),
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(60_000) })).min(1).max(60),
    }),
    res: Ok,
  },
  'ai.stream.cancel': { req: z.object({ streamId: z.string().max(64) }), res: Ok },

  // ---- mini-HUD + phone remote ----
  'minihud.toggle': { req: z.object({ open: z.boolean() }), res: z.object({ open: z.boolean() }) },
  'minihud.setClickThrough': { req: z.object({ on: z.boolean() }), res: Ok },
  /** Commands from the mini-HUD window (relayed to the main window). */
  'ride.command': { req: RideCommandSchema, res: Ok },
  'remote.start': { req: z.object({ allowControl: z.boolean() }), res: RemoteStatusSchema },
  'remote.stop': { req: Empty, res: RemoteStatusSchema },
  'remote.status': { req: Empty, res: RemoteStatusSchema },
  'remote.kick': { req: z.object({ clientId: z.string().max(64) }), res: Ok },

  // ---- power management ----
  /** Keep the Mac awake (display on) while a ride is in progress. */
  'power.keepAwake': { req: z.object({ on: z.boolean() }), res: Ok },
} as const satisfies Record<string, { req: z.ZodType; res: z.ZodType }>

export type InvokeContract = typeof invoke
export type InvokeChannel = keyof InvokeContract
export type InvokeReq<C extends InvokeChannel> = z.input<InvokeContract[C]['req']>
export type InvokeRes<C extends InvokeChannel> = z.output<InvokeContract[C]['res']>

/** Main -> renderer pushes. */
export interface EventMap {
  'app.log': { level: 'info' | 'warn' | 'error'; msg: string }
  'settings.changed': AppSettings
  /** Chooser list updates while Chromium scans; `open: false` means the request resolved. */
  'ble.chooser': { requestId: string; role: string; open: boolean; devices: { id: string; name: string }[] }
  /** The platform chooser resolved to this device id (remember it for auto-pick). */
  'ble.chosen': { requestId: string; chooserId: string; name: string }
  /** The system is about to sleep / just woke: pause the ride. */
  'power.suspend': { suspended: boolean }
  'uploads.changed': OutboxItemDto
  'ai.stream.delta': { streamId: string; text: string }
  'ai.stream.end': { streamId: string; text: string | null; error: string | null; code: string | null; model: string | null }
  /** Live data relayed from the main window to the mini-HUD. */
  'live.broadcast': LiveBroadcast
  /** A command from the mini-HUD or phone remote, delivered to the main window. */
  'ride.command': RideCommand
}

/** Fire-and-forget renderer → main messages (high-frequency, no response). */
export interface SendMap {
  'live.publish': LiveBroadcast
}
export type SendChannel = keyof SendMap
export type EventChannel = keyof EventMap

/** Shape of `window.freegaz`, implemented by the preload (Electron) or the web shim (browser). */
export interface FreegazBridge {
  readonly platform: 'electron' | 'web'
  invoke<C extends InvokeChannel>(channel: C, req: InvokeReq<C>): Promise<InvokeRes<C>>
  on<E extends EventChannel>(event: E, listener: (payload: EventMap[E]) => void): () => void
  send<S extends SendChannel>(channel: S, payload: SendMap[S]): void
}
