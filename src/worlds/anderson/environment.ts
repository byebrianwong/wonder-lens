import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, lambert, glow, box, cyl, cone, sphere, mesh, roofGeometry, facadeTextures, canvasTexture, textTexture, instancedTrees, instanced, scatter, type Placement } from '../../engine/Builders';
import { Rng, TAU } from '../../engine/math';

export type HeightFn = (x: number, z: number) => number;
export type TrackPointFn = (z: number) => { x: number; y: number };
export type DistFn = (x: number, z: number) => number;

/** Fixed places the terrain (in AndersonWorld.ts) and the builders here both need to agree on. */
export const SPOTS = {
  station: { z: -14 },
  hotel: { x: -70, z: -330, y: 30 },
  pavilion: { x: -11, z: -302 },
  church: { x: 68, z: -330 },
  foxTree: { x: 26, z: -760 },
  camp: { x: -17, z: -897 },
  lake: { x: -44, z: -905, level: 2.2, bottom: 0.6 },
  tower: { x: 30, z: -1080 },
  citySign: { x: 15, z: -1190 },
  diner: { x: 24, z: -1255 },
  motel: { x: 24, z: -1330 },
  crater: { x: 30, z: -1440, r: 11 },
  observatory: { x: -48, z: -1560 },
  mesas: [[-150, -1290, 46, 28], [150, -1290, 46, 28], [-195, -1500, 62, 36], [195, -1500, 62, 36], [-120, -1660, 36, 18], [120, -1660, 36, 18]] as [number, number, number, number][],
  belafonte: { x: 27, z: -1850 },
  sub: { x: -15, z: -1790 },
  island: { x: 40, z: -2075, r: 14 },
  harbour: { z: -2205 },
};

/** The pastel palette used everywhere. */
export const PAL = { pink: 0xf2b8c6, deepPink: 0xe58fa6, burgundy: 0x7a2a36, red: 0xb93a4c, mint: 0xa8d8c8, mustard: 0xe8c04a, powder: 0xa9c8e8, cream: 0xf6efe2, white: 0xfbf8f4, brass: 0xd8b25a, dark: 0x2a2c30, sage: 0x7fa58a, turquoise: 0x6fc4c0 };

// ---------- small shared pieces ----------

/** A framed board with serif lettering. The face points to local +z. */
export function signBoard(text: string, w: number, h: number, o: { color?: string; bg?: string; border?: string; font?: string; texW?: number; texH?: number; sub?: string; frame?: number } = {}) {
  const texW = o.texW ?? 512, texH = o.texH ?? 128;
  const tex = canvasTexture(texW, texH, (c) => {
    c.fillStyle = o.bg ?? '#fbf7f2'; c.fillRect(0, 0, texW, texH);
    if (o.border) { const lw = Math.max(3, Math.round(texH * 0.05)); c.strokeStyle = o.border; c.lineWidth = lw; c.strokeRect(lw * 1.5, lw * 1.5, texW - lw * 3, texH - lw * 3); }
    c.fillStyle = o.color ?? '#7a2a36'; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (o.sub) {
      c.font = o.font ?? `bold ${Math.round(texH * 0.4)}px Georgia, serif`; c.fillText(text, texW / 2, texH * 0.38);
      c.font = `italic ${Math.round(texH * 0.2)}px Georgia, serif`; c.fillText(o.sub, texW / 2, texH * 0.76);
    } else { c.font = o.font ?? `bold ${Math.round(texH * 0.5)}px Georgia, serif`; c.fillText(text, texW / 2, texH * 0.53); }
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

/** Merges geometry parts and instances them at the placements. */
function instancedParts(parts: THREE.BufferGeometry[], mat: THREE.Material, placements: Placement[], castShadow = false) {
  const geo = mergeGeometries(parts, false)!;
  const im = instanced(geo, mat, placements);
  im.castShadow = castShadow;
  return im;
}

/** Instanced lamp posts (pole + head) with an instanced glowing lamp. */
export function lampPosts(placements: Placement[], o: { height: number; color: number; lamp: number; head: 'globe' | 'lantern' }) {
  const g = new THREE.Group();
  if (!placements.length) return g;
  const parts: THREE.BufferGeometry[] = [];
  const pole = new THREE.CylinderGeometry(0.07, 0.11, o.height, 8); pole.translate(0, o.height / 2, 0); parts.push(pole);
  const base = new THREE.CylinderGeometry(0.26, 0.32, 0.3, 8); base.translate(0, 0.15, 0); parts.push(base);
  if (o.head === 'lantern') { const cap = new THREE.ConeGeometry(0.44, 0.32, 4); cap.translate(0, o.height + 0.58, 0); parts.push(cap); }
  else { const ring = new THREE.CylinderGeometry(0.2, 0.14, 0.12, 8); ring.translate(0, o.height, 0); parts.push(ring); }
  g.add(instancedParts(parts, toon(o.color), placements, true));
  const lampGeo = o.head === 'lantern' ? new THREE.BoxGeometry(0.34, 0.4, 0.34) : new THREE.SphereGeometry(0.32, 10, 8);
  lampGeo.translate(0, o.height + 0.3, 0);
  g.add(instanced(lampGeo, glow(o.lamp, 1.05), placements));
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

const segDist = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
};
const far = (x: number, z: number, cx: number, cz: number, r: number) => Math.hypot(x - cx, z - cz) > r;

// ---------- a station (used at both ends) ----------
export function buildStation(name: string, sub: string, z: number, heightAt: HeightFn, trackPoint: TrackPointFn, o: { wall: number; trim: number; roof: number; len?: number; houseSide: -1 | 1 }) {
  const g = new THREE.Group();
  const len = o.len ?? 32;
  const ty = trackPoint(z).y - 0.45;
  const platY = ty + 0.9;
  const platMat = lambert(0xd9d0c2), paving = lambert(0xece5d8);
  const trim = toon(o.trim), roof = toon(o.roof);
  for (const s of [-1, 1]) {
    g.add(box(4.6, 0.9, len, platMat, s * 5.3, ty + 0.45, z));
    g.add(box(4.6, 0.1, len, paving, s * 5.3, ty + 0.92, z));
    g.add(box(0.3, 0.03, len, trim, s * 3.15, ty + 0.98, z));
    for (const dz of [-len / 2 + 3, 0, len / 2 - 3]) g.add(cyl(0.1, 0.1, 3.4, trim, s * 6.2, platY + 1.7, z + dz, 8));
    g.add(box(4.2, 0.22, len - 2, roof, s * 5.4, platY + 3.5, z));
    g.add(box(4.4, 0.14, len - 1.6, trim, s * 5.4, platY + 3.68, z));
    // scalloped fascia along the track edge
    for (let dz = -len / 2 + 1.5; dz <= len / 2 - 1.5; dz += 1.0) g.add(cyl(0.5, 0.5, 0.06, trim, s * 3.4, platY + 3.42, z + dz, 10).rotateX(Math.PI / 2));
    for (const dz of [-len / 4, len / 4]) { g.add(box(2.0, 0.08, 0.5, trim, s * 6.6, platY + 0.5, z + dz)); g.add(box(2.0, 0.5, 0.08, trim, s * 6.6, platY + 0.75, z + dz + s * 0.24)); }
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
    const f = facadeTextures({ wall: '#' + o.wall.toString(16).padStart(6, '0'), window: '#ffffff', frame: '#fbf7f2', rows: 2, cols: 4, lit: 1, rng: new Rng(11), sill: true });
    const body = box(11, 6, 6, new THREE.MeshLambertMaterial({ map: f.map }), 0, 3, 0);
    body.castShadow = true; house.add(body);
    house.add(box(11.4, 0.4, 6.4, trim, 0, 6.1, 0));
    house.add(mesh(mansardGeometry(11.8, 6.8, 2.6, 0.7), roof, 0, 6.3, 0));
    house.add(box(8.3, 0.3, 4.8, trim, 0, 8.9, 0));
    house.add(box(2.0, 2.8, 0.12, glow(0xfff0d8, 0.8), 0, 1.4, 3.03));
    house.add(box(2.4, 0.2, 0.3, trim, 0, 2.95, 3.1));
    for (const s of [-1, 1]) house.add(cyl(0.12, 0.12, 2.9, trim, s * 1.5, 1.45, 3.2, 8));
    const b = signBoard(name, 5.2, 1.0, { color: '#fbf7f2', bg: '#7a2a36', texW: 512, texH: 100, frame: o.trim });
    b.position.set(0, 4.9, 3.1); house.add(b);
    house.add(cyl(0.04, 0.04, 3.5, toon(PAL.dark), 0, 10.5, 0, 5));
    house.add(mesh(new THREE.PlaneGeometry(1.6, 1.0), toon(PAL.red, { side: THREE.DoubleSide }), 0.8, 11.7, 0));
    for (const s of [-1, 1]) { const t = topiary('double'); t.position.set(s * 4.2, 0, 3.6); house.add(t); }
  }
  const hx = o.houseSide * 11.5;
  const plinthH = Math.max(0.6, platY - heightAt(hx, z) + 0.4);
  house.add(box(12.5, plinthH, 7.5, platMat, 0, -plinthH / 2 + 0.02, 0));
  house.position.set(hx, platY - 0.02, z);
  house.rotation.y = o.houseSide > 0 ? -Math.PI / 2 : Math.PI / 2;
  g.add(house);
  return { group: g, platY, ty };
}

// ---------- the vehicle ----------
/** The Zubrowka Express: a pastel railcar behind an open front deck with a brass rail and a pair of lamps. Local +z is forward. */
export function buildZubrowkaExpress() {
  const g = new THREE.Group();
  const pink = toon(PAL.pink), cream = toon(PAL.cream), burgundy = toon(PAL.burgundy), dark = toon(PAL.dark);
  const brass = new THREE.MeshStandardMaterial({ color: PAL.brass, metalness: 0.8, roughness: 0.35 });
  const car = new THREE.Group();
  car.add(box(3.2, 2.7, 12, pink, 0, 1.9, -6.5));
  car.add(box(3.3, 0.5, 12.1, cream, 0, 1.3, -6.5));
  car.add(box(3.32, 0.06, 12.12, brass, 0, 1.58, -6.5));
  car.add(box(3.32, 0.06, 12.12, brass, 0, 1.02, -6.5));
  const roof = mesh(new THREE.CylinderGeometry(1.7, 1.7, 12.2, 12, 1, false, 0, Math.PI), burgundy, 0, 3.25, -6.5);
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.scale.x = 0.55;
  car.add(roof);
  car.add(box(1.2, 0.2, 11, cream, 0, 4.1, -6.5)); // roof walkway
  const winMat = new THREE.MeshLambertMaterial({ color: 0xf6efe2, emissive: 0xffe8c8, emissiveIntensity: 0.25 });
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
    car.add(box(0.06, 1.24, 1.54, cream, s * 1.605, 2.25, -2.5 - i * 2.1));
    car.add(box(0.06, 1.1, 1.4, winMat, s * 1.625, 2.25, -2.5 - i * 2.1));
    car.add(box(0.06, 0.32, 1.4, toon(PAL.red), s * 1.63, 2.72, -2.5 - i * 2.1)); // little red curtain pelmets
  }
  car.add(box(2.4, 1.1, 0.06, winMat, 0, 2.25, -0.48));
  car.add(box(2.6, 1.24, 0.06, cream, 0, 2.25, -0.5));
  const tex = textTexture('ZUBROWKA EXPRESS', { font: 'bold 54px Georgia, serif', color: '#7a2a36', w: 1024, h: 96 });
  for (const s of [-1, 1]) { const n = mesh(new THREE.PlaneGeometry(6, 0.56), new THREE.MeshBasicMaterial({ map: tex, transparent: true }), s * 1.615, 0.76, -6.5); n.rotation.y = s * Math.PI / 2; car.add(n); }
  // the crossed keys crest on the car's front
  const crest = new THREE.Group();
  crest.add(cyl(0.34, 0.34, 0.05, cream, 0, 0, 0, 16).rotateX(Math.PI / 2));
  for (const s of [-1, 1]) { const k = box(0.06, 0.5, 0.03, brass, 0, 0, 0.03); k.rotation.z = s * 0.6; crest.add(k); crest.add(sphere(0.06, brass, s * 0.16, -0.18, 0.04, 6, 5)); }
  crest.position.set(0, 3.45, -0.44);
  car.add(crest);
  for (const s of [-1, 1]) for (const z of [-2.5, -10.5]) car.add(box(0.5, 0.9, 2.6, dark, s * 1.3, 0.45, z));
  g.add(car);
  const deck = new THREE.Group();
  deck.add(box(3.2, 0.3, 4.4, toon(0x8a5a48), 0, 0.45, 1.8));
  deck.add(box(3.4, 0.08, 4.6, cream, 0, 0.62, 1.8));
  deck.add(box(1.3, 0.02, 4.4, toon(PAL.red), 0, 0.67, 1.8));
  const post = (x: number, z: number) => deck.add(cyl(0.035, 0.035, 1.05, brass, x, 1.15, z));
  for (const x of [-1.5, 1.5]) { post(x, 0.2); post(x, 2.0); post(x, 3.9); }
  post(-0.9, 3.95); post(0.9, 3.95);
  for (const x of [-1.5, 1.5]) { const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.8, 6), brass, x, 1.68, 2.05); r.rotation.x = Math.PI / 2; deck.add(r); }
  { const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 6), brass, 0, 1.68, 3.95); r.rotation.z = Math.PI / 2; deck.add(r); }
  const lampMats: THREE.MeshBasicMaterial[] = [];
  for (const s of [-1, 1]) {
    const lamp = new THREE.Group();
    const lm = glow(0xfff0c8, 1.05); lampMats.push(lm);
    // tall corner pole with a hanging lantern above the eyeline (symmetrical pair)
    lamp.add(cyl(0.03, 0.035, 2.6, brass, 0, 1.9, 0), cyl(0.02, 0.02, 0.5, brass, -s * 0.25, 3.15, 0).rotateZ(Math.PI / 2), cyl(0.012, 0.012, 0.3, brass, -s * 0.5, 3.0, 0));
    lamp.add(box(0.15, 0.2, 0.15, dark, -s * 0.5, 2.78, 0), box(0.11, 0.15, 0.11, lm, -s * 0.5, 2.78, 0), cone(0.12, 0.08, brass, -s * 0.5, 2.91, 0, 4));
    lamp.position.set(s * 1.5, 0, 3.9);
    deck.add(lamp);
  }
  const light = new THREE.PointLight(0xffd9a8, 1.6, 10, 1.6);
  light.position.set(0, 1.9, 3.6);
  deck.add(light);
  g.add(deck);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return { group: g, light, lampMats };
}

