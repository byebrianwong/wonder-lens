import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, buildTerrain, cyl, mesh, sphere, type Placement } from '../../../engine/Builders';
import { HeightGrid } from '../../../engine/HeightGrid';
import { GrassField } from '../../../engine/Grass';
import { ExclusionMask, addGroundDetail, paintedDetailTexture } from '../../../engine/Ground';
import { canopyGeometry, fluffyForest, flowerField, foliageMaterial, treeLayout } from '../../../engine/Foliage';
import { boxUV, charToon } from '../../../engine/Paint';
import { Rng, TAU, fbm, lerp, smoothstep } from '../../../engine/math';
import { buildFarmhouse } from '../../ghibli/farmhouse';
import { woodGrain } from '../../ghibli/characterTextures';
import { granite } from '../../ghibli/propTextures';
import { boxProxy, optimize } from '../common';
import { BED, DANCE_FLOOR, HOUSE, LANE_HALF, LINE, NEAR, PADDIES_BACK, PADDIES_FRONT_LEFT, PADDIES_FRONT_RIGHT, PATCHES, PUMP, YARD, laneX, type PaddyBlock } from './layout';
import { cornTexture, laundryTexture, riceTexture, shojiGlow, soilTexture, vineTexture, windowGlow } from './textures';

/*
 * Totoro's garden: the ground, the old house with its veranda, the yard, the pump, the washing line, the
 * vegetable patches, the seed bed, the rice paddies, the meadow of long grass, the camphor wood on the
 * hillside and the hills all round. Built once for midnight (the "garden" scene) and once for dawn (the
 * "home" scene), from the same layout (layout.ts) shifted along z.
 */

export interface PlaceOpts {
  /** z offset of the layout: world z = local z + oz */
  oz: number;
  night: boolean;
  lowDetail: boolean;
  /** the right-hand paddies beyond the meadow (the home scene has its hill there instead) */
  frontRight: boolean;
  /** scene-specific ground: given a world point and the garden's own height there, return the height */
  shape?: (x: number, z: number, h: number) => number;
  /** the stretch where long grass grows, in local units */
  grass: { x0: number; x1: number; z0: number; z1: number };
  /** world circles kept free of trees and grass tufts (a hill path, a giant tree's roots) */
  clear?: Array<{ x: number; z: number; r: number }>;
  /** world z beyond which (towards -z) nothing is built: the next scene's ground starts there */
  zLimit?: number;
}

export interface Place {
  /** everything static, already merged */
  group: THREE.Group;
  /** the terrain meshes (occluders) */
  terrain: THREE.Group;
  /** box stand-ins for the house, for line-of-sight checks */
  proxies: THREE.Group;
  /** ground height at a world point */
  height(x: number, z: number): number;
  grid: HeightGrid;
  grass: GrassField;
  /** window glows of the house, so a scene can brighten them */
  glow: THREE.MeshBasicMaterial | null;
  /** where soot sprites can come out of the house: world points just inside the windows */
  windows: THREE.Vector3[];
  update(t: number, camera: THREE.Camera): void;
}

const rectW = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number, soft: number) => {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return (1 - smoothstep(0, soft, dx)) * (1 - smoothstep(0, soft, dz));
};
const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

/** Is a local point on the water of a paddy cell (not on a bund)? */
function inPaddyWater(b: PaddyBlock, x: number, z: number) {
  if (!inRect(b, x, z)) return false;
  const u = (x - b.x0) % b.cw, v = (z - b.z0) % b.cd;
  return u > 0.8 && u < b.cw - 0.8 && v > 0.8 && v < b.cd - 0.8;
}

