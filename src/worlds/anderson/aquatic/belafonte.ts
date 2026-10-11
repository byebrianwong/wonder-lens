import * as THREE from 'three';
import { box, cyl, sphere, toon } from '../../../engine/Builders';
import { Painter } from '../../../engine/Paint';
import { TAU } from '../../../engine/math';
import { FUTURA } from '../film';
import { optimize } from '../common';
import { SHIP } from './plan';

/*
 * The Belafonte, Steve Zissou's research ship, cut open down its port side like the set in the film: two floors
 * of seven rooms each (engine room to observation room below, mess to bunks above), each room a different
 * colour and lit like a doll's house, with the bridge, the funnel and the mast on deck.
 *
 * The hull is one extruded profile (the side view of the ship with the rooms' space cut out of it), so its
 * front face is the cut edge of the hull. Every room's back wall is painted into one atlas, so the rooms are a
 * few draw calls. All coordinates are in the world: the ship lies along z with its bow towards -z, and its
 * open side faces the ride at x = SHIP.face.
 */

interface Room { name: string; floor: number; paint(g: CanvasRenderingContext2D, w: number, h: number): void; props?(add: (o: THREE.Object3D) => void, m: (c: number) => THREE.Material, w: number): void }

const rect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const circle = (g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
const porthole = (g: CanvasRenderingContext2D, x: number, y: number, r: number, sea: string) => { circle(g, x, y, r + 7, '#c8a050'); circle(g, x, y, r, sea); circle(g, x - r * 0.3, y - r * 0.3, r * 0.25, 'rgba(255,255,255,0.35)'); };
const label = (g: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#2a3a5a', size = 22) => {
  g.fillStyle = color; g.font = `bold ${size}px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y); g.textAlign = 'left';
};

/** The rooms, stern to bow: the lower floor first, then the upper. */
const ROOMS: Room[] = [
  // ---- lower floor ----
  { name: 'Engine room', floor: 0x5a5a52, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#8aa89a');
    for (let i = 0; i < 4; i++) rect(g, 0, h * (0.12 + i * 0.12), w, 10, '#c8a050');
    for (let i = 0; i < 6; i++) { circle(g, w * (0.12 + i * 0.15), h * 0.72, 22, '#f4f0e0'); g.strokeStyle = '#2a2a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(w * (0.12 + i * 0.15), h * 0.72); g.lineTo(w * (0.12 + i * 0.15) + 12, h * 0.72 - 12); g.stroke(); }
    label(g, 'FULL AHEAD', w * 0.5, h * 0.06, '#c8202a', 18);
  }, props(add, m) {
    add(box(2.6, 1.3, 1.8, m(0x5a6a62), 0, 0.65, -2.0));
    for (let i = 0; i < 4; i++) add(cyl(0.26, 0.26, 0.6, m(0xb8b8b0), -0.9 + i * 0.6, 1.6, -2.0, 10));
    add(cyl(0.12, 0.12, 2.7, m(0xc8a050), 0, 2.0, -3.4));
  } },
  { name: 'Galley', floor: 0xe8e0d0, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#bfe6d6');
    g.strokeStyle = '#9fd0bc'; g.lineWidth = 2; for (let x = 0; x < w; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    rect(g, w * 0.08, h * 0.1, w * 0.84, 8, '#7a5a3a');
    for (let i = 0; i < 7; i++) { circle(g, w * (0.14 + i * 0.12), h * 0.22, 16, ['#c8202a', '#e8b030', '#3a7aa8'][i % 3]); rect(g, w * (0.14 + i * 0.12) - 2, h * 0.1, 4, h * 0.08, '#555'); }
    porthole(g, w * 0.5, h * 0.48, 30, '#ffb47a');
  }, props(add, m) {
    add(box(2.0, 0.9, 0.8, m(0xf4f0e8), -1.0, 0.45, -2.6));
    add(box(1.6, 0.06, 1.0, m(0xc8a070), 1.2, 0.8, -1.4));
    add(cyl(0.2, 0.2, 0.3, m(0xc8202a), -1.4, 1.05, -2.6, 10));
  } },
  { name: 'Sauna', floor: 0xb8885a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#d8a46a');
    for (let x = 0; x < w; x += 26) rect(g, x, 0, 3, h, '#b8844a');
    rect(g, 0, h * 0.55, w, 12, '#a8743a');
    label(g, '95°', w * 0.82, h * 0.2, '#7a3a1a', 30);
    circle(g, w * 0.2, h * 0.25, 26, '#f6e6c8');
  }, props(add, m) {
    add(box(4.2, 0.12, 1.0, m(0xc8945a), 0, 0.55, -2.8));
    add(box(4.2, 0.12, 0.9, m(0xc8945a), 0, 1.15, -3.4));
    add(box(0.7, 0.5, 0.7, m(0x5a5a5a), 2.2, 0.25, -1.8));
  } },
  { name: 'Laboratory', floor: 0xd8d8d0, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#f4f2ea');
    for (let k = 0; k < 2; k++) { rect(g, w * 0.05, h * (0.32 + k * 0.22), w * 0.9, 6, '#8a8a80'); for (let i = 0; i < 12; i++) { const x = w * (0.08 + i * 0.075); rect(g, x, h * (0.18 + k * 0.22), 22, h * 0.14, ['#a8e0e0', '#f8d0a0', '#c8e8b0', '#f0b0c8'][(i + k) % 4]); circle(g, x + 11, h * (0.25 + k * 0.22), 6, ['#e86a3a', '#3a8a5a', '#8a5ab8'][(i * 3 + k) % 3]); } }
    label(g, 'SPECIMENS', w * 0.5, h * 0.08, '#3a6a8a', 18);
  }, props(add, m) {
    add(box(3.2, 0.9, 1.0, m(0xf4f4f0), 0, 0.45, -2.6));
    add(cyl(0.18, 0.18, 0.5, m(0x9ad8e0), -0.8, 1.15, -2.6, 10));
    add(cyl(0.05, 0.12, 0.5, m(0x3a3a3a), 0.8, 1.15, -2.6, 8));
  } },
  { name: 'Library', floor: 0x7a2a36, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#6a3a2a');
    const cols = ['#c83a2a', '#3a6a9a', '#e8d070', '#6a8a4a', '#d8a0b0', '#f4ecdc'];
    for (let k = 0; k < 5; k++) { rect(g, 0, h * (0.17 + k * 0.17) + 2, w, 6, '#3a1a10'); for (let x = 4; x < w - 10;) { const bw = 8 + ((x * 7 + k * 13) % 9); rect(g, x, h * (0.06 + k * 0.17), bw - 2, h * 0.11 + 2, cols[(x + k) % cols.length]); x += bw; } }
  }, props(add, m) {
    add(box(1.0, 0.5, 0.9, m(0x8a3a3a), 1.4, 0.25, -1.6));
    add(box(1.0, 0.8, 0.2, m(0x8a3a3a), 1.4, 0.7, -2.0));
    add(cyl(0.5, 0.5, 0.06, m(0xd8a840), -1.0, 0.7, -1.8, 14));
  } },
  { name: 'Editing room', floor: 0x3a3a48, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#2a2a3a');
    rect(g, w * 0.3, h * 0.12, w * 0.4, h * 0.32, '#f4e6c8');
    g.fillStyle = '#3a6aa8'; g.beginPath(); g.ellipse(w * 0.5, h * 0.3, w * 0.15, h * 0.08, 0.1, 0, TAU); g.fill();
    for (let i = 0; i < 5; i++) { circle(g, w * (0.12 + i * 0.19), h * 0.66, 26, '#8a8a8a'); circle(g, w * (0.12 + i * 0.19), h * 0.66, 8, '#2a2a3a'); }
    label(g, 'THE JAGUAR SHARK · PART 9', w * 0.5, h * 0.5, '#f4e6c8', 16);
  }, props(add, m) {
    add(box(2.2, 0.85, 0.9, m(0x5a5a5a), 0, 0.42, -2.6));
    for (const x of [-0.5, 0.5]) { const r = cyl(0.36, 0.36, 0.05, m(0x2a2a2a), x, 1.25, -2.7, 16); r.rotation.x = Math.PI / 2; add(r); }
  } },
  { name: 'Observation room', floor: 0x2a6a8a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#f6efe2');
    for (let i = 0; i < 3; i++) porthole(g, w * (0.22 + i * 0.28), h * 0.42, 50, i === 1 ? '#2a8aa8' : '#1a6a8a');
    // a ponyfish going by in the middle window
    for (let k = 0; k < 4; k++) rect(g, w * 0.5 - 18 + k * 9, h * 0.4, 9, 12, ['#f2a8bc', '#a8d8f0', '#f8e08a', '#b8e8b0'][k]);
  }, props(add, m) {
    for (const x of [-1.4, 0, 1.4]) add(box(0.7, 0.45, 0.7, m(0xe8b030), x, 0.22, -1.8));
  } },
  // ---- upper floor ----
  { name: 'Mess', floor: 0xc8a070, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#f4d878');
    for (let i = 0; i < 3; i++) { rect(g, w * (0.12 + i * 0.28), h * 0.15, w * 0.2, h * 0.28, '#f4f0e8'); rect(g, w * (0.13 + i * 0.28), h * 0.17, w * 0.18, h * 0.24, ['#7ab8d8', '#e88a6a', '#8ac8a0'][i]); }
    label(g, 'TEAM ZISSOU', w * 0.5, h * 0.58, '#c8202a', 24);
  }, props(add, m) {
    add(box(3.6, 0.08, 1.0, m(0xb8784a), 0, 0.85, -1.8));
    for (const x of [-1.6, 1.6]) add(box(0.08, 0.8, 0.9, m(0x8a5a34), x, 0.4, -1.8));
    for (let i = 0; i < 5; i++) add(cyl(0.07, 0.06, 0.16, m(0xf4f4f0), -1.4 + i * 0.7, 0.97, -1.8, 8));
  } },
  { name: 'Radio room', floor: 0x6a5a4a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#a8c8a0');
    for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) {
      const x = w * (0.1 + i * 0.21), y = h * (0.12 + k * 0.3);
      rect(g, x, y, w * 0.17, h * 0.24, '#4a4a42'); circle(g, x + w * 0.05, y + h * 0.1, 12, '#f4e6c8'); circle(g, x + w * 0.12, y + h * 0.1, 8, '#e8b030'); rect(g, x + 8, y + h * 0.18, w * 0.12, 6, '#f08a3a');
    }
  }, props(add, m) {
    add(box(3.0, 0.8, 0.8, m(0x6a5a4a), 0, 0.4, -2.7));
    add(cyl(0.03, 0.03, 1.2, m(0xc8c8c8), 1.4, 1.4, -2.7, 6));
  } },
  { name: 'Infirmary', floor: 0xe0e0e0, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#f6f4f0');
    rect(g, w * 0.44, h * 0.12, w * 0.12, h * 0.34, '#c8202a'); rect(g, w * 0.36, h * 0.24, w * 0.28, h * 0.1, '#c8202a');
    rect(g, 0, h * 0.62, w, 10, '#9ac8e8');
  }, props(add, m) {
    add(box(2.0, 0.55, 0.9, m(0xf4f4f0), -0.8, 0.45, -2.4));
    add(box(1.9, 0.12, 0.85, m(0x9ac8e8), -0.8, 0.78, -2.4));
    add(box(0.7, 1.2, 0.5, m(0xd8d8d0), 1.6, 0.6, -2.8));
  } },
  { name: "Steve's cabin", floor: 0x8a5a34, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#e88a6a');
    // a poster for his last film
    rect(g, w * 0.08, h * 0.1, w * 0.28, h * 0.5, '#f4ecdc'); rect(g, w * 0.1, h * 0.13, w * 0.24, h * 0.32, '#2a7aa8');
    g.fillStyle = '#f4ecdc'; g.font = `bold 12px ${FUTURA}`; g.textAlign = 'center'; g.fillText('ZISSOU', w * 0.22, h * 0.53); g.textAlign = 'left';
    porthole(g, w * 0.66, h * 0.32, 32, '#ffb47a');
    rect(g, w * 0.48, h * 0.62, w * 0.4, 6, '#8a5a34');
  }, props(add, m) {
    add(box(2.4, 0.5, 1.2, m(0x8a5a34), 0.8, 0.25, -2.6));
    add(box(2.3, 0.15, 1.1, m(0xf4f0e0), 0.8, 0.57, -2.6));
    add(box(0.5, 0.5, 0.5, m(0xc8202a), -1.8, 0.25, -2.2));
  } },
  { name: 'Map room', floor: 0x5a6a8a, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#d8c8a0');
    rect(g, w * 0.1, h * 0.1, w * 0.8, h * 0.5, '#9ac8d8');
    g.fillStyle = '#e8d8a0'; for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(w * (0.18 + (i * 0.37) % 0.66), h * (0.2 + (i * 0.23) % 0.34), 30 + (i % 3) * 14, 16 + (i % 2) * 10, i, 0, TAU); g.fill(); }
    g.strokeStyle = '#c8202a'; g.setLineDash([6, 6]); g.lineWidth = 3; g.beginPath(); g.moveTo(w * 0.2, h * 0.5); g.bezierCurveTo(w * 0.4, h * 0.2, w * 0.6, h * 0.55, w * 0.8, h * 0.25); g.stroke(); g.setLineDash([]);
    label(g, 'X', w * 0.8, h * 0.25, '#c8202a', 26);
  }, props(add, m) {
    add(box(2.4, 0.9, 1.4, m(0x8a6a4a), 0, 0.45, -1.8));
    add(sphere(0.35, m(0x5a9ac8), 1.8, 1.25, -2.4, 14, 10));
    add(cyl(0.06, 0.12, 0.9, m(0xc8a050), 1.8, 0.45, -2.4, 8));
  } },
  { name: 'Wardrobe', floor: 0x9ac8e8, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#f4e8f0');
    rect(g, 0, h * 0.14, w, 6, '#8a8a8a');
    for (let i = 0; i < 8; i++) { const x = w * (0.08 + i * 0.115); rect(g, x, h * 0.16, w * 0.09, h * 0.42, '#9ccbe8'); rect(g, x + w * 0.035, h * 0.16, 4, h * 0.42, '#5a86c8'); circle(g, x + w * 0.045, h * 0.7, 14, '#c8202a'); }
  } },
  { name: 'Bunks', floor: 0x5a86c8, paint(g, w, h) {
    rect(g, 0, 0, w, h, '#9ac8e8');
    for (let k = 0; k < 3; k++) { rect(g, w * 0.08, h * (0.14 + k * 0.26), w * 0.84, h * 0.06, '#f4f0e8'); rect(g, w * 0.08, h * (0.2 + k * 0.26), w * 0.84, 6, '#5a3a2a'); }
    label(g, 'INTERNS', w * 0.5, h * 0.06, '#f4f0e8', 18);
  } },
];
const PER_FLOOR = 7;

/** Paint every room's back wall into one atlas, seven across and two down. */
function roomAtlas() {
  const CW = 512, CH = 320;
  const p = new Painter(CW * PER_FLOOR, CH * 2, 2376);
  const g = p.g;
  ROOMS.forEach((r, i) => {
    const cx = (i % PER_FLOOR) * CW, cy = Math.floor(i / PER_FLOOR) * CH;
    g.save(); g.translate(cx, cy); g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    r.paint(g, CW, CH);
    rect(g, 0, CH - 12, CW, 12, 'rgba(0,0,0,0.25)');
    const lg = g.createRadialGradient(CW / 2, 0, 10, CW / 2, 0, CW * 0.8);
    lg.addColorStop(0, 'rgba(255,230,180,0.28)'); lg.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = lg; g.fillRect(0, 0, CW, CH);
    g.restore();
  });
  const t = p.texture();
  t.anisotropy = 4;
  return t;
}

/** The hull's paint, by height (v) and length (u): red below the waterline, a powder-blue boot stripe, then white. */
function hullPaint() {
  const p = new Painter(64, 512, 2377);
  const g = p.g;
  const yv = (y: number) => 512 * (1 - (y - HULL_Y0) / HULL_H);
  rect(g, 0, 0, 64, 512, '#f4efe4');
  rect(g, 0, yv(0.05), 64, 512, '#b8383a');
  rect(g, 0, yv(0.5), 64, yv(0.05) - yv(0.5), '#9ccbe8');
  rect(g, 0, yv(6.6), 64, yv(6.45) - yv(6.6), '#c8202a');
  p.lines({ n: 40, colors: ['rgba(0,0,0,0.6)'], alpha: [0.03, 0.06], width: [1, 2], wobble: 0.5 });
  return p.texture();
}
const HULL_Y0 = SHIP.keel, HULL_H = 12;

export interface Belafonte {
  group: THREE.Group;
  /** where the crew stand, in the ship's group (it bobs, so they go in `deckGroup`) */
  deckGroup: THREE.Group;
  /** a room's centre on the floor, in the ship's space, and its size along the ship */
  room(i: number): { pos: THREE.Vector3; w: number };
  /** the deck's height in the world */
  deckY: number;
  /** is a point (world x, z) over the ship? */
  over(x: number, z: number): boolean;
  update(dt: number, t: number): void;
}

/** The side view of the hull, in (distance towards the bow from the middle, height). */
function profile() {
  const s = new THREE.Shape();
  const K = SHIP.keel, D = SHIP.deck;
  s.moveTo(-24, K);
  s.lineTo(18, K);
  s.bezierCurveTo(24, K, 28, 2, 30, D + 1.6);
  s.lineTo(27.5, D + 1.2);
  s.lineTo(22, D);
  s.lineTo(-27.5, D);
  s.lineTo(-29.2, D + 0.6);
  s.lineTo(-29.4, D - 1.2);
  s.bezierCurveTo(-29, 0, -27, -2.4, -24, K);
  // the space the rooms are in
  const hole = new THREE.Path();
  const F = SHIP.floor1, C = D - 0.5;
  hole.moveTo(-26.6, F);
  hole.lineTo(21.6, F);
  hole.bezierCurveTo(23.6, F + 1, 25, C - 2, 25.6, C);
  hole.lineTo(-27, C);
  hole.lineTo(-26.6, F);
  s.holes.push(hole);
  return s;
}
/** The near and far end of the room space along the ship, per floor (in distance towards the bow). */
const ROOM_SPAN: Array<[number, number]> = [[-26.4, 23.0], [-26.8, 25.2]];

export function buildBelafonte(): Belafonte {
  const group = new THREE.Group();
  const ship = new THREE.Group();
  group.add(ship);
  const statics = new THREE.Group();
  ship.add(statics);
  ship.position.set(SHIP.face, 0, SHIP.z);
  // the ship's own space: x across from the open side (0) to the far side (beam), y up, z along the ship
  // with the bow towards -z
  const add = (...o: THREE.Object3D[]) => { statics.add(...o); };
  const beam = SHIP.beam;
  const white = toon(0xf4efe4), red = toon(0xc8202a), powder = toon(0x9ccbe8), brass = toon(0xc8a050), dark = toon(0x3a3a40);

  // ---------- the hull ----------
  const hullGeo = new THREE.ExtrudeGeometry(profile(), { depth: beam, bevelEnabled: false, curveSegments: 10 });
  // paint by height: every vertex's v is its height, so the caps and the sides share one strip of paint
  {
    const pos = hullGeo.attributes.position as THREE.BufferAttribute, uv = hullGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5, (pos.getY(i) - HULL_Y0) / HULL_H);
  }
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshLambertMaterial({ map: hullPaint() }));
  // shape x runs towards the bow; turn it so it runs along -z, and the extrusion runs across the ship (+x)
  hull.rotation.y = Math.PI / 2;
  hull.position.set(0, 0, 0);
  ship.add(hull);

  // ---------- the rooms ----------
  const atlas = roomAtlas();
  const wallMat = new THREE.MeshLambertMaterial({ map: atlas, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.42 });
  const walls: THREE.BufferGeometry[] = [];
  const props = new THREE.Group();
  ship.add(props);
  const propMats = new Map<number, THREE.Material>();
  const pm = (c: number) => { let m = propMats.get(c); if (!m) { m = toon(c); propMats.set(c, m); } return m; };
  const floors = [SHIP.floor1, SHIP.floor2];
  const roomH = (f: number) => (f === 0 ? SHIP.floor2 - SHIP.floor1 - 0.2 : SHIP.deck - 0.5 - SHIP.floor2);
  const rooms: Array<{ pos: THREE.Vector3; w: number }> = [];
  // the rooms take the near half of the ship; deeper rooms show mostly ceiling and side walls from the water
  const backX = 5.6;
  const ceilMat = toon(0xf4e2c8, { emissive: new THREE.Color(0x7a6040) });
  ROOMS.forEach((r, i) => {
    const fl = Math.floor(i / PER_FLOOR), col = i % PER_FLOOR;
    const [b0, b1] = ROOM_SPAN[fl];
    const w = (b1 - b0) / PER_FLOOR;
    // stern first: room 0 is at the stern end (distance b0), room 6 at the bow end
    const zc = -(b0 + (col + 0.5) * w);
    const y0 = floors[fl], h = roomH(fl);
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / PER_FLOOR, 1 - (fl + 1 - uv.getY(k)) / 2);
    // the plane faces +z; turn it to face -x (the open side), so its left edge is towards the stern (+z)
    geo.rotateY(-Math.PI / 2);
    geo.translate(backX, y0 + h / 2, zc);
    walls.push(geo);
    // the floor of the room, in its own colour
    const floor = box(backX, 0.06, w - 0.1, pm(r.floor), backX / 2, y0 + 0.03, zc);
    add(floor);
    // a partition at the room's stern end (the hull closes the ends)
    if (col > 0) add(box(backX, h, 0.16, white, backX / 2, y0 + h / 2, zc + w / 2));
    // a warm ceiling (the hull's own is in shadow from below) and a lamp in the middle of it
    add(box(backX, 0.04, w, ceilMat, backX / 2, y0 + h - 0.02, zc));
    add(cyl(0.25, 0.4, 0.22, brass, backX * 0.5, y0 + h - 0.11, zc, 10));
    const pos = new THREE.Vector3(backX * 0.5, y0, zc);
    rooms.push({ pos, w });
    if (r.props) {
      const g = new THREE.Group();
      // props are written as seen from the ride: x to the right (towards the stern, +z here), z towards the
      // viewer (the back wall is -z); turn them so -z points at the back wall (+x here)
      g.rotation.y = -Math.PI / 2;
      g.position.set(backX - 3.6, y0 + 0.06, zc);
      r.props((o) => g.add(o), pm, w);
      props.add(g);
    }
  });
  // the upper floor's slab, its front edge a cream band with a red line
  add(box(beam - 0.4, 0.2, ROOM_SPAN[1][1] - ROOM_SPAN[1][0], white, (beam - 0.4) / 2, SHIP.floor2 - 0.1, -(ROOM_SPAN[1][0] + ROOM_SPAN[1][1]) / 2));
  add(box(0.06, 0.06, ROOM_SPAN[1][1] - ROOM_SPAN[1][0], red, 0.02, SHIP.floor2 - 0.12, -(ROOM_SPAN[1][0] + ROOM_SPAN[1][1]) / 2));
  {
    const merged = new THREE.Mesh(mergeGeos(walls), wallMat);
    ship.add(merged);
  }
  optimize(props);

  // ---------- on deck ----------
  const D = SHIP.deck;
  const deckLen = 50;
  add(box(beam, 0.1, deckLen, toon(0xd8c8a8), beam / 2, D + 0.05, -(-27.5 + deckLen / 2)));
  // the bridge: a white house with a row of windows and a wheelhouse on top
  const bridgeZ = -6;
  add(box(beam - 2.4, 2.6, 9, white, beam / 2, D + 1.3, bridgeZ));
  add(box(beam - 4, 2.0, 5, white, beam / 2, D + 3.6, bridgeZ - 1));
  add(box(beam - 1.6, 0.14, 10, powder, beam / 2, D + 2.66, bridgeZ));
  add(box(beam - 3.4, 0.14, 6, powder, beam / 2, D + 4.66, bridgeZ - 1));
  // windows on the side facing the ride and on the front
  const glass = toon(0x2a4a6a, { emissive: new THREE.Color(0xffc880), emissiveIntensity: 0.35 });
  for (let i = 0; i < 6; i++) add(box(0.06, 0.8, 0.9, glass, 1.17, D + 1.6, bridgeZ + 3.4 - i * 1.36));
  for (let i = 0; i < 4; i++) add(box(0.06, 0.7, 0.9, glass, 1.97, D + 3.8, bridgeZ + 0.5 - i * 1.1));
  for (let i = 0; i < 5; i++) add(box(1.0, 0.7, 0.06, glass, 2.6 + i * 1.5, D + 3.8, bridgeZ - 3.53));
  // the name on the bridge's side, in red
  {
    const p = new Painter(1024, 128, 2378).fill('#f4efe4');
    p.g.fillStyle = '#c8202a'; p.g.font = `bold 92px ${FUTURA}`; p.g.textAlign = 'center'; p.g.textBaseline = 'middle';
    const t = 'BELAFONTE'; let x = 512 - 9 * 50; for (const c of t) { p.g.fillText(c, x + 50, 70); x += 100; }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 0.95), new THREE.MeshLambertMaterial({ map: p.texture() }));
    sign.rotation.y = -Math.PI / 2;
    sign.position.set(1.16, D + 0.55, bridgeZ);
    add(sign);
  }
  // the funnel: cream with a powder-blue band and a red top
  const fz = 6;
  add(cyl(1.0, 1.15, 3.6, white, beam / 2, D + 1.8, fz, 16));
  add(cyl(1.03, 1.03, 0.7, powder, beam / 2, D + 2.4, fz, 16));
  add(cyl(1.05, 1.0, 0.5, red, beam / 2, D + 3.85, fz, 16));
  // the mast with a crow's nest and a radar, and a red flag
  const mz = -17;
  add(cyl(0.16, 0.22, 11, brass, beam / 2, D + 5.5, mz, 8));
  add(cyl(0.8, 0.7, 0.7, white, beam / 2, D + 8.2, mz, 12));
  add(box(0.14, 0.14, 4.0, brass, beam / 2, D + 6.6, mz));
  const radar = box(0.2, 0.3, 2.2, dark, beam / 2, D + 10.6, mz);
  // the stern: a crane for the sub and a flag pole
  add(cyl(0.2, 0.25, 4.6, red, beam / 2, D + 2.3, 20));
  const boom = cyl(0.12, 0.14, 6, red, beam / 2, D + 4.4, 18.2);
  boom.rotation.x = -1.05;
  add(boom);
  add(cyl(0.05, 0.05, 3.4, brass, beam / 2, D + 2.4, 27.2, 6));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9, 6, 1), new THREE.MeshLambertMaterial({ map: zissouFlag(), side: THREE.DoubleSide }));
  flag.rotation.y = Math.PI / 2;
  flag.position.set(beam / 2, D + 3.6, 27.9);
  // rails along the deck edges and the upper deck
  for (const x of [0.15, beam - 0.15]) {
    add(box(0.06, 0.06, deckLen, white, x, D + 1.0, -(-27.5 + deckLen / 2)));
    add(box(0.04, 0.04, deckLen, white, x, D + 0.55, -(-27.5 + deckLen / 2)));
  }
  for (let i = 0; i < 26; i++) for (const x of [0.15, beam - 0.15]) add(box(0.06, 1.0, 0.06, white, x, D + 0.5, 27 - i * 1.96));
  // life rings on the rail
  for (const z of [14, -1, -14]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.09, 6, 16), red);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0.08, D + 0.75, z);
    add(ring);
  }
  // crates and drums by the funnel, for Pele to sit near
  add(box(0.8, 0.6, 0.8, toon(0xb88a58), 3.0, D + 0.3, 11));
  add(cyl(0.35, 0.35, 0.9, toon(0xe8b030), 2.2, D + 0.45, 12.4, 12));
  optimize(statics);
  ship.add(radar, flag);

  // ---------- the crew's places ----------
  const deckGroup = new THREE.Group();
  ship.add(deckGroup);

  // a soft warm wash out of the rooms onto the water
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(7, 52), glowMat);
  wash.rotation.x = -Math.PI / 2;
  wash.position.set(-3.6, 0.04, -1);
  ship.add(wash);

  return {
    group, deckGroup, deckY: D,
    room: (i) => rooms[i],
    over: (x, z) => x > SHIP.face && x < SHIP.face + beam && Math.abs(z - SHIP.z) < 27,
    update(_dt, t) {
      // the ship rides the swell
      ship.position.y = Math.sin(t * 0.55) * 0.08;
      ship.rotation.x = Math.sin(t * 0.37) * 0.006;
      ship.rotation.z = Math.sin(t * 0.48 + 1) * 0.008;
      radar.rotation.y = t * 1.2;
      const pos = flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const u = (0.7 - pos.getX(i)) / 1.4;
        pos.setZ(i, Math.sin(t * 5 - u * 4) * 0.12 * u);
      }
      pos.needsUpdate = true;
    },
  };
}

/** Team Zissou's flag: powder blue, a yellow Z in a white circle. */
function zissouFlag() {
  const p = new Painter(256, 160, 2379).fill('#9ccbe8');
  const g = p.g;
  circle(g, 128, 80, 52, '#fbf6ea');
  g.fillStyle = '#e8b81e'; g.font = `bold 84px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Z', 128, 84);
  rect(g, 0, 0, 256, 10, '#c8202a'); rect(g, 0, 150, 256, 10, '#c8202a');
  return p.texture();
}

/** Merge plane geometries that share attributes (position, normal, uv), keeping indices. */
function mergeGeos(geos: THREE.BufferGeometry[]) {
  const out = new THREE.BufferGeometry();
  let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index!.count; }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2), idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array as Float32Array, vo * 3);
    nor.set(g.attributes.normal.array as Float32Array, vo * 3);
    uv.set(g.attributes.uv.array as Float32Array, vo * 2);
    const gi = g.index!.array;
    for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
