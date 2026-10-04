import * as THREE from 'three';
import { Painter } from '../../../engine/Paint';
import { canvasTexture } from '../../../engine/Builders';
import { Rng, TAU } from '../../../engine/math';
import { css } from '../textures';
import { FUTURA } from '../film';

/*
 * Painted textures for Trash Island: the faces of the compressed trash bales, rusty iron, corrugated
 * sheeting, hazard stripes, the stencilled signs (Japanese, with the film's small English subtitles), the
 * grey-green sea.
 */

/** A Japanese font stack (falls back to the system's Gothic). */
export const JP = '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP", IPAGothic, "MS Gothic", sans-serif';

const cache = new Map<string, THREE.Texture>();
const once = (key: string, make: () => THREE.Texture) => { let t = cache.get(key); if (!t) { t = make(); cache.set(key, t); } return t; };

/**
 * The faces of the trash bales: 4 x 2 tiles of compressed rubbish in greys (the shader tints each bale by
 * its colour band): crumpled scraps, cans, bottles, newsprint, and two steel straps round the bale.
 */
export function baleAtlas() {
  return once('bales', () => {
    const T = 256, W = T * 4, H = T * 2;
    const p = new Painter(W, H, 4401);
    const g = p.g, r = p.rng;
    g.fillStyle = '#9a9890'; g.fillRect(0, 0, W, H);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 4; tx++) {
      const x0 = tx * T, y0 = ty * T;
      g.save();
      g.beginPath(); g.rect(x0, y0, T, T); g.clip();
      // a base of mashed scraps
      for (let i = 0; i < 260; i++) {
        const cx = x0 + r.range(-10, T + 10), cy = y0 + r.range(-10, T + 10), s = r.range(5, 22);
        const v = Math.round(r.range(105, 200));
        const warm = r.range(-12, 12);
        g.fillStyle = `rgb(${v + warm},${v},${v - warm})`;
        g.beginPath();
        const n = r.int(4, 7), a0 = r.range(0, TAU);
        for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU, rr = s * r.range(0.5, 1.1); const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * r.range(0.4, 0.9); if (k) g.lineTo(px, py); else g.moveTo(px, py); }
        g.closePath(); g.fill();
        if (r.chance(0.35)) { g.strokeStyle = 'rgba(40,36,30,0.35)'; g.lineWidth = 1; g.stroke(); }
      }
      // a few coloured bits that keep their own colour (labels, caps, a red flash of a can)
      const bits = ['#b8423a', '#d8a83a', '#3a6a9a', '#4a8a5a', '#e8e0d0', '#c86a8a', '#2a2a2a'];
      for (let i = 0; i < 26; i++) {
        const cx = x0 + r.range(8, T - 8), cy = y0 + r.range(8, T - 8);
        g.fillStyle = r.pick(bits); g.globalAlpha = r.range(0.45, 0.8);
        g.fillRect(cx, cy, r.range(4, 14), r.range(3, 9));
      }
      g.globalAlpha = 1;
      // cans: crushed ellipses with a rim
      for (let i = 0; i < 6; i++) {
        const cx = x0 + r.range(16, T - 16), cy = y0 + r.range(16, T - 16), rx = r.range(7, 13);
        g.fillStyle = r.pick(['#c8c4bc', '#b03a32', '#d8b04a', '#5a8ab0']);
        g.beginPath(); g.ellipse(cx, cy, rx, rx * r.range(0.35, 0.8), r.range(0, 3), 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; g.stroke();
      }
      // bottles: long rounded shapes, glassy green or brown
      for (let i = 0; i < 3; i++) {
        const cx = x0 + r.range(20, T - 20), cy = y0 + r.range(20, T - 20), a = r.range(0, TAU);
        g.save(); g.translate(cx, cy); g.rotate(a);
        g.fillStyle = r.pick(['#5a7a4a', '#7a5a2a', '#9ab0a8']);
        g.beginPath(); g.ellipse(0, 0, 18, 6, 0, 0, TAU); g.fill(); g.fillRect(14, -2.5, 10, 5);
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(-12, -3.5, 18, 1.6);
        g.restore();
      }
      // newsprint: a pale scrap with lines of type
      for (let i = 0, nn = r.int(0, 2); i < nn; i++) {
        const cx = x0 + r.range(10, T - 60), cy = y0 + r.range(10, T - 50);
        g.save(); g.translate(cx, cy); g.rotate(r.range(-0.5, 0.5));
        g.fillStyle = '#e4dccb'; g.fillRect(0, 0, r.range(30, 52), r.range(22, 38));
        g.fillStyle = 'rgba(40,36,30,0.55)';
        for (let k = 0; k < 6; k++) g.fillRect(4, 4 + k * 5, r.range(14, 40), 2);
        g.restore();
      }
      // two steel straps across the bale, with a buckle
      for (const k of [0.3, 0.72]) {
        const y = y0 + T * k + r.range(-6, 6);
        g.fillStyle = 'rgba(40,38,36,0.75)'; g.fillRect(x0, y - 3, T, 6);
        g.fillStyle = 'rgba(220,214,200,0.55)'; g.fillRect(x0, y - 3, T, 1.5);
        g.fillStyle = 'rgba(30,28,26,0.8)'; g.fillRect(x0 + r.range(40, T - 60), y - 5, 14, 10);
      }
      // the edges of a bale are a little darker and frayed
      const eg = g.createLinearGradient(x0, 0, x0 + 18, 0);
      eg.addColorStop(0, 'rgba(30,26,22,0.35)'); eg.addColorStop(1, 'rgba(30,26,22,0)');
      g.fillStyle = eg; g.fillRect(x0, y0, 18, T);
      const eg2 = g.createLinearGradient(x0 + T - 18, 0, x0 + T, 0);
      eg2.addColorStop(0, 'rgba(30,26,22,0)'); eg2.addColorStop(1, 'rgba(30,26,22,0.35)');
      g.fillStyle = eg2; g.fillRect(x0 + T - 18, y0, 18, T);
      const eg3 = g.createLinearGradient(0, y0 + T - 22, 0, y0 + T);
      eg3.addColorStop(0, 'rgba(30,26,22,0)'); eg3.addColorStop(1, 'rgba(30,26,22,0.45)');
      g.fillStyle = eg3; g.fillRect(x0, y0 + T - 22, T, 22);
      g.restore();
    }
    const t = p.texture();
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 4;
    return t;
  });
}

