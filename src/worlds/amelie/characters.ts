import * as THREE from 'three';
import { toon, glow, sphere, ellipsoid, cyl, cone, capsule, box, canvasTexture, mesh, instanced, type Placement } from '../../engine/Builders';
import { clamp, damp, lerp, Rng, TAU } from '../../engine/math';

/** Characters face +z in local space. */
export interface Character {
  group: THREE.Group;
  update(dt: number, t: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Toon material with a soft self-glow so figures stay readable at night. */
export function toonE(color: number, k = 0.2, opts: Partial<THREE.MeshToonMaterialParameters> = {}) {
  return toon(color, { emissive: new THREE.Color(color).multiplyScalar(k), ...opts });
}

const dampRot = (o: THREE.Object3D, x: number, y: number, z: number, lambda: number, dt: number) => {
  o.rotation.x = damp(o.rotation.x, x, lambda, dt);
  o.rotation.y = damp(o.rotation.y, y, lambda, dt);
  o.rotation.z = damp(o.rotation.z, z, lambda, dt);
};

// ---------------- faces ----------------
export interface FaceOpts { smile?: boolean; mischief?: boolean; cheeks?: boolean; moustache?: boolean; glasses?: boolean; dark?: boolean; closed?: boolean; beard?: string; brows?: boolean; }
/** Equirectangular face painted for a head sphere: the front of the sphere is at u = 0.25. */
function faceTexture(skin: string, o: FaceOpts) {
  return canvasTexture(256, 128, (c, w, h) => {
    c.fillStyle = skin; c.fillRect(0, 0, w, h);
    const cx = w * 0.25, ey = 58;
    const ink = '#2a1c18';
    c.lineCap = 'round';
    if (o.brows !== false) {
      c.strokeStyle = ink; c.lineWidth = 2.2;
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * 7, 47); c.quadraticCurveTo(cx + s * 12, 43.5, cx + s * 17, 46); c.stroke(); }
    }
    for (const s of [-1, 1]) {
      const x = cx + s * 12;
      if (o.closed) { c.strokeStyle = ink; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x - 5, ey); c.quadraticCurveTo(x, ey + 4, x + 5, ey); c.stroke(); continue; }
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, ey, 6, 7, 0, 0, TAU); c.fill();
      c.fillStyle = ink; c.beginPath(); c.ellipse(x + s * 0.5, ey + 1, 3.6, 4.6, 0, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x + 1.4, ey - 1.6, 1.3, 0, TAU); c.fill();
    }
    if (o.glasses) {
      c.strokeStyle = o.dark ? '#111' : '#3a3a3a'; c.lineWidth = 2;
      for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * 12, ey, 9, 0, TAU); if (o.dark) { c.fillStyle = 'rgba(18,18,22,0.94)'; c.fill(); } c.stroke(); }
      c.beginPath(); c.moveTo(cx - 3, ey); c.lineTo(cx + 3, ey); c.stroke();
    }
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx, 63); c.lineTo(cx - 2, 72); c.lineTo(cx + 2, 73); c.stroke();
    if (o.cheeks) { c.fillStyle = 'rgba(235,105,105,0.42)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * 18, 72, 6, 4, 0, 0, TAU); c.fill(); } }
    c.strokeStyle = '#7a2a2a'; c.lineWidth = 2.6; c.beginPath();
    if (o.smile) {
      if (o.mischief) { c.moveTo(cx - 9, 81); c.quadraticCurveTo(cx + 1, 92, cx + 11, 78); }
      else { c.moveTo(cx - 9, 80); c.quadraticCurveTo(cx, 91, cx + 9, 80); }
    } else { c.moveTo(cx - 5, 83); c.lineTo(cx + 5, 83); }
    c.stroke();
    if (o.moustache) { c.strokeStyle = ink; c.lineWidth = 5; c.beginPath(); c.moveTo(cx - 14, 79); c.quadraticCurveTo(cx, 70, cx + 14, 79); c.stroke(); }
    if (o.beard) { c.fillStyle = o.beard; c.beginPath(); c.ellipse(cx, 102, 22, 16, 0, 0, TAU); c.fill(); }
  });
}

// ---------------- generic person ----------------
export type HairStyle = 'bob' | 'short' | 'bald' | 'cap' | 'beret' | 'ring' | 'ponytail';
export interface PersonOpts {
  height?: number; skin?: number; hair?: number; hairStyle?: HairStyle;
  top?: number; bottom?: number; skirt?: number; shoes?: number; apron?: number; hat?: number;
  face?: FaceOpts; glow?: number;
}
export interface Limb { piv: THREE.Group; elbow: THREE.Group; hand: THREE.Group; }
export interface Leg { piv: THREE.Group; knee: THREE.Group; }
export interface Figure {
  group: THREE.Group; hips: THREE.Group; head: THREE.Group; torso: THREE.Mesh;
  armL: Limb; armR: Limb; legL: Leg; legR: Leg;
  setSmile(on: boolean): void;
  /** hip height in local (unscaled) units */
  hipY: number;
}
export const HIP = 0.82;

/** A simple jointed figure, ~1.75 tall, origin at the feet, facing +z. */
export function makePerson(o: PersonOpts = {}): Figure {
  const H = o.height ?? 1.75;
  const k = o.glow ?? 0.18;
  const skin = o.skin ?? 0xf1cfb4;
  const skinHex = '#' + new THREE.Color(skin).getHexString();
  const topMat = toonE(o.top ?? 0x8a3a3a, k), botMat = toonE(o.bottom ?? 0x2f3a4a, k), skinMat = toonE(skin, k);
  const hairMat = toonE(o.hair ?? 0x2a1f1a, k * 0.5), shoeMat = toonE(o.shoes ?? 0x1e1a1a, k * 0.4);
  const g = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = HIP; g.add(hips);
  const torso = capsule(0.18, 0.32, topMat, 0, 0.3, 0); hips.add(torso);
  if (o.skirt !== undefined) hips.add(cone(0.3, 0.55, toonE(o.skirt, k), 0, -0.1, 0, 14));
  if (o.apron !== undefined) hips.add(box(0.3, 0.55, 0.04, toonE(o.apron, k), 0, 0.12, 0.17));
  hips.add(cyl(0.06, 0.07, 0.12, skinMat, 0, 0.62, 0, 8));
  // head with a painted face
  const head = new THREE.Group(); head.position.y = 0.64; hips.add(head);
  const base: FaceOpts = { ...(o.face ?? {}) };
  const faceN = faceTexture(skinHex, { ...base, smile: false }), faceS = faceTexture(skinHex, { ...base, smile: true });
  const headMat = toon(0xffffff, { map: base.smile ? faceS : faceN, emissive: new THREE.Color(skin).multiplyScalar(k) });
  const headMesh = sphere(0.2, headMat, 0, 0.2, 0, 18, 12);
  head.add(headMesh);
  for (const s of [-1, 1]) head.add(sphere(0.045, skinMat, s * 0.2, 0.19, 0, 6, 5));
  // hair
  const style = o.hairStyle ?? 'short';
  if (style === 'bob') {
    head.add(mesh(new THREE.SphereGeometry(0.218, 16, 8, 0, TAU, 0, Math.PI * 0.37), hairMat, 0, 0.2, -0.005));
    head.add(mesh(new THREE.CylinderGeometry(0.218, 0.2, 0.32, 16, 1, true, Math.PI * 0.36, Math.PI * 1.28), hairMat, 0, 0.14, -0.01));
  } else if (style === 'short' || style === 'cap' || style === 'beret' || style === 'ponytail') {
    head.add(mesh(new THREE.SphereGeometry(0.212, 16, 8, 0, TAU, 0, Math.PI * 0.5), hairMat, 0, 0.2, -0.02));
    if (style === 'ponytail') { const p = capsule(0.06, 0.25, hairMat, 0, 0.05, -0.2); p.rotation.x = 0.35; head.add(p); }
    if (style === 'cap') {
      const hm = toonE(o.hat ?? 0x3a3630, k * 0.4);
      head.add(cyl(0.235, 0.22, 0.08, hm, 0, 0.36, -0.01, 14));
      head.add(box(0.22, 0.025, 0.14, hm, 0, 0.33, 0.24));
    }
    if (style === 'beret') { const b = sphere(0.25, toonE(o.hat ?? 0x2a2a30, k * 0.4), 0.05, 0.37, -0.02, 14, 8); b.scale.set(1, 0.32, 1); b.rotation.z = -0.25; head.add(b); }
  } else if (style === 'ring') {
    head.add(mesh(new THREE.CylinderGeometry(0.212, 0.205, 0.12, 14, 1, true, Math.PI * 0.42, Math.PI * 1.16), hairMat, 0, 0.16, -0.01));
  }
  // arms
  const arm = (side: number): Limb => {
    const piv = new THREE.Group(); piv.position.set(side * 0.25, 0.5, 0); hips.add(piv);
    piv.add(capsule(0.06, 0.2, topMat, 0, -0.15, 0));
    const elbow = new THREE.Group(); elbow.position.y = -0.3; piv.add(elbow);
    elbow.add(capsule(0.055, 0.18, topMat, 0, -0.14, 0));
    const hand = new THREE.Group(); hand.position.y = -0.3; elbow.add(hand);
    hand.add(sphere(0.062, skinMat, 0, 0, 0, 8, 6));
    piv.rotation.z = side * 0.12;
    return { piv, elbow, hand };
  };
  const leg = (side: number): Leg => {
    const piv = new THREE.Group(); piv.position.set(side * 0.1, HIP, 0); g.add(piv);
    piv.add(capsule(0.085, 0.22, botMat, 0, -0.2, 0));
    const knee = new THREE.Group(); knee.position.y = -0.4; piv.add(knee);
    knee.add(capsule(0.07, 0.2, botMat, 0, -0.18, 0));
    knee.add(ellipsoid(0.08, 0.05, 0.14, shoeMat, 0, -0.37, 0.05, 10, 6));
    return { piv, knee };
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);
  g.scale.setScalar(H / 1.86);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return {
    group: g, hips, head, torso, armL, armR, legL, legR, hipY: HIP,
    setSmile(on) { const m = headMat as THREE.MeshToonMaterial; const want = on ? faceS : faceN; if (m.map !== want) m.map = want; },
  };
}

