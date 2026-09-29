import * as THREE from 'three';
import { Painter } from '../../engine/Paint';
import { Rng, TAU } from '../../engine/math';

/**
 * Painted textures for the Zubrowka Express world: pastel stucco and facades, fish-scale roofs, paving,
 * planks, awnings and the prop details that carry the film references (Boy with Apple, the Whitman
 * luggage, the vending machines). Tiling textures are meant for geometry with world-unit UVs (boxUV and
 * repeatUV in engine/Paint.ts); each one says how much of the world one tile covers.
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

/** Soft plaster: tone variation and faint trowel marks. One tile = 3 x 3 units. */
export function stucco(color: number, seed = 1) {
  const p = new Painter(128, 128, seed).fill(css(color));
  p.dabs({ n: 40, colors: [css(color, 1.05), css(color, 0.94)], r: [6, 23], alpha: [0.06, 0.14], squash: 0.6 });
  p.dabs({ n: 90, colors: [css(color, 1.08), css(color, 0.9)], r: [0.8, 1.8], alpha: [0.15, 0.3] });
  return p.texture({ repeat: [1, 1] });
}

export interface FacadeOpts {
  wall: number;
  frame?: number;
  /** window panes: 'night' glass reads dark blue, 'lace' has pale curtains */
  glass?: 'lace' | 'night';
  curtain?: number;
  bays?: number;
  storeys?: number;
  /** round-headed windows */
  arch?: boolean;
  /** a painted balcony rail across the lower storey of each tile */
  balcony?: boolean;
  /** a pale band (cornice) at the top of each storey */
  cornice?: number;
  /** pilasters between bays */
  pilaster?: number;
  shutters?: number;
  /** fraction of windows with the lamps on (drawn into the emissive map) */
  lit?: number;
  seed?: number;
}

/**
 * A wall of windows, `bays` wide and `storeys` tall: 128 px per bay and per storey. Returns the colour map
 * and an emissive map where lit windows are warm. Tiles across a box that has boxUV(geo, bays * bayWidth,
 * storeys * storeyHeight); keep walls a whole number of bays wide so the windows stay symmetrical.
 */
