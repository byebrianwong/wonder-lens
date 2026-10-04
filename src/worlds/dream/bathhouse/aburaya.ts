import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl } from '../../../engine/Builders';
import { boxUV, repeatUV } from '../../../engine/Paint';
import { Rng } from '../../../engine/math';
import { buildBathhouse } from '../../ghibli/bathhouse';
import { stoneWall } from '../../ghibli/characterTextures';
import { deckPlanks, granite } from '../../ghibli/propTextures';
import { ribbon, subCurve, wallStrip } from '../common';
import type { Road } from '../layout';
import { BATH, BOILER, BRIDGE, DECK, ENTRANCE, PODIUM, QUAY, RAVINE, SPIRIT_STAIR, STAIRS } from './plan';
import { giboshi, karahafu, type BridgeMats } from './bridge';
import { CELL, norenTexture, signTexture, townAtlas } from './textures';
import { accMeshes, COLORS, newAccs, type Accs } from './town';
import { duskLit, LANTERN, waveLit, type LanternField } from './wave';

/*
 * The Aburaya, the bathhouse of the spirits: the Ghibli world's bathhouse model scaled up and set on a
 * stone and timber podium above the ravine, with close-up detail where the ride passes it: the forecourt,
 * the grand entrance with its cusped porch roof and noren curtain, the big sign, the front corner, and the
 * steep outside stairs down the podium's right wall to the boardwalk at the boiler room's level. Also the
 * stone quay at the foot of the far wall, where the ferry ties up, and the spirits' stair up to the forecourt.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Height of the spirits' stair (its nosing line) at an x. */
export const spiritStairY = (x: number) => SPIRIT_STAIR.y0 + ((x - SPIRIT_STAIR.x0) / (SPIRIT_STAIR.x1 - SPIRIT_STAIR.x0)) * (SPIRIT_STAIR.y1 - SPIRIT_STAIR.y0);

/** A row of wall bays on one face of the podium, from y0 up to y1, picking each bay's cell. */
function face(A: Accs, a: THREE.Vector3, b: THREE.Vector3, y0: number, y1: number, rowH: number, cell: (row: number, bay: number) => number) {
  const cells = townAtlas().cells, white = new THREE.Color(1, 1, 1);
  const len = a.distanceTo(b), bays = Math.max(1, Math.round(len / 4.4));
  const rows = Math.max(1, Math.round((y1 - y0) / rowH)), rh = (y1 - y0) / rows;
  const d = b.clone().sub(a).divideScalar(bays);
  for (let r = 0; r < rows; r++) for (let k = 0; k < bays; k++) {
    const p0 = a.clone().addScaledVector(d, k), p1 = a.clone().addScaledVector(d, k + 1);
    // rows count down from the top
    const ya = y1 - (r + 1) * rh, yb = y1 - r * rh;
    A.wall.quad(V(p0.x, ya, p0.z), V(p1.x, ya, p1.z), V(p1.x, yb, p1.z), V(p0.x, yb, p0.z), cells[cell(r, k)], white);
  }
}

export interface Aburaya {
  group: THREE.Group;
  occluders: THREE.Object3D[];
  /** the noren over the entrance (it sways a little) */
  noren: THREE.Group;
  /** the bathhouse model itself, for its photo subject */
  house: THREE.Group;
}

