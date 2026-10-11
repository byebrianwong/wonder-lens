import * as THREE from 'three';
import { charToon } from '../../engine/Paint';
import { sculpt, limbGeometry, Spring, envelope, outline } from '../../engine/Rig';
import { clamp, lerp, smoothstep } from '../../engine/math';
import { fabric, woodGrain, strawTexture, bowCloth } from './characterTextures';
import { makeKid, type Kid } from './people';
import type { Character } from './character';

/**
 * Kiki on her mother's broom, with Jiji riding behind her.
 *
 * Built to match the film: a dark navy dress, full and knee-length, with three-quarter sleeves; a chin-length
 * bob parted in the middle; a big red ribbon bow; red shoes; the red radio hanging from the front of the broom.
 * She sits astride the handle and holds it in front of her with both hands. Her dress is draped over her
 * thighs and the handle when she is built, so only her shins and shoes show and the handle runs underneath
 * the cloth instead of through it. In flight the loose parts of the dress flutter backwards.
 *
 * The group's origin is the middle of the broom handle; she faces +z.
 */

export interface Kiki extends Character {
  wave(): void;
  startle(): void;
  /** where she looks (the camera, usually) */
  lookTarget: THREE.Vector3 | null;
  /** her head, for the facing bonus */
  head: THREE.Object3D;
}

const DRESS = 0x2b2946;
const HANDLE_R = 0.05;
/** the length of the upper arm and of the forearm down to the middle of the hand (see makeKid) */
const UPPER = 0.34, FORE = 0.33;

/** Jiji: a slim black cat with big ears, white eyes and a long tail that curls up. Faces +z. */
function makeJiji() {
  const g = new THREE.Group();
  const black = charToon({ color: 0x17151a, rim: 0.6, shade: 0x8088b0 });
  const eyeW = charToon({ color: 0xf6f4ec, rim: 0.1 }), eyeP = charToon({ color: 0x101014, rim: 0 });
  const ink = 0x0a0a0e;
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), black);
  body.scale.set(0.13, 0.16, 0.2); body.position.set(0, 0.17, -0.02); body.rotation.x = -0.5;
  g.add(body);
  const headG = new THREE.Group(); headG.position.set(0, 0.38, 0.08); g.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 14), black);
  head.scale.set(1.05, 0.92, 0.95);
  headG.add(head);
  outline(head, ink, 1.2, 0.01); outline(body, ink, 1.2, 0.01);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 10), black);
    ear.position.set(s * 0.075, 0.13, -0.01); ear.rotation.z = -s * 0.25;
    headG.add(ear);
    const w = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), eyeW);
    w.scale.set(0.042, 0.055, 0.02); w.position.set(s * 0.05, 0.015, 0.115); w.rotation.y = s * 0.3;
    headG.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), eyeP);
    p.scale.set(0.018, 0.034, 0.01); p.position.set(s * 0.052, 0.012, 0.13); p.rotation.y = s * 0.3;
    headG.add(p);
  }
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(limbGeometry(0.025, 0.022, 0.16, 6, 2), black); leg.position.set(s * 0.05, 0.12, 0.08); g.add(leg); }
  // tail: a chain of segments so it can sway and curl
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = g;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    const m = new THREE.Mesh(limbGeometry(0.022 - i * 0.002, 0.02 - i * 0.002, 0.07, 6, 2), black);
    m.rotation.x = Math.PI; seg.add(m);
    if (i === 0) { seg.position.set(0, 0.08, -0.18); seg.rotation.x = -1.6; } else seg.position.y = 0.07;
    parent.add(seg); parent = seg; tail.push(seg);
  }
  return { group: g, head: headG, tail };
}

/**
 * Point an arm so the middle of its hand lands on `target`, with the elbow bending towards `pole` (both in
 * world space). Returns the shoulder's local rotation and the elbow bend, so an animation can blend away
 * from this pose and back. If the target is out of reach the arm points straight at it.
 */
