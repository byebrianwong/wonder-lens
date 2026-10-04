import * as THREE from 'three';
import { charToon, Painter } from '../../../engine/Paint';
import { sculpt, profileShape, limbGeometry, Spring, envelope, outline, LookAt } from '../../../engine/Rig';
import { clamp, lerp, Rng, TAU } from '../../../engine/math';
import { css } from '../../ghibli/characterTextures';
import { polarAtHeight, surfaceAt, type Character, type Shape } from '../../ghibli/character';

/*
 * The robot gardener of Laputa: a rounded clay body shaped like a bell (widest a little below the middle,
 * curving in at the top), a small domed head sitting on top with one round eye that glows softly, very long
 * thin segmented arms hanging from the sides of the bell, three-fingered hands, short legs, patches of moss
 * and lichen, and a bird's nest on one shoulder.
 * Also the fallen robot: the same parts lying in the grass, overgrown, with birds nesting in it.
 *
 * Local +z is the front. Feet at y 0. About 5.3 units tall.
 */

const CLAY = 0xb07c52;
const INK = 0x2a1a12;

/** The body's clay shell (sphere UVs): panel seams with rivets, a chest plate, lichen and moss on the shoulders. */
function bodySkin() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 701).fill(css(CLAY));
  const g = p.g;
  p.vgrad([[0, css(CLAY, 1.18, 0xf0d8b0, 0.15)], [0.45, css(CLAY)], [1, css(CLAY, 0.72, 0x403040, 0.1)]]);
  p.dabs({ n: 90, colors: [css(CLAY, 1.1), css(CLAY, 0.86), css(CLAY, 0.95, 0xa04a2a, 0.2)], r: [6, 22], alpha: [0.12, 0.3], squash: 0.6 });
  // seams round the body and down its sides
  g.strokeStyle = css(CLAY, 0.55); g.lineWidth = 3;
  for (const y of [0.3, 0.52, 0.74]) { g.beginPath(); g.moveTo(0, y * H); g.lineTo(W, y * H + 2); g.stroke(); }
  for (const x of [0.0, 0.5, 0.62, 0.88]) { g.beginPath(); g.moveTo(x * W, 0.3 * H); g.lineTo(x * W + 3, 0.95 * H); g.stroke(); }
  g.fillStyle = css(CLAY, 1.3, 0xffe8c0, 0.1);
  for (const y of [0.3, 0.52, 0.74]) for (let x = 6; x < W; x += 22) { g.beginPath(); g.arc(x, y * H + 5, 2, 0, TAU); g.fill(); }
  // the chest plate on the front (u = 0.25)
  g.strokeStyle = css(CLAY, 0.5); g.lineWidth = 3;
  g.beginPath(); g.ellipse(0.25 * W, 0.6 * H, 38, 30, 0, 0, TAU); g.stroke();
  g.fillStyle = css(CLAY, 0.82); g.beginPath(); g.ellipse(0.25 * W, 0.6 * H, 34, 26, 0, 0, TAU); g.fill();
  g.fillStyle = css(CLAY, 1.2); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.beginPath(); g.arc(0.25 * W + Math.cos(a) * 26, 0.6 * H + Math.sin(a) * 19, 2.4, 0, TAU); g.fill(); }
  // rust and grime running down, lichen and moss settled on the top
  p.lines({ n: 24, colors: ['rgba(90,50,30,1)', 'rgba(60,40,30,1)'], alpha: [0.06, 0.16], width: [2, 6], vertical: true, wobble: 2 });
  p.dabs({ n: 80, colors: ['#b8c098', '#c8c8a0', '#a8b490'], r: [2, 7], alpha: [0.3, 0.6] });
  p.dabs({ n: 70, colors: ['#5d7a3a', '#6f8c44', '#4a6630'], r: [5, 16], alpha: [0.45, 0.8], y: [0, 0.22], squash: 0.6 });
  return p.texture();
}

/** Arm and leg clay with dark joint rings every so often (lathe UVs: v runs along the limb). */
function limbSkin() {
  const p = new Painter(64, 256, 702).fill(css(CLAY));
  p.vgrad([[0, css(CLAY, 1.1)], [1, css(CLAY, 0.85)]]);
  const g = p.g;
  for (let i = 1; i < 6; i++) {
    const y = (i / 6) * 256;
    g.fillStyle = css(CLAY, 0.45); g.fillRect(0, y - 4, 64, 8);
    g.fillStyle = css(CLAY, 1.25, 0xffe0c0, 0.1); g.fillRect(0, y + 4, 64, 2);
  }
  p.dabs({ n: 30, colors: ['#b8c098', '#5d7a3a'], r: [2, 5], alpha: [0.25, 0.5] });
  return p.texture();
}

