import { Painter } from '../../../engine/Paint';
import { TAU } from '../../../engine/math';
import { css } from '../../ghibli/characterTextures';

/*
 * Painted canvas textures for Howl's meadow, the moving castle and the room inside it. Tiling textures are
 * meant for geometry with UVs in world units (boxUV / repeatUV); each says how many units one tile covers.
 */

/**
 * A half-timbered wall with one shuttered window, for the little houses heaped on the castle. One tile covers
 * 4 x 4 units. Returns the colour map and an emissive map in which the window glass glows when `lit`.
 */
export function timberWall(o: { wall: number; beam: number; shutter: number; lit: boolean; seed: number }) {
  const S = 256;
  const col = new Painter(S, S, o.seed).fill(css(o.wall));
  const glo = new Painter(S, S, o.seed).fill('#000');
  const g = col.g;
  col.dabs({ n: 50, colors: [css(o.wall, 1.05), css(o.wall, 0.9), css(o.wall, 0.95, 0x8a7a5a, 0.3)], r: [6, 26], alpha: [0.1, 0.22], squash: 0.7 });
  // timber frame: posts at both edges, a rail across the middle and at the top, two braces
  g.fillStyle = css(o.beam);
  g.fillRect(0, 0, 14, S); g.fillRect(S - 14, 0, 14, S);
  g.fillRect(0, 0, S, 12); g.fillRect(0, S * 0.62, S, 12);
  g.lineWidth = 11; g.strokeStyle = css(o.beam);
  g.beginPath(); g.moveTo(14, S * 0.62 + 12); g.lineTo(S * 0.36, S); g.moveTo(S - 14, S * 0.62 + 12); g.lineTo(S * 0.64, S); g.stroke();
  // the window, with open shutters either side
  const x = S * 0.36, y = S * 0.17, w = S * 0.28, h = S * 0.36;
  g.fillStyle = css(o.beam, 0.8); g.fillRect(x - 6, y - 6, w + 12, h + 14);
  const glass = (p: Painter, lit: boolean) => {
    const gr = p.g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, lit ? '#ffe2a0' : '#4a5a74'); gr.addColorStop(1, lit ? '#f0a050' : '#2a3448');
    p.g.fillStyle = gr; p.g.fillRect(x, y, w, h);
    p.g.fillStyle = lit ? '#3a2416' : css(o.beam, 0.8); p.g.fillRect(x + w / 2 - 3, y, 6, h); p.g.fillRect(x, y + h * 0.45, w, 6);
  };
  glass(col, o.lit);
  if (o.lit) glass(glo, true);
  else { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w * 0.45, h * 0.4); }
  for (const s of [-1, 1]) {
    const sx = s < 0 ? x - w * 0.52 - 4 : x + w + 4;
    g.fillStyle = css(o.shutter); g.fillRect(sx, y - 2, w * 0.52, h + 4);
    g.fillStyle = css(o.shutter, 0.7);
    for (let k = 1; k < 4; k++) g.fillRect(sx, y - 2 + k * (h + 4) / 4, w * 0.52, 3);
  }
  g.fillStyle = css(o.beam, 1.1); g.fillRect(x - 10, y + h + 4, w + 20, 7);
  // damp and soot streaks
  col.lines({ n: 10, colors: ['rgba(60,50,40,1)'], alpha: [0.05, 0.12], width: [3, 9], vertical: true, wobble: 2 });
  return { map: col.texture({ repeat: [1, 1] }), glow: glo.texture({ repeat: [1, 1] }) };
}

