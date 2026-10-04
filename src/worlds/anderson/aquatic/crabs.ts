import * as THREE from 'three';
import { Painter, charToon } from '../../../engine/Paint';
import { envelope } from '../../../engine/Rig';
import { Rng, TAU, damp } from '../../../engine/math';
import { StopMotion } from '../stopmotion';
import { colorize, mergeParts, tubeAB } from './geo';

/*
 * The sugar crabs: little crabs with candy-striped shells, scuttling sideways on a flat rock beside the path.
 * Throw a box onto the rock and they all rush to it and crowd round; whistle and they put their claws up and
 * wave them. Three instanced meshes (shells, legs, claws), posed on twos.
 */

function candyStripes() {
  const W = 256, H = 128;
  const p = new Painter(W, H, 1301).fill('#ffffff');
  const g = p.g;
  // stripes running over the back from front to rear (across u on a sphere)
  for (let x = 0; x < W; x += 26) { g.fillStyle = '#e8e2ea'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, 0); g.lineTo(x + 22, H); g.lineTo(x + 10, H); g.closePath(); g.fill(); }
  p.vgrad([[0, 'rgba(255,255,255,0.5)'], [0.35, 'rgba(255,255,255,0)'], [1, 'rgba(60,40,60,0.25)']]);
  // a sugary sparkle
  p.dabs({ n: 120, colors: ['#ffffff'], r: [0.6, 1.4], alpha: [0.5, 0.9] });
  return p.texture();
}

function legsGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const z = -0.08 + k * 0.08;
      const hip = V(s * 0.17, 0.1, z), knee = V(s * 0.34, 0.17, z + (k - 1) * 0.04), foot = V(s * 0.42, 0.0, z + (k - 1) * 0.07);
      parts.push(colorize(tubeAB(hip, knee, 0.022, 0.018, 4, true), 0.9), colorize(tubeAB(knee, foot, 0.018, 0.008, 4, true), 0.85));
    }
    // eye stalks with black eyes
    const base = V(s * 0.05, 0.16, 0.12), top = V(s * 0.08, 0.3, 0.15);
    parts.push(colorize(tubeAB(base, top, 0.012, 0.012, 4, true), 0.95));
    parts.push(colorize(new THREE.SphereGeometry(0.03, 6, 4).translate(top.x, top.y, top.z), () => [0.06, 0.05, 0.08]));
  }
  return mergeParts(parts);
}

/** both claws on short arms, pivoting at the front of the shell (origin), for the "claws up" wave */
function clawsGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Vector3(s * 0.12, 0, 0), el = new THREE.Vector3(s * 0.22, 0.04, 0.1);
    parts.push(tubeAB(sh, el, 0.025, 0.022, 4, true));
    const pincer = new THREE.SphereGeometry(1, 8, 6);
    pincer.scale(0.06, 0.04, 0.085).translate(el.x, el.y, el.z + 0.08);
    parts.push(pincer);
    const finger = new THREE.ConeGeometry(0.022, 0.09, 4);
    finger.rotateX(Math.PI / 2).translate(el.x + s * 0.02, el.y + 0.02, el.z + 0.18);
    parts.push(finger);
  }
  return mergeParts(parts.map((g) => colorize(g, 1)));
}

export class SugarCrabs {
  readonly group = new THREE.Group();
  readonly anchor = new THREE.Object3D();
  private shells: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private claws: THREE.InstancedMesh;
  private crabs: Array<{ home: THREE.Vector3; p: THREE.Vector3; yaw: number; ph: number; dir: number; s: number }> = [];
  private sm = new StopMotion(12, 1303);
  private rushT = 9;
  private rushTo = new THREE.Vector3();
  private waveT = 9;
  private centre: THREE.Vector3;
  private r: number;