/** Bring every joint back to a standing rest pose. */
function relax(p: Figure, dt: number, lambda = 6, except: THREE.Object3D[] = []) {
  const skip = (o: THREE.Object3D) => except.includes(o);
  if (!skip(p.armL.piv)) dampRot(p.armL.piv, 0, 0, -0.12, lambda, dt);
  if (!skip(p.armR.piv)) dampRot(p.armR.piv, 0, 0, 0.12, lambda, dt);
  if (!skip(p.armL.elbow)) dampRot(p.armL.elbow, 0, 0, 0, lambda, dt);
  if (!skip(p.armR.elbow)) dampRot(p.armR.elbow, 0, 0, 0, lambda, dt);
  dampRot(p.legL.piv, 0, 0, 0, lambda, dt); dampRot(p.legR.piv, 0, 0, 0, lambda, dt);
  dampRot(p.legL.knee, 0, 0, 0, lambda, dt); dampRot(p.legR.knee, 0, 0, 0, lambda, dt);
  p.hips.position.y = damp(p.hips.position.y, p.hipY, lambda, dt);
  p.hips.rotation.x = damp(p.hips.rotation.x, 0, lambda, dt);
}
/** Walk cycle on the legs and arms; `k` in 0..1 blends it in. */
function walkCycle(p: Figure, t: number, rate: number, k: number) {
  const ph = t * rate;
  const a = Math.sin(ph) * 0.55 * k, b = Math.sin(ph + Math.PI) * 0.55 * k;
  p.legL.piv.rotation.x = a; p.legR.piv.rotation.x = b;
  p.legL.knee.rotation.x = Math.max(0, -Math.sin(ph)) * 0.9 * k; p.legR.knee.rotation.x = Math.max(0, Math.sin(ph)) * 0.9 * k;
  if (k > 0) { p.armL.piv.rotation.x = b * 0.6; p.armR.piv.rotation.x = a * 0.6; }
  p.hips.position.y = p.hipY + Math.abs(Math.sin(ph)) * 0.03 * k;
}

// ---------------- Amélie ----------------
export const AMELIE_LOOK: PersonOpts = { skin: 0xf4dcc8, hair: 0x1a1412, hairStyle: 'bob', top: 0xc8322b, bottom: 0x2a2020, skirt: 0xc8322b, shoes: 0x1a1414, face: { smile: true, cheeks: true, mischief: true }, glow: 0.24 };
export function makeAmelie() {
  const p = makePerson({ ...AMELIE_LOOK, height: 1.72 });
  p.hips.add(box(0.38, 0.06, 0.36, toonE(0x2f5d3f, 0.2), 0, 0.0, 0));
  let waveT = 0, giggleT = 0;
  const ch: Character & { wave(): void; giggle(): void; figure: Figure } = {
    group: p.group, figure: p,
    wave() { waveT = 2.2; giggleT = 0; },
    giggle() { giggleT = 1.6; waveT = 0; },
    update(dt, t) {
      p.hips.rotation.z = Math.sin(t * 1.3) * 0.03;
      if (waveT > 0) {
        waveT -= dt;
        relax(p, dt, 8, [p.armR.piv, p.armR.elbow]);
        dampRot(p.armR.piv, -2.7, 0, 0.35 + Math.sin(t * 13) * 0.3, 12, dt);
        dampRot(p.armR.elbow, -0.5, 0, 0, 10, dt);
        dampRot(p.head, -0.05, 0, -0.12, 8, dt);
        p.setSmile(true);
      } else if (giggleT > 0) {
        giggleT -= dt;
        relax(p, dt, 8, [p.armR.piv, p.armR.elbow]);
        dampRot(p.head, 0.5, 0.15, 0.1, 10, dt);
        dampRot(p.armR.piv, -1.0, 0, 0.15, 14, dt);
        dampRot(p.armR.elbow, -2.1, 0.3, 0, 14, dt);
        p.hips.rotation.z = Math.sin(t * 24) * 0.035;
        p.hips.rotation.x = 0.12;
        p.setSmile(true);
      } else {
        relax(p, dt, 5);
        dampRot(p.head, Math.sin(t * 0.9) * 0.04, Math.sin(t * 0.55) * 0.35 + Math.sin(t * 0.21) * 0.2, 0, 3, dt);
        p.setSmile(Math.sin(t * 0.37) > -0.4);
      }
    },
  };
  return ch;
}

