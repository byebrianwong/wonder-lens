import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, canvasTexture, cyl, mesh, mergeStatic, toon } from '../../../engine/Builders';
import { repeatUV } from '../../../engine/Paint';
import { Spring } from '../../../engine/Rig';
import { clamp, smoothstep } from '../../../engine/math';
import type { RideState } from '../../../game/types';
import type { Road } from '../layout';
import type { MountDef, SetContext } from '../common';
import { texMat } from '../kit';
import { CABLE_H, PYLON_X, PYLONS, RETURN_X, SEA, SEA_PYLONS, ZSNAP } from './plan';
import { baleAtlas, corrugated, gondolaSide, hazard, jpSign, lattice, rustIron } from './paint';

/*
 * The trash gondola line: the rider's car (a rusty open bucket with a bale of trash in it, hung from a yoke
 * whose grip clamps the cable), the two cables (outbound over the rider's head, the return line to the
 * right), the lattice pylons that carry them, the tall pylons out in the bay, and the other cars: loaded
 * ones coming back along the return line and one going out ahead of the rider.
 *
 * Mount space: origin on the path (the car's floor), +z forward, +x to the rider's LEFT (the vehicle's own
 * axes: it faces -z in the world).
 */

/** how much of the path's slope the car takes (see MountDef.tilt) */
export const TILT = 0.2;
/** the grip, in mount space: the cable runs through (0, CABLE_H, z) */
const GRIP_Z = 0.5;
export const SEAT = new THREE.Vector3(0.3, 1.6, 0.25);

/** The car's frame at a z: the slope the world gives the vehicle and the car (see AndersonWorld). */
function pitchAt(road: Road, z: number) {
  const t = road.curve.getTangentAt(road.u(z));
  const flat = Math.hypot(t.x, t.z);
  const a = Math.atan2(t.y * 0.35, flat);
  const extra = Math.atan2(t.y, flat) - a;
  return a + extra * TILT;
}

/** The world point the rider's grip passes through at a z on the path (before the cable lets go). */
export function gripPoint(road: Road, z: number, out = new THREE.Vector3()) {
  const b = pitchAt(road, z);
  const p = road.at(z);
  // up and forward of the car, for a ride along -z
  return out.set(p.x, p.y + CABLE_H * Math.cos(b) + GRIP_Z * Math.sin(b), p.z + CABLE_H * Math.sin(b) - GRIP_Z * Math.cos(b));
}

export interface CableLine {
  group: THREE.Group;
  main: THREE.CatmullRomCurve3;
  ret: THREE.CatmullRomCurve3;
  /** the cable's height above a z, for the line out over the bay */
  update(dt: number, t: number, ride: RideState): void;
}

const mats = new Map<string, THREE.Material>();
const M = (key: string, make: () => THREE.Material) => { let m = mats.get(key); if (!m) { m = make(); mats.set(key, m); } return m; };

export function carMaterials() {
  return {
    side: M('side', () => texMat(gondolaSide('7号'))),
    inner: M('inner', () => { const t = rustIron(0x7a4632, 211, 0.9).clone(); t.needsUpdate = true; t.repeat.set(1.5, 0.6); return texMat(t); }),
    plate: M('plate', () => texMat(rustIron(0x6a3e2c, 213, 1))),
    steel: M('steel', () => texMat(rustIron(0x3e4442, 215, 0.45))),
    hazard: M('hazard', () => texMat(hazard())),
    cube: M('cube', () => new THREE.MeshLambertMaterial({ map: baleAtlas(), color: 0xc8a070 })),
    strap: M('strap', () => toon(0x2a2a28)),
  };
}

/** A bale of trash as a plain textured box (it moves, so it cannot use the world-space bale shader). */
function baleBox(s: number, tile: number) {
  const g = new THREE.BoxGeometry(s, s, s);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let f = 0; f < 6; f++) {
    const k = (tile + f) % 8, tx = k % 4, ty = Math.floor(k / 4);
    for (let i = 0; i < 4; i++) { const j = f * 4 + i; uv.setXY(j, (tx + 0.02 + uv.getX(j) * 0.96) / 4, (ty + 0.02 + uv.getY(j) * 0.96) / 2); }
  }
  return g;
}