export function facadeTile(o: FacadeOpts) {
  const bays = o.bays ?? 4, storeys = o.storeys ?? 2;
  const W = 128 * bays, H = 128 * storeys;
  const rng = new Rng(o.seed ?? 3);
  const p = new Painter(W, H, (o.seed ?? 3) + 1).fill(css(o.wall));
  const e = new Painter(W, H, 1).fill('#000');
  const g = p.g, eg = e.g;
  p.dabs({ n: 12 * bays * storeys, colors: [css(o.wall, 1.04), css(o.wall, 0.95)], r: [8, 30], alpha: [0.05, 0.12], squash: 0.6 });
  const frame = css(o.frame ?? 0xfbf7f2), frameD = css(o.frame ?? 0xfbf7f2, 0.78);
  for (let s = 0; s < storeys; s++) {
    const y0 = s * 128;
    if (o.cornice !== undefined) {
      g.fillStyle = css(o.cornice); g.fillRect(0, y0, W, 9);
      g.fillStyle = 'rgba(60,40,50,0.18)'; g.fillRect(0, y0 + 9, W, 5);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, y0, W, 2);
    }
    for (let b = 0; b < bays; b++) {
      const x0 = b * 128;
      if (o.pilaster !== undefined) {
        g.fillStyle = css(o.pilaster); g.fillRect(x0, y0, 12, 128);
        g.fillStyle = 'rgba(60,40,50,0.12)'; g.fillRect(x0 + 12, y0, 4, 128);
      }
      const ww = 46, wh = o.arch ? 74 : 66, wx = x0 + 64 - ww / 2, wy = y0 + 30;
      const path = (gg: CanvasRenderingContext2D, pad: number) => {
        gg.beginPath();
        if (o.arch) { gg.moveTo(wx - pad, wy + wh + pad); gg.lineTo(wx - pad, wy + ww / 2); gg.arc(wx + ww / 2, wy + ww / 2, ww / 2 + pad, Math.PI, 0); gg.lineTo(wx + ww + pad, wy + wh + pad); gg.closePath(); }
        else gg.rect(wx - pad, wy - pad, ww + pad * 2, wh + pad * 2);
      };
      // a soft shadow under the moulding, the white frame, then the glass
      g.fillStyle = 'rgba(70,40,60,0.18)'; path(g, 9); g.fill();
      g.fillStyle = frame; path(g, 7); g.fill();
      const lit = rng.next() < (o.lit ?? 0.35);
      if (o.glass === 'night') {
        const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
        gr.addColorStop(0, '#34405a'); gr.addColorStop(1, '#58708a');
        g.fillStyle = lit ? '#f4d9a0' : gr;
      } else {
        g.fillStyle = lit ? '#f8e2b8' : '#dfe8ee';
      }
      path(g, 0); g.fill();
      if (o.glass !== 'night') {
        // lace curtains drawn to the sides with a tie-back
        const cc = css(o.curtain ?? 0xf6ece4);
        g.fillStyle = cc;
        g.beginPath(); g.moveTo(wx, wy + (o.arch ? ww / 2 : 0)); g.quadraticCurveTo(wx + ww * 0.36, wy + wh * 0.5, wx, wy + wh); g.fill();
        g.beginPath(); g.moveTo(wx + ww, wy + (o.arch ? ww / 2 : 0)); g.quadraticCurveTo(wx + ww * 0.64, wy + wh * 0.5, wx + ww, wy + wh); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(wx + ww * 0.6, wy + 6, 5, wh - 12);
      // glazing bars
      g.fillStyle = frameD;
      g.fillRect(wx + ww / 2 - 1.5, wy + (o.arch ? 8 : 0), 3, wh - (o.arch ? 8 : 0));
      g.fillRect(wx, wy + wh * 0.52, ww, 3);
      if (o.arch) { g.fillStyle = frame; g.beginPath(); g.arc(wx + ww / 2, wy - 6, 5, 0, TAU); g.fill(); }
      // sill and keystone
      g.fillStyle = frame; g.fillRect(wx - 11, wy + wh + 6, ww + 22, 7);
      g.fillStyle = 'rgba(70,40,60,0.2)'; g.fillRect(wx - 10, wy + wh + 13, ww + 20, 4);
      if (o.shutters !== undefined) {
        g.fillStyle = css(o.shutters);
        for (const sx of [wx - 30, wx + ww + 9]) { g.fillRect(sx, wy - 4, 21, wh + 8); g.fillStyle = css(o.shutters, 0.78); for (let k = 4; k < wh; k += 7) g.fillRect(sx + 3, wy + k, 15, 2); g.fillStyle = css(o.shutters); }
      }
      if (lit) {
        eg.fillStyle = '#ffe4b0'; path(eg, 0); eg.fill();
        eg.fillStyle = '#000'; eg.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); eg.fillRect(wx, wy + wh * 0.52, ww, 3);
      }
    }
    if (o.balcony && s === 0) {
      // a balustrade across the bottom of every tile: rail, balusters, base
      g.fillStyle = frame; g.fillRect(0, y0 + 104, W, 6); g.fillRect(0, y0 + 124, W, 4);
      for (let x = 4; x < W; x += 9) { g.fillStyle = frame; g.beginPath(); g.ellipse(x, y0 + 117, 3, 7, 0, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(70,40,60,0.2)'; g.fillRect(0, y0 + 110, W, 3);
    }
  }
  // a little weathering towards the bottom of the wall
  p.vgrad([[0, 'rgba(0,0,0,0)'], [0.85, 'rgba(0,0,0,0)'], [1, 'rgba(80,60,60,0.08)']]);
  return { map: p.texture({ repeat: [1, 1] }), emissive: e.texture({ repeat: [1, 1] }) };
}

/** Fish-scale roof shingles in rows; one tile = 1.5 x 1.5 units. */
export function fishScales(color: number, seed = 5) {
  const S = 256, rows = 6, r = S / rows / 2 * 1.25;
  const p = new Painter(S, S, seed).fill(css(color, 0.7));
  const g = p.g, rng = p.rng;
  for (let row = rows; row >= -1; row--) {
    const y = row * (S / rows);
    const off = row % 2 ? S / rows / 2 : 0;
    for (let x = -S / rows + off; x < S + S / rows; x += S / rows) {
      const k = rng.range(0.9, 1.08);
      const gr = g.createRadialGradient(x, y + r * 0.3, 1, x, y + r * 0.2, r * 1.1);
      gr.addColorStop(0, css(color, 1.12 * k)); gr.addColorStop(0.7, css(color, k)); gr.addColorStop(1, css(color, 0.72 * k));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - r, y - r * 0.9); g.lineTo(x - r, y); g.arc(x, y, r, Math.PI, 0, true); g.lineTo(x + r, y - r * 0.9); g.closePath(); g.fill();
      g.strokeStyle = css(color, 0.6); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r, 0, Math.PI); g.stroke();
    }
  }
  return p.texture({ repeat: [1, 1] });
}

