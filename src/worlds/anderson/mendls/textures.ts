import * as THREE from 'three';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { css } from '../textures';
import { FUTURA } from '../film';

/**
 * Painted textures for Mendl's: the box's card, its printed logo, tissue paper and ribbon; the conveyor belt;
 * the kitchen's floor, tiles, plaster, windows and coffered ceiling; the ovens; the shop's panelling, its
 * storefront lettering (reversed, seen from inside) and the painted street outside; and the Courtesan au
 * chocolat's icing. Tiling textures say how much of the world one tile covers.
 */

export const MC = {
  pink: 0xf4bccb, deepPink: 0xe48aa2, blue: 0x6a9fd8, navy: 0x2c4a86, cream: 0xf8f0e0, pistachio: 0xbfdcae,
  lavender: 0xc4aee0, choc: 0x5a3020, gold: 0xd8b25a, white: 0xfdf9f4, mint: 0xa8d8c8,
};

/** A script typeface for "Mendl's" where the machine has one, falling back to an italic serif. */
export const SCRIPT = '"Snell Roundhand", "Apple Chancery", "Edwardian Script ITC", "Monotype Corsiva", "URW Chancery L", Georgia, "DejaVu Serif", serif';

/** Set the largest font that fits `text` inside maxW x maxH (pixels); returns the size. */
export function fitFont(g: CanvasRenderingContext2D, text: string, style: string, family: string, maxW: number, maxH: number) {
  let size = Math.round(maxH);
  g.font = `${style} ${size}px ${family}`;
  const w = g.measureText(text).width;
  if (w > maxW) { size = Math.max(6, Math.floor(size * maxW / w)); g.font = `${style} ${size}px ${family}`; }
  return size;
}

/** Text with extra space between letters, centred on x. */
export function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
  let cx = x - total / 2;
  const align = g.textAlign;
  g.textAlign = 'left';
  chars.forEach((ch, i) => { g.fillText(ch, cx, y); cx += widths[i] + spacing; });
  g.textAlign = align;
  return total;
}

/** Fine paper fibre over the whole canvas. */
function grain(p: Painter, color: number, n = 1) {
  p.dabs({ n: Math.round(40 * n), colors: [css(color, 1.04), css(color, 0.95)], r: [10, 40], alpha: [0.05, 0.12], squash: 0.5 });
  p.lines({ n: Math.round(70 * n), colors: [css(color, 1.08), css(color, 0.9)], alpha: [0.08, 0.18], width: [0.5, 1.2], wobble: 1.5 });
}

