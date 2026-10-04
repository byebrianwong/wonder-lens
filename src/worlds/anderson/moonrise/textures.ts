import { Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { css } from '../textures';
import { FUTURA } from '../film';

/*
 * Painted textures for New Penzance (Moonrise Kingdom): the red clapboard of Summer's End with its white
 * trim, the wallpapers and painted back walls of its rooms, a rug, Britten's record, the camp's canvas and
 * signs, the flags, the beach, the white church, the lightning. Tiling textures say how much of the world one
 * tile covers; the rest are made to fit one face.
 */

/** The film's palette: khaki, mustard, faded red, sea blue-green, and the storm's grey-greens. */
export const MK = {
  red: 0xb0473a, redDark: 0x7a2a24, trim: 0xf4ecda, khaki: 0xc2a670, khakiDark: 0x8f7a4c, mustard: 0xe2b33c, yellow: 0xf2cf4a,
  sea: 0x3f8f8c, seaDeep: 0x1f5c6a, sand: 0xe4cf9c, grass: 0xa8a254, grassDry: 0xc9b46a, pine: 0x3f5a3a, pineDark: 0x2c4230,
  pink: 0xf0a2a8, powder: 0x9cc4e4, navy: 0x2a3550, cream: 0xf6efdc, wood: 0x9a7650, woodDark: 0x5e4630, slate: 0x55605e,
  storm: 0x5a6a62, white: 0xf6f3ea,
};

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Painted clapboard: horizontal boards with a shadow under each lap. One tile = 2 x 2 units (8 boards). */
export function clapboard(color: number, seed = 1) {
  const S = 128, n = 8, b = S / n;
  const p = new Painter(S, S, seed).fill(css(color));
  const g = p.g;
  for (let i = 0; i < n; i++) {
    const y = i * b;
    const gr = g.createLinearGradient(0, y, 0, y + b);
    gr.addColorStop(0, css(color, 1.08)); gr.addColorStop(0.75, css(color, 0.98)); gr.addColorStop(1, css(color, 0.82));
    g.fillStyle = gr; g.fillRect(0, y, S, b);
    g.fillStyle = css(color, 0.62); g.fillRect(0, y + b - 2, S, 2);
  }
  p.dabs({ n: 30, colors: [css(color, 1.06), css(color, 0.92)], r: [4, 16], alpha: [0.06, 0.14], squash: 0.3 });
  return p.texture({ repeat: [1, 1] });
}

/**
 * One bay of Summer's End's outside wall: red clapboard and a white six-over-six sash window with dark green
 * shutters. Tile = one bay (2.5 units) by one storey (3.5 units).
 */
export function houseBay(o: { wall: number; trim: number; shutter: number; lit?: boolean; seed?: number }) {
  const W = 160, H = 224;
  const p = new Painter(W, H, o.seed ?? 3).fill(css(o.wall));
  const g = p.g;
  const rows = 14, b = H / rows;
  for (let i = 0; i < rows; i++) {
    const y = i * b;
    const gr = g.createLinearGradient(0, y, 0, y + b);
    gr.addColorStop(0, css(o.wall, 1.08)); gr.addColorStop(0.75, css(o.wall, 0.98)); gr.addColorStop(1, css(o.wall, 0.82));
    g.fillStyle = gr; g.fillRect(0, y, W, b);
    g.fillStyle = css(o.wall, 0.62); g.fillRect(0, y + b - 2, W, 2);
  }
  const ww = 56, wh = 100, wx = W / 2 - ww / 2, wy = 52;
  // shutters
  g.fillStyle = css(o.shutter);
  for (const sx of [wx - 30, wx + ww + 8]) {
    g.fillRect(sx, wy - 4, 22, wh + 8);
    g.fillStyle = css(o.shutter, 0.72);
    for (let k = 6; k < wh; k += 7) g.fillRect(sx + 3, wy + k, 16, 2);
    g.fillStyle = css(o.shutter);
  }
  // trim, glass, glazing bars
  g.fillStyle = 'rgba(40,20,20,0.25)'; g.fillRect(wx - 7, wy - 5, ww + 16, wh + 16);
  g.fillStyle = css(o.trim); g.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
  g.fillRect(wx - 14, wy - 16, ww + 28, 10);
  const gl = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
  gl.addColorStop(0, o.lit ? '#f6dca0' : '#3c5266'); gl.addColorStop(1, o.lit ? '#e8b870' : '#7a98a8');
  g.fillStyle = gl; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(wx + ww * 0.62, wy + 4, 6, wh - 8);
  g.fillStyle = css(o.trim);
  g.fillRect(wx, wy + wh / 2 - 2, ww, 5);
  for (const k of [1, 2]) g.fillRect(wx + (ww / 3) * k - 1.5, wy, 3, wh);
  for (const k of [1, 3]) g.fillRect(wx, wy + (wh / 4) * k - 1.5, ww, 3);
  g.fillRect(wx - 12, wy + wh + 6, ww + 24, 7);
  // white corner boards at the tile's edges read as pilasters between bays
  g.fillStyle = css(o.trim, 0.96); g.fillRect(0, 0, 5, H); g.fillRect(W - 5, 0, 5, H);
  return p.texture({ repeat: [1, 1] });
}

/** Square-butt shingles in staggered rows. One tile = 1.5 x 1.5 units. */
export function shingles(color: number, seed = 5) {
  const S = 128, rows = 6, rh = S / rows;
  const p = new Painter(S, S, seed).fill(css(color, 0.6));
  const g = p.g, rng = p.rng;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -10 : 0;
    while (x < S) {
      const w = rng.range(14, 26);
      g.fillStyle = css(color, rng.range(0.88, 1.1)); g.fillRect(x + 1, r * rh, w - 2, rh - 2);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1, r * rh + rh - 4, w - 2, 2);
      x += w;
    }
  }
  return p.texture({ repeat: [1, 1] });
}