export function buildAburaya(road: Road, m: BridgeMats, lanterns: LanternField, waterLamps: THREE.Vector3[]): Aburaya {
  const rng = new Rng(8181);
  const g = new THREE.Group();
  const I = new THREE.Matrix4();

  // ---------- the bathhouse ----------
  const spots: THREE.Object3D[] = [];
  const bh = buildBathhouse((x, y, z, s = 1) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.userData.s = s; spots.push(o); return o; });
  const house = bh.group;
  house.position.set(BATH.x, BATH.y, BATH.z);
  house.scale.setScalar(BATH.s);
  const drop: THREE.Object3D[] = [];
  const patched = new Set<THREE.Material>();
  house.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshLambertMaterial;
    // the walls' lit paper screens join the lantern wave; everything else gets the warm dusk bounce, so the
    // red lacquer and the green tiles do not go black against the sunset
    if (mat.isMeshLambertMaterial && !patched.has(mat)) {
      patched.add(mat);
      if (mat.emissiveMap) waveLit(mat, 'bath-aburaya-wall-2', { dim: 0.42, bounce: true });
      // the green tiles (a textured, tinted material) are darker than the lacquer and need more
      else if (mat.map) duskLit(mat, 'bath-aburaya-tiles-1', 2.2);
      else duskLit(mat, 'bath-aburaya-dusk-1');
    }
    // its own chimney goes: the boiler room has a bigger one
    const geo = mesh.geometry as THREE.CylinderGeometry;
    if (geo.type === 'CylinderGeometry' && geo.parameters.height === 34) drop.push(mesh);
  });
  for (const o of drop) o.removeFromParent();
  g.add(house);
  house.updateMatrixWorld(true);
  // its lanterns, hung under every skirt roof, join the scene's instanced lanterns
  const wp = new THREE.Vector3();
  for (const o of spots) {
    o.getWorldPosition(wp);
    const lx = o.position.x, lz = o.position.z;
    const yaw = Math.abs(lz) / 15 > Math.abs(lx) / 22 ? (lz > 0 ? 0 : Math.PI) : (lx > 0 ? Math.PI / 2 : -Math.PI / 2);
    lanterns.add(wp, (o.userData.s as number) * BATH.s * 1.05, rng.chance(0.85) ? LANTERN.red : LANTERN.white, yaw);
    o.removeFromParent();
  }
  // the big sign on the front of the second tier
  {
    const map = signTexture('油屋', { vertical: false, w: 512, h: 180, bg: '#2a1408' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 4.0), waveLit(new THREE.MeshLambertMaterial({ map, emissive: 0xffe0a0, emissiveMap: map, emissiveIntensity: 0.9 }), 'bath-big-sign-1', { dim: 0.7 }));
    sign.position.set(0, BATH.y + 15 * BATH.s, BATH.z + 13 * BATH.s + 0.12);
    g.add(sign);
    g.add(box(12.2, 4.6, 0.25, m.dark, 0, sign.position.y, sign.position.z - 0.15));
    for (let i = 0; i < 6; i++) waterLamps.push(V(-24 + i * 9.6, DECK + 4 + (i % 3) * 9, BATH.front + 1));
  }

  // ---------- the grand entrance: steps, a shallow porch, the noren, the cusped roof ----------
  const noren = new THREE.Group();
  {
    const plinth = DECK + 1.5, front = BATH.front, out = ENTRANCE.z;
    for (let k = 0; k < 3; k++) g.add(box(11, 0.5, 0.75 * (3 - k), m.stone, 0, DECK + 0.25 + k * 0.5, -1906.75 + (0.75 * (3 - k)) / 2));
    // side walls and ceiling of the porch
    for (const s of [-1, 1]) g.add(box(0.5, 6, out - front, m.red, s * 4.2, plinth + 3, (front + out) / 2));
    g.add(box(8.9, 0.45, out - front + 0.2, m.dark, 0, plinth + 6.2, (front + out) / 2));
    // pillars at the front corners
    for (const s of [-1, 1]) {
      g.add(cyl(0.34, 0.38, 6.6, m.red, s * 4.5, plinth + 3.3, out + 0.15, 14));
      g.add(cyl(0.5, 0.5, 0.3, m.gold, s * 4.5, plinth + 0.15, out + 0.15, 14));
      g.add(giboshi(m, s * 4.5, plinth + 6.6, out + 0.15, 1.4));
    }
    // the cusped roof and its gilded barge board
    const span = 11.8, k = karahafu(span, 4.6, 1.9);
    const roof = new THREE.Mesh(k.geo, m.tiles);
    roof.position.set(0, plinth + 6.7, out + 1.2);
    roof.castShadow = true;
    g.add(roof);
    const edge: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) { const t = -1 + i / 12; edge.push(V((t * span) / 2, plinth + 6.7 + k.prof(t) - 0.14, out + 1.18)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 40, 0.14, 6), m.gold));
    // the noren: cloth hanging from a rod across the porch's mouth, pivoting at the top
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 2.7, 4, 1).translate(0, -1.35, 0), new THREE.MeshLambertMaterial({ map: norenTexture(), side: THREE.DoubleSide, emissive: 0x2a0806 }));
    noren.add(cloth);
    noren.position.set(0, plinth + 5.95, out + 0.05);
    g.add(noren);
    g.add(cyl(0.07, 0.07, 8.6, m.dark, 0, plinth + 5.98, out + 0.05).rotateZ(Math.PI / 2));
    // lanterns: two big ones at the porch's corners, two on posts by the steps
    for (const s of [-1, 1]) {
      lanterns.add(V(s * 5.7, plinth + 4.6, out + 0.3), 1.9, LANTERN.red);
      g.add(box(0.12, 1.0, 0.12, m.dark, s * 5.7, plinth + 6.0, out + 0.3));
      g.add(box(0.3, 4.2, 0.3, m.red, s * 7.2, DECK + 2.1, -1903.2));
      lanterns.add(V(s * 7.2, DECK + 4.85, -1903.2), 1.25, LANTERN.white);
      g.add(giboshi(m, s * 7.2, DECK + 5.5, -1903.2, 1.1));
    }
    // stone lanterns on the forecourt
    for (const s of [-1, 1]) {
      const x = s * 10.5, z = -1902.6;
      g.add(box(1.6, 0.5, 1.6, m.stone, x, DECK + 0.25, z), cyl(0.32, 0.4, 2.2, m.stone, x, DECK + 1.6, z, 8), box(1.4, 0.3, 1.4, m.stone, x, DECK + 2.85, z));
      g.add(box(1.3, 0.12, 1.3, m.stone, x, DECK + 3.0, z), box(1.3, 0.12, 1.3, m.stone, x, DECK + 4.0, z));
      for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) g.add(box(0.14, 1.0, 0.14, m.stone, x + dx, DECK + 3.5, z + dz));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.9, 4), m.stone);
      cap.rotation.y = Math.PI / 4; cap.position.set(x, DECK + 4.5, z);
      g.add(cap);
      lanterns.add(V(x, DECK + 3.5, z), 0.75, LANTERN.yellow);
    }
  }

  // ---------- the podium: its faces in the town's wall atlas ----------
  {
    const A = newAccs();
    A.wall.setMatrix(I); A.trim.setMatrix(I); A.roof.setMatrix(I); A.sign.setMatrix(I);
    const P = PODIUM, bot = P.bottom;
    // the front face under the forecourt, seen from the whole bridge: galleries at the top, then service
    // floors, then stone down to the water
    face(A, V(P.front.x0, 0, P.front.z0), V(P.front.x1, 0, P.front.z0), bot, DECK, 4.4, (r, k) => {
      if (r === 0) return CELL.redRail;
      if (r === 1) return k % 3 === 1 ? CELL.lattice : CELL.shoji;
      if (r === 2) return k % 2 ? CELL.woodWindow : CELL.boards;
      return rng.chance(0.14) ? CELL.ironWindow : CELL.stone;
    });
    // its right side above the open water, and the wall along the stairs (only the part above the ledge shows)
    face(A, V(P.front.x1, 0, P.front.z0), V(P.front.x1, 0, STAIRS.top + 3), bot, DECK, 4.4, (r, k) => (r === 0 ? CELL.redRail : r === 1 ? CELL.shoji : r < 3 ? (k % 2 ? CELL.woodWindow : CELL.boards) : rng.chance(0.15) ? CELL.ironWindow : CELL.stone));
    // the end of the forecourt block, under the top of the stairs
    const zb = STAIRS.top + 3;
    A.wall.quad(V(P.front.x1, -16.3, zb), V(P.back.x1, -16.3, zb), V(P.back.x1, DECK, zb), V(P.front.x1, DECK, zb), townAtlas().cells[CELL.boards], new THREE.Color(1, 1, 1));
    face(A, V(P.back.x1, 0, zb), V(P.back.x1, 0, P.back.z1), -16.3, DECK, 4.4, (r, k) => {
      if (r === 0) return k % 3 === 0 ? CELL.woodWindow : CELL.plaster;
      if (r === 4) return k % 3 === 1 ? CELL.ironWindow : CELL.brick;
      return (k + r) % 4 === 0 ? CELL.woodWindow : (k + r) % 4 === 2 ? CELL.shojiDim : CELL.boards;
    });
    // the back face, seen when you leave on Haku
    face(A, V(P.back.x1, 0, P.back.z1 - 0.01), V(BOILER.x0, 0, P.back.z1 - 0.01), BOILER.roof, DECK, 1.8, () => CELL.boards);
    face(A, V(BOILER.x0, 0, P.back.z1), V(P.back.x0, 0, P.back.z1), bot, DECK, 4.4, (r) => (r < 2 ? CELL.woodWindow : CELL.stone));
    // a lacquered beam along the forecourt's front edge, and lanterns under it
    A.trim.box(P.front.x0, P.front.x1, DECK - 0.7, DECK + 0.02, P.front.z0 - 0.3, P.front.z0 + 0.35, COLORS.red);
    for (let x = P.front.x0 + 2.2; x < P.front.x1; x += 4.42) {
      if (Math.abs(x) < BRIDGE.half + 1.5) continue;
      lanterns.add(V(x, DECK - 1.6, P.front.z0 + 0.7), 0.85, LANTERN.red);
    }
    for (let x = P.front.x0 + 4; x < P.front.x1; x += 13) waterLamps.push(V(x, DECK - 2, P.front.z0 + 1));
    // railings round the forecourt: along the front (gaps for the bridge and the spirits' stair) and the right edge
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.8));
      for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; A.trim.box(x - 0.08, x + 0.08, DECK, DECK + 1.1, z - 0.08, z + 0.08, COLORS.darkWood); }
      const lo = (a: number, b: number) => Math.min(a, b), hi = (a: number, b: number) => Math.max(a, b);
      A.trim.box(lo(x0, x1) - 0.08, hi(x0, x1) + 0.08, DECK + 0.98, DECK + 1.12, lo(z0, z1) - 0.08, hi(z0, z1) + 0.08, COLORS.red);
      A.trim.box(lo(x0, x1) - 0.06, hi(x0, x1) + 0.06, DECK + 0.5, DECK + 0.58, lo(z0, z1) - 0.06, hi(z0, z1) + 0.06, COLORS.red);
    };
    const zr = P.front.z0 - 0.3;
    rail(P.front.x0, zr, SPIRIT_STAIR.x1 - 1.6, zr);
    rail(SPIRIT_STAIR.x1 + 1.6, zr, -BRIDGE.half - 0.4, zr);
    rail(BRIDGE.half + 0.4, zr, P.front.x1 - 0.3, zr);
    rail(P.front.x1 - 0.3, zr, P.front.x1 - 0.3, STAIRS.top + 3.2);
    // along the top of the wall over the stairs
    rail(P.back.x1 - 0.3, STAIRS.top - 1, P.back.x1 - 0.3, P.back.z1 + 1);
    g.add(accMeshes(A, { receive: true }));
  }
  // the forecourt's paving (a gap where the bridge's deck lands) and the back terrace
  {
    const pave = new THREE.MeshLambertMaterial({ map: stoneWall(0x8a8274, { seed: 189 }) });
    const slab = (x0: number, x1: number, z0: number, z1: number) => repeatUV(new THREE.PlaneGeometry(x1 - x0, z0 - z1).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, DECK, (z0 + z1) / 2), (x1 - x0) / 5, (z0 - z1) / 5);
    const P = PODIUM;
    const parts = [
      slab(P.front.x0, -BRIDGE.half, P.front.z0, P.front.z1), slab(-BRIDGE.half, BRIDGE.half, BRIDGE.z1, P.front.z1), slab(BRIDGE.half, P.back.x1, P.front.z0, P.front.z1),
      slab(P.back.x1, P.front.x1, P.front.z0, STAIRS.top + 3), slab(P.back.x0, P.back.x1, P.back.z0, P.back.z1),
    ];
    const pm = new THREE.Mesh(mergeGeometries(parts)!, pave);
    pm.receiveShadow = true; pm.userData.keep = true;
    g.add(pm);
    // water tanks and a pipe on the back terrace
    for (const [x, z] of [[-24, -1962], [-14, -1975], [14, -1968]]) {
      g.add(cyl(3, 3.2, 5, new THREE.MeshLambertMaterial({ map: deckPlanks(0x6a4a30) }), x, DECK + 2.5, z, 18));
      for (const y of [0.8, 2.5, 4.2]) g.add(cyl(3.08, 3.08, 0.2, m.dark, x, DECK + y, z, 18));
    }
  }
  // corner details where the ride turns along the side of the bathhouse: barrels, buckets, towels drying
  {
    const wood = new THREE.MeshLambertMaterial({ map: deckPlanks(0x7a5434) });
    for (const [x, z, r] of [[26.5, -1905.6, 0.8], [25.0, -1905.2, 0.7], [23.7, -1905.8, 0.6]]) {
      g.add(cyl(r, r * 0.92, r * 2.2, wood, x, DECK + r * 1.1, z, 14));
      g.add(cyl(r * 1.02, r * 1.02, 0.1, m.dark, x, DECK + r * 0.5, z, 14), cyl(r * 1.02, r * 1.02, 0.1, m.dark, x, DECK + r * 1.7, z, 14));
    }
    for (let i = 0; i < 4; i++) g.add(cyl(0.32, 0.26, 0.5, wood, 21.4 + i * 0.4, DECK + 0.25 + (i % 2) * 0.5, -1906.0 - (i % 2) * 0.2, 10));
    // a drying rail of towels along the bathhouse's side wall
    g.add(box(0.1, 0.1, 9, m.dark, 29.3, DECK + 3.4, -1914));
    for (const z of [-1910.6, -1912.4, -1914.6, -1916.9]) g.add(box(0.06, 1.6, 0.9, new THREE.MeshLambertMaterial({ color: rng.pick([0xf0ece0, 0xe8d8c0, 0x9ab0c8]) }), 29.3, DECK + 2.6, z));
    lanterns.add(V(29.6, DECK + 4.2, -1907.6), 1.3, LANTERN.red, Math.PI / 4);
  }

  // ---------- the outside stairs down the podium's right wall ----------
  {
    const curve = subCurve(road, STAIRS.top + 3, STAIRS.bottom, 80);
    const at = (z: number) => road.at(z);
    const wood = new THREE.MeshLambertMaterial({ map: deckPlanks(0x7a5434) });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a1a12, side: THREE.DoubleSide });
    const red = new THREE.MeshLambertMaterial({ color: 0xa83224, side: THREE.DoubleSide });
    // treads: each one's front edge touches the path, so the Catbus's paws land on the nosings
    const run = 0.72, treads: THREE.BufferGeometry[] = [];
    for (let z = STAIRS.top + 3; z > STAIRS.bottom + 4; z -= run) {
      const y = at(z - run).y;
      const tg = boxUV(new THREE.BoxGeometry(STAIRS.x1 - STAIRS.x0 - 0.2, 0.16, run + 0.06), 1);
      tg.rotateX(rng.range(-0.015, 0.015)).rotateZ(rng.range(-0.012, 0.012));
      treads.push(tg.translate((STAIRS.x0 + STAIRS.x1) / 2, y - 0.08, z - run / 2));
    }
    const tm = new THREE.Mesh(mergeGeometries(treads)!, wood);
    tm.receiveShadow = true; tm.castShadow = true; tm.userData.keep = true;
    g.add(tm);
    // stringers under both edges, the outer railing, the handrail on the wall
    const lat = (x: number) => x - STAIRS.pathX;
    g.add(new THREE.Mesh(wallStrip(curve, lat(STAIRS.x1 - 0.12), -1.0, 0.04, 80, true, 2), dark), new THREE.Mesh(wallStrip(curve, lat(STAIRS.x0 + 0.12), -1.0, 0.04, 80, false, 2), dark));
    g.add(new THREE.Mesh(wallStrip(curve, lat(STAIRS.x1 - 0.1), 1.02, 1.18, 80, true, 2), red), new THREE.Mesh(wallStrip(curve, lat(STAIRS.x1 - 0.1), 0.5, 0.58, 80, true, 2), red));
    g.add(new THREE.Mesh(wallStrip(curve, lat(STAIRS.x0 + 0.25), 0.92, 1.02, 80, false, 2), dark));
    // a big iron pipe running down the wall beside the stairs
    g.add(new THREE.Mesh(new THREE.TubeGeometry(subCurve(road, STAIRS.top + 2, STAIRS.bottom - 4, 30), 60, 0.32, 8).translate(STAIRS.x0 + 0.45 - STAIRS.pathX, 5.8, 0), new THREE.MeshLambertMaterial({ color: 0x3a3430 })));
    // posts: railing posts on the outer edge, tall ones holding lanterns, legs down to the ledge
    for (let z = STAIRS.top - 1; z > STAIRS.bottom; z -= 2.4) {
      const y = at(z).y;
      g.add(box(0.14, 1.2, 0.14, m.dark, STAIRS.x1 - 0.1, y + 0.6, z));
    }
    for (let z = STAIRS.top - 4; z > STAIRS.bottom + 2; z -= 7.2) {
      const y = at(z).y;
      g.add(box(0.22, 3.3, 0.22, m.red, STAIRS.x1 - 0.1, y + 1.65, z));
      g.add(box(0.7, 0.12, 0.14, m.dark, STAIRS.x1 - 0.4, y + 3.25, z));
      lanterns.add(V(STAIRS.x1 - 0.62, y + 2.6, z), 0.85, LANTERN.red, Math.PI / 2);
      waterLamps.push(V(STAIRS.x1, y + 2.6, z));
      if (y > -15) for (const x of [STAIRS.x1 - 0.3, STAIRS.x0 + 0.3]) g.add(box(0.3, y - 1 + 16.3, 0.3, m.dark, x, (y - 1 - 16.3) / 2, z));
    }
  }
  // the boardwalk at the bottom, along to the boiler room door, on a stone ledge above the water
  {
    const planks = new THREE.MeshLambertMaterial({ map: deckPlanks(0x6a4a2e) });
    const bw = new THREE.Mesh(ribbon(subCurve(road, STAIRS.bottom + 4, BOILER.z0 - 0.5, 30), -3.95, 4.5, 30, -0.02, 2), planks);
    bw.receiveShadow = true;
    g.add(bw);
    const lz0 = STAIRS.top + 3, lz1 = BOILER.z0 - 2;
    const ledge = new THREE.Mesh(boxUV(new THREE.BoxGeometry(9.6, -16.3 - PODIUM.bottom, lz0 - lz1), 4), new THREE.MeshLambertMaterial({ map: granite(0x6a665e, 337) }));
    ledge.position.set(PODIUM.back.x1 + 4.8, (PODIUM.bottom - 16.3) / 2, (lz0 + lz1) / 2);
    g.add(ledge);
    const A = newAccs();
    A.trim.setMatrix(I);
    for (let z = STAIRS.bottom + 3; z > BOILER.z0 + 1; z -= 1.8) A.trim.box(39.35, 39.5, -16, -14.9, z - 0.07, z + 0.07, COLORS.darkWood);
    A.trim.box(39.3, 39.55, -14.98, -14.84, BOILER.z0 + 0.8, STAIRS.bottom + 3, COLORS.red);
    for (const z of [-1972, -1986]) { A.trim.box(39.3, 39.6, -16, -12.6, z - 0.15, z + 0.15, COLORS.red); lanterns.add(V(38.9, -13.3, z), 0.9, LANTERN.red, Math.PI / 2); }
    g.add(accMeshes(A));
  }

  // ---------- the quay at the foot of the far wall, and the spirits' stair up to the forecourt ----------
  {
    const stone = new THREE.MeshLambertMaterial({ map: granite(0x77736a, 341) });
    const q = new THREE.Mesh(boxUV(new THREE.BoxGeometry(QUAY.x1 - QUAY.x0, QUAY.top - PODIUM.bottom, QUAY.z0 - QUAY.z1), 3), stone);
    q.position.set((QUAY.x0 + QUAY.x1) / 2, (QUAY.top + PODIUM.bottom) / 2, (QUAY.z0 + QUAY.z1) / 2);
    q.receiveShadow = true;
    g.add(q);
    // bollards and lantern posts along the quay's edge
    for (let x = QUAY.x0 + 4; x < QUAY.x1; x += 8) g.add(cyl(0.3, 0.38, 0.8, m.dark, x, QUAY.top + 0.4, QUAY.z0 - 0.6, 10));
    for (let x = QUAY.x0 + 8; x < QUAY.x1 - 2; x += 16) {
      g.add(box(0.2, 3.2, 0.2, m.red, x, QUAY.top + 1.6, QUAY.z0 - 0.9));
      lanterns.add(V(x, QUAY.top + 3.6, QUAY.z0 - 0.9), 0.95, LANTERN.red);
      waterLamps.push(V(x, QUAY.top + 3.6, QUAY.z0));
    }
    // the stair: solid stone steps against the wall, a low parapet on the open side, lanterns along it
    const S = SPIRIT_STAIR, n = 87, runX = (S.x1 - S.x0) / n, rise = (S.y1 - S.y0) / n;
    const steps: THREE.BufferGeometry[] = [];
    for (let k = 0; k < n; k++) {
      const top = S.y0 + (k + 1) * rise, x0 = S.x0 + k * runX;
      steps.push(new THREE.BoxGeometry(runX + 0.02, top - S.y0 + 0.01, 2.8).translate(x0 + runX / 2, (top + S.y0) / 2, RAVINE.far + 1.4));
    }
    const sm = new THREE.Mesh(mergeGeometries(steps)!, stone);
    sm.receiveShadow = true; sm.userData.keep = true;
    g.add(sm);
    const len = Math.hypot(S.x1 - S.x0, S.y1 - S.y0), ang = Math.atan2(S.y1 - S.y0, S.x1 - S.x0);
    const par = box(len, 0.9, 0.3, stone, (S.x0 + S.x1) / 2, (S.y0 + S.y1) / 2 + 0.8, RAVINE.far + 2.95);
    par.rotation.z = ang;
    g.add(par);
    for (let x = S.x0 + 6; x < S.x1 - 2; x += 10) {
      lanterns.add(V(x, spiritStairY(x) + 1.9, RAVINE.far + 2.95), 0.7, LANTERN.white);
      waterLamps.push(V(x, spiritStairY(x) + 1.9, RAVINE.far + 3));
    }
  }

  // ---------- occluders for photos: boxes round the big masses ----------
  const occluders: THREE.Object3D[] = [];
  const proxy = new THREE.MeshBasicMaterial();
  const boxP = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, Math.abs(z1 - z0)), proxy);
    b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    b.visible = false;
    b.updateMatrixWorld(true);
    occluders.push(b);
  };
  boxP(-26, 26, DECK + 1, DECK + 44, BATH.z - 16, BATH.z + 16);
  boxP(PODIUM.front.x0, PODIUM.front.x1, PODIUM.bottom, DECK - 0.5, PODIUM.front.z1, PODIUM.front.z0);
  boxP(PODIUM.back.x0, PODIUM.back.x1, PODIUM.bottom, DECK - 0.5, PODIUM.back.z1, PODIUM.back.z0);
  return { group: g, occluders, noren, house };
}
