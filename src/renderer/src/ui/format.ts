/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(totalS: number | null | undefined): string {
  if (totalS === null || totalS === undefined || !Number.isFinite(totalS)) return '—'
  const s = Math.max(0, Math.round(totalS))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

/** 3725 → "1h 02m", 540 → "9m". */
export function formatDurationShort(totalS: number): string {
  const m = Math.round(totalS / 60)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
