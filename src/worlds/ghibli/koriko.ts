import * as THREE from 'three';
import { Rng, smoothstep } from '../../engine/math';
import type { ExclusionMask } from '../../engine/Ground';
import { buildFacadeAtlas, cobbleTexture, roofTileTexture, type UvRect, type FacadeAtlas } from './korikoAtlas';

/**
 * Koriko: terraces of attached townhouses stepping up the hill behind the station, cobbled streets in front
 * of each row, and a short waterfront row between the track and the sea.
 *
 * All houses are merged into a few meshes per stretch of town (one each for painted walls, roof tiles and
 * plain trim), so the whole town is a few dozen draw calls.
 */

export const KORIKO_ROW0 = 14;     // distance from the track to the front of the first row
export const KORIKO_STEP = 23;     // distance between rows (street + house + garden bank)
export const KORIKO_ROWS = 6;
export const KORIKO_STREET = 5;    // cobbled street in front of each row
export const KORIKO_Z0 = 16;       // town extends from here...
export const KORIKO_Z1 = -540;     // ...to here along the track

const BW = 2.4;   // bay width
const FH = 3.0;   // storey height

const WALLS = [0xf2e6c9, 0xf1d98f, 0xe9b597, 0xf3c9a4, 0xeecbc4, 0xcfe2cf, 0xc9dbe6, 0xf5e6a8, 0xf4f1ea, 0xe3cfa6, 0xd9d2e3, 0xf0c27a, 0xe6d6b8];
const ROOFS = [0xc0643f, 0xb84a35, 0x8f4a39, 0xd27a4a, 0xc0643f, 0xb84a35, 0x5f8f7a, 0x5a6570, 0x7a4a3a];
const TRIMS = [0xf4efe4, 0xf4efe4, 0xe8dcc4, 0xd8ccb4, 0xf8f4ea];

