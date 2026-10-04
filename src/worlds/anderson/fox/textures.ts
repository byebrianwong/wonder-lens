import { Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { css } from '../textures';
import { FUTURA } from '../film';

/*
 * Painted textures for "Underneath the Hill". Tiling textures say how much of the world one tile covers;
 * the sets give geometry world-unit UVs (see bake() in build.ts), so a band of earth runs on unbroken from
 * one wall to the next.
 */

/** The earth in cross-section: bands of ochre, sienna, umber and clay with pebbles, roots and worm holes. One tile = 8 x 8 units; v is height. */
export function strata(seed = 11, dark = false) {
  const S = 512, rng = new Rng(seed);
  const p = new Painter(S, S, seed);
  const g = p.g;
  const pal = dark ? [0x5a3a22, 0x4a2e1a, 0x6a4428, 0x3e2616, 0x7a4e2c] : [0xb87a3a, 0x9a5a2c, 0x7a4a28, 0xc8904e, 0x8a5a32, 0xa86a36, 0xc89a5a, 0x6e4628];
  let y = 0;
  while (y < S) {
    const h = rng.range(20, 74);
    const c = rng.pick(pal);
    g.fillStyle = css(c);
    // a wavy top edge so the bands look laid down, not ruled
    g.beginPath(); g.moveTo(0, y + 4);
    for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 3 + Math.sin(x * 0.07 + y * 0.3) * 2);
    g.lineTo(S, y + h + 8); g.lineTo(0, y + h + 8); g.closePath(); g.fill();
    // a thin dark line at the bottom of some bands
    if (rng.chance(0.5)) { g.fillStyle = 'rgba(40,20,8,0.25)'; g.fillRect(0, y + h - 2, S, 2); }
    y += h;
  }
  // bottom rows repeat the top so the tile wraps vertically
  g.drawImage(p.canvas, 0, 0, S, 24, 0, S - 24, S, 24);
  p.dabs({ n: 160, colors: ['rgba(255,230,190,0.5)', 'rgba(60,30,10,0.5)'], r: [6, 26], alpha: [0.05, 0.12], squash: 0.4 });
  // pebbles and stones
  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, S), yy = rng.range(0, S), r = rng.range(1.5, i < 8 ? 10 : 4.5);
    const c = rng.pick([0xd8d0c0, 0xa8a090, 0x8a7a68, 0xe8dcc0, 0x6a6058]);
    g.fillStyle = 'rgba(30,15,5,0.35)'; g.beginPath(); g.ellipse(x + 1, yy + 1.5, r, r * 0.7, 0.2, 0, TAU); g.fill();
    g.fillStyle = css(c); g.beginPath(); g.ellipse(x, yy, r, r * 0.7, rng.range(-0.5, 0.5), 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(x - r * 0.3, yy - r * 0.25, r * 0.35, r * 0.2, 0, 0, TAU); g.fill();
  }
  // fine roots wandering down
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    let x = rng.range(0, S), yy = rng.range(-40, S * 0.7);
    g.strokeStyle = rng.chance(0.6) ? 'rgba(236,214,170,0.7)' : 'rgba(70,40,20,0.6)';
    g.lineWidth = rng.range(1, 3);
    g.beginPath(); g.moveTo(x, yy);
    for (let k = 0; k < 8; k++) { x += rng.range(-10, 10); yy += rng.range(8, 22); g.lineTo(x, yy); }
    g.stroke();
  }
  // worm holes
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(30,14,6,0.55)'; g.beginPath(); g.arc(rng.range(0, S), rng.range(0, S), rng.range(1.5, 3.5), 0, TAU); g.fill(); }
  return p.texture({ repeat: [1, 1] });
}

/** Packed earth for floors and tunnel ceilings; one tile = 4 x 4 units. */
export function packedEarth(color = 0x8a5a32, seed = 13) {
  const p = new Painter(256, 256, seed).fill(css(color));
  p.dabs({ n: 120, colors: [css(color, 1.12), css(color, 0.85), css(color, 0.95)], r: [4, 22], alpha: [0.1, 0.25] });
  p.dabs({ n: 200, colors: [css(0xd8c8a8), css(color, 0.6)], r: [1, 3], alpha: [0.3, 0.6] });
  return p.texture({ repeat: [1, 1] });
}

