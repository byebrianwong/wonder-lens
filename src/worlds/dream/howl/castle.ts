import * as THREE from 'three';
import { mergeStatic, mesh } from '../../../engine/Builders';
import { charToon, boxUV, repeatUV } from '../../../engine/Paint';
import { Spring, limbGeometry, outline, taperedTube, envelope } from '../../../engine/Rig';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { metalPlates } from '../../ghibli/characterTextures';
import { slate, deckPlanks } from '../../ghibli/propTextures';
import { brick, clayTiles, doorBoards, legScales, timberWall } from './paint';
import type { Smoke } from './smoke';

/*
 * Howl's moving castle, the hero of the meadow: a ramshackle heap of iron-plated hull, timber houses, round
 * towers, chimneys and cannons on four big bird legs. Its front is a face: two round windows for eyes, a stubby
 * pipe for a nose, the front door for a mouth, a jutting iron lip, and a plank tongue under the door that
 * unfolds into a ramp.
 *
 * Its own space: the origin is on the ground under the middle of the body when it sits down, +z is the front.
 * Sitting, the door sill is at y 5.85 and z 17.6, and the hull wraps a box x -5.7..5.7, y 5.9..14.1, z -16.3..16.4
 * where the room inside it lives (the room is built separately, see room.ts). Standing to walk, the body rises
 * by `lift` (about 7) on its legs.
 */

/** How the set drives the castle each frame (all of it keyed to the rider's position). */
export interface CastleDrive {
  /** where the root stands on the ground plane, and which way it faces */
  x: number; z: number; yaw: number;
  /** extra height of the body above its sitting pose */
  lift: number;
  /** 0..1: how much the legs step (0 when standing still or sitting) */
  walk: number;
  /** distance walked so far: sets the stepping phase, so the feet stay planted */
  gait: number;
  /** 0..1: feet drawn in under the body for sitting */
  crouch: number;
  /** 0..1 for each of the three tongue planks: the top one tips down, the other two slide out of it */
  tongue: [number, number, number];
  /** 0..1: how big a hop may be (kept small while the rider is at the door) */
  hopScale: number;
}

export interface HowlCastle {
  group: THREE.Group;
  /** the body (everything above the legs); the photo subject centres on it */
  body: THREE.Group;
  drive: CastleDrive;
  /** the closed outer door shown in the doorway while the room inside is not drawn */
  blocker: THREE.Object3D;
  /** a cheap box round the hull, for photo line-of-sight checks */
  proxy: THREE.Mesh;
  /** called when a foot comes down: world position of the foot */
  onStep: ((p: THREE.Vector3) => void) | null;
  update(dt: number, t: number, ground: (x: number, z: number) => number): void;
  /** the ocarina: smoke from every chimney and a little hop */
  hop(): void;
  /** an acorn: one of the cannons sneezes a puff of smoke */
  sneeze(): void;
}

/** Local z where the door sill (the tongue's hinge) is, and the three tongue planks' z ranges. */
export const CASTLE_FRONT = 17.6;

const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);

/** A box given by its extents, with world-unit UVs. */
function bx(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, uv = 6) {
  return mesh(boxUV(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), uv), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
/** An upright cylinder with world-unit UVs. */
function cy(rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 14, uv = 6) {
  return mesh(repeatUV(new THREE.CylinderGeometry(rt, rb, h, seg), Math.max(1, Math.round((TAU * rb) / uv)), h / uv), mat, x, y, z);
}
/** A cylinder lying along x or z. */
function lying(r: number, len: number, mat: THREE.Material, x: number, y: number, z: number, axis: 'x' | 'z', seg = 14) {
  const m = cy(r, r, len, mat, x, y, z, seg);
  if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
  return m;
}
/** Scale a geometry's UVs (shape and extrude geometries use raw units). */
function scaleUV(geo: THREE.BufferGeometry, s: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  return geo;
}
/** A pitched roof with its ridge along z: two slabs and the two gable triangles. */
function gableRoof(w: number, d: number, rise: number, roof: THREE.Material, wall: THREE.Material) {
  const g = new THREE.Group();
  const half = w / 2 + 0.6, len = Math.hypot(half, rise) + 0.2, ang = Math.atan2(rise, half);
  for (const s of [-1, 1]) {
    const slab = mesh(boxUV(new THREE.BoxGeometry(len, 0.3, d + 1.2), 3), roof, (s * half) / 2, rise / 2, 0);
    slab.rotation.z = -s * ang;
    g.add(slab);
  }
  const tri = new THREE.Shape(); tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, rise * (w / 2) / half); tri.closePath();
  const geo = scaleUV(new THREE.ShapeGeometry(tri), 1 / 4);
  for (const s of [-1, 1]) { const m = mesh(geo, wall, 0, 0, s * d / 2); if (s < 0) m.rotation.y = Math.PI; g.add(m); }
  return g;
}

/**
 * One plank of the tongue: a board with raised edge rails, swept along a centre line (points in the castle's
 * space, running away from the door), with end caps. The walking surface is the centre line itself.
 */
