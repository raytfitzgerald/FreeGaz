// intervals.icu: personal API key (Basic auth, username "API_KEY").
// Athlete id "0" means "the owner of this key".
import type { SecretStore } from '../secrets/secret-store'
import { requestJson } from './http'

export const INTERVALS_API = 'https://intervals.icu/api/v1'
const SECRET = 'intervals.config'

export interface IntervalsConfig {
  apiKey: string
  athleteId: string
}

export class IntervalsClient {
  constructor(
    private readonly secrets: SecretStore,
    private readonly api = INTERVALS_API,
  ) {}

  configure(cfg: IntervalsConfig): void {
    this.secrets.setJson(SECRET, cfg)
  }

  clear(): void {
    this.secrets.delete(SECRET)
  }

  status(): { configured: boolean; athleteId?: string } {
    const c = this.secrets.getJson<IntervalsConfig>(SECRET)
    return { configured: !!c, athleteId: c?.athleteId }
  }

  async uploadFit(upload: { bytes: Uint8Array; fileName: string; name: string; description?: string; externalId: string }): Promise<{ activityId: string }> {
    const c = this.secrets.getJson<IntervalsConfig>(SECRET)
    if (!c) throw new Error('intervals.icu is not configured')
    const url = new URL(`${this.api}/athlete/${encodeURIComponent(c.athleteId || '0')}/activities`)
    url.searchParams.set('name', upload.name)
    if (upload.description) url.searchParams.set('description', upload.description)
    url.searchParams.set('external_id', upload.externalId)
    const form = new FormData()
    form.set('file', new Blob([upload.bytes.slice()], { type: 'application/octet-stream' }), upload.fileName)
    const res = await requestJson<{ id?: string; icu_athlete_id?: string } | { id: string }[]>(url.toString(), {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`API_KEY:${c.apiKey}`).toString('base64')}` },
      body: form,
    })
    const id = Array.isArray(res) ? res[0]?.id : res.id
    if (!id) throw new Error('intervals.icu did not return an activity id')
    return { activityId: String(id) }
  }
}