// ---------------- Lucien & Collignon at the greengrocer's stall ----------------
export function makeGrocers(rng: Rng) {
  const g = new THREE.Group();
  const lucien = makePerson({ height: 1.58, skin: 0xf0cdb0, hair: 0x4a3626, hairStyle: 'cap', hat: 0x5a6a4a, top: 0x6a8ab0, bottom: 0x4a4038, apron: 0x3a4a6a, face: { smile: true, cheeks: true }, glow: 0.2 });
  const collignon = makePerson({ height: 1.88, skin: 0xe9c4a6, hair: 0x2c2420, hairStyle: 'short', top: 0xf1ebdc, bottom: 0x3a3230, apron: 0xf7f2e6, face: { moustache: true, smile: false }, glow: 0.16 });
  lucien.group.position.set(-1.1, 0, -0.9); collignon.group.position.set(1.2, 0, -0.9);
  collignon.head.rotation.y = -0.4;
  g.add(lucien.group, collignon.group);
  // the stall: a sloped table with crates of fruit and vegetables
  const wood = toonE(0x8a6a48, 0.12), crateMat = toonE(0xb08a5a, 0.12);
  g.add(box(4.2, 0.12, 1.6, wood, 0, 0.85, 0.2));
  for (const x of [-1.9, 1.9]) for (const z of [-0.5, 0.9]) g.add(box(0.1, 0.85, 0.1, wood, x, 0.42, z));
  g.add(box(4.4, 0.06, 0.12, wood, 0, 0.95, 1.0));
  const fruit: Placement[] = [];
  const colors: number[] = [];
  const palette = [0xe63b2e, 0xf4a020, 0xf7d94c, 0x6fb84a, 0x8e3b8f, 0xe8703a, 0xd94a6a, 0xf2e6a0];
  for (let i = 0; i < 6; i++) {
    const cx = -1.7 + i * 0.68, cz = 0.2;
    const c = crateMat;
    g.add(box(0.6, 0.28, 0.6, c, cx, 1.05, cz));
    g.add(box(0.56, 0.26, 0.56, toonE(0x5a3a2a, 0.05), cx, 1.06, cz));
    const col = palette[i % palette.length];
    for (let k = 0; k < 9; k++) {
      fruit.push({ x: cx + ((k % 3) - 1) * 0.17, y: 1.2 + Math.floor(k / 3) * 0.0 + (k % 2) * 0.03, z: cz + (Math.floor(k / 3) - 1) * 0.17, scale: rng.range(0.85, 1.15), rot: 0 });
      colors.push(col);
    }
  }
  // a second, higher row at the back
  for (let i = 0; i < 5; i++) {
    const cx = -1.4 + i * 0.7, cz = -0.45;
    g.add(box(0.6, 0.28, 0.6, crateMat, cx, 1.25, cz));
    const col = palette[(i + 3) % palette.length];
    for (let k = 0; k < 9; k++) { fruit.push({ x: cx + ((k % 3) - 1) * 0.17, y: 1.42, z: cz + (Math.floor(k / 3) - 1) * 0.17, scale: rng.range(0.85, 1.15), rot: 0 }); colors.push(col); }
  }
  g.add(instanced(new THREE.SphereGeometry(0.09, 8, 6), toonE(0xffffff, 0.22), fruit, (i, c) => c.set(colors[i])));
  // awning over the stall
  const awn = canvasTexture(128, 32, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f4efe2' : '#3f7a4f'; c.fillRect(i * 16, 0, 16, 32); } });
  const aw = mesh(new THREE.PlaneGeometry(4.6, 1.6), new THREE.MeshLambertMaterial({ map: awn, side: THREE.DoubleSide, emissive: 0x223322 }), 0, 2.75, 0.4);
  aw.rotation.x = -Math.PI / 2 + 0.35; g.add(aw);
  for (const x of [-2.2, 2.2]) g.add(cyl(0.04, 0.04, 2.9, toonE(0x3a3a3a, 0.1), x, 1.45, 1.05, 6));
  // the perfect endive, hidden in Lucien's hand until he shows it
  const endive = ellipsoid(0.07, 0.16, 0.07, toonE(0xf3ec9a, 0.35), 0, -0.02, 0.05);
  endive.visible = false; lucien.armR.hand.add(endive);
  let showT = 0, flinchT = 0;
  const ch: Character & { endive(): void; flinch(): void } = {
    group: g,
    endive() { showT = 2.0; },
    flinch() { flinchT = 1.5; },
    update(dt, t) {
      // Lucien
      if (showT > 0) {
        showT -= dt; relax(lucien, dt, 8, [lucien.armR.piv, lucien.armR.elbow, lucien.armL.piv]);
        dampRot(lucien.armR.piv, -2.3, 0, 0.35, 12, dt); dampRot(lucien.armR.elbow, -0.9, 0, 0, 12, dt);
        endive.visible = true; lucien.setSmile(true);
        dampRot(lucien.head, -0.2, 0.1, 0.1, 8, dt);
      } else {
        relax(lucien, dt, 5, [lucien.armR.piv, lucien.armR.elbow, lucien.armL.piv]); endive.visible = false;
        // sorting fruit: arms go down to the crates
        dampRot(lucien.armR.piv, -0.9 + Math.sin(t * 1.8) * 0.2, 0, 0.2, 4, dt); dampRot(lucien.armL.piv, -0.7, 0, -0.3, 4, dt);
        dampRot(lucien.armR.elbow, -0.5, 0, 0, 4, dt);
        dampRot(lucien.head, 0.2 + Math.sin(t * 0.7) * 0.1, Math.sin(t * 0.4) * 0.3, 0, 3, dt);
        lucien.hips.rotation.x = 0.1;
      }
      // Collignon
      if (flinchT > 0) {
        flinchT -= dt;
        const k = Math.sin(clamp((1.5 - flinchT) / 1.5, 0, 1) * Math.PI);
        collignon.hips.position.y = collignon.hipY + 0.12 * k;
        collignon.hips.rotation.x = -0.35 * k;
        collignon.group.position.z = -0.9 - 0.4 * k;
        dampRot(collignon.armL.piv, -2.2 * k, 0, -0.8 * k, 14, dt); dampRot(collignon.armR.piv, -2.2 * k, 0, 0.8 * k, 14, dt);
        dampRot(collignon.head, -0.3 * k, 0, 0.2 * k, 12, dt);
      } else {
        relax(collignon, dt, 5, [collignon.armL.piv, collignon.armL.elbow, collignon.armR.piv, collignon.armR.elbow]);
        collignon.group.position.z = damp(collignon.group.position.z, -0.9, 5, dt);
        dampRot(collignon.armL.piv, -0.4, 0, -0.5, 4, dt); dampRot(collignon.armL.elbow, -1.6, 0, 0, 4, dt);
        dampRot(collignon.armR.piv, -0.4, 0, 0.5, 4, dt); dampRot(collignon.armR.elbow, -1.6, 0, 0, 4, dt);
        dampRot(collignon.head, 0.05, -0.4 + Math.sin(t * 0.3) * 0.2, 0, 3, dt);
      }
    },
  };
  return ch;
}

// ---------------- pigeons ----------------
export function makePigeons(count: number, rng: Rng, area = 2.6) {
  const g = new THREE.Group();
  const grey = toonE(0x8b8f99, 0.15), neck = toonE(0x3f7f6a, 0.2), dark = toon(0x2a2a30), wingMat = toonE(0x9a9ea8, 0.15, { side: THREE.DoubleSide });
  const birds: { g: THREE.Group; head: THREE.Mesh; wl: THREE.Mesh; wr: THREE.Mesh; home: THREE.Vector3; phase: number; dir: number }[] = [];
  const wingGeo = new THREE.PlaneGeometry(0.28, 0.14);
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const body = ellipsoid(0.11, 0.1, 0.17, grey, 0, 0.14, 0, 10, 7);
    b.add(body);
    b.add(ellipsoid(0.07, 0.07, 0.08, neck, 0, 0.19, 0.12, 8, 6));
    const head = sphere(0.055, grey, 0, 0.26, 0.17, 8, 6);
    b.add(head);
    const beak = cone(0.02, 0.05, toon(0xd9a066), 0, 0.25, 0.235, 5); beak.rotation.x = Math.PI / 2; b.add(beak);
    for (const s of [-1, 1]) b.add(sphere(0.012, dark, s * 0.035, 0.275, 0.2, 5, 4));
    const wl = mesh(wingGeo, wingMat, -0.16, 0.19, 0), wr = mesh(wingGeo, wingMat, 0.16, 0.19, 0);
    wl.rotation.y = -0.3; wr.rotation.y = 0.3;
    b.add(wl, wr);
    for (const s of [-1, 1]) b.add(cyl(0.008, 0.008, 0.08, toon(0xc0605a), s * 0.035, 0.04, 0.02, 4));
    const tail = box(0.1, 0.02, 0.14, grey, 0, 0.14, -0.2); b.add(tail);
    const home = V(rng.range(-area, area), 0, rng.range(-area * 0.6, area * 0.6));
    b.position.copy(home); b.rotation.y = rng.range(0, TAU);
    g.add(b);
    birds.push({ g: b, head, wl, wr, home, phase: rng.range(0, 10), dir: rng.range(0, TAU) });
  }
  let scatterT = 0;
  const SCATTER = 4.2;
  const ch: Character & { scatter(): void } = {
    group: g,
    scatter() { scatterT = SCATTER; for (const b of birds) b.dir = Math.atan2(b.home.x, b.home.z) + rng.range(-0.6, 0.6); },
    update(dt, t) {
      if (scatterT > 0) scatterT -= dt;
      for (const b of birds) {
        if (scatterT > 0) {
          const k = clamp((SCATTER - scatterT) / SCATTER, 0, 1);
          const up = Math.sin(k * Math.PI) * (2.6 + Math.sin(b.phase) * 1.0);
          const out = Math.sin(k * Math.PI) * 3.2;
          b.g.position.set(b.home.x + Math.sin(b.dir) * out, up, b.home.z + Math.cos(b.dir) * out);
          b.g.rotation.y = damp(b.g.rotation.y, b.dir + Math.sin(t * 3 + b.phase) * 0.3, 8, dt);
          b.g.rotation.x = -0.5 * Math.cos(k * Math.PI);
          const flap = Math.sin(t * 28 + b.phase) * 0.9;
          b.wl.rotation.z = flap; b.wr.rotation.z = -flap;
          b.head.position.z = 0.19;
        } else {
          b.g.position.y = damp(b.g.position.y, 0, 8, dt);
          b.g.rotation.x = damp(b.g.rotation.x, 0, 8, dt);
          b.wl.rotation.z = damp(b.wl.rotation.z, 0, 8, dt); b.wr.rotation.z = damp(b.wr.rotation.z, 0, 8, dt);
          // pecking and strutting
          const peck = Math.max(0, Math.sin(t * 5 + b.phase)) ;
          b.head.position.y = 0.26 - peck * 0.12; b.head.position.z = 0.17 + peck * 0.05;
          b.g.rotation.y += Math.sin(t * 0.7 + b.phase) * dt * 0.5;
          if (Math.sin(t * 0.9 + b.phase * 2) > 0.7) { b.g.position.x += Math.sin(b.g.rotation.y) * dt * 0.25; b.g.position.z += Math.cos(b.g.rotation.y) * dt * 0.25; }
        }
      }
    },
  };
  return ch;
}

