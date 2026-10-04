import * as THREE from 'three';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { css } from '../textures';
import { FUTURA } from '../film';

/*
 * Painted textures for the Grand Budapest scene: the station clock, stone, the model town's walls and roofs,
 * the lobby's carpets, marble, wallpaper, the wall of key cubbies, the stained glass, balustrades, the lift,
 * the hotel's sign and the painted mountains behind everything. Tiling textures say how much of the world
 * one tile covers.
 */

/** The hotel's colours. */
export const GBH = {
  pink: 0xf2b2c4, pinkDeep: 0xe58fa8, rose: 0xd8607e, cream: 0xf8eedf, white: 0xfdf8f2, lavender: 0xb8a6d8, lilac: 0x9d86c8,
  powder: 0xa9c8e8, burgundy: 0x7a2236, red: 0xb32638, carpet: 0x9e1c30, gold: 0xd8b25a, purple: 0x5b2c6f, purpleDark: 0x3c1c4c,
  wood: 0x6a3a2a, mint: 0xa8d8c8,
};

/** A station clock: a white face, black numerals and hands, a brass bezel. Hands at ten past two. */
export function clockFace(o: { hour?: number; minute?: number; roman?: boolean } = {}) {
  const S = 256;
  const p = new Painter(S, S, 3);
  const g = p.g, c = S / 2;
  g.fillStyle = '#c89a3a'; g.beginPath(); g.arc(c, c, c, 0, TAU); g.fill();
  const ring = g.createLinearGradient(0, 0, S, S);
  ring.addColorStop(0, '#f6dc8a'); ring.addColorStop(0.5, '#b88a2a'); ring.addColorStop(1, '#f0d070');
  g.fillStyle = ring; g.beginPath(); g.arc(c, c, c - 4, 0, TAU); g.fill();
  const face = g.createRadialGradient(c - 20, c - 30, 10, c, c, c);
  face.addColorStop(0, '#fffdf6'); face.addColorStop(1, '#efe6d2');
  g.fillStyle = face; g.beginPath(); g.arc(c, c, c - 16, 0, TAU); g.fill();
  g.strokeStyle = '#2a2420'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, c - 26, 0, TAU); g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU, r0 = c - 26, r1 = i % 5 ? c - 32 : c - 38;
    g.lineWidth = i % 5 ? 2 : 5;
    g.beginPath(); g.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); g.lineTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); g.stroke();
  }
  g.fillStyle = '#2a2420'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, r = c - 56;
    g.font = o.roman === false ? `bold 26px ${FUTURA}` : 'bold 22px Georgia, serif';
    g.fillText(o.roman === false ? String(i || 12) : roman[i], c + Math.sin(a) * r, c - Math.cos(a) * r + 1);
  }
  g.font = `bold 11px ${FUTURA}`; g.fillText('NEBELSBAD', c, c + 34);
  const hand = (a: number, len: number, w: number) => {
    g.save(); g.translate(c, c); g.rotate(a);
    g.beginPath(); g.moveTo(-w / 2, 12); g.lineTo(-w * 0.3, -len); g.lineTo(0, -len - 8); g.lineTo(w * 0.3, -len); g.lineTo(w / 2, 12); g.closePath(); g.fill();
    g.restore();
  };
  const hr = o.hour ?? 2, mn = o.minute ?? 10;
  hand(((hr % 12) + mn / 60) / 12 * TAU, 52, 9);
  hand(mn / 60 * TAU, 82, 6);
  g.fillStyle = '#b8902e'; g.beginPath(); g.arc(c, c, 7, 0, TAU); g.fill();
  // glass glint
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.ellipse(c - 40, c - 50, 50, 22, -0.6, 0, TAU); g.fill();
  return p.texture({ wrap: false });
}

