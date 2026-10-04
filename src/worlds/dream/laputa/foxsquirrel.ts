import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon } from '../../../engine/Paint';
import { Rng, TAU, clamp, damp } from '../../../engine/math';

/*
 * Foxsquirrels: small fox-like animals with huge ears and long bushy tails (Teto's kind). A herd of them
 * is drawn as four instanced meshes (bodies, tails, front legs, hind legs), so ten cost the same as one.
 * Some ride on the robot's shoulders; the rest scamper along the tops of low walls, race the Catbus for a
 * stretch, sit up to listen to the ocarina, and dash to an acorn when one lands near them.
 */

/** how much bigger than life they are drawn, so they read from the Catbus: the runners on the walls, and the
 * two smaller ones riding on the robot's shoulders */
const SIZE = 1.5, PERCHED_SIZE = 1.3;
const TAN = new THREE.Color(0xd9ac6c), CREAM = new THREE.Color(0xf6e8c8), DARK = new THREE.Color(0x7a5232), INK = new THREE.Color(0x1a1412), PINK = new THREE.Color(0xe8a0a0);

/** Paint a geometry's vertices with colour(position, normal). */
function paint(geo: THREE.BufferGeometry, f: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const pos = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nrm, i);
    f(p, n, c);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const solid = (c: THREE.Color) => (_p: THREE.Vector3, _n: THREE.Vector3, out: THREE.Color) => { out.copy(c); };

/** Body and head as one painted piece: tan coat, cream belly and chest, a dark stripe down the back, big dark-tipped ears. */
function bodyGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const coat = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => {
    out.copy(TAN);
    if (n.y < -0.15 || (p.z > 0.12 && n.z > 0.4 && p.y < 0.32)) out.lerp(CREAM, 0.85);
    if (n.y > 0.55 && Math.abs(p.x) < 0.05) out.lerp(DARK, 0.7);
  };
  parts.push(paint(new THREE.SphereGeometry(1, 14, 10).scale(0.15, 0.135, 0.27).translate(0, 0.24, 0), coat));
  parts.push(paint(new THREE.SphereGeometry(0.13, 14, 10).translate(0, 0.37, 0.27), (p, n, out) => { out.copy(TAN); if (n.y < 0 || (n.z > 0.5 && p.y < 0.36)) out.lerp(CREAM, 0.8); }));
  parts.push(paint(new THREE.ConeGeometry(0.065, 0.16, 10).rotateX(Math.PI / 2).translate(0, 0.335, 0.43), solid(CREAM)));
  parts.push(paint(new THREE.SphereGeometry(0.024, 8, 6).translate(0, 0.34, 0.51), solid(INK)));
  for (const s of [-1, 1]) {
    // the ears: tall cones, pink inside, dark at the tips
    const ear = new THREE.ConeGeometry(0.075, 0.25, 10).scale(1, 1, 0.45).rotateZ(-s * 0.38).rotateX(-0.2).translate(s * 0.085, 0.53, 0.22);
    parts.push(paint(ear, (p, n, out) => { out.copy(TAN); if (n.z > 0.3) out.lerp(PINK, 0.6); if (p.y > 0.58) out.copy(DARK); }));
    parts.push(paint(new THREE.SphereGeometry(0.03, 8, 6).translate(s * 0.068, 0.395, 0.37), solid(INK)));
  }
  return mergeGeometries(parts, false)!;
}

/** The bushy tail, from its root at the rump (the origin) curling up over the back. */
function tailGeometry() {
  const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.04, -0.14), new THREE.Vector3(0, 0.18, -0.3), new THREE.Vector3(0, 0.38, -0.34), new THREE.Vector3(0, 0.54, -0.24), new THREE.Vector3(0, 0.6, -0.1)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const parts: THREE.BufferGeometry[] = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), c = curve.getPointAt(t);
    const r = 0.05 + Math.sin(t * Math.PI * 0.85 + 0.2) * 0.12;
    parts.push(paint(new THREE.SphereGeometry(r, 10, 8).translate(c.x, c.y, c.z), (_p, n, out) => { out.copy(TAN).lerp(CREAM, t > 0.8 ? 0.8 : n.y < 0 ? 0.3 : 0); }));
  }
  return mergeGeometries(parts, false)!;
}

