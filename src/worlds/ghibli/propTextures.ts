import * as THREE from 'three';
import { Rng } from '../../engine/math';
import { Painter } from '../../engine/Paint';
import { css } from './characterTextures';

/**
 * Painted textures for the sea train, the bathhouse and other Ghibli buildings and props. Tiling textures
 * are meant for geometry whose UVs are in world units (see boxUV and repeatUV in engine/Paint.ts); each
 * says how many units one tile covers.
 */

/** Painted steel body panel, one tile = one 1.6 x 1.6 unit panel: seams with rivets, a little grime. */
export function trainPanels(color: number) {
  const S = 256;
  const p = new Painter(S, S, 301).fill(css(color));
  const g = p.g, rng = p.rng;
  p.dabs({ n: 40, colors: [css(color, 1.08), css(color, 0.93)], r: [10, 40], alpha: [0.08, 0.18], squash: 0.6 });
  // seams on the left and top edges of the panel
  g.fillStyle = css(color, 0.55); g.fillRect(0, 0, 3, S); g.fillRect(0, 0, S, 3);
  g.fillStyle = css(color, 1.3); g.fillRect(3, 3, 2, S - 3); g.fillRect(3, 3, S - 3, 2);
  // rivet rows beside each seam
  const rivet = (x: number, y: number) => {
    g.fillStyle = css(color, 0.6); g.beginPath(); g.arc(x + 0.8, y + 0.8, 3.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = css(color, 1.35); g.beginPath(); g.arc(x - 0.6, y - 0.6, 2.4, 0, Math.PI * 2); g.fill();
  };
  for (let y = 14; y < S; y += 20) rivet(12, y);
  for (let x = 24; x < S; x += 20) rivet(x, 12);
  // grime and rust weeping down from a few rivets
  for (let i = 0; i < 5; i++) {
    const x = 24 + rng.int(0, 10) * 20, len = rng.range(30, 110);
    const gr = g.createLinearGradient(0, 14, 0, 14 + len);
    gr.addColorStop(0, 'rgba(90,60,40,0.35)'); gr.addColorStop(1, 'rgba(90,60,40,0)');
    g.fillStyle = gr; g.fillRect(x - 2, 14, 4, len);
  }
  return p.texture({ repeat: [1, 1] });
}

/** Chalky cream paint for the belt line, tiles every 1.6 units. */
export function creamPaint(color: number) {
  const p = new Painter(128, 128, 302).fill(css(color));
  p.dabs({ n: 30, colors: [css(color, 1.04), css(color, 0.92)], r: [6, 20], alpha: [0.1, 0.2], squash: 0.5 });
  p.g.fillStyle = css(color, 0.7); p.g.fillRect(0, 0, 128, 3); p.g.fillRect(0, 125, 128, 3);
  return p.texture({ repeat: [1, 1] });
}

/** Tarred canvas roof across a half cylinder: one tile = one bay between ribs. */
export function trainRoof(color: number) {
  const p = new Painter(256, 64, 303).fill(css(color));
  p.lines({ n: 20, colors: [css(color, 1.2), css(color, 0.8)], alpha: [0.15, 0.35], width: [1, 3], wobble: 1 });
  const g = p.g;
  // a raised rib at the start of each bay
  g.fillStyle = css(color, 0.6); g.fillRect(0, 0, 256, 6);
  g.fillStyle = css(color, 1.45); g.fillRect(0, 6, 256, 3);
  // soot darkening towards the eaves
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(0.2, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
  return p.texture({ repeat: [1, 1] });
}

/**
 * Deck boards running along the texture's v direction. With world-unit UVs one tile covers 1 unit across
 * (five boards) and 2 units along. Boards vary in tone and show grain, knots and nail heads.
 */
export function deckPlanks(color: number) {
  const W = 256, H = 512;
  const p = new Painter(W, H, 304).fill(css(color, 0.45));
  const g = p.g, rng = p.rng;
  const n = 5, bw = W / n;
  for (let i = 0; i < n; i++) {
    const x = i * bw;
    // each column holds two or three boards end to end, with the joints staggered between columns
    let y = -rng.range(0, 200);
    while (y < H) {
      const len = rng.range(180, 320);
      const tone = rng.range(0.9, 1.12);
      g.fillStyle = css(color, tone); g.fillRect(x + 1.5, y + 1, bw - 3, len - 2);
      for (let k = 0; k < 8; k++) {
        g.strokeStyle = css(color, tone * rng.range(0.72, 0.86)); g.globalAlpha = rng.range(0.2, 0.45); g.lineWidth = rng.range(0.8, 1.6);
        const gx = x + 4 + rng.range(0, bw - 8);
        g.beginPath(); g.moveTo(gx, Math.max(0, y));
        for (let yy = Math.max(0, y); yy <= Math.min(H, y + len); yy += 24) g.lineTo(gx + Math.sin(yy * 0.03 + k + i) * 2, yy);
        g.stroke();
      }
      g.globalAlpha = 1;
      if (rng.chance(0.4)) { g.fillStyle = css(color, tone * 0.62); g.beginPath(); g.ellipse(x + bw / 2 + rng.range(-8, 8), y + rng.range(30, len - 30), 3.5, 8, 0, 0, Math.PI * 2); g.fill(); }
      // nail heads at both ends of the board
      g.fillStyle = 'rgba(40,34,30,0.8)';
      for (const ny of [y + 8, y + len - 8]) for (const dx of [8, bw - 8]) { g.beginPath(); g.arc(x + dx, ny, 1.6, 0, Math.PI * 2); g.fill(); }
      y += len;
    }
  }
  // wear: long faint streaks along the boards
  p.lines({ n: 26, colors: ['rgba(255,236,200,1)', 'rgba(50,34,20,1)'], alpha: [0.04, 0.09], width: [6, 18], vertical: true, wobble: 3 });
  const t = p.texture({ repeat: [1, 0.5] });
  t.anisotropy = 16;
  return t;
}

/** A lit carriage window: glass glowing warm behind a wooden frame with a sash bar and a curtain. */
export function trainWindow() {
  const W = 128, H = 100;
  const col = new Painter(W, H, 305).fill('#5a3e28');
  const glow = new Painter(W, H, 306).fill('#000');
  const pane = (p: Painter, lit: boolean) => {
    const g = p.g;
    const gr = g.createLinearGradient(0, 8, 0, H - 8);
    gr.addColorStop(0, lit ? '#ffd592' : '#fff0c8'); gr.addColorStop(1, lit ? '#ffb85c' : '#ffe0a0');
    g.fillStyle = gr; g.fillRect(8, 8, W - 16, H - 16);
    // curtain gathered at the top, and the sash bar
    g.fillStyle = lit ? 'rgba(120,40,30,0.7)' : '#a8503e';
    g.beginPath(); g.moveTo(8, 8); g.lineTo(W - 8, 8); g.lineTo(W - 8, 20); g.quadraticCurveTo(W / 2, 30, 8, 20); g.fill();
    g.fillStyle = lit ? '#000' : '#5a3e28'; g.fillRect(8, H * 0.55, W - 16, 5); g.fillRect(W / 2 - 2, 8, 4, H - 16);
  };
  pane(col, false); pane(glow, true);
  col.lines({ n: 12, colors: ['#3a2818', '#7a5a3a'], alpha: [0.2, 0.4], width: [1, 2], vertical: true });
  return { map: col.texture({ wrap: false }), glow: glow.texture({ wrap: false }) };
}

/** Warm varnished wood panelling for the cabin walls: vertical boards above a darker wainscot. */
export function cabinPanels() {
  const p = new Painter(128, 128, 307).fill('#c9a878');
  const g = p.g;
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(90,60,30,0.45)'; g.fillRect(i * 21.3, 0, 2, 128); }
  p.lines({ n: 20, colors: ['#a88458', '#dcc098'], alpha: [0.2, 0.4], width: [1, 2], vertical: true });
  g.fillStyle = '#7a5434'; g.fillRect(0, 84, 128, 44);
  g.fillStyle = '#e8d0a0'; g.fillRect(0, 82, 128, 4);
  return p.texture({ repeat: [1, 1] });
}

/** Overlapping slate or copper scales for a spire (cone: tip at the top). */
export function slate(color: number) {
  const p = new Painter(256, 256, 312).fill(css(color, 0.8));
  const g = p.g;
  for (let r = 0; r < 16; r++) for (let c = 0; c < 17; c++) {
    const x = (c + (r % 2) * 0.5) * 16, y = r * 16;
    g.fillStyle = css(color, p.rng.range(0.9, 1.12));
    g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.lineTo(x + 8, y + 12); g.quadraticCurveTo(x, y + 18, x - 8, y + 12); g.fill();
  }
  p.lines({ n: 16, colors: ['rgba(255,255,255,1)'], alpha: [0.04, 0.1], width: [3, 8], vertical: true });
  return p.texture({ repeat: [1, 1] });
}

/** Deeply furrowed bark with moss in the cracks; one tile wraps a 6 unit circumference and 6 units of height. */
export function barkTexture(color: number) {
  const p = new Painter(256, 256, 315).fill(css(color, 0.75));
  const g = p.g, rng = p.rng;
  // ridges of bark between darker furrows, braiding as they run up the trunk
  for (let i = 0; i < 22; i++) {
    const x0 = rng.range(0, 256), w = rng.range(6, 16);
    g.fillStyle = css(color, rng.range(0.95, 1.2));
    // drawn again one canvas-width over so ridges wrap cleanly around the trunk
    for (const dx of [0, 256, -256]) {
      g.beginPath();
      for (let y = 0; y <= 256; y += 16) g.lineTo(dx + x0 + Math.sin(y * 0.03 + i) * 6 - w / 2, y);
      for (let y = 256; y >= 0; y -= 16) g.lineTo(dx + x0 + Math.sin(y * 0.03 + i) * 6 + w / 2, y);
      g.fill();
    }
  }
  p.lines({ n: 30, colors: [css(color, 0.5)], alpha: [0.3, 0.6], width: [1.5, 3.5], vertical: true, wobble: 5 });
  p.dabs({ n: 60, colors: ['#5a7a3c', '#4a6a32', '#6f8c46'], r: [3, 10], alpha: [0.2, 0.5], squash: 2.2 });
  return p.texture({ repeat: [1, 1] });
}

/** Vermilion lacquer for torii posts (cylinder: black band at the foot), with sun-faded streaks. */
export function vermilion() {
  const p = new Painter(64, 256, 316).fill('#c8402c');
  p.lines({ n: 14, colors: ['#e05a3c', '#a83222'], alpha: [0.15, 0.35], width: [1, 4], vertical: true, wobble: 1 });
  p.g.fillStyle = '#1e1c1c'; p.g.fillRect(0, 232, 64, 24);
  return p.texture();
}

/** Weathered granite: speckled grey with lichen and moss, darker towards the ground. */
export function granite(color: number, seed = 317) {
  const p = new Painter(128, 128, seed).fill(css(color));
  p.dabs({ n: 260, colors: [css(color, 1.2), css(color, 0.75), css(color, 0.9)], r: [0.8, 2.2], alpha: [0.4, 0.8] });
  p.dabs({ n: 26, colors: ['#8a9a5a', '#a8a878', '#5f7a40'], r: [3, 9], alpha: [0.2, 0.45] });
  p.vgrad([[0, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(40,50,30,0.35)']]);
  return p.texture({ repeat: [1, 1] });
}

/** A rectangle in texture space. */
export interface UvRect { u0: number; v0: number; u1: number; v1: number }

/** Grey clay roof tiles in overlapping rows (tileable). Tinted per roof. */
export function roofTileTexture(seed = 3) {
  const rng = new Rng(seed);
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b8b2aa'; g.fillRect(0, 0, S, S);
  const rows = 8, cols = 8, th = S / rows, tw = S / cols;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? tw / 2 : 0;
    for (let k = -1; k <= cols; k++) {
      const x = k * tw + off, y = r * th;
      const v = Math.round(rng.range(200, 240));
      const gr = g.createLinearGradient(x, 0, x + tw, 0);
      gr.addColorStop(0, `rgb(${v - 40},${v - 42},${v - 44})`); gr.addColorStop(0.45, `rgb(${v},${v - 3},${v - 6})`); gr.addColorStop(1, `rgb(${v - 55},${v - 58},${v - 60})`);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(x + 1, y);
      g.lineTo(x + tw - 1, y);
      g.lineTo(x + tw - 1, y + th - 4);
      g.quadraticCurveTo(x + tw / 2, y + th + 3, x + 1, y + th - 4);
      g.closePath(); g.fill();
      // shadow cast by the row above
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, y, tw, 3);
    }
  }
  // moss and weathering
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${rng.chance(0.5) ? '90,110,60' : '60,50,40'},${rng.range(0.04, 0.1)})`; g.beginPath(); g.ellipse(rng.range(0, S), rng.range(0, S), rng.range(4, 18), rng.range(3, 10), 0, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
