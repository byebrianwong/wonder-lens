import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon, Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { css } from '../textures';
import { ATLAS, courtesanAtlas, MC } from './textures';

/**
 * Mendl's pastries. The Courtesan au chocolat is three choux of falling size, iced lavender, pistachio and
 * pink, with rings of piped white pearls where they meet and a cocoa bean on top. All its parts share one
 * painted atlas (textures.ts), so a whole tray, a whole conveyor line or the whole tower is one draw call.
 * A Courtesan is about 1 unit tall at scale 1, standing on its base at the origin.
 */

/** Map a sphere's UVs into one horizontal band of the atlas (canvas fractions, 0 at the top). */
function intoBand(geo: THREE.BufferGeometry, a: number, b: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const v = uv.getY(i);
    const cy = a + (1 - v) * (b - a);
    uv.setY(i, 1 - cy);
  }
  uv.needsUpdate = true;
  return geo;
}
/** Point every UV of a part at one row of the atlas (the white of the pearls, the brown of the bean). */
function atRow(geo: THREE.BufferGeometry, row: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - row);
  uv.needsUpdate = true;
  return geo;
}

/** A choux bun: a sphere, a little flatter underneath than on top. */
function puff(r: number, y: number, ws: number, hs: number, band: [number, number]) {
  const geo = new THREE.SphereGeometry(r, ws, hs);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const py = p.getY(i);
    const k = py >= 0 ? 0.8 : 0.6;
    // a slight bulge at the waist, where choux puff out
    const wx = 1 + 0.05 * Math.cos((py / r) * Math.PI * 0.5);
    p.setXYZ(i, p.getX(i) * wx, py * k + y, p.getZ(i) * wx);
  }
  geo.computeVertexNormals();
  return intoBand(geo, band[0], band[1]);
}

function pearls(ringR: number, y: number, beadR: number, n: number, seg: number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const b = new THREE.SphereGeometry(beadR, seg, Math.max(3, seg - 2));
    b.scale(1, 0.8, 1);
    b.translate(Math.cos(a) * ringR, y, Math.sin(a) * ringR);
    parts.push(atRow(b, ATLAS.white));
  }
  return parts;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** One Courtesan au chocolat as a single geometry (about 1 tall). `detail` 0 for crowds, 1 for close-ups. */
