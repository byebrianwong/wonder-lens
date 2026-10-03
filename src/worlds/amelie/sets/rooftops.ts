import * as THREE from 'three';
import { box, buildTerrain, instanced, mesh, type Placement } from '../../../engine/Builders';
import { fluffyForest } from '../../../engine/Foliage';
import { charToon, Painter } from '../../../engine/Paint';
import { Rng, TAU, clamp, fbm, lerp, smoothstep } from '../../../engine/math';
import { SETS, Y } from '../layout';
import { boxProxy, optimize, type BuiltSet, type SetContext } from '../common';
import { BAY, GROUND, STOREY, brickMat, chimneyStacks, parisBuilding, streetPalette, facadeMaterial, plasterMat, zincMat, tiled, mansardRoof } from '../buildings';
import { buildSkyClouds } from '../clouds';
import { eiffelTower, sacreCoeur } from '../landmarks';
import { toonE } from '../props';
import { css } from '../textures';

/*
 * The flight: out of Amélie's window and over the zinc roofs at sunset, skimming chimney pots, past the old
 * painter's lit window, while clouds shaped like a teddy bear, a rabbit and a duck drift over Paris. The
 * Butte Montmartre rises ahead with the Sacré-Cœur on top, and the Eiffel Tower stands far off in the glow.
 */

/** Street level of the city below the roofs, and the top of the Butte. */
export const CITY_Y = -6;
export const BUTTE = { x: -25, z: -775, top: Y.parvis };
/** The square at the foot of the great steps, where the carousel turns. */
export const SQUARE = { x: -24, z: -886, y: Y.square, r: 24 };
/** The great steps: a straight flight down the south face of the Butte. */
export const STEPS = { x: -24, z0: -818, z1: -864, halfW: 11 };

/** Ground height of the Butte and the city around it. */
export function butteHeight(x: number, z: number) {
  const dx = x - BUTTE.x, dz = z - BUTTE.z;
  const d = Math.hypot(dx, dz * (dz < 0 ? 0.78 : 1));
  let h = CITY_Y + (BUTTE.top - 0.4 - CITY_Y) * smoothstep(122, 40, d) + (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 4 * smoothstep(40, 70, d) * smoothstep(125, 90, d);
  // the parvis in front of the basilica is flat
  h = lerp(h, BUTTE.top - 0.4, 1 - smoothstep(30, 44, Math.hypot(dx, (z - (BUTTE.z - 34)) * 1.4)));
  // the steps corridor: an even slope from the parvis to the square
  const inSteps = (1 - smoothstep(STEPS.halfW + 2, STEPS.halfW + 8, Math.abs(x - STEPS.x))) * smoothstep(STEPS.z0 + 6, STEPS.z0 - 2, z) * (1 - smoothstep(STEPS.z1 - 2, STEPS.z1 - 10, z));
  const stepY = lerp(BUTTE.top - 0.4, SQUARE.y - 0.15, clamp((STEPS.z0 - z) / (STEPS.z0 - STEPS.z1), 0, 1));
  h = lerp(h, stepY - 0.3, inSteps);
  // the square is a flat terrace
  h = lerp(h, SQUARE.y - 0.15, 1 - smoothstep(SQUARE.r, SQUARE.r + 12, Math.hypot(x - SQUARE.x, (z - SQUARE.z) * 0.9)));
  return h;
}

const cylP = (rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number) => mesh(new THREE.CylinderGeometry(rt, rb, h, 10), m, x, y, z);
const sphP = (r: number, m: THREE.Material, x: number, y: number, z: number) => mesh(new THREE.SphereGeometry(r, 10, 8), m, x, y, z);

/** Rows of little copies of the same painting (the old painter has made one a year for twenty years). */
function paintingsMaterial() {
  const p = new Painter(128, 96, 221).fill('#c8a060');
  const g = p.g, rng = p.rng;
  p.vgrad([[0, '#d8e0c0'], [0.45, '#e8d0a0'], [1, '#a88a60']]);
  g.fillStyle = '#d8604a'; for (let x = 0; x < 128; x += 12) g.fillRect(x, 0, 6, 14);
  g.fillStyle = '#5a7a4a'; g.fillRect(0, 14, 128, 18);
  for (let i = 0; i < 7; i++) { const x = 10 + i * 17, y = rng.range(40, 56); g.fillStyle = rng.pick(['#2a2a3a', '#f0e8e0', '#3a4a6a']); g.beginPath(); g.ellipse(x, y + 14, 6, 11, 0, 0, TAU); g.fill(); g.fillStyle = '#e8c0a0'; g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); }
  g.strokeStyle = '#c89a40'; g.lineWidth = 8; g.strokeRect(0, 0, 128, 96);
  return new THREE.MeshLambertMaterial({ map: p.texture({ wrap: false }), emissive: 0x302010 });
}

