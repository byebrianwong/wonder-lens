import * as THREE from 'three';
import { charToon, type CharToonOpts } from '../../engine/Paint';
import { sculpt, limbGeometry, Spring, LookAt, outline, taperedTube } from '../../engine/Rig';
import { clamp, damp, lerp, Rng, smoothstep } from '../../engine/math';
import { faceTexture, hairTexture, fabric, type FaceOpts } from '../ghibli/characterTextures';
import { blinkAmount } from '../ghibli/character';

/**
 * Grown-ups for the Amélie world, drawn like the Ghibli children: a head with a painted face and a sculpted
 * hairdo, a soft torso, arms and legs that bend at the shoulder, elbow, hip and knee, cel shading with a
 * cool shadow tone and a thin ink line round every part. Every joint is a group placed at the joint, so
 * a rotation swings the limb from the right place. Faces +z; the origin is at the feet.
 */

export type Hair = 'bob' | 'short' | 'bald' | 'curly' | 'none';

export interface AdultOpts {
  skin?: number;
  hair: number;
  style: Hair;
  /** fringe painted on the forehead */
  fringe?: FaceOpts['fringe'];
  top: number;
  stripes?: { color: number; count: number; width: number };
  sleeves?: 'long' | 'short';
  bottom: { kind: 'dress' | 'skirt' | 'trousers'; color: number; length?: number };
  shoes: number;
  apron?: number;
  /** a jacket, cardigan or coat over the top (its colour) */
  coat?: number;
  /** false for a cardigan or a short jacket: no coat tails below the waist */
  coatSkirt?: boolean;
  hat?: { kind: 'cap' | 'beret' | 'flat'; color: number };
  moustache?: number;
  glasses?: boolean;
  face?: Partial<FaceOpts>;
  /** height scale (1 = about 1.75 tall) */
  scale?: number;
  /** body width */
  build?: number;
  /** a warm self-light for someone standing somewhere dim */
  glow?: number;
  /** paint the face at full size (for the leads, who are seen close up) */
  hiRes?: boolean;
  seed: number;
}

export interface Adult {
  group: THREE.Group;
  pelvis: THREE.Group; spine: THREE.Group; neck: THREE.Group; head: THREE.Group;
  /** index 0 is on the -x side (the figure's right), 1 on the +x side */
  shoulder: THREE.Group[]; elbow: THREE.Group[]; hand: THREE.Object3D[];
  hip: THREE.Group[]; knee: THREE.Group[];
  look: LookAt;
  /** swap the face: 'open' (normal), 'smile' or 'shut' */
  setFace(f: 'normal' | 'smile' | 'open'): void;
  /** blinking, breathing and the head turning towards `lookTarget` */
  tick(dt: number, t: number, lookTarget: THREE.Vector3 | null, lookWeight?: number): void;
}

const HEAD_R = 0.18;

/** The hairdo as a closed shell around the head. */
function hairShape(style: Hair, R: number) {
  const line = (around: number) => {
    const a = Math.abs(around) / Math.PI; // 0 front, 1 back
    const front = smoothstep(0.1, 0.42, a);
    switch (style) {
      case 'bob': // Amélie's bob: a straight fringe and a jaw-length cut all round
        return lerp(0.33 + 0.12 * smoothstep(0.06, 0.12, a), 0.7, front) + 0.03 * smoothstep(0.6, 1, a);
      case 'curly': return lerp(0.36, 0.56, front) + 0.05 * smoothstep(0.55, 1, a);
      case 'bald': return lerp(0.44, 0.62, front) + 0.04 * smoothstep(0.6, 1, a);
      default: return lerp(0.39, 0.58, front) + 0.06 * smoothstep(0.55, 1, a);
    }
  };
  return (d: THREE.Vector3, out: THREE.Vector3) => {
    const around = Math.atan2(d.x, d.z), polar = Math.acos(clamp(d.y, -1, 1));
    const a = Math.abs(around) / Math.PI;
    let hl = line(around) * Math.PI;
    // a cut fringe is straight; elsewhere the ends break into soft points
    if (!(style === 'bob' && a < 0.12)) hl += 0.03 * Math.abs(Math.sin(around * 13));
    const tuck = smoothstep(hl - 0.03, hl + 0.06, polar);
    // bald: only a horseshoe of hair round the back and sides
    const baldTop = style === 'bald' ? smoothstep(0.42 * Math.PI, 0.3 * Math.PI, polar) : 0;
    const flare = style === 'bob' ? 0.09 * smoothstep(0.42 * Math.PI, hl, polar) * smoothstep(0.08, 0.3, a) : style === 'curly' ? 0.08 + 0.05 * Math.sin(around * 9) * Math.sin(polar * 8) : 0.03 * smoothstep(0.4 * Math.PI, hl, polar);
    let r = R * (1.07 + flare + 0.018 * Math.sin(around * 18 + polar * 2.5) * smoothstep(0.1, 0.6, polar));
    r = lerp(r, R * 0.82, Math.max(tuck, baldTop));
    out.copy(d).multiplyScalar(r);
    out.y += R * 0.03;
  };
}