// ---------- region 1: the alps ----------
export function buildAlpine(rng: Rng, heightAt: HeightFn, trackPoint: TrackPointFn) {
  const g = new THREE.Group();
  const white = toon(PAL.white), cream = toon(PAL.cream), burgundy = toon(PAL.burgundy), red = toon(PAL.red), brass = toon(PAL.brass), dark = toon(PAL.dark);

  // ----- the Grand Budapest Hotel on its shelf, facade towards the track -----
  const hotel = new THREE.Group();
  {
    const tiers: [number, number, number, number, number][] = [[44, 8, 18, 2, 12], [40, 7, 17, 2, 11], [36, 7, 16, 2, 10], [30, 6.5, 14, 2, 8]];
    let y = 0;
    for (const [w, h, d, rows, cols] of tiers) {
      const f = facadeTextures({ wall: '#f2b8c6', window: '#ffffff', frame: '#fbf7f2', rows, cols, lit: 1, rng, sill: true });
      const b = box(w, h, d, new THREE.MeshLambertMaterial({ map: f.map }), 0, y + h / 2, 0);
      b.castShadow = true; hotel.add(b);
      hotel.add(box(w + 1.2, 0.5, d + 1.2, white, 0, y + h + 0.25, 0));
      for (let x = -w / 2 + 1; x <= w / 2 - 1; x += 2) hotel.add(cyl(0.07, 0.07, 0.8, white, x, y + h + 0.9, d / 2 + 0.45, 6));
      hotel.add(box(w + 0.4, 0.1, 0.1, white, 0, y + h + 1.3, d / 2 + 0.45));
      y += h + 0.5;
    }
    const roofW = 30, roofD = 14, roofH = 6;
    const roof = mesh(mansardGeometry(roofW + 1.2, roofD + 1.2, roofH, 0.72), burgundy, 0, y, 0);
    roof.castShadow = true; hotel.add(roof);
    for (let x = -roofW / 2 + 3; x <= roofW / 2 - 3; x += 4.5) { hotel.add(box(1.6, 1.6, 1.4, white, x, y + 1.5, roofD / 2 - 0.4)); hotel.add(box(1.0, 1.0, 0.1, toon(0xdfe9f2), x, y + 1.5, roofD / 2 + 0.32)); }
    hotel.add(box(roofW * 0.72 + 0.6, 0.4, roofD * 0.72 + 0.6, white, 0, y + roofH, 0));
    const sign = signBoard('GRAND BUDAPEST HOTEL', 22, 2.2, { color: '#b93a4c', bg: '#fbf7f2', border: '#b93a4c', texW: 1024, texH: 100, frame: PAL.red });
    sign.position.set(0, y + roofH + 1.5, 0); hotel.add(sign);
    for (const s of [-1, 1]) hotel.add(cyl(0.06, 0.06, 2.6, dark, s * 11.3, y + roofH + 1.2, 0, 6));
    hotel.add(cyl(1.6, 1.8, 2.2, white, 0, y + roofH + 1.1, -4, 12));
    hotel.add(cone(2.0, 2.2, burgundy, 0, y + roofH + 3.3, -4, 12));
    hotel.add(cyl(0.05, 0.05, 4, dark, 0, y + roofH + 6.4, -4, 5));
    hotel.add(mesh(new THREE.PlaneGeometry(1.8, 1.0), red, 0.9, y + roofH + 7.9, -4));
    // ground floor arcade, lit lobby doors and a red awning
    for (let x = -18; x <= 18; x += 4) hotel.add(box(1.0, 5.5, 1.0, cream, x, 2.75, 9.4));
    hotel.add(box(40, 1.0, 1.4, cream, 0, 6.0, 9.4));
    hotel.add(box(6, 4.4, 0.2, glow(0xfff0d8, 0.85), 0, 2.4, 9.05));
    hotel.add(box(7, 0.25, 3.2, red, 0, 5.0, 10.8));
    hotel.add(box(7.2, 0.6, 0.15, red, 0, 4.75, 12.35));
    for (const s of [-1, 1]) hotel.add(cyl(0.05, 0.05, 4.6, brass, s * 3.4, 2.6, 12.3, 6));
    // plinth and steps down to the terrace
    hotel.add(box(46, 1.0, 20, toon(0xe9dccb), 0, -0.5, 0));
    for (let i = 0; i < 4; i++) hotel.add(box(9 + i * 1.2, 0.25, 1.0, toon(0xe9dccb), 0, -0.125 - i * 0.25, 10.6 + i * 0.8));
    hotel.add(box(2.4, 0.04, 6, red, 0, -0.97, 15));
    // formal terrace: fountain in the centre, topiary in pairs
    hotel.add(cyl(2.6, 2.8, 0.6, cream, 0, -0.7, 18, 20));
    hotel.add(cyl(2.3, 2.3, 0.05, toon(PAL.mint, { transparent: true, opacity: 0.8 }), 0, -0.4, 18, 20));
    hotel.add(cyl(0.3, 0.5, 1.2, cream, 0, -0.1, 18, 10), cyl(1.0, 1.0, 0.2, cream, 0, 0.5, 18, 14));
    for (const s of [-1, 1]) for (const [tx, tz, k] of [[8, 14, 'cone'], [14, 14, 'ball'], [20, 14, 'cone'], [8, 18.5, 'double'], [14, 18.5, 'double']] as [number, number, 'cone' | 'ball' | 'double'][]) { const t = topiary(k); t.position.set(s * tx, -1, tz); hotel.add(t); }
    // lamps along the terrace edge
    for (const s of [-1, 1]) for (const tz of [12, 16, 20]) hotel.add(cyl(0.06, 0.08, 3, white, s * 20, 0.5, tz, 6), sphere(0.3, glow(0xfff0c8, 1.0), s * 20, 2.2, tz, 10, 8));
    hotel.position.set(SPOTS.hotel.x, SPOTS.hotel.y + 1.0, SPOTS.hotel.z);
    hotel.rotation.y = Math.PI / 2;
    g.add(hotel);
  }

  // ----- the hotel's lower station beside the track: the funicular pavilion with the red steps -----
  const pavBase = heightAt(SPOTS.pavilion.x, SPOTS.pavilion.z);
  const pav = new THREE.Group();
  {
    pav.position.set(SPOTS.pavilion.x, pavBase, SPOTS.pavilion.z);
    pav.rotation.y = Math.PI / 2; // front faces +x, the track
    const stone = toon(0xe9dccb);
    pav.add(box(9, 0.9, 7, stone, 0, 0.45, 0));
    pav.add(box(4.4, 0.6, 0.9, stone, 0, 0.3, 3.95));
    pav.add(box(4.4, 0.3, 0.9, stone, 0, 0.15, 4.85));
    pav.add(box(1.6, 0.03, 7, red, 0, 0.92, 0));
    pav.add(box(1.6, 0.03, 0.9, red, 0, 0.62, 3.95), box(1.6, 0.03, 0.9, red, 0, 0.32, 4.85));
    const f = facadeTextures({ wall: '#f6efe2', window: '#ffffff', frame: '#f2b8c6', rows: 1, cols: 3, lit: 1, rng, sill: true });
    const house = box(6.4, 4.2, 4.2, new THREE.MeshLambertMaterial({ map: f.map }), 0, 0.9 + 2.1, -1.2);
    house.castShadow = true; pav.add(house);
    for (const s of [-1, 1]) pav.add(box(0.5, 4.2, 0.5, toon(PAL.pink), s * 3.0, 3.0, 1.0));
    pav.add(box(7.0, 0.4, 4.8, white, 0, 5.2, -1.2));
    pav.add(mesh(mansardGeometry(7.2, 5.0, 1.8, 0.7), burgundy, 0, 5.4, -1.2));
    pav.add(box(1.8, 2.6, 0.1, glow(0xfff0d8, 0.85), 0, 2.2, 0.95));
    const sign = signBoard('GRAND BUDAPEST', 4.4, 0.8, { color: '#fbf7f2', bg: '#7a2a36', texW: 512, texH: 90, frame: PAL.brass, sub: 'funicular' });
    sign.position.set(0, 4.3, 1.05); pav.add(sign);
    for (const s of [-1, 1]) pav.add(cyl(0.05, 0.05, 2.4, brass, s * 1.4, 2.1, 1.3, 6), sphere(0.18, glow(0xfff0c8, 1.1), s * 1.4, 3.35, 1.3, 8, 6));
    for (const s of [-1, 1]) { const t = topiary('ball'); t.position.set(s * 3.6, 0.9, 2.2); pav.add(t); }
    g.add(pav);
  }
  const gustaveSpot = new THREE.Vector3(SPOTS.pavilion.x + 2.4, pavBase + 0.9, SPOTS.pavilion.z);
  const funicularBottom = new THREE.Vector3(SPOTS.pavilion.x - 5.5, pavBase + 0.95, SPOTS.pavilion.z - 5);
  const funicularTop = new THREE.Vector3(-49, SPOTS.hotel.y + 0.6, -326);

  // ----- Nebelsbad station at the start, with a Mendl's kiosk on the right platform -----
  const station = buildStation('NEBELSBAD', 'Republic of Zubrowka', SPOTS.station.z, heightAt, trackPoint, { wall: 0xf6efe2, trim: PAL.burgundy, roof: PAL.burgundy, len: 34, houseSide: -1 });
  g.add(station.group);
  {
    const k = new THREE.Group();
    k.add(box(5.0, 1.0, 3.6, toon(0xe9dccb), 0, -0.5, 0));
    k.add(box(4.2, 3.0, 3.0, toon(PAL.pink), 0, 1.5, 0));
    k.add(box(4.5, 0.3, 3.3, white, 0, 3.1, 0));
    k.add(box(3.0, 1.4, 0.1, glow(0xfff4e6, 0.9), 0, 1.6, 1.52));
    k.add(box(3.2, 0.5, 0.1, white, 0, 0.6, 1.52));
    const awn = canvasTexture(128, 32, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fbf7f2' : '#e58fa6'; c.fillRect(i * 16, 0, 16, 32); } });
    const aw = mesh(new THREE.PlaneGeometry(4.4, 1.3), new THREE.MeshLambertMaterial({ map: awn, side: THREE.DoubleSide }), 0, 2.7, 2.0);
    aw.rotation.x = -0.75; k.add(aw);
    const sign = signBoard("MENDL'S", 3.4, 0.8, { color: '#7a2a36', bg: '#fbf7f2', border: '#e58fa6', font: 'italic bold 60px Georgia, serif', texW: 512, texH: 110, frame: PAL.deepPink });
    sign.position.set(0, 3.7, 0.2); k.add(sign);
    // a pyramid of boxes in the window
    for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) k.add(box(0.3, 0.24, 0.3, toon(PAL.pink), (j - i / 2) * 0.36, 1.05 + (2 - i) * 0.26 + 0.12, 1.3));
    const kx = 9.5, kz = SPOTS.station.z - 8;
    k.position.set(kx, station.platY - 0.02, kz);
    k.rotation.y = -Math.PI / 2;
    g.add(k);
  }
  const agathaSpot = new THREE.Vector3(6.2, station.platY + 0.08, SPOTS.station.z + 2);
  const vanSpots = [{ x: -14.5, z: -46, rot: Math.PI / 2 }, { x: 14.5, z: -46, rot: -Math.PI / 2 }];

  // ----- a little onion-domed church on the opposite cliff, so both sides have a silhouette -----
  {
    const c = new THREE.Group();
    c.add(box(9, 9, 14, cream, 0, 4.5, 0));
    c.add(mesh(roofGeometry(9, 14, 4, 0.5), burgundy, 0, 9, 0));
    c.add(box(4.2, 16, 4.2, cream, 0, 8, 6));
    const dome = sphere(2.7, toon(0x8fbfae), 0, 18.4, 6, 14, 10); dome.scale.y = 1.25; c.add(dome);
    c.add(cone(1.1, 3.2, toon(0x8fbfae), 0, 22.6, 6, 10));
    c.add(box(0.12, 1.6, 0.12, brass, 0, 24.8, 6), box(0.8, 0.12, 0.12, brass, 0, 25.1, 6));
    c.add(box(1.4, 2.4, 0.1, glow(0xfff0d8, 0.7), 0, 1.3, 7.05));
    c.position.set(SPOTS.church.x, heightAt(SPOTS.church.x, SPOTS.church.z) - 1.2, SPOTS.church.z);
    c.rotation.y = -Math.PI / 2;
    c.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });
    g.add(c);
  }

  // ----- white iron lamps in pairs the whole way through the alps -----
  g.add(lampPosts(pairs(heightAt, 6.4, -34, -580, 36, (x, z) => !(x < 0 && Math.abs(z - SPOTS.pavilion.z) < 10)), { height: 4.2, color: PAL.white, lamp: 0xfff0c8, head: 'globe' }));
  // snow-topped fence posts along both sides beyond the lamps
  {
    const pl = pairs(heightAt, 9.5, -60, -580, 3.2, (x, z) => !(x < 0 && Math.abs(z - SPOTS.pavilion.z) < 8) && Math.abs(z - SPOTS.station.z) > 20);
    const post = new THREE.BoxGeometry(0.16, 1.1, 0.16); post.translate(0, 0.55, 0);
    const cap = new THREE.BoxGeometry(0.24, 0.1, 0.24); cap.translate(0, 1.1, 0);
    const rail = new THREE.BoxGeometry(0.08, 0.08, 3.2); rail.translate(0, 0.85, 1.6);
    g.add(instancedParts([post, rail], toon(0x8a7a6a), pl));
    g.add(instancedParts([cap], toon(PAL.white), pl));
  }
  return { group: g, hotel, pavilion: pav, gustaveSpot, funicularBottom, funicularTop, agathaSpot, vanSpots, station };
}

