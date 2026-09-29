import * as THREE from 'three';
import { Painter } from '../../engine/Paint';
import { TAU } from '../../engine/math';
import { css } from './textures';

/**
 * Painted textures for the Zubrowka Express characters, laid out for the three.js primitive each is applied
 * to (see the UV notes at the top of engine/Paint.ts): spheres and capsules have their front (+z) a quarter
 * of the way across the canvas, cylinders and cones at the left edge.
 */

export interface PuppetFace {
  skin: number;
  /** brows and lashes */
  hair: number;
  eyes?: number;
  /** 'pencil' is Zero's drawn-on moustache */
  moustache?: 'pencil' | number;
  /** Agatha's birthmark, shaped like Mexico, on her right cheek */
  birthmark?: boolean;
  /** Suzy's powder-blue eyeshadow */
  shadow?: number;
  blush?: number;
  mouth?: 'line' | 'smile' | 'o';
  /** hair painted over the crown and back of the head: 'slick' is combed back with a sheen */
  hairPaint?: 'short' | 'slick';
  seed?: number;
}

/**
 * A head for a sphere facing +z: skin shaded a little darker under the chin, then small, deadpan features in
 * the middle of the front: dark eyes with a glint, straight brows, a short nose shadow, a small mouth.
 */
export function faceTexture(o: PuppetFace) {
  const W = 512, H = 256, f = W / TAU;
  const p = new Painter(W, H, o.seed ?? 3).fill(css(o.skin));
  const g = p.g;
  p.vgrad([[0, 'rgba(255,255,255,0.05)'], [0.55, 'rgba(255,255,255,0)'], [1, css(o.skin, 0.78, 0xa05a50, 0.3)]], 0.8);
  p.dabs({ n: 40, colors: [css(o.skin, 1.04), css(o.skin, 0.96)], r: [4, 14], alpha: [0.08, 0.16] });
  const cx = W * 0.25, cy = H * 0.52;
  if (o.hairPaint) {
    // everything above a hairline that sits over the brows at the front, over the ears at the sides and
    // low at the nape; the front (+z) is at u = 0.25
    const line = (u: number) => H * (0.36 + 0.3 * (0.5 - 0.5 * Math.cos(TAU * (u - 0.25))));
    g.fillStyle = css(o.hair);
    g.beginPath(); g.moveTo(0, 0);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, line(x / W));
    g.lineTo(W, 0); g.closePath(); g.fill();
    const slick = o.hairPaint === 'slick';
    // strands combed back from the hairline, and a sheen band
    p.lines({ n: slick ? 70 : 45, colors: [css(o.hair, 0.72), css(o.hair, 1.4, 0xb0c0e0, 0.15)], alpha: [0.2, 0.45], width: [1, 2.5], vertical: true, wobble: slick ? 0.6 : 1.6 });
    // repaint the skin below the hairline over the strands
    g.fillStyle = css(o.skin);
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, line(x / W) + 1);
    g.lineTo(W, H); g.closePath(); g.fill();
    p.vgrad([[0, 'rgba(255,255,255,0.05)'], [0.55, 'rgba(255,255,255,0)'], [1, css(o.skin, 0.78, 0xa05a50, 0.3)]], 0.8);
    g.globalAlpha = slick ? 0.4 : 0.22; g.fillStyle = css(o.hair, 1.8, 0xc0d0f0, 0.2); g.fillRect(0, H * 0.14, W, H * 0.035); g.globalAlpha = 1;
  }
  // cheeks
  for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(cx + s * 0.42 * f, cy + 0.2 * f, 0, cx + s * 0.42 * f, cy + 0.2 * f, 0.18 * f);
    gr.addColorStop(0, `rgba(230,120,120,${o.blush ?? 0.35})`); gr.addColorStop(1, 'rgba(230,120,120,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx + s * 0.42 * f, cy + 0.2 * f, 0.2 * f, 0, TAU); g.fill();
  }
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ex = cx + s * 0.3 * f, ey = cy - 0.02 * f;
    if (o.shadow !== undefined) { g.fillStyle = css(o.shadow); g.globalAlpha = 0.75; g.beginPath(); g.ellipse(ex, ey - 0.07 * f, 0.13 * f, 0.08 * f, 0, Math.PI, TAU); g.fill(); g.globalAlpha = 1; }
    g.fillStyle = '#fbf8f2'; g.beginPath(); g.ellipse(ex, ey, 0.085 * f, 0.07 * f, 0, 0, TAU); g.fill();
    g.fillStyle = css(o.eyes ?? 0x2a2018); g.beginPath(); g.arc(ex + s * 0.01 * f, ey + 0.005 * f, 0.055 * f, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex - 0.02 * f, ey - 0.02 * f, 0.018 * f, 0, TAU); g.fill();
    g.strokeStyle = '#2a1c18'; g.lineWidth = 0.022 * f;
    g.beginPath(); g.moveTo(ex - 0.09 * f, ey - 0.03 * f); g.quadraticCurveTo(ex, ey - 0.09 * f, ex + 0.09 * f, ey - 0.03 * f); g.stroke();
    // straight, level brows: the deadpan look
    g.strokeStyle = css(o.hair, 0.85); g.lineWidth = 0.03 * f;
    g.beginPath(); g.moveTo(ex - 0.1 * f, ey - 0.17 * f); g.lineTo(ex + 0.1 * f, ey - 0.165 * f); g.stroke();
  }
  g.strokeStyle = css(o.skin, 0.72, 0xa05040, 0.2); g.lineWidth = 0.02 * f;
  g.beginPath(); g.moveTo(cx + 0.02 * f, cy + 0.02 * f); g.lineTo(cx + 0.04 * f, cy + 0.17 * f); g.lineTo(cx - 0.02 * f, cy + 0.19 * f); g.stroke();
  const my = cy + 0.32 * f;
  if (o.mouth === 'o') { g.fillStyle = '#7a2a2a'; g.beginPath(); g.ellipse(cx, my, 0.04 * f, 0.05 * f, 0, 0, TAU); g.fill(); }
  else {
    g.strokeStyle = '#a0443e'; g.lineWidth = 0.022 * f;
    g.beginPath(); g.moveTo(cx - 0.07 * f, my); g.quadraticCurveTo(cx, my + (o.mouth === 'smile' ? 0.05 : 0.01) * f, cx + 0.07 * f, my); g.stroke();
  }
  if (o.moustache === 'pencil') {
    g.strokeStyle = '#1e1612'; g.lineWidth = 0.014 * f;
    g.beginPath(); g.moveTo(cx - 0.12 * f, my - 0.07 * f); g.lineTo(cx - 0.015 * f, my - 0.085 * f); g.moveTo(cx + 0.015 * f, my - 0.085 * f); g.lineTo(cx + 0.12 * f, my - 0.07 * f); g.stroke();
  } else if (o.moustache !== undefined) {
    g.fillStyle = css(o.moustache);
    g.beginPath(); g.moveTo(cx, my - 0.1 * f); g.quadraticCurveTo(cx - 0.12 * f, my - 0.12 * f, cx - 0.15 * f, my - 0.03 * f); g.quadraticCurveTo(cx - 0.07 * f, my - 0.06 * f, cx, my - 0.05 * f); g.quadraticCurveTo(cx + 0.07 * f, my - 0.06 * f, cx + 0.15 * f, my - 0.03 * f); g.quadraticCurveTo(cx + 0.12 * f, my - 0.12 * f, cx, my - 0.1 * f); g.fill();
  }
  if (o.birthmark) {
    // on her right cheek, which is the viewer's left
    g.fillStyle = css(o.skin, 0.62, 0x7a4a3a, 0.4);
    const bx = cx - 0.4 * f, by = cy + 0.12 * f, k = 0.01 * f;
    g.beginPath(); g.moveTo(bx - 8 * k, by - 7 * k); g.lineTo(bx + 6 * k, by - 6 * k); g.lineTo(bx + 4 * k, by + 1 * k); g.lineTo(bx + 9 * k, by + 8 * k); g.lineTo(bx + 5 * k, by + 10 * k); g.lineTo(bx - 1 * k, by + 3 * k); g.lineTo(bx - 7 * k, by + 1 * k); g.closePath(); g.fill();
  }
  return p.texture();
}