/** A scalloped oval: the edge of a printed cartouche. */
function scallopOval(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, n: number, depth: number) {
  g.beginPath();
  for (let i = 0; i <= n * 8; i++) {
    const a = (i / (n * 8)) * TAU;
    const k = 1 + depth * Math.abs(Math.sin((a * n) / 2));
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

/**
 * The Mendl's cartouche, as printed on the boxes: a scalloped oval in cream with a blue rim, "Mendl's" in
 * blue script, a small line in capitals under it, and curls either side.
 */
export function drawLogo(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, o: { ink?: string; bg?: string; sub?: string; gold?: boolean } = {}) {
  const ink = o.ink ?? css(MC.navy), bg = o.bg ?? css(MC.cream);
  g.save();
  // soft shadow of the print, then the cartouche
  g.fillStyle = 'rgba(120,40,70,0.12)'; scallopOval(g, cx + w * 0.012, cy + h * 0.02, w * 0.44, h * 0.42, 22, 0.035); g.fill();
  g.fillStyle = bg; scallopOval(g, cx, cy, w * 0.44, h * 0.42, 22, 0.035); g.fill();
  g.strokeStyle = ink; g.lineWidth = Math.max(2, h * 0.025); g.stroke();
  g.lineWidth = Math.max(1, h * 0.008);
  g.beginPath(); g.ellipse(cx, cy, w * 0.39, h * 0.35, 0, 0, TAU); g.stroke();
  if (o.gold) { g.strokeStyle = css(MC.gold); g.lineWidth = Math.max(1, h * 0.012); g.beginPath(); g.ellipse(cx, cy, w * 0.41, h * 0.38, 0, 0, TAU); g.stroke(); }
  // the name
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitFont(g, "Mendl's", 'italic bold', SCRIPT, w * 0.62, h * 0.36);
  g.fillText("Mendl's", cx, cy - h * 0.04);
  // a rule and the small line
  g.fillRect(cx - w * 0.16, cy + h * 0.13, w * 0.32, Math.max(1, h * 0.008));
  fitFont(g, o.sub ?? 'PATISSERIE  NEBELSBAD', '500', FUTURA, w * 0.46, h * 0.07);
  spaced(g, o.sub ?? 'PATISSERIE  NEBELSBAD', cx, cy + h * 0.21, h * 0.012);
  // curls left and right
  g.strokeStyle = ink; g.lineWidth = Math.max(1.5, h * 0.014); g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const x0 = cx + s * w * 0.3;
    g.beginPath(); g.moveTo(x0, cy - h * 0.2);
    g.bezierCurveTo(x0 + s * w * 0.06, cy - h * 0.26, x0 + s * w * 0.09, cy - h * 0.12, x0 + s * w * 0.045, cy - h * 0.1);
    g.stroke();
    g.beginPath(); g.arc(x0 + s * w * 0.035, cy - h * 0.13, h * 0.025, 0, TAU); g.stroke();
  }
  g.restore();
}

/** Outside of a box wall: pink card with a printed border and two cartouches (the ribbon runs between them). Face = whole canvas. */
export function boxSide(seed = 1) {
  const W = 1024, H = 384;
  const p = new Painter(W, H, seed).fill(css(MC.pink));
  grain(p, MC.pink, 1.5);
  const g = p.g;
  p.vgrad([[0, 'rgba(255,255,255,0.14)'], [0.3, 'rgba(255,255,255,0)'], [1, 'rgba(120,40,60,0.08)']]);
  // a printed double border in blue
  g.strokeStyle = css(MC.navy); g.lineWidth = 6; g.strokeRect(22, 22, W - 44, H - 44);
  g.lineWidth = 2; g.strokeRect(34, 34, W - 68, H - 68);
  // little scallops along the top edge inside the border
  g.fillStyle = css(MC.white, 1, MC.pink, 0.3);
  for (let x = 40; x < W - 40; x += 26) { g.beginPath(); g.arc(x + 13, 36, 11, 0, Math.PI); g.fill(); }
  for (const cx of [W * 0.25, W * 0.75]) drawLogo(g, cx, H * 0.53, W * 0.4, H * 0.66);
  // card edges a little darker where the fold is
  g.fillStyle = 'rgba(140,60,80,0.18)'; g.fillRect(0, 0, W, 5); g.fillRect(0, H - 5, W, 5); g.fillRect(0, 0, 5, H); g.fillRect(W - 5, 0, 5, H);
  return p.texture({ wrap: false });
}

/** Top of the lid: pink with the big cartouche in the middle and a ring of small blue dots. */
export function lidTop(seed = 3) {
  const W = 1024, H = 1024;
  const p = new Painter(W, H, seed).fill(css(MC.pink));
  grain(p, MC.pink, 2.5);
  const g = p.g;
  g.strokeStyle = css(MC.navy); g.lineWidth = 8; g.strokeRect(30, 30, W - 60, H - 60);
  g.lineWidth = 3; g.strokeRect(46, 46, W - 92, H - 92);
  g.fillStyle = css(MC.navy);
  for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; g.beginPath(); g.arc(W / 2 + Math.cos(a) * 400, H / 2 + Math.sin(a) * 300, 7, 0, TAU); g.fill(); }
  drawLogo(g, W / 2, H / 2, W * 0.66, H * 0.48, { gold: true });
  // corner fleurons
  for (const [x, y] of [[90, 90], [W - 90, 90], [90, H - 90], [W - 90, H - 90]]) {
    g.save(); g.translate(x, y);
    for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.ellipse(0, -18, 8, 18, 0, 0, TAU); g.fill(); }
    g.restore();
  }
  return p.texture({ wrap: false });
}

/** The inside of the card: off-white with fibre. One tile = 2 x 2 units. */
export function cardInside(seed = 5) {
  const p = new Painter(256, 256, seed).fill(css(0xf6eee6));
  grain(p, 0xf6eee6, 1.2);
  return p.texture({ repeat: [1, 1] });
}

