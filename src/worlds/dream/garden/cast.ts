import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon } from '../../../engine/Paint';
import { outline } from '../../../engine/Rig';
import { clamp, lerp } from '../../../engine/math';
import { makeTotoro, type Totoro } from '../../ghibli/totoro';
import { makeKid, type Kid } from '../../ghibli/people';
import type { Subject } from '../../../game/Subject';
import type { SetContext } from '../common';
import { komaTexture } from './textures';

/*
 * The garden's cast: Totoro, Chu and Chibi, Satsuki and Mei in their nightclothes, Totoro's spinning top
 * and the ocarinas. The same characters appear at midnight (garden scene) and at dawn (home scene): each
 * scene parents them into its own group when it starts updating, so they are built once.
 *
 * Also the poses: `poseKid` blends the girls' joints between named poses (standing, crouching, reaching up,
 * riding on Totoro's belly, sitting on a branch, playing an ocarina, waving, cheering, running), and
 * `tPose` makes Totoro poses (dancing, flying, playing, waving) for his `pose` override.
 */

export interface Cast {
  totoro: Totoro; chu: Totoro; chibi: Totoro;
  satsuki: Kid; mei: Kid;
  /** the spinning top: origin on its upper face (where Totoro's feet go), its tip 2.4 below */
  top: THREE.Group; topSpin: THREE.Group;
  /** ocarinas: Totoro's, Chu's, Chibi's (in their own space, at the mouth) and the girls' (in their right hands) */
  ocarinas: THREE.Object3D[];
  /** points on Totoro's body, in his own space: the girls' seats on his belly, Chibi's seat on his head */
  slots: { satsuki: THREE.Vector3; mei: THREE.Vector3; chibi: THREE.Vector3 };
  /** Totoro's raised +x paw in world space (Chu hangs from it while they fly) */
  paw(out: THREE.Vector3): THREE.Vector3;
  /** each scene's photo subjects for these characters; a scene switches the other scene's off while it runs */
  subjects: { garden: Subject[]; home: Subject[] };
}

const casts = new WeakMap<object, Cast>();

/** The cast, built the first time either scene asks for it. */
export function getCast(ctx: SetContext): Cast {
  let c = casts.get(ctx.mount);
  if (!c) { c = buildCast(); casts.set(ctx.mount, c); }
  return c;
}

/**
 * Fewer draw calls: meshes that hang still on the same joint and share a material (claws, whiskers, the
 * umbrella's shaft and tip, a hand and its forearm) are merged into one mesh on that joint. Meshes with an
 * outline or other children, skinned meshes and outlines are left alone, so nothing moves differently.
 */
function mergeSiblings(root: THREE.Object3D) {
  const parents: THREE.Object3D[] = [];
  root.traverse((o) => parents.push(o));
  for (const parent of parents) {
    const buckets = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of parent.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || m.children.length || m.userData.outline || Array.isArray(m.material)) continue;
      const list = buckets.get(m.material as THREE.Material) ?? [];
      list.push(m); buckets.set(m.material as THREE.Material, list);
    }
    for (const [mat, list] of buckets) {
      if (list.length < 2) continue;
      const geos = list.map((m) => { m.updateMatrix(); const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g.applyMatrix4(m.matrix); });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const out = new THREE.Mesh(merged, mat);
      out.castShadow = list[0].castShadow; out.receiveShadow = list[0].receiveShadow; out.visible = list[0].visible;
      for (const m of list) parent.remove(m);
      parent.add(out);
    }
  }
}

/** Shadows from the body and limbs, not from the ink outlines. */
function castShadows(o: THREE.Object3D) {
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && !m.userData.outline) m.castShadow = true; });
}