/** Square paving slabs with pale joints. One tile = 2 x 2 units (4 x 4 slabs). */
export function paving(color: number, seed = 7) {
  const S = 256, n = 4, c = S / n;
  const p = new Painter(S, S, seed).fill(css(color, 0.8));
  const g = p.g, rng = p.rng;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = css(color, rng.range(0.95, 1.05)); g.fillRect(i * c + 2, j * c + 2, c - 4, c - 4);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(i * c + 2, j * c + 2, c - 4, 3);
  }
  p.dabs({ n: 60, colors: [css(color, 1.06), css(color, 0.9)], r: [3, 14], alpha: [0.08, 0.16] });
  return p.texture({ repeat: [1, 1] });
}

/** Black-and-white checkerboard tiles (diner floors and walls). One tile = 2 x 2 units. */
export function checker(a: number, b: number, n = 8) {
  const S = 256, c = S / n;
  const p = new Painter(S, S, 9).fill(css(a));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) { p.g.fillStyle = css(b); p.g.fillRect(i * c, j * c, c, c); }
  p.g.strokeStyle = 'rgba(0,0,0,0.12)'; p.g.lineWidth = 1;
  for (let i = 0; i <= n; i++) { p.g.beginPath(); p.g.moveTo(i * c, 0); p.g.lineTo(i * c, S); p.g.moveTo(0, i * c); p.g.lineTo(S, i * c); p.g.stroke(); }
  return p.texture({ repeat: [1, 1] });
}

/** Painted boards running up the texture (v). One tile = 1 unit across (4 boards) and 2 along. */
export function planks(color: number, seed = 11) {
  const W = 128, H = 256, n = 4, bw = W / n;
  const p = new Painter(W, H, seed).fill(css(color, 0.5));
  const g = p.g, rng = p.rng;
  for (let i = 0; i < n; i++) {
    let y = -rng.range(0, 120);
    while (y < H) {
      const len = rng.range(100, 200), k = rng.range(0.9, 1.1);
      g.fillStyle = css(color, k); g.fillRect(i * bw + 1.5, y + 1, bw - 3, len - 2);
      for (let s = 0; s < 4; s++) { g.fillStyle = css(color, k * 0.82); g.globalAlpha = 0.35; g.fillRect(i * bw + 4 + rng.range(0, bw - 10), Math.max(0, y), 1.2, len); }
      g.globalAlpha = 1;
      y += len;
    }
  }
  return p.texture({ repeat: [1, 1] });
}

/** Wide awning stripes, `n` pairs across; optionally a scalloped valance along the bottom (transparent below). */
export function stripes(a: number, b: number, n = 4, scallop = false) {
  const W = 256, H = 128;
  const p = new Painter(W, H, 13);
  const g = p.g;
  const sw = W / (n * 2);
  for (let i = 0; i < n * 2; i++) { g.fillStyle = css(i % 2 ? b : a); g.fillRect(i * sw, 0, sw, H); }
  // soft folds
  for (let i = 0; i < n * 2; i++) {
    const gr = g.createLinearGradient(i * sw, 0, (i + 1) * sw, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.06)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.1)');
    g.fillStyle = gr; g.fillRect(i * sw, 0, sw, H);
  }
  if (scallop) {
    // cut the bottom edge into one scallop per stripe
    g.clearRect(0, H * 0.78, W, H);
    for (let i = 0; i < n * 2; i++) { g.fillStyle = css(i % 2 ? b : a); g.beginPath(); g.arc(i * sw + sw / 2, H * 0.78, sw / 2, 0, Math.PI); g.fill(); }
  }
  return p.texture();
}

