import * as THREE from 'three';
import { box, instanced, mesh, type Placement } from '../../engine/Builders';
import { boxUV, charToon, Painter } from '../../engine/Paint';
import { Rng, TAU } from '../../engine/math';
import { awning, brick, css, parisFacade, PAL, plaster, shopfront, zinc, type ShopOpts } from './textures';
import { toonE } from './props';

/** One window bay and one storey, in world units. Walls are whole numbers of bays wide so windows line up. */
export const BAY = 2.6, STOREY = 3.3, GROUND = 4.4;

/** A box whose texture repeats every tileW x tileH units on every face. */
export function tiled(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], tileW: number, tileH: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), tileW, tileH), mat);
  m.position.set(x, y, z);
  return m;
}

/**
 * A mansard roof with world-unit UVs: four steep sides rising `h` and leaning in by `inset`, and a flat top.
 * Origin at the middle of its base.
 */
export function mansardRoof(w: number, d: number, h: number, inset: number, tile = 3) {
  const hw = w / 2, hd = d / 2, iw = Math.max(0.3, hw - inset), id = Math.max(0.3, hd - inset);
  const pos: number[] = [], uv: number[] = [];
  const slope = Math.hypot(h, inset);
  const quad = (a: number[], b: number[], c: number[], e: number[], ua: number[], ub: number[], uc: number[], ue: number[]) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...e);
    uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ue);
  };
  const B = [[-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd], [-hw, 0, -hd]];
  const T = [[-iw, h, id], [iw, h, id], [iw, h, -id], [-iw, h, -id]];
  const lens = [w, d, w, d];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, L = lens[i] / tile, s = slope / tile, ins = inset / tile;
    quad(B[i], B[j], T[j], T[i], [0, 0], [L, 0], [L - ins, s], [ins, s]);
  }
  quad(T[0], T[1], T[2], T[3], [0, 0], [iw * 2 / tile, 0], [iw * 2 / tile, id * 2 / tile], [0, id * 2 / tile]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** A pitched (gable) roof with world-unit UVs along x, ridge along x. Origin at the middle of its base. */
export function gableRoof(w: number, d: number, h: number, overhang = 0.4, tile = 3) {
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const pos: number[] = [], uv: number[] = [];
  const s = Math.hypot(h, hd) / tile, L = (hw * 2) / tile;
  const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  // front and back slopes
  tri([-hw, 0, hd], [hw, 0, hd], [hw, h, 0], [0, 0], [L, 0], [L, s]); tri([-hw, 0, hd], [hw, h, 0], [-hw, h, 0], [0, 0], [L, s], [0, s]);
  tri([hw, 0, -hd], [-hw, 0, -hd], [-hw, h, 0], [0, 0], [L, 0], [L, s]); tri([hw, 0, -hd], [-hw, h, 0], [hw, h, 0], [0, 0], [L, s], [0, s]);
  // gable ends
  tri([-w / 2, 0, -d / 2], [-w / 2, 0, d / 2], [-w / 2, h * (d / 2) / hd, 0], [0, 0], [d / tile, 0], [d / tile / 2, h / tile]);
  tri([w / 2, 0, d / 2], [w / 2, 0, -d / 2], [w / 2, h * (d / 2) / hd, 0], [0, 0], [d / tile, 0], [d / tile / 2, h / tile]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Wrought-iron balcony rail with a cut-out pattern, for an alpha-tested plane. One tile = 2 units wide, 1 tall. */
export function ironRail() {
  const p = new Painter(256, 128, 71);
  const g = p.g;
  g.clearRect(0, 0, 256, 128);
  g.strokeStyle = g.fillStyle = css(PAL.iron);
  g.fillRect(0, 0, 256, 9); g.fillRect(0, 118, 256, 10);
  g.lineWidth = 4;
  for (let x = 0; x < 256; x += 32) {
    g.beginPath(); g.moveTo(x, 9); g.lineTo(x, 118); g.stroke();
    g.beginPath(); g.ellipse(x + 16, 40, 10, 22, 0, 0, TAU); g.stroke();
    g.beginPath(); g.arc(x + 16, 90, 10, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(x + 6, 118); g.quadraticCurveTo(x + 16, 100, x + 26, 118); g.stroke();
  }
  const t = p.texture({ repeat: [1, 1] });
  return t;
}

/** A tall wooden double door under a stone arch, with a fanlight; fills one storey-high bay strip. */
export function entranceTexture(paint: number, wall: number, seed = 81) {
  const W = 256, H = 256;
  const p = new Painter(W, H, seed).fill(css(wall));
  const e = new Painter(W, H, 1).fill('#000');
  const g = p.g;
  p.dabs({ n: 30, colors: [css(wall, 1.05), css(wall, 0.92)], r: [6, 24], alpha: [0.06, 0.12] });
  // rusticated stone courses
  for (let y = 0; y < H; y += 32) { g.fillStyle = 'rgba(90,60,40,0.2)'; g.fillRect(0, y, W, 2); }
  // arch surround
  const dx = 64, dw = 128, dy = 48;
  g.fillStyle = css(wall, 1.08); g.beginPath(); g.moveTo(dx - 14, H); g.lineTo(dx - 14, dy + dw / 2); g.arc(W / 2, dy + dw / 2, dw / 2 + 14, Math.PI, 0); g.lineTo(dx + dw + 14, H); g.fill();
  g.fillStyle = css(paint);
  g.beginPath(); g.moveTo(dx, H); g.lineTo(dx, dy + dw / 2); g.arc(W / 2, dy + dw / 2, dw / 2, Math.PI, 0); g.lineTo(dx + dw, H); g.fill();
  // fanlight
  g.fillStyle = '#e8c070'; g.beginPath(); g.arc(W / 2, dy + dw / 2, dw / 2 - 8, Math.PI, 0); g.fill();
  e.g.fillStyle = '#a07040'; e.g.beginPath(); e.g.arc(W / 2, dy + dw / 2, dw / 2 - 8, Math.PI, 0); e.g.fill();
  g.strokeStyle = css(paint, 0.7); g.lineWidth = 3;
  for (let k = 1; k < 6; k++) { const a = Math.PI + (k / 6) * Math.PI; g.beginPath(); g.moveTo(W / 2, dy + dw / 2); g.lineTo(W / 2 + Math.cos(a) * (dw / 2 - 8), dy + dw / 2 + Math.sin(a) * (dw / 2 - 8)); g.stroke(); }
  // panels and the split between the leaves
  g.fillStyle = css(paint, 0.75); g.fillRect(W / 2 - 2, dy + dw / 2, 4, H);
  for (const x of [dx + 12, W / 2 + 12]) for (const [y, h] of [[dy + dw / 2 + 12, 60], [dy + dw / 2 + 84, 60]]) {
    g.strokeStyle = css(paint, 1.3); g.lineWidth = 3; g.strokeRect(x, y, dw / 2 - 24, h);
  }
  g.fillStyle = css(PAL.gold); g.beginPath(); g.arc(W / 2 - 10, dy + dw / 2 + 80, 5, 0, TAU); g.arc(W / 2 + 10, dy + dw / 2 + 80, 5, 0, TAU); g.fill();
  return { map: p.texture({ wrap: false }), emissive: e.texture({ wrap: false }) };
}

export interface BuildingSpec {
  bays: number;
  storeys: number;
  depth: number;
  /** facade material (from `facadeMaterial`) */
  facade: THREE.Material;
  side: THREE.Material;
  ground: { kind: 'shop'; shop: ShopOpts; awning?: [number, number] } | { kind: 'door'; mat: THREE.Material } | { kind: 'open' };
  balconies?: number[];
  flowers?: number;
  roof?: 'mansard' | 'gable';
  /** how brightly the shop windows glow (lower by day) */
  shopGlow?: number;
  /** how far the walls reach below the pavement (deeper on a slope) */
  footing?: number;
  rng: Rng;
  /** world-space chimney stacks are recorded here so a whole street shares one instanced mesh */
  chimneys?: Placement[];
  /** the building's world transform, needed to record chimneys */
  place?: { x: number; y: number; z: number; yaw: number };
}

const sharedMats = new Map<string, THREE.Material>();
function shared(key: string, make: () => THREE.Material) {
  let m = sharedMats.get(key);
  if (!m) { m = make(); sharedMats.set(key, m); }
  return m;
}
export const zincMat = () => shared('zinc', () => new THREE.MeshLambertMaterial({ map: zinc() }));
export const railMat = () => shared('rail', () => new THREE.MeshLambertMaterial({ map: ironRail(), alphaTest: 0.5, side: THREE.DoubleSide }));
export const corniceMat = (wall: number) => shared(`cornice${wall}`, () => toonE(new THREE.Color(wall).multiplyScalar(1.04).getHex(), 0.06));
export const plasterMat = (wall: number) => shared(`plaster${wall}`, () => new THREE.MeshLambertMaterial({ map: plaster(wall, wall % 97) }));
export const brickMat = () => shared('brick', () => new THREE.MeshLambertMaterial({ map: brick() }));
const potMat = () => shared('pot', () => toonE(0xb86a44, 0.08));
const dormerGlass = () => shared('dormerGlass', () => new THREE.MeshLambertMaterial({ color: 0x3a4440, emissive: 0xffc870, emissiveIntensity: 0 }));
const dormerLit = () => shared('dormerLit', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd08a).multiplyScalar(1.1) }));
const geraniumLeaf = () => shared('geraniumLeaf', () => toonE(0x3a6a2a, 0.1));
const geraniumFlower = () => shared('geraniumFlower', () => toonE(0xd8222a, 0.25));
const flowerBox = () => shared('flowerBox', () => toonE(0x6a3a24, 0.08));
const geraniumGeo = { leaf: new THREE.IcosahedronGeometry(0.16, 0), bloom: new THREE.IcosahedronGeometry(0.12, 1) };

/** A facade material: painted windows tiling `bays` x `storeys`, lit windows in the emissive map. */
export function facadeMaterial(o: Parameters<typeof parisFacade>[0], litStrength = 0.9) {
  const key = JSON.stringify(o) + litStrength;
  return shared(key, () => {
    const f = parisFacade(o);
    return new THREE.MeshLambertMaterial({ map: f.map, emissive: 0xffffff, emissiveMap: f.emissive, emissiveIntensity: litStrength });
  });
}

/**
 * A Paris building facing +z with its front at z = 0 and its base at y = 0 (the pavement).
 * Ground floor (shop, door or open), storeys of tall windows, a cornice, a zinc mansard with dormers,
 * 3D balconies with iron rails and window boxes of red geraniums.
 */
export function parisBuilding(o: BuildingSpec) {
  const g = new THREE.Group();
  const w = o.bays * BAY, d = o.depth, rng = o.rng;
  const upperH = o.storeys * STOREY;
  const top = GROUND + upperH;
  // body: the front face gets the facade, the others plain plaster; the ground floor is a separate box
  const body = tiled(w, upperH, d, [o.side, o.side, o.side, o.side, o.facade, o.side], BAY * 3, STOREY * 2, 0, GROUND + upperH / 2, -d / 2);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const gf = o.ground;
  if (gf.kind === 'shop') {
    const tex = shopfront(gf.shop);
    const front = new THREE.MeshLambertMaterial({ map: tex.map, emissive: 0xffffff, emissiveMap: tex.emissive, emissiveIntensity: o.shopGlow ?? 0.9 });
    const gb = new THREE.Mesh(new THREE.BoxGeometry(w, GROUND, d), [o.side, o.side, o.side, o.side, front, o.side]);
    gb.position.set(0, GROUND / 2, -d / 2);
    gb.castShadow = true;
    g.add(gb);
    if (gf.awning) {
      const aw = new THREE.MeshLambertMaterial({ map: awning(gf.awning[0], gf.awning[1], 25 + o.bays), side: THREE.DoubleSide });
      (aw.map as THREE.Texture).repeat.set(w / 3, 1);
      const a = mesh(new THREE.PlaneGeometry(w - 0.4, 2.2), aw, 0, GROUND - 1.25, 0.95);
      a.rotation.x = -Math.PI / 2 + 0.42; a.castShadow = true; g.add(a);
      const val = mesh(new THREE.PlaneGeometry(w - 0.4, 0.35), aw, 0, GROUND - 2.1, 1.9); g.add(val);
    }
  } else if (gf.kind === 'door') {
    const gb = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, GROUND, d), w / Math.max(1, Math.round(w / 4.5)), GROUND), [o.side, o.side, o.side, o.side, gf.mat, o.side]);
    gb.position.set(0, GROUND / 2, -d / 2);
    gb.castShadow = true;
    g.add(gb);
  }
  // a footing below the pavement, so a building on a slope never shows a gap
  const fd = o.footing ?? 2.5;
  const foot = box(w - 0.1, fd, d - 0.1, o.side, 0, -fd / 2, -d / 2);
  g.add(foot);
  // string course over the ground floor, cornice at the top
  const wallC = (o.side as THREE.MeshLambertMaterial).color?.getHex?.() ?? PAL.cream;
  g.add(box(w + 0.2, 0.4, 0.4, corniceMat(0xf2e6cc), 0, GROUND + 0.1, 0.1));
  const cor = box(w + 0.6, 0.6, d + 0.6, corniceMat(0xf2e6cc), 0, top + 0.1, -d / 2);
  cor.castShadow = true; g.add(cor);
  void wallC;
  // balconies
  for (const s of o.balconies ?? []) {
    if (s >= o.storeys) continue;
    const y = GROUND + s * STOREY + 0.05;
    const slab = box(w + 0.3, 0.16, 0.75, corniceMat(0xf2e6cc), 0, y, 0.36);
    slab.castShadow = true; g.add(slab);
    const rail = mesh(new THREE.PlaneGeometry(w + 0.3, 1.0), railMat(), 0, y + 0.58, 0.72);
    const ru = rail.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < ru.count; i++) ru.setX(i, ru.getX(i) * (w + 0.3) / 2);
    rail.castShadow = true;
    g.add(rail);
  }
  // window boxes of geraniums on some windows of the lower storeys
  const leaves: Placement[] = [], blooms: Placement[] = [];
  for (let s = 0; s < Math.min(3, o.storeys); s++) {
    if (o.balconies?.includes(s)) continue;
    for (let b = 0; b < o.bays; b++) {
      if (!rng.chance(o.flowers ?? 0)) continue;
      const x = -w / 2 + BAY * (b + 0.5), y = GROUND + s * STOREY + 0.25;
      g.add(box(1.2, 0.3, 0.32, flowerBox(), x, y, 0.18));
      for (let k = 0; k < 9; k++) {
        const fx = x + rng.range(-0.55, 0.55), fz = 0.2 + rng.range(-0.1, 0.12), fy = y + 0.2 + rng.range(0, 0.2);
        (k % 3 ? blooms : leaves).push({ x: fx, y: fy, z: fz, scale: rng.range(0.7, 1.2), rot: 0 });
      }
    }
  }
  if (leaves.length) g.add(instanced(geraniumGeo.leaf, geraniumLeaf(), leaves));
  if (blooms.length) g.add(instanced(geraniumGeo.bloom, geraniumFlower(), blooms));
  // the roof
  if ((o.roof ?? 'mansard') === 'mansard') {
    const roof = mesh(mansardRoof(w + 0.3, d + 0.3, 3.4, 1.5), zincMat(), 0, top + 0.4, -d / 2);
    roof.castShadow = true; g.add(roof);
    // dormers along the front slope
    const n = Math.max(1, Math.floor(o.bays / 1.5));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      const dg = new THREE.Group(); dg.position.set(x, top + 1.6, -0.55);
      dg.add(box(1.3, 1.6, 1.4, corniceMat(0xf2e6cc), 0, 0, -0.3));
      dg.add(box(0.8, 1.1, 0.06, rng.chance(0.4) ? dormerLit() : dormerGlass(), 0, -0.05, 0.42));
      const cap = mesh(gableRoof(1.3, 1.5, 0.6, 0.12, 1.5), zincMat(), 0, 0.8, -0.3); cap.rotation.y = Math.PI / 2; dg.add(cap);
      g.add(dg);
    }
  } else {
    const roof = mesh(gableRoof(w, d, 3.6, 0.4), shared('tiles', () => new THREE.MeshLambertMaterial({ map: brick(0xa8583a, 91) })), 0, top + 0.4, -d / 2);
    roof.castShadow = true; g.add(roof);
  }
  // chimneys, recorded in world space for one instanced mesh per street
  if (o.chimneys && o.place) {
    const nc = rng.int(1, 3);
    for (let i = 0; i < nc; i++) {
      const lx = rng.range(-w / 2 + 1.5, w / 2 - 1.5), lz = -d / 2 + rng.range(-d / 4, d / 4);
      const c = Math.cos(o.place.yaw), s = Math.sin(o.place.yaw);
      o.chimneys.push({ x: o.place.x + c * lx + s * lz, y: o.place.y + top + 2.2, z: o.place.z - s * lx + c * lz, scale: rng.range(0.9, 1.2), rot: o.place.yaw });
    }
  }
  return g;
}

