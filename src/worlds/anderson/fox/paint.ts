import * as THREE from 'three';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU, clamp, smoothstep } from '../../../engine/math';
import { css } from '../textures';
import { FUTURA } from '../film';

/*
 * Painted fur and cloth for the stop-motion puppets of Fantastic Mr. Fox.
 *
 * Heads are painted "by direction": every texel of a sphere's UV layout is turned back into the direction
 * it stands for, and a colour function decides the markings there (cream cheeks, a black nose, a badger's
 * stripes). Then a few thousand short strokes of fur are brushed over it, each in the colour under it and
 * flowing back from the nose, so the markings get the soft furry edges of a real puppet's coat.
 *
 * Cloth textures are for lathe-turned torsos (the front of the body is the middle of the canvas, the top of
 * the canvas is the shoulders) and for limbs (the top of the canvas is the shoulder or hip).
 */

/** The unit direction a texel of a sphere's UV layout stands for (front +z is a quarter of the way across). */
export function texelDir(px: number, py: number, W: number, H: number, out: THREE.Vector3) {
  const u = (px + 0.5) / W, th = Math.PI * (py + 0.5) / H;
  return out.set(-Math.cos(TAU * u) * Math.sin(th), Math.cos(th), Math.sin(TAU * u) * Math.sin(th));
}

/** A colour in sRGB, 0..1 per channel (markings are mixed the way a painter mixes, in sRGB). */
export interface RGB { r: number; g: number; b: number }
export const rgb = (hex: number): RGB => ({ r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 });
const put = (o: RGB, c: RGB) => { o.r = c.r; o.g = c.g; o.b = c.b; return o; };
const mixTo = (o: RGB, c: RGB, t: number) => { if (t <= 0) return o; if (t > 1) t = 1; o.r += (c.r - o.r) * t; o.g += (c.g - o.g) * t; o.b += (c.b - o.b) * t; return o; };
const scale = (o: RGB, k: number) => { o.r *= k; o.g *= k; o.b *= k; return o; };

export type ColorFn = (d: THREE.Vector3, out: RGB) => void;

/**
 * A sphere-UV fur texture: markings from `color(dir)` (evaluated at half resolution and smoothed up, which
 * also softens their edges), brushed over with fur that flows back from the front and down the cheeks.
 */
export function furByDirection(color: ColorFn, o: { seed: number; W?: number; H?: number; strokes?: number; len?: [number, number]; contrast?: number; flowBack?: number }) {
  const W = o.W ?? 512, H = o.H ?? 256;
  const p = new Painter(W, H, o.seed);
  const g = p.g, rng = p.rng;
  const w2 = W >> 1, h2 = H >> 1;
  const small = document.createElement('canvas'); small.width = w2; small.height = h2;
  const sg = small.getContext('2d')!;
  const img = sg.createImageData(w2, h2);
  const d = new THREE.Vector3(), c: RGB = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    color(texelDir(x, y, w2, h2, d), c);
    const i = (y * w2 + x) * 4;
    img.data[i] = clamp(c.r * 255, 0, 255); img.data[i + 1] = clamp(c.g * 255, 0, 255); img.data[i + 2] = clamp(c.b * 255, 0, 255); img.data[i + 3] = 255;
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(small, 0, 0, W, H);
  // brushed fur: each stroke takes the colour at its root, a little lighter or darker
  const n = o.strokes ?? 1500, k = o.contrast ?? 0.12;
  const [l0, l1] = o.len ?? [5, 13];
  const f = W / 512;
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, W), y = rng.range(H * 0.02, H * 0.98);
    texelDir(x, y, W, H, d);
    color(d, c);
    const shade = 1 + rng.range(-k, k);
    const u = x / W;
    // back from the face: rightwards on the +x side of the front, leftwards on the other side; down on the lower half
    const back = (u > 0.25 && u < 0.75) ? 1 : -1;
    const down = 0.35 + 0.65 * smoothstep(0.2, -0.6, d.y);
    const a = Math.atan2(down, back * (o.flowBack ?? 1)) + rng.range(-0.35, 0.35);
    const len = rng.range(l0, l1) * f, wd = rng.range(1.6, 3.4) * f;
    g.globalAlpha = rng.range(0.35, 0.7);
    g.fillStyle = `rgb(${clamp(c.r * 255 * shade, 0, 255) | 0},${clamp(c.g * 255 * shade, 0, 255) | 0},${clamp(c.b * 255 * shade, 0, 255) | 0})`;
    // strokes are stretched sideways near the poles, where the UV layout squeezes the surface
    const sx = 1 / Math.max(0.25, Math.sin(Math.PI * y / H));
    const ex = Math.cos(a) * len * sx, ey = Math.sin(a) * len;
    const nx = -Math.sin(a) * wd * 0.5, ny = Math.cos(a) * wd * 0.5;
    for (const dx of [0, W, -W]) {
      const x0 = x + dx;
      if (x0 < -40 || x0 > W + 40) continue;
      g.beginPath();
      g.moveTo(x0 + nx, y + ny);
      g.quadraticCurveTo(x0 + ex * 0.5 + nx * 0.6, y + ey * 0.5 + ny * 0.6, x0 + ex, y + ey);
      g.quadraticCurveTo(x0 + ex * 0.5 - nx * 0.6, y + ey * 0.5 - ny * 0.6, x0 - nx, y - ny);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  return p.texture();
}

