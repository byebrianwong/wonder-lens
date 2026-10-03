import * as THREE from 'three';
import { glow } from '../../engine/Builders';
import { charToon } from '../../engine/Paint';
import { sculpt, profileShape, limbGeometry, Rig, band, Spring, envelope, easeOutBack, outline } from '../../engine/Rig';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, Rng, smoothstep, TAU } from '../../engine/math';
import { noFaceMask, noFaceBody, kodamaFace, ponyoBody, finTexture, radishSkin, lacquer, grinTexture } from './characterTextures';
import { type Character, surfaceAt, polarAtHeight, alignTo, surfaceMouth } from './character';

// ---------------- No-Face ----------------
export interface NoFace extends Character {
  /** hold out both hands with gold in them (4 s) */
  offer(): void;
  /** a huge mouth opens in his body and gulps (1.6 s) */
  gulp(): void;
}

export function makeNoFace(): NoFace {
  const g = new THREE.Group();
  const ink = 0x050508;
  // tall and soft-shouldered, widening to a robe that trails on the floor
  const shape = profileShape([[4.6, 0], [4.5, 0.42], [4.2, 0.68], [3.7, 0.76], [3.0, 0.78], [2.2, 0.86], [1.4, 1.0], [0.6, 1.16], [0.12, 1.28], [0.0, 0]], { depth: 0.8 });
  const pY = (y: number) => polarAtHeight(shape, y);
  const rig = new Rig(g, [
    { name: 'root', at: [0, 0, 0] },
    { name: 'low', parent: 'root', at: [0, 1.0, 0] },
    { name: 'mid', parent: 'low', at: [0, 2.3, 0] },
    { name: 'top', parent: 'mid', at: [0, 3.5, 0] },
  ]);
  const B = rig.bones;
  const weights = (p: THREE.Vector3) => {
    const top = band(p.y, 3.0, 3.9), low = 1 - band(p.y, 0.8, 2.2);
    return { root: Math.max(0, 1 - band(p.y, 0.0, 0.9)) * 0.7, low, mid: Math.max(0, 1 - low - top), top };
  };
  const bodyMat = charToon({ map: noFaceBody(), transparent: true, opacity: 0.94, emissive: 0x0a0c18, rim: 0.65, shade: 0x9aa0cc });
  const body = rig.skin(sculpt(shape, 48, 40), bodyMat, weights);
  outline(body, ink, 1.4, 0.04);
  const onBone = (bone: string, obj: THREE.Object3D, at: THREE.Vector3) => {
    obj.position.copy(at).sub(new THREE.Vector3().setFromMatrixPosition(B[bone].matrixWorld));
    B[bone].add(obj);
    return obj;
  };
  // the mask: gently curved so it catches the light, standing just off the face
  const maskGeo = new THREE.PlaneGeometry(1.15, 1.45, 16, 20);
  const mp = maskGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), y = mp.getY(i); mp.setZ(i, -x * x * 0.45 - y * y * 0.06); }
  maskGeo.computeVertexNormals();
  const maskTex = noFaceMask();
  // a little self-light keeps the mask pale on the night sea, like the film
  const mask = new THREE.Mesh(maskGeo, charToon({ map: maskTex, color: 0xd4d4d4, emissive: 0x303038, emissiveMap: maskTex, alphaTest: 0.5, rim: 0.1, shade: 0xb0b4d0 }));
  const face = surfaceAt(shape, 0, pY(3.6));
  onBone('top', mask, face.p.clone().add(new THREE.Vector3(0, 0, 0.12)));
  // the big mouth in his front, under the mask
  const mouth = surfaceMouth({ shape, rig, weights, top: pY(2.95), drop: pY(1.9) - pY(2.95), halfWidth: 0.95, tex: grinTexture(), lift: 0.03, curl: 0.03 });
  let mouthOpen = -1;
  // thin dark arms with pale little hands; gold appears in the hands when he offers it
  const armMat = charToon({ color: 0x15161e, rim: 0.6, shade: 0x9aa0cc });
  const handMat = charToon({ color: 0x2a2a34, rim: 0.5 });
  const goldMat = glow(0xffc93a, 1.7);
  const arms: Array<{ sh: THREE.Group; el: THREE.Group; gold: THREE.Group }> = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.add(new THREE.Mesh(limbGeometry(0.1, 0.08, 0.75, 10, 4), armMat));
    const el = new THREE.Group(); el.position.y = -0.75; sh.add(el);
    el.add(new THREE.Mesh(limbGeometry(0.08, 0.07, 0.7, 10, 4), armMat));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), handMat);
    hand.scale.set(0.11, 0.07, 0.15); hand.position.set(0, -0.74, 0.04);
    el.add(hand);
    const gold = new THREE.Group();
    const gr = new Rng(40 + s);
    for (let i = 0; i < 5; i++) {
      const nug = new THREE.Mesh(new THREE.IcosahedronGeometry(gr.range(0.07, 0.11), 0), goldMat);
      nug.position.set(gr.range(-0.08, 0.08), gr.range(0.0, 0.12), gr.range(-0.06, 0.08));
      nug.rotation.set(gr.range(0, 3), gr.range(0, 3), 0);
      gold.add(nug);
    }
    gold.position.set(0, -0.68, 0.12);
    gold.visible = false;
    el.add(gold);
    sh.rotation.z = s * 0.12;
    onBone('mid', sh, new THREE.Vector3(s * 0.74, 3.3, 0.05));
    arms.push({ sh, el, gold });
  }
  const sp = { offer: new Spring(0, 1.6, 0.8), gulp: new Spring(0, 4, 0.55), lean: new Spring(0, 2, 0.6) };
  let offerT = -1, gulpT = -1;
  const ch: NoFace = {
    group: g,
    offer() { offerT = 0; },
    gulp() { gulpT = 0; },
    update(dt, t) {
      // a slow, swaying stand, as if he drifts rather than stands
      B.low.rotation.z = Math.sin(t * 0.7) * 0.025;
      B.mid.rotation.z = -Math.sin(t * 0.7 - 0.6) * 0.035;
      B.top.rotation.z = Math.sin(t * 0.7 - 1.2) * 0.04;
      B.mid.scale.setScalar(1 + Math.sin(t * 0.9) * 0.01);
      let off = 0, gulp = 0;
      if (offerT >= 0) { offerT += dt; off = envelope(offerT, 0, 0.7, 3.3, 4.0); if (offerT > 4) offerT = -1; }
      if (gulpT >= 0) { gulpT += dt; gulp = envelope(gulpT, 0.05, 0.35, 0.95, 1.5); if (gulpT > 1.6) gulpT = -1; }
      const o = sp.offer.update(off, dt);
      arms.forEach((a, i) => {
        const s = i === 0 ? -1 : 1;
        // hands come forward, palms up, a little shaky with eagerness
        a.sh.rotation.set(lerp(0, -1.0, o), 0, s * lerp(0.12, 0.25, o));
        a.el.rotation.set(lerp(0, -0.55, o) + Math.sin(t * 9 + i) * 0.03 * o, 0, 0);
        a.gold.visible = o > 0.55;
        a.gold.rotation.y += dt * 0.6;
      });
      B.top.rotation.x = sp.lean.update(o * 0.12 - gulp * 0.25, dt);
      const m = clamp(sp.gulp.update(gulp > 0 ? easeOutBack(gulp, 1.4) : 0, dt), 0, 1.15);
      mouth.mesh.visible = m > 0.02;
      if (mouth.mesh.visible && Math.abs(m - mouthOpen) > 0.004) { mouth.set(m); mouthOpen = m; }
      // the body swells a little as it swallows
      B.low.scale.set(1 + m * 0.06, 1, 1 + m * 0.08);
    },
  };
  return ch;
}