/** Hair for a cap over the head: strands running down from the crown and a sheen band. */
export function hairTexture(color: number, seed = 31, slick = false) {
  const p = new Painter(256, 128, seed).fill(css(color));
  p.lines({ n: slick ? 60 : 40, colors: [css(color, 0.72), css(color, 1.45, 0xa0b0d0, 0.15)], alpha: [0.2, 0.45], width: [1, 2.5], vertical: true, wobble: slick ? 0.5 : 1.5 });
  p.vgrad([[0, 'rgba(255,255,255,0)'], [0.26, 'rgba(255,255,255,0)'], [0.33, `rgba(230,235,255,${slick ? 0.45 : 0.25})`], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.25)']]);
  return p.texture();
}

export interface Outfit {
  color: number;
  /** lapels of a jacket, in this colour (usually the jacket's own, a shade lighter) */
  lapels?: number;
  shirt?: number;
  tie?: number;
  buttons?: number;
  /** a double row of buttons */
  double?: boolean;
  /** gold braid down the front and round the hem (a hotel uniform) */
  trim?: number;
  /** the Society of the Crossed Keys pin on the left lapel */
  keys?: boolean;
  /** a neckerchief knotted at the collar (the Khaki Scouts' is yellow) */
  neckerchief?: number;
  /** a sash of merit badges from the right shoulder */
  sash?: boolean;
  /** breast pockets (a shirt or a vest) */
  pockets?: boolean;
  /** a white apron over a dress */
  apron?: number;
  /** Team Zissou's patch on the chest and cornflower tape */
  zissou?: boolean;
  /** corduroy wales */
  cord?: boolean;
  seed?: number;
}

/** A texture from a painter's canvas scaled down by half: painted at 2x for clean edges, stored small. */
function halfSize(p: Painter) {
  const c = document.createElement('canvas'); c.width = p.w / 2; c.height = p.h / 2;
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(p.canvas, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** A jacket or shirt for a torso capsule, front at a quarter of the way across. Stored at 256 x 128. */
export function outfitTexture(o: Outfit) {
  const W = 512, H = 256;
  const p = new Painter(W, H, o.seed ?? 5).fill(css(o.color));
  const g = p.g;
  if (o.cord) p.lines({ n: 110, colors: [css(o.color, 0.8), css(o.color, 1.12)], alpha: [0.35, 0.6], width: [1.5, 3], vertical: true, wobble: 0.6 });
  else {
    p.lines({ n: 60, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.08], width: [1, 1.5], wobble: 0.5 });
    p.lines({ n: 60, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.08], width: [1, 1.5], vertical: true, wobble: 0.5 });
  }
  // soft folds at the sides and under the arms
  for (const u of [0.02, 0.48, 0.52, 0.98]) { const gr = g.createLinearGradient(u * W - 24, 0, u * W + 24, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(u * W - 24, 0, 48, H); }
  const cx = W * 0.25;
  if (o.lapels !== undefined) {
    g.fillStyle = css(o.shirt ?? 0xf6f2ea);
    g.beginPath(); g.moveTo(cx - 34, 0); g.lineTo(cx + 34, 0); g.lineTo(cx, 120); g.closePath(); g.fill();
    if (o.tie !== undefined) { g.fillStyle = css(o.tie); g.beginPath(); g.moveTo(cx - 9, 8); g.lineTo(cx + 9, 8); g.lineTo(cx + 12, 100); g.lineTo(cx, 116); g.lineTo(cx - 12, 100); g.closePath(); g.fill(); }
    g.fillStyle = css(o.lapels);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 34, 0); g.lineTo(cx + s * 70, 0); g.lineTo(cx + s * 44, 70); g.lineTo(cx + s * 4, 124); g.closePath(); g.fill(); }
    g.strokeStyle = css(o.color, 0.7); g.lineWidth = 2;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 70, 0); g.lineTo(cx + s * 44, 70); g.lineTo(cx + s * 4, 124); g.stroke(); }
  }
  if (o.trim !== undefined) {
    g.fillStyle = css(o.trim);
    for (const s of [-1, 1]) g.fillRect(cx + s * 26 - 3, 110, 6, H - 110);
    g.fillRect(0, H - 12, W, 6);
    g.fillRect(0, 0, W, 5);
  }
  if (o.buttons !== undefined) {
    const cols = o.double ? [-18, 18] : [0];
    for (const bx of cols) for (let i = 0; i < 3; i++) {
      const y = 140 + i * 34;
      g.fillStyle = css(o.buttons, 0.7); g.beginPath(); g.arc(cx + bx + 1, y + 1, 6, 0, TAU); g.fill();
      g.fillStyle = css(o.buttons); g.beginPath(); g.arc(cx + bx, y, 5.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(cx + bx - 1.5, y - 1.5, 2, 0, TAU); g.fill();
    }
  }
  if (o.keys) {
    // two crossed golden keys on the left lapel (the viewer's right)
    g.save(); g.translate(cx + 46, 48); g.strokeStyle = '#e8c45a'; g.lineWidth = 3.5; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.save(); g.rotate(s * 0.6); g.beginPath(); g.moveTo(0, -14); g.lineTo(0, 12); g.moveTo(0, 10); g.lineTo(5, 10); g.moveTo(0, 5); g.lineTo(4, 5); g.stroke(); g.beginPath(); g.arc(0, -17, 4, 0, TAU); g.stroke(); g.restore(); }
    g.restore();
  }
  if (o.pockets) for (const s of [-1, 1]) { g.fillStyle = css(o.color, 0.86); g.fillRect(cx + s * 34 - 16, 80, 32, 30); g.fillStyle = css(o.color, 0.72); g.fillRect(cx + s * 34 - 16, 80, 32, 5); }
  if (o.apron !== undefined) {
    g.fillStyle = css(o.apron); g.beginPath(); g.moveTo(cx - 44, 90); g.lineTo(cx + 44, 90); g.lineTo(cx + 54, H); g.lineTo(cx - 54, H); g.closePath(); g.fill();
    g.fillRect(0, 118, W, 7);
    g.fillStyle = 'rgba(0,0,0,0.08)'; for (const x of [-20, 0, 20]) g.fillRect(cx + x, 100, 2, H - 100);
  }
  if (o.neckerchief !== undefined) {
    g.fillStyle = css(o.neckerchief);
    g.beginPath(); g.moveTo(cx - 40, 0); g.lineTo(cx + 40, 0); g.lineTo(cx + 8, 60); g.lineTo(cx - 8, 60); g.closePath(); g.fill();
    g.fillStyle = css(o.neckerchief, 0.85); g.beginPath(); g.arc(cx, 22, 9, 0, TAU); g.fill();
  }
  if (o.sash) {
    g.save(); g.translate(cx, H / 2); g.rotate(-0.55);
    g.fillStyle = '#7a6a3a'; g.fillRect(-150, -18, 300, 36);
    const badge = ['#b93a4c', '#4f8a8a', '#e8c04a', '#5a7ab8', '#e8a0b0', '#7fa58a', '#d8743a'];
    for (let i = 0; i < 9; i++) { g.fillStyle = badge[i % badge.length]; g.beginPath(); g.arc(-120 + i * 30, 0, 11, 0, TAU); g.fill(); g.strokeStyle = '#f4ecd8'; g.lineWidth = 2; g.stroke(); }
    g.restore();
  }
  if (o.zissou) {
    // cornflower tape down the sides, and the patch: a yellow-and-white Z over TEAM ZISSOU
    g.fillStyle = '#5a82c8'; g.fillRect(W * 0.5 - 4, 0, 8, H); g.fillRect(0, 0, 8, H); g.fillRect(W - 8, 0, 8, H);
    const px = cx + 42, py = 70;
    g.fillStyle = '#fbf8f0'; g.fillRect(px - 26, py - 26, 52, 58);
    g.fillStyle = '#f2c832'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', px, py - 2);
    g.fillStyle = '#2f4a6e'; g.font = 'bold 9px Georgia, serif'; g.fillText('TEAM ZISSOU', px, py + 24);
  }
  return halfSize(p);
}

