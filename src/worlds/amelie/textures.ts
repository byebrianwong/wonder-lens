import * as THREE from 'three';
import { Painter } from '../../engine/Paint';
import { Rng, TAU, clamp } from '../../engine/math';

/**
 * Painted textures for the Amélie world. The palette follows the film's grade: warm ochre and cream walls,
 * bottle greens, deep reds, gold light, and very little blue.
 *
 * Tiling textures are meant for geometry with world-unit UVs (boxUV / repeatUV in engine/Paint.ts); each one
 * says how much of the world one tile covers.
 */

const tmpC = new THREE.Color(), tmpMix = new THREE.Color();
const rgb = { r: 0, g: 0, b: 0 };
/** CSS colour of a hex colour, optionally mixed towards another colour by t, with its brightness scaled by k. */
export function css(hex: THREE.ColorRepresentation, k = 1, mixWith?: THREE.ColorRepresentation, t = 0) {
  tmpC.set(hex);
  if (mixWith !== undefined) tmpC.lerp(tmpMix.set(mixWith), t);
  tmpC.getRGB(rgb, THREE.SRGBColorSpace);
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255 * k)));
  return `rgb(${f(rgb.r)},${f(rgb.g)},${f(rgb.b)})`;
}
const cssA = (hex: THREE.ColorRepresentation, a: number, k = 1) => css(hex, k).replace('rgb(', 'rgba(').replace(')', `,${a})`);

/** The film's colours. */
export const PAL = {
  red: 0xb8282a, deepRed: 0x7a1a1c, wine: 0x5a1418, green: 0x2f5a34, bottle: 0x1f4a2e, moss: 0x5f7a32, gold: 0xe8b04a, amber: 0xf0a040,
  cream: 0xf0e2c0, ochre: 0xe2b870, plaster: 0xead6b0, pink: 0xe8b8a0, zinc: 0x7d8a8c, iron: 0x22302a, ink: 0x221a16, teal: 0x2e5a52,
};

// ---------------- ground ----------------
/** Paris setts laid in fanned arcs, with dark joints and a worn sheen. One tile = 4 x 4 units. */
export function cobbles(color = 0x6a6258, seed = 3) {
  const S = 512;
  const p = new Painter(S, S, seed).fill(css(color, 0.45));
  const g = p.g, rng = p.rng;
  const R = S / 4; // arc radius: four fans across the tile
  for (let row = -1; row < 9; row++) {
    for (let col = -1; col < 5; col++) {
      const cx = col * R + (row % 2 ? R / 2 : 0) + R / 2, cy = row * R * 0.5;
      for (let ring = 6; ring >= 1; ring--) {
        const rr = (ring / 6) * R * 0.98;
        const n = 3 + ring * 2;
        for (let k = 0; k < n; k++) {
          const a0 = Math.PI * 0.08 + (k / n) * Math.PI * 0.84, a1 = Math.PI * 0.08 + ((k + 1) / n) * Math.PI * 0.84;
          const am = (a0 + a1) / 2;
          const x = cx + Math.cos(am) * (rr - R / 12), y = cy + Math.sin(am) * (rr - R / 12);
          const w = (a1 - a0) * rr * 0.9, h = R / 7;
          const l = rng.range(0.82, 1.16);
          for (const ox of [0, S, -S]) for (const oy of [0, S, -S]) {
            const X = x + ox, Yy = y + oy;
            if (X < -40 || X > S + 40 || Yy < -40 || Yy > S + 40) continue;
            g.save(); g.translate(X, Yy); g.rotate(am + Math.PI / 2);
            g.fillStyle = css(color, l, 0x8a7a5a, rng.range(0, 0.4));
            g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 5); g.fill();
            g.fillStyle = 'rgba(255,240,210,0.13)'; g.beginPath(); g.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.4, 3); g.fill();
            g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-w / 2 + 2, h / 2 - 4, w - 4, 3);
            g.restore();
          }
        }
      }
    }
  }
  p.dabs({ n: 140, colors: ['rgba(30,24,18,1)', 'rgba(70,80,50,1)', 'rgba(255,230,190,1)'], r: [6, 40], alpha: [0.03, 0.08], squash: 0.6 });
  return p.texture({ repeat: [1, 1] });
}

/** Asphalt pavement with kerb-side slabs, scuffs and gum spots. One tile = 4 x 4 units. */
export function pavement(color = 0x8a8478, seed = 5) {
  const p = new Painter(256, 256, seed).fill(css(color));
  p.dabs({ n: 260, colors: [css(color, 1.08), css(color, 0.9), css(color, 0.82)], r: [2, 14], alpha: [0.08, 0.2] });
  p.dabs({ n: 40, colors: ['#3a3430'], r: [1, 2.2], alpha: [0.3, 0.5] });
  const g = p.g;
  g.strokeStyle = 'rgba(40,34,28,0.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(0, i * 128); g.lineTo(256, i * 128); g.stroke(); g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 256); g.stroke(); }
  return p.texture({ repeat: [1, 1] });
}

