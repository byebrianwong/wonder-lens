import * as THREE from 'three';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU, fbm, smoothstep } from '../../../engine/math';
import { css, sphereFur } from '../../ghibli/characterTextures';

/*
 * Painted textures for the Forest Spirit's wood: cedar bark, moss, fern fronds, hanging moss, mist, light
 * shafts, and the Forest Spirit's spotted coat and face. Each is made once and shared.
 */

const cache = new Map<string, THREE.Texture>();
function once(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

/** Soft dabs that wrap across all four edges, so the texture tiles both ways. */
function tileDabs(g: CanvasRenderingContext2D, W: number, H: number, rng: Rng, o: { n: number; colors: string[]; r: [number, number]; alpha: [number, number]; squash?: number }) {
  for (let i = 0; i < o.n; i++) {
    const x = rng.range(0, W), y = rng.range(0, H), r = rng.range(o.r[0], o.r[1]);
    g.globalAlpha = rng.range(o.alpha[0], o.alpha[1]);
    g.fillStyle = rng.pick(o.colors);
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
      if (x + dx + r < 0 || x + dx - r > W || y + dy + r < 0 || y + dy - r > H) continue;
      g.beginPath(); g.ellipse(x + dx, y + dy, r, r * (o.squash ?? 1), 0, 0, TAU); g.fill();
    }
  }
  g.globalAlpha = 1;
}

/**
 * Cedar bark: reddish-brown fibrous ribbons running up the trunk with dark furrows between them and a
 * little grey lichen. Tiles both ways; one tile is meant to cover about 6 units round and 12 units up.
 */
export function cedarBark() {
  return once('bark', () => {
    const W = 256, H = 512;
    const p = new Painter(W, H, 811).fill('#4a2a20');
    const g = p.g, rng = p.rng;
    // ribbons of bark: wavy strips the full height of the tile (the wave repeats exactly once per tile, so it wraps)
    for (let i = 0; i < 40; i++) {
      const x0 = rng.range(0, W), w = rng.range(5, 15), ph = rng.range(0, TAU), amp = rng.range(2, 6), k = rng.int(1, 2);
      g.fillStyle = css(rng.pick([0x7a4632, 0x8a563c, 0x6a3a2a, 0x965f44, 0x744838]), rng.range(0.85, 1.1));
      for (const dx of [0, W, -W]) {
        g.beginPath();
        for (let y = 0; y <= H; y += 16) g.lineTo(dx + x0 + Math.sin((y / H) * TAU * k + ph) * amp - w / 2, y);
        for (let y = H; y >= 0; y -= 16) g.lineTo(dx + x0 + Math.sin((y / H) * TAU * k + ph) * amp + w / 2 + Math.sin(y * 0.05 + i) * 1.2, y);
        g.fill();
      }
    }
    // fine fibres and dark furrows
    p.lines({ n: 110, colors: ['#a06c4c', '#b07a56', '#5e3628'], alpha: [0.15, 0.4], width: [0.6, 1.6], vertical: true, wobble: 3 });
    p.lines({ n: 36, colors: ['#24140e', '#301c14'], alpha: [0.45, 0.8], width: [1.5, 3.5], vertical: true, wobble: 4 });
    // grey-green lichen and a few pale flakes
    tileDabs(g, W, H, rng, { n: 70, colors: ['#8a9a7a', '#a4ac8c', '#6f8466'], r: [2, 8], alpha: [0.15, 0.4], squash: 1.8 });
    tileDabs(g, W, H, rng, { n: 40, colors: ['#c09070', '#b08466'], r: [1, 3], alpha: [0.3, 0.6], squash: 3 });
    const t = p.texture({ repeat: [1, 1] });
    return t;
  });
}

/** Thick moss: deep green with brighter tufts and dark hollows. Tiles both ways. */
export function mossTexture() {
  return once('moss', () => {
    const W = 256;
    const p = new Painter(W, W, 821).fill('#3a6a2c');
    const g = p.g, rng = p.rng;
    tileDabs(g, W, W, rng, { n: 90, colors: ['#2a5424', '#24461e', '#33602a'], r: [10, 30], alpha: [0.25, 0.5] });
    tileDabs(g, W, W, rng, { n: 160, colors: ['#5a8c34', '#6c9c3c', '#4f8030'], r: [4, 14], alpha: [0.3, 0.6] });
    tileDabs(g, W, W, rng, { n: 500, colors: ['#86b04a', '#9ac058', '#6e9a3e', '#2c4a22'], r: [1, 3.2], alpha: [0.35, 0.8] });
    return p.texture({ repeat: [1, 1] });
  });
}