/**
 * The car (no grip): walls with the stencilled sides, the floor, a bale of trash, the yoke. `detail` adds the
 * inside walls, ribs and loose rubbish (the rider's own car).
 */
function buildCar(detail: boolean) {
  const g = new THREE.Group();
  const m = carMaterials();
  const X = 1.6, ZB = -1.6, ZF = 2.4, H = 0.98, L = ZF - ZB, zc = (ZF + ZB) / 2;
  // outer sides: stencilled panels
  for (const s of [-1, 1]) {
    const p = mesh(new THREE.PlaneGeometry(L, H), m.side, s * (X + 0.035), H / 2, zc);
    p.rotation.y = s * Math.PI / 2;
    g.add(p);
  }
  // front and back outer faces: plates with a hazard band at the top
  for (const [z, ry] of [[ZF + 0.035, 0], [ZB - 0.035, Math.PI]] as const) {
    const p = mesh(repeatUV(new THREE.PlaneGeometry(X * 2, H - 0.28), 1.6, 0.5), m.plate, 0, (H - 0.28) / 2, z);
    p.rotation.y = ry; g.add(p);
    const hz = mesh(repeatUV(new THREE.PlaneGeometry(X * 2, 0.28), 3.2, 1), m.hazard, 0, H - 0.14, z);
    hz.rotation.y = ry; g.add(hz);
  }
  // the hull under the floor, tapering a little
  const hull = new THREE.CylinderGeometry(1, 1, 1, 4, 1);
  hull.rotateY(Math.PI / 4);
  hull.scale(X * 2 * 0.7071 * 1.0, 0.5, L * 0.7071);
  const hp = hull.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < hp.count; i++) if (hp.getY(i) < 0) { hp.setX(i, hp.getX(i) * 0.86); hp.setZ(i, hp.getZ(i) * 0.9); }
  hull.computeVertexNormals();
  g.add(mesh(hull, m.plate, 0, -0.25, zc));
  // rims: a rounded steel lip all round the top
  const lip = (a: THREE.Vector3, b: THREE.Vector3) => {
    const d = b.clone().sub(a);
    const c = mesh(new THREE.CylinderGeometry(0.065, 0.065, d.length() + 0.13, 8), m.steel);
    c.position.copy(a).addScaledVector(d, 0.5);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.add(c);
  };
  const corners = [new THREE.Vector3(X, H, ZB), new THREE.Vector3(X, H, ZF), new THREE.Vector3(-X, H, ZF), new THREE.Vector3(-X, H, ZB)];
  for (let i = 0; i < 4; i++) lip(corners[i], corners[(i + 1) % 4]);
  // corner posts and ribs
  for (const [x, z] of [[X, ZB], [X, ZF], [-X, ZF], [-X, ZB]]) g.add(box(0.12, H + 0.1, 0.12, m.steel, x, (H - 0.1) / 2, z));
  for (const s of [-1, 1]) for (let z = ZB + 0.8; z < ZF - 0.3; z += 0.8) g.add(box(0.05, H - 0.2, 0.07, m.steel, s * (X + 0.06), H / 2 - 0.05, z));
  // the yoke: two arms from brackets on the sides, curving in over the car to the grip's stem
  const yokePts = (s: number) => [new THREE.Vector3(s * (X + 0.1), 0.35, GRIP_Z), new THREE.Vector3(s * (X + 0.1), 2.9, GRIP_Z), new THREE.Vector3(s * (X - 0.1), 3.85, GRIP_Z), new THREE.Vector3(s * 0.85 + 0.3 * (1 - Math.abs(s)) + (s < 0 ? 0.2 : 0.1), 4.45, GRIP_Z), new THREE.Vector3(0.3, 4.62, GRIP_Z)];
  for (const s of [-1, 1]) g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(yokePts(s)), 18, 0.075, 7), m.steel));
  g.add(cyl(0.08, 0.08, 0.5, m.steel, 0.3, 4.85, GRIP_Z, 8));
  for (const s of [-1, 1]) g.add(box(0.1, 0.5, 0.36, m.steel, s * (X + 0.1), 0.6, GRIP_Z));
  // a bale of trash, strapped
  const cube = mesh(baleBox(1.2, 3), m.cube, -0.86, 0.6, 0.9);
  cube.rotation.y = 0.12;
  g.add(cube);
  for (const y of [0.34, 0.86]) { const st = box(1.24, 0.05, 1.24, m.strap, -0.86, y, 0.9); st.rotation.y = 0.12; g.add(st); }
  if (detail) {
    // inside: rusty walls and floor (the rider sees these), with a sign on the front wall
    for (const s of [-1, 1]) {
      const p = mesh(new THREE.PlaneGeometry(L, H), m.inner, s * (X - 0.035), H / 2, zc);
      p.rotation.y = -s * Math.PI / 2; g.add(p);
    }
    for (const [z, ry] of [[ZF - 0.035, Math.PI], [ZB + 0.035, 0]] as const) {
      const p = mesh(new THREE.PlaneGeometry(X * 2, H), m.inner, 0, H / 2, z);
      p.rotation.y = ry; g.add(p);
    }
    const fl = mesh(repeatUV(new THREE.PlaneGeometry(X * 2, L), 1.6, 2), m.plate, 0, 0.01, zc);
    fl.rotation.x = -Math.PI / 2; g.add(fl);
    // inside ribs and a cross-brace on the floor
    for (const s of [-1, 1]) for (let z = ZB + 0.8; z < ZF - 0.3; z += 0.8) g.add(box(0.06, H - 0.1, 0.06, m.steel, s * (X - 0.07), H / 2, z));
    for (let z = ZB + 0.6; z < ZF; z += 0.9) g.add(box(X * 2 - 0.1, 0.04, 0.08, m.steel, 0, 0.03, z));
    const sign = new THREE.Group();
    sign.add(box(0.94, 0.5, 0.03, toon(0xe8e0cc), 0, 0, 0));
    const face = mesh(new THREE.PlaneGeometry(0.88, 0.44), new THREE.MeshLambertMaterial({ map: jpSign('乗車禁止', 'NO PASSENGERS', { w: 256, h: 128, bg: '#f0e8d6', fg: '#b8302a' }) }), 0, 0, 0.017);
    sign.add(face);
    sign.scale.setScalar(0.62); sign.position.set(-0.95, 0.56, ZF - 0.07); sign.rotation.y = Math.PI;
    g.add(sign);
    // loose rubbish on the floor: a crushed can, a sake bottle, a scrap of newspaper
    const can = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10), toon(0xb8342c), 0.9, 0.06, 1.7); can.rotation.z = 1.4; can.scale.set(1, 1, 0.6); g.add(can);
    const bottle = new THREE.Group();
    bottle.add(cyl(0.09, 0.1, 0.36, toon(0x5a6a3a), 0, 0, 0, 10), cyl(0.035, 0.07, 0.16, toon(0x5a6a3a), 0, 0.25, 0, 8));
    bottle.position.set(0.95, 0.1, -1.1); bottle.rotation.set(0, 0.6, Math.PI / 2); g.add(bottle);
    const paper = mesh(new THREE.PlaneGeometry(0.5, 0.36), new THREE.MeshLambertMaterial({ map: newsprint(), side: THREE.DoubleSide }), 0.6, 0.025, -0.6);
    paper.rotation.set(-Math.PI / 2, 0, 0.5); g.add(paper);
  }
  return g;
}