/** Ashlar limestone: courses of pale blocks with fine joints. One tile = 4 x 4 units. */
export function ashlar(color = PAL.cream, seed = 7) {
  const p = new Painter(256, 256, seed).fill(css(color));
  const g = p.g, rng = p.rng;
  const rows = 8, rh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rng.range(10, 40) : 0;
    while (x < 256) {
      const w = rng.range(44, 90);
      g.fillStyle = css(color, rng.range(0.93, 1.05), 0xd8b88a, rng.range(0, 0.25));
      g.fillRect(x + 1, r * rh + 1, w - 2, rh - 2);
      x += w;
    }
    g.fillStyle = 'rgba(90,70,50,0.22)'; g.fillRect(0, r * rh, 256, 1.5);
  }
  p.dabs({ n: 80, colors: ['rgba(80,60,40,1)', 'rgba(255,250,235,1)'], r: [4, 22], alpha: [0.03, 0.07], squash: 0.6 });
  return p.texture({ repeat: [1, 1] });
}

/** Plaster wall with soft tone variation and rain streaks. One tile = 4 x 4 units. */
export function plaster(color: number, seed = 9) {
  const p = new Painter(256, 256, seed).fill(css(color));
  p.dabs({ n: 70, colors: [css(color, 1.05), css(color, 0.93), css(color, 0.97, 0xc89060, 0.2)], r: [8, 34], alpha: [0.06, 0.14], squash: 0.7 });
  p.dabs({ n: 140, colors: [css(color, 1.1), css(color, 0.88)], r: [0.8, 2], alpha: [0.15, 0.3] });
  return p.texture({ repeat: [1, 1] });
}

/** Zinc roofing: standing seams running down the slope, blue-grey with silver light. One tile = 3 x 3 units. */
export function zinc(seed = 11) {
  const p = new Painter(128, 128, seed).fill('#7a8688');
  const g = p.g, rng = p.rng;
  for (let x = 0; x < 128; x += 16) {
    const k = rng.range(0.9, 1.08);
    g.fillStyle = css(0x7a8688, k, 0x9aa8a0, rng.range(0, 0.3)); g.fillRect(x, 0, 16, 128);
    g.fillStyle = 'rgba(230,240,235,0.35)'; g.fillRect(x, 0, 2, 128);
    g.fillStyle = 'rgba(20,30,30,0.3)'; g.fillRect(x + 2, 0, 2, 128);
  }
  p.vgrad([[0, 'rgba(255,255,255,0.08)'], [1, 'rgba(0,0,0,0.12)']]);
  p.dabs({ n: 30, colors: ['rgba(60,70,60,1)', 'rgba(200,210,200,1)'], r: [3, 12], alpha: [0.04, 0.1], squash: 2 });
  return p.texture({ repeat: [1, 1] });
}

/** Terracotta chimney pots and brick stacks. */
export function brick(color = 0xb0603e, seed = 13) {
  const p = new Painter(128, 128, seed).fill(css(color, 0.7));
  const g = p.g, rng = p.rng;
  for (let r = 0; r < 16; r++) for (let c = -1; c < 5; c++) {
    const x = c * 32 + (r % 2 ? 16 : 0), y = r * 8;
    g.fillStyle = css(color, rng.range(0.82, 1.12)); g.fillRect(x + 1, y + 1, 30, 6);
  }
  p.dabs({ n: 30, colors: ['rgba(30,20,20,1)'], r: [4, 16], alpha: [0.05, 0.15] });
  return p.texture({ repeat: [1, 1] });
}

/** Wooden floorboards, with knots and a waxed sheen. One tile = 4 x 4 units. */
export function boards(color = 0x8a5a34, seed = 15) {
  const p = new Painter(256, 256, seed).fill(css(color));
  const g = p.g, rng = p.rng;
  const n = 8, w = 256 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = css(color, rng.range(0.85, 1.12)); g.fillRect(i * w, 0, w, 256);
    let y = rng.range(-200, 0);
    while (y < 256) { const len = rng.range(120, 260); g.fillStyle = 'rgba(30,15,5,0.4)'; g.fillRect(i * w, y, w, 2); y += len; }
    g.fillStyle = 'rgba(25,12,4,0.45)'; g.fillRect(i * w, 0, 2, 256);
  }
  p.lines({ n: 70, colors: [css(color, 0.7), css(color, 1.25)], alpha: [0.15, 0.35], width: [0.6, 1.6], vertical: true, wobble: 2 });
  p.dabs({ n: 10, colors: [css(color, 0.55)], r: [2, 4], alpha: [0.4, 0.7], squash: 2.2 });
  p.vgrad([[0, 'rgba(255,230,190,0.05)'], [1, 'rgba(0,0,0,0.05)']]);
  return p.texture({ repeat: [1, 1] });
}

