import * as THREE from 'three';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { css } from '../textures';
import { FUTURA } from '../film';
import { AC } from './plan';

/**
 * Painted textures for Asteroid City. The stage pieces are painted like scenery: the cyclorama sky with flat
 * puffy clouds, the floor cloth's sand, the strata on the mesa flats, the plywood backs with stencilled
 * labels. The house of the theatre is painted in greys (it is black and white, like the film's frame story).
 * Tiling textures say how much of the world one tile covers.
 */

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** A flat painted cumulus: round lobes on a flat base, lit from the upper right, lavender underneath. */
function cloud(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rng: Rng, night = false) {
  const lobes: Array<[number, number, number]> = [];
  const n = 5 + Math.floor(rng.next() * 4);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = h * (0.35 + 0.45 * Math.sin(t * Math.PI)) * rng.range(0.8, 1.15);
    lobes.push([x - w / 2 + t * w, y - r * 0.55, r]);
  }
  const base = night ? 'rgba(120,160,170,0.18)' : '#a8b4d8';
  const body = night ? 'rgba(160,200,200,0.22)' : '#fbf6f0';
  const lit = night ? 'rgba(200,230,230,0.2)' : '#ffffff';
  // the shadowed underside, then the body, then a highlight on the upper right of each lobe
  g.fillStyle = base;
  for (const [lx, ly, r] of lobes) { g.beginPath(); g.arc(lx, ly + r * 0.12, r, 0, TAU); g.fill(); }
  g.fillRect(x - w / 2 + h * 0.2, y - h * 0.3, w - h * 0.4, h * 0.3 + 2);
  g.fillStyle = body;
  for (const [lx, ly, r] of lobes) { g.beginPath(); g.arc(lx - r * 0.05, ly - r * 0.06, r * 0.93, 0, TAU); g.fill(); }
  g.fillStyle = lit;
  for (const [lx, ly, r] of lobes) { g.beginPath(); g.arc(lx + r * 0.22, ly - r * 0.28, r * 0.5, 0, TAU); g.fill(); }
  // a flat bottom, cut straight like a painted cut-out
  g.fillStyle = base;
  g.fillRect(x - w / 2 + h * 0.25, y - 2, w - h * 0.5, 4);
}