export type PaperKind = 'stripe' | 'floral' | 'diamond' | 'dots' | 'check' | 'boats' | 'plain';
/** Draw a wallpaper pattern into a region of a canvas. `s` is pixels per unit. */
function paintPaper(g: CanvasRenderingContext2D, rng: Rng, kind: PaperKind, base: number, ink: number, x0: number, y0: number, w: number, h: number, s: number) {
  g.save();
  g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  g.fillStyle = css(base); g.fillRect(x0, y0, w, h);
  const ic = css(ink);
  const step = s * 0.5;
  if (kind === 'stripe') {
    for (let x = x0; x < x0 + w; x += step) { g.fillStyle = ic; g.globalAlpha = 0.55; g.fillRect(x, y0, step * 0.28, h); g.globalAlpha = 0.25; g.fillRect(x + step * 0.42, y0, step * 0.06, h); }
  } else if (kind === 'floral') {
    for (let y = y0; y < y0 + h + step; y += step) for (let x = x0 + ((Math.round((y - y0) / step) % 2) * step) / 2; x < x0 + w + step; x += step) {
      g.globalAlpha = 0.7; g.fillStyle = ic;
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g.beginPath(); g.arc(x + Math.cos(a) * step * 0.09, y + Math.sin(a) * step * 0.09, step * 0.07, 0, TAU); g.fill(); }
      g.globalAlpha = 0.5; g.fillStyle = css(ink, 0.6, 0x4a7a4a, 0.6); g.beginPath(); g.ellipse(x + step * 0.16, y + step * 0.14, step * 0.08, step * 0.035, 0.6, 0, TAU); g.fill();
    }
  } else if (kind === 'diamond') {
    g.strokeStyle = ic; g.lineWidth = Math.max(1, step * 0.05); g.globalAlpha = 0.55;
    for (let k = -h; k < w + h; k += step) { g.beginPath(); g.moveTo(x0 + k, y0); g.lineTo(x0 + k + h, y0 + h); g.moveTo(x0 + k + h, y0); g.lineTo(x0 + k, y0 + h); g.stroke(); }
  } else if (kind === 'dots') {
    g.fillStyle = ic; g.globalAlpha = 0.6;
    for (let y = y0; y < y0 + h + step; y += step * 0.6) for (let x = x0 + ((Math.round((y - y0) / (step * 0.6)) % 2) * step) / 2; x < x0 + w + step; x += step) { g.beginPath(); g.arc(x, y, step * 0.07, 0, TAU); g.fill(); }
  } else if (kind === 'check') {
    g.fillStyle = ic; g.globalAlpha = 0.28;
    for (let x = x0; x < x0 + w; x += step) g.fillRect(x, y0, step * 0.5, h);
    for (let y = y0; y < y0 + h; y += step) g.fillRect(x0, y, w, step * 0.5);
  } else if (kind === 'boats') {
    for (let y = y0 + step * 0.5; y < y0 + h + step; y += step) for (let x = x0 + ((Math.round((y - y0) / step) % 2) * step) / 2; x < x0 + w + step; x += step) {
      g.globalAlpha = 0.6; g.fillStyle = ic;
      g.beginPath(); g.moveTo(x - step * 0.18, y); g.lineTo(x + step * 0.18, y); g.lineTo(x + step * 0.12, y + step * 0.08); g.lineTo(x - step * 0.12, y + step * 0.08); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x, y - step * 0.02); g.lineTo(x, y - step * 0.3); g.lineTo(x + step * 0.15, y - step * 0.04); g.closePath(); g.fill();
    }
  }
  g.globalAlpha = 1;
  void rng;
  g.restore();
}

