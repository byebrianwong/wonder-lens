import * as THREE from 'three';
import { box, cyl, mesh, type Placement } from '../../../engine/Builders';
import { fluffyForest } from '../../../engine/Foliage';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { ribbon, subCurve, wallStrip, type BuiltSet, type SetContext, optimize } from '../common';
import { BAY, STOREY, chimneyStacks, facadeMaterial, parisBuilding, plasterMat, streetPalette, zincMat } from '../buildings';
import { bistroChair, bistroTable, bollards, parisLamps, toonE } from '../props';
import { ashlar, cobbles, pavement } from '../textures';
import { eiffelTower } from '../landmarks';
import { lightShaft } from '../lens';

/*
 * The last scene: out of the photo booth's flash into a Montmartre lane at sunrise, following Amélie and Nino
 * on his red moped. The lane ends at a terrace over Paris; both mopeds lift off into the morning and the
 * camera rises with them to show the whole city waking up.
 */

export const FIN = { z0: -1432, terrace: -1640, edge: -1652, below: -46 };

/** Morning mist: a soft horizontal band, for big flat planes over the city. */
function mistTexture(seed = 601) {
  const p = new Painter(256, 256, seed);
  const g = p.g;
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    const x = p.rng.range(0, 256), y = p.rng.range(40, 216), r = p.rng.range(30, 90);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,240,225,0.35)'); gr.addColorStop(1, 'rgba(255,240,225,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return p.texture({ repeat: [1, 1] });
}

export interface Finale extends BuiltSet {
  /** where the lovers' moped is along the lane for a given rider z (a few units ahead) */
  leadZ(riderZ: number): number;
  terrace: { gnome: THREE.Vector3; gnomeYaw: number };
  tower: ReturnType<typeof eiffelTower>;
}

