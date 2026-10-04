import * as THREE from 'three';
import { charToon } from '../../../engine/Paint';
import { sculpt, limbGeometry, outline, Spring, LookAt, envelope } from '../../../engine/Rig';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { sphereFur } from '../../ghibli/characterTextures';
import { deerCoat, spiritFace } from './textures';
import { headGeometry, antlerGeometry, earGeometry } from './spiritHead';

/*
 * The Forest Spirit (Shishigami) in its day form: a deer like a great elk with a longer neck, a spotted
 * red-brown coat, slender legs, a strange red almost-human face with dark eyes, and huge branching antlers.
 * It walks slowly; flowers bloom where its hooves touch the ground and wilt again behind it.
 *
 * Origin: on the ground between its hooves. Faces +z. Built about 9.5 units tall to the tips of the antlers,
 * then scaled up (1.4 by default) so it stands taller than any deer.
 */

export interface ForestSpirit {
  group: THREE.Group;
  /** the head (its +z is where the face looks) */
  head: THREE.Object3D;
  /** 0 standing .. 1 walking; the legs step in time with `stride` */
  walk: number;
  /** distance moved this frame (sets the stepping pace) */
  stride: number;
  /** a world point to look towards, or null */
  lookTarget: THREE.Vector3 | null;
  /** raise the head and look at `lookTarget` for a few seconds */
  gaze(): void;
  /** called with each hoof's world position as it is set down */
  onHoof: ((p: THREE.Vector3) => void) | null;
  update(dt: number, t: number): void;
}

const INK = 0x2a1a14;
const BODY_Y = 3.15;