// ---------------- Radish Spirit ----------------
export interface RadishSpirit extends Character { bow(): void }

export function makeRadishSpirit(): RadishSpirit {
  const g = new THREE.Group();
  const ink = 0x3a3428;
  // a huge white radish: a round body that narrows up into the head
  const shape = profileShape([[4.35, 0], [4.25, 0.55], [3.95, 0.86], [3.35, 1.02], [2.5, 1.22], [1.5, 1.34], [0.7, 1.18], [0.18, 0.7], [0.0, 0]], { depth: 0.9 });
  const pY = (y: number) => polarAtHeight(shape, y);
  const rig = new Rig(g, [
    { name: 'root', at: [0, 0, 0] },
    { name: 'waist', parent: 'root', at: [0, 1.2, 0] },
    { name: 'chest', parent: 'waist', at: [0, 2.6, 0] },
  ]);
  const B = rig.bones;
  const weights = (p: THREE.Vector3) => { const chest = band(p.y, 1.8, 3.0); return { waist: 1 - chest, chest }; };
  const white = charToon({ map: radishSkin(), emissive: 0x2c3040, rim: 0.5 });
  const body = rig.skin(sculpt(shape, 48, 36), white, weights);
  outline(body, ink, 1.4, 0.04);
  const onBone = (bone: string, obj: THREE.Object3D, at: THREE.Vector3) => {
    obj.position.copy(at).sub(new THREE.Vector3().setFromMatrixPosition(B[bone].matrixWorld));
    B[bone].add(obj);
    return obj;
  };
  const red = charToon({ map: lacquer(0xc23c2e), emissive: 0x3a0e0a, rim: 0.4 });
  // a red lacquer bowl worn upside down as a hat, with leaves sprouting through it
  const hat = new THREE.Mesh(new THREE.SphereGeometry(1.0, 28, 12, 0, TAU, 0, Math.PI / 2), red);
  hat.scale.set(1, 0.6, 1);
  onBone('chest', hat, new THREE.Vector3(0, 3.95, 0));
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.12, 20), red);
  onBone('chest', foot, new THREE.Vector3(0, 4.58, 0));
  outline(hat, ink, 1.3, 0.035);
  const leafMat = charToon({ color: 0x5e9a3e, emissive: 0x10200a, rim: 0.3, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), leafMat);
    leaf.scale.set(0.16, 0.5, 0.05); leaf.rotation.set(0, (i / 3) * TAU, (i - 1) * 0.4);
    onBone('chest', leaf, new THREE.Vector3(Math.sin(i) * 0.1, 4.95, Math.cos(i) * 0.1));
  }
  // small dark eyes, pink cheeks and a tiny mouth on the front of the head
  const dark = charToon({ color: 0x222226, rim: 0 });
  const cheek = charToon({ color: 0xe08c8c, emissive: 0x2a1010, rim: 0 });
  for (const s of [-1, 1]) {
    const e = surfaceAt(shape, s * 0.3, pY(3.5));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), dark);
    eye.scale.z = 0.5; alignTo(eye, e.n);
    onBone('chest', eye, e.p.clone().addScaledVector(e.n, 0.01));
    const c = surfaceAt(shape, s * 0.5, pY(3.2));
    const ck = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), cheek);
    ck.scale.set(0.17, 0.1, 0.03); alignTo(ck, c.n);
    onBone('chest', ck, c.p.clone().addScaledVector(c.n, 0.005));
  }
  {
    const m = surfaceAt(shape, 0, pY(3.2));
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), dark);
    mouth.scale.set(0.11, 0.05, 0.03); alignTo(mouth, m.n);
    onBone('chest', mouth, m.p.clone().addScaledVector(m.n, 0.01));
  }
  // a red apron tied at the waist
  const apronGeo = new THREE.CylinderGeometry(1.36, 1.42, 0.9, 32, 1, true, -1.2, 2.4);
  const apron = new THREE.Mesh(apronGeo, charToon({ map: lacquer(0xb83a2e), emissive: 0x2a0a08, rim: 0.3, side: THREE.DoubleSide }));
  onBone('waist', apron, new THREE.Vector3(0, 1.45, 0));
  // stubby arms, one holding a little red bowl; two short root legs
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.add(new THREE.Mesh(limbGeometry(0.26, 0.2, 0.6, 12, 4), white));
    sh.rotation.z = s * 0.7;
    onBone('chest', sh, new THREE.Vector3(s * 1.1, 2.55, 0.1));
    arms.push(sh);
  }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.16, 16), red);
  bowl.position.set(0, -0.78, 0.12);
  arms[1].add(bowl);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(limbGeometry(0.2, 0.16, 0.32, 10, 3), white);
    onBone('waist', leg, new THREE.Vector3(s * 0.45, 0.28, 0.1));
  }
  const sp = { bow: new Spring(0, 1.3, 0.75) };
  let bowT = -1;
  const ch: RadishSpirit = {
    group: g,
    bow() { bowT = 0; },
    update(dt, t) {
      let b = 0;
      if (bowT >= 0) { bowT += dt; b = envelope(bowT, 0, 0.7, 1.4, 2.2); if (bowT > 2.4) bowT = -1; }
      const k = sp.bow.update(b, dt);
      // bows from the waist, head and shoulders folding forward, arms coming together
      B.waist.rotation.x = 0.18 * k;
      B.chest.rotation.x = 0.32 * k;
      B.chest.scale.setScalar(1 + Math.sin(t * 1.1) * 0.01);
      arms.forEach((a, i) => { const s = i === 0 ? -1 : 1; a.rotation.set(-0.5 * k, 0, s * lerp(0.7, 0.35, k)); });
    },
  };
  return ch;
}