/** Angle between two unit vectors. */
const ang = (a: THREE.Vector3, b: THREE.Vector3) => Math.acos(clamp(a.dot(b), -1, 1));

/** The axis of a snout: forward and a little down. */
export const SNOUT = new THREE.Vector3(0, -0.3, 1).normalize();
/** Eye directions on the head sphere. */
export const eyeDir = (s: number, spread = 0.42, up = 0.2) => new THREE.Vector3(s * spread, up, 0.88).normalize();

/** A fox's markings: orange coat, cream cheeks, lower muzzle and throat, a black nose, dark brows. */
export function foxColors(o: { base: number; cream: number; dark: number; spread?: number }): ColorFn {
  const eyes = [eyeDir(-1, o.spread), eyeDir(1, o.spread)];
  const base = rgb(o.base), cream = rgb(o.cream), dark = rgb(o.dark), nose = rgb(0x1a1210);
  return (d, out) => {
    const c = d.dot(SNOUT);
    // the crown and the back of the head a shade deeper
    scale(put(out, base), 0.88 + 0.14 * smoothstep(-0.4, 0.7, d.z));
    const muzzle = smoothstep(0.62, 0.8, c) * smoothstep(0.02, -0.05, d.y - SNOUT.y * c + 0.02);
    const cheek = smoothstep(0.0, 0.35, d.z) * smoothstep(0.22, 0.55, Math.abs(d.x)) * smoothstep(0.06, -0.08, d.y);
    const throat = smoothstep(-0.3, -0.62, d.y) * smoothstep(-0.7, 0.1, d.z);
    mixTo(out, cream, Math.max(muzzle, cheek, throat));
    // dark brows over the eyes and a ring round each eye
    for (const e of eyes) {
      const a = ang(d, e);
      mixTo(out, dark, smoothstep(0.26, 0.16, a) * smoothstep(-0.02, 0.06, d.y - e.y) * 0.55);
      mixTo(out, dark, smoothstep(0.2, 0.12, a) * 0.6);
    }
    mixTo(out, nose, smoothstep(0.965, 0.985, c));
  };
}

/** Kylie the opossum: a white face, pale grey crown and back of the head, a pink nose. */
export function possumColors(): ColorFn {
  const white = rgb(0xf4f0ea), grey = rgb(0xb8b4b2), ring = rgb(0x8a8486), nose = rgb(0xe8a0a8);
  const eyes = [eyeDir(-1, 0.4, 0.22), eyeDir(1, 0.4, 0.22)];
  return (d, out) => {
    const c = d.dot(SNOUT);
    put(out, white);
    mixTo(out, grey, smoothstep(0.1, -0.5, d.z) * 0.8 + smoothstep(0.45, 0.85, d.y) * 0.3);
    for (const e of eyes) mixTo(out, ring, smoothstep(0.2, 0.12, ang(d, e)) * 0.5);
    mixTo(out, nose, smoothstep(0.955, 0.98, c));
  };
}

/** Badger: a white blaze down the middle, black bands over the eyes back to the ears, a grey back of the head. */
export function badgerColors(): ColorFn {
  const grey = rgb(0x9a9894), white = rgb(0xf2eee6), black = rgb(0x1c1a1c), nose = rgb(0x141214);
  return (d, out) => {
    const c = d.dot(SNOUT);
    put(out, grey);
    const front = smoothstep(-0.1, 0.25, d.z);
    mixTo(out, white, front);
    const band = smoothstep(0.1, 0.18, Math.abs(d.x)) * smoothstep(0.62, 0.5, Math.abs(d.x)) * smoothstep(-0.32, -0.18, d.y) * smoothstep(-0.35, 0.05, d.z);
    mixTo(out, black, band);
    mixTo(out, white, smoothstep(-0.25, -0.45, d.y) * front);
    mixTo(out, nose, smoothstep(0.965, 0.985, c));
  };
}

