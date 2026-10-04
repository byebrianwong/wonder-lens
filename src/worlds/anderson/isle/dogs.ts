import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Painter, charToon } from '../../../engine/Paint';
import { Rig, sculpt, outline, LookAt, Spring, taperedTube, envelope, type JointSpec } from '../../../engine/Rig';
import { clamp, lerp, smoothstep, TAU, Rng } from '../../../engine/math';
import { css } from '../textures';
import { FUTURA } from '../film';
import { StopMotion } from '../stopmotion';

/*
 * The dogs of Trash Island, as stop-motion puppets. Each dog is one skinned body (torso, neck, legs and tail
 * on a small skeleton, painted with brushed fur and its markings), a sculpted head with its ears and muzzle
 * (painted face, nose, brows), and a pair of glossy eyes; Chief also has a lower jaw that opens. Silhouettes
 * are tufted, the way a puppet's fur clumps under the animators' fingers, and an ink line keeps them clear of
 * the busy bales behind. They move "on twos" (StopMotion), and their fur boils.
 *
 * Built in "dog units" (a dog about 0.62 to the shoulder), then scaled up by `scale` so they read from the
 * gondola. The origin is between the paws, on the ground; the dog faces +z.
 */

export type Ears = 'up' | 'flop' | 'fold' | 'long';
export type Pattern = 'plain' | 'saddle' | 'spots' | 'blaze' | 'jersey' | 'mask';

export interface DogOpts {
  coat: number;
  /** belly, chest, muzzle and markings */
  coat2: number;
  pattern: Pattern;
  ears: Ears;
  earColor?: number;
  /** paw ("sock") colour */
  socks?: number;
  /** tail tip colour */
  tip?: number;
  /** how ragged the coat is (0 sleek .. 1 matted) */
  shag: number;
  /** long hair hanging below the belly and on the ears (Nutmeg, Rex) */
  long?: number;
  length?: number;
  leg?: number;
  girth?: number;
  snout?: number;
  head?: number;
  neck?: number;
  iris?: number;
  nose?: number;
  brows?: number;
  fringe?: boolean;
  jersey?: { color: number; trim: number; text: string; num: string };
  collar?: number;
  jaw?: boolean;
  scale: number;
  seed: number;
}

export interface DogPose {
  sit: number; crouch: number; rear: number; lie: number;
  headYaw: number; headPitch: number; headRoll: number;
  jaw: number; wag: number; tailUp: number; breathe: number; ears: number;
}
export const restPose = (): DogPose => ({ sit: 0, crouch: 0, rear: 0, lie: 0, headYaw: 0, headPitch: 0, headRoll: 0, jaw: 0, wag: 0, tailUp: 0, breathe: 0, ears: 0 });

export interface Dog {
  group: THREE.Group;
  bones: Record<string, THREE.Bone>;
  /** the head bone (look direction: +z) */
  head: THREE.Object3D;
  /** a point between the jaws, in the head's space (a caught box goes here) */
  mouth: THREE.Object3D;
  eyes: THREE.Mesh;
  /** the materials whose fur boils */
  mats: THREE.MeshToonMaterial[];
  pose: DogPose;
  apply(): void;
  blink(shut: number): void;
  opts: DogOpts;
}

const INK = 0x1e1814;

// ---------------- painting ----------------
/** brushed fur over a flat coat, strokes flowing back along the body and down the flanks */
function furStrokes(p: Painter, color: number, n: number, y?: [number, number], len: [number, number] = [6, 16], back = true) {
  p.fur({
    n, colors: [css(color, 0.78), css(color, 1.18), css(color, 0.92)], len, width: [2, 4.5], alpha: [0.3, 0.6], y, jitter: 0.45,
    angle: back ? (u, v) => { const fwd = u > 0.25 && u < 0.75 ? 0 : Math.PI; return fwd + (fwd ? -1 : 1) * (0.35 + v * 0.6); } : undefined,
  });
}

/** Paint a soft-edged patch at a direction on a sphere-UV painter. */
function patch(p: Painter, dir: [number, number, number], rx: number, ry: number, color: string, alpha = 1, rot = 0) {
  p.at(dir, (g) => {
    g.globalAlpha = alpha; g.fillStyle = color;
    g.beginPath(); g.ellipse(0, 0, rx, ry, rot, 0, TAU); g.fill();
    // a ragged edge of fur strokes round it
    g.lineWidth = 2.5; g.strokeStyle = color; g.globalAlpha = alpha * 0.6;
    for (let a = 0; a < TAU; a += 0.35) { const x = Math.cos(a) * rx, y = Math.sin(a) * ry; g.beginPath(); g.moveTo(x * 0.9, y * 0.9); g.lineTo(x * 1.2, y * 1.25); g.stroke(); }
    g.globalAlpha = 1;
  });
}

const dirOf = (x: number, y: number, z: number): [number, number, number] => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