// ---------------- Kodama ----------------
export interface Kodama extends Character { rattle(): void }

export function makeKodama(count: number, rng: Rng, area = 6): Kodama {
  const g = new THREE.Group();
  const bodyMat = charToon({ color: 0xeaede6, emissive: 0x2a3538, rim: 0.8, shade: 0xa8b4c0 });
  // a few lumpy head shapes and faces, shared between all the kodama
  const faces = [0, 1, 2, 3].map((v) => charToon({ map: kodamaFace(v), emissive: 0x2a3538, rim: 0.8, shade: 0xa8b4c0 }));
  const headGeos = [0, 1, 2].map((v) => {
    const geo = new THREE.SphereGeometry(1, 24, 16);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const hr = new Rng(300 + v);
    const bumps = Array.from({ length: 4 }, () => ({ d: new THREE.Vector3(hr.range(-1, 1), hr.range(0, 1), hr.range(-1, 0.3)).normalize(), k: hr.range(0.06, 0.14) }));
    const q = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      q.fromBufferAttribute(pos, i);
      let r = 1 + (q.y > 0 ? q.y * 0.12 : 0); // a little fuller at the crown
      for (const b of bumps) r += b.k * Math.max(0, q.dot(b.d)) ** 3;
      pos.setXYZ(i, q.x * r, q.y * r, q.z * r);
    }
    geo.computeVertexNormals();
    return geo;
  });
  // the body, stubby arms and legs as one shape: a soft little figure
  const bodyGeo = mergeGeometries([
    new THREE.LatheGeometry([new THREE.Vector2(0.001, 0.12), new THREE.Vector2(0.17, 0.16), new THREE.Vector2(0.2, 0.35), new THREE.Vector2(0.15, 0.62), new THREE.Vector2(0.06, 0.72), new THREE.Vector2(0.001, 0.73)], 14),
    ...[-1, 1].map((s) => limbGeometry(0.05, 0.035, 0.26, 8, 2).rotateZ(s * 0.7).translate(s * 0.17, 0.55, 0.02)),
    ...[-1, 1].map((s) => limbGeometry(0.06, 0.05, 0.16, 8, 2).translate(s * 0.08, 0.17, 0)),
  ].map((geo) => { geo.deleteAttribute('uv'); return geo.index ? geo.toNonIndexed() : geo; }))!;
  const heads: { h: THREE.Group; base: number; phase: number }[] = [];
  for (let i = 0; i < count; i++) {
    const k = new THREE.Group();
    const s = rng.range(0.7, 1.25);
    const b = new THREE.Mesh(bodyGeo, bodyMat);
    b.scale.setScalar(s);
    k.add(b);
    // the head sits on a neck joint, so it rattles from the neck
    const neck = new THREE.Group(); neck.position.y = 0.7 * s; k.add(neck);
    const h = new THREE.Mesh(headGeos[i % 3], faces[i % 4]);
    h.scale.set(0.27 * s, 0.3 * s, 0.27 * s); h.position.y = 0.24 * s;
    neck.add(h);
    k.position.set(rng.range(-area, area), 0, rng.range(-area * 0.5, area * 0.5));
    k.rotation.y = rng.range(-0.6, 0.6);
    g.add(k);
    heads.push({ h: neck, base: rng.range(-0.3, 0.3), phase: rng.range(0, 10) });
  }
  let rattleT = 0;
  const ch: Kodama = {
    group: g,
    rattle() { rattleT = 2.5; },
    update(dt, t) {
      if (rattleT > 0) rattleT -= dt;
      for (const { h, base, phase } of heads) {
        if (rattleT > 0) {
          // a quick clicking spin of the head, each one a little out of step
          const k = Math.min(1, rattleT) * (0.6 + 0.4 * Math.sin(phase));
          h.rotation.z = Math.sin(t * 38 + phase) * 0.35 * k;
          h.rotation.y = Math.sign(Math.sin(t * 9 + phase)) * 0.5 * k;
        } else {
          h.rotation.z = lerp(h.rotation.z, base + Math.sin(t * 0.5 + phase) * 0.15, 1 - Math.exp(-3 * dt));
          h.rotation.y = lerp(h.rotation.y, Math.sin(t * 0.31 + phase) * 0.3, 1 - Math.exp(-3 * dt));
        }
      }
    },
  };
  return ch;
}