function plank(line: THREE.Vector3[], mat: THREE.Material, rail: THREE.Material) {
  // cross-section (x across, h along the up-normal): a deck with a lip on both sides
  const deck: Array<[number, number]> = [[-2.4, 0], [2.4, 0], [2.4, -0.38], [-2.4, -0.38]];
  const lip: Array<[number, number]> = [[-2.75, 0.32], [-2.4, 0.32], [-2.4, -0.38], [-2.75, -0.38]];
  const lipR: Array<[number, number]> = lip.map(([x, h]) => [-x, h] as [number, number]).reverse() as Array<[number, number]>;
  const sweep = (sec: Array<[number, number]>) => {
    const pos: number[] = [], uv: number[] = [];
    const frames = line.map((p, i) => {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
      const t = b.clone().sub(a).normalize();
      const n = new THREE.Vector3(0, t.z, -t.y);
      if (n.y < 0) n.negate();
      return { p, n };
    });
    let along = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const A = frames[i], B = frames[i + 1];
      const seg = A.p.distanceTo(B.p);
      for (let k = 0; k < sec.length; k++) {
        const [x0, h0] = sec[k], [x1, h1] = sec[(k + 1) % sec.length];
        const q = (f: typeof A, x: number, h: number) => f.p.clone().add(new THREE.Vector3(x, 0, 0)).addScaledVector(f.n, h);
        const a0 = q(A, x0, h0), a1 = q(A, x1, h1), b0 = q(B, x0, h0), b1 = q(B, x1, h1);
        for (const v of [a0, b0, b1, a0, b1, a1]) pos.push(v.x, v.y, v.z);
        const u0 = (x0 + h0) / 2, u1 = (x1 + h1) / 2;
        uv.push(u0, along / 2, u0, (along + seg) / 2, u1, (along + seg) / 2, u0, along / 2, u1, (along + seg) / 2, u1, along / 2);
      }
      along += seg;
    }
    // end caps
    for (const [f, flip] of [[frames[0], true], [frames[frames.length - 1], false]] as const) {
      const ring = sec.map(([x, h]) => f.p.clone().add(new THREE.Vector3(x, 0, 0)).addScaledVector(f.n, h));
      for (let k = 1; k < ring.length - 1; k++) {
        const tri = flip ? [ring[0], ring[k], ring[k + 1]] : [ring[0], ring[k + 1], ring[k]];
        for (const v of tri) { pos.push(v.x, v.y, v.z); uv.push(v.x / 2, v.y / 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const g = new THREE.Group();
  const d = new THREE.Mesh(sweep(deck), mat);
  g.add(d, new THREE.Mesh(sweep(lip), rail), new THREE.Mesh(sweep(lipR), rail));
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

/** A bird's foot: a pad, three long front toes and a short back toe, with dark hooked claws. */
function footGroup(skin: THREE.Material, claw: THREE.Material) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skin);
  pad.scale.set(1.05, 0.6, 1.25); pad.position.set(0, -0.35, 0.3);
  g.add(pad);
  const toe = (a: number, L: number, r: number, back = false) => {
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a) * (back ? -1 : 1));
    const p0 = new THREE.Vector3(0, -0.45, back ? -0.2 : 0.6);
    const p2 = p0.clone().addScaledVector(dir, L).setY(-0.78);
    const p1 = p0.clone().lerp(p2, 0.45).add(new THREE.Vector3(0, 0.45, 0));
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    g.add(new THREE.Mesh(taperedTube(curve, r, r * 0.4, 10, 8), skin));
    const c = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, r * 2.2, 8), claw);
    c.position.copy(p2).addScaledVector(dir, r * 0.7).add(new THREE.Vector3(0, -0.05, 0));
    c.quaternion.setFromUnitVectors(UP, dir.clone().add(new THREE.Vector3(0, -0.6, 0)).normalize());
    g.add(c);
  };
  toe(-0.55, 3.0, 0.42); toe(0, 3.7, 0.46); toe(0.55, 3.0, 0.42); toe(0, 1.9, 0.34, true);
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
  mergeStatic(g);
  return g;
}

/**
 * Build the castle. `profile(z)` gives the height of the ride's path at a local z in front of the door when the
 * castle sits in its final place, so the unfolded tongue lies exactly under the Catbus's paws.
 */
