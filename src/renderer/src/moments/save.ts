// Writing a finished ride's moments next to its FIT file.
import { bridge } from '../platform/bridge'
import { takeMoments, type SavedMoment } from './store'

const SUFFIX = { hard: 'hardest effort', coach: 'coach' } as const

export async function saveMoments(rideId: string, baseName: string): Promise<SavedMoment[]> {
  const saved: SavedMoment[] = []
  for (const m of takeMoments(rideId)) {
    try {
      const { path } = await bridge().invoke('files.saveImage', { fileName: `${baseName} - ${SUFFIX[m.kind]}.jpg`, bytes: m.bytes.slice() })
      if (path) saved.push({ kind: m.kind, path, url: m.url, caption: m.caption })
    } catch {
      // a picture is a nice extra: never let it fail the ride
      URL.revokeObjectURL(m.url)
    }
  }
  return saved
}
