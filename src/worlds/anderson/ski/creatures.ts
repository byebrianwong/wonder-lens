import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, mergeStatic, sphere } from '../../../engine/Builders';
import { charToon, Painter } from '../../../engine/Paint';
import { envelope, outline, taperedTube } from '../../../engine/Rig';
import { Rng, TAU, clamp, damp } from '../../../engine/math';
import { planks } from '../textures';
import { FUTURA } from '../film';
import { Beat } from './cast';

/*
 * The summit's monks (a row of them, chanting in unison and turning as one), the alpine ibex on its crag,
 * the crowd on the stands of the ski jump, and the three judges in their box with their score cards.
 * The monks and the crowd are instanced: one draw call per material for the lot.
 */

const INK = 0x2a1e24;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);

/** Merge parts (each already placed) into one geometry, keeping only position, normal and uv. */
function merge(parts: THREE.BufferGeometry[]) {
  const clean = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    return n;
  });
  return mergeGeometries(clean, false)!;
}
const placed = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
  g.scale(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g;
};

// ---------------- the monks ----------------
/** A monk's face under the hood: closed eyes, a calm mouth, a little tonsure-dark fringe. Sphere UVs. */
function monkFace() {
  const p = new Painter(256, 128, 901).fill('#f0cdb4');
  const g = p.g;
  p.vgrad([[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(160,90,80,0.35)']]);
  // the face is at u 0.25 (the sphere's front)
  const cx = 64, cy = 64;
  g.strokeStyle = '#4a3028'; g.lineWidth = 3; g.lineCap = 'round';
  for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 13, cy - 2, 7, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  g.beginPath(); g.moveTo(cx - 6, cy + 20); g.quadraticCurveTo(cx, cy + 23, cx + 6, cy + 20); g.stroke();
  g.fillStyle = 'rgba(220,120,110,0.35)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 20, cy + 10, 7, 4, 0, 0, TAU); g.fill(); }
  g.fillStyle = '#5a4030'; g.fillRect(0, 0, 256, 22);
  return p.texture();
}

export interface Monks {
  group: THREE.Group;
  /** where each monk stands and the way he faces at rest */
  spots: Array<{ pos: THREE.Vector3; yaw: number }>;
  /** turn as one towards a point, and bow */
  turnTo(target: THREE.Vector3): void;
  readonly turning: boolean;
  update(dt: number, t: number): void;
}

export function makeMonks(spots: Array<{ pos: THREE.Vector3; yaw: number }>): Monks {
  const group = new THREE.Group();
  const n = spots.length;
  // ---- one monk, in parts by material ----
  const robeParts: THREE.BufferGeometry[] = [];
  const prof = [[0.001, 0], [0.38, 0], [0.35, 0.3], [0.29, 0.9], [0.25, 1.24], [0.21, 1.37], [0.09, 1.45], [0.001, 1.46]].map(([r, y]) => new THREE.Vector2(r, y));
  robeParts.push(placed(new THREE.LatheGeometry(prof, 18), 0, 0, 0, 1, 1, 0.82));
  // the hood, peaked at the back
  robeParts.push(placed(new THREE.SphereGeometry(0.21, 14, 10), 0, 1.6, -0.03, 1, 1.12, 1.08));
  robeParts.push(placed(new THREE.ConeGeometry(0.11, 0.3, 8), 0, 1.62, -0.24, 1, 1, 1, -1.9));
  robeParts.push(placed(new THREE.TorusGeometry(0.16, 0.05, 6, 14), 0, 1.56, 0.1, 1, 1.15, 1));
  // the sleeves meeting over the chest, hands hidden inside
  robeParts.push(placed(new THREE.CapsuleGeometry(0.085, 0.36, 4, 8), 0, 1.02, 0.24, 1, 1, 1, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) robeParts.push(placed(new THREE.CapsuleGeometry(0.075, 0.42, 4, 8), s * 0.22, 1.18, 0.1, 1, 1, 1, -0.6, 0, s * 0.3));
  const beltParts = [placed(new THREE.TorusGeometry(0.29, 0.024, 5, 18), 0, 0.92, 0, 1, 1, 0.85, Math.PI / 2), placed(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5), 0.13, 0.66, 0.24, 1, 1, 1, 0.1)];
  const faceParts = [placed(new THREE.SphereGeometry(0.135, 16, 12), 0, 1.57, 0.06)];
  const footParts = [-1, 1].map((s) => placed(new THREE.SphereGeometry(0.07, 8, 6), s * 0.11, 0.03, 0.27, 1, 0.5, 1.5));
  const robeM = charToon({ color: 0x6e4a34, rim: 0.4, shade: 0x9a90c0 });
  const parts: Array<[THREE.BufferGeometry, THREE.Material]> = [
    [merge(robeParts), robeM],
    [merge(beltParts), charToon({ color: 0xe8dcc0, rim: 0.3 })],
    [merge(faceParts), charToon({ map: monkFace(), rim: 0.3 })],
    [merge(footParts), charToon({ color: 0x3a2a20, rim: 0.2 })],
  ];
  const meshes = parts.map(([g, m]) => {
    const im = new THREE.InstancedMesh(g, m, n);
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
    return im;
  });
  const yawS = spots.map((s) => s.yaw), turnT = new Beat(4.6);
  let target: THREE.Vector3 | null = null;
  const toward = spots.map((s) => s.yaw);
  const write = (t: number, k: number, bow: number) => {
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      // chanting: all sway together, heads a fraction behind
      const sway = Math.sin(t * 1.4) * 0.035;
      tmpE.set(bow + Math.sin(t * 1.4 + 1.2) * 0.02, yawS[i], sway, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpP.copy(s.pos);
      tmpM.compose(tmpP, tmpQ, tmpS);
      for (const im of meshes) im.setMatrixAt(i, tmpM);
    }
    for (const im of meshes) { im.instanceMatrix.needsUpdate = true; }
    void k;
  };
  write(0, 0, 0);
  return {
    group, spots,
    turnTo(p) { target = p.clone(); turnT.start(); spots.forEach((s, i) => { toward[i] = Math.atan2(p.x - s.pos.x, p.z - s.pos.z); }); },
    get turning() { return turnT.on; },
    update(dt, t) {
      const tt = turnT.step(dt);
      // a beat's pause, then all turn at the same instant (in steps, like a drill), bow, and turn back
      const k = tt >= 0 ? envelope(tt, 0.4, 0.9, 3.6, 4.4) : 0;
      for (let i = 0; i < n; i++) {
        let d = toward[i] - spots[i].yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        yawS[i] = damp(yawS[i], spots[i].yaw + d * k, 14, dt);
      }
      const bow = tt >= 0 ? envelope(tt, 1.4, 1.9, 2.6, 3.2) * 0.42 : 0;
      write(t, k, bow);
      void target;
    },
  };
}

// ---------------- the ibex ----------------
export interface Ibex {
  group: THREE.Group;
  head: THREE.Group;
  rear(): void;
  readonly busy: boolean;
  update(dt: number, t: number, look: THREE.Vector3 | null): void;
}

/** An alpine ibex: a stocky grey-brown goat with a pale belly, a little beard and great ridged horns swept back. */
export function makeIbex(): Ibex {
  const group = new THREE.Group();
  const coat = charToon({ color: 0x8a7258, rim: 0.45 });
  const pale = charToon({ color: 0xdccab0, rim: 0.4 });
  const dark = charToon({ color: 0x4a3a2c, rim: 0.3 });
  const horn = charToon({ color: 0xb8a684, rim: 0.4 });
  // the body pivots at the hind legs so it can rear
  const body = new THREE.Group();
  body.position.set(0, 0.72, -0.42);
  group.add(body);
  const B = new THREE.Group();
  B.position.set(0, 0, 0.42);
  body.add(B);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), coat); torso.scale.set(0.36, 0.38, 0.72); torso.position.y = 0.25; B.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), pale); belly.scale.set(0.3, 0.2, 0.55); belly.position.set(0, 0.05, 0.02); B.add(belly);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), coat); chest.position.set(0, 0.32, 0.5); B.add(chest);
  for (const m of [torso, chest]) outline(m, INK, 1.3, 0.02);
  // legs with dark hooves
  const legs: THREE.Group[] = [];
  for (const [x, z] of [[-0.18, 0.5], [0.18, 0.5], [-0.17, -0.48], [0.17, -0.48]]) {
    const L = new THREE.Group(); L.position.set(x, 0.1, z);
    L.add(cyl(0.065, 0.045, 0.78, coat, 0, -0.39, 0, 7));
    L.add(cyl(0.05, 0.06, 0.1, dark, 0, -0.78, 0.01, 7));
    B.add(L); legs.push(L);
  }
  // neck and head
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.72);
  B.add(head);
  const neck = cyl(0.17, 0.22, 0.55, coat, 0, -0.2, -0.08, 10); neck.rotation.x = 0.5; head.add(neck);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), coat); skull.scale.set(0.15, 0.16, 0.3); skull.position.set(0, 0.1, 0.16); skull.rotation.x = 0.4; head.add(skull);
  outline(skull, INK, 1.3, 0.02);
  head.add(sphere(0.07, dark, 0, -0.03, 0.4, 8, 6));
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), dark); beard.rotation.x = Math.PI; beard.position.set(0, -0.12, 0.3); head.add(beard);
  for (const s of [-1, 1]) {
    head.add(sphere(0.03, dark, s * 0.12, 0.16, 0.24, 6, 5));
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), coat); ear.scale.set(1.6, 0.5, 0.6); ear.position.set(s * 0.17, 0.2, 0.06); head.add(ear);
    // the great horns: ridged, sweeping up and back in an arc
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * 2.4; pts.push(new THREE.Vector3(s * (0.07 + i * 0.012), 0.2 + Math.sin(a) * 0.5, 0.12 - (1 - Math.cos(a)) * 0.42)); }
    const hg = taperedTube(new THREE.CatmullRomCurve3(pts), 0.065, 0.015, 16, 8);
    const hm = new THREE.Mesh(hg, horn); head.add(hm); outline(hm, INK, 1.2, 0.015);
    for (let i = 1; i < 8; i++) { const p = pts[i]; const r = new THREE.Mesh(new THREE.TorusGeometry(0.06 - i * 0.005, 0.01, 4, 10), dark); r.position.copy(p); r.lookAt(pts[i + 1] ?? p); head.add(r); }
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), dark); tail.position.set(0, 0.42, -0.7); tail.rotation.x = -0.8; B.add(tail);
  group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline) m.castShadow = true; });
  const rear = new Beat(3.2);
  let lookY = 0;
  const tmp = new THREE.Vector3();
  return {
    group, head,
    rear() { if (!rear.on) rear.start(); },
    get busy() { return rear.on; },
    update(dt, t, look) {
      const r = rear.step(dt);
      const k = r >= 0 ? envelope(r, 0, 0.45, 1.8, 3.2) : 0;
      body.rotation.x = -0.75 * k;
      // the front legs tuck up, the head throws back to bleat
      legs[0].rotation.x = legs[1].rotation.x = -1.1 * k;
      head.rotation.x = -0.5 * k + Math.sin(t * 0.7) * 0.05;
      if (look) { tmp.copy(look); group.worldToLocal(tmp); lookY = damp(lookY, clamp(Math.atan2(tmp.x, tmp.z), -0.9, 0.9), 2.5, dt); }
      head.rotation.y = lookY;
      // chewing now and then
      head.position.y = 0.62 + Math.max(0, Math.sin(t * 5)) * 0.008;
    },
  };
}