/** Collects quads/triangles in local space, transformed by the current house matrix, into one geometry. */
export class Acc {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private v = new THREE.Vector3();
  private n = new THREE.Vector3();
  setMatrix(m: THREE.Matrix4) { this.m.copy(m); this.nm.getNormalMatrix(m); }
  private push(p: THREE.Vector3, u: number, v: number, c: THREE.Color) {
    this.v.copy(p).applyMatrix4(this.m);
    this.pos.push(this.v.x, this.v.y, this.v.z);
    this.nrm.push(this.n.x, this.n.y, this.n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
  }
  /** a,b,c,d counter-clockwise seen from the front (a bottom-left, b bottom-right, c top-right, d top-left). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uv: UvRect | [number, number, number, number, number, number, number, number], color: THREE.Color) {
    this.n.subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize().applyMatrix3(this.nm).normalize();
    const k = this.pos.length / 3;
    if (Array.isArray(uv)) {
      this.push(a, uv[0], uv[1], color); this.push(b, uv[2], uv[3], color); this.push(c, uv[4], uv[5], color); this.push(d, uv[6], uv[7], color);
    } else {
      this.push(a, uv.u0, uv.v0, color); this.push(b, uv.u1, uv.v0, color); this.push(c, uv.u1, uv.v1, color); this.push(d, uv.u0, uv.v1, color);
    }
    this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, uva: [number, number], uvb: [number, number], uvc: [number, number], color: THREE.Color) {
    this.n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize().applyMatrix3(this.nm).normalize();
    const k = this.pos.length / 3;
    this.push(a, uva[0], uva[1], color); this.push(b, uvb[0], uvb[1], color); this.push(c, uvc[0], uvc[1], color);
    this.idx.push(k, k + 1, k + 2);
  }
  /** axis-aligned box in local space (all six faces), untextured */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.Color, skipBottom = true) {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const z: [number, number, number, number, number, number, number, number] = [0, 0, 1, 0, 1, 1, 0, 1];
    this.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), z, color);
    this.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), z, color);
    this.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), z, color);
    this.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), z, color);
    this.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), z, color);
    if (!skipBottom) this.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), z, color);
  }
  get empty() { return this.idx.length === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export interface HouseSpec {
  /** world position of the middle of the front wall at street level */
  x: number; y: number; z: number;
  /** rotation so that local +z (the front) faces the street */
  rotY: number;
  bays: number; floors: number; depth: number;
  wall: THREE.Color; roof: THREE.Color; trim: THREE.Color;
  roofType: 'eaves' | 'gable';
  pitch: number;
  upper: UvRect; upperTop: UvRect; ground: 'door' | 'shop' | 'window' | 'arch';
  dormers: number; chimney: boolean; awning: number;
  /** how far the walls reach below street level (to meet sloping ground) */
  sink: number;
}

interface Accs { wall: Acc; roof: Acc; trim: Acc }

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const STONE = new THREE.Color(0xa89c88), SOFFIT = new THREE.Color(0x5a4a3e), FASCIA = new THREE.Color(0x6a5242);
const CHIMNEY = [new THREE.Color(0x9a5a44), new THREE.Color(0xd8ccb4), new THREE.Color(0x8a7a6a)];

/** Adds one house to the accumulators. */
export function addHouse(a: Accs, atlas: FacadeAtlas, h: HouseSpec, rng: Rng) {
  const m = new THREE.Matrix4().makeRotationY(h.rotY).setPosition(h.x, h.y, h.z);
  a.wall.setMatrix(m); a.roof.setMatrix(m); a.trim.setMatrix(m);
  const W = h.bays * BW, D = h.depth, H = h.floors * FH, x0 = -W / 2;
  const cells = atlas.cells;
  // --- front facade ---
  const doorBay = h.bays > 1 ? Math.floor(rng.next() * h.bays) : 0;
  for (let f = 0; f < h.floors; f++) {
    for (let b = 0; b < h.bays; b++) {
      let cell: UvRect;
      if (f === 0) {
        if (h.ground === 'shop') cell = b === doorBay && h.bays > 2 ? cells.ground[Math.floor(rng.next() * 5)] : cells.shop[h.awning >= 0 ? h.awning : Math.floor(rng.next() * cells.shop.length)];
        else if (h.ground === 'arch' && b === doorBay) cell = cells.ground[7];
        else cell = b === doorBay ? cells.ground[Math.floor(rng.next() * 5)] : cells.ground[5 + Math.floor(rng.next() * 2)];
      } else cell = f === h.floors - 1 ? h.upperTop : h.upper;
      const xa = x0 + b * BW, xb = xa + BW, ya = f * FH, yb = ya + FH;
      a.wall.quad(V(xa, ya, 0), V(xb, ya, 0), V(xb, yb, 0), V(xa, yb, 0), cell, h.wall);
    }
  }
  // stone footing below street level on every side
  a.trim.quad(V(x0, -h.sink, 0), V(-x0, -h.sink, 0), V(-x0, 0, 0), V(x0, 0, 0), [0, 0, 1, 0, 1, 1, 0, 1], STONE);
  // --- back and sides ---
  for (let f = 0; f < h.floors; f++) {
    for (let b = 0; b < h.bays; b++) {
      const xa = -x0 - b * BW, xb = xa - BW, ya = f * FH, yb = ya + FH;
      a.wall.quad(V(xa, ya, -D), V(xb, ya, -D), V(xb, yb, -D), V(xa, yb, -D), f === 0 ? cells.side[0] : cells.back[Math.floor(rng.next() * cells.back.length)], h.wall);
    }
  }
  a.trim.quad(V(-x0, -h.sink, -D), V(x0, -h.sink, -D), V(x0, 0, -D), V(-x0, 0, -D), [0, 0, 1, 0, 1, 1, 0, 1], STONE);
  const sideChunks = Math.max(1, Math.round(D / BW));
  const cw = D / sideChunks;
  for (const side of [-1, 1]) {
    const sx = side * (W / 2);
    for (let f = 0; f < h.floors; f++) {
      for (let k = 0; k < sideChunks; k++) {
        const za = side > 0 ? -k * cw : -D + k * cw, zb = side > 0 ? za - cw : za + cw;
        const ya = f * FH, yb = ya + FH;
        const cell = f > 0 && rng.chance(0.2) ? cells.side[1] : cells.side[rng.chance(0.5) ? 0 : 2];
        a.wall.quad(V(sx, ya, za), V(sx, ya, zb), V(sx, yb, zb), V(sx, yb, za), cell, h.wall);
      }
    }
    const za = side > 0 ? 0 : -D, zb = side > 0 ? -D : 0;
    a.trim.quad(V(sx, -h.sink, za), V(sx, -h.sink, zb), V(sx, 0, zb), V(sx, 0, za), [0, 0, 1, 0, 1, 1, 0, 1], STONE);
  }
  // --- trim: string course above the ground floor and a cornice ---
  a.trim.box(x0, -x0, FH - 0.08, FH + 0.1, 0, 0.12, h.trim);
  const p = h.pitch;
  if (h.roofType === 'eaves') {
    a.trim.box(x0, -x0, H - 0.4, H, 0, 0.3, h.trim);
    const RH = p * D / 2, OV = 0.55;
    // side gable triangles (walls)
    const plain = cells.side[0];
    const um = (plain.u0 + plain.u1) / 2;
    a.wall.tri(V(W / 2, H, 0), V(W / 2, H, -D), V(W / 2, H + RH, -D / 2), [plain.u0, plain.v0], [plain.u1, plain.v0], [um, plain.v1], h.wall);
    a.wall.tri(V(-W / 2, H, -D), V(-W / 2, H, 0), V(-W / 2, H + RH, -D / 2), [plain.u0, plain.v0], [plain.u1, plain.v0], [um, plain.v1], h.wall);
    // roof slopes; tile uv in world units
    const slope = Math.hypot(D / 2 + OV, RH + OV * p);
    const ey = H - OV * p;
    const t = 0.5;
    a.roof.quad(V(x0, ey, OV), V(-x0, ey, OV), V(-x0, H + RH, -D / 2), V(x0, H + RH, -D / 2), [0, 0, W * t, 0, W * t, slope * t, 0, slope * t], h.roof);
    a.roof.quad(V(-x0, ey, -D - OV), V(x0, ey, -D - OV), V(x0, H + RH, -D / 2), V(-x0, H + RH, -D / 2), [0, 0, W * t, 0, W * t, slope * t, 0, slope * t], h.roof);
    // fascia boards and soffits under the eaves
    a.trim.quad(V(x0, ey - 0.25, OV), V(-x0, ey - 0.25, OV), V(-x0, ey, OV), V(x0, ey, OV), [0, 0, 1, 0, 1, 1, 0, 1], FASCIA);
    a.trim.quad(V(-x0, ey - 0.25, -D - OV), V(x0, ey - 0.25, -D - OV), V(x0, ey, -D - OV), V(-x0, ey, -D - OV), [0, 0, 1, 0, 1, 1, 0, 1], FASCIA);
    a.trim.quad(V(x0, ey - 0.25, 0), V(-x0, ey - 0.25, 0), V(-x0, ey - 0.25, OV), V(x0, ey - 0.25, OV), [0, 0, 1, 0, 1, 1, 0, 1], SOFFIT);
    // dormers on the front slope
    const dh = 1.75, dw = 1.5;
    const zf = -0.9, yb = H + 0.9 * p;
    const apex = yb + dh + 0.55;
    if (h.dormers > 0 && apex < H + RH - 0.2) {
      for (let i = 0; i < h.dormers; i++) {
        const cx = x0 + (W * (i + 1)) / (h.dormers + 1);
        const zb = -D / 2 + 0.3;
        a.wall.quad(V(cx - dw / 2, yb - 0.3, zf), V(cx + dw / 2, yb - 0.3, zf), V(cx + dw / 2, yb + dh, zf), V(cx - dw / 2, yb + dh, zf), cells.dormer[Math.floor(rng.next() * cells.dormer.length)], h.wall);
        for (const s of [-1, 1]) {
          const sx = cx + s * dw / 2;
          const q = s > 0 ? [V(sx, yb - 0.3, zf), V(sx, yb - 0.3, zb), V(sx, yb + dh, zb), V(sx, yb + dh, zf)] : [V(sx, yb - 0.3, zb), V(sx, yb - 0.3, zf), V(sx, yb + dh, zf), V(sx, yb + dh, zb)];
          a.wall.quad(q[0], q[1], q[2], q[3], plain, h.wall);
        }
        // little gable roof on the dormer
        const ov = 0.25;
        const slopeLen = Math.hypot(dw / 2 + ov, 0.55 + ov * 0.6);
        a.roof.quad(V(cx - dw / 2 - ov, yb + dh - ov * 0.6, zf + ov), V(cx, apex, zf + ov), V(cx, apex, zb), V(cx - dw / 2 - ov, yb + dh - ov * 0.6, zb), [0, 0, slopeLen * t, 0, slopeLen * t, (zf - zb + ov) * t, 0, (zf - zb + ov) * t], h.roof);
        a.roof.quad(V(cx, apex, zf + ov), V(cx + dw / 2 + ov, yb + dh - ov * 0.6, zf + ov), V(cx + dw / 2 + ov, yb + dh - ov * 0.6, zb), V(cx, apex, zb), [0, 0, slopeLen * t, 0, slopeLen * t, (zf - zb + ov) * t, 0, (zf - zb + ov) * t], h.roof);
        a.wall.tri(V(cx - dw / 2, yb + dh, zf), V(cx + dw / 2, yb + dh, zf), V(cx, apex - 0.05, zf), [plain.u0, plain.v0], [plain.u1, plain.v0], [um, plain.v1], h.wall);
      }
    }
    if (h.chimney) {
      const cx = x0 + W * (rng.chance(0.5) ? 0.25 : 0.75), cz = -D / 2 + rng.range(-0.8, 0.8);
      const cc = CHIMNEY[Math.floor(rng.next() * CHIMNEY.length)];
      a.trim.box(cx - 0.4, cx + 0.4, H + RH - 1.5, H + RH + 1.3, cz - 0.45, cz + 0.45, cc);
      a.trim.box(cx - 0.52, cx + 0.52, H + RH + 1.3, H + RH + 1.5, cz - 0.57, cz + 0.57, STONE);
    }
  } else {
    // gable facing the street: triangular attic wall front and back, slopes to the sides
    const RH = p * W / 2, OV = 0.45, SO = 0.35;
    const att = h.upperTop === h.upper ? cells.attic[Math.floor(rng.next() * cells.attic.length)] : cells.attic[Math.floor(rng.next() * cells.attic.length)];
    const um = (att.u0 + att.u1) / 2;
    a.wall.tri(V(x0, H, 0), V(-x0, H, 0), V(0, H + RH, 0), [att.u0, att.v0], [att.u1, att.v0], [um, att.v1], h.wall);
    const plain = cells.side[0];
    a.wall.tri(V(-x0, H, -D), V(x0, H, -D), V(0, H + RH, -D), [plain.u0, plain.v0], [plain.u1, plain.v0], [(plain.u0 + plain.u1) / 2, plain.v1], h.wall);
    a.trim.box(x0, -x0, H - 0.15, H + 0.05, 0, 0.2, h.trim);
    const ey = H - SO * p;
    const slope = Math.hypot(W / 2 + SO, RH + SO * p);
    const t = 0.5, L = D + OV * 2;
    // left and right slopes
    a.roof.quad(V(x0 - SO, ey, -D - OV), V(x0 - SO, ey, OV), V(0, H + RH, OV), V(0, H + RH, -D - OV), [0, 0, L * t, 0, L * t, slope * t, 0, slope * t], h.roof);
    a.roof.quad(V(-x0 + SO, ey, OV), V(-x0 + SO, ey, -D - OV), V(0, H + RH, -D - OV), V(0, H + RH, OV), [0, 0, L * t, 0, L * t, slope * t, 0, slope * t], h.roof);
    // barge boards along the front gable
    const bb = 0.22;
    a.trim.quad(V(x0 - SO, ey - bb, OV), V(0, H + RH - bb, OV), V(0, H + RH, OV), V(x0 - SO, ey, OV), [0, 0, 1, 0, 1, 1, 0, 1], FASCIA);
    a.trim.quad(V(0, H + RH - bb, OV), V(-x0 + SO, ey - bb, OV), V(-x0 + SO, ey, OV), V(0, H + RH, OV), [0, 0, 1, 0, 1, 1, 0, 1], FASCIA);
    if (h.chimney) {
      const cz = -D * rng.range(0.3, 0.7);
      const cc = CHIMNEY[Math.floor(rng.next() * CHIMNEY.length)];
      a.trim.box(-0.4, 0.4, H + RH - 1.2, H + RH + 1.2, cz - 0.45, cz + 0.45, cc);
      a.trim.box(-0.52, 0.52, H + RH + 1.2, H + RH + 1.4, cz - 0.57, cz + 0.57, STONE);
    }
  }
  // shop awnings
  if (h.ground === 'shop' && h.awning >= 0) {
    const aw = atlas.cells.awning[h.awning];
    for (let b = 0; b < h.bays; b++) {
      if (b === doorBay && h.bays > 2) continue;
      const xa = x0 + b * BW + 0.12, xb = xa + BW - 0.24;
      const top = V(0, 2.72, 0.02), low = V(0, 2.15, 1.25);
      a.wall.quad(V(xa, low.y, low.z), V(xb, low.y, low.z), V(xb, top.y, top.z), V(xa, top.y, top.z), aw, h.wall);
      a.wall.quad(V(xb, low.y, low.z), V(xa, low.y, low.z), V(xa, top.y, top.z), V(xb, top.y, top.z), aw, h.wall);
      a.wall.quad(V(xa, low.y - 0.3, low.z), V(xb, low.y - 0.3, low.z), V(xb, low.y, low.z), V(xa, low.y, low.z), { u0: aw.u0, u1: aw.u1, v0: aw.v0, v1: aw.v0 + (aw.v1 - aw.v0) * 0.4 }, h.wall);
    }
  }
}

function wallMaterial(atlas: FacadeAtlas) {
  const mat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
  // the atlas alpha marks plain wall: tint only those texels with the house colour
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #if defined( USE_COLOR )
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vColor.rgb, diffuseColor.a);
        diffuseColor.a = 1.0;
      #endif
    `);
  };
  mat.customProgramCacheKey = () => 'koriko-wall-v1';
  return mat;
}

export interface KorikoOptions {
  rng: Rng;
  heightAt: (x: number, z: number) => number;
  trackX: (z: number) => number;
  mask?: ExclusionMask;
  /** return true to leave a gap in a row at this point (plazas, the church, the station) */
  keepClear?: (row: number, x: number, z: number) => boolean;
  /** the clock tower and its square: tower centre, and the square as offsets from the track and a z range */
  tower?: { x: number; z: number; square: { off0: number; off1: number; z0: number; z1: number } };
  /** z of the bakery in the waterfront row */
  bakeryZ?: number;
  /** the station building: front wall position and floor level */
  station?: { x: number; y: number; z: number };
}

/** The whole town: terraced rows on the hill and a waterfront row. */
export function buildKoriko(o: KorikoOptions) {
  const { rng, heightAt, trackX, mask } = o;
  const group = new THREE.Group();
  const atlas = buildFacadeAtlas(20260926);
  const wallMat = wallMaterial(atlas);
  const roofMat = new THREE.MeshLambertMaterial({ map: roofTileTexture(), vertexColors: true });
  const trimMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const cobbleMat = new THREE.MeshLambertMaterial({ map: cobbleTexture(), vertexColors: true });

  // one set of accumulators per 70-unit stretch of town so far stretches can be culled
  const SEG = 70;
  const segs = new Map<number, Accs>();
  const accFor = (z: number) => {
    const k = Math.floor(z / SEG);
    let s = segs.get(k);
    if (!s) { s = { wall: new Acc(), roof: new Acc(), trim: new Acc() }; segs.set(k, s); }
    return s;
  };
  const normalAt = (z: number, side: number) => {
    // unit vector pointing from a row towards the track, perpendicular to it
    const dx = trackX(z - 1) - trackX(z + 1);
    return Math.atan2(side, side * dx * 0.5);
  };

  const makeSpec = (x: number, z: number, rotY: number, bays: number, floors: number, row: number): HouseSpec => {
    const shopChance = row === 0 ? 0.45 : row === 1 ? 0.25 : 0.06;
    const ground = rng.chance(shopChance) ? 'shop' : rng.chance(0.12) ? 'arch' : rng.chance(0.3) ? 'window' : 'door';
    const up = atlas.cells.upper, upP = atlas.cells.upperPlain;
    const useShutters = rng.chance(0.55);
    const upper = useShutters ? up[Math.floor(rng.next() * up.length)] : upP[Math.floor(rng.next() * upP.length)];
    const upperTop = rng.chance(0.7) ? upper : upP[Math.floor(rng.next() * 5)];
    const roofType = rng.chance(0.28) ? 'gable' : 'eaves';
    return {
      x, y: heightAt(x, z), z, rotY, bays, floors, depth: rng.range(8, 10),
      wall: new THREE.Color(WALLS[Math.floor(rng.next() * WALLS.length)]).offsetHSL(rng.range(-0.01, 0.01), rng.range(-0.05, 0.03), rng.range(-0.03, 0.02)),
      roof: new THREE.Color(ROOFS[Math.floor(rng.next() * ROOFS.length)]).offsetHSL(rng.range(-0.01, 0.01), rng.range(-0.05, 0.05), rng.range(-0.04, 0.04)),
      trim: new THREE.Color(TRIMS[Math.floor(rng.next() * TRIMS.length)]),
      roofType, pitch: roofType === 'gable' ? rng.range(1.0, 1.35) : rng.range(0.75, 1.0),
      upper, upperTop, ground,
      dormers: roofType === 'eaves' && rng.chance(0.45) ? Math.min(bays - 1, rng.int(1, 2)) : 0,
      chimney: rng.chance(0.7), awning: ground === 'shop' && rng.chance(0.8) ? Math.floor(rng.next() * 8) : -1,
      sink: 5,
    };
  };

  // --- terraced rows on the hill (left of the track) ---
  for (let row = 0; row < KORIKO_ROWS; row++) {
    const off = KORIKO_ROW0 + row * KORIKO_STEP;
    let z = KORIKO_Z0 - rng.range(0, 8);
    let prevFloors = 0;
    while (z > KORIKO_Z1) {
      const bays = rng.int(2, 3) + (rng.chance(0.15) ? 1 : 0);
      const W = bays * BW;
      const zc = z - W / 2;
      const tx = trackX(zc);
      const x = tx - off;
      if (o.keepClear?.(row, x, zc)) { z -= 2; prevFloors = 0; continue; }
      // occasional alley or small garden between houses
      if (rng.chance(0.07)) { z -= rng.range(3, 7); prevFloors = 0; continue; }
      let floors = rng.int(2, 4) + (row < 2 && rng.chance(0.3) ? 1 : 0);
      if (floors === prevFloors && rng.chance(0.5)) floors += rng.chance(0.5) ? 1 : -1;
      floors = Math.max(2, floors);
      prevFloors = floors;
      const rotY = normalAt(zc, 1);
      const spec = makeSpec(x, zc, rotY, bays, floors, row);
      addHouse(accFor(zc), atlas, spec, rng);
      mask?.rect(x - Math.sin(rotY) * spec.depth / 2, zc - Math.cos(rotY) * spec.depth / 2, W, spec.depth, rotY, 0.4);
      z -= W;
    }
  }
  let bakery: { x: number; y: number; z: number; rotY: number } | null = null;
  // --- waterfront row (right of the track), facing the track ---
  for (const [za, zb] of [[-70, -128], [-352, -420]] as const) {
    let z = za;
    while (z > zb) {
      const bays = rng.int(2, 3);
      const W = bays * BW;
      const zc = z - W / 2;
      const x = trackX(zc) + 14;
      if (heightAt(x, zc) < 1.5 || rng.chance(0.12)) { z -= 3; continue; }
      const rotY = normalAt(zc, -1);
      const spec = makeSpec(x, zc, rotY, bays, rng.int(2, 3), 0);
      if (o.bakeryZ !== undefined && !bakery && zc < o.bakeryZ + 6) {
        // Kiki's bakery: cream walls, red and white awning, a shop front on every bay
        Object.assign(spec, { bays: 3, floors: 2, ground: 'shop', awning: 0, roofType: 'eaves', dormers: 1, wall: new THREE.Color(0xf4e9d8), roof: new THREE.Color(0xb9573d) });
        spec.x = trackX(zc - 1.2) + 14; spec.z = zc - 1.2; spec.y = heightAt(spec.x, spec.z);
        bakery = { x: spec.x, y: spec.y, z: spec.z, rotY };
        addHouse(accFor(spec.z), atlas, spec, rng);
        mask?.rect(spec.x - Math.sin(rotY) * spec.depth / 2, spec.z - Math.cos(rotY) * spec.depth / 2, 3 * BW, spec.depth, rotY, 0.4);
        z -= 3 * BW + 1.2;
        continue;
      }
      addHouse(accFor(zc), atlas, spec, rng);
      mask?.rect(x - Math.sin(rotY) * spec.depth / 2, zc - Math.cos(rotY) * spec.depth / 2, W, spec.depth, rotY, 0.4);
      z -= W;
    }
  }
  // --- the station building, facing the platform ---
  if (o.station) {
    const st = o.station;
    const rotY = normalAt(st.z, 1);
    const spec = makeSpec(st.x, st.z, rotY, 4, 2, 0);
    Object.assign(spec, { y: st.y, depth: 8, ground: 'door', roofType: 'eaves', pitch: 0.8, dormers: 2, chimney: true, awning: -1, sink: 6,
      wall: new THREE.Color(0xf1e4c8), roof: new THREE.Color(0x5f8f7a), trim: new THREE.Color(0xf8f4ea), upper: atlas.cells.upperPlain[3], upperTop: atlas.cells.upperPlain[3] });
    addHouse(accFor(st.z), atlas, spec, rng);
    mask?.rect(st.x - Math.sin(rotY) * 4, st.z - Math.cos(rotY) * 4, 4 * BW, 8, rotY, 0.5);
  }

  // --- the clock tower ---
  let towerTop: THREE.Object3D | null = null;
  if (o.tower) {
    const { x, z } = o.tower;
    const acc = accFor(z);
    const rotY = normalAt(z, 1);
    const y = heightAt(x, z);
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    for (const a of [acc.wall, acc.roof, acc.trim]) a.setMatrix(m);
    const wall = new THREE.Color(0xeadcbf), trim = new THREE.Color(0xf6f0e2);
    const S = 3 * BW, half = S / 2, floors = 9;
    const arch = atlas.cells.upperPlain[3], arch2 = atlas.cells.upperPlain[4];
    // four faces, local frame: front (+z) faces the track
    const faces: Array<(u: number, y0: number, y1: number, cell: UvRect) => void> = [
      (u, y0, y1, c) => acc.wall.quad(V(-half + u, y0, half), V(-half + u + BW, y0, half), V(-half + u + BW, y1, half), V(-half + u, y1, half), c, wall),
      (u, y0, y1, c) => acc.wall.quad(V(half - u, y0, -half), V(half - u - BW, y0, -half), V(half - u - BW, y1, -half), V(half - u, y1, -half), c, wall),
      (u, y0, y1, c) => acc.wall.quad(V(half, y0, half - u), V(half, y0, half - u - BW), V(half, y1, half - u - BW), V(half, y1, half - u), c, wall),
      (u, y0, y1, c) => acc.wall.quad(V(-half, y0, -half + u), V(-half, y0, -half + u + BW), V(-half, y1, -half + u + BW), V(-half, y1, -half + u), c, wall),
    ];
    faces.forEach((face, fi) => {
      for (let f = 0; f < floors; f++) for (let b = 0; b < 3; b++) {
        const cell = f === 0 ? (b === 1 && fi === 0 ? atlas.cells.ground[7] : atlas.cells.side[0]) : f === floors - 1 ? atlas.cells.side[0] : b === 1 ? arch : (f % 3 === 0 ? arch2 : atlas.cells.side[2]);
        face(b * BW, f * FH, (f + 1) * FH, cell);
      }
    });
    acc.trim.box(-half, half, -5, 0, -half, half, STONE);
    for (const f of [1, 4, 7]) acc.trim.box(-half - 0.12, half + 0.12, f * FH - 0.1, f * FH + 0.15, -half - 0.12, half + 0.12, trim);
    const top = floors * FH;
    acc.trim.box(-half - 0.45, half + 0.45, top - 0.2, top + 0.5, -half - 0.45, half + 0.45, trim);
    // belfry: a narrower stage with dark arched openings
    const bh = 4.2, bs = 2 * BW, bhalf = bs / 2;
    const bf = atlas.cells.ground[7];
    const by = top + 0.5;
    acc.wall.quad(V(-bhalf, by, bhalf), V(0, by, bhalf), V(0, by + bh, bhalf), V(-bhalf, by + bh, bhalf), bf, wall);
    acc.wall.quad(V(0, by, bhalf), V(bhalf, by, bhalf), V(bhalf, by + bh, bhalf), V(0, by + bh, bhalf), bf, wall);
    acc.wall.quad(V(bhalf, by, -bhalf), V(0, by, -bhalf), V(0, by + bh, -bhalf), V(bhalf, by + bh, -bhalf), bf, wall);
    acc.wall.quad(V(0, by, -bhalf), V(-bhalf, by, -bhalf), V(-bhalf, by + bh, -bhalf), V(0, by + bh, -bhalf), bf, wall);
    acc.wall.quad(V(bhalf, by, bhalf), V(bhalf, by, 0), V(bhalf, by + bh, 0), V(bhalf, by + bh, bhalf), bf, wall);
    acc.wall.quad(V(bhalf, by, 0), V(bhalf, by, -bhalf), V(bhalf, by + bh, -bhalf), V(bhalf, by + bh, 0), bf, wall);
    acc.wall.quad(V(-bhalf, by, -bhalf), V(-bhalf, by, 0), V(-bhalf, by + bh, 0), V(-bhalf, by + bh, -bhalf), bf, wall);
    acc.wall.quad(V(-bhalf, by, 0), V(-bhalf, by, bhalf), V(-bhalf, by + bh, bhalf), V(-bhalf, by + bh, 0), bf, wall);
    acc.trim.box(-bhalf - 0.35, bhalf + 0.35, by + bh, by + bh + 0.45, -bhalf - 0.35, bhalf + 0.35, trim);
    // clock faces, copper spire, weather vane
    const tg = new THREE.Group();
    tg.position.set(x, y, z); tg.rotation.y = rotY;
    const faceTex = clockFaceTexture();
    const faceMat = new THREE.MeshLambertMaterial({ map: faceTex });
    for (let i = 0; i < 4; i++) {
      const cm = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), faceMat);
      const a = (i / 4) * Math.PI * 2;
      cm.position.set(Math.sin(a) * (half + 0.03), top - FH / 2 - 0.1, Math.cos(a) * (half + 0.03));
      cm.rotation.y = a;
      tg.add(cm);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.14, 6, 32), new THREE.MeshLambertMaterial({ color: 0x3a3f3a }));
      ring.position.copy(cm.position); ring.rotation.y = a;
      tg.add(ring);
    }
    const copper = new THREE.MeshLambertMaterial({ color: 0x5f9a82 });
    const spireY = by + bh + 0.45;
    const roof = new THREE.Mesh(spireGeometry(bhalf + 0.6, 9), copper);
    roof.position.y = spireY;
    tg.add(roof);
    const gold = new THREE.MeshLambertMaterial({ color: 0xd8b860, emissive: 0x3a2a08 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), gold); ball.position.y = spireY + 9.2; tg.add(ball);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), gold); rod.position.y = spireY + 10.2; tg.add(rod);
    tg.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    group.add(tg);
    towerTop = tg;
    mask?.rect(x, z, S + 1, S + 1, rotY, 0.5);
    // the square: cobbles on the terrace around the tower
    const sq = o.tower.square;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const nz = Math.ceil((sq.z0 - sq.z1) / 2), nx = Math.ceil((sq.off1 - sq.off0) / 2);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const zz = sq.z0 - (j / nz) * (sq.z0 - sq.z1);
      const xx = trackX(zz) - (sq.off0 + (i / nx) * (sq.off1 - sq.off0));
      pos.push(xx, heightAt(xx, zz) + 0.06, zz); uv.push(xx / 4, zz / 4);
      if (i < nx && j < nz) { const k = j * (nx + 1) + i; idx.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2); }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0.95), 3));
    sg.setIndex(idx);
    sg.computeVertexNormals();
    if ((sg.attributes.normal as THREE.BufferAttribute).getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } sg.setIndex(idx); sg.computeVertexNormals(); }
    const square = new THREE.Mesh(sg, cobbleMat);
    square.receiveShadow = true;
    group.add(square);
    if (mask) for (let zz = sq.z0; zz >= sq.z1; zz -= 3) mask.path([{ x: trackX(zz) - sq.off0, z: zz }, { x: trackX(zz) - sq.off1, z: zz }], 3.4);
  }

  for (const acc of segs.values()) {
    for (const [a, mat] of [[acc.wall, wallMat], [acc.roof, roofMat], [acc.trim, trimMat]] as const) {
      if (a.empty) continue;
      const mesh = new THREE.Mesh(a.build(), mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // --- cobbled streets in front of each row ---
  const streetCol = new THREE.Color(1, 1, 1);
  for (let row = 0; row < KORIKO_ROWS; row++) {
    const off = KORIKO_ROW0 + row * KORIKO_STEP;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const across = [off, off - KORIKO_STREET / 2, off - KORIKO_STREET];
    let n = 0;
    for (let z = KORIKO_Z0 + 4; z >= KORIKO_Z1 - 4; z -= 2) {
      const tx = trackX(z);
      across.forEach((a, i) => {
        const x = tx - a;
        pos.push(x, heightAt(x, z) + 0.07, z);
        uv.push((i * KORIKO_STREET) / 2 / 4, z / 4);
        const shade = 0.92 + 0.08 * Math.sin(z * 0.37 + row);
        col.push(streetCol.r * shade, streetCol.g * shade, streetCol.b * shade);
      });
      if (n > 0) {
        const k = (n - 1) * 3;
        idx.push(k, k + 3, k + 1, k + 1, k + 3, k + 4, k + 1, k + 4, k + 2, k + 2, k + 4, k + 5);
      }
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // make sure the strip faces up whatever the winding
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    if (nrm.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    const street = new THREE.Mesh(g, cobbleMat);
    street.receiveShadow = true;
    group.add(street);
    if (mask) {
      const pts: Array<{ x: number; z: number }> = [];
      for (let z = KORIKO_Z0 + 4; z >= KORIKO_Z1 - 4; z -= 6) pts.push({ x: trackX(z) - (off - KORIKO_STREET / 2), z });
      mask.path(pts, KORIKO_STREET + 0.6);
    }
  }
  return { group, atlas, wallMat, roofMat, trimMat, bakery, towerTop };
}

/** An eight-sided copper spire: a flared lower skirt and a tall needle. */
function spireGeometry(r: number, h: number) {
  const pts: THREE.Vector2[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = t < 0.3 ? r * (1 - t * 1.4) : r * 0.58 * Math.pow(1 - (t - 0.3) / 0.7, 1.4);
    pts.push(new THREE.Vector2(Math.max(0.02, rr), t * h));
  }
  const g = new THREE.LatheGeometry(pts, 8);
  g.rotateY(Math.PI / 8);
  g.computeVertexNormals();
  return g;
}

function clockFaceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f5efdf'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2f3130'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#2f3130'; g.font = 'bold 26px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  numerals.forEach((s, i) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; g.fillText(s, 128 + Math.cos(a) * 90, 128 + Math.sin(a) * 90); });
  g.lineCap = 'round';
  g.lineWidth = 8; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 42, 128 - 30); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 8, 128 - 78); g.stroke();
  g.beginPath(); g.arc(128, 128, 8, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Terraced height for Koriko's hill: flat bands for each street and row of houses, with grassy banks between.
 * `natural` is the untouched hill. Blends back to the natural hill at the ends of the town.
 */
export function korikoTerrace(x: number, z: number, tx: number, natural: (x: number, z: number) => number) {
  const w = smoothstep(KORIKO_Z1 - 45, KORIKO_Z1 - 5, z) * (1 - smoothstep(KORIKO_Z0 + 8, KORIKO_Z0 + 28, z));
  const off = tx - x;
  const start = KORIKO_ROW0 - KORIKO_STREET - 1;
  const end = KORIKO_ROW0 + KORIKO_STEP * (KORIKO_ROWS - 1) + 14;
  if (w <= 0 || off < start - 6 || off > end + 10) return natural(x, z);
  const f = (off - start) / KORIKO_STEP;
  const i = Math.max(0, Math.floor(f)), t = f - Math.floor(f);
  const level = (k: number) => natural(tx - (KORIKO_ROW0 + KORIKO_STEP * k + 4), z);
  const flat = (KORIKO_STREET + 1 + 10) / KORIKO_STEP;
  let h: number;
  if (f < 0) h = level(0);
  else if (i >= KORIKO_ROWS - 1) h = level(KORIKO_ROWS - 1);
  else h = level(i) + (level(i + 1) - level(i)) * smoothstep(flat, 0.97, t);
  // fade the terracing out at the inner and outer edges of the town band
  const edge = smoothstep(start - 6, start, off) * (1 - smoothstep(end, end + 10, off));
  const k = w * edge;
  return h * k + natural(x, z) * (1 - k);
}
