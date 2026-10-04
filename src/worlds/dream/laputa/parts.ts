import * as THREE from 'three';
import { charToon, Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { barkTexture, granite } from '../../ghibli/propTextures';
import { css } from '../../ghibli/characterTextures';
import { ISLAND } from '../layout';

/*
 * Shared measurements, geometry helpers, painted textures and materials for Laputa.
 *
 * The island is round and centred on ISLAND. Angles are measured round its centre with
 * a = atan2(z - CZ, x - CX), so a = 180° points to -x (the side the path runs on), a = 90° to +z (where the
 * ride comes from) and a = -90° to -z (where it leaves).
 *
 *  garden terrace   r < 85, ground at y 48; the path lands on it and leaves it
 *  inner terrace    r < 58, ground at y 50, behind a low retaining wall with a balustrade
 *  the keep         two round tiers, r 24 (top at y 58) and r 16 (top at y 65.5); the great tree stands on it
 *  under the rim    the walls step inwards as they go down (r 85, 73, 61), then a bowl of rock to y -30
 */

export const CX = ISLAND.x, CZ = ISLAND.z;
export const RIM = 85, INNER = 58, KEEP1 = 24, KEEP2 = 16;
export const Y_OUT = 48, Y_IN = 50, Y_K1 = 58, Y_K2 = 65.5;
/** wall bands below the rim: [radius, bottom, top] */
export const BANDS: Array<[number, number, number]> = [[RIM, 30, 49], [73, 13, 30], [61, 0, 13]];
export const BOWL_BOTTOM = -30;
/**
 * The levitation crystal: the top of the cluster, hanging on roots below the bowl. It hangs a little off the
 * middle, towards the side where the ride leaves the island, and low enough that the rider sees it under
 * the bowl's edge while falling past (anything right under the middle is hidden behind the lower walls).
 */
const CRYSTAL_A = (-75 * Math.PI) / 180;
export const CRYSTAL = new THREE.Vector3(CX + Math.cos(CRYSTAL_A) * 34, -38, CZ + Math.sin(CRYSTAL_A) * 34);

/** World point at a radius and angle round the island, at height y. */
export const polar = (r: number, a: number, y: number, out = new THREE.Vector3()) => out.set(CX + Math.cos(a) * r, y, CZ + Math.sin(a) * r);
/** Distance from the island's centre and angle round it. */
export const radiusOf = (x: number, z: number) => Math.hypot(x - CX, z - CZ);
export const angleOf = (x: number, z: number) => Math.atan2(z - CZ, x - CX);
/** Smallest difference between two angles. */
export const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const deg = (d: number) => (d * Math.PI) / 180;

// ---------------- geometry helpers ----------------

/** Flip any triangle whose winding disagrees with its vertex normals, so every face shows on the side its normal points to. */
export function fixWinding(geo: THREE.BufferGeometry) {
  const idx = geo.index;
  const pos = geo.attributes.position as THREE.BufferAttribute, nrm = geo.attributes.normal as THREE.BufferAttribute;
  if (!idx || !nrm) return geo;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  const arr = idx.array as Uint16Array | Uint32Array;
  for (let i = 0; i < arr.length; i += 3) {
    a.fromBufferAttribute(pos, arr[i]); b.fromBufferAttribute(pos, arr[i + 1]); c.fromBufferAttribute(pos, arr[i + 2]);
    n.subVectors(b, a).cross(c.sub(a));
    m.fromBufferAttribute(nrm, arr[i]).add(b.fromBufferAttribute(nrm, arr[i + 1])).add(c.fromBufferAttribute(nrm, arr[i + 2]));
    if (n.dot(m) < 0) { const t = arr[i + 1]; arr[i + 1] = arr[i + 2]; arr[i + 2] = t; }
  }
  idx.needsUpdate = true;
  return geo;
}

function build(pos: number[], nrm: number[], uv: number[], idx: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  fixWinding(g);
  g.computeBoundingSphere();
  return g;
}

/**
 * A curved wall on a circle round the island from angle a0 to a1, between heights yBot(a) and yTop(a).
 * UVs are in world units divided by `tile` (v counted from `vBase`), so a tiling texture keeps its size.
 */
export function ringWall(r: number, a0: number, a1: number, yBot: (a: number) => number, yTop: (a: number) => number, o: { out?: boolean; tile?: number; tileV?: number; vBase?: number; step?: number } = {}) {
  const tile = o.tile ?? 12, tileV = o.tileV ?? tile, k = o.out === false ? -1 : 1, vb = o.vBase ?? 0;
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / (o.step ?? 2.5)));
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, c = Math.cos(a), s = Math.sin(a);
    const x = CX + c * r, z = CZ + s * r, y0 = yBot(a), y1 = yTop(a);
    // u is measured from angle 0, so walls built in pieces line up
    const u = (a * r) / tile;
    pos.push(x, y0, z, x, y1, z);
    nrm.push(c * k, 0, s * k, c * k, 0, s * k);
    uv.push(u, (y0 - vb) / tileV, u, (y1 - vb) / tileV);
    if (i < n) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  return build(pos, nrm, uv, idx);
}