/** Wallpaper: a ground colour with a small repeating motif; one tile = 2 x 2 units. */
export function wallpaper(ground: number, ink: number, motif: 'leaf' | 'stripe' | 'dot' | 'diamond' | 'flower', seed = 17) {
  const S = 256;
  const p = new Painter(S, S, seed).fill(css(ground));
  const g = p.g;
  g.fillStyle = css(ink); g.strokeStyle = css(ink);
  if (motif === 'stripe') { for (let x = 0; x < S; x += 32) { g.fillRect(x, 0, 10, S); g.globalAlpha = 0.5; g.fillRect(x + 16, 0, 3, S); g.globalAlpha = 1; } }
  else for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = i * 64 + (j % 2 ? 32 : 0) + 32, y = j * 64 + 32;
    for (const dx of [0, -S]) {
      const X = x + dx;
      if (motif === 'leaf') { g.beginPath(); g.ellipse(X - 6, y, 5, 11, 0.6, 0, TAU); g.fill(); g.beginPath(); g.ellipse(X + 6, y, 5, 11, -0.6, 0, TAU); g.fill(); g.fillRect(X - 1, y, 2, 14); }
      else if (motif === 'dot') { g.beginPath(); g.arc(X, y, 6, 0, TAU); g.fill(); }
      else if (motif === 'diamond') { g.beginPath(); g.moveTo(X, y - 12); g.lineTo(X + 8, y); g.lineTo(X, y + 12); g.lineTo(X - 8, y); g.closePath(); g.fill(); }
      else { for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; g.beginPath(); g.ellipse(X + Math.cos(a) * 7, y + Math.sin(a) * 7, 5, 3.5, a, 0, TAU); g.fill(); } g.fillStyle = css(ground, 1.1); g.beginPath(); g.arc(X, y, 3.5, 0, TAU); g.fill(); g.fillStyle = css(ink); }
    }
  }
  p.dabs({ n: 40, colors: ['rgba(255,240,200,1)', 'rgba(90,50,20,1)'], r: [10, 40], alpha: [0.03, 0.07] });
  return p.texture({ repeat: [1, 1] });
}

/** Floorboards; one tile = 2 x 2 units, boards running along v. */
export function boards(color: number, seed = 19, splatter = false) {
  const p = new Painter(256, 256, seed).fill(css(color, 0.6));
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 8; i++) {
    let y = -rng.range(0, 200);
    while (y < 256) { const len = rng.range(120, 260), k = rng.range(0.9, 1.1); g.fillStyle = css(color, k); g.fillRect(i * 32 + 1, y + 1, 30, len - 2); y += len; }
  }
  p.lines({ n: 40, colors: [css(color, 0.8), css(color, 1.15)], alpha: [0.2, 0.4], width: [0.8, 1.6], vertical: true, wobble: 1 });
  if (splatter) for (let i = 0; i < 50; i++) { g.fillStyle = rng.pick(['#d84a2a', '#2a6ab8', '#e8c04a', '#3a8a5a', '#f4f0e8']); g.globalAlpha = 0.85; g.beginPath(); g.ellipse(rng.range(0, 256), rng.range(0, 256), rng.range(1.5, 5), rng.range(1.5, 4), rng.range(0, 3), 0, TAU); g.fill(); }
  g.globalAlpha = 1;
  return p.texture({ repeat: [1, 1] });
}

/** Two-colour floor tiles (the kitchen); one tile = 2 x 2 units. */
export function tiles(a: number, b: number) {
  const p = new Painter(128, 128, 21).fill(css(a));
  const g = p.g;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) { g.fillStyle = css(b); g.fillRect(i * 32, j * 32, 32, 32); }
  g.strokeStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke(); }
  return p.texture({ repeat: [1, 1] });
}