/** Brick chimney stacks with a row of terracotta pots, instanced from world placements. */
export function chimneyStacks(placements: Placement[]) {
  const g = new THREE.Group();
  if (!placements.length) return g;
  const stack = new THREE.BoxGeometry(1.6, 2.6, 0.7); stack.translate(0, 1.3, 0);
  boxUV(stack as THREE.BoxGeometry, 2, 2);
  const capG = new THREE.BoxGeometry(1.8, 0.18, 0.9); capG.translate(0, 2.65, 0);
  const pots: Placement[] = [];
  for (const p of placements) for (let k = -1; k <= 1; k++) pots.push({ x: p.x + Math.cos(p.rot) * k * 0.45 * p.scale, y: p.y + 2.7 * p.scale, z: p.z - Math.sin(p.rot) * k * 0.45 * p.scale, scale: p.scale, rot: 0 });
  const potG = new THREE.CylinderGeometry(0.12, 0.15, 0.6, 8); potG.translate(0, 0.3, 0);
  const a = instanced(stack, brickMat(), placements), b = instanced(capG, corniceMat(0xf2e6cc), placements), c = instanced(potG, potMat(), pots);
  for (const m of [a, b, c]) m.castShadow = true;
  g.add(a, b, c);
  return g;
}

/** Facade, side and door materials for a street, in the film's warm palette. */
export function streetPalette(rng: Rng, o: { lit: number; glass?: 'day' | 'night'; litStrength?: number } ) {
  const walls = [0xf0dcb4, 0xe8c898, 0xf2e2c4, 0xe6b8a0, 0xeed2a6, 0xf4e6cc, 0xd8d0a8, 0xe8c0b0];
  const shutters = [0x3a6a44, 0x2f5a3a, undefined, 0x8a3a2a, undefined, 0x4a6a5a, 0x6a4a2a, 0x2f5a3a];
  const facades = walls.map((wall, i) => facadeMaterial({ wall, shutters: shutters[i], bays: 3, storeys: 2, lit: o.lit, flowers: 0.15, ashlar: i % 2 === 0, glass: o.glass, seed: 100 + i }, o.litStrength ?? 0.9));
  const sides = walls.map((wall) => plasterMat(wall));
  const doors = [0x2f5a3a, 0x6a1a1c, 0x3a2a20].map((paint, i) => {
    const t = entranceTexture(paint, walls[i * 2], 81 + i);
    return new THREE.MeshLambertMaterial({ map: t.map, emissive: 0xffffff, emissiveMap: t.emissive, emissiveIntensity: 0.6 });
  });
  return { walls, facades, sides, doors, pick: () => rng.int(0, walls.length - 1) };
}

export { Painter, charToon };
