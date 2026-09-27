import * as THREE from 'three';
import { Painter } from '../../engine/Paint';

/**
 * Painted canvas textures for the Ghibli characters. Each function returns textures laid out for the
 * three.js primitive it is applied to (see the UV notes at the top of engine/Paint.ts).
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

/** Fur for a round body painted onto a sphere: lighter on top, darker underneath, brushed downwards. */
export function sphereFur(color: THREE.ColorRepresentation, seed: number, o: { w?: number; strokes?: number; contrast?: number; warm?: THREE.ColorRepresentation } = {}) {
  const W = o.w ?? 512, H = W / 2;
  const k = o.contrast ?? 1;
  const p = new Painter(W, H, seed).fill(css(color));
  p.vgrad([[0, css(color, 1 + 0.1 * k, o.warm ?? 0xfff2dc, 0.1)], [0.45, css(color)], [1, css(color, 1 - 0.22 * k, 0x303a5a, 0.08)]]);
  p.dabs({ n: 60, colors: [css(color, 1 + 0.06 * k), css(color, 1 - 0.07 * k)], r: [W * 0.02, W * 0.07], alpha: [0.08, 0.18], squash: 0.6 });
  const n = o.strokes ?? Math.round(W * 2.2);
  // soft tufts that point down the body and fan out slightly towards the sides
  const angle = (u: number) => Math.PI / 2 + Math.sin(u * Math.PI * 2) * 0.25;
  p.fur({ n, colors: [css(color, 1 - 0.09 * k), css(color, 1 - 0.06 * k)], len: [W * 0.018, W * 0.04], width: [W * 0.006, W * 0.012], alpha: [0.25, 0.5], angle });
  p.fur({ n: Math.round(n * 0.6), colors: [css(color, 1 + 0.07 * k), css(color, 1 + 0.1 * k, 0xffffff, 0.08)], len: [W * 0.014, W * 0.03], width: [W * 0.004, W * 0.009], alpha: [0.25, 0.5], angle, y: [0, 0.7] });
  return p;
}