/** Painted ranges of distant mesas along the bottom of a backdrop (flat colour bands, no detail). */
function ranges(g: CanvasRenderingContext2D, W: number, H: number, rng: Rng, cols: string[], tops: [number, number][]) {
  tops.forEach(([y0, amp], k) => {
    g.fillStyle = cols[k];
    g.beginPath(); g.moveTo(0, H);
    let x = 0;
    g.lineTo(0, y0);
    while (x < W) {
      // a mesa: a sloped flank, a long flat top, another flank; then a dip
      const flank = rng.range(8, 30), top = rng.range(40, 160), gap = rng.range(20, 120);
      const hTop = y0 - rng.range(0.3, 1) * amp;
      g.lineTo(x + flank, hTop); g.lineTo(x + flank + top, hTop); g.lineTo(x + flank * 2 + top, y0);
      x += flank * 2 + top; g.lineTo(x + gap, y0 + rng.range(-4, 4)); x += gap;
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  });
}

/**
 * The cyclorama by day: a turquoise sky deepening upwards, warm haze at the horizon, flat painted clouds and
 * a band of distant mesas at the bottom. Faint vertical seams where the cloth's widths are sewn together.
 * Wraps left to right; u runs along the cyclorama, v from the floor (bottom) to the grid (top).
 */
export function cycDay(seed = 401) {
  const W = 2048, H = 512;
  const p = new Painter(W, H, seed);
  const g = p.g, rng = p.rng;
  p.vgrad([[0, css(AC.skyDeep, 0.9)], [0.35, css(AC.sky)], [0.68, css(AC.skyPale)], [0.82, css(AC.haze)], [1, css(0xf8d8b8)]]);
  // soft brush marks in the sky: it is a painted cloth
  p.dabs({ n: 140, colors: [css(AC.sky, 1.06), css(AC.sky, 0.95), css(AC.skyPale, 1.02)], r: [20, 70], alpha: [0.05, 0.1], squash: 0.35, y: [0, 0.75] });
  for (let i = 0; i < 9; i++) {
    const x = (i / 9) * W + rng.range(-60, 60), y = rng.range(H * 0.18, H * 0.6), w = rng.range(160, 300);
    cloud(g, x, y, w, w * rng.range(0.28, 0.36), rng);
    if (x + w / 2 > W) cloud(g, x - W, y, w, w * 0.3, new Rng(seed + i));
  }
  ranges(g, W, H, rng, [css(0xe8b8a4), css(0xd89888), css(0xc87a6a)], [[H * 0.86, 40], [H * 0.9, 34], [H * 0.95, 26]]);
  // seams between the widths of cloth
  for (let x = 0; x < W; x += 256) { g.fillStyle = 'rgba(40,60,80,0.05)'; g.fillRect(x, 0, 3, H); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 3, 0, 2, H); }
  const t = p.texture();
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** The cyclorama at night: deep teal to green at the horizon, painted stars, dark mesas. */
export function cycNight(seed = 403) {
  const W = 2048, H = 512;
  const p = new Painter(W, H, seed);
  const g = p.g, rng = p.rng;
  p.vgrad([[0, css(AC.nightTop)], [0.5, css(0x0c3a46)], [0.8, css(AC.nightMid)], [0.9, css(AC.nightLow)], [1, css(0x3a7a68)]]);
  // a faint band of the Milky Way across the sky
  g.save(); g.globalAlpha = 0.12;
  for (let i = 0; i < 160; i++) {
    const x = rng.range(0, W), y = H * 0.3 + Math.sin((x / W) * TAU * 2) * H * 0.12 + rng.range(-40, 40);
    const gr = g.createRadialGradient(x, y, 0, x, y, rng.range(20, 60));
    gr.addColorStop(0, 'rgba(200,240,240,0.8)'); gr.addColorStop(1, 'rgba(200,240,240,0)');
    g.fillStyle = gr; g.fillRect(x - 60, y - 60, 120, 120);
  }
  g.restore();
  for (let i = 0; i < 900; i++) {
    const x = rng.range(0, W), y = rng.range(0, H * 0.82), r = rng.next() < 0.92 ? rng.range(0.6, 1.4) : rng.range(1.8, 2.6);
    g.fillStyle = rng.pick(['#fffbe8', '#e8f6ff', '#fff0c8']);
    g.globalAlpha = rng.range(0.5, 1);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (r > 1.8) { g.fillRect(x - r * 3, y - 0.5, r * 6, 1); g.fillRect(x - 0.5, y - r * 3, 1, r * 6); }
  }
  g.globalAlpha = 1;
  ranges(g, W, H, new Rng(seed + 1), [css(0x1e4a4a), css(0x163a3e), css(0x0f2e34)], [[H * 0.86, 40], [H * 0.9, 34], [H * 0.95, 26]]);
  const t = p.texture();
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/**
 * A sky border: a strip of painted sky cloth that hangs from the grid, deepening upwards like the top of the
 * cyclorama, with a soft cloud here and there and a sewn hem. One tile = 60 x 13 units.
 */
export function skyBorder(seed = 405) {
  const W = 1024, H = 192;
  const p = new Painter(W, H, seed);
  const g = p.g, rng = p.rng;
  p.vgrad([[0, css(AC.skyDeep, 0.88)], [1, css(AC.skyDeep, 1.0, AC.sky, 0.55)]]);
  p.dabs({ n: 60, colors: [css(AC.sky, 1.0), css(AC.skyDeep, 0.95)], r: [16, 60], alpha: [0.05, 0.1], squash: 0.35 });
  for (const x of [rng.range(80, 300), rng.range(620, 900)]) cloud(g, x, H * rng.range(0.7, 0.86), rng.range(150, 230), 52, rng);
  // the hem: a folded-over band and a line of stitching
  g.fillStyle = css(AC.skyDeep, 0.78); g.fillRect(0, H - 12, W, 12);
  g.fillStyle = 'rgba(255,255,255,0.3)';
  for (let x = 0; x < W; x += 12) g.fillRect(x, H - 16, 7, 1.5);
  return p.texture({ repeat: [1, 1] });
}

/** The floor cloth: sand painted in peach and salmon, with brush marks, specks of grit and faint cracks. One tile = 16 x 16 units. */
export function floorCloth(seed = 407) {
  const S = 512;
  const p = new Painter(S, S, seed).fill(css(AC.sand));
  const g = p.g, rng = p.rng;
  p.dabs({ n: 120, colors: [css(AC.peach), css(AC.salmon, 1.05), css(AC.sand, 1.04), css(0xe8b896)], r: [20, 70], alpha: [0.1, 0.22], squash: 0.5 });
  p.dabs({ n: 260, colors: [css(0xd89a7a), css(0xfae4c8)], r: [3, 10], alpha: [0.08, 0.18], squash: 0.6 });
  // dry cracks
  g.strokeStyle = 'rgba(150,90,70,0.16)'; g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    let x = rng.range(0, S), y = rng.range(0, S), a = rng.range(0, TAU);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { a += rng.range(-0.7, 0.7); x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 700; i++) { g.fillStyle = rng.pick(['rgba(120,70,50,0.35)', 'rgba(255,245,230,0.5)', 'rgba(180,110,80,0.3)']); g.fillRect(rng.range(0, S), rng.range(0, S), rng.range(1, 2.5), rng.range(1, 2.5)); }
  return p.texture({ repeat: [1, 1] });
}

/** Black stage boards with the stage manager's spike marks in coloured tape. One tile = 8 x 8 units. */
export function stageBoards(seed = 409) {
  const S = 256, n = 8, bw = S / n;
  const p = new Painter(S, S, seed).fill('#1c1a1c');
  const g = p.g, rng = p.rng;
  for (let i = 0; i < n; i++) {
    let y = -rng.range(0, 120);
    while (y < S) {
      const len = rng.range(90, 200);
      g.fillStyle = css(0x2e2a2c, rng.range(0.85, 1.15)); g.fillRect(i * bw + 1, y + 1, bw - 2, len - 2);
      y += len;
    }
  }
  p.dabs({ n: 40, colors: ['rgba(255,255,255,1)', 'rgba(0,0,0,1)'], r: [4, 20], alpha: [0.03, 0.07] });
  // spike tape
  for (let i = 0; i < 3; i++) {
    const x = rng.range(20, S - 20), y = rng.range(20, S - 20);
    g.fillStyle = rng.pick(['#f2d23a', '#e8508a', '#52c8e8', '#f6f2ea']);
    g.fillRect(x - 9, y - 1.5, 18, 3); g.fillRect(x - 1.5, y - 9, 3, 18);
  }
  return p.texture({ repeat: [1, 1] });
}

/**
 * Rock strata painted on a mesa flat: horizontal bands of salmon, peach, cream and rust, brushed, with a few
 * vertical cracks. One tile = 24 x 24 units (the flats use their shape's own units as UVs).
 */
export function strata(seed = 411, k = 1) {
  const S = 512;
  const p = new Painter(S, S, seed).fill(css(AC.salmon, k));
  const g = p.g, rng = p.rng;
  let y = 0;
  const cols = [AC.salmon, AC.peach, AC.cream, AC.rust, 0xe8a888, 0xf0c0a0, 0xd88870];
  while (y < S) {
    const h = rng.range(14, 54);
    g.fillStyle = css(rng.pick(cols), k * rng.range(0.94, 1.04));
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.012 + y) * 3);
    g.lineTo(S, y + h); g.lineTo(0, y + h); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,240,220,0.25)'; g.fillRect(0, y, S, 2);
    y += h;
  }
  p.dabs({ n: 120, colors: [css(AC.cream, k), css(AC.rust, k)], r: [6, 30], alpha: [0.06, 0.14], squash: 0.3 });
  g.strokeStyle = css(AC.rust, 0.7 * k); g.globalAlpha = 0.35; g.lineWidth = 2;
  for (let i = 0; i < 16; i++) { const x = rng.range(0, S), y0 = rng.range(0, S); g.beginPath(); g.moveTo(x, y0); g.lineTo(x + rng.range(-6, 6), y0 + rng.range(30, 90)); g.stroke(); }
  g.globalAlpha = 1;
  return p.texture({ repeat: [1, 1] });
}

