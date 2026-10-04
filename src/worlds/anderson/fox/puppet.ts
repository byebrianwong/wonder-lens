import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon, Painter } from '../../../engine/Paint';
import { sculpt, surfaceNormal, limbGeometry, LookAt, profileShape } from '../../../engine/Rig';
import { clamp, lerp, smoothstep, TAU } from '../../../engine/math';
import { StopMotion } from '../stopmotion';
import { css } from '../textures';
import { furByDirection, plainFur, SNOUT, eyeDir, type ColorFn } from './paint';

/*
 * Stop-motion animal puppets in clothes, as in Fantastic Mr. Fox: a sculpted head with a snout, painted fur
 * markings, glossy bead eyes, ears on pivots, a lathe-turned torso in a jacket or a dress, jointed arms and
 * legs (shoulder, elbow, wrist, hip, knee, ankle), paws, and a tail. They stand upright, about 1.3 to 2 units
 * tall, facing +z with the origin between the feet.
 *
 * They move "on twos" like the film's puppets: `puppet.step(dt)` returns true twelve times a second, and the
 * owner poses the joints only then; between steps the pose holds. On each step the fur maps "boil" (shift a
 * hair), as real fur does when the animators' fingers touch it between frames.
 */

/** The warm shadow tone of a puppet lit by lamplight. */
const SHADE = 0xa89490;

export interface HeadSpec {
  /** head radius */
  R: number;
  /** snout length, in head radii */
  snout: number;
  /** cheek ruff width, in head radii (a fox's wide cheeks) */
  cheeks?: number;
  /** base shape scale (x, y, z) */
  squash?: [number, number, number];
  colors: ColorFn;
  ears: 'fox' | 'round' | 'long' | 'small' | 'wolf' | 'none';
  earOuter: number;
  earInner: number;
  earTip?: number;
  /** ear size multiplier */
  earSize?: number;
  eyeSpread?: number;
  eyeUp?: number;
  /** eye radius, in head radii */
  eyeR?: number;
  eyeColor?: number;
  whiskers?: number;
  /** paint the head at full size (for the stars seen close up) */
  hiRes?: boolean;
  /** spiral eyes as well (Kylie zoning out) */
  swirl?: boolean;
  seed: number;
}

export interface BodySpec {
  /** hip joint height above the soles */
  legLen: number;
  /** pelvis to the base of the neck */
  torsoLen: number;
  /** torso half-widths at the hips, the waist, the chest */
  hips: number;
  waist: number;
  chest: number;
  /** front-to-back scale of the torso */
  depth: number;
  /** a round belly (0 none) */
  belly?: number;
  /** a jacket's skirt flaring below the waist, this far down past the hips */
  skirt?: number;
  armLen: [number, number];
  armR: number;
  legR: number;
  neckLen: number;
}

export interface Outfit {
  torso: THREE.Texture;
  /** sleeve cloth; null for bare furry arms */
  sleeve: THREE.Texture | null;
  /** trouser cloth; null for bare furry legs */
  trousers: THREE.Texture | null;
  /** trousers stop above the knee */
  shorts?: boolean;
  skirt?: { tex: THREE.Texture; len: number; flare: number };
  cape?: { tex: THREE.Texture; len: number };
  bandana?: number;
}

export interface TailSpec {
  len: number; r: number; color: number; tip?: number; thin?: boolean;
  /** angle below the horizontal at the root */
  lift?: number;
  /** how far the tail curls up towards its tip (radians) */
  curl?: number;
}

export interface PuppetSpec {
  head: HeadSpec;
  body: BodySpec;
  outfit: Outfit;
  /** fur colour of the arms and legs where they are bare, and of the paws */
  limbFur: number;
  paw: number;
  tail?: TailSpec;
  seed: number;
}

