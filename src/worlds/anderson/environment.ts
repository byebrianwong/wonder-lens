import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, glow, box, cyl, cone, sphere, mesh, roofGeometry, canvasTexture, textTexture, instanced, scatter, mergeStatic, type Placement } from '../../engine/Builders';
import { boxUV, repeatUV } from '../../engine/Paint';
import { Rng, TAU } from '../../engine/math';
import { fluffyForest, fluffyTree, type FluffyStyle } from '../../engine/Foliage';
import type { ExclusionMask } from '../../engine/Ground';
import { makeMendlsBox } from './characters';
import { bark, boyWithApple, chainLink, checker, dispatchCover, facadeTile, fishScales, panels, paving, planks, scallopTrim, stripes, stucco, vendingFront, whitmanLuggage } from './textures';

export type HeightFn = (x: number, z: number) => number;
export type TrackPointFn = (z: number) => { x: number; y: number };
export type DistFn = (x: number, z: number) => number;

/** Fixed places the terrain (in AndersonWorld.ts) and the builders here both need to agree on. */
export const SPOTS = {
  station: { z: -14 },
  hotel: { x: -70, z: -330, y: 30 },
  pavilion: { x: -11, z: -302 },
  church: { x: 68, z: -330 },
  /** Gabelmeister's Peak: the summit observatory, and the cable car's valley station beside the line */
  peak: { x: 150, z: -472, y: 150 },
  cableBase: { x: 26, z: -400 },
  bbb: { x: 12.5, z: -662 },
  foxTree: { x: 26, z: -760 },
  camp: { x: -17, z: -897 },
  lake: { x: -44, z: -905, level: 2.2, bottom: 0.6 },
  treehouse: { x: -27, z: -992 },
  tower: { x: 30, z: -1080 },
  citySign: { x: 15, z: -1190 },
  diner: { x: 24, z: -1255 },
  motel: { x: 24, z: -1330 },
  ramp: { x: -38, z0: -1318, z1: -1402 },
  crater: { x: 30, z: -1440, r: 11 },
  observatory: { x: -48, z: -1560 },
  mesas: [[-150, -1290, 46, 28], [150, -1290, 46, 28], [-195, -1500, 62, 36], [195, -1500, 62, 36], [-120, -1660, 36, 18], [120, -1660, 36, 18]] as [number, number, number, number][],
  belafonte: { x: 27, z: -1850 },
  sub: { x: -15, z: -1790 },
  island: { x: 40, z: -2075, r: 14 },
  harbour: { z: -2205 },
};

/** The pastel palette used everywhere. */
export const PAL = { pink: 0xf2b8c6, deepPink: 0xe58fa6, burgundy: 0x7a2a36, red: 0xb93a4c, mint: 0xa8d8c8, mustard: 0xe8c04a, powder: 0xa9c8e8, cream: 0xf6efe2, white: 0xfbf8f4, brass: 0xd8b25a, dark: 0x2a2c30, sage: 0x7fa58a, turquoise: 0x6fc4c0, orange: 0xe8743a };

// ---------- small shared pieces ----------

/** A Lambert material with a painted map. */
export const texMat = (map: THREE.Texture, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map, ...o });

/** A box whose texture repeats every tileW x tileH units on every face. */
export function tiled(w: number, h: number, d: number, mat: THREE.Material, tileW: number, tileH: number, x = 0, y = 0, z = 0) {
  return mesh(boxUV(new THREE.BoxGeometry(w, h, d), tileW, tileH), mat, x, y, z);
}

/** A framed board with serif lettering. The face points to local +z. */
export function signBoard(text: string, w: number, h: number, o: { color?: string; bg?: string; border?: string; font?: string; texW?: number; texH?: number; sub?: string; frame?: number } = {}) {
  const texW = o.texW ?? 512, texH = o.texH ?? 128;
  const tex = canvasTexture(texW, texH, (c) => {
    c.fillStyle = o.bg ?? '#fbf7f2'; c.fillRect(0, 0, texW, texH);
    if (o.border) { const lw = Math.max(3, Math.round(texH * 0.05)); c.strokeStyle = o.border; c.lineWidth = lw; c.strokeRect(lw * 1.5, lw * 1.5, texW - lw * 3, texH - lw * 3); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    // painted letters with a faint drop shade, like sign-writer's enamel
    const letters = (font: string, t: string, y: number) => {
      c.font = font;
      c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillText(t, texW / 2 + texH * 0.015, y + texH * 0.02);
      c.fillStyle = o.color ?? '#7a2a36'; c.fillText(t, texW / 2, y);
    };
    if (o.sub) {
      letters(o.font ?? `bold ${Math.round(texH * 0.4)}px Georgia, serif`, text, texH * 0.38);
      letters(`italic ${Math.round(texH * 0.2)}px Georgia, serif`, o.sub, texH * 0.76);
    } else letters(o.font ?? `bold ${Math.round(texH * 0.5)}px Georgia, serif`, text, texH * 0.53);
  });
  const g = new THREE.Group();
  g.add(box(w + 0.16, h + 0.16, 0.08, toon(o.frame ?? PAL.white), 0, 0, -0.05));
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), 0, 0, 0.001));
  return g;
}

/** A sign on a post. The face points to local +z. */
export function signPost(text: string, w: number, h: number, postH: number, postColor: number, o: Parameters<typeof signBoard>[3] = {}) {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.08, postH, toon(postColor), 0, postH / 2, 0, 6));
  const b = signBoard(text, w, h, o);
  b.position.set(0, postH + h / 2 - 0.1, 0.06);
  g.add(b);
  return g;
}

/** A clipped shrub in a pot: the hotel garden kind. */
export function topiary(kind: 'ball' | 'cone' | 'double', color = PAL.sage, potColor = 0xe0d0c0) {
  const g = new THREE.Group();
  g.add(cyl(0.45, 0.35, 0.7, toon(potColor), 0, 0.35, 0, 10));
  g.add(cyl(0.06, 0.06, 0.8, toon(0x5a4a3a), 0, 1.0, 0, 6));
  const m = toon(color);
  if (kind === 'cone') g.add(cone(0.62, 1.9, m, 0, 2.15, 0, 10));
  else if (kind === 'ball') g.add(sphere(0.72, m, 0, 1.95, 0, 12, 9));
  else { g.add(sphere(0.6, m, 0, 1.6, 0, 12, 9)); g.add(cyl(0.05, 0.05, 0.5, toon(0x5a4a3a), 0, 2.4, 0, 6)); g.add(sphere(0.4, m, 0, 2.85, 0, 10, 8)); }
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return g;
}

/**
 * Merged parts instanced at the placements, split into stretches of `chunk` units along z (one instanced mesh
 * each) so the fog culler can drop stretches far ahead. The group is marked `userData.chunked`.
 */
export function chunkedParts(parts: THREE.BufferGeometry[], mat: THREE.Material, placements: Placement[], o: { castShadow?: boolean; chunk?: number; color?: (i: number, out: THREE.Color) => void } = {}) {
  const g = new THREE.Group();
  g.userData.chunked = true;
  if (!placements.length) return g;
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)!;
  const chunk = o.chunk ?? 120;
  const by = new Map<number, number[]>();
  placements.forEach((p, i) => { const k = Math.floor(p.z / chunk); if (!by.has(k)) by.set(k, []); by.get(k)!.push(i); });
  for (const idx of by.values()) {
    const im = instanced(geo, mat, idx.map((i) => placements[i]), o.color ? (j, c) => o.color!(idx[j], c) : undefined);
    im.castShadow = !!o.castShadow; im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

/** Lamp posts (pole + head) with glowing lamps, in stretches along z. */
export function lampPosts(placements: Placement[], o: { height: number; color: number; lamp: number; head: 'globe' | 'lantern' }) {
  const g = new THREE.Group();
  g.userData.chunked = true;
  if (!placements.length) return g;
  const parts: THREE.BufferGeometry[] = [];
  const pole = new THREE.CylinderGeometry(0.07, 0.11, o.height, 8); pole.translate(0, o.height / 2, 0); parts.push(pole);
  const base = new THREE.CylinderGeometry(0.26, 0.32, 0.3, 8); base.translate(0, 0.15, 0); parts.push(base);
  const collar = new THREE.CylinderGeometry(0.14, 0.14, 0.18, 8); collar.translate(0, o.height * 0.35, 0); parts.push(collar);
  if (o.head === 'lantern') { const cap = new THREE.ConeGeometry(0.44, 0.32, 4); cap.rotateY(Math.PI / 4); cap.translate(0, o.height + 0.58, 0); parts.push(cap); const sole = new THREE.BoxGeometry(0.4, 0.06, 0.4); sole.translate(0, o.height + 0.07, 0); parts.push(sole); }
  else { const ring = new THREE.CylinderGeometry(0.2, 0.14, 0.12, 8); ring.translate(0, o.height, 0); parts.push(ring); }
  const metal = mergeGeometries(parts, false)!;
  const lampGeo = o.head === 'lantern' ? new THREE.BoxGeometry(0.32, 0.42, 0.32) : new THREE.SphereGeometry(0.32, 12, 9);
  lampGeo.translate(0, o.height + 0.3, 0);
  const metalMat = toon(o.color), lampMat = glow(o.lamp, 1.05);
  const by = new Map<number, Placement[]>();
  for (const p of placements) { const k = Math.floor(p.z / 120); if (!by.has(k)) by.set(k, []); by.get(k)!.push(p); }
  for (const pl of by.values()) {
    const c = new THREE.Group();
    const m = instanced(metal, metalMat, pl); m.castShadow = true; m.computeBoundingSphere();
    const l = instanced(lampGeo, lampMat, pl); l.computeBoundingSphere();
    c.add(m, l);
    g.add(c);
  }
  return g;
}

/** Symmetric pairs of placements at x = +-off along z. */
export function pairs(heightAt: HeightFn, off: number, z0: number, z1: number, step: number, accept: (x: number, z: number) => boolean = () => true): Placement[] {
  const out: Placement[] = [];
  for (let z = z0; z >= z1; z -= step) for (const s of [-1, 1]) { const x = s * off; if (!accept(x, z)) continue; out.push({ x, y: heightAt(x, z), z, scale: 1, rot: 0 }); }
  return out;
}

/** A mansard roof: a square frustum. Width along x, depth along z, base at y = 0. */
export function mansardGeometry(w: number, d: number, h: number, inset = 0.72) {
  const geo = new THREE.CylinderGeometry(inset * Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.scale(w, h, d);
  geo.translate(0, h / 2, 0);
  return geo;
}

/** A fish-scale mansard roof material and geometry sized so the scales stay roughly 1.5 units wide. */
function scaleRoof(w: number, d: number, h: number, mat: THREE.Material, inset = 0.66) {
  return mesh(repeatUV(mansardGeometry(w, d, h, inset), (w + d) * 2 / 1.5, h / 1.5), mat);
}

/** A flat strip that follows the ground (roads, trails). x is a function of z. */
export function groundStrip(xAt: (z: number) => number, z0: number, z1: number, width: number, heightAt: HeightFn, mat: THREE.Material, step = 4, lift = 0.06, uvEvery = 8) {
  const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step));
  const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const z = z0 + (z1 - z0) * (i / n);
    const x = xAt(z);
    const a = x - width / 2, b = x + width / 2;
    verts.push(a, heightAt(a, z) + lift, z, b, heightAt(b, z) + lift, z);
    const v = (Math.abs(z - z0)) / uvEvery;
    uvs.push(0, v, 1, v);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

/** A thin rod between two points (cables, ladder rails, lattice members). */
export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 5) {
  const d = b.clone().sub(a);
  const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** Everything under `g` casts shadows (except transparent glass and glows), then static meshes are merged per material. */
function finish(g: THREE.Object3D, shadows = true) {
  if (shadows) g.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && !(m.material as THREE.Material).transparent && !(m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) m.castShadow = true; });
  return mergeStatic(g);
}

const segDist = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
};
const far = (x: number, z: number, cx: number, cz: number, r: number) => Math.hypot(x - cx, z - cz) > r;

/** A Courtesan au chocolat: three stacked choux, lavender, pale green and pink, with a cocoa bead on top. */
export function courtesan(s = 1) {
  const g = new THREE.Group();
  g.add(cyl(0.2 * s, 0.2 * s, 0.03 * s, toon(0xfbf7f2), 0, 0.015 * s, 0, 12));
  const puff = (r: number, y: number, c: number) => { const m = sphere(r * s, toon(c), 0, y * s, 0, 12, 8); m.scale.y = 0.82; g.add(m); };
  puff(0.15, 0.13, 0xb9a0d8); puff(0.11, 0.33, 0xc8e6b8); puff(0.08, 0.48, 0xf4b8c8);
  g.add(sphere(0.025 * s, toon(0x5a3424), 0, 0.57 * s, 0, 6, 4));
  return g;
}

/** "Boy with Apple" on a wooden easel. Faces +z; merged. */
export function boyWithAppleEasel() {
  const painting = new THREE.Group();
  const wood = toon(0x6a4a32);
  for (const s of [-1, 1]) { const leg = cyl(0.03, 0.035, 2.0, wood, s * 0.38, 1.0, 0, 5); leg.rotation.z = -s * 0.12; leg.rotation.x = -0.1; painting.add(leg); }
  const rear = cyl(0.03, 0.03, 2.0, wood, 0, 0.95, -0.35, 5); rear.rotation.x = 0.35; painting.add(rear);
  painting.add(box(0.95, 0.05, 0.12, wood, 0, 0.72, 0.06));
  const canvas = mesh(new THREE.PlaneGeometry(0.9, 1.2), new THREE.MeshLambertMaterial({ map: boyWithApple() }), 0, 1.35, 0.1);
  canvas.rotation.x = -0.1; painting.add(canvas);
  painting.add(box(0.92, 1.22, 0.04, toon(0xb8902e), 0, 1.35, 0.06).rotateX(-0.1));
  return finish(painting);
}

/** The Whitman brothers' luggage (The Darjeeling Limited): eleven pieces stacked on a station trolley. Merged. */
export function whitmanLuggageTrolley() {
  const luggage = new THREE.Group();
  {
    const leather = texMat(whitmanLuggage(37));
    const iron = toon(0x3a3a40);
    luggage.add(box(1.3, 0.1, 2.3, toon(0x6a5040), 0, 0.3, 0));
    for (const [x, z] of [[-0.5, -0.9], [0.5, -0.9], [-0.5, 0.9], [0.5, 0.9]]) luggage.add(cyl(0.14, 0.14, 0.08, iron, x, 0.14, z, 10).rotateZ(Math.PI / 2));
    luggage.add(cyl(0.025, 0.025, 1.1, iron, -0.6, 0.85, 1.15, 5), cyl(0.025, 0.025, 1.1, iron, 0.6, 0.85, 1.15, 5), cyl(0.025, 0.025, 1.2, iron, 0, 1.4, 1.15, 5).rotateZ(Math.PI / 2));
    const piece = (w: number, h: number, d: number, x: number, y: number, z: number, rot = 0) => { const b = tiled(w, h, d, leather, 0.9, 0.9, x, y, z); b.rotation.y = rot; luggage.add(b); luggage.add(box(0.05, 0.05, 0.02, toon(PAL.brass), x, y + h / 2 + 0.02, z)); };
    piece(1.1, 0.55, 0.95, 0, 0.63, -0.5); piece(1.1, 0.55, 0.95, 0, 0.63, 0.5);
    piece(0.9, 0.36, 0.7, -0.05, 1.08, -0.45, 0.08); piece(0.85, 0.34, 0.66, 0.05, 1.07, 0.45, -0.06); piece(0.5, 0.3, 0.4, 0.3, 1.05, 0.0, 0.2);
    piece(0.7, 0.26, 0.5, 0, 1.39, -0.4, -0.1); piece(0.62, 0.24, 0.46, 0.02, 1.37, 0.42, 0.12);
    piece(0.46, 0.2, 0.36, -0.05, 1.62, -0.35, 0.3); piece(0.42, 0.18, 0.34, 0.05, 1.6, 0.35, -0.25);
    luggage.add(mesh(repeatUV(new THREE.CylinderGeometry(0.2, 0.2, 0.26, 16), 2, 0.4), leather, 0, 1.85, 0.3));
    piece(0.3, 0.2, 0.22, 0, 1.83, -0.3, 0.5);
  }
  return finish(luggage);
}

