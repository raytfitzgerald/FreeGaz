// The phone remote page: one self-contained HTML document (no external
// assets), served with a nonce-based CSP. Big glanceable numbers + buttons, in
// the FreeGaz night palette (docs/BRAND.md). The CSP loads no fonts, so it
// uses the phone's own; the wordmark is outlined paths and needs none.
import { BRAND_COLORS, wordmarkSvg } from '@shared/brand'

export function phonePage(opts: { nonce: string; wsPath: string; allowControl: boolean }): string {
  const controls = opts.allowControl
    ? `<div class="controls">
      <button data-cmd='{"type":"togglePause"}' class="wide primary" id="pause">Pause</button>
      <button data-cmd='{"type":"intensity","deltaPct":-1}'>−1 %</button>
      <button data-cmd='{"type":"intensity","deltaPct":1}'>+1 %</button>
      <button data-cmd='{"type":"skip"}'>Skip</button>
      <button data-cmd='{"type":"extend","seconds":30}'>+30 s</button>
      <button data-cmd='{"type":"lap"}'>Lap</button>
      <button data-cmd='{"type":"muteCoach"}'>Mute coach</button>
    </div>`
    : `<p class="muted center">View-only. Enable control on the Mac to use buttons.</p>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#111d36">
<title>FreeGaz remote</title>
<style>
  :root { color-scheme: dark; --bg:#111d36; --panel:#182740; --panel2:#1f2f49; --line:#32425a; --ink:#eff4fa; --dim:#bdccde; --faint:#9aadc4; --accent:#77c3ff; --on-accent:#111d36; --power:#cf8020; --hr:#dc374f; --cad:#348dd7; --good:#6add88; --bad:#ff8a88; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px -apple-system, system-ui, sans-serif; padding: max(12px, env(safe-area-inset-top)) 12px 24px; }
  header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
  .brand { display:flex; align-items:flex-end; gap:8px; color:var(--dim); font-size:13px; } .brand svg { height:26px; width:auto; display:block; }
  .status { font-size:12px; color:var(--dim); }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
  .tile { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
  .tile.big { grid-column: span 2; }
  .label { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.09em; color:var(--faint); }
  .label i { display:inline-block; width:12px; height:3px; border-radius:2px; }
  .value { font-weight:700; font-variant-numeric: tabular-nums; font-size:40px; line-height:1.1; color:var(--ink); }
  .big .value { font-size:72px; }
  .unit { font-size:14px; color:var(--dim); margin-left:4px; font-weight:500; }
  .sub { font-size:13px; color:var(--dim); margin-top:4px; min-height:1.2em; }
  .controls { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-top:12px; }
  button { font:inherit; font-weight:700; color:var(--ink); background:var(--panel2); border:1px solid var(--line); border-radius:8px; padding:18px 8px; }
  button:active { transform: scale(.97); }
  .wide { grid-column: span 3; } .primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .muted { color:var(--dim); } .center { text-align:center; }
  .coach { margin-top:12px; font-size:15px; font-style:italic; color:var(--dim); min-height:1.4em; }
</style>
</head>
<body>
<header><div class="brand">${wordmarkSvg(BRAND_COLORS.chalk)}<span>remote</span></div><div class="status" id="status">connecting…</div></header>
<div class="grid">
  <div class="tile big"><div class="label"><i style="background:var(--power)"></i>Power · 3 s</div><div><span class="value" id="power">—</span><span class="unit">W</span></div><div class="sub" id="target"></div></div>
  <div class="tile"><div class="label"><i style="background:var(--hr)"></i>Heart rate</div><div><span class="value" id="hr">—</span><span class="unit">bpm</span></div></div>
  <div class="tile"><div class="label"><i style="background:var(--cad)"></i>Cadence</div><div><span class="value" id="cad">—</span><span class="unit">rpm</span></div></div>
  <div class="tile"><div class="label">Interval</div><div><span class="value" id="seg">—</span></div><div class="sub" id="seglabel"></div></div>
  <div class="tile"><div class="label">Elapsed</div><div><span class="value" id="elapsed">—</span></div><div class="sub" id="tss"></div></div>
</div>
${controls}
<div class="coach" id="coach"></div>
<script nonce="${opts.nonce}">
(() => {
  const $ = (id) => document.getElementById(id);
  const fmt = (s) => { if (s == null) return '—'; s = Math.max(0, Math.round(s)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return (h ? h + ':' + String(m).padStart(2,'0') : m) + ':' + String(x).padStart(2,'0'); };
  let ws, retry = 0;
  function connect() {
    ws = new WebSocket('ws://' + location.host + ${JSON.stringify(opts.wsPath)});
    ws.onopen = () => { retry = 0; $('status').textContent = 'live'; };
    ws.onclose = () => { $('status').textContent = 'reconnecting…'; setTimeout(connect, Math.min(5000, 500 * ++retry)); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type !== 'live') return;
      const f = m.data.frame, r = m.data.ride;
      $('power').textContent = f.power3s ?? '—';
      $('hr').textContent = f.hr ?? '—';
      $('cad').textContent = f.cadence ?? '—';
      $('target').textContent = f.trainer.targetW != null ? 'Target ' + f.trainer.targetW + ' W · ' + f.trainer.intensityPct + ' %' : (f.trainer.gradePct != null ? 'Grade ' + f.trainer.gradePct.toFixed(1) + ' %' : '');
      $('seg').textContent = r ? fmt(r.segmentRemainingS) : '—';
      $('seglabel').textContent = r && r.segmentLabel ? r.segmentLabel + (r.nextLabel ? ' → ' + r.nextLabel : '') : '';
      $('elapsed').textContent = r ? fmt(r.movingS) : '—';
      $('tss').textContent = r && r.tss != null ? 'TSS ' + Math.round(r.tss) + ' · ' + Math.round(r.kj) + ' kJ' : '';
      $('coach').textContent = r && r.coachLine ? '“' + r.coachLine + '”' : '';
      const p = $('pause'); if (p && r) p.textContent = r.state === 'paused' ? 'Resume' : 'Pause';
    };
  }
  document.querySelectorAll('button[data-cmd]').forEach((b) => b.addEventListener('click', () => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ cmd: JSON.parse(b.dataset.cmd) }));
    if (navigator.vibrate) navigator.vibrate(15);
  }));
  connect();
})();
</script>
</body>
</html>`
}