const matCache = new Map<string, THREE.Material>();
function cached(key: string, make: () => THREE.Material) {
  let m = matCache.get(key);
  if (!m) { m = make(); matCache.set(key, m); }
  return m;
}

export function makeAdult(o: AdultOpts): Adult {
  const g = new THREE.Group();
  const skinC = o.skin ?? 0xf1d2bc;
  const em = o.glow ?? 0x000000;
  const W = o.build ?? 1;
  const T = (opts: CharToonOpts) => charToon({ emissive: em, ...opts });
  const skin = cached(`skin${skinC}${em}`, () => T({ color: skinC, rim: 0.35 }));
  const topMat = cached(`top${o.top}${o.stripes?.color}${em}${o.seed}`, () => T({ map: fabric(o.top, { stripes: o.stripes, folds: 6, seed: o.seed }), rim: 0.35, shade: 0x9aa0cc }));
  const botMat = cached(`bot${o.bottom.color}${o.bottom.kind}${em}`, () => T({ map: fabric(o.bottom.color, { hem: o.bottom.kind !== 'trousers', folds: 10, seed: o.seed + 1 }), rim: 0.35, shade: 0x9aa0cc, side: THREE.DoubleSide }));
  const hairMat = cached(`hair${o.hair}${em}`, () => T({ map: hairTexture(o.hair, o.seed + 2), rim: 0.45 }));
  const shoeMat = cached(`shoe${o.shoes}`, () => T({ color: o.shoes, rim: 0.35 }));
  const coatMat = o.coat !== undefined ? cached(`coat${o.coat}${em}`, () => T({ map: fabric(o.coat!, { hem: true, folds: 8, seed: o.seed + 4 }), rim: 0.35, shade: 0x9aa0cc, side: THREE.DoubleSide })) : null;
  const ink = 0x2a1e24;
  const lineW = 1.3, lineMax = 0.014;

  // ----- joints -----
  const pelvis = new THREE.Group(); pelvis.position.y = 0.98; g.add(pelvis);
  const spine = new THREE.Group(); spine.position.y = 0.04; pelvis.add(spine);
  const neck = new THREE.Group(); neck.position.y = 0.55; spine.add(neck);
  const head = new THREE.Group(); head.position.y = 0.18; neck.add(head);

  // ----- torso -----
  const torsoGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.001, -0.06), new THREE.Vector2(0.15, -0.04), new THREE.Vector2(0.16, 0.1), new THREE.Vector2(0.18, 0.3),
    new THREE.Vector2(0.2, 0.44), new THREE.Vector2(0.17, 0.54), new THREE.Vector2(0.07, 0.6), new THREE.Vector2(0.001, 0.61),
  ], 20).rotateY(Math.PI).scale(W, 1, 0.68);
  const torso = new THREE.Mesh(torsoGeo, coatMat ?? topMat);
  spine.add(torso);
  outline(torso, ink, lineW, lineMax);
  if (o.apron !== undefined) {
    // a waist apron tied over the skirt, curving round the front
    const ap = new THREE.Mesh(new THREE.PlaneGeometry(0.36 * W, 0.46, 6, 4), cached(`apron${o.apron}`, () => T({ color: o.apron!, rim: 0.3, side: THREE.DoubleSide })));
    const pp = ap.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i); pp.setZ(i, -x * x * 2.2 + (0.23 - y) * 0.45); }
    ap.geometry.computeVertexNormals();
    ap.position.set(0, -0.2, 0.17); pelvis.add(ap);
    outline(ap, ink, lineW, lineMax);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.16 * W, 0.012, 4, 20, Math.PI), cached(`apron${o.apron}`, () => T({ color: o.apron!, rim: 0.3 })));
    tie.rotation.x = Math.PI / 2; tie.scale.set(1, 0.72, 1); tie.position.set(0, 0.03, 0); pelvis.add(tie);
  }
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.16, 10), skin);
  neckMesh.position.y = 0.04; neck.add(neckMesh);
  if (o.coat !== undefined && o.coatSkirt !== false) {
    // a collar turned up round the neck
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.1, 14, 1, true), coatMat!);
    collar.position.y = 0.0; neck.add(collar);
  }

  // ----- head: face, ears, the hairdo, hat, moustache, glasses -----
  const faceBase: FaceOpts = { skin: skinC, hair: o.style === 'bald' ? skinC : o.hair, fringe: o.fringe ?? 'none', mouth: 'small', w: o.hiRes ? 1024 : 512, seed: o.seed + 3, ...o.face };
  // each expression is painted the first time it is needed
  const faceOpts: Record<'normal' | 'smile' | 'open' | 'shut', FaceOpts> = {
    normal: faceBase, smile: { ...faceBase, mouth: 'smile' }, open: { ...faceBase, mouth: 'open' }, shut: { ...faceBase, eyes: 'closed' },
  };
  const faceCache: Partial<Record<keyof typeof faceOpts, THREE.Texture>> = {};
  const face = (k: keyof typeof faceOpts) => (faceCache[k] ??= faceTexture(faceOpts[k]));
  let faceKind: 'normal' | 'smile' | 'open' = o.face?.mouth === 'smile' ? 'smile' : 'normal';
  const faceMat = T({ map: face(faceKind), rim: 0.3 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 32, 24), faceMat);
  skull.scale.set(1, 1.05, 0.96);
  head.add(skull);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), skin);
    ear.scale.set(0.5, 1, 0.8); ear.position.set(s * HEAD_R * 0.97, -0.01, -0.01);
    head.add(ear);
  }
  if (o.style !== 'none') {
    const hair = new THREE.Mesh(sculpt(hairShape(o.style, HEAD_R), 72, 48), hairMat);
    head.add(hair);
    outline(hair, ink, lineW, lineMax);
  } else outline(skull, ink, lineW, lineMax);
  if (o.hat) {
    const hm = cached(`hat${o.hat.color}`, () => T({ color: o.hat!.color, rim: 0.35 }));
    if (o.hat.kind === 'beret') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.2, 16, 8), hm); b.scale.set(1, 0.32, 1); b.position.set(0.02, HEAD_R * 0.95, -0.02); b.rotation.z = -0.25; head.add(b);
      outline(b, ink, lineW, lineMax);
    } else {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(HEAD_R * 1.04, HEAD_R * 1.1, HEAD_R * 0.55, 18), hm); crown.position.y = HEAD_R * 0.75; head.add(crown);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(HEAD_R * 1.4, 0.015, HEAD_R * 0.8), hm); brim.position.set(0, HEAD_R * 0.5, HEAD_R * 1.1); brim.rotation.x = 0.15; head.add(brim);
      outline(crown, ink, lineW, lineMax);
    }
  }
  if (o.moustache !== undefined) {
    const mm = cached(`moustache${o.moustache}`, () => T({ color: o.moustache!, rim: 0.3 }));
    for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), mm); m.scale.set(0.05, 0.018, 0.022); m.position.set(s * 0.038, -0.06, HEAD_R * 0.93); m.rotation.z = s * 0.3; head.add(m); }
  }
  if (o.glasses) {
    const gm = cached('glasses', () => T({ color: 0x2a2420, rim: 0.2 }));
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.006, 6, 16), gm); r.position.set(s * 0.055, 0.0, HEAD_R * 0.98); head.add(r); }
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.006, 0.006), gm); br.position.set(0, 0.005, HEAD_R * 1.0); head.add(br);
  }

  // ----- arms -----
  const shoulder: THREE.Group[] = [], elbow: THREE.Group[] = [], hand: THREE.Object3D[] = [];
  const sleeveMat = coatMat ?? topMat;
  const upperGeo = limbGeometry(0.05 * W, 0.042 * W, 0.3, 10, 5), foreGeo = limbGeometry(0.042 * W, 0.035, 0.28, 10, 5);
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.19 * W, 0.5, 0); spine.add(sh);
    const upper = new THREE.Mesh(upperGeo, o.sleeves === 'short' ? skin : sleeveMat); sh.add(upper);
    if (o.sleeves === 'short') { const sl = new THREE.Mesh(limbGeometry(0.07 * W, 0.065 * W, 0.12, 12, 3), sleeveMat); sh.add(sl); outline(sl, ink, lineW, lineMax); }
    else outline(upper, ink, lineW, lineMax);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    const fore = new THREE.Mesh(foreGeo, o.sleeves === 'short' ? skin : sleeveMat); el.add(fore);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), skin);
    h.scale.set(0.8, 1.15, 0.6); h.position.y = -0.31;
    el.add(h);
    sh.rotation.z = s * 0.1;
    shoulder.push(sh); elbow.push(el); hand.push(h);
  }

  // ----- legs -----
  const hip: THREE.Group[] = [], knee: THREE.Group[] = [];
  const bare = o.bottom.kind !== 'trousers';
  const thighGeo = limbGeometry(0.075 * W, 0.058, 0.47, 12, 5), shinGeo = limbGeometry(0.055, 0.042, 0.46, 12, 5);
  const legMat = bare ? cached(`stocking${skinC}`, () => T({ color: new THREE.Color(skinC).multiplyScalar(0.92).getHex(), rim: 0.3 })) : botMat;
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.09 * W, -0.02, 0); pelvis.add(hp);
    const th = new THREE.Mesh(thighGeo, legMat); hp.add(th);
    const kn = new THREE.Group(); kn.position.y = -0.47; hp.add(kn);
    const sh = new THREE.Mesh(shinGeo, legMat); kn.add(sh);
    if (!bare) { outline(th, ink, lineW, lineMax); outline(sh, ink, lineW, lineMax); }
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), shoeMat);
    shoe.scale.set(0.06, 0.05, 0.12); shoe.position.set(0, -0.47, 0.04);
    kn.add(shoe);
    outline(shoe, ink, lineW, lineMax);
    hip.push(hp); knee.push(kn);
  }
  // trousers need a seat; a skirt or a dress is a bell of cloth from the waist
  if (!bare) {
    const seat = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.16 * W, 0.04), new THREE.Vector2(0.17 * W, -0.06), new THREE.Vector2(0.15 * W, -0.14), new THREE.Vector2(0.001, -0.15)], 18).scale(1, 1, 0.75), botMat);
    pelvis.add(seat); outline(seat, ink, lineW, lineMax);
  } else {
    const len = o.bottom.length ?? 0.52;
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) { const k = i / 10; prof.push(new THREE.Vector2(lerp(0.16 * W, 0.34 * W, Math.pow(k, 0.85)), 0.08 - k * len)); }
    const geo = new THREE.LatheGeometry(prof.reverse(), 40).rotateY(Math.PI);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = clamp((0.08 - y) / len, 0, 1), a = Math.atan2(x, z);
      const f = 1 + 0.06 * k * Math.sin(a * 9);
      p.setXYZ(i, x * f, y, z * f * 0.8);
    }
    geo.computeVertexNormals();
    const skirt = new THREE.Mesh(geo, o.bottom.kind === 'dress' ? topMat : botMat);
    (skirt.material as THREE.Material).side = THREE.DoubleSide;
    pelvis.add(skirt);
    outline(skirt, ink, lineW, lineMax);
  }
  if (o.coat !== undefined && o.coatSkirt !== false) {
    // the coat's skirt hangs to the knee over the trousers
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 6; i++) { const k = i / 6; prof.push(new THREE.Vector2(lerp(0.17 * W, 0.27 * W, k), 0.08 - k * 0.55)); }
    const geo = new THREE.LatheGeometry(prof.reverse(), 28, Math.PI * 0.62, Math.PI * 1.76).rotateY(Math.PI);
    geo.scale(1, 1, 0.8);
    const cs = new THREE.Mesh(geo, coatMat!); pelvis.add(cs); outline(cs, ink, lineW, lineMax);
  }

  if (o.scale) g.scale.setScalar(o.scale);

  // ----- life -----
  const look = new LookAt(0.9, 0.35);
  const rng = new Rng(o.seed + 9);
  let nextBlink = 1 + rng.next() * 3, blinkSince = 9;
  const breathe = new Spring(0, 1, 1);
  void damp; void taperedTube;
  const adult: Adult = {
    group: g, pelvis, spine, neck, head, shoulder, elbow, hand, hip, knee, look,
    setFace(f) { faceKind = f; },
    tick(dt, t, lookTarget, w = 1) {
      nextBlink -= dt; blinkSince += dt;
      if (nextBlink <= 0) { nextBlink = 2 + rng.next() * 3.5; blinkSince = 0; }
      const shut = blinkAmount(blinkSince, 0.16) > 0.5;
      const want = shut ? face('shut') : face(faceKind);
      if (faceMat.map !== want) faceMat.map = want;
      spine.scale.setScalar(1 + breathe.update(Math.sin(t * 1.6) * 0.008, dt));
      const [y, p] = look.update(neck, lookTarget, dt, w);
      neck.rotation.y = y * 0.35; head.rotation.y = y * 0.65;
      head.rotation.x = p;
    },
  };
  return adult;
}