/** A strip of semicircular scallops (canopy fascias); transparent between them. Tile = one scallop. */
export function scallopTrim(color: number) {
  const p = new Painter(64, 64, 17);
  const g = p.g;
  g.fillStyle = css(color); g.fillRect(0, 0, 64, 26);
  g.beginPath(); g.arc(32, 26, 30, 0, Math.PI); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, 64, 4);
  g.strokeStyle = css(color, 0.7); g.lineWidth = 3; g.beginPath(); g.arc(32, 26, 27, 0.1, Math.PI - 0.1); g.stroke();
  return p.texture({ repeat: [1, 1] });
}

/** Bark in vertical ridges, for cylinders; tiles around and along. */
export function bark(color: number, seed = 19) {
  const p = new Painter(256, 256, seed).fill(css(color));
  p.lines({ n: 50, colors: [css(color, 0.62), css(color, 0.78)], alpha: [0.5, 0.9], width: [2, 6], vertical: true, wobble: 5 });
  p.lines({ n: 30, colors: [css(color, 1.25)], alpha: [0.25, 0.5], width: [1, 2], vertical: true, wobble: 4 });
  p.dabs({ n: 30, colors: [css(color, 0.55)], r: [3, 8], alpha: [0.3, 0.6], squash: 2.2 });
  return p.texture({ repeat: [1, 1] });
}

/** Riveted steel or painted panels; one tile = 1.6 x 1.6 units. */
export function panels(color: number, seed = 23) {
  const S = 256;
  const p = new Painter(S, S, seed).fill(css(color));
  const g = p.g;
  p.dabs({ n: 30, colors: [css(color, 1.05), css(color, 0.94)], r: [10, 40], alpha: [0.06, 0.14], squash: 0.6 });
  g.fillStyle = css(color, 0.7); g.fillRect(0, 0, 3, S); g.fillRect(0, 0, S, 3);
  g.fillStyle = css(color, 1.2); g.fillRect(3, 3, 2, S - 3); g.fillRect(3, 3, S - 3, 2);
  for (let y = 16; y < S; y += 24) { g.fillStyle = css(color, 0.72); g.beginPath(); g.arc(12, y, 3, 0, TAU); g.fill(); g.fillStyle = css(color, 1.25); g.beginPath(); g.arc(11, y - 1, 1.8, 0, TAU); g.fill(); }
  return p.texture({ repeat: [1, 1] });
}

/** A chain-link fence on a transparent canvas; one tile = 1 x 1 unit. Use with alphaTest. */
export function chainLink(color = 0xb8bcc2) {
  const S = 64;
  const p = new Painter(S, S, 29);
  const g = p.g;
  g.strokeStyle = css(color); g.lineWidth = 2.2;
  for (let i = -2; i < 4; i++) {
    g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + S, S); g.stroke();
    g.beginPath(); g.moveTo(i * 16 + S, 0); g.lineTo(i * 16, S); g.stroke();
  }
  return p.texture({ repeat: [1, 1] });
}

/**
 * "Boy with Apple": a Northern Renaissance-style portrait (the film credits it to Johannes van Hoytl the Younger;
 * Michael Taylor painted it). A boy in a dark doublet with red velvet sleeves holds a green apple by its stem,
 * in front of a plain curtain. Painted in a gilt frame. Face is the whole canvas (portrait, 3:4).
 */
