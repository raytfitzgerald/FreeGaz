import { describe, expect, it } from 'vitest'
import { MusicControl, parseStatus, type ScriptRunner } from './music'

const SEP = '\u001f'

function fakeRunner(state: { running: string; spotify?: string; music?: string }) {
  const calls: string[] = []
  const run: ScriptRunner = async (script) => {
    calls.push(script)
    if (script.includes('is running')) return state.running
    if (script.startsWith('set s to character id 31') && script.includes('"Spotify"')) return state.spotify ?? ''
    if (script.startsWith('set s to character id 31') && script.includes('"Music"')) return state.music ?? ''
    return ''
  }
  return { run, calls }
}

describe('MusicControl', () => {
  it('reports the playing app first, with track and volume', async () => {
    const { run } = fakeRunner({ running: 'spotify,music,', spotify: ['paused', 'Song A', 'Band A', '70'].join(SEP), music: ['playing', 'Song B', 'Band B', '40'].join(SEP) })
    expect(await new MusicControl(run).status()).toEqual({ player: 'music', state: 'playing', track: 'Song B', artist: 'Band B', volume: 40 })
  })

  it('does nothing when no player is running', async () => {
    const { run, calls } = fakeRunner({ running: '' })
    expect((await new MusicControl(run).command('next')).player).toBeNull()
    expect(calls.some((c) => c.includes('next track'))).toBe(false)
  })

  it('sends fixed transport commands to the active app', async () => {
    const { run, calls } = fakeRunner({ running: 'spotify,', spotify: ['playing', 'x', 'y', '80'].join(SEP) })
    await new MusicControl(run).command('next')
    expect(calls).toContain('tell application "Spotify" to next track')
  })

  it('ducks the volume while the coach talks and restores it exactly', async () => {
    const { run, calls } = fakeRunner({ running: 'spotify,', spotify: ['playing', 'x', 'y', '80'].join(SEP) })
    const m = new MusicControl(run)
    await m.command('duck')
    await m.command('duck') // already ducked: no second step down
    await m.command('unduck')
    expect(calls.filter((c) => c.includes('set sound volume'))).toEqual(['tell application "Spotify" to set sound volume to 28', 'tell application "Spotify" to set sound volume to 80'])
  })

  it('parses stopped players without a track', () => {
    expect(parseStatus('music', ['stopped', '', '', '55'].join(SEP))).toEqual({ player: 'music', state: 'stopped', track: null, artist: null, volume: 55 })
  })
})
