import * as THREE from 'three';
import { HeightGrid } from '../../../engine/HeightGrid';
import { buildDetailedTrack, buildTerrain, type Placement } from '../../../engine/Builders';
import { addGroundDetail, paintedDetailTexture } from '../../../engine/Ground';
import { GrassField } from '../../../engine/Grass';
import { fluffyForest } from '../../../engine/Foliage';
import { SeaMaterial } from '../../../engine/Water';
import { Rng, clamp, fbm, lerp, smoothstep } from '../../../engine/math';
import { subCurve } from '../common';
import type { Road } from '../layout';
import { CAMP, COVE, HOUSE, LAND, LIGHTHOUSE, PY, STORM } from './plan';
import { MK, rockTexture } from './textures';

/*
 * The ground of New Penzance: a long island with the track down its spine. Summer's End stands on a narrow
 * point with the sea close on both sides beyond low cliffs; Camp Ivanhoe sits in a clearing in the pines; the
 * cove at Mile 3.25 bites into the left-hand shore with a sandy beach; past it a low meadow runs to St. Jack's
 * on its rise, and that meadow is what the storm floods. One sea surrounds it all; its level rises with the storm.
 */

const bump = (z: number, a: number, b: number, c: number, d: number) => smoothstep(a, b, z) * (1 - smoothstep(c, d, z));

export interface Land {
  group: THREE.Group;
  grid: HeightGrid;
  /** the ground, before any water */
  ground(x: number, z: number): number;
  sea: SeaMaterial;
  seaMesh: THREE.Mesh;
  grass: GrassField;
  /** the track's centre x at a z */
  trackX(z: number): number;
}