function buildCast(): Cast {
  const totoro = makeTotoro({ umbrella: true });
  const chu = makeTotoro({ color: 0x5f7fa8, belly: 0xe8e2d0, scale: 0.62, chevrons: false, bag: true, umbrella: true, umbrellaColor: 0x3a3a4a });
  const chibi = makeTotoro({ color: 0xf4f1ea, belly: -1, scale: 0.34, chevrons: false, leaf: true, umbrella: true, umbrellaColor: 0x4a5a3a });
  castShadows(totoro.group);
  // the same nightclothes as when they fly with Totoro over the fields
  const satsuki = makeKid({
    hair: 0x3a2a22, style: 'short', top: 0xf4ecd4, sleeves: 'short', bottom: { kind: 'dress', color: 0xf2e6c8, length: 0.46 },
    socks: 'bare', shoes: 0xf0cfb4, face: { mouth: 'open', blush: 0.55 }, seed: 31,
  });
  const mei = makeKid({
    hair: 0x8a5a30, style: 'pigtails', top: 0xf6dce4, sleeves: 'short', bottom: { kind: 'dress', color: 0xf4d2de, length: 0.4 },
    socks: 'bare', shoes: 0xf0cfb4, face: { mouth: 'open', blush: 0.65 }, seed: 33,
  });
  mei.group.scale.setScalar(0.68);
  castShadows(satsuki.group); castShadows(mei.group);

  // ---- the spinning top: painted rings, an iron tip, a knob on the upper face ----
  const top = new THREE.Group();
  const topSpin = new THREE.Group();
  top.add(topSpin);
  const prof: Array<[number, number]> = [[0.001, -2.4], [0.08, -2.28], [0.22, -2.05], [0.6, -1.62], [1.12, -1.16], [1.62, -0.76], [1.94, -0.45], [2.0, -0.28], [1.9, -0.12], [1.5, -0.02], [0.8, 0.0], [0.001, 0.02]];
  const topMesh = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 36), charToon({ map: komaTexture(), rim: 0.4, shade: 0x9a90b0 }));
  topMesh.castShadow = true;
  topSpin.add(topMesh);
  outline(topMesh, 0x24252e, 1.4, 0.04);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.3, 10), charToon({ color: 0x8a5a34, rim: 0.3 }));
  knob.position.set(0, 0.1, -0.6);
  topSpin.add(knob);

  // ---- ocarinas: small clay ones with a mouthpiece ----
  const clay = charToon({ color: 0x7a9ab8, rim: 0.4, shade: 0x8a8cb0 });
  const ocarina = (s: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), clay);
    body.scale.set(0.16 * s, 0.12 * s, 0.26 * s);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.05 * s, 0.14 * s, 8), clay);
    tip.rotation.x = Math.PI / 2; tip.position.set(0, 0.03 * s, -0.27 * s);
    g.add(body, tip);
    g.visible = false;
    return g;
  };
  const ocarinas: THREE.Object3D[] = [];
  for (const t of [totoro, chu, chibi]) {
    const o = ocarina(2.6);
    // held just in front of the mouth, pointing at it
    o.position.set(0, 3.42, 1.72); o.rotation.x = -0.25;
    t.group.add(o);
    ocarinas.push(o);
  }
  for (const k of [satsuki, mei]) {
    // on the forearm just past the hand (the hand mesh itself is squashed), pointing back along it
    const o = ocarina(0.8);
    o.position.set(0.03, -0.4, 0.06); o.rotation.set(-1.4, 0, 0);
    k.elbow[0].add(o);
    ocarinas.push(o);
  }

  for (const o of [totoro.group, chu.group, chibi.group, satsuki.group, mei.group]) mergeSiblings(o);

  // ---- seats on Totoro, and the paw Chu hangs from ----
  totoro.group.updateMatrixWorld(true);
  const chest = totoro.group.getObjectByName('chest');
  const arm = chest?.children.find((c) => !(c as THREE.Bone).isBone && (c as THREE.Group).isGroup && c.position.x > 0.5) ?? null;
  const pawLocal = new THREE.Vector3(0.15, -1.5, 0.05);
  return {
    totoro, chu, chibi, satsuki, mei, top, topSpin, ocarinas, subjects: { garden: [], home: [] },
    slots: { satsuki: new THREE.Vector3(-0.62, 0.52, 1.88), mei: new THREE.Vector3(0.74, 0.5, 1.86), chibi: new THREE.Vector3(-0.32, 4.6, 0.48) },
    paw(out) {
      if (arm) { arm.updateWorldMatrix(true, false); return out.copy(pawLocal).applyMatrix4(arm.matrixWorld); }
      return totoro.group.localToWorld(out.set(2.9, 2.6, 0.3));
    },
  };
}