/** Dressed stone in courses, pale pink-grey. One tile = 4 x 2 units (4 courses of blocks). */
export function ashlar(color = 0xe2cfc8, seed = 7) {
  const W = 256, H = 128;
  const p = new Painter(W, H, seed).fill(css(color, 0.78));
  const g = p.g, rng = p.rng;
  const rows = 4, rh = H / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rng.range(20, 50) : 0;
    while (x < W) {
      const w = rng.range(44, 84), k = rng.range(0.93, 1.06);
      g.fillStyle = css(color, k); g.fillRect(x + 1.5, r * rh + 1.5, w - 3, rh - 3);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 1.5, r * rh + 1.5, w - 3, 2);
      g.fillStyle = 'rgba(60,30,40,0.12)'; g.fillRect(x + 1.5, r * rh + rh - 4, w - 3, 2.5);
      x += w;
    }
  }
  p.dabs({ n: 50, colors: [css(color, 1.06), css(color, 0.88)], r: [3, 14], alpha: [0.06, 0.14] });
  return p.texture({ repeat: [1, 1] });
}

/** Rough rock for the cliff's cut faces and the viaduct's footings. One tile = 6 x 6 units. */
export function rock(color = 0x9a8a8e, seed = 9) {
  const S = 256;
  const p = new Painter(S, S, seed).fill(css(color));
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), w = rng.range(20, 70), h = rng.range(10, 30);
    g.fillStyle = css(color, rng.range(0.82, 1.15)); g.beginPath();
    g.moveTo(x, y); g.lineTo(x + w, y + rng.range(-6, 6)); g.lineTo(x + w * 0.8, y + h); g.lineTo(x + w * 0.1, y + h * 0.9); g.closePath(); g.fill();
    g.strokeStyle = css(color, 0.62); g.lineWidth = 1.5; g.stroke();
  }
  // snow caught on the ledges
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(250,248,255,0.85)'; g.fillRect(rng.range(0, S), rng.range(0, S), rng.range(10, 40), rng.range(2, 4)); }
  return p.texture({ repeat: [1, 1] });
}

/**
 * The model town's walls, painted white so each house takes its colour from the instance: two windows by two
 * storeys with shutters, a door in the middle at the bottom. One tile = one house front.
 */
export function townWall() {
  const W = 128, H = 128;
  const p = new Painter(W, H, 13).fill('#ffffff');
  const g = p.g;
  p.dabs({ n: 20, colors: ['#f4f0f0', '#ffffff'], r: [6, 20], alpha: [0.2, 0.4] });
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, W, 6);
  for (const [x, y, w, h] of [[22, 18, 22, 30], [84, 18, 22, 30], [22, 70, 22, 30], [84, 70, 22, 30]] as const) {
    g.fillStyle = '#f8f4ee'; g.fillRect(x - 4, y - 4, w + 8, h + 8);
    g.fillStyle = '#3e4a62'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f4d898'; if ((x + y) % 3 === 0) g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = '#f8f4ee'; g.fillRect(x + w / 2 - 1, y, 2, h); g.fillRect(x, y + h / 2 - 1, w, 2);
    g.fillStyle = 'rgba(70,60,80,0.35)'; g.fillRect(x - 10, y - 2, 6, h + 4); g.fillRect(x + w + 4, y - 2, 6, h + 4);
  }
  g.fillStyle = '#6a4030'; g.fillRect(54, 92, 20, 36);
  g.fillStyle = '#f8f4ee'; g.fillRect(50, 88, 28, 4);
  return p.texture({ wrap: false });
}

/** Roof tiles in neutral grey, tinted by the instance; rows running across. One tile = the whole roof slope. */
export function roofTiles() {
  const p = new Painter(64, 64, 15).fill('#d8d8d8');
  const g = p.g;
  for (let y = 0; y < 64; y += 8) { g.fillStyle = '#b0b0b0'; g.fillRect(0, y, 64, 2); for (let x = (y / 8) % 2 ? 4 : 0; x < 64; x += 8) g.fillRect(x, y, 1.5, 8); }
  return p.texture({ repeat: [1, 1] });
}

/** Snow lying on a surface: white with soft lavender hollows. One tile = 8 x 8 units. */
export function snow(seed = 17) {
  const p = new Painter(128, 128, seed).fill('#f6f4fa');
  p.dabs({ n: 40, colors: ['#e6e2f2', '#ffffff', '#ece8f6'], r: [6, 24], alpha: [0.3, 0.6], squash: 0.5 });
  p.dabs({ n: 120, colors: ['#ffffff'], r: [0.5, 1.2], alpha: [0.6, 1] });
  return p.texture({ repeat: [1, 1] });
}

