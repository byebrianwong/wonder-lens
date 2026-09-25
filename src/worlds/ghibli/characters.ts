import * as THREE from 'three';
import { toon, glow, sphere, ellipsoid, cyl, cone, capsule, box, canvasTexture, mesh } from '../../engine/Builders';
import { clamp, damp, lerp, Rng, TAU } from '../../engine/math';

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
  const fur = toon(o.color ?? 0x8b9098);
  const bellyMat = toon(o.belly ?? 0xeae5d6);
  const dark = toon(0x262930);
  const white = toon(0xffffff);
  const body = ellipsoid(1.55, 1.9, 1.4, fur, 0, 1.9, 0);
  const head = ellipsoid(1.32, 1.08, 1.2, fur, 0, 3.5, 0.05);
  g.add(body, head);
  if (o.belly !== -1) {
    const belly = ellipsoid(1.12, 1.35, 0.72, bellyMat, 0, 1.7, 0.85);
    g.add(belly);
    if (o.chevrons !== false) {
      for (let i = 0; i < 7; i++) {
        const row = i < 4 ? 0 : 1;
        const col = i < 4 ? i - 1.5 : i - 5;
        const ch = cone(0.16, 0.24, dark, col * 0.42, 2.4 - row * 0.55, 1.5 - Math.abs(col) * 0.09);
        ch.rotation.x = -0.35; ch.scale.z = 0.35;
        g.add(ch);
      }
    }
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
    const e = sphere(0.24, white, s * 0.55, 3.72, 1.02);
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
  const mouth = ellipsoid(0.85, 0.5, 0.35, dark, 0, 3.05, 1.05);
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
    const leaf = mesh(new THREE.CircleGeometry(0.55, 10), toon(0x5c9a45, { side: THREE.DoubleSide }), 0.15, 4.62, 0.1);
    leaf.rotation.x = -Math.PI / 2 + 0.25; leaf.scale.x = 0.7;
    g.add(leaf);
  }
  let umbrella: THREE.Group | null = null;
  if (o.umbrella) {
    umbrella = new THREE.Group();
    const canopy = cone(2.3, 0.85, toon(0x3a2a34, { side: THREE.DoubleSide }), 0, 0.42, 0, 10);
    const stick = cyl(0.04, 0.04, 3.0, toon(0x222), 0, -1.4, 0);
    umbrella.add(canopy, stick);
    umbrella.position.set(1.4, 5.7, 0.3);
    umbrella.rotation.z = 0.25;
    g.add(umbrella);
  }
  if (o.bag) {
    const bag = ellipsoid(0.55, 0.7, 0.4, toon(0xd8c39a), 0, 2.4, -1.2);
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
  const orange = toon(0xd9893a);
  const stripe = toon(0x8a4b22);
  const body = capsule(1.35, 6.0, orange, 0, 2.0, 0);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  for (let i = -2; i <= 2; i++) {
    const s = cyl(1.38, 1.38, 0.3, stripe, 0, 2.0, i * 1.25 + 0.2);
    s.rotation.x = Math.PI / 2;
    g.add(s);
  }
  // head
  const head = ellipsoid(1.55, 1.4, 1.4, orange, 0, 2.15, 3.55);
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = cone(0.5, 0.9, orange, s * 0.85, 3.5, 3.4);
    ear.rotation.z = -s * 0.3;
    g.add(ear);
  }
  const eyeMat = glow(0xffe27a, 1.8);
  for (const s of [-1, 1]) {
    g.add(ellipsoid(0.5, 0.42, 0.25, eyeMat, s * 0.7, 2.5, 4.85));
    g.add(ellipsoid(0.14, 0.32, 0.1, toon(0x222), s * 0.7, 2.5, 5.1));
  }
  // grin drawn on a texture
  const grinTex = canvasTexture(256, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = '#2a1a10'; c.lineWidth = 8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(18, 40); c.quadraticCurveTo(w / 2, 150, w - 18, 40); c.stroke();
    c.fillStyle = '#fff';
    for (let i = 0; i < 9; i++) { const x = 40 + i * 22; const y = 60 + Math.sin((i / 8) * Math.PI) * 38; c.beginPath(); c.moveTo(x - 8, y - 6); c.lineTo(x + 8, y - 6); c.lineTo(x, y + 14); c.fill(); }
  });
  const grin = mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: grinTex, transparent: true }), 0, 1.75, 4.95);
  g.add(grin);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const w = cyl(0.02, 0.02, 1.6, toon(0x3a2a20), s * 1.7, 1.9 - i * 0.12, 4.5);
    w.rotation.z = Math.PI / 2 - s * (0.1 + i * 0.15); g.add(w);
  }
  // windows glow
  const winMat = glow(0xffd58a, 1.4);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const w = box(0.08, 0.7, 0.9, winMat, s * 1.34, 2.5, i * 1.45 - 2.2);
    g.add(w);
  }
  // sign box on top
  const sign = box(1.4, 0.45, 0.5, toon(0xf4efe4), 0, 3.55, 2.2);
  g.add(sign);
  const signTex = canvasTexture(256, 96, (c, w, h) => { c.fillStyle = '#f4efe4'; c.fillRect(0, 0, w, h); c.fillStyle = '#c0392b'; c.font = 'bold 60px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('めい', w / 2, h / 2 + 4); });
  g.add(mesh(new THREE.PlaneGeometry(1.3, 0.4), new THREE.MeshBasicMaterial({ map: signTex }), 0, 3.55, 2.46));
  // legs
  const legs: THREE.Mesh[] = [];
  const legMat = toon(0xd9893a);
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
    const l = capsule(0.13, 1.1, legMat, s * 1.0, 0.75, i * 1.1 - 2.6);
    g.add(l); legs.push(l);
  }
  // tail
  const tail = capsule(0.18, 2.2, orange, 0, 2.4, -4.4);
  tail.rotation.x = Math.PI / 2 + 0.6;
  g.add(tail);
  // tail-light mice
  for (const s of [-1, 1]) {
    g.add(sphere(0.28, toon(0x9a9a9a), s * 0.9, 2.6, -3.5));
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
  const skin = toon(0xf3d5bb), hair = toon(0x231c1c), dress = toon(0x2b2946), red = toon(0xd23b3f);
  const broom = cyl(0.045, 0.045, 2.6, toon(0x7a5a3a), 0, 0, 0);
  broom.rotation.x = Math.PI / 2;
  g.add(broom);
  const bristles = cone(0.26, 0.85, toon(0xd8b25a), 0, 0.02, -1.65);
  bristles.rotation.x = -Math.PI / 2;
  g.add(bristles);
  // kiki sits side-saddle-ish: body over broom
  const kiki = new THREE.Group();
  kiki.position.set(0, 0.12, 0.2);
  const skirt = cone(0.42, 0.85, dress, 0, 0.42, 0);
  const torso = capsule(0.2, 0.35, dress, 0, 0.9, 0);
  const head = sphere(0.3, skin, 0, 1.42, 0.02);
  const hairCap = sphere(0.33, hair, 0, 1.5, -0.06);
  hairCap.scale.set(1, 0.9, 1);
  const bow = new THREE.Group();
  bow.add(ellipsoid(0.2, 0.13, 0.1, red, -0.2, 0, 0), ellipsoid(0.2, 0.13, 0.1, red, 0.2, 0, 0), sphere(0.08, red, 0, 0, 0));
  bow.position.set(0, 1.78, -0.05);
  for (const s of [-1, 1]) kiki.add(sphere(0.035, toon(0x1a1a1a), s * 0.1, 1.44, 0.28));
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
  g.add(box(0.22, 0.16, 0.12, toon(0xb63a3a), -0.35, -0.2, 0.3));
  // Jiji
  const jiji = new THREE.Group();
  const black = toon(0x17151a);
  jiji.add(ellipsoid(0.16, 0.14, 0.22, black, 0, 0.16, 0), sphere(0.15, black, 0, 0.36, 0.1));
  for (const s of [-1, 1]) { const e = cone(0.05, 0.12, black, s * 0.08, 0.5, 0.08); jiji.add(e); jiji.add(sphere(0.03, glow(0xffe680, 1.5), s * 0.06, 0.38, 0.23)); }
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
  const bodyMat = new THREE.MeshToonMaterial({ color: 0x0b0d14, transparent: true, opacity: 0.92, emissive: 0x0a0c18 });
  const body = capsule(0.75, 3.0, bodyMat, 0, 2.3, 0);
  const skirt = cone(1.05, 1.6, bodyMat, 0, 0.8, 0);
  g.add(body, skirt);
  const maskTex = canvasTexture(256, 320, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#f4f1ea';
    c.beginPath(); c.ellipse(w / 2, h / 2, w * 0.42, h * 0.47, 0, 0, TAU); c.fill();
    c.fillStyle = '#5a4b6a';
    // eye slits and marks
    for (const s of [-1, 1]) {
      const x = w / 2 + s * 46;
      c.fillRect(x - 5, 110, 10, 34);
      c.beginPath(); c.moveTo(x - 22, 80); c.lineTo(x + 22, 80); c.lineTo(x, 96); c.fill();
      c.fillRect(x - 5, 165, 10, 40);
      c.beginPath(); c.moveTo(x - 22, 230); c.lineTo(x + 22, 230); c.lineTo(x, 214); c.fill();
    }
    c.fillStyle = '#3a3040'; c.fillRect(w / 2 - 6, 176, 12, 6);
  });
  const mask = mesh(new THREE.PlaneGeometry(1.15, 1.45), new THREE.MeshBasicMaterial({ map: maskTex, transparent: true }), 0, 3.55, 0.7);
  g.add(mask);
  const mouth = ellipsoid(0.35, 0.22, 0.2, toon(0x1a0c10), 0, 2.75, 0.62);
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
export function makeSootSprites(count: number, rng: Rng, area = 3.5) {
  const g = new THREE.Group();
  const black = toon(0x15161c);
  const white = new THREE.MeshBasicMaterial({ color: 0xc9c9c2 });
  const coalMat = toon(0x3b3b44);
  const sprites: { g: THREE.Group; home: THREE.Vector3; target: THREE.Vector3; phase: number; coal: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Group();
    const bodyM = mesh(new THREE.IcosahedronGeometry(0.28, 1), black);
    bodyM.position.y = 0.32;
    s.add(bodyM);
    for (const sx of [-1, 1]) {
      s.add(sphere(0.1, white, sx * 0.11, 0.38, 0.22));
      s.add(sphere(0.045, black, sx * 0.11, 0.38, 0.31));
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
  const white = toon(0xf2f4f7, { emissive: 0x3a4a66 });
  const teal = toon(0x3fa39a, { emissive: 0x1a4a44 });
  const head = new THREE.Group();
  head.add(ellipsoid(0.55, 0.5, 1.1, white, 0, 0, 0.3));
  head.add(ellipsoid(0.32, 0.28, 0.6, white, 0, -0.1, 1.15)); // snout
  for (const s of [-1, 1]) {
    head.add(sphere(0.1, glow(0x7fe0d0, 1.4), s * 0.3, 0.18, 0.85));
    const horn = cone(0.08, 0.7, toon(0xd9d4c4), s * 0.28, 0.45, -0.2); horn.rotation.x = -0.7; head.add(horn);
    const whisk = cyl(0.015, 0.015, 1.3, teal, s * 0.4, -0.15, 1.2); whisk.rotation.z = Math.PI / 2 + s * 0.4; whisk.rotation.y = s * 0.3; head.add(whisk);
  }
  // mane: fan of teal cones
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.2;
    const m = cone(0.16, 0.9, teal, Math.sin(a) * 0.45, 0.35 + Math.cos(a) * 0.35, -0.3);
    m.rotation.x = -1.2; m.rotation.z = -a * 0.6;
    head.add(m);
  }
  g.add(head);
  const segs: THREE.Mesh[] = [];
  const N = 46;
  for (let i = 0; i < N; i++) {
    const r = lerp(0.55, 0.13, i / (N - 1));
    const s = sphere(r, i % 5 === 2 ? teal : white, 0, 0, 0, 12, 8);
    g.add(s); segs.push(s);
  }
  // little legs
  const legs: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const l = capsule(0.07, 0.5, white); g.add(l); legs.push(l);
  }
  const tailFan: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) { const f = cone(0.1, 0.6, teal); g.add(f); tailFan.push(f); }
  const trail = new Trail();
  const headPos = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
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
      segs.forEach((s, i) => {
        trail.sample(t - (i + 1) * 0.024, s.position);
        s.position.y += Math.sin(t * 4 - i * 0.38) * 0.12;
      });
      legs.forEach((l, k) => {
        const seg = segs[6 + (k >> 1) * 15];
        const next = segs[7 + (k >> 1) * 15];
        l.position.copy(seg.position);
        tmp.copy(next.position).sub(seg.position).normalize();
        const side = tmp2.set(-tmp.z, 0, tmp.x).multiplyScalar(k % 2 ? 0.45 : -0.45);
        l.position.add(side); l.position.y -= 0.3;
        l.rotation.z = (k % 2 ? 1 : -1) * 0.5 + Math.sin(t * 5 + k) * 0.5;
      });
      tailFan.forEach((f, i) => {
        const last = segs[N - 1];
        f.position.copy(last.position);
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
  const white = toon(0xf1f3f0, { emissive: 0x2a3538 });
  const dark = toon(0x101418);
  const heads: { h: THREE.Mesh; base: number; phase: number }[] = [];
  for (let i = 0; i < count; i++) {
    const k = new THREE.Group();
    const s = rng.range(0.7, 1.25);
    k.add(cyl(0.16 * s, 0.2 * s, 0.7 * s, white, 0, 0.35 * s, 0));
    const h = sphere(0.27 * s, white, 0, 0.9 * s, 0);
    h.scale.set(1, 1.12, 1);
    // face holes
    for (const sx of [-1, 1]) h.add(ellipsoid(0.055, 0.075, 0.03, dark, sx * 0.1, 0.02, 0.24));
    h.add(ellipsoid(0.07, 0.05, 0.03, dark, 0, -0.12, 0.24));
    k.add(h);
    for (const sx of [-1, 1]) { const a = cyl(0.03, 0.03, 0.3, white, sx * 0.2 * s, 0.55 * s, 0); a.rotation.z = sx * 0.6; k.add(a); }
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
  const red = toon(0xe6553f, { emissive: 0x8a2a14 });
  const faceTex = canvasTexture(64, 64, (c) => {
    c.fillStyle = '#ffd9c2'; c.beginPath(); c.arc(32, 32, 26, 0, TAU); c.fill();
    c.fillStyle = '#222'; c.beginPath(); c.arc(22, 30, 4, 0, TAU); c.arc(42, 30, 4, 0, TAU); c.fill();
    c.strokeStyle = '#a33'; c.lineWidth = 3; c.beginPath(); c.arc(32, 36, 8, 0.2, Math.PI - 0.2); c.stroke();
  });
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true });
  const fish: { g: THREE.Group; phase: number; lane: number }[] = [];
  for (let i = 0; i < count; i++) {
    const f = new THREE.Group();
    const s = rng.range(0.6, 1.0);
    const body = ellipsoid(0.35 * s, 0.32 * s, 0.5 * s, red);
    f.add(body);
    f.add(mesh(new THREE.CircleGeometry(0.26 * s, 16), faceMat, 0, 0.02, 0.42 * s));
    const tail = cone(0.2 * s, 0.35 * s, red, 0, 0, -0.62 * s); tail.rotation.x = -Math.PI / 2; f.add(tail);
    for (const sx of [-1, 1]) { const fin = cone(0.1 * s, 0.3 * s, red, sx * 0.35 * s, -0.05, 0); fin.rotation.z = sx * Math.PI / 2; f.add(fin); }
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
  const white = toon(0xf3efe6, { emissive: 0x2c3040 });
  const red = toon(0xc23c2e, { emissive: 0x3a0e0a });
  const body = capsule(1.05, 2.0, white, 0, 2.05, 0);
  g.add(body);
  const hat = mesh(new THREE.SphereGeometry(1.15, 18, 10, 0, TAU, 0, Math.PI / 2), red, 0, 3.4, 0);
  g.add(hat);
  g.add(cyl(0.18, 0.18, 0.5, red, 0, 4.6, 0));
  for (const s of [-1, 1]) {
    g.add(sphere(0.07, toon(0x222), s * 0.28, 3.15, 0.98));
    g.add(ellipsoid(0.16, 0.1, 0.05, toon(0xe08c8c), s * 0.5, 2.85, 0.92));
    const arm = capsule(0.16, 0.5, white, s * 1.05, 2.1, 0.1); arm.rotation.z = s * 0.8; g.add(arm);
  }
  g.add(ellipsoid(0.12, 0.08, 0.1, toon(0x222), 0, 2.95, 1.05));
  // little bowl in hand
  g.add(cyl(0.22, 0.16, 0.14, toon(0x9a3b2c), 1.25, 1.8, 0.35));
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
  const iron = toon(0x2f3338);
  const pole = cyl(0.07, 0.1, 2.2, iron, 0, 1.1, 0);
  const head = new THREE.Group();
  head.add(box(0.5, 0.6, 0.5, iron, 0, 0, 0));
  head.add(box(0.44, 0.5, 0.44, glow(0xffd27a, 1.9), 0, 0, 0));
  head.add(cone(0.42, 0.3, iron, 0, 0.45, 0, 4));
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
  const rock = toon(0x5a5f6b, { emissive: 0x1a2030 });
  const stone = toon(0xb9b1a2, { emissive: 0x3a4460 });
  const green = toon(0x4f8f4a, { emissive: 0x16301a });
  const base = cone(28, 34, rock, 0, -17, 0, 9); base.rotation.x = Math.PI; g.add(base);
  g.add(cyl(26, 28, 6, stone, 0, 3, 0, 12));
  g.add(cyl(18, 22, 8, stone, 0, 10, 0, 12));
  g.add(cyl(10, 14, 10, stone, 0, 19, 0, 10));
  // the great tree
  g.add(cyl(2.2, 3, 14, toon(0x6a5040), 0, 31, 0));
  const canopy = mesh(new THREE.IcosahedronGeometry(16, 1), green, 0, 44, 0); canopy.scale.y = 0.75; g.add(canopy);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.add(cyl(1.4, 1.6, 6, stone, Math.cos(a) * 21, 9, Math.sin(a) * 21, 6));
    g.add(cone(2, 3, toon(0x5f7fa0), Math.cos(a) * 21, 13.5, Math.sin(a) * 21, 6));
  }
  // faint glow ring beneath
  { const ring = mesh(new THREE.TorusGeometry(24, 1.2, 8, 32), glow(0x9fd7ff, 1.1), 0, -8, 0); ring.rotation.x = Math.PI / 2; g.add(ring); }
  const ch: Character = {
    group: g,
    update(dt, t) { void dt; g.position.y += Math.sin(t * 0.3) * 0.01; g.rotation.y += 0.004 * dt; },
  };
  return ch;
}

// ---------------- Howl's moving castle (distant silhouette) ----------------
export function makeHowlsCastle() {
  const g = new THREE.Group();
  const iron = toon(0x3d3a40);
  const rust = toon(0x5a4a3f);
  const body = new THREE.Group();
  body.add(box(14, 10, 12, iron, 0, 14, 0));
  body.add(cyl(4, 5, 9, rust, -5, 22, 2, 8));
  body.add(cone(5, 5, iron, -5, 29, 2, 8));
  body.add(cyl(2.5, 3, 7, iron, 6, 21, -3, 8));
  body.add(box(6, 5, 6, rust, 5, 11, 7));
  body.add(box(9, 4, 5, iron, -3, 8, 8));
  body.add(cyl(1.2, 1.2, 8, iron, 2, 24, 4, 6));
  body.add(cyl(1.0, 1.0, 6, iron, -8, 21, -4, 6));
  // glowing windows
  const winMat = glow(0xffc070, 1.5);
  body.add(box(1.4, 1.6, 0.4, winMat, -3, 15, 6.1), box(1.4, 1.6, 0.4, winMat, 1, 13, 6.1), box(1.0, 1.4, 0.4, winMat, 5, 11.5, 10.1), box(1.0, 1.2, 0.4, winMat, -5, 24, 6.2));
  // mouth plate
  body.add(box(8, 3, 1, rust, 0, 7, 6.3));
  g.add(body);
  const legs: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Group();
    const upper = cyl(0.7, 0.9, 8, iron, 0, -4, 0); l.add(upper);
    const lower = cyl(0.6, 0.7, 7, iron, 0, -10, 1.2); l.add(lower);
    l.add(box(3, 1, 4.5, iron, 0, -13.5, 1.5));
    l.position.set(i % 2 ? 4.5 : -4.5, 9.5, i < 2 ? 3 : -3);
    g.add(l); legs.push(l);
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
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a0c12, transparent: true, opacity: 0.7 });
  for (let i = 0; i < count; i++) {
    const p = new THREE.Group();
    const h = rng.range(1.5, 1.9);
    p.add(capsule(0.28, h - 0.6, mat, 0, h / 2, 0));
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
  const white = toon(0xffffff, { side: THREE.DoubleSide });
  const birds: { g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; phase: number; radius: number; speed: number; h: number }[] = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const wing = new THREE.PlaneGeometry(1.1, 0.35);
    const l = mesh(wing, white, -0.55, 0, 0), r = mesh(wing, white, 0.55, 0, 0);
    b.add(l, r, ellipsoid(0.12, 0.1, 0.3, white));
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
  const silver = toon(0xcfd3d8);
  const hull = ellipsoid(4, 4, 14, silver);
  g.add(hull);
  g.add(box(3.2, 1.4, 5, toon(0x6b6f7a), 0, -4.2, 1));
  for (const s of [-1, 1]) { g.add(box(0.3, 3, 4, toon(0xb33a3a), s * 2.6, 0, -12)); }
  g.add(box(3, 0.3, 4, toon(0xb33a3a), 0, 2.8, -12));
  g.add(box(3, 0.3, 4, toon(0xb33a3a), 0, -2.8, -12));
  const ch: Character = { group: g, update(dt, t) { void dt; g.position.y += Math.sin(t * 0.4) * 0.004; } };
  return ch;
}