/** The Rat: dark grey-brown, a paler muzzle, a pink nose. */
export function ratColors(): ColorFn {
  const base = rgb(0x4a423e), muzzle = rgb(0x8a7a72), under = rgb(0x6a5e58), nose = rgb(0xe090a0);
  return (d, out) => {
    const c = d.dot(SNOUT);
    put(out, base);
    mixTo(out, muzzle, smoothstep(0.7, 0.9, c) * 0.7);
    mixTo(out, under, smoothstep(-0.2, -0.6, d.y) * 0.6);
    mixTo(out, nose, smoothstep(0.965, 0.985, c));
  };
}

/** Rabbit: soft grey-brown with a white muzzle, chin and chest, a pink nose. */
export function rabbitColors(): ColorFn {
  const base = rgb(0xb8a48e), white = rgb(0xf6f0e6), nose = rgb(0xe89aa4);
  return (d, out) => {
    const c = d.dot(SNOUT);
    put(out, base);
    mixTo(out, white, Math.max(smoothstep(0.6, 0.78, c), smoothstep(-0.2, -0.5, d.y)));
    mixTo(out, nose, smoothstep(0.96, 0.985, c));
  };
}

/** Mole: dark velvet with a pink nose. */
export function moleColors(): ColorFn {
  const base = rgb(0x2e2824), top = rgb(0x4a403a), nose = rgb(0xe8a0a8);
  return (d, out) => {
    const c = d.dot(SNOUT);
    put(out, base);
    mixTo(out, top, smoothstep(0.2, 0.9, d.y) * 0.4);
    mixTo(out, nose, smoothstep(0.93, 0.97, c));
  };
}

/** The black wolf: near-black with grey frosting, paler under the jaw. */
export function wolfColors(): ColorFn {
  const base = rgb(0x1e1c20), frost = rgb(0x3a383e), nose = rgb(0x0a0a0c);
  return (d, out) => {
    const c = d.dot(SNOUT);
    put(out, base);
    mixTo(out, frost, smoothstep(-0.1, -0.6, d.y) * 0.6 + smoothstep(0.5, 0.9, d.y) * 0.2);
    mixTo(out, nose, smoothstep(0.965, 0.985, c));
  };
}

/** Plain brushed fur on a cylinder or sculpted limb, with an optional pale tip at the top (v 0) or bottom. */
export function plainFur(color: number, seed: number, o: { tip?: number; tipAt?: 'top' | 'bottom'; tipLen?: number; W?: number; H?: number; dark?: number } = {}) {
  const W = o.W ?? 256, H = o.H ?? 128;
  const p = new Painter(W, H, seed).fill(css(color));
  if (o.dark !== undefined) p.vgrad([[0, css(o.dark)], [0.5, css(color)], [1, css(color)]]);
  if (o.tip !== undefined) {
    const k = o.tipLen ?? 0.22;
    const gr = p.g.createLinearGradient(0, o.tipAt === 'bottom' ? H * (1 - k - 0.08) : H * (k + 0.08), 0, o.tipAt === 'bottom' ? H * (1 - k) : H * k);
    gr.addColorStop(0, css(color)); gr.addColorStop(1, css(o.tip));
    p.g.fillStyle = gr;
    if (o.tipAt === 'bottom') p.g.fillRect(0, H * (1 - k - 0.08), W, H * (k + 0.08)); else p.g.fillRect(0, 0, W, H * (k + 0.08));
  }
  p.fur({ n: Math.round(W * H / 40), colors: [css(color, 0.82), css(color, 1.14), ...(o.tip !== undefined ? [css(o.tip, 0.95)] : [])], len: [5, 12], width: [1.6, 3.2], alpha: [0.3, 0.55], angle: () => Math.PI / 2 });
  if (o.tip !== undefined) p.fur({ n: Math.round(W * H / 160), colors: [css(o.tip, 0.94), css(o.tip, 1.04)], len: [5, 11], width: [1.6, 3], alpha: [0.4, 0.6], angle: () => Math.PI / 2, y: o.tipAt === 'bottom' ? [1 - (o.tipLen ?? 0.22), 1] : [0, o.tipLen ?? 0.22] });
  return p.texture();
}