/** A long runner rug (the track runs on it through the house): borders, a field of medallions. u across, v along; one tile = 6 x 6 units. */
export function runnerRug() {
  const W = 256, H = 256;
  const p = new Painter(W, H, 23).fill('#a83a24');
  const g = p.g;
  g.fillStyle = '#e8b04a'; g.fillRect(0, 0, 18, H); g.fillRect(W - 18, 0, 18, H);
  g.fillStyle = '#5a1e14'; g.fillRect(18, 0, 6, H); g.fillRect(W - 24, 0, 6, H);
  g.fillStyle = '#f2e2c0'; for (let y = 6; y < H; y += 16) { g.fillRect(6, y, 6, 6); g.fillRect(W - 12, y, 6, 6); }
  for (let y = 32; y < H; y += 64) {
    g.fillStyle = '#e8b04a'; g.beginPath(); g.moveTo(W / 2, y - 26); g.lineTo(W / 2 + 46, y); g.lineTo(W / 2, y + 26); g.lineTo(W / 2 - 46, y); g.closePath(); g.fill();
    g.fillStyle = '#2a5a6a'; g.beginPath(); g.moveTo(W / 2, y - 16); g.lineTo(W / 2 + 28, y); g.lineTo(W / 2, y + 16); g.lineTo(W / 2 - 28, y); g.closePath(); g.fill();
    g.fillStyle = '#f2e2c0'; g.beginPath(); g.arc(W / 2, y, 5, 0, TAU); g.fill();
    for (const s of [-1, 1]) { g.fillStyle = '#e8b04a'; g.beginPath(); g.arc(W / 2 + s * 78, y + 32, 9, 0, TAU); g.fill(); }
  }
  p.lines({ n: 80, colors: ['rgba(255,255,255,1)', 'rgba(0,0,0,1)'], alpha: [0.03, 0.07], width: [1, 2], vertical: true });
  return p.texture({ repeat: [1, 1] });
}

/** Bookshelf fronts: rows of spines; one tile = 2 units wide x 2 high (four shelves). */
export function books(seed = 29) {
  const p = new Painter(256, 256, seed).fill('#4a2a16');
  const g = p.g, rng = p.rng;
  for (let s = 0; s < 4; s++) {
    const y0 = s * 64 + 6;
    for (let x = 4; x < 252;) {
      const w = rng.range(6, 14), h = rng.range(40, 56);
      g.fillStyle = css(rng.pick([0x8a2a1e, 0x2a4a3a, 0xc8903a, 0x3a3a5a, 0xe8d8b0, 0x6a3a1a, 0xb8582a, 0x1e2a3a]));
      g.fillRect(x, y0 + 56 - h, w, h);
      g.fillStyle = 'rgba(232,200,120,0.7)'; g.fillRect(x + 1, y0 + 56 - h + 6, w - 2, 2); g.fillRect(x + 1, y0 + 56 - 10, w - 2, 2);
      x += w + rng.range(0, 2);
    }
    g.fillStyle = '#6a3e20'; g.fillRect(0, y0 + 56, 256, 8);
  }
  return p.texture({ repeat: [1, 1] });
}