// ---------- region 2: the autumn forest ----------
export function buildForest(rng: Rng, heightAt: HeightFn) {
  const g = new THREE.Group();
  const dark = toon(PAL.dark), brass = toon(PAL.brass);
  // a dirt road on the right and a scout trail on the left, both following the ground
  g.add(groundStrip(() => 9, -600, -1150, 4.2, heightAt, lambert(0xb99a70), 4, 0.05));
  g.add(groundStrip(() => -9.5, -940, -1130, 2.0, heightAt, lambert(0xa88e6a), 4, 0.05));

  // ----- the tree with a door at its base (Mr. Fox's) -----
  const foxTree = new THREE.Group();
  {
    const trunkMat = toon(0x6a4a3a);
    const trunk = cyl(2.0, 3.0, 10, trunkMat, 0, 5, 0, 12); trunk.castShadow = true; foxTree.add(trunk);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; const r = cyl(0.6, 1.4, 4, trunkMat, Math.cos(a) * 2.6, 1.2, Math.sin(a) * 2.6, 6); r.rotation.z = Math.cos(a) * 0.7; r.rotation.x = -Math.sin(a) * 0.7; foxTree.add(r); }
    const cols = [0xe0812e, 0xf2b53a, 0xc9552f, 0xf0c95a];
    const blobs: [number, number, number, number][] = [[0, 14, 0, 8], [6, 12, 2, 5.5], [-6, 12.5, -1, 5.5], [2, 12, -6, 5], [-2, 11.5, 6, 5], [4, 17, -3, 4.5], [-4, 17.5, 3, 4.5]];
    blobs.forEach(([x, y, z, r], i) => { const b = mesh(new THREE.IcosahedronGeometry(r, 1), toon(cols[i % 4]), x, y, z); b.scale.y = 0.8; b.castShadow = true; foxTree.add(b); });
    const door = new THREE.Group();
    const doorMat = toon(0x8a3a2a);
    door.add(box(1.5, 2.3, 0.2, doorMat, 0, 1.15, 0));
    door.add(cyl(0.75, 0.75, 0.2, doorMat, 0, 2.3, 0, 12).rotateX(Math.PI / 2));
    door.add(sphere(0.07, brass, 0.5, 1.1, 0.12, 6, 5));
    door.add(cyl(0.5, 0.5, 0.16, glow(0xfff0c0, 0.9), 0, 3.9, 0, 12).rotateX(Math.PI / 2));
    door.add(mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 16), doorMat, 0, 3.9, 0.1));
    door.position.set(0, 0, 2.95);
    foxTree.add(door);
    foxTree.add(box(2.2, 0.2, 1.0, toon(0xb9a890), 0, 0.1, 3.6));
    const mb = new THREE.Group();
    mb.add(cyl(0.05, 0.05, 1.1, dark, 0, 0.55, 0, 6), box(0.5, 0.3, 0.32, toon(PAL.red), 0, 1.2, 0));
    const s = signBoard('FOX', 0.6, 0.24, { color: '#fbf7f2', bg: '#b93a4c', texW: 128, texH: 48, frame: PAL.red }); s.position.set(0, 1.55, 0); mb.add(s);
    mb.position.set(2.4, 0, 3.6); foxTree.add(mb);
    foxTree.position.set(SPOTS.foxTree.x, heightAt(SPOTS.foxTree.x, SPOTS.foxTree.z) - 0.3, SPOTS.foxTree.z);
    foxTree.rotation.y = -Math.PI / 2;
    g.add(foxTree);
  }
  const foxSpot = new THREE.Vector3(9.4, heightAt(9.4, -768), -768);

  // ----- the Moonrise Kingdom camp on the lake shore -----
  const camp = new THREE.Group();
  {
    camp.position.set(SPOTS.camp.x, heightAt(SPOTS.camp.x, SPOTS.camp.z), SPOTS.camp.z);
    camp.rotation.y = Math.PI / 2; // the tent opening faces +x, the track
    const tent = mesh(roofGeometry(3.2, 3.6, 2.2, 0.05), toon(PAL.mustard, { side: THREE.DoubleSide }), 0, 0, 0);
    tent.castShadow = true; camp.add(tent);
    camp.add(cyl(0.03, 0.03, 2.2, dark, 0, 1.1, 1.86, 5), cyl(0.03, 0.03, 2.2, dark, 0, 1.1, -1.86, 5));
    // record player on a crate, with a tiny horn
    camp.add(box(0.8, 0.6, 0.8, toon(0x8a6a4a), 2.3, 0.3, 1.0));
    camp.add(box(0.7, 0.14, 0.7, toon(PAL.powder), 2.3, 0.67, 1.0));
    camp.add(cyl(0.26, 0.26, 0.02, dark, 2.3, 0.75, 1.0, 16));
    camp.add(cyl(0.02, 0.02, 0.4, brass, 2.55, 0.85, 0.8, 5).rotateZ(0.6));
    camp.add(cone(0.16, 0.3, brass, 2.6, 1.0, 1.2, 10).rotateX(-1.1));
    // suitcases and a stack of books
    camp.add(box(0.9, 0.28, 0.5, toon(0x4f8a8a), -2.3, 0.14, 1.0), box(0.8, 0.26, 0.45, toon(PAL.red), -2.3, 0.41, 1.0));
    for (let i = 0; i < 4; i++) camp.add(box(0.36, 0.06, 0.28, toon([0xc94b3f, 0x4f8a8a, 0xe8c04a, 0x7a2a36][i]), -1.4, 0.03 + i * 0.065, 1.4));
    // campfire ring with logs and an ember
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; camp.add(sphere(0.18, toon(0x8f8a80), Math.cos(a) * 0.7, 0.1, 3.6 + Math.sin(a) * 0.7, 6, 5)); }
    camp.add(cyl(0.06, 0.06, 0.9, toon(0x5a3a2a), 0, 0.12, 3.6, 5).rotateZ(Math.PI / 2), cyl(0.06, 0.06, 0.9, toon(0x5a3a2a), 0, 0.12, 3.6, 5).rotateX(Math.PI / 2));
    camp.add(sphere(0.16, glow(0xffa050, 1.4), 0, 0.22, 3.6, 8, 6));
    // canoe pulled up on the lake side
    const canoe = sphere(1, toon(0xc9552f), 0, 0.25, -4.2, 12, 8); canoe.scale.set(0.5, 0.3, 2.0); camp.add(canoe);
    camp.add(cyl(0.03, 0.03, 1.6, toon(0xd9b070), 0.4, 0.5, -4.2, 5).rotateX(Math.PI / 2));
    g.add(camp);
  }
  const samSuzySpot = new THREE.Vector3(-13.5, heightAt(-13.5, -906), -906);
  {
    const s = signPost('CAMP IVANHOE', 2.6, 0.7, 2.2, 0x8a6a4a, { color: '#fbf7f2', bg: '#4f6a4a', texW: 512, texH: 120, sub: 'Khaki Scouts of North America', frame: 0x8a6a4a });
    s.position.set(-8.6, heightAt(-8.6, -884), -884); s.rotation.y = Math.PI / 2; g.add(s);
  }

  // ----- the lookout tower -----
  const tower = new THREE.Group();
  {
    const wood = toon(0x8a6a4a);
    const H = 10;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = cyl(0.12, 0.16, H + 0.6, wood, sx * 1.5, H / 2, sz * 1.5, 6); leg.rotation.z = -sx * 0.05; leg.rotation.x = sz * 0.05; leg.castShadow = true; tower.add(leg); }
    for (let y = 2.5; y < H; y += 2.5) for (const s of [-1, 1]) { tower.add(box(3.1, 0.1, 0.1, wood, 0, y, s * 1.5)); tower.add(box(0.1, 0.1, 3.1, wood, s * 1.5, y, 0)); }
    tower.add(box(3.9, 0.25, 3.9, toon(0xa88a6a), 0, H, 0));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tower.add(cyl(0.06, 0.06, 1.0, wood, sx * 1.85, H + 0.6, sz * 1.85, 5));
    for (const s of [-1, 1]) { tower.add(box(3.7, 0.06, 0.06, wood, 0, H + 1.05, s * 1.85)); tower.add(box(0.06, 0.06, 3.7, wood, s * 1.85, H + 1.05, 0)); }
    tower.add(box(2.4, 2.0, 2.4, toon(PAL.cream), 0, H + 1.1, 0));
    tower.add(cone(2.0, 1.4, toon(PAL.red), 0, H + 2.8, 0, 4).rotateY(Math.PI / 4));
    tower.add(box(1.2, 0.9, 0.06, glow(0xfff0c0, 0.7), 0, H + 1.3, 1.22));
    tower.add(cyl(0.03, 0.03, 2.2, dark, 0, H + 4.4, 0, 5), mesh(new THREE.PlaneGeometry(0.9, 0.6), toon(PAL.mustard, { side: THREE.DoubleSide }), 0.45, H + 5.2, 0));
    for (let y = 0.8; y < H; y += 0.8) tower.add(box(0.7, 0.05, 0.05, wood, 0, y, 1.55));
    for (const s of [-1, 1]) tower.add(cyl(0.03, 0.03, H, wood, s * 0.35, H / 2, 1.55, 4));
    tower.position.set(SPOTS.tower.x, heightAt(SPOTS.tower.x, SPOTS.tower.z), SPOTS.tower.z);
    tower.rotation.y = -Math.PI / 2;
    g.add(tower);
  }

  // ----- wooden lantern posts in pairs, and a low split-rail fence beside the road -----
  g.add(lampPosts(pairs(heightAt, 6.4, -640, -1120, 44), { height: 3.4, color: 0x7a5a44, lamp: 0xffe6b0, head: 'lantern' }));
  {
    const pl: Placement[] = [];
    for (let z = -620; z > -1140; z -= 3.0) { const x = 12.2; if (far(x, z, SPOTS.foxTree.x, SPOTS.foxTree.z, 6)) pl.push({ x, y: heightAt(x, z), z, scale: 1, rot: 0 }); }
    const post = new THREE.CylinderGeometry(0.07, 0.09, 1.0, 5); post.translate(0, 0.5, 0);
    const rail = new THREE.BoxGeometry(0.07, 0.07, 3.0); rail.translate(0, 0.85, 1.5);
    const rail2 = new THREE.BoxGeometry(0.07, 0.07, 3.0); rail2.translate(0, 0.45, 1.5);
    g.add(instancedParts([post, rail, rail2], toon(0x8a7a5a), pl));
  }
  // leaf litter under the rows: flat orange discs
  {
    const leafGeo = new THREE.CircleGeometry(0.26, 6); leafGeo.rotateX(-Math.PI / 2);
    const pl = scatter(rng, 700, -30, 30, -1140, -610, (x, z) => { const d = Math.abs(x); return d > 2.6 && d < 26 && far(x, z, SPOTS.lake.x, SPOTS.lake.z, 26); }, (x, z) => heightAt(x, z) + 0.04, [0.7, 1.4]);
    const cols = [0xe0812e, 0xf2b53a, 0xc9552f, 0xd9903a];
    g.add(instanced(leafGeo, toon(0xffffff, { side: THREE.DoubleSide }), pl, (i, c) => c.setHex(cols[i % 4])));
  }
  return { group: g, foxTree, foxSpot, camp, samSuzySpot, tower, scoutsPath: { x: -9.5, z0: -950, z1: -1120 } };
}