// ---------------- Nino at the photo booth ----------------
export function makeNino() {
  const g = new THREE.Group();
  const p = makePerson({ height: 1.8, skin: 0xefcdb2, hair: 0x2a221c, hairStyle: 'short', top: 0x3c4c6c, bottom: 0x5a4a3c, shoes: 0x2a2220, face: { smile: true }, glow: 0.2 });
  g.add(p.group);
  // satchel on a strap
  const satchel = box(0.32, 0.26, 0.1, toonE(0x6a4a30, 0.15), 0.3, 0.05, -0.05);
  p.hips.add(satchel);
  const strap = cyl(0.02, 0.02, 0.62, toonE(0x4a3320, 0.1), 0.1, 0.32, 0.1, 5); strap.rotation.z = 0.55; p.hips.add(strap);
  // torn photos on the ground and one in his hand
  const photoTex = canvasTexture(64, 96, (c, w, h) => {
    c.fillStyle = '#f4f0e6'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#b9b0a4'; for (let i = 0; i < 4; i++) c.fillRect(6, 4 + i * 23, w - 12, 20);
    c.fillStyle = '#e6cbb0'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(w / 2, 14 + i * 23, 6, 0, TAU); c.fill(); }
  });
  const photoMat = new THREE.MeshBasicMaterial({ map: photoTex, side: THREE.DoubleSide });
  const scraps: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const s = mesh(new THREE.PlaneGeometry(0.12, 0.16), photoMat, Math.sin(i * 2.4) * 0.7, 0.01, 0.4 + Math.cos(i * 1.7) * 0.5);
    s.rotation.x = -Math.PI / 2; s.rotation.z = i * 0.9;
    g.add(s); scraps.push(s);
  }
  const held = mesh(new THREE.PlaneGeometry(0.2, 0.28), photoMat, 0, 0.02, 0.08);
  held.rotation.x = -0.2; held.visible = false;
  p.armR.hand.add(held);
  let standT = 0;
  const ch: Character & { stand(): void } = {
    group: g,
    stand() { standT = 2.4; },
    update(dt, t) {
      if (standT > 0) {
        standT -= dt;
        relax(p, dt, 7, [p.armR.piv, p.armR.elbow]);
        dampRot(p.armR.piv, -2.4, 0, 0.25, 10, dt); dampRot(p.armR.elbow, -0.7, 0, 0, 10, dt);
        held.visible = true; p.setSmile(true);
        dampRot(p.head, -0.15, 0, 0, 8, dt);
      } else {
        // crouched, picking up scraps
        held.visible = false;
        const l = 8;
        p.hips.position.y = damp(p.hips.position.y, 0.46, l, dt);
        dampRot(p.legL.piv, -1.55, 0, -0.15, l, dt); dampRot(p.legR.piv, -1.55, 0, 0.15, l, dt);
        dampRot(p.legL.knee, 1.5, 0, 0, l, dt); dampRot(p.legR.knee, 1.5, 0, 0, l, dt);
        p.hips.rotation.x = damp(p.hips.rotation.x, 0.55, l, dt);
        const reach = Math.sin(t * 1.6);
        dampRot(p.armR.piv, -0.9 - reach * 0.3, 0, 0.3, 6, dt); dampRot(p.armR.elbow, -0.2, 0, 0, 6, dt);
        dampRot(p.armL.piv, -0.6, 0, -0.35, 6, dt); dampRot(p.armL.elbow, -0.9, 0, 0, 6, dt);
        dampRot(p.head, 0.35, Math.sin(t * 0.8) * 0.4, 0, 4, dt);
        p.setSmile(false);
      }
      for (let i = 0; i < scraps.length; i++) scraps[i].rotation.z += Math.sin(t * 2 + i) * dt * 0.02;
    },
  };
  return ch;
}

// ---------------- the travelling gnome ----------------
export function makeGnome() {
  const g = new THREE.Group();
  const red = toonE(0xd23a2a, 0.3), blue = toonE(0x3b5f9c, 0.25), white = toonE(0xf4f1ea, 0.3), skin = toonE(0xf1c9a8, 0.3), brown = toonE(0x5a3a26, 0.15);
  g.add(cyl(0.16, 0.2, 0.42, blue, 0, 0.27, 0, 10));
  g.add(cyl(0.2, 0.2, 0.05, brown, 0, 0.2, 0, 10));
  for (const s of [-1, 1]) g.add(ellipsoid(0.07, 0.05, 0.11, toon(0x1a1a1a), s * 0.08, 0.05, 0.05, 8, 6));
  const head = new THREE.Group(); head.position.y = 0.48; g.add(head);
  head.add(sphere(0.15, skin, 0, 0.1, 0, 12, 9));
  head.add(ellipsoid(0.15, 0.17, 0.12, white, 0, -0.02, 0.06, 12, 9)); // beard
  head.add(sphere(0.035, toonE(0xe08080, 0.3), 0, 0.09, 0.15, 6, 5)); // nose
  for (const s of [-1, 1]) head.add(sphere(0.02, toon(0x222), s * 0.05, 0.14, 0.13, 5, 4));
  const hat = new THREE.Group(); hat.position.y = 0.2; head.add(hat);
  hat.add(cone(0.17, 0.42, red, 0, 0.2, 0, 12));
  const arms: THREE.Mesh[] = [];
  for (const s of [-1, 1]) { const a = capsule(0.04, 0.16, blue, s * 0.2, 0.36, 0.04); a.rotation.z = s * 0.4; g.add(a); arms.push(a); }
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  let tipT = 0;
  const ch: Character & { tipHat(): void } = {
    group: g,
    tipHat() { tipT = 1.6; },
    update(dt, t) {
      if (tipT > 0) {
        tipT -= dt;
        const k = Math.sin(clamp((1.6 - tipT) / 1.6, 0, 1) * Math.PI);
        hat.position.y = 0.2 + k * 0.16; hat.position.x = k * 0.1; hat.rotation.z = -k * 0.6;
        arms[1].rotation.z = 0.4 + k * 2.4; arms[1].rotation.x = -k * 0.4;
        head.rotation.z = -k * 0.15;
      } else {
        hat.position.y = damp(hat.position.y, 0.2, 8, dt); hat.position.x = damp(hat.position.x, 0, 8, dt); hat.rotation.z = damp(hat.rotation.z, 0, 8, dt);
        arms[1].rotation.z = damp(arms[1].rotation.z, 0.4, 8, dt); arms[1].rotation.x = damp(arms[1].rotation.x, 0, 8, dt);
        head.rotation.z = damp(head.rotation.z, 0, 8, dt);
        head.rotation.y = Math.sin(t * 0.5) * 0.15;
      }
    },
  };
  return ch;
}