/** Curved clay roof tiles in overlapping rows, with moss here and there. One tile covers 3 x 3 units. */
export function clayTiles(color: number, seed = 601) {
  const S = 256;
  const p = new Painter(S, S, seed).fill(css(color, 0.55));
  const g = p.g, rng = p.rng;
  const rows = 10, cols = 8, rh = S / rows, cw = S / cols;
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const x = (c + (r % 2) * 0.5) * cw, y = r * rh;
    const tone = rng.range(0.85, 1.15);
    const gr = g.createLinearGradient(x, 0, x + cw, 0);
    gr.addColorStop(0, css(color, tone * 0.75)); gr.addColorStop(0.45, css(color, tone * 1.12)); gr.addColorStop(1, css(color, tone * 0.7));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + cw - 1, y); g.lineTo(x + cw - 1, y + rh + 3); g.quadraticCurveTo(x + cw / 2, y + rh + 8, x + 1, y + rh + 3); g.fill();
  }
  p.dabs({ n: 30, colors: ['#6a7a3a', '#8a8a4a', '#4a5a2a'], r: [3, 10], alpha: [0.2, 0.45], squash: 0.6 });
  return p.texture({ repeat: [1, 1] });
}

/** Weathered brick in running bond, for chimneys and the hearth. One tile covers 2 x 2 units. */
export function brick(color: number, seed = 611) {
  const S = 128;
  const p = new Painter(S, S, seed).fill(css(color, 0.55, 0x9a9080, 0.4));
  const g = p.g, rng = p.rng;
  const rows = 8, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -16 : 0;
    while (x < S) { const w = 32; g.fillStyle = css(color, rng.range(0.82, 1.15)); g.fillRect(x + 1.5, r * rh + 1.5, w - 3, rh - 3); x += w; }
  }
  p.dabs({ n: 24, colors: ['#2a2420', '#5a4a40'], r: [3, 12], alpha: [0.1, 0.25] });
  return p.texture({ repeat: [1, 1] });
}

/** Rough fieldstone blocks for the hearth and the castle's footings. One tile covers 3 x 3 units. */
export function fieldstone(color: number, seed = 621) {
  const S = 256;
  const p = new Painter(S, S, seed).fill(css(color, 0.5));
  const g = p.g, rng = p.rng;
  for (let r = 0; r < 6; r++) {
    let x = -rng.range(0, 40);
    while (x < S) {
      const w = rng.range(36, 70), h = S / 6;
      g.fillStyle = css(color, rng.range(0.8, 1.15), 0x8a7a60, rng.range(0, 0.3));
      g.beginPath(); g.roundRect(x + 3, r * h + 3, w - 6, h - 6, 10); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); g.roundRect(x + 5, r * h + 5, w - 12, 6, 3); g.fill();
      x += w;
    }
  }
  p.dabs({ n: 120, colors: [css(color, 1.2), css(color, 0.7)], r: [1, 3], alpha: [0.2, 0.5] });
  return p.texture({ repeat: [1, 1] });
}

