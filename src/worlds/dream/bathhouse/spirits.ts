import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon, Painter } from '../../../engine/Paint';
import { outline, Spring } from '../../../engine/Rig';
import { clamp, Rng, TAU } from '../../../engine/math';
import { fabric } from '../../ghibli/characterTextures';

/*
 * The Kasuga spirits: tall, silent guests of the bathhouse in pale robes, each with a paper mask over its
 * face (two drawn eyes, high painted eyebrows, a small red mouth) and a black lacquered cap. They walk in a
 * slow line from the ferry along the quay, up the long stair and in at the bathhouse's entrance. Played
 * the ocarina, they all turn their masks towards you.
 *
 * Every spirit shares the same few geometries and materials; one spirit is four draw calls.
 */

/** The paper mask, for a curved plane facing +z. */
function kasugaMask() {
  const W = 256, H = 320;
  const p = new Painter(W, H, 7961);
  const g = p.g;
  g.clearRect(0, 0, W, H);
  const oval = () => { g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.47, H * 0.48, 0, 0, TAU); };
  const gr = g.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H / 2, W * 0.62);
  gr.addColorStop(0, '#fbf8f0'); gr.addColorStop(0.75, '#efe9dc'); gr.addColorStop(1, '#cfc8bc');
  g.fillStyle = gr; oval(); g.fill();
  g.save(); oval(); g.clip();
  p.lines({ n: 26, colors: ['#e2dccd', '#ffffff'], alpha: [0.2, 0.5], width: [0.6, 1.6], wobble: 5 });
  g.restore();
  // painted eyebrows: soft dark smudges high on the forehead
  for (const s of [-1, 1]) {
    const bg = g.createRadialGradient(W / 2 + s * 42, 70, 2, W / 2 + s * 42, 70, 22);
    bg.addColorStop(0, 'rgba(30,24,30,0.95)'); bg.addColorStop(1, 'rgba(30,24,30,0)');
    g.fillStyle = bg; g.beginPath(); g.ellipse(W / 2 + s * 42, 70, 24, 14, 0, 0, TAU); g.fill();
  }
  // the eyes: long, calm, half-closed arcs with a dark pupil under each lid
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const x = W / 2 + s * 50, y = 148;
    g.strokeStyle = '#1a1418'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(x - 32, y + 4); g.quadraticCurveTo(x, y - 14, x + 32, y + 4); g.stroke();
    g.fillStyle = '#1a1418'; g.beginPath(); g.ellipse(x, y + 1, 9, 6, 0, 0, TAU); g.fill();
    g.lineWidth = 3; g.beginPath(); g.moveTo(x - 26, y + 12); g.quadraticCurveTo(x, y + 18, x + 26, y + 12); g.stroke();
  }
  // a pale nose line and a small red mouth
  g.strokeStyle = 'rgba(150,130,120,0.6)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(W / 2, 176); g.quadraticCurveTo(W / 2 - 6, 200, W / 2 + 4, 206); g.stroke();
  g.fillStyle = '#b02a24'; g.beginPath(); g.ellipse(W / 2, 246, 13, 7, 0, 0, TAU); g.fill();
  // a faint blush
  for (const s of [-1, 1]) {
    const bg = g.createRadialGradient(W / 2 + s * 66, 200, 2, W / 2 + s * 66, 200, 26);
    bg.addColorStop(0, 'rgba(230,140,130,0.35)'); bg.addColorStop(1, 'rgba(230,140,130,0)');
    g.fillStyle = bg; g.fillRect(W / 2 + s * 66 - 30, 170, 60, 60);
  }
  return p.texture({ wrap: false });
}

let shared: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  // the robe: a tall bell from a wide hem up to sloping shoulders, with long drooping sleeves
  const prof: THREE.Vector2[] = [];
  const keys: Array<[number, number]> = [[0.0, 0.001], [0.0, 0.92], [0.12, 0.95], [0.9, 0.82], [1.7, 0.66], [2.25, 0.6], [2.45, 0.48], [2.55, 0.22], [2.58, 0.001]];
  for (const [y, r] of keys) prof.push(new THREE.Vector2(r, y));
  const robe = new THREE.LatheGeometry(prof, 24).rotateY(Math.PI);
  const sleeves = [-1, 1].map((s) => {
    const sl = new THREE.SphereGeometry(1, 14, 10);
    sl.scale(0.32, 0.95, 0.42).rotateZ(s * 0.14).translate(s * 0.66, 1.6, 0.12);
    return sl;
  });
  const parts = [robe, ...sleeves].map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  const body = mergeGeometries(parts)!;
  body.computeVertexNormals();
  // the mask: gently curved so it catches the light
  const mask = new THREE.PlaneGeometry(0.78, 0.98, 12, 12);
  const mp = mask.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), y = mp.getY(i); mp.setZ(i, -x * x * 0.9 - y * y * 0.12); }
  mask.computeVertexNormals();
  // the cap: a tall black lacquered hat that leans back a little
  const cap = new THREE.CylinderGeometry(0.2, 0.34, 0.75, 14).translate(0, 0.38, 0).rotateX(-0.22);
  const head = new THREE.SphereGeometry(0.36, 16, 12);
  const maskTex = kasugaMask();
  return {
    body, mask, cap, head,
    robeMat: charToon({ map: fabric(0xeee2bc, { folds: 10, hem: true, seed: 81, stripes: { color: 0xe0cfa0, count: 3, width: 6 } }), emissive: 0x1a1810, rim: 0.5, shade: 0x9a9cc8 }),
    headMat: charToon({ color: 0x3a2a3e, rim: 0.4 }),
    maskMat: charToon({ map: maskTex, emissive: 0x302c2c, emissiveMap: maskTex, alphaTest: 0.5, rim: 0.15, shade: 0xb4b4d0, side: THREE.DoubleSide }),
    capMat: charToon({ color: 0x141216, rim: 0.5 }),
  };
}