/** A tiling wallpaper for side walls. One tile = 2 x 2 units. */
export function wallpaper(kind: PaperKind, base: number, ink: number, seed = 7) {
  const S = 128;
  const p = new Painter(S, S, seed);
  paintPaper(p.g, p.rng, kind, base, ink, 0, 0, S, S, S / 2);
  p.dabs({ n: 16, colors: ['rgba(255,255,255,1)', 'rgba(0,0,0,1)'], r: [8, 30], alpha: [0.02, 0.05] });
  return p.texture({ repeat: [1, 1] });
}

export type WallThing =
  | { k: 'frame'; x: number; y: number; w: number; h: number; art: 'sea' | 'portrait' | 'boat' | 'bird' | 'map' | 'lighthouse' }
  | { k: 'shelf'; x: number; y: number; w: number; h: number }
  | { k: 'window'; x: number; y: number; w: number; h: number }
  | { k: 'door'; x: number; w: number; h: number }
  | { k: 'clock'; x: number; y: number; r: number }
  | { k: 'pennants'; x: number; y: number; w: number }
  | { k: 'poster'; x: number; y: number; w: number; h: number; title: string; color: number };

/**
 * The painted back wall of one of Summer's End's rooms (the dollhouse's rooms are built like stage sets: the
 * pictures, shelves, doors and windows are painted on the flat). `w` x `h` in units; positions in units from
 * the bottom left. A dado rail and skirting run along the bottom.
 */
