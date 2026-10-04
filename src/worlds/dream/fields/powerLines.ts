import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow } from '../../../engine/Builders';
import { repeatUV } from '../../../engine/Paint';
import { FlexTube, Spring } from '../../../engine/Rig';
import { Rng, clamp } from '../../../engine/math';
import { woodGrain } from '../../ghibli/characterTextures';
import type { Road } from '../layout';
import { SPOTS } from './land';

/*
 * Wooden utility poles and their wires.
 *
 * The main line runs beside the lane. Each pole carries three wires: one on an insulator on the pole's top,
 * and two on the ends of a crossarm a little lower. The Catbus runs along the top wire, so that wire is
 * built along the ride's path itself: it is exactly under the Catbus's paws. Between poles it hangs a little
 * higher than the path, and the span the Catbus is on is pulled down into a V under its weight, so the
 * wire dips where it steps. A span it has just left springs back and shivers.
 *
 * The line starts at a corner pole (z -348), where a line across the fields from the left joins it, and
 * ends at a pole at the edge of the wood (z -588), held by a guy wire. Other lines cross the fields: a
 * telephone line across the valley (the owl sits on one of its poles) and a line along the far right side.
 */

/** z of every pole on the main line. */
export const POLES = [-348, -364, -396, -428, -460, -492, -524, -556, -588];
/** poles with a street lamp hanging over the lane */
const LAMP_POLES = [-396, -524];

export interface PowerLines {
  group: THREE.Group;
  /** the top wire the Catbus runs on (rebuilt each frame near the rider) */
  topWire: THREE.Mesh;
  /** bulbs of the street lamps (world), the bus stop's lamp is the one at z -524 */
  lamps: THREE.Vector3[];
  /** the cap of the telephone pole the owl perches on (world) */
  owlSeat: THREE.Vector3;
  /** the lamp shades' glowing bulbs, so a scene can make them flare */
  bulbs: THREE.MeshBasicMaterial;
  update(dt: number, riderZ: number): void;
}

