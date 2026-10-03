import * as THREE from 'three';
import { glow } from '../../engine/Builders';
import { charToon, type CharToonOpts } from '../../engine/Paint';
import { sculpt, limbGeometry, taperedTube, Spring, LookAt, envelope, outline } from '../../engine/Rig';
import { clamp, lerp, Rng, smoothstep } from '../../engine/math';
import { faceTexture, hairTexture, fabric, woodGrain, strawTexture, bowCloth, sphereFur, type FaceOpts } from './characterTextures';
import { makeUmbrella } from './totoro';
import { blinkAmount, type Character } from './character';

/**
 * The children of the Ghibli world (Kiki, Satsuki and Mei, Chihiro), built on one jointed figure:
 * a head with a sculpted hairdo, a torso, and arms and legs that bend at the shoulder, elbow, hip and knee.
 * Every joint is a group placed at the joint, so a rotation swings the limb from the right place.
 */

type HairStyle = 'bob' | 'short' | 'pigtails' | 'ponytail';

interface KidOpts {
  skin?: number;
  hair: number;
  style: HairStyle;
  top: number;
  stripes?: { color: number; count: number; width: number };
  sleeves: 'long' | 'short';
  bottom: { kind: 'dress' | 'skirt' | 'shorts'; color: number; length?: number };
  /** sock colour, or 'bare' */
  socks: number | 'bare';
  shoes: number;
  face?: Partial<FaceOpts>;
  /** a warm self-light for a character sitting somewhere dim */
  glow?: number;
  seed: number;
}

export interface Kid {
  group: THREE.Group;
  pelvis: THREE.Group; spine: THREE.Group; neck: THREE.Group; head: THREE.Group;
  /** index 0 is on the -x side (the character's right), 1 on the +x side */
  shoulder: THREE.Group[]; elbow: THREE.Group[]; hand: THREE.Object3D[];
  hip: THREE.Group[]; knee: THREE.Group[];
  skirt: THREE.Mesh | null;
  look: LookAt;
  /** blinking, breathing and the head turning towards `lookTarget` */
  tick(dt: number, t: number, lookTarget: THREE.Vector3 | null, lookWeight?: number): void;
}

const HEAD_R = 0.29;

/** The hairdo as a closed shell around the head: hair down to a hairline, tucked in under it. */
function hairShape(style: HairStyle, R: number) {
  // polar angle (as a fraction of PI) where the hair ends, for an angle around the head (0 = the face)
  const line = (around: number) => {
    const a = Math.abs(around) / Math.PI; // 0 front, 1 back
    const front = smoothstep(0.1, 0.42, a); // 0 across the face, 1 from the ears back
    switch (style) {
      case 'bob': // chin-length all round, a fringe swept to both sides from a middle parting
        return lerp(0.35 + 0.09 * smoothstep(0, 0.09, a), 0.72, front) + 0.04 * smoothstep(0.6, 1, a);
      case 'short': // boyish crop above the ears
        return lerp(0.405, 0.6, front) + 0.06 * smoothstep(0.55, 1, a);
      case 'pigtails':
        return lerp(0.4, 0.57, front) + 0.05 * smoothstep(0.55, 1, a);
      case 'ponytail':
        return lerp(0.4, 0.6, front) + 0.02 * smoothstep(0.55, 1, a);
    }
  };
  return (d: THREE.Vector3, out: THREE.Vector3) => {
    const around = Math.atan2(d.x, d.z), polar = Math.acos(clamp(d.y, -1, 1));
    const a = Math.abs(around) / Math.PI;
    let hl = line(around) * Math.PI;
    // the fringe and the ends break into soft points
    hl += (a < 0.15 ? 0.045 : 0.03) * Math.abs(Math.sin(around * (a < 0.15 ? 26 : 13)));
    const tuck = smoothstep(hl - 0.03, hl + 0.06, polar);
    // fuller towards the ends of a bob, flatter over the crown
    const flare = style === 'bob' ? 0.1 * smoothstep(0.42 * Math.PI, hl, polar) * smoothstep(0.08, 0.3, a) : 0.03 * smoothstep(0.4 * Math.PI, hl, polar);
    let r = R * (1.085 + flare + 0.018 * Math.sin(around * 18 + polar * 2.5) * smoothstep(0.1, 0.6, polar));
    r = lerp(r, R * 0.82, tuck);
    out.copy(d).multiplyScalar(r);
    out.y += R * 0.03;
  };
}