export interface Kasuga {
  group: THREE.Group;
  /** the head (mask, hood and cap), which turns to look */
  head: THREE.Group;
}

export function makeKasuga(): Kasuga {
  const S = shared ?? (shared = makeShared());
  const g = new THREE.Group();
  const body = new THREE.Mesh(S.body, S.robeMat);
  body.castShadow = true;
  g.add(body);
  outline(body, 0x2a2420, 1.3, 0.03);
  const head = new THREE.Group();
  head.position.y = 2.62;
  g.add(head);
  const hood = new THREE.Mesh(S.head, S.headMat);
  hood.position.set(0, 0.36, -0.04);
  hood.scale.set(1, 1.15, 1);
  head.add(hood);
  const mask = new THREE.Mesh(S.mask, S.maskMat);
  mask.position.set(0, 0.36, 0.38);
  head.add(mask);
  const cap = new THREE.Mesh(S.cap, S.capMat);
  cap.position.set(0, 0.74, -0.08);
  head.add(cap);
  return { group: g, head };
}

/**
 * The line of spirits along a route (a polyline in world space). Where each spirit is along it is driven
 * by a 0..1 progress the set takes from the rider's z, so the procession keeps step with the ride; the
 * walking sway and the turning heads use time.
 */
export class KasugaLine {
  readonly group = new THREE.Group();
  readonly spirits: Array<{ k: Kasuga; s0: number; yaw: Spring; pitch: Spring; phase: number; visible: boolean }> = [];
  private pts: THREE.Vector3[];
  private len: number[] = [0];
  private lookT = 0;
  private lastProgress = -1;
  private walk = 0;
  /** total length of the route */
  readonly total: number;
  /** how far each spirit walks over the whole progress 0..1 */
  readonly travel: number;

  constructor(route: THREE.Vector3[], count: number, travel: number, seed = 1) {
    this.pts = route;
    for (let i = 1; i < route.length; i++) this.len.push(this.len[i - 1] + route[i].distanceTo(route[i - 1]));
    this.total = this.len[this.len.length - 1];
    this.travel = travel;
    const rng = new Rng(seed);
    // the first spirit reaches the end at progress 1; the last one is still below deck at progress 0
    const head0 = this.total - 0.5 - travel, gap = (head0 + 4) / (count - 1);
    for (let i = 0; i < count; i++) {
      const k = makeKasuga();
      const sc = rng.range(0.94, 1.08);
      k.group.scale.setScalar(sc);
      this.group.add(k.group);
      this.spirits.push({ k, s0: head0 - i * gap, yaw: new Spring(0, 0.9, 0.85), pitch: new Spring(0, 0.9, 0.85), phase: rng.range(0, TAU), visible: true });
    }
  }

  /** point and direction at a distance along the route */
  at(s: number, out: THREE.Vector3, dir: THREE.Vector3) {
    const L = this.len;
    let i = 1;
    while (i < L.length - 1 && L[i] < s) i++;
    const a = this.pts[i - 1], b = this.pts[i];
    const t = clamp((s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]), 0, 1);
    out.copy(a).lerp(b, t);
    dir.copy(b).sub(a).setY(0).normalize();
    return out;
  }

  /** all spirits turn their masks to look at the camera for a few seconds */
  look() { this.lookT = 3.2; }

  update(dt: number, t: number, progress: number, cam: THREE.Vector3) {
    if (this.lastProgress < 0) this.lastProgress = progress;
    // how fast the line is moving, for the walking sway (0 when the ride is still)
    const rate = dt > 0 ? Math.abs(progress - this.lastProgress) * this.travel / dt : 0;
    this.lastProgress = progress;
    this.walk += dt * Math.min(1.4, rate) * 2.6;
    if (this.lookT > 0) this.lookT -= dt;
    const p = new THREE.Vector3(), dir = new THREE.Vector3(), local = new THREE.Vector3();
    for (const sp of this.spirits) {
      const s = sp.s0 + progress * this.travel;
      // below the ferry's deck before they climb out; gone into the dark porch at the end
      const on = s > -2.2 && s < this.total - 1.2;
      sp.visible = on;
      sp.k.group.visible = on;
      if (!on) continue;
      this.at(Math.max(0, s), p, dir);
      if (s < 0) p.y += s * 1.1;
      const g = sp.k.group;
      const ph = this.walk + sp.phase;
      g.position.set(p.x, p.y + Math.abs(Math.sin(ph)) * 0.05 * Math.min(1, rate), p.z);
      g.rotation.set(0.05 * Math.min(1, rate), Math.atan2(dir.x, dir.z), Math.sin(ph) * 0.035 * Math.min(1, rate) + Math.sin(t * 0.5 + sp.phase) * 0.01);
      // the heads: calm and still, or turned to the camera
      let ty = Math.sin(t * 0.3 + sp.phase) * 0.08, tp = 0;
      if (this.lookT > 0) {
        g.updateMatrixWorld();
        local.copy(cam); g.worldToLocal(local).sub(sp.k.head.position);
        ty = clamp(Math.atan2(local.x, local.z), -1.5, 1.5);
        tp = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.6, 0.5);
      }
      sp.k.head.rotation.set(sp.pitch.update(tp, dt), sp.yaw.update(ty, dt), 0, 'YXZ');
    }
  }
}
