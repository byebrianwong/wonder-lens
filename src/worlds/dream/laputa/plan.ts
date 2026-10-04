import * as THREE from 'three';
import { HeightGrid } from '../../../engine/HeightGrid';
import { fbm, lerp, smoothstep } from '../../../engine/math';
import type { Road } from '../layout';
import type { Run } from './foxsquirrel';
import { CX, CZ, INNER, KEEP1, RIM, Y_IN, Y_OUT, angleOf, radiusOf } from './parts';

/*
 * Where everything on top of Laputa goes, worked out from the path: where the path lands on the rim and
 * leaves it, where it passes through the inner terrace's gateways, where the robot, the memorial stone,
 * the fallen robot, the pools, the stream and the foxsquirrels' walls are, and the height of the ground.
 */

export interface Pool { c: THREE.Vector3; yaw: number; hx: number; hz: number; round: boolean; y: number }

export interface Plan {
  /** path z where it crosses the rim on the way in and on the way out, and the inner terrace's wall */
  entryZ: number; exitZ: number; gate1Z: number; gate2Z: number;
  entryA: number; exitA: number; gate1A: number; gate2A: number;
  /** the root that arches over the path, and the one it runs over (a bump) */
  archZ: number; archA: number; humpZ: number; humpA: number;
  robot: { pos: THREE.Vector3; yaw: number };
  stele: { pos: THREE.Vector3; yaw: number };
  fallen: { pos: THREE.Vector3; yaw: number };
  pools: Pool[];
  /** the stream from its spring to the rim (water surface points) and the angle where it crosses the inner wall */
  stream: THREE.Vector3[]; streamA: number;
  /** low walls beside the path that foxsquirrels run along: [run, wall height, thickness] */
  walls: Array<{ run: Run; h: number }>;
  /** lateral distance from the path (positive = right of travel) */
  lat(x: number, z: number): number;
  /** distance from the path */
  dist(x: number, z: number): number;
  /** ground height on the terraces (the keep's tiers excluded) */
  height(x: number, z: number): number;
  grid: HeightGrid;
}

/** z between z0 and z1 where the path's distance from the island centre equals r (it must cross once). */
function crossZ(road: Road, r: number, z0: number, z1: number, lat = 0) {
  const f = (z: number) => { const p = road.side(z, lat); return radiusOf(p.x, p.z) - r; };
  let a = z0, b = z1;
  const fa = f(a);
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (Math.sign(f(m)) === Math.sign(fa)) a = m; else b = m; }
  return (a + b) / 2;
}

const distToSeg = (x: number, z: number, a: THREE.Vector3, b: THREE.Vector3) => {
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
  return { d: Math.hypot(x - a.x - dx * t, z - a.z - dz * t), t };
};