/** Small hexagonal café floor tiles, white with a red and black border pattern. One tile = 3 x 3 units. */
export function mosaic(seed = 17) {
  const S = 256;
  const p = new Painter(S, S, seed).fill('#d8cfbc');
  const g = p.g, rng = p.rng;
  const r = 8, h = r * Math.sqrt(3);
  for (let row = -1; row < S / h + 1; row++) for (let col = -1; col < S / (r * 3) + 2; col++) {
    const x = col * r * 3 + (row % 2 ? r * 1.5 : 0), y = row * h / 2;
    const ring = (Math.floor((x + 1000) / 64) + Math.floor((y + 1000) / 64)) % 2;
    const cell = Math.round(x / 64) * 64, celly = Math.round(y / 64) * 64;
    const d = Math.hypot(x - cell, y - celly);
    let c = css(0xeee6d4, rng.range(0.94, 1.03));
    if (d < 14) c = ring ? '#9a2a24' : '#2a2420';
    else if (d < 22 && ring) c = '#c8b890';
    g.fillStyle = c;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; const px = x + Math.cos(a) * (r - 1), py = y + Math.sin(a) * (r - 1); if (k === 0) g.moveTo(px, py); else g.lineTo(px, py); }
    g.closePath(); g.fill();
  }
  p.dabs({ n: 40, colors: ['rgba(120,90,50,1)'], r: [10, 40], alpha: [0.03, 0.07] });
  return p.texture({ repeat: [1, 1] });
}

// ---------------- buildings ----------------
export interface FacadeOpts {
  wall: number;
  /** window frames and surrounds */
  frame?: number;
  /** louvred shutters either side of each window */
  shutters?: number;
  bays?: number;
  storeys?: number;
  /** storeys (from 0 at the bottom of the tile) with a continuous iron balcony */
  balcony?: number[];
  /** fraction of windows with lights on (drawn into the emissive map) */
  lit?: number;
  /** stone courses drawn across the wall */
  ashlar?: boolean;
  /** red geraniums in boxes under some windows */
  flowers?: number;
  /** curtains in lit windows */
  curtain?: number;
  /** how the unlit glass reads: 'day' reflects a warm sky, 'night' is dark */
  glass?: 'day' | 'night';
  seed?: number;
}

/**
 * A wall of tall French windows, `bays` wide and `storeys` tall, 160 px per bay and 200 px per storey.
 * Returns the colour map and an emissive map where lit windows glow. Meant for a box with
 * boxUV(geo, bays * BAY, storeys * STOREY) and walls a whole number of bays wide.
 */