export function buildPlace(o: PlaceOpts): Place {
  const { oz, night } = o;
  const rng = new Rng(night ? 5101 : 5102);
  const group = new THREE.Group();
  const live = new THREE.Group();
  const blocks: PaddyBlock[] = [...PADDIES_BACK, PADDIES_FRONT_LEFT, ...(o.frontRight ? [PADDIES_FRONT_RIGHT] : [])];

  // ---------- the shape of the land (local coordinates) ----------
  const natural = (lx: number, lz: number) => {
    const roll = (fbm(lx * 0.018 + 3.1, lz * 0.018 - 7.3, 3) - 0.5) * 1.6;
    // the hillside behind the house, where the camphor wood grows
    const hill = smoothstep(-36, -130, lx) * (14 + 18 * fbm(lz * 0.009 + 2.2, lx * 0.009, 2));
    // a ring of low hills all round the valley
    const r = Math.hypot(lx - 10, (lz + 40) * 0.9);
    const far = smoothstep(230, 470, r) * (18 + 46 * fbm(lx * 0.004 + 9, lz * 0.004 - 4, 3));
    return roll + hill + far;
  };
  const flat = (lx: number, lz: number) => {
    let w = 1 - smoothstep(LANE_HALF + 0.8, 8, Math.abs(lx - laneX(lz)));
    w = Math.max(w, rectW(YARD, lx, lz, 6));
    for (const p of PATCHES) w = Math.max(w, rectW(p, lx, lz, 3));
    for (const b of blocks) w = Math.max(w, rectW(b, lx, lz, 5));
    w = Math.max(w, 1 - smoothstep(DANCE_FLOOR.r, DANCE_FLOOR.r + 5, Math.hypot(lx - DANCE_FLOOR.x, lz - DANCE_FLOOR.z)));
    return w;
  };
  const localH = (lx: number, lz: number) => lerp(natural(lx, lz), 0, flat(lx, lz));
  const worldH = (x: number, z: number) => { const h = localH(x, z - oz); return o.shape ? o.shape(x, z, h) : h; };
  // the near grid in world z; it stops where the next scene's ground begins
  const nz0 = Math.max(NEAR.z0 + oz, o.zLimit ?? -Infinity), nz1 = NEAR.z1 + oz;
  const grid = new HeightGrid(NEAR.x0, NEAR.x1, nz0, nz1, NEAR.res, worldH);
  const beyond = (wz: number) => o.zLimit !== undefined && wz < o.zLimit + 4;
  const height = (x: number, z: number) => grid.sample(x, z);

  // ---------- bare earth: the lane, the yard, the paths, the beds (painted on the ground in a shader) ----------
  const roads = new ExclusionMask(-44, 32, nz0, nz1, 0.5);
  {
    const pts: Array<{ x: number; z: number }> = [];
    for (let lz = NEAR.z1; lz >= nz0 - oz; lz -= 3) pts.push({ x: laneX(lz), z: lz + oz });
    roads.path(pts, LANE_HALF * 2);
    // packed earth round the house, and a path of trodden earth to the veranda and the pump
    roads.rect(HOUSE.x + 4, HOUSE.z + oz, 15, 30, 0, 0);
    roads.path([{ x: laneX(HOUSE.z), z: HOUSE.z + oz }, { x: -8, z: HOUSE.z + oz }], 1.6);
    roads.path([{ x: laneX(PUMP.z) - 1, z: PUMP.z + 2 + oz }, { x: PUMP.x, z: PUMP.z + oz }, { x: -10, z: HOUSE.z - 7 + oz }], 1.3);
    for (const p of PATCHES) roads.rect((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2 + oz, p.x1 - p.x0 + 1, p.z1 - p.z0 + 1);
    roads.circle(BED.x, BED.z + oz, 3.4);
    roads.build(0.8);
  }

  // ---------- terrain: a fine grid near the garden, a coarse one for the hills beyond ----------
  const terrain = new THREE.Group();
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(groundMat, paintedDetailTexture(23), { strength: 0.6, roads, roadColor: night ? 0x8a7656 : 0xa88e66 });
  const meadowA = new THREE.Color(0x5a7c36), meadowB = new THREE.Color(0x7a9244), wood = new THREE.Color(0x34522c), bund = new THREE.Color(0x7a8a48), hillC = new THREE.Color(0x4a6a46);
  const colour = (x: number, z: number, y: number, slope: number, out: THREE.Color) => {
    const lx = x, lz = z - oz;
    const n = fbm(lx * 0.045, lz * 0.045, 3);
    out.copy(meadowA).lerp(meadowB, n);
    out.lerp(wood, smoothstep(-38, -60, lx) * 0.85);
    for (const b of blocks) if (inRect(b, lx, lz, 1)) { out.lerp(bund, 0.55); break; }
    out.lerp(hillC, smoothstep(240, 420, Math.hypot(lx - 10, lz + 40)) * 0.7);
    out.multiplyScalar(1 - Math.min(0.25, slope * 0.8));
    void y;
  };
  terrain.add(buildTerrain({ xMin: NEAR.x0, xMax: NEAR.x1, zMin: nz0, zMax: nz1, res: NEAR.res, chunk: 230, height, color: colour, material: groundMat }));
  {
    // beyond the near grid: the same land, coarser, sunk out of sight where the near grid covers it
    const sink = (x: number, z: number) => {
      const d = Math.max(NEAR.x0 - x, x - NEAR.x1, nz0 - z, z - nz1);
      return smoothstep(-8, -40, d) * 14;
    };
    const fz0 = Math.max(-1300 + oz, o.zLimit ?? -Infinity);
    terrain.add(buildTerrain({ xMin: -1300, xMax: 1300, zMin: fz0, zMax: 1100 + oz, res: 26, chunk: 2600, height: (x, z) => worldH(x, z) - sink(x, z), color: colour, material: groundMat }));
  }
  terrain.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.receiveShadow = true; });
  group.add(terrain);

  // ---------- the old house ----------
  const props = new THREE.Group();
  group.add(props);
  const house = buildFarmhouse();
  house.position.set(HOUSE.x, 0, HOUSE.z + oz);
  house.rotation.y = HOUSE.yaw;
  let glow: THREE.MeshBasicMaterial | null = null;
  const windows: THREE.Vector3[] = [];
  {
    // lit paper screens behind the glass doors on the veranda, and the study window in the annex
    if (night) {
      glow = new THREE.MeshBasicMaterial({ map: shojiGlow(), color: new THREE.Color(1.35, 1.2, 1.0) });
      for (const x of [-4.62, -2.77, 0.93, 2.78, 4.63]) {
        const s = mesh(new THREE.PlaneGeometry(1.7, 2.45), glow, x, 2.0, 4.535);
        house.add(s);
      }
      const win = new THREE.MeshBasicMaterial({ map: windowGlow(), color: new THREE.Color(1.4, 1.25, 1.0) });
      house.add(mesh(new THREE.PlaneGeometry(1.25, 1.35), win, 8.8, 3.6, 2.06));
      const side = mesh(new THREE.PlaneGeometry(1.25, 1.35), win, 11.36, 3.6, -0.6);
      side.rotation.y = Math.PI / 2;
      house.add(side);
    }
    house.updateMatrixWorld(true);
    // soot sprites leave by the veranda's upper screens, the gable vents and the annex window
    for (const p of [[-3.7, 2.6, 4.3], [1.9, 2.6, 4.3], [-4.9, 6.2, 0.55], [4.9, 6.2, 0.55], [8.8, 3.6, 1.8], [4.5, 2.6, 4.3]] as const) {
      windows.push(new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(house.matrixWorld));
    }
  }
  props.add(house);
  const proxies = new THREE.Group();
  proxies.add(boxProxy(house));

  // ---------- the yard: the pump, the washing line, stepping stones, a woodpile ----------
  const iron = charToon({ color: 0x2a3036, rim: 0.3 });
  const stone = new THREE.MeshLambertMaterial({ map: granite(0x8a8680, 512) });
  const bamboo = new THREE.MeshLambertMaterial({ color: 0xb8a670 });
  const timber = new THREE.MeshLambertMaterial({ map: woodGrain(0x7a5a3a, 513) });
  {
    const px = PUMP.x, pz = PUMP.z + oz;
    props.add(box(1.9, 0.3, 1.9, stone, px, 0.12, pz));
    props.add(cyl(0.15, 0.2, 1.3, iron, px, 0.95, pz, 10), sphere(0.2, iron, px, 1.62, pz, 10, 8));
    const spout = cyl(0.05, 0.07, 0.55, iron, px + 0.28, 1.28, pz, 8); spout.rotation.z = Math.PI / 2 + 0.25; props.add(spout);
    const handle = box(0.07, 0.07, 1.1, iron, px - 0.35, 1.75, pz); handle.rotation.z = -0.5; handle.rotation.y = Math.PI / 2; props.add(handle);
    // a wooden tub under the spout
    props.add(cyl(0.42, 0.36, 0.45, timber, px + 0.75, 0.38, pz, 14));
    // stepping stones from the lane to the veranda
    for (let i = 0; i < 5; i++) {
      const s = sphere(0.6, stone, lerp(laneX(HOUSE.z) - 2.2, -8.4, i / 4), 0.05, HOUSE.z + oz + Math.sin(i * 1.7) * 0.6, 10, 6);
      s.scale.set(1, 0.18, 0.8); props.add(s);
    }
    // the washing line on two bamboo poles
    const lz0 = LINE.z0 + oz, lz1 = LINE.z1 + oz, len = lz1 - lz0;
    for (const z of [lz0, lz1]) props.add(cyl(0.06, 0.07, 2.9, bamboo, LINE.x, 1.45, z, 8));
    const line = cyl(0.015, 0.015, len, iron, LINE.x, 2.82, (lz0 + lz1) / 2, 5); line.rotation.x = Math.PI / 2; props.add(line);
    const pivot = new THREE.Group(); pivot.position.set(LINE.x, 2.8, (lz0 + lz1) / 2);
    const sheet = mesh(new THREE.PlaneGeometry(len * 0.94, len * 0.94 / 4), new THREE.MeshLambertMaterial({ map: laundryTexture(), alphaTest: 0.5, side: THREE.DoubleSide, emissive: night ? 0x1a1e28 : 0x000000 }), 0, -len * 0.94 / 8, 0);
    sheet.rotation.y = Math.PI / 2;
    sheet.castShadow = true;
    pivot.add(sheet);
    pivot.userData.sway = 1;
    live.add(pivot);
    // firewood stacked under the annex eaves
    const logs: THREE.BufferGeometry[] = [];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) {
      const g = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 7).rotateX(Math.PI / 2);
      g.translate(k * 0.34 + (r % 2) * 0.17, 0.18 + r * 0.3, 0);
      logs.push(g);
    }
    const pile = mesh(mergeGeometries(logs)!, timber, HOUSE.x + 5.5, 0, HOUSE.z - 11.6 + oz);
    pile.rotation.y = HOUSE.yaw;
    props.add(pile);
  }

  // ---------- vegetable patches: corn, beans on bamboo frames, low leafy rows ----------
  {
    const soil = new THREE.MeshLambertMaterial({ map: soilTexture() });
    const cornM = new THREE.MeshLambertMaterial({ map: cornTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    const vineM = new THREE.MeshLambertMaterial({ map: vineTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    const leafy = charToon({ color: 0x4f8a38, rim: 0.2 });
    const cross = (w: number, h: number) => { const a = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0); const b = a.clone().rotateY(Math.PI / 2); return mergeGeometries([a, b])!; };
    const cornGeo = cross(1.5, 3.0);
    const cornPl: Placement[] = [], vines: THREE.Mesh[] = [], heads: Placement[] = [];
    PATCHES.forEach((p, pi) => {
      const w = p.x1 - p.x0, d = p.z1 - p.z0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2 + oz;
      props.add(mesh(boxUV(new THREE.BoxGeometry(w, 0.16, d), 3), soil, cx, 0.02, cz));
      for (let row = 0; row < Math.floor(w / 2.4); row++) {
        const x = p.x0 + 1.2 + row * 2.4;
        const kind = (row + pi) % 3;
        if (kind === 0) for (let z = p.z0 + 0.8; z < p.z1 - 0.6; z += 1.1) cornPl.push({ x: x + rng.range(-0.15, 0.15), y: 0.05, z: z + oz, scale: rng.range(0.8, 1.15), rot: rng.range(0, TAU) });
        else if (kind === 1) {
          const v = mesh(new THREE.PlaneGeometry(d - 1.2, 2.0).translate(0, 1.0, 0), vineM, x, 0.05, cz);
          v.rotation.y = Math.PI / 2; vines.push(v);
        } else for (let z = p.z0 + 0.8; z < p.z1 - 0.6; z += 0.9) heads.push({ x: x + rng.range(-0.1, 0.1), y: 0.2, z: z + oz, scale: rng.range(0.7, 1.1), rot: rng.range(0, TAU) });
      }
      // a low bamboo fence round the patch
      const posts: THREE.BufferGeometry[] = [];
      const ring = [[p.x0 - 0.4, p.z0 - 0.4], [p.x1 + 0.4, p.z0 - 0.4], [p.x1 + 0.4, p.z1 + 0.4], [p.x0 - 0.4, p.z1 + 0.4]];
      for (let k = 0; k < 4; k++) {
        const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % 4];
        const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 2);
        for (let i = 0; i < n; i++) posts.push(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5).translate(ax + ((bx - ax) * i) / n, 0.55, az + ((bz - az) * i) / n + oz));
        for (const y of [0.45, 0.9]) {
          const rail = new THREE.CylinderGeometry(0.035, 0.035, len, 5).rotateZ(Math.PI / 2).rotateY(-Math.atan2(bz - az, bx - ax));
          posts.push(rail.translate((ax + bx) / 2, y, (az + bz) / 2 + oz));
        }
      }
      props.add(mesh(mergeGeometries(posts.map((g) => g.toNonIndexed()))!, bamboo));
    });
    const corn = new THREE.InstancedMesh(cornGeo, cornM, cornPl.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    cornPl.forEach((pl, i) => { m4.compose(new THREE.Vector3(pl.x, pl.y, pl.z), q.setFromAxisAngle(up, pl.rot), s.setScalar(pl.scale)); corn.setMatrixAt(i, m4); });
    corn.castShadow = true;
    props.add(corn);
    for (const v of vines) props.add(v);
    const cab = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 7).scale(1, 0.7, 1), leafy, heads.length);
    heads.forEach((pl, i) => { m4.compose(new THREE.Vector3(pl.x, pl.y, pl.z), q.setFromAxisAngle(up, pl.rot), s.setScalar(pl.scale)); cab.setMatrixAt(i, m4); });
    props.add(cab);
  }

  // ---------- the seed bed: a low mound of dark soil edged with stones ----------
  {
    const soil = new THREE.MeshLambertMaterial({ map: soilTexture(), color: 0xd0c8c0 });
    const mound = mesh(new THREE.SphereGeometry(1, 20, 8, 0, TAU, 0, Math.PI / 2), soil, BED.x, -0.02, BED.z + oz);
    mound.scale.set(BED.w / 2, 0.32, BED.d / 2);
    mound.receiveShadow = true;
    props.add(mound);
    const pebbles: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      const g = new THREE.SphereGeometry(rng.range(0.16, 0.24), 7, 5).scale(1, 0.6, 1);
      g.translate(BED.x + Math.cos(a) * (BED.w / 2 + 0.2), 0.06, BED.z + oz + Math.sin(a) * (BED.d / 2 + 0.2));
      pebbles.push(g);
    }
    props.add(mesh(mergeGeometries(pebbles)!, stone));
    // a bamboo marker with a paper tag, the girls' sign for their acorns
    props.add(cyl(0.035, 0.035, 1.1, bamboo, BED.x - BED.w / 2 - 0.6, 0.55, BED.z + oz + 0.8, 5));
    props.add(box(0.36, 0.5, 0.02, new THREE.MeshLambertMaterial({ color: 0xf4eedc }), BED.x - BED.w / 2 - 0.6, 0.85, BED.z + oz + 0.83));
  }

  // ---------- rice paddies: water in each cell, rows of young rice ----------
  {
    const water: THREE.BufferGeometry[] = [];
    const ricePl: Placement[] = [];
    for (const b of blocks) {
      for (let x = b.x0; x + b.cw <= b.x1 + 0.01; x += b.cw) for (let z = b.z0; z + b.cd <= b.z1 + 0.01; z += b.cd) {
        const w = b.cw - 1.6, d = b.cd - 1.6, cx = x + b.cw / 2, cz = z + b.cd / 2;
        if (o.clear?.some((c) => Math.hypot(cx - c.x, cz + oz - c.z) < c.r + 6)) continue;
        water.push(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(cx, 0.05, cz + oz));
        // young rice in rows, only in the cells near the lane where it can be seen
        if (Math.abs(cx - laneX(cz)) > 70) continue;
        for (let rx = -w / 2 + 0.5; rx < w / 2 - 0.3; rx += 0.95) for (let rz = -d / 2 + 0.5; rz < d / 2 - 0.3; rz += 0.95) {
          ricePl.push({ x: cx + rx + rng.range(-0.08, 0.08), y: 0.0, z: cz + rz + oz + rng.range(-0.08, 0.08), scale: rng.range(0.75, 1.1), rot: rng.range(0, TAU) });
        }
      }
    }
    const waterMat = night
      ? new THREE.MeshPhongMaterial({ color: 0x1e3446, specular: 0x9ab0d0, shininess: 90, emissive: 0x08121c })
      : new THREE.MeshPhongMaterial({ color: 0xa8c0cc, specular: 0xffe0b8, shininess: 70, emissive: 0x3a3440 });
    const w = mesh(mergeGeometries(water)!, waterMat);
    w.receiveShadow = true;
    props.add(w);
    const riceGeo = (() => { const a = new THREE.PlaneGeometry(0.55, 0.85).translate(0, 0.42, 0); return mergeGeometries([a, a.clone().rotateY(Math.PI / 2)])!; })();
    const rice = new THREE.InstancedMesh(riceGeo, new THREE.MeshLambertMaterial({ map: riceTexture(), alphaTest: 0.45, side: THREE.DoubleSide, color: night ? 0xc0d8b0 : 0xffffff }), Math.max(1, ricePl.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    ricePl.forEach((pl, i) => { m4.compose(new THREE.Vector3(pl.x, pl.y, pl.z), q.setFromAxisAngle(up, pl.rot), s.setScalar(pl.scale)); rice.setMatrixAt(i, m4); });
    rice.count = ricePl.length;
    rice.computeBoundingSphere();
    group.add(rice);
  }

  // ---------- the camphor wood on the hillside, and lone trees in the fields ----------
  {
    const pl: Placement[] = [];
    const ok = (lx: number, lz: number) => {
      if (inRect(YARD, lx, lz, 8)) return false;
      for (const p of PATCHES) if (inRect(p, lx, lz, 5)) return false;
      for (const b of blocks) if (inRect(b, lx, lz, 4)) return false;
      if (Math.abs(lx - laneX(lz)) < 12) return false;
      if (o.clear?.some((c) => Math.hypot(lx - c.x, lz + oz - c.z) < c.r)) return false;
      return !beyond(lz + oz);
    };
    for (let lx = -44; lx > NEAR.x0 + 6; lx -= 9) for (let lz = NEAR.z1 - 6; lz > nz0 - oz + 6; lz -= 9) {
      const x = lx + rng.range(-4, 4), z = lz + rng.range(-4, 4);
      const dense = fbm(x * 0.03 + 5, z * 0.03, 2);
      if (rng.next() > 0.35 + dense * 0.7 || !ok(x, z)) continue;
      pl.push({ x, y: height(x, z + oz) - 0.3, z: z + oz, scale: rng.range(2.0, 3.4), rot: rng.range(0, TAU) });
    }
    // a line of trees along the far side of the right-hand fields, and a few big lone ones
    for (let lz = NEAR.z1 - 10; lz > nz0 - oz + 10; lz -= 11) {
      const x = 150 + rng.range(-8, 14);
      if (ok(x, lz) && rng.chance(0.75)) pl.push({ x, y: height(x, lz + oz) - 0.3, z: lz + oz, scale: rng.range(1.8, 2.8), rot: rng.range(0, TAU) });
    }
    for (const [x, z] of [[124, 40], [70, 168], [-30, 168], [130, -40], [24, -230]] as const) if (ok(x, z)) pl.push({ x, y: height(x, z + oz) - 0.3, z: z + oz, scale: 3.4, rot: rng.range(0, TAU) });
    const forest = fluffyForest({ shape: 'broad', trunk: 0x4a3a2c, leaves: night ? [0x2f5a2c, 0x3a6a32, 0x2a4c28, 0x447034] : [0x4a8a38, 0x5a9a40, 0x3f7a34, 0x6aa448] }, pl, rng, { castShadow: true, variants: 2 });
    // a faint self-light so the wood still reads as leaves under the moon
    if (night) forest.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) (m.material as THREE.MeshToonMaterial).emissive.set(0x08140c); });
    group.add(forest);
  }
  // the far hills: one instanced canopy for hundreds of distant trees
  {
    const lay = treeLayout('broad', new Rng(61), 1);
    const geo = canopyGeometry(lay.blobs, new Rng(62), { density: 0.7 });
    const { material, depth } = foliageMaterial();
    if (night) material.emissive.set(0x061008);
    const pl: Placement[] = [];
    const frng = new Rng(63);
    for (let i = 0; i < 900 && pl.length < 320; i++) {
      const a = frng.range(0, TAU), r = frng.range(250, 640);
      const lx = 10 + Math.cos(a) * r, lz = -40 + Math.sin(a) * r;
      if (fbm(lx * 0.01, lz * 0.01, 2) < 0.45) continue;
      if (o.clear?.some((c) => Math.hypot(lx - c.x, lz + oz - c.z) < c.r) || beyond(lz + oz - 12)) continue;
      pl.push({ x: lx, y: worldH(lx, lz + oz) - 1, z: lz + oz, scale: frng.range(3.2, 5.5), rot: frng.range(0, TAU) });
    }
    const im = new THREE.InstancedMesh(geo, material, pl.length);
    im.customDepthMaterial = depth;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    const cols = night ? [0x284a2a, 0x2f5530, 0x22402a] : [0x4a7a3c, 0x5a8a44, 0x40703a];
    pl.forEach((p, i) => {
      m4.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rot), s.setScalar(p.scale));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.set(cols[i % cols.length]));
    });
    im.computeBoundingSphere();
    group.add(im);
  }

  // ---------- meadow flowers ----------
  {
    const pl: Placement[] = [], kinds: number[] = [];
    const frng = new Rng(64);
    const n = o.lowDetail ? 1400 : 3000;
    const g = o.grass;
    for (let i = 0; i < n * 8 && pl.length < n; i++) {
      const lx = frng.range(g.x0, g.x1), lz = frng.range(g.z0, g.z1);
      const patch = fbm(lx * 0.05 + 13, lz * 0.05 - 5, 2);
      if (patch < 0.5 || frng.next() > (patch - 0.5) * 3) continue;
      if (Math.abs(lx - laneX(lz)) < 3 || inRect(YARD, lx, lz, 1) || blocks.some((b) => inRect(b, lx, lz, 0.5))) continue;
      if (Math.hypot(lx - DANCE_FLOOR.x, lz - DANCE_FLOOR.z) < DANCE_FLOOR.r) continue;
      if (o.clear?.some((c) => Math.hypot(lx - c.x, lz + oz - c.z) < c.r)) continue;
      const y = height(lx, lz + oz);
      pl.push({ x: lx, y: y + frng.range(0.45, 0.9), z: lz + oz, scale: frng.range(0.8, 1.3), rot: 0 });
      // daisies at night (they glow in the moonlight), buttercups and clover by day
      kinds.push(night ? (frng.chance(0.75) ? 0 : 2) : frng.int(0, 3));
    }
    group.add(flowerField(pl, kinds));
  }

  // ---------- long grass ----------
  const grassMask = new ExclusionMask(o.grass.x0, o.grass.x1, o.grass.z0 + oz, o.grass.z1 + oz, 1);
  {
    const pts: Array<{ x: number; z: number }> = [];
    for (let lz = o.grass.z1; lz >= o.grass.z0; lz -= 3) pts.push({ x: laneX(lz), z: lz + oz });
    grassMask.path(pts, LANE_HALF * 2 + 0.6);
    grassMask.rect(HOUSE.x + 3, HOUSE.z + oz, 22, 32);
    for (const p of PATCHES) grassMask.rect((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2 + oz, p.x1 - p.x0 + 2, p.z1 - p.z0 + 2);
    grassMask.circle(PUMP.x, PUMP.z + oz, 2);
    // mown round the bed, where they dance
    grassMask.circle(DANCE_FLOOR.x, DANCE_FLOOR.z + oz, DANCE_FLOOR.r - 1);
    grassMask.build(1.2);
  }
  const gcolA = new THREE.Color(0x3c6a1e).convertSRGBToLinear(), gcolB = new THREE.Color(0x6a8a2c).convertSRGBToLinear(), tmp = new THREE.Color();
  const grass = new GrassField({
    heights: grid, xMin: o.grass.x0, xMax: o.grass.x1, zMin: o.grass.z0 + oz, zMax: o.grass.z1 + oz, res: 1, tile: 24,
    radius: o.lowDetail ? 46 : 70, bladesPerM2: o.lowDetail ? 12 : 22,
    sample: (x, z, out) => {
      const lx = x, lz = z - oz;
      let d = grassMask.at(x, z);
      if (d <= 0) return;
      for (const b of blocks) if (inRect(b, lx, lz)) { d *= inPaddyWater(b, lx, lz) ? 0 : 0.8; break; }
      if (lx < -40) d *= 0.35;
      if (o.clear?.some((c) => Math.hypot(x - c.x, z - c.z) < c.r * 0.6)) d *= 0.3;
      out.density = d;
      if (d <= 0) return;
      tmp.copy(gcolA).lerp(gcolB, fbm(lx * 0.04 + 7, lz * 0.04, 2));
      out.r = tmp.r; out.g = tmp.g; out.b = tmp.b;
      const verge = smoothstep(2, 9, Math.abs(lx - laneX(lz)));
      const onBund = blocks.some((b) => inRect(b, lx, lz));
      out.height = onBund ? 0.6 : lerp(0.7, lerp(1.25, 1.85, smoothstep(0.35, 0.7, fbm(lx * 0.03 + 50, lz * 0.03, 2))), verge);
    },
  });
  group.add(grass.group);

  optimize(props);
  group.add(live);
  group.add(proxies);

  const camW = new THREE.Vector3();
  return {
    group, terrain, proxies, height, grid, grass, glow, windows,
    update(t, camera) {
      camera.getWorldPosition(camW);
      // grass is only drawn round the camera while it is near the ground
      const low = camW.y - height(camW.x, camW.z) < 30;
      grass.group.visible = low;
      if (low) grass.update(t, camera);
      for (const c of live.children) if (c.userData.sway) c.rotation.z = Math.sin(t * 1.3) * 0.07 + Math.sin(t * 3.1) * 0.025;
    },
  };
}