/** A picture in a frame (no frame here; the frame is geometry). */
export function picture(kind: 'storm' | 'hills' | 'portrait' | 'tree' | 'chicken', seed = 31) {
  const W = 256, H = 192;
  const p = new Painter(W, H, seed);
  const g = p.g, rng = p.rng;
  if (kind === 'storm') {
    // Mrs. Fox's landscapes: a thunderstorm over a hill, a bolt of lightning
    p.vgrad([[0, '#2a2a4a'], [0.5, '#5a5a7a'], [0.7, '#c8a050'], [1, '#6a7a3a']]);
    g.fillStyle = '#3a4a2a'; g.beginPath(); g.moveTo(0, H); g.quadraticCurveTo(W * 0.4, H * 0.55, W, H * 0.8); g.lineTo(W, H); g.fill();
    g.fillStyle = '#2a2a2a'; g.fillRect(W * 0.6, H * 0.52, 4, 24); g.beginPath(); g.arc(W * 0.6 + 2, H * 0.5, 14, 0, TAU); g.fill();
    p.dabs({ n: 30, colors: ['#1a1a30', '#4a4a6a'], r: [10, 30], alpha: [0.3, 0.6], y: [0, 0.4] });
    g.strokeStyle = '#fff8c0'; g.lineWidth = 4; g.beginPath(); g.moveTo(W * 0.3, 0); g.lineTo(W * 0.36, H * 0.25); g.lineTo(W * 0.3, H * 0.28); g.lineTo(W * 0.4, H * 0.55); g.stroke();
    g.strokeStyle = 'rgba(200,200,255,0.4)'; g.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const x = rng.range(0, W), y = rng.range(0, H * 0.7); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6, y + 18); g.stroke(); }
  } else if (kind === 'hills') {
    p.vgrad([[0, '#f0c070'], [0.55, '#f8e0a0'], [1, '#c8883a']]);
    g.fillStyle = '#e8a040'; g.beginPath(); g.moveTo(0, H * 0.7); g.quadraticCurveTo(W * 0.3, H * 0.4, W * 0.6, H * 0.65); g.quadraticCurveTo(W * 0.8, H * 0.55, W, H * 0.62); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.fillStyle = '#a85a2a'; g.beginPath(); g.moveTo(0, H * 0.85); g.quadraticCurveTo(W * 0.5, H * 0.7, W, H * 0.85); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.fillStyle = '#5a3a1a'; g.fillRect(W * 0.45, H * 0.38, 6, 30); g.fillStyle = '#c86a2a'; g.beginPath(); g.arc(W * 0.46, H * 0.36, 18, 0, TAU); g.fill();
  } else if (kind === 'portrait') {
    // a family portrait: a fox head on a dark green ground
    p.vgrad([[0, '#2a4a3a'], [1, '#1a2a22']]);
    g.fillStyle = '#c8642a'; g.beginPath(); g.ellipse(W / 2, H * 0.55, 40, 44, 0, 0, TAU); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 + s * 18, H * 0.3); g.lineTo(W / 2 + s * 34, H * 0.12); g.lineTo(W / 2 + s * 40, H * 0.38); g.fill(); }
    g.fillStyle = '#f4ead8'; g.beginPath(); g.ellipse(W / 2, H * 0.68, 24, 18, 0, 0, TAU); g.fill();
    g.fillStyle = '#1a1210'; for (const s of [-1, 1]) { g.beginPath(); g.arc(W / 2 + s * 14, H * 0.5, 4, 0, TAU); g.fill(); }
    g.beginPath(); g.arc(W / 2, H * 0.62, 5, 0, TAU); g.fill();
    g.fillStyle = '#c4955a'; g.fillRect(W / 2 - 50, H * 0.85, 100, 40);
  } else if (kind === 'tree') {
    p.vgrad([[0, '#f8e0a0'], [1, '#e8b060']]);
    g.fillStyle = '#6a4222'; g.fillRect(W / 2 - 10, H * 0.4, 20, H * 0.6);
    g.fillStyle = '#c8783a'; g.beginPath(); g.arc(W / 2, H * 0.35, 60, 0, TAU); g.fill();
    g.fillStyle = '#a85a2a'; g.beginPath(); g.arc(W / 2 - 30, H * 0.4, 34, 0, TAU); g.fill();
    g.fillStyle = '#2a5a3a'; g.beginPath(); g.arc(W / 2, H * 0.86, 8, 0, TAU); g.fill();
  } else {
    p.vgrad([[0, '#e8d8a8'], [1, '#c8a868']]);
    g.fillStyle = '#f4f0e6'; g.beginPath(); g.ellipse(W / 2, H * 0.6, 50, 36, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(W / 2 + 40, H * 0.38, 20, 0, TAU); g.fill();
    g.fillStyle = '#c82a2a'; g.beginPath(); g.ellipse(W / 2 + 40, H * 0.22, 8, 10, 0, 0, TAU); g.fill();
    g.fillStyle = '#e8a030'; g.beginPath(); g.moveTo(W / 2 + 58, H * 0.38); g.lineTo(W / 2 + 72, H * 0.42); g.lineTo(W / 2 + 58, H * 0.45); g.fill();
  }
  return p.texture({ wrap: false });
}

