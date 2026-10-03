import * as THREE from 'three';
import { box, cyl, glow, mesh, type Placement } from '../../../engine/Builders';
import { fluffyForest } from '../../../engine/Foliage';
import { charToon, Painter, repeatUV } from '../../../engine/Paint';
import { Rng, TAU, clamp, lerp } from '../../../engine/math';
import { SETS, Y } from '../layout';
import { optimize, type BuiltSet, type SetContext } from '../common';
import { BAY, STOREY, facadeMaterial, zincMat } from '../buildings';
import { parisLamps, toonE, bench } from '../props';
import { css, PAL } from '../textures';
import { BUTTE, CITY_Y, SQUARE, STEPS, butteHeight } from './rooftops';

/*
 * Down the great steps below the Sacré-Cœur at blue hour. Amélie's blue chalk arrows point the way down,
 * lamps come on along the balustrades, a coin telescope stands at the top, a phone box rings at the bottom,
 * and a two-tier carousel turns on the square, all lights. Below, the city's windows are lighting up.
 */

/** Pale stone steps with worn nosings. One tile = 2 x 2 units. */
function stepStone(seed = 301) {
  const p = new Painter(128, 128, seed).fill('#d8d0c0');
  p.dabs({ n: 60, colors: ['#c8bfae', '#e8e0d0', '#b8b0a0'], r: [3, 16], alpha: [0.15, 0.35] });
  p.lines({ n: 10, colors: ['#a8a090'], alpha: [0.15, 0.3], width: [0.6, 1.2], wobble: 3 });
  return p.texture({ repeat: [1, 1] });
}

/** An arrow drawn in blue chalk, pointing down the canvas (towards +v). */
function chalkArrow(seed = 303) {
  const p = new Painter(128, 128, seed);
  const g = p.g, rng = p.rng;
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(90,170,255,0.95)'; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let pass = 0; pass < 3; pass++) {
    g.lineWidth = 9 - pass * 2;
    const j = () => rng.range(-2.5, 2.5);
    g.beginPath(); g.moveTo(64 + j(), 14 + j()); g.lineTo(64 + j(), 100 + j()); g.stroke();
    g.beginPath(); g.moveTo(30 + j(), 70 + j()); g.lineTo(64 + j(), 108 + j()); g.lineTo(98 + j(), 70 + j()); g.stroke();
  }
  return p.texture({ wrap: false });
}

/** Painted carousel panels: rounded frames with gilt scrolls, a landscape in each. */
function carouselPanels(seed = 305) {
  const p = new Painter(1024, 128, seed).fill('#e8c868');
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 8; i++) {
    const x = i * 128;
    g.fillStyle = '#b8282a'; g.fillRect(x + 6, 10, 116, 108);
    const gr = g.createLinearGradient(0, 20, 0, 108);
    gr.addColorStop(0, rng.pick(['#7ab0c8', '#e8a070', '#a8c8a0'])); gr.addColorStop(1, '#f0e0b0');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x + 64, 64, 48, 42, 0, 0, TAU); g.fill();
    g.fillStyle = rng.pick(['#3a6a3a', '#5a7a3a', '#2a4a5a']); g.beginPath(); g.ellipse(x + 64, 96, 46, 14, 0, Math.PI, TAU); g.fill();
    g.strokeStyle = '#f6e090'; g.lineWidth = 5; g.beginPath(); g.ellipse(x + 64, 64, 50, 44, 0, 0, TAU); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.arc(x + 64 + s * 50, 18, 8, 0, TAU); g.stroke(); }
  }
  return p.texture({ repeat: [1, 1] });
}

/** Canopy stripes: red and cream wedges with a scalloped hem. */
function canopyStripes(seed = 307) {
  const p = new Painter(512, 128, seed).fill('#f0e2c0');
  const g = p.g;
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#c8282a' : '#f0e2c0'; g.fillRect(i * 32, 0, 32, 128); }
  g.fillStyle = 'rgba(255,230,160,0.5)'; for (let i = 0; i < 16; i++) g.fillRect(i * 32, 0, 2, 128);
  return p.texture({ repeat: [1, 1] });
}