export function buildLand(road: Road, low: boolean): Land {
  const group = new THREE.Group();
  const rng = new Rng(65051);
  const txCache = new Map<number, number>();
  const trackX = (z: number) => {
    const k = Math.round(z);
    let v = txCache.get(k);
    if (v === undefined) { v = road.at(clamp(k, -1500, -1180)).x; txCache.set(k, v); }
    return v;
  };

  // the coast: how far the land reaches to the left (negative x) and right of the track at each z
  const coastL = (z: number) => {
    // the point (Summer's End), then the wide island, the cove's bite, the meadow
    const point = 1 - smoothstep(-1290, -1320, z);
    let l = lerp(-78, -30 - 6 * fbm(z * 0.05, 3.1, 2), point);
    const cove = bump(z, -1338, -1362, -1408, -1428);
    l = lerp(l, -15.5 - 2.4 * Math.sin((z + 1356) * 0.06), cove);
    return l;
  };
  const coastR = (z: number) => {
    const point = 1 - smoothstep(-1286, -1316, z);
    return lerp(84, 27 + 7 * fbm(z * 0.05, 8.4, 2), point);
  };
  const beachK = (z: number) => bump(z, -1340, -1360, -1410, -1426);

  /** gentle hills away from the track, rising into the woods */
  const hills = (x: number, z: number) => (fbm(x * 0.018 + 11, z * 0.018, 4) - 0.35) * 9;

  const ground = (x: number, z: number) => {
    const tx = trackX(z), d = x - tx, ad = Math.abs(d);
    const L = coastL(z), R = coastR(z);
    const inside = Math.min(x - L, R - x);
    const beach = beachK(z) * (d < 0 ? 1 : 0);
    // meadow: just below the bed near the track, rolling away from it
    const storm = smoothstep(-1412, -1430, z);
    let h = PY - 0.42 + hills(x, z) * smoothstep(9, 46, ad) * (1 - 0.75 * storm);
    // the storm meadow is low and flat (the flood covers it)
    h = lerp(h, PY - 0.55 + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 0.3, storm * (1 - smoothstep(30, 70, ad)));
    // the camp's clearing is levelled
    if (z < CAMP.z0 + 6 && z > CAMP.z1 - 6) h = lerp(h, PY - 0.38, 1 - smoothstep(26, 40, ad));
    // a low dune between the track and the beach, where Sam and Suzy dance
    if (beach > 0) {
      const dune = Math.exp(-((d + 8.2) ** 2) / 14) * 0.6;
      h = lerp(h, PY - 0.35 + dune, beach * (1 - smoothstep(12, 18, ad)));
    }
    // St. Jack's stands on a rise
    const cr = Math.hypot(x - STORM.church.x, z - STORM.church.z);
    h = lerp(h, PY + 0.35, 1 - smoothstep(13, 22, cr));
    // the coast: a sandy shelf in the cove, low cliffs and rocks elsewhere
    const seaFloor = COVE.sea - 0.6 - 3.2 * smoothstep(0, 26, -inside);
    if (inside < 14) {
      const cliff = smoothstep(-1.2, 3.2, inside);
      const shelf = smoothstep(-12, 13, inside);
      const k = lerp(cliff, shelf, beach);
      h = lerp(seaFloor, h, k);
    }
    // the gap through the house and the ground under its halves: flat
    if (z < HOUSE.front + 12 && z > HOUSE.back - 6) h = lerp(PY - 0.4, h, smoothstep(HOUSE.gap + HOUSE.depth + 2, HOUSE.gap + HOUSE.depth + 9, ad));
    // the lighthouse's rock
    const lr = Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z);
    h = Math.max(h, lerp(PY - 0.1, h, smoothstep(LIGHTHOUSE.r + 1.5, LIGHTHOUSE.r + 5, lr)));
    // flat under the track bed
    h = lerp(PY - 0.42, h, smoothstep(2.6, 5, ad));
    // behind the start, the hill the train has just come out of
    const hill = smoothstep(-1184, -1168, z);
    return lerp(h, PY + 11 + hills(x, z) * 0.6 + 4 * smoothstep(-1172, -1150, z), hill * (1 - smoothstep(40, 90, ad) * 0.5));
  };

  const RES = 2;
  const grid = new HeightGrid(LAND.xMin, LAND.xMax, LAND.zMin, LAND.zMax, RES, ground);

  // ---------- terrain ----------
  const tmp = new THREE.Color();
  const meadow = new THREE.Color(MK.grass), dry = new THREE.Color(MK.grassDry), sand = new THREE.Color(MK.sand), wetSand = new THREE.Color(0xb8a074);
  const rock = new THREE.Color(0x857c70), wood = new THREE.Color(0x6a7040), earth = new THREE.Color(0x9a8458), seabed = new THREE.Color(0x8a8a6a);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(mat, paintedDetailTexture(65, 512, low ? 1400 : 2600), { scaleA: 22, scaleB: 6, strength: 0.75 });
  const terrain = buildTerrain({
    xMin: LAND.xMin, xMax: LAND.xMax, zMin: LAND.zMin, zMax: LAND.zMax, res: RES, chunk: 120,
    height: (x, z) => grid.sample(x, z),
    color: (x, z, y, slope, out) => {
      const n = fbm(x * 0.04 + 3, z * 0.04, 3);
      out.copy(meadow).lerp(dry, smoothstep(0.35, 0.7, n));
      const ad = Math.abs(x - trackX(z));
      out.lerp(wood, smoothstep(20, 50, ad) * smoothstep(0.4, 0.6, fbm(x * 0.03, z * 0.03 + 7, 2)) * 0.6);
      if (z < CAMP.z0 + 4 && z > CAMP.z1 - 4 && x > CAMP.parade.x0 - 2 && x < CAMP.parade.x1 + 2) out.lerp(earth, 0.65);
      const beach = beachK(z) * (x < trackX(z) ? 1 : 0);
      if (beach > 0) out.lerp(sand, beach * (1 - smoothstep(12, 17, ad)));
      // the shore: wet sand, then sea floor
      const shore = 1 - smoothstep(COVE.sea - 0.2, COVE.sea + 0.9, y);
      out.lerp(lerp(0, 1, beach) > 0.5 ? wetSand : rock, shore * 0.85);
      if (y < COVE.sea - 0.6) out.lerp(seabed, 0.8);
      out.lerp(rock, smoothstep(0.35, 0.7, slope) * 0.9);
      tmp.copy(out);
    },
    material: mat,
  });
  group.add(terrain);

  // ---------- the sea: one surface round the island, raised by the storm ----------
  const sea = new SeaMaterial(grid, { deep: MK.seaDeep, shallow: MK.sea, sand: MK.sand, nightDeep: 0x2e3e3c, nightShallow: 0x5a6e66, waterY: COVE.sea });
  // it stops short of the scene behind (Mr. Fox's hill), which is drawn until the whip pan covers the join
  const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(LAND.xMax - LAND.xMin + 600, 1170 - LAND.zMin + 200, 1, 1).rotateX(-Math.PI / 2), sea.material);
  seaMesh.position.set(0, COVE.sea, (-1170 + LAND.zMin - 200) / 2);
  seaMesh.renderOrder = 1;
  group.add(seaMesh);

  // ---------- the tunnel's mouth in the hillside behind the start ----------
  {
    const face = new THREE.Shape();
    face.moveTo(-9, -1.5); face.lineTo(9, -1.5); face.lineTo(9, 13); face.lineTo(-9, 13); face.closePath();
    const hole = new THREE.Path(); hole.moveTo(-3.2, -1.5); hole.lineTo(-3.2, 3.6); hole.absarc(0, 3.6, 3.2, Math.PI, 0, true); hole.lineTo(3.2, -1.5); hole.lineTo(-3.2, -1.5);
    face.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(face, { depth: 2.2, bevelEnabled: false });
    const uv = geo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
    const stone = new THREE.MeshLambertMaterial({ map: rockTexture(65071) });
    const portal = new THREE.Mesh(geo, stone);
    portal.position.set(0, PY, -1180.5);
    group.add(portal);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.35, 6, 20, Math.PI), new THREE.MeshLambertMaterial({ color: 0x9a8e7c }));
    ring.position.set(0, PY + 3.6, -1178.2); group.add(ring);
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(7, 8), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
    dark.position.set(0, PY + 3, -1170); group.add(dark);
  }

  // ---------- the track ----------
  const track = buildDetailedTrack(subCurve(road, -1176, -1504, 160));
  group.add(track);

  // ---------- grass: late-summer meadows (none on sand, rock, under the house, the tents or the parade) ----------
  const blocked = (x: number, z: number) => {
    const ad = Math.abs(x - trackX(z));
    if (ad < 3) return true;
    if (z < HOUSE.front + 1 && z > HOUSE.back - 1 && ad < HOUSE.gap + HOUSE.depth + 1) return true;
    if (Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < LIGHTHOUSE.r + 1.5) return true;
    if (z < CAMP.parade.z0 + 2 && z > CAMP.parade.z1 - 2 && x > CAMP.parade.x0 - 1 && x < CAMP.parade.x1 + 1) return true;
    if (Math.hypot(x - STORM.church.x, z - STORM.church.z) < 13) return true;
    return false;
  };
  const gc = new THREE.Color();
  const grass = new GrassField({
    heights: grid, xMin: -90, xMax: 90, zMin: -1560, zMax: -1170, res: 1,
    bladesPerM2: low ? 9 : 16, radius: low ? 50 : 70, bladeHeight: [0.35, 0.8], tile: 16,
    rowRange: (z) => { const x = trackX(z); return [x - 80, x + 80]; },
    sample: (x, z, out) => {
      const y = grid.sample(x, z);
      if (y < COVE.sea + 0.5 || blocked(x, z)) return;
      const beach = beachK(z) * (x < trackX(z) ? 1 : 0);
      if (beach > 0.4 && Math.abs(x - trackX(z)) < 16) {
        // marram grass in tufts on the dune
        const tuft = smoothstep(0.55, 0.7, fbm(x * 0.4, z * 0.4, 2));
        if (tuft <= 0) return;
        out.density = tuft * 0.8; out.height = 1.2;
        gc.set(0xb8b070); out.r = gc.r; out.g = gc.g; out.b = gc.b;
        return;
      }
      let d = (1 - smoothstep(0.3, 0.55, grid.slope(x, z))) * (0.55 + 0.45 * smoothstep(0.3, 0.6, fbm(x * 0.06 - 3, z * 0.06 + 9, 2)));
      // the camp's clearing is mown short
      const mown = z < CAMP.z0 + 6 && z > CAMP.z1 - 6 && Math.abs(x - trackX(z)) < 27;
      d *= smoothstep(3, 5, Math.abs(x - trackX(z)));
      out.density = d;
      if (d <= 0) return;
      gc.set(MK.grass).lerp(tmp.set(MK.grassDry), smoothstep(0.3, 0.75, fbm(x * 0.05 + 3, z * 0.05, 3)));
      out.r = gc.r; out.g = gc.g; out.b = gc.b;
      out.height = lerp(0.8, 1.5, smoothstep(0.35, 0.7, fbm(x * 0.03 + 50, z * 0.03, 2)));
      if (mown) { out.height = 0.35; out.density = d * 0.7; }
    },
  });
  group.add(grass.group);

  // ---------- the pinewoods ----------
  const pines: Placement[] = [];
  const trng = new Rng(65061);
  const okTree = (x: number, z: number) => {
    const y = grid.sample(x, z);
    if (y < COVE.sea + 0.9 || grid.slope(x, z) > 0.55) return false;
    const ad = Math.abs(x - trackX(z));
    if (ad < 13) return false;
    if (z < HOUSE.front + 16 && z > HOUSE.back - 8 && ad < 26) return false;
    if (Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 14) return false;
    // the camp's clearing and the parade ground
    if (z < CAMP.z0 + 8 && z > CAMP.z1 - 10 && ad < 32) return false;
    if (Math.hypot(x - CAMP.treehouse.x, z - CAMP.treehouse.z) < 7) return false;
    if (Math.hypot(x - CAMP.tower.x, z - CAMP.tower.z) < 6) return false;
    // the beach, and the church's rise
    if (beachK(z) > 0.2 && x < trackX(z) + 2) return false;
    if (Math.hypot(x - STORM.church.x, z - STORM.church.z) < 26) return false;
    // the storm meadow is open near the track
    if (z < -1416 && ad < 40) return false;
    return true;
  };
  let tries = 0;
  const N = low ? 260 : 420;
  while (pines.length < N && tries < N * 20) {
    tries++;
    const z = trng.range(-1560, -1190), x = trackX(z) + trng.sign() * trng.range(13, 120);
    // denser in clumps
    if (fbm(x * 0.025, z * 0.025 + 40, 2) < 0.42) continue;
    if (!okTree(x, z)) continue;
    pines.push({ x, y: grid.sample(x, z) - 0.2, z, scale: trng.range(1.25, 2.0), rot: trng.range(0, Math.PI * 2) });
  }
  // a few right at the camp's edge, framing the clearing
  for (const [x, z, s] of [[-27, -1312, 1.9], [-29, -1346, 2.1], [36, -1316, 1.8], [-24, -1328, 1.6], [37, -1338, 2.0], [-11, -1352, 1.5], [12, -1356, 1.6]] as const) {
    pines.push({ x, y: grid.sample(x, z) - 0.2, z, scale: s, rot: trng.range(0, 6) });
  }
  const forest = fluffyForest({ shape: 'conifer', trunk: 0x5a4434, leaves: [MK.pine, MK.pineDark, 0x4a6a40, 0x3a5236], density: low ? 0.7 : 1 }, pines, trng, { castShadow: true, variants: 3 });
  group.add(forest);
  const birches: Placement[] = [];
  for (let i = 0; i < 70; i++) {
    const z = trng.range(-1200, -1420), x = trackX(z) + trng.sign() * trng.range(14, 70);
    if (!okTree(x, z)) continue;
    birches.push({ x, y: grid.sample(x, z) - 0.1, z, scale: trng.range(0.8, 1.15), rot: trng.range(0, 6) });
  }
  group.add(fluffyForest({ shape: 'round', trunk: 0xe8e2d6, leaves: [0xb8b04a, 0xc8a83a, 0x9aa44a, 0xd89a3a], density: 0.9 }, birches, trng, { castShadow: true, variants: 2 }));

  void rng;
  return { group, grid, ground, sea, seaMesh, grass, trackX };
}