function reach(kid: Kid, side: 0 | 1, target: THREE.Vector3, pole: THREE.Vector3) {
  const sh = kid.shoulder[side];
  sh.parent!.updateWorldMatrix(true, false);
  const S = sh.getWorldPosition(new THREE.Vector3());
  const D = new THREE.Vector3().subVectors(target, S);
  const n = D.clone().normalize();
  const d = clamp(D.length(), Math.abs(UPPER - FORE) + 0.01, UPPER + FORE - 0.002);
  // law of cosines: the angle at the shoulder between the reach line and the upper arm
  const A = Math.acos(clamp((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d), -1, 1));
  const m = new THREE.Vector3().subVectors(pole, S);
  m.addScaledVector(n, -m.dot(n)).normalize();
  const u = n.clone().multiplyScalar(Math.cos(A)).addScaledVector(m, Math.sin(A));
  const E = S.clone().addScaledVector(u, UPPER);
  const f = S.clone().addScaledVector(n, d).sub(E).normalize();
  const bend = Math.acos(clamp(u.dot(f), -1, 1));
  // the shoulder's frame: the arm runs down its -y, and the elbow bends the forearm towards its +z
  const Y = u.clone().negate();
  const Z = f.clone().addScaledVector(u, -f.dot(u));
  if (Z.lengthSq() < 1e-8) Z.copy(m); else Z.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  const world = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  const parentQ = sh.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
  const q = parentQ.multiply(world);
  sh.quaternion.copy(q);
  kid.elbow[side].rotation.set(-bend, 0, 0);
  return { q: q.clone(), bend };
}

type Collider =
  | { kind: 'capsule'; a: THREE.Vector3; b: THREE.Vector3; r: number }
  | { kind: 'ellipsoid'; c: THREE.Vector3; r: THREE.Vector3 };

const tmpC = new THREE.Vector3(), tmpV = new THREE.Vector3();
/** Move `p` out of the collider onto its surface. Returns true if it was inside. */
function pushOut(p: THREE.Vector3, col: Collider) {
  if (col.kind === 'capsule') {
    tmpV.subVectors(col.b, col.a);
    const k = clamp(tmpC.subVectors(p, col.a).dot(tmpV) / tmpV.lengthSq(), 0, 1);
    tmpC.copy(col.a).addScaledVector(tmpV, k);
    tmpV.subVectors(p, tmpC);
    const l = tmpV.length();
    if (l >= col.r) return false;
    if (l < 1e-6) tmpV.set(0, 1, 0); else tmpV.divideScalar(l);
    p.copy(tmpC).addScaledVector(tmpV, col.r);
    return true;
  }
  tmpV.subVectors(p, col.c).divide(col.r);
  const l = tmpV.length();
  if (l >= 1) return false;
  if (l < 1e-6) tmpV.set(0, 1, 0); else tmpV.divideScalar(l);
  p.copy(col.c).addScaledVector(tmpV.multiply(col.r), 1);
  return true;
}

/**
 * The dress below the waist, draped over whatever it rests on. Each column of the cloth starts at the
 * waist and is laid down in short steps, outwards and downwards and a little back in the wind; a step that
 * ends inside a thigh, the hips or the broom handle is moved onto its surface, so the column slides over it
 * and hangs from its far side. All in the pelvis's space.
 * Returns the mesh, plus how free each point is to flutter (0 at the waist and where the cloth rests on something).
 */