/** Totoro's fur (body, head, arms, feet, ears). `eyes` paints dark rims where the eye balls sit on the head. */
export function totoroFur(color: number, seed: number, eyes?: Array<[number, number, number]>, w = 1024) {
  const p = sphereFur(color, seed, { w, contrast: 1 });
  const k = w / 1024;
  if (eyes) for (const dir of eyes) {
    p.at(dir, (g) => {
      g.fillStyle = css(color, 0.45, 0x1a1c28, 0.5);
      g.globalAlpha = 0.9;
      g.beginPath(); g.ellipse(0, 0, 40 * k, 36 * k, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    });
  }
  return p.texture();
}

/** Totoro's cream belly with the grey chevron marks across the top. Painted for an ellipsoid facing +z. */
export function totoroBelly(cream: number, fur: number, chevrons: boolean, seed: number, w = 1024) {
  const p = sphereFur(cream, seed, { w, contrast: 0.7 });
  if (chevrons) {
    // three across the top, four in the row below, following the curve of the belly
    const rows: Array<{ y: number; xs: number[] }> = [{ y: 0.66, xs: [-0.3, 0, 0.3] }, { y: 0.4, xs: [-0.5, -0.17, 0.17, 0.5] }];
    for (const row of rows) for (const x of row.xs) {
      const y = row.y - Math.abs(x) * 0.12;
      const z = Math.sqrt(Math.max(0.05, 1 - x * x - y * y));
      p.at([x, y, z], (g) => {
        g.rotate(x * 0.4);
        g.scale(1.1 * w / 1024, 1.2 * w / 1024);
        // a thick arrowhead pointing up, with slightly curved legs
        g.fillStyle = css(fur, 0.8);
        g.beginPath();
        g.moveTo(0, -15);
        g.quadraticCurveTo(12, -4, 23, 11);
        g.lineTo(13, 12);
        g.quadraticCurveTo(6, 3, 0, -1);
        g.quadraticCurveTo(-6, 3, -13, 12);
        g.lineTo(-23, 11);
        g.quadraticCurveTo(-12, -4, 0, -15);
        g.fill();
      });
    }
    // brush a few cream hairs back across the marks so they sit in the fur
    const k = w / 1024;
    p.fur({ n: 500, colors: [css(cream, 1.02), css(cream, 0.95)], len: [10 * k, 20 * k], width: [3 * k, 6 * k], alpha: [0.2, 0.4], y: [0.15, 0.42], x: [0.1, 0.4] });
  }
  return p.texture();
}

/** Black umbrella cloth for a cone: eight panels with ribs, a soft sheen near the top. */
export function umbrellaCloth(color: number) {
  const p = new Painter(512, 128, 3).fill(css(color));
  p.vgrad([[0, css(color, 1.5)], [0.5, css(color, 1.05)], [1, css(color, 0.8)]]);
  const g = p.g;
  for (let i = 0; i < 8; i++) {
    const x = (i / 8) * 512;
    // each panel bellies out a little between the ribs
    const gr = g.createLinearGradient(x, 0, x + 64, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = gr; g.fillRect(x, 0, 64, 128);
    g.fillStyle = css(color, 0.55); g.fillRect(x - 1.5, 0, 3, 128);
  }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 118, 512, 10);
  return p.texture();
}

/** Burlap sack. */
export function burlap(color: number, seed: number) {
  const p = new Painter(256, 128, seed).fill(css(color));
  p.lines({ n: 90, colors: [css(color, 0.82), css(color, 1.1)], alpha: [0.25, 0.5], width: [1, 2], wobble: 1 });
  p.lines({ n: 110, colors: [css(color, 0.82), css(color, 1.1)], alpha: [0.25, 0.5], width: [1, 2], vertical: true, wobble: 1 });
  p.vgrad([[0, 'rgba(60,40,20,0.45)'], [0.25, 'rgba(60,40,20,0)'], [0.8, 'rgba(60,40,20,0)'], [1, 'rgba(60,40,20,0.35)']]);
  return p.texture();
}

/** A single leaf with a midrib and veins on a transparent canvas; the leaf's tip points to the top. */
export function leafTexture(color: number) {
  const p = new Painter(128, 128, 5);
  const g = p.g;
  g.fillStyle = css(color);
  g.beginPath(); g.moveTo(64, 4); g.quadraticCurveTo(120, 50, 64, 124); g.quadraticCurveTo(8, 50, 64, 4); g.fill();
  const gr = g.createLinearGradient(20, 0, 108, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = css(color, 1.35); g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(64, 10); g.lineTo(64, 122); g.stroke();
  g.lineWidth = 1.4;
  for (let i = 0; i < 6; i++) {
    const y = 30 + i * 14;
    g.beginPath(); g.moveTo(64, y + 8); g.quadraticCurveTo(80, y, 92 - i * 2, y - 8); g.stroke();
    g.beginPath(); g.moveTo(64, y + 8); g.quadraticCurveTo(48, y, 36 + i * 2, y - 8); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  return p.texture({ wrap: false });
}

// ---------------- Catbus ----------------
const CATBUS_ORANGE = 0xdc8e3e, CATBUS_STRIPE = 0x7a4420, CATBUS_CREAM = 0xf0d7a8;

/** Where a point on the Catbus body capsule lands on its canvas. `z` is along the body (+z = head end),
 * `side` is -1 (left) or 1 (right), `up` is the angle above the side in radians. */
export function catbusBodyUV(z: number, side: number, up: number, r = 1.35, len = 6) {
  const total = Math.PI * r + len;
  const v = (Math.PI / 2 * r + (z + len / 2)) / total;
  // left side is u = 1 (or 0), right side is u = 0.5, the back is u = 0.75
  const u = side < 0 ? 1 - up / (Math.PI * 2) : 0.5 + up / (Math.PI * 2);
  return [u, 1 - v] as [number, number];
}

/** Catbus body: tabby stripes over the back, a cream belly, and window openings. Returns map and glow map. */
export function catbusBody(windows: Array<{ z: number; side: number; up: number }>) {
  const W = 1024, H = 1024;
  const col = new Painter(W, H, 71);
  // the glow map only holds the window shapes, so a quarter of the resolution is plenty
  const glow = new Painter(W / 4, H / 4, 72).fill('#000');
  glow.g.scale(0.25, 0.25);
  // around the body: x = 0 left side, W/4 belly, W/2 right side, 3W/4 back
  col.hgrad([[0, css(CATBUS_ORANGE)], [0.17, css(CATBUS_ORANGE, 1.02, CATBUS_CREAM, 0.6)], [0.25, css(CATBUS_CREAM)], [0.33, css(CATBUS_ORANGE, 1.02, CATBUS_CREAM, 0.6)], [0.5, css(CATBUS_ORANGE)], [0.75, css(CATBUS_ORANGE, 0.9, CATBUS_STRIPE, 0.12)], [1, css(CATBUS_ORANGE)]]);
  col.dabs({ n: 90, colors: [css(CATBUS_ORANGE, 1.08), css(CATBUS_ORANGE, 0.92)], r: [20, 60], alpha: [0.1, 0.22], squash: 0.7 });
  const g = col.g, rng = col.rng;
  // tabby stripes: start on the spine and run down each side, wavy, tapering to a point
  const stripeRows = 11;
  for (let i = 0; i < stripeRows; i++) {
    const y = H * (0.2 + (i / (stripeRows - 1)) * 0.66) + rng.range(-10, 10);
    for (const dir of [-1, 1]) {
      const reach = rng.range(0.16, 0.24) * W;
      const x0 = 0.75 * W;
      g.fillStyle = css(CATBUS_STRIPE, rng.range(0.9, 1.1));
      g.globalAlpha = 0.9;
      g.beginPath();
      const th = rng.range(14, 22), wav = rng.range(6, 14), ph = rng.range(0, 6);
      g.moveTo(x0, y - th);
      for (let k = 1; k <= 10; k++) { const t = k / 10; g.lineTo(x0 + dir * reach * t, y - th * (1 - t * 0.9) + Math.sin(ph + t * 5) * wav); }
      for (let k = 10; k >= 0; k--) { const t = k / 10; g.lineTo(x0 + dir * reach * t, y + th * (1 - t * 0.9) + Math.sin(ph + t * 5) * wav); }
      g.fill();
      g.globalAlpha = 1;
    }
  }
  // fur over everything, brushed back towards the tail
  col.fur({ n: 7000, colors: [css(CATBUS_ORANGE, 0.9), css(CATBUS_ORANGE, 1.1), css(CATBUS_STRIPE, 1.1)], len: [8, 18], width: [2, 4], alpha: [0.15, 0.4], angle: () => Math.PI / 2 });
  // windows: warm openings with a furry dark rim; the same shapes light up in the glow map
  for (const w of windows) {
    const [u, v] = catbusBodyUV(w.z, w.side, w.up);
    const cx = u * W, cy = v * H, ww = 58, hh = 36;
    const rr = (gg: CanvasRenderingContext2D, x: number, y: number, a: number, b: number, rad: number) => { gg.beginPath(); gg.roundRect(x - a, y - b, a * 2, b * 2, rad); };
    g.fillStyle = css(CATBUS_STRIPE, 0.7); rr(g, cx, cy, ww + 9, hh + 9, 22); g.fill();
    g.fillStyle = '#ffd98e'; rr(g, cx, cy, ww, hh, 18); g.fill();
    // a seat back and a shadow at the top of the opening
    g.fillStyle = 'rgba(160,90,40,0.55)'; g.fillRect(cx - ww, cy + hh * 0.1, ww * 2, hh * 0.9);
    g.fillStyle = 'rgba(90,50,20,0.35)'; g.fillRect(cx - ww, cy - hh, ww * 2, hh * 0.35);
    col.fur({ n: 120, colors: [css(CATBUS_ORANGE, 0.85)], len: [8, 16], width: [3, 5], alpha: [0.5, 0.9], x: [(cx - ww - 10) / W, (cx + ww + 10) / W], y: [(cy - hh - 12) / H, (cy - hh + 2) / H], angle: () => Math.PI / 2 });
    glow.g.fillStyle = '#ffd08a'; rr(glow.g, cx, cy, ww, hh, 18); glow.g.fill();
    glow.g.fillStyle = 'rgba(0,0,0,0.45)'; glow.g.fillRect(cx - ww, cy + hh * 0.1, ww * 2, hh * 0.9);
  }
  return { map: col.texture(), glow: glow.texture() };
}

/** Catbus head (ellipsoid facing +z): forehead stripes, cream muzzle and the huge grin. */
export function catbusHead() {
  const p = sphereFur(CATBUS_ORANGE, 81, { w: 1024, contrast: 0.8 });
  const g = p.g;
  // cream lower face
  p.at([0, -0.45, 0.9], (c) => {
    const gr = c.createRadialGradient(0, 0, 10, 0, 0, 170);
    gr.addColorStop(0, css(CATBUS_CREAM)); gr.addColorStop(0.7, css(CATBUS_CREAM, 1, CATBUS_ORANGE, 0.3)); gr.addColorStop(1, 'rgba(240,215,168,0)');
    c.fillStyle = gr; c.beginPath(); c.ellipse(0, 0, 200, 120, 0, 0, Math.PI * 2); c.fill();
  });
  // forehead stripes
  for (let i = -2; i <= 2; i++) {
    p.at([i * 0.13, 0.62, 0.78], (c) => {
      c.fillStyle = css(CATBUS_STRIPE); c.globalAlpha = 0.9;
      c.beginPath(); c.moveTo(-9, -40); c.quadraticCurveTo(0, -46, 9, -40); c.lineTo(2, 22 - Math.abs(i) * 8); c.lineTo(-2, 22 - Math.abs(i) * 8); c.closePath(); c.fill();
      c.globalAlpha = 1;
    });
  }
  // cheek stripes
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    p.at([s * 0.92, 0.05 - i * 0.14, 0.38], (c) => {
      c.fillStyle = css(CATBUS_STRIPE); c.globalAlpha = 0.85;
      c.beginPath(); c.moveTo(s * 40, -8); c.quadraticCurveTo(0, -4, -s * 36, 0); c.quadraticCurveTo(0, 6, s * 40, 8); c.fill();
      c.globalAlpha = 1;
    });
  }
  // the grin: a wide crescent from cheek to cheek with rows of teeth
  p.at([0, -0.32, 0.95], (c) => {
    const wd = 190, top = -26, drop = 92;
    const upper = (t: number) => top + Math.sin(t * Math.PI) * 28;
    const lower = (t: number) => top + Math.sin(t * Math.PI) * drop;
    const path = () => {
      c.beginPath();
      for (let k = 0; k <= 24; k++) { const t = k / 24; const x = -wd + t * wd * 2; if (k === 0) c.moveTo(x, upper(t)); else c.lineTo(x, upper(t)); }
      for (let k = 24; k >= 0; k--) { const t = k / 24; c.lineTo(-wd + t * wd * 2, lower(t)); }
      c.closePath();
    };
    c.fillStyle = '#5a1a1e'; path(); c.fill();
    c.save(); path(); c.clip();
    c.fillStyle = '#c05a5e'; c.beginPath(); c.ellipse(0, top + drop * 0.85, wd * 0.6, 30, 0, 0, Math.PI * 2); c.fill();
    // upper and lower teeth
    c.fillStyle = '#fbf6ea';
    const n = 15;
    for (let k = 0; k < n; k++) {
      const t0 = (k + 0.1) / n, t1 = (k + 0.9) / n, tm = (k + 0.5) / n;
      const x0 = -wd + t0 * wd * 2, x1 = -wd + t1 * wd * 2, xm = -wd + tm * wd * 2;
      const tooth = 10 + Math.sin(tm * Math.PI) * 12;
      c.beginPath(); c.moveTo(x0, upper(t0) - 2); c.lineTo(x1, upper(t1) - 2); c.lineTo(xm, upper(tm) + tooth); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x0, lower(t0) + 2); c.lineTo(x1, lower(t1) + 2); c.lineTo(xm, lower(tm) - tooth * 0.8); c.closePath(); c.fill();
    }
    c.restore();
    c.strokeStyle = '#3a1a10'; c.lineWidth = 5; path(); c.stroke();
    // smile creases at the corners
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * (wd - 4), top); c.quadraticCurveTo(s * (wd + 18), top - 6, s * (wd + 22), top - 26); c.stroke(); }
  });
  // nose
  p.at([0, 0.02, 1], (c) => { c.fillStyle = '#6a3024'; c.beginPath(); c.moveTo(-22, -10); c.lineTo(22, -10); c.quadraticCurveTo(4, 16, 0, 16); c.quadraticCurveTo(-4, 16, -22, -10); c.fill(); });
  void g;
  return p.texture();
}