export interface Puppet {
  group: THREE.Group;
  /** an inner group for whole-body moves (a hop, a lean) */
  root: THREE.Group;
  pelvis: THREE.Group; spine: THREE.Group; neck: THREE.Group; head: THREE.Group;
  /** index 0 is the puppet's right (-x), 1 its left (+x) */
  sh: THREE.Group[]; el: THREE.Group[]; wr: THREE.Group[];
  hip: THREE.Group[]; knee: THREE.Group[]; ank: THREE.Group[];
  tail: THREE.Group | null;
  ears: THREE.Group[];
  /** eye groups: scale.y closes them */
  eyes: THREE.Group[];
  /** the spiral eyes, hidden until shown */
  swirls: THREE.Object3D[];
  furMats: THREE.MeshToonMaterial[];
  look: LookAt;
  sm: StopMotion;
  /** seconds between this step and the last one */
  stepDt: number;
  spec: PuppetSpec;
  /** advance the stepped clock; true when the puppet should be posed this frame (and its fur has boiled) */
  step(dt: number): boolean;
  /** breathing, blinking, a little weight shift and the head turning to `target`; call on a step */
  idle(t: number, target: THREE.Vector3 | null, o?: { breathe?: number; lookWeight?: number; blink?: boolean }): void;
  /** pose an arm: forward raise, outward raise, elbow bend, all radians */
  arm(side: 0 | 1, fwd: number, out: number, bend: number, twist?: number): void;
  /** pose a leg: forward swing, outward, knee bend */
  leg(side: 0 | 1, fwd: number, out: number, bend: number): void;
}

const mats = new Map<string, THREE.Material>();
const cached = <T extends THREE.Material>(key: string, make: () => T) => { let m = mats.get(key) as T | undefined; if (!m) { m = make(); mats.set(key, m); } return m; };

/** Glossy bead eyes (shared by every puppet with the same eye colour). */
const eyeMat = (color: number) => cached(`eye${color}`, () => new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x9a9a9a, emissive: 0x050302 }));

