import * as THREE from 'three';
import { Rng } from '../../engine/math';

/**
 * Painted facade atlas for Koriko's townhouses.
 *
 * One 1024x1024 texture holds cells of 128x160 px, each one bay wide and one storey tall (2.4 x 3.0 world
 * units). Walls are painted near-white and marked in the alpha channel, so each house can tint its walls with
 * its own colour through vertex colours while windows, shutters, doors and signs keep their painted colours.
 */

export const CELL_W = 128;
export const CELL_H = 160;
const SIZE = 1024;

export type CellKind = 'upper' | 'upperPlain' | 'ground' | 'shop' | 'side' | 'attic' | 'dormer' | 'back' | 'awning';

export interface UvRect { u0: number; v0: number; u1: number; v1: number }

export interface FacadeAtlas {
  texture: THREE.DataTexture;
  cells: Record<CellKind, UvRect[]>;
}

const SHUTTERS = ['#3f6f58', '#3e5f82', '#8a4a3a', '#5f8f8a', '#b8913e', '#4c6a48'];
const DOORS = ['#6b4630', '#3f6a58', '#3d587a', '#8a3a30', '#5a4a3a', '#6f7d4a'];
const FLOWERS = ['#e0474c', '#f07aa0', '#f4f0e6', '#f2b63d', '#c95f9c'];
const AWNINGS: [string, string][] = [['#c94b3f', '#f4efe2'], ['#3f6f8a', '#f4efe2'], ['#4f7f58', '#f1e9d2'], ['#d9a23c', '#f6efdc'], ['#8a3f5a', '#f2e6e0'], ['#2f5a4a', '#e8dcc0'], ['#c4623a', '#f3e2c8'], ['#5a4f8a', '#efe8f2']];