export function boyWithApple() {
  const W = 384, H = 512;
  const p = new Painter(W, H, 31);
  const g = p.g;
  // gilt frame
  g.fillStyle = '#b8902e'; g.fillRect(0, 0, W, H);
  const fr = g.createLinearGradient(0, 0, W, H);
  fr.addColorStop(0, '#f0d27a'); fr.addColorStop(0.5, '#b8902e'); fr.addColorStop(1, '#7a5a1c');
  g.fillStyle = fr; g.fillRect(6, 6, W - 12, H - 12);
  g.fillStyle = '#5a4012'; g.fillRect(28, 28, W - 56, H - 56);
  const x0 = 34, y0 = 34, w = W - 68, h = H - 68;
  // plain olive-grey curtain with soft vertical folds
  const bg = g.createLinearGradient(x0, 0, x0 + w, 0);
  bg.addColorStop(0, '#3e4a3a'); bg.addColorStop(0.5, '#56624c'); bg.addColorStop(1, '#3a4436');
  g.fillStyle = bg; g.fillRect(x0, y0, w, h);
  for (let i = 0; i < 7; i++) { g.fillStyle = `rgba(0,0,0,${0.06 + (i % 2) * 0.05})`; g.fillRect(x0 + (i / 7) * w, y0, w / 14, h); }
  const cx = x0 + w / 2;
  // body: dark doublet, red velvet sleeves
  g.fillStyle = '#2a2622';
  g.beginPath(); g.moveTo(cx - 110, y0 + h); g.quadraticCurveTo(cx - 100, y0 + 250, cx, y0 + 235); g.quadraticCurveTo(cx + 100, y0 + 250, cx + 110, y0 + h); g.fill();
  for (const s of [-1, 1]) {
    const sg = g.createLinearGradient(cx + s * 60, y0 + 260, cx + s * 130, y0 + 400);
    sg.addColorStop(0, '#b0242a'); sg.addColorStop(0.5, '#7a1418'); sg.addColorStop(1, '#c43a3a');
    g.fillStyle = sg;
    g.beginPath(); g.ellipse(cx + s * 92, y0 + 340, 38, 96, s * 0.12, 0, TAU); g.fill();
  }
  // white collar
  g.fillStyle = '#efe8d8'; g.beginPath(); g.ellipse(cx, y0 + 238, 46, 14, 0, 0, TAU); g.fill();
  // face and neck
  g.fillStyle = '#e8c8a8'; g.fillRect(cx - 16, y0 + 200, 32, 40);
  const fg = g.createRadialGradient(cx - 10, y0 + 150, 8, cx, y0 + 160, 62);
  fg.addColorStop(0, '#f4dcc0'); fg.addColorStop(1, '#c89878');
  g.fillStyle = fg; g.beginPath(); g.ellipse(cx, y0 + 160, 44, 58, 0, 0, TAU); g.fill();
  // dark hair, cropped
  g.fillStyle = '#3a2618';
  g.beginPath(); g.ellipse(cx, y0 + 128, 50, 38, 0, Math.PI, TAU); g.fill();
  g.beginPath(); g.ellipse(cx - 38, y0 + 140, 14, 30, 0.2, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(cx + 38, y0 + 140, 14, 30, -0.2, 0, TAU); g.fill();
  // calm eyes, nose, small mouth
  for (const s of [-1, 1]) { g.fillStyle = '#f6efe6'; g.beginPath(); g.ellipse(cx + s * 17, y0 + 158, 8, 4, 0, 0, TAU); g.fill(); g.fillStyle = '#4a3222'; g.beginPath(); g.arc(cx + s * 17, y0 + 158, 3.4, 0, TAU); g.fill(); }
  g.strokeStyle = '#a07058'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, y0 + 166); g.lineTo(cx - 4, y0 + 182); g.lineTo(cx + 3, y0 + 184); g.stroke();
  g.strokeStyle = '#a0504a'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 9, y0 + 196); g.quadraticCurveTo(cx, y0 + 199, cx + 9, y0 + 196); g.stroke();
  // pale hands holding the green apple by its stem
  g.fillStyle = '#e8c8a8'; g.beginPath(); g.ellipse(cx - 18, y0 + 336, 26, 16, -0.3, 0, TAU); g.fill();
  const ag = g.createRadialGradient(cx + 22, y0 + 312, 4, cx + 30, y0 + 322, 30);
  ag.addColorStop(0, '#d8ec8a'); ag.addColorStop(0.6, '#8ab43a'); ag.addColorStop(1, '#4a7a22');
  g.fillStyle = ag; g.beginPath(); g.arc(cx + 30, y0 + 322, 26, 0, TAU); g.fill();
  g.strokeStyle = '#4a3218'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + 30, y0 + 298); g.lineTo(cx + 33, y0 + 284); g.stroke();
  g.fillStyle = '#e8c8a8'; g.beginPath(); g.ellipse(cx + 36, y0 + 282, 10, 6, 0.4, 0, TAU); g.fill();
  // varnish: warm glaze and a darkened edge
  const v = g.createRadialGradient(cx, y0 + h * 0.4, 40, cx, y0 + h * 0.5, h * 0.7);
  v.addColorStop(0, 'rgba(255,220,150,0.06)'); v.addColorStop(1, 'rgba(20,10,0,0.35)');
  g.fillStyle = v; g.fillRect(x0, y0, w, h);
  return p.texture({ wrap: false });
}

