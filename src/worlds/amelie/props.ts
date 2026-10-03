import * as THREE from 'three';
import { box, cyl, glow, instanced, mesh, toon, type Placement } from '../../engine/Builders';
import { charToon, repeatUV } from '../../engine/Paint';
import { Rng, TAU, lerp } from '../../engine/math';
import { css, crateWood, fruitSkin, PAL, chalkSign } from './textures';
import { Painter } from '../../engine/Paint';

/** Toon material with a little self-light so props stay readable in dim rooms. */
export const toonE = (color: number, k = 0.12, opts: Partial<THREE.MeshToonMaterialParameters> = {}) => toon(color, { emissive: new THREE.Color(color).multiplyScalar(k), ...opts });

const lampCache: { mats?: { iron: THREE.Material; glass: THREE.MeshBasicMaterial } } = {};
/** One material set for every Paris lamp in the world, so the lanterns can flicker together. */
export function lampMaterials() {
  if (!lampCache.mats) lampCache.mats = { iron: charToon({ color: 0x24302a, rim: 0.4 }), glass: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(1.6) }) };
  return lampCache.mats;
}

/**
 * Paris street lamps: a fluted cast-iron post on a round foot with a hexagonal lantern and a domed cap.
 * Instanced, so a street of them costs four draw calls.
 */
export function parisLamps(placements: Placement[], height = 4.6) {
  const g = new THREE.Group();
  if (!placements.length) return g;
  const { iron, glass } = lampMaterials();
  const H = height;
  const prof = [[0.3, 0], [0.3, 0.25], [0.2, 0.4], [0.17, 0.9], [0.12, 1.1], [0.1, H * 0.55], [0.08, H - 0.9], [0.13, H - 0.75], [0.09, H - 0.6], [0.001, H - 0.58]].map(([r, y]) => new THREE.Vector2(r, y));
  const post = new THREE.LatheGeometry(prof, 10);
  const arm = new THREE.TorusGeometry(0.22, 0.03, 5, 10, Math.PI); arm.translate(0, H - 0.75, 0);
  const lantern = new THREE.CylinderGeometry(0.3, 0.2, 0.62, 6); lantern.translate(0, H - 0.18, 0);
  const frame = new THREE.CylinderGeometry(0.33, 0.33, 0.06, 6); frame.translate(0, H + 0.14, 0);
  const cap = new THREE.SphereGeometry(0.36, 8, 5, 0, TAU, 0, Math.PI / 2); cap.scale(1, 0.75, 1); cap.translate(0, H + 0.15, 0);
  const fin = new THREE.ConeGeometry(0.06, 0.3, 6); fin.translate(0, H + 0.55, 0);
  const base = new THREE.CylinderGeometry(0.2, 0.22, 0.08, 6); base.translate(0, H - 0.5, 0);
  g.add(instanced(post, iron, placements), instanced(arm, iron, placements), instanced(frame, iron, placements), instanced(cap, iron, placements), instanced(fin, iron, placements), instanced(base, iron, placements));
  const glassMesh = instanced(lantern, glass, placements);
  g.add(glassMesh);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  glassMesh.castShadow = false;
  return g;
}

/** Brown cast-iron bollards (potelets) along the kerb. */
export function bollards(placements: Placement[]) {
  const prof = [[0.09, 0], [0.09, 0.1], [0.07, 0.15], [0.065, 0.75], [0.08, 0.8], [0.06, 0.86], [0.04, 0.94], [0.001, 0.95]].map(([r, y]) => new THREE.Vector2(r, y));
  const m = instanced(new THREE.LatheGeometry(prof, 8), charToon({ color: 0x4a3226, rim: 0.3 }), placements);
  m.castShadow = true;
  return m;
}

/** A bistro table with a round marble top on a cast-iron foot. Origin at the floor. */
export function bistroTable(s = 1) {
  const g = new THREE.Group();
  const marble = toonE(0xeee6d6, 0.12), iron = toonE(0x2a2622, 0.05);
  g.add(cyl(0.36 * s, 0.36 * s, 0.04 * s, marble, 0, 0.74 * s, 0, 16));
  g.add(cyl(0.03 * s, 0.04 * s, 0.7 * s, iron, 0, 0.37 * s, 0, 6));
  g.add(cyl(0.22 * s, 0.26 * s, 0.04 * s, iron, 0, 0.02 * s, 0, 10));
  return g;
}

