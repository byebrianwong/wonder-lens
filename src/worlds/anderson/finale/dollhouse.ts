import * as THREE from 'three';
import { box, cyl, glow, mesh, sphere, toon } from '../../../engine/Builders';
import { Painter, boxUV, repeatUV } from '../../../engine/Paint';
import { TAU } from '../../../engine/math';
import { fishScales, stucco } from '../textures';
import { FUTURA } from '../film';
import { optimize } from '../common';
import { HOUSE, STAGE_Y } from './plan';

/*
 * The dollhouse at the back of the stage: the Grand Budapest Hotel as a giant model with its front taken off,
 * fifteen rooms in three floors, each room a film (the ones the ride passed through, and a few it did not:
 * The Royal Tenenbaums, The Darjeeling Limited, The French Dispatch). Every room's back wall is painted into
 * one atlas, so the whole house is a handful of draw calls. The rooms glow like lit windows at night.
 */

interface Room { title: string; wall: number; floor: number; paint(g: CanvasRenderingContext2D, w: number, h: number): void; props?(add: (o: THREE.Object3D) => void, m: (c: number) => THREE.Material): void }

const circle = (g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
const rect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const window_ = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sky: string, frame = '#f4ecdc') => {
  rect(g, x - 6, y - 6, w + 12, h + 12, frame); rect(g, x, y, w, h, sky);
  rect(g, x + w / 2 - 3, y, 6, h, frame); rect(g, x, y + h / 2 - 3, w, 6, frame);
};
const stripesV = (g: CanvasRenderingContext2D, w: number, h: number, a: string, b: string, n: number) => { for (let i = 0; i < n; i++) rect(g, (i * w) / n, 0, w / n, h, i % 2 ? b : a); };