// ---------------- the blind man guided by a small Amélie ----------------
export function makeBlindPair() {
  const g = new THREE.Group();
  const man = makePerson({ height: 1.82, skin: 0xe6c2a4, hair: 0xd8d2c6, hairStyle: 'ring', top: 0xb9a686, bottom: 0x5a4c40, shoes: 0x2a2220, face: { glasses: true, dark: true, smile: false, beard: '#d8d2c6' }, glow: 0.18 });
  const amelie = makePerson({ ...AMELIE_LOOK, height: 1.5 });
  man.group.position.set(0.3, 0, 0); amelie.group.position.set(-0.42, 0, 0.1);
  g.add(man.group, amelie.group);
  // long coat: a wider skirt-like cone below the torso
  man.hips.add(cone(0.28, 0.5, toonE(0xb9a686, 0.18), 0, -0.12, 0, 12));
  // white cane in his right hand
  const cane = cyl(0.015, 0.015, 1.05, toonE(0xf4f1ea, 0.35), 0, -0.45, 0.2, 6);
  cane.rotation.x = 0.35; man.armR.hand.add(cane);
  cane.add(box(0.03, 0.03, 0.03, toon(0xd23a2a), 0, -0.5, 0));
  let laughT = 0;
  const ch: Character & { laugh(): void; walking: boolean } = {
    group: g, walking: true,
    laugh() { laughT = 1.8; },
    update(dt, t) {
      const k = ch.walking && laughT <= 0 ? 1 : 0;
      walkCycle(man, t, 4.2, k); walkCycle(amelie, t, 4.6, k);
      if (laughT > 0) {
        laughT -= dt;
        const kk = Math.sin(clamp((1.8 - laughT) / 1.8, 0, 1) * Math.PI);
        dampRot(man.head, -0.45 * kk, 0, 0.1 * kk, 10, dt);
        dampRot(man.armR.piv, -2.3 * kk, 0, 0.5 * kk, 10, dt);
        man.hips.rotation.x = -0.12 * kk; man.hips.position.y = man.hipY + Math.abs(Math.sin(t * 14)) * 0.02 * kk;
        man.setSmile(true);
        dampRot(amelie.head, -0.2, 0.9, 0, 6, dt);
        amelie.setSmile(true);
      } else {
        // the cane taps ahead; Amélie holds his arm and looks up at him as she describes the street
        man.armR.piv.rotation.x = -0.6 + Math.sin(t * 4.2) * 0.35 * k; man.armR.piv.rotation.z = 0.25;
        dampRot(man.head, 0.05, Math.sin(t * 0.6) * 0.12, 0, 4, dt);
        man.hips.rotation.x = damp(man.hips.rotation.x, 0.03, 4, dt);
        man.setSmile(Math.sin(t * 0.5) > 0.2);
        amelie.armR.piv.rotation.x = -1.1; amelie.armR.piv.rotation.z = 0.45; amelie.armR.elbow.rotation.x = -0.6;
        dampRot(amelie.head, -0.25, 0.55 + Math.sin(t * 1.7) * 0.15, 0, 5, dt);
        amelie.setSmile(Math.sin(t * 2.3) > 0);
      }
    },
  };
  return ch;
}

// ---------------- Dufayel, the glass man, painting at his easel ----------------
export function makeDufayel() {
  const g = new THREE.Group();
  const p = makePerson({ height: 1.72, skin: 0xe9c6a8, hair: 0xd9d5cc, hairStyle: 'ring', top: 0x7a3f3a, bottom: 0x4a4440, shoes: 0x3a2a24, face: { glasses: true, smile: false }, glow: 0.2 });
  // seated on a stool
  const seat = 0.58;
  p.hips.position.y = seat;
  p.legL.piv.rotation.x = -1.45; p.legR.piv.rotation.x = -1.45; p.legL.knee.rotation.x = 1.45; p.legR.knee.rotation.x = 1.45;
  g.add(p.group);
  g.add(cyl(0.2, 0.22, 0.06, toonE(0x5a4232, 0.1), 0, seat - 0.05 - 0.02, -0.1, 10));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; g.add(cyl(0.02, 0.02, seat - 0.1, toonE(0x3a2a20, 0.05), Math.cos(a) * 0.16, (seat - 0.1) / 2, -0.1 + Math.sin(a) * 0.16, 5)); }
  // easel with the boating party
  const easel = new THREE.Group();
  const wood = toonE(0x8a6a48, 0.15);
  for (const s of [-1, 1]) { const leg = cyl(0.025, 0.025, 1.9, wood, s * 0.32, 0.95, 0, 6); leg.rotation.z = s * 0.1; easel.add(leg); }
  const back = cyl(0.025, 0.025, 1.9, wood, 0, 0.95, -0.3, 6); back.rotation.x = -0.3; easel.add(back);
  easel.add(box(0.7, 0.04, 0.08, wood, 0, 0.8, 0.02));
  const painting = canvasTexture(128, 96, (c, w, h) => {
    // a bright boating party under a striped awning
    const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#9fd3f2'); sky.addColorStop(1, '#5aa0d8');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    c.fillStyle = '#4f8fc9'; c.fillRect(0, h * 0.62, w, h * 0.38);
    for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#f6efe1' : '#e0603a'; c.fillRect(i * (w / 12), 0, w / 12, 16); }
    c.fillStyle = '#e8d8b8'; c.fillRect(0, h * 0.5, w, 8);
    const heads = [[18, 46, '#f7c8a8', '#f4e04a'], [40, 40, '#f1c4a0', '#ffffff'], [62, 50, '#e8b898', '#3a3a3a'], [86, 42, '#f7d0b0', '#e63b2e'], [108, 52, '#f1c4a0', '#2f5d3f']] as const;
    for (const [x, y, skin, hat] of heads) {
      c.fillStyle = '#f4f0e6'; c.fillRect(x - 9, y + 8, 18, 22);
      c.fillStyle = skin; c.beginPath(); c.arc(x, y, 7, 0, TAU); c.fill();
      c.fillStyle = hat; c.beginPath(); c.ellipse(x, y - 6, 9, 3.5, 0, 0, TAU); c.fill();
    }
    c.fillStyle = '#e63b2e'; c.fillRect(50, 66, 24, 10); c.fillStyle = '#6fb84a'; c.beginPath(); c.arc(74, 70, 4, 0, TAU); c.fill();
    const glints = new Rng(19); // seeded, so the painting is the same every ride
    c.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 40; i++) c.fillRect(glints.next() * w, h * 0.65 + glints.next() * h * 0.3, 4, 1.5);
  });
  const canvasMesh = mesh(new THREE.PlaneGeometry(0.9, 0.68), new THREE.MeshLambertMaterial({ map: painting, emissive: 0x555555, emissiveMap: painting }), 0, 1.2, 0.05);
  canvasMesh.rotation.x = -0.08;
  easel.add(canvasMesh);
  easel.add(box(0.98, 0.76, 0.03, toonE(0xd8c090, 0.15), 0, 1.2, 0.02).rotateX(-0.08));
  easel.position.set(0.85, 0, 0.45); easel.rotation.y = -0.9;
  g.add(easel);
  // brush and palette
  const brush = cyl(0.008, 0.008, 0.3, toonE(0xd9b070, 0.1), 0, 0, 0.12, 5); brush.rotation.x = -1.2; p.armR.hand.add(brush);
  const palette = mesh(new THREE.CircleGeometry(0.16, 12), toonE(0xd8c090, 0.15), 0, -0.02, 0.06); palette.rotation.x = -1.4; p.armL.hand.add(palette);
  for (let i = 0; i < 6; i++) palette.add(mesh(new THREE.CircleGeometry(0.03, 6), glow([0xe63b2e, 0xf4d94c, 0x2f5d3f, 0x3b5f9c, 0xffffff, 0xf4a020][i], 0.8), Math.cos(i) * 0.09, Math.sin(i) * 0.09, 0.005));
  let turnT = 0;
  const ch: Character & { turn(): void } = {
    group: g,
    turn() { turnT = 2.2; },
    update(dt, t) {
      if (turnT > 0) {
        turnT -= dt;
        dampRot(p.hips, 0, 0.75, 0, 5, dt);
        dampRot(p.head, -0.1, 0.55, 0, 6, dt);
        dampRot(p.armR.piv, -0.6, 0, 0.3, 6, dt); dampRot(p.armR.elbow, -0.8, 0, 0, 6, dt);
        p.setSmile(true);
      } else {
        dampRot(p.hips, 0.1, -0.35, 0, 3, dt);
        dampRot(p.head, 0.1 + Math.sin(t * 0.8) * 0.05, -0.55 + Math.sin(t * 0.4) * 0.1, 0, 3, dt);
        // painting strokes with the right hand
        dampRot(p.armR.piv, -1.5 + Math.sin(t * 2.4) * 0.12, -0.6, 0.35 + Math.sin(t * 3.1) * 0.08, 6, dt);
        dampRot(p.armR.elbow, -0.5 + Math.sin(t * 2.4) * 0.25, 0, 0, 6, dt);
        p.setSmile(false);
      }
      dampRot(p.armL.piv, -1.1, 0.3, -0.35, 6, dt); dampRot(p.armL.elbow, -0.9, 0, 0, 6, dt);
    },
  };
  return ch;
}