/** A woven bistro chair (red and cream rattan), facing +z. Origin at the floor. */
export function bistroChair(s = 1, seat?: THREE.Material) {
  const g = new THREE.Group();
  const cane = toonE(0x8a5a30, 0.1);
  const weave = seat ?? toonE(0xb8382c, 0.15);
  g.add(box(0.42 * s, 0.05 * s, 0.42 * s, weave, 0, 0.45 * s, 0));
  const back = box(0.42 * s, 0.32 * s, 0.04 * s, weave, 0, 0.72 * s, -0.2 * s); back.rotation.x = -0.12; g.add(back);
  for (const x of [-0.19, 0.19]) for (const z of [-0.19, 0.19]) g.add(cyl(0.016 * s, 0.016 * s, 0.45 * s, cane, x * s, 0.22 * s, z * s, 5));
  for (const x of [-0.19, 0.19]) g.add(cyl(0.016 * s, 0.016 * s, 0.5 * s, cane, x * s, 0.7 * s, -0.21 * s, 5));
  return g;
}

/** Fruit and vegetables: one instanced mesh per kind. */
export type FruitKind = 'apple' | 'orange' | 'lemon' | 'greenApple' | 'tomato' | 'pear' | 'plum' | 'cabbage' | 'artichoke' | 'aubergine';
const FRUIT: Record<FruitKind, { r: number; base: number; blush: number; squash: [number, number, number]; speckle?: number }> = {
  apple: { r: 1, base: 0xc8281e, blush: 0xf0a040, squash: [1, 0.92, 1] },
  greenApple: { r: 1, base: 0x9ac040, blush: 0xe8d040, squash: [1, 0.92, 1] },
  orange: { r: 1.05, base: 0xf08a1a, blush: 0xf8b040, squash: [1, 0.96, 1], speckle: 1.4 },
  lemon: { r: 0.9, base: 0xf2d230, blush: 0xf8e870, squash: [0.85, 0.85, 1.2], speckle: 1 },
  tomato: { r: 0.95, base: 0xd8301e, blush: 0xf05a30, squash: [1, 0.8, 1] },
  pear: { r: 0.95, base: 0xb8b840, blush: 0xd89040, squash: [0.9, 1.2, 0.9] },
  plum: { r: 0.75, base: 0x5a2a5a, blush: 0x8a4a8a, squash: [1, 1.05, 1] },
  cabbage: { r: 1.8, base: 0x6a9a3a, blush: 0xb8d070, squash: [1, 0.9, 1], speckle: 0.2 },
  artichoke: { r: 1.2, base: 0x5a7a4a, blush: 0x8a5a7a, squash: [1, 1.1, 1], speckle: 0.2 },
  aubergine: { r: 1.0, base: 0x3a1a3a, blush: 0x6a3a6a, squash: [0.8, 0.8, 1.6], speckle: 0.1 },
};
const crateMats = new Map<string, THREE.Material>();
/** Crate slats with a stencilled name, one material per label for the whole world. */
function crateMat(label: string, i: number) {
  let m = crateMats.get(label);
  if (!m) { m = charToon({ map: crateWood(label, 27 + i), rim: 0.2 }); crateMats.set(label, m); }
  return m;
}
const chalkMats = new Map<string, THREE.Material>();
function chalkMat(text: string, price: string) {
  const k = text + price;
  let m = chalkMats.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ map: chalkSign(text, price, 29 + chalkMats.size) }); chalkMats.set(k, m); }
  return m;
}
const fruitMats = new Map<FruitKind, THREE.Material>();
function fruitMaterial(k: FruitKind) {
  let m = fruitMats.get(k);
  if (!m) { const f = FRUIT[k]; m = charToon({ map: fruitSkin(f.base, f.blush, 31 + k.length, f.speckle ?? 0.5), rim: 0.45, shade: 0xa090b0 }); fruitMats.set(k, m); }
  return m;
}

const fruitGeos = new Map<FruitKind, THREE.BufferGeometry>();
/** Many fruit of one kind: `size` is the radius of an ordinary one in world units. Every pile of a kind shares one geometry. */
export function fruitPile(kind: FruitKind, placements: Placement[], size: number) {
  const f = FRUIT[kind];
  let geo = fruitGeos.get(kind);
  if (!geo) { geo = new THREE.SphereGeometry(f.r, 10, 7); geo.scale(f.squash[0], f.squash[1], f.squash[2]); fruitGeos.set(kind, geo); }
  const m = instanced(geo, fruitMaterial(kind), placements.map((p) => ({ ...p, scale: p.scale * size })));
  m.castShadow = false;
  return m;
}

/**
 * A market display: tiers of open crates tilted towards the street, each heaped with one kind of produce.
 * Origin at the front foot, facing +z; `w` wide, rising to `h` at the back over `d`.
 */