/** A green Paris-style news kiosk papered with French Dispatch covers. Faces +z; merged. */
export function dispatchKiosk() {
  const k = new THREE.Group();
  const green = toon(0x3f6a52);
  k.add(mesh(repeatUV(new THREE.CylinderGeometry(0.9, 0.9, 2.6, 12), 3, 1), green, 0, 1.3, 0));
  k.add(cyl(1.15, 1.0, 0.25, green, 0, 2.7, 0, 12), cone(1.1, 1.0, green, 0, 3.3, 0, 12), sphere(0.14, toon(PAL.brass), 0, 3.85, 0, 8, 6));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const cov = mesh(new THREE.PlaneGeometry(0.5, 0.66), new THREE.MeshLambertMaterial({ map: dispatchCover(i) }), Math.sin(a) * 0.93, 1.5, Math.cos(a) * 0.93);
    cov.rotation.y = a; k.add(cov);
  }
  const kn = signBoard('THE FRENCH DISPATCH', 1.9, 0.34, { color: '#fbf7f2', bg: '#2a3a30', texW: 512, texH: 92, frame: 0x3f6a52 });
  kn.position.set(0, 2.35, 1.0); k.add(kn);
  return finish(k);
}

// ---------- a station (used at both ends) ----------
export function buildStation(name: string, sub: string, z: number, heightAt: HeightFn, trackPoint: TrackPointFn, o: { wall: number; trim: number; roof: number; len?: number; houseSide: -1 | 1; seed?: number }) {
  const g = new THREE.Group();
  const len = o.len ?? 32;
  const ty = trackPoint(z).y - 0.45;
  const platY = ty + 0.9;
  const edge = texMat(stucco(0xd9d0c2, 2)), pave = texMat(paving(0xece5d8, o.seed ?? 7));
  const trim = toon(o.trim), roof = toon(o.roof);
  const scallop = new THREE.MeshLambertMaterial({ map: scallopTrim(o.trim), alphaTest: 0.5, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    g.add(tiled(4.6, 0.9, len, edge, 3, 3, s * 5.3, ty + 0.45, z));
    g.add(tiled(4.6, 0.1, len, pave, 2, 2, s * 5.3, ty + 0.92, z));
    g.add(box(0.3, 0.03, len, toon(PAL.mustard), s * 3.35, ty + 0.98, z));
    for (const dz of [-len / 2 + 3, 0, len / 2 - 3]) {
      g.add(cyl(0.1, 0.12, 3.4, trim, s * 6.2, platY + 1.7, z + dz, 8));
      // a bracket out under the canopy
      const br = box(1.9, 0.08, 0.08, trim, s * 5.3, platY + 3.0, z + dz); br.rotation.z = s * 0.35; g.add(br);
    }
    g.add(box(4.2, 0.22, len - 2, roof, s * 5.4, platY + 3.5, z));
    g.add(box(4.4, 0.14, len - 1.6, trim, s * 5.4, platY + 3.68, z));
    // scalloped fascia along the track edge
    const fas = mesh(repeatUV(new THREE.PlaneGeometry(len - 2, 0.62), (len - 2) / 0.9, 1), scallop, s * 3.24, platY + 3.1, z);
    fas.rotation.y = Math.PI / 2; g.add(fas);
    for (const dz of [-len / 4, len / 4]) { g.add(box(2.0, 0.08, 0.5, trim, s * 6.6, platY + 0.5, z + dz)); g.add(box(2.0, 0.5, 0.08, trim, s * 6.6, platY + 0.75, z + dz + s * 0.24)); for (const e of [-0.9, 0.9]) g.add(box(0.08, 0.5, 0.45, trim, s * 6.6 + e, platY + 0.25, z + dz)); }
    const sign = signBoard(name, 4.8, 1.15, { color: '#7a2a36', bg: '#fbf7f2', border: '#7a2a36', texW: 512, texH: 120, sub, frame: o.trim });
    sign.position.set(s * 5.2, platY + 2.6, z);
    sign.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(sign);
    for (const dz of [-len / 2 + 1.4, len / 2 - 1.4]) { const t = topiary('cone'); t.position.set(s * 6.6, platY, z + dz); g.add(t); }
    // a clock under each canopy
    const face = canvasTexture(64, 64, (c) => { c.fillStyle = '#fbf7f2'; c.beginPath(); c.arc(32, 32, 30, 0, TAU); c.fill(); c.strokeStyle = '#2a2c30'; c.lineWidth = 3; c.stroke(); c.beginPath(); c.moveTo(32, 32); c.lineTo(32, 10); c.moveTo(32, 32); c.lineTo(46, 38); c.stroke(); });
    const clock = mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ map: face, side: THREE.DoubleSide }), s * 3.6, platY + 2.9, z + len / 2 - 4);
    clock.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(clock);
  }
  // the station house, symmetric about its own centre, facing the track
  const house = new THREE.Group();
  {
    const f = facadeTile({ wall: o.wall, frame: 0xfbf7f2, cornice: 0xfbf7f2, shutters: o.trim, bays: 4, storeys: 2, lit: 0.4, seed: (o.seed ?? 7) + 3 });
    const wall = texMat(f.map, { emissive: 0xffdcb0, emissiveMap: f.emissive, emissiveIntensity: 0.5 });
    house.add(tiled(11.2, 6, 6, wall, 11.2, 6, 0, 3, 0));
    house.add(box(11.6, 0.4, 6.4, trim, 0, 6.1, 0));
    const r = scaleRoof(11.8, 6.8, 2.6, texMat(fishScales(o.roof, (o.seed ?? 7) + 5)), 0.7); r.position.y = 6.3; house.add(r);
    house.add(box(8.3, 0.3, 4.8, trim, 0, 8.9, 0));
    house.add(box(1.6, 2.6, 0.12, glow(0xfff0d8, 0.8), 0, 1.3, 3.03));
    house.add(box(2.4, 0.2, 0.3, trim, 0, 2.75, 3.1));
    for (const s of [-1, 1]) house.add(cyl(0.12, 0.12, 2.7, trim, s * 1.2, 1.35, 3.2, 8));
    const b = signBoard(name, 5.2, 1.0, { color: '#fbf7f2', bg: '#7a2a36', texW: 512, texH: 100, frame: o.trim });
    b.position.set(0, 4.9, 3.12); house.add(b);
    house.add(cyl(0.04, 0.04, 3.5, toon(PAL.dark), 0, 10.5, 0, 5));
    house.add(mesh(new THREE.PlaneGeometry(1.6, 1.0), toon(PAL.red, { side: THREE.DoubleSide }), 0.8, 11.7, 0));
    for (const s of [-1, 1]) { const t = topiary('double'); t.position.set(s * 4.2, 0, 3.6); house.add(t); }
  }
  const hx = o.houseSide * 11.5;
  const plinthH = Math.max(0.6, platY - heightAt(hx, z) + 0.4);
  house.add(tiled(12.5, plinthH, 7.5, edge, 3, 3, 0, -plinthH / 2 + 0.02, 0));
  house.position.set(hx, platY - 0.02, z);
  house.rotation.y = o.houseSide > 0 ? -Math.PI / 2 : Math.PI / 2;
  g.add(house);
  finish(g);
  return { group: g, platY, ty };
}

// ---------- the vehicle ----------
/**
 * The Zubrowka Express: a pink railcar behind an open front deck with brass rails and a pair of lanterns.
 * The front of the car is a lit compartment you can see into through its windows. Local +z is forward.
 */
export function buildZubrowkaExpress() {
  const g = new THREE.Group();
  const pink = texMat(panels(PAL.pink, 51)), cream = toon(PAL.cream), dark = toon(PAL.dark);
  const brass = new THREE.MeshStandardMaterial({ color: PAL.brass, metalness: 0.8, roughness: 0.35 });
  const ribs = canvasTexture(64, 256, (c) => {
    c.fillStyle = '#7a2a36'; c.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 64) { c.fillStyle = '#5a1c26'; c.fillRect(0, y, 64, 6); c.fillStyle = '#9a4a54'; c.fillRect(0, y + 6, 64, 4); }
  }, [1, 1]);
  const car = new THREE.Group();
  // the solid rear of the car
  const bodyTop = 3.25, bodyBot = 0.55;
  car.add(tiled(3.2, bodyTop - bodyBot, 9, pink, 1.6, 1.6, 0, (bodyTop + bodyBot) / 2, -8.0));
  // the front compartment: walls with real window openings, lined with wallpaper
  const WZ0 = -0.5, WZ1 = -3.5, wy0 = 1.72, wy1 = 2.78;
  const wallpaper = texMat(canvasTexture(128, 128, (c) => {
    c.fillStyle = '#e8c9c4'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#d8aaa8';
    for (let y = 0; y < 128; y += 32) for (let x = (y / 32) % 2 ? 16 : 0; x < 128; x += 32) { c.beginPath(); c.ellipse(x + 8, y + 16, 5, 9, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(x + 8, y + 6, 3, 0, TAU); c.fill(); }
    c.fillStyle = '#b93a4c'; c.fillRect(0, 100, 128, 4);
  }, [1, 1]));
  for (const s of [-1, 1]) {
    const x = s * 1.55;
    car.add(tiled(0.1, wy0 - bodyBot, 3, pink, 1.6, 1.6, x, (wy0 + bodyBot) / 2, (WZ0 + WZ1) / 2));
    car.add(tiled(0.1, bodyTop - wy1, 3, pink, 1.6, 1.6, x, (bodyTop + wy1) / 2, (WZ0 + WZ1) / 2));
    car.add(tiled(0.1, wy1 - wy0, 1.1, pink, 1.6, 1.6, x, (wy0 + wy1) / 2, -1.05));
    car.add(tiled(0.1, wy1 - wy0, 0.4, pink, 1.6, 1.6, x, (wy0 + wy1) / 2, -3.3));
    // wallpaper on the inside, around the window opening
    for (const [h, y, l, z] of [[wy0 - bodyBot, (wy0 + bodyBot) / 2, 3, -2.0], [bodyTop - wy1, (bodyTop + wy1) / 2, 3, -2.0], [wy1 - wy0, (wy0 + wy1) / 2, 1.1, -1.05], [wy1 - wy0, (wy0 + wy1) / 2, 0.4, -3.3]]) {
      const lining = mesh(new THREE.PlaneGeometry(l, h), wallpaper, x - s * 0.06, y, z);
      lining.rotation.y = -s * Math.PI / 2; car.add(lining);
    }
    // window frames and a red pelmet
    car.add(box(0.14, 0.08, 1.6, cream, x, wy1 + 0.04, -2.35), box(0.14, 0.1, 1.6, cream, x, wy0 - 0.05, -2.35));
    car.add(box(0.12, 0.26, 1.5, toon(PAL.red), x - s * 0.08, wy1 - 0.13, -2.35));
  }
  car.add(tiled(3.2, wy0 - bodyBot, 0.1, pink, 1.6, 1.6, 0, (wy0 + bodyBot) / 2, WZ0));
  car.add(tiled(3.2, bodyTop - wy1, 0.1, pink, 1.6, 1.6, 0, (bodyTop + wy1) / 2, WZ0));
  for (const s of [-1, 1]) car.add(tiled(0.4, wy1 - wy0, 0.1, pink, 1.6, 1.6, s * 1.4, (wy0 + wy1) / 2, WZ0));
  car.add(box(2.5, 0.1, 0.16, cream, 0, wy0 - 0.05, WZ0), box(2.5, 0.08, 0.16, cream, 0, wy1 + 0.04, WZ0), box(0.08, wy1 - wy0, 0.14, cream, 0, (wy0 + wy1) / 2, WZ0));
  const back = mesh(new THREE.PlaneGeometry(3.1, bodyTop - bodyBot), wallpaper, 0, (bodyTop + bodyBot) / 2, WZ1 + 0.06); car.add(back);
  car.add(mesh(new THREE.PlaneGeometry(3.1, 3), cream, 0, bodyTop - 0.02, (WZ0 + WZ1) / 2).rotateX(Math.PI / 2));
  car.add(tiled(3.1, 0.1, 3, texMat(planks(0x8a5a3e, 53)), 1, 2, 0, bodyBot + 0.05, (WZ0 + WZ1) / 2));
  // inside: a red velvet bench against the back wall, a table with a lamp and a Mendl's box, a luggage rack
  const velvet = toon(0xa8283a);
  car.add(box(2.8, 0.42, 0.7, velvet, 0, bodyBot + 0.4, WZ1 + 0.45), box(2.8, 0.9, 0.18, velvet, 0, bodyBot + 0.95, WZ1 + 0.14));
  for (const x of [-0.9, 0, 0.9]) car.add(box(0.04, 0.8, 0.04, toon(0x7a1a28), x, bodyBot + 0.95, WZ1 + 0.24));
  car.add(cyl(0.45, 0.45, 0.05, toon(0x6a4028), 0, bodyBot + 0.85, WZ1 + 1.4, 16), cyl(0.05, 0.08, 0.8, brass, 0, bodyBot + 0.45, WZ1 + 1.4, 8));
  car.add(cyl(0.03, 0.03, 0.3, brass, -0.2, bodyBot + 1.02, WZ1 + 1.4, 6), cone(0.16, 0.16, toon(0xf2a8bc), -0.2, bodyBot + 1.22, WZ1 + 1.4, 12));
  car.add(sphere(0.07, glow(0xfff0c8, 1.2), -0.2, bodyBot + 1.12, WZ1 + 1.4, 8, 6));
  const mb = makeMendlsBox(0.8); mb.position.set(0.18, bodyBot + 0.88, WZ1 + 1.35); mb.rotation.y = 0.4; car.add(mb);
  car.add(box(2.6, 0.04, 0.34, brass, 0, bodyTop - 0.45, WZ1 + 0.3));
  car.add(box(0.8, 0.34, 0.3, texMat(whitmanLuggage(61)), -0.6, bodyTop - 0.26, WZ1 + 0.3));
  const cabinLight = new THREE.PointLight(0xffd8a8, 3, 5, 1.6);
  cabinLight.position.set(0, bodyTop - 0.5, -2); car.add(cabinLight);
  // glass: a faint tint so the window openings read as glazed
  const glass = new THREE.MeshLambertMaterial({ color: 0xdfeef4, transparent: true, opacity: 0.18, depthWrite: false });
  car.add(box(2.4, wy1 - wy0, 0.02, glass, 0, (wy0 + wy1) / 2, WZ0 + 0.06));
  for (const s of [-1, 1]) car.add(box(0.02, wy1 - wy0, 1.5, glass, s * 1.6, (wy0 + wy1) / 2, -2.35));
  // belt line and brass strips all round the outside
  car.add(box(3.3, 0.5, 9.1, cream, 0, 1.3, -8.0), box(3.32, 0.06, 9.12, brass, 0, 1.58, -8.0), box(3.32, 0.06, 9.12, brass, 0, 1.02, -8.0));
  for (const s of [-1, 1]) car.add(box(0.05, 0.5, 3, cream, s * 1.625, 1.3, -2.0), box(0.06, 0.06, 3, brass, s * 1.63, 1.58, -2.0), box(0.06, 0.06, 3, brass, s * 1.63, 1.02, -2.0));
  car.add(box(3.3, 0.5, 0.05, cream, 0, 1.3, WZ0 + 0.05), box(3.32, 0.06, 0.06, brass, 0, 1.58, WZ0 + 0.06), box(3.32, 0.06, 0.06, brass, 0, 1.02, WZ0 + 0.06));
  // the rounded roof with ribs and a walkway
  const roofGeo = repeatUV(new THREE.CylinderGeometry(1.7, 1.7, 12.2, 16, 1, false, 0, Math.PI), 1, 12.2 / 1.6);
  const roofM = mesh(roofGeo, texMat(ribs), 0, 3.25, -6.5);
  roofM.rotation.z = Math.PI / 2; roofM.rotation.y = Math.PI / 2; roofM.scale.x = 0.55;
  car.add(roofM);
  car.add(box(1.2, 0.2, 11, cream, 0, 4.1, -6.5));
  // side windows further back: framed, lit from inside, with little red pelmets
  const winMat = new THREE.MeshLambertMaterial({ color: 0xf6efe2, emissive: 0xffe8c8, emissiveIntensity: 0.3 });
  for (const s of [-1, 1]) for (let i = 1; i < 5; i++) {
    car.add(box(0.06, 1.24, 1.54, cream, s * 1.605, 2.25, -2.5 - i * 2.1));
    car.add(box(0.06, 1.1, 1.4, winMat, s * 1.625, 2.25, -2.5 - i * 2.1));
    car.add(box(0.06, 0.32, 1.4, toon(PAL.red), s * 1.63, 2.72, -2.5 - i * 2.1));
  }
  const tex = textTexture('ZUBROWKA EXPRESS', { font: 'bold 54px Georgia, serif', color: '#7a2a36', w: 1024, h: 96 });
  for (const s of [-1, 1]) { const n = mesh(new THREE.PlaneGeometry(6, 0.56), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), s * 1.64, 0.76, -6.5); n.rotation.y = s * Math.PI / 2; car.add(n); }
  // the Society of the Crossed Keys crest on the car's front: two crossed golden keys on a cream roundel
  const crest = new THREE.Group();
  crest.add(cyl(0.36, 0.36, 0.05, cream, 0, 0, 0, 18).rotateX(Math.PI / 2));
  crest.add(mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 24), brass, 0, 0, 0.02));
  for (const s of [-1, 1]) {
    const key = new THREE.Group();
    key.add(box(0.05, 0.46, 0.03, brass, 0, 0, 0), mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), brass, 0, 0.27, 0), box(0.1, 0.035, 0.03, brass, 0.05, -0.2, 0), box(0.07, 0.035, 0.03, brass, 0.035, -0.13, 0));
    key.rotation.z = s * 0.62; key.position.z = 0.04; crest.add(key);
  }
  crest.position.set(0, 3.45, WZ0 + 0.02);
  car.add(crest);
  for (const s of [-1, 1]) for (const z of [-2.5, -10.5]) car.add(box(0.5, 0.9, 2.6, dark, s * 1.3, 0.45, z));
  g.add(car);
  // the open front deck
  const deck = new THREE.Group();
  deck.add(box(3.2, 0.3, 4.4, toon(0x8a5a48), 0, 0.45, 1.8));
  deck.add(tiled(3.4, 0.08, 4.6, texMat(planks(0xb08a62, 55)), 0.85, 2, 0, 0.62, 1.8));
  deck.add(box(1.3, 0.02, 4.4, toon(PAL.red), 0, 0.67, 1.8));
  for (const s of [-1, 1]) deck.add(box(0.1, 0.02, 4.4, toon(PAL.brass), s * 0.68, 0.675, 1.8));
  const post = (x: number, z: number) => deck.add(cyl(0.035, 0.035, 1.05, brass, x, 1.15, z));
  for (const x of [-1.5, 1.5]) { post(x, 0.2); post(x, 2.0); post(x, 3.9); }
  post(-0.9, 3.95); post(0.9, 3.95);
  for (const x of [-1.5, 1.5]) { const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.8, 6), brass, x, 1.68, 2.05); r.rotation.x = Math.PI / 2; deck.add(r); }
  { const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 6), brass, 0, 1.68, 3.95); r.rotation.z = Math.PI / 2; deck.add(r); }
  const lampMats: THREE.MeshBasicMaterial[] = [];
  for (const s of [-1, 1]) {
    const lamp = new THREE.Group();
    const lm = glow(0xfff0c8, 1.05); lampMats.push(lm);
    // tall corner pole with a hanging glass lantern above the eyeline (symmetrical pair)
    lamp.add(cyl(0.03, 0.035, 2.6, brass, 0, 1.9, 0), cyl(0.02, 0.02, 0.5, brass, -s * 0.25, 3.15, 0).rotateZ(Math.PI / 2), cyl(0.012, 0.012, 0.2, brass, -s * 0.5, 3.03, 0));
    const lx = -s * 0.5, ly = 2.8;
    lamp.add(box(0.12, 0.17, 0.12, lm, lx, ly, 0));
    lamp.add(box(0.126, 0.012, 0.126, dark, lx, ly, 0), box(0.012, 0.176, 0.126, dark, lx, ly, 0), box(0.126, 0.176, 0.012, dark, lx, ly, 0));
    lamp.add(box(0.18, 0.025, 0.18, brass, lx, ly - 0.1, 0), box(0.18, 0.025, 0.18, brass, lx, ly + 0.1, 0), cone(0.13, 0.09, brass, lx, ly + 0.155, 0, 4).rotateY(Math.PI / 4));
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lamp.add(box(0.014, 0.2, 0.014, dark, lx + cx * 0.075, ly, cz * 0.075));
    lamp.position.set(s * 1.5, 0, 3.9);
    deck.add(lamp);
  }
  const light = new THREE.PointLight(0xffd9a8, 1.6, 10, 1.6);
  light.position.set(0, 1.9, 3.6);
  deck.add(light);
  g.add(deck);
  g.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && !(m.material as THREE.Material).transparent) c.castShadow = true; });
  mergeStatic(g);
  return { group: g, light, lampMats, cabinLight };
}