/** Glowing Catbus eye (ellipsoid facing +z): yellow with an orange edge and a slit pupil. */
export function catbusEye() {
  const p = new Painter(256, 128, 3).fill('#e9a53a');
  p.at([0, 0, 1], (c) => {
    const gr = c.createRadialGradient(0, 0, 4, 0, 0, 60);
    gr.addColorStop(0, '#fff7c0'); gr.addColorStop(0.6, '#ffe070'); gr.addColorStop(1, '#e9a53a');
    c.fillStyle = gr; c.beginPath(); c.ellipse(0, 0, 64, 60, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#1a1208'; c.beginPath(); c.ellipse(0, 0, 7, 30, 0, 0, Math.PI * 2); c.fill();
  });
  return p.texture();
}

/** Striped orange fur for Catbus legs and tail (bands across the length of a capsule). */
export function catbusBands(seed: number, bands = 4) {
  const p = new Painter(128, 256, seed).fill(css(CATBUS_ORANGE));
  for (let i = 0; i < bands; i++) {
    const y = (i + 0.5) / bands * 256;
    p.g.fillStyle = css(CATBUS_STRIPE); p.g.globalAlpha = 0.85;
    p.g.beginPath();
    for (let k = 0; k <= 16; k++) { const x = (k / 16) * 128; p.g.lineTo(x, y - 9 + Math.sin(k * 0.8 + i) * 3); }
    for (let k = 16; k >= 0; k--) { const x = (k / 16) * 128; p.g.lineTo(x, y + 9 + Math.sin(k * 0.8 + i + 1) * 3); }
    p.g.fill(); p.g.globalAlpha = 1;
  }
  p.fur({ n: 500, colors: [css(CATBUS_ORANGE, 0.9), css(CATBUS_ORANGE, 1.1)], len: [5, 10], width: [1.5, 3], alpha: [0.2, 0.45] });
  return p.texture();
}

/** The inside of a cat ear on a cone (front of the cone is u = 0). */
export function catbusEar() {
  const p = new Painter(256, 128, 4).fill(css(CATBUS_ORANGE));
  for (const x of [0, 256]) {
    const gr = p.g.createRadialGradient(x, 110, 4, x, 110, 60);
    gr.addColorStop(0, '#f2c0a0'); gr.addColorStop(0.7, '#e8b090'); gr.addColorStop(1, 'rgba(232,176,144,0)');
    p.g.fillStyle = gr; p.g.beginPath(); p.g.ellipse(x, 100, 48, 90, 0, 0, Math.PI * 2); p.g.fill();
  }
  p.fur({ n: 300, colors: [css(CATBUS_CREAM, 1.05), css(CATBUS_ORANGE, 0.9)], len: [8, 14], width: [1.5, 3], alpha: [0.3, 0.6], angle: () => -Math.PI / 2 });
  return p.texture();
}

// ---------------- No-Face ----------------
/** No-Face's mask on a transparent canvas (the oval outline is the alpha). */
export function noFaceMask() {
  const W = 256, H = 320;
  const p = new Painter(W, H, 91);
  const g = p.g;
  const oval = () => { g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.46, H * 0.485, 0, 0, Math.PI * 2); };
  // porcelain white with a cool grey falloff towards the edge
  const gr = g.createRadialGradient(W / 2, H * 0.44, 20, W / 2, H / 2, W * 0.6);
  gr.addColorStop(0, '#fbf9f3'); gr.addColorStop(0.7, '#eeebe3'); gr.addColorStop(1, '#bdbcc6');
  g.fillStyle = gr; oval(); g.fill();
  g.save(); oval(); g.clip();
  p.dabs({ n: 40, colors: ['#ffffff', '#e4e2dc'], r: [8, 26], alpha: [0.08, 0.2] });
  g.restore();
  for (const s of [-1, 1]) {
    const x = W / 2 + s * 50;
    // purple mark above the eye, pointing down at it
    g.fillStyle = '#7a5f8f';
    g.beginPath(); g.moveTo(x - 13, 62); g.quadraticCurveTo(x, 58, x + 13, 62); g.lineTo(x + 2, 118); g.lineTo(x - 2, 118); g.closePath(); g.fill();
    // the eye: a dark arched hole with a flat bottom
    g.fillStyle = '#16121c';
    g.beginPath(); g.moveTo(x - 20, 152); g.quadraticCurveTo(x - 18, 128, x, 126); g.quadraticCurveTo(x + 18, 128, x + 20, 152); g.quadraticCurveTo(x, 156, x - 20, 152); g.fill();
    // a longer purple mark below the eye, pointing up at it
    g.fillStyle = '#7a5f8f';
    g.beginPath(); g.moveTo(x - 2, 170); g.lineTo(x + 2, 170); g.lineTo(x + 12, 250); g.quadraticCurveTo(x, 256, x - 12, 250); g.closePath(); g.fill();
  }
  // small sad mouth
  g.strokeStyle = '#2a2230'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(W / 2 - 14, 262); g.quadraticCurveTo(W / 2, 256, W / 2 + 14, 262); g.stroke();
  // soft shadow along the lower rim
  g.save(); oval(); g.clip();
  const sh = g.createLinearGradient(0, H * 0.7, 0, H);
  sh.addColorStop(0, 'rgba(90,90,110,0)'); sh.addColorStop(1, 'rgba(90,90,110,0.35)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  g.restore();
  return p.texture({ wrap: false });
}

/** No-Face's body: near black with a faint violet sheen high up and soft vertical folds. */
export function noFaceBody() {
  const p = new Painter(256, 512, 92).fill('#101118');
  p.vgrad([[0, '#1d1d2c'], [0.35, '#12131c'], [1, '#07080c']]);
  p.lines({ n: 26, colors: ['#1c1d2a', '#050508'], alpha: [0.25, 0.55], width: [4, 12], vertical: true, wobble: 5 });
  return p.texture();
}

// ---------------- Haku ----------------
/**
 * Haku's scales for a tube whose u runs around the body (u = 0.25 is the back, 0.75 the belly) and whose
 * v runs along it (the texture repeats along the body).
 */
export function hakuScales() {
  const W = 256, H = 256;
  const p = new Painter(W, H, 101).fill('#eef3f2');
  const g = p.g;
  // a faint mint sheen along the back, cooler along the flanks
  p.hgrad([[0, '#e2eaf0'], [0.25, '#e6f4ee'], [0.5, '#e2eaf0'], [0.75, '#f4efe2'], [1, '#e2eaf0']]);
  // overlapping scales in offset rows; each row's lower edge overlaps the next
  const rows = 10, cols = 16;
  for (let r = 0; r < rows + 1; r++) for (let c = 0; c < cols + 1; c++) {
    const x = (c + (r % 2) * 0.5) * (W / cols), y = r * (H / rows);
    const u = x / W;
    const belly = Math.max(0, 1 - Math.abs(u - 0.75) / 0.12);
    if (belly > 0.4) continue;
    const rx = W / cols * 0.62, ry = H / rows * 0.95;
    const gr = g.createLinearGradient(x, y - ry, x, y + ry * 0.4);
    gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.7, 'rgba(236,244,242,0.4)'); gr.addColorStop(1, 'rgba(160,195,198,0.35)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI); g.fill();
    g.strokeStyle = 'rgba(130,170,178,0.28)'; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0.1, Math.PI - 0.1); g.stroke();
  }
  // belly plates: cream bands across the underside
  for (let r = 0; r < 12; r++) {
    const y = (r / 12) * H;
    g.fillStyle = 'rgba(246,240,222,0.95)'; g.fillRect(W * 0.64, y, W * 0.22, H / 12 - 3);
    g.fillStyle = 'rgba(170,160,140,0.5)'; g.fillRect(W * 0.64, y + H / 12 - 3, W * 0.22, 3);
  }
  const t = p.texture();
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Teal mane strands on a transparent canvas: roots along the bottom, tips wisping up and back. */
export function hakuMane() {
  const W = 512, H = 128;
  const p = new Painter(W, H, 103);
  const g = p.g;
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = p.rng.range(-20, W + 20), len = p.rng.range(0.45, 1) * H * 0.95;
    const lean = p.rng.range(20, 60);
    const shade = p.rng.range(0.8, 1.15);
    g.strokeStyle = css(0x4fb8a4, shade);
    g.lineWidth = p.rng.range(3, 7);
    g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x - lean * 0.2, H - len * 0.6, x - lean, H - len); g.stroke();
  }
  return p.texture();
}