  constructor(n: number, centre: THREE.Vector3, radius: number) {
    this.centre = centre.clone();
    this.r = radius;
    const rng = new Rng(1307);
    const shellMat = charToon({ map: candyStripes(), rim: 0.45 });
    const legMat = charToon({ vertexColors: true, rim: 0.3 });
    const shellGeo = new THREE.SphereGeometry(1, 16, 10);
    shellGeo.scale(0.2, 0.11, 0.16).translate(0, 0.12, 0);
    this.shells = new THREE.InstancedMesh(shellGeo, shellMat, n);
    this.legs = new THREE.InstancedMesh(legsGeo(), legMat, n);
    this.claws = new THREE.InstancedMesh(clawsGeo(), legMat, n);
    const cols = [0xff7aa8, 0x6fe0c0, 0xffd04a, 0xb48af0, 0xff9a6a, 0x7ab8ff];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.range(-0.3, 0.3), d = rng.range(0.4, radius * 0.75);
      const home = new THREE.Vector3(centre.x + Math.cos(a) * d, centre.y, centre.z + Math.sin(a) * d * 0.8);
      this.crabs.push({ home, p: home.clone(), yaw: rng.range(0, TAU), ph: rng.range(0, TAU), dir: rng.sign(), s: rng.range(2.5, 3.2) });
      const c = new THREE.Color(cols[i % cols.length]);
      this.shells.setColorAt(i, c);
      this.legs.setColorAt(i, c.clone().lerp(new THREE.Color(0xffffff), 0.35));
      this.claws.setColorAt(i, c.clone().multiplyScalar(0.9));
    }
    for (const m of [this.shells, this.legs, this.claws]) { m.frustumCulled = false; m.castShadow = true; this.group.add(m); }
    this.anchor.position.copy(centre);
    this.write(0);
  }

  /** Rush to a point (if it is on the rock). Returns true if they went. */
  rush(p: THREE.Vector3) {
    if (Math.hypot(p.x - this.centre.x, p.z - this.centre.z) > this.r * 1.4) return false;
    this.rushTo.set(p.x, this.centre.y, p.z);
    this.rushT = 0;
    return true;
  }
  wave() { this.waveT = 0; }

  update(dt: number, t: number) {
    this.rushT += dt; this.waveT += dt;
    const rushing = this.rushT < 6;
    this.crabs.forEach((c, i) => {
      // sideways scuttling about home, or a dash to the box and a crowd round it
      let gx: number, gz: number;
      if (rushing) {
        const a = (i / this.crabs.length) * TAU;
        gx = this.rushTo.x + Math.cos(a) * 0.55; gz = this.rushTo.z + Math.sin(a) * 0.55;
      } else {
        const s = Math.sin(t * 0.8 + c.ph);
        gx = c.home.x + Math.cos(c.yaw) * s * 0.7 * c.dir; gz = c.home.z - Math.sin(c.yaw) * s * 0.7 * c.dir;
      }
      const k = rushing ? 2.6 : 1.4;
      c.p.x = damp(c.p.x, gx, k, dt); c.p.z = damp(c.p.z, gz, k, dt);
      if (rushing) c.yaw = damp(c.yaw, Math.atan2(this.rushTo.x - c.p.x, this.rushTo.z - c.p.z) + Math.PI / 2, 4, dt);
    });
    if (this.sm.tick(dt)) this.write(this.sm.t);
  }

  private write(t: number) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const claw = new THREE.Matrix4();
    const lift = envelope(this.waveT, 0, 0.35, 2.6, 3.2) + (this.rushT < 6 ? 0.5 * envelope(this.rushT, 0.8, 1.2, 5.2, 6) : 0);
    this.crabs.forEach((c, i) => {
      const bob = Math.abs(Math.sin(t * 16 + c.ph)) * 0.02;
      e.set(0, c.yaw, Math.sin(t * 16 + c.ph) * 0.06);
      q.setFromEuler(e);
      s.setScalar(c.s);
      p.set(c.p.x, c.p.y + bob, c.p.z);
      m4.compose(p, q, s);
      this.shells.setMatrixAt(i, m4);
      this.legs.setMatrixAt(i, m4);
      // the claws swing up about the front of the shell and wave
      const wav = lift * (1.1 + Math.sin(t * 9 + c.ph) * 0.35);
      claw.makeRotationX(-wav).premultiply(new THREE.Matrix4().makeTranslation(0, 0.12, 0.12));
      this.claws.setMatrixAt(i, m4.clone().multiply(claw));
    });
    for (const m of [this.shells, this.legs, this.claws]) m.instanceMatrix.needsUpdate = true;
    if (this.shells.instanceColor) this.shells.instanceColor.needsUpdate = true;
  }
}