export function roomWall(o: { w: number; h: number; paper: PaperKind; base: number; ink: number; dado?: number; things: WallThing[]; seed?: number }) {
  const s = 56;
  const W = Math.round(o.w * s), H = Math.round(o.h * s);
  const p = new Painter(W, H, o.seed ?? 11);
  const g = p.g, rng = p.rng;
  paintPaper(g, rng, o.paper, o.base, o.ink, 0, 0, W, H, s);
  const X = (u: number) => u * s, Y = (v: number) => H - v * s;
  if (o.dado !== undefined) {
    g.fillStyle = css(o.dado); g.fillRect(0, Y(1.0), W, 1.0 * s);
    g.fillStyle = css(o.dado, 0.8); for (let x = 12; x < W; x += s * 0.8) g.fillRect(x, Y(0.9), s * 0.6, s * 0.7);
    g.fillStyle = css(o.dado, 1.2); g.fillRect(0, Y(1.04), W, 6);
  }
  g.fillStyle = '#6a4a34'; g.fillRect(0, Y(0.16), W, 0.16 * s);
  for (const t of o.things) {
    if (t.k === 'frame') {
      const x = X(t.x), y = Y(t.y + t.h), w = t.w * s, h = t.h * s;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 4, y + 5, w, h);
      g.fillStyle = '#c8a050'; g.fillRect(x, y, w, h);
      g.fillStyle = '#8a6420'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
      const ix = x + 8, iy = y + 8, iw = w - 16, ih = h - 16;
      g.save(); g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();
      if (t.art === 'sea' || t.art === 'boat' || t.art === 'lighthouse') {
        const sk = g.createLinearGradient(0, iy, 0, iy + ih); sk.addColorStop(0, '#a8c8d8'); sk.addColorStop(0.55, '#e8dcc0'); sk.addColorStop(0.56, '#3f7f8c'); sk.addColorStop(1, '#2a5a6a');
        g.fillStyle = sk; g.fillRect(ix, iy, iw, ih);
        if (t.art === 'boat') { g.fillStyle = '#f4eee0'; g.beginPath(); g.moveTo(ix + iw * 0.45, iy + ih * 0.55); g.lineTo(ix + iw * 0.45, iy + ih * 0.15); g.lineTo(ix + iw * 0.68, iy + ih * 0.52); g.fill(); g.fillStyle = '#8a2a24'; g.fillRect(ix + iw * 0.3, iy + ih * 0.55, iw * 0.42, ih * 0.06); }
        if (t.art === 'lighthouse') { g.fillStyle = '#f4f0e6'; g.fillRect(ix + iw * 0.62, iy + ih * 0.2, iw * 0.1, ih * 0.38); g.fillStyle = '#b0473a'; g.fillRect(ix + iw * 0.6, iy + ih * 0.14, iw * 0.14, ih * 0.08); g.fillStyle = '#6a7a50'; g.fillRect(ix + iw * 0.4, iy + ih * 0.52, iw * 0.5, ih * 0.06); }
      } else if (t.art === 'portrait') {
        g.fillStyle = '#3a4234'; g.fillRect(ix, iy, iw, ih);
        g.fillStyle = '#2a2420'; g.beginPath(); g.ellipse(ix + iw / 2, iy + ih * 0.95, iw * 0.42, ih * 0.38, 0, 0, TAU); g.fill();
        g.fillStyle = '#e0bc98'; g.beginPath(); g.ellipse(ix + iw / 2, iy + ih * 0.42, iw * 0.2, ih * 0.22, 0, 0, TAU); g.fill();
        g.fillStyle = '#5a3a24'; g.beginPath(); g.ellipse(ix + iw / 2, iy + ih * 0.3, iw * 0.22, ih * 0.12, 0, Math.PI, TAU); g.fill();
      } else if (t.art === 'bird') {
        g.fillStyle = '#ece4cc'; g.fillRect(ix, iy, iw, ih);
        g.fillStyle = '#4a6a7a'; g.beginPath(); g.ellipse(ix + iw / 2, iy + ih / 2, iw * 0.25, ih * 0.16, -0.3, 0, TAU); g.fill();
        g.fillStyle = '#c84a2a'; g.beginPath(); g.ellipse(ix + iw * 0.4, iy + ih * 0.56, iw * 0.1, ih * 0.08, 0, 0, TAU); g.fill();
        g.strokeStyle = '#3a2a1a'; g.lineWidth = 2; g.beginPath(); g.moveTo(ix + iw * 0.2, iy + ih * 0.8); g.lineTo(ix + iw * 0.8, iy + ih * 0.72); g.stroke();
      } else {
        // a little map of the island
        g.fillStyle = '#e8dcb8'; g.fillRect(ix, iy, iw, ih);
        g.fillStyle = '#9ab89a'; g.beginPath(); g.ellipse(ix + iw * 0.5, iy + ih * 0.5, iw * 0.34, ih * 0.3, 0.4, 0, TAU); g.fill();
        g.strokeStyle = '#b0473a'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(ix + iw * 0.25, iy + ih * 0.6); g.quadraticCurveTo(ix + iw * 0.5, iy + ih * 0.2, ix + iw * 0.75, iy + ih * 0.45); g.stroke(); g.setLineDash([]);
      }
      g.restore();
    } else if (t.k === 'shelf') {
      const x = X(t.x), y = Y(t.y + t.h), w = t.w * s, h = t.h * s;
      g.fillStyle = '#5a3a24'; g.fillRect(x - 6, y - 6, w + 12, h + 12);
      g.fillStyle = '#3a2418'; g.fillRect(x, y, w, h);
      const rows = Math.max(1, Math.round(t.h / 0.55));
      for (let r = 0; r < rows; r++) {
        const by = y + (r + 1) * (h / rows);
        let bx = x + 3;
        while (bx < x + w - 6) {
          const bw = rng.range(5, 11), bh = rng.range(0.6, 0.9) * (h / rows - 6);
          g.fillStyle = rng.pick(['#b0473a', '#2f6f8a', '#e2b33c', '#4f7a58', '#7a2a36', '#f2e8d8', '#c8a070', '#3a4a6a']);
          g.fillRect(bx, by - bh - 5, bw, bh);
          g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(bx + 1, by - bh * 0.7 - 5, bw - 2, 2);
          bx += bw + 1;
        }
        g.fillStyle = '#6a4630'; g.fillRect(x, by - 5, w, 5);
      }
    } else if (t.k === 'window') {
      const x = X(t.x), y = Y(t.y + t.h), w = t.w * s, h = t.h * s;
      g.fillStyle = '#f4ecda'; g.fillRect(x - 8, y - 8, w + 16, h + 16);
      const sk = g.createLinearGradient(0, y, 0, y + h); sk.addColorStop(0, '#9cc0d8'); sk.addColorStop(0.62, '#e6dcc4'); sk.addColorStop(0.63, '#4a9090'); sk.addColorStop(1, '#2f6a76');
      g.fillStyle = sk; g.fillRect(x, y, w, h);
      g.fillStyle = '#f4ecda'; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h / 2 - 2, w, 4);
      // curtains
      g.fillStyle = 'rgba(240,226,200,0.9)';
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w * 0.3, y + h * 0.5, x, y + h); g.fill();
      g.beginPath(); g.moveTo(x + w, y); g.quadraticCurveTo(x + w * 0.7, y + h * 0.5, x + w, y + h); g.fill();
    } else if (t.k === 'door') {
      const x = X(t.x), w = t.w * s, h = t.h * s, y = Y(0.16) - h;
      g.fillStyle = '#f4ecda'; g.fillRect(x - 6, y - 6, w + 12, h + 6);
      g.fillStyle = '#8a5a3a'; g.fillRect(x, y, w, h);
      g.fillStyle = '#7a4a2e'; g.fillRect(x + 6, y + 8, w - 12, h * 0.4); g.fillRect(x + 6, y + h * 0.52, w - 12, h * 0.4);
      g.fillStyle = '#d8b25a'; g.beginPath(); g.arc(x + w - 10, y + h * 0.5, 3, 0, TAU); g.fill();
    } else if (t.k === 'clock') {
      const x = X(t.x), y = Y(t.y), r = t.r * s;
      g.fillStyle = '#5a3a24'; g.beginPath(); g.arc(x, y, r + 4, 0, TAU); g.fill();
      g.fillStyle = '#f6efdc'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.strokeStyle = '#2a2018'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r * 0.5, y - r * 0.5); g.moveTo(x, y); g.lineTo(x - r * 0.1, y + r * 0.7); g.stroke();
    } else if (t.k === 'pennants') {
      const x = X(t.x), y = Y(t.y), w = t.w * s;
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y + 14, x + w, y); g.stroke();
      const n = Math.round(t.w / 0.35);
      for (let i = 0; i < n; i++) {
        const px = x + (i + 0.5) * (w / n), py = y + Math.sin(((i + 0.5) / n) * Math.PI) * 12;
        g.fillStyle = ['#b0473a', '#e2b33c', '#3f8f8c', '#f4ecda'][i % 4];
        g.beginPath(); g.moveTo(px - 7, py); g.lineTo(px + 7, py); g.lineTo(px, py + 20); g.closePath(); g.fill();
      }
    } else if (t.k === 'poster') {
      const x = X(t.x), y = Y(t.y + t.h), w = t.w * s, h = t.h * s;
      g.fillStyle = css(t.color); g.fillRect(x, y, w, h);
      g.fillStyle = '#f6efdc'; g.fillRect(x + 4, y + 4, w - 8, h * 0.3);
      g.fillStyle = css(t.color, 0.6); g.font = `bold ${Math.round(h * 0.14)}px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t.title, x + w / 2, y + 4 + h * 0.15);
    }
  }
  // the lamp-lit top of the wall and a little shade at the floor
  p.vgrad([[0, 'rgba(255,236,200,0.18)'], [0.4, 'rgba(255,236,200,0)'], [0.85, 'rgba(0,0,0,0)'], [1, 'rgba(40,20,10,0.18)']]);
  return p.texture({ wrap: false });
}

/** An oriental rug, red and indigo with a border. Fills the canvas. */
export function rug(a = 0x9a2a2a, b = 0x2a3a6a, seed = 13) {
  const W = 256, H = 160;
  const p = new Painter(W, H, seed).fill(css(a));
  const g = p.g;
  g.strokeStyle = css(b); g.lineWidth = 10; g.strokeRect(12, 12, W - 24, H - 24);
  g.strokeStyle = '#e8d8b0'; g.lineWidth = 3; g.strokeRect(22, 22, W - 44, H - 44);
  g.fillStyle = css(b); g.beginPath(); g.moveTo(W / 2, 36); g.lineTo(W - 56, H / 2); g.lineTo(W / 2, H - 36); g.lineTo(56, H / 2); g.closePath(); g.fill();
  g.fillStyle = '#e2b33c'; g.beginPath(); g.moveTo(W / 2, 58); g.lineTo(W - 92, H / 2); g.lineTo(W / 2, H - 58); g.lineTo(92, H / 2); g.closePath(); g.fill();
  g.fillStyle = css(a); g.beginPath(); g.arc(W / 2, H / 2, 12, 0, TAU); g.fill();
  for (let i = 0; i < 14; i++) { g.fillStyle = '#e8d8b0'; g.fillRect(20 + i * 16.6, 4, 4, 6); g.fillRect(20 + i * 16.6, H - 10, 4, 6); }
  p.dabs({ n: 40, colors: ['rgba(255,255,255,1)', 'rgba(0,0,0,1)'], r: [4, 20], alpha: [0.03, 0.08] });
  return p.texture({ wrap: false });
}

/** The record the brothers play: Benjamin Britten, The Young Person's Guide to the Orchestra. Square. */
export function brittenSleeve() {
  const S = 256;
  const p = new Painter(S, S, 17).fill('#f2e6c8');
  const g = p.g;
  g.fillStyle = '#c8402a'; g.fillRect(0, 0, S, 70);
  g.fillStyle = '#f2e6c8'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold 30px ${FUTURA}`; g.fillText('BENJAMIN BRITTEN', S / 2, 36);
  g.fillStyle = '#2a3550'; g.font = 'italic bold 25px Georgia, serif';
  g.fillText("The Young Person's", S / 2, 100); g.fillText('Guide to the', S / 2, 130); g.fillText('Orchestra', S / 2, 160);
  // instruments in a row
  const ink = ['#c8402a', '#e2b33c', '#3f8f8c', '#2a3550'];
  for (let i = 0; i < 4; i++) { g.fillStyle = ink[i]; g.beginPath(); g.ellipse(48 + i * 54, 212, 16, 22, 0.3, 0, TAU); g.fill(); g.fillRect(46 + i * 54, 170, 4, 30); }
  return p.texture({ wrap: false });
}