/** A painted carousel horse, side view (white with a red saddle and gold mane), for both faces of a cut-out. */
function horseTexture(seed: number) {
  const p = new Painter(256, 192, seed);
  const g = p.g, rng = p.rng;
  g.clearRect(0, 0, 256, 192);
  const coat = rng.pick(['#f6f0e4', '#e8d8b8', '#f4e8e8', '#d8c0a0']);
  g.fillStyle = coat;
  // body, neck, head, legs in a gallop
  g.beginPath(); g.ellipse(120, 100, 64, 30, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(160, 86); g.quadraticCurveTo(190, 50, 196, 30); g.lineTo(214, 34); g.quadraticCurveTo(206, 70, 182, 104); g.fill();
  g.beginPath(); g.ellipse(214, 42, 26, 13, 0.5, 0, TAU); g.fill();
  g.lineCap = 'round'; g.strokeStyle = coat; g.lineWidth = 12;
  for (const [x0, y0, x1, y1, x2, y2] of [[80, 115, 50, 140, 30, 150], [100, 120, 92, 150, 80, 172], [150, 118, 176, 140, 198, 140], [164, 112, 172, 146, 160, 172]]) {
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x1, y1, x2, y2); g.stroke();
  }
  // tail and mane in gold
  g.strokeStyle = '#e8b040'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(58, 92); g.quadraticCurveTo(28, 100, 22, 132); g.stroke();
  g.lineWidth = 8; g.beginPath(); g.moveTo(170, 80); g.quadraticCurveTo(192, 40, 204, 24); g.stroke();
  // saddle, bridle, eye
  g.fillStyle = '#b8282a'; g.beginPath(); g.ellipse(118, 76, 26, 12, 0, 0, TAU); g.fill();
  g.fillStyle = '#2f5a3a'; g.fillRect(96, 84, 46, 14);
  g.strokeStyle = '#e8b040'; g.lineWidth = 3; g.beginPath(); g.moveTo(198, 32); g.lineTo(228, 52); g.stroke();
  g.fillStyle = '#1a1210'; g.beginPath(); g.arc(214, 36, 3.5, 0, TAU); g.fill();
  g.fillStyle = '#e8b040'; g.beginPath(); g.arc(120, 66, 4, 0, TAU); g.fill();
  return p.texture({ wrap: false });
}

export interface Carousel { group: THREE.Group; lightsOn(): void; lit: number; update(dt: number, t: number): void }