/** Plaster for the room's upper walls: warm cream with smoky patches and hairline cracks. One tile covers 4 x 4. */
export function plaster(color: number, seed = 631) {
  const S = 256;
  const p = new Painter(S, S, seed).fill(css(color));
  p.dabs({ n: 70, colors: [css(color, 1.06), css(color, 0.9), css(color, 0.85, 0x6a5040, 0.3)], r: [8, 40], alpha: [0.08, 0.2], squash: 0.8 });
  const g = p.g, rng = p.rng;
  g.strokeStyle = css(color, 0.65); g.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    let x = rng.range(0, S), y = rng.range(0, S);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += rng.range(-14, 14); y += rng.range(4, 16); g.lineTo(x, y); }
    g.stroke();
  }
  p.vgrad([[0, 'rgba(60,40,30,0.18)'], [0.25, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']]);
  return p.texture({ repeat: [1, 1] });
}

/** Dark wood panelling: vertical boards with a moulded top rail. One tile covers 2 units across and 2 up. */
export function panelling(color: number, seed = 641) {
  const S = 128;
  const p = new Painter(S, S, seed).fill(css(color));
  const g = p.g;
  for (let i = 0; i < 4; i++) { g.fillStyle = css(color, 0.6); g.fillRect(i * 32, 0, 2.5, S); g.fillStyle = css(color, 1.25); g.fillRect(i * 32 + 2.5, 0, 1.5, S); }
  p.lines({ n: 26, colors: [css(color, 0.8), css(color, 1.2)], alpha: [0.2, 0.45], width: [1, 2], vertical: true, wobble: 1.5 });
  return p.texture({ repeat: [1, 1] });
}

/** Planks for a door: vertical boards with grain and nail heads. Covers the whole door (UV 0..1). */
export function doorBoards(color: number, seed = 651) {
  const W = 256, H = 512;
  const p = new Painter(W, H, seed).fill(css(color, 0.5));
  const g = p.g, rng = p.rng;
  const n = 5, bw = W / n;
  for (let i = 0; i < n; i++) {
    const tone = rng.range(0.88, 1.12);
    g.fillStyle = css(color, tone); g.fillRect(i * bw + 2, 0, bw - 4, H);
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = css(color, tone * 0.75); g.globalAlpha = rng.range(0.25, 0.5); g.lineWidth = rng.range(1, 2);
      const gx = i * bw + rng.range(6, bw - 6);
      g.beginPath(); g.moveTo(gx, 0);
      for (let y = 0; y <= H; y += 32) g.lineTo(gx + Math.sin(y * 0.02 + k + i) * 3, y);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  p.vgrad([[0, 'rgba(0,0,0,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(30,20,10,0.25)']]);
  return p.texture({ wrap: false });
}

/** Overlapping scales for the castle's bird legs (a cylinder: u around, v along). */
export function legScales(color: number, seed = 661) {
  const W = 128, H = 256;
  const p = new Painter(W, H, seed).fill(css(color, 0.6));
  const g = p.g, rng = p.rng;
  const rows = 14, cols = 5;
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const x = (c + (r % 2) * 0.5) * (W / cols), y = r * (H / rows), w = W / cols, h = H / rows;
    const gr = g.createLinearGradient(0, y, 0, y + h * 1.3);
    gr.addColorStop(0, css(color, rng.range(1.05, 1.2))); gr.addColorStop(1, css(color, 0.72));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h * 0.7); g.quadraticCurveTo(x + w / 2, y + h * 1.35, x, y + h * 0.7); g.fill();
    g.strokeStyle = css(color, 0.5); g.lineWidth = 1.2; g.stroke();
  }
  return p.texture({ repeat: [2, 2] });
}

/**
 * A painted view of the meadow at golden hour, for the room's windows: warm sky, snowy peaks, the lake and
 * flowers in the grass. `variant` shifts the composition so the windows do not all show the same picture.
 */
export function meadowView(variant: number) {
  const W = 512, H = 512;
  const p = new Painter(W, H, 671 + variant * 7);
  const g = p.g, rng = p.rng;
  p.vgrad([[0, '#6aa0d8'], [0.35, '#b8d4e4'], [0.55, '#ffe0b0'], [0.62, '#ffd8a0']]);
  // a sun glow low on one side
  const sx = variant % 2 ? W * 0.2 : W * 0.8;
  const sg = g.createRadialGradient(sx, H * 0.5, 4, sx, H * 0.5, 220);
  sg.addColorStop(0, 'rgba(255,240,200,0.9)'); sg.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
  // clouds
  for (let i = 0; i < 5; i++) {
    const cx = rng.range(0, W), cy = rng.range(H * 0.12, H * 0.38);
    for (let k = 0; k < 8; k++) { g.fillStyle = `rgba(255,${rng.int(240, 252)},${rng.int(228, 245)},0.85)`; g.beginPath(); g.ellipse(cx + rng.range(-50, 50), cy + rng.range(-12, 6), rng.range(20, 44), rng.range(14, 26), 0, 0, TAU); g.fill(); }
  }
  // snowy peaks
  const ridge = (y0: number, amp: number, fill: string, snow: boolean) => {
    g.beginPath(); g.moveTo(0, H);
    const pts: Array<[number, number]> = [];
    let x = 0;
    while (x <= W + 40) { pts.push([x, y0 - rng.range(0.2, 1) * amp]); x += rng.range(30, 70); pts.push([x, y0 - rng.range(0, 0.35) * amp]); x += rng.range(20, 50); }
    for (const [px, py] of pts) g.lineTo(px, py);
    g.lineTo(W, H); g.closePath(); g.fillStyle = fill; g.fill();
    if (snow) {
      g.save(); g.clip();
      g.fillStyle = '#f4f0f4';
      for (const [px, py] of pts) { if (py < y0 - amp * 0.5) { g.beginPath(); g.moveTo(px - 30, py + 40); g.lineTo(px, py - 2); g.lineTo(px + 30, py + 40); g.closePath(); g.fill(); } }
      g.restore();
    }
  };
  ridge(H * 0.56, 150, '#8a9ab8', true);
  ridge(H * 0.6, 60, '#4a6a5a', false);
  // lake with the sky in it, then the meadow
  const lg = g.createLinearGradient(0, H * 0.6, 0, H * 0.72);
  lg.addColorStop(0, '#a8c8dc'); lg.addColorStop(1, '#6a98b8');
  g.fillStyle = lg; g.fillRect(0, H * 0.6, W, H * 0.12);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 20; i++) g.fillRect(rng.range(0, W), rng.range(H * 0.61, H * 0.71), rng.range(10, 50), 1.5);
  const mg = g.createLinearGradient(0, H * 0.7, 0, H);
  mg.addColorStop(0, '#7aa848'); mg.addColorStop(1, '#3f7a30');
  g.fillStyle = mg;
  g.beginPath(); g.moveTo(0, H * 0.72); for (let x = 0; x <= W; x += 32) g.lineTo(x, H * 0.7 + Math.sin(x * 0.02 + variant) * 8); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  // flowers
  const fc = ['#fbf8ee', '#f7d43a', '#f2a0c0', '#8fb4f0', '#c890e0'];
  for (let i = 0; i < 700; i++) {
    const y = rng.range(H * 0.72, H), s = 1 + (y - H * 0.72) / (H * 0.28) * 4;
    g.fillStyle = rng.pick(fc); g.globalAlpha = 0.9;
    g.beginPath(); g.arc(rng.range(0, W), y, s * rng.range(0.6, 1.2), 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  // a tree on one side
  const tx = variant % 2 ? W * 0.82 : W * 0.15;
  g.fillStyle = '#4a3828'; g.fillRect(tx - 6, H * 0.6, 12, H * 0.2);
  for (let k = 0; k < 14; k++) { g.fillStyle = rng.pick(['#3f6a32', '#4f7a3a', '#2f5a2a']); g.beginPath(); g.arc(tx + rng.range(-46, 46), H * 0.55 + rng.range(-40, 30), rng.range(18, 34), 0, TAU); g.fill(); }
  const t = p.texture({ wrap: false });
  return t;
}

/** The colour dial beside the inner door: four coloured quarters (green, red, blue, black) in a brass rim. */
export function dialFace() {
  const S = 256, c = S / 2;
  const p = new Painter(S, S, 681);
  const g = p.g;
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#7a5a2a'; g.beginPath(); g.arc(c, c, 126, 0, TAU); g.fill();
  const rim = g.createRadialGradient(c - 30, c - 30, 10, c, c, 126);
  rim.addColorStop(0, '#f4d690'); rim.addColorStop(0.7, '#c8962e'); rim.addColorStop(1, '#6a4a1a');
  g.fillStyle = rim; g.beginPath(); g.arc(c, c, 122, 0, TAU); g.fill();
  // quarters, starting with green at the top and going clockwise: green, red, blue, black
  const cols = ['#3a9a4a', '#c8382e', '#2f5ab8', '#1a1a1e'];
  for (let i = 0; i < 4; i++) {
    const a0 = -Math.PI / 2 - Math.PI / 4 + i * (Math.PI / 2);
    g.fillStyle = cols[i];
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, 100, a0, a0 + Math.PI / 2); g.closePath(); g.fill();
    g.strokeStyle = '#6a4a1a'; g.lineWidth = 4; g.stroke();
  }
  const sh = g.createRadialGradient(c - 40, c - 40, 4, c, c, 100);
  sh.addColorStop(0, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.6, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = sh; g.beginPath(); g.arc(c, c, 100, 0, TAU); g.fill();
  g.fillStyle = '#c8962e'; g.beginPath(); g.arc(c, c, 16, 0, TAU); g.fill();
  g.fillStyle = '#f4d690'; g.beginPath(); g.arc(c - 4, c - 4, 6, 0, TAU); g.fill();
  return p.texture({ wrap: false });
}

/** Turnip Head's head (a sphere facing +z): a white turnip with a purple crown and a painted scarecrow face. */
export function turnipFace() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 691).fill('#f2efe6');
  p.vgrad([[0, '#7a3a8a'], [0.2, '#9a4a9a'], [0.34, '#c890c0'], [0.42, '#f0e8ea'], [0.8, '#f2efe6'], [1, '#d8d0c0']]);
  p.lines({ n: 50, colors: ['rgba(140,110,120,1)', 'rgba(255,255,255,1)'], alpha: [0.06, 0.16], width: [1, 2.5], vertical: true, wobble: 3 });
  p.dabs({ n: 30, colors: ['#e8dcd0', '#fffaf2'], r: [4, 14], alpha: [0.15, 0.3], squash: 1.6 });
  // eyes: two black ovals; a little curved nose; a wide stitched smile
  for (const s of [-1, 1]) p.at([s * 0.36, 0.06, 0.93], (c) => { c.fillStyle = '#16121a'; c.beginPath(); c.ellipse(0, 0, 9, 14, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(-3, -5, 3, 0, TAU); c.fill(); });
  p.at([0, -0.08, 1], (c) => { c.strokeStyle = '#4a3a3a'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-2, -8); c.quadraticCurveTo(5, 2, -3, 6); c.stroke(); });
  p.at([0, -0.3, 0.95], (c) => {
    c.strokeStyle = '#2a1a1e'; c.lineWidth = 3.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-30, -6); c.quadraticCurveTo(0, 14, 30, -6); c.stroke();
    c.lineWidth = 2; for (let k = -3; k <= 3; k++) { const x = k * 8.5, y = 4 + (1 - (k / 3.6) ** 2) * 6 - 6; c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.stroke(); }
  });
  for (const s of [-1, 1]) p.at([s * 0.6, -0.16, 0.78], (c) => { c.fillStyle = 'rgba(230,120,130,0.35)'; c.beginPath(); c.ellipse(0, 0, 12, 7, 0, 0, TAU); c.fill(); });
  return p.texture();
}