/** Woven twigs for the nest. */
function twigSkin() {
  const p = new Painter(128, 64, 703).fill('#6a5034');
  p.lines({ n: 40, colors: ['#8a6a44', '#4a3622', '#a08050'], alpha: [0.5, 0.9], width: [1, 2.5], wobble: 3 });
  return p.texture({ repeat: [2, 1] });
}

export interface RobotMats { clay: THREE.Material; limb: THREE.Material; dark: THREE.Material; eye: THREE.MeshBasicMaterial; moss: THREE.Material; twig: THREE.Material; egg: THREE.Material; petal: THREE.Material; stem: THREE.Material; acornNut: THREE.Material; acornCap: THREE.Material }
let mats: RobotMats | null = null;
export function robotMats(): RobotMats {
  if (mats) return mats;
  mats = {
    clay: charToon({ map: bodySkin(), rim: 0.4, shade: 0xb0a8cc }),
    limb: charToon({ map: limbSkin(), rim: 0.4, shade: 0xb0a8cc }),
    dark: charToon({ color: 0x241a16, rim: 0.1 }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.82, 0.48) }),
    moss: charToon({ color: 0x5f8c3a, rim: 0.3, shade: 0x98b0b0 }),
    twig: charToon({ map: twigSkin(), rim: 0.2 }),
    egg: charToon({ color: 0xc8e4ec, rim: 0.3 }),
    petal: charToon({ color: 0xf4a8c4, rim: 0.3, side: THREE.DoubleSide }),
    stem: charToon({ color: 0x4f8a3a, rim: 0.2 }),
    acornNut: charToon({ color: 0x9a6a3a, rim: 0.3 }),
    acornCap: charToon({ color: 0x5a4028, rim: 0.2 }),
  };
  return mats;
}

/** The shapes every robot is built from, made once. */
interface RobotGeos { shape: Shape; body: THREE.BufferGeometry; head: THREE.BufferGeometry; upper: THREE.BufferGeometry; fore: THREE.BufferGeometry; thigh: THREE.BufferGeometry; shin: THREE.BufferGeometry; foot: THREE.BufferGeometry; palm: THREE.BufferGeometry; finger1: THREE.BufferGeometry; finger2: THREE.BufferGeometry; moss: THREE.BufferGeometry }
let geos: RobotGeos | null = null;
function robotGeos(): RobotGeos {
  if (geos) return geos;
  // the bell: from the hips (y 0) it swells to its widest a little below the middle, then curves in to a
  // narrow top (y 2.6) where the head sits
  const shape = profileShape([[2.6, 0], [2.55, 0.28], [2.42, 0.52], [2.2, 0.72], [1.85, 0.9], [1.4, 1.02], [0.95, 1.05], [0.5, 0.96], [0.18, 0.75], [0.0, 0.45], [-0.1, 0]], { depth: 0.92 });
  // a small dome of a head, flat underneath
  const headShape = profileShape([[0.46, 0], [0.42, 0.22], [0.3, 0.36], [0.1, 0.42], [-0.08, 0.42], [-0.2, 0.34], [-0.26, 0]], { depth: 1.05 });
  const hemi = new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2);
  geos = {
    shape,
    body: sculpt(shape, 40, 30),
    head: sculpt(headShape, 28, 20),
    upper: limbGeometry(0.1, 0.085, 1.45, 10, 6),
    fore: limbGeometry(0.085, 0.068, 1.35, 10, 6),
    thigh: limbGeometry(0.17, 0.13, 0.78, 10, 4),
    shin: limbGeometry(0.13, 0.1, 0.72, 10, 4),
    foot: new THREE.SphereGeometry(1, 14, 8).scale(0.26, 0.1, 0.42).translate(0, 0, 0.12),
    palm: new THREE.SphereGeometry(1, 12, 8).scale(0.13, 0.17, 0.1).translate(0, -0.12, 0),
    finger1: limbGeometry(0.04, 0.03, 0.26, 6, 3),
    finger2: limbGeometry(0.03, 0.02, 0.22, 6, 3),
    moss: hemi,
  };
  return geos;
}