function makeKid(o: KidOpts): Kid {
  const g = new THREE.Group();
  const skinC = o.skin ?? 0xf3d6bd;
  const em = o.glow ?? 0x000000;
  const T = (opts: CharToonOpts) => charToon({ emissive: em, ...opts });
  const skin = T({ color: skinC, rim: 0.35 });
  const topMat = T({ map: fabric(o.top, { stripes: o.stripes, folds: 6, seed: o.seed }), rim: 0.35, shade: 0x9aa0cc });
  const botMat = T({ map: fabric(o.bottom.color, { hem: o.bottom.kind !== 'shorts', folds: 10, seed: o.seed + 1 }), rim: 0.35, shade: 0x9aa0cc, side: THREE.DoubleSide });
  const hairMat = T({ map: hairTexture(o.hair, o.seed + 2), rim: 0.45 });
  const sockMat = o.socks === 'bare' ? skin : T({ color: o.socks, rim: 0.3 });
  const shoeMat = T({ color: o.shoes, rim: 0.35 });
  const ink = 0x2a1e24;
  const lineW = 1.3, lineMax = 0.014;

  // ----- joints -----
  const pelvis = new THREE.Group(); pelvis.position.y = 1.08; g.add(pelvis);
  const spine = new THREE.Group(); spine.position.y = 0.04; pelvis.add(spine);
  const neck = new THREE.Group(); neck.position.y = 0.66; spine.add(neck);
  const head = new THREE.Group(); head.position.y = 0.3; neck.add(head);

  // ----- torso: a soft lathe from the waist to the shoulders -----
  const torsoGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.001, -0.04), new THREE.Vector2(0.16, -0.02), new THREE.Vector2(0.17, 0.12), new THREE.Vector2(0.19, 0.36),
    new THREE.Vector2(0.2, 0.52), new THREE.Vector2(0.17, 0.64), new THREE.Vector2(0.08, 0.7), new THREE.Vector2(0.001, 0.71),
  ], 20).rotateY(Math.PI).scale(1, 1, 0.74);
  const torso = new THREE.Mesh(torsoGeo, topMat);
  spine.add(torso);
  outline(torso, ink, lineW, lineMax);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.22, 10), skin);
  neckMesh.position.y = 0.08; neck.add(neckMesh);

  // ----- head: face, ears, the hairdo -----
  const faceOpts: FaceOpts = { skin: skinC, hair: o.hair, fringe: 'none', mouth: 'small', w: 1024, seed: o.seed + 3, ...o.face };
  const faceOpen = faceTexture(faceOpts);
  const faceShut = faceOpts.eyes === 'closed' ? faceOpen : faceTexture({ ...faceOpts, eyes: 'closed' });
  const faceMat = T({ map: faceOpen, rim: 0.3 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 40, 28), faceMat);
  skull.scale.set(1, 1.02, 0.96);
  head.add(skull);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin);
    ear.scale.set(0.5, 1, 0.8); ear.position.set(s * HEAD_R * 0.97, -0.02, -0.01);
    head.add(ear);
  }
  const hair = new THREE.Mesh(sculpt(hairShape(o.style, HEAD_R), 96, 64), hairMat);
  head.add(hair);
  outline(hair, ink, lineW, lineMax);
  if (o.style === 'pigtails') {
    // two short bunches high on each side, tied with a band
    for (const s of [-1, 1]) {
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.018, 6, 12), T({ color: 0xe8b84a, rim: 0.2 }));
      tie.position.set(s * 0.22, 0.17, -0.06); tie.rotation.set(0, Math.PI / 2, s * 0.6);
      head.add(tie);
      const bunch = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), hairMat);
      bunch.scale.set(0.07, 0.13, 0.08); bunch.position.set(s * 0.3, 0.24, -0.08); bunch.rotation.z = -s * 0.8;
      head.add(bunch);
      outline(bunch, ink, lineW, lineMax);
    }
  }
  let ponytail: THREE.Group | null = null;
  if (o.style === 'ponytail') {
    ponytail = new THREE.Group();
    ponytail.position.set(0, 0.06, -0.3);
    const tail = new THREE.Mesh(taperedTube(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.12, -0.08), new THREE.Vector3(0, -0.3, -0.06), new THREE.Vector3(0, -0.42, 0.0)]), 0.075, 0.02, 12, 10), hairMat);
    ponytail.add(tail);
    head.add(ponytail);
    outline(tail, ink, lineW, lineMax);
  }

  // ----- arms -----
  const shoulder: THREE.Group[] = [], elbow: THREE.Group[] = [], hand: THREE.Object3D[] = [];
  const upperGeo = limbGeometry(0.06, 0.05, 0.34, 10, 5), foreGeo = limbGeometry(0.05, 0.042, 0.3, 10, 5);
  const sleeveGeo = limbGeometry(0.085, 0.08, 0.15, 12, 3);
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.215, 0.6, 0); spine.add(sh);
    const upper = new THREE.Mesh(upperGeo, o.sleeves === 'long' ? topMat : skin);
    sh.add(upper);
    if (o.sleeves === 'short') { const sl = new THREE.Mesh(sleeveGeo, topMat); sl.position.y = 0.02; sh.add(sl); outline(sl, ink, lineW, lineMax); }
    else outline(upper, ink, lineW, lineMax);
    const el = new THREE.Group(); el.position.y = -0.34; sh.add(el);
    const fore = new THREE.Mesh(foreGeo, o.sleeves === 'long' ? topMat : skin);
    el.add(fore);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), skin);
    h.scale.set(0.8, 1.15, 0.6); h.position.y = -0.33;
    el.add(h);
    sh.rotation.z = s * 0.12;
    shoulder.push(sh); elbow.push(el); hand.push(h);
  }

  // ----- legs -----
  const hip: THREE.Group[] = [], knee: THREE.Group[] = [];
  const thighGeo = limbGeometry(0.085, 0.065, 0.5, 12, 5), shinGeo = limbGeometry(0.062, 0.05, 0.48, 12, 5);
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.1, -0.02, 0); pelvis.add(hp);
    hp.add(new THREE.Mesh(thighGeo, skin));
    const kn = new THREE.Group(); kn.position.y = -0.5; hp.add(kn);
    const shin = new THREE.Mesh(shinGeo, skin); kn.add(shin);
    if (o.socks !== 'bare') {
      const sock = new THREE.Mesh(limbGeometry(0.058, 0.052, 0.2, 10, 3), sockMat);
      sock.position.y = -0.27; kn.add(sock);
    }
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), shoeMat);
    shoe.scale.set(0.075, 0.06, 0.13); shoe.position.set(0, -0.5, 0.04);
    kn.add(shoe);
    outline(shoe, ink, lineW, lineMax);
    hip.push(hp); knee.push(kn);
  }

  // ----- skirt, dress or shorts -----
  let skirt: THREE.Mesh | null = null;
  if (o.bottom.kind === 'shorts') {
    const pants = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.17, 0.06), new THREE.Vector2(0.19, -0.04), new THREE.Vector2(0.19, -0.14), new THREE.Vector2(0.001, -0.15)], 18).scale(1, 1, 0.78), botMat);
    pelvis.add(pants);
    for (const h of hip) { const leg = new THREE.Mesh(limbGeometry(0.105, 0.1, 0.2, 12, 3), botMat); leg.position.y = 0.02; h.add(leg); outline(leg, ink, lineW, lineMax); }
    outline(pants, ink, lineW, lineMax);
  } else {
    const len = o.bottom.length ?? 0.42;
    // a bell of cloth from the waist down, flaring out
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) { const k = i / 10; prof.push(new THREE.Vector2(lerp(0.19, 0.38, Math.pow(k, 0.8)), 0.08 - k * len)); }
    const geo = new THREE.LatheGeometry(prof.reverse(), 40).rotateY(Math.PI);
    // soft folds round the hem
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = clamp((0.08 - y) / len, 0, 1), a = Math.atan2(x, z);
      const f = 1 + 0.06 * k * Math.sin(a * 9);
      p.setXYZ(i, x * f, y, z * f * 0.85);
    }
    geo.computeVertexNormals();
    skirt = new THREE.Mesh(geo, botMat);
    pelvis.add(skirt);
    outline(skirt, ink, lineW, lineMax);
  }

  // ----- life -----
  const look = new LookAt(0.9, 0.35);
  const rng = new Rng(o.seed + 9);
  let nextBlink = 1 + rng.next() * 3, blinkSince = 9;
  const breathe = new Spring(0, 1, 1);
  const kid: Kid = {
    group: g, pelvis, spine, neck, head, shoulder, elbow, hand, hip, knee, skirt, look,
    tick(dt, t, lookTarget, w = 1) {
      // blink every few seconds by swapping in the closed-eye face
      nextBlink -= dt; blinkSince += dt;
      if (nextBlink <= 0) { nextBlink = 2 + rng.next() * 3.5; blinkSince = 0; }
      const shut = blinkAmount(blinkSince, 0.16) > 0.5;
      const want = shut ? faceShut : faceOpen;
      if (faceMat.map !== want) { faceMat.map = want; }
      spine.scale.setScalar(1 + breathe.update(Math.sin(t * 1.6) * 0.008, dt));
      // measured from the shoulders, so turning the neck does not change the answer next frame
      const [y, p] = look.update(neck, lookTarget, dt, w);
      // the neck takes a third of the turn, the head the rest
      neck.rotation.y = y * 0.35; head.rotation.y = y * 0.65;
      head.rotation.x = p;
    },
  };
  return kid;
}