function drapedSkirt(colliders: Collider[], mat: THREE.Material) {
  const COLS = 56, ROWS = 24;
  const waist = { y: 0.11, rx: 0.175, rz: 0.135 };
  const pos = new Float32Array((COLS + 1) * (ROWS + 1) * 3);
  const uv = new Float32Array((COLS + 1) * (ROWS + 1) * 2);
  const free = new Float32Array((COLS + 1) * (ROWS + 1));
  const p = new THREE.Vector3(), prev = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let c = 0; c <= COLS; c++) {
    // the seam is at the back, where the cloth lies along the handle
    const a = (c / COLS) * Math.PI * 2 - Math.PI;
    const rx = Math.sin(a), rz = Math.cos(a);
    // past the knees over the lap and at the sides; shorter where it crosses the handle in front and behind,
    // where it would otherwise run on along the handle
    const len = rz > 0 ? lerp(0.64, 0.46, smoothstep(0.93, 1, rz)) : lerp(0.58, 0.36, rz * rz);
    const ds = len / ROWS;
    prev.set(rx * waist.rx, waist.y, rz * waist.rz);
    let sinceContact = 0;
    for (let r = 0; r <= ROWS; r++) {
      const k = r / ROWS;
      if (r > 0) {
        // a full skirt: it flares out hard at first, then mostly falls; the wind of flying pushes it back
        const out = lerp(1.3, 0.3, Math.sqrt(k)) * lerp(1, 0.7, rz * rz);
        dir.set(rx * out, -1, rz * out - 0.22).normalize();
        p.copy(prev).addScaledVector(dir, ds);
        let touched = false;
        for (let it = 0; it < 4; it++) for (const col of colliders) touched = pushOut(p, col) || touched;
        // keep the cloth from stretching, then settle it once more
        p.sub(prev).setLength(ds).add(prev);
        for (const col of colliders) touched = pushOut(p, col) || touched;
        sinceContact = touched ? 0 : sinceContact + ds;
        prev.copy(p);
      }
      const i = c * (ROWS + 1) + r;
      pos.set([prev.x, prev.y, prev.z], i * 3);
      uv.set([c / COLS, 1 - k], i * 2);
      free[i] = smoothstep(0.02, 0.2, sinceContact) * smoothstep(0.2, 0.8, k);
    }
  }
  const idx: number[] = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const i0 = c * (ROWS + 1) + r, i1 = i0 + ROWS + 1;
      idx.push(i0, i0 + 1, i1, i1, i0 + 1, i1 + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  const base = pos.slice();
  return { mesh, base, free, cols: COLS, rows: ROWS };
}

/** One loop of a ribbon bow, from the knot at the origin out along +x: pinched at the knot, wide and rounded at the end. */
function bowLoop(len: number, h: number, t: number) {
  return sculpt((d, out) => {
    const x = (d.x + 1) / 2; // 0 at the knot, 1 at the far end
    const taper = lerp(0.3, 1, smoothstep(0, 0.65, x));
    // the face of the loop is dished a little where the ribbon folds back on itself
    const dish = 1 - 0.45 * Math.max(0, d.z) * smoothstep(0.15, 0.6, x) * (1 - Math.abs(d.y));
    out.set(x * len, d.y * h * taper + 0.18 * x * x * len, d.z * t * dish * lerp(0.6, 1, x));
  }, 28, 18);
}

/** Mirror a geometry left to right, keeping its triangles facing outwards (a negative scale would turn it inside out). */
function mirrorX(geo: THREE.BufferGeometry) {
  geo.scale(-1, 1, 1);
  const idx = geo.index!;
  for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
  return geo;
}