/** Canvas for tents: khaki duck with seams and a faint stain. One tile = 2 x 2 units. */
export function canvasCloth(color: number, seed = 19) {
  const S = 128;
  const p = new Painter(S, S, seed).fill(css(color));
  p.lines({ n: 50, colors: [css(color, 1.08), css(color, 0.9)], alpha: [0.15, 0.3], width: [0.6, 1.2], wobble: 0.4 });
  p.lines({ n: 50, colors: [css(color, 1.08), css(color, 0.9)], alpha: [0.15, 0.3], width: [0.6, 1.2], vertical: true, wobble: 0.4 });
  p.g.fillStyle = css(color, 0.8); p.g.fillRect(0, 0, S, 3); p.g.fillRect(0, S / 2, S, 2);
  p.dabs({ n: 10, colors: [css(color, 0.82)], r: [6, 18], alpha: [0.1, 0.2] });
  return p.texture({ repeat: [1, 1] });
}

/** A big painted sign: letters spaced like the films' titles, on painted boards with a border. */
export function boardSign(o: { title: string; sub?: string; fg: number; bg: number; border?: number; w?: number; h?: number; serif?: boolean; seed?: number }) {
  const W = o.w ?? 1024, H = o.h ?? 256;
  const p = new Painter(W, H, o.seed ?? 23).fill(css(o.bg));
  const g = p.g;
  // boards
  for (let y = 0; y < H; y += H / 4) { g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, y + H / 4 - 3, W, 3); }
  p.lines({ n: 30, colors: [css(o.bg, 0.86), css(o.bg, 1.1)], alpha: [0.2, 0.4], width: [1, 2], wobble: 1 });
  if (o.border !== undefined) { g.strokeStyle = css(o.border); g.lineWidth = H * 0.05; g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const font = (size: number) => (o.serif ? `bold ${size}px Georgia, serif` : `bold ${size}px ${FUTURA}`);
  let size = H * (o.sub ? 0.42 : 0.56);
  g.font = font(size);
  const spaced = (t: string) => [...t].join(String.fromCharCode(8202));
  const title = spaced(o.title);
  while (g.measureText(title).width > W * 0.86 && size > 10) { size -= 2; g.font = font(size); }
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillText(title, W / 2 + 3, (o.sub ? H * 0.4 : H / 2) + 4);
  g.fillStyle = css(o.fg); g.fillText(title, W / 2, o.sub ? H * 0.4 : H / 2);
  if (o.sub) {
    let s2 = H * 0.17;
    g.font = `italic ${s2}px Georgia, serif`;
    while (g.measureText(o.sub).width > W * 0.8 && s2 > 8) { s2 -= 1; g.font = `italic ${s2}px Georgia, serif`; }
    g.fillText(o.sub, W / 2, H * 0.74);
  }
  return p.texture({ wrap: false });
}