export function makeForestSpirit(scale = 1.4): ForestSpirit {
  const g = new THREE.Group();
  const coatMat = charToon({ map: deerCoat(), rim: 0.45, shade: 0x9a8aa8 });
  const legMat = charToon({ map: sphereFur(0x7a4428, 857, { w: 256 }).texture(), rim: 0.4, shade: 0x9a8aa8 });
  const hoofMat = charToon({ color: 0x2a2220, rim: 0.2 });
  const faceMat = charToon({ map: spiritFace(), rim: 0.35, shade: 0xa898b0, emissive: 0x1a0c08 });
  // the antlers are pale like old bone and catch the first light
  const antlerMat = charToon({ color: 0xe8dcc0, emissive: 0x2c2418, rim: 0.6, shade: 0xb0a8b8 });

  // ----- body: a deep chest, a slimmer waist, round haunches -----
  const body = new THREE.Mesh(sculpt((d, out) => {
    const front = smoothstep(-0.2, 0.9, d.z), back = smoothstep(0.2, -0.9, d.z);
    const rx = 0.74 - 0.08 * (1 - front - back) + 0.04 * back;
    const ry = (d.y < 0 ? 0.98 + 0.12 * front : 0.88) - 0.06 * (1 - front - back);
    // the withers stand a little higher than the rump
    out.set(d.x * rx, d.y * ry + 0.12 * front * Math.max(0, d.y), d.z * 2.05);
  }, 48, 28), coatMat);
  body.position.y = BODY_Y;
  g.add(body);
  outline(body, INK, 1.4, 0.035);
  // a short tail
  const tail = new THREE.Mesh(limbGeometry(0.16, 0.08, 0.6, 10, 4), coatMat);
  tail.position.set(0, BODY_Y + 0.55, -2.0);
  tail.rotation.x = -2.6;
  g.add(tail);

  // ----- legs: slender, with a thigh, a long lower leg and a dark hoof -----
  const legs: Array<{ hip: THREE.Group; knee: THREE.Group; hoof: THREE.Object3D; off: number; front: boolean }> = [];
  const thighGeo = limbGeometry(0.3, 0.17, 1.4, 12, 6), shinGeo = limbGeometry(0.13, 0.09, 1.5, 10, 6);
  const hoofGeo = new THREE.CylinderGeometry(0.07, 0.13, 0.22, 10).translate(0, -0.11, 0.03);
  // a slow walk: left hind, left fore, right hind, right fore
  const order = [{ x: -0.42, z: -1.45, off: 0, front: false }, { x: -0.42, z: 1.4, off: 0.25, front: true }, { x: 0.42, z: -1.45, off: 0.5, front: false }, { x: 0.42, z: 1.4, off: 0.75, front: true }];
  for (const L of order) {
    const hip = new THREE.Group();
    hip.position.set(L.x, BODY_Y - 0.03, L.z);
    const thigh = new THREE.Mesh(thighGeo, L.front ? legMat : coatMat);
    hip.add(thigh);
    outline(thigh, INK, 1.2, 0.03);
    const knee = new THREE.Group(); knee.position.y = -1.4; hip.add(knee);
    knee.add(new THREE.Mesh(shinGeo, legMat));
    const hoof = new THREE.Mesh(hoofGeo, hoofMat); hoof.position.y = -1.5; knee.add(hoof);
    g.add(hip);
    legs.push({ hip, knee, hoof, off: L.off, front: L.front });
  }

  // ----- neck and head -----
  const neckBase = new THREE.Group();
  neckBase.position.set(0, BODY_Y + 0.35, 1.55);
  g.add(neckBase);
  const NECK = 2.7;
  const neck = new THREE.Mesh(limbGeometry(0.62, 0.36, NECK, 14, 8), coatMat);
  // the limb hangs down its joint; turn it so it rises up and forward
  neck.rotation.x = Math.PI;
  const neckTilt = new THREE.Group();
  neckTilt.add(neck);
  neckBase.add(neckTilt);
  outline(neck, INK, 1.3, 0.03);
  const headJoint = new THREE.Group(); headJoint.position.y = NECK; neckTilt.add(headJoint);
  const head = new THREE.Group();
  headJoint.add(head);
  const headMesh = new THREE.Mesh(headGeometry(1), faceMat);
  headMesh.scale.setScalar(1.25);
  headMesh.position.set(0, 0.15, 0.35);
  head.add(headMesh);
  outline(headMesh, INK, 1.3, 0.03);
  const antlers = new THREE.Mesh(antlerGeometry(1907, { spread: 1, height: 1.05, radius: 0.075, tines: 11, fork: 1, twigs: true }), antlerMat);
  antlers.scale.setScalar(1.25);
  antlers.position.copy(headMesh.position);
  head.add(antlers);
  outline(antlers, INK, 1.0, 0.02);
  const earGeo = earGeometry();
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, coatMat);
    ear.scale.set(s * 1.25, 1.25, 1.25);
    ear.position.set(s * 0.42, 0.62, 0.1);
    ear.rotation.set(0, 0, s * 0.35);
    head.add(ear);
  }

  // ----- animation -----
  const look = new LookAt(0.9, 0.45);
  const sp = { walk: new Spring(0, 1.2, 0.9), lift: new Spring(0, 1.1, 0.8) };
  let walked = 0, gazeT = -1;
  const prevC = [0, 0, 0, 0];
  const tmp = new THREE.Vector3();
  // everything is built at scale 1 (the rig-free parts and their outlines), then the whole deer is scaled
  g.scale.setScalar(scale);
  const ch: ForestSpirit = {
    group: g, head, walk: 0, stride: 0, lookTarget: null, onHoof: null,
    gaze() { gazeT = 0; },
    update(dt, t) {
      const w = clamp(sp.walk.update(ch.walk, dt), 0, 1);
      // the stride is in world units; the legs are built at scale 1
      walked += ch.stride / scale;
      // one full cycle of all four legs per 3.4 units walked
      const cyc = walked / 3.4;
      for (let i = 0; i < 4; i++) {
        const L = legs[i];
        const c = ((cyc + L.off) % 1 + 1) % 1;
        let ang: number, bend: number;
        if (c < 0.7) {
          // on the ground: the leg swings back under the body
          ang = lerp(-0.3, 0.3, c / 0.7); bend = 0.04;
        } else {
          // lifted and carried forward, the lower leg folding
          const k = (c - 0.7) / 0.3;
          ang = lerp(0.3, -0.3, k * k * (3 - 2 * k)); bend = Math.sin(k * Math.PI) * 0.95;
        }
        L.hip.rotation.x = ang * w;
        L.knee.rotation.x = (L.front ? bend : -bend * 0.8) * w + (L.front ? 0.02 : -0.06);
        // a hoof is set down as its leg finishes the swing
        if (w > 0.3 && c < prevC[i] && ch.onHoof) {
          L.hoof.getWorldPosition(tmp);
          ch.onHoof(tmp);
        }
        prevC[i] = c;
      }
      // the body sways gently with the walk and breathes when still
      body.position.y = BODY_Y + Math.sin(cyc * TAU * 2) * 0.04 * w + Math.sin(t * 1.3) * 0.015;
      body.rotation.z = Math.sin(cyc * TAU) * 0.02 * w;
      // the head nods with each step; on a gaze the neck rises and the head turns to the rider
      let gz = 0;
      if (gazeT >= 0) { gazeT += dt; gz = envelope(gazeT, 0, 0.9, 3.4, 4.6); if (gazeT > 4.8) gazeT = -1; }
      const lift = sp.lift.update(gz, dt);
      neckTilt.rotation.x = lerp(0.62, 0.22, lift) + Math.sin(cyc * TAU * 2) * 0.03 * w;
      const [ly, lp] = look.update(head, ch.lookTarget, dt, lerp(0.35, 1, lift));
      head.rotation.set(lerp(-0.45, -0.3, lift) + lp + Math.sin(t * 0.7) * 0.02, ly, 0);
      tail.rotation.z = Math.sin(t * 2.1) * 0.15;
    },
  };
  return ch;
}

