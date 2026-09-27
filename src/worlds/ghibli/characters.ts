import * as THREE from 'three';
import { glow, sphere, ellipsoid, cyl, cone, capsule, box, canvasTexture, mesh, mergeStatic } from '../../engine/Builders';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp, Rng, TAU } from '../../engine/math';
import { charToon, repeatUV, boxUV } from '../../engine/Paint';
import { fluffyTree } from '../../engine/Foliage';
import { sphereFur, totoroFur, totoroBelly, umbrellaCloth, burlap, leafTexture, catbusBody, catbusHead, catbusEye, catbusBands, catbusEar, noFaceMask, noFaceBody, hakuScales, hakuMane, tealTuft, faceTexture, hairTexture, fabric, woodGrain, strawTexture, bowCloth, kodamaFace, ponyoBody, finTexture, radishSkin, lacquer, lampGlass, ironTexture, stoneWall, rockStrata, metalPlates, gullWing, airshipHull, shadowFade } from './characterTextures';

/** Characters face +z in local space. */
export interface Character {
  group: THREE.Group;
  update(dt: number, t: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------- Totoro (all three sizes) ----------------
export interface TotoroOpts { color?: number; belly?: number; scale?: number; chevrons?: boolean; leaf?: boolean; umbrella?: boolean; bag?: boolean }
export function makeTotoro(o: TotoroOpts = {}) {
  const scale = o.scale ?? 1;
  const g = new THREE.Group();
  const furColor = o.color ?? 0x8b9098;
  const big = scale > 0.8;
  const seed = Math.round(furColor / 97);
  // eye positions on the head's unit sphere, so the head texture can paint a dark rim around each eye
  const eyeDirs: Array<[number, number, number]> = [[-0.417, 0.204, 0.808], [0.417, 0.204, 0.808]];
  const fur = charToon({ map: sphereFur(furColor, seed, { w: big ? 1024 : 512 }).texture() });
  const headFur = charToon({ map: totoroFur(furColor, seed + 1, eyeDirs, big ? 1024 : 512) });
  const dark = charToon({ color: 0x23252c, rim: 0.15 });
  const white = charToon({ color: 0xf6f3ea, rim: 0.2 });
  const body = ellipsoid(1.55, 1.9, 1.4, fur, 0, 1.9, 0, 32, 24);
  const head = ellipsoid(1.32, 1.08, 1.2, headFur, 0, 3.5, 0.05, 32, 24);
  g.add(body, head);
  if (o.belly !== -1) {
    const bellyMat = charToon({ map: totoroBelly(o.belly ?? 0xeae5d6, furColor, o.chevrons !== false, seed + 2, big ? 1024 : 512) });
    const belly = ellipsoid(1.12, 1.35, 0.72, bellyMat, 0, 1.7, 0.85, 32, 24);
    g.add(belly);
  }
  // ears
  for (const s of [-1, 1]) {
    const ear = capsule(0.2, 0.7, fur, s * 0.62, 4.75, -0.05);
    ear.rotation.z = -s * 0.22;
    g.add(ear);
  }
  // eyes
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = sphere(0.24, white, s * 0.55, 3.72, 1.02, 18, 12);
    const p = sphere(0.1, dark, s * 0.55, 3.74, 1.23);
    g.add(e, p); eyes.push(e, p);
  }
  const nose = ellipsoid(0.16, 0.11, 0.12, dark, 0, 3.42, 1.22);
  g.add(nose);
  // whiskers
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const w = cyl(0.015, 0.015, 1.3, dark, s * 1.15, 3.45 - i * 0.08, 0.9);
    w.rotation.z = Math.PI / 2 + s * (0.15 + i * 0.12) * -1;
    w.rotation.y = s * 0.35;
    g.add(w);
  }
  const mouth = ellipsoid(0.85, 0.5, 0.35, charToon({ color: 0x3a1c24, rim: 0 }), 0, 3.05, 1.05);
  mouth.scale.setScalar(0.001);
  g.add(mouth);
  const teeth = box(1.3, 0.12, 0.1, white, 0, 3.3, 1.25); teeth.visible = false; g.add(teeth);
  // arms
  const arms: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const a = capsule(0.36, 0.95, fur, s * 1.55, 2.35, 0.25);
    a.rotation.z = s * 0.55; a.rotation.x = -0.2;
    g.add(a); arms.push(a);
  }
  // feet with claws
  for (const s of [-1, 1]) {
    const f = ellipsoid(0.62, 0.32, 0.8, fur, s * 0.72, 0.28, 0.35);
    g.add(f);
    for (let i = -1; i <= 1; i++) { const claw = cone(0.07, 0.2, white, s * 0.72 + i * 0.25, 0.22, 1.15); claw.rotation.x = Math.PI / 2; g.add(claw); }
  }
  if (o.leaf) {
    const leaf = mesh(new THREE.PlaneGeometry(0.8, 1.1), charToon({ map: leafTexture(0x5c9a45), side: THREE.DoubleSide, alphaTest: 0.5, rim: 0.1 }), 0.15, 4.62, 0.1);
    leaf.rotation.x = -Math.PI / 2 + 0.25;
    g.add(leaf);
  }
  let umbrella: THREE.Group | null = null;
  if (o.umbrella) {
    umbrella = new THREE.Group();
    const canopy = cone(2.3, 0.85, charToon({ map: umbrellaCloth(0x2e2830), side: THREE.DoubleSide, rim: 0.2 }), 0, 0.42, 0, 16);
    const stick = cyl(0.04, 0.04, 3.0, charToon({ color: 0x2a2420, rim: 0.1 }), 0, -1.4, 0);
    const tip = cyl(0.03, 0.05, 0.4, charToon({ color: 0x2a2420, rim: 0.1 }), 0, 1.05, 0);
    umbrella.add(canopy, stick, tip);
    umbrella.position.set(1.4, 5.7, 0.3);
    umbrella.rotation.z = 0.25;
    g.add(umbrella);
  }
  if (o.bag) {
    const bag = ellipsoid(0.55, 0.7, 0.4, charToon({ map: burlap(0xd8c39a, 9) }), 0, 2.4, -1.2);
    g.add(bag);
  }
  g.scale.setScalar(scale);
  // animation state
  let blink = 3, blinkT = 0, roarT = 0, jumpT = 0, breathe = 0;
  const baseY = 0;
  const ch: Character & { roar(): void; jump(): void } = {
    group: g,
    roar() { roarT = 1.6; },
    jump() { jumpT = 1.0; },
    update(dt, t) {
      breathe = Math.sin(t * 1.4) * 0.018;
      body.scale.set(1.55 * (1 - breathe * 0.6), 1.9 * (1 + breathe), 1.4 * (1 - breathe * 0.6));
      blink -= dt;
      if (blink <= 0) { blink = 2.5 + Math.random() * 3.5; blinkT = 0.16; }
      if (blinkT > 0) { blinkT -= dt; const s = blinkT > 0.08 ? 0.1 : 1; eyes.forEach((e, i) => e.scale.y = i % 2 === 0 ? s : s); }
      else eyes.forEach((e) => e.scale.y = 1);
      // roar: mouth opens, head back, body inflates
      if (roarT > 0) {
        roarT -= dt;
        const p = 1 - roarT / 1.6;
        const open = Math.sin(clamp(p * 1.25, 0, 1) * Math.PI);
        mouth.scale.set(1 * open + 0.001, 1 * open + 0.001, 1 * open + 0.001);
        teeth.visible = open > 0.4;
        head.rotation.x = -0.35 * open;
        head.position.y = 3.5 + 0.25 * open;
        g.scale.setScalar(scale * (1 + 0.08 * open));
        arms.forEach((a, i) => { a.rotation.z = (i === 0 ? -1 : 1) * (0.55 + 1.6 * open); });
      } else {
        mouth.scale.setScalar(0.001); teeth.visible = false;
        head.rotation.x = damp(head.rotation.x, Math.sin(t * 0.6) * 0.04, 4, dt);
        head.position.y = damp(head.position.y, 3.5, 4, dt);
        g.scale.setScalar(damp(g.scale.x, scale, 6, dt));
        arms.forEach((a, i) => { a.rotation.z = damp(a.rotation.z, (i === 0 ? -1 : 1) * 0.55, 6, dt); });
      }
      if (jumpT > 0) {
        jumpT -= dt;
        const p = 1 - jumpT;
        const h = Math.sin(clamp(p, 0, 1) * Math.PI) * 2.2;
        g.position.y = baseY + h;
        const squash = p < 0.12 ? 1 - p * 2 : p > 0.9 ? 1 - (1 - p) * 2 : 1;
        body.scale.y *= squash;
      } else g.position.y = damp(g.position.y, baseY, 10, dt);
      if (umbrella) umbrella.rotation.x = Math.sin(t * 0.8) * 0.05;
    },
  };
  return ch;
}