/** The back of a flat: pale plywood with grain, the frame's shadow lines and a stencilled label. One tile = 8 x 8 units. */
export function plywood(seed = 413) {
  const S = 256;
  const p = new Painter(S, S, seed).fill('#d8c4a0');
  const g = p.g, rng = p.rng;
  p.lines({ n: 60, colors: ['#b8a07a', '#e8d6b4', '#c8b088'], alpha: [0.25, 0.5], width: [0.6, 1.6], wobble: 3 });
  g.fillStyle = 'rgba(80,60,40,0.18)'; g.fillRect(0, 0, S, 3); g.fillRect(0, 0, 3, S);
  g.fillStyle = 'rgba(40,40,50,0.55)'; g.font = `bold 15px ${FUTURA}`; g.textAlign = 'left';
  const labels = ['ASTEROID CITY', 'ACT I  SC 2', 'STAGE LEFT', 'MESA #4', 'DO NOT LEAN', 'FLAT 12'];
  for (let i = 0; i < 2; i++) g.fillText(rng.pick(labels), rng.range(10, 120), rng.range(30, S - 20));
  return p.texture({ repeat: [1, 1] });
}

/** Red velvet in deep vertical folds, for the house curtain. One tile = 4 units across. */
export function velvet(color = 0x9a1424, seed = 415) {
  const W = 256, H = 64;
  const p = new Painter(W, H, seed).fill(css(color));
  const g = p.g;
  for (let i = 0; i < 4; i++) {
    const gr = g.createLinearGradient(i * 64, 0, i * 64 + 64, 0);
    gr.addColorStop(0, css(color, 0.55)); gr.addColorStop(0.35, css(color, 1.1)); gr.addColorStop(0.55, css(color, 1.25)); gr.addColorStop(1, css(color, 0.5));
    g.fillStyle = gr; g.fillRect(i * 64, 0, 64, H);
  }
  p.lines({ n: 30, colors: ['rgba(255,200,200,1)', 'rgba(0,0,0,1)'], alpha: [0.03, 0.07], width: [0.5, 1.2], vertical: true, wobble: 1 });
  return p.texture({ repeat: [1, 1] });
}