// ---------------- Satsuki with Mei asleep on her back ----------------
export function makeSatsukiMei() {
  const g = new THREE.Group();
  const skin = toon(0xf3d6bd), hair = toon(0x3a2a22);
  // Satsuki
  const s = new THREE.Group();
  s.add(cyl(0.34, 0.42, 0.7, toon(0xd8512e), 0, 0.9, 0)); // skirt
  s.add(capsule(0.24, 0.5, toon(0xf2d34a), 0, 1.55, 0)); // yellow top
  s.add(sphere(0.29, skin, 0, 2.2, 0.02));
  const bob = sphere(0.32, hair, 0, 2.28, -0.06); bob.scale.set(1, 0.85, 1); s.add(bob);
  for (const sx of [-1, 1]) { s.add(sphere(0.035, toon(0x1a1a1a), sx * 0.1, 2.22, 0.27)); s.add(capsule(0.07, 0.55, skin, sx * 0.2, 0.3, 0.02)); }
  const arm = capsule(0.07, 0.5, toon(0xf2d34a), 0.34, 1.6, 0.05); arm.rotation.z = -0.5; s.add(arm);
  // umbrella held up
  const umb = new THREE.Group();
  umb.add(cyl(0.02, 0.02, 2.2, toon(0x2a2a2a), 0, 1.1, 0));
  umb.add(cone(1.15, 0.45, toon(0x2a3a5a, { side: THREE.DoubleSide }), 0, 2.3, 0, 10));
  umb.position.set(0.5, 1.0, 0.1);
  s.add(umb);
  // Mei asleep on her back
  const m = new THREE.Group();
  m.add(capsule(0.2, 0.3, toon(0xf0a0b8), 0, 0.2, 0));
  m.add(sphere(0.22, skin, 0, 0.62, 0));
  m.add(sphere(0.24, toon(0x8a5a30), 0, 0.68, -0.05));
  for (const sx of [-1, 1]) { m.add(sphere(0.09, toon(0x8a5a30), sx * 0.22, 0.78, -0.05)); m.add(capsule(0.05, 0.3, skin, sx * 0.12, -0.1, 0.05)); }
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
  const skin = toon(0xf3d6bd, { emissive: 0x161008 });
  const hair = toon(0x3a2a22, { emissive: 0x0c0806 });
  const shirt = toon(0xf5f2ea, { emissive: 0x201e18 });
  // seated: thighs forward (+z), torso up
  g.add(box(0.5, 0.22, 0.5, toon(0xd9d05a, { emissive: 0x302e14 }), 0, 0.65, 0.2)); // shorts / thighs
  g.add(capsule(0.22, 0.42, shirt, 0, 1.15, 0));
  g.add(box(0.46, 0.08, 0.3, toon(0x4faa5a, { emissive: 0x143a18 }), 0, 1.1, 0.12)); // green stripe
  g.add(sphere(0.27, skin, 0, 1.7, 0.02));
  const h = sphere(0.3, hair, 0, 1.78, -0.06); h.scale.set(1, 0.85, 1); g.add(h);
  const tail = capsule(0.08, 0.35, hair, 0, 1.75, -0.32); tail.rotation.x = 0.6; g.add(tail);
  g.add(sphere(0.035, toon(0x1a1a1a), -0.1, 1.72, 0.25), sphere(0.035, toon(0x1a1a1a), 0.1, 1.72, 0.25));
  for (const sx of [-1, 1]) { const leg = capsule(0.07, 0.4, skin, sx * 0.15, 0.3, 0.42); g.add(leg); g.add(sphere(0.09, toon(0xf2e9d0), sx * 0.15, 0.08, 0.46)); }
  for (const sx of [-1, 1]) { const a = capsule(0.06, 0.4, shirt, sx * 0.3, 1.1, 0.1); a.rotation.x = -0.9; g.add(a); }
  // Boh as a mouse on her lap, and the little bird
  const mouse = new THREE.Group();
  mouse.add(ellipsoid(0.12, 0.1, 0.14, toon(0xb8b0a8, { emissive: 0x2a2826 }), 0, 0.08, 0));
  mouse.add(sphere(0.09, toon(0xb8b0a8, { emissive: 0x2a2826 }), 0, 0.14, 0.12));
  for (const sx of [-1, 1]) mouse.add(sphere(0.05, toon(0xe8b8c0, { emissive: 0x2a1a1c }), sx * 0.08, 0.22, 0.1));
  mouse.position.set(0.15, 0.78, 0.35);
  g.add(mouse);
  const bird = sphere(0.05, toon(0x2a2a2a), -0.3, 0.9, 0.35);
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