// ---------- region 3: the desert ----------
export function buildDesert(rng: Rng, heightAt: HeightFn) {
  const g = new THREE.Group();
  const dark = toon(PAL.dark), white = toon(PAL.white), cream = toon(PAL.cream);
  // a pale road on the left with a dashed centre line
  const roadTex = canvasTexture(64, 128, (c, w, h) => { c.fillStyle = '#c4b8ad'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2d23a'; c.fillRect(w / 2 - 2, 0, 4, h * 0.5); }, [1, 1]);
  g.add(groundStrip(() => -11, -1160, -1700, 5.0, heightAt, new THREE.MeshLambertMaterial({ map: roadTex }), 4, 0.05, 8));

  // ----- the town sign -----
  const citySign = new THREE.Group();
  {
    const tex = canvasTexture(1024, 512, (c, w, h) => {
      c.fillStyle = '#fbf3e4'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#b93a4c'; c.lineWidth = 18; c.strokeRect(24, 24, w - 48, h - 48);
      c.fillStyle = '#b93a4c'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 150px Georgia, serif'; c.fillText('ASTEROID CITY', w / 2, 200);
      c.font = 'italic 78px Georgia, serif'; c.fillStyle = '#2f4a5e'; c.fillText('pop. 87', w / 2, 340);
      c.font = '40px Georgia, serif'; c.fillText('ELEV. 1240 ft   ·   PLEASE DRIVE SLOWLY', w / 2, 430);
      // a little atom
      c.strokeStyle = '#2f4a5e'; c.lineWidth = 5;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(120, 130, 46, 18, (i / 3) * Math.PI, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(w - 120, 130, 46, 18, (i / 3) * Math.PI, 0, TAU); c.stroke(); }
    });
    citySign.add(mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ map: tex }), 0, 6.0, 0.06));
    citySign.add(box(10.3, 5.3, 0.1, toon(PAL.red), 0, 6.0, -0.02));
    for (const s of [-1, 1]) citySign.add(cyl(0.12, 0.14, 4.0, toon(0x8a7a6a), s * 4.4, 2.0, 0, 8));
    citySign.position.set(SPOTS.citySign.x, heightAt(SPOTS.citySign.x, SPOTS.citySign.z), SPOTS.citySign.z);
    citySign.rotation.y = -Math.PI / 2;
    g.add(citySign);
  }

  // ----- the diner -----
  const diner = new THREE.Group();
  {
    diner.add(box(14, 4.2, 8, cream, 0, 2.1, 0));
    diner.add(box(14.2, 0.9, 8.2, toon(PAL.turquoise), 0, 0.45, 0));
    diner.add(box(14.3, 0.5, 8.3, toon(PAL.red), 0, 4.25, 0));
    diner.add(box(12, 1.7, 0.1, glow(0xfff4dc, 0.85), 0, 2.6, 4.02));
    for (let x = -5.4; x <= 5.4; x += 1.8) diner.add(box(0.12, 1.8, 0.14, toon(PAL.turquoise), x, 2.6, 4.06));
    diner.add(box(1.6, 2.4, 0.12, toon(PAL.turquoise), 0, 1.2, 4.06));
    const awn = canvasTexture(128, 32, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fbf7f2' : '#6fc4c0'; c.fillRect(i * 16, 0, 16, 32); } });
    const aw = mesh(new THREE.PlaneGeometry(13, 1.8), new THREE.MeshLambertMaterial({ map: awn, side: THREE.DoubleSide }), 0, 3.95, 4.7); aw.rotation.x = -0.75; diner.add(aw);
    const sg = signBoard('DINER', 6, 2.0, { color: '#fbf7f2', bg: '#b93a4c', border: '#fbf7f2', texW: 512, texH: 170, frame: PAL.red });
    sg.position.set(0, 5.7, 1.5); diner.add(sg);
    for (const s of [-1, 1]) diner.add(cyl(0.05, 0.05, 1.4, dark, s * 2.6, 5.0, 1.5, 5));
    const eat = signBoard('EAT', 1.6, 0.8, { color: '#fff0a0', bg: '#2f4a5e', texW: 256, texH: 128, frame: PAL.dark });
    eat.position.set(-5.5, 5.2, 3.6); diner.add(eat);
    for (const s of [-1, 1]) { diner.add(cyl(0.05, 0.05, 0.7, toon(0xcfcfcf), s * 2.4, 0.35, 5.2, 6), cyl(0.28, 0.28, 0.12, toon(PAL.red), s * 2.4, 0.76, 5.2, 12)); }
    diner.add(box(1.0, 1.8, 0.8, toon(PAL.powder), 6.2, 0.9, 4.5), box(0.7, 1.0, 0.06, glow(0xe0f4ff, 0.9), 6.2, 1.1, 4.92)); // soda machine
    diner.position.set(SPOTS.diner.x, heightAt(SPOTS.diner.x, SPOTS.diner.z), SPOTS.diner.z);
    diner.rotation.y = -Math.PI / 2;
    diner.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });
    g.add(diner);
    const pl = new THREE.PointLight(0xffd8a0, 14, 30, 1.5);
    pl.position.set(SPOTS.diner.x - 4, heightAt(SPOTS.diner.x, SPOTS.diner.z) + 2.5, SPOTS.diner.z);
    g.add(pl);
  }

  // ----- a vintage turquoise station wagon by the diner -----
  {
    const w = new THREE.Group();
    const paint = toon(PAL.turquoise), chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.8, roughness: 0.3 });
    w.add(box(2.0, 0.8, 4.8, paint, 0, 0.8, 0));
    w.add(box(1.8, 0.7, 2.8, paint, 0, 1.55, -0.5));
    w.add(box(1.82, 0.5, 2.6, new THREE.MeshLambertMaterial({ color: 0xd9ecf6 }), 0, 1.6, -0.5));
    w.add(box(1.84, 0.12, 2.9, white, 0, 1.92, -0.5));
    w.add(box(1.5, 0.06, 2.2, chrome, 0, 2.0, -0.5));
    w.add(box(0.7, 0.4, 1.0, toon(0x8a5a3a), -0.4, 2.22, -0.6), box(0.6, 0.3, 0.8, toon(PAL.red), 0.35, 2.17, -0.3));
    w.add(box(2.1, 0.16, 0.3, chrome, 0, 0.5, 2.45), box(2.1, 0.16, 0.3, chrome, 0, 0.5, -2.45));
    w.add(box(0.5, 0.1, 4.6, chrome, -1.01, 0.9, 0), box(0.5, 0.1, 4.6, chrome, 1.01, 0.9, 0));
    for (const s of [-1, 1]) for (const z of [-1.6, 1.6]) { w.add(cyl(0.38, 0.38, 0.3, dark, s * 1.0, 0.4, z, 12).rotateZ(Math.PI / 2)); w.add(cyl(0.2, 0.2, 0.32, chrome, s * 1.0, 0.4, z, 8).rotateZ(Math.PI / 2)); }
    w.add(sphere(0.14, glow(0xfff2c0, 0.8), -0.7, 0.9, 2.42, 8, 6), sphere(0.14, glow(0xfff2c0, 0.8), 0.7, 0.9, 2.42, 8, 6));
    w.position.set(13.5, heightAt(13.5, -1268), -1268);
    w.rotation.y = 0.12;
    w.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });
    g.add(w);
  }

  // ----- motel cabins in a row, each facing the track -----
  const motel = new THREE.Group();
  {
    const cols = [PAL.mint, PAL.pink, PAL.mustard, PAL.powder, PAL.cream, PAL.deepPink];
    const doorCols = [PAL.red, PAL.turquoise, PAL.burgundy, PAL.red, PAL.turquoise, PAL.burgundy];
    cols.forEach((c, i) => {
      const cab = new THREE.Group();
      cab.add(box(5.5, 3.2, 5.5, toon(c), 0, 1.6, 0));
      cab.add(box(6.1, 0.3, 6.1, white, 0, 3.35, 0));
      cab.add(box(6.2, 0.14, 6.2, toon(doorCols[i]), 0, 3.56, 0));
      cab.add(box(1.0, 2.2, 0.1, toon(doorCols[i]), -1.4, 1.1, 2.78));
      cab.add(box(1.6, 1.1, 0.1, glow(0xfff4e0, 0.8), 1.2, 1.9, 2.78));
      cab.add(box(1.8, 1.3, 0.06, white, 1.2, 1.9, 2.76));
      cab.add(box(1.6, 1.1, 0.1, glow(0xfff4e0, 0.8), 1.2, 1.9, 2.79));
      const n = signBoard(String(i + 1), 0.5, 0.5, { color: '#2a2c30', bg: '#fbf7f2', texW: 64, texH: 64, frame: PAL.dark }); n.position.set(-1.4, 2.6, 2.84); cab.add(n);
      cab.add(box(0.7, 0.06, 0.7, toon(doorCols[i]), 2.0, 0.5, 3.4), box(0.7, 0.6, 0.06, toon(doorCols[i]), 2.0, 0.8, 3.72));
      cab.add(cyl(0.04, 0.04, 2.2, dark, -2.4, 1.1, 3.4, 5), sphere(0.16, glow(0xfff0c8, 1.0), -2.4, 2.3, 3.4, 8, 6));
      cab.position.set(-i * 7.0, 0, 0);
      motel.add(cab);
    });
    // a long walkway slab in front and the MOTEL sign at the near end
    motel.add(box(42, 0.2, 8.5, lambert(0xe6dccc), -17.5, 0.02, 2.0));
    const pole = new THREE.Group();
    pole.add(cyl(0.12, 0.14, 8, toon(PAL.dark), 0, 4, 0, 8));
    const ms = signBoard('MOTEL', 3.2, 1.4, { color: '#fbf7f2', bg: '#b93a4c', border: '#fbf7f2', texW: 512, texH: 220, frame: PAL.red }); ms.position.set(0, 8.4, 0.1); pole.add(ms);
    const vac = signBoard('VACANCY', 2.6, 0.7, { color: '#2f4a5e', bg: '#fff0a0', texW: 512, texH: 130, frame: PAL.mustard }); vac.position.set(0, 7.2, 0.1); pole.add(vac);
    const arrow = cone(0.5, 1.2, toon(PAL.mustard), 0, 9.6, 0.1, 4); arrow.rotation.z = -Math.PI / 2; arrow.rotation.y = Math.PI / 4; pole.add(arrow);
    pole.position.set(6, 0, 5); motel.add(pole);
    motel.position.set(SPOTS.motel.x, heightAt(SPOTS.motel.x, SPOTS.motel.z), SPOTS.motel.z);
    motel.rotation.y = -Math.PI / 2;
    motel.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });
    g.add(motel);
    // three pastel vending machines side by side at the end of the row
    for (let i = 0; i < 3; i++) { const vx = 18, vz = SPOTS.motel.z - 44 - i * 1.3; g.add(box(1.0, 1.9, 0.8, toon([PAL.pink, PAL.mint, PAL.powder][i]), vx, heightAt(vx, vz) + 0.95, vz)); g.add(box(0.06, 1.0, 0.6, glow(0xfff8e0, 0.9), vx - 0.5, heightAt(vx, vz) + 1.1, vz)); }
  }

  // ----- the crater with a rope around it -----
  const craterY = heightAt(SPOTS.crater.x, SPOTS.crater.z);
  {
    const ring = new THREE.Group();
    const R = SPOTS.crater.r + 2.5;
    const rimY = heightAt(SPOTS.crater.x + R, SPOTS.crater.z);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; ring.add(cyl(0.06, 0.07, 1.0, white, Math.cos(a) * R, rimY + 0.5, Math.sin(a) * R, 6)); }
    const rope = mesh(new THREE.TorusGeometry(R, 0.035, 5, 48), toon(0x8a6a4a), 0, rimY + 0.9, 0);
    rope.rotation.x = Math.PI / 2; ring.add(rope);
    ring.position.set(SPOTS.crater.x, 0, SPOTS.crater.z);
    g.add(ring);
    const s = signPost('METEORITE', 2.4, 0.7, 1.6, 0x8a7a6a, { color: '#b93a4c', bg: '#fbf7f2', border: '#b93a4c', texW: 512, texH: 130, sub: 'do not touch', frame: PAL.white });
    s.position.set(SPOTS.crater.x - R - 1.5, heightAt(SPOTS.crater.x - R - 1.5, SPOTS.crater.z), SPOTS.crater.z); s.rotation.y = -Math.PI / 2; g.add(s);
    // the meteorite itself in the crater floor
    g.add(mesh(new THREE.DodecahedronGeometry(0.55, 0), toon(0x3a3238), SPOTS.crater.x, craterY + 0.3, SPOTS.crater.z));
  }

  // ----- observatory on its rise, on the left -----
  const observatory = new THREE.Group();
  {
    observatory.add(cyl(5.6, 5.9, 5.2, cream, 0, 2.6, 0, 20));
    observatory.add(cyl(6.1, 6.1, 0.4, white, 0, 5.4, 0, 20));
    const dome = mesh(new THREE.SphereGeometry(5.7, 22, 12, 0, TAU, 0, Math.PI / 2), white, 0, 5.6, 0); dome.castShadow = true; observatory.add(dome);
    const slit = box(0.7, 5.6, 0.5, dark, 0, 8.4, 4.4); slit.rotation.x = -0.7; observatory.add(slit);
    observatory.add(box(6, 3.2, 4, cream, 0, 1.6, 6.5));
    observatory.add(box(6.4, 0.3, 4.4, toon(PAL.powder), 0, 3.3, 6.5));
    observatory.add(box(1.2, 2.2, 0.1, glow(0xfff0d8, 0.8), 0, 1.1, 8.55));
    const s = signBoard('OBSERVATORY', 4.0, 0.7, { color: '#2f4a5e', bg: '#fbf7f2', border: '#2f4a5e', texW: 512, texH: 100, frame: PAL.powder }); s.position.set(0, 2.9, 8.56); observatory.add(s);
    observatory.position.set(SPOTS.observatory.x, heightAt(SPOTS.observatory.x, SPOTS.observatory.z), SPOTS.observatory.z);
    observatory.rotation.y = Math.PI / 2;
    g.add(observatory);
  }

  // ----- water tower on the left -----
  {
    const t = new THREE.Group();
    const steel = toon(0x8a8a90);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = cyl(0.1, 0.14, 9, steel, sx * 1.7, 4.5, sz * 1.7, 6); leg.rotation.z = -sx * 0.06; leg.rotation.x = sz * 0.06; t.add(leg); }
    t.add(cyl(2.6, 2.6, 4.0, toon(PAL.mint), 0, 11, 0, 16));
    t.add(cone(2.8, 1.4, toon(PAL.red), 0, 13.7, 0, 16));
    const n = signBoard('ASTEROID CITY', 4.4, 0.9, { color: '#7a2a36', bg: '#a8d8c8', texW: 512, texH: 100, frame: PAL.mint }); n.position.set(0, 11, 2.62); t.add(n);
    t.position.set(-24, heightAt(-24, -1250), -1250);
    t.rotation.y = Math.PI / 2;
    g.add(t);
  }

  // ----- a pale mushroom cloud far off over the western mesa (they test out there) -----
  {
    const m = new THREE.Group();
    const mat = toon(0xebe0dc, { transparent: true, opacity: 0.9 });
    m.add(cyl(4, 7, 44, mat, 0, 22, 0, 12));
    const cap = sphere(17, mat, 0, 46, 0, 14, 10); cap.scale.y = 0.7; m.add(cap);
    m.add(mesh(new THREE.TorusGeometry(14, 4, 8, 20), mat, 0, 38, 0).rotateX(Math.PI / 2));
    m.position.set(-235, 26, -1520);
    g.add(m);
  }

  // ----- telegraph poles in pairs and cactus rows -----
  {
    const pl = pairs(heightAt, 7.4, -1170, -1690, 40, (x, z) => !(x > 0 && Math.abs(z - SPOTS.citySign.z) < 8));
    const pole = new THREE.CylinderGeometry(0.1, 0.13, 7.5, 6); pole.translate(0, 3.75, 0);
    const bar = new THREE.BoxGeometry(1.8, 0.12, 0.12); bar.translate(0, 7.0, 0);
    const bar2 = new THREE.BoxGeometry(1.4, 0.12, 0.12); bar2.translate(0, 6.4, 0);
    g.add(instancedParts([pole, bar, bar2], toon(0x7a6a5a), pl, true));
  }
  {
    const trunk = new THREE.CylinderGeometry(0.28, 0.36, 3.2, 8); trunk.translate(0, 1.6, 0);
    const top = new THREE.SphereGeometry(0.28, 8, 6); top.translate(0, 3.2, 0);
    const armL = new THREE.CylinderGeometry(0.17, 0.19, 1.0, 7); armL.rotateZ(Math.PI / 2); armL.translate(-0.55, 1.6, 0);
    const armLu = new THREE.CylinderGeometry(0.17, 0.19, 1.3, 7); armLu.translate(-1.0, 2.25, 0);
    const armR = new THREE.CylinderGeometry(0.16, 0.18, 0.8, 7); armR.rotateZ(Math.PI / 2); armR.translate(0.5, 2.1, 0);
    const armRu = new THREE.CylinderGeometry(0.16, 0.18, 1.0, 7); armRu.translate(0.85, 2.6, 0);
    const parts = [trunk, top, armL, armLu, armR, armRu];
    const busy = (x: number, z: number) => x > 0 && ((Math.abs(z - SPOTS.citySign.z) < 8) || (z < SPOTS.diner.z + 12 && z > SPOTS.motel.z - 48) || Math.abs(z - SPOTS.crater.z) < 18);
    const rows: Placement[] = [];
    for (let z = -1166; z > -1695; z -= 10) for (const s of [-1, 1]) { const x = s * 16; if (busy(x, z)) continue; rows.push({ x, y: heightAt(x, z), z, scale: rng.range(0.9, 1.15), rot: rng.range(0, TAU) }); }
    const wild = scatter(rng, 220, -220, 220, -1700, -1160, (x, z) => Math.abs(x) > 19 && !busy(x, z) && far(x, z, SPOTS.observatory.x, SPOTS.observatory.z, 14) && far(x, z, SPOTS.crater.x, SPOTS.crater.z, 18), heightAt, [0.6, 1.5]);
    const mat = toon(0xffffff);
    g.add(instancedParts(parts, mat, rows.concat(wild), true));
    const cactus = g.children[g.children.length - 1] as THREE.InstancedMesh;
    const c = new THREE.Color();
    for (let i = 0; i < rows.length + wild.length; i++) { c.setHex([0x7fa88a, 0x8fb896, 0x6f9a7e][i % 3]); cactus.setColorAt(i, c); }
    cactus.instanceColor!.needsUpdate = true;
    // small round barrel cacti and pale pebbles
    const barrel = new THREE.SphereGeometry(0.4, 8, 6); barrel.scale(1, 0.8, 1); barrel.translate(0, 0.32, 0);
    g.add(instanced(barrel, toon(0x9fb88a), scatter(rng, 260, -120, 120, -1700, -1160, (x, z) => Math.abs(x) > 6 && !busy(x, z), heightAt, [0.6, 1.4])));
    const pebble = new THREE.DodecahedronGeometry(0.3, 0); pebble.translate(0, 0.15, 0);
    g.add(instanced(pebble, toon(0xe0c8b4), scatter(rng, 400, -160, 160, -1700, -1160, (x, z) => Math.abs(x) > 4 && !busy(x, z), heightAt, [0.5, 1.8])));
  }
  return { group: g, citySign, diner, motel, observatory, craterY };
}

