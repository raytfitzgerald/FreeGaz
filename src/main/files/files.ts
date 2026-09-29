import { mkdirSync, writeFileSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'

/** Hosts FreeGaz may open in the system browser. */
export const EXTERNAL_ALLOWLIST = [
  'www.strava.com',
  'strava.com',
  'connect.garmin.com',
  'intervals.icu',
  'github.com',
  'zwiftinsider.com',
  'console.anthropic.com',
  'platform.openai.com',
  'ollama.com',
]

export function isAllowedExternal(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && EXTERNAL_ALLOWLIST.includes(u.hostname)
  } catch {
    return false
  }
}

/** Keeps file names portable and free of path tricks. */
export function sanitizeFileName(name: string, ext: string): string {
  const base = name
    .replace(/[/\\?%*:|"<>\p{Cc}]/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120)
  return `${base || 'ride'}${ext.startsWith('.') ? ext : `.${ext}`}`
}

/** Writes `bytes` to `dir/fileName`, refusing anything that escapes `dir`. */
export function writeInto(dir: string, fileName: string, bytes: Uint8Array): string {
  const root = normalize(dir + sep)
  const target = normalize(join(root, fileName))
  if (!target.startsWith(root)) throw new Error('Refusing to write outside the export folder')
  mkdirSync(root, { recursive: true })
  writeFileSync(target, bytes)
  return target
}