// ---------- region 1: the alps ----------
export function buildAlpine(heightAt: HeightFn, trackPoint: TrackPointFn, clear: ExclusionMask) {
  const g = new THREE.Group();
  const white = toon(PAL.white), cream = toon(PAL.cream), burgundy = toon(PAL.burgundy), red = toon(PAL.red), brass = toon(PAL.brass), dark = toon(PAL.dark);

  // ----- the hotel's lower station beside the track: the funicular pavilion with the red steps -----
  const pavBase = heightAt(SPOTS.pavilion.x, SPOTS.pavilion.z);
  const pav = new THREE.Group();
  const painting = new THREE.Group();
  {
    pav.position.set(SPOTS.pavilion.x, pavBase, SPOTS.pavilion.z);
    pav.rotation.y = Math.PI / 2; // front faces +x, the track
    const stone = texMat(paving(0xe9dccb, 21));
    pav.add(tiled(9, 0.9, 7, stone, 2, 2, 0, 0.45, 0));
    pav.add(tiled(4.4, 0.6, 0.9, stone, 2, 2, 0, 0.3, 3.95));
    pav.add(tiled(4.4, 0.3, 0.9, stone, 2, 2, 0, 0.15, 4.85));
    pav.add(box(1.6, 0.03, 7, red, 0, 0.92, 0));
    pav.add(box(1.6, 0.03, 0.9, red, 0, 0.62, 3.95), box(1.6, 0.03, 0.9, red, 0, 0.32, 4.85));
    const f = facadeTile({ wall: 0xf6efe2, frame: 0xf2b8c6, cornice: 0xf2b8c6, bays: 3, storeys: 1, lit: 0.7, seed: 23 });
    const house = tiled(6.6, 4.2, 4.2, texMat(f.map, { emissive: 0xffdcb0, emissiveMap: f.emissive, emissiveIntensity: 0.5 }), 6.6, 4.2, 0, 0.9 + 2.1, -1.2);
    pav.add(house);
    for (const s of [-1, 1]) pav.add(box(0.5, 4.2, 0.5, toon(PAL.pink), s * 3.05, 3.0, 1.0));
    pav.add(box(7.2, 0.4, 4.8, white, 0, 5.2, -1.2));
    const r = scaleRoof(7.2, 5.0, 1.8, texMat(fishScales(PAL.burgundy, 25)), 0.7); r.position.set(0, 5.4, -1.2); pav.add(r);
    pav.add(box(1.8, 2.6, 0.1, glow(0xfff0d8, 0.85), 0, 2.2, 0.95));
    const sign = signBoard('GRAND BUDAPEST', 4.4, 0.8, { color: '#fbf7f2', bg: '#7a2a36', texW: 512, texH: 90, frame: PAL.brass, sub: 'funicular' });
    sign.position.set(0, 4.3, 1.05); pav.add(sign);
    for (const s of [-1, 1]) pav.add(cyl(0.05, 0.05, 2.4, brass, s * 1.4, 2.1, 1.3, 6), sphere(0.18, glow(0xfff0c8, 1.1), s * 1.4, 3.35, 1.3, 8, 6));
    for (const s of [-1, 1]) { const t = topiary('ball'); t.position.set(s * 4.0, 0.9, 0.3); pav.add(t); }
    g.add(pav);
    // "Boy with Apple" on its easel beside the steps
    painting.add(boyWithAppleEasel());
    painting.position.set(SPOTS.pavilion.x + 4.9, heightAt(SPOTS.pavilion.x + 4.9, SPOTS.pavilion.z + 3.4), SPOTS.pavilion.z + 3.4);
    painting.rotation.y = Math.PI / 2 + 0.45;
    g.add(painting);
  }
  finish(pav);
  const gustaveSpot = new THREE.Vector3(SPOTS.pavilion.x + 2.4, pavBase + 0.9, SPOTS.pavilion.z);
  const funicularBottom = new THREE.Vector3(SPOTS.pavilion.x - 5.5, pavBase + 0.95, SPOTS.pavilion.z - 5);
  const funicularTop = new THREE.Vector3(-49, SPOTS.hotel.y + 0.6, -326);
  clear.rect(SPOTS.pavilion.x, SPOTS.pavilion.z, 10, 12, 0, 1);

  // ----- Nebelsbad station at the start, with a Mendl's kiosk on the right platform and luggage on the left -----
  const station = buildStation('NEBELSBAD', 'Republic of Zubrowka', SPOTS.station.z, heightAt, trackPoint, { wall: 0xf6efe2, trim: PAL.burgundy, roof: PAL.burgundy, len: 34, houseSide: -1, seed: 31 });
  g.add(station.group);
  {
    const k = new THREE.Group();
    k.add(tiled(5.0, 1.0, 3.6, texMat(stucco(0xe9dccb, 5)), 3, 3, 0, -0.5, 0));
    k.add(tiled(4.2, 3.0, 3.0, texMat(stucco(PAL.pink, 6)), 3, 3, 0, 1.5, 0));
    k.add(box(4.5, 0.3, 3.3, white, 0, 3.1, 0));
    k.add(box(3.0, 1.4, 0.1, glow(0xfff4e6, 0.9), 0, 1.6, 1.52));
    k.add(box(3.2, 0.5, 0.1, white, 0, 0.6, 1.52));
    const aw = mesh(new THREE.PlaneGeometry(4.4, 1.3), new THREE.MeshLambertMaterial({ map: stripes(PAL.deepPink, PAL.white, 4, true), side: THREE.DoubleSide, alphaTest: 0.5 }), 0, 2.7, 2.0);
    aw.rotation.x = -0.75; k.add(aw);
    const sign = signBoard("MENDL'S", 3.4, 0.8, { color: '#c8323c', bg: '#fbf7f2', border: '#e58fa6', font: 'italic bold 60px Georgia, serif', texW: 512, texH: 110, frame: PAL.deepPink });
    sign.position.set(0, 3.7, 0.2); k.add(sign);
    // a pyramid of boxes in the window, and two Courtesans au chocolat on the counter
    for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) { const b = makeMendlsBox(0.9); b.position.set(-0.7 + (j - i / 2) * 0.34, 0.95 + (2 - i) * 0.24, 1.3); k.add(b); }
    for (const x of [0.55, 1.05]) { const c = courtesan(0.8); c.position.set(x, 0.86, 1.3); k.add(c); }
    const kx = 9.5, kz = SPOTS.station.z - 8;
    k.position.set(kx, station.platY - 0.02, kz);
    k.rotation.y = -Math.PI / 2;
    g.add(finish(k));
  }
  // the Whitman brothers' luggage (The Darjeeling Limited): eleven pieces stacked on a trolley
  const luggage = whitmanLuggageTrolley();
  luggage.position.set(-6.3, station.platY, SPOTS.station.z + 7);
  luggage.rotation.y = 0.25;
  g.add(luggage);
  const agathaSpot = new THREE.Vector3(6.2, station.platY + 0.08, SPOTS.station.z + 2);
  const vanSpots = [{ x: -14.5, z: -46, rot: Math.PI / 2 }, { x: 14.5, z: -46, rot: -Math.PI / 2 }];

  // ----- a little onion-domed church on the opposite cliff, so both sides have a silhouette -----
  {
    const c = new THREE.Group();
    const f = facadeTile({ wall: 0xf6efe2, frame: 0xe8dcc8, arch: true, bays: 2, storeys: 1, lit: 0.5, seed: 41 });
    const wallM = texMat(f.map, { emissive: 0xffdcb0, emissiveMap: f.emissive, emissiveIntensity: 0.4 });
    c.add(tiled(9, 9, 14, wallM, 4.5, 9, 0, 4.5, 0));
    c.add(mesh(roofGeometry(9, 14, 4, 0.5), burgundy, 0, 9, 0));
    c.add(tiled(4.2, 16, 4.2, wallM, 4.2, 5.3, 0, 8, 6));
    c.add(box(4.6, 0.4, 4.6, white, 0, 16.1, 6));
    const dome = sphere(2.7, texMat(fishScales(0x8fbfae, 43)), 0, 18.4, 6, 16, 12); dome.scale.y = 1.25; c.add(dome);
    c.add(cone(1.1, 3.2, toon(0x8fbfae), 0, 22.6, 6, 12));
    c.add(box(0.12, 1.6, 0.12, brass, 0, 24.8, 6), box(0.8, 0.12, 0.12, brass, 0, 25.1, 6));
    c.add(box(1.4, 2.4, 0.1, glow(0xfff0d8, 0.7), 0, 1.3, 8.15));
    c.position.set(SPOTS.church.x, heightAt(SPOTS.church.x, SPOTS.church.z) - 1.2, SPOTS.church.z);
    c.rotation.y = -Math.PI / 2;
    g.add(finish(c));
    clear.circle(SPOTS.church.x, SPOTS.church.z, 12);
  }

  // ----- Gabelmeister's Peak: the summit observatory, and the cable car up to it from beside the line -----
  const peakY = heightAt(SPOTS.peak.x, SPOTS.peak.z);
  const baseY = heightAt(SPOTS.cableBase.x, SPOTS.cableBase.z);
  const cableBottom = new THREE.Vector3(SPOTS.cableBase.x + 1.5, baseY + 6.4, SPOTS.cableBase.z - 1.0);
  const cableTop = new THREE.Vector3(SPOTS.peak.x - 9, peakY + 7.0, SPOTS.peak.z + 4);
  {
    const obs = new THREE.Group();
    const f = facadeTile({ wall: 0xe8e4de, frame: 0xfbf8f4, glass: 'night', cornice: 0xfbf8f4, bays: 3, storeys: 1, lit: 0.5, seed: 47 });
    const wallM = texMat(f.map, { emissive: 0xffdcb0, emissiveMap: f.emissive, emissiveIntensity: 0.6 });
    const rockM = texMat(stucco(0xb4a8b8, 49));
    obs.add(tiled(16, 5, 12, rockM, 3, 3, 0, -2.4, 0));
    obs.add(tiled(10.8, 5.4, 8, wallM, 10.8, 5.4, 0, 2.7, 0));
    obs.add(box(11.4, 0.4, 8.6, white, 0, 5.6, 0));
    obs.add(tiled(5.4, 3.2, 5.4, wallM, 5.4, 3.2, 2, 7.4, 0));
    obs.add(cyl(3.1, 3.1, 1.6, cream, -2, 6.6, 0, 20));
    const dome = mesh(new THREE.SphereGeometry(3.3, 22, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.55, roughness: 0.35 }), -2, 7.4, 0);
    obs.add(dome);
    const slit = box(0.7, 3.4, 0.5, dark, -2, 9.2, 2.6); slit.rotation.x = -0.6; obs.add(slit);
    // a railed terrace all round
    for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; obs.add(cyl(0.05, 0.05, 1.0, dark, Math.cos(a) * 7.4, 0.5, Math.sin(a) * 5.6, 4)); }
    obs.add(mesh(new THREE.TorusGeometry(1, 0.04, 4, 48).scale(7.4, 5.6, 1).rotateX(Math.PI / 2), dark, 0, 1.0, 0));
    // the upper cable-car station, a concrete shed open towards the valley
    obs.add(tiled(4.6, 4.2, 5.2, texMat(stucco(0xd8d4cc, 51)), 3, 3, -7.2, 2.1, 3.2));
    obs.add(box(5.2, 0.4, 5.8, white, -7.2, 4.4, 3.2));
    const s = signBoard("GABELMEISTER'S PEAK", 5, 0.8, { color: '#2f4a5e', bg: '#fbf7f2', border: '#2f4a5e', texW: 512, texH: 82, frame: PAL.powder });
    s.position.set(-7.2, 5.2, 6.0); obs.add(s);
    obs.add(cyl(0.05, 0.05, 3.5, dark, 3.5, 10.4, 0, 5), mesh(new THREE.PlaneGeometry(1.4, 0.9), toon(PAL.red, { side: THREE.DoubleSide }), 4.2, 11.6, 0));
    obs.position.set(SPOTS.peak.x, peakY, SPOTS.peak.z);
    obs.rotation.y = Math.atan2(cableBottom.x - SPOTS.peak.x, cableBottom.z - SPOTS.peak.z) + Math.PI / 2 - 0.4;
    g.add(finish(obs));
    // valley station beside the line
    const vs = new THREE.Group();
    const vf = facadeTile({ wall: 0xa8d8c8, frame: 0xfbf8f4, cornice: 0xfbf8f4, bays: 2, storeys: 1, lit: 0.5, seed: 53 });
    vs.add(tiled(6.4, 4.6, 5, texMat(vf.map, { emissive: 0xffdcb0, emissiveMap: vf.emissive, emissiveIntensity: 0.5 }), 6.4, 4.6, 0, 2.3, 0));
    vs.add(box(7.2, 0.4, 5.8, white, 0, 4.8, 0));
    const vr = scaleRoof(7.2, 5.8, 2.2, texMat(fishScales(0x4f8a7a, 55)), 0.6); vr.position.y = 5.0; vs.add(vr);
    vs.add(tiled(4, 1.6, 3, texMat(stucco(0xd8d4cc, 57)), 3, 3, 0.5, 5.6, -2.8));
    const vsign = signBoard('LUFTSEILBAHN', 4, 0.7, { color: '#fbf7f2', bg: '#2f6f8a', texW: 512, texH: 90, sub: "to Gabelmeister's Peak", frame: PAL.white });
    vsign.position.set(0, 3.9, 2.56); vs.add(vsign);
    vs.add(box(1.4, 2.4, 0.1, glow(0xfff0d8, 0.8), 0, 1.2, 2.55));
    vs.position.set(SPOTS.cableBase.x, baseY, SPOTS.cableBase.z);
    vs.rotation.y = -Math.PI / 2;
    g.add(finish(vs));
    clear.circle(SPOTS.cableBase.x, SPOTS.cableBase.z, 8);
    // two lattice pylons where the rope passes nearest the ground, and the rope itself
    const steel = toon(0x6a6f78);
    const line = new THREE.Group();
    for (const t of [0.34, 0.68]) {
      const p = cableBottom.clone().lerp(cableTop, t);
      const gy = heightAt(p.x, p.z) - 0.5, top = p.y + 0.6;
      const pyl = new THREE.Group();
      const h = top - gy;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pyl.add(rod(new THREE.Vector3(sx * 1.6, 0, sz * 1.6), new THREE.Vector3(sx * 0.5, h, sz * 0.5), 0.1, steel));
      for (let k = 1; k < 6; k++) { const y = (k / 6) * h, w = 1.6 - (1.1 * k) / 6; for (const s of [-1, 1]) { pyl.add(rod(new THREE.Vector3(-w, y, s * w), new THREE.Vector3(w, y, s * w), 0.05, steel)); pyl.add(rod(new THREE.Vector3(s * w, y, -w), new THREE.Vector3(s * w, y, w), 0.05, steel)); } }
      pyl.add(box(0.4, 0.4, 3.2, steel, 0, h, 0));
      pyl.position.set(p.x, gy, p.z);
      pyl.rotation.y = Math.atan2(cableTop.x - cableBottom.x, cableTop.z - cableBottom.z) + Math.PI / 2;
      line.add(pyl);
    }
    const side = new THREE.Vector3(cableTop.z - cableBottom.z, 0, -(cableTop.x - cableBottom.x)).normalize().multiplyScalar(0.7);
    for (const s of [-1, 1]) line.add(rod(cableBottom.clone().addScaledVector(side, s), cableTop.clone().addScaledVector(side, s), 0.035, dark, 4));
    g.add(finish(line));
  }

  // ----- white iron lamps in pairs the whole way through the alps -----
  g.add(lampPosts(pairs(heightAt, 6.4, -34, -580, 36, (x, z) => !(x < 0 && Math.abs(z - SPOTS.pavilion.z) < 10)), { height: 4.2, color: PAL.white, lamp: 0xfff0c8, head: 'globe' }));
  // snow-topped fence posts along both sides beyond the lamps
  {
    const pl = pairs(heightAt, 9.5, -60, -580, 3.2, (x, z) => !(x < 0 && Math.abs(z - SPOTS.pavilion.z) < 8) && !(x > 0 && Math.abs(z - SPOTS.cableBase.z) < 8) && Math.abs(z - SPOTS.station.z) > 20);
    const post = new THREE.BoxGeometry(0.16, 1.1, 0.16); post.translate(0, 0.55, 0);
    const rail = new THREE.BoxGeometry(0.08, 0.08, 3.2); rail.translate(0, 0.85, 1.6);
    const cap = new THREE.BoxGeometry(0.24, 0.1, 0.24); cap.translate(0, 1.1, 0);
    const snowRail = new THREE.BoxGeometry(0.12, 0.05, 3.2); snowRail.translate(0, 0.915, 1.6);
    g.add(chunkedParts([post, rail], toon(0x8a7a6a), pl));
    g.add(chunkedParts([cap, snowRail], toon(PAL.white), pl));
  }
  return { group: g, pavilion: pav, painting, gustaveSpot, funicularBottom, funicularTop, agathaSpot, vanSpots, station, luggage, cableBottom, cableTop };
}