/** A flat ring sector at height y(r, a), facing up or down, with world-space UVs. */
export function annulus(r0: number, r1: number, a0: number, a1: number, y: (r: number, a: number) => number, up: boolean, tile = 8, step = 3) {
  const nr = Math.max(1, Math.ceil((r1 - r0) / step)), na = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r1) / step));
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= na; i++) {
    const a = a0 + ((a1 - a0) * i) / na;
    for (let j = 0; j <= nr; j++) {
      const r = r0 + ((r1 - r0) * j) / nr;
      const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
      pos.push(x, y(r, a), z);
      nrm.push(0, up ? 1 : -1, 0);
      uv.push(x / tile, z / tile);
      if (i < na && j < nr) { const p = i * (nr + 1) + j, q = p + nr + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
    }
  }
  return build(pos, nrm, uv, idx);
}

/** Turn a tube's UVs (u along, v around) into bark-friendly ones: u around, v along, in texture repeats. */
export function tubeUV(geo: THREE.BufferGeometry, around: number, along: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) { const a = uv.getX(i), b = uv.getY(i); uv.setXY(i, b * around, a * along); }
  uv.needsUpdate = true;
  return geo;
}

/** A tube of changing radius along a curve (`radius(t)` for t 0..1), with bark UVs. */
export function rootTube(curve: THREE.Curve<THREE.Vector3>, radius: (t: number) => number, segs: number, radial = 7) {
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const len = curve.getLength();
  return tubeUV(geo, Math.max(1, Math.round((TAU * radius(0.3)) / 6)), len / 6);
}

/** A box mesh with world-unit UVs, placed and turned. */
export function block(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, yaw = 0, tile = 8) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // faces in order +x, -x, +y, -y, +z, -z with four vertices each
  const dims: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, (uv.getX(i) * dims[f][0] + x * 0.37) / tile, (uv.getY(i) * dims[f][1] + y) / tile); }
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  return m;
}

// ---------------- painted textures ----------------

const STONE = 0xd9cfb8;

/** Rows of pale ashlar blocks with darker joints, each block a slightly different tone. */
function ashlar(p: Painter, rows: number, base: number, y0 = 0, y1 = p.h, wMin = 40, wMax = 110) {
  const { g, rng } = p;
  const rh = (y1 - y0) / rows;
  g.fillStyle = css(base, 0.62, 0x6a6050, 0.2); g.fillRect(0, y0, p.w, y1 - y0);
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -rng.range(10, wMax * 0.6) : 0;
    while (x < p.w) {
      const bw = rng.range(wMin, wMax);
      const tone = rng.range(0.88, 1.06);
      const yy = y0 + r * rh;
      g.fillStyle = css(base, tone, rng.chance(0.5) ? 0xe8d8b0 : 0xa8b0b8, rng.range(0, 0.25));
      g.fillRect(x + 1.5, yy + 1.5, bw - 3, rh - 3);
      // a lit top edge and a shaded bottom edge on every block
      g.fillStyle = 'rgba(255,250,235,0.22)'; g.fillRect(x + 1.5, yy + 1.5, bw - 3, 2);
      g.fillStyle = 'rgba(40,30,20,0.16)'; g.fillRect(x + 1.5, yy + rh - 4, bw - 3, 2.5);
      if (rng.chance(0.25)) { g.fillStyle = `rgba(60,50,40,${rng.range(0.08, 0.2)})`; g.beginPath(); g.ellipse(x + rng.range(4, bw - 4), yy + rng.range(4, rh - 4), rng.range(2, 6), rng.range(1, 3), 0, 0, TAU); g.fill(); }
      x += bw;
    }
  }
}

