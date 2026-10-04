import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { NEST, type Road } from '../layout';
import type { ScreenFx } from '../common';
import { GLSL_CAP, GLSL_NOISE, noise3, type SkyLight } from './shared';

/*
 * The Dragon's Nest: the ring of storm cloud round Laputa (Castle in the Sky).
 *
 * From outside it is a colossal slate-blue wall rising out of the cloud sea and spreading out at the top
 * into a broad anvil that the Catbus flies under for the last stretch, with dark bands spiralling round
 * it and climbing, billows breaking up its edges and hanging from the anvil, a golden lining where the
 * low sun is behind it, wind streaks racing along its face and lightning flickering all through it.
 * From inside (the Laputa scene) its inner face opens out into a wide bowl, so from the island the rim
 * is only about 30-35 degrees up and a level view has open blue sky at the top; that face is white-cream
 * where the sun reaches and a pale sky-blue-lilac in shade, darker only low down by the cloud floor.
 *
 * It is built cheaply: two opaque cylinder shells (outer and inner face) pushed into big lumps, rings of
 * billows on the outside and a crown along the top (merged into two meshes), one mesh of thin streaks,
 * and four reusable lightning bolts. Lightning lights the cloud from inside through up to six glowing
 * spots that every storm material adds, plus random patches of the outer face that flash for an instant.
 *
 * Built once and added to the scene by the sky set (not to its group), so the Laputa set sees it too.
 */

/** The shells end here, tucked under the crown of billows along the anvil's edge. */
export const TOP = 230;
/** Radius of the outer face at a height: straight up to y 110, then spreading out into a broad anvil (328 at the top). */
export const rOut = (y: number) => NEST.outer + 150 * Math.pow(clamp((y - 110) / 120, 0, 1), 1.4);
/** Radius of the inner face: it opens out into a wide bowl above y 60 (300 at the top), always inside the outer face. */
export const rIn = (y: number) => NEST.inner + 160 * Math.pow(clamp((y - 60) / 170, 0, 1), 1.5);
const rMid = (y: number) => (rIn(y) + rOut(y)) / 2;
/** Angle round the nest (from +x towards +z) where the path crosses its wall. */
export const CROSS = Math.atan2(-1198 - NEST.z, 0 - NEST.x);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Rounded heads with creases between them, 0..1, from 3D noise (so there is no seam round the ring). */
function lumps(x: number, y: number, z: number, seed: number) {
  const a = noise3(x * 0.016 + seed, y * 0.019, z * 0.016 - seed);
  const b = noise3(x * 0.043 - seed, y * 0.05 + 3.1, z * 0.043 + seed);
  const c = noise3(x * 0.09 + seed, y * 0.1 - 1.7, z * 0.09);
  return Math.sqrt(Math.max(0, a * 0.55 + b * 0.3 + c * 0.15 - 0.22) / 0.78);
}