/** A pair of thin legs hanging from a hip or shoulder pivot at the origin, with little paws. */
function legPair(thick: number, len: number, haunch: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(paint(new THREE.CapsuleGeometry(thick, len, 3, 6).translate(s * 0.075, -len / 2 - 0.02, 0), solid(TAN)));
    parts.push(paint(new THREE.SphereGeometry(thick * 1.3, 8, 6).scale(1, 0.6, 1.5).translate(s * 0.075, -len - 0.04, 0.02), solid(CREAM)));
    if (haunch) parts.push(paint(new THREE.SphereGeometry(1, 10, 8).scale(0.07, 0.1, 0.1).translate(s * 0.08, -0.02, 0), solid(TAN)));
  }
  return mergeGeometries(parts, false)!;
}

/** A stretch of wall top a foxsquirrel can run along (both ends on the top surface). */
export interface Run { a: THREE.Vector3; b: THREE.Vector3; race?: boolean }

type Mode = 'perch' | 'wall' | 'dash' | 'eat' | 'back';
interface Sq {
  pos: THREE.Vector3; heading: number; phase: number; sit: number; sitT: number; mode: Mode;
  perch: THREE.Object3D | null; run: Run | null; t: number; target: number; wait: number; speed: number;
  goal: THREE.Vector3; timer: number; holds: boolean; lift: number; ground: boolean;
}

export class Foxsquirrels {
  readonly group = new THREE.Group();
  /** a point among the wall runners, on the ground, for the photo subject */
  readonly anchor = new THREE.Object3D();
  private body: THREE.InstancedMesh;
  private tail: THREE.InstancedMesh;
  private front: THREE.InstancedMesh;
  private hind: THREE.InstancedMesh;
  private list: Sq[] = [];
  private rng: Rng;
  private alertT = 0;
  private acorn: THREE.Object3D | null = null;
  private floor: (x: number, z: number) => number;

  constructor(perches: THREE.Object3D[], runs: Run[], perRun: number, floor: (x: number, z: number) => number, seed = 811) {
    this.rng = new Rng(seed);
    this.floor = floor;
    const mat = charToon({ vertexColors: true, rim: 0.45, shade: 0xa8a0c8 });
    const n = perches.length + runs.length * perRun;
    this.body = new THREE.InstancedMesh(bodyGeometry(), mat, n);
    this.tail = new THREE.InstancedMesh(tailGeometry(), mat, n);
    this.front = new THREE.InstancedMesh(legPair(0.028, 0.16, false), mat, n);
    this.hind = new THREE.InstancedMesh(legPair(0.034, 0.14, true), mat, n);
    for (const im of [this.body, this.tail, this.front, this.hind]) { im.castShadow = true; im.frustumCulled = false; this.group.add(im); }
    const r = this.rng;
    const base = (): Sq => ({ pos: new THREE.Vector3(), heading: 0, phase: r.range(0, TAU), sit: 0, sitT: 0, mode: 'wall', perch: null, run: null, t: 0, target: 0, wait: r.range(0, 2), speed: r.range(3.2, 4.4), goal: new THREE.Vector3(), timer: 0, holds: false, lift: 0, ground: false });
    for (const p of perches) { const s = base(); s.mode = 'perch'; s.perch = p; this.list.push(s); }
    for (const run of runs) for (let k = 0; k < perRun; k++) {
      const s = base(); s.run = run; s.t = r.range(0.1, 0.9); s.target = s.t;
      s.pos.lerpVectors(run.a, run.b, s.t);
      this.list.push(s);
    }
    this.group.add(this.anchor);
  }

  /** Everyone sits up on their haunches with their ears up for a few seconds. */
  alert(seconds = 2.8) { this.alertT = seconds; return true; }

