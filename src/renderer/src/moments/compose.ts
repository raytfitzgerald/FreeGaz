// A ride moment as an image: the window is captured as it looks right now,
// then the parts of the ride screen marked data-snap (the ride-along with the
// coach's bubble, the big tiles, the chart) are cut out and stacked under a
// title, leaving out banners and the small tiles. Controls inside a section
// (data-snap-hide) are trimmed off when they sit along its bottom edge, or
// painted over with the panel colour. Needs the Mac
// app's window capture; the web build gets null.
import { bridge } from '../platform/bridge'

const PAD = 24
const GAP = 12
const HEAD = 64
const FOOT = 34

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/** Controls this close to a section's bottom edge are cut off rather than painted over. */
const TRIM_WITHIN = 24

/** The bottom strip of a card (padding, border, corners) redrawn under a trimmed section. */
const EDGE = 16

interface Section {
  rect: DOMRect
  /** Height kept after trimming controls off the bottom (the full height when nothing is trimmed). */
  height: number
  /** Controls to paint over, relative to the section's top-left. */
  cover: { x: number; y: number; w: number; h: number }[]
}

/** Marked sections that are fully on screen, in page order. */
function visibleSections(): Section[] {
  return [...document.querySelectorAll<HTMLElement>('[data-snap]')]
    .map((el) => {
      const rect = el.getBoundingClientRect()
      let height = rect.height
      const cover: Section['cover'] = []
      for (const c of el.querySelectorAll<HTMLElement>('[data-snap-hide]')) {
        const r = c.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (rect.bottom - r.bottom <= TRIM_WITHIN) height = Math.min(height, r.top - rect.top)
        else cover.push({ x: r.left - rect.left, y: r.top - rect.top, w: r.width, h: r.height })
      }
      return { rect, height, cover }
    })
    .filter(({ rect: r }) => r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth)
}

export async function composeMoment(title: string, caption: string): Promise<Uint8Array | null> {
  if (document.hidden) return null
  const rects = visibleSections()
  if (rects.length === 0) return null
  const shot = await bridge().invoke('ride.capture', {})
  if (!shot.image || shot.width === 0) return null
  // the page may have scrolled while the capture was taken: measure again, and give up if it moved
  const now = visibleSections()
  if (now.length !== rects.length || now.some((n, i) => Math.abs(n.rect.top - rects[i]!.rect.top) > 2)) return null

  const bmp = await createImageBitmap(new Blob([shot.image.slice()], { type: 'image/jpeg' }))
  const s = shot.width / window.innerWidth
  const w = Math.max(...rects.map((r) => r.rect.width))
  const h = HEAD + rects.reduce((a, r) => a + (r.height < r.rect.height ? r.height + EDGE : r.rect.height), 0) + GAP * (rects.length - 1) + FOOT
  const canvas = document.createElement('canvas')
  canvas.width = Math.round((w + PAD * 2) * s)
  canvas.height = Math.round((h + PAD * 2) * s)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = cssVar('--color-bg', '#111d36')
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const display = cssVar('--font-display', 'system-ui')
  const sans = getComputedStyle(document.body).fontFamily || 'system-ui'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = cssVar('--color-ink', '#eff4fa')
  ctx.font = `700 ${26 * s}px ${display}`
  ctx.fillText(title, PAD * s, (PAD + 28) * s, w * s)
  ctx.fillStyle = cssVar('--color-ink-dim', '#bdccde')
  ctx.font = `500 ${15 * s}px ${sans}`
  ctx.fillText(caption, PAD * s, (PAD + 52) * s, w * s)

  const panel = cssVar('--color-panel', '#182740')
  let y = PAD + HEAD
  for (const { rect: r, height, cover } of rects) {
    const keep = height < r.height ? height : r.height - EDGE
    ctx.drawImage(bmp, r.left * s, r.top * s, r.width * s, keep * s, PAD * s, y * s, r.width * s, keep * s)
    // the card's own bottom padding, border and rounded corners close it, trimmed or not
    ctx.drawImage(bmp, r.left * s, (r.bottom - EDGE) * s, r.width * s, EDGE * s, PAD * s, (y + keep) * s, r.width * s, EDGE * s)
    ctx.fillStyle = panel
    for (const c of cover) if (c.y < keep) ctx.fillRect((PAD + c.x) * s, (y + c.y) * s, c.w * s, Math.min(c.h, keep - c.y) * s)
    y += keep + EDGE + GAP
  }
  bmp.close()

  ctx.fillStyle = cssVar('--color-ink-faint', '#9aadc4')
  ctx.font = `600 ${13 * s}px ${display}`
  ctx.textAlign = 'right'
  ctx.fillText('Ridden on FreeGaz · the trainer app with no subscription', (PAD + w) * s, (y - GAP + FOOT - 8) * s)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null
}
