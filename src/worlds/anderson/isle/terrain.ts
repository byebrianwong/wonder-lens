import * as THREE from 'three';
import { clamp, fbm, lerp, noise2, smoothstep } from '../../../engine/math';
import type { Road } from '../layout';
import { BALE, CHIEF, EDGE_Z, ISLAND, LAB, NUTMEG, PACK, PARK, PLANE, PYLON_X, PYLONS, SAKE, SPOTS, STATION } from './plan';
import { baleAtlas } from './paint';

/*
 * The trash mountains. The island is stacked from cubes of compressed trash, sorted into colour bands
 * (grey, rust, faded blue, ochre, bottle green, white paper), stepped into cliffs and valleys.
 *
 * The height plan is a function of (x, z): mountains from noise, a designed profile under the cable (ridges
 * where the pylons stand, deep valleys between), two valleys for the amusement park and the sake factory,
 * plateaus where characters stand, and a sheer cliff at the island's edge. It is sampled on a grid of bale
 * cells (2 units near the track, 4 further out), quantised to whole layers, and every rectangle of equal
 * height is one instanced box from below the sea to its top. The bale shader paints each face from world
 * coordinates, so a big box still shows every bale in it: seams, straps, the band colour of its layer and
 * a little variation from bale to bale.
 */

export interface TrashLand {
  group: THREE.Group;
  /** top of the bales at a point (the solid ground there), or -Infinity over the sea */
  top(x: number, z: number): number;
  material: THREE.Material;
}

const Z0 = -1772, Z1 = -2056, NEAR = 64, FAR = 152, BOTTOM = -5;

/** the cable's ridge-and-valley profile under the track: [z, height] */
const PROFILE: Array<[number, number]> = [
  [-1772, 2], [-1832, 2], [-1846, 4], [-1862, 10], [-1880, 6], [-1905, 20], [-1924, 12], [-1945, 25], [-1962, 14],
  [-1978, 8], [-1994, 16], [-2008, 25], [-2026, 22], [-2040, 20], [-2056, 18],
];
function profileAt(z: number) {
  if (z >= PROFILE[0][0]) return PROFILE[0][1];
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [za, a] = PROFILE[i], [zb, b] = PROFILE[i + 1];
    if (z <= za && z >= zb) return lerp(a, b, smoothstep(za, zb, z));
  }
  return PROFILE[PROFILE.length - 1][1];
}

/** a box-shaped plateau: flat at y inside, blending back to the land within `soft` */
interface Flat { x: number; z: number; w: number; d: number; y: number; soft: number; cap?: boolean }
const FLATS: Flat[] = [
  { x: PACK.x, z: PACK.z, w: 13, d: 9, y: PACK.y, soft: 5 },
  { x: PLANE.x, z: PLANE.z, w: 9, d: 9, y: PLANE.y, soft: 6 },
  { x: SPOTS.x, z: SPOTS.z, w: 7, d: 7, y: SPOTS.y, soft: 5 },
  { x: NUTMEG.x, z: NUTMEG.z, w: 7, d: 7, y: NUTMEG.y, soft: 5 },
  { x: LAB.x, z: LAB.z, w: 34, d: 26, y: LAB.y, soft: 10 },
];

export function islandEdge(x: number) { return EDGE_Z + (noise2(x * 0.06, 3.3) - 0.5) * 5; }