export function buildFacadeAtlas(seed = 7): FacadeAtlas {
  const rng = new Rng(seed);
  const col = document.createElement('canvas'); col.width = col.height = SIZE;
  const msk = document.createElement('canvas'); msk.width = msk.height = SIZE;
  const c = col.getContext('2d', { willReadFrequently: true })!;
  const m = msk.getContext('2d', { willReadFrequently: true })!;
  m.fillStyle = '#fff'; m.fillRect(0, 0, SIZE, SIZE);

  // --- drawing helpers: every "detail" shape is painted in colour and blacked out in the wall mask ---
  const detail = (draw: (g: CanvasRenderingContext2D, isMask: boolean) => void) => {
    c.save(); draw(c, false); c.restore();
    m.save(); m.fillStyle = '#000'; m.strokeStyle = '#000'; draw(m, true); m.restore();
  };
  const rect = (x: number, y: number, w: number, h: number, fill: string) => detail((g, isMask) => { if (!isMask) g.fillStyle = fill; g.fillRect(x, y, w, h); });
  /** painted-on shading that should darken the wall but keep it tinted (only drawn on the colour canvas) */
  const wash = (x: number, y: number, w: number, h: number, fill: string) => { c.fillStyle = fill; c.fillRect(x, y, w, h); };

  const wall = (x0: number, y0: number, w: number, h: number, dark = 0) => {
    const base = 242 - dark;
    c.fillStyle = `rgb(${base},${base - 2},${base - 6})`;
    c.fillRect(x0, y0, w, h);
    // soft plaster blotches and a faint weathering gradient towards the bottom
    for (let i = 0; i < 26; i++) {
      const v = rng.chance(0.5) ? 255 : 120;
      c.fillStyle = `rgba(${v},${v},${v - 10},${rng.range(0.03, 0.07)})`;
      c.beginPath(); c.ellipse(x0 + rng.range(0, w), y0 + rng.range(0, h), rng.range(6, 26), rng.range(4, 14), rng.range(0, 3), 0, Math.PI * 2); c.fill();
    }
    const gr = c.createLinearGradient(0, y0, 0, y0 + h);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.06)');
    c.fillStyle = gr; c.fillRect(x0, y0, w, h);
  };

  const glass = (x: number, y: number, w: number, h: number, arch = false) => detail((g, isMask) => {
    g.beginPath();
    if (arch) { g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); }
    else g.rect(x, y, w, h);
    if (!isMask) {
      const gr = g.createLinearGradient(x, y, x + w, y + h);
      gr.addColorStop(0, '#2f3d4f'); gr.addColorStop(0.55, '#4b6179'); gr.addColorStop(1, '#6a8198');
      g.fillStyle = gr;
    }
    g.fill();
    if (!isMask) {
      // sky reflection and the shadow of the frame on the glass
      g.save(); g.clip();
      g.fillStyle = 'rgba(210,228,245,0.22)';
      g.beginPath(); g.moveTo(x + w * 0.55, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h * 0.35); g.lineTo(x + w * 0.2, y + h); g.lineTo(x, y + h); g.closePath(); g.fill();
      g.fillStyle = 'rgba(10,15,25,0.35)'; g.fillRect(x, y, w, 5); g.fillRect(x, y, 4, h);
      g.restore();
    }
  });
  const frame = (x: number, y: number, w: number, h: number, cols: number, rows: number, arch = false, frameCol = '#f4efe4') => {
    // outer frame, glass, glazing bars, sill
    detail((g, isMask) => {
      if (!isMask) g.fillStyle = frameCol;
      g.beginPath();
      if (arch) { g.moveTo(x - 5, y + h + 5); g.lineTo(x - 5, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2 + 5, Math.PI, 0); g.lineTo(x + w + 5, y + h + 5); g.closePath(); }
      else g.rect(x - 5, y - 5, w + 10, h + 10);
      g.fill();
    });
    glass(x, y, w, h, arch);
    const bar = 2.5;
    for (let i = 1; i < cols; i++) rect(x + (w * i) / cols - bar / 2, y + (arch ? w * 0.3 : 0), bar, h - (arch ? w * 0.3 : 0), frameCol);
    for (let j = 1; j < rows; j++) rect(x, y + (h * j) / rows - bar / 2, w, bar, frameCol);
    // sill with its shadow on the wall
    rect(x - 9, y + h + 5, w + 18, 6, '#e2d8c4');
    wash(x - 8, y + h + 11, w + 16, 5, 'rgba(40,30,20,0.16)');
    // lintel shadow
    if (!arch) wash(x - 5, y - 9, w + 10, 4, 'rgba(40,30,20,0.08)');
  };
  const shutters = (x: number, y: number, w: number, h: number, color: string) => {
    const sw = w * 0.52;
    for (const sx of [x - sw - 7, x + w + 7]) {
      rect(sx, y - 3, sw, h + 6, color);
      for (let k = 6; k < h; k += 7) wash(sx + 2, y + k, sw - 4, 2, 'rgba(0,0,0,0.18)');
      wash(sx, y - 3, 2, h + 6, 'rgba(255,255,255,0.12)');
    }
  };
  const flowerBox = (x: number, y: number, w: number) => {
    rect(x - 8, y, w + 16, 10, rng.chance(0.5) ? '#9a5a3a' : '#6b7a4a');
    for (let i = 0; i < 22; i++) {
      const fx = x - 6 + rng.range(0, w + 12), fy = y - rng.range(0, 12), fr = rng.range(3, 5);
      const lc = rng.chance(0.45) ? '#4f7f3a' : '#3f6a30';
      detail((g, isMask) => { if (!isMask) g.fillStyle = lc; g.beginPath(); g.arc(fx, fy + 3, fr, 0, Math.PI * 2); g.fill(); });
    }
    for (let i = 0; i < 16; i++) {
      const fx = x - 5 + rng.range(0, w + 10), fy = y - rng.range(2, 13), fr = rng.range(2, 3.4);
      const fc = rng.pick(FLOWERS);
      detail((g, isMask) => { if (!isMask) g.fillStyle = fc; g.beginPath(); g.arc(fx, fy, fr, 0, Math.PI * 2); g.fill(); });
    }
    wash(x - 8, y + 10, w + 16, 5, 'rgba(40,30,20,0.18)');
  };
  const plinth = (x0: number, y0: number, w: number) => {
    rect(x0, y0 + CELL_H - 16, w, 16, '#b9ad98');
    for (let i = 0; i < 5; i++) wash(x0 + rng.range(0, w), y0 + CELL_H - 16 + rng.range(0, 12), rng.range(8, 20), 2, 'rgba(0,0,0,0.12)');
    wash(x0, y0 + CELL_H - 18, w, 2, 'rgba(0,0,0,0.1)');
  };

  const cells: Record<CellKind, UvRect[]> = { upper: [], upperPlain: [], ground: [], shop: [], side: [], attic: [], dormer: [], back: [], awning: [] };
  // flip v so canvas "up" is texture "up" (rows are flipped when copied into the DataTexture below)
  const uv = (x: number, y: number, w: number, h: number): UvRect => ({ u0: (x + 0.5) / SIZE, u1: (x + w - 0.5) / SIZE, v0: 1 - (y + h - 0.5) / SIZE, v1: 1 - (y + 0.5) / SIZE });
  const cell = (col_: number, row: number) => [col_ * CELL_W, row * CELL_H] as const;

  // row 0: upper floor windows with shutters, half of them with window boxes
  for (let i = 0; i < 8; i++) {
    const [x0, y0] = cell(i, 0);
    wall(x0, y0, CELL_W, CELL_H);
    const ww = 40, wh = 78, wx = x0 + (CELL_W - ww) / 2, wy = y0 + 38;
    shutters(wx, wy, ww, wh, SHUTTERS[i % SHUTTERS.length]);
    frame(wx, wy, ww, wh, 2, 3);
    if (i % 2 === 1) flowerBox(wx, wy + wh + 11, ww);
    cells.upper.push(uv(x0, y0, CELL_W, CELL_H));
  }
  // row 1: plain framed windows, arched windows, small balconies
  for (let i = 0; i < 8; i++) {
    const [x0, y0] = cell(i, 1);
    wall(x0, y0, CELL_W, CELL_H);
    if (i < 3) { const ww = 46, wh = 82; frame(x0 + (CELL_W - ww) / 2, y0 + 36, ww, wh, 2, 3); if (i === 2) flowerBox(x0 + (CELL_W - ww) / 2, y0 + 36 + wh + 11, ww); }
    else if (i < 5) { const ww = 44, wh = 86; frame(x0 + (CELL_W - ww) / 2, y0 + 32, ww, wh, 2, 3, true); }
    else if (i < 7) {
      // french window with a little wrought-iron balcony
      const ww = 44, wh = 104, wx = x0 + (CELL_W - ww) / 2, wy = y0 + 30;
      frame(wx, wy, ww, wh, 2, 4);
      rect(wx - 14, wy + wh - 30, ww + 28, 4, '#2f3134');
      for (let k = 0; k <= 12; k++) rect(wx - 14 + k * ((ww + 28) / 12), wy + wh - 30, 2, 34, '#2f3134');
      rect(wx - 16, wy + wh + 4, ww + 32, 6, '#c9bfae');
      wash(wx - 16, wy + wh + 10, ww + 32, 6, 'rgba(40,30,20,0.2)');
      if (i === 6) flowerBox(wx - 4, wy + wh - 32, ww + 8);
    } else {
      // two narrow windows
      for (const dx of [-24, 24]) frame(x0 + CELL_W / 2 + dx - 13, y0 + 40, 26, 70, 1, 3);
    }
    cells.upperPlain.push(uv(x0, y0, CELL_W, CELL_H));
  }
  // row 2: ground floor with doors and windows
  for (let i = 0; i < 8; i++) {
    const [x0, y0] = cell(i, 2);
    wall(x0, y0, CELL_W, CELL_H, 6);
    plinth(x0, y0, CELL_W);
    if (i < 5) {
      const dw = 50, dh = 100, dx = x0 + (CELL_W - dw) / 2, dy = y0 + CELL_H - 16 - dh;
      const dc = DOORS[i % DOORS.length];
      // stone surround, arched door, panels, step, lamp
      detail((g, isMask) => { if (!isMask) g.fillStyle = '#d8ccb4'; g.beginPath(); g.moveTo(dx - 8, dy + dh); g.lineTo(dx - 8, dy + dw / 2); g.arc(dx + dw / 2, dy + dw / 2, dw / 2 + 8, Math.PI, 0); g.lineTo(dx + dw + 8, dy + dh); g.closePath(); g.fill(); });
      detail((g, isMask) => { if (!isMask) g.fillStyle = dc; g.beginPath(); g.moveTo(dx, dy + dh); g.lineTo(dx, dy + dw / 2); g.arc(dx + dw / 2, dy + dw / 2, dw / 2, Math.PI, 0); g.lineTo(dx + dw, dy + dh); g.closePath(); g.fill(); });
      wash(dx + dw / 2 - 1, dy + 10, 2, dh - 10, 'rgba(0,0,0,0.25)');
      for (const py of [dy + 34, dy + 66]) { wash(dx + 6, py, dw / 2 - 10, 24, 'rgba(0,0,0,0.12)'); wash(dx + dw / 2 + 4, py, dw / 2 - 10, 24, 'rgba(0,0,0,0.12)'); }
      glass(dx + 10, dy + 6, dw - 20, 16, false);
      rect(dx + dw - 12, dy + 58, 4, 4, '#d8b860');
      rect(dx - 10, dy + dh, dw + 20, 6, '#a89c88');
      if (i % 2 === 0) { rect(dx + dw + 14, dy + 14, 8, 14, '#2f3134'); rect(dx + dw + 15, dy + 16, 6, 9, '#ffe6a0'); }
      else flowerBox(dx - 30, dy + dh - 10, 16);
    } else if (i < 7) {
      const ww = 48, wh = 70;
      frame(x0 + (CELL_W - ww) / 2, y0 + 40, ww, wh, 2, 2);
      flowerBox(x0 + (CELL_W - ww) / 2, y0 + 40 + wh + 11, ww);
    } else {
      // arched passage into a courtyard
      const aw = 70, ah = 118, ax = x0 + (CELL_W - aw) / 2, ay = y0 + CELL_H - 16 - ah;
      detail((g, isMask) => { if (!isMask) g.fillStyle = '#d8ccb4'; g.beginPath(); g.moveTo(ax - 8, ay + ah); g.lineTo(ax - 8, ay + aw / 2); g.arc(ax + aw / 2, ay + aw / 2, aw / 2 + 8, Math.PI, 0); g.lineTo(ax + aw + 8, ay + ah); g.closePath(); g.fill(); });
      detail((g, isMask) => { if (!isMask) { const gr = g.createLinearGradient(0, ay, 0, ay + ah); gr.addColorStop(0, '#2a2622'); gr.addColorStop(1, '#5a5046'); g.fillStyle = gr; } g.beginPath(); g.moveTo(ax, ay + ah); g.lineTo(ax, ay + aw / 2); g.arc(ax + aw / 2, ay + aw / 2, aw / 2, Math.PI, 0); g.lineTo(ax + aw, ay + ah); g.closePath(); g.fill(); });
      wash(ax + aw * 0.3, ay + ah * 0.55, aw * 0.4, ah * 0.4, 'rgba(120,160,90,0.25)');
    }
    cells.ground.push(uv(x0, y0, CELL_W, CELL_H));
  }
  // row 3: shop fronts with sign boards
  const signCols = ['#2f4a3a', '#3a3f5a', '#6a2f2a', '#2f3f4f', '#5a4a2a', '#3f5a5a', '#4a2f3f', '#2f2f2f'];
  for (let i = 0; i < 8; i++) {
    const [x0, y0] = cell(i, 3);
    wall(x0, y0, CELL_W, CELL_H, 6);
    plinth(x0, y0, CELL_W);
    rect(x0 + 6, y0 + 18, CELL_W - 12, 24, signCols[i]);
    // "lettering": a row of small pale strokes
    for (let k = 0; k < 7; k++) rect(x0 + 18 + k * 13, y0 + 26, 8, 8, '#efe4c4');
    const sx = x0 + 10, sy = y0 + 50, sw = CELL_W - 20, sh = CELL_H - 16 - 50;
    rect(sx - 4, sy - 4, sw + 8, sh + 4, signCols[i]);
    frame(sx + 4, sy + 4, sw - 8, sh * 0.62, 3, 1, false, '#e9e1cf');
    // goods in the window: loaves, jars, flowers
    for (let k = 0; k < 9; k++) {
      const fc = rng.pick(['#d9a25a', '#c47a3a', '#e8d6a8', '#b84a3a', '#8aa65a']);
      const gx = sx + 10 + rng.range(0, sw - 20), gy = sy + 4 + sh * 0.62 - rng.range(4, 10), gw = rng.range(4, 7), gh = rng.range(3, 5);
      detail((g, isMask) => { if (!isMask) g.fillStyle = fc; g.beginPath(); g.ellipse(gx, gy, gw, gh, 0, 0, Math.PI * 2); g.fill(); });
    }
    rect(sx + 4, sy + sh * 0.62 + 8, sw - 8, sh * 0.38 - 10, '#d8ccb4');
    cells.shop.push(uv(x0, y0, CELL_W, CELL_H));
  }
  // row 4: side walls, gable (attic) windows and dormer windows
  for (let i = 0; i < 8; i++) {
    const [x0, y0] = cell(i, 4);
    wall(x0, y0, CELL_W, CELL_H);
    if (i < 3) {
      if (i === 1) frame(x0 + CELL_W / 2 - 14, y0 + 50, 28, 44, 1, 2);
      cells.side.push(uv(x0, y0, CELL_W, CELL_H));
    } else if (i < 6) {
      // gable windows sit in the lower-middle of the cell (the gable triangle is mapped over the whole cell)
      if (i === 3) { detail((g, isMask) => { if (!isMask) g.fillStyle = '#f4efe4'; g.beginPath(); g.arc(x0 + CELL_W / 2, y0 + 104, 20, 0, Math.PI * 2); g.fill(); }); glass(x0 + CELL_W / 2 - 14, y0 + 90, 28, 28, false); }
      else if (i === 4) frame(x0 + CELL_W / 2 - 16, y0 + 84, 32, 48, 2, 2, true);
      else for (const dx of [-20, 20]) frame(x0 + CELL_W / 2 + dx - 10, y0 + 92, 20, 40, 1, 2);
      cells.attic.push(uv(x0, y0, CELL_W, CELL_H));
    } else {
      frame(x0 + CELL_W / 2 - 22, y0 + 44, 44, 72, 2, 2);
      cells.dormer.push(uv(x0, y0, CELL_W, CELL_H));
    }
  }
  // row 5: simple back windows
  for (let i = 0; i < 8; i++) {
    const [x0, y0] = cell(i, 5);
    wall(x0, y0, CELL_W, CELL_H, 4);
    if (i % 3 !== 2) frame(x0 + CELL_W / 2 - 18, y0 + 44, 36, 64, 2, 2);
    cells.back.push(uv(x0, y0, CELL_W, CELL_H));
  }
  // bottom strip: awning stripes (128 x 64 each)
  for (let i = 0; i < 8; i++) {
    const x0 = i * CELL_W, y0 = 6 * CELL_H;
    const [a, b] = AWNINGS[i];
    for (let k = 0; k < 8; k++) rect(x0 + k * 16, y0, 16, 64, k % 2 ? b : a);
    wash(x0, y0 + 54, CELL_W, 10, 'rgba(0,0,0,0.12)');
    cells.awning.push(uv(x0, y0, CELL_W, 64));
  }

  // combine: RGB from the colour canvas, A = wall mask; flip rows so v runs upwards
  const rgb = c.getImageData(0, 0, SIZE, SIZE).data;
  const mk = m.getImageData(0, 0, SIZE, SIZE).data;
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const src = y * SIZE * 4, dst = (SIZE - 1 - y) * SIZE * 4;
    for (let x = 0; x < SIZE * 4; x += 4) {
      data[dst + x] = rgb[src + x]; data[dst + x + 1] = rgb[src + x + 1]; data[dst + x + 2] = rgb[src + x + 2];
      data[dst + x + 3] = mk[src + x];
    }
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return { texture, cells };
}

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

/** Cobblestones (tileable), warm grey. */
export function cobbleTexture(seed = 5) {
  const rng = new Rng(seed);
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7d7466'; g.fillRect(0, 0, S, S);
  const rows = 12, h = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -h * 0.6 : 0;
    while (x < S) {
      const w = h * rng.range(0.9, 1.5);
      const v = Math.round(rng.range(150, 200));
      for (const ox of [0, S, -S]) {
        g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
        g.beginPath(); g.ellipse(x + w / 2 + ox, r * h + h / 2, w / 2 - 1.5, h / 2 - 1.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.beginPath(); g.ellipse(x + w / 2 - 2 + ox, r * h + h / 2 - 2, w / 2 - 5, h / 2 - 5, 0, 0, Math.PI * 2); g.fill();
      }
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
