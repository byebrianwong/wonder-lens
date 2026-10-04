import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon } from '../../../engine/Paint';
import { envelope, outline, Spring } from '../../../engine/Rig';
import { canvasTexture } from '../../../engine/Builders';
import { clamp, Rng, TAU } from '../../../engine/math';
import { makeAdult, makeKid, HEAD_R, type Adult, type Kid } from '../people';
import { StopMotion } from '../stopmotion';
import { JP } from './paint';

/*
 * The people of Part Seven, as stop-motion puppets moving on twos: Atari Kobayashi, the boy pilot, in his
 * silver flight suit and leather flying cap, and the taiko drummers on their stage in the bay.
 */

const INK = 0x2a1e24;
const mats = new Map<string, THREE.Material>();
const mat = (key: string, make: () => THREE.Material) => { let m = mats.get(key); if (!m) { m = make(); mats.set(key, m); } return m; };

/** a quilted silver flight suit: soft sheen, seams and a zip */
function flightSuit() {
  return canvasTexture(256, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, '#9aa0a8'); gr.addColorStop(0.3, '#d6dade'); gr.addColorStop(0.5, '#eef0f2'); gr.addColorStop(0.7, '#c8ccd2'); gr.addColorStop(1, '#9aa0a8');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(80,86,96,0.45)'; g.lineWidth = 2;
    for (let y = 16; y < 256; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + 6); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1;
    for (let y = 18; y < 256; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + 6); g.stroke(); }
    // the zip down the front (cylinder and lathe UVs put the front at u = 0 / the left edge, sphere ones a quarter in)
    g.fillStyle = '#5a5e66'; g.fillRect(0, 0, 4, 256); g.fillRect(252, 0, 4, 256); g.fillRect(126, 0, 4, 256);
  });
}

export interface Atari {
  group: THREE.Group;
  kid: Kid;
  /** blow the dog whistle, then wave with both arms */
  whistle(): void;
  /** catch a thrown box overhead */
  catchBox(): void;
  bow(): void;
  update(dt: number, t: number, look: THREE.Vector3 | null): void;
}