// ---------------- Catbus ----------------
export function makeCatbus() {
  const g = new THREE.Group();
  // window openings along both sides; they glow from the fur-lined cabin inside
  const windows: Array<{ z: number; side: number; up: number }> = [];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) windows.push({ z: i * 1.45 - 2.2, side, up: 0.38 });
  const bodyTex = catbusBody(windows);
  const bodyMat = charToon({ map: bodyTex.map, emissive: 0xffe0a8, emissiveMap: bodyTex.glow, emissiveIntensity: 1.5 });
  const body = mesh(new THREE.CapsuleGeometry(1.35, 6.0, 10, 32), bodyMat, 0, 2.0, 0);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  // head
  const head = ellipsoid(1.55, 1.4, 1.4, charToon({ map: catbusHead() }), 0, 2.15, 3.55, 32, 24);
  g.add(head);
  const earMat = charToon({ map: catbusEar() });
  for (const s of [-1, 1]) {
    const ear = cone(0.5, 0.9, earMat, s * 0.85, 3.5, 3.4, 16);
    ear.rotation.z = -s * 0.3;
    g.add(ear);
  }
  const eyeMat = new THREE.MeshBasicMaterial({ map: catbusEye(), color: new THREE.Color(1.5, 1.5, 1.5) });
  for (const s of [-1, 1]) g.add(ellipsoid(0.5, 0.42, 0.25, eyeMat, s * 0.7, 2.5, 4.85));
  const whiskerMat = charToon({ color: 0x3a2a20, rim: 0 });
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const w = cyl(0.02, 0.02, 1.6, whiskerMat, s * 1.7, 1.9 - i * 0.12, 4.5);
    w.rotation.z = Math.PI / 2 - s * (0.1 + i * 0.15); g.add(w);
  }
  // destination board on top
  const sign = box(1.4, 0.45, 0.5, charToon({ color: 0x4a3526, rim: 0.1 }), 0, 3.55, 2.2);
  g.add(sign);
  const signTex = canvasTexture(256, 96, (c, w, h) => {
    c.fillStyle = '#f4efe4'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8a6a4a'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = '#1f2a4a'; c.font = 'bold 60px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('めい', w / 2, h / 2 + 4);
  });
  g.add(mesh(new THREE.PlaneGeometry(1.3, 0.4), new THREE.MeshBasicMaterial({ map: signTex, color: new THREE.Color(1.15, 1.12, 1.05) }), 0, 3.55, 2.46));
  // legs
  const legs: THREE.Mesh[] = [];
  const legMat = charToon({ map: catbusBands(5, 3) });
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const l = capsule(0.13, 1.1, legMat, s * 1.0, 0.75, i * 1.1 - 2.6);
    g.add(l); legs.push(l);
  }
  // tail
  const tail = capsule(0.18, 2.2, charToon({ map: catbusBands(6, 6) }), 0, 2.4, -4.4);
  tail.rotation.x = Math.PI / 2 + 0.6;
  g.add(tail);
  // tail-light mice
  const mouseMat = charToon({ map: sphereFur(0x9a9a9a, 12, { w: 256 }).texture() });
  for (const s of [-1, 1]) {
    g.add(sphere(0.28, mouseMat, s * 0.9, 2.6, -3.5));
    g.add(sphere(0.07, glow(0xff5a4a, 2), s * 0.9 + s * 0.05, 2.7, -3.75));
  }
  const ch: Character = {
    group: g,
    update(dt, t) {
      void dt;
      legs.forEach((l, i) => {
        const ph = t * 14 + (i % 6) * 1.1 + (i >= 6 ? Math.PI : 0);
        l.rotation.x = Math.sin(ph) * 0.55;
        l.position.y = 0.75 + Math.max(0, Math.cos(ph)) * 0.25;
      });
      body.position.y = 2.0 + Math.sin(t * 14) * 0.05;
      head.position.y = 2.15 + Math.sin(t * 14 + 0.5) * 0.06;
      tail.rotation.z = Math.sin(t * 3) * 0.5;
    },
  };
  return ch;
}

// ---------------- Kiki with Jiji on the broom ----------------
export function makeKiki() {
  const g = new THREE.Group();
  const skinC = 0xf3d5bb;
  const skin = charToon({ color: skinC });
  const dress = charToon({ map: fabric(0x2b2946, { seed: 3 }), shade: 0x9aa0cc });
  const skirtMat = charToon({ map: fabric(0x2b2946, { hem: true, folds: 10, seed: 4 }), shade: 0x9aa0cc, side: THREE.DoubleSide });
  const red = charToon({ color: 0xd23b3f });
  const broom = cyl(0.045, 0.045, 2.6, charToon({ map: woodGrain(0x7a5a3a), rim: 0.2 }), 0, 0, 0, 10);
  broom.rotation.x = Math.PI / 2;
  g.add(broom);
  const bristles = cone(0.26, 0.85, charToon({ map: strawTexture(), rim: 0.3 }), 0, 0.02, -1.65, 18);
  bristles.rotation.x = Math.PI / 2; // tied end towards the handle, spreading out behind
  g.add(bristles);
  // kiki sits side-saddle-ish: body over broom
  const kiki = new THREE.Group();
  kiki.position.set(0, 0.12, 0.2);
  const skirt = cone(0.42, 0.85, skirtMat, 0, 0.42, 0, 20);
  const torso = capsule(0.2, 0.35, dress, 0, 0.9, 0);
  const head = sphere(0.3, charToon({ map: faceTexture({ skin: skinC, hair: 0x241c1e, fringe: 'parted', mouth: 'smile', w: 1024, seed: 5 }) }), 0, 1.42, 0.02, 32, 24);
  const hairCap = sphere(0.33, charToon({ map: hairTexture(0x241c1e, 6), rim: 0.3 }), 0, 1.5, -0.06, 24, 16);
  hairCap.scale.set(1, 0.9, 1);
  const bow = new THREE.Group();
  const bowMat = charToon({ map: bowCloth(0xd23b3f) });
  bow.add(ellipsoid(0.2, 0.13, 0.1, bowMat, -0.2, 0, 0), ellipsoid(0.2, 0.13, 0.1, bowMat, 0.2, 0, 0), sphere(0.08, red, 0, 0, 0));
  bow.position.set(0, 1.78, -0.05);
  const legs: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const l = capsule(0.07, 0.45, skin, s * 0.16, 0.1, 0.15);
    l.rotation.x = 0.5; kiki.add(l); legs.push(l);
    kiki.add(sphere(0.09, red, s * 0.16, -0.22, 0.28));
  }
  const arms: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const a = capsule(0.06, 0.4, dress, s * 0.25, 0.85, 0.2);
    a.rotation.x = -1.0; kiki.add(a); arms.push(a);
  }
  kiki.add(skirt, torso, head, hairCap, bow);
  g.add(kiki);
  // radio
  g.add(box(0.22, 0.16, 0.12, charToon({ color: 0xb63a3a }), -0.35, -0.2, 0.3));
  // Jiji
  const jiji = new THREE.Group();
  const black = charToon({ color: 0x17151a, rim: 0.5 });
  const eyeW = charToon({ color: 0xf6f4ec, rim: 0.1 }), eyeP = charToon({ color: 0x101014, rim: 0 });
  jiji.add(ellipsoid(0.16, 0.14, 0.22, black, 0, 0.16, 0), sphere(0.15, black, 0, 0.36, 0.1));
  for (const s of [-1, 1]) {
    const e = cone(0.05, 0.12, black, s * 0.08, 0.5, 0.08); jiji.add(e);
    jiji.add(ellipsoid(0.045, 0.055, 0.02, eyeW, s * 0.06, 0.39, 0.235), ellipsoid(0.022, 0.035, 0.01, eyeP, s * 0.06, 0.385, 0.252));
  }
  const jtail = capsule(0.025, 0.35, black, 0.05, 0.25, -0.28); jtail.rotation.x = 0.9; jiji.add(jtail);
  jiji.position.set(0, 0.05, -0.75);
  g.add(jiji);
  let waveT = 0, startleT = 0;
  const ch: Character & { wave(): void; startle(): void } = {
    group: g,
    wave() { waveT = 2.2; },
    startle() { startleT = 1.0; },
    update(dt, t) {
      skirt.scale.set(1 + Math.sin(t * 9) * 0.06, 1, 1 + Math.cos(t * 7) * 0.06);
      hairCap.position.y = 1.5 + Math.sin(t * 6) * 0.015;
      bow.rotation.z = Math.sin(t * 5) * 0.12;
      legs.forEach((l, i) => l.rotation.x = 0.5 + Math.sin(t * 4 + i) * 0.15);
      jtail.rotation.z = Math.sin(t * 3) * 0.6;
      if (waveT > 0) {
        waveT -= dt;
        arms[1].rotation.x = damp(arms[1].rotation.x, -3.0, 8, dt);
        arms[1].rotation.z = Math.sin(t * 10) * 0.4 - 0.4;
        head.rotation.z = damp(head.rotation.z, 0.2, 5, dt);
      } else {
        arms[1].rotation.x = damp(arms[1].rotation.x, -1.0, 6, dt);
        arms[1].rotation.z = damp(arms[1].rotation.z, 0, 6, dt);
        head.rotation.z = damp(head.rotation.z, 0, 5, dt);
      }
      if (startleT > 0) {
        startleT -= dt;
        jiji.position.y = 0.05 + Math.sin(clamp(1 - startleT, 0, 1) * Math.PI) * 0.6;
        jiji.scale.y = 1.15;
      } else { jiji.position.y = 0.05; jiji.scale.y = 1; }
    },
  };
  return ch;
}