interface Arm { sh: THREE.Group; el: THREE.Group; wr: THREE.Group; fingers: Array<{ a: THREE.Group; b: THREE.Group }>; meshes: THREE.Mesh[] }

/** One long arm hanging from a shoulder group: upper arm, forearm, a hand with two fingers and a thumb. */
function makeArm(side: number, m: RobotMats, G: RobotGeos, ink: boolean): Arm {
  const sh = new THREE.Group(), el = new THREE.Group(), wr = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const up = new THREE.Mesh(G.upper, m.limb); sh.add(up); meshes.push(up);
  el.position.y = -1.45; sh.add(el);
  const fo = new THREE.Mesh(G.fore, m.limb); el.add(fo); meshes.push(fo);
  // a knob at the elbow and the wrist, like the joints of a doll
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m.clay); el.add(knob); meshes.push(knob);
  wr.position.y = -1.35; el.add(wr);
  const palm = new THREE.Mesh(G.palm, m.clay); wr.add(palm); meshes.push(palm);
  const fingers: Arm['fingers'] = [];
  for (const [x, z, splay] of [[0.07, 0.04, 0.25], [-0.07, 0.04, -0.25], [0, -0.07, 0]] as const) {
    const a = new THREE.Group(); a.position.set(x * side, -0.26, z); a.rotation.z = splay * side;
    // the thumb (z < 0) faces the other two
    if (z < 0) a.rotation.y = Math.PI;
    const f1 = new THREE.Mesh(G.finger1, m.limb); a.add(f1);
    const b = new THREE.Group(); b.position.y = -0.26; a.add(b);
    const f2 = new THREE.Mesh(G.finger2, m.limb); b.add(f2);
    wr.add(a);
    fingers.push({ a, b });
    meshes.push(f1, f2);
  }
  if (ink) { outline(up, INK, 1.2, 0.03); outline(fo, INK, 1.2, 0.03); }
  return { sh, el, wr, fingers, meshes };
}

/** A soft patch of moss lying on a surface: a flattened dome, aligned to a normal. */
function mossPatch(G: RobotGeos, m: RobotMats, at: THREE.Vector3, normal: THREE.Vector3, r: number, rng: Rng) {
  const mm = new THREE.Mesh(G.moss, m.moss);
  mm.position.copy(at);
  mm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
  mm.rotateY(rng.range(0, TAU));
  mm.scale.set(r, r * 0.35, r * rng.range(0.7, 1.1));
  return mm;
}

/** A little five-petalled flower on a stem, pointing along -y from its base (for a hand to hold). */
function smallFlower(m: RobotMats) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.5, 5).translate(0, -0.25, 0), m.stem);
  g.add(stem);
  const head = new THREE.Group(); head.position.y = -0.52; g.add(head);
  for (let i = 0; i < 5; i++) {
    const pt = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), m.petal);
    const a = (i / 5) * TAU;
    pt.scale.set(0.07, 0.025, 0.045);
    pt.position.set(Math.cos(a) * 0.07, -0.02, Math.sin(a) * 0.07);
    pt.rotation.y = -a;
    head.add(pt);
  }
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd860 }));
  c.position.y = -0.03;
  head.add(c);
  // the bloom faces out along the stem
  head.rotation.x = Math.PI;
  return g;
}

/** A small acorn, the robot's own copy of the one that was thrown. */
export function acornMesh(m = robotMats()) {
  const g = new THREE.Group();
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m.acornNut); nut.scale.set(1, 1.25, 1);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 6), m.acornCap); cap.scale.set(1, 0.55, 1); cap.position.y = 0.12;
  g.add(nut, cap);
  return g;
}

export interface Robot extends Character {
  /** a world point to watch (the rider), or null to tend the flowers */
  watch: THREE.Vector3 | null;
  /** straighten up, pluck a flower and hold it out towards `to` (about 5 s) */
  offerFlower(to: THREE.Vector3): void;
  /** bend down, pick up the acorn lying at `pickSpot` and look at it closely (about 5.5 s) */
  pickUp(acorn: THREE.Object3D): void;
  /** where an acorn should lie for the robot to reach it, in world space */
  pickSpot(out: THREE.Vector3): THREE.Vector3;
  /** spots on its shoulders for riders (foxsquirrels): world matrices are read from these */
  perches: THREE.Object3D[];
  /** the head, for the camera's look target */
  head: THREE.Object3D;
  readonly busy: boolean;
}

