// Bug reports go to GitHub as a pre-filled new issue, opened in the rider's
// browser: GitHub emails the maintainer, nothing is sent from the app itself,
// and the reporter sees (and can edit) every word before submitting.

export const BUG_REPO = 'raytfitzgerald/FreeGaz'
/** GitHub rejects much longer new-issue URLs; the body is trimmed to fit. */
export const MAX_ISSUE_URL = 8000
export const MAX_TITLE = 120

export interface BugReport {
  title: string
  /** What happened. */
  what: string
  steps?: string
  expected?: string
  /** Pre-formatted diagnostics (markdown), or null when the reporter left them out. */
  diagnostics: string | null
}

export interface Diagnostics {
  version: string
  electron: string
  chrome: string
  os: string
  arch: string
  simulated: boolean
  /** "trainer: FTMS (connected)" etc. No names or serial numbers. */
  devices: readonly string[]
  settings: Readonly<Record<string, string>>
  /** Recent device warnings and ride errors, newest last. */
  recent: readonly string[]
}

const section = (heading: string, text: string | undefined) => (text && text.trim() ? `### ${heading}\n\n${text.trim()}\n` : '')

/** The diagnostics block: app and system versions, device kinds, a few settings and recent errors. */
export function formatDiagnostics(d: Diagnostics): string {
  const lines = [
    `- FreeGaz ${d.version} (Electron ${d.electron}, Chrome ${d.chrome})`,
    `- macOS ${d.os} (${d.arch})${d.simulated ? ', simulated devices' : ''}`,
    `- Devices: ${d.devices.length > 0 ? d.devices.join('; ') : 'none connected'}`,
    ...Object.entries(d.settings).map(([k, v]) => `- ${k}: ${v}`),
  ]
  if (d.recent.length > 0) lines.push('', 'Recent messages:', ...d.recent.slice(-10).map((m) => `- ${m}`))
  return lines.join('\n')
}

export function bugReportBody(r: BugReport): string {
  return [
    section('What happened', r.what),
    section('Steps to reproduce', r.steps),
    section('What I expected', r.expected),
    r.diagnostics ? `### Diagnostics\n\n${r.diagnostics}\n` : '',
    '<sub>Sent from FreeGaz: Settings → About → Report a bug.</sub>',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * The new-issue URL with the title and body filled in, labelled as a bug
 * by the repo's template. A body too long for the URL loses its end (the
 * diagnostics first), with a note saying so.
 */
export function bugIssueUrl(title: string, body: string): { url: string; trimmed: boolean } {
  const base = `https://github.com/${BUG_REPO}/issues/new?template=bug_report.md&labels=bug&title=${encodeURIComponent(title.trim().slice(0, MAX_TITLE) || 'Bug report')}&body=`
  const full = base + encodeURIComponent(body)
  if (full.length <= MAX_ISSUE_URL) return { url: full, trimmed: false }
  const note = '\n\n…(trimmed to fit; please paste the rest here if it matters)'
  let lo = 0
  let hi = body.length
  // the longest prefix whose encoded URL still fits
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if ((base + encodeURIComponent(body.slice(0, mid) + note)).length <= MAX_ISSUE_URL) lo = mid
    else hi = mid - 1
  }
  return { url: base + encodeURIComponent(body.slice(0, lo) + note), trimmed: true }
}