export function produceStand(rng: Rng, o: { w: number; d: number; h: number; tiers: number; kinds: FruitKind[]; fruit: number; labels?: string[]; prices?: string[] }) {
  const g = new THREE.Group();
  const wood = toonE(0x7a5232, 0.08);
  const crateMats = (o.labels ?? ['PRIMEURS', 'MARCHÉ', 'BUTTE']).map((l, i) => crateMat(l, i));
  const piles = new Map<FruitKind, Placement[]>();
  const tierD = o.d / o.tiers;
  for (let t = 0; t < o.tiers; t++) {
    const y = (o.h * (t + 0.5)) / o.tiers;
    const z = -tierD * (t + 0.5);
    // the step
    g.add(box(o.w, y, tierD, wood, 0, y / 2, z));
    const crates = Math.max(1, Math.round(o.w / (o.fruit * 9)));
    const cw = o.w / crates;
    for (let c = 0; c < crates; c++) {
      const x = -o.w / 2 + cw * (c + 0.5);
      const kind = rng.pick(o.kinds);
      const ch = o.fruit * 2.4;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.94, ch, tierD * 0.9), crateMats[c % crateMats.length]);
      crate.position.set(x, y + ch / 2, z); crate.rotation.x = 0.12;
      crate.castShadow = true;
      g.add(crate);
      // a heaped mound of fruit: rows packed in a dome
      const list = piles.get(kind) ?? [];
      const r = o.fruit * FRUIT[kind].r;
      const nx = Math.max(1, Math.floor((cw * 0.9) / (r * 2))), nz = Math.max(1, Math.floor((tierD * 0.85) / (r * 2)));
      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < nx - layer; i++) for (let k = 0; k < nz - layer; k++) {
          const fx = x - ((nx - layer - 1) * r) + i * r * 2 + rng.range(-0.1, 0.1) * r;
          const fz = z - ((nz - layer - 1) * r) + k * r * 2 + rng.range(-0.1, 0.1) * r;
          const fy = y + ch * 0.85 + r * 0.8 + layer * r * 1.5 - (fz - z) * 0.12;
          list.push({ x: fx, y: fy, z: fz, scale: rng.range(0.88, 1.1), rot: rng.range(0, TAU) });
        }
      }
      piles.set(kind, list);
      // a chalk price card on a stick in some crates
      if (o.prices && rng.chance(0.5)) {
        const card = mesh(new THREE.PlaneGeometry(o.fruit * 3.2, o.fruit * 2.4), chalkMat(kind === 'orange' ? 'oranges' : kind === 'apple' ? 'pommes' : kind === 'lemon' ? 'citrons' : 'primeurs', rng.pick(o.prices)), x + cw * 0.25, y + ch + o.fruit * 3.2, z + tierD * 0.3);
        card.rotation.x = -0.2;
        g.add(card);
      }
    }
  }
  for (const [kind, list] of piles) g.add(fruitPile(kind, list, o.fruit));
  return g;
}