/** The rooms, top floor first, left to right as the audience sees them. */
const ROOMS: Room[] = [
  // ---- top floor ----
  { title: "Gabelmeister's Peak", wall: 0xdfe6f2, floor: 0x8a8aa0, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#dfe6f2');
    g.fillStyle = '#c8d0e8'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w / 2, h * 1.6, h * (0.9 + i * 0.25), Math.PI, TAU); g.lineWidth = 6; g.strokeStyle = '#c8d0e8'; g.stroke(); }
    window_(g, w * 0.32, h * 0.18, w * 0.36, h * 0.42, '#5a7ac8');
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w * 0.34, h * 0.6); g.lineTo(w * 0.45, h * 0.32); g.lineTo(w * 0.56, h * 0.5); g.lineTo(w * 0.66, h * 0.36); g.lineTo(w * 0.66, h * 0.6); g.closePath(); g.fill();
  }, props(add, m) { const t = cyl(0.25, 0.35, 2.2, m(0x8a7a6a), 0.8, 1.6, -1.2); t.rotation.z = 0.6; add(t); add(cyl(0.06, 0.06, 1.4, m(0x5a4a3a), 0.4, 0.7, -1.2)); } },
  { title: 'Camp Ivanhoe', wall: 0xc8b070, floor: 0x7a6a3a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#86a8c8'); rect(g, 0, h * 0.62, w, h * 0.38, '#7a8a4a');
    g.fillStyle = '#c8b070'; g.beginPath(); g.moveTo(w * 0.2, h * 0.92); g.lineTo(w * 0.5, h * 0.25); g.lineTo(w * 0.8, h * 0.92); g.closePath(); g.fill();
    g.fillStyle = '#4a3a20'; g.beginPath(); g.moveTo(w * 0.44, h * 0.92); g.lineTo(w * 0.5, h * 0.52); g.lineTo(w * 0.56, h * 0.92); g.closePath(); g.fill();
    rect(g, w * 0.86, h * 0.1, 4, h * 0.8, '#ddd'); rect(g, w * 0.86, h * 0.1, w * 0.1, h * 0.08, '#c83a2a');
  } },
  { title: "Summer's End", wall: 0xc84a3a, floor: 0x6a3a2a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#e8b048'); rect(g, 0, h * 0.7, w, h * 0.3, '#c84a3a');
    window_(g, w * 0.38, h * 0.14, w * 0.24, h * 0.36, '#6aa0b8');
    // shelves of books, and Suzy's suitcase
    for (let i = 0; i < 3; i++) for (let k = 0; k < 9; k++) rect(g, w * 0.06 + k * 13, h * (0.2 + i * 0.16), 10, h * 0.12, ['#c83a2a', '#3a6a9a', '#e8d070', '#6a8a4a'][(i + k) % 4]);
  }, props(add, m) { add(box(1.0, 0.6, 0.7, m(0x3a6a9a), 1.6, 0.3, -1.4)); add(cyl(0.45, 0.45, 0.12, m(0x1a1a1a), -1.4, 0.7, -1.6)); add(box(1.1, 0.6, 0.9, m(0xe8d070), -1.4, 0.3, -1.6)); } },
  { title: 'The Royal Tenenbaums', wall: 0xd88a8a, floor: 0x5a3a3a, paint(g, w, h) {
    // Margot's bathroom: tiled walls, a little television on the bath
    rect(g, 0, 0, w, h, '#f0d8d8');
    g.strokeStyle = '#d8b0b0'; g.lineWidth = 2; for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    rect(g, w * 0.1, h * 0.62, w * 0.6, h * 0.24, '#fff'); rect(g, w * 0.42, h * 0.48, w * 0.14, h * 0.14, '#3a3a3a'); rect(g, w * 0.44, h * 0.5, w * 0.1, h * 0.09, '#8ac8a8');
    g.fillStyle = '#3a2a5a'; g.font = `bold 22px ${FUTURA}`; g.fillText('111 ARCHER AVE', w * 0.62, h * 0.18);
  } },
  { title: 'The Darjeeling Limited', wall: 0x4a88c0, floor: 0x3a3a6a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#4a88c0');
    for (let x = 18; x < w; x += 46) for (let y = 30; y < h * 0.6; y += 52) { g.fillStyle = '#a8d0f0'; g.beginPath(); g.ellipse(x, y, 14, 9, 0, 0, TAU); g.fill(); rect(g, x - 10, y + 6, 4, 10, '#a8d0f0'); rect(g, x + 6, y + 6, 4, 10, '#a8d0f0'); }
    window_(g, w * 0.3, h * 0.2, w * 0.4, h * 0.3, '#f0c070', '#2a4a7a');
    rect(g, 0, h * 0.66, w, h * 0.34, '#2a4a7a');
  }, props(add, m) { add(box(0.9, 0.5, 0.6, m(0x8a5a34), -1.6, 0.25, -1.5)); add(box(0.7, 0.45, 0.5, m(0x8a5a34), -1.5, 0.72, -1.5)); add(box(0.6, 0.35, 0.4, m(0x8a5a34), 1.7, 0.18, -1.5)); } },
  // ---- middle floor ----
  { title: 'The French Dispatch', wall: 0xe8e0c8, floor: 0x6a5a4a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#e8e0c8');
    for (let i = 0; i < 6; i++) { rect(g, w * 0.06 + i * w * 0.15, h * 0.12, w * 0.12, h * 0.18, ['#c83a2a', '#e8b030', '#3a7aa8', '#6a9a5a', '#d87a8a', '#8a5aa8'][i]); rect(g, w * 0.07 + i * w * 0.15, h * 0.14, w * 0.1, h * 0.04, '#fff'); }
    g.fillStyle = '#2a2a2a'; g.font = `bold 26px ${FUTURA}`; g.textAlign = 'center'; g.fillText('NO CRYING', w / 2, h * 0.5); g.textAlign = 'left';
  }, props(add, m) { for (const x of [-1.6, 1.6]) { add(box(1.4, 0.08, 0.8, m(0x6a4a30), x, 0.8, -1.2)); add(box(0.5, 0.25, 0.4, m(0x2a2a2a), x, 0.95, -1.3)); } } },
  { title: "Mendl's", wall: 0xf4bccb, floor: 0x9ac8e8, paint(g, w, h) {
    stripesV(g, w, h, '#f4bccb', '#f8d4dc', 16);
    g.fillStyle = '#c8323c'; g.font = `italic bold 46px Georgia, serif`; g.textAlign = 'center'; g.fillText("Mendl's", w / 2, h * 0.3); g.textAlign = 'left';
    // shelves of pastries in the window
    for (let k = 0; k < 2; k++) { rect(g, w * 0.1, h * (0.5 + k * 0.18), w * 0.8, 6, '#c8a050'); for (let i = 0; i < 9; i++) circle(g, w * 0.14 + i * w * 0.09, h * (0.47 + k * 0.18), 12, ['#b8a0d8', '#f2a8bc', '#a8d8b0'][(i + k) % 3]); }
  }, props(add, m) {
    for (let i = 0; i < 3; i++) for (let k = 0; k < 3 - i; k++) add(box(0.7, 0.5, 0.7, m(0xf4bccb), -2 + k * 0.75 + i * 0.37, 0.25 + i * 0.5, -1.4));
    // a Courtesan au chocolat: three choux, lavender, pink, green
    for (const [r, y, c] of [[0.45, 0.45, 0xb8a0d8], [0.32, 1.0, 0xf2a8bc], [0.2, 1.4, 0xa8d8b0]] as const) { const s = sphere(r, m(c), 1.6, y, -1.2, 12, 10); s.scale.y = 0.8; add(s); }
  } },
  { title: 'The Grand Budapest Hotel', wall: 0xc83a4a, floor: 0x7a1a2a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#c86a7a');
    // the wall of key cubbies behind the concierge's desk
    for (let i = 0; i < 8; i++) for (let k = 0; k < 5; k++) { rect(g, w * 0.18 + i * w * 0.08, h * 0.12 + k * h * 0.09, w * 0.07, h * 0.08, '#6a2a2a'); circle(g, w * 0.215 + i * w * 0.08, h * 0.16 + k * h * 0.09, 3, '#e8c060'); }
    rect(g, w * 0.18, h * 0.58, w * 0.64, h * 0.1, '#e8c060');
  }, props(add, m) { add(box(4.2, 1.1, 0.9, m(0x6a1a2a), 0, 0.55, -1.0)); add(box(4.3, 0.08, 1.0, m(0xd8a840), 0, 1.12, -1.0)); const bell = sphere(0.16, m(0xd8a840), 1.2, 1.24, -0.9, 10, 6); bell.scale.y = 0.6; add(bell); } },
  { title: 'Asteroid City', wall: 0x9ad8c8, floor: 0xe8c8a8, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#7ac8d8'); rect(g, 0, h * 0.6, w, h * 0.4, '#f0c8a0');
    g.fillStyle = '#e89a7a'; g.beginPath(); g.moveTo(w * 0.05, h * 0.62); g.lineTo(w * 0.15, h * 0.36); g.lineTo(w * 0.35, h * 0.36); g.lineTo(w * 0.45, h * 0.62); g.closePath(); g.fill();
    circle(g, w * 0.75, h * 0.25, 22, '#fff4d0');
    g.fillStyle = '#c8e8e0'; g.beginPath(); g.ellipse(w * 0.6, h * 0.15, 36, 9, 0, 0, TAU); g.fill();
  }, props(add, m) { add(box(0.9, 1.6, 0.6, m(0xd8483a), -1.8, 0.8, -1.5)); add(box(0.7, 0.4, 0.05, m(0xfff4c8), -1.8, 1.2, -1.19)); } },
  { title: 'The Belafonte', wall: 0x8ac0d8, floor: 0x3a5a7a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#a8d0e0');
    for (let i = 0; i < 3; i++) { circle(g, w * (0.25 + i * 0.25), h * 0.36, 34, '#f4ecdc'); circle(g, w * (0.25 + i * 0.25), h * 0.36, 26, '#2a6a9a'); }
    g.fillStyle = '#c8202a'; g.font = `bold 24px ${FUTURA}`; g.textAlign = 'center'; g.fillText('TEAM ZISSOU', w / 2, h * 0.72); g.textAlign = 'left';
  }, props(add, m) { const s = sphere(0.5, m(0xe8c830), 1.4, 0.6, -1.3, 12, 10); s.scale.set(1.6, 0.9, 0.9); add(s); } },
  // ---- ground floor ----
  { title: 'Fantastic Mr. Fox', wall: 0xe0902a, floor: 0x6a3a1a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#d8862a');
    for (let y = 0; y < h; y += 26) rect(g, 0, y, w, 6, '#b86a1a');
    window_(g, w * 0.36, h * 0.16, w * 0.28, h * 0.3, '#f0c060', '#7a4a1a');
    circle(g, w * 0.18, h * 0.3, 24, '#f4e6d2'); circle(g, w * 0.82, h * 0.3, 24, '#f4e6d2');
  }, props(add, m) { add(box(1.6, 0.8, 0.9, m(0x8a4a1a), 0, 0.4, -1.2)); add(cyl(0.3, 0.3, 0.5, m(0xd8b880), 0.4, 1.05, -1.2)); } },
  { title: 'Trash Island', wall: 0x8a8a84, floor: 0x5a5a54, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#a8a49a');
    const cols = ['#7a7a74', '#9a6a4a', '#6a7a8a', '#c8b88a', '#5a7a5a', '#d8d4c8'];
    for (let y = 0; y < h; y += 34) for (let x = (y / 34) % 2 ? -20 : 0; x < w; x += 40) rect(g, x + 2, y + 2, 36, 30, cols[(x * 7 + y * 3) % cols.length]);
  }, props(add, m) { for (const [x, y] of [[-1.8, 0.4], [-1.0, 0.4], [-1.4, 1.2], [1.8, 0.4]]) add(box(0.78, 0.78, 0.78, m(0x8a7a6a), x, y, -1.3)); } },
  { title: 'The Lobby', wall: 0xd8606a, floor: 0x9a1a2a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#d86a74');
    // the lift: rose-red doors with a gilt arrow dial above
    rect(g, w * 0.36, h * 0.24, w * 0.28, h * 0.64, '#e8c060'); rect(g, w * 0.38, h * 0.28, w * 0.24, h * 0.6, '#a8202e'); rect(g, w * 0.497, h * 0.28, 3, h * 0.6, '#e8c060');
    g.strokeStyle = '#e8c060'; g.lineWidth = 4; g.beginPath(); g.arc(w / 2, h * 0.2, 22, Math.PI, TAU); g.stroke();
    for (const x of [0.15, 0.85]) { rect(g, w * x - 8, h * 0.2, 16, h * 0.7, '#e8c060'); }
  } },
  { title: "Bean's Cellar", wall: 0x8a5a2a, floor: 0x3a2414, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#6a4424');
    for (let i = 0; i < 5; i++) for (let k = 0; k < 2; k++) { circle(g, w * (0.12 + i * 0.19), h * (0.3 + k * 0.32), 34, '#9a6a3a'); circle(g, w * (0.12 + i * 0.19), h * (0.3 + k * 0.32), 26, '#7a4a24'); circle(g, w * (0.12 + i * 0.19), h * (0.3 + k * 0.32), 5, '#3a2414'); }
  }, props(add, m) { const b = cyl(0.55, 0.55, 1.1, m(0x8a5a2a), 1.6, 0.55, -1.2, 14); add(b); add(cyl(0.58, 0.58, 0.08, m(0x3a3a3a), 1.6, 0.25, -1.2)); add(cyl(0.58, 0.58, 0.08, m(0x3a3a3a), 1.6, 0.85, -1.2)); } },
  { title: 'The Deep', wall: 0x1a5a7a, floor: 0x0a2a3a, paint(g, w, h) {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a8aa8'); gr.addColorStop(1, '#0a2a4a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // crayon ponyfish in pastel stripes, and the jaguar shark's spotted flank
    for (let i = 0; i < 9; i++) { const x = 40 + (i * 47) % (w - 60), y = 40 + (i * 31) % (h * 0.5); for (let k = 0; k < 4; k++) rect(g, x + k * 6, y, 6, 12, ['#f2a8bc', '#a8d8f0', '#f8e08a', '#b8e8b0'][k]); }
    g.fillStyle = '#c8a050'; g.beginPath(); g.ellipse(w * 0.55, h * 0.75, w * 0.4, h * 0.12, -0.05, 0, TAU); g.fill();
    for (let i = 0; i < 18; i++) circle(g, w * 0.2 + i * 18, h * (0.72 + (i % 3) * 0.03), 4, '#2a1a10');
  } },
];