// ---------- region 2: the autumn forest ----------
export function buildForest(heightAt: HeightFn, clear: ExclusionMask) {
  const g = new THREE.Group();
  const rng = new Rng(3201);
  const dark = toon(PAL.dark), brass = toon(PAL.brass);

  // ----- the tree with a door at its base (Mr. Fox's) -----
  const foxTree = new THREE.Group();
  {
    const barkM = texMat(bark(0x9a6a4e, 61));
    const trunk = mesh(repeatUV(new THREE.CylinderGeometry(2.0, 3.0, 10, 16), 4, 2), barkM, 0, 5, 0); foxTree.add(trunk);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; const r = mesh(repeatUV(new THREE.CylinderGeometry(0.6, 1.4, 4, 8), 1, 1), barkM, Math.cos(a) * 2.6, 1.2, Math.sin(a) * 2.6); r.rotation.z = Math.cos(a) * 0.7; r.rotation.x = -Math.sin(a) * 0.7; foxTree.add(r); }
    // big limbs up into the crown
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.7; foxTree.add(rod(new THREE.Vector3(0, 8.5, 0), new THREE.Vector3(Math.cos(a) * 4.5, 12.5, Math.sin(a) * 4.5), 0.5, barkM, 7)); }
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const R = (r: number) => V(r, r * 0.8, r);
    const crowns: Array<[THREE.ColorRepresentation, Array<{ c: THREE.Vector3; r: THREE.Vector3 }>]> = [
      [0xe0812e, [{ c: V(0, 14, 0), r: R(7.5) }, { c: V(2, 12, -6), r: R(4.8) }]],
      [0xf2b53a, [{ c: V(6, 12, 2), r: R(5.2) }, { c: V(-4, 17.2, 3), r: R(4.2) }, { c: V(-2, 11.5, 6), r: R(4.6) }]],
      [0xc9552f, [{ c: V(-6, 12.5, -1), r: R(5.2) }, { c: V(4, 17, -3), r: R(4.2) }]],
    ];
    for (const [col, blobs] of crowns) foxTree.add(fluffyTree(blobs, col, rng, { density: 0.9 }));
    const door = new THREE.Group();
    const doorMat = texMat(planks(0xa8402e, 63));
    door.add(tiled(1.5, 2.3, 0.2, doorMat, 0.5, 1.2, 0, 1.15, 0));
    door.add(mesh(repeatUV(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 16), 1, 0.2), doorMat, 0, 2.3, 0).rotateX(Math.PI / 2));
    door.add(sphere(0.07, brass, 0.5, 1.1, 0.12, 6, 5));
    door.add(cyl(0.5, 0.5, 0.16, glow(0xfff0c0, 0.9), 0, 3.9, 0, 12).rotateX(Math.PI / 2));
    door.add(mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16), toon(0x8a3a2a), 0, 3.9, 0.1));
    door.add(box(0.06, 1.0, 0.06, toon(0x8a3a2a), 0, 3.9, 0.12), box(1.0, 0.06, 0.06, toon(0x8a3a2a), 0, 3.9, 0.12));
    door.position.set(0, 0, 2.95);
    foxTree.add(door);
    foxTree.add(tiled(2.2, 0.2, 1.0, texMat(stucco(0xb9a890, 65)), 3, 3, 0, 0.1, 3.6));
    const mb = new THREE.Group();
    mb.add(cyl(0.05, 0.05, 1.1, dark, 0, 0.55, 0, 6), box(0.5, 0.3, 0.32, toon(PAL.red), 0, 1.2, 0));
    const s = signBoard('FOX', 0.6, 0.24, { color: '#fbf7f2', bg: '#b93a4c', texW: 128, texH: 48, frame: PAL.red }); s.position.set(0, 1.55, 0); mb.add(s);
    mb.position.set(2.4, 0, 3.6); foxTree.add(mb);
    foxTree.position.set(SPOTS.foxTree.x, heightAt(SPOTS.foxTree.x, SPOTS.foxTree.z) - 0.3, SPOTS.foxTree.z);
    foxTree.rotation.y = -Math.PI / 2;
    g.add(finish(foxTree));
    clear.circle(SPOTS.foxTree.x, SPOTS.foxTree.z, 5);
  }
  const foxSpot = new THREE.Vector3(9.4, heightAt(9.4, -768), -768);
  const kylieSpot = new THREE.Vector3(11.3, heightAt(11.3, -772.5), -772.5);

  // ----- Boggis, Bunce and Bean: a fingerpost pointing off to their three farms -----
  {
    const fp = new THREE.Group();
    const wood = toon(0x8a6a4a);
    fp.add(cyl(0.09, 0.11, 3.6, wood, 0, 1.8, 0, 6), cone(0.14, 0.24, wood, 0, 3.72, 0, 6));
    const arm = (text: string, sub: string, y: number, col: string, bg: string) => {
      const b = signBoard(text, 2.1, 0.5, { color: col, bg, texW: 512, texH: 122, sub, frame: 0x6a4a32 });
      b.position.set(1.0, y, 0.12); fp.add(b);
      fp.add(cone(0.34, 0.3, toon(0x6a4a32), 2.2, y, 0.08, 3).rotateZ(-Math.PI / 2));
    };
    arm('BOGGIS', 'chickens', 3.2, '#fbf7f2', '#b93a4c');
    arm('BUNCE', 'ducks & geese', 2.6, '#2a2c30', '#e8c04a');
    arm('BEAN', 'turkeys & cider', 2.0, '#fbf7f2', '#4f6a4a');
    fp.position.set(SPOTS.bbb.x, heightAt(SPOTS.bbb.x, SPOTS.bbb.z), SPOTS.bbb.z);
    fp.rotation.y = -Math.PI / 2 + 0.3;
    g.add(finish(fp));
    clear.circle(SPOTS.bbb.x, SPOTS.bbb.z, 2.5);
  }

  // ----- the Moonrise Kingdom camp on the lake shore -----
  const camp = new THREE.Group();
  {
    camp.position.set(SPOTS.camp.x, heightAt(SPOTS.camp.x, SPOTS.camp.z), SPOTS.camp.z);
    camp.rotation.y = Math.PI / 2; // the tent opening faces +x, the track
    const tent = mesh(roofGeometry(3.2, 3.6, 2.2, 0.05), toon(PAL.mustard, { side: THREE.DoubleSide }), 0, 0, 0);
    camp.add(tent);
    camp.add(mesh(new THREE.PlaneGeometry(1.2, 1.6), toon(0xc9a030, { side: THREE.DoubleSide }), 0.7, 0.8, 1.9).rotateY(0.5));
    camp.add(cyl(0.03, 0.03, 2.2, dark, 0, 1.1, 1.86, 5), cyl(0.03, 0.03, 2.2, dark, 0, 1.1, -1.86, 5));
    // guy ropes to little pegs
    for (const [x, z] of [[2.4, 2.3], [-2.4, 2.3], [2.4, -2.3], [-2.4, -2.3]]) camp.add(rod(new THREE.Vector3(0, 2.1, Math.sign(z) * 1.86), new THREE.Vector3(x, 0.05, z), 0.012, toon(0xe8dcc0), 3));
    // Suzy's portable record player on a crate, with a tiny horn
    camp.add(tiled(0.8, 0.6, 0.8, texMat(planks(0x8a6a4a, 67)), 0.5, 0.6, 2.3, 0.3, 1.0));
    camp.add(box(0.7, 0.14, 0.7, toon(PAL.powder), 2.3, 0.67, 1.0));
    camp.add(cyl(0.26, 0.26, 0.02, dark, 2.3, 0.75, 1.0, 16), cyl(0.06, 0.06, 0.021, toon(PAL.red), 2.3, 0.755, 1.0, 10));
    camp.add(cyl(0.02, 0.02, 0.4, brass, 2.55, 0.85, 0.8, 5).rotateZ(0.6));
    camp.add(cone(0.16, 0.3, brass, 2.6, 1.0, 1.2, 10).rotateX(-1.1));
    // suitcases and a stack of library books
    camp.add(box(0.9, 0.28, 0.5, toon(0x4f8a8a), -2.3, 0.14, 1.0), box(0.8, 0.26, 0.45, toon(PAL.red), -2.3, 0.41, 1.0));
    for (let i = 0; i < 6; i++) camp.add(box(0.36, 0.06, 0.28, toon([0xc94b3f, 0x4f8a8a, 0xe8c04a, 0x7a2a36, 0x5a7ab8, 0xe8a0b0][i]), -1.4, 0.03 + i * 0.065, 1.4 + (i % 2) * 0.03));
    // campfire ring with logs and an ember
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; camp.add(sphere(0.18, toon(0x8f8a80), Math.cos(a) * 0.7, 0.1, 3.6 + Math.sin(a) * 0.7, 6, 5)); }
    camp.add(cyl(0.06, 0.06, 0.9, toon(0x5a3a2a), 0, 0.12, 3.6, 5).rotateZ(Math.PI / 2), cyl(0.06, 0.06, 0.9, toon(0x5a3a2a), 0, 0.12, 3.6, 5).rotateX(Math.PI / 2));
    camp.add(sphere(0.16, glow(0xffa050, 1.4), 0, 0.22, 3.6, 8, 6));
    // canoe pulled up on the lake side
    const canoe = sphere(1, toon(0xc9552f), 0, 0.25, -4.2, 14, 8); canoe.scale.set(0.5, 0.3, 2.0); camp.add(canoe);
    camp.add(cyl(0.03, 0.03, 1.6, toon(0xd9b070), 0.4, 0.5, -4.2, 5).rotateX(Math.PI / 2));
    g.add(finish(camp));
    clear.circle(SPOTS.camp.x, SPOTS.camp.z, 5);
  }
  const samSuzySpot = new THREE.Vector3(-13.5, heightAt(-13.5, -906), -906);
  {
    const s = signPost('CAMP IVANHOE', 2.6, 0.7, 2.2, 0x8a6a4a, { color: '#fbf7f2', bg: '#4f6a4a', texW: 512, texH: 120, sub: 'Khaki Scouts of North America', frame: 0x8a6a4a });
    s.position.set(-8.6, heightAt(-8.6, -884), -884); s.rotation.y = Math.PI / 2; g.add(finish(s));
    // the mile marker where Sam and Suzy made camp and named the cove
    const m = signPost('MILE 3.25', 1.5, 0.52, 1.3, 0x9a8a78, { color: '#2f4a5e', bg: '#f4ecdc', texW: 512, texH: 176, sub: 'Tidal Inlet', frame: 0x9a8a78 });
    m.position.set(-19.5, heightAt(-19.5, -917), -917); m.rotation.y = Math.PI / 2 - 0.35; g.add(finish(m));
    clear.circle(-19.5, -917, 1.5);
  }

  // ----- the scouts' treehouse, sixty feet up a single tall tree -----
  const treehouse = new THREE.Group();
  const treehouseTop = new THREE.Vector3();
  {
    const H = 17;
    const barkM = texMat(bark(0x5a4436, 71));
    treehouse.add(mesh(repeatUV(new THREE.CylinderGeometry(0.45, 0.85, H, 12), 2, 5), barkM, 0, H / 2, 0));
    for (let i = 0; i < 6; i++) { const a = i * 2.4, y = 7 + i * 1.4; treehouse.add(rod(new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.cos(a) * 2.2, y + 1.4, Math.sin(a) * 2.2), 0.12, barkM, 5)); }
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    treehouse.add(fluffyTree([{ c: V(1.6, 10, 0.6), r: V(1.8, 1.4, 1.8) }, { c: V(-1.4, 12, -1), r: V(1.7, 1.3, 1.7) }, { c: V(0.4, 14, 1.8), r: V(1.5, 1.2, 1.5) }, { c: V(0, 20.2, 0), r: V(1.6, 1.3, 1.6) }], 0xd9a03a, rng, { density: 0.9 }));
    const wood = texMat(planks(0x9a7a56, 73));
    const pY = H - 1.2;
    treehouse.add(tiled(4.2, 0.25, 4.2, wood, 1, 2, 0, pY, 0));
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { treehouse.add(rod(V(x * 0.95, pY - 0.1, z * 0.95), V(x * 0.2, pY - 2.4, z * 0.2), 0.07, barkM, 5)); treehouse.add(cyl(0.05, 0.05, 1.0, toon(0x7a5a3a), x, pY + 0.6, z, 5)); }
    for (const s of [-1, 1]) { treehouse.add(box(4.2, 0.06, 0.06, toon(0x7a5a3a), 0, pY + 1.0, s * 2)); treehouse.add(box(0.06, 0.06, 4.2, toon(0x7a5a3a), s * 2, pY + 1.0, 0)); }
    treehouse.add(tiled(2.2, 1.8, 2.0, wood, 1, 2, -0.6, pY + 1.0, -0.6));
    treehouse.add(mesh(roofGeometry(2.2, 2.0, 0.9, 0.2), toon(0x4f6a4a), -0.6, pY + 1.9, -0.6));
    treehouse.add(box(0.6, 0.5, 0.05, glow(0xfff0c0, 0.7), -0.6, pY + 1.1, 0.42));
    treehouse.add(cyl(0.03, 0.03, 2.6, dark, 1.6, pY + 1.4, -1.6, 5), mesh(new THREE.PlaneGeometry(0.9, 0.55), toon(PAL.mustard, { side: THREE.DoubleSide }), 2.05, pY + 2.4, -1.6));
    // a rope ladder down to the ground
    const rope = toon(0xd8c8a0);
    for (const s of [-1, 1]) treehouse.add(rod(V(s * 0.3, pY, 2.05), V(s * 0.3, 0.1, 2.3), 0.025, rope, 4));
    for (let y = 0.6; y < pY; y += 0.55) treehouse.add(box(0.64, 0.05, 0.08, toon(0x7a5a3a), 0, y, 2.05 + (1 - y / pY) * 0.25));
    treehouse.position.set(SPOTS.treehouse.x, heightAt(SPOTS.treehouse.x, SPOTS.treehouse.z) - 0.1, SPOTS.treehouse.z);
    treehouse.rotation.y = Math.PI / 2;
    treehouseTop.set(SPOTS.treehouse.x, treehouse.position.y + pY + 1.2, SPOTS.treehouse.z);
    g.add(finish(treehouse));
    clear.circle(SPOTS.treehouse.x, SPOTS.treehouse.z, 3);
  }

  // ----- the lookout tower -----
  const tower = new THREE.Group();
  {
    const wood = toon(0x8a6a4a);
    const H = 10;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tower.add(rod(new THREE.Vector3(sx * 1.8, 0, sz * 1.8), new THREE.Vector3(sx * 1.4, H + 0.3, sz * 1.4), 0.14, wood, 6));
    for (let y = 2.5; y < H; y += 2.5) for (const s of [-1, 1]) { tower.add(box(3.1, 0.1, 0.1, wood, 0, y, s * 1.55)); tower.add(box(0.1, 0.1, 3.1, wood, s * 1.55, y, 0)); }
    for (let y = 0; y < H - 2; y += 2.5) for (const s of [-1, 1]) tower.add(rod(new THREE.Vector3(-1.6, y + 0.2, s * 1.6), new THREE.Vector3(1.5, y + 2.4, s * 1.5), 0.05, wood, 4));
    tower.add(tiled(3.9, 0.25, 3.9, texMat(planks(0xa88a6a, 75)), 1, 2, 0, H, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tower.add(cyl(0.06, 0.06, 1.0, wood, sx * 1.85, H + 0.6, sz * 1.85, 5));
    for (const s of [-1, 1]) { tower.add(box(3.7, 0.06, 0.06, wood, 0, H + 1.05, s * 1.85)); tower.add(box(0.06, 0.06, 3.7, wood, s * 1.85, H + 1.05, 0)); }
    tower.add(tiled(2.4, 2.0, 2.4, texMat(planks(PAL.cream, 77)), 1, 2, 0, H + 1.1, 0));
    tower.add(cone(2.0, 1.4, toon(PAL.red), 0, H + 2.8, 0, 4).rotateY(Math.PI / 4));
    tower.add(box(1.2, 0.9, 0.06, glow(0xfff0c0, 0.7), 0, H + 1.3, 1.22));
    tower.add(cyl(0.03, 0.03, 2.2, dark, 0, H + 4.4, 0, 5), mesh(new THREE.PlaneGeometry(0.9, 0.6), toon(PAL.mustard, { side: THREE.DoubleSide }), 0.45, H + 5.2, 0));
    for (let y = 0.8; y < H; y += 0.8) tower.add(box(0.7, 0.05, 0.05, wood, 0, y, 1.55));
    for (const s of [-1, 1]) tower.add(cyl(0.03, 0.03, H, wood, s * 0.35, H / 2, 1.55, 4));
    tower.position.set(SPOTS.tower.x, heightAt(SPOTS.tower.x, SPOTS.tower.z), SPOTS.tower.z);
    tower.rotation.y = -Math.PI / 2;
    g.add(finish(tower));
    clear.circle(SPOTS.tower.x, SPOTS.tower.z, 3.5);
  }

  // ----- wooden lantern posts in pairs, and a low split-rail fence beside the road -----
  g.add(lampPosts(pairs(heightAt, 6.4, -640, -1120, 44), { height: 3.4, color: 0x7a5a44, lamp: 0xffe6b0, head: 'lantern' }));
  {
    const pl: Placement[] = [];
    for (let z = -620; z > -1140; z -= 3.0) { const x = 12.2; if (far(x, z, SPOTS.foxTree.x, SPOTS.foxTree.z, 6) && Math.abs(z - SPOTS.foxTree.z) > 1.8 && Math.abs(z - SPOTS.tower.z) > 1.8 && Math.abs(z - SPOTS.bbb.z) > 3) pl.push({ x, y: heightAt(x, z), z, scale: 1, rot: 0 }); }
    const post = new THREE.CylinderGeometry(0.07, 0.09, 1.0, 5); post.translate(0, 0.5, 0);
    const rail = new THREE.BoxGeometry(0.07, 0.07, 3.0); rail.translate(0, 0.85, 1.5);
    const rail2 = new THREE.BoxGeometry(0.07, 0.07, 3.0); rail2.translate(0, 0.45, 1.5);
    g.add(chunkedParts([post, rail, rail2], toon(0x8a7a5a), pl));
  }
  return { group: g, foxTree, foxSpot, kylieSpot, camp, samSuzySpot, tower, treehouse, treehouseTop, scoutsPath: { x: -9.5, z0: -950, z1: -1120 } };
}

// ---------- region 3: the desert ----------
export function buildDesert(heightAt: HeightFn, clear: ExclusionMask) {
  const g = new THREE.Group();
  const rng = new Rng(3301);
  const dark = toon(PAL.dark), white = toon(PAL.white);
  // a pale road on the left with a dashed centre line
  const roadTex = canvasTexture(64, 128, (c, w, h) => {
    c.fillStyle = '#c9bcb0'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(${i % 2 ? '255,255,255' : '80,70,60'},0.06)`; c.fillRect((i * 37) % w, (i * 53) % h, 3, 2); }
    c.fillStyle = '#f2d23a'; c.fillRect(w / 2 - 2, 0, 4, h * 0.5);
    c.fillStyle = '#efe6da'; c.fillRect(2, 0, 3, h); c.fillRect(w - 5, 0, 3, h);
  }, [1, 1]);
  g.add(groundStrip(() => -11, -1160, -1700, 5.0, heightAt, new THREE.MeshLambertMaterial({ map: roadTex }), 4, 0.05, 8));

  // ----- the town sign: a covered wagon over the name in orange letters -----
  const citySign = new THREE.Group();
  {
    const tex = canvasTexture(1024, 640, (c, w, h) => {
      c.fillStyle = '#fbf3e4'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#2f4a5e'; c.lineWidth = 14; c.strokeRect(20, 20, w - 40, h - 40);
      // the covered wagon
      c.fillStyle = '#8a5a3a'; c.fillRect(300, 230, 420, 60);
      c.fillStyle = '#f4ecd8'; c.strokeStyle = '#2f4a5e'; c.lineWidth = 8;
      c.beginPath(); c.moveTo(310, 232); c.bezierCurveTo(300, 90, 380, 70, 420, 80); c.bezierCurveTo(470, 60, 560, 60, 610, 80); c.bezierCurveTo(650, 70, 720, 90, 710, 232); c.closePath(); c.fill(); c.stroke();
      for (const x of [400, 510, 620]) { c.beginPath(); c.moveTo(x, 90); c.lineTo(x, 230); c.stroke(); }
      for (const x of [370, 650]) { c.fillStyle = '#fbf3e4'; c.beginPath(); c.arc(x, 300, 52, 0, TAU); c.fill(); c.stroke(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; c.beginPath(); c.moveTo(x, 300); c.lineTo(x + Math.cos(a) * 50, 300 + Math.sin(a) * 50); c.stroke(); } }
      c.fillStyle = '#e8743a'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 132px Georgia, serif'; c.fillText('ASTEROID CITY', w / 2, 440);
      c.font = 'italic bold 84px Georgia, serif'; c.fillText('Pop. 87', w / 2, 552);
    });
    citySign.add(mesh(new THREE.PlaneGeometry(10, 6.25), new THREE.MeshBasicMaterial({ map: tex }), 0, 6.4, 0.06));
    citySign.add(box(10.3, 6.55, 0.1, toon(PAL.orange), 0, 6.4, -0.02));
    for (const s of [-1, 1]) citySign.add(cyl(0.12, 0.14, 4.0, toon(0x8a7a6a), s * 4.4, 2.0, 0, 8));
    citySign.position.set(SPOTS.citySign.x, heightAt(SPOTS.citySign.x, SPOTS.citySign.z), SPOTS.citySign.z);
    citySign.rotation.y = -Math.PI / 2;
    g.add(finish(citySign));
  }

  // ----- the diner: cream and turquoise, checkered tile and chrome -----
  const diner = new THREE.Group();
  {
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.8, roughness: 0.3 });
    diner.add(tiled(14, 4.2, 8, texMat(stucco(PAL.cream, 81)), 3, 3, 0, 2.1, 0));
    diner.add(tiled(14.2, 0.9, 8.2, texMat(checker(PAL.turquoise, 0xfbf8f4, 8)), 2, 2, 0, 0.45, 0));
    diner.add(box(14.3, 0.5, 8.3, toon(PAL.red), 0, 4.25, 0));
    diner.add(box(14.26, 0.08, 8.26, chrome, 0, 0.95, 0), box(14.26, 0.08, 8.26, chrome, 0, 3.95, 0));
    diner.add(box(12, 1.7, 0.1, glow(0xfff4dc, 0.85), 0, 2.6, 4.02));
    for (let x = -5.4; x <= 5.4; x += 1.8) diner.add(box(0.12, 1.8, 0.14, chrome, x, 2.6, 4.06));
    diner.add(box(1.6, 2.4, 0.12, toon(PAL.turquoise), 0, 1.2, 4.06));
    const aw = mesh(new THREE.PlaneGeometry(13, 1.8), new THREE.MeshLambertMaterial({ map: stripes(PAL.turquoise, PAL.white, 8, true), side: THREE.DoubleSide, alphaTest: 0.5 }), 0, 3.95, 4.7); aw.rotation.x = -0.75; diner.add(aw);
    const sg = signBoard('DINER', 6, 2.0, { color: '#fbf7f2', bg: '#b93a4c', border: '#fbf7f2', texW: 512, texH: 170, frame: PAL.red });
    sg.position.set(0, 5.7, 1.5); diner.add(sg);
    for (const s of [-1, 1]) diner.add(cyl(0.05, 0.05, 1.4, dark, s * 2.6, 5.0, 1.5, 5));
    const eat = signBoard('EAT', 1.6, 0.8, { color: '#fff0a0', bg: '#2f4a5e', texW: 256, texH: 128, frame: PAL.dark });
    eat.position.set(-5.5, 5.2, 3.6); diner.add(eat);
    for (const s of [-1, 1]) { diner.add(cyl(0.05, 0.05, 0.7, chrome, s * 2.4, 0.35, 5.2, 6), cyl(0.28, 0.28, 0.12, toon(PAL.red), s * 2.4, 0.76, 5.2, 12)); }
    diner.add(box(1.0, 1.8, 0.8, toon(PAL.powder), 6.2, 0.9, 4.5), box(0.7, 1.0, 0.06, glow(0xe0f4ff, 0.9), 6.2, 1.1, 4.92)); // soda machine
    diner.position.set(SPOTS.diner.x, heightAt(SPOTS.diner.x, SPOTS.diner.z), SPOTS.diner.z);
    diner.rotation.y = -Math.PI / 2;
    g.add(finish(diner));
    const pl = new THREE.PointLight(0xffd8a0, 14, 30, 1.5);
    pl.position.set(SPOTS.diner.x - 4, heightAt(SPOTS.diner.x, SPOTS.diner.z) + 2.5, SPOTS.diner.z);
    g.add(pl);
  }

  // ----- a vintage turquoise station wagon by the diner -----
  {
    const w = new THREE.Group();
    const paint = toon(PAL.turquoise), chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.8, roughness: 0.3 });
    const woodSide = texMat(planks(0xb08a5a, 83));
    w.add(box(2.0, 0.8, 4.8, paint, 0, 0.8, 0));
    w.add(box(1.8, 0.7, 2.8, paint, 0, 1.55, -0.5));
    for (const s of [-1, 1]) w.add(tiled(0.04, 0.5, 2.6, woodSide, 1, 1, s * 1.01, 0.85, -0.9));
    w.add(box(1.82, 0.5, 2.6, new THREE.MeshLambertMaterial({ color: 0xd9ecf6 }), 0, 1.6, -0.5));
    w.add(box(1.84, 0.12, 2.9, white, 0, 1.92, -0.5));
    w.add(box(1.5, 0.06, 2.2, chrome, 0, 2.0, -0.5));
    w.add(box(0.7, 0.4, 1.0, toon(0x8a5a3a), -0.4, 2.22, -0.6), box(0.6, 0.3, 0.8, toon(PAL.red), 0.35, 2.17, -0.3));
    w.add(box(2.1, 0.16, 0.3, chrome, 0, 0.5, 2.45), box(2.1, 0.16, 0.3, chrome, 0, 0.5, -2.45));
    for (const s of [-1, 1]) for (const z of [-1.6, 1.6]) { w.add(cyl(0.38, 0.38, 0.3, dark, s * 1.0, 0.4, z, 12).rotateZ(Math.PI / 2)); w.add(cyl(0.2, 0.2, 0.32, chrome, s * 1.0, 0.4, z, 8).rotateZ(Math.PI / 2)); }
    w.add(sphere(0.14, glow(0xfff2c0, 0.8), -0.7, 0.9, 2.42, 8, 6), sphere(0.14, glow(0xfff2c0, 0.8), 0.7, 0.9, 2.42, 8, 6));
    w.position.set(13.5, heightAt(13.5, -1268), -1268);
    w.rotation.y = 0.12;
    g.add(finish(w));
  }

  // ----- motel cabins in a row, each facing the track -----
  const motel = new THREE.Group();
  {
    const cols = [PAL.mint, PAL.pink, PAL.mustard, PAL.powder, PAL.cream, PAL.deepPink];
    const doorCols = [PAL.red, PAL.turquoise, PAL.burgundy, PAL.red, PAL.turquoise, PAL.burgundy];
    const plaster = stucco(0xffffff, 85);
    cols.forEach((c, i) => {
      const cab = new THREE.Group();
      cab.add(tiled(5.5, 3.2, 5.5, texMat(plaster, { color: c }), 3, 3, 0, 1.6, 0));
      cab.add(box(6.1, 0.3, 6.1, white, 0, 3.35, 0));
      cab.add(box(6.2, 0.14, 6.2, toon(doorCols[i]), 0, 3.56, 0));
      cab.add(box(1.0, 2.2, 0.1, toon(doorCols[i]), -1.4, 1.1, 2.78));
      cab.add(sphere(0.06, toon(PAL.brass), -1.05, 1.1, 2.86, 6, 4));
      cab.add(box(1.8, 1.3, 0.06, white, 1.2, 1.9, 2.76));
      cab.add(box(1.6, 1.1, 0.1, glow(0xfff4e0, 0.8), 1.2, 1.9, 2.79));
      cab.add(box(0.06, 1.1, 0.12, white, 1.2, 1.9, 2.84));
      const n = signBoard(String(i + 1), 0.5, 0.5, { color: '#2a2c30', bg: '#fbf7f2', texW: 64, texH: 64, frame: PAL.dark }); n.position.set(-1.4, 2.6, 2.84); cab.add(n);
      cab.add(box(0.7, 0.06, 0.7, toon(doorCols[i]), 2.0, 0.5, 3.4), box(0.7, 0.6, 0.06, toon(doorCols[i]), 2.0, 0.8, 3.72));
      cab.add(cyl(0.04, 0.04, 2.2, dark, -2.4, 1.1, 3.4, 5), sphere(0.16, glow(0xfff0c8, 1.0), -2.4, 2.3, 3.4, 8, 6));
      cab.position.set(-i * 7.0, 0, 0);
      motel.add(cab);
    });
    // a long walkway slab in front and the MOTEL sign at the near end
    motel.add(tiled(42, 0.2, 8.5, texMat(paving(0xe6dccc, 87)), 2, 2, -17.5, 0.02, 2.0));
    const pole = new THREE.Group();
    pole.add(cyl(0.12, 0.14, 8, toon(PAL.dark), 0, 4, 0, 8));
    const ms = signBoard('MOTEL', 3.2, 1.4, { color: '#fbf7f2', bg: '#b93a4c', border: '#fbf7f2', texW: 512, texH: 220, frame: PAL.red }); ms.position.set(0, 8.4, 0.1); pole.add(ms);
    const vac = signBoard('VACANCY', 2.6, 0.7, { color: '#2f4a5e', bg: '#fff0a0', texW: 512, texH: 130, frame: PAL.mustard }); vac.position.set(0, 7.2, 0.1); pole.add(vac);
    const arrow = cone(0.5, 1.2, toon(PAL.mustard), 0, 9.6, 0.1, 4); arrow.rotation.z = -Math.PI / 2; arrow.rotation.y = Math.PI / 4; pole.add(arrow);
    pole.position.set(6, 0, 5); motel.add(pole);
    motel.position.set(SPOTS.motel.x, heightAt(SPOTS.motel.x, SPOTS.motel.z), SPOTS.motel.z);
    motel.rotation.y = -Math.PI / 2;
    g.add(finish(motel));
    // the vending machines at the end of the row: martinis, deeds to land, and soda
    const vend = new THREE.Group();
    const machines: Array<[string, string, number, string[]]> = [
      ['MARTINIS', 'with a twist', PAL.pink, ['DRY', 'OLIVE', 'TWIST', 'DOUBLE']],
      ['DEED OF LAND', 'ten dollars in quarters', PAL.mint, ['LOT 1', 'LOT 2', 'LOT 3', 'LOT 4']],
      ['SODA POP', 'ice cold', PAL.powder, ['COLA', 'ROOT BEER', 'LEMON-LIME', 'CREAM']],
    ];
    machines.forEach(([label, sub, col, items], i) => {
      vend.add(box(1.1, 2.0, 0.85, toon(col), 0, 1.0, i * 1.35));
      const f = mesh(new THREE.PlaneGeometry(0.9, 1.8), new THREE.MeshBasicMaterial({ map: vendingFront(label, sub, col, items) }), 0.56, 1.0, i * 1.35);
      f.rotation.y = Math.PI / 2; vend.add(f);
    });
    vend.position.set(18, heightAt(18, SPOTS.motel.z - 44), SPOTS.motel.z - 45.5);
    vend.rotation.y = Math.PI;
    g.add(finish(vend));
    clear.rect(18, SPOTS.motel.z - 44, 3, 5, 0, 0.5);
  }

  // ----- the crater: chain-link fence, the meteorite in its cage -----
  const craterY = heightAt(SPOTS.crater.x, SPOTS.crater.z);
  {
    const ring = new THREE.Group();
    const R = SPOTS.crater.r + 2.5;
    const rimY = heightAt(SPOTS.crater.x + R, SPOTS.crater.z);
    const steel = toon(0x9aa0a8);
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; ring.add(cyl(0.05, 0.06, 2.4, steel, Math.cos(a) * R, rimY + 1.2, Math.sin(a) * R, 6)); }
    const fence = mesh(repeatUV(new THREE.CylinderGeometry(R, R, 2.2, 64, 1, true), (TAU * R) / 1.1, 2.2 / 1.1), new THREE.MeshLambertMaterial({ map: chainLink(), alphaTest: 0.5, side: THREE.DoubleSide }), 0, rimY + 1.2, 0);
    ring.add(fence);
    const top = mesh(new THREE.TorusGeometry(R, 0.04, 5, 64), steel, 0, rimY + 2.3, 0); top.rotation.x = Math.PI / 2; ring.add(top);
    ring.position.set(SPOTS.crater.x, 0, SPOTS.crater.z);
    g.add(finish(ring));
    const s = signPost('METEORITE', 2.4, 0.7, 1.6, 0x8a7a6a, { color: '#b93a4c', bg: '#fbf7f2', border: '#b93a4c', texW: 512, texH: 130, sub: 'do not touch', frame: PAL.white });
    s.position.set(SPOTS.crater.x - R - 1.5, heightAt(SPOTS.crater.x - R - 1.5, SPOTS.crater.z), SPOTS.crater.z); s.rotation.y = -Math.PI / 2; g.add(finish(s));
    // the meteorite itself, on a little plinth inside a wire cage
    const cage = new THREE.Group();
    cage.add(tiled(1.6, 0.5, 1.6, texMat(stucco(0xe8e0d4, 89)), 3, 3, 0, 0.25, 0));
    cage.add(mesh(new THREE.DodecahedronGeometry(0.4, 0), toon(0x3a3238), 0, 0.85, 0));
    const c = new THREE.Vector3(), E = 0.7;
    for (const [a, b] of [[[-1, -1, -1], [1, -1, -1]], [[-1, 1, -1], [1, 1, -1]], [[-1, -1, 1], [1, -1, 1]], [[-1, 1, 1], [1, 1, 1]], [[-1, -1, -1], [-1, 1, -1]], [[1, -1, -1], [1, 1, -1]], [[-1, -1, 1], [-1, 1, 1]], [[1, -1, 1], [1, 1, 1]], [[-1, -1, -1], [-1, -1, 1]], [[1, -1, -1], [1, -1, 1]], [[-1, 1, -1], [-1, 1, 1]], [[1, 1, -1], [1, 1, 1]]] as number[][][]) {
      cage.add(rod(c.set(a[0] * E, 0.5 + (a[1] + 1) * 0.55, a[2] * E).clone(), new THREE.Vector3(b[0] * E, 0.5 + (b[1] + 1) * 0.55, b[2] * E), 0.025, steel, 4));
    }
    for (let i = -2; i <= 2; i++) for (const s2 of [-1, 1]) { cage.add(rod(new THREE.Vector3(i * 0.28, 0.5, s2 * E), new THREE.Vector3(i * 0.28, 1.6, s2 * E), 0.012, steel, 3)); cage.add(rod(new THREE.Vector3(s2 * E, 0.5, i * 0.28), new THREE.Vector3(s2 * E, 1.6, i * 0.28), 0.012, steel, 3)); }
    cage.position.set(SPOTS.crater.x, craterY - 0.1, SPOTS.crater.z);
    g.add(finish(cage));
  }

  // ----- observatory on its rise, on the left, with a pair of radio dishes -----
  const observatory = new THREE.Group();
  {
    const f = facadeTile({ wall: PAL.cream, frame: 0xfbf8f4, glass: 'night', bays: 3, storeys: 1, lit: 0.3, seed: 91 });
    observatory.add(mesh(repeatUV(new THREE.CylinderGeometry(5.6, 5.9, 5.2, 24), 4, 1), texMat(stucco(PAL.cream, 93)), 0, 2.6, 0));
    observatory.add(cyl(6.1, 6.1, 0.4, white, 0, 5.4, 0, 24));
    const dome = mesh(new THREE.SphereGeometry(5.7, 24, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2f0ec, metalness: 0.35, roughness: 0.45 }), 0, 5.6, 0); observatory.add(dome);
    const slit = box(0.7, 5.6, 0.5, dark, 0, 8.4, 4.4); slit.rotation.x = -0.7; observatory.add(slit);
    observatory.add(tiled(6, 3.2, 4, texMat(f.map, { emissive: 0xffdcb0, emissiveMap: f.emissive, emissiveIntensity: 0.5 }), 6, 3.2, 0, 1.6, 6.5));
    observatory.add(box(6.4, 0.3, 4.4, toon(PAL.powder), 0, 3.3, 6.5));
    observatory.add(box(1.2, 2.2, 0.1, glow(0xfff0d8, 0.8), 0, 1.1, 8.55));
    const s = signBoard('OBSERVATORY', 4.0, 0.7, { color: '#2f4a5e', bg: '#fbf7f2', border: '#2f4a5e', texW: 512, texH: 100, frame: PAL.powder }); s.position.set(0, 2.9, 8.56); observatory.add(s);
    for (const [dx, dz, tilt] of [[-7, 9, 0.8], [7, 9, 0.7]] as [number, number, number][]) {
      const dish = new THREE.Group();
      dish.add(cyl(0.25, 0.4, 3, white, 0, 1.5, 0, 8), box(1.2, 0.5, 0.8, white, 0, 3.1, 0));
      const bowl = mesh(new THREE.SphereGeometry(2.4, 20, 8, 0, TAU, 0, 0.75), new THREE.MeshLambertMaterial({ color: 0xf6f4f0, side: THREE.DoubleSide }), 0, 0, 0);
      bowl.scale.y = 0.6; bowl.rotation.x = Math.PI;
      const head = new THREE.Group(); head.add(bowl); head.add(cyl(0.05, 0.05, 2.0, dark, 0, -0.8, 0, 4)); head.position.set(0, 3.6, 0); head.rotation.x = -tilt;
      dish.add(head);
      dish.position.set(dx, 0, dz);
      dish.rotation.y = 0.3 * Math.sign(dx);
      observatory.add(dish);
    }
    observatory.position.set(SPOTS.observatory.x, heightAt(SPOTS.observatory.x, SPOTS.observatory.z), SPOTS.observatory.z);
    observatory.rotation.y = Math.PI / 2;
    g.add(finish(observatory));
  }

  // ----- water tower on the left -----
  {
    const t = new THREE.Group();
    const steel = toon(0x8a8a90);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) t.add(rod(new THREE.Vector3(sx * 2.0, 0, sz * 2.0), new THREE.Vector3(sx * 1.5, 9.2, sz * 1.5), 0.12, steel, 6));
    for (const y of [3, 6]) for (const s of [-1, 1]) { t.add(rod(new THREE.Vector3(-1.9, y, s * 1.9), new THREE.Vector3(1.9, y + 2.5, s * 1.8), 0.04, steel, 4)); t.add(rod(new THREE.Vector3(s * 1.9, y, -1.9), new THREE.Vector3(s * 1.8, y + 2.5, 1.9), 0.04, steel, 4)); }
    t.add(mesh(repeatUV(new THREE.CylinderGeometry(2.6, 2.6, 4.0, 20), 6, 2), texMat(panels(PAL.mint, 95)), 0, 11, 0));
    t.add(cone(2.8, 1.4, toon(PAL.red), 0, 13.7, 0, 20));
    t.add(mesh(new THREE.TorusGeometry(2.7, 0.05, 4, 32), dark, 0, 9.4, 0).rotateX(Math.PI / 2));
    const n = signBoard('ASTEROID CITY', 4.4, 0.9, { color: '#7a2a36', bg: '#a8d8c8', texW: 512, texH: 100, frame: PAL.mint }); n.position.set(0, 11, 2.62); t.add(n);
    t.position.set(-24, heightAt(-24, -1250), -1250);
    t.rotation.y = Math.PI / 2;
    g.add(finish(t));
    clear.circle(-24, -1250, 4);
  }

  // ----- the unfinished overpass: an elevated spur that stops in mid-air -----
  const ramp = new THREE.Group();
  const rampEnd = new THREE.Vector3();
  {
    const concrete = texMat(stucco(0xe2dcd2, 97));
    const deckTex = canvasTexture(64, 128, (c, w, h) => { c.fillStyle = '#c4bcb2'; c.fillRect(0, 0, w, h); c.fillStyle = '#f6f0e4'; c.fillRect(w / 2 - 2, 0, 4, h * 0.5); }, [1, 1]);
    const len = SPOTS.ramp.z0 - SPOTS.ramp.z1, H = 6.4, W = 9;
    const gy = heightAt(SPOTS.ramp.x, (SPOTS.ramp.z0 + SPOTS.ramp.z1) / 2);
    // the level deck, on pairs of round piers
    ramp.add(tiled(W, 0.9, len * 0.6, concrete, 3, 3, 0, H, -len * 0.2));
    ramp.add(mesh(repeatUV(new THREE.PlaneGeometry(W - 1, len * 0.6), 1, len * 0.6 / 8), texMat(deckTex), 0, H + 0.46, -len * 0.2).rotateX(-Math.PI / 2));
    for (let z = len * 0.1 - 2; z > -len * 0.5; z -= 11) for (const s of [-1, 1]) ramp.add(cyl(0.7, 0.8, H, concrete, s * 2.8, H / 2 - 0.4, z, 12));
    // the sloping on-ramp up from the road side
    const slope = new THREE.Group();
    const sl = len * 0.4, slen = Math.hypot(sl, H - 0.3);
    slope.add(tiled(W, 0.9, slen + 2, concrete, 3, 3, 0, 0, -slen / 2));
    slope.add(mesh(repeatUV(new THREE.PlaneGeometry(W - 1, slen + 2), 1, (slen + 2) / 8), texMat(deckTex), 0, 0.46, -slen / 2).rotateX(-Math.PI / 2));
    slope.position.set(0, 0.3, len * 0.5);
    slope.rotation.x = Math.atan2(H - 0.3, sl);
    ramp.add(slope);
    for (const s of [-1, 1]) {
      ramp.add(box(0.3, 0.9, len * 0.6, concrete, s * (W / 2 - 0.15), H + 0.9, -len * 0.2));
      slope.add(box(0.3, 0.9, slen + 2, concrete, s * (W / 2 - 0.15), 0.9, -slen / 2));
    }
    // the abrupt end: a striped barrier and the notice
    const end = -len * 0.5;
    const stripeTex = stripes(PAL.red, PAL.white, 5);
    ramp.add(box(W - 1, 0.9, 0.3, texMat(stripeTex), 0, H + 1.0, end + 0.5));
    for (const s of [-1, 1]) ramp.add(box(0.2, 1.5, 0.2, toon(PAL.white), s * 3.5, H + 1.0, end + 0.5));
    const note = signBoard('RAMP CLOSED INDEFINITELY', 5.4, 1.3, { color: '#2a2c30', bg: '#f2d23a', border: '#2a2c30', texW: 1024, texH: 246, sub: 'Route-Calculations Error', frame: PAL.dark });
    note.position.set(0, H + 2.6, end + 0.8); ramp.add(note);
    for (const s of [-1, 1]) ramp.add(cyl(0.06, 0.06, 2.4, dark, s * 2.4, H + 1.9, end + 0.7, 5));
    // the cut end shows its reinforcing bars
    for (let i = -4; i <= 4; i++) ramp.add(rod(new THREE.Vector3(i * 0.9, H - 0.2, end), new THREE.Vector3(i * 0.9 + 0.1, H - 0.3, end - 0.9 - (i % 2) * 0.3), 0.03, toon(0x8a5a4a), 4));
    // it climbs from the near end, so the notice faces the approaching train and the cut end shows looking back
    ramp.position.set(SPOTS.ramp.x, gy, (SPOTS.ramp.z0 + SPOTS.ramp.z1) / 2);
    rampEnd.set(SPOTS.ramp.x, gy + H + 1.5, (SPOTS.ramp.z0 + SPOTS.ramp.z1) / 2 - len * 0.5);
    g.add(finish(ramp));
    clear.rect(SPOTS.ramp.x, (SPOTS.ramp.z0 + SPOTS.ramp.z1) / 2, 12, len + 4, 0, 1);
  }

  // ----- a pale mushroom cloud far off over the western mesa (they test out there) -----
  {
    const m = new THREE.Group();
    const mat = toon(0xebe0dc, { transparent: true, opacity: 0.9 });
    m.add(cyl(4, 7, 44, mat, 0, 22, 0, 12));
    const cap = sphere(17, mat, 0, 46, 0, 14, 10); cap.scale.y = 0.7; m.add(cap);
    m.add(mesh(new THREE.TorusGeometry(14, 4, 8, 20), mat, 0, 38, 0).rotateX(Math.PI / 2));
    m.scale.setScalar(1.5);
    m.position.set(-380, 20, -1600);
    g.add(m);
  }

  // ----- telegraph poles in pairs and cactus rows -----
  {
    const pl = pairs(heightAt, 7.4, -1170, -1690, 40, (x, z) => !(x > 0 && Math.abs(z - SPOTS.citySign.z) < 8));
    const pole = new THREE.CylinderGeometry(0.1, 0.13, 7.5, 6); pole.translate(0, 3.75, 0);
    const bar = new THREE.BoxGeometry(1.8, 0.12, 0.12); bar.translate(0, 7.0, 0);
    const bar2 = new THREE.BoxGeometry(1.4, 0.12, 0.12); bar2.translate(0, 6.4, 0);
    g.add(chunkedParts([pole, bar, bar2], toon(0x7a6a5a), pl, { castShadow: true }));
  }
  {
    const trunk = new THREE.CylinderGeometry(0.28, 0.36, 3.2, 10); trunk.translate(0, 1.6, 0);
    const top = new THREE.SphereGeometry(0.28, 10, 6, 0, TAU, 0, Math.PI / 2); top.translate(0, 3.2, 0);
    const armL = new THREE.CylinderGeometry(0.17, 0.19, 1.0, 8); armL.rotateZ(Math.PI / 2); armL.translate(-0.55, 1.6, 0);
    const armLu = new THREE.CylinderGeometry(0.17, 0.19, 1.3, 8); armLu.translate(-1.0, 2.25, 0);
    const armLt = new THREE.SphereGeometry(0.17, 8, 5, 0, TAU, 0, Math.PI / 2); armLt.translate(-1.0, 2.9, 0);
    const armR = new THREE.CylinderGeometry(0.16, 0.18, 0.8, 8); armR.rotateZ(Math.PI / 2); armR.translate(0.5, 2.1, 0);
    const armRu = new THREE.CylinderGeometry(0.16, 0.18, 1.0, 8); armRu.translate(0.85, 2.6, 0);
    const armRt = new THREE.SphereGeometry(0.16, 8, 5, 0, TAU, 0, Math.PI / 2); armRt.translate(0.85, 3.1, 0);
    const parts = [trunk, top, armL, armLu, armLt, armR, armRu, armRt];
    const busy = (x: number, z: number) => x > 0 && ((Math.abs(z - SPOTS.citySign.z) < 8) || (z < SPOTS.diner.z + 12 && z > SPOTS.motel.z - 48) || Math.abs(z - SPOTS.crater.z) < 18);
    const open = (x: number, z: number) => !busy(x, z) && clear.at(x, z) > 0.5;
    const rows: Placement[] = [];
    for (let z = -1166; z > -1695; z -= 10) for (const s of [-1, 1]) { const x = s * 16; if (!open(x, z)) continue; rows.push({ x, y: heightAt(x, z), z, scale: rng.range(0.9, 1.15), rot: rng.range(0, TAU) }); }
    const wild = scatter(rng, 220, -220, 220, -1700, -1160, (x, z) => Math.abs(x) > 19 && open(x, z) && far(x, z, SPOTS.observatory.x, SPOTS.observatory.z, 16) && far(x, z, SPOTS.crater.x, SPOTS.crater.z, 18), heightAt, [0.6, 1.5]);
    // ribbed skin: pale vertical grooves that the per-cactus colour tints
    const ribTex = canvasTexture(128, 64, (c, w, h) => { c.fillStyle = '#e8ece4'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { c.fillStyle = '#a8b4a4'; c.fillRect(x, 0, 4, h); c.fillStyle = '#ffffff'; c.fillRect(x + 7, 0, 2, h); } }, [4, 2]);
    const all = rows.concat(wild);
    g.add(chunkedParts(parts, toon(0xffffff, { map: ribTex }), all, { castShadow: true, color: (i, c) => c.setHex([0x7fa88a, 0x8fb896, 0x6f9a7e][i % 3]) }));
    // small round barrel cacti and pale pebbles
    const barrel = new THREE.SphereGeometry(0.4, 10, 6); barrel.scale(1, 0.8, 1); barrel.translate(0, 0.32, 0);
    g.add(chunkedParts([barrel], toon(0x9fb88a, { map: ribTex }), scatter(rng, 260, -120, 120, -1700, -1160, (x, z) => Math.abs(x) > 6 && open(x, z), heightAt, [0.6, 1.4])));
    const pebble = new THREE.DodecahedronGeometry(0.3, 0); pebble.translate(0, 0.15, 0);
    g.add(chunkedParts([pebble], toon(0xe0c8b4), scatter(rng, 400, -160, 160, -1700, -1160, (x, z) => Math.abs(x) > 4 && open(x, z), heightAt, [0.5, 1.8])));
  }
  return { group: g, citySign, diner, motel, observatory, craterY, ramp, rampEnd };
}

// ---------- region 4: the sea ----------
export function buildSea(heightAt: HeightFn, trackPoint: TrackPointFn, clear: ExclusionMask) {
  const g = new THREE.Group();
  const rng = new Rng(3401);
  const white = toon(PAL.white), dark = toon(PAL.dark);
  // kerb stones both sides of the causeway
  {
    const pl: Placement[] = [];
    for (let z = -1700; z > -2172; z -= 2.6) for (const s of [-1, 1]) pl.push({ x: s * 3.7, y: trackPoint(z).y - 0.45, z, scale: 1, rot: 0 });
    const kerb = new THREE.BoxGeometry(0.6, 0.5, 2.4); kerb.translate(0, 0.25, 0);
    g.add(chunkedParts([boxUV(kerb as THREE.BoxGeometry, 3, 3)], texMat(stucco(0xe3dccf, 101)), pl));
  }
  // mint lamps in pairs along the causeway
  g.add(lampPosts(pairs((_x, z) => trackPoint(z).y - 0.45, 4.4, -1720, -2170, 40), { height: 3.6, color: PAL.mint, lamp: 0xfff0c8, head: 'globe' }));

  // ----- buoys in pink and white -----
  {
    const pl = scatter(rng, 40, -170, 170, -2180, -1720, (x, z) => Math.abs(x) > 14 && far(x, z, SPOTS.island.x, SPOTS.island.z, 22) && far(x, z, SPOTS.belafonte.x, SPOTS.belafonte.z, 34) && far(x, z, SPOTS.sub.x, SPOTS.sub.z, 10), () => 0.1, [0.8, 1.3]);
    const body = new THREE.SphereGeometry(0.6, 10, 8); body.translate(0, 0.2, 0);
    const tip = new THREE.ConeGeometry(0.3, 0.9, 8); tip.translate(0, 1.1, 0);
    g.add(chunkedParts([body, tip], toon(0xffffff), pl, { color: (i, c) => c.setHex(i % 2 ? PAL.pink : PAL.white) }));
  }

  // ----- a small jetty on the left for the yellow submarine -----
  {
    const j = new THREE.Group();
    const wood = toon(0x8a6a48), deck = texMat(planks(0xb08a60, 103));
    j.add(tiled(2.2, 0.2, 9, deck, 1, 2, -8.5, 0.9, 0));
    for (const z of [-4, 0, 4]) for (const x of [-9.4, -7.6]) j.add(cyl(0.12, 0.14, 2.4, wood, x, 0, z, 6));
    j.add(box(0.5, 1.2, 0.5, white, -12.5, 1.4, 4.2), sphere(0.2, glow(0xff8a6a, 1.0), -12.5, 2.15, 4.2, 8, 6));
    for (const z of [-4, 0, 4]) j.add(box(0.14, 0.9, 0.14, wood, -9.6, 1.4, z));
    j.add(box(0.06, 0.06, 9, wood, -9.6, 1.85, 0));
    j.add(tiled(5.0, 0.2, 2.0, deck, 1, 2, -5.5, 0.9, 0));
    for (const [x, z] of [[-7.4, -3.6], [-7.4, 3.6]]) j.add(cyl(0.12, 0.1, 0.4, dark, x, 1.2, z, 8));
    j.position.set(0, trackPoint(SPOTS.sub.z).y - 0.45 - 0.5, SPOTS.sub.z + 2);
    g.add(finish(j));
  }

  // ----- the lighthouse island -----
  const lighthouse = new THREE.Group();
  const islandY = heightAt(SPOTS.island.x, SPOTS.island.z);
  let beam: THREE.Mesh;
  {
    const stripeTex = canvasTexture(64, 256, (c, w, h) => { for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#fbf7f2' : '#b93a4c'; c.fillRect(0, (i * h) / 6, w, h / 6); } c.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < 40; i++) c.fillRect((i * 29) % w, (i * 71) % h, 6, 3); });
    const tower = mesh(new THREE.CylinderGeometry(1.5, 2.1, 14, 20), new THREE.MeshLambertMaterial({ map: stripeTex }), 0, 7, 0);
    lighthouse.add(tower);
    lighthouse.add(cyl(2.2, 2.2, 0.4, white, 0, 14.2, 0, 20));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; lighthouse.add(cyl(0.04, 0.04, 0.9, dark, Math.cos(a) * 2.1, 14.85, Math.sin(a) * 2.1, 4)); }
    lighthouse.add(mesh(new THREE.TorusGeometry(2.1, 0.04, 4, 24), dark, 0, 15.3, 0).rotateX(Math.PI / 2));
    lighthouse.add(cyl(1.3, 1.3, 1.9, new THREE.MeshLambertMaterial({ color: 0xcfe9f4, transparent: true, opacity: 0.45 }), 0, 15.4, 0, 12));
    const lamp = sphere(0.55, glow(0xfff0b0, 1.6), 0, 15.4, 0, 10, 8); lighthouse.add(lamp);
    lighthouse.add(cone(1.6, 1.2, toon(PAL.red), 0, 16.9, 0, 16));
    lighthouse.add(sphere(0.2, toon(PAL.brass), 0, 17.6, 0, 6, 5));
    lighthouse.add(box(1.4, 2.2, 0.1, glow(0xfff0d8, 0.6), 0, 1.1, 2.1));
    // keeper's cottage and a flagpole
    const f = facadeTile({ wall: PAL.cream, frame: 0xfbf8f4, shutters: PAL.powder, bays: 2, storeys: 1, lit: 0.6, seed: 105 });
    lighthouse.add(tiled(5, 3, 4, texMat(f.map, { emissive: 0xffdcb0, emissiveMap: f.emissive, emissiveIntensity: 0.5 }), 5, 3, 5, 1.5, 0));
    lighthouse.add(mesh(roofGeometry(5, 4, 2, 0.4), toon(PAL.red), 5, 3, 0));
    lighthouse.add(cyl(0.04, 0.04, 5, dark, -4, 2.5, 1, 5), mesh(new THREE.PlaneGeometry(1.4, 0.9), toon(PAL.powder, { side: THREE.DoubleSide }), -3.3, 4.6, 1));
    lighthouse.position.set(SPOTS.island.x, islandY - 0.2, SPOTS.island.z);
    lighthouse.rotation.y = -Math.PI / 2;
    g.add(finish(lighthouse));
    const pl = new THREE.PointLight(0xfff0b0, 40, 90, 1.4);
    pl.position.set(SPOTS.island.x, islandY + 15.4, SPOTS.island.z);
    g.add(pl);
    // the beam: a long soft cone that sweeps round once the sun gets low
    const beamGeo = new THREE.ConeGeometry(4, 60, 20, 1, true); beamGeo.translate(0, -30, 0); beamGeo.rotateZ(Math.PI / 2);
    beam = mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), SPOTS.island.x, islandY + 15.2, SPOTS.island.z);
    beam.visible = false;
    g.add(beam);
    // a stone ring around the island shore
    const stones = scatter(rng, 40, SPOTS.island.x - 16, SPOTS.island.x + 16, SPOTS.island.z - 16, SPOTS.island.z + 16, (x, z) => { const d = Math.hypot(x - SPOTS.island.x, z - SPOTS.island.z); return d > 9 && d < 14; }, (x, z) => heightAt(x, z), [0.8, 1.8]);
    const stone = new THREE.DodecahedronGeometry(0.5, 0); stone.translate(0, 0.2, 0);
    g.add(chunkedParts([stone], toon(0x9a948c), stones));
  }

  // ----- Port-au-Patois: the harbour station at the end of the line -----
  const station = buildStation('PORT-AU-PATOIS', 'end of the line', SPOTS.harbour.z, heightAt, trackPoint, { wall: 0xfbf8f4, trim: 0x2f6f8a, roof: PAL.powder, len: 34, houseSide: 1, seed: 107 });
  g.add(station.group);
  clear.rect(11.5, SPOTS.harbour.z, 9, 14, 0, 1);
  clear.rect(0, SPOTS.harbour.z, 16, 36, 0, 0.5);
  {
    // buffer stop across the end of the track
    const bz = SPOTS.harbour.z - 24;
    const by = trackPoint(bz).y;
    const buf = new THREE.Group();
    buf.add(box(2.6, 0.9, 0.4, new THREE.MeshLambertMaterial({ map: stripes(PAL.red, PAL.white, 4) }), 0, by + 0.8, bz));
    for (const s of [-1, 1]) { buf.add(box(0.3, 1.2, 1.6, dark, s * 1.0, by + 0.6, bz + 0.8)); buf.add(cyl(0.18, 0.18, 0.3, toon(0x6a6f78), s * 0.8, by + 0.8, bz - 0.35, 10).rotateX(Math.PI / 2)); }
    g.add(finish(buf));
    // cranes in a symmetrical pair
    for (const s of [-1, 1]) {
      const c = new THREE.Group();
      c.add(box(2.4, 0.6, 2.4, toon(0x2f6f8a), 0, 0.3, 0));
      c.add(cyl(0.3, 0.4, 9, toon(PAL.mustard), 0, 5.1, 0, 10));
      const jib = cyl(0.14, 0.2, 9, toon(PAL.mustard), 0, 8.8, 3.6, 8); jib.rotation.x = 1.0; c.add(jib);
      c.add(cyl(0.02, 0.02, 4, dark, 0, 5.0, 7.2, 4), box(0.6, 0.4, 0.6, dark, 0, 2.8, 7.2));
      c.add(box(1.2, 1.2, 1.2, toon(PAL.cream), 0, 9.6, -0.4), box(0.9, 0.7, 0.06, glow(0xe0f4ff, 0.8), 0, 9.7, 0.22));
      const cx = s * 16, cz = SPOTS.harbour.z + 18;
      c.position.set(cx, heightAt(cx, cz), cz);
      c.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      // crate stacks beside each crane
      const crateMat = texMat(planks(0xd0a870, 109));
      for (let i = 0; i < 4; i++) c.add(tiled(1.2, 1.2, 1.2, crateMat, 0.6, 1.2, (i % 2) * 1.3 - 0.6, 0.6 + Math.floor(i / 2) * 1.2, -4));
      g.add(finish(c));
      clear.circle(cx, cz, 5);
    }
    // palms in pairs on the harbour front, leaning out symmetrically
    for (const s of [-1, 1]) for (const dz of [-15, 15]) {
      const x = s * 9.5, z = SPOTS.harbour.z + dz;
      const p = palmTree(rng, s * 0.18);
      p.position.set(x, heightAt(x, z), z);
      p.rotation.y = rng.range(0, TAU);
      g.add(p);
      clear.circle(x, z, 1.2);
    }
    // harbour walls and a pair of little pastel boats moored at the end
    for (const s of [-1, 1]) {
      g.add(tiled(3, 2.2, 44, texMat(stucco(0xd0c6b6, 111)), 3, 3, s * 24, 0.4, SPOTS.harbour.z + 42));
      const b = new THREE.Group();
      const hull = sphere(1, toon(s > 0 ? PAL.powder : PAL.pink), 0, 0.2, 0, 14, 8); hull.scale.set(1.0, 0.5, 2.6); b.add(hull);
      b.add(box(1.4, 0.5, 2.0, white, 0, 0.7, 0.2), cyl(0.04, 0.04, 3.4, dark, 0, 2.2, -0.4, 5));
      b.add(mesh(new THREE.PlaneGeometry(1.6, 0.8), toon(s > 0 ? PAL.pink : PAL.powder, { side: THREE.DoubleSide }), 0.8, 3.2, -0.4));
      b.position.set(s * 19.5, 0.1, SPOTS.harbour.z + 50);
      g.add(finish(b));
    }
    // a green news kiosk on the left platform, its sides papered with French Dispatch covers
    const k = dispatchKiosk();
    k.position.set(-6.4, station.platY, SPOTS.harbour.z + 5);
    k.rotation.y = Math.PI / 2 + 0.3;
    g.add(k);
  }
  return { group: g, lighthouse, islandY, station, beam: beam! };
}

let frondTex: THREE.Texture | null = null;
/** A palm frond on a transparent canvas: a midrib with leaflets angled back along it. Tip at the top. */
function frondTexture() {
  return frondTex ??= canvasTexture(64, 256, (c, w, h) => {
    c.strokeStyle = '#6a8a4a'; c.lineWidth = 4; c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, 4); c.stroke();
    c.lineCap = 'round';
    for (let y = 12; y < h - 10; y += 7) {
      const len = (w / 2 - 3) * Math.sin(((h - y) / h) * Math.PI * 0.95);
      for (const s of [-1, 1]) {
        c.strokeStyle = (y / 7) % 2 ? '#7fae68' : '#6f9e5a'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(w / 2, y + 6); c.lineTo(w / 2 + s * len, y - 4); c.stroke();
      }
    }
  });
}

/** A palm with a ringed trunk that leans a little, drooping fronds and a few coconuts. Merged. */
export function palmTree(rng: Rng, lean = 0.15) {
  const g = new THREE.Group();
  const trunkTex = canvasTexture(64, 64, (c, w, h) => { c.fillStyle = '#a88a64'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { c.fillStyle = '#7a6044'; c.fillRect(0, y, w, 2); c.fillStyle = '#c0a47c'; c.fillRect(0, y + 2, w, 1); } }, [1, 1]);
  const trunkM = texMat(trunkTex);
  const H = 6.2, segs = 6;
  let prev = new THREE.Vector3(0, 0, 0);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const p = new THREE.Vector3(lean * H * t * t, H * t, 0);
    const r0 = 0.26 - 0.07 * ((i - 1) / segs), r1 = 0.26 - 0.07 * t;
    const d = p.clone().sub(prev);
    const m = mesh(repeatUV(new THREE.CylinderGeometry(r1, r0, d.length(), 9), 1, d.length() / 0.5), trunkM);
    m.position.copy(prev).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.add(m);
    prev = p;
  }
  const top = prev;
  const frondM = new THREE.MeshLambertMaterial({ map: frondTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
  const n = 10;
  for (let i = 0; i < n; i++) {
    const len = rng.range(2.6, 3.3), droop = rng.range(0.9, 1.4);
    const geo = new THREE.PlaneGeometry(0.95, len, 1, 8);
    geo.translate(0, len / 2, 0);
    // lay the frond out flat, then bend it down towards the tip
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k), t = y / len; pos.setXYZ(k, pos.getX(k), y * Math.cos(t * droop), -y * Math.sin(t * droop) * 0.9 - 0); }
    geo.rotateX(-Math.PI / 2 + 0.55);
    geo.computeVertexNormals();
    const f = mesh(geo, frondM);
    f.position.copy(top);
    f.rotation.y = (i / n) * TAU + rng.range(-0.2, 0.2);
    g.add(f);
  }
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; g.add(sphere(0.15, toon(0x6a5030), top.x + Math.cos(a) * 0.22, top.y - 0.22, Math.sin(a) * 0.22, 8, 6)); }
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return mergeStatic(g);
}

/**
 * Trees for the whole ride, chosen by region: rows of snowy firs in the alps, autumn trees in the wood.
 * Near rows are planted at exact intervals on both sides of the line (symmetry first); the wider slopes are
 * scattered. Every stretch is its own instanced mesh so the fog culler can drop the ones far ahead.
 */
export function buildTrees(heightAt: HeightFn, trackDist: DistFn, dens: number, avoid: (x: number, z: number) => boolean = () => false) {
  const g = new THREE.Group();
  const rng = new Rng(8121);
  const funicularClear = (x: number, z: number) => segDist(x, z, SPOTS.pavilion.x - 5.5, SPOTS.pavilion.z - 5, -49, -326) > 7;
  const cableClear = (x: number, z: number) => segDist(x, z, SPOTS.cableBase.x, SPOTS.cableBase.z, SPOTS.peak.x, SPOTS.peak.z) > 6 && far(x, z, SPOTS.peak.x, SPOTS.peak.z, 16);
  // alps: snow-dusted firs in tidy rows near the track, then scattered up the slopes
  const alpOk = (x: number, z: number) => trackDist(x, z) > 12 && !avoid(x, z) && far(x, z, SPOTS.pavilion.x, SPOTS.pavilion.z, 12) && funicularClear(x, z) && cableClear(x, z) && !(Math.abs(x - SPOTS.hotel.x) < 34 && Math.abs(z - SPOTS.hotel.z) < 34) && Math.abs(z - SPOTS.station.z) > 24 && far(x, z, SPOTS.church.x, SPOTS.church.z, 12) && far(x, z, -14.5, -46, 5) && far(x, z, 14.5, -46, 5);
  const fir: FluffyStyle = { shape: 'conifer', trunk: 0x5a4a44, leaves: [0x6b9682, 0x78a08c, 0x5f8a78], size: 0.9, snow: 0.85 };
  {
    const rows: Placement[] = [];
    for (let z = -40; z > -595; z -= 11) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const x = s * (16 + k * 7); if (!alpOk(x, z)) continue; rows.push({ x, y: heightAt(x, z) - 0.2, z, scale: 1.0 + k * 0.1, rot: rng.range(0, TAU) }); }
    g.add(fluffyForest(fir, rows, rng, { castShadow: true }));
    const wild = scatter(rng, Math.round(420 * dens), -300, 300, -660, 40, (x, z) => alpOk(x, z) && trackDist(x, z) > 38 && heightAt(x, z) < 90, (x, z) => heightAt(x, z) - 0.3, [0.9, 1.7]);
    g.add(fluffyForest({ ...fir, density: 0.7 }, wild, rng));
  }
  // the wood: autumn rows near the track, then a broad wood with a few dark firs
  const forestOk = (x: number, z: number) => trackDist(x, z) > 11 && !avoid(x, z) && far(x, z, SPOTS.lake.x, SPOTS.lake.z, 34) && far(x, z, SPOTS.foxTree.x, SPOTS.foxTree.z, 14) && far(x, z, SPOTS.tower.x, SPOTS.tower.z, 8) && far(x, z, SPOTS.camp.x, SPOTS.camp.z, 10) && far(x, z, SPOTS.treehouse.x, SPOTS.treehouse.z, 7) && far(x, z, -8.6, -884, 4);
  const autumn: FluffyStyle = { shape: 'round', trunk: 0x6a5040, leaves: [0xe0812e, 0xf2b53a, 0xc9552f, 0xf0c95a, 0xd9903a], size: 1.05 };
  const autumnBroad: FluffyStyle = { shape: 'broad', trunk: 0x6a5040, leaves: [0xd9773a, 0xe8a83a, 0xb84a2f, 0xe6c35a], size: 1.0, density: 0.75 };
  {
    const rows: Placement[] = [];
    for (let z = -612; z > -1142; z -= 9) for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { const x = s * (14 + k * 6.5); if (!forestOk(x, z)) continue; rows.push({ x, y: heightAt(x, z) - 0.1, z, scale: 1.0 + k * 0.12, rot: rng.range(0, TAU) }); }
    g.add(fluffyForest(autumn, rows, rng, { castShadow: true }));
    g.add(fluffyForest(autumnBroad, scatter(rng, Math.round(340 * dens), -240, 240, -1170, -590, (x, z) => forestOk(x, z) && trackDist(x, z) > 24, (x, z) => heightAt(x, z) - 0.2, [0.9, 1.5]), rng));
    g.add(fluffyForest({ shape: 'conifer', trunk: 0x4a3a34, leaves: [0x3f6b4a, 0x4e7a55], size: 1.0, density: 0.8 }, scatter(rng, Math.round(110 * dens), -240, 240, -1170, -590, (x, z) => forestOk(x, z) && trackDist(x, z) > 36, (x, z) => heightAt(x, z) - 0.2, [0.9, 1.4]), rng));
  }
  return g;
}
