import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildTerrain, type Placement } from '../../../engine/Builders';
import { fluffyForest } from '../../../engine/Foliage';
import { HeightGrid } from '../../../engine/HeightGrid';
import { addGroundDetail, paintedDetailTexture } from '../../../engine/Ground';
import { Rng, clamp, fbm, lerp, smoothstep } from '../../../engine/math';
import { CH_OUT, VALLEY, Z, type Plan } from './plan';

/*
 * The mountain: snow in three nested grids (fine round the run, coarser further out, coarsest for the valley
 * and the far slopes), with rock showing on the steep faces, crags of lilac rock with snow on their tops, and
 * firs dusted with snow along the run and down the valley sides.
 */

/** The centre of the painted backdrop's rings; the far terrain stays inside the nearest ring. */
export const RING_C = new THREE.Vector3(0, 0, -720);
export const FAR_R = 540;

const SNOW = new THREE.Color(0xf7f5fb), SNOW_SHADE = new THREE.Color(0xdcdcf0), ROCK = new THREE.Color(0x8e86a4), ROCK_D = new THREE.Color(0x6a6482), VALLEY_C = new THREE.Color(0xe6eaf6);

export interface Mountain {
  group: THREE.Group;
  /** the fine grid's height (exactly the visible snow near the run) */
  near: HeightGrid;
  /** the snow height anywhere (fine grid where it reaches, else the plan's height) */
  ground(x: number, z: number): number;
  occluders: THREE.Object3D[];
}