export function parisFacade(o: FacadeOpts) {
  const bays = o.bays ?? 3, storeys = o.storeys ?? 2;
  const BW = 160, SH = 200, W = BW * bays, H = SH * storeys;
  const rng = new Rng(o.seed ?? 3);
  const p = new Painter(W, H, (o.seed ?? 3) + 1).fill(css(o.wall));
  const e = new Painter(W, H, 1).fill('#000');
  const g = p.g, eg = e.g;
  p.dabs({ n: 14 * bays * storeys, colors: [css(o.wall, 1.05), css(o.wall, 0.93), css(o.wall, 0.96, 0xb07a40, 0.25)], r: [10, 40], alpha: [0.06, 0.13], squash: 0.6 });
  if (o.ashlar) {
    for (let y = 0; y < H; y += SH / 5) {
      g.fillStyle = 'rgba(90,60,40,0.16)'; g.fillRect(0, y, W, 1.5);
      for (let x = (y / (SH / 5)) % 2 ? 30 : 0; x < W; x += 80) { g.fillStyle = 'rgba(90,60,40,0.1)'; g.fillRect(x, y, 1.2, SH / 5); }
    }
  }
  const frame = css(o.frame ?? 0xf6eedc), frameD = css(o.frame ?? 0xf6eedc, 0.72);
  const ironC = css(PAL.iron), ironL = css(PAL.iron, 1.8);
  for (let s = 0; s < storeys; s++) {
    // the top of storey s in canvas y (storey 0 is at the bottom of the tile)
    const y0 = H - (s + 1) * SH;
    // string course at the floor line
    g.fillStyle = css(o.wall, 1.08); g.fillRect(0, y0 + SH - 10, W, 6);
    g.fillStyle = 'rgba(70,40,30,0.2)'; g.fillRect(0, y0 + SH - 4, W, 4);
    for (let b = 0; b < bays; b++) {
      const x0 = b * BW;
      const ww = 64, wh = 132, wx = x0 + BW / 2 - ww / 2, wy = y0 + 34;
      const lit = rng.next() < (o.lit ?? 0.3);
      // surround with a little cornice above
      g.fillStyle = 'rgba(70,40,30,0.18)'; g.fillRect(wx - 12, wy - 8, ww + 24, wh + 18);
      g.fillStyle = frame; g.fillRect(wx - 10, wy - 10, ww + 20, wh + 14);
      g.fillStyle = css(o.frame ?? 0xf6eedc, 1.05); g.fillRect(wx - 16, wy - 22, ww + 32, 9);
      g.fillStyle = 'rgba(70,40,30,0.25)'; g.fillRect(wx - 16, wy - 13, ww + 32, 3);
      // shutters
      if (o.shutters !== undefined) {
        for (const sx of [wx - 40, wx + ww + 10]) {
          g.fillStyle = css(o.shutters); g.fillRect(sx, wy - 4, 30, wh + 4);
          g.fillStyle = css(o.shutters, 0.72);
          for (let k = 6; k < wh - 4; k += 7) g.fillRect(sx + 3, wy + k, 24, 2.5);
          g.fillStyle = css(o.shutters, 1.2); g.fillRect(sx, wy - 4, 30, 2);
        }
      }
      // glass
      if (lit) {
        const gr = g.createLinearGradient(wx, wy, wx, wy + wh);
        gr.addColorStop(0, '#ffe2a0'); gr.addColorStop(1, '#f0a850');
        g.fillStyle = gr;
      } else if (o.glass === 'night') {
        const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
        gr.addColorStop(0, '#22302e'); gr.addColorStop(1, '#3a4a40');
        g.fillStyle = gr;
      } else {
        const gr = g.createLinearGradient(wx, wy, wx + ww * 0.4, wy + wh);
        gr.addColorStop(0, '#c8c0a0'); gr.addColorStop(0.45, '#5a6a60'); gr.addColorStop(1, '#2e3a36');
        g.fillStyle = gr;
      }
      g.fillRect(wx, wy, ww, wh);
      if (!lit) { g.fillStyle = 'rgba(255,240,210,0.18)'; g.beginPath(); g.moveTo(wx + 8, wy + wh); g.lineTo(wx + 26, wy); g.lineTo(wx + 38, wy); g.lineTo(wx + 20, wy + wh); g.fill(); }
      // curtains: half-drawn lace, warm when lit
      const cc = lit ? css(o.curtain ?? 0xc84030, 1) : 'rgba(240,230,210,0.5)';
      g.fillStyle = cc;
      g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo(wx + ww * 0.32, wy + wh * 0.4, wx + 6, wy + wh); g.lineTo(wx, wy + wh); g.fill();
      g.beginPath(); g.moveTo(wx + ww, wy); g.quadraticCurveTo(wx + ww * 0.68, wy + wh * 0.4, wx + ww - 6, wy + wh); g.lineTo(wx + ww, wy + wh); g.fill();
      // glazing bars: two leaves of three panes
      g.fillStyle = frameD; g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
      for (let k = 1; k < 3; k++) g.fillRect(wx, wy + (wh * k) / 3 - 1.5, ww, 3);
      g.fillStyle = frame; g.fillRect(wx, wy, ww, 3); g.fillRect(wx, wy, 3, wh); g.fillRect(wx + ww - 3, wy, 3, wh);
      // iron guard rail across the bottom of the window (unless a full balcony runs here)
      if (!o.balcony?.includes(s)) {
        g.fillStyle = ironC; g.fillRect(wx - 6, wy + wh - 40, ww + 12, 3); g.fillRect(wx - 6, wy + wh - 2, ww + 12, 3);
        g.strokeStyle = ironC; g.lineWidth = 1.6;
        for (let k = 0; k < 6; k++) { const cx = wx - 2 + (k + 0.5) * ((ww + 4) / 6); g.beginPath(); g.ellipse(cx, wy + wh - 20, 4.5, 16, 0, 0, TAU); g.stroke(); }
      }
      // sill
      g.fillStyle = frame; g.fillRect(wx - 14, wy + wh + 2, ww + 28, 7);
      g.fillStyle = 'rgba(70,40,30,0.25)'; g.fillRect(wx - 12, wy + wh + 9, ww + 24, 4);
      // rain streaks below the sill
      const st = g.createLinearGradient(0, wy + wh + 12, 0, wy + wh + 60);
      st.addColorStop(0, 'rgba(70,50,30,0.12)'); st.addColorStop(1, 'rgba(70,50,30,0)');
      g.fillStyle = st; g.fillRect(wx - 6, wy + wh + 12, ww + 12, 48);
      // flowers in a window box
      if (rng.next() < (o.flowers ?? 0)) {
        g.fillStyle = '#6a3a24'; g.fillRect(wx - 8, wy + wh - 12, ww + 16, 14);
        for (let k = 0; k < 26; k++) {
          const fx = wx - 6 + rng.range(0, ww + 12), fy = wy + wh - 14 - rng.range(0, 18);
          g.fillStyle = rng.chance(0.4) ? '#3a6a2a' : rng.pick(['#d8282a', '#e83a3a', '#c41e2a', '#f05a4a']);
          g.beginPath(); g.arc(fx, fy, rng.range(3, 6), 0, TAU); g.fill();
        }
      }
      if (lit) {
        eg.fillStyle = '#ffd890'; eg.fillRect(wx, wy, ww, wh);
        eg.fillStyle = '#000'; eg.fillRect(wx + ww / 2 - 2, wy, 4, wh); for (let k = 1; k < 3; k++) eg.fillRect(wx, wy + (wh * k) / 3 - 1.5, ww, 3);
        eg.fillStyle = 'rgba(0,0,0,0.55)';
        eg.beginPath(); eg.moveTo(wx, wy); eg.quadraticCurveTo(wx + ww * 0.32, wy + wh * 0.4, wx + 6, wy + wh); eg.lineTo(wx, wy + wh); eg.fill();
        eg.beginPath(); eg.moveTo(wx + ww, wy); eg.quadraticCurveTo(wx + ww * 0.68, wy + wh * 0.4, wx + ww - 6, wy + wh); eg.lineTo(wx + ww, wy + wh); eg.fill();
      }
    }
    if (o.balcony?.includes(s)) {
      // a continuous wrought-iron balcony across the bottom of the storey
      const by = y0 + SH - 12;
      g.fillStyle = 'rgba(60,40,30,0.3)'; g.fillRect(0, by + 4, W, 8);
      g.fillStyle = ironC; g.fillRect(0, by - 44, W, 4); g.fillRect(0, by - 2, W, 4);
      g.strokeStyle = ironC; g.lineWidth = 1.8;
      for (let x = 6; x < W; x += 14) {
        g.beginPath(); g.moveTo(x, by - 40); g.lineTo(x, by - 2); g.stroke();
        g.beginPath(); g.arc(x + 7, by - 30, 5, Math.PI, 0); g.stroke();
        g.beginPath(); g.arc(x + 7, by - 12, 5, 0, Math.PI); g.stroke();
      }
      g.strokeStyle = ironL; g.lineWidth = 1; g.beginPath(); g.moveTo(0, by - 45); g.lineTo(W, by - 45); g.stroke();
    }
  }
  return { map: p.texture({ repeat: [1, 1] }), emissive: e.texture({ repeat: [1, 1] }) };
}