/** Gilt moulding: a running scroll between beaded edges, in burnished gold. One tile = 3 units along. */
export function gilt(seed = 417) {
  const W = 256, H = 64;
  const p = new Painter(W, H, seed);
  p.vgrad([[0, '#7a5a1c'], [0.15, '#f4dc8a'], [0.5, '#c89a3a'], [0.85, '#f0d27a'], [1, '#6a4a14']]);
  const g = p.g;
  // beads along both edges
  for (let x = 4; x < W; x += 8) for (const y of [6, H - 6]) { g.fillStyle = '#fff2b8'; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); g.fillStyle = 'rgba(90,60,10,0.6)'; g.beginPath(); g.arc(x + 1, y + 1, 1.6, 0, TAU); g.fill(); }
  // a running scroll of leaves
  g.strokeStyle = '#6a4a12'; g.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    const x0 = k * 64;
    g.beginPath(); g.arc(x0 + 16, H / 2, 11, Math.PI * 0.2, Math.PI * 1.8); g.stroke();
    g.beginPath(); g.arc(x0 + 48, H / 2, 11, Math.PI * 1.2, Math.PI * 0.8, true); g.stroke();
    g.fillStyle = '#fff0b0'; g.beginPath(); g.ellipse(x0 + 32, H / 2, 6, 10, 0, 0, TAU); g.fill();
  }
  return p.texture({ repeat: [1, 1] });
}

/**
 * The side walls of the house, in black and white: two tiers of opera boxes between fluted pilasters, each
 * box with a draped opening and a lit sconce. Returns the map and an emissive map. One tile = 16 x 32 units.
 */
export function houseWall(seed = 419) {
  const W = 256, H = 512;
  const p = new Painter(W, H, seed).fill('#5c5c5e');
  const e = new Painter(W, H, 1).fill('#000');
  const g = p.g, eg = e.g;
  p.dabs({ n: 40, colors: ['#666668', '#525254'], r: [10, 40], alpha: [0.1, 0.2] });
  // pilasters at the tile's edges
  for (const x of [0, W - 22]) {
    g.fillStyle = '#7a7a7c'; g.fillRect(x, 0, 22, H);
    g.fillStyle = '#4a4a4c'; for (let k = 4; k < 22; k += 6) g.fillRect(x + k, 0, 2, H);
  }
  for (let tier = 0; tier < 2; tier++) {
    const y0 = 70 + tier * 190;
    // the box's dark opening, its drapes and the balcony front below it
    g.fillStyle = '#1a1a1c'; g.fillRect(40, y0, W - 80, 110);
    g.fillStyle = '#3a3a3c';
    g.beginPath(); g.moveTo(40, y0); g.quadraticCurveTo(70, y0 + 60, 44, y0 + 110); g.lineTo(40, y0 + 110); g.fill();
    g.beginPath(); g.moveTo(W - 40, y0); g.quadraticCurveTo(W - 70, y0 + 60, W - 44, y0 + 110); g.lineTo(W - 40, y0 + 110); g.fill();
    g.fillStyle = '#2c2c2e'; g.beginPath(); g.moveTo(40, y0); g.quadraticCurveTo(W / 2, y0 + 30, W - 40, y0); g.fill();
    // two heads looking at the stage
    for (const x of [100, 156]) { g.fillStyle = '#8a8a8c'; g.beginPath(); g.arc(x, y0 + 82, 11, 0, TAU); g.fill(); g.fillStyle = '#262628'; g.beginPath(); g.arc(x, y0 + 77, 11, Math.PI, TAU); g.fill(); }
    g.fillStyle = '#d8d8d8'; g.fillRect(34, y0 + 110, W - 68, 30);
    g.fillStyle = '#a8a8aa'; for (let x = 44; x < W - 44; x += 12) g.fillRect(x, y0 + 116, 6, 18);
    g.fillStyle = '#f2f2f2'; g.fillRect(34, y0 + 108, W - 68, 4);
    // a sconce on the pilaster
    for (const x of [11, W - 11]) {
      g.fillStyle = '#f8f8f0'; g.beginPath(); g.arc(x, y0 + 30, 7, 0, TAU); g.fill();
      const gr = eg.createRadialGradient(x, y0 + 30, 0, x, y0 + 30, 22);
      gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.3, '#a8a8a0'); gr.addColorStop(1, '#000');
      eg.fillStyle = gr; eg.fillRect(x - 22, y0 + 8, 44, 44);
    }
  }
  g.fillStyle = '#2a2a2c'; g.fillRect(0, H - 50, W, 50);
  return { map: p.texture({ repeat: [1, 1] }), emissive: e.texture({ repeat: [1, 1] }) };
}