// ---------------- No-Face ----------------
export function makeNoFace() {
  const g = new THREE.Group();
  const bodyMat = charToon({ map: noFaceBody(), transparent: true, opacity: 0.93, emissive: 0x0a0c18, rim: 0.6, shade: 0x9aa0cc });
  const body = mesh(new THREE.CapsuleGeometry(0.75, 3.0, 8, 24), bodyMat, 0, 2.3, 0);
  const skirt = cone(1.05, 1.6, bodyMat, 0, 0.8, 0, 24);
  g.add(body, skirt);
  // the mask: gently curved so it catches the light, and wider than the body so it sits in front of it
  const maskGeo = new THREE.PlaneGeometry(1.15, 1.45, 16, 20);
  const mp = maskGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), y = mp.getY(i); mp.setZ(i, -x * x * 0.45 - y * y * 0.06); }
  maskGeo.computeVertexNormals();
  const maskTex = noFaceMask();
  // a little self-light keeps the mask pale on the night sea, like the film
  const mask = mesh(maskGeo, charToon({ map: maskTex, color: 0xd4d4d4, emissive: 0x303038, emissiveMap: maskTex, alphaTest: 0.5, rim: 0.1, shade: 0xb0b4d0 }), 0, 3.55, 0.8);
  g.add(mask);
  const mouth = ellipsoid(0.35, 0.22, 0.2, charToon({ color: 0x1a0c10, rim: 0 }), 0, 2.75, 0.62);
  mouth.scale.setScalar(0.001);
  g.add(mouth);
  const arms: THREE.Mesh[] = [];
  const gold: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const a = capsule(0.12, 1.4, bodyMat, s * 0.75, 2.3, 0.1);
    a.rotation.z = s * 0.15;
    g.add(a); arms.push(a);
    const nug = mesh(new THREE.IcosahedronGeometry(0.16, 0), glow(0xffc93a, 1.7), s * 0.7, 2.6, 1.5);
    nug.visible = false; g.add(nug); gold.push(nug);
  }
  let offerT = 0, gulpT = 0;
  const ch: Character & { offer(): void; gulp(): void } = {
    group: g,
    offer() { offerT = 4; },
    gulp() { gulpT = 1.6; },
    update(dt, t) {
      body.position.y = 2.3 + Math.sin(t * 0.9) * 0.05;
      g.rotation.z = Math.sin(t * 0.7) * 0.02;
      if (offerT > 0) {
        offerT -= dt;
        arms.forEach((a, i) => {
          a.rotation.x = damp(a.rotation.x, -1.5, 5, dt);
          a.position.z = damp(a.position.z, 0.8, 5, dt);
          a.position.y = damp(a.position.y, 2.7, 5, dt);
          gold[i].visible = a.rotation.x < -1.0;
          gold[i].rotation.y += dt * 2;
        });
      } else {
        arms.forEach((a, i) => {
          a.rotation.x = damp(a.rotation.x, 0, 4, dt);
          a.position.z = damp(a.position.z, 0.1, 4, dt);
          a.position.y = damp(a.position.y, 2.3, 4, dt);
          gold[i].visible = false;
        });
      }
      if (gulpT > 0) {
        gulpT -= dt;
        const p = 1 - gulpT / 1.6;
        const open = Math.sin(clamp(p * 1.3, 0, 1) * Math.PI);
        mouth.scale.setScalar(0.001 + open * 1.6);
        mask.rotation.x = -0.4 * open;
        mask.position.y = 3.55 + 0.25 * open;
      } else { mouth.scale.setScalar(0.001); mask.rotation.x = damp(mask.rotation.x, 0, 5, dt); mask.position.y = damp(mask.position.y, 3.55, 5, dt); }
    },
  };
  return ch;
}

// ---------------- Soot sprites ----------------
/**
 * A fuzzy ball: a sphere covered in thin spikes. Every vertex uses the radial direction as its normal,
 * so the fuzz shades like one soft round shape.
 */
function fuzzBallGeometry(r: number, spikes: number, len: [number, number], rng: Rng) {
  const core = new THREE.IcosahedronGeometry(r, 2);
  const pos: number[] = [], nrm: number[] = [];
  const d = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < spikes; i++) {
    d.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
    if (d.lengthSq() < 0.01) continue;
    d.normalize();
    a.set(d.y, d.z, d.x).cross(d).normalize();
    b.crossVectors(d, a);
    const w = r * 0.14, L = r + rng.range(len[0], len[1]);
    const base = [0, 1, 2].map((k) => { const t = (k / 3) * TAU; return new THREE.Vector3().copy(d).multiplyScalar(r * 0.9).addScaledVector(a, Math.cos(t) * w).addScaledVector(b, Math.sin(t) * w); });
    const tip = d.clone().multiplyScalar(L);
    for (let k = 0; k < 3; k++) {
      for (const v of [base[k], base[(k + 1) % 3], tip]) { pos.push(v.x, v.y, v.z); nrm.push(d.x, d.y, d.z); }
    }
  }
  const fuzz = new THREE.BufferGeometry();
  fuzz.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fuzz.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const coreNI = core.toNonIndexed();
  coreNI.deleteAttribute('uv');
  return mergeGeometries([coreNI, fuzz])!;
}