/**
 * The Whitman brothers' luggage from The Darjeeling Limited (Marc Jacobs for Louis Vuitton): brown calfskin
 * with animals and palms drawn by Eric Chase Anderson, monogrammed JLW. Tile = one case face.
 */
export function whitmanLuggage(seed = 37) {
  const S = 256;
  const p = new Painter(S, S, seed).fill('#9a6a3e');
  const g = p.g, rng = p.rng;
  p.dabs({ n: 60, colors: ['#a8774a', '#8a5a32'], r: [6, 24], alpha: [0.2, 0.35] });
  const ink = '#f1e2c4';
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
  const elephant = (x: number, y: number, s: number) => {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.ellipse(0, 0, 18, 12, 0, 0, TAU); g.stroke();
    g.beginPath(); g.arc(-18, -4, 8, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(-25, 0); g.quadraticCurveTo(-30, 12, -24, 18); g.stroke();
    for (const lx of [-10, -3, 6, 13]) { g.beginPath(); g.moveTo(lx, 10); g.lineTo(lx, 20); g.stroke(); }
    g.restore();
  };
  const giraffe = (x: number, y: number, s: number) => {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.ellipse(0, 0, 13, 8, 0, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(-9, -4); g.lineTo(-17, -30); g.lineTo(-24, -30); g.stroke();
    for (const lx of [-8, -2, 5, 10]) { g.beginPath(); g.moveTo(lx, 7); g.lineTo(lx, 22); g.stroke(); }
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-4 + i * 4, -1 + (i % 2) * 3, 1.5, 0, TAU); g.fill(); }
    g.restore();
  };
  const zebra = (x: number, y: number, s: number) => {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.ellipse(0, 0, 14, 8, 0, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(-12, -4); g.lineTo(-20, -14); g.lineTo(-24, -10); g.stroke();
    for (let i = -8; i <= 8; i += 4) { g.beginPath(); g.moveTo(i, -7); g.lineTo(i + 2, 7); g.stroke(); }
    for (const lx of [-8, -2, 5, 10]) { g.beginPath(); g.moveTo(lx, 7); g.lineTo(lx, 19); g.stroke(); }
    g.restore();
  };
  const palm = (x: number, y: number, s: number) => {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.beginPath(); g.moveTo(0, 20); g.quadraticCurveTo(3, 0, 0, -14); g.stroke();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.6; g.beginPath(); g.moveTo(0, -14); g.quadraticCurveTo(Math.cos(a) * 10, -14 + Math.sin(a) * 10 - 4, Math.cos(a) * 18, -14 + Math.sin(a) * 18 + 4); g.stroke(); }
    g.restore();
  };
  const kinds = [elephant, giraffe, zebra, palm];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) kinds[(i + j * 2) % 4](34 + i * 62 + rng.range(-6, 6), 40 + j * 60 + rng.range(-6, 6), rng.range(0.75, 0.95));
  // monogram plate
  g.fillStyle = '#d8b25a'; g.fillRect(S / 2 - 34, S / 2 - 15, 68, 30);
  g.fillStyle = '#5a3a1a'; g.font = 'bold 22px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('JLW', S / 2, S / 2 + 1);
  // leather edge binding
  g.strokeStyle = '#4a2e18'; g.lineWidth = 8; g.strokeRect(0, 0, S, S);
  return p.texture();
}