/** Paint every room's back wall into one atlas, five across and three down. */
function roomAtlas() {
  const CW = 512, CH = 320;
  const p = new Painter(CW * 5, CH * 3, 71);
  const g = p.g;
  ROOMS.forEach((r, i) => {
    const cx = (i % 5) * CW, cy = Math.floor(i / 5) * CH;
    g.save(); g.translate(cx, cy); g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    r.paint(g, CW, CH);
    // a picture rail and a skirting board, and soft lamplight from above
    rect(g, 0, CH - 14, CW, 14, 'rgba(0,0,0,0.25)');
    const lg = g.createRadialGradient(CW / 2, 0, 10, CW / 2, 0, CW * 0.8);
    lg.addColorStop(0, 'rgba(255,230,180,0.25)'); lg.addColorStop(1, 'rgba(0,0,0,0.2)');
    g.fillStyle = lg; g.fillRect(0, 0, CW, CH);
    g.restore();
  });
  const t = p.texture();
  t.anisotropy = 4;
  return t;
}

/** The cream band along each floor's edge, lettered with each room's film, five across. */
function labelBand(floor: number) {
  const W = 2560, H = 64;
  const p = new Painter(W, H, 73).fill('#f4ecdc');
  const g = p.g;
  rect(g, 0, 0, W, 5, '#c8a050'); rect(g, 0, H - 5, W, 5, '#c8a050');
  g.fillStyle = '#7a2a36'; g.font = `bold 26px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = 0; k < 5; k++) {
    const t = ROOMS[floor * 5 + k].title.toUpperCase();
    const chars = [...t];
    const sp = 4, widths = chars.map((c) => g.measureText(c).width), tw = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
    let x = k * 512 + 256 - tw / 2;
    g.textAlign = 'left';
    chars.forEach((c, i) => { g.fillText(c, x, H / 2 + 2); x += widths[i] + sp; });
  }
  return p.texture();
}

export interface Dollhouse {
  group: THREE.Group;
  /** the lights in the rooms, 0..1 */
  setGlow(k: number): void;
  /** the hotel's sign: a row of bulbs that chase */
  update(dt: number, t: number): void;
}

export function buildDollhouse(): Dollhouse {
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const add = (...o: THREE.Object3D[]) => { statics.add(...o); };
  const H = HOUSE;
  const roomW = (H.halfW * 2) / H.rooms, base = STAGE_Y + 1.4, front = H.z, back = H.z - H.depth;
  const pink = new THREE.MeshLambertMaterial({ map: stucco(0xf2b8c6, 61) });
  const burgundy = toon(0x7a2a36);
  const cream = toon(0xf4ecdc);
  const gold = toon(0xd8a840, { emissive: new THREE.Color(0x4a3008) });

  // the back walls: one plane per room, UVs into the atlas, glowing faintly like lamplit rooms
  const atlas = roomAtlas();
  const wallMat = new THREE.MeshLambertMaterial({ map: atlas, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.35 });
  const walls: THREE.BufferGeometry[] = [];
  const props = new THREE.Group();
  const propMats = new Map<number, THREE.Material>();
  const pm = (c: number) => { let m = propMats.get(c); if (!m) { m = toon(c); propMats.set(c, m); } return m; };
  const floorMats = new Map<number, THREE.Material>();
  ROOMS.forEach((r, i) => {
    const col = i % 5, row = Math.floor(i / 5);
    const x0 = -H.halfW + col * roomW, y0 = base + (H.floors - 1 - row) * H.roomH;
    const geo = new THREE.PlaneGeometry(roomW, H.roomH);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / 5, 1 - (row + 1 - uv.getY(k)) / 3);
    geo.translate(x0 + roomW / 2, y0 + H.roomH / 2, back + 0.02);
    walls.push(geo);
    // the room's floor
    let fm = floorMats.get(r.floor);
    if (!fm) { fm = toon(r.floor); floorMats.set(r.floor, fm); }
    add(box(roomW - 0.3, 0.05, H.depth - 0.1, fm, x0 + roomW / 2, y0 + 0.03, (front + back) / 2));
    // props stand on the floor, near the back wall
    if (r.props) {
      const g = new THREE.Group();
      r.props((o) => g.add(o), pm);
      g.position.set(x0 + roomW / 2, y0, back + H.depth / 2 + 0.6);
      props.add(g);
    }
  });
  const wallMesh = new THREE.Mesh(walls.length > 1 ? mergePlanes(walls) : walls[0], wallMat);
  group.add(wallMesh);
  statics.add(props);

  // the carcass: floors, dividing walls, the outer walls cut to show their thickness, a plinth
  for (let f = 0; f <= H.floors; f++) {
    const y = base + f * H.roomH;
    add(mesh(boxUV(new THREE.BoxGeometry(H.halfW * 2 + 0.8, 0.5, H.depth + 0.4), 3, 3), pink, 0, y - 0.25, (front + back) / 2));
    if (f < H.floors) {
      // the lettered band along the floor's front edge
      const band = mesh(new THREE.PlaneGeometry(H.halfW * 2 + 0.8, 0.5), new THREE.MeshBasicMaterial({ map: labelBand(H.floors - 1 - f) }), 0, y - 0.25, front + 0.21);
      add(band);
    }
  }
  for (let c = 0; c <= H.rooms; c++) {
    const x = -H.halfW + c * roomW;
    const outer = c === 0 || c === H.rooms;
    add(mesh(boxUV(new THREE.BoxGeometry(outer ? 0.8 : 0.36, H.floors * H.roomH, H.depth + (outer ? 0.4 : 0)), 3, 3), pink, x, base + (H.floors * H.roomH) / 2, (front + back) / 2));
    // burgundy trim on the cut faces
    add(box(outer ? 0.84 : 0.4, H.floors * H.roomH, 0.08, burgundy, x, base + (H.floors * H.roomH) / 2, front + 0.22));
  }
  add(mesh(boxUV(new THREE.BoxGeometry(H.halfW * 2 + 0.8, H.floors * H.roomH, 0.4), 3, 3), pink, 0, base + (H.floors * H.roomH) / 2, back - 0.2));
  add(mesh(boxUV(new THREE.BoxGeometry(H.halfW * 2 + 2, 1.4, H.depth + 1.2), 2, 2), toon(0x9a4a5a), 0, STAGE_Y + 0.7, (front + back) / 2));

  // the roof: a fish-scale mansard with two turrets and the hotel's name in lights
  const top = base + H.floors * H.roomH;
  {
    const scales = new THREE.MeshLambertMaterial({ map: fishScales(0xb8606e, 63) });
    const roofGeo = new THREE.CylinderGeometry(0.6, 1, 1, 4, 1);
    roofGeo.rotateY(Math.PI / 4);
    const roof = mesh(repeatUV(roofGeo, 8, 2), scales, 0, top + 1.8, (front + back) / 2);
    roof.scale.set((H.halfW * 2 + 1) / Math.SQRT2, 3.6, (H.depth + 1) / Math.SQRT2);
    add(roof);
    for (const s of [-1, 1]) {
      const tx = s * (H.halfW - 1.2);
      add(mesh(boxUV(new THREE.BoxGeometry(2.6, 3.4, 2.6), 2, 2), pink, tx, top + 1.7, front - 1.4));
      add(mesh(repeatUV(new THREE.ConeGeometry(2.0, 3.8, 12), 3, 1), scales, tx, top + 5.3, front - 1.4));
      add(sphere(0.18, gold, tx, top + 7.3, front - 1.4, 8, 6));
    }
    add(box(H.halfW * 2 + 1.2, 0.3, 0.5, cream, 0, top + 0.1, front + 0.1));
  }
  // the sign: THE GRAND BUDAPEST in red letters on a gold frame, with chasing bulbs round it
  const signW = 16, signH = 1.8;
  const sign = new Painter(1024, 128, 81).fill('#f4ecdc');
  sign.g.fillStyle = '#b8203a'; sign.g.font = `bold 84px ${FUTURA}`; sign.g.textAlign = 'center'; sign.g.textBaseline = 'middle'; sign.g.fillText('THE GRAND BUDAPEST', 512, 68);
  const signMesh = mesh(new THREE.PlaneGeometry(signW, signH), new THREE.MeshBasicMaterial({ map: sign.texture(), color: new THREE.Color(1.15, 1.1, 1.05) }), 0, top + 2.2, front + 0.32);
  add(signMesh);
  add(box(signW + 0.4, signH + 0.4, 0.2, gold, 0, top + 2.2, front + 0.2));
  // the bulbs are one instanced mesh; the chase changes their colours
  const NB = 40;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 5), glow(0xffffff, 1), NB);
  const on = new THREE.Color(1.5, 1.35, 0.9), off = new THREE.Color(0.35, 0.24, 0.12);
  const tm = new THREE.Matrix4();
  for (let i = 0; i < NB; i++) {
    const k = i / 40, per = 2 * (signW + signH);
    let d = k * per, x: number, y: number;
    if (d < signW) { x = -signW / 2 + d; y = signH / 2 + 0.25; }
    else if ((d -= signW) < signH) { x = signW / 2 + 0.25; y = signH / 2 - d; }
    else if ((d -= signH) < signW) { x = signW / 2 - d; y = -signH / 2 - 0.25; }
    else { d -= signW; x = -signW / 2 - 0.25; y = -signH / 2 + d; }
    bulbs.setMatrixAt(i, tm.makeTranslation(x, top + 2.2 + y, front + 0.36));
    bulbs.setColorAt(i, on);
  }
  bulbs.computeBoundingSphere();
  group.add(bulbs);

  statics.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; } });
  optimize(statics);

  let lastStep = -1;
  return {
    group,
    setGlow(k) { wallMat.emissiveIntensity = 0.2 + 0.4 * k; },
    update(_dt, t) {
      const step = Math.floor(t * 8);
      if (step === lastStep) return;
      lastStep = step;
      for (let i = 0; i < NB; i++) bulbs.setColorAt(i, (i + step) % 3 === 0 ? off : on);
      bulbs.instanceColor!.needsUpdate = true;
    },
  };
}

function mergePlanes(geos: THREE.BufferGeometry[]) {
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute, u = g.attributes.uv as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i)); }
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setIndex(idx);
  return out;
}