// ---------------- the crowd at the jump ----------------
export interface Crowd {
  group: THREE.Group;
  anchor: THREE.Object3D;
  cheer(): void;
  update(dt: number, t: number): void;
}

/** Spectators in rows on the stands, in coats of the film's colours with hats and little flags; they cheer. */
export function makeCrowd(spots: Array<{ pos: THREE.Vector3; yaw: number }>, seed = 931): Crowd {
  const group = new THREE.Group();
  const rng = new Rng(seed);
  const n = spots.length;
  const coatG = merge([placed(new THREE.LatheGeometry([[0.001, 0], [0.3, 0], [0.27, 0.5], [0.24, 1.0], [0.2, 1.25], [0.08, 1.33], [0.001, 1.34]].map(([r, y]) => new THREE.Vector2(r, y)), 10), 0, 0, 0, 1, 1, 0.8)]);
  const headG = merge([placed(new THREE.SphereGeometry(0.15, 10, 8), 0, 1.48, 0)]);
  const hatG = merge([placed(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 10), 0, 1.62, 0), placed(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 12), 0, 1.56, 0)]);
  const flagG = merge([placed(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 4), 0.26, 1.45, 0.1), placed(new THREE.PlaneGeometry(0.3, 0.18), 0.41, 1.72, 0.1)]);
  const mk = (g: THREE.BufferGeometry, m: THREE.Material) => { const im = new THREE.InstancedMesh(g, m, n); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; group.add(im); return im; };
  const coat = mk(coatG, charToon({ color: 0xffffff, rim: 0.35 }));
  const head = mk(headG, charToon({ color: 0xffffff, rim: 0.3 }));
  const hat = mk(hatG, charToon({ color: 0xffffff, rim: 0.3 }));
  const flag = mk(flagG, charToon({ color: 0xffffff, rim: 0.2, side: THREE.DoubleSide }));
  const coats = [0xc8323c, 0x5d3a8a, 0x2a3a6a, 0xf2b8c6, 0xe8c04a, 0x6a9fd8, 0x7a2a36, 0x2e5a4a, 0xf6efe2];
  const skins = [0xf1d2bc, 0xe8c0a0, 0xc89a78, 0xa8704e, 0xf6dcc8];
  const hats = [0x2a2c30, 0xc8323c, 0xf6efe2, 0x5a3a2a, 0x2a3a6a];
  const flags = [0xc8323c, 0xf6efe2, 0xf2b8c6, 0x6a9fd8];
  const c = new THREE.Color();
  const phase: number[] = [];
  for (let i = 0; i < n; i++) {
    coat.setColorAt(i, c.set(rng.pick(coats))); head.setColorAt(i, c.set(rng.pick(skins))); hat.setColorAt(i, c.set(rng.pick(hats))); flag.setColorAt(i, c.set(rng.pick(flags)));
    phase.push(rng.range(0, TAU));
  }
  const cheerB = new Beat(3.6);
  const anchor = new THREE.Object3D();
  anchor.position.copy(spots.reduce((a, s) => a.add(s.pos), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, n)));
  group.add(anchor);
  const write = (t: number, k: number) => {
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      const hop = k > 0 ? Math.max(0, Math.sin(t * 9 + phase[i])) * 0.35 * k : 0;
      tmpE.set(0, s.yaw + Math.sin(t * 0.5 + phase[i]) * 0.15, Math.sin(t * 1.3 + phase[i]) * 0.03);
      tmpQ.setFromEuler(tmpE);
      tmpP.set(s.pos.x, s.pos.y + hop, s.pos.z);
      tmpM.compose(tmpP, tmpQ, tmpS);
      coat.setMatrixAt(i, tmpM); head.setMatrixAt(i, tmpM); hat.setMatrixAt(i, tmpM);
      // the flag waves, higher when they cheer
      tmpE.set(0, s.yaw, Math.sin(t * (k > 0 ? 12 : 2) + phase[i]) * (0.15 + 0.3 * k) - 0.2 * k);
      tmpQ.setFromEuler(tmpE);
      tmpP.y += 0.0 + 0.3 * k;
      tmpM.compose(tmpP, tmpQ, tmpS);
      flag.setMatrixAt(i, tmpM);
    }
    for (const im of [coat, head, hat, flag]) im.instanceMatrix.needsUpdate = true;
  };
  write(0, 0);
  for (const im of [coat, head, hat, flag]) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  let acc = 0;
  return {
    group, anchor,
    cheer() { cheerB.start(); },
    update(dt, t) {
      const ch = cheerB.step(dt);
      const k = ch >= 0 ? envelope(ch, 0, 0.2, 2.8, 3.6) : 0;
      // the idle crowd only needs a new pose a few times a second
      acc += dt;
      if (k > 0 || acc > 0.12) { acc = 0; write(t, k); }
    },
  };
}