export function makeSootSprites(count: number, rng: Rng, area = 3.5) {
  const g = new THREE.Group();
  const black = charToon({ color: 0x17181f, rim: 0.45, shade: 0x8088a8, side: THREE.DoubleSide });
  const white = charToon({ color: 0xf2f0e8, rim: 0.2 });
  const pupil = charToon({ color: 0x101014, rim: 0 });
  const coalMat = charToon({ color: 0x34343c, rim: 0.2 });
  const bodyGeo = fuzzBallGeometry(0.24, 220, [0.04, 0.13], new Rng(17));
  // a private generator for looks only, so the shared one (and everything placed after) is unchanged
  const looks = new Rng(18);
  const sprites: { g: THREE.Group; home: THREE.Vector3; target: THREE.Vector3; phase: number; coal: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Group();
    const bodyM = mesh(bodyGeo, black);
    bodyM.position.y = 0.32;
    bodyM.rotation.set(looks.range(0, TAU), looks.range(0, TAU), 0);
    s.add(bodyM);
    for (const sx of [-1, 1]) {
      s.add(sphere(0.105, white, sx * 0.11, 0.39, 0.2));
      s.add(sphere(0.05, pupil, sx * 0.11, 0.39, 0.3));
    }
    for (let k = 0; k < 2; k++) {
      const leg = cyl(0.012, 0.012, 0.22, black, (k - 0.5) * 0.18, 0.1, 0);
      s.add(leg);
    }
    const coal = rng.chance(0.5);
    if (coal) {
      s.add(mesh(new THREE.DodecahedronGeometry(0.16, 0), coalMat, 0, 0.78, 0));
      for (const sx of [-1, 1]) { const arm = cyl(0.012, 0.012, 0.3, black, sx * 0.14, 0.62, 0); arm.rotation.z = sx * -0.6; s.add(arm); }
    }
    const home = V(rng.range(-area, area), 0, rng.range(-area, area));
    s.position.copy(home);
    g.add(s);
    sprites.push({ g: s, home, target: home.clone(), phase: rng.range(0, 10), coal });
  }
  let swarmT = 0, jumpT = 0;
  const local = new THREE.Vector3();
  const ch: Character & { swarmTo(worldPos: THREE.Vector3): void; jump(): void } = {
    group: g,
    swarmTo(worldPos) {
      g.updateWorldMatrix(true, false);
      local.copy(worldPos); g.worldToLocal(local); local.y = 0;
      for (const s of sprites) s.target.copy(local).add(V(rng.range(-0.9, 0.9), 0, rng.range(-0.9, 0.9)));
      swarmT = 5;
    },
    jump() { jumpT = 1.2; },
    update(dt, t) {
      if (swarmT > 0) { swarmT -= dt; if (swarmT <= 0) for (const s of sprites) s.target.copy(s.home); }
      if (jumpT > 0) jumpT -= dt;
      for (const s of sprites) {
        const sp = swarmT > 0 ? 3.5 : 1.2;
        s.g.position.x = damp(s.g.position.x, s.target.x, sp, dt);
        s.g.position.z = damp(s.g.position.z, s.target.z, sp, dt);
        const hop = Math.abs(Math.sin(t * (swarmT > 0 ? 9 : 4) + s.phase)) * (swarmT > 0 ? 0.35 : 0.14);
        const j = jumpT > 0 ? Math.sin(clamp(1.2 - jumpT, 0, 1) / 1.0 * Math.PI) * 0.6 : 0;
        s.g.position.y = hop + j;
        s.g.rotation.y = Math.atan2(s.target.x - s.g.position.x, s.target.z - s.g.position.z) * 0.6;
      }
    },
  };
  return ch;
}

// ---------------- Haku the dragon ----------------
class Trail {
  private buf: { p: THREE.Vector3; t: number }[] = [];
  push(p: THREE.Vector3, t: number) {
    this.buf.push({ p: p.clone(), t });
    while (this.buf.length > 400) this.buf.shift();
  }
  sample(t: number, out: THREE.Vector3) {
    const b = this.buf;
    if (!b.length) return out.set(0, 0, 0);
    if (t <= b[0].t) return out.copy(b[0].p);
    for (let i = b.length - 1; i > 0; i--) {
      if (b[i - 1].t <= t) {
        const a = b[i - 1], c = b[i];
        const k = c.t === a.t ? 0 : (t - a.t) / (c.t - a.t);
        return out.copy(a.p).lerp(c.p, k);
      }
    }
    return out.copy(b[b.length - 1].p);
  }
}