/** Corduroy: fine raised ribs running down the cloth. */
function ribs(p: Painter, color: number, pitch = 5) {
  const g = p.g;
  for (let x = 0; x < p.w; x += pitch) {
    g.fillStyle = css(color, 0.82); g.fillRect(x, 0, 1.4, p.h);
    g.fillStyle = css(color, 1.1); g.fillRect(x + 2, 0, 1, p.h);
  }
  p.dabs({ n: 40, colors: [css(color, 1.06), css(color, 0.92)], r: [10, 30], alpha: [0.05, 0.12], squash: 1.8 });
}

export interface JacketOpts {
  cloth: number;
  /** corduroy ribs */
  cord?: boolean;
  shirt?: number;
  tie?: number;
  tieDots?: number;
  lapel?: boolean;
  buttons?: number;
  /** a belt round the waist (a karate gi's belt) */
  belt?: number;
  /** wrap-over front (a karate gi) instead of lapels */
  wrap?: boolean;
  /** a sweater: ribbed hem and neck, no lapels */
  sweater?: boolean;
  /** a turtleneck collar band at the top */
  turtle?: boolean;
  pocketSquare?: number;
  seed: number;
}

/**
 * A jacket or top for a lathe torso: 512 x 256, the front in the middle, the shoulders at the top. Lapels
 * open over a shirt and tie, buttons, pocket flaps, side seams.
 */