/** A spiral painted on the front of an eye bead (Kylie zoning out). */
let swirlTex: THREE.Texture | null = null;
function swirlMat() {
  swirlTex ??= (() => {
    const p = new Painter(256, 128, 5).fill('#f6f2e8');
    const g = p.g;
    g.strokeStyle = '#2a2230'; g.lineWidth = 3.4; g.lineCap = 'round';
    g.beginPath();
    for (let a = 0; a < TAU * 3.2; a += 0.12) { const r = 1 + a * 2.1; const x = 64 + Math.cos(a) * r * 0.5, y = 64 + Math.sin(a) * r; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    return p.texture();
  })();
  return cached('swirl', () => new THREE.MeshPhongMaterial({ map: swirlTex, shininess: 60, specular: 0x666666 }));
}

/**
 * Ear fur. Cone ears: the front of the cone is at the canvas edges, so the pale inner tuft goes there,
 * with the coat colour round its rim and on the back, and a dark tip at the top. Disc ears: a pale centre.
 */
function earTexture(outer: number, inner: number, tip: number | undefined, seed: number, sphere: boolean) {
  const p = new Painter(128, 128, seed).fill(css(outer));
  const g = p.g;
  g.fillStyle = css(inner);
  if (sphere) { g.beginPath(); g.ellipse(32, 70, 18, 40, 0, 0, TAU); g.fill(); }
  else for (const x of [0, 128]) { g.beginPath(); g.ellipse(x, 92, 15, 60, 0, 0, TAU); g.fill(); }
  if (tip !== undefined) { const gr = g.createLinearGradient(0, 0, 0, 46); gr.addColorStop(0, css(tip)); gr.addColorStop(0.55, css(tip)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 46); }
  p.fur({ n: 220, colors: [css(outer, 0.85), css(outer, 1.12)], len: [4, 9], width: [1.4, 2.6], alpha: [0.25, 0.45], angle: () => -Math.PI / 2 });
  p.fur({ n: 90, colors: [css(inner, 0.95), css(inner, 1.05)], len: [5, 10], width: [1.4, 2.4], alpha: [0.4, 0.6], angle: () => -Math.PI / 2, x: [0, 0.1], y: [0.4, 1] });
  p.fur({ n: 90, colors: [css(inner, 0.95), css(inner, 1.05)], len: [5, 10], width: [1.4, 2.4], alpha: [0.4, 0.6], angle: () => -Math.PI / 2, x: [0.9, 1], y: [0.4, 1] });
  return p.texture();
}

/** The head's shape: an egg, a tapered snout along SNOUT ending in a nose knob, and cheek ruffs. */
export function headShape(h: HeadSpec) {
  const [sx, sy, sz] = h.squash ?? [1, 0.94, 1];
  return (d: THREE.Vector3, out: THREE.Vector3) => {
    out.set(d.x * sx, d.y * sy, d.z * sz);
    const c = d.dot(SNOUT);
    const k = smoothstep(0.42, 1, c);
    out.addScaledVector(SNOUT, h.snout * Math.pow(k, 1.8));
    if (h.cheeks) {
      const ch = smoothstep(0.15, 0.6, Math.abs(d.x)) * smoothstep(0.2, -0.15, d.y) * smoothstep(-0.4, 0.3, d.z);
      out.x += Math.sign(d.x) * h.cheeks * ch;
      out.y -= h.cheeks * 0.35 * ch;
    }
    out.addScaledVector(SNOUT, 0.07 * smoothstep(0.975, 1, c));
    return out.multiplyScalar(h.R);
  };
}

function makeEars(h: HeadSpec, mat: THREE.Material, head: THREE.Group, shape: (d: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3) {
  const ears: THREE.Group[] = [];
  if (h.ears === 'none') return ears;
  const R = h.R, k = h.earSize ?? 1;
  let geo: THREE.BufferGeometry;
  let dir: (s: number) => THREE.Vector3;
  let tilt = 0.3;
  switch (h.ears) {
    case 'fox': geo = new THREE.ConeGeometry(0.4 * R * k, 1.05 * R * k, 10, 3).scale(1, 1, 0.42).translate(0, 0.46 * R * k, 0); dir = (s) => new THREE.Vector3(s * 0.52, 0.8, -0.12); tilt = 0.32; break;
    case 'wolf': geo = new THREE.ConeGeometry(0.38 * R * k, 0.8 * R * k, 10, 3).scale(1, 1, 0.5).translate(0, 0.34 * R * k, 0); dir = (s) => new THREE.Vector3(s * 0.55, 0.78, -0.18); tilt = 0.28; break;
    case 'long': geo = new THREE.SphereGeometry(1, 12, 10).scale(0.2 * R * k, 1.05 * R * k, 0.08 * R * k).translate(0, 0.95 * R * k, 0); dir = (s) => new THREE.Vector3(s * 0.3, 0.92, -0.2); tilt = 0.18; break;
    case 'small': geo = new THREE.SphereGeometry(1, 12, 10).scale(0.32 * R * k, 0.32 * R * k, 0.08 * R * k).translate(0, 0.22 * R * k, 0); dir = (s) => new THREE.Vector3(s * 0.62, 0.68, -0.25); tilt = 0.5; break;
    default: geo = new THREE.SphereGeometry(1, 12, 10).scale(0.3 * R * k, 0.3 * R * k, 0.07 * R * k).translate(0, 0.2 * R * k, 0); dir = (s) => new THREE.Vector3(s * 0.66, 0.6, -0.2); tilt = 0.75; break;
  }
  const p = new THREE.Vector3();
  for (const s of [-1, 1]) {
    const d = dir(s).normalize();
    shape(d, p);
    const pivot = new THREE.Group();
    pivot.position.copy(p).multiplyScalar(0.92);
    pivot.rotation.set(-0.08, s * 0.25, -s * tilt);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    pivot.add(m);
    head.add(pivot);
    ears.push(pivot);
  }
  return ears;
}

/** A puppet's head on its own group (origin at the head's centre), with ears, eyes and whiskers. */
export function makeHead(h: HeadSpec) {
  const group = new THREE.Group();
  const shape = headShape(h);
  const tex = furByDirection(h.colors, { seed: h.seed, W: h.hiRes ? 512 : 384, H: h.hiRes ? 256 : 192, strokes: h.hiRes ? 1800 : 1100 });
  const furMat = charToon({ map: tex, rim: 0.3, shade: SHADE });
  const skull = new THREE.Mesh(sculpt(shape, 40, 28), furMat);
  skull.castShadow = true;
  group.add(skull);
  const earMat = charToon({ map: earTexture(h.earOuter, h.earInner, h.earTip, h.seed + 1, h.ears !== 'fox' && h.ears !== 'wolf'), rim: 0.35, shade: SHADE });
  const ears = makeEars(h, earMat, group, shape);
  // bead eyes set into the surface, each on its own group so it can blink (scale.y) or wink
  const eyes: THREE.Group[] = [], swirls: THREE.Object3D[] = [];
  const er = (h.eyeR ?? 0.13) * h.R;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const eyeGeo = new THREE.SphereGeometry(er, 14, 10);
  for (const s of [-1, 1]) {
    const d = eyeDir(s, h.eyeSpread ?? 0.42, h.eyeUp ?? 0.2);
    shape(d, p);
    surfaceNormal(shape, d, n);
    const eg = new THREE.Group();
    eg.position.copy(p).addScaledVector(n, -er * 0.45);
    eg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const bead = new THREE.Mesh(eyeGeo, eyeMat(h.eyeColor ?? 0x1c120c));
    eg.add(bead);
    if (h.swirl) {
      const sw = new THREE.Mesh(eyeGeo, swirlMat());
      sw.scale.setScalar(1.25); sw.visible = false;
      eg.add(sw); swirls.push(sw);
    }
    group.add(eg);
    eyes.push(eg);
  }
  if (h.whiskers) {
    // fine whiskers fanning from the sides of the snout
    const tip = shape(SNOUT, new THREE.Vector3());
    const pts: number[] = [];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const root = tip.clone().multiplyScalar(0.86).add(new THREE.Vector3(s * h.R * 0.12, -h.R * 0.04 + i * h.R * 0.04, 0));
      const end = root.clone().add(new THREE.Vector3(s * h.whiskers, (i - 1) * h.whiskers * 0.25, -h.whiskers * 0.25));
      pts.push(root.x, root.y, root.z, end.x, end.y, end.z);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(wg, cached('whisker', () => new THREE.LineBasicMaterial({ color: 0xe8e0d0, transparent: true, opacity: 0.7 }))));
  }
  return { group, skull, ears, eyes, swirls, furMat, earMat, shape };
}

/** A paw: a soft mitten with a thumb, hanging down from the wrist. */
function pawGeometry(r: number) {
  const palm = new THREE.SphereGeometry(1, 12, 9).scale(r * 1.05, r * 1.4, r * 0.7).translate(0, -r * 1.2, r * 0.1);
  const thumb = new THREE.SphereGeometry(1, 8, 6).scale(r * 0.35, r * 0.6, r * 0.35).rotateZ(0.5).translate(r * 0.85, -r * 0.8, r * 0.35);
  const fingers = [-1, 0, 1].map((k) => new THREE.SphereGeometry(1, 8, 6).scale(r * 0.32, r * 0.5, r * 0.32).translate(k * r * 0.55, -r * 2.45, r * 0.25));
  return mergeGeometries([palm, thumb, ...fingers].map((g) => (g.index ? g.toNonIndexed() : g)))!;
}
/** A foot: a long paw pointing forward from the ankle. */
function footGeometry(r: number) {
  const sole = new THREE.SphereGeometry(1, 12, 9).scale(r * 1.1, r * 0.75, r * 2.0).translate(0, -r * 0.35, r * 0.9);
  const toes = [-1, 0, 1].map((k) => new THREE.SphereGeometry(1, 8, 6).scale(r * 0.38, r * 0.4, r * 0.5).translate(k * r * 0.6, -r * 0.55, r * 2.55));
  return mergeGeometries([sole, ...toes].map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

/** A tail along +y from its root, fattest two thirds of the way, curling towards +z (up, once it is laid back). */
function tailGeometry(t: TailSpec) {
  const L = t.len, r = t.r;
  const g = t.thin ? limbGeometry(r, r * 0.35, L, 8, 10).rotateX(Math.PI)
    : sculpt(profileShape([[L, 0], [L * 0.95, r * 0.5], [L * 0.78, r * 0.92], [L * 0.5, r], [L * 0.2, r * 0.62], [0, r * 0.28]]), 18, 18);
  // bend: each slice turns a little more than the one below it
  const pos = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  const curl = t.curl ?? 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = curl * Math.pow(clamp(v.y / L, 0, 1), 1.6);
    const y = v.y, z = v.z;
    v.y = y * Math.cos(a) - z * Math.sin(a);
    v.z = y * Math.sin(a) + z * Math.cos(a);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Torso profile for a lathe: [radius, height] from the hips up to the neck. */
function torsoProfile(b: BodySpec) {
  const T = b.torsoLen, bl = b.belly ?? 0, sk = b.skirt ?? 0;
  return [
    [0.001, -0.1 - sk], [b.hips * (sk ? 1.08 : 0.8), -0.09 - sk], [b.hips * (sk ? 1.06 : 1), -sk * 0.5], [b.hips, 0.0], [lerp(b.hips, b.waist, 0.6) + bl * 0.7, T * 0.25], [b.waist + bl, T * 0.45],
    [b.chest + bl * 0.4, T * 0.72], [b.chest * 0.98, T * 0.86], [b.chest * 0.72, T * 0.97], [b.chest * 0.32, T * 1.02], [0.001, T * 1.03],
  ].map(([r, y]) => new THREE.Vector2(r, y));
}

/** Build a puppet. Nothing is moved yet: place `group` afterwards. */
export function makePuppet(spec: PuppetSpec): Puppet {
  const { body: b, outfit: o } = spec;
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  const T = (map: THREE.Texture | null, color = 0xffffff, rim = 0.28) => charToon({ map, color, rim, shade: SHADE });
  const torsoMat = T(o.torso);
  const sleeveMat = o.sleeve ? T(o.sleeve) : null;
  const trouserMat = o.trousers ? T(o.trousers) : null;
  const limbFurMat = T(plainFur(spec.limbFur, spec.seed + 3));
  const pawMat = T(plainFur(spec.paw, spec.seed + 4, { W: 128, H: 64 }));
  const furMats: THREE.MeshToonMaterial[] = [limbFurMat, pawMat];
  const add = (parent: THREE.Object3D, m: THREE.Mesh, shadow = true) => { m.castShadow = shadow; parent.add(m); return m; };

  // ----- joints -----
  const pelvis = new THREE.Group(); pelvis.position.y = b.legLen; root.add(pelvis);
  const spine = new THREE.Group(); spine.position.y = 0.02; pelvis.add(spine);
  const neck = new THREE.Group(); neck.position.y = b.torsoLen; spine.add(neck);
  const head = new THREE.Group(); head.position.set(0, b.neckLen + spec.head.R * 0.8, 0.02); neck.add(head);

  // ----- torso, neck -----
  add(spine, new THREE.Mesh(new THREE.LatheGeometry(torsoProfile(b), 22).rotateY(Math.PI).scale(1, 1, b.depth), torsoMat));
  add(neck, new THREE.Mesh(new THREE.CylinderGeometry(b.chest * 0.32, b.chest * 0.4, b.neckLen + 0.1, 10).translate(0, (b.neckLen + 0.1) / 2 - 0.04, 0), limbFurMat));
  if (o.bandana !== undefined) {
    const bm = cached(`band${o.bandana}`, () => T(null, o.bandana!, 0.3));
    const knot = new THREE.Mesh(new THREE.TorusGeometry(b.chest * 0.42, b.chest * 0.12, 6, 16).rotateX(Math.PI / 2), bm);
    knot.position.y = 0.02; add(neck, knot);
    const tri = new THREE.Mesh(new THREE.ConeGeometry(b.chest * 0.32, b.chest * 0.55, 3).rotateX(Math.PI).scale(1, 1, 0.3), bm);
    tri.position.set(0, -b.chest * 0.18, b.chest * 0.42 * b.depth); add(neck, tri);
  }

  // ----- the head -----
  const h = makeHead(spec.head);
  head.add(h.group);
  furMats.push(h.furMat, h.earMat);

  // ----- arms -----
  const sh: THREE.Group[] = [], el: THREE.Group[] = [], wr: THREE.Group[] = [];
  const [ua, fa] = b.armLen;
  const upperGeo = limbGeometry(b.armR, b.armR * 0.86, ua, 10, 4);
  const foreGeo = limbGeometry(b.armR * 0.86, b.armR * 0.74, fa, 10, 4);
  const pawGeo = pawGeometry(b.armR * 0.78);
  for (const s of [-1, 1]) {
    const S = new THREE.Group(); S.position.set(s * (b.chest * 0.94), b.torsoLen * 0.9, 0); spine.add(S);
    add(S, new THREE.Mesh(upperGeo, sleeveMat ?? limbFurMat));
    const E = new THREE.Group(); E.position.y = -ua; S.add(E);
    add(E, new THREE.Mesh(foreGeo, sleeveMat ?? limbFurMat));
    const W = new THREE.Group(); W.position.y = -fa; E.add(W);
    add(W, new THREE.Mesh(pawGeo, pawMat), false);
    S.rotation.z = s * 0.08;
    sh.push(S); el.push(E); wr.push(W);
  }

  // ----- legs -----
  const hip: THREE.Group[] = [], knee: THREE.Group[] = [], ank: THREE.Group[] = [];
  const thighLen = b.legLen * 0.5, shinLen = b.legLen * 0.44;
  const thighGeo = limbGeometry(b.legR, b.legR * 0.86, thighLen, 10, 4);
  const shinGeo = limbGeometry(b.legR * 0.86, b.legR * 0.7, shinLen, 10, 4);
  const footGeo = footGeometry(b.legR * 0.78);
  for (const s of [-1, 1]) {
    const H = new THREE.Group(); H.position.set(s * b.hips * 0.5, 0, 0); pelvis.add(H);
    add(H, new THREE.Mesh(thighGeo, trouserMat ?? limbFurMat));
    const K = new THREE.Group(); K.position.y = -thighLen; H.add(K);
    add(K, new THREE.Mesh(shinGeo, trouserMat && !o.shorts ? trouserMat : limbFurMat));
    const A = new THREE.Group(); A.position.y = -shinLen; K.add(A);
    add(A, new THREE.Mesh(footGeo, pawMat), false);
    hip.push(H); knee.push(K); ank.push(A);
  }

  // ----- skirt, cape -----
  if (o.skirt) {
    const { len, flare } = o.skirt;
    // cylinder UVs start at the front (+z), so turn the canvas's middle (the apron) round to face forward
    const geo = new THREE.CylinderGeometry(b.hips * 1.02, b.hips * 1.02 + flare, len, 22, 3, true).rotateY(Math.PI).translate(0, -len / 2 + 0.02, 0).scale(1, 1, b.depth * 1.1);
    add(pelvis, new THREE.Mesh(geo, charToon({ map: o.skirt.tex, rim: 0.25, shade: SHADE, side: THREE.DoubleSide })));
  }
  if (o.cape) {
    // a cape hanging from the shoulders down the back, curved round the body
    const w = b.chest * 2.5, len = o.cape.len;
    const geo = new THREE.PlaneGeometry(w, len, 8, 4);
    const pp = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i); const k = (len / 2 - y) / len; pp.setZ(i, -Math.cos((x / w) * Math.PI) * b.chest * b.depth * (0.9 + k * 0.6)); pp.setX(i, x * (1 + k * 0.35)); }
    geo.translate(0, -len / 2, 0);
    geo.computeVertexNormals();
    const cape = new THREE.Mesh(geo, charToon({ map: o.cape.tex, rim: 0.25, shade: SHADE, side: THREE.DoubleSide }));
    cape.position.set(0, b.torsoLen * 1.0, -0.02);
    add(spine, cape);
  }

  // ----- tail -----
  let tail: THREE.Group | null = null;
  if (spec.tail) {
    const t = spec.tail;
    tail = new THREE.Group();
    tail.position.set(0, 0.02, -b.hips * b.depth * 0.85);
    const tm = charToon({ map: plainFur(t.color, spec.seed + 5, { tip: t.tip, tipAt: 'top' }), rim: 0.35, shade: SHADE });
    furMats.push(tm);
    const tg = new THREE.Group();
    // point backwards and down, lifting towards the tip
    tg.rotation.x = -(Math.PI / 2 + (t.lift ?? 0.55));
    tg.add(Object.assign(new THREE.Mesh(tailGeometry(t), tm), { castShadow: true }));
    tail.add(tg);
    pelvis.add(tail);
  }

  const sm = new StopMotion(12, spec.seed);
  let last = 0, blinkAt = 1.5 + (spec.seed % 7) * 0.4, blinkT = -1;
  const look = new LookAt(0.9, 0.4);
  const puppet: Puppet = {
    group, root, pelvis, spine, neck, head, sh, el, wr, hip, knee, ank, tail, ears: h.ears, eyes: h.eyes, swirls: h.swirls, furMats, look, sm, stepDt: 1 / 12, spec,
    step(dt) {
      if (!sm.tick(dt)) return false;
      puppet.stepDt = clamp(sm.t - last, 0, 0.25);
      last = sm.t;
      sm.boil(furMats);
      return true;
    },
    idle(t, target, io = {}) {
      const br = Math.sin(t * 1.9) * 0.012 * (io.breathe ?? 1);
      spine.scale.set(1 + br * 0.6, 1 + br, 1 + br * 0.8);
      // blinking: a quick close every few seconds
      if (io.blink !== false) {
        if (blinkT < 0 && t > blinkAt) blinkT = 0;
        if (blinkT >= 0) { blinkT += puppet.stepDt; if (blinkT > 0.25) { blinkT = -1; blinkAt = t + 2.2 + ((t * 7.31) % 3); } }
        const k = blinkT >= 0 ? 1 - Math.abs(blinkT / 0.125 - 1) : 0;
        for (const e of h.eyes) e.scale.y = lerp(1, 0.1, clamp(k * 1.4, 0, 1));
      }
      const [ly, lp] = look.update(head, target, puppet.stepDt, io.lookWeight ?? 1);
      head.rotation.set(lp * 0.75, ly * 0.75, Math.sin(t * 0.7) * 0.03);
      neck.rotation.set(lp * 0.25, ly * 0.25, 0);
      // ears twitch now and then
      h.ears.forEach((e, i) => { const tw = Math.max(0, Math.sin(t * 1.3 + i * 2.1) - 0.92) * 4; e.rotation.x = -0.08 - tw * 0.4; });
      if (tail) { tail.rotation.y = Math.sin(t * 1.6) * 0.22; tail.rotation.x = Math.sin(t * 0.9) * 0.05; }
    },
    arm(side, fwd, out, bend, twist = 0) {
      const s = side === 0 ? -1 : 1;
      sh[side].rotation.set(-fwd, twist * s, s * (0.08 + out));
      el[side].rotation.set(-bend, 0, 0);
    },
    leg(side, fwd, out, bend) {
      const s = side === 0 ? -1 : 1;
      hip[side].rotation.set(-fwd, 0, s * out);
      knee[side].rotation.set(bend, 0, 0);
      ank[side].rotation.set(-(fwd - bend) * 0.6, 0, -s * out);
    },
  };
  return puppet;
}

/** The fur of a whole puppet as one list, for boiling. */
export function furOf(p: Puppet) { return p.furMats; }