export interface ShopOpts {
  name: string;
  /** painted wood colour of the shopfront */
  paint: number;
  /** lettering colour */
  letters?: number;
  /** what fills the windows */
  goods: 'bread' | 'cheese' | 'flowers' | 'books' | 'bottles' | 'cakes' | 'fruit' | 'tabac' | 'empty';
  /** small line under the name */
  sub?: string;
  seed?: number;
  /** canvas size; the default suits a front about 10 x 4.4 units */
  w?: number; h?: number;
}

/** A painted shopfront: fascia with the name in gilt serif letters, two display windows full of goods, a glazed door. */
export function shopfront(o: ShopOpts) {
  const W = o.w ?? 640, H = o.h ?? 280;
  const p = new Painter(W, H, o.seed ?? 21).fill(css(o.paint));
  const e = new Painter(W, H, 1).fill('#000');
  const g = p.g, eg = e.g, rng = p.rng;
  const paintD = css(o.paint, 0.62), paintL = css(o.paint, 1.3);
  // fascia
  const fh = H * 0.24;
  g.fillStyle = paintD; g.fillRect(0, 0, W, 6); g.fillRect(0, fh - 6, W, 6);
  g.fillStyle = paintL; g.fillRect(0, 6, W, 2); g.fillRect(0, fh - 8, W, 2);
  g.fillStyle = css(o.letters ?? PAL.gold);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = fh * 0.62;
  g.font = `bold ${size}px Georgia, 'Times New Roman', serif`;
  while (g.measureText(o.name).width > W * 0.9 && size > 10) { size -= 2; g.font = `bold ${size}px Georgia, 'Times New Roman', serif`; }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(o.name, W / 2 + 2, fh / 2 + 3);
  g.fillStyle = css(o.letters ?? PAL.gold); g.fillText(o.name, W / 2, fh / 2 + 1);
  if (o.sub) { g.font = `italic ${fh * 0.18}px Georgia, serif`; g.fillText(o.sub, W / 2, fh - 14); }
  // pilasters
  for (const x of [0, W - 22]) { g.fillStyle = paintD; g.fillRect(x, fh, 22, H - fh); g.fillStyle = paintL; g.fillRect(x + 4, fh, 3, H - fh); }
  // windows and door
  const wy = fh + 14, wh = H - fh - 70, dw = W * 0.16;
  const win = [[30, W / 2 - dw / 2 - 40], [W / 2 + dw / 2 + 10, W - 30]];
  for (const [a, b] of win) {
    const ww = b - a;
    // a warm, dim shop interior behind the glass; the emissive map lights it up at night
    const gr = g.createLinearGradient(0, wy, 0, wy + wh);
    gr.addColorStop(0, '#b08a5a'); gr.addColorStop(1, '#6a4a30');
    g.fillStyle = gr; g.fillRect(a, wy, ww, wh);
    eg.fillStyle = '#e8b070'; eg.fillRect(a, wy, ww, wh);
    // goods on two shelves
    const shelf = (y: number) => { g.fillStyle = paintD; g.fillRect(a, y, ww, 5); };
    const items = o.goods;
    for (let row = 0; row < 2; row++) {
      const y = wy + wh * (row ? 0.95 : 0.5);
      shelf(y);
      for (let x = a + 8; x < b - 10; x += rng.range(14, 26)) {
        g.save(); g.translate(x, y);
        if (items === 'bread') { g.fillStyle = rng.pick(['#c8823a', '#b06a2a', '#d89a4a']); g.beginPath(); g.ellipse(6, -10, 12, 8, rng.range(-0.3, 0.3), 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,230,180,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-1, -12); g.lineTo(4, -6); g.moveTo(5, -14); g.lineTo(10, -8); g.stroke(); }
        else if (items === 'cheese') { g.fillStyle = rng.pick(['#f0d070', '#e8c060', '#f6e4a0']); g.beginPath(); g.ellipse(7, -8, 11, 8, 0, Math.PI, TAU); g.lineTo(18, 0); g.lineTo(-4, 0); g.fill(); }
        else if (items === 'flowers') { g.fillStyle = '#4a7a3a'; g.fillRect(5, -16, 3, 16); for (let k = 0; k < 4; k++) { g.fillStyle = rng.pick(['#e83a5a', '#f0c040', '#f6f0f0', '#d84a2a', '#c04ad0']); g.beginPath(); g.arc(6 + rng.range(-6, 6), -18 - rng.range(0, 10), 5, 0, TAU); g.fill(); } }
        else if (items === 'books') { for (let k = 0; k < 4; k++) { g.fillStyle = rng.pick(['#8a2a24', '#2a4a3a', '#c89a3a', '#3a3a5a', '#e8d8b0']); g.fillRect(k * 4, -rng.range(16, 26), 3.5, 26); } }
        else if (items === 'bottles') { g.fillStyle = rng.pick(['#2a4a2a', '#5a1a1a', '#8aa040', '#d8c080']); g.fillRect(2, -22, 9, 22); g.fillRect(4.5, -30, 4, 8); }
        else if (items === 'cakes') { g.fillStyle = rng.pick(['#f0b0c0', '#e8d0a0', '#a05030', '#f6e8d8']); g.beginPath(); g.ellipse(7, -6, 9, 6, 0, 0, TAU); g.fill(); g.fillStyle = '#c8282a'; g.beginPath(); g.arc(7, -12, 2.5, 0, TAU); g.fill(); }
        else if (items === 'fruit') { for (let k = 0; k < 5; k++) { g.fillStyle = rng.pick(['#d83a2a', '#f09a2a', '#e8d040', '#8ab83a']); g.beginPath(); g.arc(k * 4 + rng.range(-1, 1), -5 - (k % 2) * 6, 5, 0, TAU); g.fill(); } }
        else if (items === 'tabac') { g.fillStyle = rng.pick(['#e8e0c8', '#c8282a', '#2a4a8a', '#f0c040']); g.fillRect(0, -14, 10, 14); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, -14, 10, 3); }
        g.restore();
      }
    }
    // window glazing bar and reflection
    g.fillStyle = paintD; g.fillRect(a, wy, ww, 5); g.fillRect(a + ww / 2 - 2, wy, 4, wh);
    g.fillStyle = 'rgba(255,250,235,0.16)'; g.beginPath(); g.moveTo(a + 10, wy + wh); g.lineTo(a + ww * 0.4, wy); g.lineTo(a + ww * 0.55, wy); g.lineTo(a + 25, wy + wh); g.fill();
    // panelled stall riser below
    g.fillStyle = paintD; g.fillRect(a, wy + wh + 8, ww, H - wy - wh - 14);
    g.strokeStyle = paintL; g.lineWidth = 2; g.strokeRect(a + 8, wy + wh + 16, ww - 16, H - wy - wh - 30);
  }
  // door
  const dx = W / 2 - dw / 2;
  g.fillStyle = paintD; g.fillRect(dx - 6, wy - 6, dw + 12, H - wy + 6);
  g.fillStyle = '#9a7650'; g.fillRect(dx + 8, wy + 6, dw - 16, H * 0.42);
  eg.fillStyle = '#b07a40'; eg.fillRect(dx + 8, wy + 6, dw - 16, H * 0.42);
  g.fillStyle = paintL; g.fillRect(dx + 8, wy + 6 + H * 0.42 + 8, dw - 16, 3);
  g.fillStyle = css(PAL.gold); g.beginPath(); g.arc(dx + dw - 16, wy + H * 0.5, 4, 0, TAU); g.fill();
  p.vgrad([[0, 'rgba(0,0,0,0)'], [0.85, 'rgba(0,0,0,0)'], [1, 'rgba(30,20,10,0.25)']]);
  return { map: p.texture({ wrap: false }), emissive: e.texture({ wrap: false }) };
}

