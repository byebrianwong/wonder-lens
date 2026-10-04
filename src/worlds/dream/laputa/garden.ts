import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Placement } from '../../../engine/Builders';
import { flowerField, fluffyForest } from '../../../engine/Foliage';
import { GrassField, type GrassSample } from '../../../engine/Grass';
import { ExclusionMask, addGroundDetail, paintedDetailTexture } from '../../../engine/Ground';
import { Rng, TAU, clamp, fbm, lerp, smoothstep } from '../../../engine/math';
import { boxProxy, ribbon } from '../common';
import type { Road } from '../layout';
import type { Run } from './foxsquirrel';
import { Bins, CX, CZ, INNER, KEEP1, RIM, angDiff, angleOf, block, deg, laputaMats, polar, radiusOf } from './parts';
import type { Plan } from './plan';
import { makeFallenRobot } from './robot';
import { gardenWater } from './water';

/*
 * The top of Laputa: lawns and wild flowers over both terraces, a path of worn flagstones, low ruined walls
 * beside it (the foxsquirrels' running track), the ruins of the old city, a long still pool and a round one,
 * the stream that runs to the edge, the memorial stone the robot tends, the fallen robot, bushes and small
 * trees. Static parts go into `bins`; the grass draws itself round the camera.
 */

export interface Garden {
  grass: GrassField;
  /** water materials whose uniforms the set updates (time, fog) */
  water: Array<ReturnType<typeof gardenWater>>;
  /** wall tops the foxsquirrels run along */
  runs: Run[];
  /** world points where birds sit on the fallen robot */
  fallenPerches: THREE.Vector3[];
  /** the fallen robot's group (static, inside a bin), for its photo subject's anchor */
  fallen: THREE.Object3D;
  proxies: THREE.Object3D[];
}

/** Root angles the castle sends over the rim (degrees, roughly): ruins keep off them. */
const ROOT_ANGLES = [-86, -52, -18, 16, 52, 88].map(deg);