// ---------------- Ponyo's sisters (fish school) ----------------
export interface PonyoSchool extends Character {
  leap(): void;
  /** 0 = under the water, 1 = racing along the surface */
  surface: number;
}

export function makePonyoSchool(count: number, rng: Rng): PonyoSchool {
  const g = new THREE.Group();
  g.rotation.y = Math.PI; // the school runs in the -z direction, faces first
  const bodyMat = charToon({ map: ponyoBody(), emissive: 0x6a2010, rim: 0.5 });
  const finMat = charToon({ map: finTexture(0xe6553f), emissive: 0x6a2010, rim: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  // a round-headed little fish body that tapers to the tail, and a fan-shaped tail fin
  // the face is painted at the sphere's +z, so the shape is sculpted facing +z: round at the head, tapering to the tail
  const bodyGeo = sculpt((d, out) => {
    const tailward = smoothstep(0.1, -1, d.z);
    const taper = 1 - 0.62 * tailward * tailward;
    out.set(d.x * 0.36 * taper, d.y * 0.33 * taper + 0.03 * tailward, d.z * (d.z > 0 ? 0.42 : 0.66));
  }, 28, 18);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0); tailShape.quadraticCurveTo(0.28, -0.2, 0.34, -0.42); tailShape.quadraticCurveTo(0.1, -0.32, 0, -0.38); tailShape.quadraticCurveTo(-0.1, -0.32, -0.34, -0.42); tailShape.quadraticCurveTo(-0.28, -0.2, 0, 0);
  const tailGeo = new THREE.ShapeGeometry(tailShape, 8).rotateX(-Math.PI / 2);
  const finGeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.22, -0.08), new THREE.Vector2(0.18, 0.06)]), 2);
  const fish: { g: THREE.Group; tail: THREE.Group; fins: THREE.Mesh[]; phase: number; lane: number; s: number }[] = [];
  for (let i = 0; i < count; i++) {
    const f = new THREE.Group();
    const s = rng.range(0.6, 1.0);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.setScalar(s);
    f.add(body);
    const tail = new THREE.Group(); tail.position.z = -0.6 * s;
    const tm = new THREE.Mesh(tailGeo, finMat); tm.scale.setScalar(s * 1.6); tail.add(tm);
    f.add(tail);
    const fins: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.scale.set(sx * s, s, s); fin.position.set(sx * 0.28 * s, -0.08 * s, 0.05 * s); fin.rotation.y = sx * 0.4;
      f.add(fin); fins.push(fin);
    }
    f.position.set(rng.range(-4, 4), 0, rng.range(-6, 6));
    g.add(f);
    fish.push({ g: f, tail, fins, phase: rng.range(0, 10), lane: f.position.x, s });
  }
  let leapT = -1;
  const ch: PonyoSchool = {
    group: g, surface: 1,
    leap() { if (leapT < 0 || leapT > 1.0) leapT = 0; },
    update(dt, t) {
      if (leapT >= 0) { leapT += dt; if (leapT > 1.8) leapT = -1; }
      for (const f of fish) {
        // each fish leaps in turn, front ones first, along a smooth arc, nose following the arc
        const delay = (f.phase % 1) * 0.35;
        const k = leapT >= 0 ? clamp((leapT - delay) / 1.2, 0, 1) : 0;
        const leap = Math.sin(k * Math.PI) * 2.0 * (0.7 + (f.phase % 0.3));
        const slope = Math.cos(k * Math.PI) * (k > 0 && k < 1 ? 1 : 0);
        // racing along the surface: little hops from wave to wave
        const run = Math.abs(Math.sin(t * 6 + f.phase)) * 0.3;
        const under = (1 - ch.surface) * 1.4;
        f.g.position.y = 0.3 + run + leap - under;
        f.g.position.x = f.lane + Math.sin(t * 1.5 + f.phase) * 0.6;
        f.g.rotation.x = -Math.cos(t * 6 + f.phase) * 0.25 * (1 - k) - slope * 0.8;
        f.g.rotation.z = Math.sin(t * 3 + f.phase) * 0.12;
        f.tail.rotation.y = Math.sin(t * 14 + f.phase) * 0.45;
        f.fins.forEach((fin, i) => { fin.rotation.z = (i ? -1 : 1) * Math.sin(t * 10 + f.phase) * 0.4; });
      }
    },
  };
  return ch;
}