// ---------------- Kiki with Jiji on the broom ----------------
export interface Kiki extends Character {
  wave(): void;
  startle(): void;
  /** where she looks (the camera, usually) */
  lookTarget: THREE.Vector3 | null;
  /** her head, for the facing bonus */
  head: THREE.Object3D;
}

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

export function makeKiki(): Kiki {
  const g = new THREE.Group();
  const kid = makeKid({
    hair: 0x241c1e, style: 'bob', top: 0x2b2946, sleeves: 'long', bottom: { kind: 'dress', color: 0x2b2946, length: 0.5 },
    socks: 'bare', shoes: 0xc8323a, face: { mouth: 'smile', blush: 0.5 }, seed: 5,
  });
  // the big red bow on top of her head
  const bowMat = charToon({ map: bowCloth(0xd23b3f), rim: 0.35 });
  const bow = new THREE.Group();
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), bowMat);
    loop.scale.set(0.2, 0.13, 0.07); loop.position.set(s * 0.18, 0.03, 0); loop.rotation.z = s * 0.35;
    bow.add(loop);
    outline(loop, 0x3a1014, 1.3, 0.012);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), bowMat); bow.add(knot);
  bow.position.set(0, 0.32, -0.02); bow.rotation.x = -0.25;
  kid.head.add(bow);
  // she sits astride the broom, leaning forward, hands on the handle
  kid.group.position.set(0, -0.98, 0.15);
  kid.spine.rotation.x = 0.22;
  kid.hip.forEach((h, i) => { const s = i === 0 ? -1 : 1; h.rotation.set(-1.35, 0, s * 0.42); });
  kid.knee.forEach((k) => { k.rotation.x = 1.35; });
  kid.shoulder.forEach((sh, i) => { const s = i === 0 ? -1 : 1; sh.rotation.set(-0.6, 0, -s * 0.12); });
  kid.elbow.forEach((e) => { e.rotation.x = -0.3; });
  if (kid.skirt) { kid.skirt.scale.set(1.15, 0.8, 1.25); kid.skirt.rotation.x = -0.15; }
  g.add(kid.group);
  // the broom: a pale wooden handle, straw bristles bound at the back
  const broom = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.7, 10), charToon({ map: woodGrain(0x7a5a3a), rim: 0.3 }));
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
  const jiji = makeJiji();
  jiji.group.position.set(0, 0.04, -0.85);
  g.add(jiji.group);

  const sp = { wave: new Spring(0, 2.5, 0.6), rock: new Spring(0, 1.8, 0.35), jump: new Spring(0, 3, 0.5) };
  let waveT = -1, startleT = -1;
  const ch: Kiki = {
    group: g, head: kid.head, lookTarget: null,
    wave() { waveT = 0; },
    startle() { startleT = 0; sp.rock.v += 2.2; },
    update(dt, t) {
      kid.tick(dt, t, ch.lookTarget, 1);
      // the dress and bow flutter in the wind of flying
      if (kid.skirt) { kid.skirt.scale.x = 1.15 + Math.sin(t * 9) * 0.04; kid.skirt.rotation.x = -0.15 + Math.sin(t * 7.3) * 0.04; }
      bow.rotation.z = Math.sin(t * 5) * 0.1;
      kid.knee.forEach((k, i) => { k.rotation.x = 1.35 + Math.sin(t * 2.2 + i * 1.7) * 0.12; });
      // wave: the right arm lifts from the shoulder and the hand waves from the elbow
      let w = 0;
      if (waveT >= 0) { waveT += dt; w = envelope(waveT, 0, 0.35, 1.9, 2.4); if (waveT > 2.4) waveT = -1; }
      const wv = sp.wave.update(w, dt);
      kid.shoulder[1].rotation.set(lerp(-0.6, -0.4, wv), 0, lerp(-0.12, 2.5, wv));
      kid.elbow[1].rotation.set(lerp(-0.3, -0.2, wv), 0, wv * (Math.sin(t * 11) * 0.45 + 0.2));
      // startled: Jiji springs up off the bristles and Kiki wobbles on the broom
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

// ---------------- Satsuki with Mei asleep on her back ----------------
export interface Sisters extends Character {
  wave(): void;
  lookTarget: THREE.Vector3 | null;
}

export function makeSatsukiMei(): Sisters {
  const g = new THREE.Group();
  const sats = makeKid({
    hair: 0x3a2a22, style: 'short', top: 0xf2d34a, sleeves: 'short', bottom: { kind: 'skirt', color: 0xd8512e, length: 0.36 },
    socks: 0xf4f0e6, shoes: 0x8a5a3a, face: { mouth: 'small' }, seed: 10,
  });
  g.add(sats.group);
  // her right hand holds the umbrella up over both of them; the left reaches back to hold Mei
  sats.shoulder[0].rotation.set(-0.9, 0, -0.35);
  sats.elbow[0].rotation.set(-1.25, 0, 0);
  sats.shoulder[1].rotation.set(0.5, 0, 0.35);
  sats.elbow[1].rotation.set(-0.9, 0, 0);
  const umb = makeUmbrella(1.0, 0x8a3a34);
  umb.group.position.set(0, -0.33, 0.02);
  sats.elbow[0].add(umb.group);
  const umbQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), tilt = new THREE.Quaternion(), tiltE = new THREE.Euler();
  outline(umb.canopy, 0x1a1a24, 1.2, 0.015);
  // Mei: smaller, asleep, riding piggyback with her arms over Satsuki's shoulders
  const mei = makeKid({
    hair: 0x8a5a30, style: 'pigtails', top: 0xf0a0b8, sleeves: 'short', bottom: { kind: 'dress', color: 0xf0a0b8, length: 0.32 },
    socks: 'bare', shoes: 0xe8c040, face: { eyes: 'closed', mouth: 'small', blush: 0.6 }, seed: 13,
  });
  mei.group.scale.setScalar(0.68);
  mei.group.position.set(0, 0.52, -0.36);
  mei.spine.rotation.x = 0.35;
  mei.hip.forEach((h, i) => { const s = i === 0 ? -1 : 1; h.rotation.set(-1.25, 0, s * 0.55); });
  mei.knee.forEach((k) => { k.rotation.x = 1.3; });
  mei.shoulder.forEach((sh, i) => { const s = i === 0 ? -1 : 1; sh.rotation.set(-1.7, 0, -s * 0.35); });
  mei.elbow.forEach((e) => { e.rotation.x = -0.9; });
  sats.spine.add(mei.group);
  // off to one side, so her sleeping face rests on Satsuki's shoulder where it can be seen
  mei.group.position.set(0.17, -0.46, -0.4);
  mei.group.rotation.y = -0.25;

  const sp = { wave: new Spring(0, 2.4, 0.6) };
  let waveT = -1;
  const ch: Sisters = {
    group: g, lookTarget: null,
    wave() { waveT = 0; },
    update(dt, t) {
      sats.tick(dt, t, ch.lookTarget, 1);
      // Mei sleeps: no blinking, a slow breath, her head lolling on her sister's shoulder
      mei.spine.scale.setScalar(1 + Math.sin(t * 1.1) * 0.012);
      mei.neck.rotation.set(0.25, 0, 0.35 + Math.sin(t * 0.5) * 0.04);
      sats.group.position.y = Math.sin(t * 1.3) * 0.008;
      // the umbrella stands up over her head whatever her arm is doing, leaning back a little over Mei
      sats.elbow[0].getWorldQuaternion(parentQ).invert();
      g.getWorldQuaternion(umbQ).multiply(tilt.setFromEuler(tiltE.set(-0.3 + Math.sin(t * 0.7) * 0.03, 0, 0.18 + Math.sin(t * 0.9) * 0.04)));
      umb.group.quaternion.copy(parentQ.multiply(umbQ));
      // a wave with the free hand, which lets go of Mei for a moment
      let w = 0;
      if (waveT >= 0) { waveT += dt; w = envelope(waveT, 0, 0.35, 1.7, 2.2); if (waveT > 2.2) waveT = -1; }
      const wv = sp.wave.update(w, dt);
      sats.shoulder[1].rotation.set(lerp(0.5, -0.2, wv), 0, lerp(0.35, 2.6, wv));
      sats.elbow[1].rotation.set(lerp(-0.9, -0.15, wv), 0, wv * (Math.sin(t * 10) * 0.45 + 0.15));
    },
  };
  return ch;
}

// ---------------- Chihiro seated in the train, with Boh the mouse ----------------
export interface Chihiro extends Character {
  look(): void;
  lookTarget: THREE.Vector3 | null;
}

export function makeChihiroSeated(): Chihiro {
  const g = new THREE.Group();
  // she sits in the dim cabin, so everything carries a little warm self-light
  const kid = makeKid({
    hair: 0x4a3226, style: 'ponytail', top: 0xf5f2ea, stripes: { color: 0x4faa5a, count: 6, width: 14 }, sleeves: 'short',
    bottom: { kind: 'shorts', color: 0xe89a9a }, socks: 0xf2e9d0, shoes: 0xe8e0d0, face: { mouth: 'small' }, glow: 0x1c140c, seed: 17,
  });
  g.add(kid.group);
  kid.group.scale.setScalar(0.7);
  // seated on the bench (its top is about 0.6 above her origin): thighs forward, shins down, hands in her lap
  const SEAT = 0.68 - 1.08 * 0.7;
  kid.group.position.set(0, SEAT, 0);
  kid.hip.forEach((h, i) => { const s = i === 0 ? -1 : 1; h.rotation.set(-1.5, 0, s * 0.05); });
  kid.knee.forEach((k) => { k.rotation.x = 1.5; });
  kid.shoulder.forEach((sh, i) => { const s = i === 0 ? -1 : 1; sh.rotation.set(-0.35, 0, s * 0.18); });
  kid.elbow.forEach((e, i) => { const s = i === 0 ? -1 : 1; e.rotation.set(-1.05, 0, -s * 0.5); });
  // Zeniba's hair tie: a band that glints
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.022, 8, 16), charToon({ color: 0x9a7ad8, emissive: 0x3a2a60, rim: 0.4 }));
  tie.position.set(0, 0.06, -0.3); kid.head.add(tie);
  // Boh as a mouse in her lap, and the little bird
  const mouse = new THREE.Group();
  const mouseFur = charToon({ map: sphereFur(0xb8b0a8, 19, { w: 128 }).texture(), emissive: 0x2a2826, rim: 0.4 });
  const mb = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mouseFur); mb.scale.set(0.12, 0.1, 0.15); mouse.add(mb);
  const mh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), mouseFur); mh.position.set(0, 0.06, 0.12); mouse.add(mh);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), charToon({ color: 0xe8b8c0, emissive: 0x2a1a1c, rim: 0.2 }));
    ear.scale.z = 0.4; ear.position.set(sx * 0.07, 0.14, 0.1); mouse.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), charToon({ color: 0x101012, rim: 0 }));
    eye.position.set(sx * 0.035, 0.08, 0.19); mouse.add(eye);
  }
  mouse.position.set(0.04, 0.76, 0.3);
  mouse.scale.setScalar(0.62);
  g.add(mouse);
  const bird = new THREE.Group();
  const bb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), charToon({ color: 0x2a2a2a, emissive: 0x0a0a0a, rim: 0.4 }));
  bird.add(bb);
  for (const sx of [-1, 1]) { const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), bb.material); wing.scale.set(0.06, 0.012, 0.03); wing.position.set(sx * 0.05, 0.01, 0); bird.add(wing); }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 6), glow(0xe0a040, 1)); beak.rotation.x = Math.PI / 2; beak.position.z = 0.05; bird.add(beak);
  bird.position.set(-0.26, 1.12, 0.08);
  g.add(bird);
  let lookT = -1;
  const ch: Chihiro = {
    group: g, lookTarget: null,
    look() { lookT = 0; },
    update(dt, t) {
      // she gazes out of the window, turning now and then; called, she looks round at you
      const gazing = new THREE.Vector3();
      let target: THREE.Vector3 | null = null;
      if (lookT >= 0) { lookT += dt; if (lookT > 3.2) lookT = -1; target = ch.lookTarget; }
      else {
        const side = Math.sin(t * 0.21) > 0 ? 1 : -1;
        g.updateWorldMatrix(true, false);
        gazing.set(side * 3, 1.5 + Math.sin(t * 0.13) * 0.4, 1.5).applyMatrix4(g.matrixWorld);
        target = gazing;
      }
      kid.tick(dt, t, target, 1);
      kid.group.position.y = SEAT + Math.sin(t * 2.2) * 0.006;
      bird.position.y = 1.12 + Math.sin(t * 6) * 0.03;
      bird.children.forEach((c, i) => { if (i === 1 || i === 2) c.rotation.z = Math.sin(t * 22) * 0.6 * (i === 1 ? 1 : -1); });
      mouse.rotation.y = Math.sin(t * 0.8) * 0.3;
    },
  };
  return ch;
}
