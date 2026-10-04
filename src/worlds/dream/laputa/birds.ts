import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon, Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';

/*
 * White birds for Laputa, drawn as three instanced meshes (bodies, left wings, right wings) however many
 * there are. Each bird is placed every frame by whoever owns it: `set(i, pos, heading, bank, flap)`.
 */

/** A dove's wing seen from above on a transparent canvas: white, with pale grey feather tips. Root on the left. */
function doveWing() {
  const p = new Painter(256, 96, 611);
  const g = p.g;
  g.beginPath();
  g.moveTo(0, 20); g.quadraticCurveTo(130, 6, 252, 34); g.lineTo(256, 44);
  g.quadraticCurveTo(170, 74, 50, 84); g.lineTo(0, 74); g.closePath();
  g.save(); g.clip();
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, '#f4f2ec'); gr.addColorStop(0.75, '#e8e8e4'); gr.addColorStop(1, '#a8acb4');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = 'rgba(120,124,136,0.45)'; g.lineWidth = 2;
  for (let i = 0; i < 15; i++) { const x = 18 + i * 15; g.beginPath(); g.moveTo(x, 46); g.lineTo(x + 9, 84); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, 0, 210, 24);
  g.restore();
  return p.texture({ wrap: false });
}

const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);

export class Birds {
  readonly group = new THREE.Group();
  readonly count: number;
  private body: THREE.InstancedMesh;
  private wingL: THREE.InstancedMesh;
  private wingR: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private w = new THREE.Matrix4();
  private wl = new THREE.Matrix4();

  constructor(count: number, size = 1) {
    this.count = count;
    const white = charToon({ color: 0xf4f2ee, rim: 0.35, shade: 0xb0b4d0 });
    const wing = charToon({ map: doveWing(), side: THREE.DoubleSide, alphaTest: 0.5, rim: 0.25, shade: 0xb0b4d0 });
    // body, head and a fanned tail as one geometry; beak and eyes are too small to matter at a distance
    const tail = new THREE.ConeGeometry(0.16, 0.42, 4).rotateX(-Math.PI / 2).scale(1, 0.25, 1).translate(0, 0.02, -0.42);
    const bodyGeo = mergeGeometries([
      new THREE.SphereGeometry(1, 12, 8).scale(0.13, 0.12, 0.32),
      new THREE.SphereGeometry(0.1, 10, 8).translate(0, 0.08, 0.3),
      new THREE.ConeGeometry(0.03, 0.09, 5).rotateX(Math.PI / 2).translate(0, 0.07, 0.42),
      tail,
    ].map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }))!;
    bodyGeo.scale(size, size, size);
    const wingGeo = new THREE.PlaneGeometry(0.95, 0.38).rotateX(Math.PI / 2).translate(0.475, 0, 0.02).scale(size, size, size);
    this.body = new THREE.InstancedMesh(bodyGeo, white, count);
    this.wingL = new THREE.InstancedMesh(wingGeo, wing, count);
    this.wingR = new THREE.InstancedMesh(wingGeo, wing, count);
    for (const im of [this.body, this.wingL, this.wingR]) { im.frustumCulled = false; im.castShadow = false; this.group.add(im); }
    // start everyone far below, out of sight, until placed
    for (let i = 0; i < count; i++) this.set(i, new THREE.Vector3(0, -500, 0), 0, 0, 0);
    this.commit();
  }

  /** Place bird i at pos, heading (yaw, 0 = +z), bank (roll) and wing angle (+ up). */
  set(i: number, pos: THREE.Vector3, heading: number, bank: number, flap: number, scale = 1) {
    const { m, q, e, s, w, wl } = this;
    e.set(0, heading, bank, 'YXZ');
    q.setFromEuler(e);
    s.setScalar(scale);
    m.compose(pos, q, s);
    this.body.setMatrixAt(i, m);
    // wings hinge at the shoulders; the left one is the right one mirrored
    wl.makeRotationZ(flap);
    w.multiplyMatrices(m, wl);
    this.wingR.setMatrixAt(i, w);
    wl.makeRotationZ(flap).premultiply(MIRROR);
    w.multiplyMatrices(m, wl);
    this.wingL.setMatrixAt(i, w);
  }

  commit() {
    this.body.instanceMatrix.needsUpdate = true;
    this.wingL.instanceMatrix.needsUpdate = true;
    this.wingR.instanceMatrix.needsUpdate = true;
  }
}

/** One bird's circling path round a centre: radius, height, speed (rad/s, sign = direction), phase, bob. */
export interface Circler { cx: number; cz: number; r: number; y: number; speed: number; phase: number; bob: number; flapRate: number }

export function circlers(n: number, rng: Rng, o: { cx: number; cz: number; r: [number, number]; y: [number, number]; speed: [number, number] }) {
  const out: Circler[] = [];
  const dir = rng.sign();
  for (let i = 0; i < n; i++) out.push({ cx: o.cx, cz: o.cz, r: rng.range(o.r[0], o.r[1]), y: rng.range(o.y[0], o.y[1]), speed: rng.range(o.speed[0], o.speed[1]) * dir, phase: rng.range(0, TAU), bob: rng.range(1, 4), flapRate: rng.range(7, 10) });
  return out;
}

const tmp = new THREE.Vector3();
/**
 * Where a circling bird is at time t: on its ring, gliding most of the time and flapping in short bursts.
 * `spread` (0..) pushes the ring out and up, for a startled flock.
 */
export function circlePose(c: Circler, t: number, spread = 0) {
  const a = t * c.speed + c.phase;
  const r = c.r * (1 + spread * 0.5), y = c.y + spread * 14 + Math.sin(t * 0.5 + c.phase) * c.bob;
  tmp.set(c.cx + Math.cos(a) * r, y, c.cz + Math.sin(a) * r);
  // moving round the circle: the tangent direction
  const heading = Math.atan2(-Math.sin(a) * Math.sign(c.speed), Math.cos(a) * Math.sign(c.speed));
  const burst = Math.max(0, Math.sin(t * 0.45 + c.phase * 3)) > 0.6 || spread > 0.2;
  const flap = burst ? Math.sin(t * c.flapRate + c.phase) * 0.7 : 0.12 + Math.sin(t * 1.3 + c.phase) * 0.05;
  return { pos: tmp, heading, bank: -0.35 * Math.sign(c.speed), flap };
}