/**
 * A fern frond pointing up the canvas (transparent background): a stem with paired leaflets that shrink to
 * the tip. Painted pale, so each fern's own (instance) colour sets its green.
 */
export function fernTexture() {
  return once('fern', () => {
    const W = 128, H = 256;
    const p = new Painter(W, H, 831);
    const g = p.g, rng = p.rng;
    g.clearRect(0, 0, W, H);
    const n = 20;
    for (let i = 0; i < n; i++) {
      const t = i / n, y = H - 8 - t * (H - 16);
      const len = (1 - t) ** 0.8 * 54 + 5, wid = len * 0.32;
      for (const s of [-1, 1]) {
        g.save(); g.translate(W / 2 + s * 2, y); g.rotate(s * (1.05 - t * 0.35));
        g.fillStyle = css(rng.pick([0xd8f0c4, 0xe4f6d0, 0xcce8b6]), 0.92 + t * 0.08);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -wid, len, 0); g.quadraticCurveTo(len * 0.5, wid, 0, 0); g.fill();
        // little lobes along each leaflet
        g.fillStyle = 'rgba(80,110,60,0.4)';
        g.fillRect(len * 0.1, -0.6, len * 0.8, 1.2);
        g.restore();
      }
    }
    g.strokeStyle = '#a8c890'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 6); g.stroke();
    const t = p.texture({ wrap: false });
    return t;
  });
}

/** Strands of hanging lichen, long and pale, from the top of the canvas (transparent background). */
export function hangingMossTexture() {
  return once('hangmoss', () => {
    const W = 64, H = 256;
    const p = new Painter(W, H, 841);
    const g = p.g, rng = p.rng;
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x0 = rng.range(6, W - 6), len = rng.range(0.35, 1) * H, ph = rng.range(0, TAU);
      g.strokeStyle = css(rng.pick([0xa8b89a, 0x92a686, 0xbcc8a8, 0x7a8c6c]));
      g.lineWidth = rng.range(1, 2.6);
      g.globalAlpha = rng.range(0.6, 1);
      g.beginPath(); g.moveTo(x0, 0);
      for (let y = 0; y <= len; y += 8) g.lineTo(x0 + Math.sin(y * 0.06 + ph) * 3 * (y / H), y);
      g.stroke();
    }
    g.globalAlpha = 1;
    return p.texture({ wrap: false });
  });
}