/**
 * The lobby carpet: deep red with a lattice of pink and gold lozenges and little fleurons. One tile = 4 x 4
 * units.
 */
export function lobbyCarpet() {
  const S = 256;
  const p = new Painter(S, S, 21).fill(css(GBH.carpet));
  const g = p.g;
  g.strokeStyle = css(GBH.gold, 0.95); g.lineWidth = 3;
  for (const off of [0, S]) {
    g.beginPath(); g.moveTo(off - S, 0); g.lineTo(off, S); g.stroke();
    g.beginPath(); g.moveTo(off, 0); g.lineTo(off - S, S); g.stroke();
    g.beginPath(); g.moveTo(off - S / 2, 0); g.lineTo(off + S / 2, S); g.stroke();
    g.beginPath(); g.moveTo(off + S / 2, 0); g.lineTo(off - S / 2, S); g.stroke();
  }
  const flower = (x: number, y: number) => {
    g.fillStyle = css(GBH.pink);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 9, 5, a, 0, TAU); g.fill(); }
    g.fillStyle = css(GBH.gold); g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill();
  };
  for (const [x, y] of [[S / 2, 0], [0, S / 2], [S, S / 2], [S / 2, S], [S / 4, S / 4], [3 * S / 4, 3 * S / 4], [3 * S / 4, S / 4], [S / 4, 3 * S / 4]]) flower(x, y);
  g.fillStyle = css(GBH.carpet, 0.7);
  for (const [x, y] of [[S / 2, S / 2], [0, 0], [S, 0], [0, S], [S, S]]) { g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + 12, y); g.lineTo(x, y + 18); g.lineTo(x - 12, y); g.closePath(); g.fill(); }
  p.lines({ n: 50, colors: ['rgba(0,0,0,0.5)', 'rgba(255,200,200,0.5)'], alpha: [0.03, 0.07], width: [1, 2], wobble: 0.6 });
  return p.texture({ repeat: [1, 1] });
}

/** The runner the rails lie on: plum-red with a gold key-pattern border. Width = 1 tile (6 units), 6 units long. */
export function runner() {
  const W = 256, H = 256;
  const p = new Painter(W, H, 23).fill(css(GBH.burgundy, 1.15));
  const g = p.g;
  for (const x of [8, W - 30]) {
    g.fillStyle = css(GBH.gold); g.fillRect(x, 0, 22, H);
    g.fillStyle = css(GBH.burgundy, 1.15);
    for (let y = 0; y < H; y += 16) { g.fillRect(x + 4, y + 4, 14, 3); g.fillRect(x + 4, y + 4, 3, 9); g.fillRect(x + 4, y + 10, 9, 3); }
  }
  g.fillStyle = css(GBH.pink, 0.9);
  for (let y = 32; y < H; y += 64) { g.beginPath(); g.moveTo(W / 2, y - 14); g.lineTo(W / 2 + 10, y); g.lineTo(W / 2, y + 14); g.lineTo(W / 2 - 10, y); g.closePath(); g.fill(); }
  p.lines({ n: 40, colors: ['rgba(0,0,0,0.5)', 'rgba(255,220,200,0.5)'], alpha: [0.03, 0.07], width: [1, 2], vertical: true, wobble: 0.5 });
  return p.texture({ repeat: [1, 1] });
}

/** Polished marble squares, pink and cream, set diagonally. One tile = 4 x 4 units. */
export function marbleFloor() {
  const S = 256;
  const p = new Painter(S, S, 25).fill(css(GBH.cream));
  const g = p.g, rng = p.rng;
  const cell = S / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const pink = (i + j) % 2 === 1;
    g.fillStyle = pink ? css(0xeab0b8, rng.range(0.97, 1.03)) : css(GBH.cream, rng.range(0.98, 1.02));
    g.fillRect(i * cell, j * cell, cell, cell);
    // veins
    g.strokeStyle = pink ? 'rgba(160,70,90,0.25)' : 'rgba(150,130,120,0.18)'; g.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      g.beginPath(); let x = i * cell + rng.range(0, cell), y = j * cell;
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += rng.range(-8, 8); y += cell / 6; g.lineTo(x, y); }
      g.stroke();
    }
  }
  g.strokeStyle = 'rgba(90,60,60,0.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke(); }
  // small gold dots where four squares meet
  g.fillStyle = css(GBH.gold);
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { g.beginPath(); g.arc(i * cell, j * cell, 5, 0, TAU); g.fill(); }
  return p.texture({ repeat: [1, 1] });
}