// ---------------- flowers ----------------
/**
 * Small flowers that grow where the Forest Spirit steps and wilt again a few seconds later: a pool of
 * instanced flower heads, each opening, holding and shrinking on its own timer.
 */
export class Blooms {
  readonly mesh: THREE.InstancedMesh;
  private items: Array<{ p: THREE.Vector3; born: number; hold: number; size: number; rot: number }> = [];
  private next = 0;
  private rng = new Rng(1901);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(count = 180) {
    // six round petals round a yellow middle, facing up, with a short green stem
    const shape = new THREE.Shape();
    const P = 6;
    for (let i = 0; i <= P * 8; i++) {
      const a = (i / (P * 8)) * TAU;
      const r = 0.12 + 0.18 * Math.pow(Math.abs(Math.cos((a * P) / 2)), 0.6);
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const petals = new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2).translate(0, 0.32, 0);
    const middle = new THREE.SphereGeometry(0.07, 8, 6).scale(1, 0.5, 1).translate(0, 0.34, 0);
    const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.32, 5).translate(0, 0.16, 0);
    const colorOf = (geo: THREE.BufferGeometry, c: THREE.Color) => {
      const n = geo.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      geo.deleteAttribute('uv');
      return geo.index ? geo.toNonIndexed() : geo;
    };
    const parts = [colorOf(petals, new THREE.Color(1, 1, 1)), colorOf(middle, new THREE.Color(1.0, 0.82, 0.3)), colorOf(stem, new THREE.Color(0.35, 0.6, 0.28))];
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const arrs = parts.map((p) => p.attributes[name].array as Float32Array);
      const out = new Float32Array(arrs.reduce((s, a) => s + a.length, 0));
      let o = 0;
      for (const a of arrs) { out.set(a, o); o += a.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(out, 3));
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x3a3028 });
    this.mesh = new THREE.InstancedMesh(merged, mat, count);
    this.m.makeScale(0, 0, 0);
    const tints = [0xffffff, 0xffd8e8, 0xf8f0c0, 0xd8e8ff, 0xffc0d0];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, c.set(tints[i % tints.length]));
      this.items.push({ p: new THREE.Vector3(), born: -99, hold: 0, size: 1, rot: 0 });
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.mesh.frustumCulled = false;
    this.mesh.userData.keep = true;
  }

  /** `n` flowers round a point (on the ground there), opening over `spread` seconds from ride time `t`. */
  spawn(p: THREE.Vector3, t: number, n = 3, radius = 0.5, hold = 3.2, spread = 0.3) {
    const r = this.rng;
    for (let k = 0; k < n; k++) {
      const it = this.items[this.next];
      this.next = (this.next + 1) % this.items.length;
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * radius;
      it.p.set(p.x + Math.cos(a) * d, p.y, p.z + Math.sin(a) * d);
      it.born = t + r.range(0, spread) + (d / Math.max(radius, 0.01)) * spread;
      it.hold = hold * r.range(0.8, 1.2);
      it.size = r.range(0.8, 1.35);
      it.rot = r.range(0, TAU);
    }
  }

  update(t: number) {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const age = t - it.born;
      if (age < 0 || age > it.hold + 2.5) { if (age > it.hold + 2.5 && age < it.hold + 3) this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0)); continue; }
      // opens with a little overshoot, holds, then droops and shrinks away
      const open = age < 0.7 ? 1 + 1.3 * Math.pow(age / 0.7 - 1, 3) + 0.3 * Math.pow(age / 0.7 - 1, 2) : 1;
      const wilt = smoothstep(it.hold, it.hold + 2.2, age);
      const k = Math.max(0, open) * (1 - wilt) * it.size;
      this.q.setFromAxisAngle(this.up, it.rot + wilt * 0.6);
      this.s.set(k, k * (1 - wilt * 0.5), k);
      this.mesh.setMatrixAt(i, this.m.compose(it.p, this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