/** Trousers, skirts, sleeves: the cloth colour with a faint weave, or corduroy. */
export function cloth(color: number, o: { cord?: boolean; seed?: number; hem?: number } = {}) {
  const p = new Painter(128, 128, o.seed ?? 7).fill(css(color));
  if (o.cord) p.lines({ n: 30, colors: [css(color, 0.8), css(color, 1.12)], alpha: [0.35, 0.6], width: [1, 2], vertical: true, wobble: 0.4 });
  else {
    p.lines({ n: 26, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.08], width: [1, 1.2], wobble: 0.3 });
    p.lines({ n: 26, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.08], width: [1, 1.2], vertical: true, wobble: 0.3 });
  }
  if (o.hem !== undefined) { p.g.fillStyle = css(o.hem); p.g.fillRect(0, 116, 128, 7); }
  return p.texture();
}

/** Zero's purple pillbox cap with LOBBY BOY stitched across the front in gold. For a cylinder (front at the seam). */
export function lobbyBoyCap() {
  const W = 512, H = 128;
  const p = new Painter(W, H, 9).fill('#5d3a8a');
  const g = p.g;
  p.vgrad([[0, 'rgba(255,255,255,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.2)']]);
  g.fillStyle = '#d8b25a'; g.fillRect(0, H - 22, W, 12); g.fillRect(0, 6, W, 5);
  g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const x of [0, W]) { g.fillStyle = '#e8c45a'; g.fillText('LOBBY BOY', x, H * 0.46); }
  return p.texture();
}