/** Teal fur tuft for cones (mane spikes, tail fan): darker at the root, pale at the tip. */
export function tealTuft() {
  const p = new Painter(128, 128, 104).vgrad([[0, '#a6e8d8'], [0.6, '#4fb8a4'], [1, '#2e7f74']]);
  p.fur({ n: 400, colors: ['#8fe0cc', '#3a9a8a', '#c6f2e6'], len: [10, 26], width: [1.5, 3], alpha: [0.3, 0.7], angle: () => -Math.PI / 2 });
  return p.texture();
}

// ---------------- people ----------------
export interface FaceOpts {
  skin: number;
  hair: number;
  eyes?: 'open' | 'closed';
  /** fringe across the forehead: 'bob' is straight with a few points, 'parted' sweeps to both sides */
  fringe?: 'bob' | 'parted' | 'none';
  mouth?: 'smile' | 'small' | 'open';
  blush?: number;
  /** canvas width (height is half); 1024 for characters you can get close to */
  w?: number;
  seed?: number;
}

/**
 * A head texture for a sphere facing +z: skin, an anime face at the front, a fringe, and hair over the
 * top and back of the head (so the sphere reads as a hairdo from every side).
 */
export function faceTexture(o: FaceOpts) {
  const W = o.w ?? 512, H = W / 2;
  const f = W / (Math.PI * 2); // canvas pixels per radian
  const p = new Painter(W, H, o.seed ?? 21).fill(css(o.skin));
  const g = p.g;
  // soft shading: warmer and slightly darker under the chin
  p.vgrad([[0, 'rgba(255,255,255,0)'], [0.6, 'rgba(255,255,255,0)'], [1, css(o.skin, 0.8, 0xc07060, 0.3)]], 0.8);
  // hair: everything behind the ears and above the hairline
  const hairC = css(o.hair), hairD = css(o.hair, 0.75), hairL = css(o.hair, 1.6, 0xa0b0d0, 0.15);
  g.fillStyle = hairC;
  g.beginPath();
  // hairline around the face: the face spans roughly u 0.12..0.38 (front is u 0.25)
  const x0 = W * 0.115, x1 = W * 0.385, top = H * 0.3;
  g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H * 0.78);
  g.lineTo(x1 + W * 0.02, H * 0.78);
  g.quadraticCurveTo(x1, H * 0.5, x1 - W * 0.01, top);
  g.lineTo(x0 + W * 0.01, top);
  g.quadraticCurveTo(x0, H * 0.5, x0 - W * 0.02, H * 0.78);
  g.lineTo(0, H * 0.78);
  g.closePath(); g.fill();
  // strands and a sheen band
  p.lines({ n: Math.round(W * 0.12), colors: [hairD, hairL], alpha: [0.15, 0.4], width: [W * 0.002, W * 0.005], vertical: true, wobble: W * 0.004 });
  g.globalAlpha = 0.35; g.fillStyle = hairL; g.fillRect(0, H * 0.16, W, H * 0.035); g.globalAlpha = 1;
  // repaint the face area on top of the strands
  g.fillStyle = css(o.skin);
  g.beginPath(); g.ellipse(W * 0.25, H * 0.56, W * 0.12, H * 0.27, 0, 0, Math.PI * 2); g.fill();
  const cx = W * 0.25, cy = H * 0.5;
  // fringe
  if (o.fringe !== 'none') {
    g.fillStyle = hairC;
    g.beginPath();
    g.moveTo(cx - 0.72 * f, cy - 0.9 * f);
    g.lineTo(cx + 0.72 * f, cy - 0.9 * f);
    if (o.fringe === 'parted') {
      g.quadraticCurveTo(cx + 0.55 * f, cy - 0.05 * f, cx + 0.62 * f, cy + 0.1 * f);
      g.quadraticCurveTo(cx + 0.2 * f, cy - 0.2 * f, cx, cy - 0.5 * f);
      g.quadraticCurveTo(cx - 0.2 * f, cy - 0.2 * f, cx - 0.62 * f, cy + 0.1 * f);
      g.quadraticCurveTo(cx - 0.55 * f, cy - 0.05 * f, cx - 0.72 * f, cy - 0.9 * f);
    } else {
      // straight across with a few points, just above the eyebrows
      const n = 7, yb = cy - 0.26 * f;
      g.lineTo(cx + 0.66 * f, yb + 0.12 * f);
      for (let i = n; i >= 0; i--) {
        const x = cx + (i / n - 0.5) * 1.3 * f;
        g.lineTo(x, yb + (i % 2 ? 0.07 * f : -0.03 * f));
      }
      g.lineTo(cx - 0.66 * f, yb + 0.12 * f);
    }
    g.closePath(); g.fill();
    g.globalAlpha = 0.35; g.strokeStyle = hairD; g.lineWidth = W * 0.003;
    for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(cx + i * 0.13 * f, cy - 0.85 * f); g.lineTo(cx + i * 0.15 * f, cy - 0.3 * f); g.stroke(); }
    g.globalAlpha = 1;
  }
  // blush
  for (const s of [-1, 1]) {
    const gr = g.createRadialGradient(cx + s * 0.42 * f, cy + 0.22 * f, 0, cx + s * 0.42 * f, cy + 0.22 * f, 0.16 * f);
    gr.addColorStop(0, `rgba(235,120,120,${o.blush ?? 0.45})`); gr.addColorStop(1, 'rgba(235,120,120,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx + s * 0.42 * f, cy + 0.22 * f, 0.2 * f, 0.12 * f, 0, 0, Math.PI * 2); g.fill();
  }
  // eyes
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ex = cx + s * 0.33 * f, ey = cy + 0.02 * f;
    if (o.eyes === 'closed') {
      g.strokeStyle = '#2a1c18'; g.lineWidth = 0.035 * f;
      g.beginPath(); g.moveTo(ex - 0.11 * f, ey); g.quadraticCurveTo(ex, ey + 0.08 * f, ex + 0.11 * f, ey); g.stroke();
    } else {
      g.fillStyle = '#fbfaf6';
      g.beginPath(); g.ellipse(ex, ey, 0.12 * f, 0.155 * f, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2c1e1a';
      g.beginPath(); g.ellipse(ex + s * 0.012 * f, ey + 0.02 * f, 0.09 * f, 0.13 * f, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(ex - 0.03 * f, ey - 0.045 * f, 0.034 * f, 0, Math.PI * 2); g.fill();
      // upper lid
      g.strokeStyle = '#1e1412'; g.lineWidth = 0.04 * f;
      // inner corner a little higher than the outer one, which flicks down like a lash
      g.beginPath(); g.moveTo(ex - s * 0.13 * f, ey - 0.1 * f); g.quadraticCurveTo(ex - s * 0.01 * f, ey - 0.2 * f, ex + s * 0.15 * f, ey - 0.05 * f); g.stroke();
    }
    // brow
    g.strokeStyle = css(o.hair, 0.9); g.lineWidth = 0.022 * f;
    g.beginPath(); g.moveTo(ex - 0.09 * f, cy - 0.22 * f); g.quadraticCurveTo(ex, cy - 0.27 * f, ex + 0.09 * f, cy - 0.22 * f); g.stroke();
  }
  // nose and mouth
  g.strokeStyle = css(o.skin, 0.72, 0xa05040, 0.2); g.lineWidth = 0.018 * f;
  g.beginPath(); g.moveTo(cx, cy + 0.14 * f); g.lineTo(cx - 0.015 * f, cy + 0.19 * f); g.stroke();
  const my = cy + 0.34 * f;
  if (o.mouth === 'open') {
    g.fillStyle = '#9a3a3a';
    g.beginPath(); g.moveTo(cx - 0.08 * f, my - 0.01 * f); g.quadraticCurveTo(cx, my + 0.12 * f, cx + 0.08 * f, my - 0.01 * f); g.closePath(); g.fill();
  } else {
    g.strokeStyle = '#8a3a34'; g.lineWidth = 0.02 * f;
    const w = o.mouth === 'small' ? 0.04 : 0.07;
    g.beginPath(); g.moveTo(cx - w * f, my); g.quadraticCurveTo(cx, my + (o.mouth === 'small' ? 0.02 : 0.05) * f, cx + w * f, my); g.stroke();
  }
  return p.texture();
}

/** Hair for caps, buns and pigtails on a sphere: strands running down from the crown and a sheen band. */
export function hairTexture(color: number, seed = 31) {
  const p = new Painter(256, 128, seed).fill(css(color));
  p.lines({ n: 40, colors: [css(color, 0.72), css(color, 1.5, 0xa0b0d0, 0.15)], alpha: [0.2, 0.45], width: [1, 2.5], vertical: true, wobble: 1.5 });
  p.vgrad([[0, 'rgba(255,255,255,0)'], [0.28, 'rgba(255,255,255,0)'], [0.34, 'rgba(210,220,255,0.28)'], [0.4, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.25)']]);
  return p.texture();
}

/**
 * Cloth: base colour with soft folds running down, a faint weave, an optional darker hem, and optional
 * horizontal stripes (for Chihiro's shirt).
 */
export function fabric(color: number, o: { folds?: number; hem?: boolean; stripes?: { color: number; count: number; width: number }; seed?: number } = {}) {
  const p = new Painter(256, 256, o.seed ?? 41).fill(css(color));
  const g = p.g;
  if (o.stripes) {
    for (let i = 0; i < o.stripes.count; i++) {
      const y = ((i + 0.5) / o.stripes.count) * 256;
      g.fillStyle = css(o.stripes.color); g.fillRect(0, y - o.stripes.width / 2, 256, o.stripes.width);
    }
  }
  const folds = o.folds ?? 8;
  for (let i = 0; i < folds; i++) {
    const x = ((i + p.rng.range(0.2, 0.8)) / folds) * 256;
    const gr = g.createLinearGradient(x - 14, 0, x + 14, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.16)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - 14, 256 * p.rng.range(0, 0.4), 28, 256);
  }
  p.lines({ n: 60, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.09], width: [1, 1.5], wobble: 0.5 });
  p.lines({ n: 60, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.09], width: [1, 1.5], vertical: true, wobble: 0.5 });
  if (o.hem) { g.fillStyle = css(color, 0.72); g.fillRect(0, 238, 256, 18); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 236, 256, 2); }
  return p.texture();
}