/** Pink marble for columns, with soft veins. Tiles round a cylinder. */
export function pinkMarble(color = 0xe9a6b4, seed = 27) {
  const p = new Painter(128, 256, seed).fill(css(color));
  p.dabs({ n: 40, colors: [css(color, 1.08), css(color, 0.92)], r: [8, 30], alpha: [0.15, 0.3], squash: 2 });
  p.lines({ n: 12, colors: [css(color, 0.75), 'rgba(255,255,255,0.6)'], alpha: [0.25, 0.5], width: [1, 2.2], vertical: true, wobble: 10 });
  return p.texture({ repeat: [1, 1] });
}

/**
 * The lobby's walls: pink striped wallpaper over a dark wood dado with panels, a gilt rail between. One tile
 * = 4 units wide by 8 tall (the dado is the bottom 1.4 units).
 */
export function lobbyWall() {
  const W = 128, H = 256;
  const p = new Painter(W, H, 29).fill(css(GBH.pink));
  const g = p.g;
  for (let x = 0; x < W; x += 16) { g.fillStyle = css(GBH.pink, 0.92); g.fillRect(x, 0, 6, H); g.fillStyle = css(GBH.pinkDeep, 1.0); g.globalAlpha = 0.25; g.fillRect(x + 7, 0, 1.5, H); g.globalAlpha = 1; }
  // little gold fleurs on the stripes
  g.fillStyle = css(GBH.gold, 0.9);
  for (let y = 12; y < H - 50; y += 24) for (let x = 11; x < W; x += 32) { g.beginPath(); g.arc(x + ((y / 24) % 2) * 16, y, 2, 0, TAU); g.fill(); }
  const dado = H - 45;
  g.fillStyle = css(GBH.wood); g.fillRect(0, dado, W, H - dado);
  g.fillStyle = css(GBH.wood, 0.75); g.fillRect(10, dado + 10, W / 2 - 16, H - dado - 18); g.fillRect(W / 2 + 6, dado + 10, W / 2 - 16, H - dado - 18);
  g.fillStyle = css(GBH.wood, 1.25); g.fillRect(12, dado + 12, W / 2 - 20, 2); g.fillRect(W / 2 + 8, dado + 12, W / 2 - 20, 2);
  g.fillStyle = css(GBH.gold); g.fillRect(0, dado - 5, W, 6);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, dado + 1, W, 3);
  // a picture rail high up
  g.fillStyle = css(GBH.gold, 0.9); g.fillRect(0, 14, W, 3);
  return p.texture({ repeat: [1, 1] });
}

/** Gallery fronts and cornices: cream with a gilt moulding and pink panels. One tile = 4 x 1.2 units. */
export function galleryFascia() {
  const W = 256, H = 80;
  const p = new Painter(W, H, 31).fill(css(GBH.cream));
  const g = p.g;
  g.fillStyle = css(GBH.gold); g.fillRect(0, 4, W, 5); g.fillRect(0, H - 10, W, 5);
  g.fillStyle = 'rgba(80,50,40,0.18)'; g.fillRect(0, 9, W, 3);
  for (let x = 0; x < W; x += 64) {
    g.fillStyle = css(GBH.pink); g.fillRect(x + 8, 18, 48, H - 36);
    g.strokeStyle = css(GBH.gold); g.lineWidth = 2; g.strokeRect(x + 8, 18, 48, H - 36);
    g.fillStyle = css(GBH.gold); g.beginPath(); g.arc(x + 32, H / 2, 5, 0, TAU); g.fill();
  }
  return p.texture({ repeat: [1, 1] });
}

/**
 * A balustrade on a transparent canvas: a rail, a base and turned balusters, for alpha-tested planes. One
 * tile = 2.4 units long by 1.2 tall.
 */