export function buildGarden(road: Road, plan: Plan, bins: Bins, rng: Rng, lowDetail: boolean): Garden {
  const M = laputaMats();
  const H = plan.height;
  const proxies: THREE.Object3D[] = [];
  const mask = new ExclusionMask(CX - 88, CX + 88, CZ - 88, CZ + 88, 0.5);
  const onIsland = (x: number, z: number) => { const r = radiusOf(x, z); return r < RIM - 1 && r > KEEP1 + 1.5; };

  // =============== the ground: the height grid as a mesh, painted lawn, the path worn bare ===============
  {
    const g = plan.grid, n = g.nx;
    const lawn = new THREE.Color(0x5f8f36), lawn2 = new THREE.Color(0x7ea644), sun = new THREE.Color(0xa0ac4c), shade = new THREE.Color(0x3f6e2e), dirt = new THREE.Color(0xa4936c), wet = new THREE.Color(0x3a5644), moss = new THREE.Color(0x7a8a5a);
    const c = new THREE.Color();
    const color = (x: number, z: number) => {
      const r = radiusOf(x, z), f = fbm(x * 0.06, z * 0.06, 3), f2 = fbm(x * 0.017 + 9, z * 0.017, 2);
      c.copy(lawn).lerp(lawn2, f).lerp(sun, smoothstep(0.55, 0.75, f2) * 0.6);
      // shade under the tree's crown
      c.lerp(shade, (1 - smoothstep(30, 46, r)) * 0.55);
      if (z < -1286 && z > -1462) c.lerp(dirt, (1 - smoothstep(1.4, 2.8, plan.dist(x, z))) * 0.85);
      c.lerp(moss, smoothstep(RIM - 2.5, RIM - 0.5, r) * 0.7);
      return c;
    };
    const quads: Array<{ pos: number[]; col: number[]; idx: number[]; map: Map<number, number> }> = Array.from({ length: 4 }, () => ({ pos: [], col: [], idx: [], map: new Map() }));
    const keep = (i: number, j: number) => { const x = g.xMin + i * g.res, z = g.zMin + j * g.res, r = radiusOf(x, z); return r < RIM - 0.15 && r > KEEP1 - 1.5; };
    const vert = (q: typeof quads[number], i: number, j: number) => {
      const k = j * n + i;
      let v = q.map.get(k);
      if (v !== undefined) return v;
      const x = g.xMin + i * g.res, z = g.zMin + j * g.res, y = g.data[k];
      v = q.pos.length / 3;
      q.pos.push(x, y, z);
      const cc = color(x, z);
      // basins: darker where the ground dips below its surroundings (pools, the stream)
      const dip = clamp((plan.grid.sample(x + 1.5, z) + plan.grid.sample(x - 1.5, z) + plan.grid.sample(x, z + 1.5) + plan.grid.sample(x, z - 1.5)) / 4 - y, 0, 0.6) / 0.6;
      cc.lerp(wet, dip * 0.8);
      q.col.push(cc.r, cc.g, cc.b);
      q.map.set(k, v);
      return v;
    };
    for (let j = 0; j < g.nz - 1; j++) for (let i = 0; i < n - 1; i++) {
      const x = g.xMin + (i + 0.5) * g.res, z = g.zMin + (j + 0.5) * g.res;
      const q = quads[(x > CX ? 1 : 0) + (z > CZ ? 2 : 0)];
      // the same two triangles per cell as HeightGrid.sample, so the grass sits exactly on this mesh
      if (keep(i, j) && keep(i + 1, j) && keep(i, j + 1)) q.idx.push(vert(q, i, j), vert(q, i, j + 1), vert(q, i + 1, j));
      if (keep(i + 1, j + 1) && keep(i + 1, j) && keep(i, j + 1)) q.idx.push(vert(q, i + 1, j + 1), vert(q, i + 1, j), vert(q, i, j + 1));
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    addGroundDetail(mat, paintedDetailTexture(31), { scaleA: 22, scaleB: 6, strength: 0.75 });
    quads.forEach((q) => {
      if (!q.idx.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(q.pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(q.col, 3));
      geo.setIndex(q.idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.userData.keep = true;
      bins.root.add(m);
    });
  }

  // =============== the path: worn flagstones, kerbs on the inner terrace ===============
  {
    const geo = new THREE.CylinderGeometry(1, 1, 0.14, 7);
    const byBin = new Map<THREE.Group, THREE.Matrix4[]>();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let z = plan.entryZ - 1.2; z > plan.exitZ + 1.0; z -= rng.range(0.75, 1.05)) {
      if (Math.abs(z - plan.humpZ) < 1.6) continue;
      const inner = radiusOf(road.at(z).x, z) < INNER;
      const k = inner ? rng.int(2, 3) : rng.int(1, 2);
      for (let i = 0; i < k; i++) {
        const l = inner ? -1.2 + i * 1.2 + rng.range(-0.25, 0.25) : rng.range(-1.5, 1.5);
        if (!inner && rng.chance(0.25)) continue;
        const pt = road.side(z, l);
        p.set(pt.x, H(pt.x, pt.z) + 0.02, pt.z);
        q.setFromAxisAngle(up, rng.range(0, TAU));
        s.set(rng.range(0.45, 0.75), 1, rng.range(0.38, 0.6));
        const bin = bins.at(p.x, p.z);
        const list = byBin.get(bin) ?? [];
        list.push(m.compose(p, q, s).clone()); byBin.set(bin, list);
      }
      // kerbs either side of the path across the inner terrace
      if (inner && Math.abs(z - plan.gate1Z) > 3 && Math.abs(z - plan.gate2Z) > 3 && rng.chance(0.8)) {
        for (const l of [-2.35, 2.35]) {
          const pt = road.side(z, l);
          const b = block(1.0, 0.36, 0.42, M.stone, pt.x, H(pt.x, pt.z) + 0.06, pt.z, road.along(z) + Math.PI / 2 + rng.range(-0.08, 0.08), 4);
          bins.add(b);
        }
      }
    }
    for (const [bin, list] of byBin) {
      const im = new THREE.InstancedMesh(geo, M.flag, list.length);
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.receiveShadow = true;
      im.userData.keep = true;
      bin.add(im);
    }
    // keep grass off the stones
    const pts: Array<{ x: number; z: number }> = [];
    for (let z = plan.entryZ; z > plan.exitZ; z -= 2) { const pt = road.at(z); pts.push({ x: pt.x, z }); }
    mask.path(pts, 2.6);
  }

  // =============== low ruined walls beside the path: the foxsquirrels' track ===============
  const runs: Run[] = [];
  for (const w of plan.walls) {
    const { a, b } = w.run;
    a.y = H(a.x, a.z) + w.h; b.y = H(b.x, b.z) + w.h;
    const len = a.distanceTo(b), n = Math.max(2, Math.round(len / 1.5));
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
      const top = lerp(a.y, b.y, t), gy = H(x, z) - 0.3;
      const h = top - gy;
      bins.add(block(len / n + 0.04, h, 0.95, M.ruin, x, gy + h / 2, z, yaw + rng.range(-0.03, 0.03), 6));
      bins.add(block(len / n + 0.1, 0.16, 1.05, M.moss, x, top + 0.04, z, yaw, 3));
      if (rng.chance(0.3)) { const r = block(rng.range(0.5, 0.9), rng.range(0.3, 0.6), rng.range(0.5, 0.8), M.ruin, x + rng.range(-1.4, 1.4), H(x, z) + 0.15, z + rng.range(-1.4, 1.4), rng.range(0, 3)); bins.add(r); }
    }
    // end piers, a little taller
    for (const e of [a, b]) bins.add(block(1.2, e.y - H(e.x, e.z) + 0.7, 1.2, M.ruin, e.x, (H(e.x, e.z) + e.y + 0.4) / 2, e.z, yaw, 6));
    mask.path([{ x: a.x, z: a.z }, { x: b.x, z: b.z }], 1.6);
    // the squirrels run on top of the moss
    runs.push({ a: a.clone().setY(a.y + 0.12), b: b.clone().setY(b.y + 0.12), race: w.run.race });
  }

  // =============== the pools ===============
  const still = gardenWater(0);
  const water = [still];
  for (const pl of plan.pools) {
    const g = new THREE.Group();
    g.position.set(pl.c.x, pl.y, pl.c.z); g.rotation.y = pl.yaw;
    const surf = new THREE.Mesh(pl.round ? new THREE.CircleGeometry(pl.hx, 40).rotateX(-Math.PI / 2) : new THREE.PlaneGeometry(pl.hx * 2, pl.hz * 2).rotateX(-Math.PI / 2), still.material);
    surf.renderOrder = 1;
    g.add(surf);
    // a kerb of stone blocks round the edge
    if (pl.round) {
      const n = 18;
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; g.add(block((TAU * pl.hx) / n + 0.2, 0.55, 0.7, M.stone, Math.cos(a) * (pl.hx + 0.3), 0.12, Math.sin(a) * (pl.hx + 0.3), -a + Math.PI / 2, 4)); }
    } else {
      for (const sx of [-1, 1]) g.add(block(0.7, 0.55, pl.hz * 2 + 1.4, M.stone, sx * (pl.hx + 0.35), 0.12, 0, 0, 4));
      for (const sz of [-1, 1]) g.add(block(pl.hx * 2, 0.55, 0.7, M.stone, 0, 0.12, sz * (pl.hz + 0.35), 0, 4));
    }
    // lily pads and a few flowers on them
    const pad = new THREE.MeshLambertMaterial({ color: 0x4f8a3a, side: THREE.DoubleSide });
    const lotus = new THREE.MeshLambertMaterial({ color: 0xf6c0d4, emissive: 0x301018 });
    for (let i = 0; i < (pl.round ? 9 : 16); i++) {
      const x = rng.range(-pl.hx + 0.6, pl.hx - 0.6), z = pl.round ? rng.range(-pl.hx + 0.6, pl.hx - 0.6) : rng.range(-pl.hz + 0.6, pl.hz - 0.6);
      if (pl.round && Math.hypot(x, z) > pl.hx - 0.6) continue;
      const r = rng.range(0.3, 0.6);
      const lp = new THREE.Mesh(new THREE.CircleGeometry(r, 10, 0.3, TAU - 0.5).rotateX(-Math.PI / 2), pad);
      lp.position.set(x, 0.03, z); lp.rotation.y = rng.range(0, TAU);
      g.add(lp);
      if (rng.chance(0.3)) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lotus); f.scale.y = 0.7; f.position.set(x + 0.1, 0.12, z); g.add(f); }
    }
    bins.add(g);
    surf.castShadow = false;
    if (pl.round) mask.circle(pl.c.x, pl.c.z, pl.hx + 0.9);
    else mask.rect(pl.c.x, pl.c.z, pl.hx * 2 + 1.8, pl.hz * 2 + 1.8, pl.yaw);
  }

  // =============== the stream, from a spring basin to the rim ===============
  {
    const running = gardenWater(0.8);
    water.push(running);
    const curve = new THREE.CatmullRomCurve3(plan.stream, false, 'centripetal');
    const geo = ribbon(curve, -0.75, 0.75, plan.stream.length * 2, 0, 1);
    const m = new THREE.Mesh(geo, running.material);
    m.renderOrder = 1;
    m.userData.keep = true;
    const s0 = plan.stream[0];
    bins.addAt(m, s0.x, s0.z, false);
    // stones along both banks
    const len = curve.getLength();
    for (let d = 0.6; d < len - 0.5; d += rng.range(0.8, 1.3)) {
      const t = d / len, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      for (const s of [-1, 1]) {
        if (rng.chance(0.15)) continue;
        const x = p.x - tan.z * s * 1.0, z = p.z + tan.x * s * 1.0;
        bins.add(block(rng.range(0.4, 0.7), 0.4, rng.range(0.4, 0.6), M.ruin, x, Math.max(p.y + 0.1, H(x, z) - 0.05), z, rng.range(0, 3), 4));
      }
      mask.circle(p.x, p.z, 1.3);
    }
    // the spring: a round stone basin with a spout
    const b = new THREE.Group(); b.position.set(s0.x, H(s0.x, s0.z), s0.z);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; b.add(block(0.9, 0.7, 0.5, M.stone, Math.cos(a) * 1.4, 0.25, Math.sin(a) * 1.4, -a + Math.PI / 2, 4)); }
    b.add(block(0.8, 1.6, 0.8, M.stone, 0, 0.7, 0));
    bins.add(b);
    mask.circle(s0.x, s0.z, 2.2);
  }

  // =============== the memorial stone, with flowers all round it ===============
  const flowerPl: Placement[] = [], flowerKind: number[] = [];
  {
    const { pos, yaw } = plan.stele;
    const g = new THREE.Group();
    g.position.set(pos.x, H(pos.x, pos.z), pos.z); g.rotation.y = yaw;
    g.add(block(1.8, 0.35, 1.0, M.stone, 0, 0.1, 0, 0, 4));
    const tab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 0.32), M.stele); tab.position.y = 1.12; g.add(tab);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.32, 14, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), M.stele);
    cap.position.y = 1.97; cap.rotation.z = 0; g.add(cap);
    bins.add(g);
    mask.circle(pos.x, pos.z, 1.3);
    // a ring of flowers round the stone, thickest in front where the robot works
    const fr = new Rng(1450);
    for (let i = 0; i < 160; i++) {
      const a = fr.range(0, TAU), r = 0.9 + Math.sqrt(fr.next()) * 3.4;
      const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
      if (plan.dist(x, z) < 3.2) continue;
      flowerPl.push({ x, y: H(x, z) + 0.28, z, scale: fr.range(2.0, 3.0), rot: 0 });
      flowerKind.push(fr.pick([0, 2, 2, 1, 3]));
    }
  }

  // tall flowers in front of the robot gardener, where its hand works among them
  {
    const { pos, yaw } = plan.robot;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), tr = new Rng(1453);
    const stems: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const f = tr.range(1.2, 2.8), s = tr.range(-1.4, 1.4);
      const x = pos.x + fx * f + fz * s, z = pos.z + fz * f - fx * s, h = tr.range(0.6, 1.25), y = H(x, z);
      stems.push(new THREE.CylinderGeometry(0.025, 0.035, h, 5).translate(x, y + h / 2, z).toNonIndexed());
      flowerPl.push({ x, y: y + h + 0.05, z, scale: tr.range(2.6, 3.4), rot: 0 });
      flowerKind.push(tr.pick([0, 2, 2, 3]));
    }
    const m = new THREE.Mesh(mergeGeometries(stems, false)!, new THREE.MeshLambertMaterial({ color: 0x4f8a3a }));
    bins.addAt(m, pos.x, pos.z, false);
    mask.circle(pos.x + fx * 2, pos.z + fz * 2, 1.5);
  }

  // =============== the fallen robot, lying in the grass ===============
  const fr = makeFallenRobot(new Rng(1660));
  {
    const { pos, yaw } = plan.fallen;
    fr.group.position.set(pos.x, H(pos.x, pos.z), pos.z); fr.group.rotation.y = yaw;
    fr.group.updateMatrixWorld(true);
    bins.add(fr.group);
    // flowers growing on it and round it
    const rr = new Rng(1661);
    for (let i = 0; i < 70; i++) {
      const p = new THREE.Vector3(rr.range(-0.3, 2.8), 0, rr.range(-1.2, 1.2));
      const onTop = rr.chance(0.4);
      p.y = onTop ? 1.38 + rr.range(-0.1, 0.1) : 0;
      fr.group.localToWorld(p);
      if (!onTop) { p.x += rr.range(-2.5, 2.5); p.z += rr.range(-2.5, 2.5); p.y = H(p.x, p.z); }
      flowerPl.push({ x: p.x, y: p.y + 0.25, z: p.z, scale: rr.range(1.8, 2.6), rot: 0 });
      flowerKind.push(rr.pick([0, 1, 3]));
    }
    const mid = fr.group.localToWorld(new THREE.Vector3(1.4, 0, 0));
    mask.rect(mid.x, mid.z, 6.0, 4.0, yaw);
    const proxy = boxProxy(fr.group); proxies.push(proxy);
  }
  const fallenPerches = fr.perches.map((p) => fr.group.localToWorld(p.clone()));

  // =============== ruins of the old city ===============
  const ruinSpots: Array<{ x: number; z: number; r: number }> = [];
  const clear = (x: number, z: number, r: number) => {
    const rad = radiusOf(x, z), a = angleOf(x, z);
    if (rad < KEEP1 + 5 + r || rad > RIM - 4 - r || Math.abs(rad - INNER) < 3 + r) return false;
    if (plan.dist(x, z) < 11 + r) return false;
    for (const s of [plan.robot.pos, plan.stele.pos, plan.fallen.pos, ...plan.pools.map((p) => p.c), plan.stream[0]]) if (Math.hypot(s.x - x, s.z - z) < 9 + r) return false;
    for (const ra of [...ROOT_ANGLES, plan.archA, plan.humpA, plan.gate1A, plan.gate2A]) if (Math.abs(angDiff(a, ra)) * rad < 4 + r) return false;
    if (Math.abs(angDiff(a, plan.entryA)) < 0.12 || Math.abs(angDiff(a, plan.exitA)) < 0.12) return false;
    return !ruinSpots.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + r + 3);
  };
  const ruinCount = lowDetail ? 12 : 20;
  for (let tries = 0; ruinSpots.length < ruinCount && tries < 600; tries++) {
    const a = rng.range(-Math.PI, Math.PI), rad = rng.range(KEEP1 + 6, RIM - 6);
    const x = CX + Math.cos(a) * rad, z = CZ + Math.sin(a) * rad;
    const w = rng.range(5, 10), d = rng.range(4, 8), r = Math.hypot(w, d) / 2;
    if (!clear(x, z, r)) continue;
    ruinSpots.push({ x, z, r });
    const g = new THREE.Group();
    const y0 = H(x, z) - 0.3;
    g.position.set(x, y0, z); g.rotation.y = rng.range(0, TAU);
    const tall = rng.chance(0.45), Hh = tall ? rng.range(6, 10) : rng.range(2.5, 5);
    const mat = tall ? M.arches : M.ruin;
    const wallSeg = (len: number, h: number, px: number, pz: number, yaw: number) => g.add(block(len, h, 0.75, mat, px, h / 2, pz, yaw, tall ? 12 : 6));
    // four walls, each broken to its own height; one has a doorway
    const sides: Array<[number, number, number, number]> = [[w, 0, d / 2, 0], [w, 0, -d / 2, 0], [d, w / 2, 0, Math.PI / 2], [d, -w / 2, 0, Math.PI / 2]];
    sides.forEach(([len, px, pz, yaw], si) => {
      if (rng.chance(0.18)) return;
      const h = Hh * rng.range(0.45, 1);
      if (si === 0) {
        const door = 1.8;
        wallSeg((len - door) / 2, h, -(len + door) / 4, pz, yaw);
        wallSeg((len - door) / 2, h * rng.range(0.6, 1), (len + door) / 4, pz, yaw);
      } else {
        // a stepped, broken top: two pieces of different height
        const k = rng.range(0.35, 0.65);
        const ax = yaw ? 0 : 1, az = yaw ? 1 : 0;
        wallSeg(len * k, h, px + ax * (-len / 2 + (len * k) / 2), pz + az * (-len / 2 + (len * k) / 2), yaw);
        wallSeg(len * (1 - k), h * rng.range(0.4, 0.9), px + ax * (len / 2 - (len * (1 - k)) / 2), pz + az * (len / 2 - (len * (1 - k)) / 2), yaw);
      }
    });
    // rubble round it, a column or two
    for (let i = 0; i < 6; i++) {
      const b = block(rng.range(0.5, 1.2), rng.range(0.35, 0.8), rng.range(0.5, 1.1), M.ruin, rng.range(-w / 2 - 2, w / 2 + 2), 0.45, rng.range(-d / 2 - 2, d / 2 + 2), rng.range(0, 3), 6);
      b.rotation.z = rng.range(-0.3, 0.3); g.add(b);
    }
    if (rng.chance(0.5)) {
      for (let i = 0; i < rng.int(1, 3); i++) {
        const h = rng.range(2.5, 6), c = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, h, 10), M.stone);
        c.position.set(w / 2 + 1.6, h / 2, -d / 2 + i * 2.2); g.add(c);
        g.add(block(1.2, 0.4, 1.2, M.stone, w / 2 + 1.6, h + 0.2, -d / 2 + i * 2.2));
      }
    }
    bins.add(g);
    if (tall) proxies.push(boxProxy(g));
    mask.rect(x, z, w + 1, d + 1, g.rotation.y);
  }
  // two round ruined towers on the far side of the keep
  for (const [ad, rad] of [[24, 46], [-34, 66]] as const) {
    const p = polar(rad, deg(ad), 0);
    const g = new THREE.Group();
    const r = 3.2, h = rng.range(11, 15);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 16, 1, true), M.arches).translateY(h / 2));
    for (let k = 0; k < 9; k++) { const aa = (k / 9) * TAU; g.add(block(1.1, rng.range(0.4, 2.6), 0.8, M.ruin, Math.cos(aa) * r, h + 0.4, Math.sin(aa) * r, -aa)); }
    g.position.set(p.x, H(p.x, p.z) - 0.4, p.z);
    bins.add(g);
    proxies.push(boxProxy(g));
    mask.circle(p.x, p.z, r + 1);
  }

  // =============== grass ===============
  mask.build(0.8);
  const grass = new GrassField({
    heights: plan.grid, xMin: CX - 88, xMax: CX + 88, zMin: CZ - 88, zMax: CZ + 88, res: 1,
    tile: 16, radius: lowDetail ? 40 : 56, bladesPerM2: lowDetail ? 12 : 24, bladeHeight: [0.5, 1.05], bladeWidth: 0.11, wind: [0.3, -0.18],
    sample: (x: number, z: number, out: GrassSample) => {
      const r = radiusOf(x, z);
      if (r > RIM - 1.3 || r < KEEP1 + 1.2 || Math.abs(r - INNER) < 1.1) { out.density = 0; return; }
      const f = fbm(x * 0.05, z * 0.05, 3), f2 = fbm(x * 0.017 + 9, z * 0.017, 2);
      const d = plan.dist(x, z);
      out.density = mask.at(x, z) * (d < 3.2 ? 0.25 : 1) * (0.75 + 0.25 * f);
      out.height = (d < 4 ? 0.6 : 1.05) + smoothstep(0.55, 0.8, f) * 0.6 - (1 - smoothstep(30, 46, r)) * 0.25;
      out.r = lerp(0.13, 0.26, smoothstep(0.55, 0.78, f2)); out.g = lerp(0.3, 0.36, f); out.b = lerp(0.05, 0.08, f);
    },
  });
  bins.root.add(grass.group);

  // =============== wild flowers in drifts ===============
  {
    const fr2 = new Rng(1451);
    for (let c = 0; c < (lowDetail ? 40 : 75); c++) {
      const a = fr2.range(-Math.PI, Math.PI), rad = fr2.range(KEEP1 + 3, RIM - 3);
      const cx = CX + Math.cos(a) * rad, cz = CZ + Math.sin(a) * rad;
      const kind = fr2.int(0, 3), near = plan.dist(cx, cz) < 18;
      const n = near ? 70 : 40;
      for (let i = 0; i < n; i++) {
        const x = cx + fr2.range(-1, 1) * 4.5, z = cz + fr2.range(-1, 1) * 4.5;
        if (!onIsland(x, z) || plan.dist(x, z) < 2.6 || mask.at(x, z) < 0.5) continue;
        flowerPl.push({ x, y: H(x, z) + 0.3, z, scale: fr2.range(1.6, 2.4), rot: 0 });
        flowerKind.push(fr2.chance(0.8) ? kind : fr2.int(0, 3));
      }
    }
    // the verges of the path, scattered all along
    for (let z = plan.entryZ - 2; z > plan.exitZ + 2; z -= 0.6) {
      for (const s of [-1, 1]) {
        const p = road.side(z, s * fr2.range(2.8, 5.5));
        if (mask.at(p.x, p.z) < 0.5 || !onIsland(p.x, p.z)) continue;
        flowerPl.push({ x: p.x, y: H(p.x, p.z) + 0.3, z: p.z, scale: fr2.range(1.5, 2.2), rot: 0 });
        flowerKind.push(fr2.int(0, 3));
      }
    }
    // file the flowers by bin, one draw per bin
    const byBin = new Map<THREE.Group, number[]>();
    flowerPl.forEach((p, i) => { const b = bins.at(p.x, p.z); const l = byBin.get(b) ?? []; l.push(i); byBin.set(b, l); });
    for (const [bin, list] of byBin) {
      const m = flowerField(list.map((i) => flowerPl[i]), list.map((i) => flowerKind[i]));
      m.userData.keep = true;
      bin.add(m);
    }
  }

  // =============== bushes and small trees ===============
  {
    const tr = new Rng(1452);
    const bushes: Placement[] = [], trees: Placement[] = [];
    const free = (x: number, z: number, r: number) => onIsland(x, z) && plan.dist(x, z) > 4 + r && mask.at(x, z) > 0.8 && Math.abs(radiusOf(x, z) - INNER) > 1.5 + r;
    for (const s of ruinSpots) for (let i = 0; i < 5; i++) {
      const a = tr.range(0, TAU), d = s.r + tr.range(0.5, 2.5), x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
      if (free(x, z, 1.4)) bushes.push({ x, y: H(x, z) - 0.1, z, scale: tr.range(1.0, 1.7), rot: tr.range(0, TAU) });
    }
    for (let i = 0; i < (lowDetail ? 90 : 170); i++) {
      // most along the inside of the parapet and the inner wall, some round the keep's foot
      const kind = tr.next();
      const rad = kind < 0.45 ? RIM - tr.range(2.5, 5) : kind < 0.75 ? INNER + tr.sign() * tr.range(2.2, 4.5) : KEEP1 + tr.range(2.5, 6);
      const a = tr.range(-Math.PI, Math.PI), x = CX + Math.cos(a) * rad, z = CZ + Math.sin(a) * rad;
      if (free(x, z, 1.4)) bushes.push({ x, y: H(x, z) - 0.1, z, scale: tr.range(1.0, 1.8), rot: tr.range(0, TAU) });
    }
    for (let i = 0, tries = 0; i < (lowDetail ? 12 : 22) && tries < 400; tries++) {
      const a = tr.range(-Math.PI, Math.PI), rad = tr.range(48, RIM - 7), x = CX + Math.cos(a) * rad, z = CZ + Math.sin(a) * rad;
      if (!free(x, z, 5) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 9)) continue;
      trees.push({ x, y: H(x, z) - 0.2, z, scale: tr.range(1.3, 2.0), rot: tr.range(0, TAU) });
      i++;
    }
    const bushGroup = fluffyForest({ shape: 'bush', trunk: 0x4a3a2a, leaves: [0x4f7f34, 0x5f8f3a, 0x6a9a40, 0x46742e], density: 1.1 }, bushes, tr, { castShadow: true, variants: 3 });
    const treeGroup = fluffyForest({ shape: 'round', trunk: 0x5a4632, leaves: [0x4a7f36, 0x5a8c3c, 0x6b9a44] }, trees, tr, { castShadow: true, variants: 3 });
    bins.root.add(bushGroup, treeGroup);
  }

  return { grass, water, runs, fallenPerches, fallen: fr.group, proxies };
}
