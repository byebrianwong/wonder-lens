import { Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { css } from '../textures';
import { FUTURA } from '../film';

/*
 * Painted textures for Gabelmeister's Peak: the ice of the bobsled run (with its painted lines and the run's
 * name lettered under the ice), the red-and-white striped lip of its walls, groomed snow, the snow banks, and
 * the painted backdrop of the Alps.
 */

/** Width (across the channel, in units) and length of one tile of the ice texture. */
export const ICE_U = 14, ICE_V = 16;

/**
 * The ice inside the channel. u runs across the channel's inner surface (0.5 at the centre of the floor,
 * one tile = 14 units of surface), v along the run (one tile = 16 units). The floor is pale and glassy with
 * runner grooves, the walls bluer; a powder-blue centre line and pink lines at the floor's edges are painted
 * under the ice, and GABELMEISTER is lettered along each wall.
 */
export function iceTexture() {
  const W = 512, H = 512;
  const p = new Painter(W, H, 301);
  const g = p.g;
  const X = (uw: number) => (0.5 + uw / ICE_U) * W; // canvas x of a surface offset from the centre
  // the floor whiter, the corners and walls bluer, paler again near the top
  const gr = g.createLinearGradient(0, 0, W, 0);
  const st = (uw: number, c: string) => gr.addColorStop(Math.min(1, Math.max(0, 0.5 + uw / ICE_U)), c);
  st(-7, '#eef6fc'); st(-5.2, '#b8d4ec'); st(-3.4, '#a8c8e6'); st(-2.2, '#cfe4f4'); st(-1.4, '#e6f2fa'); st(0, '#f2f8fd');
  st(1.4, '#e6f2fa'); st(2.2, '#cfe4f4'); st(3.4, '#a8c8e6'); st(5.2, '#b8d4ec'); st(7, '#eef6fc');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // cloudy patches in the ice
  p.dabs({ n: 70, colors: ['#ffffff', '#c4dcf0', '#dceaf6'], r: [8, 34], alpha: [0.08, 0.2], squash: 3 });
  // painted lines under the ice
  const line = (uw: number, w: number, c: string) => { g.fillStyle = c; g.fillRect(X(uw) - w / 2, 0, w, H); };
  line(0, 7, 'rgba(110,150,210,0.55)');
  for (const s of [-1, 1]) { line(s * 1.3, 5, 'rgba(232,120,150,0.65)'); line(s * 1.55, 3, 'rgba(232,120,150,0.5)'); }
  // the run's name along each wall, lettered in Futura under the ice
  g.save();
  g.font = `bold 30px ${FUTURA}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const s of [-1, 1]) {
    g.save();
    g.translate(X(s * 3.9), H / 2);
    g.rotate(s * Math.PI / 2);
    g.fillStyle = 'rgba(70,90,170,0.42)';
    g.fillText('GABELMEISTER', 0, 0);
    g.restore();
  }
  g.restore();
  // runner grooves and scratches along the floor
  const rng = new Rng(302);
  for (let i = 0; i < 160; i++) {
    const uw = rng.range(-2.4, 2.4) + (rng.chance(0.5) ? 0 : (rng.chance(0.5) ? -0.45 : 0.45) - rng.range(-0.1, 0.1));
    g.globalAlpha = rng.range(0.08, 0.3);
    g.strokeStyle = rng.chance(0.6) ? '#ffffff' : '#9cb8d8';
    g.lineWidth = rng.range(0.6, 1.8);
    const y0 = rng.range(0, H), len = rng.range(60, 300);
    g.beginPath(); g.moveTo(X(uw), y0); g.lineTo(X(uw + rng.range(-0.05, 0.05)), y0 + len); g.stroke();
    if (y0 + len > H) { g.beginPath(); g.moveTo(X(uw), y0 - H); g.lineTo(X(uw), y0 + len - H); g.stroke(); }
  }
  g.globalAlpha = 1;
  const t = p.texture({ repeat: [1, 1] });
  t.anisotropy = 8;
  return t;
}

/** The top of the channel's walls: red and white blocks, one of each per tile (v), across the cap (u). */
export function lipTexture() {
  const p = new Painter(32, 128, 311).fill('#fbf6f2');
  const g = p.g;
  g.fillStyle = '#c8323c'; g.fillRect(0, 0, 32, 64);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 0, 32, 3); g.fillRect(0, 64, 32, 3);
  g.fillStyle = 'rgba(80,40,60,0.18)'; g.fillRect(0, 0, 4, 128);
  return p.texture({ repeat: [1, 1] });
}

/** Groomed snow: the corduroy of a piste machine, pale with lilac grooves, running along v. One tile = 4 x 4 units. */
export function pisteTexture() {
  const S = 256;
  const p = new Painter(S, S, 321).fill('#f6f4fa');
  const g = p.g;
  for (let x = 0; x < S; x += 6) {
    g.fillStyle = 'rgba(170,160,210,0.16)'; g.fillRect(x, 0, 2, S);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 3, 0, 1, S);
  }
  p.dabs({ n: 40, colors: ['#ffffff', '#e4e0f2'], r: [6, 26], alpha: [0.1, 0.25], squash: 2.5 });
  return p.texture({ repeat: [1, 1] });
}

/** Wind-packed snow for banks and walls: soft blue-lilac hollows and bright crusts. One tile = 6 units. */
export function snowTexture(seed = 331) {
  const S = 256;
  const p = new Painter(S, S, seed).fill('#f4f2f8');
  p.dabs({ n: 60, colors: ['#e2e0f2', '#dce6f6', '#ffffff'], r: [10, 40], alpha: [0.15, 0.35], squash: 0.45 });
  p.dabs({ n: 140, colors: ['#ffffff', '#d8d4ee'], r: [1.5, 4], alpha: [0.2, 0.45] });
  return p.texture({ repeat: [1, 1] });
}

/** A pennant or banner: a field with a pale border and a crossed-keys roundel or a single stripe. */
export function bannerTexture(field: number, trim: number, kind: 'keys' | 'stripe' | 'plain' = 'stripe') {
  const W = 64, H = 128;
  const p = new Painter(W, H, 341).fill(css(field));
  const g = p.g;
  g.fillStyle = css(trim);
  g.fillRect(0, 0, W, 6); g.fillRect(0, 0, 5, H); g.fillRect(W - 5, 0, 5, H);
  if (kind === 'stripe') g.fillRect(W / 2 - 7, 0, 14, H);
  if (kind === 'keys') {
    g.beginPath(); g.arc(W / 2, H * 0.42, 17, 0, TAU); g.fill();
    g.strokeStyle = css(field, 0.7); g.lineWidth = 3;
    for (const s of [-1, 1]) { g.save(); g.translate(W / 2, H * 0.42); g.rotate(s * 0.7); g.beginPath(); g.moveTo(0, -12); g.lineTo(0, 10); g.stroke(); g.beginPath(); g.arc(0, -13, 3.5, 0, TAU); g.stroke(); g.restore(); }
  }
  // a swallowtail cut at the bottom
  g.clearRect(0, H - 1, W, 1);
  g.save(); g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, H); g.lineTo(W / 2, H - 22); g.lineTo(W, H); g.closePath(); g.fill();
  g.restore();
  return p.texture({ wrap: false });
}

/** A painted wooden sign in Futura capitals: cream on a coloured board with a thin border. */
export function signTexture(text: string, o: { bg?: string; fg?: string; w?: number; h?: number; sub?: string } = {}) {
  const W = o.w ?? 512, H = o.h ?? 128;
  const p = new Painter(W, H, 351).fill(o.bg ?? '#2a3a6a');
  const g = p.g;
  g.strokeStyle = o.fg ?? '#f6efe2'; g.lineWidth = Math.max(2, H * 0.03);
  g.strokeRect(H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14);
  g.fillStyle = o.fg ?? '#f6efe2';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const size = Math.round(H * (o.sub ? 0.36 : 0.46));
  g.font = `bold ${size}px ${FUTURA}`;
  // letter-spaced capitals
  const chars = [...text];
  const sp = size * 0.12;
  const widths = chars.map((c) => g.measureText(c).width);
  let total = widths.reduce((s, w) => s + w, 0) + sp * (chars.length - 1);
  let scale = 1;
  if (total > W * 0.86) { scale = (W * 0.86) / total; total = W * 0.86; }
  let x = W / 2 - total / 2;
  g.save(); g.translate(0, o.sub ? H * 0.4 : H * 0.53);
  g.textAlign = 'left';
  chars.forEach((c, i) => { g.save(); g.translate(x, 0); g.scale(scale, 1); g.fillText(c, 0, 0); g.restore(); x += (widths[i] + sp) * scale; });
  g.restore();
  if (o.sub) { g.textAlign = 'center'; g.font = `italic ${Math.round(H * 0.2)}px Georgia, serif`; g.fillText(o.sub, W / 2, H * 0.74); }
  return p.texture({ wrap: false });
}