/** Rusty painted iron: a flat colour worn through to rust in blotches and streaks. One tile = 2 x 2 units. */
export function rustIron(color: number, seed = 61, rust = 0.6) {
  return once(`rust${color}_${seed}_${rust}`, () => {
    const p = new Painter(256, 256, seed).fill(css(color));
    p.dabs({ n: 40, colors: [css(color, 1.08), css(color, 0.9)], r: [10, 40], alpha: [0.08, 0.18], squash: 0.7 });
    p.dabs({ n: Math.round(70 * rust), colors: ['#8a4a2a', '#a8623a', '#6a3a24'], r: [3, 16], alpha: [0.35, 0.75], squash: 0.8 });
    // streaks running down from the blotches
    const g = p.g, r = p.rng;
    for (let i = 0; i < 60 * rust; i++) {
      const x = r.range(0, 256), y = r.range(0, 200), l = r.range(20, 90);
      const gr = g.createLinearGradient(0, y, 0, y + l);
      gr.addColorStop(0, 'rgba(120,60,30,0.5)'); gr.addColorStop(1, 'rgba(120,60,30,0)');
      g.fillStyle = gr; g.fillRect(x, y, r.range(1.5, 4), l);
    }
    p.dabs({ n: 160, colors: ['#3a2418', '#c8844a'], r: [0.6, 1.6], alpha: [0.3, 0.6] });
    return p.texture({ repeat: [1, 1] });
  });
}