export function balustrade(color: number = GBH.cream, rail: number = GBH.gold) {
  const W = 256, H = 128;
  const p = new Painter(W, H, 33);
  const g = p.g;
  g.fillStyle = css(rail); g.fillRect(0, 0, W, 14);
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 12, W, 3);
  g.fillStyle = css(color); g.fillRect(0, H - 16, W, 16);
  for (let x = 12; x < W; x += 26) {
    g.fillStyle = css(color);
    g.beginPath();
    g.moveTo(x - 5, 16); g.lineTo(x + 5, 16); g.quadraticCurveTo(x + 2, 40, x + 9, 70); g.quadraticCurveTo(x + 11, 92, x + 6, H - 16);
    g.lineTo(x - 6, H - 16); g.quadraticCurveTo(x - 11, 92, x - 9, 70); g.quadraticCurveTo(x - 2, 40, x - 5, 16); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + 3, 20, 3, H - 40);
  }
  const t = p.texture({ repeat: [1, 1] });
  return t;
}

/** Panelled ceiling coffers, cream and pink with gilt edges. One tile = 3 x 3 units. */
export function coffers() {
  const S = 128;
  const p = new Painter(S, S, 35).fill(css(GBH.cream, 0.92));
  const g = p.g;
  g.fillStyle = css(GBH.pink, 0.95); g.fillRect(14, 14, S - 28, S - 28);
  g.strokeStyle = css(GBH.gold); g.lineWidth = 3; g.strokeRect(14, 14, S - 28, S - 28);
  g.fillStyle = css(GBH.cream); g.beginPath(); g.arc(S / 2, S / 2, 16, 0, TAU); g.fill();
  g.fillStyle = css(GBH.gold); g.beginPath(); g.arc(S / 2, S / 2, 7, 0, TAU); g.fill();
  return p.texture({ repeat: [1, 1] });
}

/**
 * The wall of key cubbies behind the concierge desk: rows of pigeonholes with a brass key on a hook and a
 * letter or two in some, room numbers on little enamel plates. 512 x 256 for an 8 x 4 unit wall.
 */
export function keyCubbies() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 37).fill(css(GBH.wood, 0.7));
  const g = p.g, rng = p.rng;
  const cols = 16, rows = 8, cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * cw, y = r * ch;
    g.fillStyle = css(GBH.wood, 0.42); g.fillRect(x + 3, y + 3, cw - 6, ch - 6);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 3, y + 3, cw - 6, 4);
    if (rng.next() < 0.45) { g.fillStyle = rng.pick(['#f4ecdc', '#f2d8de', '#dfe8f4']); g.fillRect(x + 6, y + ch - 14, cw - 12, 9); }
    if (rng.next() < 0.75) {
      g.strokeStyle = '#e8c45a'; g.lineWidth = 2.2;
      g.beginPath(); g.arc(x + cw / 2, y + 11, 3.5, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(x + cw / 2, y + 14); g.lineTo(x + cw / 2, y + 23); g.lineTo(x + cw / 2 + 4, y + 23); g.stroke();
      g.fillStyle = css(GBH.red); g.beginPath(); g.ellipse(x + cw / 2, y + 22, 3, 2, 0, 0, TAU); g.fill();
    }
    g.fillStyle = '#f2ead6'; g.fillRect(x + cw / 2 - 6, y + ch - 5, 12, 4);
  }
  g.strokeStyle = css(GBH.gold, 0.8); g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);
  return p.texture({ wrap: false });
}

/**
 * Stained glass for the skylight: a fan of petals and lozenges in rose, amber, lilac and green between dark
 * lead lines, brighter in the middle. Also returned as the emissive map (glass lit from above). One tile
 * = 8 x 8 units.
 */