/** Weathering: rain streaks, lichen spots and moss creeping down from the top. */
function weather(p: Painter, moss: number) {
  p.lines({ n: 40, colors: ['rgba(70,64,52,1)', 'rgba(90,96,80,1)'], alpha: [0.04, 0.12], width: [2, 7], vertical: true, wobble: 2 });
  p.dabs({ n: 70, colors: ['#c8c890', '#b0b880', '#d8d0a0'], r: [1.5, 5], alpha: [0.15, 0.35] });
  if (moss > 0) {
    p.dabs({ n: Math.round(90 * moss), colors: ['#5d7a3a', '#6f8c44', '#4a6630', '#7a9a4a'], r: [4, 16], alpha: [0.3, 0.6], y: [0, 0.16], squash: 0.6 });
    p.dabs({ n: Math.round(50 * moss), colors: ['#5d7a3a', '#6f8c44'], r: [3, 9], alpha: [0.2, 0.45], y: [0.1, 0.4], squash: 1.6 });
  }
}

/**
 * Pale stone wall with one tall arched window in the middle of each 12 x 12 unit tile: a dark opening in a
 * frame of voussoirs, a sill with moss on it and streaks running down below.
 */
export function stoneArchTexture(seed = 501) {
  const S = 512;
  const p = new Painter(S, S, seed);
  const g = p.g;
  ashlar(p, 16, STONE);
  const cx = S / 2, hw = 62, spring = 150, sill = 420, top = spring - hw;
  // voussoirs round the arch and jamb stones down the sides
  g.fillStyle = css(STONE, 1.08, 0xfff4dc, 0.2);
  g.beginPath(); g.moveTo(cx - hw - 22, sill); g.lineTo(cx - hw - 22, spring); g.arc(cx, spring, hw + 22, Math.PI, 0); g.lineTo(cx + hw + 22, sill); g.closePath(); g.fill();
  g.strokeStyle = css(STONE, 0.66); g.lineWidth = 2.5;
  for (let i = 0; i <= 11; i++) {
    const a = Math.PI + (i / 11) * Math.PI;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * hw, spring + Math.sin(a) * hw); g.lineTo(cx + Math.cos(a) * (hw + 22), spring + Math.sin(a) * (hw + 22)); g.stroke();
  }
  for (let y = spring + 30; y < sill; y += 34) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * hw, y); g.lineTo(cx + s * (hw + 22), y); g.stroke(); }
  // the dark opening: deep shadow at the top, a little light from inside at the bottom
  const gr = g.createLinearGradient(0, top, 0, sill);
  gr.addColorStop(0, '#141a22'); gr.addColorStop(0.6, '#222a33'); gr.addColorStop(1, '#3a4248');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(cx - hw, sill); g.lineTo(cx - hw, spring); g.arc(cx, spring, hw, Math.PI, 0); g.lineTo(cx + hw, sill); g.closePath(); g.fill();
  // the reveal: the thickness of the wall lit on one side of the opening
  g.fillStyle = 'rgba(200,190,170,0.35)';
  g.beginPath(); g.moveTo(cx - hw, sill); g.lineTo(cx - hw, spring); g.arc(cx, spring, hw, Math.PI, Math.PI * 1.35); g.lineTo(cx - hw + 12, spring); g.lineTo(cx - hw + 12, sill); g.closePath(); g.fill();
  // a keystone and the sill
  g.fillStyle = css(STONE, 1.12, 0xffffff, 0.1); g.fillRect(cx - 13, top - 26, 26, 30);
  g.fillStyle = css(STONE, 1.1, 0xffffff, 0.1); g.fillRect(cx - hw - 30, sill, hw * 2 + 60, 16);
  g.fillStyle = 'rgba(30,24,18,0.35)'; g.fillRect(cx - hw - 30, sill + 16, hw * 2 + 60, 6);
  // moss on the sill and streaks running down from it
  p.dabs({ n: 26, colors: ['#5d7a3a', '#6f8c44', '#7e9c4c'], r: [4, 11], alpha: [0.45, 0.8], y: [(sill - 6) / S, (sill + 10) / S], squash: 0.5 });
  for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(60,70,50,${p.rng.range(0.06, 0.16)})`; g.fillRect(cx - hw + p.rng.range(0, hw * 2), sill + 20, p.rng.range(3, 8), p.rng.range(30, 80)); }
  // a string course along the top of the tile
  g.fillStyle = css(STONE, 1.1, 0xffffff, 0.1); g.fillRect(0, 0, S, 12);
  g.fillStyle = 'rgba(30,24,18,0.3)'; g.fillRect(0, 12, S, 5);
  weather(p, 1);
  const t = p.texture();
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Plain pale ashlar with moss and lichen, 8 x 8 units per tile. */
export function stonePlainTexture(seed = 502, moss = 1) {
  const p = new Painter(512, 512, seed);
  ashlar(p, 8, STONE, 0, 512, 60, 150);
  weather(p, moss);
  const t = p.texture();
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Layered rock for the underside: warm grey bands, cracks, moss near the top, darker and cooler lower down. */
export function rockTexture(seed = 503) {
  const S = 512;
  const p = new Painter(S, S, seed).fill('#7a6e62');
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * S + rng.range(-6, 6);
    g.fillStyle = css(0x7a6e62, rng.range(0.78, 1.22), 0x8a90a0, rng.range(0, 0.3)); g.globalAlpha = 0.7;
    g.beginPath(); g.moveTo(0, y);
    for (let k = 1; k <= 16; k++) g.lineTo((k / 16) * S, y + Math.sin(k * 0.8 + i * 1.7) * 5);
    g.lineTo(S, y + 22); g.lineTo(0, y + 22); g.fill();
    g.globalAlpha = 1;
  }
  p.lines({ n: 40, colors: ['#4a4038', '#3a342e'], alpha: [0.25, 0.55], width: [1, 3.5], vertical: true, wobble: 7 });
  p.dabs({ n: 120, colors: ['#9a8e7e', '#5a5048', '#a8a090'], r: [2, 7], alpha: [0.15, 0.4] });
  p.dabs({ n: 70, colors: ['#4f6a34', '#5d7a3a', '#3f5a2c'], r: [5, 18], alpha: [0.3, 0.6], y: [0, 0.18], squash: 0.6 });
  const t = p.texture();
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Thick moss and turf, for ledges, wall tops and the keep's terraces. */
export function mossTexture(seed = 504) {
  const p = new Painter(256, 256, seed).fill('#5f8a3a');
  p.dabs({ n: 260, colors: ['#4e7a30', '#6f9a44', '#7aa84c', '#557f34', '#86ae52'], r: [3, 12], alpha: [0.35, 0.7] });
  p.dabs({ n: 140, colors: ['#3c5e26', '#9ac060'], r: [1, 3], alpha: [0.4, 0.8] });
  p.dabs({ n: 30, colors: ['#f4f0e0', '#f2d040', '#e8a0c0'], r: [1, 2], alpha: [0.7, 1] });
  return p.texture({ repeat: [1, 1] });
}

/** Verdigris roof shingles in rows, for cone roofs (rows run round the cone). */
export function roofTexture(seed = 505) {
  const p = new Painter(256, 256, seed).fill('#5f9a8a');
  const g = p.g, rng = p.rng;
  const rows = 12, rh = 256 / rows, cols = 16, cw = 256 / cols;
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) {
    const x = c * cw + (r % 2 ? cw / 2 : 0), y = r * rh;
    g.fillStyle = css(0x5f9a8a, rng.range(0.85, 1.15), 0x9ac0b0, rng.range(0, 0.3));
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + cw, y); g.lineTo(x + cw, y + rh * 0.7); g.quadraticCurveTo(x + cw / 2, y + rh * 1.25, x, y + rh * 0.7); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(30,60,55,0.5)'; g.lineWidth = 1.5; g.stroke();
  }
  p.lines({ n: 20, colors: ['#3a6a60', '#c8e0d0'], alpha: [0.08, 0.2], width: [1, 4], vertical: true });
  p.dabs({ n: 30, colors: ['#6a8a3a', '#8aa04a'], r: [2, 6], alpha: [0.2, 0.5], y: [0.75, 1] });
  return p.texture({ repeat: [1, 1] });
}

/** A memorial stone's face: a rounded tablet carved with a few lines of Laputan script. */
export function steleTexture() {
  const p = new Painter(256, 384, 506).fill('#c8c0b0');
  const g = p.g, rng = p.rng;
  p.dabs({ n: 300, colors: ['#d8d0c0', '#b0a898', '#a8a08e'], r: [0.8, 2.4], alpha: [0.3, 0.7] });
  g.strokeStyle = '#6a6458'; g.lineWidth = 3; g.lineCap = 'round';
  g.strokeRect(26, 40, 204, 300);
  for (let line = 0; line < 8; line++) {
    let x = 46;
    const y = 80 + line * 30;
    while (x < 206) {
      const w = rng.range(8, 16);
      g.beginPath();
      // simple angular glyphs: a stroke, a hook or a ring
      const kind = rng.int(0, 3);
      if (kind === 0) { g.moveTo(x, y - 8); g.lineTo(x + w * 0.5, y + 8); g.lineTo(x + w, y - 8); }
      else if (kind === 1) { g.moveTo(x, y - 8); g.lineTo(x, y + 8); g.lineTo(x + w, y + 8); }
      else if (kind === 2) { g.arc(x + w / 2, y, w * 0.45, 0, TAU); }
      else { g.moveTo(x, y); g.lineTo(x + w, y); g.moveTo(x + w / 2, y - 8); g.lineTo(x + w / 2, y + 8); }
      g.stroke();
      x += w + rng.range(4, 9);
    }
  }
  p.dabs({ n: 40, colors: ['#8a9a5a', '#a8a878', '#6f8c46'], r: [3, 10], alpha: [0.2, 0.5], y: [0.7, 1] });
  p.dabs({ n: 16, colors: ['#8a9a5a', '#a8b878'], r: [3, 8], alpha: [0.2, 0.4], y: [0, 0.15] });
  return p.texture({ wrap: false });
}

// ---------------- materials ----------------

export interface LaputaMats {
  /** pale stone with arched windows (12 unit tiles) */
  arches: THREE.Material;
  /** plain pale stone (8 unit tiles) */
  stone: THREE.Material;
  /** a mossier, darker stone for ruins and low walls */
  ruin: THREE.Material;
  rock: THREE.Material;
  moss: THREE.Material;
  roof: THREE.Material;
  bark: THREE.Material;
  flag: THREE.Material;
  stele: THREE.Material;
}

let cache: LaputaMats | null = null;
/** The island's materials, made once and shared by every part so merged meshes stay few. */
export function laputaMats(): LaputaMats {
  if (cache) return cache;
  const shade = 0xa8acd0;
  cache = {
    arches: charToon({ map: stoneArchTexture(), rim: 0.25, shade, mid: 0.92 }),
    stone: charToon({ map: stonePlainTexture(), rim: 0.25, shade, mid: 0.92 }),
    ruin: charToon({ map: stonePlainTexture(507, 2.2), color: 0xf0ece0, rim: 0.25, shade, mid: 0.92 }),
    rock: charToon({ map: rockTexture(), rim: 0.3, shade: 0x9098c0 }),
    moss: charToon({ map: mossTexture(), rim: 0.2, shade: 0x98b0b0 }),
    roof: charToon({ map: roofTexture(), rim: 0.3, shade }),
    bark: charToon({ map: barkTexture(0x6a5444), rim: 0.25, shade: 0x9a98c0 }),
    flag: charToon({ map: granite(0xc0b8a6, 508), rim: 0.15, shade }),
    stele: charToon({ map: steleTexture(), rim: 0.2, shade }),
  };
  return cache;
}

/** A deterministic generator for a named part, so each part's look does not depend on the build order. */
export const rngFor = (seed: number) => new Rng(seed);

// ---------------- grouping for culling ----------------

/**
 * Sorts static meshes into groups by where they stand, so each group can be merged on its own and culled
 * on its own: stretches along the path (which also cast shadows), sectors round the island, and the keep.
 */
export class Bins {
  readonly root = new THREE.Group();
  private map = new Map<string, THREE.Group>();
  private nearPath: (x: number, z: number) => number;
  constructor(nearPath: (x: number, z: number) => number) { this.nearPath = nearPath; }
  private get(key: string) {
    let g = this.map.get(key);
    if (!g) { g = new THREE.Group(); g.name = key; this.map.set(key, g); this.root.add(g); }
    return g;
  }
  /** true where things are close enough to the path to cast shadows on it */
  near(x: number, z: number) { return this.nearPath(x, z) < 24 && z < -1284 && z > -1466; }
  /** the group for a static thing standing at (x, z) */
  at(x: number, z: number) {
    if (radiusOf(x, z) < KEEP1 + 6) return this.get('core');
    if (this.near(x, z)) return this.get(`path${Math.floor((-1284 - z) / 36)}`);
    const a = angleOf(x, z);
    return this.get(`sector${Math.floor(((a + Math.PI) / TAU) * 8) % 8}`);
  }
  /** add a mesh to the group for its own position; near the path it casts shadows */
  add(m: THREE.Object3D, cast?: boolean) {
    const p = m.getWorldPosition(new THREE.Vector3());
    const near = this.near(p.x, p.z);
    m.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = cast ?? near; mm.receiveShadow = true; } });
    this.at(p.x, p.z).add(m);
    return m;
  }
  /** add a mesh whose geometry is already in world space, filed under the point (x, z) */
  addAt(m: THREE.Object3D, x: number, z: number, cast?: boolean) {
    const near = this.near(x, z);
    m.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = cast ?? near; mm.receiveShadow = true; } });
    this.at(x, z).add(m);
    return m;
  }
  groups() { return [...this.map.values()]; }
}