let paperTex: THREE.Texture | null = null;
function newsprint() {
  return paperTex ??= canvasTexture(128, 96, (c) => {
    c.fillStyle = '#e6dfcc'; c.fillRect(0, 0, 128, 96);
    c.fillStyle = '#2a2622'; c.font = 'bold 20px IPAGothic, sans-serif'; c.fillText('犬インフルエンザ', 6, 24);
    c.fillStyle = 'rgba(40,36,30,0.55)';
    for (let y = 34; y < 92; y += 6) c.fillRect(6, y, 50 + ((y * 7) % 60), 2.5);
  });
}

/** The grip on the cable: a housing beside the cable, a jaw over its top, two little wheels. */
function buildGrip() {
  const g = new THREE.Group();
  const m = carMaterials();
  g.add(box(0.42, 0.5, 0.9, m.steel, 0.33, CABLE_H - 0.08, GRIP_Z));
  g.add(box(0.66, 0.08, 0.9, m.steel, 0.21, CABLE_H + 0.1, GRIP_Z));
  for (const dz of [-0.32, 0.32]) {
    const w = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12), m.strap, 0.4, CABLE_H + 0.26, GRIP_Z + dz);
    w.rotation.z = Math.PI / 2; g.add(w);
  }
  g.add(box(0.3, 0.12, 0.8, m.hazard, 0.33, CABLE_H - 0.36, GRIP_Z));
  return g;
}