export function makeHowlCastle(o: { profile: (zLocal: number) => number; smoke: Smoke; rng: Rng }): HowlCastle {
  const { smoke, rng } = o;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const base = new THREE.Group(), top = new THREE.Group(), topIn = new THREE.Group();
  body.add(base, top);
  top.position.set(0, 15.4, -2);
  topIn.position.set(0, -15.4, 2);
  top.add(topIn);

  // ---------- materials (shared by look-alike parts so they merge) ----------
  const iron = charToon({ map: metalPlates(0x5c5e6a, 0x8a5a3a, 1201), rim: 0.3 });
  const rust = charToon({ map: metalPlates(0x7e5c48, 0xa86a3a, 1203), rim: 0.3 });
  const legIron = charToon({ map: metalPlates(0x4a4c58, 0x7a5a40, 1205), rim: 0.35 });
  const wallLit = timberWall({ wall: 0xe8d8b4, beam: 0x5a3a26, shutter: 0x3a6a5a, lit: true, seed: 1207 });
  const wallDark = timberWall({ wall: 0xd8c8a8, beam: 0x4a3222, shutter: 0x8a3a2a, lit: false, seed: 1209 });
  const timberL = charToon({ map: wallLit.map, emissive: 0xffc070, emissiveMap: wallLit.glow, emissiveIntensity: 1.3, rim: 0.25 });
  const timberD = charToon({ map: wallDark.map, rim: 0.25 });
  const roofRed = charToon({ map: clayTiles(0xb05a3c, 1211), rim: 0.25 });
  const roofSlate = charToon({ map: slate(0x5a6a7c), rim: 0.25 });
  const brickM = charToon({ map: brick(0x9a5a40, 1213), rim: 0.2 });
  const brass = charToon({ color: 0xd0a040, emissive: new THREE.Color(0x2a1a04), rim: 0.6 });
  const wood = charToon({ map: deckPlanks(0x7a5a3a), rim: 0.2 });
  const dark = charToon({ color: 0x1e1a1c, rim: 0.1 });
  const winGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc870).multiplyScalar(1.5) });
  const scales = charToon({ map: legScales(0xb8a070, 1215), rim: 0.35 });
  const claw = charToon({ color: 0x2a2420, rim: 0.4 });
  const cloth = [0xe8e0d0, 0xc84a3a, 0x4a7aa8, 0xe8c050].map((c) => charToon({ color: c, rim: 0.2, side: THREE.DoubleSide }));

  // ---------- the hull: an iron box with a rounded belly round the room ----------
  const B = base;
  B.add(bx(-7.6, -5.7, 4.6, 15.2, -18, 16.6, iron), bx(5.7, 7.6, 4.6, 15.2, -18, 16.6, iron));
  B.add(bx(-7.9, 7.9, 14.1, 15.4, -18.3, 16.6, rust), bx(-7.6, 7.6, 4.4, 5.85, -18, 16.6, iron));
  B.add(bx(-7.6, 7.6, 4.6, 15.2, -19, -16.3, rust));
  {
    const belly = mesh(new THREE.CylinderGeometry(1, 1, 33, 18, 1, false, -Math.PI / 2, Math.PI), rust, 0, 4.6, -0.7);
    repeatUV(belly.geometry, 4, 5);
    belly.rotation.x = Math.PI / 2; belly.scale.set(5.6, 1, 2.4);
    B.add(belly);
  }
  // iron bands round the hull (three strips each, so they never cross the room inside)
  for (const z of [-14, -8, -2, 4, 10]) {
    B.add(bx(-7.9, -7.5, 4.2, 15.6, z - 0.3, z + 0.3, rust), bx(7.5, 7.9, 4.2, 15.6, z - 0.3, z + 0.3, rust), bx(-7.9, 7.9, 15.3, 15.65, z - 0.3, z + 0.3, rust));
  }
  // the face plate, with the arched door cut out of it
  {
    const s = new THREE.Shape();
    s.moveTo(-8.3, 3.9); s.lineTo(8.3, 3.9); s.lineTo(8.6, 12); s.lineTo(7.8, 16.4); s.lineTo(-7.8, 16.4); s.lineTo(-8.6, 12); s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-3.1, 5.6); hole.lineTo(3.1, 5.6); hole.lineTo(3.1, 11.6);
    hole.absellipse(0, 11.6, 3.1, 1.5, 0, Math.PI, false, 0);
    hole.lineTo(-3.1, 5.6);
    s.holes.push(hole);
    const geo = scaleUV(new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 1, curveSegments: 16 }), 1 / 6);
    B.add(mesh(geo, rust, 0, 0, 16.4));
  }
  // corner towers framing the face
  for (const s of [-1, 1]) {
    B.add(cy(1.7, 1.8, 11.5, iron, s * 8.0, 10.2, 15.0));
    const cap = mesh(repeatUV(new THREE.ConeGeometry(2.2, 2.6, 14), 2, 1), roofSlate, s * 8.0, 17.2, 15.0); B.add(cap);
    B.add(cy(0.12, 0.12, 1.4, brass, s * 8.0, 19.0, 15.0, 6));
  }
  // the jutting iron lip under the door, studded with brass bolts
  B.add(bx(-4.6, 4.6, 3.6, 5.0, 15.8, 19.0, iron));
  for (let i = 0; i < 7; i++) B.add(lying(0.22, 0.4, brass, -3.6 + i * 1.2, 4.4, 19.1, 'z', 8));
  // eyes: round windows in brass rims, a cross bar each, with an iron brow over them
  const lids: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const ex = s * 4.7, ey = 14.0, ez = 17.75;
    B.add(mesh(new THREE.TorusGeometry(1.32, 0.24, 8, 24), brass, ex, ey, ez));
    B.add(mesh(new THREE.CircleGeometry(1.2, 24), winGlow, ex, ey, ez - 0.12));
    B.add(bx(ex - 0.06, ex + 0.06, ey - 1.2, ey + 1.2, ez - 0.1, ez + 0.05, dark), bx(ex - 1.2, ex + 1.2, ey - 0.06, ey + 0.06, ez - 0.1, ez + 0.05, dark));
    const brow = bx(-1.9, 1.9, -0.18, 0.18, -0.7, 0.7, iron); brow.position.set(ex, ey + 1.75, ez - 0.1); brow.rotation.z = -s * 0.22; B.add(brow);
    // an iron eyelid that hangs half shut and blinks now and then
    const lid = new THREE.Group();
    lid.position.set(ex, ey + 0.05, ez + 0.28);
    const lm = new THREE.Mesh(new THREE.CircleGeometry(1.45, 20, 0, Math.PI), iron);
    lm.material = iron; lid.add(lm);
    body.add(lid);
    lids.push(lid);
  }
  // nose: a stubby pipe between the eyes, and a lantern beside the door
  B.add(lying(0.55, 1.9, rust, 0, 13.3, 18.0, 'z', 12), lying(0.66, 0.3, brass, 0, 13.3, 19.0, 'z', 12));
  B.add(bx(-4.4, -4.25, 9.4, 11.0, 17.6, 18.4, dark), bx(-4.75, -3.9, 8.6, 9.5, 18.0, 18.9, winGlow), bx(-4.85, -3.8, 9.5, 9.7, 17.95, 18.95, dark));
  // hip housings for the legs
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) B.add(lying(1.75, 1.6, rust, sx * 7.0, 4.7, sz * 9, 'x'));
  // a little timber house hung on the left side, with a lean-to roof on brackets
  B.add(bx(-11.4, -7.6, 7.2, 12.8, 1.5, 9.5, timberL, 4));
  { const r = bx(-2.6, 2.6, -0.13, 0.13, -4.6, 4.6, roofRed, 3); r.position.set(-9.8, 13.7, 5.5); r.rotation.z = 0.4; B.add(r); }
  for (const z of [2.5, 8.5]) { const st = bx(-0.12, 0.12, -1.6, 1.6, -0.12, 0.12, wood); st.position.set(-9.5, 6.4, z); st.rotation.z = -0.8; B.add(st); }
  // a boiler drum along the left rear, banded, with its own pipe chimney
  B.add(lying(2.4, 8.5, rust, -9.6, 8.0, -11.5, 'z'));
  for (const z of [-15.2, -11.5, -7.8]) B.add(lying(2.55, 0.35, iron, -9.6, 8.0, z, 'z'));
  // a cannon turret on the right side, with a slate cap
  B.add(cy(2.4, 2.5, 6.5, iron, 9.8, 10.6, -3.5));
  B.add(mesh(repeatUV(new THREE.ConeGeometry(3.0, 2.4, 14), 3, 1), roofSlate, 9.8, 15.05, -3.5));
  // a timber house on the right front, and a balcony on the right rear
  B.add(bx(7.6, 10.6, 5.6, 10.8, 5, 12, timberD, 4));
  { const r = bx(-2.0, 2.0, -0.13, 0.13, -4.0, 4.0, roofSlate, 3); r.position.set(9.3, 11.5, 8.5); r.rotation.z = -0.45; B.add(r); }
  B.add(bx(7.6, 11.0, 12.6, 12.95, -16.5, -9, wood));
  for (let z = -16.2; z <= -9.2; z += 1.4) B.add(bx(10.8, 10.95, 12.95, 14.2, z - 0.06, z + 0.06, wood));
  B.add(bx(10.75, 11.0, 14.1, 14.3, -16.5, -9, wood));
  for (const z of [-15.5, -10]) { const st = bx(-0.12, 0.12, -1.8, 1.8, -0.12, 0.12, wood); st.position.set(9.6, 11.3, z); st.rotation.z = 0.75; B.add(st); }
  // a hatch and a ladder at the back
  B.add(bx(-2.2, 2.2, 5.5, 11.5, -19.35, -18.9, wood));
  for (const s of [-1, 1]) B.add(bx(s * 3.5 - 0.1, s * 3.5 + 0.1, 0.5, 14.5, -19.6, -19.35, wood));

  // ---------- the heap on top ----------
  const T = topIn;
  // the forehead house over the face, with a gable to the front
  T.add(bx(-6.6, 6.6, 15.4, 20.8, 8.5, 16.2, timberL, 4));
  { const r = gableRoof(13.2, 7.7, 4.4, roofRed, timberD); r.position.set(0, 20.8, 12.35); T.add(r); }
  // the round tower, its conical roof, a lantern turret and a flagpole
  T.add(cy(3.1, 3.4, 15, rust, -3.2, 22.9, -3.5, 18));
  for (const y of [18, 24, 29.6]) T.add(cy(3.45, 3.45, 0.4, iron, -3.2, y, -3.5, 18));
  for (let i = 0; i < 5; i++) { const a = -0.6 + i * 0.75; const w = mesh(new THREE.CircleGeometry(0.55, 14), winGlow, -3.2 + Math.sin(a) * 3.33, 26.6, -3.5 + Math.cos(a) * 3.33); w.rotation.y = a; T.add(w); }
  T.add(mesh(repeatUV(new THREE.ConeGeometry(4.0, 6.6, 18), 4, 2), roofSlate, -3.2, 33.7, -3.5));
  T.add(cy(1.0, 1.1, 2.6, iron, -3.2, 37.6, -3.5, 10));
  T.add(mesh(new THREE.SphereGeometry(1.15, 12, 8, 0, TAU, 0, Math.PI / 2), brass, -3.2, 38.9, -3.5));
  T.add(cy(0.09, 0.09, 4.5, dark, -3.2, 41.6, -3.5, 6));
  // the right house with a hipped slate roof
  T.add(bx(0.8, 7.4, 15.4, 22.6, -9, 2.5, timberD, 4));
  { const r = mesh(repeatUV(new THREE.ConeGeometry(1, 1, 4), 2, 1), roofSlate, 4.1, 24.6, -3.25); r.rotation.y = Math.PI / 4; r.scale.set(5.2, 4.0, 8.6); T.add(r); }
  // a lower house at the back left
  T.add(bx(-7.2, -1.0, 15.4, 19.6, -17.5, -9.5, timberL, 4));
  { const r = bx(-3.6, 3.6, -0.14, 0.14, -4.6, 4.6, roofRed, 3); r.position.set(-4.1, 20.4, -13.5); r.rotation.x = -0.28; T.add(r); }
  // a little balcony and door on the forehead house's left
  T.add(bx(-8.6, -6.6, 16.2, 16.5, 9.5, 14.5, wood));
  for (let z = 9.7; z <= 14.4; z += 1.2) T.add(bx(-8.6, -8.45, 16.5, 17.6, z - 0.06, z + 0.06, wood));
  // chimneys (their tops are where the smoke comes from)
  const chimneys: THREE.Object3D[] = [];
  const chimney = (parent: THREE.Group, x: number, y0: number, y1: number, z: number, mat: THREE.Material, r: number) => {
    parent.add(cy(r, r * 1.1, y1 - y0, mat, x, (y0 + y1) / 2, z, 10, 3));
    parent.add(cy(r * 1.35, r * 1.35, 0.5, mat === brickM ? brickM : iron, x, y1, z, 10, 3));
    const mk = new THREE.Object3D(); mk.position.set(x, y1 + 0.5, z); parent.add(mk); chimneys.push(mk);
  };
  chimney(T, -5.4, 19.8, 28.2, 10.4, brickM, 0.75);
  chimney(T, 5.6, 22.0, 31.5, -1.6, iron, 0.6);
  chimney(T, -0.4, 26.0, 33.8, -6.4, brickM, 0.7);
  chimney(T, 6.3, 23.0, 29.6, -8.2, iron, 0.5);
  chimney(T, -5.6, 19.0, 25.6, -15.0, brickM, 0.65);
  chimney(B, -9.6, 10.0, 18.6, -14.2, iron, 0.5);
  // a washing line from the tower to the forehead house, with things drying on it
  {
    const a = new THREE.Vector3(-3.2, 25.5, 0), b = new THREE.Vector3(-6.0, 21.6, 9.2);
    const line = taperedTube(new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.9, 0)), b), 0.04, 0.04, 8, 4);
    T.add(new THREE.Mesh(line, dark));
    for (let i = 0; i < 4; i++) {
      const k = 0.2 + i * 0.2, p = a.clone().lerp(b, k).add(new THREE.Vector3(0, -0.9 * 4 * k * (1 - k) - 0.6, 0));
      const c = mesh(new THREE.PlaneGeometry(rng.range(0.8, 1.3), rng.range(1.0, 1.5)), cloth[i], p.x, p.y, p.z);
      c.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
      T.add(c);
    }
  }

  // ---------- moving parts: cannons, a weathervane and a flag ----------
  const cannons: Array<{ g: THREE.Group; barrel: THREE.Group; dir: THREE.Vector3; muzzle: THREE.Object3D; kick: Spring }> = [];
  const cannon = (parent: THREE.Group, pos: THREE.Vector3, dir: THREE.Vector3, len: number, r: number) => {
    const g = new THREE.Group(); g.position.copy(pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    const barrel = new THREE.Group(); g.add(barrel);
    barrel.add(lying(r, len, iron, 0, 0, len / 2, 'z', 12), lying(r * 1.3, 0.5, brass, 0, 0, len, 'z', 12), lying(r * 1.25, 0.6, brass, 0, 0, 0.6, 'z', 12));
    barrel.add(mesh(new THREE.CircleGeometry(r * 0.75, 12), dark, 0, 0, len + 0.26));
    g.add(lying(r * 1.6, 0.8, rust, 0, 0, -0.2, 'z', 12));
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, len + 0.8); barrel.add(muzzle);
    barrel.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });
    mergeStatic(barrel);
    parent.add(g);
    cannons.push({ g, barrel, dir, muzzle, kick: new Spring(0, 3.5, 0.45) });
  };
  cannon(base, new THREE.Vector3(12.2, 11.6, -3.5), new THREE.Vector3(1, 0.12, 0.15), 4.4, 0.5);
  cannon(base, new THREE.Vector3(-8.5, 11.0, -5.6), new THREE.Vector3(-1, 0.1, -0.1), 3.6, 0.45);
  cannon(topIn, new THREE.Vector3(4.2, 24.4, 1.0), new THREE.Vector3(0.1, 0.35, 1), 5.2, 0.6);
  const vane = new THREE.Group(); vane.position.set(-3.2, 43.6, -3.5);
  vane.add(mesh(new THREE.ConeGeometry(0.3, 0.9, 6).rotateX(Math.PI / 2).translate(0, 0, 1.6), brass), lying(0.06, 3.2, brass, 0, 0, 0, 'z', 5));
  { const tail = mesh(new THREE.PlaneGeometry(1.0, 0.8), cloth[3], 0, 0, -1.4); tail.rotation.y = Math.PI / 2; vane.add(tail); }
  topIn.add(vane);
  const flag = new THREE.Group(); flag.position.set(-3.2, 42.6, -3.5);
  { const f = mesh(new THREE.ConeGeometry(0.7, 3.2, 3).rotateZ(-Math.PI / 2).translate(1.6, 0, 0), cloth[1]); f.scale.z = 0.12; flag.add(f); }
  topIn.add(flag);

  // the closed outer door, shown in the doorway until the room inside is drawn
  const blocker = new THREE.Group();
  {
    const dm = charToon({ map: doorBoards(0x6a4a30, 1217), rim: 0.2 });
    const panel = mesh(new THREE.PlaneGeometry(6.3, 7.8), dm, 0, 5.5 + 3.9, 16.3);
    blocker.add(panel);
    for (const y of [7, 10.5]) blocker.add(bx(-3.1, 3.1, y - 0.15, y + 0.15, 16.3, 16.42, dark));
    body.add(blocker);
  }

  base.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  topIn.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  // merge everything that does not move, then ink the outlines of the big pieces
  const movers = new Set<THREE.Object3D>([...cannons.map((c) => c.g), vane, flag]);
  for (const m of movers) m.parent?.remove(m);
  mergeStatic(base); mergeStatic(topIn);
  for (const grp of [base, topIn]) for (const m of [...grp.children]) {
    const mm = m as THREE.Mesh;
    if (mm.isMesh && mm.material !== winGlow && !cloth.includes(mm.material as THREE.MeshToonMaterial)) outline(mm, 0x2a1e1a, 1.3, 0.14);
  }
  base.add(cannons[0].g, cannons[1].g); topIn.add(cannons[2].g, vane, flag);
  for (const c of cannons) c.g.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });

  // ---------- the tongue: three planks that unfold into a ramp down to the meadow ----------
  const hinge = new THREE.Vector3(0, o.profile(CASTLE_FRONT), CASTLE_FRONT);
  const line = (z0: number, z1: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) { const z = lerp(z0, z1, i / 18); pts.push(new THREE.Vector3(0, o.profile(z), z).sub(hinge)); }
    return pts;
  };
  const deckM = charToon({ map: deckPlanks(0x8a6a44), rim: 0.15 });
  const zA = CASTLE_FRONT + 9, zB = CASTLE_FRONT + 18, zC = CASTLE_FRONT + 26.8;
  const tongueA = new THREE.Group(); tongueA.position.copy(hinge);
  const lA = line(CASTLE_FRONT, zA), lB = line(zA, zB), lC = line(zB, zC);
  tongueA.add(plank(lA, deckM, rust));
  const tongueB = new THREE.Group(); tongueB.add(plank(lB, deckM, rust)); tongueA.add(tongueB);
  const tongueC = new THREE.Group(); tongueC.add(plank(lC, deckM, rust)); tongueB.add(tongueC);
  // tucked away, each plank sits under the one before it
  const chordA = lA[lA.length - 1].clone().sub(lA[0]), chordB = lB[lB.length - 1].clone().sub(lB[0]);
  const tuckB = chordA.clone().negate().add(new THREE.Vector3(0, -0.45, 0)), tuckC = chordB.clone().negate().add(new THREE.Vector3(0, -0.45, 0));
  const slopeA = Math.atan2(-chordA.y, chordA.z);
  body.add(tongueA);
  // collect first: outline() adds a child mesh, which a traverse would visit again
  const planks: THREE.Mesh[] = [];
  tongueA.traverse((m) => { if ((m as THREE.Mesh).isMesh) planks.push(m as THREE.Mesh); });
  for (const m of planks) if (m.material === deckM) outline(m, 0x2a1e1a, 1.2, 0.08);

  // ---------- legs: thigh, the backward-bending joint, a scaly shank and a clawed foot ----------
  const thighGeo = limbGeometry(1.3, 0.85, 8.2, 12, 6), shinGeo = limbGeometry(0.74, 0.56, 8.8, 10, 6);
  const footProto = footGroup(scales, claw);
  const A_LEN = 8.2, B_LEN = 8.8;
  // order: back left, front left, back right, front right (a walking sequence, a quarter cycle apart)
  const legs = [
    { hip: new THREE.Vector3(-7.0, 4.4, -9), side: -1, phase: 0 },
    { hip: new THREE.Vector3(-7.0, 4.4, 9), side: -1, phase: 0.25 },
    { hip: new THREE.Vector3(7.0, 4.4, -9), side: 1, phase: 0.5 },
    { hip: new THREE.Vector3(7.0, 4.4, 9), side: 1, phase: 0.75 },
  ].map((L) => {
    const thigh = new THREE.Mesh(thighGeo, legIron), shin = new THREE.Mesh(shinGeo, scales);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), rust);
    const foot = footProto.clone();
    for (const m of [thigh, shin, knee]) { m.castShadow = true; root.add(m); }
    outline(thigh, 0x2a1e1a, 1.3, 0.12); outline(shin, 0x2a1e1a, 1.3, 0.1);
    root.add(foot);
    return { ...L, thigh, shin, knee, foot, prev: 0, footW: new THREE.Vector3() };
  });

  // a cheap box for photo line-of-sight checks
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(17, 30, 37), new THREE.MeshBasicMaterial());
  proxy.position.set(0, 18, -0.5); proxy.visible = false;
  body.add(proxy);

  // ---------- animation state ----------
  const drive: CastleDrive = { x: 0, z: 0, yaw: 0, lift: 0, walk: 0, gait: 0, crouch: 1, tongue: [1, 1, 1], hopScale: 1 };
  const sway = { roll: new Spring(0, 0.9, 0.35), pitch: new Spring(0, 1.1, 0.4) };
  let hopT = -1, sneezeT = -1, sneezeIdx = 0, blinkT = 3, smokeT = 0, burst = 0;
  const H = new THREE.Vector3(), F = new THREE.Vector3(), D = new THREE.Vector3(), J = new THREE.Vector3(), hint = new THREE.Vector3(), perp = new THREE.Vector3(), tmp = new THREE.Vector3();
  const CYCLE = 13, DUTY = 0.68, STRIDE = CYCLE * DUTY;

  const castle: HowlCastle = {
    group: root, body, drive, blocker, proxy, onStep: null,
    hop() { hopT = 0; burst = 1; },
    sneeze() { sneezeT = 0; sneezeIdx = (sneezeIdx + 1) % cannons.length; },
    update(dt, t, ground) {
      const d = drive;
      root.position.set(d.x, 0, d.z);
      root.rotation.y = d.yaw;
      // ---- body: the stepping makes it bob and roll; a hop throws it up; a sneeze jolts it ----
      const ph = d.gait / CYCLE;
      let hop = 0;
      if (hopT >= 0) {
        hopT += dt;
        const k = hopT;
        hop = (-0.9 * envelope(k, 0, 0.25, 0.3, 0.5) + 3.0 * envelope(k, 0.3, 0.62, 0.66, 1.0) - 0.7 * envelope(k, 0.95, 1.08, 1.12, 1.6)) * d.hopScale;
        if (hopT > 1.6) hopT = -1;
      }
      let jolt = 0;
      if (sneezeT >= 0) { sneezeT += dt; jolt = envelope(sneezeT, 0, 0.06, 0.12, 0.7) * d.hopScale; if (sneezeT > 1.4) sneezeT = -1; }
      const w = d.walk;
      body.position.y = d.lift + hop + w * 0.35 * Math.cos(ph * TAU * 2);
      const roll = w * 0.04 * Math.sin(ph * TAU) + Math.sin(t * 0.7) * 0.004 + jolt * 0.03 * (sneezeIdx === 1 ? -1 : 1);
      const pitch = w * 0.015 * Math.sin(ph * TAU * 2 + 1) - jolt * 0.02 + (hopT >= 0 ? -0.03 * envelope(hopT, 0.3, 0.6, 0.7, 1.2) * d.hopScale : 0);
      body.rotation.set(pitch, w * 0.02 * Math.sin(ph * TAU), roll);
      // the heap on top lags behind and overshoots, so the whole pile sways
      top.rotation.z = sway.roll.update(roll * 1.6, dt) - roll;
      top.rotation.x = sway.pitch.update(pitch * 1.8 + (hop > 0.5 ? -0.02 : 0), dt) - pitch;
      body.updateMatrix();

      // ---- the tongue ----
      const [ta, tb, tc] = d.tongue;
      tongueA.rotation.x = -(slopeA + 0.22) * (1 - smoothstep(0, 1, ta));
      tongueB.position.copy(tuckB).multiplyScalar(1 - smoothstep(0, 1, tb));
      tongueC.position.copy(tuckC).multiplyScalar(1 - smoothstep(0, 1, tc));

      // ---- eyelids blink now and then; the weathervane and flag turn in the wind ----
      blinkT -= dt;
      if (blinkT < -0.25) blinkT = 2.5 + ((t * 7.3) % 3);
      const blink = blinkT < 0 ? Math.sin((-blinkT / 0.25) * Math.PI) : 0;
      for (const lid of lids) lid.rotation.x = lerp(0.95, 0, blink) + (hopT >= 0 ? 0.6 : 0);
      vane.rotation.y = Math.sin(t * 0.3) * 0.6 + 0.4;
      flag.rotation.y = Math.sin(t * 2.1) * 0.25 - 0.5;
      flag.rotation.z = Math.sin(t * 3.3) * 0.08;

      // ---- cannons: the sneezing one kicks back and coughs a puff ----
      cannons.forEach((c, i) => {
        const kickT = sneezeT >= 0 && i === sneezeIdx && sneezeT < 0.05 ? -1.4 : 0;
        if (kickT) c.kick.v = -9;
        c.barrel.position.z = c.kick.update(0, dt);
        if (sneezeT >= 0 && i === sneezeIdx && sneezeT - dt < 0.04 && sneezeT >= 0.04) {
          const p = c.muzzle.getWorldPosition(tmp);
          const v = c.dir.clone().applyQuaternion(c.g.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(9);
          smoke.emit(p, { n: 14, vel: v, spread: 2.5, size: 1.4, grow: 3.2, life: 1.8, color: 0xe8e4de, alpha: 0.95, jitter: 0.4 });
        }
      });

      // ---- smoke from every chimney (more of it while walking, a big burst on the ocarina) ----
      smokeT -= dt;
      if (smokeT <= 0 && root.visible) {
        smokeT = 0.2;
        root.updateMatrixWorld(true);
        for (const c of chimneys) {
          c.getWorldPosition(tmp);
          smoke.emit(tmp, { n: burst > 0 ? 5 : 1, vel: new THREE.Vector3(0, burst > 0 ? 6 : 2.4, 0), spread: burst > 0 ? 1.6 : 0.5, size: 1.3 + w * 0.4, grow: 3.4, life: 3.6, color: 0xd8d2cc, alpha: burst > 0 ? 0.95 : 0.7 });
        }
        burst = Math.max(0, burst - 0.34);
      }

      // ---- legs: each foot steps on the ground (or the lake bed); the joint bends backward ----
      root.updateMatrixWorld(true);
      for (const L of legs) {
        H.copy(L.hip).applyMatrix4(body.matrix);
        const lp = (ph + L.phase) % 1;
        // walking: planted for most of the cycle (sliding back as the body moves on), then a high swing forward
        let fz: number, lift = 0;
        if (lp < DUTY) fz = L.hip.z + STRIDE / 2 - (lp / DUTY) * STRIDE;
        else { const s = (lp - DUTY) / (1 - DUTY); fz = L.hip.z - STRIDE / 2 + STRIDE * (s * s * (3 - 2 * s)); lift = Math.sin(s * Math.PI) * 2.4; }
        const walkX = L.side * 8.4, walkZ = lerp(L.hip.z + 1.0, fz, w);
        // sitting like a hen: the backward joint rests on the ground behind the hip and the shank lies forward to the foot
        const sitX = L.side * 7.6, sitZ = L.hip.z + 1.4;
        const fx = lerp(walkX, sitX, d.crouch), fzz = lerp(walkZ, sitZ, d.crouch);
        // ground under the foot, in the root's space (the root never tilts)
        tmp.set(fx, 0, fzz).applyMatrix4(root.matrixWorld);
        const gy = ground(tmp.x, tmp.z);
        F.set(fx, gy + 0.9 + lift * w * (1 - d.crouch), fzz);
        // a foot that has just come down
        if (L.prev > DUTY && lp < DUTY && w > 0.3 && castle.onStep) { L.footW.set(fx, gy, fzz).applyMatrix4(root.matrixWorld); castle.onStep(L.footW); }
        L.prev = lp;
        // two-bone reach from hip to foot, bending away from the front
        D.subVectors(F, H);
        let dist = D.length();
        D.normalize();
        dist = clamp(dist, Math.abs(A_LEN - B_LEN) + 0.05, A_LEN + B_LEN - 0.05);
        hint.set(L.side * 0.25, 0.15, -1).normalize();
        perp.copy(hint).addScaledVector(D, -hint.dot(D));
        if (perp.lengthSq() < 1e-6) perp.set(0, 0, -1);
        perp.normalize();
        const cosA = clamp((A_LEN * A_LEN + dist * dist - B_LEN * B_LEN) / (2 * A_LEN * dist), -1, 1);
        J.copy(H).addScaledVector(D, cosA * A_LEN).addScaledVector(perp, Math.sqrt(1 - cosA * cosA) * A_LEN);
        F.copy(H).addScaledVector(D, dist);
        L.thigh.position.copy(H);
        L.thigh.quaternion.setFromUnitVectors(DOWN, tmp.subVectors(J, H).normalize());
        L.knee.position.copy(J);
        L.shin.position.copy(J);
        L.shin.quaternion.setFromUnitVectors(DOWN, tmp.subVectors(F, J).normalize());
        L.foot.position.copy(F);
        // toes curl down through the swing and lie flat when planted
        L.foot.rotation.set(lp >= DUTY ? Math.sin(((lp - DUTY) / (1 - DUTY)) * Math.PI) * 0.45 * w : 0, 0, 0);
      }
    },
  };
  return castle;
}