const OFFER = 5.2, PICK = 6.0;
/** the robot is built about 4.8 tall and drawn a little bigger */
const SCALE = 1.1;

export function makeRobot(): Robot {
  const m = robotMats(), G = robotGeos();
  const rng = new Rng(7101);
  const g = new THREE.Group();
  // ---- legs: short, bent at the knee, flat round feet ----
  const legs: Array<{ hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group }> = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.42, 1.55, 0); g.add(hip);
    const th = new THREE.Mesh(G.thigh, m.limb); hip.add(th); outline(th, INK, 1.2, 0.03);
    const knee = new THREE.Group(); knee.position.y = -0.78; hip.add(knee);
    knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), m.clay));
    const sh = new THREE.Mesh(G.shin, m.limb); knee.add(sh); outline(sh, INK, 1.2, 0.03);
    const ankle = new THREE.Group(); ankle.position.y = -0.72; knee.add(ankle);
    const foot = new THREE.Mesh(G.foot, m.clay); foot.position.y = 0.0; ankle.add(foot);
    legs.push({ hip, knee, ankle });
  }
  // ---- body: hips -> twist -> lean ----
  const hips = new THREE.Group(); hips.position.y = 1.5; g.add(hips);
  const twist = new THREE.Group(); hips.add(twist);
  const lean = new THREE.Group(); twist.add(lean);
  const body = new THREE.Mesh(G.body, m.clay); lean.add(body); outline(body, INK, 1.5, 0.04);
  /** a point on the bell's surface at an angle round it (0 front, + towards +x) and a height, with its outward normal */
  const onBell = (around: number, y: number) => surfaceAt(G.shape, around, polarAtHeight(G.shape, y, around));
  // moss and lichen on the shoulders and the back
  for (const [around, y, r] of [[2.4, 2.25, 0.32], [-2.5, 2.3, 0.28], [Math.PI, 1.7, 0.45], [2.2, 1.2, 0.34], [-2.3, 0.9, 0.38], [-1.2, 2.0, 0.2]] as const) {
    const sp0 = onBell(around, y);
    lean.add(mossPatch(G, m, sp0.p, sp0.n, r, rng));
  }
  // ---- the head: a small dome sitting on top of the bell, a ring of clay where they meet ----
  const neck = new THREE.Group(); neck.position.set(0, 2.5, 0.03); lean.add(neck);
  neck.add(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 24).rotateX(Math.PI / 2).translate(0, 0.06, 0), m.limb));
  const head = new THREE.Group(); head.position.set(0, 0.3, 0.02); head.rotation.order = 'YXZ'; neck.add(head);
  const headMesh = new THREE.Mesh(G.head, m.clay); head.add(headMesh); outline(headMesh, INK, 1.4, 0.035);
  head.add(mossPatch(G, m, new THREE.Vector3(-0.06, 0.44, -0.1), new THREE.Vector3(-0.1, 1, -0.25), 0.2, rng));
  // the eye: a dark round socket with a soft glowing lens in it, on the front of the dome
  const socket = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10), m.dark);
  socket.scale.set(1, 1, 0.4); socket.position.set(0, 0.06, 0.41); head.add(socket);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10), m.eye);
  lens.scale.set(1, 1, 0.45); lens.position.set(0, 0.06, 0.45); head.add(lens);
  // ---- arms hanging from the sides of the bell: the right one (x < 0) does the gardening ----
  const arms: Arm[] = [];
  for (const s of [-1, 1]) {
    const a = makeArm(s, m, G, true);
    const sock = onBell(s * Math.PI / 2, 1.95);
    a.sh.position.copy(sock.p).addScaledVector(sock.n, -0.04);
    lean.add(a.sh);
    // a round shoulder cap
    lean.add(new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8), m.clay).translateX(a.sh.position.x).translateY(a.sh.position.y).translateZ(a.sh.position.z));
    arms.push(a);
  }
  const [R, L] = arms;
  R.wr.name = 'handR'; head.name = 'head';
  // ---- the nest on the left shoulder, on top of the shoulder cap, two eggs in it ----
  const nest = new THREE.Group(); nest.position.copy(L.sh.position).add(new THREE.Vector3(0.03, 0.2, -0.24)); nest.rotation.z = -0.3; lean.add(nest);
  nest.add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.09, 8, 16).rotateX(Math.PI / 2), m.twig));
  nest.add(new THREE.Mesh(new THREE.CircleGeometry(0.2, 12).rotateX(-Math.PI / 2).translate(0, -0.04, 0), m.twig));
  for (const [x, z] of [[0.05, 0.03], [-0.06, -0.03]]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), m.egg); e.scale.set(1, 0.8, 1.25); e.position.set(x, 0.02, z); nest.add(e); }
  // perches for the foxsquirrels: on the tops of both shoulders, beside the head (not above it), facing
  // forward and a little outwards, so their tails hang down behind
  const perches: THREE.Object3D[] = [];
  for (const [around, y, yaw] of [[-1.32, 2.2, -0.3], [1.32, 2.2, 0.3]] as const) {
    const sp0 = onBell(around, y);
    const o = new THREE.Object3D(); o.position.copy(sp0.p).addScaledVector(sp0.n, -0.05); o.rotation.y = yaw; lean.add(o); perches.push(o);
    // undo the robot's own scale, so a passenger is drawn at its own size
    o.scale.setScalar(1 / SCALE);
  }
  // ---- props: a flower to give and the acorn it picks up ----
  const flower = smallFlower(m); flower.position.set(0, -0.3, 0.02); flower.visible = false; R.wr.add(flower);
  let held: THREE.Object3D | null = null;
  g.scale.setScalar(SCALE);

  // ---- motion ----
  const sp = {
    lean: new Spring(0.36, 0.9, 0.85), twist: new Spring(0, 0.7, 0.9),
    rsx: new Spring(0.25, 1.1, 0.8), rsz: new Spring(-0.15, 1.1, 0.8), rel: new Spring(-0.3, 1.2, 0.8), rwr: new Spring(0, 1.2, 0.8),
    lsx: new Spring(0.2, 1, 0.85), lel: new Spring(-0.2, 1, 0.85), curl: new Spring(0.4, 2, 0.8), glow: new Spring(1, 2, 0.9),
  };
  const look = new LookAt(1.0, 0.5);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  let offerT = -1, pickT = -1;
  let offerTo = new THREE.Vector3(), acorn: THREE.Object3D | null = null;
  const toLocalYaw = (p: THREE.Vector3) => {
    g.updateWorldMatrix(true, false);
    tmp.copy(p); g.worldToLocal(tmp);
    return Math.atan2(tmp.x, tmp.z);
  };
  const robot: Robot = {
    group: g, watch: null, perches, head,
    get busy() { return offerT >= 0 || pickT >= 0; },
    offerFlower(to) { if (this.busy) return; offerT = 0; offerTo.copy(to); },
    pickUp(a) { if (this.busy) return; pickT = 0; acorn = a; },
    pickSpot(out) { g.updateWorldMatrix(true, false); return out.set(0, 0, 1.95).applyMatrix4(g.matrixWorld); },
    update(dt, t) {
      // idle: bent over the flowers, one hand slowly moving among them; it pauses now and then to straighten a little
      const pause = Math.max(0, Math.sin(t * 0.13 + 1.2)) ** 4;
      let leanT = 0.36 - pause * 0.2, twistT = 0, rsx = 0, rsz = 0.1 + Math.sin(t * 0.37) * 0.08, rel = -0.14 + Math.sin(t * 0.7 + 1) * 0.12, rwr = 0.3;
      let lsx = 0, lel = -0.25, curl = 0.45 + Math.sin(t * 1.1) * 0.2, glow = 0.95 + Math.sin(t * 1.7) * 0.05;
      let lookAt: THREE.Vector3 | null = null;
      // somebody is coming: it looks up from its work and follows them with its eye
      if (robot.watch) {
        const d = tmp2.copy(robot.watch).distanceTo(g.getWorldPosition(tmp));
        const k = clamp(1 - (d - 12) / 28, 0, 1);
        leanT = lerp(leanT, 0.12, k);
        if (k > 0.05) lookAt = robot.watch;
        glow += k * 0.15;
      }
      // arm angles are relative to the leaning body: undo the lean so the working hand hangs a little in front
      // of the feet, among the flowers, and the other hangs straight down
      rsx = -(leanT + 0.3) + Math.sin(t * 0.55) * 0.1;
      lsx = -(leanT + 0.06) + Math.sin(t * 0.4) * 0.04;
      if (offerT >= 0) {
        offerT += dt;
        const pluck = envelope(offerT, 0, 0.45, 0.6, 1.0), raise = envelope(offerT, 0.75, 1.8, 4.2, 5.0);
        flower.visible = offerT > 0.55 && offerT < 4.9;
        leanT = lerp(lerp(leanT, 0.5, pluck), 0.02, raise);
        rsx = lerp(lerp(rsx, -0.82, pluck), -1.62, raise); rsz = lerp(rsz, -0.08, raise); rel = lerp(lerp(rel, -0.05, pluck), -0.12, raise); rwr = lerp(rwr, -0.35, raise);
        curl = lerp(curl, 0.85, Math.max(pluck, raise));
        twistT = clamp(toLocalYaw(offerTo), -1.1, 1.1) * raise;
        lookAt = raise > 0.3 ? offerTo : lookAt;
        glow = lerp(glow, 1.6, raise);
        if (offerT > OFFER) { offerT = -1; flower.visible = false; }
      }
      if (pickT >= 0) {
        pickT += dt;
        const reach = envelope(pickT, 0.3, 1.2, 1.4, 2.2), hold = envelope(pickT, 1.6, 2.6, 4.6, 5.6);
        if (pickT > 1.35 && acorn && !held) { held = acorn; R.wr.add(held); held.position.set(0, -0.42, 0.05); held.rotation.set(0, 0, 0); }
        leanT = lerp(lerp(leanT, 0.55, reach), 0.1, hold);
        rsx = lerp(lerp(rsx, -0.85, reach), -1.2, hold); rsz = lerp(rsz, 0.45, hold); rel = lerp(lerp(rel, -0.08, reach), -2.15, hold); rwr = lerp(rwr, -0.4, hold);
        curl = lerp(curl, 0.95, Math.max(reach * 0.5, hold));
        lookAt = null;
        glow = lerp(glow, 1.3 + Math.sin(pickT * 6) * 0.25, hold);
        if (pickT > PICK) {
          pickT = -1;
          // it sets the acorn down at its feet, among the flowers
          if (held) { g.attach(held); held.position.set(0.15, 0.13 / SCALE, 1.4); held.rotation.set(0, 0, 0.3); held.scale.setScalar(1 / SCALE); held = null; }
          acorn = null;
        }
      }
      // turn the twist and lean through springs so every change eases in and settles
      twist.rotation.y = sp.twist.update(twistT, dt);
      lean.rotation.x = sp.lean.update(leanT, dt);
      // the foxsquirrels' perches stay level however far it bends
      for (const p of perches) p.rotation.x = -lean.rotation.x;
      R.sh.rotation.x = sp.rsx.update(rsx, dt); R.sh.rotation.z = sp.rsz.update(rsz, dt);
      R.el.rotation.x = sp.rel.update(rel, dt); R.wr.rotation.x = sp.rwr.update(rwr, dt);
      L.sh.rotation.x = sp.lsx.update(lsx, dt); L.sh.rotation.z = 0.08; L.el.rotation.x = sp.lel.update(lel, dt);
      const c = sp.curl.update(curl, dt);
      for (const a of arms) for (const f of a.fingers) { f.a.rotation.x = -c * 0.6; f.b.rotation.x = -c * 0.8; }
      // head: follows a watched point, or tilts curiously at the acorn in its hand
      const [yaw, pitch] = look.update(head, lookAt, dt);
      const tilt = pickT > 2.4 && pickT < 4.8 ? Math.sin((pickT - 2.4) * 2.6) * 0.35 : 0;
      head.rotation.set(pitch + (pickT > 1.6 && pickT < 5 ? 0.35 : 0) + (lookAt ? 0 : 0.25), yaw, tilt);
      // the knees give a little when it bends
      const l = lean.rotation.x;
      for (const leg of legs) { leg.hip.position.y = 1.55 - l * 0.08; leg.hip.rotation.x = -0.18 - l * 0.25; leg.knee.rotation.x = 0.36 + l * 0.35; leg.ankle.rotation.x = -0.18 - l * 0.1; }
      hips.position.y = 1.5 - l * 0.08;
      const k = sp.glow.update(glow, dt);
      m.eye.color.setRGB(1.1 * k, 0.82 * k, 0.48 * k);
    },
  };
  return robot;
}