  /** Runners near `spot` dash to it; the first there sits up holding `acorn`. Returns true if any went. */
  dashTo(spot: THREE.Vector3, acorn: THREE.Object3D | null, range = 24) {
    let any = false;
    this.acorn = acorn;
    for (const s of this.list) {
      if (s.mode === 'perch' || s.pos.distanceTo(spot) > range) continue;
      s.mode = 'dash';
      s.goal.copy(spot).add(new THREE.Vector3(this.rng.range(-0.6, 0.6), 0, this.rng.range(-0.6, 0.6)));
      s.timer = 0; s.holds = false; s.speed = this.rng.range(5.5, 7);
      any = true;
    }
    return any;
  }

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private w = new THREE.Matrix4();
  private x = new THREE.Matrix4();

  update(dt: number, t: number, rider: THREE.Vector3) {
    this.alertT = Math.max(0, this.alertT - dt);
    const alert = this.alertT > 0;
    const sum = new THREE.Vector3();
    let nSum = 0, claimed = false;
    this.list.forEach((s, i) => {
      let moving = 0;
      if (s.mode === 'perch' && s.perch) {
        s.perch.updateWorldMatrix(true, false);
        // riders sit low on the shoulder, so even sitting up to listen they stay below the robot's head
        s.sit = damp(s.sit, alert ? 0.45 : 0.2, 6, dt);
        this.pose(i, s, s.perch.matrixWorld, 0, t);
        return;
      }
      if (s.mode === 'wall' && s.run) {
        const run = s.run;
        const len = run.a.distanceTo(run.b);
        // racing: on a race wall, keep level with the Catbus while it passes
        let racing = false;
        if (run.race) {
          const k = (rider.z - run.a.z) / (run.b.z - run.a.z);
          if (k > -0.15 && k < 1.1) { s.target = clamp(k + 0.06, 0.02, 0.98); racing = true; }
        }
        if (!racing) {
          s.wait -= dt;
          if (s.wait <= 0 && Math.abs(s.target - s.t) < 0.01) { s.target = this.rng.range(0.05, 0.95); s.wait = this.rng.range(1.5, 4.5); }
        }
        const dir = Math.sign(s.target - s.t);
        const step = Math.min(Math.abs(s.target - s.t), ((racing ? 9 : s.speed) * dt) / Math.max(len, 0.1));
        s.t += dir * step;
        moving = step > 1e-5 ? 1 : 0;
        s.pos.lerpVectors(run.a, run.b, s.t);
        if (moving) s.heading = Math.atan2((run.b.x - run.a.x) * dir, (run.b.z - run.a.z) * dir);
        else s.heading += Math.sin(t * 0.7 + s.phase) * dt * 0.6;
        s.sit = damp(s.sit, alert ? 1 : moving ? 0 : 0.35 + 0.35 * Math.max(0, Math.sin(t * 0.9 + s.phase)), 6, dt);
      } else if (s.mode === 'dash' || s.mode === 'back') {
        // run over the ground to the goal; hop down from the wall on the way and back up at the end
        const goal = s.mode === 'back' && s.run ? this.v.lerpVectors(s.run.a, s.run.b, s.t) : s.goal;
        const dx = goal.x - s.pos.x, dz = goal.z - s.pos.z, d = Math.hypot(dx, dz);
        const step = Math.min(d, s.speed * dt);
        if (d > 0.05) { s.pos.x += (dx / d) * step; s.pos.z += (dz / d) * step; s.heading = Math.atan2(dx, dz); moving = 1; }
        const gy = this.floor(s.pos.x, s.pos.z);
        const ty = s.mode === 'back' && d < 1.2 ? goal.y : gy;
        s.pos.y = damp(s.pos.y, ty, 12, dt);
        s.sit = damp(s.sit, 0, 8, dt);
        if (s.mode === 'dash' && d < 0.3) { s.mode = 'eat'; s.timer = 0; }
        if (s.mode === 'back' && d < 0.1) { s.mode = 'wall'; s.pos.copy(goal); s.speed = this.rng.range(3.2, 4.4); }
      } else if (s.mode === 'eat') {
        // sit up and nibble; the first to arrive holds the acorn in its paws
        s.timer += dt;
        if (!claimed && this.acorn && !s.holds && s.timer < 0.2) { s.holds = true; claimed = true; }
        s.sit = damp(s.sit, 1, 6, dt);
        s.pos.y = damp(s.pos.y, this.floor(s.pos.x, s.pos.z), 12, dt);
        if (s.timer > 4.5) {
          // it leaves the acorn lying on the grass and goes back to its wall
          if (s.holds && this.acorn && this.acorn.userData.owner === 'herd') this.acorn.position.y = this.floor(this.acorn.position.x, this.acorn.position.z) + 0.13;
          s.mode = 'back'; s.holds = false; s.speed = this.rng.range(3.5, 4.5);
        }
      }
      s.phase += moving * dt * (s.mode === 'dash' ? 16 : 13);
      this.m.compose(s.pos, this.q.setFromAxisAngle(this.v.set(0, 1, 0), s.heading), this.v.set(1, 1, 1));
      this.pose(i, s, this.m, moving, t);
      if (s.holds && this.acorn && this.acorn.userData.owner === 'herd') {
        // the acorn sits in its front paws, in front of its chest
        this.acorn.position.set(0, 0.42, 0.24).applyMatrix4(this.bodyMatrix(i));
        this.acorn.visible = true;
      }
      sum.add(s.pos); nSum++;
    });
    if (nSum) { this.anchor.position.copy(sum.multiplyScalar(1 / nSum)); this.anchor.position.y = this.floor(this.anchor.position.x, this.anchor.position.z); }
    for (const im of [this.body, this.tail, this.front, this.hind]) im.instanceMatrix.needsUpdate = true;
  }

