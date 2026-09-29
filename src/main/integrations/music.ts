// Spotify / Apple Music now-playing and transport controls through fixed
// AppleScript snippets (macOS asks once for Automation permission). Nothing
// from the renderer is ever interpolated into a script except a validated
// integer volume.
import { execFile } from 'node:child_process'

export type MusicPlayer = 'spotify' | 'music'
export type MusicAction = 'playpause' | 'next' | 'previous' | 'duck' | 'unduck'

export interface MusicStatus {
  player: MusicPlayer | null
  state: 'playing' | 'paused' | 'stopped' | null
  track: string | null
  artist: string | null
  volume: number | null
}

export type ScriptRunner = (script: string) => Promise<string>

const APP: Record<MusicPlayer, string> = { spotify: 'Spotify', music: 'Music' }
/** While the coach speaks, music plays at this share of its volume. */
export const DUCK_TO = 0.35
const SEP = '\u001f'

export const runOsascript: ScriptRunner = (script) =>
  new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 3000 }, (err, stdout) => (err ? reject(err) : resolve(stdout.trim())))
  })

export class MusicControl {
  private ducked: { player: MusicPlayer; volume: number } | null = null

  constructor(private readonly run: ScriptRunner = runOsascript) {}

  /** The first running player, preferring whichever is playing. */
  async status(): Promise<MusicStatus> {
    const none: MusicStatus = { player: null, state: null, track: null, artist: null, volume: null }
    const running = await this.running()
    if (running.length === 0) return none
    const reads = await Promise.all(running.map((p) => this.read(p).catch(() => null)))
    const all = reads.filter((s): s is MusicStatus => s !== null)
    return all.find((s) => s.state === 'playing') ?? all[0] ?? none
  }

  async command(action: MusicAction): Promise<MusicStatus> {
    const s = await this.status()
    if (!s.player) return s
    const app = APP[s.player]
    switch (action) {
      case 'playpause':
        await this.run(`tell application "${app}" to playpause`)
        break
      case 'next':
        await this.run(`tell application "${app}" to next track`)
        break
      case 'previous':
        await this.run(`tell application "${app}" to previous track`)
        break
      case 'duck':
        if (!this.ducked && s.state === 'playing' && s.volume !== null) {
          this.ducked = { player: s.player, volume: s.volume }
          await this.setVolume(s.player, Math.round(s.volume * DUCK_TO))
        }
        break
      case 'unduck':
        if (this.ducked) {
          const d = this.ducked
          this.ducked = null
          await this.setVolume(d.player, d.volume)
        }
        break
    }
    return this.status()
  }

  private async setVolume(player: MusicPlayer, volume: number): Promise<void> {
    const v = Math.max(0, Math.min(100, Math.round(volume)))
    await this.run(`tell application "${APP[player]}" to set sound volume to ${v}`)
  }

  private async running(): Promise<MusicPlayer[]> {
    const out = await this.run(`set r to ""
if application "Spotify" is running then set r to r & "spotify,"
if application "Music" is running then set r to r & "music,"
return r`).catch(() => '')
    return out.split(',').filter((p): p is MusicPlayer => p === 'spotify' || p === 'music')
  }

  private async read(player: MusicPlayer): Promise<MusicStatus> {
    const app = APP[player]
    // Fields are joined with the unit separator (character id 31), built in AppleScript.
    const out = await this.run(`set s to character id 31
tell application "${app}"
set st to player state as string
set v to sound volume
if st is "stopped" then return st & s & s & s & v
return st & s & (name of current track) & s & (artist of current track) & s & v
end tell`)
    return parseStatus(player, out)
  }
}

export function parseStatus(player: MusicPlayer, out: string): MusicStatus {
  const [st, track, artist, vol] = out.split(SEP)
  const state = st === 'playing' || st === 'paused' || st === 'stopped' ? st : null
  const volume = Number(vol)
  return { player, state, track: track || null, artist: artist || null, volume: Number.isFinite(volume) ? volume : null }
}
