import * as THREE from 'three';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { css } from '../../ghibli/characterTextures';
import type { UvRect } from '../../ghibli/korikoAtlas';

/*
 * Painted textures for the bathhouse scene: the town's wall atlas (with a matching glow atlas for the lit
 * windows and stalls), paper lanterns, signboards, the noren curtain, the herb drawer wall, the boiler
 * room's floor and walls, and the paper of the paper birds.
 */

const tex = (c: HTMLCanvasElement, wrap = false) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/** Kinds of wall cell in the town atlas (4 x 4 cells, one bay by one storey each). */
export const CELL = {
  shoji: 0, shojiFigure: 1, shojiDim: 2, stall: 3, stall2: 4, lattice: 5, plaster: 6, boards: 7,
  door: 8, redRail: 9, stone: 10, brick: 11, ironWindow: 12, roundWindow: 13, woodWindow: 14, green: 15,
} as const;

export interface TownAtlas { map: THREE.Texture; glow: THREE.Texture; cells: UvRect[] }

let townCache: TownAtlas | null = null;
/**
 * The town's walls: paper screens, open food stalls, plaster, boards, brick and stone. The glow atlas is
 * black except where light shines out (paper windows, stall interiors), so one emissive material lights
 * every window in the town.
 */
export function townAtlas(): TownAtlas {
  if (townCache) return townCache;
  const S = 1024, C = 256;
  const col = new Painter(S, S, 7101), glow = new Painter(S, S, 7102);
  const g = col.g, e = glow.g, rng = new Rng(7103);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  const cells: UvRect[] = [];
  const DARK = '#2e1a12', BEAM = '#5a3222', RED = '#9a2c1e';
  const frame = (x0: number, y0: number, wood = BEAM) => {
    g.fillStyle = wood; g.fillRect(x0, y0, C, 18); g.fillRect(x0, y0 + C - 22, C, 22);
    g.fillStyle = DARK; g.fillRect(x0, y0, 14, C); g.fillRect(x0 + C - 6, y0, 6, C);
  };
  const paper = (x0: number, y0: number, wx: number, wy: number, ww: number, wh: number, light: number, figure = false) => {
    g.fillStyle = light > 0.5 ? '#f4dca4' : '#7a6650'; g.fillRect(x0 + wx, y0 + wy, ww, wh);
    if (light > 0) {
      const gr = e.createRadialGradient(x0 + wx + ww / 2, y0 + wy + wh / 2, 6, x0 + wx + ww / 2, y0 + wy + wh / 2, ww * 0.8);
      const hot = rng.range(0.8, 1) * light;
      gr.addColorStop(0, `rgba(255,${Math.round(205 * hot)},${Math.round(130 * hot)},${light})`);
      gr.addColorStop(1, `rgba(255,140,60,${light * 0.7})`);
      e.fillStyle = gr; e.fillRect(x0 + wx, y0 + wy, ww, wh);
    }
    if (figure) {
      // a guest's shadow on the paper
      for (const p of [g, e]) {
        p.fillStyle = p === g ? 'rgba(70,40,24,0.55)' : 'rgba(0,0,0,0.6)';
        p.beginPath(); p.ellipse(x0 + wx + ww * 0.62, y0 + wy + wh * 0.32, 13, 15, 0, 0, TAU); p.fill();
        p.beginPath(); p.ellipse(x0 + wx + ww * 0.62, y0 + wy + wh * 0.8, 26, 40, 0, 0, TAU); p.fill();
      }
    }
    // lattice over the paper, dark on both maps
    for (const p of [g, e]) {
      p.fillStyle = p === g ? DARK : '#000';
      for (let k = 0; k <= 4; k++) p.fillRect(x0 + wx + (ww * k) / 4 - 2.5, y0 + wy, 5, wh);
      for (let k = 0; k <= 6; k++) p.fillRect(x0 + wx, y0 + wy + (wh * k) / 6 - 2.5, ww, 5);
    }
  };
  const boards = (x0: number, y0: number, base: string) => {
    g.fillStyle = base; g.fillRect(x0, y0, C, C);
    for (let k = 0; k < C; k += 21) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x0 + k, y0, 3, C); g.fillStyle = 'rgba(255,220,180,0.06)'; g.fillRect(x0 + k + 4, y0, 6, C); }
  };
  const stall = (x0: number, y0: number, noren: string, goods: number) => {
    // dark warm interior with shelves, a counter at the bottom and a short curtain at the top
    g.fillStyle = '#3a2216'; g.fillRect(x0, y0, C, C);
    const gr = e.createLinearGradient(0, y0 + 40, 0, y0 + C);
    gr.addColorStop(0, 'rgba(255,170,80,0.85)'); gr.addColorStop(1, 'rgba(255,120,40,0.5)');
    e.fillStyle = gr; e.fillRect(x0 + 10, y0 + 40, C - 20, C - 100);
    g.fillStyle = '#6a3a1e';
    for (const sy of [y0 + 90, y0 + 140]) g.fillRect(x0 + 14, sy, C - 28, 7);
    // jars, bowls and hanging food on the shelves
    for (let k = 0; k < 10; k++) {
      const x = x0 + 24 + k * 21 + rng.range(-3, 3), sy = k % 2 ? y0 + 90 : y0 + 140;
      const c = rng.pick(goods ? ['#c8402c', '#e8c060', '#f0e8d8', '#8a5a2a'] : ['#d86a30', '#e8d8b0', '#6a8a3a', '#b8302a']);
      g.fillStyle = c; g.beginPath(); g.ellipse(x, sy - 9, 8, 9, 0, 0, TAU); g.fill();
      e.fillStyle = 'rgba(0,0,0,0.5)'; e.beginPath(); e.ellipse(x, sy - 9, 7, 8, 0, 0, TAU); e.fill();
    }
    if (goods) for (let k = 0; k < 6; k++) { g.fillStyle = '#8a3a1a'; g.fillRect(x0 + 30 + k * 34, y0 + 46, 9, 26); g.fillStyle = '#c86a3a'; g.beginPath(); g.ellipse(x0 + 34 + k * 34, y0 + 76, 8, 6, 0, 0, TAU); g.fill(); }
    // the counter
    g.fillStyle = '#7a4424'; g.fillRect(x0, y0 + C - 70, C, 60);
    g.fillStyle = '#9a5a30'; g.fillRect(x0, y0 + C - 70, C, 9);
    e.fillStyle = '#000'; e.fillRect(x0, y0 + C - 70, C, 70);
    // the curtain, split into panels, with a white character
    g.fillStyle = noren; g.fillRect(x0, y0, C, 44);
    for (let k = 1; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0 + (C * k) / 4 - 1, y0 + 6, 2, 38); }
    g.fillStyle = '#f4ece0'; g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(goods ? '食' : '湯', x0 + C / 2, y0 + 24);
    frame(x0, y0);
    g.fillStyle = BEAM; g.fillRect(x0, y0 + C - 12, C, 12);
  };
  for (let i = 0; i < 16; i++) {
    const x0 = (i % 4) * C, y0 = Math.floor(i / 4) * C;
    switch (i) {
      case CELL.shoji: case CELL.shojiFigure: case CELL.shojiDim: case CELL.door: {
        g.fillStyle = '#7a2e1e'; g.fillRect(x0, y0, C, C);
        frame(x0, y0);
        const door = i === CELL.door;
        paper(x0, y0, 26, door ? 26 : 36, C - 46, door ? C - 52 : C - 84, i === CELL.shojiDim ? 0.22 : 1, i === CELL.shojiFigure);
        if (!door) { g.fillStyle = BEAM; g.fillRect(x0 + 18, y0 + C - 46, C - 30, 10); }
        break;
      }
      case CELL.stall: stall(x0, y0, '#2a3a6a', 0); break;
      case CELL.stall2: stall(x0, y0, '#8a2a20', 1); break;
      case CELL.lattice: {
        g.fillStyle = '#4a2a1a'; g.fillRect(x0, y0, C, C);
        paper(x0, y0, 22, 30, C - 40, C - 70, 0.9);
        // close vertical slats in front of the paper
        for (let k = 0; k < 18; k++) { const x = x0 + 24 + k * 12; g.fillStyle = '#3a2014'; g.fillRect(x, y0 + 30, 6, C - 70); e.fillStyle = '#000'; e.fillRect(x, y0 + 30, 6, C - 70); }
        frame(x0, y0);
        break;
      }
      case CELL.plaster: case CELL.roundWindow: {
        g.fillStyle = '#e8dcc4'; g.fillRect(x0, y0, C, C);
        for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(120,100,70,${rng.range(0.04, 0.1)})`; g.beginPath(); g.ellipse(x0 + rng.range(0, C), y0 + rng.range(0, C), rng.range(8, 30), rng.range(6, 20), 0, 0, TAU); g.fill(); }
        g.fillStyle = BEAM; g.fillRect(x0, y0 + C / 2 - 8, C, 14);
        frame(x0, y0);
        if (i === CELL.roundWindow) {
          g.fillStyle = DARK; g.beginPath(); g.arc(x0 + C / 2, y0 + C / 2 + 34, 58, 0, TAU); g.fill();
          g.fillStyle = '#f2d8a0'; g.beginPath(); g.arc(x0 + C / 2, y0 + C / 2 + 34, 50, 0, TAU); g.fill();
          const gr = e.createRadialGradient(x0 + C / 2, y0 + C / 2 + 34, 4, x0 + C / 2, y0 + C / 2 + 34, 50);
          gr.addColorStop(0, 'rgba(255,214,140,1)'); gr.addColorStop(1, 'rgba(255,150,70,0.7)');
          e.fillStyle = gr; e.beginPath(); e.arc(x0 + C / 2, y0 + C / 2 + 34, 50, 0, TAU); e.fill();
          for (const p of [g, e]) { p.fillStyle = p === g ? DARK : '#000'; p.fillRect(x0 + C / 2 - 3, y0 + C / 2 - 16, 6, 100); p.fillRect(x0 + C / 2 - 50, y0 + C / 2 + 31, 100, 6); }
        }
        break;
      }
      case CELL.boards: boards(x0, y0, '#4a3020'); frame(x0, y0, '#3a2418'); break;
      case CELL.woodWindow: {
        boards(x0, y0, '#4a3020'); frame(x0, y0, '#3a2418');
        paper(x0, y0, 70, 60, C - 140, 90, 1);
        break;
      }
      case CELL.redRail: {
        g.fillStyle = RED; g.fillRect(x0, y0, C, C);
        frame(x0, y0, '#7a2216');
        paper(x0, y0, 30, 30, C - 54, C - 130, 1);
        const ry = y0 + C - 92;
        g.fillStyle = '#b8382a'; g.fillRect(x0, ry, C, 14);
        for (let k = 0; k < 16; k++) { g.fillStyle = '#5a1810'; g.fillRect(x0 + 8 + k * 16, ry + 14, 6, 52); }
        g.fillStyle = '#b8382a'; g.fillRect(x0, ry + 62, C, 10);
        e.fillStyle = '#000'; e.fillRect(x0, ry, C, 80);
        break;
      }
      case CELL.stone: {
        g.fillStyle = '#5e5a52'; g.fillRect(x0, y0, C, C);
        for (let r = 0; r < 6; r++) { let x = r % 2 ? -30 : 0; while (x < C) { const w = rng.range(50, 90), v = Math.round(rng.range(100, 140)); g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(x0 + Math.max(0, x) + 3, y0 + r * 42.7 + 3, Math.min(w, C - x) - 6, 37); x += w; } }
        g.fillStyle = 'rgba(40,60,40,0.3)'; g.fillRect(x0, y0 + C - 50, C, 50);
        break;
      }
      case CELL.brick: case CELL.ironWindow: {
        g.fillStyle = '#3a2420'; g.fillRect(x0, y0, C, C);
        for (let r = 0; r < 16; r++) { let x = r % 2 ? -16 : 0; while (x < C) { const v = rng.range(0.75, 1.1); g.fillStyle = css(0x8a4a34, v, 0x2a2a2a, rng.range(0, 0.3)); g.fillRect(x0 + Math.max(0, x) + 1.5, y0 + r * 16 + 1.5, Math.min(32, C - x) - 3, 13); x += 32; } }
        // soot streaks
        for (let k = 0; k < 8; k++) { g.fillStyle = 'rgba(10,8,8,0.25)'; g.fillRect(x0 + rng.range(0, C), y0, rng.range(10, 30), C * rng.range(0.4, 1)); }
        if (i === CELL.ironWindow) {
          g.fillStyle = '#1a1a1e'; g.fillRect(x0 + 56, y0 + 40, C - 112, C - 96);
          g.fillStyle = '#e8a050'; g.fillRect(x0 + 64, y0 + 48, C - 128, C - 112);
          const gr = e.createLinearGradient(0, y0 + 48, 0, y0 + C - 64);
          gr.addColorStop(0, 'rgba(255,150,60,0.7)'); gr.addColorStop(1, 'rgba(255,110,30,1)');
          e.fillStyle = gr; e.fillRect(x0 + 64, y0 + 48, C - 128, C - 112);
          for (const p of [g, e]) { p.fillStyle = p === g ? '#1a1a1e' : '#000'; for (let k = 1; k < 4; k++) p.fillRect(x0 + 64 + ((C - 128) * k) / 4 - 3, y0 + 48, 6, C - 112); for (let k = 1; k < 5; k++) p.fillRect(x0 + 64, y0 + 48 + ((C - 112) * k) / 5 - 3, C - 128, 6); }
        }
        break;
      }
      case CELL.green: {
        g.fillStyle = '#2f5a48'; g.fillRect(x0, y0, C, C);
        frame(x0, y0, '#1e3a2e');
        paper(x0, y0, 34, 40, C - 62, C - 100, 1);
        break;
      }
    }
    cells.push({ u0: (x0 + 2) / S, u1: (x0 + C - 2) / S, v0: 1 - (y0 + C - 2) / S, v1: 1 - (y0 + 2) / S });
  }
  townCache = { map: tex(col.canvas), glow: tex(glow.canvas), cells };
  return townCache;
}

/**
 * A paper lantern (chochin) for a lathe whose v runs from the bottom cap (0) to the top cap (1): white
 * paper (tinted per lantern), ribs, black caps, and a big character on the front. The glow map is the
 * same with the ribs and caps dark.
 */
export function lanternPaper() {
  const W = 256, H = 256;
  const col = new Painter(W, H, 7201), glow = new Painter(W, H, 7202);
  const g = col.g, e = glow.g;
  g.fillStyle = '#f6efe4'; g.fillRect(0, 0, W, H);
  const gr = e.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#ffb060'); gr.addColorStop(0.5, '#ffe2b0'); gr.addColorStop(1, '#ffb060');
  e.fillStyle = gr; e.fillRect(0, 0, W, H);
  // ribs
  for (let y = 26; y < H - 26; y += 13) for (const p of [g, e]) { p.fillStyle = p === g ? 'rgba(90,50,30,0.35)' : 'rgba(0,0,0,0.35)'; p.fillRect(0, y, W, 2.5); }
  // black lacquer caps
  for (const p of [g, e]) { p.fillStyle = p === g ? '#1a1414' : '#000'; p.fillRect(0, 0, W, 22); p.fillRect(0, H - 22, W, 22); }
  g.fillStyle = '#c8a050'; g.fillRect(0, 20, W, 3); g.fillRect(0, H - 23, W, 3);
  // characters front and back (cylinder-like u layout: the front is at u 0.75 for a lathe turned to face +z)
  for (const [u, ch] of [[0.25, '湯'], [0.75, '油']] as const) {
    g.fillStyle = '#1a1010'; g.font = 'bold 74px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, u * W, H / 2);
    e.fillStyle = 'rgba(0,0,0,0.75)'; e.font = 'bold 74px serif'; e.textAlign = 'center'; e.textBaseline = 'middle';
    e.fillText(ch, u * W, H / 2);
  }
  return { map: tex(col.canvas), glow: tex(glow.canvas) };
}

/** A vertical shop sign: dark lacquer board with a gold border and characters running down it. */
export function signTexture(text: string, o: { bg?: string; fg?: string; w?: number; h?: number; vertical?: boolean } = {}) {
  const W = o.w ?? 128, H = o.h ?? 384;
  const p = new Painter(W, H, 7300 + text.length).fill(o.bg ?? '#2a1810');
  const g = p.g;
  p.vgrad([[0, 'rgba(255,255,255,0.08)'], [1, 'rgba(0,0,0,0.25)']]);
  g.strokeStyle = '#c8a050'; g.lineWidth = Math.max(4, W * 0.05); g.strokeRect(W * 0.06, W * 0.06, W - W * 0.12, H - W * 0.12);
  g.fillStyle = o.fg ?? '#f0d890'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...text];
  if (o.vertical === false) {
    g.font = `bold ${Math.floor(H * 0.62)}px serif`;
    g.fillText(text, W / 2, H / 2 + H * 0.03);
  } else {
    const step = (H - W * 0.3) / chars.length;
    g.font = `bold ${Math.floor(Math.min(W * 0.72, step * 0.86))}px serif`;
    chars.forEach((c, i) => g.fillText(c, W / 2, W * 0.15 + step * (i + 0.5)));
  }
  return p.texture({ wrap: false });
}

/** The noren over the bathhouse entrance: deep red cloth in panels, with the hiragana "yu" (hot water). */
export function norenTexture() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 7401).fill('#8a1e1a');
  const g = p.g;
  p.vgrad([[0, '#a82820'], [1, '#701812']]);
  for (let k = 1; k < 4; k++) { g.fillStyle = 'rgba(30,0,0,0.6)'; g.fillRect((W * k) / 4 - 2, 24, 4, H); }
  g.fillStyle = '#5a1410'; g.fillRect(0, 0, W, 24);
  g.fillStyle = '#f6eee0'; g.font = 'bold 150px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ゆ', W / 2, H / 2 + 14);
  p.lines({ n: 40, colors: ['rgba(255,255,255,0.4)', 'rgba(0,0,0,0.4)'], alpha: [0.04, 0.1], width: [1, 2], vertical: true, wobble: 1 });
  return p.texture({ wrap: false });
}

/**
 * Kamaji's wall of herb drawers: rows of small drawers with ring pulls and paper labels, in an old wood
 * frame. Tiles both ways; one tile is 6 drawers across and 6 down.
 */
export function drawerWall() {
  const S = 512, n = 6, d = S / n;
  const p = new Painter(S, S, 7501).fill('#3a2416');
  const g = p.g, rng = p.rng;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x = c * d, y = r * d;
    g.fillStyle = css(0x8a5a32, rng.range(0.8, 1.1)); g.fillRect(x + 5, y + 5, d - 10, d - 10);
    g.fillStyle = 'rgba(255,230,190,0.12)'; g.fillRect(x + 5, y + 5, d - 10, 5);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 5, y + d - 10, d - 10, 5);
    // grain
    for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(60,30,10,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 8, y + 14 + k * 16); g.quadraticCurveTo(x + d / 2, y + 10 + k * 16 + rng.range(-4, 4), x + d - 8, y + 14 + k * 16); g.stroke(); }
    // label
    g.fillStyle = css(0xeee2c4, rng.range(0.85, 1)); g.fillRect(x + d * 0.3, y + 13, d * 0.4, d * 0.28);
    g.fillStyle = '#3a2a1e'; g.font = `${Math.floor(d * 0.2)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(rng.pick(['薬', '草', '根', '葉', '花', '実', '木', '石', '塩', '湯']), x + d / 2, y + 13 + d * 0.14);
    // brass ring pull
    g.strokeStyle = '#c8a050'; g.lineWidth = 4; g.beginPath(); g.arc(x + d / 2, y + d * 0.68, 8, 0, TAU); g.stroke();
    g.fillStyle = '#e8c870'; g.beginPath(); g.arc(x + d / 2, y + d * 0.6, 3.5, 0, TAU); g.fill();
  }
  return p.texture({ repeat: [1, 1] });
}

/** Dark stone flags with coal dust, for the boiler room floor (tiles). */
export function boilerFloor() {
  const p = new Painter(256, 256, 7601).fill('#2a2622');
  const g = p.g, rng = p.rng;
  for (let r = 0; r < 4; r++) { let x = r % 2 ? -32 : 0; while (x < 256) { const w = rng.range(48, 80); g.fillStyle = css(0x4a443c, rng.range(0.75, 1.1)); g.fillRect(x + 2, r * 64 + 2, w - 4, 60); x += w; } }
  p.dabs({ n: 70, colors: ['#121014', '#1a1614', '#3a3028'], r: [4, 22], alpha: [0.15, 0.4] });
  return p.texture({ repeat: [1, 1] });
}

/** A lump of coal and the heap: near black with blue-grey glints. */
export function coalTexture() {
  const p = new Painter(128, 128, 7602).fill('#16161a');
  p.dabs({ n: 120, colors: ['#2a2c34', '#0a0a0c', '#3a3e4a'], r: [2, 8], alpha: [0.4, 0.8] });
  p.dabs({ n: 30, colors: ['#6a7080'], r: [0.8, 2], alpha: [0.5, 0.9] });
  return p.texture({ repeat: [1, 1] });
}

/** Sooty timber planks for the boiler room's walls and ceiling (tiles). */
export function sootyBoards() {
  const p = new Painter(256, 256, 7603).fill('#2e2018');
  const g = p.g, rng = p.rng;
  for (let x = 0; x < 256; x += 32) { g.fillStyle = css(0x4a3222, rng.range(0.7, 1.05)); g.fillRect(x + 2, 0, 28, 256); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, 0, 3, 256); }
  p.lines({ n: 30, colors: ['#1a120c', '#5a4030'], alpha: [0.15, 0.35], width: [1, 2], vertical: true, wobble: 2 });
  p.vgrad([[0, 'rgba(0,0,0,0.45)'], [0.5, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0.3)']]);
  return p.texture({ repeat: [1, 1] });
}

/** Paper for the paper birds: white washi with fibres, a faint red seal mark in the middle. */
export function washi() {
  const p = new Painter(128, 128, 7701).fill('#f6f2e8');
  const g = p.g;
  p.lines({ n: 40, colors: ['#e4ddd0', '#ffffff'], alpha: [0.3, 0.7], width: [0.5, 1.4], wobble: 6 });
  p.dabs({ n: 20, colors: ['#ebe4d6'], r: [4, 14], alpha: [0.2, 0.4] });
  g.fillStyle = 'rgba(190,40,30,0.75)'; g.beginPath(); g.arc(64, 54, 7, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(40,30,30,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 70); g.lineTo(64, 104); g.stroke();
  return p.texture({ wrap: false });
}

/** Cliff rock for the ravine walls: layered dark stone with moss and damp streaks (tiles). */
export function cliffRock() {
  const p = new Painter(256, 256, 7801).fill('#3e3a36');
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 14; i++) {
    const y = (i / 14) * 256 + rng.range(-4, 4);
    g.fillStyle = css(0x4a4640, rng.range(0.75, 1.2)); g.globalAlpha = 0.7;
    g.beginPath(); g.moveTo(0, y);
    for (let k = 1; k <= 16; k++) g.lineTo((k / 16) * 256, y + Math.sin(k * 1.3 + i) * 5);
    g.lineTo(256, y + 16); g.lineTo(0, y + 16); g.fill();
  }
  g.globalAlpha = 1;
  p.lines({ n: 22, colors: ['#22201e', '#2a3428'], alpha: [0.2, 0.45], width: [1, 4], vertical: true, wobble: 6 });
  p.dabs({ n: 40, colors: ['#3a5030', '#2e4428', '#4a5a38'], r: [4, 14], alpha: [0.2, 0.45] });
  return p.texture({ repeat: [1, 1] });
}

/** Shop signs, 8 across and 2 down: dark lacquer boards with gold characters running down them. */
export const SIGN_TEXTS = ['飯', '酒', '肉', '湯', '薬', '食堂', '茶', '甘味', '寿司', '魚', '饅頭', '焼鳥', '天', '生', '名物', '宿'];
let signCache: { map: THREE.Texture; cells: UvRect[] } | null = null;
export function signAtlas() {
  if (signCache) return signCache;
  const W = 128, H = 384, cols = 8, rows = 2;
  const p = new Painter(W * cols, H * rows, 7901);
  const g = p.g;
  const cells: UvRect[] = [];
  const bgs = ['#2a1810', '#6a1a14', '#1e2a3a', '#2a1810', '#3a2a14', '#6a1a14', '#1e3a2a', '#2a1810'];
  SIGN_TEXTS.forEach((text, i) => {
    const x0 = (i % cols) * W, y0 = Math.floor(i / cols) * H;
    g.fillStyle = bgs[i % bgs.length]; g.fillRect(x0, y0, W, H);
    const gr = g.createLinearGradient(0, y0, 0, y0 + H);
    gr.addColorStop(0, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = gr; g.fillRect(x0, y0, W, H);
    g.strokeStyle = '#c8a050'; g.lineWidth = 7; g.strokeRect(x0 + 8, y0 + 8, W - 16, H - 16);
    g.fillStyle = i % 3 === 1 ? '#fff0d0' : '#f0d070'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const chars = [...text];
    const step = (H - 40) / Math.max(2, chars.length);
    g.font = `bold ${Math.floor(Math.min(W * 0.7, step * 0.85))}px serif`;
    chars.forEach((c, k) => g.fillText(c, x0 + W / 2, y0 + 20 + step * (k + 0.5) + (chars.length === 1 ? (H - 40) / 4 : 0)));
    cells.push({ u0: (x0 + 1) / p.w, u1: (x0 + W - 1) / p.w, v0: 1 - (y0 + H - 1) / p.h, v1: 1 - (y0 + 1) / p.h });
  });
  signCache = { map: p.texture({ wrap: false }), cells };
  return signCache;
}

/** Embers among the coal, for the heap's glow map: black, with orange cracks and hot specks. */
export function coalEmbers() {
  const p = new Painter(128, 128, 7603).fill('#000000');
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 18; i++) {
    g.strokeStyle = rng.pick(['#ff7a20', '#c84a10', '#ffb040']); g.lineWidth = rng.range(1, 2.5); g.globalAlpha = rng.range(0.5, 1);
    let x = rng.range(0, 128), y = rng.range(0, 128);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += rng.range(-10, 10); y += rng.range(-10, 10); g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
  p.dabs({ n: 40, colors: ['#ffd070', '#ff8a30', '#e05010'], r: [0.8, 2.6], alpha: [0.6, 1] });
  return p.texture({ repeat: [1, 1] });
}

/** A soft round pool of light (white, fading out), for warm glows on floors and walls. */
export function lightPool() {
  const p = new Painter(128, 128, 7605);
  const gr = p.g.createRadialGradient(64, 64, 1, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  p.g.fillStyle = gr; p.g.fillRect(0, 0, 128, 128);
  return p.texture({ wrap: false });
}
