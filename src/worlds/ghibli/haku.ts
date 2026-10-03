import * as THREE from 'three';
import { glow } from '../../engine/Builders';
import { charToon } from '../../engine/Paint';
import { sculpt, profileShape, FlexTube, taperedTube, limbGeometry, outline } from '../../engine/Rig';
import { clamp, lerp } from '../../engine/math';
import { sphereFur, hakuScales, hakuMane, tealTuft } from './characterTextures';
import type { Character } from './character';

/**
 * The path the head has flown, kept by distance travelled, so the body that follows it is always the
 * same length however fast or slow the dragon flies.
 */
class Trail {
  private p: THREE.Vector3[] = [];
  private d: number[] = [];
  private total = 0;
  push(q: THREE.Vector3) {
    const last = this.p[this.p.length - 1];
    if (last) {
      const step = last.distanceTo(q);
      if (step < 0.04) return;
      this.total += step;
    }
    this.p.push(q.clone());
    this.d.push(this.total);
    // keep a little more than the body length
    while (this.p.length > 2 && this.total - this.d[1] > 40) { this.p.shift(); this.d.shift(); }
  }
  /** the point `back` units behind the newest point along the path (extended straight past the oldest point) */
  sample(back: number, out: THREE.Vector3) {
    const n = this.p.length;
    if (n === 0) return out.set(0, 0, 0);
    if (n === 1) return out.copy(this.p[0]);
    const want = this.total - back;
    if (want <= this.d[0]) {
      // beyond the start of the trail: carry on in the direction of the first stretch
      const dir = new THREE.Vector3().subVectors(this.p[0], this.p[1]).normalize();
      return out.copy(this.p[0]).addScaledVector(dir, this.d[0] - want);
    }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.d[mid] <= want) lo = mid; else hi = mid; }
    const k = (want - this.d[lo]) / Math.max(1e-6, this.d[hi] - this.d[lo]);
    return out.copy(this.p[lo]).lerp(this.p[hi], k);
  }
  /** start again with a straight body lying behind `head` along -`dir` */
  reset(head: THREE.Vector3, dir: THREE.Vector3) {
    this.p = []; this.d = []; this.total = 0;
    const back = dir.clone().normalize().multiplyScalar(-1);
    for (let i = 30; i >= 0; i--) this.push(head.clone().addScaledVector(back, i * 1.0));
  }
}

export interface Haku extends Character {
  state: { target: THREE.Vector3; swoopT: number; time: number; seeded: boolean };
  head: THREE.Group;
  /** current flying velocity of the head */
  vel: THREE.Vector3;
  setTarget(p: THREE.Vector3): void;
  swoop(): void;
  /** fastest the dragon may fly right now (units per second); the world raises it to keep up with the train */
  maxSpeed: number;
  /** put the dragon somewhere else at once, flying in direction `dir` */
  teleport(p: THREE.Vector3, dir: THREE.Vector3): void;
}