/** Red brick, for the cellar's vault and walls; one tile = 2 x 2 units. */
export function bricks(color = 0xa8502e, seed = 37) {
  const S = 256, rows = 8;
  const p = new Painter(S, S, seed).fill('#d8c4a0');
  const g = p.g, rng = p.rng;
  const bh = S / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 32 : 0;
    for (let x = -off; x < S; x += 64) {
      g.fillStyle = css(color, rng.range(0.82, 1.12));
      g.fillRect(x + 2, r * bh + 2, 60, bh - 4);
      g.fillStyle = 'rgba(255,220,180,0.12)'; g.fillRect(x + 2, r * bh + 2, 60, 3);
    }
  }
  p.dabs({ n: 60, colors: ['rgba(40,20,10,1)', 'rgba(255,230,200,1)'], r: [8, 30], alpha: [0.04, 0.1] });
  return p.texture({ repeat: [1, 1] });
}

/**
 * A cider barrel's staves for a cylinder (u round, v up): oak staves, two iron hoops top and bottom, and on
 * the front a stencilled label: BEAN'S ALCOHOLIC CIDER.
 */
export function barrelStaves(seed = 41) {
  const W = 512, H = 256;
  const p = new Painter(W, H, seed).fill('#9a6232');
  const g = p.g, rng = p.rng;
  for (let x = 0; x < W; x += 32) { g.fillStyle = css(0x9a6232, rng.range(0.85, 1.12)); g.fillRect(x + 1, 0, 30, H); g.fillStyle = 'rgba(40,20,8,0.5)'; g.fillRect(x, 0, 1.5, H); }
  p.lines({ n: 60, colors: ['rgba(60,30,10,1)', 'rgba(200,150,90,1)'], alpha: [0.15, 0.3], width: [0.8, 1.4], vertical: true, wobble: 1.5 });
  for (const y of [18, 46, H - 58, H - 30]) { g.fillStyle = '#3a3634'; g.fillRect(0, y, W, 12); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, y, W, 2); }
  // the label on the front (cylinder u = 0 is the front; it wraps both edges)
  for (const cx of [0, W]) {
    g.fillStyle = '#f0e2b8'; g.fillRect(cx - 70, 80, 140, 96);
    g.strokeStyle = '#8a2a1a'; g.lineWidth = 3; g.strokeRect(cx - 64, 86, 128, 84);
    g.fillStyle = '#8a2a1a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 15px ${FUTURA}`; g.fillText("BEAN'S", cx, 104);
    g.font = `bold 11px ${FUTURA}`; g.fillText('ALCOHOLIC', cx, 124);
    g.font = `bold 20px ${FUTURA}`; g.fillText('CIDER', cx, 148);
    g.fillStyle = '#c83a2a'; g.beginPath(); g.arc(cx, 166, 5, 0, TAU); g.fill();
  }
  return p.texture();
}

/** The round end of a barrel: concentric boards and a bung. */
export function barrelEnd() {
  const p = new Painter(128, 128, 43).fill('#a8703a');
  const g = p.g;
  for (let x = 0; x < 128; x += 18) { g.fillStyle = 'rgba(50,25,10,0.45)'; g.fillRect(x, 0, 2, 128); }
  g.strokeStyle = '#3a3634'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 60, 0, TAU); g.stroke();
  g.fillStyle = '#5a3a1a'; g.beginPath(); g.arc(64, 84, 8, 0, TAU); g.fill();
  g.fillStyle = '#e8d8b0'; g.font = `bold 20px ${FUTURA}`; g.textAlign = 'center'; g.fillText('B', 64, 52);
  return p.texture({ wrap: false });
}

/** Ripples on the cider: bright amber with glints, for a scrolling map. One tile = 6 x 6 units. */
export function ciderRipples() {
  const S = 256;
  const p = new Painter(S, S, 47).fill('#d88a1a');
  const g = p.g, rng = p.rng;
  p.dabs({ n: 80, colors: ['#f0a830', '#c06a10', '#e89420'], r: [10, 40], alpha: [0.2, 0.4], squash: 0.5 });
  g.lineCap = 'round';
  for (let i = 0; i < 120; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), w = rng.range(8, 30);
    g.strokeStyle = rng.chance(0.6) ? 'rgba(255,230,150,0.7)' : 'rgba(150,70,0,0.5)';
    g.lineWidth = rng.range(1, 3);
    for (const dx of [0, S, -S]) for (const dy of [0, S, -S]) { g.beginPath(); g.moveTo(x + dx - w, y + dy); g.quadraticCurveTo(x + dx, y + dy - 3, x + dx + w, y + dy); g.stroke(); }
  }
  // foam flecks
  for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,248,220,0.8)'; g.beginPath(); g.arc(rng.range(0, S), rng.range(0, S), rng.range(0.8, 2.5), 0, TAU); g.fill(); }
  return p.texture({ repeat: [1, 1] });
}