/** Front of a vending machine with a lit panel of choices and a label strip. Face fills the canvas (1 x 2). */
export function vendingFront(label: string, sub: string, body: number, items: string[]) {
  const W = 128, H = 256;
  const p = new Painter(W, H, 41).fill(css(body));
  const g = p.g;
  p.vgrad([[0, 'rgba(255,255,255,0.18)'], [0.2, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.12)']]);
  g.fillStyle = '#fbf3e0'; g.fillRect(12, 16, W - 24, 34);
  g.fillStyle = '#b93a4c'; g.font = 'bold 17px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, W / 2, 28);
  g.fillStyle = '#2f4a5e'; g.font = 'italic 10px Georgia, serif'; g.fillText(sub, W / 2, 42);
  // the lit window of choices
  g.fillStyle = '#fff6dc'; g.fillRect(14, 62, W - 28, 112);
  items.forEach((it, i) => {
    const y = 72 + i * 25;
    g.fillStyle = '#e8dcc0'; g.fillRect(18, y - 4, W - 36, 20);
    g.fillStyle = '#2f4a5e'; g.font = 'bold 10px Georgia, serif'; g.fillText(it, W / 2, y + 6);
  });
  // coin slot, buttons, tray
  g.fillStyle = '#d8b25a'; g.fillRect(W - 34, 186, 16, 26);
  for (let i = 0; i < 4; i++) { g.fillStyle = '#fbf3e0'; g.beginPath(); g.arc(24 + i * 18, 196, 6, 0, TAU); g.fill(); }
  g.fillStyle = '#2a2c30'; g.fillRect(20, 222, W - 40, 20);
  return p.texture({ wrap: false });
}

/** A French Dispatch cover in the magazine's illustrated New Yorker manner: a masthead over a painted scene. */
export function dispatchCover(seed: number) {
  const W = 128, H = 168;
  const rng = new Rng(seed);
  const pal = [['#f2c6b0', '#5a8aa8', '#e8d6a0'], ['#bcd8c8', '#d8704a', '#f4e8c8'], ['#f0dca0', '#4a6a9a', '#e8a8a0'], ['#c8d0e8', '#a84a4a', '#f2e2b8']][seed % 4];
  const p = new Painter(W, H, seed).fill(pal[0]);
  const g = p.g;
  g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, W, 34);
  g.fillStyle = '#1e1e22'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 13px Georgia, serif'; g.fillText('THE FRENCH', W / 2, 12);
  g.font = 'bold 13px Georgia, serif'; g.fillText('DISPATCH', W / 2, 26);
  // a little town scene: rooftops, a bicycle, a sun
  g.fillStyle = pal[2]; g.beginPath(); g.arc(W * rng.range(0.25, 0.75), 58, 12, 0, TAU); g.fill();
  for (let i = 0; i < 5; i++) {
    const x = i * 26 + rng.range(-4, 4), h = rng.range(40, 80);
    g.fillStyle = i % 2 ? pal[1] : '#f4ecde'; g.fillRect(x, H - h - 24, 24, h);
    g.fillStyle = '#6a4a4a'; g.beginPath(); g.moveTo(x - 2, H - h - 24); g.lineTo(x + 12, H - h - 38); g.lineTo(x + 26, H - h - 24); g.fill();
    g.fillStyle = '#fbf6ea'; for (let k = 0; k < 3; k++) g.fillRect(x + 5, H - h - 16 + k * 14, 5, 7);
  }
  g.fillStyle = '#e8e0cc'; g.fillRect(0, H - 24, W, 24);
  g.strokeStyle = '#2a2a2e'; g.lineWidth = 1.6;
  g.beginPath(); g.arc(W * 0.4, H - 12, 6, 0, TAU); g.moveTo(W * 0.6 + 6, H - 12); g.arc(W * 0.6, H - 12, 6, 0, TAU); g.moveTo(W * 0.4, H - 12); g.lineTo(W * 0.5, H - 20); g.lineTo(W * 0.6, H - 12); g.stroke();
  return p.texture({ wrap: false });
}