/** Atari, about 12, in a silver flight suit and a leather flying cap with goggles, a dog whistle on a cord. */
export function makeAtariPuppet(): Atari {
  const kid = makeKid({
    hair: 0x141418, style: 'short', skin: 0xeccaa8, top: 0xd0d4da, sleeves: 'long', bottom: { kind: 'shorts', color: 0xc4c8ce },
    socks: 0xc4c8ce, shoes: 0x3a2a22, face: { mouth: 'small', blush: 0.25 }, seed: 701,
  });
  const silver = mat('suit', () => charToon({ map: flightSuit(), rim: 0.6, shade: 0x8890b0 }));
  // the suit covers the legs too
  kid.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.outline) return;
    let p: THREE.Object3D | null = m.parent;
    let inLeg = false;
    while (p) { if (kid.hip.includes(p as THREE.Group)) inLeg = true; p = p.parent; }
    if (inLeg && (m.geometry.type === 'LatheGeometry' || (m.material as THREE.MeshToonMaterial).color?.getHex() === new THREE.Color(0xeccaa8).getHex())) m.material = silver;
  });
  kid.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline && (m.material as THREE.MeshToonMaterial).map && kid.spine.children.includes(m)) m.material = silver; });
  for (const sh of kid.shoulder) sh.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline && m !== kid.hand[kid.shoulder.indexOf(sh)]) m.material = silver; });
  // flying cap: a leather dome with ear flaps, goggles pushed up on the brow
  const R = HEAD_R.kid;
  const leather = mat('leather', () => charToon({ color: 0x6a4228, rim: 0.4 }));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 22, 14, 0, TAU, 0, Math.PI * 0.55), leather);
  cap.position.y = R * 0.08; cap.rotation.x = -0.1;
  kid.head.add(cap);
  outline(cap, INK, 1.3, 0.014);
  for (const s of [-1, 1]) {
    const flap = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), leather);
    flap.scale.set(R * 0.14, R * 0.42, R * 0.32); flap.position.set(s * R * 1.0, -R * 0.25, -R * 0.05);
    kid.head.add(flap);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.22, R * 0.22, R * 0.12, 14), mat('goggle', () => new THREE.MeshPhongMaterial({ color: 0x7ab0c8, shininess: 120, specular: 0xffffff, emissive: 0x1a3040 })));
    lens.rotation.x = Math.PI / 2 - 0.6; lens.position.set(s * R * 0.3, R * 0.82, R * 0.62);
    kid.head.add(lens);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.22, R * 0.05, 6, 16), mat('brass', () => charToon({ color: 0xc8a050, rim: 0.4 })));
    rim.rotation.x = -0.6; rim.position.copy(lens.position); kid.head.add(rim);
  }
  const strap = new THREE.Mesh(new THREE.TorusGeometry(R * 1.08, R * 0.05, 6, 28), leather);
  strap.rotation.x = Math.PI / 2 - 0.55; strap.position.y = R * 0.55;
  kid.head.add(strap);
  // the dog whistle on a red cord
  const whistleObj = new THREE.Group();
  whistleObj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), mat('whistle', () => charToon({ color: 0xd8dce0, rim: 0.5 }))));
  whistleObj.children[0].rotation.z = Math.PI / 2;
  whistleObj.position.set(0, 0.48, 0.17);
  kid.spine.add(whistleObj);
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 4, 20), mat('cord', () => charToon({ color: 0xc8323c })));
  cord.rotation.x = Math.PI / 2 + 0.5; cord.position.set(0, 0.6, 0.06); kid.spine.add(cord);

  kid.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline) m.castShadow = true; });
  const group = new THREE.Group();
  group.add(kid.group);

  const sm = new StopMotion(12, 702);
  let whistleT = 99, catchT = 99, bowT = 99;
  const lean = new Spring(0, 1.2, 0.6);
  return {
    group, kid,
    whistle() { whistleT = 0; },
    catchBox() { catchT = 0; },
    bow() { bowT = 0; },
    update(dt, t, look) {
      whistleT += dt; catchT += dt; bowT += dt;
      kid.tick(dt, t, look, 0.9);
      if (!sm.tick(dt)) return;
      const st = sm.t;
      // idle: weight on one leg, a slow wave of the right arm now and then
      const waveIdle = envelope((st % 9), 2, 2.6, 5.2, 5.8);
      const blow = envelope(whistleT, 0, 0.3, 1.4, 1.7);
      const both = envelope(whistleT, 1.5, 1.8, 4.2, 4.8);
      const ctch = envelope(catchT, 0, 0.25, 2.2, 2.8);
      const bw = envelope(bowT, 0, 0.5, 1.5, 2.2);
      const wave = Math.sin(st * 9);
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1;
        let x = 0, z = s * 0.1, el = -0.15;
        // right hand (index 0) waves in idle
        if (i === 0) { x += -2.6 * waveIdle; z += s * (0.3 + wave * 0.25) * waveIdle; el += -0.4 * waveIdle; }
        // the whistle: right hand to the mouth
        if (i === 0) { x = x * (1 - blow) + -2.1 * blow; z = z * (1 - blow) + s * -0.35 * blow; el = el * (1 - blow) + -1.9 * blow; }
        // both arms up and waving
        x = x * (1 - both) - 2.8 * both; z = z * (1 - both) + s * (0.35 + wave * 0.3) * both; el = el * (1 - both) - 0.2 * both;
        // the catch: both hands up overhead
        x = x * (1 - ctch) - 2.9 * ctch; z = z * (1 - ctch) + s * 0.15 * ctch; el = el * (1 - ctch) - 0.35 * ctch;
        x = x * (1 - bw) + 0.25 * bw;
        kid.shoulder[i].rotation.set(x, 0, s * Math.abs(z) * Math.sign(z * s || 1));
        kid.elbow[i].rotation.set(el, 0, 0);
      }
      kid.spine.rotation.x = lean.update(0.5 * bw - 0.1 * ctch, 1 / 12);
      kid.pelvis.rotation.z = Math.sin(st * 0.4) * 0.03;
      kid.hip[0].rotation.z = -0.06; kid.hip[1].rotation.z = 0.06 + Math.sin(st * 0.4) * 0.03;
      kid.group.position.y = ctch > 0 ? Math.max(0, Math.sin(clamp(catchT / 0.6, 0, 1) * Math.PI)) * 0.25 : 0;
    },
  };
}