/** Wood grain running along a cylinder (for broom handles, posts and poles). */
export function woodGrain(color: number, seed = 51) {
  const p = new Painter(64, 256, seed).fill(css(color));
  p.lines({ n: 22, colors: [css(color, 0.72), css(color, 1.2)], alpha: [0.3, 0.6], width: [1, 2.5], vertical: true, wobble: 2 });
  p.dabs({ n: 6, colors: [css(color, 0.65)], r: [2, 4], alpha: [0.4, 0.7], squash: 2.5 });
  return p.texture();
}

/** Broom bristles on a cone (tip at the top): straw strands with a dark red binding near the top. */
export function strawTexture() {
  const p = new Painter(256, 128, 61).fill('#d9b45e');
  p.lines({ n: 160, colors: ['#b8903e', '#f0d58a', '#a07a30', '#e6c46c'], alpha: [0.45, 0.85], width: [1, 2.5], vertical: true, wobble: 1 });
  p.vgrad([[0, 'rgba(90,60,20,0.35)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(60,40,10,0.2)']]);
  p.g.fillStyle = '#7a2a24'; p.g.fillRect(0, 22, 256, 12);
  p.g.fillStyle = 'rgba(255,255,255,0.18)'; p.g.fillRect(0, 22, 256, 3);
  return p.texture();
}