/** The United States flag of 1965, simplified (50 stars as dots). Fills the canvas. */
export function usFlag() {
  const W = 190, H = 100;
  const p = new Painter(W, H, 29).fill('#f6f2ea');
  const g = p.g;
  for (let i = 0; i < 13; i += 2) { g.fillStyle = '#b8323a'; g.fillRect(0, (i * H) / 13, W, H / 13); }
  g.fillStyle = '#2a3a6a'; g.fillRect(0, 0, W * 0.4, H * (7 / 13));
  g.fillStyle = '#f6f2ea';
  for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) { g.beginPath(); g.arc(6 + c * 12.6 + (r % 2 ? 6.3 : 0), 4 + r * 5.6, 1.6, 0, TAU); g.fill(); }
  return p.texture({ wrap: false });
}

/** The troop's pennant: Khaki Scouts, Troop 55, a pine tree on mustard. */
export function troopPennant() {
  const W = 256, H = 128;
  const p = new Painter(W, H, 31);
  const g = p.g;
  g.fillStyle = '#e2b33c'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, H / 2); g.lineTo(0, H); g.closePath(); g.fill();
  g.fillStyle = '#3f5a3a'; g.beginPath(); g.moveTo(40, 20); g.lineTo(62, 70); g.lineTo(18, 70); g.closePath(); g.fill(); g.fillRect(36, 70, 8, 14);
  g.fillStyle = '#7a2a24'; g.font = `bold 34px ${FUTURA}`; g.textBaseline = 'middle'; g.fillText('55', 82, 64);
  return p.texture({ wrap: false });
}