export function jacketTexture(o: JacketOpts) {
  const W = 512, H = 256, cx = W / 2;
  const p = new Painter(W, H, o.seed).fill(css(o.cloth));
  const g = p.g;
  if (o.cord) ribs(p, o.cloth); else {
    p.lines({ n: 90, colors: [css(o.cloth, 1.12), css(o.cloth, 0.86)], alpha: [0.08, 0.18], width: [1, 2], vertical: true, wobble: 1 });
    p.dabs({ n: 40, colors: [css(o.cloth, 1.06), css(o.cloth, 0.92)], r: [10, 34], alpha: [0.06, 0.14], squash: 1.6 });
  }
  // side and back seams, a darker shade under the arms
  g.fillStyle = css(o.cloth, 0.7);
  for (const x of [W * 0.25, W * 0.75, 1, W - 1]) g.fillRect(x - 1, 0, 2, H);
  p.hgrad([[0, 'rgba(0,0,0,0.12)'], [0.25, 'rgba(0,0,0,0)'], [0.75, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.12)']]);
  if (o.sweater) {
    g.fillStyle = css(o.cloth, 0.8);
    for (let x = 0; x < W; x += 6) { g.fillRect(x, H - 26, 3, 26); g.fillRect(x, 0, 3, o.turtle ? 34 : 18); }
    if (!o.turtle && o.shirt !== undefined) {
      g.fillStyle = css(o.shirt); g.beginPath(); g.moveTo(cx - 34, 0); g.lineTo(cx, 34); g.lineTo(cx + 34, 0); g.fill();
    }
  } else if (o.wrap) {
    // a karate gi: the left side folds over the right in a deep V, a dark belt with its knot
    g.fillStyle = css(o.cloth, 0.86); g.beginPath(); g.moveTo(cx - 70, 0); g.lineTo(cx + 26, H * 0.62); g.lineTo(cx + 34, H * 0.62); g.lineTo(cx - 52, 0); g.fill();
    g.strokeStyle = css(o.cloth, 0.7); g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 60, 0); g.lineTo(cx + 30, H * 0.62); g.stroke();
    if (o.shirt !== undefined) { g.fillStyle = css(o.shirt); g.beginPath(); g.moveTo(cx - 40, 0); g.lineTo(cx - 6, 46); g.lineTo(cx + 30, 0); g.fill(); }
  } else {
    // shirt and tie in the V of the lapels
    const vy = H * 0.56;
    if (o.shirt !== undefined) {
      g.fillStyle = css(o.shirt); g.beginPath(); g.moveTo(cx - 52, 0); g.lineTo(cx, vy); g.lineTo(cx + 52, 0); g.fill();
      g.fillStyle = css(o.shirt, 0.86); g.beginPath(); g.moveTo(cx - 30, 0); g.lineTo(cx - 6, 30); g.lineTo(cx - 34, 26); g.fill(); g.beginPath(); g.moveTo(cx + 30, 0); g.lineTo(cx + 6, 30); g.lineTo(cx + 34, 26); g.fill();
    }
    if (o.tie !== undefined) {
      g.fillStyle = css(o.tie); g.beginPath(); g.moveTo(cx - 8, 10); g.lineTo(cx + 8, 10); g.lineTo(cx + 13, vy - 6); g.lineTo(cx, vy + 6); g.lineTo(cx - 13, vy - 6); g.fill();
      g.fillStyle = css(o.tie, 0.8); g.fillRect(cx - 8, 4, 16, 14);
      if (o.tieDots !== undefined) { g.fillStyle = css(o.tieDots); for (let y = 26; y < vy - 6; y += 12) for (const dx of [-5, 4]) { g.beginPath(); g.arc(cx + dx + ((y / 12) % 2) * 2, y, 2, 0, TAU); g.fill(); } }
    }
    if (o.lapel !== false) {
      // wide lapels with a notch, edged with stitching
      for (const s of [-1, 1]) {
        g.fillStyle = css(o.cloth, 1.07);
        g.beginPath(); g.moveTo(cx + s * 52, 0); g.lineTo(cx + s * 90, 0); g.lineTo(cx + s * 72, 40); g.lineTo(cx + s * 86, 52); g.lineTo(cx + s * 8, vy + 4); g.lineTo(cx + s * 2, vy); g.closePath(); g.fill();
        g.strokeStyle = css(o.cloth, 0.68); g.lineWidth = 2.2; g.stroke();
        g.strokeStyle = css(o.cloth, 0.6); g.setLineDash([3, 3]); g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx + s * 84, 56); g.lineTo(cx + s * 12, vy); g.stroke(); g.setLineDash([]);
      }
    }
    // the front edges down from the V
    g.strokeStyle = css(o.cloth, 0.65); g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 4, vy); g.lineTo(cx + 10, H); g.stroke();
    if (o.buttons !== undefined) for (let i = 0; i < 2; i++) { const y = vy + 18 + i * 34; g.fillStyle = css(o.buttons); g.beginPath(); g.arc(cx - 12, y, 6, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(cx - 14, y - 2, 2, 0, TAU); g.fill(); }
    // pocket flaps and a breast pocket
    g.fillStyle = css(o.cloth, 0.78);
    for (const s of [-1, 1]) g.fillRect(cx + s * 80 - 30, H * 0.8, 60, 6);
    g.fillRect(cx + 60, H * 0.36, 40, 4);
    if (o.pocketSquare !== undefined) { g.fillStyle = css(o.pocketSquare); g.beginPath(); g.moveTo(cx + 64, H * 0.36); g.lineTo(cx + 72, H * 0.3); g.lineTo(cx + 80, H * 0.34); g.lineTo(cx + 88, H * 0.29); g.lineTo(cx + 94, H * 0.36); g.fill(); }
  }
  if (o.belt !== undefined) {
    g.fillStyle = css(o.belt); g.fillRect(0, H * 0.84, W, 16);
    g.beginPath(); g.moveTo(cx - 6, H * 0.88); g.lineTo(cx - 22, H); g.lineTo(cx - 12, H); g.lineTo(cx, H * 0.9); g.lineTo(cx + 14, H); g.lineTo(cx + 24, H); g.lineTo(cx + 8, H * 0.88); g.fill();
  }
  // a little shading towards the hem
  p.vgrad([[0, 'rgba(255,240,220,0.06)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(40,20,10,0.16)']]);
  return p.texture();
}

/** A sleeve or a trouser leg: the cloth, with a cuff at the bottom (a shirt cuff for sleeves). */
export function limbCloth(color: number, o: { cord?: boolean; cuff?: number; seed: number; stripes?: number }) {
  const p = new Painter(256, 128, o.seed).fill(css(color));
  if (o.cord) ribs(p, color, 6);
  else p.lines({ n: 50, colors: [css(color, 1.1), css(color, 0.88)], alpha: [0.08, 0.16], width: [1, 2], vertical: true, wobble: 1 });
  if (o.stripes !== undefined) for (let y = 4; y < 128; y += 16) { p.g.fillStyle = css(o.stripes); p.g.fillRect(0, y, 256, 6); }
  p.g.fillStyle = css(color, 0.72); p.g.fillRect(0, 0, 2, 128);
  if (o.cuff !== undefined) { p.g.fillStyle = css(o.cuff); p.g.fillRect(0, 116, 256, 12); p.g.fillStyle = 'rgba(0,0,0,0.15)'; p.g.fillRect(0, 114, 256, 2); }
  p.vgrad([[0, 'rgba(0,0,0,0.1)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.08)']]);
  return p.texture();
}