/** One face of the wall: a cylinder round the nest's centre, pushed into lumps towards whoever sees it. */
function shellGeometry(o: { inner: boolean; ys: number[]; seg: number; amp: (y: number) => number; seed: number }) {
  const cols = o.seg + 1, rows = o.ys.length;
  const pos = new Float32Array(cols * rows * 3), bul = new Float32Array(cols * rows);
  const out = o.inner ? -1 : 1;
  for (let j = 0; j < rows; j++) {
    const y = o.ys[j];
    // the top edge tucks in under the crown of billows
    const tuck = smoothstep(TOP - 34, TOP, y);
    const r0 = lerp(o.inner ? rIn(y) : rOut(y), rMid(y), tuck * 0.85);
    for (let i = 0; i < cols; i++) {
      const th = ((i % o.seg) / o.seg) * TAU;
      const cx = Math.cos(th), cz = Math.sin(th);
      const l = lumps(cx * r0, y, cz * r0, o.seed);
      let amp = o.amp(y) * (1 - tuck * 0.6);
      // the outer face is smooth where the path goes in, so the camera meets it where the screen is covered
      if (!o.inner) amp *= 1 - (1 - smoothstep(0.07, 0.2, Math.abs(wrap(th - CROSS)))) * (1 - smoothstep(100, 150, y));
      const r = r0 + out * amp * l;
      const k = j * cols + i;
      pos[k * 3] = cx * r; pos[k * 3 + 1] = y; pos[k * 3 + 2] = cz * r;
      bul[k] = l;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < o.seg; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBulge', new THREE.BufferAttribute(bul, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // faces must point at the viewer: outwards for the outer face, inwards for the inner
  const n = g.attributes.normal as THREE.BufferAttribute;
  const mid = Math.floor(rows / 2) * cols + Math.floor(o.seg / 4);
  const radial = n.getX(mid) * pos[mid * 3] + n.getZ(mid) * pos[mid * 3 + 2];
  if (radial * out < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.setIndex(idx); g.computeVertexNormals();
  }
  // the first and last columns are the same points: give them the same normal so there is no seam
  const nn = g.attributes.normal as THREE.BufferAttribute;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let j = 0; j < rows; j++) {
    const a = j * cols, b = a + o.seg;
    v.fromBufferAttribute(nn, a).add(w.fromBufferAttribute(nn, b)).normalize();
    nn.setXYZ(a, v.x, v.y, v.z); nn.setXYZ(b, v.x, v.y, v.z);
  }
  g.computeBoundingSphere();
  return g;
}

type Puff = [number, number, number, number];
/**
 * Puffs merged into one cloud geometry with the attributes the puff shader wants: a "centre-out" normal
 * (from the nearest point on a ring through the mass, so a long ring of puffs is shaded as one tube) and
 * a 0..1 height.
 */
function puffMass(puffs: Puff[], ring: { r: number; y: number }, y0: number, y1: number) {
  const g = mergeGeometries(puffs.map(([x, y, z, r]) => {
    const p = new THREE.IcosahedronGeometry(r, 2);
    p.deleteAttribute('uv');
    p.translate(x, y, z);
    return p;
  }), false)!;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const cn = new Float32Array(pos.count * 3), ch = new Float32Array(pos.count);
  const p = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const a = Math.atan2(p.z, p.x);
    c.set(Math.cos(a) * ring.r, ring.y, Math.sin(a) * ring.r);
    c.subVectors(p, c).normalize();
    c.y += 0.3;
    c.normalize();
    cn.set([c.x, c.y, c.z], i * 3);
    ch[i] = clamp((p.y - y0) / (y1 - y0), 0, 1);
  }
  g.setAttribute('cloudN', new THREE.BufferAttribute(cn, 3));
  g.setAttribute('cloudH', new THREE.BufferAttribute(ch, 1));
  return g;
}