// ---------------- the girls' poses ----------------
type J2 = [number, number];
interface Joints { pelvisY: number; spineX: number; headX: number; sh: [J2, J2]; el: [J2, J2]; hip: [J2, J2]; knee: J2 }
const STAND: Joints = { pelvisY: 1.08, spineX: 0, headX: 0, sh: [[0.05, -0.12], [0.05, 0.12]], el: [[-0.15, 0], [-0.15, 0]], hip: [[0, -0.04], [0, 0.04]], knee: [0, 0] };
const CROUCH: Joints = { pelvisY: 0.63, spineX: 0.45, headX: 0.15, sh: [[-0.55, -0.25], [-0.55, 0.25]], el: [[-0.7, 0], [-0.7, 0]], hip: [[-1.0, -0.15], [-1.0, 0.15]], knee: [2.0, 2.0] };
const REACH: Joints = { pelvisY: 1.15, spineX: -0.12, headX: -0.38, sh: [[-2.9, -0.35], [-2.9, 0.35]], el: [[-0.1, 0], [-0.1, 0]], hip: [[0.04, -0.04], [0.04, 0.04]], knee: [0, 0] };
/** against Totoro's belly: legs out in front, hands behind holding his fur */
const RIDE: Joints = { pelvisY: 1.08, spineX: -0.12, headX: -0.05, sh: [[0.75, 0.5], [0.75, -0.5]], el: [[-0.5, 0], [-0.5, 0]], hip: [[-1.25, -0.18], [-1.25, 0.18]], knee: [1.1, 1.1] };
/** sitting on a branch: thighs along it, shins hanging, hands in the lap */
const SIT: Joints = { pelvisY: 0.15, spineX: 0.05, headX: 0, sh: [[-0.35, -0.15], [-0.35, 0.15]], el: [[-0.9, 0], [-0.9, 0]], hip: [[-1.5, -0.12], [-1.5, 0.12]], knee: [1.45, 1.45] };
const CHEER: Joints = { pelvisY: 1.08, spineX: -0.1, headX: -0.25, sh: [[-2.7, -0.55], [-2.7, 0.55]], el: [[-0.25, 0], [-0.25, 0]], hip: [[-0.25, -0.1], [-0.25, 0.1]], knee: [0.5, 0.5] };

const mixJ = (a: Joints, b: Joints, w: number): Joints => {
  if (w <= 0) return a;
  const l = (x: number, y: number) => lerp(x, y, w);
  const l2 = (x: J2, y: J2): J2 => [l(x[0], y[0]), l(x[1], y[1])];
  return { pelvisY: l(a.pelvisY, b.pelvisY), spineX: l(a.spineX, b.spineX), headX: l(a.headX, b.headX), sh: [l2(a.sh[0], b.sh[0]), l2(a.sh[1], b.sh[1])], el: [l2(a.el[0], b.el[0]), l2(a.el[1], b.el[1])], hip: [l2(a.hip[0], b.hip[0]), l2(a.hip[1], b.hip[1])], knee: l2(a.knee, b.knee) };
};

export interface KidPose { crouch?: number; reach?: number; ride?: number; sit?: number; cheer?: number; run?: number; play?: number; wave?: number; wave2?: number }

/**
 * Set a girl's joints from pose weights (each 0..1, applied in this order: crouch, reach, ride, sit, cheer,
 * run; then the arms: play, wave with the right hand, wave with both). Call after `kid.tick`.
 * Returns how high to lift her off the ground this frame (for hops while cheering or running).
 */
export function poseKid(k: Kid, p: KidPose, t: number, phase = 0) {
  let j = STAND;
  j = mixJ(j, CROUCH, p.crouch ?? 0);
  j = mixJ(j, REACH, p.reach ?? 0);
  j = mixJ(j, RIDE, p.ride ?? 0);
  j = mixJ(j, SIT, p.sit ?? 0);
  j = mixJ(j, CHEER, p.cheer ?? 0);
  let lift = 0;
  const run = p.run ?? 0;
  if (run > 0) {
    // a running stride: legs and arms swing in turn, the body bobs and leans forward
    const f = t * 9 + phase, s = Math.sin(f);
    const R: Joints = {
      pelvisY: 1.04, spineX: 0.18, headX: -0.05,
      sh: [[s * 0.8, -0.2], [-s * 0.8, 0.2]], el: [[-1.3, 0], [-1.3, 0]],
      hip: [[-s * 0.8 - 0.1, -0.05], [s * 0.8 - 0.1, 0.05]], knee: [0.35 + 0.9 * Math.max(0, Math.sin(f + 1.3)), 0.35 + 0.9 * Math.max(0, Math.sin(f + 1.3 + Math.PI))],
    };
    j = mixJ(j, R, run);
    lift += Math.abs(Math.sin(f)) * 0.12 * run;
  }
  const cheer = p.cheer ?? 0;
  if (cheer > 0) {
    // jumping for joy: knees tuck at the top of each jump
    const h = Math.abs(Math.sin(t * 5.2 + phase));
    lift += h * 0.55 * cheer;
    j = { ...j, knee: [j.knee[0] + h * 0.6 * cheer, j.knee[1] + h * 0.6 * cheer] };
  }
  k.pelvis.position.y = j.pelvisY;
  k.spine.rotation.x = j.spineX;
  k.head.rotation.x += j.headX;
  for (let i = 0; i < 2; i++) {
    k.shoulder[i].rotation.set(j.sh[i][0], 0, j.sh[i][1]);
    k.elbow[i].rotation.set(j.el[i][0], 0, j.el[i][1]);
    k.hip[i].rotation.set(j.hip[i][0], 0, j.hip[i][1]);
    k.knee[i].rotation.x = j.knee[i];
  }
  // arms only: an ocarina at the lips, a wave with the right hand (index 0), a wave with both
  const play = clamp(p.play ?? 0, 0, 1);
  if (play > 0) {
    const tgt: [J2, J2] = [[-1.25, 0.5], [-1.25, -0.5]];
    for (let i = 0; i < 2; i++) {
      k.shoulder[i].rotation.set(lerp(k.shoulder[i].rotation.x, tgt[i][0], play), 0, lerp(k.shoulder[i].rotation.z, tgt[i][1], play));
      k.elbow[i].rotation.set(lerp(k.elbow[i].rotation.x, -1.95, play), 0, 0);
    }
    // fingers moving over the holes: a small tremble
    k.elbow[0].rotation.z = Math.sin(t * 13) * 0.04 * play;
  }
  const wave = clamp(p.wave ?? 0, 0, 1), wave2 = clamp(p.wave2 ?? 0, 0, 1);
  for (let i = 0; i < 2; i++) {
    const w = i === 0 ? Math.max(wave, wave2) : wave2;
    if (w <= 0) continue;
    const s = i === 0 ? -1 : 1;
    k.shoulder[i].rotation.set(lerp(k.shoulder[i].rotation.x, -0.25, w), 0, lerp(k.shoulder[i].rotation.z, s * 2.55, w));
    k.elbow[i].rotation.set(lerp(k.elbow[i].rotation.x, -0.15, w), 0, w * s * (Math.sin(t * 10 + i * 1.3 + phase) * 0.5 + 0.15));
  }
  if (k.skirt) { k.skirt.scale.x = 1 + Math.sin(t * 3 + phase) * 0.02 * (1 + run * 3); k.skirt.rotation.x = -0.06 * (p.ride ?? 0) - 0.1 * run; }
  return lift;
}