export function stainedGlass() {
  const S = 512;
  const p = new Painter(S, S, 39).fill('#2a1e24');
  const g = p.g;
  const pal = ['#f4a8c0', '#f8d890', '#c8b0f0', '#a8e0c8', '#f6c8a0', '#e88aa8', '#fff2d8', '#9ad0f0'];
  const c = S / 2;
  // concentric rings of petals round the centre of the tile
  for (let ring = 5; ring >= 0; ring--) {
    const n = 8 + ring * 4, r0 = ring * 42, r1 = r0 + 42;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
      g.fillStyle = pal[(ring * 3 + k) % pal.length];
      g.beginPath(); g.moveTo(c + Math.cos(a0) * r0, c + Math.sin(a0) * r0);
      g.lineTo(c + Math.cos(a0) * r1, c + Math.sin(a0) * r1);
      g.arc(c, c, r1, a0, a1);
      g.lineTo(c + Math.cos(a1) * r0, c + Math.sin(a1) * r0);
      g.arc(c, c, r0, a1, a0, true);
      g.closePath(); g.fill();
      g.strokeStyle = '#3a2830'; g.lineWidth = 4; g.stroke();
    }
  }
  // corners: lozenges
  for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S]]) {
    for (let k = 0; k < 3; k++) {
      g.fillStyle = pal[(k + 2) % pal.length];
      g.beginPath(); g.moveTo(x, y - 70 + k * 20); g.lineTo(x + 70 - k * 20, y); g.lineTo(x, y + 70 - k * 20); g.lineTo(x - 70 + k * 20, y); g.closePath(); g.fill();
      g.strokeStyle = '#3a2830'; g.lineWidth = 4; g.stroke();
    }
  }
  // a mottled glass texture
  p.dabs({ n: 200, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], r: [3, 12], alpha: [0.05, 0.12] });
  g.strokeStyle = '#2a1e24'; g.lineWidth = 10; g.strokeRect(0, 0, S, S);
  const t = p.texture({ repeat: [1, 1] });
  return t;
}

/** The lift's doors: rose-red lacquer with gold beading and a sunburst in each leaf. One leaf per texture. */
export function liftDoor() {
  const W = 128, H = 256;
  const p = new Painter(W, H, 41).fill(css(0xc8364e));
  const g = p.g;
  p.vgrad([[0, 'rgba(255,255,255,0.12)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.15)']]);
  g.strokeStyle = css(GBH.gold); g.lineWidth = 4; g.strokeRect(10, 10, W - 20, H - 20);
  g.lineWidth = 2; g.strokeRect(20, 20, W - 40, H - 40);
  const cx = W / 2, cy = H * 0.42;
  for (let k = 0; k < 14; k++) { const a = Math.PI + (k / 13) * Math.PI; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40); g.stroke(); }
  g.fillStyle = css(GBH.gold); g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fill();
  g.fillRect(cx - 30, cy + 2, 60, 3);
  return p.texture({ wrap: false });
}

/** Inside the lift car: red velvet walls with a brass rail and a mirror. */
export function liftCab() {
  const W = 128, H = 128;
  const p = new Painter(W, H, 43).fill('#a8243a');
  const g = p.g;
  p.lines({ n: 40, colors: ['rgba(0,0,0,0.4)', 'rgba(255,150,160,0.4)'], alpha: [0.08, 0.16], width: [2, 4], vertical: true, wobble: 1 });
  g.fillStyle = '#dfe6ea'; g.fillRect(40, 18, 48, 52);
  g.strokeStyle = css(GBH.gold); g.lineWidth = 4; g.strokeRect(40, 18, 48, 52);
  g.fillStyle = css(GBH.gold); g.fillRect(0, 84, W, 5);
  return p.texture({ wrap: false });
}

/** The hotel's front doors: glazed leaves in dark wood with brass, and a fanlight band at the top. One leaf. */
export function frontDoor() {
  const W = 128, H = 256;
  const p = new Painter(W, H, 45).fill(css(GBH.wood, 0.85));
  const g = p.g;
  g.fillStyle = '#f6e2b8'; g.fillRect(16, 18, W - 32, H * 0.58);
  g.fillStyle = 'rgba(255,240,210,0.6)'; g.fillRect(16, 18, (W - 32) / 2, H * 0.58);
  g.strokeStyle = css(GBH.gold); g.lineWidth = 4; g.strokeRect(16, 18, W - 32, H * 0.58);
  g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, 18); g.lineTo(W / 2, 18 + H * 0.58); g.moveTo(16, 18 + H * 0.29); g.lineTo(W - 16, 18 + H * 0.29); g.stroke();
  g.strokeStyle = css(GBH.wood, 1.3); g.lineWidth = 3; g.strokeRect(20, H * 0.7, W - 40, H * 0.24);
  g.fillStyle = css(GBH.gold); g.fillRect(W - 26, H * 0.62, 8, 26);
  g.fillRect(10, H * 0.66, W - 20, 5);
  return p.texture({ wrap: false });
}