/** Set an arm: shoulder swing forward (x, negative raises it forward), out to the side (z), elbow bend (x). */
export function poseArm(a: Adult, side: 0 | 1, x: number, z: number, elbow: number) {
  const s = side === 0 ? -1 : 1;
  a.shoulder[side].rotation.set(x, 0, s * z);
  a.elbow[side].rotation.set(elbow, 0, 0);
}

/** Ease every joint of a figure towards its rest pose (arms down, legs straight). */
export function relax(a: Adult, dt: number, k = 6) {
  for (const j of [...a.shoulder, ...a.elbow, ...a.hip, ...a.knee, a.spine, a.pelvis]) {
    j.rotation.x = damp(j.rotation.x, 0, k, dt);
    j.rotation.y = damp(j.rotation.y, 0, k, dt);
    j.rotation.z = damp(j.rotation.z, j === a.shoulder[0] ? -0.1 : j === a.shoulder[1] ? 0.1 : 0, k, dt);
  }
}

/** A walking stride at `rate` steps per second; k = 0..1 blends it in. */
export function walk(a: Adult, t: number, rate: number, k: number) {
  const ph = t * rate * Math.PI;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    a.hip[i].rotation.x = Math.sin(ph) * 0.45 * s * k;
    a.knee[i].rotation.x = Math.max(0, Math.sin(ph + (s > 0 ? -1.2 : 1.9))) * 0.6 * k;
    a.shoulder[i].rotation.x = -Math.sin(ph) * 0.35 * s * k;
    a.elbow[i].rotation.x = -0.25 * k;
  }
  a.pelvis.position.y = 0.98 + Math.abs(Math.cos(ph)) * 0.025 * k;
}

/** Sit down on something about `seatY` high: hips bent forward, knees bent down. */
export function sit(a: Adult, seatY = 0.46) {
  a.pelvis.position.y = seatY + 0.06;
  for (let i = 0; i < 2; i++) { a.hip[i].rotation.x = -1.5; a.knee[i].rotation.x = 1.45; }
}