/** The inside of the lid: cream card printed with a scalloped pink border and a round seal. Face = whole canvas. */
export function lidInside(seed = 7) {
  const W = 1024, H = 1024;
  const p = new Painter(W, H, seed).fill(css(0xfaf2ea));
  grain(p, 0xfaf2ea, 2);
  const g = p.g;
  // a lace border, like a doily
  g.fillStyle = css(MC.pink);
  for (let i = 0; i < 4; i++) {
    g.save(); g.translate(W / 2, H / 2); g.rotate((i * Math.PI) / 2); g.translate(-W / 2, -H / 2);
    for (let x = 30; x < W - 30; x += 46) { g.beginPath(); g.arc(x + 23, 60, 23, Math.PI, 0); g.fill(); }
    g.fillRect(30, 60, W - 60, 10);
    g.fillStyle = css(0xfaf2ea);
    for (let x = 30; x < W - 30; x += 46) { g.beginPath(); g.arc(x + 23, 52, 6, 0, TAU); g.fill(); }
    g.fillStyle = css(MC.pink);
    g.restore();
  }
  // the seal
  const cx = W / 2, cy = H / 2;
  g.strokeStyle = css(MC.deepPink); g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, 250, 0, TAU); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 228, 0, TAU); g.stroke(); g.beginPath(); g.arc(cx, cy, 150, 0, TAU); g.stroke();
  g.fillStyle = css(MC.deepPink); g.font = `500 34px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const ring = 'MENDL\'S  ·  PATISSERIE  ·  NEBELSBAD  ·  REPUBLIC OF ZUBROWKA  ·  ';
  const chars = [...ring];
  chars.forEach((ch, i) => {
    const a = (i / chars.length) * TAU - Math.PI / 2;
    g.save(); g.translate(cx + Math.cos(a) * 190, cy + Math.sin(a) * 190); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
  });
  g.fillStyle = css(MC.navy);
  fitFont(g, "Mendl's", 'italic bold', SCRIPT, 250, 110);
  g.fillText("Mendl's", cx, cy - 6);
  g.font = `500 22px ${FUTURA}`; spaced(g, 'EST. 1868', cx, cy + 64, 6);
  return p.texture({ wrap: false });
}

/** The inside of a side flap: cream card with a pink lace edge along the fold-out side and the name in small blue script. */
export function flapInside() {
  const W = 512, H = 136;
  const p = new Painter(W, H, 45).fill(css(0xfaf2ea));
  grain(p, 0xfaf2ea, 1);
  const g = p.g;
  g.fillStyle = css(MC.pink);
  g.fillRect(0, 0, W, 16);
  for (let x = 0; x < W; x += 24) { g.beginPath(); g.arc(x + 12, 16, 12, 0, Math.PI); g.fill(); }
  g.fillStyle = css(0xfaf2ea);
  for (let x = 0; x < W; x += 24) { g.beginPath(); g.arc(x + 12, 10, 3.5, 0, TAU); g.fill(); }
  g.fillStyle = css(MC.navy); g.textAlign = 'center'; g.textBaseline = 'middle';
  fitFont(g, "Mendl's", 'italic bold', SCRIPT, 160, 54);
  g.fillText("Mendl's", W / 2, H * 0.6);
  g.fillStyle = css(MC.blue);
  for (const s of [-1, 1]) for (let k = 1; k <= 5; k++) { g.beginPath(); g.arc(W / 2 + s * (90 + k * 26), H * 0.62, 4, 0, TAU); g.fill(); }
  return p.texture({ wrap: false });
}

/** Tissue paper: a pale sheet with soft crinkles. One tile = 2 x 2 units. */
export function tissue(color: number, seed = 9) {
  const S = 256;
  const p = new Painter(S, S, seed).fill(css(color));
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), a = rng.range(0, TAU), l = rng.range(20, 90);
    g.strokeStyle = rng.chance(0.5) ? css(color, 1.12) : css(color, 0.86);
    g.globalAlpha = rng.range(0.25, 0.6); g.lineWidth = rng.range(0.8, 2.4);
    g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l * 0.5 + rng.range(-8, 8), y + Math.sin(a) * l * 0.5 + rng.range(-8, 8));
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.globalAlpha = 1;
  p.dabs({ n: 30, colors: [css(color, 1.08), css(color, 0.94)], r: [10, 30], alpha: [0.1, 0.2] });
  return p.texture({ repeat: [1, 1] });
}

/** Satin ribbon along v: a bright sheen down the middle and two fine edge lines. Tile = the width x 1 unit. */
export function ribbonTex(color = MC.blue) {
  const p = new Painter(64, 128, 11);
  p.hgrad([[0, css(color, 0.78)], [0.12, css(color, 1.0)], [0.4, css(color, 1.18)], [0.5, css(color, 1.3)], [0.62, css(color, 1.1)], [0.88, css(color, 0.98)], [1, css(color, 0.76)]]);
  const g = p.g;
  g.fillStyle = css(color, 1.35); g.fillRect(5, 0, 2, 128); g.fillRect(57, 0, 2, 128);
  p.lines({ n: 20, colors: [css(color, 1.2), css(color, 0.9)], alpha: [0.08, 0.2], width: [0.5, 1], vertical: true, wobble: 0.5 });
  return p.texture({ repeat: [1, 1] });
}

/** The conveyor's canvas belt: cream weave, a stitched seam, flour, a stencilled mark. One tile = 5 x 10 units. */
export function beltTex() {
  const W = 256, H = 512;
  const p = new Painter(W, H, 13).fill('#ece0c8');
  p.lines({ n: 160, colors: ['#f6ecd8', '#d8c8a8'], alpha: [0.15, 0.35], width: [0.6, 1.4], wobble: 0.3 });
  p.lines({ n: 120, colors: ['#f6ecd8', '#d8c8a8'], alpha: [0.12, 0.3], width: [0.6, 1.4], vertical: true, wobble: 0.3 });
  const g = p.g;
  // the seam
  g.fillStyle = 'rgba(120,90,60,0.28)'; g.fillRect(0, 250, W, 12);
  g.strokeStyle = 'rgba(90,60,40,0.55)'; g.lineWidth = 2;
  g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, 252 + (x % 16 ? 8 : 0)); g.stroke();
  // worn edges and flour
  g.fillStyle = 'rgba(140,110,80,0.25)'; g.fillRect(0, 0, 10, H); g.fillRect(W - 10, 0, 10, H);
  p.dabs({ n: 40, colors: ['#fffaf0'], r: [4, 18], alpha: [0.15, 0.35] });
  // a faint stencilled mark
  g.save(); g.translate(W / 2, 120); g.rotate(-Math.PI / 2);
  g.fillStyle = 'rgba(80,110,170,0.28)'; g.font = `bold 28px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  spaced(g, "MENDL'S", 0, 0, 6);
  g.restore();
  return p.texture({ repeat: [1, 1] });
}

