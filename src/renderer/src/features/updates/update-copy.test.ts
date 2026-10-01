import { describe, expect, it } from 'vitest'
import { updateStatusText } from './update-copy'

describe('updateStatusText', () => {
  it('tells an ad-hoc build where new versions come from', () => {
    expect(updateStatusText({ state: 'unsupported', reason: 'unsigned' })).toMatch(/freegaz\.app/)
  })
  it('shows download progress and what happens once it is ready', () => {
    expect(updateStatusText({ state: 'downloading', version: '0.5.0', percent: 42 })).toBe('Downloading FreeGaz 0.5.0… 42 %')
    expect(updateStatusText({ state: 'ready', version: '0.5.0' })).toMatch(/installs when you restart FreeGaz or quit it/)
  })
  it('never uses an exclamation mark', () => {
    const all = [
      updateStatusText({ state: 'idle', checkedAt: null }),
      updateStatusText({ state: 'checking' }),
      updateStatusText({ state: 'up-to-date', checkedAt: 0 }),
      updateStatusText({ state: 'available', version: '0.5.0' }),
      ...(['dev', 'web', 'unsigned', 'platform', 'failed'] as const).map((reason) => updateStatusText({ state: 'unsupported', reason })),
    ]
    for (const line of all) expect(line).not.toContain('!')
  })
})