/** A red ribbon bow's cloth: soft folds converging on the knot. */
export function bowCloth(color: number) {
  const p = new Painter(128, 64, 71).fill(css(color));
  p.vgrad([[0, css(color, 1.15)], [0.5, css(color)], [1, css(color, 0.75)]]);
  const g = p.g;
  for (let i = 0; i < 6; i++) { g.strokeStyle = `rgba(80,0,0,${0.12 + i * 0.02})`; g.lineWidth = 2; g.beginPath(); g.moveTo(i * 22, 0); g.quadraticCurveTo(64, 32, i * 22, 64); g.stroke(); }
  return p.texture();
}

// ---------------- small spirits ----------------
/** Kodama head (sphere facing +z): chalky white with three dark holes for eyes and mouth. */
export function kodamaFace(variant: number) {
  const p = new Painter(256, 128, 111 + variant).fill('#eef0ea');
  p.vgrad([[0, '#f6f7f2'], [0.6, '#e8ebe4'], [1, '#c8d0c8']]);
  p.dabs({ n: 30, colors: ['#ffffff', '#d8ddd4'], r: [4, 14], alpha: [0.1, 0.25] });
  const g = p.g;
  // each kodama has a slightly different expression: hole sizes and spacing vary
  const eyeGap = [16, 14, 18, 15][variant % 4], eyeR = [7, 6, 8, 5][variant % 4], mouth = [[9, 8], [6, 10], [11, 6], [7, 7]][variant % 4];
  const hole = (x: number, y: number, rx: number, ry: number) => {
    const gr = g.createRadialGradient(x, y - ry * 0.3, 0, x, y, Math.max(rx, ry));
    gr.addColorStop(0, '#07090a'); gr.addColorStop(0.75, '#1c2220'); gr.addColorStop(1, 'rgba(60,70,66,0.6)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  };
  // the front of the head is a quarter of the way across the canvas
  const cx = 64, cy = 60;
  hole(cx - eyeGap, cy, eyeR, eyeR * 1.2);
  hole(cx + eyeGap, cy, eyeR, eyeR * 1.2);
  hole(cx, cy + 20, mouth[0], mouth[1]);
  return p.texture();
}

/** Ponyo's sisters: red fish body (sphere facing +z) with a pale little face at the front. */
export function ponyoBody() {
  const p = new Painter(512, 256, 121).fill('#e6553f');
  p.vgrad([[0, '#f0704a'], [0.45, '#e6553f'], [0.75, '#f08a70'], [1, '#f8c0a8']]);
  // faint scales along the sides
  const g = p.g;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 26; c++) {
    const x = (c + (r % 2) * 0.5) * (512 / 26), y = 40 + r * 22;
    g.strokeStyle = 'rgba(160,40,30,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 10, 0.2, Math.PI - 0.2); g.stroke();
  }
  p.at([0, 0.05, 1], (c) => {
    c.fillStyle = '#ffdcc8';
    c.beginPath(); c.ellipse(0, 0, 46, 40, 0, 0, Math.PI * 2); c.fill();
    // red hair framing the face
    c.fillStyle = '#d8402c';
    c.beginPath(); c.ellipse(0, -30, 50, 18, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#231a18';
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 16, 4, 5, 7, 0, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#ffffff';
    for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 16 - 2, 1, 2, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = 'rgba(240,120,110,0.5)';
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 28, 16, 8, 5, 0, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#a0302a'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 16, 8, 0.3, Math.PI - 0.3); c.stroke();
  });
  return p.texture();
}

/** Fin with rays, for cones (tip at the top). */
export function finTexture(color: number) {
  const p = new Painter(128, 64, 123).fill(css(color));
  p.vgrad([[0, css(color, 0.9)], [1, css(color, 1.2, 0xffffff, 0.2)]]);
  p.lines({ n: 20, colors: [css(color, 0.75)], alpha: [0.4, 0.7], width: [1, 2], vertical: true, wobble: 0.5 });
  return p.texture();
}

/** Radish skin for a capsule: creamy white, faint rings, tiny root-hair dots, a green blush near the top. */
export function radishSkin() {
  const p = new Painter(256, 512, 131).fill('#f4efe2');
  p.vgrad([[0, '#dfe8c8'], [0.15, '#eef0dc'], [0.35, '#f5f0e2'], [1, '#ebe2cf']]);
  const g = p.g;
  for (let i = 0; i < 26; i++) {
    const y = 60 + i * 17 + p.rng.range(-4, 4);
    g.strokeStyle = `rgba(150,130,100,${p.rng.range(0.12, 0.25)})`; g.lineWidth = p.rng.range(1, 2.2);
    g.beginPath(); g.moveTo(0, y);
    for (let k = 1; k <= 16; k++) g.lineTo((k / 16) * 256, y + Math.sin(k * 1.3 + i) * 2);
    g.stroke();
  }
  p.dabs({ n: 140, colors: ['#b8a888', '#9a8a70'], r: [0.8, 1.8], alpha: [0.35, 0.7], y: [0.25, 1] });
  return p.texture();
}

/** Red lacquer for bowls and hats: deep red with a soft sheen band. */
export function lacquer(color: number) {
  const p = new Painter(128, 128, 141).fill(css(color));
  p.vgrad([[0, css(color, 0.8)], [0.35, css(color, 1.35, 0xffffff, 0.12)], [0.5, css(color)], [1, css(color, 0.65)]]);
  return p.texture();
}

/** Lamp glass: warm light behind a dark cross-shaped frame, for a glowing box. */
export function lampGlass() {
  const p = new Painter(64, 64, 151).fill('#ffe2a0');
  const gr = p.g.createRadialGradient(32, 36, 2, 32, 32, 36);
  gr.addColorStop(0, '#fff6d8'); gr.addColorStop(1, '#f0b860');
  p.g.fillStyle = gr; p.g.fillRect(0, 0, 64, 64);
  p.g.fillStyle = '#2a2622'; p.g.fillRect(0, 0, 64, 5); p.g.fillRect(0, 59, 64, 5); p.g.fillRect(0, 0, 5, 64); p.g.fillRect(59, 0, 5, 64); p.g.fillRect(30, 0, 4, 64); p.g.fillRect(0, 30, 64, 4);
  return p.texture({ wrap: false });
}

/** Wrought iron: near black with a faint blue-grey sheen and hammer marks. */
export function ironTexture(color = 0x2f3338, seed = 161) {
  const p = new Painter(64, 128, seed).fill(css(color));
  p.dabs({ n: 40, colors: [css(color, 1.4), css(color, 0.7)], r: [1, 4], alpha: [0.15, 0.35] });
  p.lines({ n: 6, colors: [css(color, 1.5)], alpha: [0.1, 0.2], width: [1, 2], vertical: true });
  return p.texture();
}

// ---------------- distant landmarks ----------------
/** Weathered stone blocks with an optional row of dark arched openings (for Laputa's walls). Tiles both ways. */
export function stoneWall(color: number, o: { arches?: boolean; moss?: boolean; seed?: number } = {}) {
  const W = 256, H = 256;
  const p = new Painter(W, H, o.seed ?? 171).fill(css(color, 0.8));
  const g = p.g, rng = p.rng;
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rng.range(10, 30) : 0;
    while (x < W) {
      const bw = rng.range(30, 56);
      g.fillStyle = css(color, rng.range(0.9, 1.08), 0x8a8070, rng.range(0, 0.25));
      g.fillRect(x + 1.5, r * (H / rows) + 1.5, bw - 3, H / rows - 3);
      g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 1.5, r * (H / rows) + 1.5, bw - 3, 3);
      x += bw;
    }
  }
  if (o.arches) {
    for (let i = 0; i < 4; i++) {
      const cx = (i + 0.5) * (W / 4), top = H * 0.3, bottom = H * 0.8, hw = 14;
      g.fillStyle = css(color, 0.65);
      g.beginPath(); g.moveTo(cx - hw - 5, bottom); g.lineTo(cx - hw - 5, top); g.arc(cx, top, hw + 5, Math.PI, 0); g.lineTo(cx + hw + 5, bottom); g.fill();
      g.fillStyle = '#1c2026';
      g.beginPath(); g.moveTo(cx - hw, bottom); g.lineTo(cx - hw, top); g.arc(cx, top, hw, Math.PI, 0); g.lineTo(cx + hw, bottom); g.fill();
    }
  }
  // rain streaks and moss creeping down from the top
  p.lines({ n: 30, colors: ['rgba(40,40,40,1)'], alpha: [0.05, 0.14], width: [2, 6], vertical: true, wobble: 2 });
  if (o.moss) p.dabs({ n: 70, colors: ['#5d7a44', '#6f8c4e', '#4a6636'], r: [4, 14], alpha: [0.25, 0.55], y: [0, 0.35] });
  const t = p.texture();
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Dark layered rock for the underside of a floating island, with pale strata lines. */
export function rockStrata(color: number) {
  const p = new Painter(256, 256, 181).fill(css(color));
  const g = p.g;
  for (let i = 0; i < 18; i++) {
    const y = (i / 18) * 256 + p.rng.range(-4, 4);
    g.fillStyle = css(color, p.rng.range(0.8, 1.25)); g.globalAlpha = 0.6;
    g.beginPath(); g.moveTo(0, y);
    for (let k = 1; k <= 16; k++) g.lineTo((k / 16) * 256, y + Math.sin(k * 0.9 + i) * 4);
    g.lineTo(256, y + 12); g.lineTo(0, y + 12); g.fill();
    g.globalAlpha = 1;
  }
  p.lines({ n: 26, colors: [css(color, 0.55)], alpha: [0.3, 0.6], width: [1, 3], vertical: true, wobble: 6 });
  p.dabs({ n: 40, colors: ['#4a6a3a', '#3a5a30'], r: [4, 12], alpha: [0.25, 0.5], y: [0, 0.2] });
  const t = p.texture();
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Riveted iron plates with rust streaks (Howl's castle). Tiles both ways. */
export function metalPlates(color: number, rust: number, seed = 191) {
  const W = 256, H = 256;
  const p = new Painter(W, H, seed).fill(css(color));
  const g = p.g, rng = p.rng;
  // staggered rows of plates of different widths, each a slightly different tone
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const y = r * (H / rows), ph = H / rows;
    let x = r % 2 ? -rng.range(20, 60) : 0;
    while (x < W) {
      const pw = rng.range(60, 120);
      g.fillStyle = css(color, rng.range(0.9, 1.1), rust, rng.range(0, 0.12));
      g.fillRect(x + 2, y + 2, pw - 4, ph - 4);
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x, y, pw, 2.5); g.fillRect(x, y, 2.5, ph);
      g.fillStyle = 'rgba(255,255,255,0.14)';
      for (let k = 6; k < pw - 4; k += 12) { g.beginPath(); g.arc(x + k, y + 7, 2, 0, Math.PI * 2); g.fill(); }
      x += pw;
    }
  }
  // a little rust running down from the seams
  p.lines({ n: 14, colors: [css(rust), css(rust, 1.2)], alpha: [0.1, 0.25], width: [2, 5], vertical: true, wobble: 2 });
  p.dabs({ n: 24, colors: [css(rust, 0.9), css(color, 0.7)], r: [3, 10], alpha: [0.1, 0.25] });
  const t = p.texture();
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A gull's wing seen from above on a transparent canvas: grey back, white leading edge, black tip.
 * The wing root is on the left edge, the tip on the right. */
export function gullWing() {
  const p = new Painter(256, 96, 201);
  const g = p.g;
  g.beginPath();
  g.moveTo(0, 22); g.quadraticCurveTo(120, 8, 250, 40); g.lineTo(256, 48);
  g.quadraticCurveTo(170, 70, 60, 84); g.lineTo(0, 76); g.closePath();
  g.save(); g.clip();
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, '#c9ced6'); gr.addColorStop(0.7, '#b7bdc7'); gr.addColorStop(0.8, '#2a2a30'); gr.addColorStop(1, '#1a1a1e');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 96);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, 200, 26);
  // trailing edge feathers
  g.strokeStyle = 'rgba(80,80,90,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) { const x = 20 + i * 15; g.beginPath(); g.moveTo(x, 50); g.lineTo(x + 8, 86); g.stroke(); }
  g.restore();
  return p.texture({ wrap: false });
}