export function makeHaku() {
  const g = new THREE.Group();
  const white = charToon({ map: hakuScales(), emissive: 0x2a3a58, rim: 0.7, shade: 0x9ea8d4 });
  const headMat = charToon({ map: sphereFur(0xf0f4f3, 105, { w: 256, contrast: 0.35 }).texture(), emissive: 0x2a3a58, rim: 0.7, shade: 0x9ea8d4 });
  const teal = charToon({ map: tealTuft(), emissive: 0x143a34, rim: 0.5 });
  const hornMat = charToon({ color: 0xe8e0c8, emissive: 0x2a2a30, rim: 0.4 });
  const whiskerMat = charToon({ color: 0x5cc0ac, emissive: 0x1a4a44, rim: 0.3 });
  const head = new THREE.Group();
  head.add(ellipsoid(0.55, 0.5, 1.1, headMat, 0, 0, 0.3));
  head.add(ellipsoid(0.32, 0.28, 0.6, headMat, 0, -0.1, 1.15)); // snout
  for (const s of [-1, 1]) {
    head.add(sphere(0.1, glow(0x7fe0d0, 1.4), s * 0.3, 0.18, 0.85));
    const horn = cone(0.08, 0.7, hornMat, s * 0.28, 0.45, -0.2); horn.rotation.x = -0.7; head.add(horn);
    const whisk = cyl(0.015, 0.015, 1.3, whiskerMat, s * 0.4, -0.15, 1.2); whisk.rotation.z = Math.PI / 2 + s * 0.4; whisk.rotation.y = s * 0.3; head.add(whisk);
  }
  // mane: fan of teal tufts
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.2;
    const m = cone(0.16, 0.9, teal, Math.sin(a) * 0.45, 0.35 + Math.cos(a) * 0.35, -0.3);
    m.rotation.x = -1.2; m.rotation.z = -a * 0.6;
    head.add(m);
  }
  g.add(head);
  // the body is one tube that follows the head's recent path; its rings are rebuilt every frame
  const N = 64, M = 14, STEP = 0.01725;
  const pts = Array.from({ length: N }, () => new THREE.Vector3());
  const radius = (i: number) => lerp(0.36, 0.09, Math.pow(i / (N - 1), 1.5));
  const bodyGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(N * (M + 1) * 3), bNrm = new Float32Array(N * (M + 1) * 3), bUv = new Float32Array(N * (M + 1) * 2);
  const idx: number[] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j <= M; j++) {
    bUv[(i * (M + 1) + j) * 2] = j / M;
    bUv[(i * (M + 1) + j) * 2 + 1] = (i / (N - 1)) * 10;
    if (i < N - 1 && j < M) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bodyGeo.setAttribute('normal', new THREE.BufferAttribute(bNrm, 3));
  bodyGeo.setAttribute('uv', new THREE.BufferAttribute(bUv, 2));
  bodyGeo.setIndex(idx);
  const body = new THREE.Mesh(bodyGeo, white);
  body.frustumCulled = false;
  g.add(body);
  // a ribbon of mane along the spine
  const MANE_END = Math.floor(N * 0.86);
  const maneGeo = new THREE.BufferGeometry();
  const mPos = new Float32Array(MANE_END * 2 * 3), mNrm = new Float32Array(MANE_END * 2 * 3), mUv = new Float32Array(MANE_END * 2 * 2);
  const mIdx: number[] = [];
  for (let i = 0; i < MANE_END; i++) {
    mUv.set([(i / MANE_END) * 5, 0, (i / MANE_END) * 5, 1], i * 4);
    if (i < MANE_END - 1) { const a = i * 2; mIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  maneGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  maneGeo.setAttribute('normal', new THREE.BufferAttribute(mNrm, 3));
  maneGeo.setAttribute('uv', new THREE.BufferAttribute(mUv, 2));
  maneGeo.setIndex(mIdx);
  const mane = new THREE.Mesh(maneGeo, charToon({ map: hakuMane(), emissive: 0x143a34, side: THREE.DoubleSide, alphaTest: 0.45, rim: 0.2 }));
  mane.frustumCulled = false;
  g.add(mane);
  // little legs
  const legs: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const l = capsule(0.07, 0.5, headMat); g.add(l); legs.push(l);
  }
  const tailFan: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) { const f = cone(0.1, 0.6, teal); g.add(f); tailFan.push(f); }
  const trail = new Trail();
  const headPos = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), prevN = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  const rebuild = () => {
    for (let i = 0; i < N; i++) {
      T.subVectors(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)]);
      if (T.lengthSq() < 1e-8) T.set(0, 0, 1);
      T.normalize();
      // keep the back facing up so the mane stays on top; fall back to the last ring's normal when steep
      Nn.copy(up).addScaledVector(T, -up.dot(T));
      if (Nn.lengthSq() < 1e-4) Nn.copy(prevN); else Nn.normalize();
      prevN.copy(Nn);
      B.crossVectors(Nn, T);
      const r = radius(i);
      for (let j = 0; j <= M; j++) {
        const a = (j / M) * TAU;
        d.copy(B).multiplyScalar(Math.cos(a)).addScaledVector(Nn, Math.sin(a));
        const o = (i * (M + 1) + j) * 3;
        bPos[o] = pts[i].x + d.x * r; bPos[o + 1] = pts[i].y + d.y * r; bPos[o + 2] = pts[i].z + d.z * r;
        bNrm[o] = d.x; bNrm[o + 1] = d.y; bNrm[o + 2] = d.z;
      }
      if (i < MANE_END) {
        const h = 0.1 + 0.42 * Math.pow(1 - i / MANE_END, 0.8);
        const o = i * 6;
        const bx = pts[i].x + Nn.x * r * 0.75, by = pts[i].y + Nn.y * r * 0.75, bz = pts[i].z + Nn.z * r * 0.75;
        mPos[o] = bx; mPos[o + 1] = by; mPos[o + 2] = bz;
        mPos[o + 3] = bx + (Nn.x - T.x * 0.9) * h; mPos[o + 4] = by + (Nn.y - T.y * 0.9) * h; mPos[o + 5] = bz + (Nn.z - T.z * 0.9) * h;
        // light the ribbon as if it were part of the rounded back
        tmp.copy(B).multiplyScalar(0.5).add(Nn).normalize();
        mNrm.set([tmp.x, tmp.y, tmp.z, tmp.x, tmp.y, tmp.z], o);
      }
    }
    bodyGeo.attributes.position.needsUpdate = true;
    bodyGeo.attributes.normal.needsUpdate = true;
    maneGeo.attributes.position.needsUpdate = true;
    maneGeo.attributes.normal.needsUpdate = true;
  };
  const state = { target: new THREE.Vector3(), vel: new THREE.Vector3(), swoopT: 0, time: 0, seeded: false };
  const ch: Character & { state: typeof state; setTarget(p: THREE.Vector3): void; swoop(): void; head: THREE.Group } = {
    group: g, state, head,
    setTarget(p) { state.target.copy(p); },
    swoop() { state.swoopT = 3.5; },
    update(dt, t) {
      state.time = t;
      if (!state.seeded) { headPos.copy(state.target); state.seeded = true; for (let i = 0; i < 60; i++) trail.push(headPos, t - 3 + i * 0.05); }
      // steer towards target with inertia so the body snakes
      tmp.copy(state.target).sub(headPos);
      const dist = tmp.length();
      const desired = tmp.normalize().multiplyScalar(clamp(dist * 1.6, 6, state.swoopT > 0 ? 34 : 22));
      state.vel.lerp(desired, 1 - Math.exp(-dt * 1.8));
      headPos.addScaledVector(state.vel, dt);
      trail.push(headPos, t);
      head.position.copy(headPos);
      tmp2.copy(headPos).add(state.vel);
      head.lookAt(tmp2);
      head.rotation.z += Math.sin(t * 3) * 0.1;
      pts.forEach((p, i) => {
        trail.sample(t - (i + 1) * STEP, p);
        p.y += Math.sin(t * 4 - i * 0.27) * 0.12;
      });
      rebuild();
      legs.forEach((l, k) => {
        const seg = pts[8 + (k >> 1) * 21];
        const next = pts[9 + (k >> 1) * 21];
        l.position.copy(seg);
        tmp.copy(next).sub(seg).normalize();
        const side = tmp2.set(-tmp.z, 0, tmp.x).multiplyScalar(k % 2 ? 0.45 : -0.45);
        l.position.add(side); l.position.y -= 0.3;
        l.rotation.z = (k % 2 ? 1 : -1) * 0.5 + Math.sin(t * 5 + k) * 0.5;
      });
      tailFan.forEach((f, i) => {
        f.position.copy(pts[N - 1]);
        f.rotation.set(Math.sin(t * 2 + i) * 0.4, 0, (i - 1.5) * 0.7);
      });
      if (state.swoopT > 0) state.swoopT -= dt;
    },
  };
  return ch;
}

// ---------------- Kodama ----------------
export function makeKodama(count: number, rng: Rng, area = 6) {
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
  const heads: { h: THREE.Mesh; base: number; phase: number }[] = [];
  for (let i = 0; i < count; i++) {
    const k = new THREE.Group();
    const s = rng.range(0.7, 1.25);
    k.add(cyl(0.16 * s, 0.2 * s, 0.7 * s, bodyMat, 0, 0.35 * s, 0));
    const h = mesh(headGeos[i % 3], faces[i % 4], 0, 0.9 * s, 0);
    h.scale.set(0.27 * s, 0.3 * s, 0.27 * s);
    k.add(h);
    for (const sx of [-1, 1]) { const a = cyl(0.03, 0.03, 0.3, bodyMat, sx * 0.2 * s, 0.55 * s, 0); a.rotation.z = sx * 0.6; k.add(a); }
    k.position.set(rng.range(-area, area), 0, rng.range(-area * 0.5, area * 0.5));
    k.rotation.y = rng.range(-0.6, 0.6);
    g.add(k);
    heads.push({ h, base: rng.range(-0.3, 0.3), phase: rng.range(0, 10) });
  }
  let rattleT = 0;
  const ch: Character & { rattle(): void } = {
    group: g,
    rattle() { rattleT = 2.5; },
    update(dt, t) {
      if (rattleT > 0) rattleT -= dt;
      for (const { h, base, phase } of heads) {
        if (rattleT > 0) h.rotation.z = Math.sin(t * 38 + phase) * 0.35 * Math.min(1, rattleT);
        else h.rotation.z = damp(h.rotation.z, base + Math.sin(t * 0.5 + phase) * 0.15, 3, dt);
      }
    },
  };
  return ch;
}

