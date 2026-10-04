import * as THREE from 'three';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU, fbm } from '../../../engine/math';
import { css } from '../../ghibli/characterTextures';

/*
 * Painted textures for Totoro's garden: lit paper screens, the washing on the line, the spinning top's
 * bands, the moon, the notes of the ocarinas, rice seedlings, corn, morning mist and soil.
 */

const cache = new Map<string, THREE.Texture>();
const once = (key: string, make: () => THREE.Texture) => { let t = cache.get(key); if (!t) { t = make(); cache.set(key, t); } return t; };

/** A lit paper sliding screen (shoji): warm paper in a grid of dark wooden bars, brighter in the middle. */
export function shojiGlow() {
  return once('shoji', () => {
    const p = new Painter(128, 256, 401);
    const g = p.g;
    const gr = g.createRadialGradient(64, 140, 10, 64, 140, 170);
    gr.addColorStop(0, '#fff2cc'); gr.addColorStop(0.6, '#f6d898'); gr.addColorStop(1, '#d8a868');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
    // a shadow on the paper: someone's lamp and a low table inside
    g.fillStyle = 'rgba(120,70,30,0.18)'; g.beginPath(); g.ellipse(70, 200, 34, 12, 0, 0, TAU); g.fill();
    g.fillStyle = '#3a2618';
    for (let x = 0; x <= 128; x += 32) g.fillRect(x - 3, 0, 6, 256);
    for (let y = 0; y <= 256; y += 36) g.fillRect(0, y - 3, 128, 6);
    g.fillRect(0, 0, 128, 8); g.fillRect(0, 248, 128, 8);
    return p.texture({ wrap: false });
  });
}

/** A lit window pane with a four-light frame, for the annex. */
export function windowGlow() {
  return once('window', () => {
    const p = new Painter(128, 128, 402);
    const g = p.g;
    const gr = g.createRadialGradient(64, 70, 6, 64, 70, 90);
    gr.addColorStop(0, '#fff0c0'); gr.addColorStop(1, '#e0a050');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    // a desk lamp and a stack of books on the sill: the father working late
    g.fillStyle = 'rgba(90,50,20,0.35)'; g.fillRect(20, 92, 46, 16); g.fillRect(76, 70, 8, 38); g.beginPath(); g.ellipse(80, 66, 18, 8, 0, 0, TAU); g.fill();
    g.fillStyle = '#f4f0e6';
    g.fillRect(0, 0, 128, 10); g.fillRect(0, 118, 128, 10); g.fillRect(0, 0, 10, 128); g.fillRect(118, 0, 10, 128);
    g.fillRect(59, 0, 10, 128); g.fillRect(0, 59, 128, 10);
    return p.texture({ wrap: false });
  });
}

/** The family's washing pegged on a line: sheets, a white shirt, Satsuki's yellow blouse, Mei's pink dress. */
export function laundryTexture() {
  return once('laundry', () => {
    const p = new Painter(512, 128, 403);
    const g = p.g, rng = p.rng;
    g.clearRect(0, 0, 512, 128);
    const items: Array<[string, 'sheet' | 'shirt' | 'dress', number]> = [
      ['#f2efe6', 'sheet', 92], ['#f4d24a', 'shirt', 50], ['#f0a8bc', 'dress', 44], ['#f6f4ee', 'shirt', 54], ['#d86a3a', 'sheet', 40],
      ['#e8eef4', 'sheet', 80], ['#f0a8bc', 'shirt', 34], ['#f4f0e8', 'sheet', 60],
    ];
    let x = 6;
    for (const [col, kind, w] of items) {
      if (x + w > 506) break;
      g.fillStyle = col;
      const h = kind === 'sheet' ? rng.range(90, 118) : kind === 'dress' ? 84 : 64;
      if (kind === 'sheet') {
        g.beginPath(); g.moveTo(x, 4); g.lineTo(x + w, 4);
        for (let k = 8; k >= 0; k--) g.lineTo(x + (w * k) / 8, h + Math.sin(k * 1.7) * 4);
        g.closePath(); g.fill();
      } else {
        // a shirt or dress hung by the shoulders: sleeves out, body down
        const sl = kind === 'dress' ? 8 : 14;
        g.beginPath(); g.moveTo(x + 6, 4); g.lineTo(x + w - 6, 4); g.lineTo(x + w + sl - 6, 22); g.lineTo(x + w - 10, 26);
        g.lineTo(x + w - (kind === 'dress' ? 2 : 10), h); g.lineTo(x + (kind === 'dress' ? 2 : 10), h); g.lineTo(x + 10, 26); g.lineTo(x - sl + 6, 22); g.closePath(); g.fill();
      }
      // folds and a shadow at the hem
      for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x + rng.range(4, w - 8), 8, rng.range(3, 6), h - 12); }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, h - 8, w, 6);
      // pegs
      g.fillStyle = '#c8a878'; g.fillRect(x + 4, 0, 4, 10); g.fillRect(x + w - 8, 0, 4, 10);
      x += w + rng.range(8, 16);
    }
    return p.texture({ wrap: false });
  });
}

