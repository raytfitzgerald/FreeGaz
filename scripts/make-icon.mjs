// Renders the app icon: a power gauge in the seven Coggan zone colours with
// the needle at threshold, on a dark macOS-style tile. Writes build/icon.svg
// (the source) and build/icon.png (1024 px, used by electron-builder).
// Run: npx electron scripts/make-icon.mjs
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const S = 1024
const cx = 512
const cy = 560
const r = 300
const ZONES = ['#8a939e', '#2f8cf0', '#2fb35c', '#f2c230', '#f58b1f', '#e2474b', '#9d6ad8']
const START = 135
const SWEEP = 270
const GAP = 3.2

const pt = (deg, rad) => {
  const t = (deg * Math.PI) / 180
  return [cx + rad * Math.cos(t), cy + rad * Math.sin(t)]
}
const arc = (a0, a1) => {
  const [x0, y0] = pt(a0, r)
  const [x1, y1] = pt(a1, r)
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}
const seg = SWEEP / ZONES.length
const segments = ZONES.map((c, i) => `<path d="${arc(START + i * seg + GAP / 2, START + (i + 1) * seg - GAP / 2)}" stroke="${c}" stroke-width="78" fill="none" stroke-linecap="butt"/>`).join('\n  ')
// Needle at the top of zone 4 (threshold): 3.6 of 7 zones round the dial.
const needleDeg = START + seg * 3.6
const [tx, ty] = pt(needleDeg, 262)
const [lx, ly] = pt(needleDeg - 90, 26)
const [rx, ry] = pt(needleDeg + 90, 26)
const ticks = Array.from({ length: 29 }, (_, i) => {
  const d = START + (SWEEP / 28) * i
  const [a, b] = pt(d, 222)
  const [c, e] = pt(d, i % 4 === 0 ? 196 : 208)
  return `<line x1="${a.toFixed(1)}" y1="${b.toFixed(1)}" x2="${c.toFixed(1)}" y2="${e.toFixed(1)}" stroke="#ffffff" stroke-opacity="${i % 4 === 0 ? 0.55 : 0.25}" stroke-width="${i % 4 === 0 ? 7 : 4}" stroke-linecap="round"/>`
}).join('\n  ')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d2836"/>
      <stop offset="1" stop-color="#0b1119"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.55" r="0.5">
      <stop offset="0" stop-color="#f2c230" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#f2c230" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#bg)"/>
  <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#glow)"/>
  <rect x="101.5" y="101.5" width="821" height="821" rx="184.5" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="3"/>
  ${ticks}
  ${segments}
  <path d="M${lx.toFixed(1)} ${ly.toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)} L${rx.toFixed(1)} ${ry.toFixed(1)} Z" fill="#ffffff"/>
  <circle cx="${cx}" cy="${cy}" r="54" fill="#ffffff"/>
  <circle cx="${cx}" cy="${cy}" r="24" fill="#0b1119"/>
</svg>
`

const out = join(import.meta.dirname, '..', 'build')
writeFileSync(join(out, 'icon.svg'), svg)

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: S, height: S, show: false, frame: false, transparent: true, backgroundColor: '#00000000', useContentSize: true, webPreferences: { offscreen: true } })
  const html = `<!doctype html><html style="background:transparent"><body style="margin:0;overflow:hidden;background:transparent"><img style="display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${S}" height="${S}"></body></html>`
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: S, height: S })
  writeFileSync(join(out, 'icon.png'), img.resize({ width: S, height: S }).toPNG())
  console.log('wrote build/icon.svg and build/icon.png', img.getSize())
  app.quit()
})