export function buildTrashLand(road: Road, lowDetail: boolean): TrashLand {
  const pathY = (z: number) => road.at(clamp(z, -2090, -1800)).y;

  /** continuous height plan */
  const raw = (x: number, z: number) => {
    const edge = islandEdge(x);
    const back = ISLAND.back - (noise2(x * 0.045, 9.1) - 0.5) * 8;
    const side = ISLAND.halfW - noise2(z * 0.03, 5.5) * 16;
    if (z < edge || z > back || Math.abs(x) > side) return -99;
    const s = smoothstep(-1834, -1900, z);
    const ridge = 1 - Math.abs(2 * fbm(x * 0.011 + 7.3, z * 0.011 - 2.1, 4) - 1);
    const n = fbm(x * 0.03 + 1.7, z * 0.03 + 4.2, 3);
    // the mountains, higher towards the flanks so they wall in the view
    let h = 2 + (1 - s) * n * 7 + s * (Math.pow(ridge, 2.0) * 36 + n * 16 + smoothstep(30, 110, Math.abs(x)) * 14);
    // under the cable: the designed ridges and valleys, the walls rising away from the track
    const d = x < -4.5 ? -4.5 - x : x > 13.5 ? x - 13.5 : 0;
    const track = profileAt(z) + (fbm(x * 0.08, z * 0.08, 2) - 0.5) * 4 + Math.pow(d, 1.15) * 0.95;
    h = Math.min(h, track);
    // the valleys either side at the far end: the amusement park and the sake factory
    const valley = (cx: number, cz: number, rx: number, rz: number, floor: number) => {
      const e = Math.hypot((x - cx) / rx, (z - cz) / rz);
      if (e < 1.6) h = lerp(floor + n * 2, h, smoothstep(0.75, 1.5, e));
    };
    valley(PARK.x, PARK.z, 40, 44, PARK.y);
    valley(SAKE.x, SAKE.z, 30, 36, SAKE.y);
    // the shore falls to one layer above the sea near the back and the flanks (the front edge is a cliff)
    h = Math.min(h, 2 + (back - z) * 1.2, 2 + (side - Math.abs(x)) * 1.2);
    // plateaus
    for (const f of FLATS) {
      const dx = Math.max(0, Math.abs(x - f.x) - f.w / 2), dz = Math.max(0, Math.abs(z - f.z) - f.d / 2);
      const dd = Math.hypot(dx, dz);
      if (dd < f.soft) h = lerp(f.y, h, smoothstep(0, f.soft, dd));
    }
    // Chief's peak: one column of bales standing above the land round it
    {
      const dx = Math.abs(x - CHIEF.x), dz = Math.abs(z - CHIEF.z);
      if (dx < 1 && dz < 2) h = CHIEF.y;
      else { const dd = Math.hypot(Math.max(0, dx - 1), Math.max(0, dz - 2)); if (dd < 7) h = Math.min(h, CHIEF.y - 6 + dd * 1.4); }
    }
    // the loading station's yard is level, with a channel for the cars under the cable
    if (z > STATION.z1 - 4) {
      const k = smoothstep(STATION.z1 - 4, STATION.z1 + 2, z);
      if (Math.abs(x) < STATION.half + 8) h = lerp(h, 2, k);
    }
    // never closer than this under the cars (both lines)
    h = Math.min(h, pathY(z) - 2.2 + d * 1.15);
    // pylon footings: a flat pad
    for (const pz of PYLONS) if (Math.abs(z - pz) < 3 && Math.abs(x - PYLON_X) < 3) h = Math.min(h, Math.floor(pathY(pz) - 5.5));
    return h;
  };

  const layers = (h: number) => (h < -50 ? -1 : Math.max(1, Math.floor(h / BALE)));

  // ---- the grids: [x0, x1, cell] ----
  const grids: Array<{ x0: number; x1: number; cell: number; L: Int16Array; nz: number }> = [
    { x0: -FAR, x1: -NEAR, cell: 4 }, { x0: -NEAR, x1: NEAR, cell: 2 }, { x0: NEAR, x1: FAR, cell: 4 },
  ].map((g) => ({ ...g, L: new Int16Array(0), nz: 0 }));
  const boxes: Array<{ x: number; z: number; w: number; d: number; top: number }> = [];
  for (const gr of grids) {
    const nx = Math.round((gr.x1 - gr.x0) / gr.cell), nz = Math.round((Z0 - Z1) / gr.cell);
    const L = gr.L = new Int16Array(nx * nz);
    gr.nz = nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = gr.x0 + (i + 0.5) * gr.cell, z = Z0 - (j + 0.5) * gr.cell;
      L[i * nz + j] = layers(raw(x, z));
    }
    // greedy rectangles of equal height
    const used = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const k = i * nz + j;
      if (used[k] || L[k] < 0) continue;
      const v = L[k];
      let dj = 1;
      while (j + dj < nz && !used[i * nz + j + dj] && L[i * nz + j + dj] === v && dj < 24) dj++;
      let di = 1;
      grow: while (i + di < nx && di < 24) {
        for (let q = 0; q < dj; q++) { const kk = (i + di) * nz + j + q; if (used[kk] || L[kk] !== v) break grow; }
        di++;
      }
      for (let a = 0; a < di; a++) for (let b = 0; b < dj; b++) used[(i + a) * nz + j + b] = 1;
      boxes.push({ x: gr.x0 + (i + di / 2) * gr.cell, z: Z0 - (j + dj / 2) * gr.cell, w: di * gr.cell, d: dj * gr.cell, top: v * BALE });
    }
  }

  const top = (x: number, z: number) => {
    for (const gr of grids) {
      if (x < gr.x0 || x >= gr.x1) continue;
      const i = Math.floor((x - gr.x0) / gr.cell), j = Math.floor((Z0 - z) / gr.cell);
      if (j < 0 || j >= gr.nz) return -Infinity;
      const v = gr.L[i * gr.nz + j];
      return v < 0 ? -Infinity : v * BALE;
    }
    return -Infinity;
  };

  // ---- the bale material ----
  const material = baleMaterial();

  // ---- instanced boxes in chunks (by z, and by side) ----
  const group = new THREE.Group();
  group.userData.chunked = true;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const chunks = new Map<string, typeof boxes>();
  for (const b of boxes) {
    if (lowDetail && Math.abs(b.x) > 110 && b.top <= 2) continue;
    const key = `${Math.floor(b.z / 48)}|${b.x < -40 ? 'l' : b.x > 40 ? 'r' : 'c'}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key)!.push(b);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const list of chunks.values()) {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((b, i) => {
      p.set(b.x, BOTTOM, b.z); s.set(b.w, b.top - BOTTOM, b.d);
      im.setMatrixAt(i, m4.compose(p, q, s));
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    im.userData.keep = true;
    group.add(im);
  }
  group.userData.boxes = boxes.length;
  return { group, top, material };
}

/**
 * The bale material: Lambert lighting, with the colour worked out per pixel from the world position: which
 * bale (cell), which layer (band colour), a face from the atlas, dark seams between bales, and the lower
 * layers a little dirtier.
 */
export function baleMaterial() {
  const mat = new THREE.MeshLambertMaterial({ map: baleAtlas() });
  const pal = [0x8c8a84, 0x9a5c3e, 0x7c92a2, 0xc29c56, 0x68866a, 0xdcd4c2, 0xb48a80, 0x7a6450].map((c) => new THREE.Color(c));
  const uniforms = { uBalePal: { value: pal }, uBale: { value: BALE } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBaleW;\nvarying vec3 vBaleN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 bw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            bw = instanceMatrix * bw;
          #endif
          vBaleW = (modelMatrix * bw).xyz;
          vBaleN = objectNormal;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBaleW;
        varying vec3 vBaleN;
        uniform vec3 uBalePal[8];
        uniform float uBale;
        float baleHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float baleNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          float a = baleHash(vec3(i, 1.0)), b = baleHash(vec3(i + vec2(1.0, 0.0), 1.0)), c = baleHash(vec3(i + vec2(0.0, 1.0), 1.0)), d = baleHash(vec3(i + vec2(1.0, 1.0), 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }`)
      .replace('#include <map_fragment>', `
        {
          vec3 an = abs(vBaleN);
          vec3 inside = vBaleW - vBaleN * 0.3;
          vec3 cell = floor(inside / uBale);
          vec2 fuv;
          if (an.y > 0.5) fuv = vBaleW.xz / uBale;
          else if (an.x > 0.5) fuv = vec2(vBaleW.z * sign(vBaleN.x), vBaleW.y) / uBale;
          else fuv = vec2(-vBaleW.x * sign(vBaleN.z), vBaleW.y) / uBale;
          vec2 f = fract(fuv);
          float h1 = baleHash(cell);
          float h2 = baleHash(cell + vec3(17.3, 3.1, 9.7));
          // the band: two or three layers share a colour; the sequence shifts from mountain to mountain
          float region = floor(baleNoise(cell.xz * 0.045) * 4.0);
          float band = floor((cell.y + region) / (1.0 + step(0.5, baleHash(vec3(floor((cell.y + region) / 2.0), 7.0, 3.0)))));
          float idx = mod(band * 3.0 + region * 5.0, 8.0);
          // one bale in eight strays from its band
          if (h1 > 0.88) idx = mod(idx + 1.0 + floor(h2 * 3.0), 8.0);
          vec3 tint = uBalePal[int(idx)];
          tint *= 0.86 + 0.24 * h2;
          // a face of compressed trash from the atlas
          vec2 tile = vec2(floor(h2 * 4.0), floor(fract(h1 * 7.0) * 2.0));
          vec2 tf = f;
          if (fract(h1 * 13.0) > 0.5) tf.x = 1.0 - tf.x;
          vec4 tx = texture2D(map, (tile + clamp(tf, 0.01, 0.99)) / vec2(4.0, 2.0));
          vec3 c = tint * tx.rgb * 1.65;
          // the seams between bales
          float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
          c *= mix(0.42, 1.0, smoothstep(0.0, 0.05, e));
          // tops a touch lighter (dust), the lower layers dirtier and darker
          if (an.y > 0.5 && vBaleN.y > 0.0) c *= 1.06;
          c *= mix(0.62, 1.0, smoothstep(-2.0, 14.0, vBaleW.y));
          diffuseColor.rgb *= c;
        }`);
  };
  mat.customProgramCacheKey = () => 'isleBales1';
  return mat;
}