/** A soft, uneven puff of mist: white, with its shape in the alpha channel; wider than tall and flat underneath. */
export function mistTexture() {
  return once('mist', () => {
    const S = 128;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d')!;
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / (S - 1) * 2 - 1, v = y / (S - 1) * 2 - 1;
      // wider than tall, flat underneath, ragged on top
      const r = Math.hypot(u, v * 1.15);
      const n = fbm(u * 2.2 + 3, v * 2.2 + 7, 4);
      const a = (1 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.5)) * smoothstep(1.0, 0.55, v) * (0.55 + 0.45 * n);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** A soft beam: bright at the top, fading down and towards both edges (white, in the alpha channel). */
export function beamTexture() {
  return once('beam', () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d')!;
    const img = g.createImageData(64, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
      const u = x / 63, v = y / 127;
      const a = Math.pow(Math.sin(u * Math.PI), 1.8) * Math.pow(1 - v, 0.7) * smoothstep(0, 0.1, v);
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  });
}

/**
 * The Forest Spirit's coat on a sphere facing +z (the body is stretched along z): warm red-brown, darker
 * along the back, a cream belly, and rows of pale spots along the back and flanks like a fawn's.
 */
export function deerCoat() {
  return once('coat', () => {
    const W = 1024;
    const coat = 0x8a4c2e;
    const p = sphereFur(coat, 851, { w: W, contrast: 1.1, warm: 0xffd8b0 });
    // a cream belly underneath
    p.vgrad([[0, 'rgba(0,0,0,0)'], [0.66, 'rgba(0,0,0,0)'], [0.82, 'rgba(232,206,170,0.75)'], [1, 'rgba(240,222,192,0.95)']]);
    // a darker line along the spine
    p.vgrad([[0, 'rgba(60,30,18,0.55)'], [0.16, 'rgba(60,30,18,0.2)'], [0.3, 'rgba(0,0,0,0)']]);
    // rows of soft pale spots on both flanks
    const rng = new Rng(853);
    for (const s of [-1, 1]) for (let row = 0; row < 4; row++) {
      const lift = 0.3 + row * 0.2;
      for (let k = 0; k < 11 - row; k++) {
        const along = -0.95 + (k + rng.range(0.1, 0.9)) * (1.9 / (11 - row));
        const d: [number, number, number] = [s * Math.sin(lift) * 0.9, Math.cos(lift), along];
        const r = rng.range(7, 12) * (1 - row * 0.12);
        p.at(d, (g) => {
          g.fillStyle = 'rgba(246,234,210,0.9)';
          g.beginPath(); g.ellipse(0, 0, r * 1.3, r, rng.range(-0.3, 0.3), 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,248,232,0.6)';
          g.beginPath(); g.ellipse(-r * 0.2, -r * 0.2, r * 0.6, r * 0.45, 0, 0, TAU); g.fill();
        });
      }
    }
    return p.texture();
  });
}

/**
 * The Forest Spirit's head on a sphere facing +z: a short coat over the skull and, on the flat front, a
 * strange red face that is almost human: calm dark eyes set side by side under a smooth brow, a short
 * nose and a small closed mouth. Shared by the Night-Walker, which wears the same face.
 */
export function spiritFace() {
  return once('face', () => {
    const p = sphereFur(0x7a4428, 861, { w: 1024, contrast: 0.9 });
    // the face: a broad red mask over the whole front, with a soft edge into the coat
    p.at([0, 0.02, 1], (c) => {
      const gr = c.createRadialGradient(0, 6, 0, 0, 6, 170);
      gr.addColorStop(0, 'rgba(214,92,64,1)'); gr.addColorStop(0.55, 'rgba(198,80,56,1)'); gr.addColorStop(0.85, 'rgba(170,70,48,0.85)'); gr.addColorStop(1, 'rgba(150,66,44,0)');
      c.fillStyle = gr; c.beginPath(); c.ellipse(0, 6, 150, 175, 0, 0, TAU); c.fill();
    });
    // a lighter brow and cheeks, so the face reads as a face from a distance
    p.at([0, 0.28, 0.96], (c) => {
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 90);
      gr.addColorStop(0, 'rgba(236,128,96,0.6)'); gr.addColorStop(1, 'rgba(236,128,96,0)');
      c.fillStyle = gr; c.beginPath(); c.ellipse(0, 0, 110, 50, 0, 0, TAU); c.fill();
    });
    for (const s of [-1, 1]) p.at([s * 0.38, -0.08, 0.92], (c) => {
      const gr = c.createRadialGradient(0, 0, 0, 0, 0, 50);
      gr.addColorStop(0, 'rgba(232,116,86,0.55)'); gr.addColorStop(1, 'rgba(232,116,86,0)');
      c.fillStyle = gr; c.beginPath(); c.ellipse(0, 0, 50, 36, 0, 0, TAU); c.fill();
    });
    // calm dark eyes: almond shaped, a heavy upper lid, a soft warm gleam, a pale rim so they show on the red
    for (const s of [-1, 1]) {
      p.at([s * 0.33, 0.2, 0.92], (c) => {
        c.fillStyle = 'rgba(250,206,170,0.55)';
        c.beginPath(); c.ellipse(0, 2, 42, 24, 0, 0, TAU); c.fill();
        c.fillStyle = '#140a08';
        c.beginPath(); c.moveTo(-36, 4); c.quadraticCurveTo(-4, -22, 36, 0); c.quadraticCurveTo(4, 20, -36, 4); c.fill();
        c.fillStyle = 'rgba(190,120,80,0.7)';
        c.beginPath(); c.ellipse(-6 * s, -4, 6, 4.5, 0, 0, TAU); c.fill();
        // the upper lid, half lowered: a calm look
        c.strokeStyle = '#3a140c'; c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-40, 2); c.quadraticCurveTo(-4, -26, 40, -2); c.stroke();
        c.strokeStyle = 'rgba(80,24,14,0.6)'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-30, 10); c.quadraticCurveTo(0, 18, 30, 8); c.stroke();
      });
    }
    // a short nose: a soft ridge between the eyes ending in two small nostrils
    p.at([0, 0.02, 1], (c) => {
      const gr = c.createLinearGradient(-16, 0, 16, 0);
      gr.addColorStop(0, 'rgba(238,140,104,0)'); gr.addColorStop(0.5, 'rgba(240,146,110,0.7)'); gr.addColorStop(1, 'rgba(238,140,104,0)');
      c.fillStyle = gr; c.fillRect(-16, -40, 32, 60);
    });
    for (const s of [-1, 1]) p.at([s * 0.06, -0.14, 0.99], (c) => { c.fillStyle = '#4a1a10'; c.beginPath(); c.ellipse(0, 0, 8, 5, s * 0.4, 0, TAU); c.fill(); });
    // a small closed mouth
    p.at([0, -0.32, 0.95], (c) => {
      c.strokeStyle = '#5a1c12'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-22, 0); c.quadraticCurveTo(0, 5, 22, 0); c.stroke();
    });
    return p.texture();
  });
}