// ---------------- the judges ----------------
/** A score card: a white board with a number in black. */
function scoreTexture(text: string) {
  const p = new Painter(128, 96, 951).fill('#fbf8f4');
  p.g.fillStyle = '#1a1a1e'; p.g.font = `bold 64px ${FUTURA}`; p.g.textAlign = 'center'; p.g.textBaseline = 'middle';
  p.g.fillText(text, 64, 52);
  p.g.strokeStyle = '#c8323c'; p.g.lineWidth = 4; p.g.strokeRect(4, 4, 120, 88);
  return p.texture({ wrap: false });
}

export interface Judges {
  group: THREE.Group;
  /** hold up the cards */
  score(): void;
  update(dt: number, t: number): void;
}

/** The judges' box: a little wooden tower with a glazed cabin, three judges in hats, and their cards. */
export function makeJudges() {
  const group = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ map: planks(0x9a6038, 961) });
  const trim = charToon({ color: 0xfbf8f4, rim: 0.2 });
  // legs, cabin, roof
  for (const [x, z] of [[-1.6, -1.4], [1.6, -1.4], [-1.6, 1.4], [1.6, 1.4]]) group.add(box(0.3, 6, 0.3, wood, x, 3, z));
  group.add(box(3.8, 0.3, 3.4, wood, 0, 6.1, 0));
  group.add(box(3.8, 1.0, 3.4, wood, 0, 6.75, 0));
  for (const x of [-1.8, 1.8]) group.add(box(0.2, 1.6, 3.4, wood, x, 8.0, 0));
  group.add(box(3.8, 1.6, 0.2, wood, 0, 8.0, -1.6));
  group.add(box(4.4, 0.3, 4.0, trim, 0, 8.95, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.5, 4), charToon({ color: 0x7a2a36, rim: 0.3 }));
  roof.rotation.y = Math.PI / 4; roof.position.y = 9.85; group.add(roof);
  const sign = new Painter(256, 64, 962).fill('#2a3a6a');
  sign.g.fillStyle = '#f6efe2'; sign.g.font = `bold 34px ${FUTURA}`; sign.g.textAlign = 'center'; sign.g.textBaseline = 'middle'; sign.g.fillText('JURY', 128, 34);
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshLambertMaterial({ map: sign.texture({ wrap: false }) }));
  sm.position.set(0, 6.75, 1.72); group.add(sm);
  // the three judges behind the sill
  const coats = [0x2a2c30, 0x5a3a5a, 0x2a3a6a];
  const cards: THREE.Group[] = [];
  ['5.9', '6.0', '5.8'].forEach((s, i) => {
    const x = -1.1 + i * 1.1;
    group.add(cyl(0.25, 0.3, 0.8, charToon({ color: coats[i], rim: 0.3 }), x, 7.6, 0.2, 8));
    group.add(sphere(0.2, charToon({ color: 0xf1d2bc, rim: 0.3 }), x, 8.2, 0.25, 10, 8));
    group.add(cyl(0.2, 0.22, 0.24, charToon({ color: 0x1a1a1e, rim: 0.3 }), x, 8.42, 0.25, 10));
    const card = new THREE.Group();
    card.position.set(x, 7.3, 0.7);
    card.add(cyl(0.02, 0.02, 0.6, trim, 0, 0.3, 0, 4));
    card.add(new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.52), new THREE.MeshLambertMaterial({ map: scoreTexture(s), side: THREE.DoubleSide })).translateY(0.75));
    group.add(card);
    cards.push(card);
  });
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  const statics = new THREE.Group();
  for (const c of [...group.children]) if (!cards.includes(c as THREE.Group)) statics.add(c);
  group.add(statics);
  mergeStatic(statics);
  const sc = new Beat(4.5);
  return {
    group,
    score() { if (!sc.on) sc.start(); },
    update(dt: number, t: number) {
      const s = sc.step(dt);
      cards.forEach((c, i) => {
        const k = s >= 0 ? envelope(s, 0.15 * i, 0.4 + 0.15 * i, 3.6, 4.4) : 0;
        c.position.y = 7.3 + k * 1.0;
        c.rotation.z = Math.sin(t * 3 + i) * 0.05 * k;
      });
    },
  } as Judges;
}