/** A red knit beanie (Team Zissou), ribbed. For a sphere or cylinder. */
export function knit(color: number) {
  const p = new Painter(256, 128, 11).fill(css(color));
  for (let x = 0; x < 256; x += 8) { p.g.fillStyle = css(color, 0.82); p.g.fillRect(x, 0, 3, 128); }
  p.dabs({ n: 80, colors: [css(color, 1.1), css(color, 0.9)], r: [1, 3], alpha: [0.3, 0.5] });
  return p.texture();
}

/**
 * A stop-motion fox's head for a sphere facing +z: orange fur brushed back, a cream muzzle and chin, dark
 * eye patches with bright glints. The snout is a separate ellipsoid in the same fur.
 */
export function foxHead(o: { base: number; cream: number; eyes?: 'open' | 'swirl' } = { base: 0xd9782f, cream: 0xf4e6d2 }) {
  const W = 512, H = 256, f = W / TAU;
  const p = new Painter(W, H, 13).fill(css(o.base));
  p.vgrad([[0, css(o.base, 1.08, 0xfff0d0, 0.1)], [0.5, css(o.base)], [1, css(o.base, 0.8)]]);
  const angle = (u: number) => Math.PI / 2 + Math.sin(u * TAU) * 0.3;
  p.fur({ n: 900, colors: [css(o.base, 0.85), css(o.base, 1.12)], len: [8, 18], width: [2.5, 5], alpha: [0.3, 0.55], angle });
  const g = p.g;
  const cx = W * 0.25, cy = H * 0.55;
  // cream muzzle and throat
  g.fillStyle = css(o.cream);
  g.beginPath(); g.ellipse(cx, cy + 0.34 * f, 0.36 * f, 0.34 * f, 0, 0, TAU); g.fill();
  p.fur({ n: 160, colors: [css(o.cream, 0.94), css(o.cream, 1.04)], len: [5, 10], width: [2, 3.5], alpha: [0.3, 0.5], x: [0.19, 0.31], y: [0.62, 0.95] });
  for (const s of [-1, 1]) {
    const ex = cx + s * 0.3 * f, ey = cy - 0.06 * f;
    if (o.eyes === 'swirl') {
      g.fillStyle = '#fbf8f0'; g.beginPath(); g.arc(ex, ey, 0.12 * f, 0, TAU); g.fill();
      g.strokeStyle = '#2a2018'; g.lineWidth = 0.02 * f; g.beginPath();
      for (let a = 0; a < TAU * 2.6; a += 0.2) { const r = 0.012 * f + a * 0.0068 * f; const x = ex + Math.cos(a * s) * r, y = ey + Math.sin(a * s) * r; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    } else {
      g.fillStyle = css(o.base, 0.55); g.beginPath(); g.ellipse(ex, ey, 0.12 * f, 0.1 * f, s * 0.3, 0, TAU); g.fill();
      g.fillStyle = '#1a1410'; g.beginPath(); g.ellipse(ex, ey, 0.08 * f, 0.075 * f, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex - 0.025 * f, ey - 0.025 * f, 0.022 * f, 0, TAU); g.fill();
    }
  }
  return p.texture();
}

/** Plain brushed fur for tails, ears and snouts. */
export function furTexture(color: number, seed = 15, tip?: number) {
  const p = new Painter(256, 128, seed).fill(css(color));
  p.fur({ n: 420, colors: [css(color, 0.86), css(color, 1.12)], len: [6, 14], width: [2, 4], alpha: [0.3, 0.55] });
  if (tip !== undefined) { p.g.fillStyle = css(tip); p.g.fillRect(0, 100, 256, 28); p.fur({ n: 80, colors: [css(tip, 0.95)], len: [6, 12], width: [2, 3], alpha: [0.4, 0.6], y: [0.72, 0.85] }); }
  return p.texture();
}

/** Kylie the opossum's head: pale grey and white, a pink nose, beady eyes, or the glazed swirls when he zones out. */
export function opossumHead(swirl: boolean) {
  const W = 512, H = 256, f = W / TAU;
  const p = new Painter(W, H, 17).fill('#c8c6c2');
  p.fur({ n: 700, colors: ['#b8b4b0', '#dedad4'], len: [8, 16], width: [2, 4], alpha: [0.3, 0.55] });
  const g = p.g;
  const cx = W * 0.25, cy = H * 0.55;
  g.fillStyle = '#f4f0ea'; g.beginPath(); g.ellipse(cx, cy + 0.1 * f, 0.5 * f, 0.4 * f, 0, 0, TAU); g.fill();
  p.fur({ n: 160, colors: ['#ece8e2', '#fbf8f4'], len: [5, 10], width: [2, 3], alpha: [0.3, 0.5], x: [0.14, 0.36], y: [0.4, 0.85] });
  for (const s of [-1, 1]) {
    const ex = cx + s * 0.28 * f, ey = cy - 0.1 * f;
    if (swirl) {
      g.fillStyle = '#fbf8f0'; g.beginPath(); g.arc(ex, ey, 0.15 * f, 0, TAU); g.fill();
      g.strokeStyle = '#2a2230'; g.lineWidth = 0.022 * f; g.beginPath();
      for (let a = 0; a < TAU * 2.6; a += 0.2) { const r = 0.012 * f + a * 0.0085 * f; const x = ex + Math.cos(a * s) * r, y = ey + Math.sin(a * s) * r; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    } else {
      g.fillStyle = '#1e1a20'; g.beginPath(); g.arc(ex, ey, 0.07 * f, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex - 0.02 * f, ey - 0.02 * f, 0.02 * f, 0, TAU); g.fill();
    }
  }
  return p.texture();
}

/** Grey alien skin: a cool, faintly mottled grey. */
export function alienSkin() {
  const p = new Painter(256, 128, 19).fill('#9da2ae');
  p.dabs({ n: 90, colors: ['#a8adb8', '#8e929e', '#b4b8c2'], r: [3, 12], alpha: [0.2, 0.4] });
  p.vgrad([[0, 'rgba(255,255,255,0.1)'], [1, 'rgba(0,0,0,0.12)']]);
  return p.texture();
}

/**
 * The jaguar shark's skin for its body ellipsoid (+z is the head): dark blue-grey, a pale belly, and jaguar
 * rosettes along the back. Returns the colour map and a glow map (the rosettes' centres shine faintly).
 */
export function jaguarSkin() {
  const W = 1024, H = 512;
  const p = new Painter(W, H, 21).fill('#3d4d63');
  // the glow is soft, so it is painted at half the size (same layout, scaled)
  const e = new Painter(W / 2, H / 2, 22).fill('#000');
  const g = p.g, eg = e.g, rng = p.rng;
  eg.scale(0.5, 0.5);
  p.vgrad([[0, '#34425a'], [0.55, '#46586e'], [0.72, '#8a9cae'], [1, '#b8c6d2']]);
  p.dabs({ n: 120, colors: ['#4a5c74', '#33415a'], r: [8, 30], alpha: [0.2, 0.4], y: [0, 0.6] });
  for (let i = 0; i < 150; i++) {
    const x = rng.range(0, W), y = rng.range(H * 0.08, H * 0.6), r = rng.range(9, 20);
    // a rosette: a broken ring of dark marks round a paler centre that glows faintly
    const arcs: Array<[number, number]> = [];
    for (let k = 0; k < 5; k++) { const a0 = (k / 5) * TAU + rng.range(0, 0.3); arcs.push([a0, a0 + rng.range(0.7, 1.0)]); }
    const offs = [0];
    if (x - r < 0) offs.push(W);
    if (x + r > W) offs.push(-W);
    for (const dx of offs) {
      g.strokeStyle = '#1c2230'; g.lineWidth = r * 0.34;
      g.beginPath();
      for (const [a0, a1] of arcs) { g.moveTo(x + dx + Math.cos(a0) * r, y + Math.sin(a0) * r); g.arc(x + dx, y, r, a0, a1); }
      g.stroke();
      g.fillStyle = '#6a86a0'; g.beginPath(); g.ellipse(x + dx, y, r * 0.45, r * 0.36, 0, 0, TAU); g.fill();
      eg.fillStyle = '#9ff0ff'; eg.beginPath(); eg.ellipse(x + dx, y, r * 0.35, r * 0.28, 0, 0, TAU); eg.fill();
    }
  }
  return { map: p.texture(), glow: e.texture() };
}

/** Sugar-crab shell: a candy-striped shell, the stripes running across the back. For a flattened sphere. */
export function candyShell(a: number, b: number) {
  const p = new Painter(256, 128, 23).fill(css(a));
  const g = p.g;
  for (let x = 0; x < 256; x += 32) { g.fillStyle = css(b); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, 0); g.lineTo(x + 30, 128); g.lineTo(x + 16, 128); g.closePath(); g.fill(); }
  p.vgrad([[0, 'rgba(255,255,255,0.25)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.15)']]);
  return p.texture();
}

/** A painted steel hull band for the Belafonte: pale blue with a white stripe, portholes and waterline. Tiles along. */
export function hullTexture() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 25).fill('#9cc8e4');
  const g = p.g;
  p.dabs({ n: 40, colors: ['#a8d0ea', '#8ebcd8'], r: [10, 40], alpha: [0.1, 0.2], squash: 0.5 });
  g.fillStyle = '#f6f6f2'; g.fillRect(0, 22, W, 34);
  g.fillStyle = '#d23c3c'; g.fillRect(0, H - 40, W, 40);
  g.fillStyle = '#2f4a5e'; g.fillRect(0, H - 44, W, 5);
  for (let x = 40; x < W; x += 96) {
    g.fillStyle = '#e8ecef'; g.beginPath(); g.arc(x, 110, 16, 0, TAU); g.fill();
    g.fillStyle = '#2f4a5e'; g.beginPath(); g.arc(x, 110, 11, 0, TAU); g.fill();
    g.fillStyle = 'rgba(220,240,255,0.5)'; g.beginPath(); g.arc(x - 3, 106, 4, 0, TAU); g.fill();
  }
  for (let x = 0; x < W; x += 64) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 56, 2, H - 100); }
  return p.texture({ repeat: [1, 1] });
}

