import { useLiveQuery } from 'dexie-react-hooks'
import { currentFtp, DEFAULT_FTP_W } from './athlete-repo'

/** The rider's current FTP (live), and whether one has actually been set or tested. */
export function useFtp(): { ftpW: number; known: boolean; loading: boolean } {
  const row = useLiveQuery(() => currentFtp().then((r) => r ?? false), [])
  if (row === undefined) return { ftpW: DEFAULT_FTP_W, known: false, loading: true }
  return row ? { ftpW: row.ftpW, known: true, loading: false } : { ftpW: DEFAULT_FTP_W, known: false, loading: false }
}