/** A skirt or dress hanging from the waist: soft folds, a hem, an optional apron panel in front. */
export function skirtTexture(color: number, o: { seed: number; apron?: number; splashes?: boolean; pattern?: number }) {
  const W = 512, H = 256;
  const p = new Painter(W, H, o.seed).fill(css(color));
  const g = p.g;
  if (o.pattern !== undefined) for (let y = 10; y < H; y += 22) for (let x = (y / 22) % 2 ? 11 : 0; x < W; x += 22) { g.fillStyle = css(o.pattern); g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); }
  for (let i = 0; i < 18; i++) {
    const x = (i + 0.5) / 18 * W;
    const gr = g.createLinearGradient(x - 14, 0, x + 14, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - 14, 0, 28, H);
  }
  g.fillStyle = css(color, 0.75); g.fillRect(0, H - 14, W, 14);
  if (o.apron !== undefined) {
    g.fillStyle = css(o.apron); g.fillRect(W / 2 - 80, 0, 160, H - 26);
    g.strokeStyle = css(o.apron, 0.75); g.lineWidth = 2; g.strokeRect(W / 2 - 80, 0, 160, H - 26);
    g.fillStyle = css(o.apron, 0.88); g.fillRect(W / 2 - 50, H * 0.4, 100, 40);
    if (o.splashes) {
      const rng = new Rng(o.seed + 5);
      for (let i = 0; i < 26; i++) { g.fillStyle = rng.pick(['#d84a2a', '#2a6ab8', '#e8c04a', '#3a8a5a', '#8a3ab0']); g.globalAlpha = 0.8; g.beginPath(); g.ellipse(W / 2 + rng.range(-70, 70), rng.range(10, H - 40), rng.range(2, 6), rng.range(2, 5), rng.range(0, 3), 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    }
  }
  return p.texture();
}

/** A cape: plain cloth with a turned hem and soft folds. */
export function capeTexture(color: number, seed: number, trim?: number) {
  const p = new Painter(256, 256, seed).fill(css(color));
  for (let i = 0; i < 9; i++) {
    const x = (i + 0.5) / 9 * 256;
    const gr = p.g.createLinearGradient(x - 12, 0, x + 12, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(60,40,30,0.13)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    p.g.fillStyle = gr; p.g.fillRect(x - 12, 0, 24, 256);
  }
  if (trim !== undefined) { p.g.fillStyle = css(trim); p.g.fillRect(0, 238, 256, 18); }
  return p.texture();
}

/** A bandit hat: a black tube sock pulled over the head with two eye holes (worn over the ears). */
export function sockTexture() {
  const p = new Painter(256, 128, 77).fill('#1c1a1c');
  p.lines({ n: 80, colors: ['#2e2a2e', '#121012'], alpha: [0.3, 0.6], width: [1, 2], vertical: true, wobble: 0.5 });
  return p.texture();
}

/** A newspaper page: FOX ABOUT TOWN, columns of print and a photograph. */
export function newspaper(seed = 3) {
  const W = 256, H = 320;
  const p = new Painter(W, H, seed).fill('#efe6d2');
  const g = p.g, rng = p.rng;
  g.fillStyle = '#2a2420'; g.textAlign = 'center';
  g.font = `bold 13px Georgia, serif`; g.fillText('THE DAILY GAZETTE', W / 2, 20);
  g.fillRect(12, 26, W - 24, 2);
  g.font = `bold 30px ${FUTURA}`; g.fillText('FOX ABOUT', W / 2, 60); g.fillText('TOWN', W / 2, 92);
  g.fillRect(12, 100, W - 24, 1);
  g.fillStyle = '#8a7a64'; g.fillRect(16, 108, 100, 80);
  g.fillStyle = '#c87a3a'; g.beginPath(); g.arc(66, 140, 22, 0, TAU); g.fill();
  g.fillStyle = '#2a2420';
  for (let col = 0; col < 2; col++) for (let y = 110 + (col === 0 ? 86 : 0); y < H - 12; y += 7) g.fillRect(16 + col * 116 + (col ? 6 : 0), y, rng.range(80, 104), 2.6);
  return p.texture({ wrap: false });
}