export function makePlan(road: Road): Plan {
  const lat = (x: number, z: number) => { const p = road.at(z); return (x - p.x) * p.rx + (z - p.z) * p.rz; };
  const dist = (x: number, z: number) => (z > -1236 || z < -1500 ? 1e3 : Math.abs(lat(x, z)));
  const entryZ = crossZ(road, RIM, -1270, -1330), exitZ = crossZ(road, RIM, -1425, -1480);
  const gate1Z = crossZ(road, INNER, -1300, -1350), gate2Z = crossZ(road, INNER, -1395, -1445);
  const A = (z: number, l = 0) => { const p = road.side(z, l); return angleOf(p.x, p.z); };
  const archZ = -1353, humpZ = -1399;
  const side = (z: number, l: number) => road.side(z, l);

  const robotZ = -1410.5;
  const robot = { pos: side(robotZ, 8.9), yaw: road.faceRoad(robotZ, 1) + 0.2 };
  const stele = { pos: side(-1405.5, 6.1), yaw: road.faceRoad(-1405.5, 1) };
  const fallen = { pos: side(-1339, -12.8), yaw: road.along(-1339) + Math.PI / 2 + 0.22 };
  const pools: Pool[] = [
    { c: side(-1376, -13.5), yaw: road.along(-1376), hx: 3.2, hz: 8.5, round: false, y: 0 },
    { c: side(-1309, 12.5), yaw: 0, hx: 4.4, hz: 4.4, round: true, y: 0 },
  ];
  // low walls beside the path, their tops a running track for the foxsquirrels
  const wall = (z0: number, z1: number, l: number, h: number, race: boolean) => ({ run: { a: side(z0, l), b: side(z1, l), race }, h });
  const walls = [wall(-1303, -1319, -7.6, 1.3, false), wall(-1386, -1395, -6.4, 1.1, false), wall(-1428, -1447, -6.8, 1.2, true), wall(-1427, -1446, 12.0, 1.0, true)];

  // ---- the ground: flat terraces with gentle mounds, the path's own height under it ----
  const raw = (x: number, z: number) => {
    const d = radiusOf(x, z);
    const inner = 1 - smoothstep(INNER - 0.6, INNER + 0.6, d);
    let y = lerp(Y_OUT, Y_IN, inner);
    // mounds, flattened against walls, the rim and the keep
    const calm = smoothstep(RIM - 1, RIM - 7, d) * smoothstep(1.2, 4, Math.abs(d - INNER)) * smoothstep(KEEP1 + 1, KEEP1 + 6, d);
    y += (fbm(x * 0.045 + 7, z * 0.045 - 3, 3) - 0.47) * 1.1 * calm;
    if (z < -1280 && z > -1470) {
      const p = road.at(z), l = Math.abs((x - p.x) * p.rx + (z - p.z) * p.rz);
      y = lerp(y, p.y - 0.03, 1 - smoothstep(4.2, 10, l));
    }
    return y;
  };
  // the stream: from a spring on the inner terrace, out past the second gateway's right pier, drawing in
  // towards the path, to pour off the rim just beside where the Catbus leaves it
  const stream: THREE.Vector3[] = [];
  const END_LAT = 5.2, Z0 = -1417;
  const streamEnd = crossZ(road, RIM - 0.4, -1430, -1480, END_LAT);
  const latAt = (z: number) => lerp(10.5, END_LAT, (Z0 - z) / (Z0 - streamEnd));
  for (let z = Z0; z > streamEnd + 0.5; z -= 1.0) {
    const p = side(z, latAt(z) + Math.sin(z * 0.35) * 0.25 * (z > streamEnd + 4 ? 1 : 0));
    p.y = raw(p.x, p.z) - 0.32;
    stream.push(p);
  }
  { const p = side(streamEnd, END_LAT); p.y = raw(p.x, p.z) - 0.32; stream.push(p); }
  // where it crosses the inner terrace's wall (the wall leaves a gap for it there)
  let streamA = 0;
  for (let i = 1; i < stream.length; i++) if (radiusOf(stream[i].x, stream[i].z) >= INNER) { streamA = angleOf(stream[i].x, stream[i].z); break; }
  for (const pl of pools) pl.y = raw(pl.c.x, pl.c.z) - 0.18;

  const height = (x: number, z: number) => {
    let y = raw(x, z);
    // pools: a basin under the water
    for (const pl of pools) {
      const dx = x - pl.c.x, dz = z - pl.c.z;
      const c = Math.cos(pl.yaw), s = Math.sin(pl.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const e = pl.round ? Math.hypot(lx, lz) / pl.hx : Math.max(Math.abs(lx) / pl.hx, Math.abs(lz) / pl.hz);
      if (e < 1.15) y = lerp(y, pl.y - 0.7, 1 - smoothstep(0.85, 1.05, e));
    }
    // the stream's channel
    if (z < -1410 && z > -1462) {
      let best = 9, by = 0;
      for (let i = 0; i < stream.length - 1; i++) {
        const r = distToSeg(x, z, stream[i], stream[i + 1]);
        if (r.d < best) { best = r.d; by = lerp(stream[i].y, stream[i + 1].y, r.t); }
      }
      if (best < 1.6) y = lerp(y, Math.min(y, by - 0.45), 1 - smoothstep(0.75, 1.5, best));
    }
    // a flat bed for the fallen robot to lie in
    const fd = Math.hypot(x - fallen.pos.x, z - fallen.pos.z);
    if (fd < 7) y = lerp(y, raw(fallen.pos.x, fallen.pos.z), 1 - smoothstep(4.5, 7, fd));
    return y;
  };
  const grid = new HeightGrid(CX - 88, CX + 88, CZ - 88, CZ + 88, 1, height);
  return {
    entryZ, exitZ, gate1Z, gate2Z, entryA: A(entryZ), exitA: A(exitZ), gate1A: A(gate1Z), gate2A: A(gate2Z),
    archZ, archA: A(archZ), humpZ, humpA: A(humpZ),
    robot, stele, fallen, pools, stream, streamA, walls, lat, dist,
    height: (x, z) => grid.sample(x, z), grid,
  };
}