// ---------------- the fallen robot ----------------

/**
 * A robot that fell long ago and lies on its side in the grass: moss over its back, grass and flowers
 * growing out of it, its head resting on the ground, one arm out straight and the other raised into a crook
 * that holds a nest. Static: merge it with the rest of the scenery. Local +x runs from its feet to its head.
 * Returns where the nest and other perches are, for the birds.
 */
export function makeFallenRobot(rng: Rng) {
  const m = robotMats(), G = robotGeos();
  const g = new THREE.Group();
  // the body on its side, sunk into the turf
  const body = new THREE.Mesh(G.body, m.clay);
  body.rotation.set(0.25, 0, -Math.PI / 2 + 0.06);
  body.position.set(0, 0.45, 0);
  g.add(body);
  // the head has rolled forward onto the ground beside the neck, its eye dark
  const head = new THREE.Group(); head.position.set(3.0, 0.32, 0.45); head.rotation.set(0.4, -0.9, 0.5); g.add(head);
  head.add(new THREE.Mesh(G.head, m.clay));
  const socket = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), m.dark); socket.scale.set(1, 1, 0.4); socket.position.set(0, 0.05, 0.43); head.add(socket);
  // one arm stretched out along the grass
  const a1 = makeArm(1, m, G, false);
  a1.sh.position.set(1.95, 0.35, 0.8); a1.sh.rotation.set(-Math.PI / 2 + 0.1, 0.3, 0); a1.el.rotation.x = -0.15; a1.wr.rotation.x = 0.2;
  for (const f of a1.fingers) { f.a.rotation.x = -0.5; f.b.rotation.x = -0.9; }
  g.add(a1.sh);
  // the other reaching back along the ground with its forearm raised, making a crook for the nest
  const a2 = makeArm(-1, m, G, false);
  a2.sh.position.set(1.95, 1.3, -0.2); a2.sh.rotation.set(1.77, 0, 0); a2.el.rotation.x = 1.57; a2.wr.rotation.x = 0.3;
  for (const f of a2.fingers) { f.a.rotation.x = -0.9; f.b.rotation.x = -1.1; }
  g.add(a2.sh);
  // legs bent at the knee, half in the ground
  for (const [x, z, k] of [[-0.1, 0.42, 0.3], [-0.05, -0.4, 0.15]] as const) {
    const hip = new THREE.Group(); hip.position.set(x, 0.35, z); hip.rotation.set(0, z * 0.5, -Math.PI / 2 + 0.12); g.add(hip);
    hip.add(new THREE.Mesh(G.thigh, m.limb));
    const knee = new THREE.Group(); knee.position.y = -0.78; knee.rotation.z = k; hip.add(knee);
    knee.add(new THREE.Mesh(G.shin, m.limb));
    const foot = new THREE.Mesh(G.foot, m.clay); foot.position.y = -0.72; knee.add(foot);
  }
  // moss over everything that faces the sky
  g.updateMatrixWorld(true);
  const tops: Array<[number, number, number, number]> = [[0.5, 1.42, 0.1, 0.72], [1.3, 1.45, 0.25, 0.62], [2.1, 1.2, -0.05, 0.5], [-0.05, 1.05, 0.3, 0.5], [0.9, 1.25, 0.7, 0.5], [3.0, 0.68, 0.45, 0.3], [1.0, 1.25, -0.65, 0.45], [2.3, 0.95, 0.9, 0.32]];
  for (const [x, y, z, r] of tops) g.add(mossPatch(G, m, new THREE.Vector3(x, y, z), new THREE.Vector3(rng.range(-0.3, 0.3), 1, rng.range(-0.3, 0.3)), r, rng));
  // the nest in the crook of the raised arm, and a second one on its hip
  const nests = [new THREE.Vector3(1.95, 1.72, -1.5), new THREE.Vector3(0.9, 1.52, -0.1)];
  for (const n of nests) {
    const nest = new THREE.Group(); nest.position.copy(n); g.add(nest);
    nest.add(new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.1, 8, 16).rotateX(Math.PI / 2), m.twig));
    nest.add(new THREE.Mesh(new THREE.CircleGeometry(0.24, 12).rotateX(-Math.PI / 2).translate(0, -0.05, 0), m.twig));
  }
  // where birds sit: on the nests, the head and the stretched-out hand
  const perches = [nests[0].clone().add(new THREE.Vector3(0, 0.12, 0)), nests[1].clone().add(new THREE.Vector3(0, 0.12, 0)), new THREE.Vector3(3.0, 0.8, 0.45), new THREE.Vector3(1.95, 3.3, -1.3)];
  return { group: g, perches, nests };
}