/** Corrugated sheeting: vertical ribs in a faded colour with rust along the bottom. One tile = 2 x 2 units. */
export function corrugated(color: number, seed = 71) {
  return once(`corr${color}_${seed}`, () => {
    const p = new Painter(256, 256, seed).fill(css(color));
    const g = p.g;
    for (let x = 0; x < 256; x += 16) {
      const gr = g.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
      g.fillStyle = gr; g.fillRect(x, 0, 16, 256);
    }
    p.dabs({ n: 50, colors: ['#8a4a2a', '#a8623a', '#5a3420'], r: [4, 18], alpha: [0.25, 0.6], squash: 0.6, y: [0.55, 1] });
    p.dabs({ n: 14, colors: ['#8a4a2a', '#a8623a'], r: [3, 10], alpha: [0.2, 0.5], squash: 0.6, y: [0, 0.5] });
    for (let i = 0; i < 40; i++) {
      const x = p.rng.range(0, 256), y = p.rng.range(0, 150), l = p.rng.range(30, 100);
      const gr = g.createLinearGradient(0, y, 0, y + l);
      gr.addColorStop(0, 'rgba(110,56,30,0.4)'); gr.addColorStop(1, 'rgba(110,56,30,0)');
      g.fillStyle = gr; g.fillRect(x, y, 2, l);
    }
    return p.texture({ repeat: [1, 1] });
  });
}

/** Diagonal yellow and black hazard stripes. One tile = 1 unit across. */
export function hazard() {
  return once('hazard', () => canvasTexture(128, 32, (g) => {
    g.fillStyle = '#e0b030'; g.fillRect(0, 0, 128, 32);
    g.fillStyle = '#222020';
    for (let x = -32; x < 160; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(120,60,30,0.35)';
    for (let i = 0; i < 30; i++) g.fillRect((i * 37) % 128, (i * 13) % 32, 6, 3);
  }, [1, 1]));
}

/**
 * The trash gondola's side: rusty red-brown plates, ribs, rivets, with stencilled characters (ゴミ運搬 and
 * the car's number) and a small English line under them, and a band of hazard stripes along the top.
 * Spans the whole side (u 0..1 = back to front).
 */
export function gondolaSide(num: string) {
  return once(`gside${num}`, () => {
    const W = 1024, H = 320;
    const p = new Painter(W, H, 81).fill('#8a4e36');
    const g = p.g;
    p.dabs({ n: 70, colors: ['#9a5a3e', '#7a4430', '#a86a44'], r: [14, 60], alpha: [0.15, 0.35], squash: 0.6 });
    p.dabs({ n: 90, colors: ['#5a2e1e', '#b8784a', '#6a3a24'], r: [3, 14], alpha: [0.35, 0.7] });
    // plates and ribs
    for (let x = 0; x <= W; x += 128) { g.fillStyle = 'rgba(30,16,10,0.45)'; g.fillRect(x - 3, 0, 6, H); g.fillStyle = 'rgba(255,220,180,0.12)'; g.fillRect(x + 3, 0, 3, H); }
    g.fillStyle = 'rgba(30,16,10,0.4)'; g.fillRect(0, H * 0.5 - 2, W, 4);
    for (let x = 16; x < W; x += 32) for (const y of [56, H * 0.5 - 10, H * 0.5 + 10, H - 14]) { g.fillStyle = 'rgba(30,16,10,0.6)'; g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,220,180,0.3)'; g.beginPath(); g.arc(x - 1, y - 1, 1.4, 0, TAU); g.fill(); }
    // hazard band along the top
    g.save(); g.beginPath(); g.rect(0, 0, W, 40); g.clip();
    g.fillStyle = '#d8a830'; g.fillRect(0, 0, W, 40);
    g.fillStyle = '#242020';
    for (let x = -40; x < W + 40; x += 40) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x + 20, 40); g.lineTo(x + 40, 0); g.lineTo(x + 20, 0); g.closePath(); g.fill(); }
    g.restore();
    g.fillStyle = 'rgba(80,40,20,0.35)'; for (let i = 0; i < 40; i++) g.fillRect(p.rng.range(0, W), p.rng.range(0, 40), p.rng.range(4, 18), p.rng.range(2, 8));
    // stencilled characters: cream paint with the bridges of a stencil, a little worn
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#efe6d0';
    g.font = `bold 118px ${JP}`;
    g.fillText('ゴミ運搬', W * 0.42, H * 0.5);
    g.fillStyle = '#c8302a'; g.font = `bold 124px ${JP}`;
    g.fillText(num, W * 0.85, H * 0.5);
    g.fillStyle = '#efe6d0'; g.font = `bold 26px ${FUTURA}`;
    g.fillText('TRASH TRANSPORT  ·  MEGASAKI SANITATION', W * 0.42, H * 0.84);
    // stencil bridges and wear
    g.fillStyle = '#8a4e36';
    for (let x = 0; x < W * 0.72; x += 46) g.fillRect(x + 20, H * 0.5 - 70, 4, 140);
    p.dabs({ n: 120, colors: ['#8a4e36', '#6a3a24'], r: [1, 5], alpha: [0.5, 0.9], y: [0.28, 0.8] });
    return p.texture();
  });
}

