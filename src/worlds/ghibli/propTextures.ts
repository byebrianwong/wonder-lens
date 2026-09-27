import { Painter } from '../../engine/Paint';
import { css } from './characterTextures';

/**
 * Painted textures for the sea train and the smaller props along the line (church, sailboats, shrine,
 * lanterns, jizo statues, poles). Tiling textures are meant for geometry whose UVs are in world units
 * (see boxUV and repeatUV in engine/Paint.ts); each says how many units one tile covers.
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

/** Plaster wall bay with one tall arched window (church walls); one tile covers a 4 x 4 unit bay. */
export function plasterBay(wall: number, glass: string) {
  const S = 256;
  const p = new Painter(S, S, 311).fill(css(wall));
  p.dabs({ n: 50, colors: [css(wall, 1.04), css(wall, 0.93)], r: [8, 30], alpha: [0.1, 0.2], squash: 0.7 });
  const g = p.g;
  const cx = S / 2, top = S * 0.3, bottom = S * 0.82, hw = S * 0.12;
  const arch = (pad: number) => { g.beginPath(); g.moveTo(cx - hw - pad, bottom + pad); g.lineTo(cx - hw - pad, top); g.arc(cx, top, hw + pad, Math.PI, 0); g.lineTo(cx + hw + pad, bottom + pad); g.closePath(); };
  g.fillStyle = css(wall, 0.82); arch(7); g.fill();
  g.fillStyle = glass; arch(0); g.fill();
  // leading in the glass
  g.strokeStyle = 'rgba(30,30,40,0.6)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx, top - hw); g.lineTo(cx, bottom); g.stroke();
  for (let y = top; y < bottom; y += 18) { g.beginPath(); g.moveTo(cx - hw, y); g.lineTo(cx + hw, y); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(cx - hw, top, hw * 0.5, bottom - top);
  // sill, and damp staining at the foot of the wall
  g.fillStyle = css(wall, 1.08); g.fillRect(cx - hw - 12, bottom + 6, hw * 2 + 24, 7);
  const gr = g.createLinearGradient(0, S * 0.85, 0, S);
  gr.addColorStop(0, 'rgba(90,80,60,0)'); gr.addColorStop(1, 'rgba(90,80,60,0.3)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
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

/** Clinker-built hull planks with a painted stripe and a darker band at the waterline (box, tiles every 2 units). */
export function hullPlanks(color: number, stripe: string) {
  const p = new Painter(256, 128, 313).fill(css(color));
  const g = p.g;
  for (let i = 0; i < 6; i++) { const y = i * 21.3; g.fillStyle = css(color, p.rng.range(0.92, 1.08)); g.fillRect(0, y, 256, 20); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y + 18, 256, 3); }
  g.fillStyle = stripe; g.fillRect(0, 12, 256, 8);
  g.fillStyle = 'rgba(30,40,40,0.55)'; g.fillRect(0, 104, 256, 24);
  p.lines({ n: 10, colors: ['rgba(20,20,20,1)'], alpha: [0.06, 0.14], width: [2, 5], vertical: true });
  return p.texture({ repeat: [1, 1] });
}

/** Sail canvas: off-white panels with stitched seams and a soft shadow along the luff. */
export function sailCloth() {
  const p = new Painter(128, 256, 314).fill('#fbf5e6');
  const g = p.g;
  for (let i = 1; i < 7; i++) { const y = i * 36; g.fillStyle = 'rgba(150,130,100,0.35)'; g.fillRect(0, y, 128, 2); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(0, y + 2, 128, 1); }
  const gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, 'rgba(120,110,90,0.25)'); gr.addColorStop(0.3, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(120,110,90,0.12)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
  return p.texture({ wrap: false });
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

/** A jizo's stone head (sphere facing +z): granite with a calm carved face, eyes closed. */
export function jizoHead(color: number) {
  const p = new Painter(256, 128, 318).fill(css(color));
  p.dabs({ n: 200, colors: [css(color, 1.2), css(color, 0.75)], r: [0.6, 1.6], alpha: [0.4, 0.8] });
  p.dabs({ n: 12, colors: ['#8a9a5a', '#a8a878'], r: [3, 7], alpha: [0.25, 0.45], y: [0, 0.35] });
  const g = p.g;
  g.strokeStyle = css(color, 0.55); g.lineWidth = 2; g.lineCap = 'round';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(64 + s * 16 - 6, 62); g.quadraticCurveTo(64 + s * 16, 66, 64 + s * 16 + 6, 62); g.stroke(); }
  g.beginPath(); g.moveTo(64, 66); g.lineTo(64, 74); g.stroke();
  g.beginPath(); g.moveTo(60, 82); g.quadraticCurveTo(64, 85, 68, 82); g.stroke();
  return p.texture();
}
