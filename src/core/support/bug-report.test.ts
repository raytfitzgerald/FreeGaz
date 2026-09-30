import { describe, expect, it } from 'vitest'
import { MAX_ISSUE_URL, bugIssueUrl, bugReportBody, formatDiagnostics } from './bug-report'

const diag = formatDiagnostics({
  version: '0.3.0',
  electron: '38.0.0',
  chrome: '140',
  os: '15.6',
  arch: 'arm64',
  simulated: false,
  devices: ['trainer: FTMS (connected)'],
  settings: { Theme: 'light', Units: 'imperial' },
  recent: ['trainer: control lost'],
})

describe('bug reports', () => {
  it('writes the sections that were filled in, and the diagnostics', () => {
    const body = bugReportBody({ title: 'x', what: 'Light mode flips to dark', steps: '', expected: 'It stays light', diagnostics: diag })
    expect(body).toContain('### What happened\n\nLight mode flips to dark')
    expect(body).not.toContain('Steps to reproduce')
    expect(body).toContain('- macOS 15.6 (arm64)')
    expect(body).toContain('- Theme: light')
    expect(body).toContain('- trainer: control lost')
  })

  it('names the phone OS for the web app', () => {
    const web = formatDiagnostics({ version: '0.3.0-web', electron: 'n/a', chrome: 'n/a', os: 'iOS 18.1', arch: 'browser', simulated: false, devices: [], settings: {}, recent: [] })
    expect(web).toContain('- FreeGaz 0.3.0-web (web app, Chrome n/a)')
    expect(web).toContain('- iOS 18.1 (browser)')
  })

  it('points at the repo as a labelled bug', () => {
    const { url, trimmed } = bugIssueUrl('Light mode', 'body')
    expect(url.startsWith('https://github.com/raytfitzgerald/FreeGaz/issues/new?')).toBe(true)
    const q = new URL(url).searchParams
    expect(q.get('labels')).toBe('bug')
    expect(q.get('title')).toBe('Light mode')
    expect(q.get('body')).toBe('body')
    expect(trimmed).toBe(false)
  })

  it('trims a long body to fit the URL limit, and says so', () => {
    const { url, trimmed } = bugIssueUrl('Long', 'é'.repeat(20_000))
    expect(trimmed).toBe(true)
    expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL)
    expect(new URL(url).searchParams.get('body')).toMatch(/trimmed to fit/)
  })
})