// ---------------- Ponyo's sisters (fish school) ----------------
export function makePonyoSchool(count: number, rng: Rng) {
  const g = new THREE.Group();
  g.rotation.y = Math.PI; // the school runs in the -z direction, faces first
  const bodyMat = charToon({ map: ponyoBody(), emissive: 0x6a2010, rim: 0.5 });
  const finMat = charToon({ map: finTexture(0xe6553f), emissive: 0x6a2010, rim: 0.4, side: THREE.DoubleSide });
  const fish: { g: THREE.Group; phase: number; lane: number }[] = [];
  for (let i = 0; i < count; i++) {
    const f = new THREE.Group();
    const s = rng.range(0.6, 1.0);
    const body = ellipsoid(0.35 * s, 0.32 * s, 0.5 * s, bodyMat, 0, 0, 0, 20, 14);
    f.add(body);
    const tail = cone(0.2 * s, 0.35 * s, finMat, 0, 0, -0.62 * s, 10); tail.rotation.x = -Math.PI / 2; f.add(tail);
    for (const sx of [-1, 1]) { const fin = cone(0.1 * s, 0.3 * s, finMat, sx * 0.35 * s, -0.05, 0, 8); fin.rotation.z = sx * Math.PI / 2; f.add(fin); }
    f.position.set(rng.range(-4, 4), 0, rng.range(-6, 6));
    g.add(f);
    fish.push({ g: f, phase: rng.range(0, 10), lane: f.position.x });
  }
  let leapT = 0;
  const ch: Character & { leap(): void } = {
    group: g,
    leap() { leapT = 1.4; },
    update(dt, t) {
      if (leapT > 0) leapT -= dt;
      for (const f of fish) {
        const run = Math.abs(Math.sin(t * 6 + f.phase)) * 0.35;
        const leap = leapT > 0 ? Math.sin(clamp((1.4 - leapT) / 1.2, 0, 1) * Math.PI) * 2.2 * (0.6 + Math.sin(f.phase) * 0.4) : 0;
        f.g.position.y = 0.35 + run + leap;
        f.g.position.x = f.lane + Math.sin(t * 1.5 + f.phase) * 0.6;
        f.g.rotation.x = -Math.sin(t * 6 + f.phase) * 0.3 - leap * 0.2;
      }
    },
  };
  return ch;
}

// ---------------- Radish Spirit ----------------
export function makeRadishSpirit() {
  const g = new THREE.Group();
  const skin = radishSkin();
  const white = charToon({ map: skin, emissive: 0x2c3040, rim: 0.5 });
  const red = charToon({ map: lacquer(0xc23c2e), emissive: 0x3a0e0a, rim: 0.4 });
  const dark = charToon({ color: 0x222226, rim: 0 });
  const body = mesh(new THREE.CapsuleGeometry(1.05, 2.0, 10, 28), white, 0, 2.05, 0);
  g.add(body);
  const hat = mesh(new THREE.SphereGeometry(1.15, 28, 12, 0, TAU, 0, Math.PI / 2), red, 0, 3.4, 0);
  g.add(hat);
  g.add(cyl(0.18, 0.18, 0.5, red, 0, 4.6, 0));
  for (const s of [-1, 1]) {
    g.add(sphere(0.07, dark, s * 0.28, 3.15, 0.98));
    g.add(ellipsoid(0.16, 0.1, 0.05, charToon({ color: 0xe08c8c, emissive: 0x2a1010, rim: 0 }), s * 0.5, 2.85, 0.92));
    const arm = capsule(0.16, 0.5, white, s * 1.05, 2.1, 0.1); arm.rotation.z = s * 0.8; g.add(arm);
  }
  g.add(ellipsoid(0.12, 0.08, 0.1, dark, 0, 2.95, 1.05));
  // little bowl in hand
  g.add(cyl(0.22, 0.16, 0.14, red, 1.25, 1.8, 0.35, 16));
  let bowT = 0;
  const ch: Character & { bow(): void } = {
    group: g,
    bow() { bowT = 2.2; },
    update(dt, t) {
      body.scale.y = 1 + Math.sin(t * 1.1) * 0.012;
      if (bowT > 0) { bowT -= dt; g.rotation.x = damp(g.rotation.x, 0.35 * Math.sin(clamp((2.2 - bowT) / 2.2, 0, 1) * Math.PI), 6, dt); }
      else g.rotation.x = damp(g.rotation.x, 0, 4, dt);
    },
  };
  return ch;
}

// ---------------- Hopping lamp post ----------------
export function makeHoppingLamp() {
  const g = new THREE.Group();
  const iron = charToon({ map: ironTexture(), rim: 0.4 });
  const pole = cyl(0.07, 0.1, 2.2, iron, 0, 1.1, 0);
  const head = new THREE.Group();
  head.add(box(0.5, 0.6, 0.5, iron, 0, 0, 0));
  head.add(box(0.52, 0.5, 0.52, new THREE.MeshBasicMaterial({ map: lampGlass(), color: new THREE.Color(1.9, 1.9, 1.9) }), 0, 0, 0));
  head.add(cone(0.42, 0.3, iron, 0, 0.45, 0, 4));
  head.add(sphere(0.07, iron, 0, 0.66, 0));
  head.position.y = 2.5;
  g.add(pole, head);
  let phase = 0;
  const ch: Character = {
    group: g,
    update(dt, t) {
      void dt;
      phase = t * 2.6;
      const hop = Math.max(0, Math.sin(phase));
      g.position.y = hop * 0.7;
      g.rotation.z = Math.cos(phase) * 0.18;
      g.rotation.x = Math.sin(phase * 0.5) * 0.08;
    },
  };
  return ch;
}

// ---------------- Laputa ----------------
export function makeLaputa() {
  const g = new THREE.Group();
  const rockTex = rockStrata(0x5a5f6b);
  rockTex.repeat.set(4, 2);
  const rock = charToon({ map: rockTex, emissive: 0xffffff, emissiveMap: rockTex, emissiveIntensity: 0.18, rim: 0.4 });
  // stone walls; a faint self-light through the texture keeps them readable against the night sky
  const wallMat = (arches: boolean, seed: number) => { const t = stoneWall(0xc4bcac, { arches, moss: true, seed }); return charToon({ map: t, emissive: 0x8a96c0, emissiveMap: t, emissiveIntensity: 0.4, rim: 0.4 }); };
  const tier = (rTop: number, rBot: number, h: number, y: number, arches: boolean, seed: number) => {
    const geo = repeatUV(new THREE.CylinderGeometry(rTop, rBot, h, 28), Math.round((Math.PI * 2 * rBot) / 8), h / 8);
    g.add(mesh(geo, wallMat(arches, seed), 0, y, 0));
  };
  const base = cone(28, 34, rock, 0, -17, 0, 18); base.rotation.x = Math.PI; g.add(base);
  tier(26, 28, 6, 3, false, 172);
  tier(18, 22, 8, 10, true, 173);
  tier(10, 14, 10, 19, true, 174);
  // roots hanging from the bottom of the island
  const rootMat = charToon({ color: 0x4a4038, emissive: 0x16141a, rim: 0.3 });
  const rr = new Rng(1986);
  for (let i = 0; i < 16; i++) {
    const a = rr.range(0, TAU), d = rr.range(4, 22), len = rr.range(10, 26) * (1 - d / 40);
    const root = cone(rr.range(0.5, 1.2), len, rootMat, Math.cos(a) * d, -34 * (1 - d / 28) + 8 - len / 2, Math.sin(a) * d, 5);
    root.rotation.x = Math.PI + rr.range(-0.15, 0.15); root.rotation.z = rr.range(-0.15, 0.15);
    g.add(root);
  }
  // the great tree
  g.add(cyl(2.2, 3, 14, charToon({ map: woodGrain(0x6a5040, 175), emissive: 0x1a1410, rim: 0.3 }), 0, 31, 0, 12));
  const crown = fluffyTree([
    { c: new THREE.Vector3(0, 44, 0), r: new THREE.Vector3(16, 11, 16) },
    { c: new THREE.Vector3(10, 40, 5), r: new THREE.Vector3(9, 7, 9) },
    { c: new THREE.Vector3(-10, 41, -4), r: new THREE.Vector3(10, 7, 10) },
    { c: new THREE.Vector3(3, 51, -3), r: new THREE.Vector3(9, 6, 9) },
    { c: new THREE.Vector3(-4, 39, 11), r: new THREE.Vector3(8, 6, 8) },
  ], 0x4f8f4a, new Rng(1987), { density: 0.12, cardScale: 1.1 });
  (crown.material as THREE.MeshToonMaterial).emissive.set(0x10281a);
  g.add(crown);
  const towerTop = charToon({ color: 0x5f7fa0, emissive: 0x1a2a40, rim: 0.4 });
  const towerWall = wallMat(false, 176);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const tgeo = repeatUV(new THREE.CylinderGeometry(1.4, 1.6, 6, 10), 1, 0.75);
    g.add(mesh(tgeo, towerWall, Math.cos(a) * 21, 9, Math.sin(a) * 21));
    g.add(cone(2, 3, towerTop, Math.cos(a) * 21, 13.5, Math.sin(a) * 21, 8));
  }
  // faint glow ring beneath
  { const ring = mesh(new THREE.TorusGeometry(24, 1.2, 8, 32), glow(0x9fd7ff, 1.1), 0, -8, 0); ring.rotation.x = Math.PI / 2; g.add(ring); }
  // the island only moves as a whole, so its parts can be baked into one mesh per material
  mergeStatic(g);
  const ch: Character = {
    group: g,
    update(dt, t) { void dt; g.position.y += Math.sin(t * 0.3) * 0.01; g.rotation.y += 0.004 * dt; },
  };
  return ch;
}