/** Pistachio and cream checkerboard with marble veins and dustings of flour. One tile = 12 x 12 units (2 x 2 squares). */
export function checkerFloor() {
  const S = 512, c = S / 2;
  const p = new Painter(S, S, 15).fill(css(MC.cream));
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const col = (i + j) % 2 ? MC.pistachio : 0xf6efe0;
    g.fillStyle = css(col); g.fillRect(i * c, j * c, c, c);
    // marble veins
    for (let k = 0; k < 5; k++) {
      g.strokeStyle = css(col, rng.chance(0.5) ? 0.86 : 1.08); g.globalAlpha = rng.range(0.25, 0.5); g.lineWidth = rng.range(0.8, 2.2);
      let x = i * c + rng.range(0, c), y = j * c + rng.range(0, c);
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += rng.range(-30, 30); y += rng.range(-30, 30); g.lineTo(Math.max(i * c, Math.min(i * c + c, x)), Math.max(j * c, Math.min(j * c + c, y))); }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(i * c + 3, j * c + 3, c - 6, 4);
  }
  g.strokeStyle = 'rgba(90,80,70,0.35)'; g.lineWidth = 3;
  for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * c, 0); g.lineTo(k * c, S); g.moveTo(0, k * c); g.lineTo(S, k * c); g.stroke(); }
  p.dabs({ n: 26, colors: ['#ffffff'], r: [10, 50], alpha: [0.06, 0.16], squash: 0.6 });
  return p.texture({ repeat: [1, 1] });
}

/** White glazed wall tiles in a running bond with a band of pink. One tile = 4.8 x 4.8 units (4 x 8 tiles). */
export function wallTiles(band = MC.pink) {
  const W = 256, H = 256, tw = W / 4, th = H / 8;
  const p = new Painter(W, H, 17).fill('#c8c0b8');
  const g = p.g, rng = p.rng;
  for (let r = 0; r < 8; r++) {
    const off = r % 2 ? tw / 2 : 0;
    for (let k = -1; k < 5; k++) {
      const x = k * tw + off, y = r * th;
      const col = r === 7 ? band : 0xfbf8f2;
      g.fillStyle = css(col, rng.range(0.96, 1.03)); g.fillRect(x + 1.5, y + 1.5, tw - 3, th - 3);
      // glaze: a highlight along the top and a soft shade at the bottom
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x + 4, y + 4, tw - 14, 3);
      g.fillStyle = 'rgba(120,100,110,0.12)'; g.fillRect(x + 2, y + th - 7, tw - 4, 5);
    }
  }
  return p.texture({ repeat: [1, 1] });
}

/** Pink plaster with soft trowel marks. One tile = 6 x 6 units. */
export function plaster(color: number, seed = 19) {
  const p = new Painter(256, 256, seed).fill(css(color));
  p.dabs({ n: 50, colors: [css(color, 1.05), css(color, 0.94)], r: [12, 46], alpha: [0.06, 0.14], squash: 0.6 });
  p.dabs({ n: 140, colors: [css(color, 1.08), css(color, 0.9)], r: [1, 2.5], alpha: [0.12, 0.25] });
  return p.texture({ repeat: [1, 1] });
}

/**
 * A tall round-headed window full of pale daylight: small panes, a white frame, a painted sky with a
 * suggestion of rooftops. Transparent outside the arch. Returns the colour map (also used as emissive).
 */
export function archWindow(seed = 21) {
  const W = 256, H = 512;
  const p = new Painter(W, H, seed);
  const g = p.g;
  const r = W / 2 - 8;
  const path = (pad: number) => { g.beginPath(); g.moveTo(8 - pad, H - 4 + pad); g.lineTo(8 - pad, r + 8); g.arc(W / 2, r + 8, r + pad, Math.PI, 0); g.lineTo(W - 8 + pad, H - 4 + pad); g.closePath(); };
  g.fillStyle = '#f8f2ea'; path(6); g.fill();
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#cfe4f6'); sky.addColorStop(0.6, '#eef4fa'); sky.addColorStop(1, '#fbeee8');
  g.fillStyle = sky; path(0); g.fill();
  // distant pastel roofs and a dome in the lower panes
  g.save(); path(0); g.clip();
  g.fillStyle = 'rgba(232,190,200,0.6)'; g.fillRect(8, H * 0.8, W, H * 0.2);
  g.fillStyle = 'rgba(200,214,232,0.7)'; g.beginPath(); g.arc(W * 0.66, H * 0.8, 30, Math.PI, 0); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(p.rng.range(8, W - 8), p.rng.range(0, H), p.rng.range(1, 2.5), 0, TAU); g.fill(); }
  g.restore();
  // glazing bars
  g.strokeStyle = '#f2ebe0'; g.lineWidth = 7;
  for (let x = 1; x < 4; x++) { g.beginPath(); g.moveTo(8 + (x * (W - 16)) / 4, r * 0.6); g.lineTo(8 + (x * (W - 16)) / 4, H); g.stroke(); }
  for (let y = r + 8; y < H; y += 64) { g.beginPath(); g.moveTo(8, y); g.lineTo(W - 8, y); g.stroke(); }
  g.lineWidth = 5; for (let k = 0; k < 5; k++) { const a = Math.PI + (k / 4) * Math.PI; g.beginPath(); g.moveTo(W / 2, r + 8); g.lineTo(W / 2 + Math.cos(a) * r, r + 8 + Math.sin(a) * r); g.stroke(); }
  g.lineWidth = 12; g.strokeStyle = '#fbf8f2'; path(0); g.stroke();
  return p.texture({ wrap: false });
}