/** Airship hull for a sphere whose poles are at the nose and tail: silver gores and frame rings. */
export function airshipHull() {
  const p = new Painter(512, 256, 211).fill('#c9ccd2');
  p.vgrad([[0, '#9ea4ae'], [0.15, '#d4d7dc'], [0.5, '#cdd0d6'], [0.85, '#d4d7dc'], [1, '#9ea4ae']]);
  const g = p.g;
  for (let i = 0; i < 24; i++) { const x = (i / 24) * 512; g.fillStyle = `rgba(${p.rng.range(0, 1) > 0.5 ? '255,255,255' : '60,60,70'},${p.rng.range(0.04, 0.1)})`; g.fillRect(x, 0, 512 / 24, 256); g.fillStyle = 'rgba(70,70,80,0.35)'; g.fillRect(x, 0, 1.5, 256); }
  for (let i = 1; i < 12; i++) { g.fillStyle = 'rgba(70,70,80,0.25)'; g.fillRect(0, (i / 12) * 256, 512, 1.5); }
  // a red stripe along each side, nose to tail (the sides are u = 0 and u = 0.5)
  g.fillStyle = '#b33a3a';
  for (const x of [0, 256, 512]) g.fillRect(x - 6, 20, 12, 216);
  return p.texture();
}

/** Soft fade for ghostly shadow figures: transparent at the feet, denser above (alpha map for a capsule). */
export function shadowFade() {
  const p = new Painter(8, 128, 221).vgrad([[0, '#c8c8c8'], [0.6, '#b0b0b0'], [0.9, '#404040'], [1, '#000000']]);
  return p.texture({ wrap: false });
}