/** Sand with ripples and shell flecks. One tile = 4 x 4 units. */
export function sandTexture(seed = 37) {
  const S = 256;
  const p = new Painter(S, S, seed).fill(css(MK.sand));
  p.lines({ n: 40, colors: [css(MK.sand, 1.06), css(MK.sand, 0.9)], alpha: [0.2, 0.4], width: [2, 4], wobble: 4 });
  p.dabs({ n: 140, colors: [css(MK.sand, 1.1), css(MK.sand, 0.86), '#f6f0e4'], r: [0.8, 2.2], alpha: [0.4, 0.8] });
  return p.texture({ repeat: [1, 1] });
}

/**
 * MOONRISE KINGDOM spelled out in white stones on the sand, as at the end of the film. Transparent between
 * the stones. Letters are stretched along v, so laid on the ground they read from a low eye ahead.
 */
export function stoneLetters(text = 'MOONRISE KINGDOM') {
  const W = 1024, H = 256;
  const p = new Painter(W, H, 41);
  const g = p.g, rng = p.rng;
  // draw the word into a mask, then set stones along it
  const m = document.createElement('canvas'); m.width = W; m.height = H;
  const mg = m.getContext('2d')!;
  mg.fillStyle = '#fff'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
  let size = 200;
  mg.font = `bold ${size}px ${FUTURA}`;
  while (mg.measureText(text).width > W * 0.94 && size > 20) { size -= 4; mg.font = `bold ${size}px ${FUTURA}`; }
  mg.save(); mg.translate(W / 2, H / 2); mg.scale(1, 1.25); mg.fillText(text, 0, 0); mg.restore();
  const data = mg.getImageData(0, 0, W, H).data;
  for (let i = 0; i < 2600; i++) {
    const x = rng.range(0, W), y = rng.range(0, H);
    if (data[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] < 128) continue;
    const r = rng.range(4, 8);
    g.fillStyle = 'rgba(80,60,40,0.4)'; g.beginPath(); g.ellipse(x + 1.5, y + 2, r, r * 0.8, 0, 0, TAU); g.fill();
    g.fillStyle = css(rng.pick([0xf6f3ea, 0xe8e2d4, 0xd8d2c6, 0xfbf8f2])); g.beginPath(); g.ellipse(x, y, r, r * rng.range(0.6, 0.9), rng.range(0, 3), 0, TAU); g.fill();
  }
  return p.texture({ wrap: false });
}

/** White clapboard with tall pointed windows of stained glass; returns map and emissive (the glass). Tile = one bay, 3 x 6 units. */
export function churchBay(seed = 43) {
  const W = 192, H = 384;
  const p = new Painter(W, H, seed).fill(css(MK.white));
  const e = new Painter(W, H, 1).fill('#000');
  const g = p.g, eg = e.g, rng = p.rng;
  for (let y = 0; y < H; y += 16) { g.fillStyle = css(MK.white, 0.86); g.fillRect(0, y + 14, W, 2); }
  const wx = W / 2 - 34, wy = 90, ww = 68, wh = 200;
  const arch = (gg: CanvasRenderingContext2D, pad: number) => {
    gg.beginPath(); gg.moveTo(wx - pad, wy + wh + pad); gg.lineTo(wx - pad, wy + 30);
    gg.quadraticCurveTo(wx - pad, wy - 30 - pad, wx + ww / 2, wy - 40 - pad); gg.quadraticCurveTo(wx + ww + pad, wy - 30 - pad, wx + ww + pad, wy + 30); gg.lineTo(wx + ww + pad, wy + wh + pad); gg.closePath();
  };
  g.fillStyle = '#5a5a5a'; arch(g, 9); g.fill();
  g.fillStyle = css(MK.white); arch(g, 6); g.fill();
  g.save(); arch(g, 0); g.clip();
  eg.save(); arch(eg, 0); eg.clip();
  for (let y = wy - 40; y < wy + wh; y += 22) for (let x = wx; x < wx + ww; x += 17) {
    const c = rng.pick(['#c84a3a', '#e2b33c', '#3f7fa8', '#4f8a5a', '#a85a9a', '#e88a3a']);
    g.fillStyle = c; g.fillRect(x, y, 17, 22); eg.fillStyle = c; eg.fillRect(x, y, 17, 22);
  }
  g.strokeStyle = '#2a2420'; g.lineWidth = 3;
  for (let y = wy - 40; y < wy + wh; y += 22) { g.beginPath(); g.moveTo(wx, y); g.lineTo(wx + ww, y); g.stroke(); }
  for (let x = wx; x < wx + ww; x += 17) { g.beginPath(); g.moveTo(x, wy - 40); g.lineTo(x, wy + wh); g.stroke(); }
  g.restore(); eg.restore();
  g.fillStyle = css(MK.white, 0.9); g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
  return { map: p.texture({ repeat: [1, 1] }), emissive: e.texture({ repeat: [1, 1] }) };
}