/** Washing on a line: a few shirts and sheets in the film's colours. */
function laundryTexture(seed = 211) {
  const p = new Painter(256, 64, seed);
  const g = p.g, rng = p.rng;
  g.clearRect(0, 0, 256, 64);
  let x = 4;
  while (x < 250) {
    const w = rng.range(18, 40), h = rng.range(26, 56);
    g.fillStyle = rng.pick(['#c8282a', '#f0e8d8', '#2f5a3a', '#e8c040', '#f0a0a0', '#3a5a8a']);
    if (rng.chance(0.5)) { g.fillRect(x, 2, w, h); }
    else { g.beginPath(); g.moveTo(x, 2); g.lineTo(x + w, 2); g.lineTo(x + w + 6, 16); g.lineTo(x + w - 4, 18); g.lineTo(x + w - 4, h); g.lineTo(x + 4, h); g.lineTo(x + 4, 18); g.lineTo(x - 6, 16); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, h - 6, w, 6);
    x += w + rng.range(6, 18);
  }
  return p.texture({ wrap: false });
}

export interface Rooftops extends BuiltSet {
  /** the old painter's lit window (Dufayel sits inside at his easel) */
  dufayel: { pos: THREE.Vector3; yaw: number; easel: THREE.Vector3 };
  gnomeSpot: { pos: THREE.Vector3; yaw: number };
  clouds: ReturnType<typeof buildSkyClouds>;
  basilica: THREE.Object3D;
  tower: ReturnType<typeof eiffelTower>;
}