export interface Gondola {
  def: MountDef;
  /** the car's lean on the cable (set by the scene: pylon jolts) */
  kick(pitch: number, roll: number): void;
}

/**
 * The rider's car as a mount. It swings a little on its yoke (an inner group pivoting at the grip, with the
 * camera carried along through `ctx.shot`), jolts over each pylon's sheaves, and when the grip lets go it
 * pitches nose-down as it falls.
 */
export function buildGondolaMount(ctx: SetContext, z0: number, z1: number): Gondola {
  const group = new THREE.Group();
  const pivot = new THREE.Vector3(0, CABLE_H, GRIP_Z);
  // the swing: a group placed at the grip, with the car hung below it
  const swing = new THREE.Group();
  swing.position.copy(pivot);
  group.add(swing);
  const car = buildCar(true);
  car.position.copy(pivot).negate();
  car.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; mm.receiveShadow = true; } });
  mergeStatic(car);
  swing.add(car);
  const grip = buildGrip();
  grip.position.copy(pivot).negate();
  mergeStatic(grip);
  swing.add(grip);

  const roll = new Spring(0, 0.32, 0.12), pitch = new Spring(0, 0.38, 0.14);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), base = new THREE.Vector3();
  const def: MountDef = {
    kind: 'gondola', group, seat: SEAT.clone(), z0, z1, tilt: TILT, bank: 0,
    update(dt, t, ride) {
      const z = ride.position.z;
      // a breeze keeps it rocking gently; the springs carry the jolts
      const r = roll.update(Math.sin(t * 0.61) * 0.018 + Math.sin(t * 1.37) * 0.006, dt);
      let p = pitch.update(Math.sin(t * 0.47 + 1) * 0.012, dt);
      // the fall: nose down as it drops
      const fall = smoothstep(ZSNAP, ZSNAP - 22, z);
      p += fall * 0.42;
      e.set(p, 0, r, 'XYZ');
      swing.quaternion.setFromEuler(e);
      // carry the camera with the car: where the seat goes, and the car's lean
      q.copy(swing.quaternion);
      v.copy(SEAT).sub(pivot).applyQuaternion(q).add(pivot).sub(SEAT);
      if (group.quaternion) v.applyQuaternion(group.quaternion);
      ctx.shot.offset.add(v);
      // the camera anchor is turned to face forward, so the car's roll and pitch carry over with flipped signs
      ctx.shot.roll += r * 0.85;
      ctx.shot.pitch += -p * 0.55 - fall * 0.32;
      void base;
    },
  };
  return {
    def,
    kick(pp, rr) { pitch.v += pp; roll.v += rr; },
  };
}

/** Sample a cable along the path from z0 down to the grip's last point, then straight on across the bay. */
function cableCurve(road: Road, dx: number, zEnd: number, endY: number) {
  const pts: THREE.Vector3[] = [];
  // into the loading station, round the bull wheel's rim
  for (let z = -1790; z > ZSNAP; z -= 4) pts.push(gripPoint(road, z).add(new THREE.Vector3(dx, 0, 0)));
  const last = gripPoint(road, ZSNAP).add(new THREE.Vector3(dx, 0, 0));
  pts.push(last.clone());
  // from the island's edge the line runs on, rising gently, to the pylons in the bay and away to the city
  const far = new THREE.Vector3(dx, endY, zEnd);
  for (let k = 1; k <= 12; k++) pts.push(last.clone().lerp(far, k / 12));
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  c.arcLengthDivisions = 3000;
  return c;
}