export function makeKiki(): Kiki {
  const g = new THREE.Group();
  const kid = makeKid({
    hair: 0x2a1e1e, style: 'kiki', top: DRESS, sleeves: 'three-quarter', bottom: { kind: 'none', color: DRESS },
    socks: 'bare', shoes: 0xc8323a, face: { mouth: 'smile', blush: 0.5 }, seed: 5,
  });
  g.add(kid.group);
  // ---------- how she sits ----------
  // astride the handle, which runs just under her seat; leaning forward a little into the flight
  kid.group.position.set(0, -0.98, 0.15);
  kid.spine.rotation.x = 0.36;
  kid.neck.rotation.x = -0.3; // so she still looks ahead, not down at the handle
  // thighs forward and down either side of the handle, knees bent so the feet tuck back under the dress
  kid.hip.forEach((h, i) => { const s = i === 0 ? -1 : 1; h.rotation.set(-1.05, 0, s * 0.3); });
  const KNEE = 1.55;
  kid.knee.forEach((k) => { k.rotation.x = KNEE; });
  g.updateMatrixWorld(true);

  // ---------- the broom: a pale wooden handle, straw bristles bound at the back ----------
  const broom = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, HANDLE_R, 2.7, 10), charToon({ map: woodGrain(0x7a5a3a), rim: 0.3 }));
  handle.rotation.x = Math.PI / 2;
  broom.add(handle);
  const bristleMat = charToon({ map: strawTexture(), rim: 0.35, side: THREE.DoubleSide });
  // bound tight where it meets the handle, fanning out towards the back
  const bristles = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.001, -1.0), new THREE.Vector2(0.24, -0.96), new THREE.Vector2(0.21, -0.6), new THREE.Vector2(0.11, -0.15), new THREE.Vector2(0.06, 0)], 18), bristleMat);
  bristles.rotation.x = Math.PI / 2; bristles.position.z = -1.2;
  broom.add(bristles);
  outline(bristles, 0x3a2a10, 1.2, 0.012);
  const binding = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 14), charToon({ color: 0x7a2a24, rim: 0.2 }));
  binding.position.z = -1.32; broom.add(binding);
  // the red radio hanging from the front of the handle
  const radio = new THREE.Group();
  const caseMat = charToon({ color: 0xb63a3a, rim: 0.3 });
  radio.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.12), caseMat));
  const grille = new THREE.Mesh(new THREE.CircleGeometry(0.055, 14), charToon({ color: 0xe8dcc0, rim: 0 }));
  grille.position.set(-0.05, 0, 0.061); radio.add(grille);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 5, 12, Math.PI), charToon({ color: 0x3a2a20, rim: 0 }));
  strap.position.y = 0.09; radio.add(strap);
  radio.position.set(0.0, -0.22, 0.95);
  broom.add(radio);
  g.add(broom);

  // ---------- the dress below the waist, draped over her lap and the handle ----------
  const toPelvis = (v: THREE.Vector3) => kid.pelvis.worldToLocal(v);
  const colliders: Collider[] = [
    // the handle (the cloth keeps a little clear of it, so the triangles between two columns never cut it)
    { kind: 'capsule', a: toPelvis(new THREE.Vector3(0, 0, -3)), b: toPelvis(new THREE.Vector3(0, 0, 3)), r: HANDLE_R + 0.035 },
    // her seat and hips
    { kind: 'ellipsoid', c: new THREE.Vector3(0, -0.04, -0.01), r: new THREE.Vector3(0.215, 0.13, 0.175) },
  ];
  for (let i = 0; i < 2; i++) {
    const a = toPelvis(kid.hip[i].getWorldPosition(new THREE.Vector3()));
    const b = toPelvis(kid.knee[i].getWorldPosition(new THREE.Vector3()));
    // past the knee a little, so the hem rounds over it instead of catching on its end
    b.add(tmpV.subVectors(b, a).setLength(0.05));
    colliders.push({ kind: 'capsule', a, b, r: 0.085 + 0.03 });
  }
  const dressMat = charToon({ map: fabric(DRESS, { hem: true, folds: 14, seed: 6 }), rim: 0.35, shade: 0x9aa0cc, side: THREE.DoubleSide });
  const skirt = drapedSkirt(colliders, dressMat);
  kid.pelvis.add(skirt.mesh);
  outline(skirt.mesh, 0x2a1e24, 1.3, 0.014);
  const skirtPos = skirt.mesh.geometry.attributes.position as THREE.BufferAttribute;

  // ---------- hands on the handle in front of her, one behind the other; elbows a little out ----------
  const grip = [new THREE.Vector3(-0.03, HANDLE_R + 0.04, 0.5), new THREE.Vector3(0.03, HANDLE_R + 0.04, 0.6)];
  const arms = ([0, 1] as const).map((i) => {
    const s = i === 0 ? -1 : 1;
    return reach(kid, i, grip[i], new THREE.Vector3(s * 0.9, 0.3, -0.3));
  });

  // ---------- the big red bow on top of her head, a little to the back ----------
  const bowMat = charToon({ map: bowCloth(0xd23b3f), rim: 0.35 });
  const bow = new THREE.Group();
  const loopR = bowLoop(0.27, 0.1, 0.045), loopL = mirrorX(loopR.clone());
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(s > 0 ? loopR : loopL, bowMat);
    loop.rotation.z = s * 0.2;
    bow.add(loop);
    outline(loop, 0x3a1014, 1.3, 0.012);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), bowMat);
  knot.scale.set(0.06, 0.07, 0.055);
  bow.add(knot);
  outline(knot, 0x3a1014, 1.3, 0.012);
  bow.position.set(0, 0.3, -0.08); bow.rotation.x = -0.3;
  kid.head.add(bow);

  const jiji = makeJiji();
  jiji.group.position.set(0, 0.04, -0.85);
  g.add(jiji.group);

  const sp = { wave: new Spring(0, 2.5, 0.6), rock: new Spring(0, 1.8, 0.35), jump: new Spring(0, 3, 0.5) };
  const waveQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.4, 0, 2.5));
  let waveT = -1, startleT = -1;
  const ch: Kiki = {
    group: g, head: kid.head, lookTarget: null,
    wave() { waveT = 0; },
    startle() { startleT = 0; sp.rock.v += 2.2; },
    update(dt, t) {
      kid.tick(dt, t, ch.lookTarget, 1);
      // the loose parts of the dress flutter back in the wind of flying
      const b = skirt.base;
      for (let c = 0; c <= skirt.cols; c++) {
        for (let r = 0; r <= skirt.rows; r++) {
          const i = c * (skirt.rows + 1) + r, w = skirt.free[i];
          if (w <= 0) continue;
          const f = w * (0.03 + 0.025 * Math.sin(t * 9 + c * 0.7 + r * 0.45));
          skirtPos.setXYZ(i, b[i * 3], b[i * 3 + 1] + f * 0.4, b[i * 3 + 2] - f);
        }
      }
      skirtPos.needsUpdate = true;
      skirt.mesh.geometry.computeVertexNormals();
      bow.rotation.z = Math.sin(t * 5) * 0.06;
      kid.knee.forEach((k, i) => { k.rotation.x = KNEE + Math.sin(t * 2.2 + i * 1.7) * 0.1; });
      // wave: the right arm lets go of the handle, lifts from the shoulder and the hand waves from the elbow
      let w = 0;
      if (waveT >= 0) { waveT += dt; w = envelope(waveT, 0, 0.35, 1.9, 2.4); if (waveT > 2.4) waveT = -1; }
      const wv = sp.wave.update(w, dt);
      kid.shoulder[1].quaternion.slerpQuaternions(arms[1].q, waveQ, clamp(wv, 0, 1));
      kid.elbow[1].rotation.set(lerp(-arms[1].bend, -0.2, wv), 0, wv * (Math.sin(t * 11) * 0.45 + 0.2));
      // startled: Jiji springs up off the handle and Kiki wobbles on the broom
      let jump = 0;
      if (startleT >= 0) { startleT += dt; jump = envelope(startleT, 0, 0.18, 0.3, 0.8); if (startleT > 1.2) startleT = -1; }
      const j = sp.jump.update(jump, dt);
      jiji.group.position.y = 0.02 + j * 0.45;
      jiji.group.scale.y = 1 + j * 0.15;
      kid.group.rotation.z = sp.rock.update(0, dt) * 0.25;
      broom.rotation.z = kid.group.rotation.z * 0.6;
      jiji.head.rotation.y = Math.sin(t * 0.7) * 0.4;
      jiji.tail.forEach((s, i) => { s.rotation.z = Math.sin(t * 2.4 - i * 0.6) * 0.25; if (i > 0) s.rotation.x = -0.25 + Math.sin(t * 1.7 - i * 0.5) * 0.08; });
    },
  };
  return ch;
}