export function buildMountain(plan: Plan, avoid: (x: number, z: number) => boolean, lowDetail: boolean): Mountain {
  const group = new THREE.Group();
  const rng = new Rng(4401);
  const NEAR = { x0: -36, x1: 34, z0: -900, z1: -530 };
  const MID = { x0: -180, x1: 180, z0: -1000, z1: -470 };
  const inBox = (b: typeof NEAR, x: number, z: number, pad: number) => Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z) - pad;
  // each coarser grid sinks a little inside the finer one, so the finer one is always the one you see
  const sink = (b: typeof NEAR, x: number, z: number, depth: number) => depth * smoothstep(0, 5, inBox(b, x, z, 0));

  const near = new HeightGrid(NEAR.x0, NEAR.x1, NEAR.z0, NEAR.z1, 1.25, plan.height);
  const midH = (x: number, z: number) => plan.height(x, z) - sink(NEAR, x, z, 3);
  const farH = (x: number, z: number) => {
    let h = plan.height(x, z) - sink(MID, x, z, 4);
    // past the backdrop's first ring the land sinks out of sight behind it
    const r = Math.hypot(x - RING_C.x, z - RING_C.z);
    h = lerp(h, VALLEY - 140, smoothstep(FAR_R - 70, FAR_R, r));
    return h;
  };

  const detail = paintedDetailTexture(4402, 512, 2400);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(mat, detail, { scaleA: 30, scaleB: 6, strength: 0.32 });
  const color = (x: number, z: number, y: number, slope: number, out: THREE.Color) => {
    const n = fbm(x * 0.08, z * 0.08, 3);
    out.copy(SNOW).lerp(SNOW_SHADE, clamp(n * 0.6 - 0.1, 0, 0.5));
    // rock on the steep faces, in bands
    const rock = smoothstep(0.42, 0.62, slope + (n - 0.5) * 0.25);
    if (rock > 0) out.lerp(fbm(x * 0.3, y * 0.5, 2) > 0.5 ? ROCK : ROCK_D, rock * 0.92);
    // the valley floor a touch bluer
    out.lerp(VALLEY_C, smoothstep(VALLEY + 30, VALLEY + 5, y) * 0.5);
  };

  const t1 = buildTerrain({ xMin: NEAR.x0, xMax: NEAR.x1, zMin: NEAR.z0, zMax: NEAR.z1, res: 1.25, chunk: 70, height: (x, z) => near.sample(x, z), color, material: mat });
  const t2 = buildTerrain({ xMin: MID.x0, xMax: MID.x1, zMin: MID.z0, zMax: MID.z1, res: lowDetail ? 6 : 4, chunk: 180, height: midH, color, material: mat });
  const t3 = buildTerrain({ xMin: -620, xMax: 620, zMin: -1300, zMax: -160, res: lowDetail ? 26 : 18, chunk: 620, height: farH, color, material: mat });
  t3.traverse((o) => { (o as THREE.Mesh).receiveShadow = false; });
  group.add(t1, t2, t3);

  const ground = (x: number, z: number) => (inBox(NEAR, x, z, 1) > 0 ? near.sample(x, z) : plan.height(x, z));

  // ---------- crags: lumps of lilac rock with snow lying on their tops ----------
  {
    const rockGeo: THREE.BufferGeometry[] = [], capGeo: THREE.BufferGeometry[] = [];
    const lump = (x: number, z: number, s: number, sq = 1) => {
      const y = ground(x, z);
      const g = new THREE.DodecahedronGeometry(1, 1);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const k = 0.75 + fbm(vx * 1.7 + x, vz * 1.7 + z, 2) * 0.55;
        p.setXYZ(i, vx * k * s, vy * k * s * sq * (vy > 0 ? 1.1 : 0.7), vz * k * s);
      }
      g.rotateY(rng.range(0, Math.PI * 2));
      g.translate(x, y + s * sq * 0.35, z);
      g.computeVertexNormals();
      rockGeo.push(g.toNonIndexed());
      // a cap of snow: the same lump squashed and lifted, cut to its top
      const c = new THREE.SphereGeometry(s * 0.95, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
      c.scale(1, 0.55 * sq, 1);
      c.translate(x, y + s * sq * 0.35 + s * sq * 0.42, z);
      capGeo.push(c.toNonIndexed());
    };
    // along the run, on the banks and slopes
    for (let i = 0; i < (lowDetail ? 40 : 70); i++) {
      const z = rng.range(Z.tip - 4, Z.edge);
      const p = plan.road.at(z);
      const side = rng.sign();
      const lat = side * rng.range(9, 44);
      const x = p.x + lat;
      if (avoid(x, z) || (z < Z.ramp0 + 4 && z > Z.touch - 6 && Math.abs(lat) < 34)) continue;
      lump(x, z, rng.range(1.2, 3.6), rng.range(0.8, 1.4));
    }
    // a ring of crags round the summit plateau and the peak behind it
    for (let i = 0; i < 26; i++) {
      const a = rng.range(-Math.PI * 0.95, Math.PI * 0.95);
      const r = rng.range(36, 50);
      const x = Math.sin(a) * r, z = -566 + Math.cos(a) * r * 0.9;
      if (avoid(x, z)) continue;
      lump(x, z, rng.range(1.6, 3.6), rng.range(1, 1.6));
    }
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x9890ae, flatShading: true });
    const capMat = new THREE.MeshLambertMaterial({ color: 0xf8f6fc });
    const rocks = new THREE.Mesh(mergeGeometries(rockGeo, false)!, rockMat);
    const caps = new THREE.Mesh(mergeGeometries(capGeo, false)!, capMat);
    rocks.castShadow = true; rocks.receiveShadow = true; caps.receiveShadow = true;
    group.add(rocks, caps);
  }

  // ---------- firs dusted with snow ----------
  {
    const style = { shape: 'conifer' as const, trunk: 0x4a3428, leaves: [0x2c5848, 0x356452, 0x24483e, 0x3a5e58], snow: 0.85, density: 0.9 };
    const nearPl: Placement[] = [], farPl: Placement[] = [];
    const tryTree = (x: number, z: number, list: Placement[], s: [number, number]) => {
      if (avoid(x, z)) return;
      const y = ground(x, z);
      if (y < VALLEY + 2) return;
      // not on cliffs
      if (Math.abs(ground(x + 1.5, z) - ground(x - 1.5, z)) > 3.2 || Math.abs(ground(x, z + 1.5) - ground(x, z - 1.5)) > 3.2) return;
      list.push({ x, y: y - 0.3, z, scale: rng.range(s[0], s[1]), rot: rng.range(0, Math.PI * 2) });
    };
    // close to the run, so they whip past: thick through the channel's curves, sparser by the jump
    for (let i = 0; i < (lowDetail ? 260 : 420); i++) {
      const z = rng.range(Z.tip - 6, Z.edge + 4);
      const p = plan.road.at(z);
      const side = rng.sign();
      const minLat = z < Z.ramp0 + 2 && z > Z.touch - 14 ? 28 : z > Z.chan1 ? CH_OUT + 5.5 : 8;
      const lat = side * (minLat + Math.pow(rng.next(), 1.6) * 52);
      tryTree(p.x + lat, z, nearPl, [0.9, 1.6]);
    }
    // round the summit, below its rim
    for (let i = 0; i < 60; i++) {
      const a = rng.range(-Math.PI, Math.PI), r = rng.range(46, 90);
      tryTree(Math.sin(a) * r, -590 + Math.cos(a) * r, nearPl, [1, 1.5]);
    }
    // down the valley sides
    for (let i = 0; i < (lowDetail ? 260 : 520); i++) {
      const x = rng.range(-330, 330), z = rng.range(-1150, -560);
      if (Math.abs(x) < 70 && z > Z.edge - 30) continue;
      const y = plan.height(x, z);
      if (y > 30 || y < VALLEY + 3) continue;
      tryTree(x, z, farPl, [1.3, 2.4]);
    }
    const nf = fluffyForest(style, nearPl, new Rng(4403), { castShadow: !lowDetail, variants: 3 });
    const ff = fluffyForest({ ...style, density: 0.55 }, farPl, new Rng(4404), { castShadow: false, variants: 2 });
    group.add(nf, ff);
  }

  return { group, near, ground, occluders: [t1, t2] };
}