/** A painted sign: lettering on a board with a border, in Futura capitals (and an italic second line). */
export function signTexture(text: string, o: { bg: string; fg: string; sub?: string; w?: number; h?: number; border?: string; serif?: boolean } ) {
  const W = o.w ?? 512, H = o.h ?? 128;
  const p = new Painter(W, H, 51).fill(o.bg);
  const g = p.g;
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = Math.max(3, H * 0.05); g.strokeRect(H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = o.fg;
  const font = (px: number) => (o.serif ? `bold ${px}px Georgia, serif` : `bold ${px}px ${FUTURA}`);
  let size = Math.round(H * (o.sub ? 0.4 : 0.52));
  g.font = font(size);
  while (g.measureText(text).width > W * 0.88 && size > 8) { size -= 2; g.font = font(size); }
  g.fillText(text, W / 2, H * (o.sub ? 0.4 : 0.53));
  if (o.sub) { g.font = `italic ${Math.round(H * 0.2)}px Georgia, serif`; g.fillText(o.sub, W / 2, H * 0.76); }
  p.dabs({ n: 30, colors: ['rgba(255,255,255,1)', 'rgba(0,0,0,1)'], r: [6, 24], alpha: [0.03, 0.07] });
  return p.texture({ wrap: false });
}

/**
 * The painted panorama behind the hilltop: layered hills in night blues along the bottom (the sky above is
 * left clear, so the real starry sky shows), with the farms of Boggis, Bunce and Bean as little silhouettes
 * with lit windows. u runs round the panorama, v up.
 */
export function nightBackdrop() {
  const W = 2048, H = 512;
  const p = new Painter(W, H, 53);
  const g = p.g, rng = p.rng;
  const hill = (base: number, amp: number, col: string, seed: number, freq: number) => {
    const r = new Rng(seed);
    const ys: number[] = [];
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) { const y = base + Math.sin(x * freq + seed) * amp + Math.sin(x * freq * 2.7 + seed * 2) * amp * 0.35 + r.range(-1.5, 1.5); ys.push(y); g.lineTo(x, y); }
    g.lineTo(W, H); g.closePath(); g.fill();
    return (x: number) => ys[Math.max(0, Math.min(ys.length - 1, Math.round(x / 8)))];
  };
  hill(H * 0.5, 26, '#2a3866', 3, 0.004);
  const mid = hill(H * 0.6, 20, '#1e2a52', 7, 0.006);
  // farms on the middle hills: a barn, a house, a silo, windows lit
  for (const fx of [W * 0.3, W * 0.47, W * 0.62]) {
    const y = mid(fx);
    g.fillStyle = '#141c3a';
    g.fillRect(fx - 26, y - 22, 52, 24); g.beginPath(); g.moveTo(fx - 30, y - 22); g.lineTo(fx, y - 40); g.lineTo(fx + 30, y - 22); g.fill();
    g.fillRect(fx + 34, y - 46, 12, 48); g.beginPath(); g.arc(fx + 40, y - 46, 6, Math.PI, 0); g.fill();
    g.fillRect(fx - 60, y - 14, 26, 16);
    g.fillStyle = '#ffd890';
    for (const [dx, dy] of [[-16, -14], [-4, -14], [10, -14], [-52, -8]]) g.fillRect(fx + dx, y + dy, 5, 5);
  }
  hill(H * 0.72, 14, '#141c3a', 11, 0.009);
  hill(H * 0.84, 10, '#0c1228', 13, 0.013);
  // fence posts and a few bare trees on the nearest hills
  g.fillStyle = '#0c1228';
  for (let k = 0; k < 6; k++) {
    const tx = rng.range(0, W), ty = H * 0.84 - 6;
    g.fillRect(tx - 2, ty - 40, 4, 44);
    for (let b = 0; b < 5; b++) { g.save(); g.translate(tx, ty - 20 - b * 4); g.rotate(rng.range(-1.2, 1.2)); g.fillRect(-1, -rng.range(10, 22), 2, rng.range(10, 22)); g.restore(); }
  }
  return p.texture({ wrap: false });
}