/** A soft glowing streak for a lightning bolt's ribbon: white core, blue-violet glow at the sides. */
export function boltTexture() {
  const W = 64, H = 8;
  const p = new Painter(W, H, 47);
  const g = p.g;
  const gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, 'rgba(160,170,255,0)'); gr.addColorStop(0.35, 'rgba(190,200,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.65, 'rgba(190,200,255,0.55)'); gr.addColorStop(1, 'rgba(160,170,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const t = p.texture({ wrap: false });
  return t;
}

/** A painted hand-lettered board: the ark's name plate for the church play. */
export function noyeBoard() {
  return boardSign({ title: "NOYE'S FLUDDE", sub: "St. Jack's Church, by Benjamin Britten", fg: 0xf4ecda, bg: 0x7a2a24, border: 0xe2b33c, w: 768, h: 192, serif: true, seed: 53 });
}

/** A distant shore painted on a flat: hills of pine, a white farmhouse, a lighthouse, under a hazy sky. Transparent sky. */
export function shoreBackdrop(o: { hills: number; far: number; seed: number; lighthouse?: boolean }) {
  const W = 1024, H = 256;
  const p = new Painter(W, H, o.seed);
  const g = p.g, rng = p.rng;
  const ridge = (base: number, amp: number, col: string, f: number) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin(x * f + o.seed)) * (0.6 + 0.4 * Math.sin(x * f * 2.7 + 1.3)));
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  ridge(H * 0.62, H * 0.3, css(o.far), 0.006);
  ridge(H * 0.8, H * 0.3, css(o.hills), 0.011);
  // pines along the near ridge
  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, W), y = H * rng.range(0.66, 0.95), h = rng.range(14, 30);
    g.fillStyle = css(o.hills, rng.range(0.78, 0.92)); g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h * 0.3, y); g.lineTo(x - h * 0.3, y); g.closePath(); g.fill();
  }
  if (o.lighthouse) { const x = W * 0.72; g.fillStyle = '#f4f0e6'; g.fillRect(x, H * 0.42, 10, H * 0.3); g.fillStyle = '#b0473a'; g.fillRect(x - 2, H * 0.38, 14, 10); }
  g.fillStyle = css(o.hills, 0.8); g.fillRect(0, H * 0.94, W, H * 0.06);
  return p.texture({ wrap: false });
}

/** A rolled-up chart of New Penzance with Sam's route marked, for the camp's notice board. */
export function islandMap() {
  const W = 256, H = 192;
  const p = new Painter(W, H, 59).fill('#ece0bc');
  const g = p.g;
  g.fillStyle = '#9cc4c8'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#c8c890'; g.beginPath(); g.moveTo(40, 150); g.bezierCurveTo(20, 80, 90, 20, 150, 30); g.bezierCurveTo(230, 40, 240, 120, 190, 160); g.bezierCurveTo(140, 190, 70, 180, 40, 150); g.fill();
  g.strokeStyle = '#7a6a4a'; g.lineWidth = 2; g.stroke();
  g.strokeStyle = '#b0473a'; g.lineWidth = 3; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(80, 140); g.quadraticCurveTo(120, 70, 190, 90); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#2a3550'; g.font = `bold 15px ${FUTURA}`; g.textAlign = 'center'; g.fillText('NEW PENZANCE', W / 2, 22);
  g.font = 'italic 11px Georgia, serif'; g.fillText('Mile 3.25 Tidal Inlet', 190, 110);
  g.fillStyle = '#b0473a'; g.beginPath(); g.arc(190, 90, 4, 0, TAU); g.fill();
  return p.texture({ wrap: false });
}

/** Rock: grey-brown with lichen. One tile = 3 x 3 units. */
export function rockTexture(seed = 61) {
  const S = 128;
  const p = new Painter(S, S, seed).fill('#857c70');
  p.dabs({ n: 60, colors: ['#968c7e', '#6e665c', '#a49a8a'], r: [4, 18], alpha: [0.3, 0.6] });
  p.dabs({ n: 30, colors: ['#b8b070', '#c8c09a'], r: [2, 6], alpha: [0.3, 0.6] });
  return p.texture({ repeat: [1, 1] });
}

export { hex };