export function courtesanGeometry(detail: 0 | 1 = 0) {
  const key = `c${detail}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const ws = detail ? 32 : 14, hs = detail ? 22 : 9, bs = detail ? 8 : 4;
  const B = ATLAS.bands;
  const parts: THREE.BufferGeometry[] = [
    puff(0.36, 0.25, ws, hs, B[0]),
    puff(0.25, 0.62, ws, hs, B[1]),
    puff(0.165, 0.86, ws, hs, B[2]),
    ...pearls(0.235, 0.5, 0.036, detail ? 14 : 10, bs),
    ...pearls(0.15, 0.8, 0.026, detail ? 11 : 8, bs),
  ];
  const bean = new THREE.SphereGeometry(0.05, bs + 2, bs);
  bean.scale(0.9, 0.62, 1.45); bean.translate(0, 0.995, 0);
  parts.push(atRow(bean, ATLAS.choc));
  if (detail) {
    // a groove down the bean, as on a real cocoa bean
    const groove = new THREE.BoxGeometry(0.008, 0.012, 0.13); groove.translate(0, 1.02, 0);
    parts.push(atRow(groove, ATLAS.white));
  }
  // make every part indexed so they merge
  const merged = mergeGeometries(parts.map((g) => (g.index ? g : withIndex(g))), false)!;
  merged.computeBoundingSphere();
  geoCache.set(key, merged);
  return merged;
}
function withIndex(g: THREE.BufferGeometry) {
  const n = (g.attributes.position as THREE.BufferAttribute).count;
  g.setIndex(Array.from({ length: n }, (_, i) => i));
  return g;
}

let atlasMat: THREE.Material | null = null, atlasHi: THREE.Material | null = null;
/** The shared Courtesan material (cel shaded, with a warm rim). `hi` uses a bigger atlas for the hero pastries. */
export function courtesanMaterial(hi = false) {
  if (hi) return (atlasHi ??= charToon({ map: courtesanAtlas(1024), rim: 0.45, shade: 0xb0a0c8, emissive: new THREE.Color(0x1a1010) }));
  return (atlasMat ??= charToon({ map: courtesanAtlas(512), rim: 0.45, shade: 0xb0a0c8, emissive: new THREE.Color(0x1a1010) }));
}

/** A single Courtesan as a mesh, scaled. */
export function courtesan(s = 1, hi = false) {
  const m = new THREE.Mesh(courtesanGeometry(hi ? 1 : 0), courtesanMaterial(hi));
  m.scale.setScalar(s);
  return m;
}

/** Many Courtesans in one draw call. Each placement is [x, y, z, scale, yaw]. */
export function courtesanCrowd(places: Array<[number, number, number, number, number]>, hi = false) {
  const im = new THREE.InstancedMesh(courtesanGeometry(hi ? 1 : 0), courtesanMaterial(hi), places.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  places.forEach(([x, y, z, sc, yaw], i) => { m.compose(p.set(x, y, z), q.setFromAxisAngle(up, yaw), s.setScalar(sc)); im.setMatrixAt(i, m); });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

/**
 * The tower of Courtesans: rings of Courtesans stacked into a cone round a cake core, a spiral of piped
 * icing winding up it, crowned by one big Courtesan whose cocoa bean can pop up. Origin at the base of the
 * stack (the top of the turntable).
 */
export function courtesanTower(o: { baseR: number; rings: number; each: number; seed: number }) {
  const g = new THREE.Group();
  const rng = new Rng(o.seed);
  const places: Array<[number, number, number, number, number]> = [];
  const step = o.each * 0.78;
  let topY = 0;
  for (let k = 0; k < o.rings; k++) {
    const R = o.baseR * (1 - k / (o.rings + 0.6));
    const s = o.each * (1 - k * 0.035);
    const n = Math.max(5, Math.round((TAU * R) / (s * 0.72)));
    const off = rng.range(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      places.push([Math.cos(a) * R, k * step, Math.sin(a) * R, s * rng.range(0.94, 1.04), -a + rng.range(-0.3, 0.3)]);
    }
    topY = k * step + s;
  }
  const crowd = courtesanCrowd(places);
  crowd.castShadow = true;
  g.add(crowd);
  // the core: a cone of cream between the rings, so no gaps show
  const core = new THREE.Mesh(new THREE.ConeGeometry(o.baseR * 0.9, topY * 1.02, 28, 1, false), charToon({ color: 0xf2e4c8, rim: 0.3 }));
  core.position.y = topY * 0.51;
  g.add(core);
  // a spiral of white piped icing winding up the cone
  const pts: THREE.Vector3[] = [];
  const turns = 4.5, N = 220;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = t * turns * TAU, y = t * (topY - o.each * 0.6) + o.each * 0.55;
    const R = o.baseR * (1 - y / (topY + o.each * 0.9)) * 1.04 + o.each * 0.08;
    pts.push(new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R));
  }
  const spiral = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 360, o.each * 0.055, 6, false), charToon({ color: 0xfdf8f0, rim: 0.5, emissive: new THREE.Color(0x201c18) }));
  g.add(spiral);
  // the crown: one big Courtesan, its bean on a spring
  const crown = new THREE.Group();
  crown.position.y = topY - o.each * 0.35;
  const big = new THREE.Mesh(courtesanGeometry(1), courtesanMaterial(true));
  big.scale.setScalar(o.each * 2.2);
  crown.add(big);
  const bean = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), charToon({ color: 0x4a2416, rim: 0.5 }));
  bean.scale.set(0.9 * o.each * 2.2, 0.62 * o.each * 2.2, 1.45 * o.each * 2.2);
  const beanPivot = new THREE.Group();
  beanPivot.position.y = 0.995 * o.each * 2.2;
  beanPivot.add(bean);
  crown.add(beanPivot);
  g.add(crown);
  return { group: g, crowd, beanPivot, top: topY + o.each * 1.9 };
}

/** Sugar-glazed icing walls with piped white windows and pearls along each storey: one tile = 4 x 4 units. */
export function icedFacade(color: number, seed = 51) {
  const S = 256;
  const p = new Painter(S, S, seed).fill(css(color));
  const g = p.g;
  p.vgrad([[0, 'rgba(255,255,255,0.2)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.06)']]);
  // two windows per tile, piped round in white, with a sugar pane
  for (const x of [64, 192]) {
    g.fillStyle = '#fffaf2'; g.beginPath(); g.moveTo(x - 30, 200); g.lineTo(x - 30, 90); g.arc(x, 90, 30, Math.PI, 0); g.lineTo(x + 30, 200); g.closePath(); g.fill();
    g.fillStyle = css(MC.blue, 1.15); g.beginPath(); g.moveTo(x - 22, 194); g.lineTo(x - 22, 92); g.arc(x, 92, 22, Math.PI, 0); g.lineTo(x + 22, 194); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 6, 90, 6, 90);
    g.fillStyle = '#fffaf2'; g.fillRect(x - 2, 70, 4, 124); g.fillRect(x - 22, 140, 44, 4);
    for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(x - 32 + k * 8, 208, 4.5, 0, TAU); g.fill(); }
  }
  // pearls along the storey line
  g.fillStyle = '#fffaf2';
  for (let x = 4; x < S; x += 12) { g.beginPath(); g.arc(x, 18, 6, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 26, S, 4);
  return p.texture({ repeat: [1, 1] });
}