// ---------------- a cat on a windowsill ----------------
export function makeCat() {
  const g = new THREE.Group();
  const fur = toonE(0x2a2624, 0.22), white = toonE(0xf1ece2, 0.2);
  g.add(ellipsoid(0.16, 0.2, 0.24, fur, 0, 0.22, -0.02, 12, 8));
  g.add(ellipsoid(0.1, 0.14, 0.12, white, 0, 0.18, 0.12, 10, 7)); // chest
  const head = new THREE.Group(); head.position.set(0, 0.46, 0.08); g.add(head);
  head.add(sphere(0.13, fur, 0, 0, 0, 12, 9));
  head.add(ellipsoid(0.06, 0.05, 0.05, white, 0, -0.05, 0.1, 8, 6));
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const ear = cone(0.045, 0.1, fur, s * 0.08, 0.13, -0.01, 6); ear.rotation.z = -s * 0.25; head.add(ear);
    const eye = ellipsoid(0.03, 0.038, 0.02, glow(0x9fe07a, 1.3), s * 0.05, 0.02, 0.115, 6, 5);
    const pupil = ellipsoid(0.008, 0.028, 0.01, toon(0x111), s * 0.05, 0.02, 0.135, 4, 4);
    head.add(eye, pupil); eyes.push(eye, pupil);
  }
  for (const s of [-1, 1]) g.add(ellipsoid(0.05, 0.04, 0.08, white, s * 0.09, 0.04, 0.16, 8, 5));
  const tail = capsule(0.028, 0.34, fur, 0.12, 0.08, -0.2); tail.rotation.x = 1.2; tail.rotation.z = -0.6; g.add(tail);
  let blink = 2;
  const rng = new Rng(23); // own seed, so blink timing doesn't shift when other code draws random numbers
  const ch: Character = {
    group: g,
    update(dt, t) {
      tail.rotation.z = -0.6 + Math.sin(t * 1.4) * 0.35; tail.rotation.x = 1.2 + Math.sin(t * 0.9) * 0.15;
      head.rotation.y = Math.sin(t * 0.35) * 0.5; head.rotation.z = Math.sin(t * 0.6) * 0.08;
      blink -= dt; if (blink <= 0) blink = 3 + rng.next() * 4;
      const s = blink < 0.12 ? 0.15 : 1;
      for (const e of eyes) e.scale.y = s;
    },
  };
  return ch;
}