// ---------- region 4: the sea ----------
export function buildSea(rng: Rng, heightAt: HeightFn, trackPoint: TrackPointFn) {
  const g = new THREE.Group();
  const white = toon(PAL.white), dark = toon(PAL.dark);
  // kerb stones both sides of the causeway
  {
    const pl: Placement[] = [];
    for (let z = -1700; z > -2172; z -= 2.6) for (const s of [-1, 1]) pl.push({ x: s * 3.7, y: trackPoint(z).y - 0.45, z, scale: 1, rot: 0 });
    const kerb = new THREE.BoxGeometry(0.6, 0.5, 2.4); kerb.translate(0, 0.25, 0);
    g.add(instanced(kerb, lambert(0xe3dccf), pl));
  }
  // mint lamps in pairs along the causeway
  g.add(lampPosts(pairs((_x, z) => trackPoint(z).y - 0.45, 4.4, -1720, -2170, 40), { height: 3.6, color: PAL.mint, lamp: 0xfff0c8, head: 'globe' }));

  // ----- buoys in pink and white -----
  {
    const pl = scatter(rng, 40, -170, 170, -2180, -1720, (x, z) => Math.abs(x) > 14 && far(x, z, SPOTS.island.x, SPOTS.island.z, 22) && far(x, z, SPOTS.belafonte.x, SPOTS.belafonte.z, 34) && far(x, z, SPOTS.sub.x, SPOTS.sub.z, 10), () => 0.1, [0.8, 1.3]);
    const body = new THREE.SphereGeometry(0.6, 10, 8); body.translate(0, 0.2, 0);
    const tip = new THREE.ConeGeometry(0.3, 0.9, 8); tip.translate(0, 1.1, 0);
    g.add(instancedParts([body, tip], toon(0xffffff), pl));
    const im = g.children[g.children.length - 1] as THREE.InstancedMesh;
    const c = new THREE.Color();
    for (let i = 0; i < pl.length; i++) { c.setHex(i % 2 ? PAL.pink : PAL.white); im.setColorAt(i, c); }
    im.instanceColor!.needsUpdate = true;
  }

  // ----- a small jetty on the left for the yellow submarine -----
  {
    const j = new THREE.Group();
    const wood = toon(0xb08a60);
    j.add(box(2.2, 0.2, 9, wood, -8.5, 0.9, 0));
    for (const z of [-4, 0, 4]) for (const x of [-9.4, -7.6]) j.add(cyl(0.12, 0.14, 2.4, wood, x, 0, z, 6));
    j.add(box(0.5, 1.2, 0.5, white, -12.5, 1.4, 4.2), sphere(0.2, glow(0xff8a6a, 1.0), -12.5, 2.15, 4.2, 8, 6));
    for (const z of [-4, 0, 4]) j.add(box(0.14, 0.9, 0.14, wood, -9.6, 1.4, z));
    j.add(box(0.06, 0.06, 9, wood, -9.6, 1.85, 0));
    j.add(box(5.0, 0.2, 2.0, wood, -5.5, 0.9, 0));
    j.position.set(0, trackPoint(SPOTS.sub.z).y - 0.45 - 0.5, SPOTS.sub.z + 2);
    g.add(j);
  }

  // ----- the lighthouse island -----
  const lighthouse = new THREE.Group();
  const islandY = heightAt(SPOTS.island.x, SPOTS.island.z);
  {
    const stripes = canvasTexture(64, 256, (c, w, h) => { for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#fbf7f2' : '#b93a4c'; c.fillRect(0, (i * h) / 6, w, h / 6); } });
    const tower = mesh(new THREE.CylinderGeometry(1.5, 2.1, 14, 16), new THREE.MeshLambertMaterial({ map: stripes }), 0, 7, 0);
    tower.castShadow = true; lighthouse.add(tower);
    lighthouse.add(cyl(2.2, 2.2, 0.4, white, 0, 14.2, 0, 16));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; lighthouse.add(cyl(0.04, 0.04, 0.9, dark, Math.cos(a) * 2.1, 14.85, Math.sin(a) * 2.1, 4)); }
    lighthouse.add(mesh(new THREE.TorusGeometry(2.1, 0.04, 4, 24), dark, 0, 15.3, 0).rotateX(Math.PI / 2));
    lighthouse.add(cyl(1.3, 1.3, 1.9, new THREE.MeshLambertMaterial({ color: 0xcfe9f4, transparent: true, opacity: 0.45 }), 0, 15.4, 0, 12));
    const lamp = sphere(0.55, glow(0xfff0b0, 1.6), 0, 15.4, 0, 10, 8); lighthouse.add(lamp);
    lighthouse.add(cone(1.6, 1.2, toon(PAL.red), 0, 16.9, 0, 12));
    lighthouse.add(sphere(0.2, toon(PAL.brass), 0, 17.6, 0, 6, 5));
    lighthouse.add(box(1.4, 2.2, 0.1, glow(0xfff0d8, 0.6), 0, 1.1, 2.1));
    // keeper's cottage and a bench, a flagpole
    lighthouse.add(box(5, 3, 4, toon(PAL.cream), 5, 1.5, 0));
    lighthouse.add(mesh(roofGeometry(5, 4, 2, 0.4), toon(PAL.red), 5, 3, 0));
    lighthouse.add(box(1.0, 1.0, 0.1, glow(0xfff0d8, 0.8), 5, 1.6, 2.05));
    lighthouse.add(cyl(0.04, 0.04, 5, dark, -4, 2.5, 1, 5), mesh(new THREE.PlaneGeometry(1.4, 0.9), toon(PAL.powder, { side: THREE.DoubleSide }), -3.3, 4.6, 1));
    lighthouse.position.set(SPOTS.island.x, islandY - 0.2, SPOTS.island.z);
    lighthouse.rotation.y = -Math.PI / 2;
    g.add(lighthouse);
    const pl = new THREE.PointLight(0xfff0b0, 40, 90, 1.4);
    pl.position.set(SPOTS.island.x, islandY + 15.4, SPOTS.island.z);
    g.add(pl);
    // a stone ring around the island shore
    const stones = scatter(rng, 40, SPOTS.island.x - 16, SPOTS.island.x + 16, SPOTS.island.z - 16, SPOTS.island.z + 16, (x, z) => { const d = Math.hypot(x - SPOTS.island.x, z - SPOTS.island.z); return d > 9 && d < 14; }, (x, z) => heightAt(x, z), [0.8, 1.8]);
    const stone = new THREE.DodecahedronGeometry(0.5, 0); stone.translate(0, 0.2, 0);
    g.add(instanced(stone, toon(0x9a948c), stones));
  }

  // ----- Port-au-Patois: the harbour station at the end of the line -----
  const station = buildStation('PORT-AU-PATOIS', 'end of the line', SPOTS.harbour.z, heightAt, trackPoint, { wall: 0xfbf8f4, trim: 0x2f6f8a, roof: PAL.powder, len: 34, houseSide: 1 });
  g.add(station.group);
  {
    // buffer stop across the end of the track
    const bz = SPOTS.harbour.z - 24;
    const by = trackPoint(bz).y;
    const stripes = canvasTexture(128, 32, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fbf7f2' : '#b93a4c'; c.fillRect(i * 16, 0, 16, 32); } });
    g.add(box(2.6, 0.9, 0.4, new THREE.MeshLambertMaterial({ map: stripes }), 0, by + 0.8, bz));
    for (const s of [-1, 1]) g.add(box(0.3, 1.2, 1.6, dark, s * 1.0, by + 0.6, bz + 0.8));
    // cranes in a symmetrical pair
    for (const s of [-1, 1]) {
      const c = new THREE.Group();
      c.add(box(2.4, 0.6, 2.4, toon(0x2f6f8a), 0, 0.3, 0));
      c.add(cyl(0.3, 0.4, 9, toon(PAL.mustard), 0, 5.1, 0, 8));
      const jib = cyl(0.14, 0.2, 9, toon(PAL.mustard), 0, 8.8, 3.6, 6); jib.rotation.x = 1.0; c.add(jib);
      c.add(cyl(0.02, 0.02, 4, dark, 0, 5.0, 7.2, 4), box(0.6, 0.4, 0.6, dark, 0, 2.8, 7.2));
      c.add(box(1.2, 1.2, 1.2, toon(PAL.cream), 0, 9.6, -0.4), box(0.9, 0.7, 0.06, glow(0xe0f4ff, 0.8), 0, 9.7, 0.22));
      const cx = s * 16, cz = SPOTS.harbour.z + 18;
      c.position.set(cx, heightAt(cx, cz), cz);
      c.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(c);
      // crate stacks beside each crane
      for (let i = 0; i < 4; i++) g.add(box(1.2, 1.2, 1.2, toon([0xd9b070, 0xc9a060, 0xe0c090, 0xb89050][i]), cx + (i % 2) * 1.3 - 0.6, heightAt(cx, cz) + 0.6 + Math.floor(i / 2) * 1.2, cz - 4));
    }
    // palms in a pair on the harbour front
    const palms: Placement[] = [];
    for (const s of [-1, 1]) for (const dz of [-15, 15]) { const x = s * 9.5, z = SPOTS.harbour.z + dz; palms.push({ x, y: heightAt(x, z), z, scale: 1.1, rot: s * 0.4 }); }
    g.add(instancedTrees({ trunk: 0x9a7a5a, canopy: [0x6fa383, 0x7fb08e], shape: 'palm' }, palms, rng, true));
    // harbour walls and a pair of little pastel boats moored at the end
    for (const s of [-1, 1]) {
      g.add(box(3, 2.2, 44, lambert(0xd0c6b6), s * 24, 0.4, SPOTS.harbour.z + 42));
      const b = new THREE.Group();
      const hull = sphere(1, toon(s > 0 ? PAL.powder : PAL.pink), 0, 0.2, 0, 12, 8); hull.scale.set(1.0, 0.5, 2.6); b.add(hull);
      b.add(box(1.4, 0.5, 2.0, white, 0, 0.7, 0.2), cyl(0.04, 0.04, 3.4, dark, 0, 2.2, -0.4, 5));
      b.add(mesh(new THREE.PlaneGeometry(1.6, 0.8), toon(s > 0 ? PAL.pink : PAL.powder, { side: THREE.DoubleSide }), 0.8, 3.2, -0.4));
      b.position.set(s * 19.5, 0.1, SPOTS.harbour.z + 50);
      g.add(b);
    }
  }
  return { group: g, lighthouse, islandY, station };
}

/** Trees for the whole ride, chosen by region. */
export function buildTrees(rng: Rng, heightAt: HeightFn, trackDist: DistFn, dens: number) {
  const g = new THREE.Group();
  const funicularClear = (x: number, z: number) => segDist(x, z, SPOTS.pavilion.x - 5.5, SPOTS.pavilion.z - 5, -49, -326) > 7;
  // alps: snow-dusted pines in tidy rows near the track, then scattered up the slopes
  const alpOk = (x: number, z: number) => trackDist(x, z) > 12 && far(x, z, SPOTS.pavilion.x, SPOTS.pavilion.z, 12) && funicularClear(x, z) && !(Math.abs(x - SPOTS.hotel.x) < 30 && Math.abs(z - SPOTS.hotel.z) < 30) && Math.abs(z - SPOTS.station.z) > 24 && far(x, z, SPOTS.church.x, SPOTS.church.z, 10) && far(x, z, -14.5, -46, 5) && far(x, z, 14.5, -46, 5);
  const pine = { trunk: 0x5a4a44, canopy: [0x7fa892, 0x94b8a4, 0x6c9683], shape: 'cone' as const };
  {
    const rows: Placement[] = [];
    for (let z = -40; z > -595; z -= 11) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const x = s * (16 + k * 7); if (!alpOk(x, z)) continue; rows.push({ x, y: heightAt(x, z), z, scale: 1.05 + k * 0.12, rot: 0 }); }
    g.add(instancedTrees(pine, rows, rng, true));
    g.add(instancedTrees(pine, scatter(rng, Math.round(280 * dens), -280, 280, -640, 30, (x, z) => alpOk(x, z) && trackDist(x, z) > 38 && heightAt(x, z) < 75, heightAt, [0.9, 1.9]), rng, false));
  }
  // forest: autumn rows near the track, then a broad wood
  const forestOk = (x: number, z: number) => trackDist(x, z) > 11 && far(x, z, SPOTS.lake.x, SPOTS.lake.z, 34) && far(x, z, SPOTS.foxTree.x, SPOTS.foxTree.z, 13) && far(x, z, SPOTS.tower.x, SPOTS.tower.z, 7) && far(x, z, SPOTS.camp.x, SPOTS.camp.z, 9) && far(x, z, -8.6, -884, 4);
  const autumn = { trunk: 0x6a5040, canopy: [0xe0812e, 0xf2b53a, 0xc9552f, 0xf0c95a, 0xd9903a], shape: 'round' as const };
  const autumnBroad = { trunk: 0x6a5040, canopy: [0xd9773a, 0xe8a83a, 0xb84a2f, 0xe6c35a], shape: 'broad' as const };
  {
    const rows: Placement[] = [];
    for (let z = -612; z > -1142; z -= 9) for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { const x = s * (14 + k * 6.5); if (!forestOk(x, z)) continue; rows.push({ x, y: heightAt(x, z), z, scale: 1.0 + k * 0.15, rot: rng.range(0, TAU) }); }
    g.add(instancedTrees(autumn, rows, rng, true));
    g.add(instancedTrees(autumnBroad, scatter(rng, Math.round(320 * dens), -230, 230, -1170, -590, (x, z) => forestOk(x, z) && trackDist(x, z) > 24, heightAt, [0.9, 1.6]), rng, false));
    g.add(instancedTrees({ trunk: 0x4a3a34, canopy: [0x3f6b4a, 0x4e7a55], shape: 'cone' }, scatter(rng, Math.round(90 * dens), -230, 230, -1170, -590, (x, z) => forestOk(x, z) && trackDist(x, z) > 40, heightAt, [0.9, 1.5]), rng, false));
  }
  return g;
}