/** Deep Search's yellow skin, with rivets and the old name, JACQUELINE, painted out. For a capsule on its side. */
export function subTexture() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 27).fill('#f2c832');
  const g = p.g;
  p.dabs({ n: 50, colors: ['#f6d04a', '#e0b428'], r: [8, 30], alpha: [0.15, 0.3] });
  for (let x = 0; x < W; x += 64) { g.fillStyle = '#c89a1e'; g.fillRect(x, 0, 3, H); for (let y = 8; y < H; y += 16) { g.fillStyle = '#b8901a'; g.beginPath(); g.arc(x + 9, y, 2.4, 0, TAU); g.fill(); } }
  // the old name, crossed out, on both flanks (the capsule lies on its side, so its flanks are at u = 0 and 0.5)
  for (const x of [0, W / 2, W]) {
    g.fillStyle = '#6a5a3a'; g.font = 'bold 26px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(x, H * 0.5); g.rotate(Math.PI / 2); g.fillText('JACQUELINE', 0, 0);
    g.strokeStyle = '#2a2c30'; g.lineWidth = 5; g.beginPath(); g.moveTo(-78, -2); g.lineTo(78, 4); g.stroke(); g.restore();
  }
  return p.texture();
}

/** A room in the Belafonte's cutaway, painted onto its back wall. */
export function cabinWall(kind: 'library' | 'galley' | 'lab' | 'sauna' | 'editing' | 'engine' | 'bridge') {
  const W = 256, H = 160;
  const bg = { library: '#e8d8b8', galley: '#dff0ec', lab: '#e6eef2', sauna: '#c8945a', editing: '#3a3a44', engine: '#9aa4ac', bridge: '#d8e8f2' }[kind];
  const p = new Painter(W, H, 29).fill(bg);
  const g = p.g, rng = p.rng;
  if (kind === 'library') {
    for (let row = 0; row < 4; row++) {
      g.fillStyle = '#7a5a3a'; g.fillRect(8, 20 + row * 34, W - 16, 5);
      let x = 12;
      while (x < W - 16) { const w = rng.range(5, 10), h = rng.range(18, 27); g.fillStyle = rng.pick(['#b93a4c', '#2f6f8a', '#e8c04a', '#4f7a58', '#7a2a36', '#f2e8d8']); g.fillRect(x, 20 + row * 34 - h, w, h); x += w + 1; }
    }
  } else if (kind === 'galley') {
    for (let x = 0; x < W; x += 16) for (let y = 0; y < 80; y += 16) { g.fillStyle = (x + y) % 32 ? '#f6fbfa' : '#bfe0d8'; g.fillRect(x, y, 16, 16); }
    g.fillStyle = '#9aa4ac'; g.fillRect(20, 90, W - 40, 50);
    for (let i = 0; i < 6; i++) { g.fillStyle = '#6a7078'; g.beginPath(); g.arc(40 + i * 34, 30, 10, 0, TAU); g.fill(); g.fillRect(38 + i * 34, 30, 4, 20); }
  } else if (kind === 'lab') {
    g.fillStyle = '#c8d4da'; for (let y = 40; y < H; y += 40) g.fillRect(10, y, W - 20, 4);
    for (let i = 0; i < 22; i++) { const x = 16 + (i % 11) * 21, y = i < 11 ? 16 : 56; g.fillStyle = 'rgba(160,210,200,0.8)'; g.fillRect(x, y, 14, 22); g.fillStyle = rng.pick(['#e8743a', '#f2b8c6', '#7fa58a', '#e8c04a']); g.beginPath(); g.ellipse(x + 7, y + 14, 4, 5, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#6fc4c0'; g.fillRect(20, 100, 80, 50); g.fillStyle = '#f2b8c6'; g.beginPath(); g.ellipse(60, 125, 12, 8, 0.4, 0, TAU); g.fill();
  } else if (kind === 'sauna') {
    for (let y = 0; y < H; y += 12) { g.fillStyle = y % 24 ? '#b8844c' : '#d0a06a'; g.fillRect(0, y, W, 11); }
    g.fillStyle = '#8a5a30'; g.fillRect(0, 100, W, 16); g.fillRect(0, 60, W, 12);
  } else if (kind === 'editing') {
    g.fillStyle = '#e8e2d0'; g.fillRect(30, 30, 90, 60);
    g.fillStyle = '#6fa6c8'; g.fillRect(36, 36, 78, 48);
    for (const [x, y] of [[160, 40], [210, 40], [160, 100], [210, 100]]) { g.strokeStyle = '#d8d0c0'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 18, 0, TAU); g.stroke(); g.fillStyle = '#d8d0c0'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); }
    g.fillStyle = '#f2d23a'; g.fillRect(30, 110, 90, 8);
  } else if (kind === 'engine') {
    g.strokeStyle = '#d23c3c'; g.lineWidth = 8; g.beginPath(); g.moveTo(0, 30); g.lineTo(W, 30); g.stroke();
    g.strokeStyle = '#e8c04a'; g.beginPath(); g.moveTo(0, 50); g.lineTo(W, 50); g.stroke();
    for (let i = 0; i < 5; i++) { g.fillStyle = '#5a646c'; g.fillRect(20 + i * 46, 70, 34, 80); g.fillStyle = '#f2f2ee'; g.beginPath(); g.arc(37 + i * 46, 90, 9, 0, TAU); g.fill(); g.strokeStyle = '#2a2c30'; g.lineWidth = 2; g.beginPath(); g.moveTo(37 + i * 46, 90); g.lineTo(42 + i * 46, 85); g.stroke(); }
  } else {
    g.fillStyle = '#9ad0ea'; g.fillRect(10, 10, W - 20, 70);
    g.fillStyle = '#f6f6f2'; for (let x = 10; x < W; x += 60) g.fillRect(x, 10, 6, 70);
    g.fillStyle = '#5a646c'; g.fillRect(20, 100, W - 40, 40);
    for (let i = 0; i < 8; i++) { g.fillStyle = rng.pick(['#d23c3c', '#f2d23a', '#6fc4c0']); g.beginPath(); g.arc(34 + i * 26, 118, 5, 0, TAU); g.fill(); }
  }
  // a lamp's warm pool at the top
  const lg = g.createRadialGradient(W / 2, 0, 4, W / 2, 0, W * 0.6);
  lg.addColorStop(0, 'rgba(255,230,180,0.3)'); lg.addColorStop(1, 'rgba(255,230,180,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  return p.texture({ wrap: false });
}

/** Painted metal panels for vehicles (the UFO, funicular cars, the Mendl's van). One tile ~ 1 x 1 unit. */
export function paintedMetal(color: number, seed = 31) {
  const p = new Painter(128, 128, seed).fill(css(color));
  p.dabs({ n: 24, colors: [css(color, 1.05), css(color, 0.94)], r: [6, 22], alpha: [0.1, 0.2], squash: 0.5 });
  p.g.fillStyle = css(color, 0.72); p.g.fillRect(0, 0, 128, 2); p.g.fillRect(0, 0, 2, 128);
  p.g.fillStyle = css(color, 1.15); p.g.fillRect(2, 2, 126, 1);
  return p.texture({ repeat: [1, 1] });
}

/** Roadrunner feathers: brown and cream streaks with dark barring, for a sphere or capsule. */
export function roadrunnerFeathers() {
  const p = new Painter(256, 128, 33).fill('#9a7a5a');
  p.fur({ n: 500, colors: ['#6a4a32', '#c8b090', '#e8dcc4', '#4a3424'], len: [6, 14], width: [2, 4], alpha: [0.45, 0.8], angle: () => Math.PI * 0.55 });
  p.vgrad([[0, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [0.8, 'rgba(240,230,210,0.8)'], [1, 'rgba(240,230,210,0.9)']]);
  return p.texture();
}

/** A leg for a capsule: shorts at the top, bare skin (or fur), then knee socks. Canvas top is the hip. */
export function legTexture(o: { shorts: number; skin: number; socks?: number }) {
  const p = new Painter(128, 128, 35).fill(css(o.skin));
  const g = p.g;
  g.fillStyle = css(o.shorts); g.fillRect(0, 0, 128, 52);
  g.fillStyle = css(o.shorts, 0.8); g.fillRect(0, 48, 128, 4);
  if (o.socks !== undefined) { g.fillStyle = css(o.socks); g.fillRect(0, 84, 128, 44); g.fillStyle = css(o.socks, 0.85); for (let x = 0; x < 128; x += 6) g.fillRect(x, 84, 2, 10); }
  return p.texture();
}