// ---------------- the carousel at the foot of the steps ----------------
export function makeCarousel(rng: Rng) {
  const g = new THREE.Group();
  const cream = toonE(0xf4e9d2, 0.15), red = toonE(0xc0392b, 0.18), gold = toonE(0xe0b45a, 0.28), dark = toon(0x3a2a24);
  g.add(cyl(5.3, 5.5, 0.5, dark, 0, 0.25, 0, 24));
  const spin = new THREE.Group(); spin.position.y = 0.5; g.add(spin);
  const stripe = canvasTexture(256, 32, (c) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#f7efe0' : '#c0392b'; c.fillRect(i * 16, 0, 16, 32); } }, [3, 1]);
  const canopyMat = new THREE.MeshLambertMaterial({ map: stripe, emissive: 0x3a2018, side: THREE.DoubleSide });
  // lower tier
  spin.add(cyl(5.0, 5.0, 0.24, cream, 0, 0.12, 0, 24));
  spin.add(cyl(0.55, 0.65, 3.6, gold, 0, 2.0, 0, 12));
  spin.add(cyl(5.2, 5.2, 0.2, cream, 0, 3.7, 0, 24));
  spin.add(cyl(5.35, 5.35, 0.55, red, 0, 3.95, 0, 24));
  // upper tier
  spin.add(cyl(3.4, 3.4, 0.24, cream, 0, 4.32, 0, 20));
  spin.add(cyl(0.4, 0.45, 2.7, gold, 0, 5.7, 0, 12));
  spin.add(cyl(3.6, 3.6, 0.2, cream, 0, 7.0, 0, 20));
  spin.add(cyl(3.75, 3.75, 0.45, red, 0, 7.3, 0, 20));
  spin.add(mesh(new THREE.ConeGeometry(3.9, 2.4, 20, 1, true), canopyMat, 0, 8.7, 0));
  spin.add(sphere(0.35, glow(0xffd27a, 1.3), 0, 10.1, 0, 10, 8));
  // lights on both fascias and up the cone
  const lights: Placement[] = [];
  for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU; lights.push({ x: Math.cos(a) * 5.4, y: 3.95, z: Math.sin(a) * 5.4, scale: 1, rot: 0 }); }
  for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; lights.push({ x: Math.cos(a) * 3.8, y: 7.3, z: Math.sin(a) * 3.8, scale: 1, rot: 0 }); }
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; lights.push({ x: Math.cos(a) * 2.2, y: 8.55, z: Math.sin(a) * 2.2, scale: 0.9, rot: 0 }); }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  spin.add(instanced(new THREE.SphereGeometry(0.11, 8, 6), lightMat, lights));
  // horses
  const horseColors = [0xfaf4ea, 0xf1e0c8, 0xe8c9c9, 0xcfdbe8, 0xf6e6b0];
  const saddleColors = [0xc0392b, 0x2f5d3f, 0x3b5f9c, 0xe0b45a];
  const horses: { g: THREE.Group; body: THREE.Group; phase: number }[] = [];
  const horse = (r: number, a: number, deckY: number, roofY: number) => {
    const h = new THREE.Group();
    h.position.set(Math.sin(a) * r, deckY, Math.cos(a) * r);
    h.rotation.y = a + Math.PI / 2;
    h.add(cyl(0.035, 0.035, roofY - deckY, gold, 0, (roofY - deckY) / 2, 0, 6));
    const body = new THREE.Group();
    const coat = toonE(rng.pick(horseColors), 0.2), saddle = toonE(rng.pick(saddleColors), 0.2);
    const b = capsule(0.2, 0.5, coat, 0, 0, 0); b.rotation.x = Math.PI / 2; body.add(b);
    const neck = cyl(0.1, 0.14, 0.4, coat, 0, 0.25, 0.42, 8); neck.rotation.x = -0.5; body.add(neck);
    body.add(ellipsoid(0.1, 0.13, 0.24, coat, 0, 0.42, 0.62, 8, 6));
    for (const s of [-1, 1]) body.add(cone(0.03, 0.08, coat, s * 0.05, 0.55, 0.55, 5));
    body.add(box(0.3, 0.08, 0.32, saddle, 0, 0.18, -0.02));
    for (const s of [-1, 1]) for (const z of [-0.28, 0.24]) { const leg = cyl(0.04, 0.035, 0.45, coat, s * 0.12, -0.35, z, 6); leg.rotation.x = z > 0 ? -0.35 : 0.3; body.add(leg); }
    const tail = capsule(0.04, 0.25, toonE(0xd8c8a8, 0.2), 0, 0.02, -0.45); tail.rotation.x = 0.9; body.add(tail);
    body.position.y = 1.2;
    h.add(body);
    horses.push({ g: h, body, phase: rng.range(0, TAU) });
    spin.add(h);
  };
  for (let i = 0; i < 8; i++) horse(3.9, (i / 8) * TAU, 0.24, 3.6);
  for (let i = 0; i < 6; i++) horse(2.5, (i / 6) * TAU + 0.3, 4.44, 6.9);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  let litT = 0, speed = 0.25;
  const baseCol = new THREE.Color(0xffd27a);
  const ch: Character & { lightsOn(): void; lit: number } = {
    group: g, lit: 0,
    lightsOn() { litT = 4.5; },
    update(dt, t) {
      if (litT > 0) litT -= dt;
      ch.lit = damp(ch.lit, litT > 0 ? 1 : 0, 3, dt);
      speed = damp(speed, litT > 0 ? 0.85 : 0.25, 1.5, dt);
      spin.rotation.y += speed * dt;
      for (const h of horses) h.body.position.y = 1.2 + Math.sin(t * (1.6 + speed) + h.phase) * 0.28;
      const twinkle = 0.85 + Math.sin(t * 6) * 0.1;
      lightMat.color.copy(baseCol).multiplyScalar(lerp(0.55, 1.7, ch.lit) * twinkle);
    },
  };
  return ch;
}

// ---------------- Blubber the goldfish ----------------
export function makeBlubber() {
  const g = new THREE.Group();
  const orange = toonE(0xff8a2a, 0.4), pale = toonE(0xffc88a, 0.35);
  const fish = new THREE.Group();
  fish.add(ellipsoid(0.34, 0.38, 0.58, orange, 0, 0, 0, 14, 10));
  fish.add(ellipsoid(0.24, 0.2, 0.42, pale, 0, -0.14, 0.05, 10, 8));
  const tail = cone(0.32, 0.55, orange, 0, 0, -0.82, 4); tail.rotation.x = -Math.PI / 2; tail.scale.x = 0.3; fish.add(tail);
  const dorsal = box(0.04, 0.22, 0.4, orange, 0, 0.42, -0.05); fish.add(dorsal);
  for (const s of [-1, 1]) {
    const fin = cone(0.12, 0.3, orange, s * 0.34, -0.08, 0.1, 4); fin.rotation.z = s * Math.PI / 2; fin.scale.z = 0.3; fish.add(fin);
    fish.add(sphere(0.085, toon(0xffffff), s * 0.24, 0.12, 0.42, 8, 6));
    fish.add(sphere(0.045, toon(0x1a1a1a), s * 0.26, 0.12, 0.49, 6, 5));
  }
  fish.add(ellipsoid(0.1, 0.06, 0.05, toon(0xb04a30), 0, -0.05, 0.57, 8, 6));
  fish.visible = false; fish.position.y = -1;
  g.add(fish);
  const start = new THREE.Vector3(), end = new THREE.Vector3();
  let leapT = 0, hopT = 0, nextHop = 4, yaw = 0;
  const rng = new Rng(29); // own seed, so each hop's direction doesn't shift when other code draws random numbers
  const LEAP = 1.7;
  const ch: Character & { leap(landing: THREE.Vector3): void; up(): boolean } = {
    group: g,
    up() { return leapT > 0 || hopT > 0; },
    leap(landing) {
      g.updateWorldMatrix(true, false);
      const local = g.worldToLocal(landing.clone()); local.y = 0;
      const dir = local.clone().normalize();
      if (dir.lengthSq() < 0.5) dir.set(1, 0, 0);
      start.copy(local).addScaledVector(dir, -2.6); end.copy(local).addScaledVector(dir, 2.6);
      yaw = Math.atan2(dir.x, dir.z);
      leapT = LEAP; hopT = 0;
    },
    update(dt, t) {
      if (leapT > 0) {
        leapT -= dt;
        const k = clamp(1 - leapT / LEAP, 0, 1);
        fish.visible = true;
        fish.position.lerpVectors(start, end, k);
        fish.position.y = Math.sin(k * Math.PI) * 3.0 - 0.3;
        fish.rotation.set(-Math.cos(k * Math.PI) * 1.0, yaw, Math.sin(t * 12) * 0.1);
        tail.rotation.z = Math.sin(t * 18) * 0.5;
        if (leapT <= 0) { fish.visible = false; fish.position.y = -1; }
        return;
      }
      nextHop -= dt;
      if (nextHop <= 0 && hopT <= 0) { hopT = 0.9; nextHop = 5 + rng.next() * 5; yaw = rng.next() * TAU; }
      if (hopT > 0) {
        hopT -= dt;
        const k = clamp(1 - hopT / 0.9, 0, 1);
        fish.visible = true;
        fish.position.set(Math.sin(yaw) * k * 1.2, Math.sin(k * Math.PI) * 1.1 - 0.35, Math.cos(yaw) * k * 1.2);
        fish.rotation.set(-Math.cos(k * Math.PI) * 0.8, yaw, 0);
        tail.rotation.z = Math.sin(t * 16) * 0.5;
        if (hopT <= 0) { fish.visible = false; fish.position.y = -1; }
      }
    },
  };
  return ch;
}