/**
 * Fewer draw calls: meshes that hang still on the same joint and share a material are merged into one mesh
 * on that joint (meshes with children, such as a hand holding a stick, are left alone).
 */
function mergeSiblings(root: THREE.Object3D) {
  const parents: THREE.Object3D[] = [];
  root.traverse((o) => parents.push(o));
  for (const parent of parents) {
    const buckets = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of parent.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || m.children.length || Array.isArray(m.material)) continue;
      const list = buckets.get(m.material as THREE.Material) ?? [];
      list.push(m); buckets.set(m.material as THREE.Material, list);
    }
    for (const [mm, list] of buckets) {
      if (list.length < 2) continue;
      const geos = list.map((m) => { m.updateMatrix(); const gg = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k); if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2)); return gg.applyMatrix4(m.matrix); });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const out = new THREE.Mesh(merged, mm);
      for (const m of list) parent.remove(m);
      parent.add(out);
    }
  }
}

// ---------------- taiko drummers ----------------
export interface Drummer {
  group: THREE.Group;
  /** strike now (all drummers together on the whistle) */
  unison(): void;
  update(dt: number, t: number, look: THREE.Vector3 | null): void;
}

/** a white happi coat with a red pattern of waves */
function happi() {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#f2ece0'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(184,48,42,0.85)'; g.lineWidth = 3;
    for (let y = 150; y < 256; y += 18) for (let x = -10; x < 270; x += 24) { g.beginPath(); g.arc(x, y, 10, Math.PI, TAU); g.stroke(); }
    g.fillStyle = '#b8302a'; g.fillRect(0, 0, 256, 10); g.fillRect(0, 244, 256, 12);
    // the collar band down the front
    g.fillStyle = '#1e2a4a'; g.fillRect(0, 0, 14, 256); g.fillRect(242, 0, 14, 256);
    g.fillStyle = '#f2ece0'; g.font = `bold 11px ${JP}`;
    for (let k = 0; k < 6; k++) g.fillText('祭', 2, 30 + k * 34);
  });
}

/**
 * A taiko drummer: a white happi coat and dark trousers, a red and white headband, a stick (bachi) in each
 * hand, behind a drum on a slanted stand. He drums in a steady rhythm; on the whistle all of them wind up and
 * strike together.
 */