/** Patterned carpet for the house floor, in greys. One tile = 4 x 4 units. */
export function carpet(seed = 421) {
  const S = 128;
  const p = new Painter(S, S, seed).fill('#363638');
  const g = p.g;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * 32 + 16, y = j * 32 + 16;
    g.fillStyle = (i + j) % 2 ? '#48484a' : '#2a2a2c';
    g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 12, y); g.lineTo(x, y + 12); g.lineTo(x - 12, y); g.closePath(); g.fill();
    g.fillStyle = '#5a5a5c'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
  }
  return p.texture({ repeat: [1, 1] });
}

/** Asphalt with a dashed yellow centre line and pale edges. u across the road (0..1), one tile = 10 units along. */
export function roadTex(seed = 423) {
  const W = 128, H = 256;
  const p = new Painter(W, H, seed).fill('#8a8486');
  const g = p.g, rng = p.rng;
  p.dabs({ n: 60, colors: ['#9a9496', '#7a7476'], r: [4, 16], alpha: [0.15, 0.3] });
  for (let i = 0; i < 300; i++) { g.fillStyle = rng.pick(['rgba(255,255,255,0.18)', 'rgba(0,0,0,0.15)']); g.fillRect(rng.range(0, W), rng.range(0, H), 1.5, 1.5); }
  g.fillStyle = '#f2d050'; g.fillRect(W / 2 - 3, 0, 6, H * 0.55);
  g.fillStyle = '#f2ece0'; g.fillRect(4, 0, 4, H); g.fillRect(W - 8, 0, 4, H);
  return p.texture({ repeat: [1, 1] });
}

/** Painted stucco in a pastel, smooth and even like a set painter's. One tile = 4 x 4 units. */
export function plaster(color: number, seed = 425) {
  const S = 128;
  const p = new Painter(S, S, seed).fill(css(color));
  p.dabs({ n: 30, colors: [css(color, 1.04), css(color, 0.95)], r: [8, 26], alpha: [0.06, 0.12], squash: 0.6 });
  p.dabs({ n: 60, colors: [css(color, 1.08), css(color, 0.92)], r: [0.8, 1.6], alpha: [0.2, 0.35] });
  return p.texture({ repeat: [1, 1] });
}

/** Text lettered on a flat ground, centred, with optional second line: for small signs painted on canvas. */
export function lettering(lines: Array<{ text: string; font: string; color: string; y: number }>, o: { w: number; h: number; bg?: string; border?: string; borderW?: number; round?: number }) {
  const p = new Painter(o.w, o.h, 431);
  const g = p.g;
  if (o.bg) {
    g.fillStyle = o.bg;
    if (o.round) { g.beginPath(); g.roundRect(0, 0, o.w, o.h, o.round); g.fill(); } else g.fillRect(0, 0, o.w, o.h);
  }
  if (o.border) { const b = o.borderW ?? 6; g.strokeStyle = o.border; g.lineWidth = b; g.strokeRect(b * 1.5, b * 1.5, o.w - b * 3, o.h - b * 3); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const l of lines) {
    g.font = l.font;
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillText(l.text, o.w / 2 + 2, l.y * o.h + 3);
    g.fillStyle = l.color; g.fillText(l.text, o.w / 2, l.y * o.h);
  }
  return p.texture({ wrap: false });
}