/** A forked lightning bolt one unit long, hanging down from the origin in the xy plane: a bright core and a soft halo. */
function boltGeometry(rng: Rng) {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const quad = (ax: number, ay: number, bx: number, by: number, w: number, c: number) => {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    const px = (-dy / l) * w * 0.5, py = (dx / l) * w * 0.5;
    const k = pos.length / 3;
    pos.push(ax - px, ay - py, 0, ax + px, ay + py, 0, bx - px, by - py, 0, bx + px, by + py, 0);
    for (let i = 0; i < 4; i++) col.push(c, c, c);
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  };
  const channel = (x: number, y: number, len: number, steps: number, w: number, lean: number, depth: number) => {
    for (let i = 0; i < steps; i++) {
      const nx = x + lean * len / steps + rng.range(-0.075, 0.075) * len, ny = y - (len / steps) * rng.range(0.7, 1.3);
      quad(x, y, nx, ny, w * 3.6, 0.22);
      quad(x, y, nx, ny, w, 1);
      if (depth < 2 && i < steps - 2 && rng.chance(0.2)) channel(nx, ny, len * rng.range(0.25, 0.45), Math.max(3, steps >> 1), w * 0.6, rng.sign() * rng.range(0.2, 0.5), depth + 1);
      x = nx; y = ny;
    }
  };
  channel(0, 0, 1, 16, 0.013, rng.range(-0.1, 0.1), 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const GLOWS = 6;

const WALL_VERT = /* glsl */ `
  attribute float aBulge;
  varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying float vBulge; varying float vFogDepth;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz; vLocal = position; vBulge = aBulge;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

/** Brightness cap, golden lining, lightning glow and fog, shared by the wall and the billows. */
const STORM_COMMON = /* glsl */ `
  uniform vec3 uSunDir; uniform vec3 uRim; uniform vec3 uFogColor; uniform float uFogDensity;
  uniform vec4 uBolt[${GLOWS}]; uniform vec3 uBoltCol; uniform vec2 uCap;
  vec3 stormFinish(vec3 col, vec3 n, vec3 world, float fogDepth, float puff, float flick) {
    // the body of the cloud stays below the bloom threshold (the sunny inside is allowed brighter than the storm)
    col = capLum(col, uCap.x, uCap.y);
    // a golden lining along the edges where the sun is behind the cloud
    vec3 V = normalize(cameraPosition - world);
    float edge = 1.0 - clamp(abs(dot(n, V)), 0.0, 1.0);
    float back = pow(clamp(dot(-V, uSunDir), 0.0, 1.0), 5.0);
    col += uRim * (pow(edge, 3.0) * 0.12 + pow(edge, 2.0) * back * 2.6);
    // lightning lights the cloud from inside
    float g = 0.0;
    for (int i = 0; i < ${GLOWS}; i++) { vec3 dv = world - uBolt[i].xyz; g += uBolt[i].w * exp(-dot(dv, dv) / 16000.0); }
    col += uBoltCol * (g * (0.5 + puff) + flick);
    // the lining and the lightning may bloom a little, but never blow out
    col = capLum(col, 1.05, 1.7);
    float f = 1.0 - exp(-uFogDensity * uFogDensity * fogDepth * fogDepth);
    return mix(col, uFogColor, clamp(f, 0.0, 1.0));
  }
`;

const WALL_FRAG = /* glsl */ `
  uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uDeep; uniform vec3 uBand;
  uniform float uSpin; uniform float uTime; uniform float uFlicker;
  varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying float vBulge; varying float vFogDepth;
  ${GLSL_NOISE}
  ${GLSL_CAP}
  ${STORM_COMMON}
  void main() {
    vec3 n = normalize(vN);
    // the storm turns slowly: the painted pattern is sampled in a frame that turns with it
    float c = cos(uSpin), s = sin(uSpin);
    vec3 p = vec3(c * vLocal.x - s * vLocal.z, vLocal.y, s * vLocal.x + c * vLocal.z);
    float theta = atan(p.z, p.x);
    float puff = noise3(p * 0.022) * 0.55 + noise3(p * 0.061 + 4.7) * 0.3 + noise3(p * 0.15 + 9.1) * 0.15;
    // a wide soft terminator, nudged by the painted puffs
    float d = dot(n, uSunDir) + (puff - 0.5) * 0.6;
    float lit = smoothstep(-0.35, 0.65, d);
    vec3 col = mix(uShade, uLit, lit);
    float flick = 0.0;
  #ifdef INNER
    // darker bands only low down, where the wall meets the cloud floor of the eye, drifting slowly
    float low = 1.0 - smoothstep(0.0, 75.0, vWorld.y);
    float band = smoothstep(0.3, 0.85, 0.5 + 0.5 * sin(vWorld.y * 0.09 + puff * 4.0 + sin(theta * 3.0) * 1.2 - uTime * 0.05));
    col = mix(col, uDeep, clamp(low * (0.35 + 0.45 * band), 0.0, 1.0));
    // blue sky light on the tops of the billows
    col += uBand * 0.18 * clamp(n.y, 0.0, 1.0);
  #else
    // dark bands wound round the ring, turning and climbing; thin pale bands between them
    float wind = 9.0 * theta + vWorld.y * 0.03 - uTime * 0.35 + puff * 2.6;
    float dark = smoothstep(0.45, 0.85, 0.5 + 0.5 * sin(wind));
    float pale = smoothstep(0.7, 0.95, 0.5 + 0.5 * sin(2.0 * wind + 1.3 + puff * 3.0));
    col = mix(col, uDeep, dark * 0.6);
    col = mix(col, uBand, pale * (1.0 - dark) * 0.4);
    col = mix(col, uDeep, (1.0 - smoothstep(30.0, 200.0, vWorld.y)) * 0.5);
    // lightning flickering all through the cloud: patches about 90 units across light up for an instant
    vec3 cp = p * 0.011;
    vec3 ci = floor(cp);
    float tick = floor(uTime * 9.0);
    float on = step(0.955, hash13(ci + vec3(tick * 0.137, tick * 0.071, tick * 0.029)));
    float blob = smoothstep(0.35, 0.85, noise3(p * 0.03 + ci * 3.1)) * (1.0 - smoothstep(0.2, 0.5, length(fract(cp) - 0.5)));
    flick = uFlicker * on * blob;
  #endif
    // creases between the lumps sit in their own shade (softly on the sunny inside); the tops of lumps catch the sky
  #ifdef INNER
    col *= mix(0.86, 1.0, smoothstep(0.0, 0.6, vBulge));
  #else
    col *= mix(0.72, 1.0, smoothstep(0.0, 0.6, vBulge));
  #endif
    col += uShade * 0.15 * clamp(n.y, 0.0, 1.0);
    gl_FragColor = vec4(stormFinish(col, n, vWorld, vFogDepth, puff, flick), 1.0);
  }
`;

const PUFF_VERT = /* glsl */ `
  attribute vec3 cloudN; attribute float cloudH;
  varying vec3 vN; varying vec3 vWorld; varying float vH; varying float vFogDepth;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normalize(normal * 0.5 + cloudN * 0.8));
    vH = cloudH; vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const PUFF_FRAG = /* glsl */ `
  uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uDeep;
  varying vec3 vN; varying vec3 vWorld; varying float vH; varying float vFogDepth;
  ${GLSL_CAP}
  ${STORM_COMMON}
  void main() {
    vec3 n = normalize(vN);
    float d = dot(n, uSunDir);
    float lit = smoothstep(-0.45, 0.55, d) * 0.8 + smoothstep(0.35, 0.8, d) * 0.2;
    vec3 col = mix(uShade, uLit, lit);
    col *= mix(0.72, 1.0, smoothstep(0.0, 0.45, vH));
    col = mix(col, uDeep, (1.0 - smoothstep(30.0, 260.0, vWorld.y)) * 0.55);
    gl_FragColor = vec4(stormFinish(col, n, vWorld, vFogDepth, 0.5, 0.0), 1.0);
  }
`;

export interface Nest {
  /** add to the scene, not to a set's group */
  group: THREE.Group;
  /** an invisible stand-in for the outside of the wall, for photo line-of-sight checks (blocks only from outside) */
  proxy: THREE.Mesh;
  /** called when a bolt strikes (for the photo pose) */
  onBolt: (() => void) | null;
  /** how strongly the nearest bolt lights things this frame (0 to about 0.35) */
  flashLevel: number;
  /** a burst of lightning on the face the camera sees (the ocarina) */
  storm(): void;
  update(dt: number, t: number, cam: THREE.Vector3, light: SkyLight, fx: ScreenFx): void;
}

export function buildNest(road: Road, lowDetail: boolean): Nest {
  const rng = new Rng(8641);
  const group = new THREE.Group();
  group.position.set(NEST.x, 0, NEST.z);

  // ---------- materials: shared light and lightning, separate colours for the outside, the inside and the billows ----------
  const glow4 = Array.from({ length: GLOWS }, () => new THREE.Vector4());
  const common = {
    uSunDir: { value: new THREE.Vector3(0.5, 0.08, -0.86).normalize() }, uRim: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.001 },
    uBolt: { value: glow4 }, uBoltCol: { value: new THREE.Color(0.75, 0.82, 1.0).multiplyScalar(1.7) },
    uSpin: { value: 0 }, uTime: { value: 0 }, uFlicker: { value: 0 },
  };
  const colours = () => ({ uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uBand: { value: new THREE.Color() }, uCap: { value: new THREE.Vector2(0.58, 0.8) } });
  const outC = colours(), inC = colours(), puffC = colours();
  const outerMat = new THREE.ShaderMaterial({ uniforms: { ...common, ...outC }, vertexShader: WALL_VERT, fragmentShader: WALL_FRAG });
  const innerMat = new THREE.ShaderMaterial({ uniforms: { ...common, ...inC }, vertexShader: WALL_VERT, fragmentShader: WALL_FRAG, defines: { INNER: '' } });
  const puffMat = new THREE.ShaderMaterial({ uniforms: { ...common, ...puffC }, vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG });

  // ---------- the two faces of the wall ----------
  const seg = lowDetail ? 120 : 180, step = lowDetail ? 9 : 6;
  const ysOut: number[] = [], ysIn: number[] = [-240, -170, -110, -60, -25];
  for (let y = 14; y < TOP; y += step) ysOut.push(y);
  ysOut.push(TOP);
  for (let y = 0; y < TOP; y += step) ysIn.push(y);
  ysIn.push(TOP);
  const outer = new THREE.Mesh(shellGeometry({ inner: false, ys: ysOut, seg, amp: (y) => 14 + 12 * smoothstep(40, 260, y), seed: 3.7 }), outerMat);
  const inner = new THREE.Mesh(shellGeometry({ inner: true, ys: ysIn, seg, amp: (y) => 9 + 9 * smoothstep(0, 240, y), seed: 9.1 }), innerMat);
  group.add(outer, inner);

  // ---------- billows: rings on the outside face (they break up its silhouette), its foot, and a crown along the top ----------
  // nothing may come near the Catbus's corridor where the path goes in
  const clearOfPath = (x: number, y: number, z: number, r: number) => {
    for (let pz = -1130; pz >= -1250; pz -= 3) {
      const p = road.at(pz);
      if (Math.hypot(x + NEST.x - p.x, Math.max(0, Math.abs(y - (p.y + 3)) - 3), z + NEST.z - p.z) < r + 5) return false;
    }
    return true;
  };
  const ring = (n: number, r: (th: number) => number, y: () => number, size: () => number, out: Puff[], jitter = 0.6) => {
    for (let k = 0; k < n; k++) {
      const th = ((k + rng.range(-jitter, jitter) * 0.5) / n) * TAU;
      const yy = y(), rr = r(th), s = size();
      const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
      if (clearOfPath(x, yy, z, s)) out.push([x, yy, z, s]);
    }
  };
  const lod = lowDetail ? 0.6 : 1;
  const crown: Puff[] = [];
  // (kept low, so from the island the rim stays about 30-35 degrees up)
  ring(Math.round(84 * lod), () => rMid(TOP) + rng.range(-12, 12), () => TOP - 22 + rng.range(-6, 6), () => rng.range(18, 28), crown);
  ring(Math.round(46 * lod), () => rMid(TOP) + rng.range(-8, 8), () => TOP - 8 + rng.range(0, 6), () => rng.range(12, 16), crown);
  ring(Math.round(44 * lod), () => rOut(TOP) - 6 + rng.range(0, 8), () => TOP - 26 + rng.range(-12, 8), () => rng.range(14, 22), crown);
  ring(Math.round(40 * lod), () => rIn(TOP) + rng.range(-4, 4), () => TOP - 22 + rng.range(-10, 8), () => rng.range(12, 20), crown);
  group.add(new THREE.Mesh(puffMass(crown, { r: rMid(TOP), y: TOP + 4 }, TOP - 40, TOP + 50), puffMat));
  const outside: THREE.BufferGeometry[] = [];
  const foot: Puff[] = [];
  ring(Math.round(80 * lod), () => rOut(40) + rng.range(4, 22), () => rng.range(24, 46), () => rng.range(12, 26), foot);
  ring(Math.round(40 * lod), () => rOut(60) + rng.range(-2, 8), () => rng.range(48, 70), () => rng.range(10, 18), foot);
  outside.push(puffMass(foot, { r: rOut(40) + 10, y: 26 }, 22, 80));
  // each sits mostly outside the face (set out by its own size), so none pokes through the thin wall into the eye;
  // higher up they hang below the anvil's underside
  for (const [y0, drop] of [[95, 0], [135, 6], [170, 14], [200, 22]] as const) {
    const face: Puff[] = [];
    const n = Math.round(46 * lod);
    for (let k = 0; k < n; k++) {
      const th = ((k + rng.range(-0.3, 0.3)) / n) * TAU, y = y0 - drop + rng.range(-12, 10), sz = rng.range(14, 26 - drop * 0.4);
      const rr = rOut(y) + sz * 0.85 + rng.range(0, 5);
      const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
      // its inner, upper side must stay outside the bowl of the inner face
      let inside = false;
      for (let a = 0; a <= Math.PI / 2 && !inside; a += Math.PI / 12) inside = rr - Math.cos(a) * sz < rIn(y + Math.sin(a) * sz) + 2;
      if (!inside && clearOfPath(x, y, z, sz)) face.push([x, y, z, sz]);
    }
    outside.push(puffMass(face, { r: rOut(y0 - drop) + 4, y: y0 - drop }, y0 - drop - 30, y0 - drop + 30));
  }
  const billows = new THREE.Mesh(mergeGeometries(outside, false)!, puffMat);
  billows.geometry.computeBoundingSphere();
  group.add(billows);

  // ---------- wind streaks racing round the outside (the pattern moves along them; the arcs stay put) ----------
  const streakU = { uTime: { value: 0 }, uAmount: { value: 0.5 }, uCol: { value: new THREE.Color(0.9, 0.9, 1) } };
  const streaks = (() => {
    const pos: number[] = [], along: number[] = [], across: number[] = [], seed: number[] = [], idx: number[] = [];
    const S = 28;
    let made = 0;
    for (let tries = 0; tries < 200 && made < (lowDetail ? 20 : 34); tries++) {
      const thc = rng.range(0, TAU), L = rng.range(0.22, 0.6), y0 = rng.range(60, TOP - 20), rise = rng.range(8, 40), th = rng.range(1.2, 4.5);
      if (Math.abs(wrap(thc - CROSS)) < L + 0.25 && y0 < 130) continue;
      const r0 = rOut(y0) + rng.range(30, 50), sd = rng.next();
      const base = pos.length / 3;
      for (let s = 0; s <= S; s++) {
        const a = s / S, ang = thc + (a - 0.5) * 2 * L, y = y0 + (a - 0.5) * rise, r = r0 + Math.sin(a * Math.PI) * 5;
        for (const side of [-1, 1]) { pos.push(Math.cos(ang) * r, y + side * th * 0.5, Math.sin(ang) * r); along.push(a); across.push(side); seed.push(sd); }
        if (s < S) { const q = base + s * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      }
      made++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
    g.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.ShaderMaterial({
      uniforms: streakU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aAlong; attribute float aAcross; attribute float aSeed;
        varying float vAlong; varying float vAcross; varying float vSeed; varying float vDepth;
        void main() {
          vAlong = aAlong; vAcross = aAcross; vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uAmount; uniform vec3 uCol;
        varying float vAlong; varying float vAcross; varying float vSeed; varying float vDepth;
        ${GLSL_NOISE}
        void main() {
          float ends = sin(3.14159 * clamp(vAlong, 0.0, 1.0));
          float across = 1.0 - vAcross * vAcross;
          float s = noise2(vec2(vAlong * 16.0 - uTime * (1.4 + vSeed), vSeed * 31.0 + vAcross * 1.2));
          float a = ends * across * smoothstep(0.4, 0.85, s) * uAmount * exp(-vDepth * 0.0011);
          gl_FragColor = vec4(uCol, a);
        }
      `,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 2;
    return mesh;
  })();
  group.add(streaks);

  // ---------- lightning: four reusable bolts and six glow spots ----------
  interface Bolt { holder: THREE.Group; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; life: number; seed: number; mid: THREE.Vector3 }
  const bolts: Bolt[] = [];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const mesh = new THREE.Mesh(boltGeometry(rng), mat);
    mesh.frustumCulled = false;
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.visible = false;
    group.add(holder);
    bolts.push({ holder, mesh, mat, t: -1, life: 0.3, seed: i * 7.31, mid: new THREE.Vector3() });
  }
  interface Glow { pos: THREE.Vector3; t: number; life: number; power: number; seed: number }
  const glows: Glow[] = Array.from({ length: GLOWS }, (_, i) => ({ pos: new THREE.Vector3(), t: -1, life: 0.5, power: 1, seed: i * 3.17 }));
  /** on, off and on again a few times, fading */
  const flicker = (t: number, life: number, seed: number) => {
    if (t < 0 || t >= life) return 0;
    const f = Math.sin(seed * 91.3 + Math.floor(t * 24) * 12.7) * 437.5;
    return Math.pow(1 - t / life, 1.3) * (f - Math.floor(f) > 0.3 ? 1 : 0.2);
  };
  const free = (g: { t: number; life: number }) => g.t < 0 || g.t >= g.life;
  const glow = (pos: THREE.Vector3, power: number, life: number) => {
    const g = glows.reduce((a, b) => (free(a) ? a : free(b) ? b : a.t > b.t ? a : b));
    g.pos.copy(pos); g.power = power; g.life = life; g.t = 0; g.seed = rng.range(0, 100);
  };
  /** a point on (or just in front of, or just inside) the outer face, at angle `th` and height `y` (world space) */
  const onFace = (th: number, y: number, off: number, out = new THREE.Vector3()) => out.set(NEST.x + Math.cos(th) * (rOut(y) + off), y, NEST.z + Math.sin(th) * (rOut(y) + off));
  const camAngle = (cam: THREE.Vector3) => Math.atan2(cam.z - NEST.z, cam.x - NEST.x);
  const tmp = new THREE.Vector3();
  let camNow = new THREE.Vector3(0, 50, -950);
  const strike = (big: boolean) => {
    const b = bolts.find(free) ?? bolts[0];
    const ca = camAngle(camNow);
    // under the anvil a bolt could hang right beside the Catbus: pick a spot at least 70 units away (sideways)
    let toSea = false, th = 0, yTop = 0, len = 0, found = false;
    for (let tries = 0; tries < 8 && !found; tries++) {
      toSea = rng.chance(0.35);
      th = ca + rng.range(-0.5, 0.5);
      // a strike down to the cloud sea never lands on the path
      if (toSea && Math.abs(wrap(th - CROSS)) < 0.14) th = CROSS + Math.sign(wrap(th - CROSS) || 1) * 0.16;
      yTop = toSea ? rng.range(100, 150) : rng.range(110, TOP - 20);
      len = toSea ? yTop - 36 : rng.range(55, 110);
      onFace(th, yTop, toSea ? rng.range(48, 70) : 16, tmp);
      found = Math.hypot(tmp.x - camNow.x, tmp.z - camNow.z) > 70;
    }
    if (!found) return;
    b.holder.position.set(tmp.x - NEST.x, tmp.y, tmp.z - NEST.z);
    b.holder.lookAt(camNow);
    b.mesh.rotation.z = rng.range(-0.25, 0.25);
    b.mesh.scale.set(len * rng.range(0.8, 1.2), len, 1);
    b.t = 0; b.life = big ? 0.5 : rng.range(0.25, 0.4); b.seed = rng.range(0, 100);
    b.holder.visible = true;
    b.mid.set(tmp.x, tmp.y - len * 0.5, tmp.z);
    onFace(th, yTop - len * 0.4, -14, tmp);
    glow(tmp, big ? 3.4 : 2.4, b.life + 0.15);
    nest.onBolt?.();
  };
  let nextBolt = 0.6, nextSheet = 0.2, burst = 0;

  // ---------- line of sight: blocks rays from outside only (front faces point out) ----------
  const proxy = new THREE.Mesh(new THREE.CylinderGeometry(NEST.outer - 4, NEST.outer - 4, TOP - 30, 48, 1, true), new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
  proxy.position.set(0, (TOP + 30) / 2, 0);
  proxy.visible = false;
  group.add(proxy);

  const white = new THREE.Color(1, 1, 1), warm = new THREE.Color(0xffd0a8), cream = new THREE.Color(1.0, 0.96, 0.9);
  // the sunny inside may be brighter than the storm outside, still below the bloom threshold
  inC.uCap.value.set(0.7, 0.93);
  // outside: cool slate blue-grey, very dark slate in the bands and at the foot, pale grey-blue between bands
  const slate = new THREE.Color(0x7c8ca8), deepOut = new THREE.Color(0x323c50), paleOut = new THREE.Color(0xa8b4c8);
  // inside: white-cream sunlit cumulus, pale sky-blue-lilac shade, a soft dusky blue only low down
  const shadeIn = new THREE.Color(0xcad4f0), deepIn = new THREE.Color(0x96a2c4);

  const nest: Nest = {
    group, proxy, onBolt: null, flashLevel: 0,
    storm() { burst = 3; nextBolt = 0; },
    update(dt, t, cam, light, fx) {
      camNow = cam;
      const sky = light.sky;
      const I = Math.min(1, light.sunIntensity / 2.2);
      common.uSunDir.value.copy(light.sunDir);
      common.uRim.value.copy(light.sunColor).multiplyScalar(1.0 + 0.4 * I);
      common.uFogColor.value.copy(light.fog.color);
      common.uFogDensity.value = light.fog.density * 0.5;
      common.uSpin.value = -t * 0.02;
      common.uTime.value = t;
      outC.uLit.value.copy(white).lerp(light.sunColor, 0.55).lerp(warm, 0.25).multiplyScalar(0.6 + 0.3 * I);
      outC.uShade.value.copy(slate).lerp(sky.topColor.value, 0.15).multiplyScalar(0.85 + 0.2 * I);
      outC.uDeep.value.copy(deepOut);
      outC.uBand.value.copy(paleOut).multiplyScalar(0.8 + 0.2 * I);
      inC.uLit.value.copy(cream).lerp(light.sunColor, 0.15).multiplyScalar(1.0 + 0.2 * I);
      inC.uShade.value.copy(shadeIn).lerp(sky.midColor.value, 0.2);
      inC.uDeep.value.copy(deepIn);
      inC.uBand.value.copy(sky.topColor.value);
      streakU.uTime.value = t;
      streakU.uCol.value.copy(outC.uLit.value).lerp(white, 0.4).multiplyScalar(0.5);

      // where the camera is: outside the ring, inside the wall, or in the calm eye
      const dc = Math.hypot(cam.x - NEST.x, cam.z - NEST.z);
      const outsideNow = dc > NEST.outer + 2, eye = dc < NEST.inner - 4;
      const inK = smoothstep(NEST.outer + 10, NEST.inner - 10, dc);
      // the billows take the outside's storm colours, or the eye's bright ones from inside
      puffC.uLit.value.lerpColors(outC.uLit.value, inC.uLit.value, inK);
      puffC.uShade.value.lerpColors(outC.uShade.value, inC.uShade.value, inK);
      puffC.uDeep.value.lerpColors(outC.uDeep.value, inC.uDeep.value, inK);
      puffC.uCap.value.lerpVectors(outC.uCap.value, inC.uCap.value, inK);
      streaks.visible = outsideNow;

      // lightning: often, and more often the closer you are; in the eye, only a rare glow deep in the wall
      const k = smoothstep(NEST.outer + 260, NEST.outer + 20, dc);
      common.uFlicker.value = outsideNow ? lerp(0.7, 1.1, k) : 0;
      if (outsideNow) {
        nextBolt -= dt; nextSheet -= dt;
        if (nextBolt <= 0) {
          strike(burst > 0);
          if (burst > 0) { burst--; nextBolt = rng.range(0.12, 0.3); } else nextBolt = lerp(1.8, 0.6, k) * rng.range(0.6, 1.4);
        }
        if (nextSheet <= 0) {
          const th = camAngle(cam) + rng.range(-0.7, 0.7), y = rng.range(60, TOP - 20);
          glow(onFace(th, y, -14, tmp), rng.range(1.0, 2.0), rng.range(0.3, 0.6));
          nextSheet = lerp(0.45, 0.2, k) * rng.range(0.5, 1.5);
        }
      } else if (eye) {
        nextSheet -= dt;
        if (nextSheet <= 0) {
          const th = rng.range(0, TAU), y = rng.range(-20, 120);
          tmp.set(NEST.x + Math.cos(th) * (rIn(y) + 14), y, NEST.z + Math.sin(th) * (rIn(y) + 14));
          glow(tmp, rng.range(0.5, 0.9), rng.range(0.4, 0.7));
          nextSheet = rng.range(3, 7);
        }
      }
      for (let i = 0; i < GLOWS; i++) {
        const g = glows[i];
        if (g.t >= 0 && g.t < g.life) g.t += dt;
        glow4[i].set(g.pos.x, g.pos.y, g.pos.z, g.power * flicker(g.t, g.life, g.seed));
      }
      let flash = 0;
      for (const b of bolts) {
        if (b.t < 0) continue;
        b.t += dt;
        const e = flicker(b.t, b.life, b.seed);
        if (b.t >= b.life || !outsideNow) { b.t = -1; b.holder.visible = false; continue; }
        b.mat.color.setRGB(0.82, 0.88, 1.0).multiplyScalar(4.5 * e);
        const d = b.mid.distanceTo(cam);
        if (d < 320) flash = Math.max(flash, (1 - d / 320) ** 2 * 0.35 * e);
      }
      if (flash > 0.01) fx.flash(flash, 0xe4e8ff);
      nest.flashLevel = flash;
    },
  };
  return nest;
}