/**
 * Raggedy coat cloth for a cylinder: faded ochre wool with darned patches and stitches, and a torn hem cut out
 * of the alpha at the bottom of the canvas (use with alphaTest).
 */
export function raggedCoat(color: number, seed = 701) {
  const W = 256, H = 256;
  const p = new Painter(W, H, seed).fill(css(color));
  const g = p.g, rng = p.rng;
  p.dabs({ n: 40, colors: [css(color, 1.08), css(color, 0.85)], r: [6, 22], alpha: [0.12, 0.25], squash: 1.4 });
  for (let i = 0; i < 6; i++) {
    const x = rng.range(10, W - 50), y = rng.range(20, H - 80), w = rng.range(26, 44), h = rng.range(22, 40);
    g.fillStyle = rng.pick(['#6a7a5a', '#8a5a3a', '#5a5a6a', '#a8884a']);
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#2a2018'; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.strokeRect(x + 2, y + 2, w - 4, h - 4); g.setLineDash([]);
  }
  p.lines({ n: 30, colors: ['rgba(0,0,0,1)'], alpha: [0.06, 0.14], width: [2, 6], vertical: true, wobble: 2 });
  p.vgrad([[0, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(30,20,10,0.35)']]);
  // torn hem: cut ragged triangles out of the bottom edge
  g.globalCompositeOperation = 'destination-out';
  let x = 0;
  while (x < W) { const w = rng.range(8, 22), d = rng.range(10, 34); g.beginPath(); g.moveTo(x, H); g.lineTo(x + w / 2, H - d); g.lineTo(x + w, H); g.fill(); x += w * rng.range(0.6, 1); }
  g.globalCompositeOperation = 'source-over';
  return p.texture();
}

/** Calcifer's eye (a sphere facing +z): white, with a big dark pupil ringed in orange. */
export function calciferEye() {
  const p = new Painter(256, 128, 711).fill('#fffdf4');
  p.at([0, 0, 1], (c) => {
    c.fillStyle = '#e88a20'; c.beginPath(); c.ellipse(0, 0, 18, 22, 0, 0, TAU); c.fill();
    c.fillStyle = '#140c08'; c.beginPath(); c.ellipse(0, 1, 13, 17, 0, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(-5, -7, 4, 0, TAU); c.fill();
  });
  return p.texture();
}

/** Calcifer's mouth: a wide dark crescent with a glowing inside (top of the canvas is the upper lip). */
export function calciferMouth() {
  const p = new Painter(256, 128, 721);
  const g = p.g;
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = '#5a1006';
  g.beginPath(); g.moveTo(8, 18); g.quadraticCurveTo(128, 30, 248, 18); g.quadraticCurveTo(128, 150, 8, 18); g.fill();
  const gr = g.createRadialGradient(128, 70, 4, 128, 70, 80);
  gr.addColorStop(0, '#ff8a2a'); gr.addColorStop(0.6, '#a0280a'); gr.addColorStop(1, 'rgba(120,20,6,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(128, 70, 70, 34, 0, 0, TAU); g.fill();
  // small teeth along the top lip
  g.fillStyle = '#fff4dc';
  for (let i = 0; i < 6; i++) { const x = 70 + i * 23; g.beginPath(); g.moveTo(x - 7, 24); g.lineTo(x + 7, 24); g.lineTo(x, 36); g.fill(); }
  return p.texture({ wrap: false });
}

/** A soft, lumpy puff of smoke or spray: white, lighter on top, transparent at the edges. */
export function puffTexture() {
  const S = 128;
  const p = new Painter(S, S, 731);
  const g = p.g, rng = p.rng;
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, TAU), d = rng.range(0, 22);
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.8, r = rng.range(22, 34);
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.55, 'rgba(225,225,232,0.75)'); gr.addColorStop(1, 'rgba(200,200,215,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  return p.texture({ wrap: false });
}

/** A V of foam that trails behind something moving on water (top of the canvas is the front). */
export function wakeTexture() {
  const p = new Painter(128, 256, 741);
  const g = p.g;
  g.clearRect(0, 0, 128, 256);
  for (let k = 0; k < 160; k++) {
    const t = p.rng.next();
    for (const s of [-1, 1]) {
      const x = 64 + s * t * 58 + p.rng.range(-3, 3), y = t * 250;
      g.fillStyle = `rgba(240,248,250,${(1 - t) * p.rng.range(0.2, 0.55)})`;
      g.beginPath(); g.ellipse(x, y, p.rng.range(2, 6), p.rng.range(3, 9), 0, 0, TAU); g.fill();
    }
  }
  return p.texture({ wrap: false });
}

/** Breakfast on a plate seen from above: two fried eggs and rashers of bacon (a disc: centre of the canvas). */
export function breakfastPlate() {
  const S = 128, c = S / 2;
  const p = new Painter(S, S, 751).fill('#f4f0e6');
  const g = p.g;
  g.strokeStyle = '#3a6aa8'; g.lineWidth = 4; g.beginPath(); g.arc(c, c, 58, 0, TAU); g.stroke();
  g.fillStyle = '#b84a32';
  for (const [x, y, r] of [[c - 18, c + 18, 0.4], [c + 4, c + 26, -0.2]] as const) { g.save(); g.translate(x, y); g.rotate(r); g.fillRect(-20, -6, 40, 12); g.fillStyle = '#f0c8a8'; g.fillRect(-20, -2, 40, 3); g.fillStyle = '#b84a32'; g.restore(); }
  for (const [x, y] of [[c - 14, c - 12], [c + 18, c - 2]]) {
    g.fillStyle = '#fffcf2'; g.beginPath(); g.ellipse(x, y, 18, 15, 0.3, 0, TAU); g.fill();
    g.fillStyle = '#f6b81e'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x - 2, y - 2, 2, 0, TAU); g.fill();
  }
  return p.texture({ wrap: false });
}