/**
 * The inside of the gondola: faded grey-green paint, worn through along the ribs, with rust runs, scratches
 * from the bales and a chalked tally. One tile spans one wall (4 x 1 units).
 */
export function gondolaInner() {
  return once('ginner', () => {
    const W = 512, H = 128;
    const p = new Painter(W, H, 87).fill('#6c7a6c');
    p.dabs({ n: 40, colors: ['#768676', '#627062', '#7a8a78'], r: [10, 40], alpha: [0.15, 0.3], squash: 0.5 });
    const g = p.g, r = p.rng;
    // rust runs from the rim and along the seams
    for (let i = 0; i < 70; i++) {
      const x = r.range(0, W), l = r.range(10, 70), y = r.chance(0.6) ? 0 : r.range(0, H * 0.6);
      const gr = g.createLinearGradient(0, y, 0, y + l);
      gr.addColorStop(0, 'rgba(130,64,34,0.65)'); gr.addColorStop(1, 'rgba(130,64,34,0)');
      g.fillStyle = gr; g.fillRect(x, y, r.range(1.5, 5), l);
    }
    for (let x = 0; x <= W; x += 102) { g.fillStyle = 'rgba(120,60,32,0.55)'; g.fillRect(x - 4, 0, 8, H); g.fillStyle = 'rgba(30,26,22,0.4)'; g.fillRect(x - 1, 0, 2, H); }
    // a band of bare rust along the bottom, where the trash sits
    const bg = g.createLinearGradient(0, H * 0.7, 0, H);
    bg.addColorStop(0, 'rgba(110,56,30,0)'); bg.addColorStop(1, 'rgba(110,56,30,0.8)');
    g.fillStyle = bg; g.fillRect(0, H * 0.7, W, H * 0.3);
    // scratches
    g.strokeStyle = 'rgba(210,200,180,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const x = r.range(0, W), y = r.range(10, H - 10); g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-30, 30), y + r.range(-4, 4)); g.stroke(); }
    // a chalked tally of loads
    g.strokeStyle = 'rgba(236,232,220,0.75)'; g.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) { const x0 = 300 + k * 30; for (let j = 0; j < 4; j++) { g.beginPath(); g.moveTo(x0 + j * 5, 40); g.lineTo(x0 + j * 5 + 1, 64); g.stroke(); } g.beginPath(); g.moveTo(x0 - 3, 58); g.lineTo(x0 + 20, 44); g.stroke(); }
    return p.texture();
  });
}

/** A big painted sign: red characters on cream (or the reverse), a small English line under them. */
export function jpSign(main: string, sub: string, o: { bg?: string; fg?: string; w?: number; h?: number; size?: number; vertical?: boolean } = {}) {
  const key = `sign${main}|${sub}|${o.bg}|${o.fg}|${o.w}|${o.h}|${o.vertical}`;
  return once(key, () => {
    const W = o.w ?? 512, H = o.h ?? 256;
    const p = new Painter(W, H, main.length * 7 + 3).fill(o.bg ?? '#efe6d2');
    const g = p.g;
    p.dabs({ n: 30, colors: ['rgba(120,90,60,1)', 'rgba(255,255,255,1)'], r: [8, 40], alpha: [0.04, 0.1] });
    g.strokeStyle = o.fg ?? '#b8302a'; g.lineWidth = Math.max(4, W * 0.012); g.strokeRect(g.lineWidth, g.lineWidth, W - g.lineWidth * 2, H - g.lineWidth * 2);
    g.fillStyle = o.fg ?? '#b8302a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (o.vertical) {
      const chars = [...main];
      const s = o.size ?? Math.min(W * 0.7, (H * 0.86) / chars.length);
      g.font = `bold ${s}px ${JP}`;
      chars.forEach((c, i) => g.fillText(c, W / 2, H * 0.08 + s * (i + 0.5)));
    } else {
      const s = o.size ?? H * (sub ? 0.5 : 0.62);
      g.font = `bold ${s}px ${JP}`;
      g.fillText(main, W / 2, sub ? H * 0.42 : H * 0.52);
      if (sub) { g.font = `bold ${Math.round(H * 0.13)}px ${FUTURA}`; g.fillText(sub, W / 2, H * 0.8); }
    }
    // weathering: rust runs from the corners, flaking paint
    p.dabs({ n: 40, colors: ['#8a4a2a', '#6a3a24'], r: [1, 6], alpha: [0.3, 0.7] });
    for (let i = 0; i < 8; i++) {
      const x = p.rng.range(0, W), l = p.rng.range(H * 0.1, H * 0.5);
      const gr = g.createLinearGradient(0, 0, 0, l);
      gr.addColorStop(0, 'rgba(120,60,30,0.5)'); gr.addColorStop(1, 'rgba(120,60,30,0)');
      g.fillStyle = gr; g.fillRect(x, 0, 3, l);
    }
    return p.texture({ wrap: false });
  });
}