/**
 * The town's sign at the edge of the stage: ASTEROID CITY over a flying meteor with a striped tail and the
 * population below, on a cream board with a coral border. 2 : 1.
 */
export function townSign() {
  const W = 1024, H = 512;
  const p = new Painter(W, H, 433).fill(css(AC.cream));
  const g = p.g;
  p.dabs({ n: 40, colors: [css(AC.cream, 1.03), css(AC.cream, 0.95)], r: [20, 60], alpha: [0.1, 0.2] });
  g.strokeStyle = css(AC.coral); g.lineWidth = 22; g.strokeRect(14, 14, W - 28, H - 28);
  g.strokeStyle = css(AC.turquoise); g.lineWidth = 6; g.strokeRect(38, 38, W - 76, H - 76);
  // the meteor streaking down from the upper left, its tail in three bands
  g.save(); g.translate(250, 170); g.rotate(-0.42);
  const tail = [css(AC.butter), css(AC.coral), css(AC.turquoise)];
  tail.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.moveTo(-210, -30 + i * 20); g.lineTo(0, -12 + i * 12); g.lineTo(0, -2 + i * 12); g.lineTo(-210, -16 + i * 20); g.closePath(); g.fill(); });
  g.fillStyle = '#6a5a5a'; g.beginPath(); g.arc(16, 6, 34, 0, TAU); g.fill();
  g.fillStyle = '#8a7a78'; g.beginPath(); g.arc(10, 0, 26, 0, TAU); g.fill();
  g.fillStyle = '#5a4a4a'; for (const [x, y, r] of [[2, -6, 6], [20, 8, 5], [6, 14, 4]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.restore();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.font = `bold 118px ${FUTURA}`; g.fillText('ASTEROID', W / 2 + 64, 182); g.fillText('CITY', W / 2 + 64, 302);
  g.fillStyle = css(AC.red); g.fillText('ASTEROID', W / 2 + 60, 178); g.fillText('CITY', W / 2 + 60, 298);
  g.fillStyle = css(0x2f4a5e); g.font = `italic 56px Georgia, serif`; g.fillText('pop. 87', W / 2 + 60, 410);
  g.font = `500 26px ${FUTURA}`; g.fillText('HOME OF THE ASTEROID  •  EST. 3007 B.C.', W / 2, 468);
  return p.texture({ wrap: false });
}

/** The face of a 1950s vending machine for the motor court: its name, a lit window of choices, a coin slot. 1 : 2. */
export function vendFace(label: string, sub: string, body: number, items: string[], seed = 435) {
  const W = 128, H = 256;
  const p = new Painter(W, H, seed).fill(css(body));
  const g = p.g;
  p.vgrad([[0, 'rgba(255,255,255,0.22)'], [0.2, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.14)']]);
  g.fillStyle = '#d8dde2'; g.fillRect(6, 6, W - 12, 4); g.fillRect(6, H - 10, W - 12, 4);
  g.fillStyle = '#fbf3e0'; g.beginPath(); g.roundRect(12, 16, W - 24, 36, 8); g.fill();
  g.fillStyle = css(AC.red); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold ${label.length > 9 ? 13 : 17}px ${FUTURA}`; g.fillText(label, W / 2, 29);
  g.fillStyle = '#2f4a5e'; g.font = 'italic 9px Georgia, serif'; g.fillText(sub, W / 2, 44);
  g.fillStyle = '#fff6dc'; g.fillRect(14, 62, W - 28, 112);
  items.forEach((it, i) => {
    const y = 72 + i * 25;
    g.fillStyle = '#ece0c4'; g.fillRect(18, y - 4, W - 36, 20);
    g.fillStyle = '#2f4a5e'; g.font = `bold 9px ${FUTURA}`; g.fillText(it, W / 2, y + 6);
  });
  g.fillStyle = '#d8b25a'; g.fillRect(W - 34, 186, 16, 26);
  g.fillStyle = '#2a2c30'; g.fillRect(W - 29, 190, 6, 16);
  for (let i = 0; i < 4; i++) { g.fillStyle = '#fbf3e0'; g.beginPath(); g.arc(24 + i * 16, 196, 6, 0, TAU); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(25 + i * 16, 197, 3, 0, TAU); g.fill(); }
  g.fillStyle = '#2a2c30'; g.fillRect(20, 222, W - 40, 20);
  return p.texture({ wrap: false });
}

/** The emissive glow of a vending machine's lit window (black elsewhere), shared by every machine. */
export function vendGlow() {
  const p = new Painter(128, 256, 437).fill('#000');
  p.g.fillStyle = '#a89870'; p.g.fillRect(14, 62, 100, 112);
  p.g.fillStyle = '#504838'; p.g.fillRect(12, 16, 104, 36);
  return p.texture({ wrap: false });
}

/** The comedy and tragedy masks' faces: painted on a sphere's front, gilt with dark eyes and mouth. */
export function maskFace(kind: 'comedy' | 'tragedy') {
  const p = new Painter(512, 256, kind === 'comedy' ? 439 : 441);
  p.vgrad([[0, '#f6dc8a'], [0.5, '#d8a840'], [1, '#8a6018']]);
  // the front of a sphere is a quarter of the way across; draw there
  p.at([0, 0, 1], (c) => {
    c.fillStyle = '#2a1a08';
    for (const s of [-1, 1]) {
      c.save(); c.translate(s * 20, -14); c.rotate(kind === 'comedy' ? -s * 0.25 : s * 0.3);
      c.beginPath(); c.ellipse(0, 0, 13, 8, 0, 0, TAU); c.fill(); c.restore();
      // brows
      c.strokeStyle = '#6a4410'; c.lineWidth = 4; c.beginPath();
      if (kind === 'comedy') c.arc(s * 20, -16, 18, Math.PI * 1.15, Math.PI * 1.85);
      else { c.moveTo(s * 6, -34); c.lineTo(s * 34, -26); }
      c.stroke();
    }
    c.fillStyle = '#2a1a08'; c.beginPath();
    if (kind === 'comedy') { c.moveTo(-30, 18); c.quadraticCurveTo(0, 62, 30, 18); c.quadraticCurveTo(0, 34, -30, 18); }
    else { c.moveTo(-26, 44); c.quadraticCurveTo(0, 6, 26, 44); c.quadraticCurveTo(0, 30, -26, 44); }
    c.fill();
    c.fillStyle = 'rgba(255,240,190,0.5)'; c.beginPath(); c.ellipse(-8, -40, 16, 6, -0.2, 0, TAU); c.fill();
  });
  return p.texture();
}

/** A pale moon, painted with soft grey maria, for the disc that is flown in at night. */
export function moonFace() {
  const S = 256;
  const p = new Painter(S, S, 443);
  const g = p.g, rng = p.rng;
  const gr = g.createRadialGradient(S * 0.45, S * 0.42, 10, S / 2, S / 2, S / 2);
  gr.addColorStop(0, '#fffbea'); gr.addColorStop(0.85, '#f0e6c8'); gr.addColorStop(1, '#d8cca8');
  g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, TAU); g.fill();
  for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(150,150,140,${rng.range(0.12, 0.25)})`; g.beginPath(); g.ellipse(rng.range(50, 200), rng.range(50, 200), rng.range(10, 34), rng.range(8, 26), rng.range(0, 3), 0, TAU); g.fill(); }
  return p.texture({ wrap: false });
}

/** The black-and-white checkerboard of a diner floor, with a little wear. One tile = 2.4 x 2.4 units (8 x 8 tiles). */
export function dinerFloor() {
  const S = 256, n = 8, c = S / n;
  const p = new Painter(S, S, 445).fill('#f4f0e6');
  const g = p.g;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) { g.fillStyle = '#2a2a30'; g.fillRect(i * c, j * c, c, c); }
  p.dabs({ n: 30, colors: ['rgba(255,255,255,1)', 'rgba(120,100,80,1)'], r: [6, 20], alpha: [0.04, 0.08] });
  return p.texture({ repeat: [1, 1] });
}

/** The diner's back wall seen through the cut-away front: mint tiles, a pass-through, the menu board, pies. */
export function dinerBack() {
  const W = 1024, H = 256;
  const p = new Painter(W, H, 447).fill(css(AC.mint));
  const g = p.g;
  for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < W; x += 16) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, 15, 15); }
  g.fillStyle = css(AC.coral); g.fillRect(0, H * 0.55, W, 10);
  // the menu board
  g.fillStyle = '#2a3a3a'; g.fillRect(W * 0.36, 26, W * 0.28, 96);
  g.fillStyle = '#f6f0e0'; g.textAlign = 'center'; g.font = `bold 20px ${FUTURA}`; g.fillText('TODAY', W * 0.5, 46);
  g.font = '14px Georgia, serif';
  ['Chili con carne  ..  35¢', 'Grilled cheese  ..  25¢', 'Pie à la mode  ..  20¢', 'Coffee  ..  5¢'].forEach((l, i) => g.fillText(l, W * 0.5, 66 + i * 15));
  // a pass-through to the kitchen, and shelves of pies and cups
  g.fillStyle = '#c8d8d4'; g.fillRect(W * 0.08, 40, W * 0.2, 70); g.fillStyle = '#e8eef0'; g.fillRect(W * 0.08, 104, W * 0.2, 8);
  g.fillStyle = '#d8dde2'; g.fillRect(W * 0.72, 40, W * 0.2, 6); g.fillRect(W * 0.72, 80, W * 0.2, 6);
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#e8b060' : '#c86a5a'; g.beginPath(); g.ellipse(W * 0.735 + i * 34, 72, 14, 7, 0, 0, TAU); g.fill(); g.fillStyle = '#fbf6ea'; g.fillRect(W * 0.73 + i * 34, 28, 14, 12); }
  return p.texture({ wrap: false });
}