/**
 * Letters for the hotel's rooftop sign: "GRAND BUDAPEST" in red with a white edge, and a bright map of the
 * bulbs round each letter (used as an emissive map so they glow). Transparent between letters.
 */
export function hotelSign(text = 'GRAND BUDAPEST') {
  const W = 1024, H = 128;
  const p = new Painter(W, H, 47);
  const e = new Painter(W, H, 48).fill('#000');
  const g = p.g, eg = e.g;
  g.font = `bold 104px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  // fit the text with letter spacing
  const chars = [...text];
  const sp = 6;
  const widths = chars.map((c) => g.measureText(c).width);
  let total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  const scale = Math.min(1, (W - 20) / total);
  g.save(); g.translate(W / 2, H / 2 + 4); g.scale(scale, 1); g.translate(-total / 2, 0);
  eg.save(); eg.translate(W / 2, H / 2 + 4); eg.scale(scale, 1); eg.translate(-total / 2, 0);
  g.textAlign = 'left'; eg.textAlign = 'left';
  eg.font = g.font; eg.textBaseline = 'middle';
  let x = 0;
  chars.forEach((c, i) => {
    g.lineWidth = 12; g.strokeStyle = '#fbf6ee'; g.lineJoin = 'round'; g.strokeText(c, x, 0);
    g.fillStyle = '#c8243a'; g.fillText(c, x, 0);
    // bulbs: the letter's outline drawn as dots in the emissive map
    eg.setLineDash([2, 9]); eg.lineCap = 'round'; eg.lineWidth = 6; eg.strokeStyle = '#fff2c8'; eg.strokeText(c, x, 0);
    g.setLineDash([2, 9]); g.lineCap = 'round'; g.lineWidth = 6; g.strokeStyle = '#fff6dc'; g.strokeText(c, x, 0); g.setLineDash([]);
    x += widths[i] + sp;
  });
  total = x;
  g.restore(); eg.restore();
  return { map: p.texture({ wrap: false }), emissive: e.texture({ wrap: false }) };
}

/**
 * Painted mountains for the backdrop: a band of ridges with snowy tops and lilac shadows, hazier towards the
 * bottom, on a transparent sky. `far` paints the paler, hazier back range. Wraps round a cylinder.
 */
export function mountainBand(o: { far: boolean; seed: number; peak?: number }) {
  const W = 2048, H = 512;
  const p = new Painter(W, H, o.seed);
  const g = p.g, rng = new Rng(o.seed);
  const base = o.far ? '#b8c2e0' : '#9aa6cc', shadow = o.far ? '#a8b0d8' : '#8a8cc0', snowC = o.far ? '#f2f0fa' : '#fbfaff';
  // ridge line
  const pts: number[] = [];
  const n = 128;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    let h = 0.42 + 0.18 * Math.sin(u * TAU * 3 + o.seed) + 0.12 * Math.sin(u * TAU * 7 + o.seed * 2.1) + 0.06 * Math.sin(u * TAU * 17 + o.seed * 0.7);
    h += rng.range(-0.03, 0.03);
    if (o.peak !== undefined) { const d = Math.min(Math.abs(u - o.peak), 1 - Math.abs(u - o.peak)); h += 0.38 * Math.max(0, 1 - d / 0.05); }
    pts.push(H * (1 - Math.min(0.96, h) * (o.far ? 0.95 : 0.8)));
  }
  const ridge = (x: number) => { const f = (x / W) * n; const i = Math.min(n - 1, Math.floor(f)); return pts[i] + (pts[i + 1] - pts[i]) * (f - i); };
  g.fillStyle = base;
  g.beginPath(); g.moveTo(0, H);
  for (let i = 0; i <= n; i++) g.lineTo((i / n) * W, pts[i]);
  g.lineTo(W, H); g.closePath(); g.fill();
  // snow caps: below the ridge line, ragged lower edge
  g.save(); g.clip();
  for (let x = 0; x < W; x += 6) {
    const y = ridge(x);
    const depth = 30 + 40 * Math.abs(Math.sin(x * 0.013 + o.seed)) + rng.range(0, 30);
    g.fillStyle = snowC; g.fillRect(x, y - 2, 6.5, depth);
    // shadowed faces: one side of each peak
    if (Math.sin(x * 0.02 + o.seed) > 0.2) { g.fillStyle = shadow; g.globalAlpha = 0.5; g.fillRect(x, y + depth * 0.4, 6.5, depth * 1.6); g.globalAlpha = 1; }
  }
  // couloirs: streaks of snow running down
  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, W), y = ridge(x);
    g.strokeStyle = snowC; g.globalAlpha = rng.range(0.4, 0.8); g.lineWidth = rng.range(2, 5);
    g.beginPath(); g.moveTo(x, y + 20); g.lineTo(x + rng.range(-20, 20), y + rng.range(60, 140)); g.stroke();
  }
  g.globalAlpha = 1;
  // haze towards the foot
  const hz = g.createLinearGradient(0, H * 0.35, 0, H);
  hz.addColorStop(0, 'rgba(232,226,242,0)'); hz.addColorStop(1, o.far ? 'rgba(240,226,236,0.9)' : 'rgba(236,222,234,0.75)');
  g.fillStyle = hz; g.fillRect(0, 0, W, H);
  g.restore();
  const t = p.texture();
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** A painted fir-forest band to stand in front of the mountains (the lower slopes): dark firs dusted with snow. */
export function forestBand(seed = 51) {
  const W = 2048, H = 256;
  const p = new Painter(W, H, seed);
  const g = p.g, rng = new Rng(seed);
  for (let layer = 0; layer < 3; layer++) {
    const col = ['#7c8aa8', '#5f6f8c', '#46566e'][layer];
    for (let i = 0; i < 260; i++) {
      const x = rng.range(0, W), h = rng.range(40, 90) * (0.7 + layer * 0.2), y = H - rng.range(0, 60) + layer * 10 - 20;
      g.fillStyle = col;
      g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h * 0.26, y); g.lineTo(x - h * 0.26, y); g.closePath(); g.fill();
      g.fillStyle = 'rgba(250,248,255,0.8)';
      g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h * 0.08, y - h * 0.7); g.lineTo(x - h * 0.08, y - h * 0.7); g.closePath(); g.fill();
    }
  }
  return p.texture();
}

/** An enamel name board: white Futura capitals on a deep blue field with a cream border. */
export function enamelSign(text: string, w = 512, h = 96) {
  const p = new Painter(w, h, 53).fill('#2c3e6a');
  const g = p.g;
  g.strokeStyle = '#f4ecd8'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#f8f2e4'; g.font = `bold ${Math.round(h * 0.52)}px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...text]; const sp = h * 0.08;
  const widths = chars.map((c) => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let x = w / 2 - total / 2;
  g.textAlign = 'left';
  chars.forEach((c, i) => { g.fillText(c, x, h * 0.54); x += widths[i] + sp; });
  return p.texture({ wrap: false });
}

/** A cast-iron fretwork bracket on transparent canvas (canopy brackets). */
export function fretBracket(color = 0xf4ece0) {
  const S = 128;
  const p = new Painter(S, S, 55);
  const g = p.g;
  g.strokeStyle = css(color); g.lineCap = 'round'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(4, 4); g.lineTo(S - 4, 4); g.moveTo(4, 4); g.lineTo(4, S - 4); g.stroke();
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(8, S - 8); g.quadraticCurveTo(14, 14, S - 8, 8); g.stroke();
  g.beginPath(); g.arc(46, 46, 20, 0, TAU); g.stroke();
  g.beginPath(); g.arc(46, 46, 8, 0, TAU); g.stroke();
  g.beginPath(); g.arc(88, 24, 10, 0, TAU); g.stroke();
  g.beginPath(); g.arc(24, 88, 10, 0, TAU); g.stroke();
  return p.texture({ wrap: false });
}