/** Awning cloth: wide stripes with a scalloped valance band along the bottom. */
export function awning(a: number, b: number, seed = 25) {
  const p = new Painter(256, 128, seed).fill(css(a));
  const g = p.g;
  for (let x = 0; x < 256; x += 32) { g.fillStyle = css(b); g.fillRect(x + 16, 0, 16, 128); }
  for (let x = 0; x < 256; x += 8) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(x, 0, 2, 128); }
  p.vgrad([[0, 'rgba(255,240,200,0.15)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.2)']]);
  return p.texture({ repeat: [1, 1] });
}

/** Wooden slats of a market crate, with a stencilled name on the end. */
export function crateWood(label: string, seed = 27) {
  const p = new Painter(256, 128, seed).fill('#c49a62');
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 4; i++) {
    g.fillStyle = css(0xc49a62, rng.range(0.85, 1.1)); g.fillRect(0, i * 32 + 2, 256, 28);
    g.fillStyle = 'rgba(60,35,15,0.5)'; g.fillRect(0, i * 32 + 30, 256, 2);
  }
  p.lines({ n: 40, colors: ['#8a6a3a', '#e0c08a'], alpha: [0.2, 0.4], width: [0.6, 1.4], wobble: 1 });
  g.fillStyle = 'rgba(120,40,30,0.75)';
  g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 128, 64);
  g.strokeStyle = 'rgba(120,40,30,0.6)'; g.lineWidth = 2; g.strokeRect(60, 40, 136, 48);
  return p.texture({ wrap: false });
}