/** The bay: grey-green water with combed lines of little painted waves. One tile = 24 units. */
export function seaTexture() {
  return once('sea', () => {
    const W = 512;
    const p = new Painter(W, W, 91).fill('#6f8a80');
    p.dabs({ n: 60, colors: ['#7a968a', '#627a72', '#86a094'], r: [20, 80], alpha: [0.15, 0.35], squash: 0.4 });
    const g = p.g, r = p.rng;
    // rows of small crescent waves, the way a stage sea is cut from card
    for (let row = 0; row < 16; row++) {
      const y = (row + 0.5) * (W / 16);
      for (let x = (row % 2) * 16; x < W + 32; x += 32 + r.range(-4, 4)) {
        const yy = y + r.range(-4, 4);
        g.strokeStyle = 'rgba(232,236,226,0.55)'; g.lineWidth = 2.2;
        g.beginPath(); g.arc(x, yy + 7, 9, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
        g.strokeStyle = 'rgba(40,60,56,0.35)'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, yy + 10, 10, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      }
    }
    return p.texture({ repeat: [1, 1] });
  });
}

/** A rusty steel lattice (for pylon legs and coaster supports): transparent between the bars. */
export function lattice(color = 0x7a4a34) {
  return once(`lattice${color}`, () => {
    const W = 128, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = css(color); g.lineCap = 'square';
    g.lineWidth = 12; g.beginPath(); g.moveTo(6, 0); g.lineTo(6, H); g.moveTo(W - 6, 0); g.lineTo(W - 6, H); g.stroke();
    g.lineWidth = 7;
    for (let y = 0; y < H; y += 128) { g.beginPath(); g.moveTo(6, y); g.lineTo(W - 6, y + 64); g.lineTo(6, y + 128); g.stroke(); g.beginPath(); g.moveTo(W - 6, y); g.lineTo(6, y + 64); g.lineTo(W - 6, y + 128); g.stroke(); }
    g.lineWidth = 9; for (let y = 0; y <= H; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // rust on the bars
    const rng = new Rng(color & 0xff);
    for (let i = 0; i < 260; i++) { g.fillStyle = rng.chance(0.5) ? 'rgba(150,80,40,0.8)' : 'rgba(60,30,20,0.6)'; g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(1, 3), rng.range(1, 3)); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  });
}

/** Wooden boards, weathered grey-brown (one tile = 2 units). */
export function oldBoards(color = 0x8a7a64, seed = 101) {
  return once(`boards${color}_${seed}`, () => {
    const p = new Painter(256, 256, seed).fill(css(color));
    const g = p.g, r = p.rng;
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = css(color, r.range(0.88, 1.08)); g.fillRect(0, y, 256, 30);
      g.fillStyle = 'rgba(30,22,16,0.55)'; g.fillRect(0, y + 30, 256, 2);
    }
    p.lines({ n: 50, colors: [css(color, 0.75), css(color, 1.15)], alpha: [0.15, 0.35], width: [0.6, 1.4], wobble: 1.5 });
    p.dabs({ n: 30, colors: ['#5a4a3a', '#a89a84'], r: [2, 8], alpha: [0.2, 0.4], squash: 0.5 });
    return p.texture({ repeat: [1, 1] });
  });
}