export function buildFinale(ctx: SetContext): Finale {
  const { road } = ctx;
  const rng = new Rng(8080);
  const g = new THREE.Group();
  const arch = new THREE.Group(), decor = new THREE.Group(), live = new THREE.Group();
  g.add(arch, decor, live);
  const zA = FIN.z0, zT = FIN.terrace;
  const curve = subCurve(road, zA + 4, zT - 10, 60);
  const segs = 110;
  const ROAD = 2.8, KERB = 3.1, FRONT = 5.2;

  // ---------- the lane ----------
  const cob = new THREE.MeshLambertMaterial({ map: cobbles(0x8a7a68, 603) });
  const lane = new THREE.Mesh(ribbon(curve, -ROAD, ROAD, segs, 0, 4), cob); lane.receiveShadow = true; arch.add(lane);
  const pave = new THREE.MeshLambertMaterial({ map: pavement(0xa89a88, 605) });
  const kerbM = new THREE.MeshLambertMaterial({ color: 0xc8beac });
  for (const s of [-1, 1]) {
    const pv = new THREE.Mesh(ribbon(curve, s > 0 ? KERB : -FRONT - 0.5, s > 0 ? FRONT + 0.5 : -KERB, segs, 0.14, 4), pave); pv.receiveShadow = true; arch.add(pv);
    arch.add(new THREE.Mesh(ribbon(curve, s > 0 ? ROAD : -KERB, s > 0 ? KERB : -ROAD, segs, 0.15, 1), kerbM));
    arch.add(new THREE.Mesh(wallStrip(curve, s * ROAD, 0, 0.15, segs, s < 0, 1), kerbM));
  }
  // old village houses in soft morning colours, lower and more crooked than the streets below
  const pal = streetPalette(rng, { lit: 0.08, glass: 'day', litStrength: 0.5 });
  const pastel = [0xf2d6c8, 0xf0e6c4, 0xe0e4c8, 0xf4e0d0, 0xead0a8, 0xf6ecdc];
  const facades = pastel.map((wall, i) => facadeMaterial({ wall, shutters: [0x3a6a44, 0x5a7a8a, 0x8a3a2a, 0x2f5a3a, 0x6a5a3a, 0x3a6a44][i], bays: 3, storeys: 2, lit: 0.05, flowers: 0.45, glass: 'day', seed: 610 + i }, 0.4));
  const chimneys: Placement[] = [];
  const ivy: Placement[] = [];
  for (const s of [-1, 1]) {
    let z = zA - 2;
    while (z > zT + 6) {
      const bays = rng.int(2, 4), w = bays * BAY, zc = z - w / 2;
      const p = road.side(zc, s * (FRONT + rng.range(0, 0.4)));
      const yaw = road.faceRoad(zc, s) + rng.range(-0.04, 0.04);
      const y = road.at(zc).y + 0.14;
      const wi = rng.int(0, pastel.length - 1);
      const storeys = rng.int(2, 4);
      const shop = rng.chance(0.35);
      const b = parisBuilding({
        bays, storeys, depth: 11, facade: facades[wi], side: plasterMat(pastel[wi]), shopGlow: 0.3, roof: rng.chance(0.55) ? 'gable' : 'mansard',
        ground: shop ? { kind: 'shop', shop: { name: rng.pick(['CRÊPERIE', 'BOULANGERIE', 'CAFÉ', 'FLEURS', 'ANTIQUITÉS', 'BROCANTE']), paint: rng.pick([0x2f5a3a, 0x6a1a1c, 0x3a5a6a, 0x8a6a2a]), goods: rng.pick(['bread', 'flowers', 'cakes', 'books'] as const), seed: 620 + Math.round(-z), w: 128 * bays * 2, h: 280 }, awning: rng.pick([[0xb8282a, 0xf0e2c0], [0x2f5a3a, 0xf0e2c0], [0xe8b04a, 0xf6ecdc]] as const) as [number, number] } : { kind: 'door', mat: rng.pick(pal.doors) },
        balconies: storeys > 2 ? [1] : [], flowers: 0.55, rng, chimneys, place: { x: p.x, y, z: p.z, yaw },
      });
      b.position.set(p.x, y, p.z); b.rotation.y = yaw;
      arch.add(b);
      // ivy climbing some walls
      if (rng.chance(0.45)) for (let k = 0; k < 90; k++) {
        const ix = rng.range(-w / 2, w / 2); const lx = ix, ly = rng.range(0, 1) ** 1.6 * (4.4 + storeys * STOREY * 0.8);
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        ivy.push({ x: p.x + c * lx + sn * 0.25, y: y + ly, z: p.z - sn * lx + c * 0.25, scale: rng.range(0.5, 1.1), rot: rng.range(0, TAU) });
      }
      z -= w + (rng.chance(0.2) ? rng.range(3, 6) : 0.1);
    }
  }
  decor.add(chimneyStacks(chimneys));
  if (ivy.length) {
    const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.26, 1), toonE(0x2f5a24, 0.1), ivy.length);
    ivy.forEach((p, i) => m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rot, p.rot * 2, 0)), new THREE.Vector3(p.scale, p.scale * 0.6, p.scale))));
    decor.add(m);
  }
  // lamps, bollards, a café terrace, trees in a little square halfway
  const lampPl: Placement[] = [], bol: Placement[] = [];
  for (let z = zA - 10, i = 0; z > zT + 10; z -= 24, i++) { const p = road.side(z, (i % 2 ? 1 : -1) * 3.9, 0.14); lampPl.push({ x: p.x, y: p.y, z: p.z, scale: 0.95, rot: 0 }); }
  for (let z = zA - 4; z > zT + 4; z -= 2.6) for (const s of [-1, 1]) { const p = road.side(z, s * 3.3, 0.14); bol.push({ x: p.x, y: p.y, z: p.z, scale: 0.9, rot: 0 }); }
  decor.add(parisLamps(lampPl), bollards(bol));
  for (let i = 0; i < 3; i++) {
    const p = road.side(-1520 - i * 3, -4.4, 0.14);
    const t = bistroTable(); t.position.copy(p); decor.add(t);
    for (const s of [-1, 1]) { const c = bistroChair(); c.position.copy(p).add(new THREE.Vector3(0, 0, s * 0.72)); c.rotation.y = s > 0 ? Math.PI : 0; decor.add(c); }
  }

  // ---------- the terrace over Paris ----------
  const tY = road.at(zT).y;
  {
    const stoneM = new THREE.MeshLambertMaterial({ map: ashlar(0xd8ccb4, 607) });
    const terr = mesh(new THREE.BoxGeometry(40, 1.2, FIN.edge - zT + 30), stoneM, 0, tY - 0.6, (zT + FIN.edge) / 2 + 12);
    terr.receiveShadow = true; arch.add(terr);
    // the balustrade along the edge, open in the middle where the moped flies off
    for (let x = -19; x <= 19; x += 1.1) {
      if (Math.abs(x) < 3.5) continue;
      decor.add(cyl(0.18, 0.24, 1.0, toonE(0xe8dcc4, 0.08), x, tY + 0.5, FIN.edge, 8));
    }
    for (const s of [-1, 1]) decor.add(box(15.5, 0.25, 0.7, toonE(0xe8dcc4, 0.08), s * 11.5, tY + 1.1, FIN.edge));
    // a retaining wall dropping to the city
    arch.add(mesh(new THREE.BoxGeometry(40, tY - FIN.below, 2), stoneM, 0, (tY + FIN.below) / 2, FIN.edge - 1));
    // trees flanking the terrace
    const trees: Placement[] = [];
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) trees.push({ x: s * rng.range(10, 18), y: tY, z: zT - 2 - k * 3, scale: rng.range(1.2, 1.6), rot: rng.range(0, TAU) });
    for (let k = 0; k < 40; k++) { const s = rng.sign(); trees.push({ x: s * rng.range(22, 60), y: lerp(tY - 4, FIN.below, rng.next()), z: rng.range(FIN.edge - 2, FIN.edge - 30), scale: rng.range(1.2, 2), rot: rng.range(0, TAU) }); }
    decor.add(fluffyForest({ shape: 'round', trunk: 0x4a3a2a, leaves: [0x4f7a32, 0x5a8a3a, 0x6a9a44] }, trees, rng, { castShadow: true, variants: 3 }));
  }

  // ---------- Paris below, waking up: blocks along streets, a few boulevards, the Seine, parks ----------
  {
    const f = facadeMaterial({ wall: 0xe8d8c0, bays: 6, storeys: 6, lit: 0.1, glass: 'day', seed: 630 }, 0.5);
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const seine = (x: number) => FIN.edge - 520 + Math.sin(x * 0.006) * 70 + x * 0.12;
    const pl: Array<{ x: number; z: number; w: number; d: number; h: number; r: number }> = [];
    const parkTrees: Placement[] = [];
    // a grid turned a little off the view, so the streets cut across the picture instead of lining up with it
    const rot = 0.32, cr = Math.cos(rot), sr = Math.sin(rot), cz0 = FIN.edge - 480;
    for (let gx = -760; gx <= 760; gx += 26) for (let gz = 440; gz > -560; gz -= 26) {
      const bx = gx * cr - gz * sr + rng.range(-1.5, 1.5), bz = cz0 + gx * sr + gz * cr + rng.range(-1.5, 1.5);
      if (bz > FIN.edge - 24 || bz < FIN.edge - 1000 || Math.abs(bx) > 680) continue;
      if (Math.abs(bz - seine(bx)) < 34) continue; // the river and its quays
      if (Math.abs(gx % 182) < 14 || Math.abs(gz % 156) < 12) continue; // boulevards
      if (Math.abs((bx - bz * 0.7) % 260) < 12) continue; // a diagonal avenue
      if (Math.hypot(bx + 150, bz - (FIN.edge - 520)) < 70) { for (let k = 0; k < 3; k++) parkTrees.push({ x: bx + rng.range(-8, 8), y: FIN.below, z: bz + rng.range(-8, 8), scale: rng.range(2, 3), rot: 0 }); continue; } // the Champ de Mars
      if (rng.chance(0.04)) { for (let k = 0; k < 3; k++) parkTrees.push({ x: bx + rng.range(-8, 8), y: FIN.below, z: bz + rng.range(-8, 8), scale: rng.range(2, 3), rot: 0 }); continue; }
      pl.push({ x: bx, z: bz, w: rng.range(16, 24), d: rng.range(16, 24), h: STOREY * rng.int(4, 8) + 4.4 + (rng.chance(0.05) ? rng.range(6, 16) : 0), r: rot + rng.range(-0.05, 0.05) });
    }
    const im = new THREE.InstancedMesh(geo, f, pl.length), rf = new THREE.InstancedMesh(geo, zincMat(), pl.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    pl.forEach((b, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.r);
      p.set(b.x, FIN.below, b.z); s.set(b.w, b.h, b.d); m.compose(p, q, s); im.setMatrixAt(i, m);
      p.set(b.x, FIN.below + b.h, b.z); s.set(b.w * 0.86, 3.2, b.d * 0.86); m.compose(p, q, s); rf.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true; rf.instanceMatrix.needsUpdate = true;
    decor.add(im, rf);
    decor.add(fluffyForest({ shape: 'round', trunk: 0x4a3a2a, leaves: [0x5a8a3a, 0x6a9a44] }, parkTrees, rng, { variants: 2 }));
    const floor = mesh(new THREE.PlaneGeometry(1500, 1100), toonE(0x8a7e6e, 0.05), 0, FIN.below - 0.1, FIN.edge - 500);
    floor.rotation.x = -Math.PI / 2; arch.add(floor);
    // the Seine: a ribbon of water catching the sunrise
    const river: THREE.Vector3[] = [];
    for (let x = -700; x <= 700; x += 50) river.push(new THREE.Vector3(x, FIN.below + 0.1, seine(x)));
    const rc = new THREE.CatmullRomCurve3(river);
    const water = new THREE.Mesh(ribbon(rc, -22, 22, 60, 0, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf0c8a0).multiplyScalar(0.9) }));
    decor.add(water);
    // a thin morning mist lying in the streets
    const mm = new THREE.MeshBasicMaterial({ map: mistTexture(), transparent: true, depthWrite: false, opacity: 0.22 });
    (mm.map as THREE.Texture).repeat.set(3, 3);
    const mist = mesh(new THREE.PlaneGeometry(1400, 900), mm, 0, FIN.below + 9, FIN.edge - 480); mist.rotation.x = -Math.PI / 2; mist.renderOrder = 4; mist.userData.keep = true; decor.add(mist);
  }
  // two domes over the roofs: the gilded one of Les Invalides and the Panthéon's
  for (const [x, z, r, gold] of [[-60, FIN.edge - 380, 14, true], [140, FIN.edge - 640, 16, false]] as const) {
    const stoneM = toonE(0xe8dcc4, 0.1), domeM = gold ? toonE(0xe8b84a, 0.35) : toonE(0xd8d4c8, 0.15);
    const base = FIN.below;
    decor.add(mesh(new THREE.BoxGeometry(r * 4, 22, r * 4), stoneM, x, base + 11, z));
    decor.add(mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.1, r * 1.6, 24), stoneM, x, base + 22 + r * 0.8, z));
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.01, Math.cos(a) * r), Math.sin(a) * r * 1.35)); }
    decor.add(mesh(new THREE.LatheGeometry(prof, 24), domeM, x, base + 22 + r * 1.6, z));
    decor.add(mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.16, r * 0.8, 10), domeM, x, base + 22 + r * 1.6 + r * 1.35 + r * 0.4, z));
  }
  const tower = eiffelTower(200);
  tower.group.position.set(-150, FIN.below, FIN.edge - 520);
  decor.add(tower.group);
  // the sun's rays slanting down the lane
  decor.add(lightShaft(road.side(-1500, -14, 20), road.side(-1508, 4, 0), 9, 0xffe0b0, 0.12));
  decor.add(lightShaft(road.side(-1580, -14, 20), road.side(-1588, 4, 0), 9, 0xffe0b0, 0.1));

  optimize(arch);
  optimize(decor);

  void clamp; void smoothstep; void live;
  return {
    id: 'finale', group: g, show: [road.u(SETS.gare.z1 - 0.5), 1], occluders: [arch], subjects: [],
    floor: (x, z) => {
      if (z < FIN.edge) return Math.abs(x) < 20 && z > FIN.edge - 2 ? tY : FIN.below;
      if (z < zT + 4) return tY;
      const r = road.at(z);
      const lat = Math.abs((x - r.x) * r.rx + (z - r.z) * r.rz);
      return r.y + (lat > ROAD ? 0.14 : 0);
    },
    leadZ: (riderZ) => Math.max(SETS.finale.z1 - 30, riderZ - 13),
    terrace: { gnome: new THREE.Vector3(7.5, tY + 1.25, FIN.edge), gnomeYaw: Math.PI },
    tower,
    update(_dt, t) {
      tower.lights.opacity = 0.35 + Math.max(0, Math.sin(t * 9)) * 0.3;
    },
  };
}