// ---------------- accordion busker on the bridge ----------------
export function makeBusker() {
  const g = new THREE.Group();
  const p = makePerson({ height: 1.76, skin: 0xe9c6a8, hair: 0x4a3a30, hairStyle: 'cap', hat: 0x4a4038, top: 0x5a3a30, bottom: 0x2e2a30, shoes: 0x1e1a1a, face: { smile: true, moustache: true }, glow: 0.2 });
  g.add(p.group);
  // waistcoat
  p.hips.add(box(0.3, 0.42, 0.06, toonE(0x2f5d3f, 0.2), 0, 0.3, 0.16));
  // accordion at chest height: two end boxes and a pleated bellows between them
  const acc = new THREE.Group(); acc.position.set(0.05, 0.28, 0.36); acc.rotation.z = -0.25; p.hips.add(acc);
  const endMat = toonE(0xb3262a, 0.28), keyMat = toonE(0xf4f1ea, 0.3);
  const pleat = canvasTexture(64, 16, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#1a1a1a' : '#c9c2b4'; c.fillRect(i * 8, 0, 8, 16); } }, [3, 1]);
  const bellows = mesh(new THREE.BoxGeometry(1, 0.34, 0.22), new THREE.MeshLambertMaterial({ map: pleat, emissive: 0x222222 }), 0, 0, 0);
  const endL = new THREE.Group(), endR = new THREE.Group();
  endL.add(box(0.12, 0.42, 0.3, endMat, 0, 0, 0));
  for (let i = 0; i < 12; i++) endL.add(sphere(0.012, keyMat, -0.065, -0.15 + (i % 6) * 0.06, -0.06 + Math.floor(i / 6) * 0.12, 4, 3));
  endR.add(box(0.14, 0.44, 0.3, endMat, 0, 0, 0));
  for (let i = 0; i < 7; i++) endR.add(box(0.03, 0.05, 0.22, keyMat, 0.08, -0.16 + i * 0.055, 0.0));
  acc.add(bellows, endL, endR);
  let playT = 0, stretch = 0.35;
  const ch: Character & { play(): void } = {
    group: g,
    play() { playT = 3.0; },
    update(dt, t) {
      if (playT > 0) playT -= dt;
      const lively = damp(stretch, playT > 0 ? 1 : 0.35, 3, dt); stretch = lively;
      const s = 0.36 + (0.5 + Math.sin(t * (playT > 0 ? 6.5 : 3.2)) * 0.5) * (0.28 + 0.34 * lively);
      bellows.scale.x = s; endL.position.x = -s / 2 - 0.06; endR.position.x = s / 2 + 0.07;
      // arms follow the two ends
      dampRot(p.armL.piv, -1.15, 0.2, -(0.2 + s * 0.6), 10, dt); dampRot(p.armL.elbow, -1.3, 0, 0, 10, dt);
      dampRot(p.armR.piv, -1.15, -0.2, 0.15 + s * 0.2, 10, dt); dampRot(p.armR.elbow, -1.5, 0, 0, 10, dt);
      p.hips.rotation.z = Math.sin(t * (playT > 0 ? 3.2 : 1.6)) * (0.04 + 0.08 * lively);
      p.hips.position.y = p.hipY + Math.abs(Math.sin(t * 3.2)) * 0.03 * lively;
      dampRot(p.head, -0.1 * lively, Math.sin(t * 0.8) * 0.2, Math.sin(t * 1.6) * 0.1 * lively, 4, dt);
      p.legL.piv.rotation.x = Math.sin(t * 3.2) * 0.08 * lively;
      p.setSmile(true);
    },
  };
  return ch;
}

// ---------------- lovers on a bench ----------------
export function makeLovers() {
  const g = new THREE.Group();
  const iron = toonE(0x2f3a34, 0.1), wood = toonE(0x6a4a30, 0.14);
  g.add(box(1.9, 0.06, 0.42, wood, 0, 0.46, 0));
  const back = box(1.9, 0.4, 0.05, wood, 0, 0.78, -0.22); back.rotation.x = 0.15; g.add(back);
  for (const s of [-1, 1]) { g.add(box(0.06, 0.46, 0.4, iron, s * 0.85, 0.23, 0)); g.add(box(0.06, 0.5, 0.06, iron, s * 0.85, 0.75, -0.22)); }
  const seated = (p: Figure) => {
    p.hips.position.y = 0.52; p.legL.piv.rotation.x = -1.45; p.legR.piv.rotation.x = -1.45; p.legL.knee.rotation.x = 1.45; p.legR.knee.rotation.x = 1.45;
  };
  const him = makePerson({ height: 1.78, skin: 0xd9b090, hair: 0x1e1814, hairStyle: 'short', top: 0x2e3a4a, bottom: 0x3a3230, face: { smile: true, closed: true }, glow: 0.18 });
  const her = makePerson({ height: 1.66, skin: 0xf1d2bc, hair: 0x6a3a22, hairStyle: 'ponytail', top: 0x7a3a5a, bottom: 0x4a3a4a, skirt: 0x7a3a5a, face: { smile: true, closed: true, cheeks: true }, glow: 0.18 });
  seated(him); seated(her);
  him.group.position.set(-0.36, 0, 0.12); her.group.position.set(0.36, 0, 0.12);
  him.hips.rotation.z = -0.16; her.hips.rotation.z = 0.2; him.head.rotation.z = -0.2; her.head.rotation.z = 0.3;
  him.armR.piv.rotation.x = -0.3; him.armR.piv.rotation.z = 0.9; him.armR.elbow.rotation.x = -0.9; // arm around her
  her.armL.piv.rotation.x = -0.9; her.armL.piv.rotation.z = -0.5; her.armL.elbow.rotation.x = -1.2;
  g.add(him.group, her.group);
  const ch: Character = {
    group: g,
    update(dt, t) {
      void dt;
      him.torso.scale.y = 1 + Math.sin(t * 1.1) * 0.012; her.torso.scale.y = 1 + Math.sin(t * 1.3 + 1) * 0.012;
      her.head.rotation.z = 0.3 + Math.sin(t * 0.5) * 0.03;
    },
  };
  return ch;
}

// ---------------- the finale: Amélie and Nino on the parked moped ----------------
export function makeFinale() {
  const g = new THREE.Group();
  const nino = makePerson({ height: 1.8, skin: 0xefcdb2, hair: 0x2a221c, hairStyle: 'short', top: 0x3c4c6c, bottom: 0x5a4a3c, shoes: 0x2a2220, face: { smile: true }, glow: 0.24 });
  const amelie = makePerson({ ...AMELIE_LOOK, height: 1.72 });
  const ride = (p: Figure, z: number) => {
    p.group.position.set(0, 0.02, z);
    p.hips.position.y = 0.84;
    p.legL.piv.rotation.x = -0.9; p.legR.piv.rotation.x = -0.9; p.legL.knee.rotation.x = 1.5; p.legR.knee.rotation.x = 1.5;
    p.legL.piv.rotation.z = -0.25; p.legR.piv.rotation.z = 0.25;
  };
  ride(nino, 0.05); ride(amelie, -0.5);
  // Nino holds the handlebars, Amélie holds him
  nino.armL.piv.rotation.x = -1.1; nino.armR.piv.rotation.x = -1.1; nino.armL.elbow.rotation.x = -0.3; nino.armR.elbow.rotation.x = -0.3;
  amelie.armL.piv.rotation.x = -1.3; amelie.armR.piv.rotation.x = -1.3; amelie.armL.piv.rotation.z = -0.35; amelie.armR.piv.rotation.z = 0.35; amelie.armL.elbow.rotation.x = -0.9; amelie.armR.elbow.rotation.x = -0.9;
  amelie.head.rotation.y = 0.5;
  g.add(nino.group, amelie.group);
  let leanT = 0;
  const ch: Character & { leanIn(): void } = {
    group: g,
    leanIn() { leanT = 2.6; },
    update(dt, t) {
      if (leanT > 0) {
        leanT -= dt;
        dampRot(nino.head, 0.0, -2.2, 0.15, 5, dt);
        dampRot(nino.hips, 0.05, -0.6, 0.0, 5, dt);
        dampRot(amelie.head, 0.05, 0.9, -0.15, 5, dt);
        dampRot(amelie.hips, -0.15, 0.4, 0, 5, dt);
        amelie.setSmile(true); nino.setSmile(true);
      } else {
        dampRot(nino.head, 0.0, -0.9 + Math.sin(t * 0.5) * 0.1, 0, 3, dt);
        dampRot(nino.hips, 0.05, -0.15, 0, 3, dt);
        dampRot(amelie.head, 0.0, 0.5 + Math.sin(t * 0.7) * 0.1, Math.sin(t * 0.9) * 0.05, 3, dt);
        dampRot(amelie.hips, 0.05, 0.1, 0, 3, dt);
        amelie.setSmile(Math.sin(t * 0.6) > -0.5); nino.setSmile(true);
      }
    },
  };
  return ch;
}