/** Coffered ceiling: pale blue coffers with cream ribs and a gilt rosette in each. One tile = 8 x 8 units. */
export function coffers() {
  const S = 256;
  const p = new Painter(S, S, 23).fill(css(MC.cream));
  const g = p.g;
  const inner = g.createLinearGradient(0, 0, S, S);
  inner.addColorStop(0, css(0xb8d4ee)); inner.addColorStop(1, css(0xa4c4e4));
  g.fillStyle = 'rgba(80,60,60,0.25)'; g.fillRect(26, 26, S - 52, S - 52);
  g.fillStyle = css(0xe8dccc); g.fillRect(30, 30, S - 60, S - 60);
  g.fillStyle = inner; g.fillRect(44, 44, S - 88, S - 88);
  g.strokeStyle = css(MC.gold); g.lineWidth = 3; g.strokeRect(50, 50, S - 100, S - 100);
  g.fillStyle = css(MC.gold);
  g.save(); g.translate(S / 2, S / 2);
  for (let k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.beginPath(); g.ellipse(0, -14, 6, 14, 0, 0, TAU); g.fill(); }
  g.fillStyle = css(MC.pink); g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill();
  g.restore();
  return p.texture({ repeat: [1, 1] });
}

/** An oven door: cream enamel, a brass bezel round a glowing window, a nameplate and a handle bar. Face = whole canvas; emissive is the glow. */
export function ovenDoor() {
  const W = 256, H = 192;
  const p = new Painter(W, H, 25).fill(css(0xf2ead8));
  const e = new Painter(W, H, 1).fill('#000');
  const g = p.g, eg = e.g;
  p.vgrad([[0, 'rgba(255,255,255,0.2)'], [1, 'rgba(120,90,60,0.12)']]);
  g.strokeStyle = css(MC.gold); g.lineWidth = 8; g.strokeRect(8, 8, W - 16, H - 16);
  g.strokeStyle = 'rgba(120,90,60,0.3)'; g.lineWidth = 2; g.strokeRect(16, 16, W - 32, H - 32);
  const cx = W / 2, cy = H * 0.5, R = 52;
  g.fillStyle = css(MC.gold, 0.8); g.beginPath(); g.arc(cx, cy, R + 12, 0, TAU); g.fill();
  g.fillStyle = css(MC.gold, 1.15); g.beginPath(); g.arc(cx, cy, R + 7, 0, TAU); g.fill();
  const gl = g.createRadialGradient(cx, cy + 10, 4, cx, cy, R);
  gl.addColorStop(0, '#ffe7a0'); gl.addColorStop(0.5, '#ff9a3a'); gl.addColorStop(1, '#a8401a');
  g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  // pastries baking inside, in silhouette
  g.fillStyle = 'rgba(110,50,20,0.65)';
  for (const x of [-26, 0, 26]) { g.beginPath(); g.ellipse(cx + x, cy + 22, 11, 8, 0, Math.PI, 0); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(cx - 18, cy - 22, 16, 7, -0.6, 0, TAU); g.fill();
  const eg2 = eg.createRadialGradient(cx, cy + 10, 4, cx, cy, R);
  eg2.addColorStop(0, '#ffd890'); eg2.addColorStop(0.6, '#e06a20'); eg2.addColorStop(1, '#601a08');
  eg.fillStyle = eg2; eg.beginPath(); eg.arc(cx, cy, R, 0, TAU); eg.fill();
  // nameplate and handle
  g.fillStyle = css(MC.gold); g.fillRect(cx - 40, 22, 80, 18);
  g.fillStyle = '#5a3a1a'; g.font = `bold 12px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle'; spaced(g, "MENDL'S", cx, 31, 3);
  g.fillStyle = css(MC.gold, 0.7); g.fillRect(30, H - 34, W - 60, 10);
  g.fillStyle = css(MC.gold, 1.2); g.fillRect(30, H - 34, W - 60, 3);
  return { map: p.texture({ wrap: false }), emissive: e.texture({ wrap: false }) };
}

/** Green glazed tiles round the ovens, in a stack bond. One tile = 3 x 3 units. */
export function ovenTiles() {
  const S = 128, n = 4, c = S / n;
  const p = new Painter(S, S, 27).fill('#4a6a5a');
  const g = p.g, rng = p.rng;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = css(0x7aa890, rng.range(0.9, 1.06)); g.fillRect(i * c + 1, j * c + 1, c - 2, c - 2);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(i * c + 3, j * c + 3, c - 10, 2);
  }
  return p.texture({ repeat: [1, 1] });
}

/** The shop's panelling: pink panels in gilt mouldings over a pale blue dado. One tile = 8 wide x 12 tall. */
export function shopPanels() {
  const W = 256, H = 384;
  const p = new Painter(W, H, 29).fill(css(MC.pink));
  const g = p.g;
  p.dabs({ n: 30, colors: [css(MC.pink, 1.04), css(MC.pink, 0.95)], r: [10, 40], alpha: [0.06, 0.12] });
  // the dado
  g.fillStyle = css(0xa8c6e8); g.fillRect(0, H * 0.72, W, H * 0.28);
  g.fillStyle = css(0xa8c6e8, 0.86); g.fillRect(30, H * 0.77, W - 60, H * 0.18);
  g.fillStyle = css(MC.cream); g.fillRect(0, H * 0.7, W, 12);
  // a panel with a gilt moulding and rounded corners
  g.strokeStyle = css(MC.gold); g.lineWidth = 7;
  const x0 = 30, y0 = 30, x1 = W - 30, y1 = H * 0.64, r = 22;
  g.beginPath(); g.moveTo(x0 + r, y0); g.lineTo(x1 - r, y0); g.arc(x1 - r, y0 + r, r, -Math.PI / 2, 0); g.lineTo(x1, y1 - r); g.arc(x1 - r, y1 - r, r, 0, Math.PI / 2);
  g.lineTo(x0 + r, y1); g.arc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI); g.lineTo(x0, y0 + r); g.arc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5); g.stroke();
  g.strokeStyle = css(MC.gold, 0.75); g.lineWidth = 2; g.strokeRect(x0 + 14, y0 + 14, x1 - x0 - 28, y1 - y0 - 28);
  g.fillStyle = css(MC.gold); g.beginPath(); g.arc(W / 2, y0 + 30, 9, 0, TAU); g.fill();
  return p.texture({ repeat: [1, 1] });
}

/**
 * The storefront's lettering, painted in gold on the outside of the glass, so from inside it reads backwards:
 * "Mendl's" in an arch over a line of capitals. Transparent elsewhere.
 */
export function windowLettering() {
  const W = 2048, H = 640;
  const p = new Painter(W, H, 31);
  const g = p.g;
  g.save();
  g.translate(W, 0); g.scale(-1, 1);
  const cx = W / 2;
  const word = "Mendl's";
  const size = fitFont(g, word, 'italic bold', SCRIPT, W * 0.62, H * 0.5);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // set the word on a gentle arch, letter by letter
  const chars = [...word];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0);
  let x = cx - total / 2;
  const R = W * 1.1;
  chars.forEach((ch, i) => {
    const mid = x + widths[i] / 2, a = (mid - cx) / R;
    const px = cx + Math.sin(a) * R, py = H * 0.4 + R - Math.cos(a) * R;
    g.save(); g.translate(px, py); g.rotate(a);
    g.lineWidth = size * 0.07; g.strokeStyle = '#2a1a10'; g.strokeText(ch, 0, 0);
    const gold = g.createLinearGradient(0, -size * 0.4, 0, size * 0.4);
    gold.addColorStop(0, '#fff0b0'); gold.addColorStop(0.45, '#e8c060'); gold.addColorStop(0.55, '#b8862a'); gold.addColorStop(1, '#f0d080');
    g.fillStyle = gold; g.fillText(ch, 0, 0);
    g.restore();
    x += widths[i];
  });
  g.font = `600 ${Math.round(H * 0.075)}px ${FUTURA}`;
  g.fillStyle = '#e8c060'; g.strokeStyle = '#2a1a10'; g.lineWidth = 5;
  const line = 'PATISSERIE  ·  CONFISERIE  ·  NEBELSBAD';
  const tw = spaced(g, line, cx, H * 0.86, 14);
  g.fillRect(cx - tw / 2 - 110, H * 0.86 - 3, 80, 6); g.fillRect(cx + tw / 2 + 30, H * 0.86 - 3, 80, 6);
  g.restore();
  return p.texture({ wrap: false });
}

/**
 * The street outside the shop window, painted flat like a backdrop: snow on the cobbles, a row of pastel
 * houses with lit windows, onion domes and Gabelmeister's Peak far off, flakes falling.
 */
export function streetBackdrop() {
  const W = 2048, H = 1024;
  const p = new Painter(W, H, 33);
  const g = p.g, rng = p.rng;
  p.vgrad([[0, '#b8cce4'], [0.45, '#dfe6f0'], [0.7, '#f4e6ea'], [1, '#f6eef0']]);
  // the peak, pale and far
  g.fillStyle = '#e8eef8';
  g.beginPath(); g.moveTo(W * 0.3, H * 0.62); g.lineTo(W * 0.5, H * 0.14); g.lineTo(W * 0.55, H * 0.2); g.lineTo(W * 0.62, H * 0.12); g.lineTo(W * 0.82, H * 0.62); g.fill();
  g.fillStyle = 'rgba(160,170,210,0.45)';
  g.beginPath(); g.moveTo(W * 0.5, H * 0.14); g.lineTo(W * 0.46, H * 0.62); g.lineTo(W * 0.3, H * 0.62); g.fill();
  g.fillStyle = '#7a6a8a'; g.fillRect(W * 0.555, H * 0.12, 18, 22); g.beginPath(); g.arc(W * 0.555 + 9, H * 0.12, 13, Math.PI, 0); g.fill();
  // houses across the street
  const cols = ['#f2b8c6', '#bfe0d0', '#f4dca0', '#c8d4ee', '#f6d0b8', '#e0c8e8'];
  let x = -20;
  while (x < W) {
    const w = rng.range(170, 260), h = rng.range(H * 0.32, H * 0.46), c = rng.pick(cols);
    const top = H * 0.82 - h;
    g.fillStyle = c; g.fillRect(x, top, w, h + 20);
    // roof: fish scales in a darker tone, or an onion dome
    if (rng.chance(0.25)) {
      g.fillStyle = '#9ab0d0'; g.beginPath(); g.ellipse(x + w / 2, top - 30, w * 0.22, 46, 0, 0, TAU); g.fill();
      g.fillRect(x + w / 2 - 3, top - 100, 6, 30); g.fillStyle = '#f0f4fa'; g.beginPath(); g.ellipse(x + w / 2, top - 52, w * 0.18, 16, 0, Math.PI, 0); g.fill();
    } else {
      g.fillStyle = css(new THREE.Color(c).multiplyScalar(0.72).getHex());
      g.beginPath(); g.moveTo(x - 8, top); g.lineTo(x + w / 2, top - rng.range(50, 90)); g.lineTo(x + w + 8, top); g.fill();
      g.fillStyle = '#fbfbff'; g.beginPath(); g.moveTo(x - 8, top); g.lineTo(x + w / 2, top - 40); g.lineTo(x + w + 8, top); g.lineTo(x + w + 8, top + 8); g.lineTo(x - 8, top + 8); g.fill();
    }
    // windows, some lit
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
      const wx = x + 24 + k * (w - 48) / 3 + 8, wy = top + 30 + r * (h * 0.28);
      if (wy > H * 0.74) continue;
      g.fillStyle = '#fbf6ee'; g.fillRect(wx - 4, wy - 4, 34, 50);
      g.fillStyle = rng.chance(0.4) ? '#ffe2a0' : '#7088a8'; g.fillRect(wx, wy, 26, 42);
      g.fillStyle = '#fbf6ee'; g.fillRect(wx + 12, wy, 2, 42); g.fillRect(wx, wy + 18, 26, 2);
    }
    g.fillStyle = 'rgba(80,60,80,0.18)'; g.fillRect(x + w - 6, top, 6, h);
    x += w;
  }
  // the street: snow over cobbles, a kerb, lamp posts
  g.fillStyle = '#eef0f6'; g.fillRect(0, H * 0.82, W, H * 0.18);
  g.fillStyle = 'rgba(160,160,190,0.35)';
  for (let i = 0; i < 200; i++) { g.beginPath(); g.ellipse(rng.range(0, W), rng.range(H * 0.84, H), rng.range(6, 14), rng.range(3, 5), 0, 0, TAU); g.fill(); }
  g.fillStyle = '#c8c8d8'; g.fillRect(0, H * 0.815, W, 10);
  for (const lx of [W * 0.12, W * 0.88]) {
    g.fillStyle = '#2a3040'; g.fillRect(lx - 5, H * 0.5, 10, H * 0.32);
    g.fillStyle = '#ffe8b0'; g.beginPath(); g.arc(lx, H * 0.5, 22, 0, TAU); g.fill();
  }
  // falling snow
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 500; i++) { g.beginPath(); g.arc(rng.range(0, W), rng.range(0, H), rng.range(1.5, 4), 0, TAU); g.fill(); }
  return p.texture({ wrap: false });
}

/** Flowing cream: soft swirls along v, for a scrolling river. One tile = 4 x 8 units. */
export function creamFlow() {
  const W = 128, H = 256;
  const p = new Painter(W, H, 35).fill('#fbf4e6');
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, W), y = rng.range(0, H);
    g.strokeStyle = rng.chance(0.5) ? 'rgba(232,212,180,0.7)' : 'rgba(255,255,255,0.9)';
    g.lineWidth = rng.range(2, 6);
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rng.range(-20, 20), y + 30, x + rng.range(-20, 20), y + 60, x + rng.range(-10, 10), y + 90); g.stroke();
    for (const dy of [-H, H]) { g.beginPath(); g.moveTo(x, y + dy); g.bezierCurveTo(x, y + dy + 30, x, y + dy + 60, x, y + dy + 90); g.stroke(); }
  }
  return p.texture({ repeat: [1, 1] });
}

/**
 * The Courtesan au chocolat's atlas: three bands for the three choux (lavender, pistachio, pink icing over
 * golden choux, with drips at the edge), then a strip of white (the piped pearls) and one of chocolate (the
 * cocoa bean). See pastry.ts for how each part is mapped into its band.
 */
export const ATLAS = { bands: [[0, 0.3], [0.3, 0.6], [0.6, 0.9]] as Array<[number, number]>, white: 0.925, choc: 0.975 };
export function courtesanAtlas(size = 512) {
  const W = size, H = size;
  const p = new Painter(W, H, 37);
  const g = p.g, rng = p.rng;
  const icings = ['#c3a8e2', '#bfe0b0', '#f6b6c8'];
  ATLAS.bands.forEach(([a, b], i) => {
    const y0 = a * H, h = (b - a) * H;
    // the pastry: golden, darker at the bottom, with craquelin cracks
    const pg = g.createLinearGradient(0, y0, 0, y0 + h);
    pg.addColorStop(0, '#e8b46a'); pg.addColorStop(0.6, '#c9883e'); pg.addColorStop(1, '#8a5424');
    g.fillStyle = pg; g.fillRect(0, y0, W, h);
    for (let k = 0; k < 90; k++) {
      g.strokeStyle = 'rgba(110,60,20,0.45)'; g.lineWidth = rng.range(0.6, 1.4);
      const x = rng.range(0, W), y = y0 + h * rng.range(0.4, 1);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-8, 8), y + rng.range(-6, 6)); g.stroke();
    }
    // the icing: covers the top, with a wavy edge and drips
    const edge = (x: number) => y0 + h * (0.5 + 0.06 * Math.sin((x / W) * TAU * 7 + i) + 0.03 * Math.sin((x / W) * TAU * 17));
    const ic = icings[i];
    g.fillStyle = ic;
    g.beginPath(); g.moveTo(0, y0);
    for (let x = 0; x <= W; x += 4) g.lineTo(x, edge(x));
    g.lineTo(W, y0); g.closePath(); g.fill();
    for (let k = 0; k < 9; k++) {
      const x = ((k + rng.range(0.1, 0.9)) / 9) * W, len = h * rng.range(0.08, 0.22), r = W * 0.009;
      const ey = edge(x);
      g.fillRect(x - r, ey - 2, r * 2, len);
      g.beginPath(); g.arc(x, ey + len, r * 1.15, 0, TAU); g.fill();
    }
    // gloss: a bright band and a darker rim near the edge
    const gl = g.createLinearGradient(0, y0, 0, y0 + h * 0.6);
    gl.addColorStop(0, 'rgba(255,255,255,0.0)'); gl.addColorStop(0.28, 'rgba(255,255,255,0.45)'); gl.addColorStop(0.4, 'rgba(255,255,255,0.0)'); gl.addColorStop(1, 'rgba(0,0,0,0.0)');
    g.save(); g.beginPath(); g.moveTo(0, y0); for (let x = 0; x <= W; x += 4) g.lineTo(x, edge(x)); g.lineTo(W, y0); g.closePath(); g.clip();
    g.fillStyle = gl; g.fillRect(0, y0, W, h);
    g.restore();
    g.fillStyle = '#fbf6ee'; g.fillRect(0, y0, W, 3);
  });
  // pearls and the bean
  g.fillStyle = '#fdfaf4'; g.fillRect(0, 0.9 * H, W, 0.05 * H);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0.905 * H, W, 0.012 * H);
  g.fillStyle = '#4a2416'; g.fillRect(0, 0.95 * H, W, 0.05 * H);
  g.fillStyle = '#7a4a30'; g.fillRect(0, 0.96 * H, W, 0.01 * H);
  return p.texture({ wrap: false });
}

/** Copper for the mixing bowls: warm bands for a lathe (runs along v). */
export function copper() {
  const p = new Painter(64, 256, 39);
  p.vgrad([[0, '#f0b080'], [0.2, '#c86a3a'], [0.45, '#f4c090'], [0.6, '#a85428'], [0.85, '#e09060'], [1, '#8a4020']]);
  p.lines({ n: 30, colors: ['rgba(255,220,180,0.4)', 'rgba(90,40,10,0.3)'], alpha: [0.2, 0.5], width: [0.5, 1.5], wobble: 0.4 });
  return p.texture({ repeat: [1, 1] });
}

/** Stripes for awnings and the piping bags: two colours across u. */
export function bands(a: number, b: number, n = 8) {
  const p = new Painter(256, 64, 41);
  const g = p.g;
  for (let i = 0; i < n * 2; i++) { g.fillStyle = css(i % 2 ? b : a); g.fillRect((i * 256) / (n * 2), 0, 256 / (n * 2) + 1, 64); }
  p.lines({ n: 40, colors: ['rgba(255,255,255,0.4)', 'rgba(0,0,0,0.2)'], alpha: [0.05, 0.12], width: [0.5, 1.2], wobble: 0.5 });
  return p.texture({ repeat: [1, 1] });
}

/** The Mendl's logo alone on a transparent canvas, for signs. */
export function logoSign(w = 1024, h = 512, o: { ink?: string; bg?: string; gold?: boolean } = {}) {
  const p = new Painter(w, h, 43);
  drawLogo(p.g, w / 2, h / 2, w * 0.98, h * 0.98, o);
  return p.texture({ wrap: false });
}

/** A seeded generator for scene code that wants one. */
export const rngFor = (seed: number) => new Rng(seed);