/** The body atlas: the torso (sphere UVs) in the top 80%, a strip below for legs (left half) and tail and neck (right half). */
function bodyTexture(o: DogOpts) {
  const W = 512, TH = 256, SH = 64;
  const t = new Painter(W, TH, o.seed);
  t.fill(css(o.coat));
  // a darker back, a lighter belly
  t.vgrad([[0, css(o.coat, 0.82)], [0.45, css(o.coat)], [0.8, css(o.coat2, 1, o.coat, 0.4)], [1, css(o.coat2)]], 0.85);
  t.dabs({ n: 40, colors: [css(o.coat, 1.1), css(o.coat, 0.88)], r: [8, 30], alpha: [0.12, 0.25], squash: 0.6 });
  const r = t.rng;
  switch (o.pattern) {
    case 'saddle':
      for (let i = 0; i < 5; i++) patch(t, dirOf(r.range(-0.3, 0.3), 0.85, r.range(-0.5, 0.4)), r.range(34, 48), r.range(26, 36), css(o.coat2), 0.95, r.range(0, 1));
      break;
    case 'spots':
      for (let i = 0; i < 46; i++) { const d = dirOf(r.range(-1, 1), r.range(-0.4, 1), r.range(-1, 1)); patch(t, d, r.range(5, 13), r.range(5, 11), css(o.coat2), r.range(0.75, 1)); }
      break;
    case 'blaze':
      patch(t, dirOf(0, -0.6, 1), 30, 44, css(o.coat2));
      patch(t, dirOf(0, -1, 0.3), 60, 26, css(o.coat2), 0.9);
      break;
    case 'mask':
      break;
    default: break;
  }
  furStrokes(t, o.coat, Math.round(900 + o.shag * 900), undefined, [6 + o.shag * 6, 14 + o.shag * 12]);
  if (o.pattern === 'spots') for (let i = 0; i < 30; i++) { const d = dirOf(r.range(-1, 1), r.range(-0.2, 1), r.range(-1, 1)); patch(t, d, r.range(3, 7), r.range(3, 6), css(o.coat2), 0.9); }
  if (o.pattern === 'blaze' || o.pattern === 'plain' || o.pattern === 'saddle') furStrokes(t, o.coat2, 220, [0.8, 1], [6, 12]);
  if (o.jersey) {
    // a baseball jersey over the front half: pinstripes, the team's name across the side, the number on the back
    const j = o.jersey;
    const g = t.g;
    g.save();
    const x0 = W * 0.02, x1 = W * 0.48;
    g.fillStyle = css(j.color); g.fillRect(x0, TH * 0.06, x1 - x0, TH * 0.8);
    g.fillStyle = css(j.color); g.fillRect(W * 0.98, TH * 0.06, W * 0.02, TH * 0.8);
    g.strokeStyle = css(j.trim, 1, j.color, 0.55); g.lineWidth = 1.6;
    for (let x = x0 + 8; x < x1; x += 11) { g.beginPath(); g.moveTo(x, TH * 0.06); g.lineTo(x, TH * 0.86); g.stroke(); }
    g.fillStyle = css(j.trim); g.fillRect(x0, TH * 0.84, x1 - x0, 8); g.fillRect(x1 - 6, TH * 0.06, 6, TH * 0.8); g.fillRect(x0, TH * 0.06, 6, TH * 0.8);
    g.font = `bold 30px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    // the side towards +x (u 0.5) and -x (u 0) carry the name; the back (top of the torso) the number
    g.fillStyle = css(j.trim);
    g.save(); g.translate(W * 0.37, TH * 0.48); g.scale(0.9, 1.3); g.fillText(j.text, 0, 0); g.restore();
    g.save(); g.translate(W * 0.13, TH * 0.48); g.scale(0.9, 1.3); g.fillText(j.text, 0, 0); g.restore();
    g.font = `bold 46px ${FUTURA}`;
    g.save(); g.translate(W * 0.25, TH * 0.13); g.scale(1.4, 0.9); g.fillText(j.num, 0, 0); g.restore();
    g.restore();
  }
  if (o.collar !== undefined) {
    // a collar round the front of the chest (the neck carries the rest)
    patch(t, dirOf(0, 0.3, 1), 70, 10, css(o.collar), 1);
  }
  // compose with the limb strip
  const p = new Painter(W, TH + SH, o.seed + 1);
  p.g.drawImage(t.canvas, 0, 0);
  const g = p.g;
  // legs (left half): coat down to the socks
  const lg = g.createLinearGradient(0, TH, 0, TH + SH);
  lg.addColorStop(0, css(o.coat)); lg.addColorStop(0.72, css(o.coat, 0.95)); lg.addColorStop(0.8, css(o.socks ?? o.coat)); lg.addColorStop(1, css(o.socks ?? o.coat, 0.9));
  g.fillStyle = lg; g.fillRect(0, TH, W / 2, SH);
  // tail and neck (right half): coat to the tip
  const tg = g.createLinearGradient(0, TH, 0, TH + SH);
  tg.addColorStop(0, css(o.coat)); tg.addColorStop(0.65, css(o.coat)); tg.addColorStop(0.85, css(o.tip ?? o.coat)); tg.addColorStop(1, css(o.tip ?? o.coat));
  g.fillStyle = tg; g.fillRect(W / 2, TH, W / 2, SH);
  if (o.pattern === 'spots') for (let i = 0; i < 40; i++) { g.fillStyle = css(o.coat2); g.beginPath(); g.arc(p.rng.range(0, W), TH + p.rng.range(0, SH * 0.7), p.rng.range(2, 5), 0, TAU); g.fill(); }
  p.fur({ n: 500, colors: [css(o.coat, 0.8), css(o.coat, 1.15)], len: [4, 10], width: [1.5, 3], alpha: [0.3, 0.55], y: [TH / (TH + SH), 1], jitter: 0.3 });
  if (o.collar !== undefined) { g.fillStyle = css(o.collar); g.fillRect(W / 2, TH + SH * 0.05, W / 2, SH * 0.12); }
  return p.texture();
}

/** The head atlas: the head (sphere UVs, seen from the head's centre) in the top 80%, the ears' strip below. */
function headTexture(o: DogOpts, muzzleAxis: THREE.Vector3, eyeDirs: THREE.Vector3[]) {
  const W = 512, TH = 256, SH = 64;
  const t = new Painter(W, TH, o.seed + 5);
  t.fill(css(o.coat));
  t.vgrad([[0, css(o.coat, 0.9)], [0.6, css(o.coat)], [1, css(o.coat2, 1, o.coat, 0.3)]], 0.9);
  const m: [number, number, number] = [muzzleAxis.x, muzzleAxis.y, muzzleAxis.z];
  // the muzzle in the lighter coat (or a dark mask)
  if (o.pattern === 'mask') patch(t, m, 46, 40, css(o.coat2, 0.9), 0.95);
  else if (o.coat2 !== o.coat) patch(t, dirOf(0, m[1] - 0.1, m[2]), 40, 34, css(o.coat2), 0.9);
  if (o.pattern === 'blaze' || o.pattern === 'saddle') {
    // a white stripe up the middle of the face
    t.at(dirOf(0, 0.55, 0.8), (g) => { g.fillStyle = css(o.coat2); g.beginPath(); g.ellipse(0, 0, 9, 40, 0, 0, TAU); g.fill(); });
  }
  if (o.pattern === 'spots') for (let i = 0; i < 26; i++) { const d = dirOf(t.rng.range(-1, 1), t.rng.range(-0.3, 1), t.rng.range(-0.6, 1)); patch(t, d, t.rng.range(4, 9), t.rng.range(4, 8), css(o.coat2), 0.95); }
  furStrokes(t, o.coat, Math.round(500 + o.shag * 500), undefined, [5 + o.shag * 4, 11 + o.shag * 8], false);
  // eye sockets: a darker rim of fur round each eye, and the brows above
  for (const e of eyeDirs) {
    patch(t, [e.x, e.y, e.z], 15, 13, css(o.coat, 0.45, 0x2a1810, 0.3), 0.85);
    const b = o.brows ?? 0;
    if (b > 0) t.at([e.x, e.y + 0.22, e.z * 0.95], (g) => {
      g.strokeStyle = css(o.coat2, 1.05); g.lineCap = 'round';
      for (let k = 0; k < 9; k++) { g.lineWidth = 3 + b * 3; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(-14 + k * 3.4, -2); g.lineTo(-10 + k * 3.8 + Math.sign(e.x) * 4, 8 + b * 10); g.stroke(); }
      g.globalAlpha = 1;
    });
  }
  // the nose at the end of the muzzle, the mouth line under it
  t.at(m, (g) => {
    g.fillStyle = css(o.nose ?? 0x1a1414);
    g.beginPath(); g.ellipse(0, -10, 22, 13, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-6, -16, 7, 3.5, -0.3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(-8, -7, 4, 2.6, 0, 0, TAU); g.ellipse(8, -7, 4, 2.6, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(30,18,14,0.85)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 2); g.lineTo(0, 14); g.stroke();
    if (!o.jaw) { g.beginPath(); g.moveTo(-26, 26); g.quadraticCurveTo(-10, 14, 0, 14); g.quadraticCurveTo(10, 14, 26, 26); g.stroke(); }
  });
  if (o.jaw) {
    // the roof of the mouth, seen when the jaw drops
    t.at(dirOf(0, m[1] - 0.6, m[2] * 0.75), (g) => { g.fillStyle = '#4a1a1c'; g.beginPath(); g.ellipse(0, 0, 30, 18, 0, 0, TAU); g.fill(); });
  }
  if (o.fringe) {
    // Nutmeg's fringe: long locks falling over the forehead
    t.at(dirOf(0, 0.75, 0.6), (g) => {
      for (let k = 0; k < 26; k++) {
        const x = -46 + k * 3.6;
        g.strokeStyle = css(o.earColor ?? o.coat, k % 3 ? 1.08 : 0.86); g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x * 0.6, -20); g.quadraticCurveTo(x, 6, x * 1.15 + Math.sin(k) * 3, 30 + (k % 4) * 4); g.stroke();
      }
    });
  }
  const p = new Painter(W, TH + SH, o.seed + 6);
  p.g.drawImage(t.canvas, 0, 0);
  const ec = o.earColor ?? o.coat;
  p.g.fillStyle = css(ec); p.g.fillRect(0, TH, W, SH);
  p.fur({ n: 420, colors: [css(ec, 0.8), css(ec, 1.15)], len: [5, 14], width: [2, 3.5], alpha: [0.35, 0.6], y: [TH / (TH + SH), 1], angle: () => Math.PI / 2, jitter: 0.25 });
  if (o.pattern === 'spots') for (let i = 0; i < 60; i++) { p.g.fillStyle = css(o.coat2); p.g.beginPath(); p.g.arc(p.rng.range(0, W), TH + p.rng.range(0, SH), p.rng.range(2, 4.5), 0, TAU); p.g.fill(); }
  // the inside of the ears: the right half of the strip, a little pinker and darker
  p.g.fillStyle = 'rgba(160,90,90,0.35)'; p.g.fillRect(W / 2, TH, W / 2, SH);
  // the open mouth's lining, a dark red corner
  p.g.fillStyle = '#5a1e20'; p.g.fillRect(W - 40, TH + SH - 24, 40, 24);
  p.g.fillStyle = '#c86a6a'; p.g.fillRect(W - 30, TH + SH - 16, 20, 10);
  return p.texture();
}

let eyeMat: THREE.Material | null = null;
function eyeMaterial() {
  return eyeMat ??= (() => {
    const p = new Painter(256, 128, 3);
    p.fill('#e8dcc4');
    // a big dark iris filling most of the eye, as on the puppets: only a rim of white at the edges
    p.at([0, 0, 1], (g) => {
      g.fillStyle = '#3a2412'; g.beginPath(); g.arc(0, 0, 44, 0, TAU); g.fill();
      g.fillStyle = '#5a3a1c'; g.beginPath(); g.arc(0, 4, 34, 0, TAU); g.fill();
      g.fillStyle = '#0a0604'; g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-12, -13, 8, 0, TAU); g.fill();
      g.beginPath(); g.arc(10, 10, 3, 0, TAU); g.fill();
    });
    return new THREE.MeshPhongMaterial({ map: p.texture(), shininess: 90, specular: 0x666666 });
  })();
}

// ---------------- geometry ----------------
/** a cheap clumpy noise over directions (for tufts) */
function clump(d: THREE.Vector3, seed: number, f = 1) {
  const a = Math.sin(d.x * 23 * f + seed + Math.sin(d.y * 17 * f)) * Math.sin(d.y * 19 * f + d.z * 29 * f + seed * 0.7) * Math.sin(d.z * 13 * f + d.x * 31 * f + seed * 1.3);
  return Math.max(0, a) ** 2;
}

interface Seg { a: THREE.Vector3; b: THREE.Vector3 }
const segDist = (p: THREE.Vector3, s: Seg) => {
  const ab = s.b.clone().sub(s.a), ap = p.clone().sub(s.a);
  const t = clamp(ap.dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
  return ap.sub(ab.multiplyScalar(t)).length();
};

/** Give a part skin weights from the nearest of the allowed bones' segments. */
function skinPart(geo: THREE.BufferGeometry, names: string[], segs: Record<string, Seg>, order: string[], sharp = 4) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const idx = new Uint16Array(pos.count * 4), wts = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const ws = names.map((n) => ({ n, w: 1 / Math.pow(segDist(p, segs[n]) ** 2 + 0.0006, sharp / 2) })).sort((a, b) => b.w - a.w).slice(0, 4);
    const sum = ws.reduce((s, x) => s + x.w, 0);
    ws.forEach((x, k) => { idx[i * 4 + k] = order.indexOf(x.n); wts[i * 4 + k] = x.w / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  return geo;
}

/** keep only position, normal, uv (and skinning), non-indexed, so parts merge */
function clean(geo: THREE.BufferGeometry) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
  return g;
}

/** remap a tube's UVs into the strip: around -> u in [u0, u1], along -> v from vTop (root) to 0 (tip) */
function stripUV(geo: THREE.BufferGeometry, u0: number, u1: number, vTop = 0.2, vEnd = 0.005) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) { const along = uv.getX(i), around = uv.getY(i); uv.setXY(i, lerp(u0, u1, around), lerp(vTop, vEnd, along)); }
  return geo;
}

/** roughen a geometry's surface along its normals with clumps */
function tuft(geo: THREE.BufferGeometry, amount: number, seed: number, f = 1.6) {
  if (amount <= 0) return geo;
  const pos = geo.attributes.position as THREE.BufferAttribute, nrm = geo.attributes.normal as THREE.BufferAttribute;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nrm, i);
    const k = clump(p.clone().multiplyScalar(6).normalize().add(p.clone().multiplyScalar(3)), seed, f) * amount;
    pos.setXYZ(i, p.x + n.x * k, p.y + n.y * k, p.z + n.z * k);
  }
  return geo;
}

export function makeDog(o: DogOpts): Dog {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const L = o.length ?? 1, LG = o.leg ?? 1, GI = o.girth ?? 1, HS = o.head ?? 1, NK = o.neck ?? 1;
  const LH = 0.5 * LG, BL = 0.56 * L, BY = LH + 0.08;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const J: Record<string, THREE.Vector3> = {
    hips: V(0, BY, -BL / 2), chest: V(0, BY + 0.02, BL / 2),
    neck: V(0, BY + 0.1, BL / 2 + 0.14), head: V(0, BY + 0.1 + 0.2 * NK, BL / 2 + 0.24 + 0.04 * NK),
    fl0: V(0.11 * GI, LH, BL / 2 + 0.03), fl1: V(0.115 * GI, LH * 0.48, BL / 2 + 0.05), fl2: V(0.115 * GI, 0.045, BL / 2 + 0.06),
    fr0: V(-0.11 * GI, LH, BL / 2 + 0.03), fr1: V(-0.115 * GI, LH * 0.48, BL / 2 + 0.05), fr2: V(-0.115 * GI, 0.045, BL / 2 + 0.06),
    bl0: V(0.11 * GI, LH, -BL / 2 - 0.04), bl1: V(0.12 * GI, LH * 0.56, -BL / 2 + 0.05), bl2: V(0.12 * GI, LH * 0.24, -BL / 2 - 0.08), bl3: V(0.12 * GI, 0.045, -BL / 2 - 0.05),
    br0: V(-0.11 * GI, LH, -BL / 2 - 0.04), br1: V(-0.12 * GI, LH * 0.56, -BL / 2 + 0.05), br2: V(-0.12 * GI, LH * 0.24, -BL / 2 - 0.08), br3: V(-0.12 * GI, 0.045, -BL / 2 - 0.05),
    tail0: V(0, BY + 0.05, -BL / 2 - 0.17), tail1: V(0, BY + 0.14, -BL / 2 - 0.3), tail2: V(0, BY + 0.2, -BL / 2 - 0.44),
  };
  const spec: Array<[string, string | undefined]> = [
    ['hips', undefined], ['chest', 'hips'], ['neck', 'chest'], ['head', 'neck'],
    ['fl0', 'chest'], ['fl1', 'fl0'], ['fl2', 'fl1'], ['fr0', 'chest'], ['fr1', 'fr0'], ['fr2', 'fr1'],
    ['bl0', 'hips'], ['bl1', 'bl0'], ['bl2', 'bl1'], ['bl3', 'bl2'], ['br0', 'hips'], ['br1', 'br0'], ['br2', 'br1'], ['br3', 'br2'],
    ['tail0', 'hips'], ['tail1', 'tail0'], ['tail2', 'tail1'],
  ];
  const joints: JointSpec[] = spec.map(([name, parent]) => ({ name, parent, at: J[name].toArray() as [number, number, number] }));
  const rig = new Rig(body, joints);
  const order = rig.list.map((b) => b.name);
  const mid = J.hips.clone().lerp(J.chest, 0.5);
  const segs: Record<string, Seg> = {
    hips: { a: J.hips.clone().add(V(0, 0, -0.18)), b: mid }, chest: { a: mid, b: J.chest.clone().add(V(0, -0.02, 0.16)) },
    neck: { a: J.neck, b: J.head }, head: { a: J.head, b: J.head.clone().add(V(0, 0.05, 0.1)) },
    tail0: { a: J.tail0, b: J.tail1 }, tail1: { a: J.tail1, b: J.tail2 }, tail2: { a: J.tail2, b: J.tail2.clone().add(V(0, 0.04, -0.14)) },
  };
  for (const s of ['fl', 'fr']) { segs[`${s}0`] = { a: J[`${s}0`], b: J[`${s}1`] }; segs[`${s}1`] = { a: J[`${s}1`], b: J[`${s}2`] }; segs[`${s}2`] = { a: J[`${s}2`], b: J[`${s}2`].clone().add(V(0, -0.04, 0.06)) }; }
  for (const s of ['bl', 'br']) { segs[`${s}0`] = { a: J[`${s}0`], b: J[`${s}1`] }; segs[`${s}1`] = { a: J[`${s}1`], b: J[`${s}2`] }; segs[`${s}2`] = { a: J[`${s}2`], b: J[`${s}3`] }; segs[`${s}3`] = { a: J[`${s}3`], b: J[`${s}3`].clone().add(V(0, -0.03, 0.06)) }; }

  const parts: THREE.BufferGeometry[] = [];
  // ---- torso ----
  const A = BL / 2 + 0.2;
  const longHair = o.long ?? 0;
  const torso = sculpt((d, out) => {
    const t = d.z;
    const w = 0.158 * GI * (1 + 0.1 * t);
    const h = 0.162 * (1 + 0.28 * smoothstep(-0.3, 0.6, t)) * (1 - 0.12 * Math.exp(-(((t + 0.35) / 0.3) ** 2)));
    const c = BY - 0.01 - 0.05 * smoothstep(-0.2, 0.7, t);
    const tf = 1 + o.shag * 0.22 * clump(d, o.seed) + (d.y < 0 ? longHair * 0.5 * (-d.y) ** 2 : 0);
    out.set(d.x * w * tf, c + d.y * h * tf, t * A);
  }, 40, 28);
  { const uv = torso.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setY(i, 0.2 + 0.8 * uv.getY(i)); }
  parts.push(skinPart(clean(torso), ['hips', 'chest', 'neck', 'tail0', 'fl0', 'fr0', 'bl0', 'br0'], segs, order, 6));
  // ---- neck ----
  {
    const c = new THREE.CatmullRomCurve3([J.chest.clone().add(V(0, 0.0, 0.02)), J.neck.clone(), J.head.clone().add(V(0, -0.03, -0.02))]);
    const g = taperedTube(c, 0.125 * GI, 0.095, 10, 12);
    tuft(g, o.shag * 0.03 + longHair * 0.02, o.seed + 3);
    stripUV(g, 0.5, 1, 0.2, 0.15);
    parts.push(skinPart(clean(g), ['chest', 'neck', 'head'], segs, order));
  }
  // ---- legs ----
  for (const s of ['fl', 'fr', 'bl', 'br']) {
    const front = s[0] === 'f';
    const pts = (front ? [0, 1, 2] : [0, 1, 2, 3]).map((k) => J[`${s}${k}`].clone());
    pts.unshift(pts[0].clone().add(V(0, 0.09, front ? 0.0 : 0.02)));
    const r0 = (front ? 0.074 : 0.092) * GI, r1 = 0.042;
    const g = taperedTube(new THREE.CatmullRomCurve3(pts), r0, r1, 14, 9);
    tuft(g, o.shag * 0.02, o.seed + 5);
    stripUV(g, 0, 0.5);
    const paw = new THREE.SphereGeometry(1, 10, 7);
    paw.scale(0.058, 0.038, 0.08).translate(pts[pts.length - 1].x, 0.03, pts[pts.length - 1].z + 0.035);
    stripUV(paw, 0, 0.5, 0.012, 0.004);
    const names = front ? ['chest', `${s}0`, `${s}1`, `${s}2`] : ['hips', `${s}0`, `${s}1`, `${s}2`, `${s}3`];
    parts.push(skinPart(clean(g), names, segs, order));
    parts.push(skinPart(clean(paw), [front ? `${s}2` : `${s}3`], segs, order));
  }
  // ---- tail ----
  {
    const pts = [J.tail0.clone().add(V(0, -0.02, 0.06)), J.tail0, J.tail1, J.tail2, J.tail2.clone().add(V(0, 0.04, -0.13))];
    const thick = 0.045 + longHair * 0.05 + o.shag * 0.01;
    const g = taperedTube(new THREE.CatmullRomCurve3(pts), thick, 0.018 + longHair * 0.02, 14, 8);
    tuft(g, o.shag * 0.02 + longHair * 0.03, o.seed + 7);
    stripUV(g, 0.5, 1);
    parts.push(skinPart(clean(g), ['hips', 'tail0', 'tail1', 'tail2'], segs, order));
  }
  const bodyGeo = mergeGeometries(parts, false)!;
  bodyGeo.computeBoundingSphere();
  const bodyMat = charToon({ map: bodyTexture(o), rim: 0.4, shade: 0x8a88a8 });
  const skinned = new THREE.SkinnedMesh(bodyGeo, bodyMat);
  body.add(skinned);
  skinned.updateMatrixWorld(true);
  skinned.bind(rig.skeleton, skinned.matrixWorld.clone());
  skinned.computeBoundingSphere();
  if (skinned.boundingSphere) skinned.boundingSphere.radius *= 1.5;
  skinned.castShadow = true;
  outline(skinned, INK, 1.3, 0.012);

  // ---- head ----
  const headBone = rig.bones.head;
  const Rs = 0.115 * HS;
  const snout = 0.15 * (o.snout ?? 1) * HS;
  const mAxis = new THREE.Vector3(0, -0.32, 1).normalize();
  const tmp = new THREE.Vector3();
  const headShape = (d: THREE.Vector3, out: THREE.Vector3) => {
    const a = Math.acos(clamp(d.dot(mAxis), -1, 1));
    // the skull, a little wider than tall, a stop at the brow, and the muzzle along the axis
    let r = Rs * (1 + 0.06 * d.x * d.x) * (1 + o.shag * 0.14 * clump(d, o.seed + 11, 1.3));
    r += snout * (1 - smoothstep(0.2, 0.62, a));
    // flatten the muzzle's sides and keep its top straight
    out.copy(d).multiplyScalar(r);
    const k = 1 - smoothstep(0.25, 0.7, a);
    out.x *= 1 - 0.18 * k;
    if (d.y < -0.2) out.y *= 1 + (o.long ?? 0) * 0.25 * (1 - k);
    out.y += Rs * 0.05;
    return out;
  };
  const headGeo = sculpt(headShape, 36, 26);
  { const uv = headGeo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setY(i, 0.2 + 0.8 * uv.getY(i)); }
  const headParts: THREE.BufferGeometry[] = [clean(headGeo)];
  // ears: built in the head's space, their UVs in the strip (outside left half, inside right half)
  for (const s of [-1, 1]) {
    let ear: THREE.BufferGeometry;
    const base = V(s * Rs * 0.62, Rs * 0.78, -Rs * 0.15);
    switch (o.ears) {
      case 'up': {
        ear = new THREE.ConeGeometry(Rs * 0.48, Rs * 1.35, 5, 3);
        ear.scale(1, 1, 0.4);
        ear.translate(0, Rs * 0.6, 0);
        ear.rotateZ(-s * 0.32); ear.rotateY(s * 0.25);
        ear.translate(base.x, base.y - Rs * 0.1, base.z);
        break;
      }
      case 'fold': {
        ear = new THREE.ConeGeometry(Rs * 0.48, Rs * 0.95, 5, 3);
        ear.scale(1, 1, 0.35);
        ear.translate(0, Rs * 0.4, 0);
        ear.rotateX(1.4); ear.rotateZ(-s * 0.5);
        ear.translate(base.x, base.y + Rs * 0.05, base.z + Rs * 0.1);
        break;
      }
      case 'long': {
        ear = new THREE.SphereGeometry(1, 10, 10);
        ear.scale(Rs * 0.42, Rs * 1.15, Rs * 0.28);
        ear.translate(0, -Rs * 0.95, 0);
        ear.rotateZ(s * 0.18);
        ear.translate(s * Rs * 0.92, Rs * 0.55, -Rs * 0.1);
        break;
      }
      default: {
        ear = new THREE.SphereGeometry(1, 10, 8);
        ear.scale(Rs * 0.4, Rs * 0.78, Rs * 0.2);
        ear.translate(0, -Rs * 0.62, 0);
        ear.rotateZ(s * 0.35); ear.rotateY(s * 0.3);
        ear.translate(s * Rs * 0.85, Rs * 0.7, -Rs * 0.05);
      }
    }
    ear.computeVertexNormals();
    tuft(ear, o.shag * 0.012 + (o.long ?? 0) * 0.03, o.seed + 13 + s);
    const uv = ear.attributes.uv as THREE.BufferAttribute, nrm = ear.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      // faces turned towards the front (+z) show the ear's inside
      const inside = nrm.getZ(i) > 0.35 && o.ears === 'up';
      uv.setXY(i, (inside ? 0.55 : 0.05) + uv.getX(i) * 0.38, 0.03 + uv.getY(i) * 0.15);
    }
    headParts.push(clean(ear));
  }
  if (o.fringe) {
    // a soft cap of long hair over the crown (Nutmeg's topknot and fringe)
    const top = new THREE.SphereGeometry(Rs * 0.9, 14, 10, 0, TAU, 0, Math.PI * 0.45);
    top.scale(1.12, 1.1, 1.15).translate(0, Rs * 0.32, Rs * 0.08);
    tuft(top, 0.02, o.seed + 17);
    const uv = top.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.05 + uv.getX(i) * 0.38, 0.05 + uv.getY(i) * 0.12);
    headParts.push(clean(top));
  }
  const headMat = charToon({ map: headTexture(o, mAxis, [-1, 1].map((s) => V(s * 0.45, 0.3, 0.84).normalize())), rim: 0.4, shade: 0x8a88a8 });
  const headMesh = new THREE.Mesh(mergeGeometries(headParts, false)!, headMat);
  headMesh.castShadow = true;
  headBone.add(headMesh);
  outline(headMesh, INK, 1.3, 0.012);
  // eyes
  const eyeGeo: THREE.BufferGeometry[] = [];
  const eyeR = 0.029 * HS;
  for (const s of [-1, 1]) {
    const e = V(s * 0.45, 0.3, 0.84).normalize();
    headShape(e, tmp);
    const g = new THREE.SphereGeometry(eyeR, 12, 10);
    g.rotateY(s * 0.42);
    g.translate(tmp.x * 0.89, tmp.y * 0.92, tmp.z * 0.89);
    eyeGeo.push(g);
  }
  const eyes = new THREE.Mesh(mergeGeometries(eyeGeo, false)!, eyeMaterial());
  // eyes close by squashing towards their own centre line (so scale about the head's eye height)
  const eyeY = eyeGeo[0].boundingSphere ? 0 : 0;
  void eyeY;
  headBone.add(eyes);
  // a mouth point in front of the muzzle, under the nose
  const mouth = new THREE.Object3D();
  headShape(mAxis, tmp);
  mouth.position.copy(tmp).multiplyScalar(0.8).add(V(0, -Rs * 0.32, 0));
  headBone.add(mouth);
  // Chief's jaw: hinged at the back of the mouth
  let jaw: THREE.Object3D | null = null;
  if (o.jaw) {
    jaw = new THREE.Group();
    jaw.position.set(0, -Rs * 0.35, Rs * 0.1);
    const jg = new THREE.SphereGeometry(1, 14, 10);
    jg.scale(Rs * 0.48, Rs * 0.22, (snout + Rs) * 0.55).translate(0, -Rs * 0.04, (snout + Rs) * 0.45);
    const uv = jg.attributes.uv as THREE.BufferAttribute, nrm = jg.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      if (nrm.getY(i) > 0.3) uv.setXY(i, 0.95, 0.03); else uv.setXY(i, 0.05 + uv.getX(i) * 0.38, 0.05 + uv.getY(i) * 0.1);
    }
    const jm = new THREE.Mesh(jg, headMat);
    jaw.add(jm);
    outline(jm, INK, 1.2, 0.01);
    headBone.add(jaw);
  }
  // collar: a band round the neck bone
  if (o.collar !== undefined) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.1 * GI, 0.018, 6, 16), charToon({ color: o.collar, rim: 0.3 }));
    c.rotation.x = Math.PI / 2 + 0.6;
    c.position.set(0, -0.06, -0.04);
    rig.bones.neck.add(c);
  }

  group.add(body);
  group.scale.setScalar(o.scale);

  // ---- posing ----
  const B = rig.bones;
  const pose = restPose();
  const rest = new Map<THREE.Bone, THREE.Vector3>();
  for (const b of rig.list) rest.set(b, b.position.clone());
  const apply = () => {
    const P = pose;
    rig.reset();
    const sit = P.sit, cr = P.crouch, re = P.rear, li = P.lie;
    // the whole body: sitting tips the front up and drops the rump; crouching drops the chest; rearing stands on the hind legs
    B.hips.position.y = rest.get(B.hips)!.y - (0.16 * sit + 0.1 * cr + 0.05 * re + 0.3 * li) * LG;
    B.hips.position.z = rest.get(B.hips)!.z + 0.04 * sit;
    B.hips.rotation.x = -0.62 * sit + 0.12 * cr - 1.0 * re;
    B.chest.rotation.x = 0.12 * sit + 0.1 * cr + 0.2 * re;
    B.chest.scale.setScalar(1 + P.breathe * 0.03);
    const frontComp = 0.62 * sit - 0.12 * cr + 1.0 * re - 0.22 * sit - 0.1 * cr - 0.2 * re;
    for (const s of ['fl', 'fr']) {
      B[`${s}0`].rotation.x = frontComp * (1 - re) + 0.2 * sit - 0.5 * cr + (-0.9 + 1.0) * re - 1.2 * li;
      B[`${s}1`].rotation.x = 0.6 * cr - 1.5 * re + 0.2 * li;
      B[`${s}2`].rotation.x = -0.3 * cr + 0.6 * re - 0.2 * sit;
    }
    for (const s of ['bl', 'br']) {
      B[`${s}0`].rotation.x = -1.05 * sit - 0.3 * cr + 0.75 * re + 1.0 * li;
      B[`${s}1`].rotation.x = 1.75 * sit + 0.5 * cr - 0.35 * re + 0.5 * li;
      B[`${s}2`].rotation.x = -1.1 * sit - 0.2 * cr - 0.2 * re - 0.8 * li;
      B[`${s}3`].rotation.x = 0.2 * sit + 0.4 * re;
    }
    B.tail0.rotation.x = 0.6 * sit - 0.4 * P.tailUp + 0.5 * li;
    B.tail0.rotation.y = P.wag;
    B.tail1.rotation.y = P.wag * 0.8;
    B.tail1.rotation.x = 0.2 * sit - 0.2 * P.tailUp;
    // the head stays roughly level whatever the body does, then looks
    B.neck.rotation.x = -0.15 * sit + 0.2 * cr - 0.1 * re;
    B.head.rotation.set(0.47 * sit - 0.2 * cr + 0.9 * re + P.headPitch, P.headYaw, P.headRoll, 'YXZ');
    if (jaw) jaw.rotation.x = P.jaw * 0.55;
  };
  apply();
  const mats = [bodyMat, headMat];
  return {
    group, bones: B, head: headBone, mouth, eyes, mats, pose, apply, opts: o,
    blink(shut) { eyes.scale.y = 1 - 0.85 * shut; },
  };
}

// ---------------- the dogs of the film ----------------
export const DOGS = {
  chief: (): DogOpts => ({ coat: 0x24222a, coat2: 0x46444e, pattern: 'plain', ears: 'up', shag: 0.85, length: 1.08, leg: 1.12, girth: 0.88, snout: 1.25, head: 1.0, iris: 0x4a3418, brows: 0.2, jaw: true, scale: 2.25, seed: 101 }),
  rex: (): DogOpts => ({ coat: 0x8e8c88, coat2: 0xe6e0d4, pattern: 'plain', ears: 'fold', shag: 1.0, long: 0.6, length: 1.0, leg: 0.95, girth: 1.05, snout: 0.9, head: 1.08, brows: 1, scale: 2.15, seed: 111, tip: 0xe6e0d4 }),
  king: (): DogOpts => ({ coat: 0xe2d6bc, coat2: 0x8a5a36, pattern: 'saddle', ears: 'flop', earColor: 0x8a5a36, shag: 0.35, length: 1.05, leg: 0.92, girth: 1.18, snout: 0.95, head: 1.15, brows: 0.3, scale: 2.2, seed: 121 }),
  boss: (): DogOpts => ({ coat: 0xb88e5e, coat2: 0x5a4030, pattern: 'mask', ears: 'flop', earColor: 0x6a4a34, shag: 0.4, length: 1.0, leg: 0.98, girth: 1.05, snout: 0.75, head: 1.1, scale: 2.15, seed: 131, jersey: { color: 0xf2eee2, trim: 0x2a3a6a, text: 'DRAGONS', num: '8' } }),
  duke: (): DogOpts => ({ coat: 0x7a5034, coat2: 0xeee4d2, pattern: 'blaze', ears: 'long', earColor: 0x5a3a26, shag: 0.55, long: 0.2, length: 1.0, leg: 1.0, girth: 1.0, snout: 1.05, head: 1.02, socks: 0xeee4d2, brows: 0.4, scale: 2.15, seed: 141 }),
  nutmeg: (): DogOpts => ({ coat: 0xecd6a6, coat2: 0xf6ead0, pattern: 'plain', ears: 'long', earColor: 0xd8b276, shag: 0.25, long: 1.0, length: 0.98, leg: 1.02, girth: 0.95, snout: 1.05, head: 1.0, fringe: true, collar: 0xc8323c, scale: 2.15, seed: 151 }),
  spots: (): DogOpts => ({ coat: 0xf0ece2, coat2: 0x3a3a40, pattern: 'spots', ears: 'up', earColor: 0xf0ece2, nose: 0xd88a8a, shag: 0.15, length: 1.02, leg: 1.1, girth: 0.92, snout: 1.15, head: 1.05, scale: 2.2, seed: 161, collar: 0x5a6a8a }),
};

// ---------------- life ----------------
/**
 * A dog's own little life: it breathes, blinks, wags now and then, looks about and at the camera when it is
 * near, on twos. Reactions are layered on top by whoever owns the dog: a turn of the head all together, a
 * bark, a catch, a trick.
 */
export class DogLife {
  readonly dog: Dog;
  readonly sm: StopMotion;
  readonly look = new LookAt(1.1, 0.5);
  private rng: Rng;
  private nextBlink = 1;
  private blinkT = 9;
  private glanceT = 0;
  private glance = new THREE.Vector2();
  private wagAmp = new Spring(0, 1.2, 0.8);
  /** the pose the owner wants on top of the idle (sit, rear...) */
  base: Partial<DogPose> = {};
  /** 0..1: how much the dog looks at the target (the camera) */
  attention = 0.6;
  /** reaction overrides for this step, filled in by the owner's `react` callback */
  react: ((P: DogPose, t: number) => void) | null = null;

  constructor(dog: Dog, seed: number) {
    this.dog = dog;
    this.sm = new StopMotion(12, seed);
    this.rng = new Rng(seed);
    this.nextBlink = 1 + this.rng.next() * 3;
  }

  update(dt: number, target: THREE.Vector3 | null) {
    // the look spring runs every frame (it is smooth), the pose is drawn on twos
    const [ly, lp] = this.look.update(this.dog.head, target, dt, this.attention);
    if (!this.sm.tick(dt)) return;
    const st = this.sm.t;
    const P = this.dog.pose;
    Object.assign(P, restPose(), this.base);
    // idle: breathing, a slow glance about, a wag now and then
    P.breathe = Math.sin(st * 2.2) * 0.5 + 0.5;
    this.glanceT -= 1 / 12;
    if (this.glanceT <= 0) { this.glanceT = 1.5 + this.rng.next() * 3; this.glance.set(this.rng.range(-0.6, 0.6), this.rng.range(-0.15, 0.2)); }
    P.headYaw = lerp(this.glance.x, ly, this.attention) + Math.sin(st * 0.7) * 0.05;
    P.headPitch = lerp(this.glance.y, lp, this.attention);
    P.headRoll = Math.sin(st * 0.45) * 0.06;
    const wagging = Math.sin(st * 0.23 + this.rng.next() * 0.01) > 0.55 ? 1 : 0;
    P.wag = this.wagAmp.update(wagging * 0.35, 1 / 12) * Math.sin(st * 13);
    // blink
    this.nextBlink -= 1 / 12; this.blinkT += 1 / 12;
    if (this.nextBlink <= 0) { this.nextBlink = 2 + this.rng.next() * 4; this.blinkT = 0; }
    this.dog.blink(this.blinkT < 0.17 ? 1 : 0);
    this.react?.(P, st);
    this.dog.apply();
    this.sm.boil(this.dog.mats);
  }
}

/** For reactions: an envelope on the stepped clock. */
export const env = envelope;