/** The two-tier carousel: a turning platform of horses rising and falling, a striped canopy edged with bulbs. */
export function makeCarousel(rng: Rng): Carousel {
  const g = new THREE.Group();
  const R = 9.5;
  const gold = charToon({ color: 0xe8c060, rim: 0.6, emissive: new THREE.Color(0x3a2808) });
  const red = charToon({ color: 0xb8282a, rim: 0.5, emissive: new THREE.Color(0x2a0606) });
  const cream = charToon({ color: 0xf0e2c0, rim: 0.4, emissive: new THREE.Color(0x2a2418) });
  // the base and steps (still)
  g.add(cyl(R + 0.8, R + 1.0, 0.6, cream, 0, 0.3, 0, 40));
  const spin = new THREE.Group(); g.add(spin);
  // turning floor, the central column with mirrors and painted panels
  spin.add(cyl(R, R, 0.3, charToon({ color: 0x8a5a3a, rim: 0.3 }), 0, 0.75, 0, 40));
  const panels = new THREE.MeshLambertMaterial({ map: carouselPanels(), emissive: 0x3a2a10, emissiveIntensity: 0.6 });
  spin.add(mesh(repeatUV(new THREE.CylinderGeometry(2.6, 2.6, 4.4, 16, 1, true), 2, 1), panels, 0, 3.1, 0));
  spin.add(cyl(2.8, 2.8, 0.4, gold, 0, 5.4, 0, 16), cyl(2.8, 2.8, 0.4, gold, 0, 0.95, 0, 16));
  // upper tier: a second ring of horses on a balcony
  spin.add(cyl(R * 0.62, R * 0.62, 0.3, charToon({ color: 0x8a5a3a, rim: 0.3 }), 0, 5.7, 0, 32));
  spin.add(mesh(repeatUV(new THREE.CylinderGeometry(R * 0.63, R * 0.63, 0.7, 32, 1, true), 4, 1), panels, 0, 6.1, 0));
  spin.add(mesh(repeatUV(new THREE.CylinderGeometry(1.8, 1.8, 3.6, 12, 1, true), 1, 1), panels, 0, 7.6, 0));
  // the canopies: a broad striped cone with a scalloped hem, then a smaller one on top with a finial
  const stripes = new THREE.MeshLambertMaterial({ map: canopyStripes(), emissive: 0x3a2010, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const can = mesh(repeatUV(new THREE.ConeGeometry(R + 0.8, 2.6, 32, 1, true), 2, 1), stripes, 0, 6.0 + 4.0, 0); spin.add(can);
  spin.add(mesh(repeatUV(new THREE.CylinderGeometry(R + 0.8, R + 0.8, 0.9, 32, 1, true), 4, 1), panels, 0, 8.25, 0));
  const top = mesh(repeatUV(new THREE.ConeGeometry(R * 0.68, 2.4, 24, 1, true), 2, 1), stripes, 0, 9.0 + 3.6, 0); spin.add(top);
  spin.add(mesh(repeatUV(new THREE.CylinderGeometry(R * 0.68, R * 0.68, 0.6, 24, 1, true), 3, 1), panels, 0, 10.8, 0));
  spin.add(cyl(0.1, 0.25, 1.6, gold, 0, 14.4, 0, 8), mesh(new THREE.SphereGeometry(0.4, 12, 10), gold, 0, 15.3, 0));
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; spin.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), red, Math.cos(a) * (R + 0.8), 7.7, Math.sin(a) * (R + 0.8))); }
  // bulbs round both rims and up the canopy ribs
  const bulbPl: Placement[] = [];
  for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; bulbPl.push({ x: Math.cos(a) * (R + 0.95), y: 7.75, z: Math.sin(a) * (R + 0.95), scale: 1, rot: 0 }); }
  for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU; bulbPl.push({ x: Math.cos(a) * (R * 0.68 + 0.1), y: 10.5, z: Math.sin(a) * (R * 0.68 + 0.1), scale: 1, rot: 0 }); }
  for (let i = 0; i < 16; i++) for (let k = 1; k < 4; k++) { const a = (i / 16) * TAU, r = (R + 0.8) * (1 - k / 4); bulbPl.push({ x: Math.cos(a) * r, y: 8.7 + (k / 4) * 2.6, z: Math.sin(a) * r, scale: 0.8, rot: 0 }); }
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(1.2) });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), bulbMat, bulbPl.length);
  bulbPl.forEach((p, i) => bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(new THREE.Matrix4().makeScale(p.scale, p.scale, p.scale))));
  spin.add(bulbs);
  // horses on brass poles, in two rings, rising and falling as it turns
  const horses: { g: THREE.Group; phase: number; base: number }[] = [];
  const poleM = charToon({ color: 0xe8c878, rim: 0.7, emissive: new THREE.Color(0x3a2a10) });
  const horseTex = [0, 1, 2, 3].map((i) => horseTexture(311 + i));
  for (const [ring, n, yBase, h] of [[R - 1.4, 14, 1.0, 4.6], [R - 3.6, 10, 1.0, 4.6], [R * 0.62 - 1.2, 9, 5.85, 3.0]] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ring;
      const pole = mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), poleM, Math.cos(a) * ring, yBase + h / 2, Math.sin(a) * ring);
      spin.add(pole);
      const hg = new THREE.Group(); hg.position.set(Math.cos(a) * ring, yBase + 1.4, Math.sin(a) * ring); hg.rotation.y = -a; spin.add(hg);
      const m = new THREE.MeshLambertMaterial({ map: horseTex[(i + Math.round(ring)) % horseTex.length], alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x2a2010 });
      const card = mesh(new THREE.PlaneGeometry(2.3, 1.7), m, 0, 0, 0); card.rotation.y = Math.PI / 2; hg.add(card);
      // a body inside the card so it has some thickness from the front
      const body = mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 8), cream, 0, 0.05, 0); body.rotation.x = Math.PI / 2; hg.add(body);
      horses.push({ g: hg, phase: rng.range(0, TAU), base: yBase + 1.4 });
    }
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  bulbs.castShadow = false;
  let lit = 0.35, speed = 0.22, boost = 0;
  const c: Carousel = {
    group: g,
    lit,
    lightsOn() { boost = 6; },
    update(dt, t) {
      boost = Math.max(0, boost - dt);
      const target = boost > 0 ? 1 : 0.4;
      speed += ((boost > 0 ? 0.45 : 0.22) - speed) * Math.min(1, dt * 1.5);
      lit += (target - lit) * Math.min(1, dt * 2.5);
      c.lit = lit;
      spin.rotation.y += dt * speed;
      for (const h of horses) h.g.position.y = h.base + Math.sin(t * 2.2 + h.phase) * 0.45;
      // the bulbs chase round the rim
      bulbMat.color.setHex(0xffd890).multiplyScalar(0.7 + lit * 1.1 + Math.max(0, Math.sin(t * 6)) * 0.15 * lit);
      panels.emissiveIntensity = 0.3 + lit * 0.7;
      stripes.emissiveIntensity = 0.3 + lit * 0.6;
    },
  };
  return c;
}