export function buildRooftops(ctx: SetContext): Rooftops {
  const { road, lights } = ctx;
  const rng = new Rng(9876);
  const g = new THREE.Group();
  const arch = new THREE.Group(), decor = new THREE.Group(), live = new THREE.Group();
  g.add(arch, decor, live);

  // ---------- ground: a dark city floor and the green Butte ----------
  const cityFloor = mesh(new THREE.PlaneGeometry(900, 520), toonE(0x3a3430, 0.05), 0, CITY_Y - 0.05, -640);
  cityFloor.rotation.x = -Math.PI / 2; arch.add(cityFloor);
  const grass = new THREE.Color(0x5a7a34), grass2 = new THREE.Color(0x7a9a44), path = new THREE.Color(0xb8a888), dirt = new THREE.Color(0x6a5a3a);
  const terrain = buildTerrain({
    xMin: -170, xMax: 120, zMin: -930, zMax: -660, res: 3, chunk: 150,
    height: butteHeight,
    color: (x, z, y, slope, out) => {
      if (y < CITY_Y + 0.4) { out.set(0x3a3430); return; }
      const n = fbm(x * 0.06, z * 0.06, 3);
      // the paved forecourt in front of the basilica
      const dx = x - BUTTE.x, dzz = (z - (BUTTE.z - 34)) * 1.4;
      if (Math.hypot(dx, dzz) < 36 && slope < 0.2) { out.set(0xc8c0ac).offsetHSL(0, 0, (n - 0.5) * 0.06); return; }
      out.copy(grass).lerp(grass2, n).lerp(dirt, smoothstep(0.35, 0.7, slope) * 0.6);
      // gravel paths zig-zagging up the slope
      const zig = Math.abs(Math.sin((x + z * 0.6) * 0.09)) < 0.08 && Math.hypot(x - BUTTE.x, z - BUTTE.z) > 46 ? 1 : 0;
      out.lerp(path, zig * 0.8);
    },
  });
  arch.add(terrain);

  // ---------- the city: blocks of Haussmann buildings, kept clear of the flight path ----------
  const pal = streetPalette(rng, { lit: 0.3, glass: 'day', litStrength: 0.9 });
  const chimneys: Placement[] = [];
  const antennas: Placement[] = [];
  const pathClear = (x: number, z: number, halfSize: number, top: number) => {
    // the flight path's height where it passes nearest, and how far it passes from this spot
    if (z > SETS.rooftops.z0 + 4 || z < SETS.butte.z1) return true;
    const r = road.at(z);
    const lat = Math.abs((x - r.x) * r.rx + (z - r.z) * r.rz);
    if (lat > halfSize + 5) return true;
    return top < r.y - 2.6;
  };
  const placed: Array<{ x: number; z: number; r: number }> = [];
  /** buildings that get a box stand-in for line-of-sight checks */
  const proxyOf: THREE.Object3D[] = [];
  const tryBuilding = (x: number, z: number, yaw: number, opts: { village?: boolean; bays?: number; storeysMax?: number } = {}) => {
    const base = opts.village ? butteHeight(x, z) : CITY_Y;
    const bays = opts.bays ?? rng.int(3, 5);
    const w = bays * BAY, d = rng.range(10, 14);
    const r = Math.hypot(w, d) / 2;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r - 1)) return false;
    let storeys = opts.village ? rng.int(1, 3) : rng.int(4, opts.storeysMax ?? 6);
    while (storeys >= 1 && !pathClear(x, z, r, base + GROUND + storeys * STOREY + 5.5)) storeys--;
    if (storeys < 1) return false;
    const wi = pal.pick();
    const b = parisBuilding({
      bays, storeys, depth: d, facade: pal.facades[wi], side: pal.sides[wi], ground: { kind: 'door', mat: rng.pick(pal.doors) },
      balconies: opts.village ? [] : [1, Math.max(1, storeys - 1)], flowers: opts.village ? 0.4 : 0.15, rng, roof: opts.village && rng.chance(0.6) ? 'gable' : 'mansard',
      chimneys, place: { x, y: base, z, yaw }, footing: opts.village ? 12 : 2.5,
    });
    b.position.set(x, base, z); b.rotation.y = yaw;
    arch.add(b);
    proxyOf.push(b);
    placed.push({ x, z, r });
    if (!opts.village && rng.chance(0.5)) antennas.push({ x: x + rng.range(-w / 3, w / 3), y: base + GROUND + storeys * STOREY + 3.8, z: z - d / 2 + rng.range(-1, 1), scale: rng.range(0.8, 1.3), rot: rng.range(0, TAU) });
    return true;
  };

  // Amélie's own building, its open window where the moped has just come out
  const homeZ = SETS.bedroom.z1 - 0.7;
  {
    const wall = 0xead6b0;
    const front = facadeMaterial({ wall, shutters: 0x2f5a3a, bays: 3, storeys: 2, lit: 0.35, flowers: 0.4, ashlar: true, glass: 'day', seed: 160 }, 0.9);
    const H = BUTTE.top + 12 - CITY_Y;
    const home = tiled(30, H, 40, [plasterMat(wall), plasterMat(wall), plasterMat(wall), plasterMat(wall), plasterMat(wall), front], BAY * 3, STOREY * 2, 0, CITY_Y + H / 2, homeZ + 20);
    arch.add(home); proxyOf.push(home);
    const roof = mesh(mansardRoof(30.4, 40.4, 3.6, 1.6), zincMat(), 0, CITY_Y + H, homeZ + 20); arch.add(roof);
    // the open window seen from outside: a warm red glow behind it
    const glowWin = mesh(new THREE.PlaneGeometry(6.8, 8.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe86a40).multiplyScalar(0.9) }), 0, Y.bedroom + 4.2, homeZ - 0.05);
    glowWin.rotation.y = Math.PI; decor.add(glowWin);
    decor.add(box(8, 0.3, 2.2, toonE(0xd8c8a8, 0.08), 0, Y.bedroom - 0.15, homeZ - 1.1));
    placed.push({ x: 0, z: homeZ + 20, r: 24 });
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) tryBuilding(s * (28 + k * 13), homeZ + 7, Math.PI, { bays: 4, storeysMax: 6 });
  }

  // the old painter's building, its window right beside the flight path
  const dz = -598, dp = road.at(dz);
  const dufYaw = road.faceRoad(dz, 1);
  const dufPos = new THREE.Vector3(), easelPos = new THREE.Vector3();
  {
    const bx = dp.x + dp.rx * 13.5, bzz = dp.z + dp.rz * 13.5;
    const wall = 0xe6c8a0;
    const fm = facadeMaterial({ wall, shutters: 0x6a4a2a, bays: 3, storeys: 2, lit: 0.6, flowers: 0.3, glass: 'day', seed: 170 }, 0.9);
    const H = dp.y - 1.6 - CITY_Y;
    const lower = tiled(12, H, 12, [plasterMat(wall), plasterMat(wall), plasterMat(wall), plasterMat(wall), fm, plasterMat(wall)], BAY * 3, STOREY * 2, bx, CITY_Y + H / 2, bzz);
    lower.rotation.y = dufYaw; arch.add(lower); proxyOf.push(lower);
    // the painter's room on top, seen through one big open window beside the path
    const room = new THREE.Group(); room.position.set(bx, dp.y - 1.6, bzz); room.rotation.y = dufYaw; arch.add(room);
    const rm = new THREE.MeshLambertMaterial({ color: 0xd8b078, emissive: 0x4a2810, side: THREE.DoubleSide });
    room.add(box(12, 0.3, 12, rm, 0, 0, 0), box(12, 0.3, 12, rm, 0, 6.2, 0), box(0.3, 6.2, 12, rm, -6, 3.1, 0), box(0.3, 6.2, 12, rm, 6, 3.1, 0), box(12, 6.2, 0.3, rm, 0, 3.1, -6));
    // the front wall round the window
    const fw = plasterMat(wall);
    for (const s of [-1, 1]) room.add(tiled(4, 6.2, 0.5, fw, 4, 4, s * 4, 3.1, 6));
    room.add(tiled(4, 1.1, 0.5, fw, 4, 4, 0, 0.55, 6), tiled(4, 1.3, 0.5, fw, 4, 4, 0, 5.55, 6));
    const frameM = toonE(0xf4ead8, 0.12);
    room.add(box(4.4, 0.25, 0.9, frameM, 0, 1.1, 6.3), box(4.3, 0.2, 0.6, frameM, 0, 4.9, 6.1));
    for (const s of [-1, 1]) {
      room.add(box(0.2, 3.8, 0.6, frameM, s * 2.0, 3.0, 6.1));
      // the casements swung open against the wall
      const leaf = new THREE.Group(); leaf.position.set(s * 2.0, 1.1, 6.35); leaf.rotation.y = s * 1.9; room.add(leaf);
      leaf.add(box(0.12, 3.8, 0.12, frameM, 0, 1.9, 0), box(0.12, 3.8, 0.12, frameM, -s * 2.0, 1.9, 0), box(2.0, 0.12, 0.12, frameM, -s * 1.0, 0, 0), box(2.0, 0.12, 0.12, frameM, -s * 1.0, 3.8, 0), box(2.0, 0.1, 0.1, frameM, -s * 1.0, 1.9, 0));
    }
    // geraniums on the sill
    for (let k = 0; k < 3; k++) { room.add(cylP(0.28, 0.22, 0.45, toonE(0xb86a44, 0.1), -1.2 + k * 1.2, 1.45, 6.5)); room.add(sphP(0.32, toonE(k === 1 ? 0xd8222a : 0x3a6a2a, 0.2), -1.2 + k * 1.2, 1.85, 6.5)); }
    // his copies of the boating party hang all round the walls
    const frames = [[-5.8, 3.4, 0, 2.2, 1.6], [-5.8, 3.0, -3.6, 1.6, 1.2], [5.8, 3.4, -1, 2.4, 1.8], [0, 3.6, -5.8, 3.2, 2.2], [-3.6, 3.4, -5.8, 1.6, 1.2], [3.8, 3.2, -5.8, 1.8, 1.4]] as const;
    const art = paintingsMaterial();
    for (const [x, y, z, w, h] of frames) {
      const pm = mesh(new THREE.PlaneGeometry(w, h), art, x, y, z);
      if (Math.abs(x) > 5) pm.rotation.y = -Math.sign(x) * Math.PI / 2;
      room.add(pm);
    }
    room.add(mesh(mansardRoof(12.6, 12.6, 3.2, 1.4), zincMat(), 0, 6.3, 0));
    room.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(1.8) }), -1, 5.4, 1));
    placed.push({ x: bx, z: bzz, r: 10 });
    room.updateMatrixWorld(true);
    dufPos.copy(room.localToWorld(new THREE.Vector3(-1.4, 0.15, 3.0)));
    easelPos.copy(room.localToWorld(new THREE.Vector3(-0.4, 0.15, 3.0)));
  }

  // the city grid
  for (let gx = -190; gx <= 190; gx += 17) {
    for (let gz = SETS.rooftops.z0 - 12; gz > -760; gz -= 15) {
      if ((Math.round(gx / 17) % 4 === 0) || (Math.round(gz / 15) % 5 === 0)) continue; // streets
      const x = gx + rng.range(-2, 2), z = gz + rng.range(-2, 2);
      if (butteHeight(x, z) > CITY_Y + 1.5) continue;
      tryBuilding(x, z, rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + rng.range(-0.05, 0.05));
    }
  }
  // village houses on the slopes of the Butte, among trees
  const trees: Placement[] = [];
  for (let i = 0; i < 420; i++) {
    const a = rng.range(0, TAU), d = rng.range(44, 118);
    const x = BUTTE.x + Math.cos(a) * d, z = BUTTE.z + Math.sin(a) * d;
    if (z < STEPS.z0 + 4 && Math.abs(x - STEPS.x) < STEPS.halfW + 6) continue;
    // keep the forecourt and the slopes either side of the steps open, so the basilica can be seen
    if (z < BUTTE.z - 10 && d < 70) continue;
    if (Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r + 6) continue;
    if (z < SETS.butte.z1 - 20) continue;
    const y = butteHeight(x, z);
    if (y < CITY_Y + 1.5) continue;
    if (rng.chance(0.42)) {
      const yaw = Math.atan2(-(x - BUTTE.x), -(z - BUTTE.z)) + Math.PI + rng.range(-0.3, 0.3);
      tryBuilding(x, z, yaw, { village: true, bays: rng.int(2, 3) });
    } else if (pathClear(x, z, 4, y + 9)) trees.push({ x, y: y - 0.2, z, scale: rng.range(1.1, 1.8), rot: rng.range(0, TAU) });
  }
  decor.add(fluffyForest({ shape: 'round', trunk: 0x4a3a2a, leaves: [0x3f6a2a, 0x4a7a32, 0x5a8a3a, 0x355e26] }, trees, rng, { castShadow: true, variants: 3 }));
  decor.add(chimneyStacks(chimneys));
  {
    // television aerials on many roofs
    const mast = new THREE.CylinderGeometry(0.04, 0.05, 3.6, 4); mast.translate(0, 1.8, 0);
    const bar = new THREE.BoxGeometry(2.2, 0.05, 0.05); bar.translate(0, 3.2, 0);
    const bar2 = new THREE.BoxGeometry(1.4, 0.05, 0.05); bar2.translate(0, 2.6, 0);
    const am = toonE(0x2a2a2a, 0.05);
    decor.add(instanced(mast, am, antennas), instanced(bar, am, antennas), instanced(bar2, am, antennas));
  }
  // laundry lines strung over the roof terraces near the path
  {
    const lt = new THREE.MeshLambertMaterial({ map: laundryTexture(), alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x2a1a10 });
    for (const [z, lat, len] of [[-560, -8, 9], [-585, 7, 8], [-628, -7, 10], [-650, 6, 9]] as const) {
      const p = road.side(z, lat), r = road.at(z);
      const line = mesh(new THREE.PlaneGeometry(len, len * 0.25), lt, p.x, r.y - 3.4, p.z);
      line.rotation.y = road.along(z) + Math.PI / 2 + rng.range(-0.4, 0.4);
      line.userData.keep = true;
      live.add(line);
    }
  }

  // ---------- the Sacré-Cœur on top of the Butte ----------
  const basilica = sacreCoeur();
  // it faces south, down the great steps; its body and bell tower stretch back over the top of the hill
  basilica.position.set(BUTTE.x, BUTTE.top - 0.4, BUTTE.z - 23);
  basilica.rotation.y = Math.PI;
  arch.add(basilica);

  // ---------- far off: a ring of roofs to the horizon, and the Eiffel Tower ----------
  {
    const f = facadeMaterial({ wall: 0xd8c0a0, bays: 6, storeys: 6, lit: 0.4, glass: 'day', seed: 180 }, 0.9);
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const roofG = new THREE.BoxGeometry(1, 1, 1); roofG.translate(0, 0.5, 0);
    const n = 420;
    const im = new THREE.InstancedMesh(geo, f, n), rf = new THREE.InstancedMesh(roofG, zincMat(), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let i = 0;
    while (i < n) {
      const a = rng.range(0, TAU), d = rng.range(230, 560);
      const x = Math.cos(a) * d, z = -700 + Math.sin(a) * d;
      const w = BAY * 6, dd = BAY * 6, h = STOREY * 6 + rng.range(-2, 3);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, TAU));
      p.set(x, CITY_Y, z); s.set(w, h, dd); m.compose(p, q, s); im.setMatrixAt(i, m);
      p.set(x, CITY_Y + h, z); s.set(w * 0.9, 3, dd * 0.9); m.compose(p, q, s); rf.setMatrixAt(i, m);
      i++;
    }
    im.instanceMatrix.needsUpdate = true; rf.instanceMatrix.needsUpdate = true;
    decor.add(im, rf);
  }
  const tower = eiffelTower(170);
  tower.group.position.set(330, CITY_Y, -880);
  decor.add(tower.group);

  // ---------- clouds, among them a bear, a rabbit and a duck ----------
  // the animals hang in clear sky; ordinary clouds keep their distance so the shapes read
  const animalAt = [new THREE.Vector3(-110, 100, -770), new THREE.Vector3(120, 112, -830), new THREE.Vector3(0, 165, -1010)];
  const cloudPl: Placement[] = [];
  for (let i = 0; i < 60 && cloudPl.length < 34; i++) {
    const a = rng.range(-1.2, 1.2) - Math.PI / 2, d = rng.range(180, 700);
    const pl = { x: Math.cos(a) * d * 1.3, y: rng.range(70, 170), z: -560 + Math.sin(a) * d, scale: rng.range(1.2, 2.6), rot: rng.range(0, TAU) };
    if (animalAt.some((p) => Math.hypot(p.x - pl.x, p.z - pl.z) < 150)) continue;
    cloudPl.push(pl);
  }
  const clouds = buildSkyClouds(rng, cloudPl);
  clouds.bear.group.position.copy(animalAt[0]); clouds.bear.group.scale.setScalar(3.0); clouds.bear.group.rotation.y = 0.45;
  clouds.rabbit.group.position.copy(animalAt[1]); clouds.rabbit.group.scale.setScalar(3.2); clouds.rabbit.group.rotation.y = -0.5;
  clouds.duck.group.position.copy(animalAt[2]); clouds.duck.group.scale.setScalar(3.4); clouds.duck.group.rotation.y = -0.15;
  g.add(clouds.field.group);

  // a tall party-wall chimney beside the path, with the gnome's perch on its cap
  const gnomePerch = (() => { const z = -640, p = road.side(z, -6.5); return new THREE.Vector3(p.x, road.at(z).y - 1.6, p.z); })();
  {
    const h = gnomePerch.y - CITY_Y;
    arch.add(tiled(2.2, h, 1.2, brickMat(), 2, 2, gnomePerch.x, CITY_Y + h / 2 - 0.15, gnomePerch.z));
    arch.add(box(2.6, 0.3, 1.6, toonE(0xe8dcc4, 0.08), gnomePerch.x, gnomePerch.y - 0.15, gnomePerch.z));
    for (const k of [-0.7, 0.7]) decor.add(box(0.3, 0.6, 0.3, toonE(0xb86a44, 0.08), gnomePerch.x + k, gnomePerch.y + 0.3, gnomePerch.z - 0.2));
    placed.push({ x: gnomePerch.x, z: gnomePerch.z, r: 2 });
  }

  // ---------- light: a warm lamp in the painter's window ----------
  lights.add({ from: road.u(-560), to: road.u(-640), pos: road.side(dz, 10, 1.6), color: 0xffc880, intensity: 26, distance: 18 });

  // line-of-sight checks use a box per building (plus the hill and the basilica), not the merged city
  const proxies = new THREE.Group();
  for (const o of [...proxyOf, basilica]) proxies.add(boxProxy(o));
  g.add(proxies);
  optimize(arch);
  optimize(decor);

  void css; void charToon;
  return {
    id: 'rooftops', group: g, show: [road.u(SETS.rooftops.z0 + 26), road.u(SETS.butte.z1 + 30)], occluders: [proxies, terrain], subjects: [],
    floor: (x, z) => {
      // roofs are not walkable ground for a stone; the street or the Butte below
      return butteHeight(x, z);
    },
    dufayel: { pos: dufPos, yaw: dufYaw, easel: easelPos },
    gnomeSpot: { pos: gnomePerch, yaw: road.faceRoad(-640, -1) },
    clouds, basilica, tower,
    update(_dt, t) {
      // the animals in the clouds drift and fidget
      const { bear, rabbit, duck } = clouds;
      // when the accordion plays they wave back: the bear lifts an arm, the rabbit's ears flap, the duck nods
      const w = (o: THREE.Object3D) => { const v = (o.userData.wave as number | undefined) ?? 0; o.userData.wave = Math.max(0, v - _dt); return Math.min(1, v); };
      const wb = w(bear.parts.armR), wr = w(rabbit.parts.earL), wd = w(duck.parts.head);
      bear.parts.armR.rotation.z = -0.2 + Math.sin(t * 0.6) * 0.15 - wb * (1.6 + Math.sin(t * 4) * 0.4);
      bear.parts.armL.rotation.z = 0.2 - Math.sin(t * 0.5 + 1) * 0.1;
      rabbit.parts.earL.rotation.z = 0.15 + Math.max(0, Math.sin(t * 1.3)) ** 6 * 0.4 + wr * Math.sin(t * 6) * 0.5;
      rabbit.parts.earR.rotation.z = -0.25 - wr * Math.sin(t * 6 + 1) * 0.5;
      duck.parts.head.rotation.z = Math.sin(t * 0.7) * 0.12 + wd * Math.sin(t * 5) * 0.4;
      duck.group.position.x = Math.sin(t * 0.05) * 30;
      clouds.field.group.position.x = Math.sin(t * 0.02) * 10;
      // the tower's lights twinkle
      tower.lights.opacity = 0.55 + Math.max(0, Math.sin(t * 9)) * 0.45 * (Math.sin(t * 0.37) > 0 ? 1 : 0.4);
      for (const c of live.children) if ((c as THREE.Mesh).isMesh) c.rotation.z = Math.sin(t * 2 + c.position.x) * 0.06;
    },
  };
}