export function makeHaku(): Haku {
  const g = new THREE.Group();
  const shade = 0x9ea8d4;
  const scales = hakuScales();
  scales.repeat.set(1, 1);
  const white = charToon({ map: scales, emissive: 0x2a3a58, rim: 0.7, shade });
  const headMat = charToon({ map: sphereFur(0xf0f4f3, 105, { w: 512, contrast: 0.35 }).texture(), emissive: 0x2a3a58, rim: 0.7, shade });
  const teal = charToon({ map: tealTuft(), emissive: 0x143a34, rim: 0.5 });
  const hornMat = charToon({ color: 0xece4cc, emissive: 0x2a2a30, rim: 0.4 });
  const whiskerMat = charToon({ color: 0x7fd4c0, emissive: 0x1a4a44, rim: 0.3 });
  const dark = charToon({ color: 0x1a2a30, rim: 0 });
  const ink = 0x1e2638;

  // ----- head: a long, narrow dog-like head with a flat-topped snout -----
  const head = new THREE.Group();
  const shape = profileShape([[1.8, 0], [1.74, 0.13], [1.58, 0.21], [1.2, 0.25], [0.85, 0.28], [0.6, 0.35], [0.32, 0.45], [0.0, 0.5], [-0.32, 0.46], [-0.6, 0.3], [-0.7, 0]], {
    depth: 0.8, // the top of the head (-z before the head is turned to face forward)
    front: () => 0.68, // the underside of the jaw
  });
  const headGeo = sculpt(shape, 40, 28).rotateX(Math.PI / 2);
  const skull = new THREE.Mesh(headGeo, headMat);
  head.add(skull);
  outline(skull, ink, 1.4, 0.03);
  // brow ridges over the eyes
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), headMat);
    brow.scale.set(0.14, 0.1, 0.34); brow.position.set(s * 0.27, 0.27, 0.62); brow.rotation.y = s * 0.25;
    head.add(brow);
    // teal eyes with dark pupils, set under the brow and looking forward
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), glow(0x7fe0d0, 1.5));
    eye.scale.set(0.8, 0.75, 1.2); eye.position.set(s * 0.31, 0.16, 0.72);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), dark);
    pupil.scale.set(0.6, 1, 0.6); pupil.position.set(s * 0.355, 0.165, 0.79);
    head.add(pupil);
    // horns: pale, swept back and slightly out
    const horn = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.2, 0.32, 0.1), new THREE.Vector3(s * 0.32, 0.52, -0.25), new THREE.Vector3(s * 0.4, 0.62, -0.75), new THREE.Vector3(s * 0.44, 0.58, -1.15)]);
    const hornMesh = new THREE.Mesh(taperedTube(horn, 0.075, 0.012, 14, 8), hornMat);
    head.add(hornMesh);
    // a small fin-like ear
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 8), teal);
    ear.position.set(s * 0.42, 0.22, -0.18); ear.rotation.set(-1.1, 0, -s * 0.7);
    head.add(ear);
    // nostril and the line of the mouth along the snout
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark);
    nostril.position.set(s * 0.08, 0.1, 1.72);
    head.add(nostril);
    const lip = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.12, -0.08, 1.7), new THREE.Vector3(s * 0.22, -0.11, 1.25), new THREE.Vector3(s * 0.28, -0.1, 0.8), new THREE.Vector3(s * 0.3, -0.04, 0.55)]);
    head.add(new THREE.Mesh(taperedTube(lip, 0.016, 0.012, 10, 5), dark));
  }
  // a tuft of mane on the crown
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.6;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.75, 8), teal);
    m.position.set(Math.sin(a) * 0.32, 0.38 + Math.cos(a) * 0.12, -0.25);
    m.rotation.set(-1.25, 0, -a * 0.5);
    head.add(m);
  }
  g.add(head);

  // ----- body: one tube that follows the head's path -----
  const N = 72, SEG = 0.27;
  const body = new FlexTube(N, 16, (k) => lerp(0.42, 0.08, Math.pow(k, 1.5)) * (1 + 0.12 * Math.exp(-(((k - 0.15) / 0.12) ** 2))), white, { uvAlong: 11 });
  g.add(body.mesh);
  // a ribbon of mane along the spine
  const MANE_END = Math.floor(N * 0.9);
  const maneGeo = new THREE.BufferGeometry();
  const mPos = new Float32Array(MANE_END * 2 * 3), mNrm = new Float32Array(MANE_END * 2 * 3), mUv = new Float32Array(MANE_END * 2 * 2);
  const mIdx: number[] = [];
  for (let i = 0; i < MANE_END; i++) {
    mUv.set([(i / MANE_END) * 6, 0, (i / MANE_END) * 6, 1], i * 4);
    if (i < MANE_END - 1) { const a = i * 2; mIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  maneGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  maneGeo.setAttribute('normal', new THREE.BufferAttribute(mNrm, 3));
  maneGeo.setAttribute('uv', new THREE.BufferAttribute(mUv, 2));
  maneGeo.setIndex(mIdx);
  const mane = new THREE.Mesh(maneGeo, charToon({ map: hakuMane(), emissive: 0x143a34, side: THREE.DoubleSide, alphaTest: 0.45, rim: 0.2 }));
  mane.frustumCulled = false;
  g.add(mane);

  // locks of mane streaming back from the head, and two long whiskers from the snout
  const locks = Array.from({ length: 6 }, (_, i) => ({ tube: new FlexTube(10, 6, (k) => lerp(0.11, 0.015, k), teal), side: (i / 5 - 0.5) * 2, len: 1.6 + (i % 3) * 0.35 }));
  for (const l of locks) g.add(l.tube.mesh);
  const whiskers = [-1, 1].map((s) => ({ tube: new FlexTube(14, 5, (k) => lerp(0.028, 0.006, k), whiskerMat), side: s }));
  for (const w of whiskers) g.add(w.tube.mesh);

  // ----- legs: upper and lower leg, three claws, a teal tuft at the elbow -----
  const legGeoA = limbGeometry(0.09, 0.07, 0.42, 10, 6), legGeoB = limbGeometry(0.07, 0.05, 0.36, 10, 6);
  const legs = [10, 10, 44, 44].map((ring, k) => {
    const hip = new THREE.Group();
    const upper = new THREE.Mesh(legGeoA, headMat);
    const knee = new THREE.Group(); knee.position.y = -0.42;
    const lower = new THREE.Mesh(legGeoB, headMat);
    knee.add(lower);
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 6), hornMat);
      claw.position.set(i * 0.05, -0.4, 0.06); claw.rotation.x = Math.PI - 0.6;
      knee.add(claw);
    }
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 8), teal);
    tuft.position.set(0, -0.05, -0.12); tuft.rotation.x = -2.2;
    knee.add(tuft);
    hip.add(upper, knee);
    g.add(hip);
    return { hip, knee, ring, side: k % 2 ? 1 : -1, phase: k * 1.3 };
  });
  // the tail ends in a fan of teal
  const tailFan = Array.from({ length: 5 }, () => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 8), teal); g.add(f); return f; });

  const trail = new Trail();
  const headPos = new THREE.Vector3();
  const vel = new THREE.Vector3(0, 0, 8);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const mBasis = new THREE.Matrix4(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), e = new THREE.Euler();
  const headQ = new THREE.Quaternion();
  let bank = 0;
  const state = { target: new THREE.Vector3(), swoopT: 0, time: 0, seeded: false };

  const ch: Haku = {
    group: g, state, head, vel, maxSpeed: 22,
    setTarget(p) { state.target.copy(p); },
    swoop() { state.swoopT = 3.5; },
    teleport(p, dir) {
      headPos.copy(p); vel.copy(dir).normalize().multiplyScalar(10);
      trail.reset(headPos, vel);
      state.seeded = true;
      head.position.copy(headPos);
      head.quaternion.setFromRotationMatrix(mBasis.lookAt(tmp.set(0, 0, 0), vel, up)).multiply(qA.setFromAxisAngle(up, Math.PI));
      headQ.copy(head.quaternion);
    },
    update(dt, t) {
      state.time = t;
      if (!state.seeded) ch.teleport(state.target.clone().add(tmp.set(0, 0, -20)), tmp2.set(0, 0, 1));
      // steer towards the target with inertia, so the body snakes
      tmp.copy(state.target).sub(headPos);
      const dist = tmp.length();
      const top = ch.maxSpeed + (state.swoopT > 0 ? 12 : 0);
      const desired = tmp.normalize().multiplyScalar(clamp(dist * 1.5, 5, top));
      const prevVel = tmp2.copy(vel);
      vel.lerp(desired, 1 - Math.exp(-dt * 1.7));
      headPos.addScaledVector(vel, dt);
      trail.push(headPos);
      // the head faces where it is flying, turns smoothly and banks into curves
      head.position.copy(headPos);
      if (vel.lengthSq() > 0.01) {
        // Matrix4.lookAt points -z at the target; turn half round so the snout (+z) leads
        mBasis.lookAt(tmp.set(0, 0, 0), vel, up);
        qA.setFromRotationMatrix(mBasis).multiply(qB.setFromAxisAngle(up, Math.PI));
        headQ.slerp(qA, 1 - Math.exp(-dt * 6));
      }
      const turn = prevVel.lengthSq() > 0.01 ? Math.atan2(prevVel.clone().cross(vel).y, prevVel.dot(vel)) / Math.max(dt, 1e-3) : 0;
      bank = lerp(bank, clamp(-turn * 0.5, -0.7, 0.7), 1 - Math.exp(-dt * 3));
      head.quaternion.copy(headQ).multiply(qB.setFromEuler(e.set(Math.sin(t * 2.1) * 0.06, 0, bank + Math.sin(t * 3) * 0.08)));

      // body: rings spaced evenly along the path behind the head, with a swimming wave
      const neck = tmp.set(0, 0, -0.55).applyQuaternion(head.quaternion).add(headPos);
      for (let i = 0; i < N; i++) {
        const p = body.pts[i];
        trail.sample(i * SEG + 0.55, p);
        if (i === 0) p.copy(neck);
        const wave = Math.sin(t * 3.2 - i * 0.22) * 0.18 * Math.min(1, i / 8);
        p.y += wave;
      }
      body.update(up);
      // mane ribbon on top of the body
      for (let i = 0; i < MANE_END; i++) {
        const h = 0.12 + 0.5 * Math.pow(1 - i / MANE_END, 0.8);
        const T = body.T[i], Nn = body.N[i], B = body.B[i], r = body.radii[i], c = body.pts[i];
        const o = i * 6;
        const bx = c.x + Nn.x * r * 0.75, by = c.y + Nn.y * r * 0.75, bz = c.z + Nn.z * r * 0.75;
        const flutter = Math.sin(t * 5 - i * 0.4) * 0.25;
        mPos[o] = bx; mPos[o + 1] = by; mPos[o + 2] = bz;
        mPos[o + 3] = bx + (Nn.x - T.x * 0.9 + B.x * flutter) * h; mPos[o + 4] = by + (Nn.y - T.y * 0.9 + B.y * flutter) * h; mPos[o + 5] = bz + (Nn.z - T.z * 0.9 + B.z * flutter) * h;
        tmp2.copy(B).multiplyScalar(0.5).add(Nn).normalize();
        mNrm.set([tmp2.x, tmp2.y, tmp2.z, tmp2.x, tmp2.y, tmp2.z], o);
      }
      maneGeo.attributes.position.needsUpdate = true;
      maneGeo.attributes.normal.needsUpdate = true;

      // locks and whiskers trail back from the head and ripple
      const hq = head.quaternion;
      const back = tmp2.set(0, 0, -1).applyQuaternion(hq);
      for (const l of locks) {
        const root = new THREE.Vector3(l.side * 0.3, 0.42 - Math.abs(l.side) * 0.12, -0.35).applyQuaternion(hq).add(headPos);
        const n = l.tube.pts.length;
        for (let k = 0; k < n; k++) {
          const f = k / (n - 1);
          l.tube.pts[k].copy(root).addScaledVector(back, f * l.len)
            .add(new THREE.Vector3(l.side * 0.35 * f, 0.25 * f + Math.sin(t * 6 - k * 0.7 + l.side * 2) * 0.12 * f, 0).applyQuaternion(hq));
        }
        l.tube.update(up);
      }
      for (const w of whiskers) {
        const root = new THREE.Vector3(w.side * 0.15, -0.02, 1.55).applyQuaternion(hq).add(headPos);
        const n = w.tube.pts.length;
        for (let k = 0; k < n; k++) {
          const f = k / (n - 1);
          w.tube.pts[k].copy(root).addScaledVector(back, f * 3.4)
            .add(new THREE.Vector3(w.side * (0.25 + 0.5 * f), -0.15 * f + Math.sin(t * 4 - k * 0.6 + w.side) * 0.25 * f, 0).applyQuaternion(hq));
        }
        w.tube.update(up);
      }

      // legs paddle the air
      for (const l of legs) {
        const i = l.ring, T = body.T[i], Nn = body.N[i], B = body.B[i], r = body.radii[i];
        l.hip.position.copy(body.pts[i]).addScaledVector(B, l.side * r * 0.8).addScaledVector(Nn, -r * 0.35);
        mBasis.makeBasis(B, Nn, T);
        qA.setFromRotationMatrix(mBasis);
        const paddle = Math.sin(t * 4.2 + l.phase);
        l.hip.quaternion.copy(qA).multiply(qB.setFromEuler(e.set(0.5 + paddle * 0.55, 0, l.side * 0.55)));
        l.knee.rotation.x = -0.9 - paddle * 0.4;
      }
      tailFan.forEach((f, i) => {
        const end = body.pts[N - 1], T = body.T[N - 1], Nn = body.N[N - 1], B = body.B[N - 1];
        f.position.copy(end);
        mBasis.makeBasis(B, T.clone().negate(), Nn);
        qA.setFromRotationMatrix(mBasis);
        f.quaternion.copy(qA).multiply(qB.setFromEuler(e.set(0, 0, (i - 2) * 0.35 + Math.sin(t * 3 + i) * 0.15)));
        f.translateY(0.35);
      });
      if (state.swoopT > 0) state.swoopT -= dt;
    },
  };
  return ch;
}