export function buildCableLine(road: Road, groundAt: (x: number, z: number) => number, lowDetail: boolean): CableLine & { ahead: THREE.Group; retCars: ReturnCars } {
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const snapY = gripPoint(road, ZSNAP).y;
  const main = cableCurve(road, 0, -2560, snapY + 10);
  const ret = cableCurve(road, RETURN_X, -2560, snapY + 10);
  const cableMat = M('cable', () => toon(0x2a2826));
  for (const c of [main, ret]) {
    const n = Math.round(c.getLength() / 1.2);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(c, n, 0.05, 5, false), cableMat);
    tube.castShadow = true;
    tube.userData.keep = true;
    group.add(tube);
  }

  // ---- pylons: a tapered lattice column between the cables, a crossarm, sheave trains under each cable ----
  const latMat = M('lattice', () => new THREE.MeshLambertMaterial({ map: lattice(0x7a4a34), alphaTest: 0.5, side: THREE.DoubleSide }));
  const steel = carMaterials().steel;
  const paint = M('pylonPaint', () => texMat(rustIron(0x9a4632, 231, 0.7)));
  const pylon = (pz: number, inSea: boolean) => {
    const gp = gripPoint(road, Math.max(pz, ZSNAP)).clone();
    let cy = gp.y;
    if (pz < ZSNAP) cy = main.getPointAt(nearestU(main, pz)).y;
    const footY = inSea ? SEA - 4 : groundAt(PYLON_X, pz);
    const topY = cy + 1.4;
    const h = topY - footY;
    const g = new THREE.Group();
    // four lattice faces of a tapered column (a frustum, open at the ends)
    const wb = inSea ? 4.2 : Math.min(4.4, 2.2 + h * 0.08), wt = 1.3;
    const col = new THREE.CylinderGeometry(wt * 0.7071, wb * 0.7071, h, 4, 1, true);
    col.rotateY(Math.PI / 4);
    repeatUV(col, 4, h / 2.6);
    g.add(mesh(col, latMat, PYLON_X, footY + h / 2, pz));
    // corner legs
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const a = new THREE.Vector3(PYLON_X + sx * wb / 2, footY, pz + sz * wb / 2), b = new THREE.Vector3(PYLON_X + sx * wt / 2, topY, pz + sz * wt / 2);
      const d = b.clone().sub(a);
      const leg = mesh(new THREE.CylinderGeometry(0.1, 0.13, d.length(), 6), paint);
      leg.position.copy(a).addScaledVector(d, 0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      g.add(leg);
    }
    // crossarm, a cap, and the sheave trains
    g.add(box(RETURN_X + 3.2, 0.45, 0.7, paint, RETURN_X / 2, topY + 0.2, pz));
    g.add(box(1.8, 0.6, 1.8, paint, PYLON_X, topY + 0.65, pz));
    for (const x of [0, RETURN_X]) {
      // a hanger on the column's side of the cable, down to a beam under the cable with four wheels
      const hx = x + (x === 0 ? 0.42 : -0.42);
      g.add(box(0.16, 1.25, 0.16, steel, hx, topY - 0.5, pz));
      g.add(box(0.2, 0.18, 3.6, steel, x, cy - 0.19, pz));
      g.add(box(0.6, 0.12, 0.2, steel, (x + hx) / 2, cy - 0.12, pz));
      for (let k = 0; k < 4; k++) { const w = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 10), cableMat, x, cy - 0.12, pz - 1.35 + k * 0.9); w.rotation.z = Math.PI / 2; g.add(w); }
    }
    // a number plate and a red warning lamp on top
    const plate = jpSign(`${['一', '二', '三', '四', '五', '六'][PYLONS.concat(SEA_PYLONS).indexOf(pz)] ?? '七'}号塔`, '', { w: 256, h: 128, bg: '#efe6d2', fg: '#b8302a' });
    for (const s of [-1, 1]) {
      const pl = mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshLambertMaterial({ map: plate }), PYLON_X, topY - 1.2, pz + s * (wt / 2 + 0.06));
      if (s < 0) pl.rotation.y = Math.PI;
      g.add(pl);
    }
    g.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), M('lamp', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a30).multiplyScalar(1.4) })), PYLON_X, topY + 1.1, pz));
    if (inSea) {
      // a concrete footing in the water, streaked
      g.add(mesh(new THREE.CylinderGeometry(3.4, 3.8, 6, 12), M('concrete', () => texMat(rustIron(0xa8a294, 241, 0.25))), PYLON_X, SEA - 1.5, pz));
    }
    g.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = mm.material !== latMat; mm.receiveShadow = true; } });
    statics.add(g);
  };
  for (const pz of PYLONS) pylon(pz, false);
  for (const pz of SEA_PYLONS) pylon(pz, true);
  void corrugated;

  // ---- the cars: one going out ahead of the rider, and loaded ones coming back on the return line ----
  const ahead = buildCar(false);
  ahead.add(buildGrip());
  mergeStatic(ahead);
  ahead.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) mm.castShadow = true; });
  group.add(ahead);
  const retCars = new ReturnCars(ret, lowDetail ? 5 : 8);
  group.add(retCars.group);

  statics.updateMatrixWorld(true);
  mergeStatic(statics);

  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  let aheadS = -1;
  const mainLen = main.getLength();
  return {
    group, main, ret, ahead, retCars,
    update(dt, t, ride) {
      // the car ahead keeps its distance along the cable
      const z = ride.position.z;
      const u = nearestU(main, Math.max(z, ZSNAP + 6));
      const target = u * mainLen + 34 + Math.max(0, (ZSNAP + 6 - z)) * 1.4;
      aheadS = aheadS < 0 ? target : aheadS + (target - aheadS) * clamp(dt * 3, 0, 1);
      const ua = clamp(aheadS / mainLen, 0, 1);
      main.getPointAt(ua, tmp);
      main.getTangentAt(ua, tan);
      ahead.position.set(tmp.x, tmp.y - CABLE_H, tmp.z + GRIP_Z);
      ahead.rotation.set(Math.sin(t * 0.7) * 0.02, Math.PI, Math.sin(t * 0.53 + 2) * 0.025);
      retCars.update(dt, t);
    },
  };
}