// ---------------- Howl's moving castle (distant silhouette) ----------------
export function makeHowlsCastle() {
  const g = new THREE.Group();
  const ironTex = metalPlates(0x55545c, 0x8a5a3a, 192), rustTex = metalPlates(0x6e5a4c, 0x9a6a40, 193);
  const iron = charToon({ map: ironTex, rim: 0.3 });
  const rust = charToon({ map: rustTex, rim: 0.3 });
  const B = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => mesh(boxUV(new THREE.BoxGeometry(w, h, d), 7), mat, x, y, z);
  const C = (rt: number, rb: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 10) => mesh(repeatUV(new THREE.CylinderGeometry(rt, rb, h, seg), Math.max(1, Math.round((TAU * rb) / 7)), h / 7), mat, x, y, z);
  const body = new THREE.Group();
  body.add(B(14, 10, 12, iron, 0, 14, 0));
  body.add(C(4, 5, 9, rust, -5, 22, 2));
  body.add(cone(5, 5, iron, -5, 29, 2, 10));
  body.add(C(2.5, 3, 7, iron, 6, 21, -3));
  body.add(B(6, 5, 6, rust, 5, 11, 7));
  body.add(B(9, 4, 5, iron, -3, 8, 8));
  body.add(C(1.2, 1.2, 8, iron, 2, 24, 4, 8));
  body.add(C(1.0, 1.0, 6, iron, -8, 21, -4, 8));
  // glowing windows
  const winMat = glow(0xffc070, 1.5);
  body.add(box(1.4, 1.6, 0.4, winMat, -3, 15, 6.1), box(1.4, 1.6, 0.4, winMat, 1, 13, 6.1), box(1.0, 1.4, 0.4, winMat, 5, 11.5, 10.1), box(1.0, 1.2, 0.4, winMat, -5, 24, 6.2));
  // mouth plate
  body.add(B(8, 3, 1, rust, 0, 7, 6.3));
  g.add(body);
  mergeStatic(body);
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Group();
    const upper = C(0.7, 0.9, 8, iron, 0, -4, 0, 8); l.add(upper);
    const lower = C(0.6, 0.7, 7, iron, 0, -10, 1.2, 8); l.add(lower);
    l.add(B(3, 1, 4.5, iron, 0, -13.5, 1.5));
    l.position.set(i % 2 ? 4.5 : -4.5, 9.5, i < 2 ? 3 : -3);
    g.add(l); legs.push(l);
    mergeStatic(l);
  }
  let walk = 0;
  const ch: Character = {
    group: g,
    update(dt, t) {
      walk = t * 1.6;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(walk + (i % 2 ? Math.PI : 0) + (i < 2 ? 0 : 0.5)) * 0.35; });
      body.position.y = Math.abs(Math.sin(walk)) * 0.6;
      body.rotation.z = Math.sin(walk) * 0.03;
      g.position.z += 1.2 * dt; // walks slowly across the ridge
    },
  };
  return ch;
}

// ---------------- Shadow passengers ----------------
export function makeShadowPassengers(count: number, rng: Rng, width = 10) {
  const g = new THREE.Group();
  // body fades out towards the feet, like the see-through passengers in the film
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x0a0c12, transparent: true, opacity: 0.8, alphaMap: shadowFade(), depthWrite: false });
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a0c12, transparent: true, opacity: 0.66, depthWrite: false });
  for (let i = 0; i < count; i++) {
    const p = new THREE.Group();
    const h = rng.range(1.5, 1.9);
    p.add(capsule(0.28, h - 0.6, bodyMat, 0, h / 2, 0));
    p.add(sphere(0.22, mat, 0, h + 0.15, 0));
    if (rng.chance(0.5)) p.add(cyl(0.35, 0.35, 0.08, mat, 0, h + 0.36, 0));
    p.position.set(rng.range(-width / 2, width / 2), 0, rng.range(-0.8, 0.8));
    g.add(p);
  }
  return g;
}

// ---------------- Seagulls ----------------
export function makeSeagulls(count: number, rng: Rng) {
  const g = new THREE.Group();
  const white = charToon({ color: 0xf6f6f2, rim: 0.3 });
  const wingMat = charToon({ map: gullWing(), side: THREE.DoubleSide, alphaTest: 0.5, rim: 0.2 });
  // body and head as one geometry, so each gull stays at three draw calls
  const bodyGeo = mergeGeometries([new THREE.SphereGeometry(1, 14, 10).scale(0.12, 0.1, 0.3), new THREE.SphereGeometry(0.08, 10, 8).translate(0, 0.05, 0.28)])!;
  // a horizontal wing with its root at x = 0 and its leading edge towards +z
  const wingGeo = new THREE.PlaneGeometry(1.1, 0.4).rotateX(Math.PI / 2).translate(0.55, 0, 0);
  const birds: { g: THREE.Group; l: THREE.Object3D; r: THREE.Object3D; phase: number; radius: number; speed: number; h: number }[] = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const r = new THREE.Mesh(wingGeo, wingMat);
    const l = new THREE.Mesh(wingGeo, wingMat); l.scale.x = -1;
    b.add(l, r, new THREE.Mesh(bodyGeo, white));
    g.add(b);
    birds.push({ g: b, l, r, phase: rng.range(0, 10), radius: rng.range(8, 26), speed: rng.range(0.25, 0.5) * rng.sign(), h: rng.range(0, 8) });
  }
  const ch: Character = {
    group: g,
    update(dt, t) {
      void dt;
      for (const b of birds) {
        const a = t * b.speed + b.phase;
        b.g.position.set(Math.cos(a) * b.radius, b.h + Math.sin(t * 0.7 + b.phase) * 1.5, Math.sin(a) * b.radius);
        b.g.rotation.y = -a + (b.speed > 0 ? 0 : Math.PI);
        const flap = Math.sin(t * 6 + b.phase) * 0.6;
        b.l.rotation.z = flap; b.r.rotation.z = -flap;
      }
    },
  };
  return ch;
}

// ---------------- Dirigible ----------------
export function makeDirigible() {
  const g = new THREE.Group();
  // hull with its poles at the nose and tail, so the painted gores run lengthwise
  const hull = mesh(new THREE.SphereGeometry(1, 36, 18).rotateX(Math.PI / 2), charToon({ map: airshipHull(), rim: 0.4 }));
  hull.scale.set(4, 4, 14);
  g.add(hull);
  const gondolaTex = canvasTexture(256, 64, (c, w, h) => {
    c.fillStyle = '#5f636e'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8d8a8';
    for (let i = 0; i < 9; i++) c.fillRect(12 + i * 27, 18, 16, 20);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, h - 10, w, 10);
  });
  g.add(box(3.2, 1.4, 5, charToon({ map: gondolaTex, rim: 0.2 }), 0, -4.2, 1));
  const fin = charToon({ color: 0xb33a3a, rim: 0.3 });
  for (const s of [-1, 1]) { g.add(box(0.3, 3, 4, fin, s * 2.6, 0, -12)); }
  g.add(box(3, 0.3, 4, fin, 0, 2.8, -12));
  g.add(box(3, 0.3, 4, fin, 0, -2.8, -12));
  const ch: Character = { group: g, update(dt, t) { void dt; g.position.y += Math.sin(t * 0.4) * 0.004; } };
  return ch;
}