// ---------------- Totoro's poses ----------------
export type TotoroPose = NonNullable<Totoro['pose']>;

/** The seed dance: `c` crouched down (0..1), `r` stretched up on tiptoe with arms high (0..1). */
export function dancePose(c: number, r: number, out: TotoroPose = {}): TotoroPose {
  out.up = [lerp(lerp(-0.25, -0.45, c), -2.8, r), lerp(lerp(-2.0, -1.55, c), -2.95, r)];
  out.out = [lerp(0.5, 0.5, r), lerp(0.3, 0.1, r)];
  out.stretch = -0.13 * c + 0.12 * r;
  out.rise = 0.3 * r;
  out.head = 0.18 * c - 0.38 * r;
  out.mouth = 0.15 + 0.35 * r;
  out.lean = 0.1 * c - 0.05 * r;
  return out;
}

/** Arms spread wide, flying (as over the fields), with a slow flap. */
export function flyPose(t: number, out: TotoroPose = {}): TotoroPose {
  const flap = Math.sin(t * 1.7) * 0.06;
  out.out = [1.25 + flap, 1.25 + flap]; out.up = [-0.22, -0.22]; out.mouth = 0.55; out.lean = 0.06; out.stretch = 0; out.rise = 0; out.head = 0;
  return out;
}

/** Sitting on the bough with an ocarina at the lips in both paws. */
export function playPose(t: number, out: TotoroPose = {}): TotoroPose {
  out.up = [-2.0, -2.0]; out.out = [-0.95, -0.95]; out.mouth = 0; out.lean = -0.06; out.stretch = -0.08 + Math.sin(t * 2.1) * 0.012; out.rise = 0; out.head = 0.06 + Math.sin(t * 1.05) * 0.04;
  return out;
}

/** Reaching both arms out to catch the girls. */
export function gatherPose(k: number, out: TotoroPose = {}): TotoroPose {
  out.up = [lerp(-0.2, -1.35, k), lerp(-2.4, -1.35, k)]; out.out = [lerp(0.4, 0.75, k), lerp(0.25, 0.75, k)]; out.lean = 0.14 * k; out.mouth = 0.4 * k; out.stretch = 0; out.rise = 0; out.head = 0.1 * k;
  return out;
}

/** Waving with the free (-x) paw; the umbrella stays up in the other. */
export function wavePose(t: number, w: number, out: TotoroPose = {}): TotoroPose {
  out.up = [lerp(-0.25, -2.55 + Math.sin(t * 6) * 0.25, w), -2.45]; out.out = [lerp(0.4, 0.55 + Math.sin(t * 6) * 0.3, w), 0.22];
  out.mouth = 0.2 + 0.3 * w; out.lean = 0; out.stretch = 0; out.rise = 0; out.head = -0.08 * w;
  return out;
}
