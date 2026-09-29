// The phone remote page: one self-contained HTML document (no external
// assets), served with a nonce-based CSP. Big glanceable numbers + buttons.

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
<meta name="theme-color" content="#090b0f">
<title>FreeGaz remote</title>
<style>
  :root { color-scheme: dark; --bg:#090b0f; --panel:#10131a; --line:#252b3a; --ink:#e9edf4; --dim:#a3acbb; --accent:#ff3d81; --power:#fbbf24; --hr:#ff4d6d; --cad:#38bdf8; --good:#22c55e; --bad:#ef4444; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px -apple-system, system-ui, sans-serif; padding: max(12px, env(safe-area-inset-top)) 12px 24px; }
  header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
  .brand { font-weight:900; letter-spacing:-.02em; } .brand b { color:var(--accent); }
  .status { font-size:12px; color:var(--dim); }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
  .tile { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:12px 14px; }
  .tile.big { grid-column: span 2; }
  .label { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--dim); }
  .value { font-weight:800; font-variant-numeric: tabular-nums; font-size:40px; line-height:1.1; }
  .big .value { font-size:72px; }
  .unit { font-size:14px; color:var(--dim); margin-left:4px; font-weight:500; }
  .sub { font-size:13px; color:var(--dim); margin-top:4px; min-height:1.2em; }
  .controls { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-top:12px; }
  button { font:inherit; font-weight:700; color:var(--ink); background:#1d2230; border:1px solid var(--line); border-radius:14px; padding:18px 8px; }
  button:active { transform: scale(.97); }
  .wide { grid-column: span 3; } .primary { background: var(--accent); border-color: var(--accent); }
  .muted { color:var(--dim); } .center { text-align:center; }
  .coach { margin-top:12px; font-size:15px; font-style:italic; color:var(--dim); min-height:1.4em; }
</style>
</head>
<body>
<header><div class="brand">Free<b>Gaz</b> remote</div><div class="status" id="status">connecting…</div></header>
<div class="grid">
  <div class="tile big"><div class="label">Power · 3 s</div><div><span class="value" id="power" style="color:var(--power)">—</span><span class="unit">W</span></div><div class="sub" id="target"></div></div>
  <div class="tile"><div class="label">Heart rate</div><div><span class="value" id="hr" style="color:var(--hr)">—</span><span class="unit">bpm</span></div></div>
  <div class="tile"><div class="label">Cadence</div><div><span class="value" id="cad" style="color:var(--cad)">—</span><span class="unit">rpm</span></div></div>
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