/** A painted wooden spinning top (koma) for a lathe: bands of red, green and plain wood. v runs down the profile. */
export function komaTexture() {
  return once('koma', () => {
    const p = new Painter(256, 256, 404).fill('#d8a868');
    const g = p.g;
    const bands: Array<[number, number, string]> = [[0, 0.1, '#8a5a30'], [0.1, 0.22, '#c8302a'], [0.22, 0.27, '#f2e2b8'], [0.27, 0.4, '#2f7a4a'], [0.4, 0.46, '#f2e2b8'],
      [0.46, 0.58, '#c8302a'], [0.58, 0.7, '#e0b070'], [0.7, 0.8, '#2a4a8a'], [0.8, 1, '#b07a44']];
    for (const [a, b, c] of bands) { g.fillStyle = c; g.fillRect(0, a * 256, 256, (b - a) * 256); }
    p.lines({ n: 40, colors: ['rgba(80,40,10,0.5)', 'rgba(255,230,190,0.5)'], alpha: [0.08, 0.2], width: [1, 2], wobble: 1 });
    // a soft sheen down one side
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.1)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return p.texture();
  });
}

/** The full moon: pale gold with soft grey seas, edged so it reads as a ball. */
export function moonTexture() {
  return once('moon', () => {
    const S = 256;
    const p = new Painter(S, S, 405);
    const g = p.g;
    g.clearRect(0, 0, S, S);
    const R = S * 0.46;
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, R, 0, TAU); g.clip();
    const gr = g.createRadialGradient(S * 0.46, S * 0.44, 4, S / 2, S / 2, R);
    gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.75, '#f6efd2'); gr.addColorStop(1, '#e2d6b0');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    const rng = new Rng(77);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(150,150,160,${rng.range(0.08, 0.2)})`;
      g.beginPath(); g.ellipse(S / 2 + rng.range(-R, R) * 0.7, S / 2 + rng.range(-R, R) * 0.7, rng.range(10, 40), rng.range(8, 30), rng.range(0, 3), 0, TAU); g.fill();
    }
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(120,120,130,0.12)'; g.beginPath(); g.arc(S / 2 + rng.range(-R, R) * 0.85, S / 2 + rng.range(-R, R) * 0.85, rng.range(2, 6), 0, TAU); g.fill(); }
    g.restore();
    const t = p.texture({ wrap: false });
    return t;
  });
}

/** A soft round glow, white in the middle, for halos (tint it with the material colour). */
export function haloTexture() {
  return once('halo', () => {
    const S = 128;
    const p = new Painter(S, S, 406);
    const g = p.g;
    g.clearRect(0, 0, S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return p.texture({ wrap: false });
  });
}

/** A musical note with a soft glow round it, white so it can be tinted. */
export function noteTexture() {
  return once('note', () => {
    const S = 64;
    const p = new Painter(S, S, 407);
    const g = p.g;
    g.clearRect(0, 0, S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(24, 44, 9, 7, -0.4, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(32, 42); g.lineTo(32, 12); g.quadraticCurveTo(40, 18, 46, 26); g.stroke();
    return p.texture({ wrap: false });
  });
}

/** A clump of young rice: thin upright blades on a transparent card (base at the bottom). */
export function riceTexture() {
  return once('rice', () => {
    const p = new Painter(64, 128, 408);
    const g = p.g, rng = p.rng;
    g.clearRect(0, 0, 64, 128);
    g.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const x0 = 32 + rng.range(-5, 5), lean = rng.range(-22, 22), h = rng.range(70, 124);
      g.strokeStyle = css(0x6aa040, rng.range(0.75, 1.25)); g.lineWidth = rng.range(2, 3.5);
      g.beginPath(); g.moveTo(x0, 128); g.quadraticCurveTo(x0 + lean * 0.3, 128 - h * 0.6, x0 + lean, 128 - h); g.stroke();
    }
    return p.texture({ wrap: false });
  });
}

/** A corn plant on a card: a tall stalk with long arching leaves, a cob and a tassel. Base at the bottom. */
export function cornTexture() {
  return once('corn', () => {
    const p = new Painter(128, 256, 409);
    const g = p.g, rng = p.rng;
    g.clearRect(0, 0, 128, 256);
    g.lineCap = 'round';
    g.strokeStyle = '#7a9a40'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(64, 256); g.lineTo(62, 26); g.stroke();
    for (let i = 0; i < 9; i++) {
      const y = 230 - i * 22, s = i % 2 ? 1 : -1, len = rng.range(40, 58);
      g.strokeStyle = css(0x5f8a30, rng.range(0.85, 1.2)); g.lineWidth = rng.range(5, 8);
      g.beginPath(); g.moveTo(63, y); g.quadraticCurveTo(63 + s * len * 0.7, y - 30, 63 + s * len, y + rng.range(-4, 14)); g.stroke();
    }
    g.fillStyle = '#e8c860'; g.beginPath(); g.ellipse(72, 128, 7, 18, 0.25, 0, TAU); g.fill();
    g.fillStyle = '#9ab050'; g.beginPath(); g.ellipse(70, 132, 6, 18, 0.35, 0, TAU); g.fill();
    g.strokeStyle = '#d8b860'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(62, 28); g.lineTo(62 + rng.range(-16, 16), rng.range(4, 14)); g.stroke(); }
    return p.texture({ wrap: false });
  });
}

/** Climbing beans or cucumbers on a bamboo frame: leafy vines on a card. Base at the bottom. */
export function vineTexture() {
  return once('vine', () => {
    const p = new Painter(128, 128, 410);
    const g = p.g, rng = p.rng;
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = '#c8b478'; g.lineWidth = 4;
    for (const x of [16, 64, 112]) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x, 8); g.stroke(); }
    g.beginPath(); g.moveTo(8, 12); g.lineTo(120, 12); g.stroke();
    for (let i = 0; i < 60; i++) {
      const x = rng.range(8, 120), y = rng.range(14, 126);
      g.fillStyle = css(0x4f8a34, rng.range(0.7, 1.25));
      g.beginPath(); g.ellipse(x, y, rng.range(5, 9), rng.range(4, 7), rng.range(0, 3), 0, TAU); g.fill();
    }
    for (let i = 0; i < 10; i++) { g.fillStyle = rng.chance(0.5) ? '#f2d040' : '#3f7a2a'; g.beginPath(); g.ellipse(rng.range(14, 114), rng.range(30, 110), 3, rng.chance(0.5) ? 8 : 3, 0, 0, TAU); g.fill(); }
    return p.texture({ wrap: false });
  });
}

/** Soft drifting mist: tileable cloudy alpha, white. */
export function mistTexture() {
  return once('mist', () => {
    const S = 256;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d')!;
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      // tile the noise by blending four shifted samples
      const u = x / S, v = y / S;
      const n = (fx: number, fy: number) => fbm(fx * 6, fy * 6, 4);
      const a = n(u, v) * (1 - u) * (1 - v) + n(u - 1, v) * u * (1 - v) + n(u, v - 1) * (1 - u) * v + n(u - 1, v - 1) * u * v;
      const k = Math.max(0, Math.min(1, (a - 0.36) * 2.6));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(k * 255);
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Dark tilled soil with furrows and a few stones, tiling. */
export function soilTexture() {
  return once('soil', () => {
    const p = new Painter(128, 128, 411).fill('#4a3424');
    p.dabs({ n: 120, colors: ['#5a4030', '#3a281c', '#64483a'], r: [2, 7], alpha: [0.3, 0.7] });
    p.lines({ n: 8, colors: ['#2a1c12'], alpha: [0.35, 0.5], width: [3, 5], wobble: 2 });
    p.dabs({ n: 30, colors: ['#8a7a6a', '#a09080'], r: [1, 2.5], alpha: [0.5, 0.8] });
    return p.texture({ repeat: [1, 1] });
  });
}

/** A young seedling on a card: a pale stem with two round seed leaves and a first true leaf. Base at the bottom. */
export function sproutTexture() {
  return once('sprout', () => {
    const p = new Painter(64, 128, 412);
    const g = p.g;
    g.clearRect(0, 0, 64, 128);
    g.strokeStyle = '#a8c070'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(32, 128); g.quadraticCurveTo(28, 90, 32, 52); g.stroke();
    const leaf = (x: number, y: number, rx: number, ry: number, rot: number, col: string) => {
      g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(40,80,20,0.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - Math.cos(rot) * rx * 0.8, y - Math.sin(rot) * rx * 0.8); g.lineTo(x + Math.cos(rot) * rx * 0.8, y + Math.sin(rot) * rx * 0.8); g.stroke();
    };
    leaf(18, 54, 15, 8, -0.35, '#6ab840');
    leaf(46, 54, 15, 8, 0.35, '#7cc84a');
    leaf(32, 26, 9, 18, 0.1, '#5aa83a');
    return p.texture({ wrap: false });
  });
}

/** White in the middle fading to black at the edges of a rounded square: an alpha map for soft-edged patches. */
export function softEdgeTexture() {
  return once('softEdge', () => {
    const S = 128;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d')!;
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = Math.abs(x / (S - 1) * 2 - 1), v = Math.abs(y / (S - 1) * 2 - 1);
      const d = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25);
      const a = Math.max(0, Math.min(1, (1 - d) / 0.45));
      const k = a * a * (3 - 2 * a);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(k * 255); img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  });
}

/**
 * Camphor bark, tiling (one tile wraps 6 units round and 6 along): warm dark brown, cut into long braided
 * ridges by deep furrows, with soft green moss in the furrows and pale grey-green lichen spots.
 */
export function camphorBark() {
  return once('camphorBark', () => {
    const S = 256;
    const p = new Painter(S, S, 413).fill('#5e3c24');
    const g = p.g, rng = p.rng;
    p.dabs({ n: 40, colors: ['#6e4a2c', '#53341f', '#7a5232'], r: [14, 40], alpha: [0.2, 0.4], squash: 2.5 });
    // ridges: warm and lighter, braiding as they run along the branch
    for (let i = 0; i < 18; i++) {
      const x0 = rng.range(0, S), w = rng.range(7, 15);
      g.fillStyle = rng.pick(['#8a5e3a', '#7c5434', '#94683e', '#6f4a2c']);
      for (const dx of [0, S, -S]) {
        g.beginPath();
        for (let y = 0; y <= S; y += 16) g.lineTo(dx + x0 + Math.sin(y * 0.031 + i * 1.3) * 7 - w / 2, y);
        for (let y = S; y >= 0; y -= 16) g.lineTo(dx + x0 + Math.sin(y * 0.031 + i * 1.3) * 7 + w / 2, y);
        g.fill();
      }
    }
    // a warm highlight along each ridge, deep furrows between
    p.lines({ n: 26, colors: ['#2a160c', '#341c10'], alpha: [0.45, 0.7], width: [2, 4.5], vertical: true, wobble: 6 });
    p.lines({ n: 18, colors: ['#b08050', '#a07448'], alpha: [0.18, 0.32], width: [1, 2], vertical: true, wobble: 5 });
    // moss in soft patches, lichen in small pale spots
    p.dabs({ n: 34, colors: ['#4f7a2c', '#5f8a34', '#6a9a3a'], r: [4, 12], alpha: [0.35, 0.6], squash: 2 });
    p.dabs({ n: 70, colors: ['#a8b48c', '#bcc4a0', '#94a882'], r: [1.5, 4.5], alpha: [0.45, 0.75] });
    return p.texture({ repeat: [1, 1] });
  });
}