  private bm = new THREE.Matrix4();
  private bodyMatrix(i: number) { this.body.getMatrixAt(i, this.bm); return this.bm; }

  /**
   * Set the four instance matrices for squirrel i standing at `base` (a world matrix whose origin is on the
   * surface under it). Running bounds the body and swings the legs in pairs; sitting rocks it back on its haunches.
   */
  private pose(i: number, s: Sq, base: THREE.Matrix4, moving: number, t: number) {
    const ph = s.phase;
    const bound = moving * Math.sin(ph);
    const lift = moving * Math.abs(Math.sin(ph)) * 0.07;
    // sitting: rotate the body back about the hips, so the chest rises and the front paws leave the ground
    const sit = s.sit, sniff = Math.sin(t * 7 + ph) * 0.03 * (1 - moving);
    const body = this.w.copy(base)
      .multiply(this.x.makeScale(s.perch ? PERCHED_SIZE : SIZE, s.perch ? PERCHED_SIZE : SIZE, s.perch ? PERCHED_SIZE : SIZE))
      .multiply(this.x.makeTranslation(0, 0.02 + lift, -0.16))
      .multiply(this.x.makeRotationX(-sit * 0.95 + bound * 0.22 + sniff))
      .multiply(this.x.makeTranslation(0, 0, 0.16));
    this.body.setMatrixAt(i, body);
    // on the robot's shoulder the tail hangs down behind, over its back; on the ground it streams out
    // behind when running and curls up over the back when sitting
    const tailX = s.perch ? -1.5 + Math.sin(t * 1.3 + ph) * 0.06 : moving * 0.7 + sit * 0.5 - 0.1 + Math.sin(t * 2.1 + ph) * 0.08;
    const tail = this.bm.copy(body).multiply(this.x.makeTranslation(0, 0.27, -0.25))
      .multiply(this.x.makeRotationX(tailX))
      .multiply(this.x.makeRotationZ(Math.sin(t * 1.6 + ph * 0.5) * (s.perch ? 0.1 : 0.25)));
    this.tail.setMatrixAt(i, tail);
    const fl = this.bm.copy(body).multiply(this.x.makeTranslation(0, 0.2, 0.17)).multiply(this.x.makeRotationX(moving * Math.sin(ph) * 0.9 + sit * 0.9));
    this.front.setMatrixAt(i, fl);
    const hl = this.bm.copy(body).multiply(this.x.makeTranslation(0, 0.2, -0.15)).multiply(this.x.makeRotationX(moving * Math.sin(ph + Math.PI) * 0.9 + sit * 0.95));
    this.hind.setMatrixAt(i, hl);
  }
}