/** A green Morris column covered in posters, with its little domed roof. */
export function morrisColumn(seed = 51) {
  const g = new THREE.Group();
  const green = charToon({ color: 0x2a4a34, rim: 0.3 });
  const p = new Painter(512, 256, seed).fill('#e8dcc0');
  const rng = p.rng, c = p.g;
  const colors = ['#c8302a', '#2a4a7a', '#f0c040', '#e8e0d0', '#3a6a3a', '#d87a3a', '#1e1e24'];
  for (let i = 0; i < 9; i++) {
    const x = (i / 9) * 512, w = 512 / 9 - 4;
    c.fillStyle = rng.pick(colors); c.fillRect(x + 2, 6, w, 244);
    c.fillStyle = rng.pick(colors); c.beginPath(); c.arc(x + w / 2, 90, w * 0.32, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = 'bold 14px Georgia, serif'; c.textAlign = 'center';
    c.fillText(rng.pick(['CIRQUE', 'OPÉRA', 'CINÉMA', 'BAL', 'THÉÂTRE', 'JAZZ']), x + w / 2, 180);
    c.fillRect(x + 8, 200, w - 16, 3); c.fillRect(x + 8, 210, w - 24, 3);
  }
  p.dabs({ n: 40, colors: ['rgba(80,60,40,1)'], r: [4, 20], alpha: [0.04, 0.1] });
  const posters = charToon({ map: p.texture(), rim: 0.25 });
  g.add(cyl(0.75, 0.75, 3.2, posters, 0, 1.9, 0, 20));
  g.add(cyl(0.85, 0.9, 0.3, green, 0, 0.15, 0, 20));
  g.add(cyl(0.82, 0.78, 0.25, green, 0, 3.6, 0, 20));
  const dome = mesh(new THREE.SphereGeometry(0.95, 20, 8, 0, TAU, 0, Math.PI / 2), green, 0, 3.7, 0); dome.scale.y = 0.6; g.add(dome);
  g.add(cyl(0.2, 0.25, 0.4, green, 0, 4.4, 0, 10));
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

/** A Paris bench: two wooden slats on curly iron ends. Faces +z. */
export function bench(s = 1) {
  const g = new THREE.Group();
  const iron = toonE(0x24302a, 0.08), wood = toonE(0x7a5a38, 0.12);
  for (let i = 0; i < 3; i++) g.add(box(1.9 * s, 0.05 * s, 0.12 * s, wood, 0, 0.45 * s, (-0.12 + i * 0.14) * s));
  for (let i = 0; i < 2; i++) { const b = box(1.9 * s, 0.12 * s, 0.04 * s, wood, 0, (0.66 + i * 0.16) * s, -0.24 * s); b.rotation.x = -0.15; g.add(b); }
  for (const x of [-0.85, 0.85]) {
    g.add(box(0.06 * s, 0.45 * s, 0.4 * s, iron, x * s, 0.22 * s, 0));
    const t = mesh(new THREE.TorusGeometry(0.12 * s, 0.025 * s, 5, 10, Math.PI * 1.4), iron, x * s, 0.55 * s, 0.14 * s); t.rotation.y = Math.PI / 2; g.add(t);
    g.add(box(0.05 * s, 0.5 * s, 0.05 * s, iron, x * s, 0.72 * s, -0.24 * s));
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

/** A hanging lamp with a green enamel shade and a glowing bulb. Origin at the ceiling hook. */
export function enamelLamp(drop: number, s = 1, shade = 0x2a5a3a) {
  const g = new THREE.Group();
  g.add(cyl(0.012 * s, 0.012 * s, drop, toonE(0x1a1a1a, 0), 0, -drop / 2, 0, 4));
  const sh = new THREE.Mesh(new THREE.ConeGeometry(0.42 * s, 0.32 * s, 16, 1, true), charToon({ color: shade, side: THREE.DoubleSide, rim: 0.4, emissive: new THREE.Color(shade).multiplyScalar(0.25) }));
  sh.position.y = -drop - 0.12 * s; g.add(sh);
  const inside = new THREE.Mesh(new THREE.ConeGeometry(0.41 * s, 0.31 * s, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0d0, side: THREE.BackSide }));
  inside.position.y = -drop - 0.12 * s; g.add(inside);
  g.add(mesh(new THREE.SphereGeometry(0.11 * s, 10, 8), glow(0xffd890, 2.0), 0, -drop - 0.28 * s, 0));
  return g;
}

/** A painted sky-and-rooftops backdrop seen through windows: a gradient sky over a silhouette of Paris roofs. */
export function rooftopBackdrop(o: { top: string; bottom: string; roofs: string; lit?: number; seed?: number; w?: number; h?: number }) {
  const W = o.w ?? 1024, H = o.h ?? 512;
  const p = new Painter(W, H, o.seed ?? 61);
  const g = p.g, rng = p.rng;
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, o.top); gr.addColorStop(0.75, o.bottom); gr.addColorStop(1, o.bottom);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // two layers of roofs and chimneys
  for (const [layer, k] of [[0, 0.62], [1, 0.74]] as const) {
    g.fillStyle = layer ? o.roofs : css(new THREE.Color(o.roofs).lerp(new THREE.Color(o.bottom), 0.45).getHex());
    let x = -20;
    g.beginPath(); g.moveTo(0, H);
    while (x < W + 40) {
      const w = rng.range(50, 130), top = H * (k - rng.range(0, 0.12));
      g.lineTo(x, top + 12); g.lineTo(x + 10, top); g.lineTo(x + w - 10, top); g.lineTo(x + w, top + 12);
      // chimneys
      for (let c = 0; c < rng.int(0, 3); c++) { const cx = x + rng.range(12, w - 20); g.lineTo(cx, top); g.lineTo(cx, top - rng.range(10, 22)); g.lineTo(cx + 8, top - rng.range(10, 22)); g.lineTo(cx + 8, top); }
      x += w;
    }
    g.lineTo(W, H); g.closePath(); g.fill();
    // lit windows
    for (let i = 0; i < 60 * (o.lit ?? 0.3); i++) { g.fillStyle = rng.pick(['#ffd890', '#ffc870', '#ffe8b0']); g.fillRect(rng.range(0, W), H * rng.range(k + 0.04, 0.98), 5, 8); }
  }
  return p.texture({ wrap: false });
}

/** Points along a straight line, spaced roughly `step` apart with a little jitter. */
export function along(a: THREE.Vector3, b: THREE.Vector3, step: number, rng: Rng, jitter = 0) {
  const n = Math.max(1, Math.round(a.distanceTo(b) / step));
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push(new THREE.Vector3(lerp(a.x, b.x, t) + rng.range(-jitter, jitter), lerp(a.y, b.y, t), lerp(a.z, b.z, t) + rng.range(-jitter, jitter))); }
  return out;
}

export { css, PAL, repeatUV };