/** A chalkboard price card: "1,80 F le kilo" in loopy white chalk. */
export function chalkSign(text: string, price: string, seed = 29) {
  const p = new Painter(128, 96, seed).fill('#1e2420');
  const g = p.g;
  p.dabs({ n: 30, colors: ['rgba(255,255,255,1)'], r: [4, 18], alpha: [0.02, 0.06] });
  g.fillStyle = '#f4f0e0'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic 22px Georgia, serif'; g.fillText(text, 64, 32);
  g.font = 'bold 26px Georgia, serif'; g.fillStyle = '#f6e090'; g.fillText(price, 64, 66);
  g.strokeStyle = '#8a5a30'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 90);
  return p.texture({ wrap: false });
}

/** Painted fruit skin for spheres: a base colour with a blush, speckles and a soft highlight. */
export function fruitSkin(base: number, blush: number, seed = 31, speckle = 0.5) {
  const p = new Painter(128, 64, seed).fill(css(base));
  p.dabs({ n: 14, colors: [css(blush)], r: [8, 26], alpha: [0.2, 0.45], squash: 1.6, y: [0.2, 0.8] });
  p.lines({ n: 20, colors: [css(blush, 0.9)], alpha: [0.1, 0.25], width: [1, 3], vertical: true, wobble: 3 });
  p.dabs({ n: Math.round(160 * speckle), colors: [css(base, 1.3), css(base, 0.7)], r: [0.5, 1.3], alpha: [0.3, 0.6] });
  p.vgrad([[0, 'rgba(255,255,230,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.18)']]);
  return p.texture();
}

/** Burlap for sacks. */
export function burlap(color = 0xc8a878, seed = 33) {
  const p = new Painter(128, 128, seed).fill(css(color));
  p.lines({ n: 60, colors: [css(color, 0.8), css(color, 1.15)], alpha: [0.25, 0.5], width: [1, 2], wobble: 0.6 });
  p.lines({ n: 60, colors: [css(color, 0.8), css(color, 1.15)], alpha: [0.25, 0.5], width: [1, 2], vertical: true, wobble: 0.6 });
  return p.texture({ repeat: [1, 1] });
}