export interface Butte extends BuiltSet {
  carousel: Carousel;
  phone: { group: THREE.Object3D; ring(): void };
  telescope: THREE.Vector3;
  gnomeSpot: { pos: THREE.Vector3; yaw: number };
}

export function buildButte(ctx: SetContext): Butte {
  const { road, lights } = ctx;
  const rng = new Rng(5150);
  const g = new THREE.Group();
  const arch = new THREE.Group(), decor = new THREE.Group(), live = new THREE.Group();
  g.add(arch, decor, live);
  const stone = new THREE.MeshLambertMaterial({ map: stepStone() });
  const stoneT = toonE(0xd8d0c0, 0.08);

  // ---------- the great steps ----------
  const n = 52, run = (STEPS.z0 - STEPS.z1) / n;
  const yTop = BUTTE.top - 0.4, yBot = SQUARE.y - 0.15;
  const rise = (yTop - yBot) / n;
  const arrows: Placement[] = [];
  for (let i = 0; i < n; i++) {
    const z = STEPS.z0 - (i + 0.5) * run, y = yTop - (i + 1) * rise;
    const st = mesh(repeatUV(new THREE.BoxGeometry(STEPS.halfW * 2, rise + 0.6, run + 0.02), STEPS.halfW, 1), stone, STEPS.x, y - 0.3 + rise / 2, z);
    st.receiveShadow = true;
    arch.add(st);
    if (i % 6 === 2) arrows.push({ x: STEPS.x + (i % 12 === 2 ? -1.6 : 1.4), y: y + rise / 2 + 0.02, z, scale: 1, rot: 0 });
  }
  // balustrades with lamps along both sides
  const lampPl: Placement[] = [];
  for (const s of [-1, 1]) {
    const x = STEPS.x + s * (STEPS.halfW + 0.4);
    const len = Math.hypot(STEPS.z0 - STEPS.z1, yTop - yBot);
    const bal = mesh(new THREE.BoxGeometry(0.8, 1.2, len), stoneT, x, (yTop + yBot) / 2 + 0.6, (STEPS.z0 + STEPS.z1) / 2);
    bal.rotation.x = -Math.atan2(yTop - yBot, STEPS.z0 - STEPS.z1);
    arch.add(bal);
    const wall = mesh(new THREE.BoxGeometry(0.8, 4, len), stoneT, x, (yTop + yBot) / 2 - 1.6, (STEPS.z0 + STEPS.z1) / 2);
    wall.rotation.x = bal.rotation.x; arch.add(wall);
    for (let k = 0; k <= 4; k++) { const t = k / 4; lampPl.push({ x, y: lerp(yTop, yBot, t) + 1.2, z: lerp(STEPS.z0, STEPS.z1, t), scale: 0.9, rot: 0 }); }
  }
  // the blue chalk arrows on the steps
  {
    const am = new THREE.MeshBasicMaterial({ map: chalkArrow(), transparent: true, depthWrite: false, color: new THREE.Color(0x9ad0ff).multiplyScalar(1.1) });
    for (const a of arrows) { const m = mesh(new THREE.PlaneGeometry(1.4, 1.4), am, a.x, a.y, a.z); m.rotation.x = -Math.PI / 2; m.userData.keep = true; decor.add(m); }
  }
  // the parvis edge: a stone balustrade with the coin telescope
  const telescope = new THREE.Vector3(STEPS.x + 9, yTop, STEPS.z0 + 3);
  {
    for (const s of [-1, 1]) for (let k = 0; k < 8; k++) arch.add(box(0.6, 1.1, 0.6, stoneT, STEPS.x + s * (STEPS.halfW + 2 + k * 3.2), yTop + 0.55, STEPS.z0 + 1.2));
    const ts = new THREE.Group(); ts.position.copy(telescope); ts.rotation.y = Math.PI; decor.add(ts);
    const green = charToon({ color: 0x2f5a3a, rim: 0.5 });
    ts.add(cyl(0.25, 0.4, 1.4, green, 0, 0.7, 0, 10), cyl(0.3, 0.3, 0.2, green, 0, 1.45, 0, 10));
    const tube = mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 12), green, 0, 1.75, 0.2); tube.rotation.x = Math.PI / 2 - 0.2; ts.add(tube);
    ts.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), green, 0, 1.75, -0.4));
  }
  // lamps round the square
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; lampPl.push({ x: SQUARE.x + Math.cos(a) * (SQUARE.r - 2), y: SQUARE.y, z: SQUARE.z + Math.sin(a) * (SQUARE.r - 2), scale: 1, rot: 0 }); }
  decor.add(parisLamps(lampPl));
  // gravel on the square and benches
  {
    const sq = mesh(new THREE.CircleGeometry(SQUARE.r + 4, 48), new THREE.MeshLambertMaterial({ map: stepStone(309) }), SQUARE.x, SQUARE.y + 0.04, SQUARE.z);
    sq.rotation.x = -Math.PI / 2; (sq.material as THREE.MeshLambertMaterial).map!.repeat.set(8, 8); sq.receiveShadow = true; arch.add(sq);
    for (const a of [0.6, 2.2, 3.6, 4.6]) { const b = bench(1.2); b.position.set(SQUARE.x + Math.cos(a) * (SQUARE.r - 4), SQUARE.y, SQUARE.z + Math.sin(a) * (SQUARE.r - 4)); b.rotation.y = -a - Math.PI / 2; decor.add(b); }
  }
  // trees in the gardens either side of the steps
  {
    const trees: Placement[] = [];
    for (let i = 0; i < 70; i++) {
      const s = rng.sign(), x = STEPS.x + s * rng.range(STEPS.halfW + 4, STEPS.halfW + 40), z = rng.range(STEPS.z1 - 6, STEPS.z0 + 4);
      if (Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r + 3) continue;
      trees.push({ x, y: butteHeight(x, z) - 0.2, z, scale: rng.range(1.0, 1.6), rot: rng.range(0, TAU) });
    }
    decor.add(fluffyForest({ shape: 'round', trunk: 0x3a2e24, leaves: [0x2f5a2a, 0x3a6a32, 0x2a4a28] }, trees, rng, { castShadow: true, variants: 3 }));
  }

  // ---------- the carousel ----------
  const carousel = makeCarousel(rng);
  carousel.group.position.set(SQUARE.x - 10, SQUARE.y, SQUARE.z - 4);
  live.add(carousel.group);

  // ---------- the phone box, ringing ----------
  const phone = new THREE.Group();
  const ph = { t: -1 };
  let handset: THREE.Object3D;
  {
    phone.position.set(SQUARE.x + 14, SQUARE.y, SQUARE.z + 6); phone.rotation.y = -Math.PI / 2 - 0.4; live.add(phone);
    const frame = charToon({ color: 0x8a949a, rim: 0.4 }), white = toonE(0xf0ece4, 0.15);
    phone.add(box(1.5, 0.15, 1.5, frame, 0, 0.08, 0));
    for (const x of [-0.7, 0.7]) for (const z of [-0.7, 0.7]) phone.add(box(0.1, 2.9, 0.1, frame, x, 1.45, z));
    phone.add(box(1.6, 0.4, 1.6, white, 0, 3.0, 0));
    const sign = new Painter(256, 48, 315).fill('#1e3a6a');
    sign.g.fillStyle = '#f4f0e0'; sign.g.font = 'bold 30px Georgia, serif'; sign.g.textAlign = 'center'; sign.g.textBaseline = 'middle'; sign.g.fillText('TÉLÉPHONE', 128, 26);
    phone.add(mesh(new THREE.PlaneGeometry(1.4, 0.3), new THREE.MeshBasicMaterial({ map: sign.texture({ wrap: false }) }), 0, 3.0, 0.81));
    const glass = new THREE.MeshLambertMaterial({ color: 0xc8e0e0, transparent: true, opacity: 0.28, emissive: 0x405050, depthWrite: false });
    for (const [x, z, ry] of [[0, -0.7, 0], [-0.7, 0, Math.PI / 2], [0.7, 0, Math.PI / 2]] as const) phone.add(mesh(new THREE.PlaneGeometry(1.4, 2.6), glass, x, 1.45, z).rotateY(ry));
    phone.add(box(0.5, 0.7, 0.25, toonE(0x2a2a30, 0.1), 0, 1.6, -0.55));
    handset = box(0.12, 0.45, 0.1, toonE(0x1a1a1e, 0.1), 0.2, 1.65, -0.4); phone.add(handset);
    phone.add(mesh(new THREE.PlaneGeometry(1.2, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0a0).multiplyScalar(1.3) }), 0, 2.75, 0.82));
  }

  // ---------- the city below, its windows lighting up ----------
  {
    const f = facadeMaterial({ wall: 0xc8b8a0, bays: 6, storeys: 6, lit: 0.55, glass: 'night', seed: 320 }, 1.1);
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const n2 = 240;
    const im = new THREE.InstancedMesh(geo, f, n2), rf = new THREE.InstancedMesh(geo, zincMat(), n2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let i = 0, tries = 0;
    while (i < n2 && tries < 4000) {
      tries++;
      const x = rng.range(-220, 180), z = rng.range(-930, -1150);
      const w = BAY * 6, h = STOREY * 6 + rng.range(-3, 3);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.pick([0, Math.PI / 2]) + rng.range(-0.1, 0.1));
      p.set(x, CITY_Y, z); s.set(w, h, w); m.compose(p, q, s); im.setMatrixAt(i, m);
      p.set(x, CITY_Y + h, z); s.set(w * 0.86, 3.2, w * 0.86); m.compose(p, q, s); rf.setMatrixAt(i, m);
      i++;
    }
    im.count = rf.count = i;
    im.instanceMatrix.needsUpdate = true; rf.instanceMatrix.needsUpdate = true;
    decor.add(im, rf);
  }

  // ---------- light ----------
  const uIn = road.u(STEPS.z0 + 30), uOut = road.u(SETS.butte.z1);
  const carLight = { from: road.u(STEPS.z1 + 20), to: uOut, pos: carousel.group.position.clone().add(new THREE.Vector3(0, 6, 0)), color: 0xffc070, intensity: 60, distance: 40 };
  lights.add(carLight);
  lights.add({ from: uIn, to: road.u(STEPS.z1 + 10), pos: new THREE.Vector3(STEPS.x, (yTop + yBot) / 2 + 6, (STEPS.z0 + STEPS.z1) / 2), color: 0xffd090, intensity: 36, distance: 40 });

  optimize(arch);
  optimize(decor);

  void css; void PAL; void glow; void clamp; void Y;
  return {
    id: 'butte', group: g, show: [road.u(SETS.butte.z0 + 60), road.u(-906)], occluders: [arch], subjects: [],
    floor: (x, z) => butteHeight(x, z),
    carousel,
    phone: { group: phone, ring() { ph.t = 0; } },
    telescope,
    gnomeSpot: { pos: new THREE.Vector3(SQUARE.x + 14.8, SQUARE.y, SQUARE.z + 8.2), yaw: -Math.PI / 2 },
    update(dt, t) {
      carousel.update(dt, t);
      lights.boost.set(carLight, 0.5 + carousel.lit * 0.9);
      // the phone rings in bursts; when called it rings hard and the handset jumps
      if (ph.t >= 0) { ph.t += dt; if (ph.t > 3) ph.t = -1; }
      const ringing = ph.t >= 0 ? 1 : (Math.sin(t * 0.8) > 0.7 ? 0.4 : 0);
      handset.position.y = 1.65 + Math.max(0, Math.sin(t * 40)) * 0.04 * ringing;
      handset.rotation.z = Math.sin(t * 37) * 0.08 * ringing;
    },
  };
}