/** the curve parameter whose point has this z (the cables run straight down -z, so z decides it) */
function nearestU(c: THREE.CatmullRomCurve3, z: number) {
  let lo = 0, hi = 1;
  const p = new THREE.Vector3();
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; c.getPointAt(m, p); if (p.z > z) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/**
 * Loaded cars on the return line, coming back from the bay to the loading station: instanced (one draw call
 * per material for all of them), moving along the cable and swinging a little.
 */
export class ReturnCars {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private curve: THREE.CatmullRomCurve3;
  private len: number;
  private n: number;
  private s = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);

  constructor(curve: THREE.CatmullRomCurve3, n: number) {
    this.curve = curve; this.n = n;
    this.len = curve.getLength();
    const car = buildCar(false);
    car.add(buildGrip());
    car.updateMatrixWorld(true);
    // merge the car into one geometry per material
    const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
    car.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (!mm.isMesh) return;
      const geo = (mm.geometry.index ? mm.geometry.toNonIndexed() : mm.geometry.clone()).applyMatrix4(mm.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
      const mat = mm.material as THREE.Material;
      if (!by.has(mat)) by.set(mat, []);
      by.get(mat)!.push(geo);
    });
    for (const [mat, geos] of by) {
      const im = new THREE.InstancedMesh(mergeGeometries(geos, false)!, mat, n);
      im.castShadow = true; im.receiveShadow = true;
      im.frustumCulled = false;
      this.meshes.push(im);
      this.group.add(im);
    }
  }

  update(dt: number, t: number) {
    // they come towards the station (+z) at a steady crawl
    this.s = (this.s + dt * 3.2) % this.len;
    for (let i = 0; i < this.n; i++) {
      const s = ((this.len - ((this.s + (i / this.n) * this.len) % this.len)) + this.len) % this.len;
      const u = s / this.len;
      this.curve.getPointAt(u, this.p);
      this.p.y -= CABLE_H;
      this.e.set(Math.sin(t * 0.6 + i * 1.7) * 0.02, 0, Math.sin(t * 0.8 + i) * 0.025);
      this.q.setFromEuler(this.e);
      this.m4.compose(this.p, this.q, this.one);
      for (const im of this.meshes) im.setMatrixAt(i, this.m4);
    }
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }
}