// ---------------- Satsuki with Mei asleep on her back ----------------
export function makeSatsukiMei() {
  const g = new THREE.Group();
  const skinC = 0xf3d6bd;
  const skin = charToon({ color: skinC });
  const yellow = charToon({ map: fabric(0xf2d34a, { seed: 8 }) });
  // Satsuki
  const s = new THREE.Group();
  s.add(cyl(0.34, 0.42, 0.7, charToon({ map: fabric(0xd8512e, { hem: true, folds: 9, seed: 9 }) }), 0, 0.9, 0, 18)); // skirt
  s.add(capsule(0.24, 0.5, yellow, 0, 1.55, 0)); // yellow top
  s.add(sphere(0.29, charToon({ map: faceTexture({ skin: skinC, hair: 0x3a2a22, fringe: 'bob', mouth: 'small', seed: 10 }) }), 0, 2.2, 0.02, 28, 20));
  const bob = sphere(0.32, charToon({ map: hairTexture(0x3a2a22, 11), rim: 0.3 }), 0, 2.28, -0.06, 24, 16); bob.scale.set(1, 0.85, 1); s.add(bob);
  for (const sx of [-1, 1]) s.add(capsule(0.07, 0.55, skin, sx * 0.2, 0.3, 0.02));
  const arm = capsule(0.07, 0.5, yellow, 0.34, 1.6, 0.05); arm.rotation.z = -0.5; s.add(arm);
  // umbrella held up
  const umb = new THREE.Group();
  umb.add(cyl(0.02, 0.02, 2.2, charToon({ color: 0x2a2a2a, rim: 0.1 }), 0, 1.1, 0));
  umb.add(cone(1.15, 0.45, charToon({ map: umbrellaCloth(0x2a3a5a), side: THREE.DoubleSide, rim: 0.2 }), 0, 2.3, 0, 16));
  umb.position.set(0.5, 1.0, 0.1);
  s.add(umb);
  // Mei asleep on her back
  const m = new THREE.Group();
  const meiHair = charToon({ map: hairTexture(0x8a5a30, 12), rim: 0.3 });
  m.add(capsule(0.2, 0.3, charToon({ map: fabric(0xf0a0b8, { seed: 13 }) }), 0, 0.2, 0));
  m.add(sphere(0.22, charToon({ map: faceTexture({ skin: skinC, hair: 0x8a5a30, eyes: 'closed', fringe: 'bob', mouth: 'small', blush: 0.6, seed: 14 }) }), 0, 0.62, 0, 24, 16));
  m.add(sphere(0.24, meiHair, 0, 0.68, -0.05));
  for (const sx of [-1, 1]) { m.add(sphere(0.09, meiHair, sx * 0.22, 0.78, -0.05)); m.add(capsule(0.05, 0.3, skin, sx * 0.12, -0.1, 0.05)); }
  m.position.set(0, 1.35, -0.42);
  m.rotation.x = 0.25;
  s.add(m);
  g.add(s);
  let waveT = 0;
  const ch: Character & { wave(): void } = {
    group: g,
    wave() { waveT = 2.2; },
    update(dt, t) {
      s.position.y = Math.sin(t * 1.3) * 0.01;
      umb.rotation.z = Math.sin(t * 0.9) * 0.05;
      if (waveT > 0) { waveT -= dt; arm.rotation.z = damp(arm.rotation.z, -2.6 + Math.sin(t * 9) * 0.3, 8, dt); }
      else arm.rotation.z = damp(arm.rotation.z, -0.5, 6, dt);
    },
  };
  return ch;
}

// ---------------- Chihiro seated in the train, with Boh the mouse ----------------
export function makeChihiroSeated() {
  const g = new THREE.Group();
  // she sits in the dim cabin, so everything carries a little warm self-light
  const skinC = 0xf3d6bd;
  const skin = charToon({ color: skinC, emissive: 0x161008 });
  const shirt = charToon({ map: fabric(0xf5f2ea, { stripes: { color: 0x4faa5a, count: 6, width: 14 }, folds: 5, seed: 15 }), emissive: 0x201e18 });
  // seated: thighs forward (+z), torso up
  g.add(box(0.5, 0.22, 0.5, charToon({ map: fabric(0xd9d05a, { seed: 16 }), emissive: 0x302e14 }), 0, 0.65, 0.2)); // shorts / thighs
  g.add(capsule(0.22, 0.42, shirt, 0, 1.15, 0));
  g.add(sphere(0.27, charToon({ map: faceTexture({ skin: skinC, hair: 0x3a2a22, fringe: 'bob', mouth: 'small', w: 1024, seed: 17 }), emissive: 0x161008 }), 0, 1.7, 0.02, 28, 20));
  const hairMat = charToon({ map: hairTexture(0x3a2a22, 18), emissive: 0x0c0806, rim: 0.3 });
  const h = sphere(0.3, hairMat, 0, 1.78, -0.06, 24, 16); h.scale.set(1, 0.85, 1); g.add(h);
  const tail = capsule(0.08, 0.35, hairMat, 0, 1.75, -0.32); tail.rotation.x = 0.6; g.add(tail);
  // Zeniba's hair tie
  g.add(sphere(0.06, charToon({ color: 0x8a6ac0, emissive: 0x2a1a40 }), 0, 1.82, -0.3));
  const sock = charToon({ color: 0xf2e9d0, emissive: 0x201e18 });
  for (const sx of [-1, 1]) { const leg = capsule(0.07, 0.4, skin, sx * 0.15, 0.3, 0.42); g.add(leg); g.add(sphere(0.09, sock, sx * 0.15, 0.08, 0.46)); }
  for (const sx of [-1, 1]) { const a = capsule(0.06, 0.4, shirt, sx * 0.3, 1.1, 0.1); a.rotation.x = -0.9; g.add(a); }
  // Boh as a mouse on her lap, and the little bird
  const mouse = new THREE.Group();
  const mouseFur = charToon({ map: sphereFur(0xb8b0a8, 19, { w: 128 }).texture(), emissive: 0x2a2826 });
  mouse.add(ellipsoid(0.12, 0.1, 0.14, mouseFur, 0, 0.08, 0));
  mouse.add(sphere(0.09, mouseFur, 0, 0.14, 0.12));
  for (const sx of [-1, 1]) mouse.add(sphere(0.05, charToon({ color: 0xe8b8c0, emissive: 0x2a1a1c }), sx * 0.08, 0.22, 0.1));
  mouse.position.set(0.15, 0.78, 0.35);
  g.add(mouse);
  const bird = sphere(0.05, charToon({ color: 0x2a2a2a, emissive: 0x0a0a0a }), -0.3, 0.9, 0.35);
  g.add(bird);
  let lookT = 0;
  const ch: Character & { look(): void } = {
    group: g,
    look() { lookT = 3; },
    update(dt, t) {
      g.position.y = Math.sin(t * 2.2) * 0.008;
      bird.position.y = 0.9 + Math.sin(t * 6) * 0.03;
      if (lookT > 0) { lookT -= dt; h.rotation.y = damp(h.rotation.y, 0, 5, dt); }
      else { h.rotation.y = damp(h.rotation.y, Math.sin(t * 0.4) * 0.35, 3, dt); }
    },
  };
  return ch;
}