/** A strip of red, white and blue bunting (pastel), with scalloped bottoms; transparent between. */
export function bunting() {
  const W = 256, H = 64;
  const p = new Painter(W, H, 449);
  const g = p.g;
  const cols = [css(AC.red), css(AC.white), css(0x4a7ab8)];
  for (let i = 0; i < 4; i++) { g.fillStyle = cols[i % 3]; g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + 64, 0); g.quadraticCurveTo(i * 64 + 32, 70, i * 64, 0); g.fill(); }
  g.fillStyle = '#e8e0d0'; g.fillRect(0, 0, W, 3);
  return p.texture({ repeat: [1, 1] });
}

/** Painted ridged skin for cacti (pale grooves the instance colour tints). */
export function cactusRibs() {
  const p = new Painter(128, 64, 451).fill('#e8ece4');
  for (let x = 0; x < 128; x += 16) { p.g.fillStyle = '#a8b4a4'; p.g.fillRect(x, 0, 4, 64); p.g.fillStyle = '#ffffff'; p.g.fillRect(x + 7, 0, 2, 64); }
  const t = p.texture({ repeat: [4, 2] });
  return t;
}

/** A pastel mushroom cloud, painted on a cut-out flat: billowing cap, ringed stem, soft pinks and peach. */
export function mushroomCloud() {
  const W = 512, H = 640;
  const p = new Painter(W, H, 453);
  const g = p.g, rng = p.rng;
  const puff = (x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  // stem
  for (let y = H - 30; y > 260; y -= 14) { const w = 46 + Math.max(0, (y - 520) * 0.6); puff(W / 2 + rng.range(-6, 6), y, w, rng.pick(['#f2c8c0', '#ecbab4', '#f6d4c8'])); }
  // ring round the stem
  for (let a = 0; a < TAU; a += 0.35) puff(W / 2 + Math.cos(a) * 110, 380 + Math.sin(a) * 22, 34, rng.pick(['#f8dcd0', '#f0c4bc']));
  // the cap
  for (let i = 0; i < 70; i++) { const a = rng.range(Math.PI, TAU), r = rng.range(0, 1); puff(W / 2 + Math.cos(a) * 190 * r, 210 + Math.sin(a) * 140 * r, rng.range(40, 70), rng.pick(['#f8d8cc', '#f2c0b8', '#fbe6d8', '#eab0aa'])); }
  for (let i = 0; i < 22; i++) puff(W / 2 + rng.range(-200, 200), 230 + rng.range(-10, 30), rng.range(30, 50), rng.pick(['#e2a6a4', '#d89a9a']));
  for (let i = 0; i < 18; i++) puff(W / 2 + rng.range(-130, 110), rng.range(90, 160), rng.range(18, 34), 'rgba(255,248,240,0.7)');
  return p.texture({ wrap: false });
}

/** A notice board lettered in the stage's Futura, for the many small signs. */
export function notice(text: string, sub: string | null, o: { bg: number; fg: number; w?: number; h?: number; border?: number }) {
  const w = o.w ?? 512, h = o.h ?? 160;
  const lines = [{ text, font: `bold ${Math.round(h * (sub ? 0.36 : 0.48))}px ${FUTURA}`, color: hex(o.fg), y: sub ? 0.4 : 0.53 }];
  if (sub) lines.push({ text: sub, font: `italic ${Math.round(h * 0.2)}px Georgia, serif`, color: hex(o.fg), y: 0.76 });
  return lettering(lines, { w, h, bg: hex(o.bg), border: o.border !== undefined ? hex(o.border) : undefined, borderW: Math.max(4, h * 0.04) });
}