export function buildPowerLines(road: Road, groundAt: (x: number, z: number) => number, seed = 5150): PowerLines {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const woodTex = woodGrain(0x6e5c4a, 5151);
  const wood = new THREE.MeshLambertMaterial({ map: woodTex });
  const armWood = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
  const porcelain = new THREE.MeshLambertMaterial({ color: 0xe6e2d8, emissive: 0x181a20 });
  const metal = new THREE.MeshLambertMaterial({ color: 0x4a4e54 });
  const yellow = new THREE.MeshLambertMaterial({ color: 0xe0b428, emissive: 0x201800 });
  const wireMat = new THREE.MeshLambertMaterial({ color: 0x23252a });
  const shadeOut = new THREE.MeshLambertMaterial({ color: 0x2f4a3c });
  const shadeIn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d0).multiplyScalar(1.15), side: THREE.BackSide });
  const bulbs = glow(0xffd890, 2.4);
  const up = new THREE.Vector3(0, 1, 0);
  const wires: THREE.BufferGeometry[] = [];
  const lamps: THREE.Vector3[] = [];

  /** A wire hanging between two points, sagging `sag` below their middle. */
  const wire = (a: THREE.Vector3, b: THREE.Vector3, sag: number, r = 0.035, segs = 18) => {
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= sag * 2;
    wires.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), segs, r, 5, false));
  };
  /** A box between two points (a crossarm, a brace). */
  const beam = (a: THREE.Vector3, b: THREE.Vector3, w: number, mat: THREE.Material) => {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    m.castShadow = true;
    statics.add(m);
    return m;
  };
  /** A white porcelain pin insulator whose top is at `p`. */
  const insulator = (p: THREE.Vector3, s = 1) => {
    const g = new THREE.LatheGeometry([
      new THREE.Vector2(0.03, -0.34), new THREE.Vector2(0.03, -0.24), new THREE.Vector2(0.1, -0.22), new THREE.Vector2(0.12, -0.17),
      new THREE.Vector2(0.07, -0.15), new THREE.Vector2(0.1, -0.11), new THREE.Vector2(0.09, -0.05), new THREE.Vector2(0.05, 0), new THREE.Vector2(0.001, 0.01),
    ], 10);
    g.scale(s, s, s);
    const m = new THREE.Mesh(g, porcelain);
    m.position.copy(p);
    statics.add(m);
  };
  /**
   * A pole standing at (x, z) whose top insulator holds a wire at `topY`. `along` is the line's direction;
   * the crossarm runs across it. Returns the three wire points (top, left end, right end).
   */
  const pole = (x: number, z: number, topY: number, along: THREE.Vector3, o: { arm?: number; armDrop?: number; r?: number; steps?: boolean; pin?: boolean } = {}) => {
    const base = groundAt(x, z) - 0.3;
    const r = o.r ?? 0.15, h = topY - 0.36 - base;
    const geo = repeatUV(new THREE.CylinderGeometry(r * 0.8, r, h, 9), 1, h / 3);
    const m = new THREE.Mesh(geo, wood);
    m.position.set(x, base + h / 2, z);
    m.rotation.y = rng.range(0, Math.PI * 2);
    m.castShadow = true;
    statics.add(m);
    // a tarred cap on the top
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.08, 9), metal);
    cap.position.set(x, base + h + 0.02, z);
    statics.add(cap);
    const top = new THREE.Vector3(x, topY - 0.06, z);
    if (o.pin !== false) insulator(top, 1);
    const side = new THREE.Vector3().crossVectors(along, up).normalize();
    const armY = topY - (o.armDrop ?? 1.25), half = (o.arm ?? 4.6) / 2;
    const a0 = new THREE.Vector3(x, armY, z).addScaledVector(side, -half), a1 = new THREE.Vector3(x, armY, z).addScaledVector(side, half);
    beam(a0, a1, 0.15, armWood);
    // braces from the pole up to the crossarm
    for (const s of [-1, 1]) beam(new THREE.Vector3(x, armY - 0.85, z), new THREE.Vector3(x, armY, z).addScaledVector(side, s * half * 0.5), 0.06, metal);
    const ends: THREE.Vector3[] = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Vector3(x, armY + 0.38, z).addScaledVector(side, s * (half - 0.25));
      insulator(p, 0.9);
      ends.push(p);
    }
    // climbing pegs up the pole
    if (o.steps !== false) {
      for (let y = base + 2.6, k = 0; y < armY - 1.2; y += 0.48, k++) {
        const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 5), metal);
        const a = (k % 2 ? 1 : -1) * Math.PI / 2 + Math.atan2(along.x, along.z);
        peg.position.set(x + Math.sin(a) * (r + 0.16), y, z + Math.cos(a) * (r + 0.16));
        peg.rotation.set(Math.PI / 2, a, 0, 'YXZ');
        statics.add(peg);
      }
    }
    return { top, left: ends[0], right: ends[1], base, side };
  };
  /** A guy wire from high on a pole down to the ground, with the yellow guard over its lower end. */
  const guy = (from: THREE.Vector3, gx: number, gz: number) => {
    const to = new THREE.Vector3(gx, groundAt(gx, gz), gz);
    wire(from, to, 0.02, 0.025, 4);
    const dir = from.clone().sub(to).normalize();
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8), yellow);
    sleeve.position.copy(to).addScaledVector(dir, 1.2);
    sleeve.quaternion.setFromUnitVectors(up, dir);
    statics.add(sleeve);
  };
  /** A street lamp on an arm from a pole: an enamel shade over a bare bulb. Returns the bulb. */
  const lamp = (x: number, z: number, side: THREE.Vector3, y: number) => {
    const out = side.clone().multiplyScalar(-1);
    const a = new THREE.Vector3(x, y, z), b = a.clone().addScaledVector(out, 1.6).add(new THREE.Vector3(0, 0.25, 0));
    beam(a, b, 0.05, metal);
    const shade = new THREE.ConeGeometry(0.42, 0.3, 14, 1, true);
    const so = new THREE.Mesh(shade, shadeOut); so.position.copy(b).add(new THREE.Vector3(0, -0.12, 0)); statics.add(so);
    const si = new THREE.Mesh(shade, shadeIn); si.position.copy(so.position); statics.add(si);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), bulbs);
    bulb.position.copy(b).add(new THREE.Vector3(0, -0.26, 0));
    statics.add(bulb);
    return bulb.position.clone();
  };

  // ---------- the main line ----------
  const spans: Array<{ top: THREE.Vector3; left: THREE.Vector3; right: THREE.Vector3; side: THREE.Vector3 }> = [];
  for (const z of POLES) {
    const p = road.at(z);
    const along = new THREE.Vector3(p.rz, 0, -p.rx).normalize(); // the direction of travel (right x up)
    const P = pole(p.x, z, p.y, along.clone().negate());
    spans.push({ top: P.top, left: P.left, right: P.right, side: P.side });
    if (LAMP_POLES.includes(z)) lamps.push(lamp(p.x, z, new THREE.Vector3(p.rx, 0, p.rz), P.base + 6.4));
  }
  // the two lower wires hang straight from crossarm to crossarm
  for (let i = 0; i < spans.length - 1; i++) {
    const sag = POLES[i] - POLES[i + 1] > 20 ? 0.55 : 0.25;
    wire(spans[i].left, spans[i + 1].left, sag);
    wire(spans[i].right, spans[i + 1].right, sag);
  }
  // a transformer drum on the pole by the camphor tree
  {
    const p = road.at(-460);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), new THREE.MeshLambertMaterial({ color: 0x7a8288 }));
    t.position.set(p.x + p.rx * 0.6, p.y - 3.4, -460 + p.rz * 0.6);
    t.castShadow = true;
    statics.add(t);
  }
  // guy wires: the corner pole is pulled two ways, the last pole only one
  {
    const c = road.at(-348);
    guy(new THREE.Vector3(c.x, c.y - 1.6, -348), c.x + 4.4, -343.5);
    const e = road.at(-588);
    guy(new THREE.Vector3(e.x, e.y - 1.6, -588), e.x + 2.6, -595.5);
  }

  // ---------- the line across the fields from the left, into the corner pole ----------
  {
    const corner = road.at(-348);
    // a second crossarm on the corner pole, across the incoming line
    const cz = new THREE.Vector3(1, 0, 0);
    const armY = corner.y - 1.85;
    const c0 = new THREE.Vector3(corner.x, armY, -348 - 2.05), c1 = new THREE.Vector3(corner.x, armY, -348 + 2.05);
    beam(c0, c1, 0.15, armWood);
    insulator(c0.clone().add(new THREE.Vector3(0, 0.38, 0.25)), 0.9);
    insulator(c1.clone().add(new THREE.Vector3(0, 0.38, -0.25)), 0.9);
    let prev = { top: new THREE.Vector3(corner.x, corner.y - 0.06, -348), left: c1.clone().add(new THREE.Vector3(0, 0.38, -0.25)), right: c0.clone().add(new THREE.Vector3(0, 0.38, 0.25)) };
    for (let k = 0; k < 7; k++) {
      const x = -30 - k * 32 + rng.range(-2, 2), z = -350 - k * 3.5 + rng.range(-1, 1);
      const base = groundAt(x, z);
      const P = pole(x, z, base + 10.3, cz.clone().negate());
      wire(prev.top, P.top, 0.6); wire(prev.left, P.left, 0.6); wire(prev.right, P.right, 0.6);
      prev = { top: P.top, left: P.left, right: P.right };
    }
  }

  // ---------- the telephone line across the valley; the owl sits on the pole right of the line ----------
  let owlSeat = new THREE.Vector3();
  const crossTops: THREE.Vector3[][] = [];
  {
    const xs: number[] = [];
    for (let x = SPOTS.owlPole.x; x < 160; x += 31 + rng.range(-3, 3)) xs.push(x);
    for (let x = SPOTS.owlPole.x - 31; x > -170; x -= 31 + rng.range(-3, 3)) { if (Math.abs(x + 3) < 7) x -= 9; xs.unshift(x); }
    for (const x of xs) {
      const z = SPOTS.owlPole.z + (x - SPOTS.owlPole.x) * 0.03 + rng.range(-1, 1);
      const base = groundAt(x, z);
      const topY = base + 8.6;
      const P = pole(x, z, topY, new THREE.Vector3(1, 0, 0.03).normalize(), { arm: 1.6, armDrop: 0.7, r: 0.12, steps: false, pin: false });
      crossTops.push([P.left, P.right]);
      // the owl stands on the pole's cap
      if (Math.abs(x - SPOTS.owlPole.x) < 0.01) owlSeat = new THREE.Vector3(x, topY - 0.3, z);
    }
    for (let i = 0; i < crossTops.length - 1; i++) for (let k = 0; k < 2; k++) wire(crossTops[i][k], crossTops[i + 1][k], 0.7, 0.028);
  }

  // ---------- a line down the far right side of the valley ----------
  {
    let prev: ReturnType<typeof pole> | null = null;
    for (let z = -296; z > -600; z -= 34) {
      const x = 142 + Math.sin(z * 0.02) * 6;
      const base = groundAt(x, z);
      const P = pole(x, z, base + 10, new THREE.Vector3(0, 0, -1), { steps: false });
      if (prev) { wire(prev.top, P.top, 0.6); wire(prev.left, P.left, 0.6); wire(prev.right, P.right, 0.6); }
      prev = P;
    }
  }

  // ---------- service wires from the main line to the houses beside the lane ----------
  for (const [pz, hx, hz] of [[-396, 29, -402], [-428, -28, -440], [-556, 35, -556]] as const) {
    const p = road.at(pz);
    const from = new THREE.Vector3(p.x, p.y - 2.6, pz), to = new THREE.Vector3(hx, groundAt(hx, hz) + 3.9, hz);
    for (const dz of [-0.2, 0.2]) wire(from.clone().add(new THREE.Vector3(0, 0, dz)), to.clone().add(new THREE.Vector3(0, 0, dz)), 0.8, 0.022, 14);
  }

  const wireMesh = new THREE.Mesh(mergeGeometries(wires, false)!, wireMat);
  wireMesh.userData.keep = true;
  statics.add(wireMesh);

  // ---------- the top wire, along the path ----------
  const Z0 = POLES[0], Z1 = POLES[POLES.length - 1], STEP = 0.5;
  const n = Math.round((Z0 - Z1) / STEP) + 1;
  const tube = new FlexTube(n, 6, () => 0.05, wireMat);
  tube.mesh.castShadow = true;
  tube.mesh.userData.keep = true;
  group.add(tube.mesh);
  // for each point: where it is on the path, which span it is in and how far along it
  const restY: number[] = [], spanOf: number[] = [], frac: number[] = [];
  const SAG = POLES.slice(0, -1).map((z, i) => (z - POLES[i + 1] > 20 ? 0.32 : 0.1));
  for (let i = 0; i < n; i++) {
    const z = Z0 - i * STEP;
    const p = road.at(z);
    tube.pts[i].set(p.x, p.y - 0.05, z);
    let s = 0;
    while (s < POLES.length - 2 && z < POLES[s + 1]) s++;
    spanOf.push(s);
    frac.push(clamp((POLES[s] - z) / (POLES[s] - POLES[s + 1]), 0, 1));
    restY.push(p.y - 0.05);
  }
  const wobble = SAG.map(() => new Spring(0, 1.8, 0.07));
  let lastZ = Infinity, lastSpan = -1, settled = false;
  const spanAt = (z: number) => { let s = 0; while (s < POLES.length - 2 && z < POLES[s + 1]) s++; return s; };

  const update = (dt: number, zr: number) => {
    const onWire = zr <= Z0 + 0.5 && zr >= Z1;
    const span = onWire ? spanAt(zr) : -1;
    // the Catbus lands on the corner pole: the first spans bounce; leaving a span lets it spring back
    if (Math.abs(zr - lastZ) < 6) {
      if (lastZ > Z0 && zr <= Z0) { wobble[0].v += 2.6; wobble[1].v += 1.6; }
      if (lastSpan >= 0 && span !== lastSpan) wobble[lastSpan].v -= 1.4;
    }
    lastZ = zr; lastSpan = span;
    let moving = onWire;
    const amps = wobble.map((w) => { const a = w.update(0, dt); if (Math.abs(a) > 0.002 || Math.abs(w.v) > 0.01) moving = true; return a; });
    if (!moving && settled) return;
    settled = !moving;
    // how far the wire is pulled down under the Catbus: just enough to meet its paws
    const fr = span >= 0 ? clamp((POLES[span] - zr) / (POLES[span] - POLES[span + 1]), 0, 1) : 0;
    const load = span >= 0 ? SAG[span] * Math.sin(Math.PI * fr) : 0;
    for (let i = 0; i < n; i++) {
      const s = spanOf[i], f = frac[i];
      const shape = Math.sin(Math.PI * f);
      let y = restY[i] + SAG[s] * shape - amps[s] * shape;
      if (s === span) {
        const z = Z0 - i * STEP, za = POLES[s], zb = POLES[s + 1];
        const v = z >= zr ? (za - z) / Math.max(0.01, za - zr) : (z - zb) / Math.max(0.01, zr - zb);
        y -= load * clamp(v, 0, 1);
      }
      tube.pts[i].y = y;
    }
    tube.update();
  };
  update(0, Infinity);

  return { group, topWire: tube.mesh, lamps, owlSeat, bulbs, update };
}