/** Wall panelling: tall framed panels in a painted colour, with a darker dado and moulded edges. One tile = 3 wide x 4 tall. */
export function panelling(color: number, seed = 35) {
  const p = new Painter(192, 256, seed).fill(css(color));
  const g = p.g;
  p.dabs({ n: 30, colors: [css(color, 1.06), css(color, 0.92)], r: [6, 26], alpha: [0.06, 0.12], squash: 0.5 });
  for (const [x, y, w, h] of [[16, 18, 160, 140], [16, 176, 160, 64]]) {
    g.fillStyle = css(color, 0.82); g.fillRect(x, y, w, h);
    g.fillStyle = css(color, 1.12); g.fillRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = css(color, 0.98); g.fillRect(x + 10, y + 10, w - 20, h - 20);
  }
  return p.texture({ repeat: [1, 1] });
}

/** Damask wallpaper: a repeating flourish over a base colour. One tile = 2 x 2 units. */
export function damask(base: number, ink: number, seed = 37) {
  const p = new Painter(128, 128, seed).fill(css(base));
  const g = p.g;
  p.dabs({ n: 20, colors: [css(base, 1.05), css(base, 0.92)], r: [8, 30], alpha: [0.05, 0.1] });
  g.fillStyle = cssA(ink, 0.35);
  const motif = (cx: number, cy: number) => {
    g.beginPath(); g.ellipse(cx, cy, 10, 18, 0, 0, TAU); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 14, cy + 6, 8, 4, s * 0.6, 0, TAU); g.fill(); g.beginPath(); g.ellipse(cx + s * 9, cy - 16, 4, 8, s * -0.4, 0, TAU); g.fill(); }
    g.beginPath(); g.arc(cx, cy - 24, 4, 0, TAU); g.fill();
  };
  for (const [x, y] of [[32, 32], [96, 96], [96, -32], [-32, 96], [160, 32], [32, 160]]) motif(x, y);
  return p.texture({ repeat: [1, 1] });
}

/** Lettering on a plain board (signs, posters), sized to fit. */
export function lettering(text: string, o: { fg: string; bg: string; w?: number; h?: number; font?: string; border?: string; italic?: boolean } ) {
  const W = o.w ?? 512, H = o.h ?? 128;
  const p = new Painter(W, H, 41).fill(o.bg);
  const g = p.g;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = H * 0.66;
  const face = o.font ?? `Georgia, 'Times New Roman', serif`;
  const set = () => { g.font = `${o.italic ? 'italic ' : ''}bold ${size}px ${face}`; };
  set();
  while (g.measureText(text).width > W * 0.9 && size > 8) { size -= 2; set(); }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillText(text, W / 2 + 2, H / 2 + 3);
  g.fillStyle = o.fg; g.fillText(text, W / 2, H / 2);
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = Math.max(3, H * 0.05); g.strokeRect(g.lineWidth, g.lineWidth, W - g.lineWidth * 2, H - g.lineWidth * 2); }
  return p.texture({ wrap: false });
}

/**
 * An old advertisement painted straight onto a blank side wall (a "mur peint"): big letters, a slogan and a
 * border, faded and flaking so the plaster shows through.
 */
export function wallAd(title: string, sub: string, o: { bg: number; fg: number; accent: number; seed?: number }) {
  const W = 512, H = 448;
  const p = new Painter(W, H, o.seed ?? 51).fill(css(o.bg));
  const g = p.g, rng = p.rng;
  g.strokeStyle = css(o.accent); g.lineWidth = 14; g.strokeRect(18, 18, W - 36, H - 36);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 120;
  g.font = `bold ${size}px Georgia, serif`;
  while (g.measureText(title).width > W - 80 && size > 20) { size -= 4; g.font = `bold ${size}px Georgia, serif`; }
  g.fillStyle = css(o.fg); g.fillText(title, W / 2, H * 0.4);
  g.font = `italic ${Math.round(size * 0.32)}px Georgia, serif`; g.fillStyle = css(o.accent);
  g.fillText(sub, W / 2, H * 0.66);
  g.fillRect(W * 0.2, H * 0.53, W * 0.6, 5);
  // weathering: flakes of paint gone back to plaster, and rain streaks
  p.dabs({ n: 260, colors: [css(0xd8c8a8), css(0xc8b898)], r: [2, 14], alpha: [0.25, 0.6] });
  for (let i = 0; i < 40; i++) { const x = rng.range(0, W); const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.18)'); g.fillStyle = gr; g.fillRect(x, rng.range(0, H * 0.4), rng.range(3, 10), H); }
  p.vgrad([[0, 'rgba(255,250,235,0.18)'], [1, 'rgba(0,0,0,0.12)']]);
  return p.texture({ wrap: false });
}

/** Ripple-free gradient for painted backdrops and glows. */
export function radialGlow(inner: string, outer: string, size = 128) {
  const p = new Painter(size, size, 1);
  const gr = p.g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  p.g.fillStyle = gr; p.g.fillRect(0, 0, size, size);
  return p.texture({ wrap: false });
}

export { clamp };