/** A big painted moon: a pale disc with soft grey seas and a glow round it (transparent outside). */
export function moonDisc() {
  const S = 512;
  const p = new Painter(S, S, 59);
  const g = p.g;
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,240,200,0.5)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.fillStyle = '#f8f0d8'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.3, 0, TAU); g.fill();
  for (const [x, y, r] of [[0.42, 0.44, 0.06], [0.55, 0.38, 0.04], [0.58, 0.56, 0.07], [0.44, 0.6, 0.035]]) { g.fillStyle = 'rgba(190,180,160,0.45)'; g.beginPath(); g.arc(S * x, S * y, S * r, 0, TAU); g.fill(); }
  return p.texture({ wrap: false });
}

/** Dark grass seen at night for the hilltop; one tile = 4 x 4 units. */
export function nightGrass() {
  const p = new Painter(256, 256, 61).fill('#2a3a2a');
  p.dabs({ n: 80, colors: ['#334a32', '#22301f', '#3a4a30'], r: [8, 30], alpha: [0.3, 0.5] });
  p.lines({ n: 200, colors: ['#4a5e3a', '#1a2618'], alpha: [0.3, 0.6], width: [1, 2], vertical: true, wobble: 3 });
  return p.texture({ repeat: [1, 1] });
}

/** Excavator paint: faded mustard steel with rust and grime; one tile = 3 x 3 units. */
export function excavatorPaint() {
  const p = new Painter(256, 256, 67).fill('#c89a2a');
  p.dabs({ n: 60, colors: ['#a87a1a', '#d8b040', '#8a5a1a'], r: [6, 30], alpha: [0.15, 0.35] });
  p.dabs({ n: 40, colors: ['#6a3a1a', '#4a2a10'], r: [2, 8], alpha: [0.3, 0.6], squash: 2 });
  p.vgrad([[0, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(40,20,5,0.3)']]);
  return p.texture({ repeat: [1, 1] });
}

export interface SignSpec { text: string; bg: string; fg: string; sub?: string; border?: string; serif?: boolean }
/**
 * Several signs painted on one canvas (one row each, 1024 x 128), so they share a material. `uv(i)` gives
 * the [v0, v1] band of sign i for remapping a plane's UVs.
 */
export function signAtlas(signs: SignSpec[]) {
  const W = 1024, RH = 128, H = RH * signs.length;
  const p = new Painter(W, H, 57);
  const g = p.g;
  signs.forEach((o, i) => {
    const y0 = i * RH;
    g.fillStyle = o.bg; g.fillRect(0, y0, W, RH);
    if (o.border) { g.strokeStyle = o.border; g.lineWidth = 6; g.strokeRect(10, y0 + 10, W - 20, RH - 20); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = o.fg;
    const font = (px: number) => (o.serif ? `bold ${px}px Georgia, serif` : `bold ${px}px ${FUTURA}`);
    let size = o.sub ? 50 : 66;
    g.font = font(size);
    while (g.measureText(o.text).width > W * 0.9 && size > 10) { size -= 2; g.font = font(size); }
    g.fillText(o.text, W / 2, y0 + (o.sub ? 48 : 67));
    if (o.sub) { g.font = `italic 28px Georgia, serif`; g.fillText(o.sub, W / 2, y0 + 98); }
  });
  p.dabs({ n: 80, colors: ['rgba(255,255,255,1)', 'rgba(0,0,0,1)'], r: [6, 24], alpha: [0.03, 0.06] });
  const tex = p.texture({ wrap: false });
  // canvas rows run top to bottom; texture v runs bottom to top
  return { tex, uv: (i: number): [number, number] => [1 - (i + 1) / signs.length, 1 - i / signs.length] };
}
