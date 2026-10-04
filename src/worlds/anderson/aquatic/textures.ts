import { Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { css } from '../textures';

/*
 * Painted textures for the reef: sand, rock, the felt-like grain on the coral (a handmade, stop-motion look),
 * brain coral, sea fans, the candy swirl on the table coral, kelp, and the painted flats at the back of the set.
 */

/** Pale sand with ripple lines, shell grit and soft patches. One tile = 8 x 8 units. */
export function sandTexture() {
  const S = 256;
  const p = new Painter(S, S, 501).fill('#efe2c8');
  const g = p.g, rng = p.rng;
  p.dabs({ n: 60, colors: ['#f6ead4', '#e4d2b4', '#f0d8d0'], r: [10, 40], alpha: [0.15, 0.3], squash: 0.6 });
  // ripples: wavy bands across the tile, light on one side and shaded on the other
  for (let i = 0; i < 18; i++) {
    const y0 = (i / 18) * S;
    for (const [off, col] of [[0, 'rgba(255,250,236,0.55)'], [3, 'rgba(170,140,110,0.32)']] as Array<[number, string]>) {
      g.strokeStyle = col; g.lineWidth = 2.2;
      g.beginPath();
      for (let x = -8; x <= S + 8; x += 8) {
        const y = y0 + off + Math.sin((x / S) * TAU * 2 + i * 1.7) * 4 + Math.sin((x / S) * TAU * 5 + i) * 1.5;
        if (x === -8) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // grit: shell bits in pink and lilac, dark grains
  for (let i = 0; i < 700; i++) {
    g.fillStyle = rng.pick(['rgba(255,255,255,0.7)', 'rgba(240,170,190,0.6)', 'rgba(190,170,230,0.55)', 'rgba(120,100,80,0.45)']);
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(0.6, 1.8);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  return p.texture({ repeat: [1, 1] });
}

/** Porous reef rock in lilac and pink, with pits and encrusting dots. One tile = 4 x 4 units. White-ish, so a colour can tint it. */
export function rockTexture() {
  const S = 256;
  const p = new Painter(S, S, 503).fill('#d4c8dc');
  const g = p.g, rng = p.rng;
  p.dabs({ n: 90, colors: ['#e8dcec', '#c4b8d0', '#efd8e0', '#cfd8e4'], r: [8, 30], alpha: [0.2, 0.4] });
  for (let i = 0; i < 260; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(1.5, 4.5);
    g.fillStyle = 'rgba(90,70,110,0.28)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, TAU); g.fill();
  }
  // encrusting dots of colour, like tiny sponges
  for (let i = 0; i < 120; i++) {
    g.fillStyle = rng.pick(['#f4a6c0', '#ffe28a', '#9ef0d0', '#c6a8f0', '#ffb98a']);
    g.globalAlpha = rng.range(0.5, 0.9);
    const x = rng.range(0, S), y = rng.range(0, S);
    g.beginPath(); g.arc(x, y, rng.range(1.2, 3), 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  return p.texture({ repeat: [1, 1] });
}

/**
 * Felt grain for the coral: nearly white with fine fibres and speckles, so instance colours show through and the
 * coral looks hand-made, like the film's stop-motion sets.
 */
export function feltTexture() {
  const S = 128;
  const p = new Painter(S, S, 507).fill('#f4f0ec');
  p.lines({ n: 90, colors: ['rgba(255,255,255,0.9)', 'rgba(150,130,150,0.6)'], alpha: [0.08, 0.2], width: [0.6, 1.2], wobble: 3 });
  p.lines({ n: 90, colors: ['rgba(255,255,255,0.9)', 'rgba(150,130,150,0.6)'], alpha: [0.08, 0.2], width: [0.6, 1.2], wobble: 3, vertical: true });
  p.dabs({ n: 160, colors: ['#ffffff', '#d8ccd8', '#e8d8d0'], r: [0.6, 1.6], alpha: [0.3, 0.6] });
  p.dabs({ n: 30, colors: ['#e6dce6', '#ffffff'], r: [4, 12], alpha: [0.12, 0.25] });
  return p.texture({ repeat: [1, 1] });
}

/** Brain coral: a maze of ridges. For a sphere (wraps across u). */
export function brainTexture() {
  const W = 256, H = 128;
  const p = new Painter(W, H, 509).fill('#f2ece6');
  const g = p.g, rng = p.rng;
  g.lineCap = 'round';
  for (let k = 0; k < 70; k++) {
    let x = rng.range(0, W), y = rng.range(6, H - 6), a = rng.range(0, TAU);
    const steps = rng.int(8, 22);
    for (const [w, col] of [[6, 'rgba(120,90,110,0.45)'], [3, 'rgba(255,255,255,0.85)']] as Array<[number, string]>) {
      g.strokeStyle = col; g.lineWidth = w;
      let xx = x, yy = y, aa = a;
      g.beginPath(); g.moveTo(xx, yy);
      for (let i = 0; i < steps; i++) { aa += rng.range(-0.6, 0.6); xx += Math.cos(aa) * 5; yy += Math.sin(aa) * 5; g.lineTo(xx, yy); }
      g.stroke();
    }
    x += 0; a += 0;
  }
  return p.texture();
}

/** A sea fan: a lacy fan of branching lines on a transparent canvas (use with alphaTest). Bottom centre is the stem. */
export function fanTexture() {
  const W = 256, H = 256;
  const p = new Painter(W, H, 511);
  const g = p.g, rng = p.rng;
  g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.2) * len * 0.5, y + Math.sin(a + 0.2) * len * 0.5, x2, y2); g.stroke();
    if (depth <= 0) return;
    for (const s of [-1, 1]) branch(x2, y2, a + s * rng.range(0.25, 0.55), len * rng.range(0.7, 0.85), Math.max(1.2, w * 0.72), depth - 1);
  };
  for (const a of [-1.15, -1.45, -1.75, -2.0]) branch(W / 2, H - 4, a + rng.range(-0.1, 0.1), 52, 6, 5);
  // the cross-links that make it a net
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 160; i++) {
    const r = rng.range(40, 230), a0 = rng.range(-2.7, -0.45);
    const a1 = a0 + rng.range(0.05, 0.14);
    g.beginPath(); g.arc(W / 2, H - 4, r, a0, a1); g.stroke();
  }
  return p.texture({ wrap: false });
}

/** A candy swirl for the top of the table coral (a disc, seen from above). */
export function swirlTexture() {
  const S = 256;
  const p = new Painter(S, S, 513).fill('#fff6f0');
  const g = p.g;
  const cols = ['#f4a6c0', '#fff6f0', '#9fd8ff', '#fff6f0', '#ffe28a', '#fff6f0', '#c6a8f0', '#fff6f0'];
  for (let i = 0; i < cols.length; i++) {
    g.fillStyle = cols[i];
    g.beginPath();
    g.moveTo(S / 2, S / 2);
    for (let k = 0; k <= 60; k++) {
      const t = k / 60, a = (i / cols.length) * TAU + t * TAU * 1.4;
      g.lineTo(S / 2 + Math.cos(a) * t * S * 0.5, S / 2 + Math.sin(a) * t * S * 0.5);
    }
    for (let k = 60; k >= 0; k--) {
      const t = k / 60, a = ((i + 1) / cols.length) * TAU + t * TAU * 1.4;
      g.lineTo(S / 2 + Math.cos(a) * t * S * 0.5, S / 2 + Math.sin(a) * t * S * 0.5);
    }
    g.closePath(); g.fill();
  }
  p.dabs({ n: 60, colors: ['#ffffff'], r: [1, 2.5], alpha: [0.3, 0.6] });
  return p.texture({ wrap: false });
}

/** Kelp blades: olive-gold with a paler midrib and dark veins. For a strip whose v runs up the stalk. */
export function kelpTexture() {
  const W = 64, H = 256;
  const p = new Painter(W, H, 517).fill('#c8b04a');
  const g = p.g;
  p.hgrad([[0, 'rgba(90,70,20,0.45)'], [0.3, 'rgba(0,0,0,0)'], [0.5, 'rgba(255,240,170,0.35)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(90,70,20,0.45)']]);
  g.strokeStyle = 'rgba(110,90,30,0.4)'; g.lineWidth = 1;
  for (let y = 0; y < H; y += 9) { g.beginPath(); g.moveTo(W / 2, y); g.quadraticCurveTo(W * 0.25, y - 3, 2, y - 8); g.moveTo(W / 2, y); g.quadraticCurveTo(W * 0.75, y - 3, W - 2, y - 8); g.stroke(); }
  g.fillStyle = 'rgba(255,245,190,0.55)'; g.fillRect(W / 2 - 1.5, 0, 3, H);
  return p.texture({ repeat: [1, 1] });
}

/**
 * A painted flat for the back of the set: a ragged skyline of reef (branching coral, fans, boulders, kelp) in
 * one flat colour on a transparent canvas, like the cut-out scenery at the back of a stage. Use with alphaTest.
 */
export function reefFlat(seed: number, color = '#ffffff') {
  const W = 1024, H = 256;
  const p = new Painter(W, H, seed);
  const g = p.g, rng = new Rng(seed);
  g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round';
  // base mound
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) g.lineTo(x, H - 50 - Math.sin(x * 0.011 + seed) * 22 - Math.sin(x * 0.037) * 10);
  g.lineTo(W, H); g.closePath(); g.fill();
  const branch = (x: number, y: number, a: number, len: number, w: number, d: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    if (d <= 0) { g.beginPath(); g.arc(x2, y2, w * 0.7, 0, TAU); g.fill(); return; }
    for (const s of [-1, 1]) if (rng.chance(0.85)) branch(x2, y2, a + s * rng.range(0.25, 0.6), len * rng.range(0.6, 0.8), w * 0.75, d - 1);
  };
  for (let i = 0; i < 26; i++) {
    const x = rng.range(10, W - 10), base = H - 55;
    const kind = rng.int(0, 4);
    if (kind === 0) branch(x, base, -Math.PI / 2 + rng.range(-0.3, 0.3), rng.range(30, 50), rng.range(8, 13), 3);
    else if (kind === 1) { g.beginPath(); g.ellipse(x, base, rng.range(30, 60), rng.range(25, 50), 0, Math.PI, TAU); g.fill(); }
    else if (kind === 2) { // a fan
      g.beginPath(); g.moveTo(x, base); g.arc(x, base, rng.range(40, 80), -Math.PI * 0.85, -Math.PI * 0.15); g.closePath(); g.fill();
    } else if (kind === 3) { // tube sponges
      for (let k = 0; k < 4; k++) { const w = rng.range(8, 14); g.fillRect(x + k * w * 1.1, base - rng.range(30, 80), w, 90); }
    } else { // kelp
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(x, base);
      for (let y = base; y > 10; y -= 12) g.lineTo(x + Math.sin(y * 0.05 + i) * 10, y);
      g.stroke();
    }
  }
  return p.texture({ wrap: false });
}

/** A round soft bubble: a thin bright ring with a highlight, transparent inside. For point sprites. */
export function bubbleSprite() {
  const S = 64;
  const p = new Painter(S, S, 519);
  const g = p.g;
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.48);
  gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.92, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, S * 0.48, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(S * 0.38, S * 0.34, S * 0.09, S * 0.06, -0.6, 0, TAU); g.fill();
  const t = p.texture({ wrap: false });
  return t;
}

/** Plain paint with a little brush texture, for props. */
export function paintTex(color: number, seed = 521) {
  const p = new Painter(64, 64, seed).fill(css(color));
  p.dabs({ n: 20, colors: [css(color, 1.06), css(color, 0.93)], r: [4, 14], alpha: [0.12, 0.25] });
  return p.texture({ repeat: [1, 1] });
}