export function makeDrummer(seed: number, drumR = 0.62): Drummer {
  const rng = new Rng(seed);
  const a: Adult = makeAdult({
    hair: 0x18161a, style: 'short', skin: 0xe2b896, top: 0xf2ece0, sleeves: 'short', bottom: { kind: 'trousers', color: 0x22283a }, shoes: 0x1a1a1a,
    face: { mouth: rng.chance(0.5) ? 'open' : 'small' }, seed,
  });
  const coat = mat('happi', () => charToon({ map: happi(), rim: 0.35 }));
  a.spine.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline && m.parent === a.spine && (m.material as THREE.MeshToonMaterial).map) m.material = coat; });
  // headband
  const band = new THREE.Mesh(new THREE.TorusGeometry(HEAD_R.adult * 1.02, HEAD_R.adult * 0.12, 6, 20), mat('hachimaki', () => charToon({ color: 0xc8302a, rim: 0.3 })));
  band.rotation.x = Math.PI / 2 - 0.1; band.position.y = HEAD_R.adult * 0.35;
  a.head.add(band);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R.adult * 0.2, 8, 6), band.material);
  knot.position.set(0, HEAD_R.adult * 0.35, -HEAD_R.adult * 1.05); a.head.add(knot);
  // sticks
  const wood = mat('bachi', () => charToon({ color: 0xd8b888, rim: 0.4 }));
  for (const h of a.hand) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.55, 6), wood);
    stick.position.set(0, -0.12, 0.2); stick.rotation.x = Math.PI / 2 - 0.3;
    h.add(stick);
  }
  // the drum: a barrel body on a slanted stand, its head towards the drummer
  const drum = new THREE.Group();
  const bodyM = mat('drumBody', () => charToon({ color: 0x7a3a22, rim: 0.3 }));
  const skin = mat('drumSkin', () => charToon({ color: 0xece0c4, rim: 0.2 }));
  const stud = mat('drumStud', () => charToon({ color: 0x2a2420, rim: 0.3 }));
  const barrel = new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => { const k = i / 8; return new THREE.Vector2(drumR * (0.9 + 0.12 * Math.sin(k * Math.PI)), (k - 0.5) * drumR * 1.5); }), 20);
  const body = new THREE.Mesh(barrel, bodyM);
  drum.add(body);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(drumR * 0.9, 20), skin);
    h.rotation.x = s * Math.PI / 2; h.position.y = s * drumR * 0.75; drum.add(h);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(drumR * 0.9, 0.03, 5, 24), stud);
    ring.rotation.x = Math.PI / 2; ring.position.y = s * drumR * 0.72; drum.add(ring);
  }
  drum.rotation.x = -0.9;
  drum.position.set(0, 1.0, 0.75);
  const stand = new THREE.Group();
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), stud);
    leg.position.set(s * drumR * 0.8, 0.5, 0.75); leg.rotation.x = 0.25; stand.add(leg);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), stud);
    back.position.set(s * drumR * 0.8, 0.45, 1.15); back.rotation.x = -0.4; stand.add(back);
  }
  const g = new THREE.Group();
  g.add(a.group, drum, stand);
  for (const o of [drum, stand]) o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.userData.static = true; } });
  // merge each static drum into one mesh per material
  for (const o of [drum, stand]) {
    o.updateMatrixWorld(true);
    const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
    o.traverse((c) => { const m = c as THREE.Mesh; if (!m.isMesh) return; const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(new THREE.Matrix4().copy(o.matrixWorld).invert().multiply(m.matrixWorld)); for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k); const l = by.get(m.material as THREE.Material) ?? []; l.push(geo); by.set(m.material as THREE.Material, l); });
    o.clear();
    for (const [mm, geos] of by) { const out = new THREE.Mesh(mergeGeometries(geos, false)!, mm); out.castShadow = true; o.add(out); }
  }
  // fewer draw calls: the drummers are seen from afar, so they go without ink lines
  const outlines: THREE.Object3D[] = [];
  a.group.traverse((o) => { if (o.userData.outline) outlines.push(o); });
  for (const o of outlines) o.removeFromParent();
  mergeSiblings(a.group);
  a.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });

  const sm = new StopMotion(12, seed);
  const phase = rng.range(0, 1);
  let unisonT = 99;
  const hit = new Spring(0, 2, 0.5);
  return {
    group: g,
    unison() { unisonT = 0; },
    update(dt, t, look) {
      unisonT += dt;
      a.tick(dt, t, look, 0.4);
      if (!sm.tick(dt)) return;
      const st = sm.t;
      // a steady don-don-doko: alternate arms, two beats a second
      const beat = (st * 2 + phase * 0.25) % 1;
      const u = envelope(unisonT, 0, 0.6, 1.2, 1.5);
      const strike = unisonT < 1.5 ? 1 : 0;
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1;
        const myBeat = (beat + i * 0.5) % 1;
        // raise and strike: up quickly, down hard
        const up = myBeat < 0.6 ? Math.sin((myBeat / 0.6) * Math.PI) : 0;
        let x = -0.9 - up * 1.4, el = -0.6 - up * 0.5;
        // unison: both sticks high over the head, held, then a great blow together
        const wind = clamp(unisonT / 0.9, 0, 1), down = unisonT > 0.9 ? clamp((unisonT - 0.9) / 0.15, 0, 1) : 0;
        if (strike) { x = (-0.9 - 2.4 * wind) * (1 - down) + -0.7 * down; el = (-0.6 - 0.6 * wind) * (1 - down) + -0.5 * down; }
        a.shoulder[i].rotation.set(x, 0, s * (0.35 + 0.15 * u));
        a.elbow[i].rotation.set(el, 0, 0);
      }
      a.spine.rotation.x = 0.12 + hit.update(strike && unisonT > 0.9 ? 0.3 : 0, 1 / 12);
      for (let i = 0; i < 2; i++) { a.hip[i].rotation.z = (i ? 1 : -1) * 0.22; a.knee[i].rotation.x = 0.2; }
      a.pelvis.position.y = 0.96 - 0.04;
    },
  };
}
