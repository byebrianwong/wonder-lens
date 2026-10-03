import * as THREE from 'three';
import { box, cyl, glow, mesh } from '../../../engine/Builders';
import { charToon, Painter, repeatUV } from '../../../engine/Paint';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { envelope } from '../../../engine/Rig';
import { SETS, Y } from '../layout';
import { optimize, type BuiltSet, type SetContext } from '../common';
import { tiled } from '../buildings';
import { enamelLamp, toonE } from '../props';
import { boards, css, damask, PAL } from '../textures';
import { lightShaft } from '../lens';

/*
 * Amélie's bedroom at dusk, at twice life size: red walls, a green lamp, the two animal paintings over the bed
 * that talk to each other at night, the pig lamp on the bedside table, a television flickering in black and
 * white, and Nino's album open on the bed with its torn photo-booth pictures drifting up and out of the open
 * window. The moped rides across the room and out of the window.
 */

export const ROOM = { z0: -452, z1: -528, hw: 12, h: 11 };

/** A painted portrait of an animal in a frame, in the style of the paintings over Amélie's bed. */
function animalPortrait(kind: 'dog' | 'goose', pose: 'rest' | 'talk' | 'turn') {
  const p = new Painter(256, 320, kind === 'dog' ? 131 : 133);
  const g = p.g;
  // a warm dusky landscape behind
  p.vgrad(kind === 'dog' ? [[0, '#3a5a5a'], [0.55, '#b8a070'], [1, '#4a5a2a']] : [[0, '#5a3a4a'], [0.5, '#e0a060'], [1, '#3a4a2a']]);
  p.dabs({ n: 40, colors: ['#2a3a1a', '#5a6a3a', '#e8c080'], r: [6, 26], alpha: [0.08, 0.2], y: [0.55, 1] });
  const turn = pose === 'turn' ? (kind === 'dog' ? 1 : -1) * 18 : 0;
  const cx = 128 + turn, cy = 150;
  if (kind === 'dog') {
    // a serious terrier in a lace ruff
    g.fillStyle = '#f4eee0';
    for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; g.beginPath(); g.ellipse(128 + Math.cos(a) * 52, 236 + Math.sin(a) * 12, 18, 12, a, 0, TAU); g.fill(); }
    g.fillStyle = '#c8a070'; g.beginPath(); g.ellipse(128, 250, 70, 50, 0, Math.PI, TAU); g.fill();
    g.fillStyle = '#d8b080'; g.beginPath(); g.ellipse(cx, cy, 56, 64, 0, 0, TAU); g.fill();
    g.fillStyle = '#8a5a30';
    g.beginPath(); g.ellipse(cx - 50, cy - 20, 18, 40, 0.3, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(cx + 50, cy - 20, 18, 40, -0.3, 0, TAU); g.fill();
    g.fillStyle = '#f0e0c0'; g.beginPath(); g.ellipse(cx + turn * 0.3, cy + 30, 30, 26, 0, 0, TAU); g.fill();
    g.fillStyle = '#2a1a14'; g.beginPath(); g.ellipse(cx + turn * 0.4, cy + 16, 12, 9, 0, 0, TAU); g.fill();
    for (const s of [-1, 1]) { g.fillStyle = '#1a1210'; g.beginPath(); g.arc(cx + s * 20 + turn * 0.3, cy - 10, 6, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + s * 20 + turn * 0.3 + 2, cy - 12, 2, 0, TAU); g.fill(); }
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 3;
    g.beginPath();
    if (pose === 'talk') { g.fillStyle = '#6a1a1a'; g.ellipse(cx + turn * 0.3, cy + 42, 12, 9, 0, 0, TAU); g.fill(); }
    else { g.moveTo(cx - 12 + turn * 0.3, cy + 40); g.quadraticCurveTo(cx + turn * 0.3, cy + 44, cx + 12 + turn * 0.3, cy + 40); g.stroke(); }
  } else {
    // a goose in a red scarf, looking prim
    g.fillStyle = '#f4f0e6'; g.beginPath(); g.ellipse(128, 270, 80, 56, 0, Math.PI, TAU); g.fill();
    g.strokeStyle = '#f4f0e6'; g.lineWidth = 34; g.lineCap = 'round';
    g.beginPath(); g.moveTo(128, 250); g.quadraticCurveTo(120, 190, cx, cy - 10); g.stroke();
    g.fillStyle = '#c8282a'; g.beginPath(); g.ellipse(124, 214, 30, 14, -0.2, 0, TAU); g.fill(); g.fillRect(126, 214, 14, 40);
    g.fillStyle = '#f4f0e6'; g.beginPath(); g.ellipse(cx, cy - 30, 34, 30, 0, 0, TAU); g.fill();
    const dir = pose === 'turn' ? -1 : 1;
    g.fillStyle = '#f0a020'; g.beginPath(); g.moveTo(cx + dir * 20, cy - 34); g.lineTo(cx + dir * 64, cy - 26 + (pose === 'talk' ? -4 : 0)); g.lineTo(cx + dir * 22, cy - 18); g.fill();
    if (pose === 'talk') { g.beginPath(); g.moveTo(cx + dir * 22, cy - 22); g.lineTo(cx + dir * 58, cy - 14); g.lineTo(cx + dir * 20, cy - 14); g.fill(); }
    g.fillStyle = '#1a1210'; g.beginPath(); g.arc(cx + dir * 10, cy - 40, 5, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + dir * 11, cy - 42, 1.8, 0, TAU); g.fill();
  }
  // varnish and craquelure
  p.dabs({ n: 30, colors: ['#3a2a10'], r: [10, 40], alpha: [0.03, 0.07] });
  p.lines({ n: 30, colors: ['#2a1a0a'], alpha: [0.05, 0.1], width: [0.5, 1], wobble: 6 });
  return p.texture({ wrap: false });
}

/** A strip of four photo-booth pictures, torn and taped back together (Nino's album). */
function photoStrip(seed: number) {
  const p = new Painter(64, 220, seed).fill('#f4f0e6');
  const g = p.g, rng = p.rng;
  const skin = rng.pick(['#e8c0a0', '#d8a888', '#c89070', '#f0d0b8']);
  const hair = rng.pick(['#2a1a14', '#6a4a2a', '#b89060', '#1a1a1a', '#e8e0d0']);
  const bald = rng.chance(0.25);
  for (let k = 0; k < 4; k++) {
    const y = 6 + k * 53;
    g.fillStyle = rng.pick(['#8a8a80', '#a09a88', '#7a8a8a']); g.fillRect(5, y, 54, 48);
    g.fillStyle = '#3a3a3a'; g.beginPath(); g.ellipse(32, y + 52, 20, 14, 0, Math.PI, TAU); g.fill();
    g.fillStyle = skin; g.beginPath(); g.ellipse(32 + rng.range(-3, 3), y + 24, 12, 15, 0, 0, TAU); g.fill();
    if (!bald) { g.fillStyle = hair; g.beginPath(); g.ellipse(32, y + 14, 13, 8, 0, Math.PI, TAU); g.fill(); }
    g.fillStyle = '#1a1a1a'; g.fillRect(26, y + 22, 3, 3); g.fillRect(35, y + 22, 3, 3);
    g.fillRect(29, y + 31, 6, 1.5);
  }
  // torn across the middle and taped
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 110); for (let x = 0; x <= 64; x += 6) g.lineTo(x, 108 + rng.range(-4, 4)); g.stroke();
  g.fillStyle = 'rgba(255,250,220,0.55)'; g.fillRect(20, 100, 24, 18);
  // a black and white photo look
  const img = g.getImageData(0, 0, 64, 220);
  for (let i = 0; i < img.data.length; i += 4) { const l = img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11; img.data[i] = l * 1.04; img.data[i + 1] = l; img.data[i + 2] = l * 0.9; }
  g.putImageData(img, 0, 0);
  return p.texture({ wrap: false });
}

/** A woven rug: bands of red, orange and green with a fringe. */
function rug(seed = 135) {
  const p = new Painter(256, 384, seed).fill('#8a2a1a');
  const g = p.g;
  const bands = ['#c84a2a', '#e8a040', '#2f5a3a', '#f0d8a0', '#6a1a14', '#e8a040', '#2f5a3a'];
  for (let i = 0; i < 14; i++) { g.fillStyle = bands[i % bands.length]; g.fillRect(20, 20 + i * 25, 216, 12); }
  for (let i = 0; i < 9; i++) { g.fillStyle = '#f0d8a0'; g.beginPath(); g.moveTo(128, 40 + i * 38); g.lineTo(150, 58 + i * 38); g.lineTo(128, 76 + i * 38); g.lineTo(106, 58 + i * 38); g.fill(); }
  g.strokeStyle = '#f0e0c0'; g.lineWidth = 2; for (let x = 0; x < 256; x += 5) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 16); g.moveTo(x, 368); g.lineTo(x, 384); g.stroke(); }
  p.lines({ n: 80, colors: ['rgba(0,0,0,1)', 'rgba(255,255,255,1)'], alpha: [0.04, 0.08], width: [1, 2], wobble: 1 });
  return p.texture({ wrap: false });
}

export interface Bedroom extends BuiltSet {
  /** the two paintings over the bed: chatter() makes them turn to each other and talk */
  paintings: { group: THREE.Object3D; chatter(): void; talking(): boolean };
  /** the pig lamp: react() makes it look round and switch itself off for a moment */
  pig: { group: THREE.Object3D; react(): void; busy(): boolean };
  /** where Amélie's album lies on the bed */
  album: THREE.Vector3;
  window: THREE.Vector3;
}

export function buildBedroom(ctx: SetContext): Bedroom {
  const { road, lights, camera } = ctx;
  const rng = new Rng(777);
  const g = new THREE.Group();
  const arch = new THREE.Group(), decor = new THREE.Group(), live = new THREE.Group();
  g.add(arch, decor, live);
  const y0 = Y.bedroom, HW = ROOM.hw, H = ROOM.h, z0 = ROOM.z0, z1 = ROOM.z1;
  const zc = (z0 + z1) / 2, D = z0 - z1;

  const wallM = new THREE.MeshLambertMaterial({ map: damask(0xc02a24, 0x6a1010, 137), emissive: 0x200404 });
  const skirt = toonE(0x2f4a2a, 0.08);
  const floorM = new THREE.MeshLambertMaterial({ map: boards(0xa87040, 139) });
  const ceilM = toonE(0xf0e0c0, 0.1);
  const wood = charToon({ color: 0x5a3420, rim: 0.3, emissive: new THREE.Color(0x140804) });
  const green = charToon({ color: 0x2f6a3a, rim: 0.4, emissive: new THREE.Color(0x061a0a) });
  const gilt = charToon({ color: 0xc89a40, rim: 0.6, emissive: new THREE.Color(0x2a1a04) });

  // ---------- the room ----------
  const floor = tiled(HW * 2, 0.4, D + 8, floorM, 4, 4, 0, y0 - 0.2, zc + 4); floor.receiveShadow = true; arch.add(floor);
  for (const s of [-1, 1]) {
    arch.add(tiled(0.4, H, D + 8, wallM, 2.6, 2.6, s * HW, y0 + H / 2, zc + 4));
    decor.add(box(0.2, 0.5, D + 8, skirt, s * (HW - 0.25), y0 + 0.25, zc + 4));
  }
  arch.add(tiled(HW * 2, 0.4, D + 8, ceilM, 4, 4, 0, y0 + H + 0.2, zc + 4));
  decor.add(box(HW * 2, 0.5, 0.5, toonE(0xe8d4b0, 0.1), 0, y0 + H - 0.2, z1 + 0.3));
  arch.add(tiled(HW * 2, H, 0.4, wallM, 2.6, 2.6, 0, y0 + H / 2, z0 + 8));
  // the window wall: French windows open onto the evening, with net curtains that blow in
  const winW = 3.4, winH = 8.4;
  for (const s of [-1, 1]) arch.add(tiled(HW - winW, H, 0.6, wallM, 2.6, 2.6, s * (winW + (HW - winW) / 2), y0 + H / 2, z1));
  arch.add(tiled(winW * 2, H - winH, 0.6, wallM, 2.6, 2.6, 0, y0 + winH + (H - winH) / 2, z1));
  // frames, and the two glazed leaves swung open
  const frameM = toonE(0xf4ead8, 0.12);
  decor.add(box(winW * 2 + 0.6, 0.4, 0.8, frameM, 0, y0 + winH + 0.2, z1));
  for (const s of [-1, 1]) decor.add(box(0.4, winH, 0.8, frameM, s * (winW + 0.2), y0 + winH / 2, z1));
  const glassM = new THREE.MeshLambertMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.25, emissive: 0x402010, depthWrite: false });
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group(); leaf.position.set(s * winW, y0, z1 - 0.3); leaf.rotation.y = -s * 1.9; decor.add(leaf);
    leaf.add(box(0.15, winH, 0.15, frameM, 0, winH / 2, 0), box(0.15, winH, 0.15, frameM, -s * winW, winH / 2, 0));
    for (let k = 0; k <= 3; k++) leaf.add(box(winW, 0.15, 0.15, frameM, -s * winW / 2, (k / 3) * winH, 0));
    leaf.add(mesh(new THREE.PlaneGeometry(winW, winH), glassM, -s * winW / 2, winH / 2, 0));
  }
  // the little balcony outside, its rail open where the moped goes
  decor.add(box(winW * 2 + 2, 0.25, 2.2, toonE(0xd8c8a8, 0.08), 0, y0 - 0.1, z1 - 1.4));
  // net curtains that billow in the evening air (animated)
  const curtains: THREE.Mesh[] = [];
  {
    const tex = new Painter(128, 256, 141).fill('#f8f0e0');
    tex.lines({ n: 40, colors: ['#e8dcc8', '#fffaf0'], alpha: [0.3, 0.6], width: [1, 3], vertical: true, wobble: 2 });
    const cm = new THREE.MeshLambertMaterial({ map: tex.texture(), transparent: true, opacity: 0.72, side: THREE.DoubleSide, emissive: 0x4a3018, depthWrite: false });
    for (const s of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(2.6, winH + 1, 8, 12);
      const c = new THREE.Mesh(geo, cm);
      c.position.set(s * (winW - 0.9), y0 + winH / 2 + 0.2, z1 + 0.8);
      c.userData.base = (geo.attributes.position as THREE.BufferAttribute).array.slice();
      c.userData.side = s;
      live.add(c); curtains.push(c);
    }
  }
  // the evening light streams in through the window
  decor.add(lightShaft(new THREE.Vector3(0, y0 + winH - 0.5, z1 - 1), new THREE.Vector3(0, y0, z1 + 18), 7, 0xffb070, 0.16));

  // ---------- the bed, the paintings, the pig lamp ----------
  const bedX = -HW + 5.4, bedZ = -478;
  {
    const bed = new THREE.Group(); bed.position.set(bedX, y0, bedZ); decor.add(bed);
    bed.add(box(8.2, 0.9, 11, wood, 0, 0.75, 0));
    const matt = mesh(new THREE.CapsuleGeometry(0.55, 7.0, 4, 12), toonE(0xf4ead8, 0.1), 0, 1.6, 0); matt.rotation.z = Math.PI / 2; matt.scale.set(1, 1, 9.6); bed.add(matt);
    // the red quilt, soft at the edges and hanging over the sides in folds
    const quilt = new THREE.MeshLambertMaterial({ map: damask(0xd03a30, 0x8a1a18, 143), side: THREE.DoubleSide, emissive: 0x2a0806 });
    const qGeo = new THREE.PlaneGeometry(10.4, 9.6, 40, 36);
    const qp = qGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < qp.count; i++) {
      const x = qp.getX(i), y = qp.getY(i);
      const over = Math.max(0, Math.abs(x) - 4.1);
      // flat on top, draping down past the mattress edge, with a few soft folds and a turned-down top
      const drop = Math.min(over, 1.6) * 1.0;
      const fold = Math.sin(y * 1.3 + x * 0.4) * 0.08 + (over > 0 ? Math.sin(y * 2.2) * 0.12 * over : 0);
      qp.setXYZ(i, Math.sign(x) * Math.min(Math.abs(x), 4.1 + Math.max(0, over - 1.6) * 0.2 + Math.min(over, 1.6) * 0.15), y, 2.2 - drop + fold);
    }
    qGeo.computeVertexNormals();
    const q = new THREE.Mesh(qGeo, quilt); q.rotation.x = -Math.PI / 2; q.position.set(0, 0, 0.9); bed.add(q);
    bed.add(mesh(new THREE.CapsuleGeometry(0.35, 7.4, 4, 10), toonE(0xf0e2c8, 0.12), 0, 2.3, -3.7).rotateZ(Math.PI / 2));
    for (const s of [-1, 1]) { const pil = mesh(new THREE.SphereGeometry(1, 16, 10), toonE(0xf0e6d0, 0.15), s * 2, 2.5, -4.4); pil.scale.set(1.7, 0.5, 0.9); bed.add(pil); }
    // iron bedstead with brass knobs
    const ironM = charToon({ color: 0x2a2a28, rim: 0.4 });
    bed.add(box(8.6, 0.16, 0.16, ironM, 0, 4.4, -5.5), box(8.6, 0.16, 0.16, ironM, 0, 2.2, -5.5));
    for (let k = 0; k <= 8; k++) bed.add(cyl(0.07, 0.07, 4.4, ironM, -4.2 + k * 1.05, 2.2, -5.5, 6));
    for (const s of [-1, 1]) bed.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), gilt, s * 4.3, 4.6, -5.5));
    bed.rotation.y = Math.PI / 2;
  }
  const paintings = new THREE.Group(); paintings.position.set(-HW + 0.3, y0 + 7.4, bedZ); paintings.rotation.y = Math.PI / 2; live.add(paintings);
  const portraitTex = { dog: { rest: animalPortrait('dog', 'rest'), talk: animalPortrait('dog', 'talk'), turn: animalPortrait('dog', 'turn') }, goose: { rest: animalPortrait('goose', 'rest'), talk: animalPortrait('goose', 'talk'), turn: animalPortrait('goose', 'turn') } };
  const canv: Record<'dog' | 'goose', THREE.MeshLambertMaterial> = {
    dog: new THREE.MeshLambertMaterial({ map: portraitTex.dog.rest, emissive: 0x2a1a0a }),
    goose: new THREE.MeshLambertMaterial({ map: portraitTex.goose.rest, emissive: 0x2a1a0a }),
  };
  for (const [kind, x] of [['dog', -2.8], ['goose', 2.8]] as const) {
    paintings.add(mesh(new THREE.PlaneGeometry(3.6, 4.5), canv[kind], x, 0, 0.12));
    paintings.add(box(4.2, 0.35, 0.3, gilt, x, 2.4, 0), box(4.2, 0.35, 0.3, gilt, x, -2.4, 0), box(0.35, 5.1, 0.3, gilt, x - 2.0, 0, 0), box(0.35, 5.1, 0.3, gilt, x + 2.0, 0, 0));
  }
  let chatterT = -1;
  // bedside table with the pig lamp, on the window side of the bed
  const pig = new THREE.Group();
  const pigShadeOn = glow(0xffc8b0, 1.5), pigShadeOff = toonE(0xd8a8a0, 0.05);
  const pigShade = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(new THREE.CylinderGeometry(0.75, 1.15, 1.1, 20, 1, true), pigShadeOn);
  let pigHead: THREE.Group, pigArm: THREE.Group;
  {
    const nt = new THREE.Group(); nt.position.set(-HW + 2.4, y0, bedZ - 8.5); decor.add(nt);
    nt.add(box(3.2, 2.6, 2.8, wood, 0, 1.3, 0));
    nt.add(box(3.4, 0.2, 3.0, wood, 0, 2.7, 0));
    pig.position.set(-HW + 2.4, y0 + 2.8, bedZ - 8.5); pig.rotation.y = Math.PI / 2 + 0.4; live.add(pig);
    const pink = charToon({ color: 0xf0a8a8, rim: 0.6, shade: 0xb07890, emissive: new THREE.Color(0x3a1010) });
    const body = mesh(new THREE.SphereGeometry(1, 20, 14), pink, 0, 0.9, 0); body.scale.set(0.75, 0.9, 0.7); pig.add(body);
    for (const s of [-1, 1]) { const leg = mesh(new THREE.CapsuleGeometry(0.2, 0.3, 4, 8), pink, s * 0.4, 0.2, 0.25); leg.rotation.x = Math.PI / 2; pig.add(leg); }
    pigHead = new THREE.Group(); pigHead.position.set(0, 1.85, 0.1); pig.add(pigHead);
    const head = mesh(new THREE.SphereGeometry(0.62, 20, 14), pink); head.scale.set(1, 0.92, 0.95); pigHead.add(head);
    const snout = mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.22, 16), pink, 0, -0.08, 0.6); snout.rotation.x = Math.PI / 2; pigHead.add(snout);
    for (const s of [-1, 1]) {
      pigHead.add(mesh(new THREE.SphereGeometry(0.05, 6, 5), toonE(0x5a2a2a, 0.1), s * 0.09, -0.08, 0.72));
      pigHead.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), toonE(0x1a1010, 0), s * 0.26, 0.14, 0.52));
      const ear = mesh(new THREE.ConeGeometry(0.2, 0.36, 6), pink, s * 0.38, 0.5, 0.05); ear.rotation.set(0.4, 0, -s * 0.6); pigHead.add(ear);
    }
    // the lampshade it wears on its head
    pigShade.position.set(0, 0.95, 0); pigHead.add(pigShade);
    pigHead.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), glow(0xfff0d0, 1.8), 0, 0.85, 0));
    pigArm = new THREE.Group(); pigArm.position.set(0.55, 1.25, 0.1); pig.add(pigArm);
    const arm = mesh(new THREE.CapsuleGeometry(0.15, 0.5, 4, 8), pink, 0, -0.35, 0); pigArm.add(arm);
    pigArm.rotation.z = 0.4;
    // the pull cord hanging from the shade
    pigHead.add(cyl(0.015, 0.015, 0.9, toonE(0xe8d8b8, 0.2), 0.6, 0.2, 0.2, 4));
  }
  let pigT = -1;

  // ---------- television, dresser, wardrobe, the green lamp, a gramophone ----------
  const tvTex = { canvas: document.createElement('canvas'), tex: null as THREE.CanvasTexture | null, next: 0 };
  // its own seeded noise, so a picture of the room is the same on every run
  const tvNoise = new Rng(779);
  {
    tvTex.canvas.width = 128; tvTex.canvas.height = 96;
    tvTex.tex = new THREE.CanvasTexture(tvTex.canvas); tvTex.tex.colorSpace = THREE.SRGBColorSpace;
    const tv = new THREE.Group(); tv.position.set(HW - 3.2, y0, -466); tv.rotation.y = -Math.PI / 2 + 0.3; decor.add(tv);
    tv.add(box(2.4, 2.4, 2.0, wood, 0, 1.2, 0));
    tv.add(box(3.4, 2.8, 2.6, charToon({ color: 0x6a4a2a, rim: 0.3 }), 0, 3.8, 0));
    const screen = mesh(new THREE.PlaneGeometry(2.4, 1.9), new THREE.MeshBasicMaterial({ map: tvTex.tex }), -0.2, 3.9, 1.31);
    screen.userData.keep = true; tv.add(screen);
    for (const s of [-1, 1]) { const ant = mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 4), toonE(0xc8c8c0, 0.2), s * 0.6, 6.2, 0); ant.rotation.z = s * 0.5; tv.add(ant); }
  }
  {
    const dr = new THREE.Group(); dr.position.set(HW - 1.8, y0, -490); dr.rotation.y = -Math.PI / 2; decor.add(dr);
    dr.add(box(6, 3.4, 2.6, wood, 0, 1.7, 0));
    for (let k = 0; k < 3; k++) dr.add(box(5.4, 0.9, 0.1, charToon({ color: 0x6a4028, rim: 0.3 }), 0, 0.7 + k * 1.05, 1.32));
    dr.add(mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshLambertMaterial({ color: 0xc8c0a8, emissive: 0x2a2a20 }), 0, 6.0, -0.9));
    dr.add(mesh(new THREE.TorusGeometry(1.85, 0.15, 8, 24), gilt, 0, 6.0, -0.9));
    // a vase of flowers and a framed photograph
    dr.add(cyl(0.35, 0.25, 1.0, charToon({ color: 0x2f6a5a, rim: 0.5 }), -2, 3.9, 0, 10));
    for (let k = 0; k < 7; k++) dr.add(mesh(new THREE.IcosahedronGeometry(0.22, 1), charToon({ color: [0xe8304a, 0xf6d040, 0xf4f0f0][k % 3], rim: 0.4 }), -2 + Math.cos(k) * 0.4, 4.7 + (k % 2) * 0.3, Math.sin(k) * 0.4));
    dr.add(box(0.9, 1.2, 0.1, gilt, 1.6, 4.0, -0.2));
  }
  {
    const wd = new THREE.Group(); wd.position.set(HW - 2.2, y0, -515); wd.rotation.y = -Math.PI / 2; decor.add(wd);
    wd.add(box(7, 9.4, 3.4, wood, 0, 4.7, 0));
    wd.add(box(0.08, 8.6, 0.1, charToon({ color: 0x2a1408, rim: 0.2 }), 0, 4.8, 1.72));
    for (const s of [-1, 1]) wd.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), gilt, s * 0.4, 4.8, 1.78));
  }
  const lamp = enamelLamp(3.2, 3.4, 0x2a6a3a); lamp.position.set(0, y0 + H, -486); decor.add(lamp);
  // a rug under it all
  const rugM = mesh(new THREE.PlaneGeometry(12, 18), new THREE.MeshLambertMaterial({ map: rug() }), 0, y0 + 0.02, -484);
  rugM.rotation.x = -Math.PI / 2; rugM.receiveShadow = true; decor.add(rugM);
  // Nino's album open on the bed
  const album = new THREE.Vector3(bedX + 1, y0 + 2.8, bedZ);
  {
    const ab = new THREE.Group(); ab.position.copy(album); ab.rotation.y = 0.3; decor.add(ab);
    ab.add(box(3.2, 0.25, 2.2, charToon({ color: 0x8a1a1a, rim: 0.3 }), 0, 0, 0));
    for (const s of [-1, 1]) ab.add(box(1.5, 0.05, 2.0, toonE(0xf4f0e6, 0.15), s * 0.78, 0.15, 0));
  }

  // ---------- photo-booth pictures fluttering out of the album and away through the window ----------
  const photos: { m: THREE.Mesh; seed: number; phase: number }[] = [];
  {
    const n = 16;
    const tex = Array.from({ length: 6 }, (_, i) => photoStrip(151 + i));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.9), new THREE.MeshLambertMaterial({ map: tex[i % tex.length], side: THREE.DoubleSide, emissive: 0x3a3020 }));
      m.userData.keep = true;
      live.add(m);
      photos.push({ m, seed: rng.range(0, 100), phase: i / n });
    }
  }

  // ---------- light ----------
  const uIn = road.u(z0 + 4), uOut = road.u(SETS.bedroom.z1 - 6);
  const pigLight = { from: uIn, to: uOut, pos: new THREE.Vector3(-HW + 2.8, y0 + 5.2, bedZ - 8), color: 0xffa890, intensity: 28, distance: 18 };
  lights.add(pigLight);
  lights.add({ from: uIn, to: uOut, pos: new THREE.Vector3(0, y0 + H - 4.5, -486), color: 0xd8f0a0, intensity: 40, distance: 26 });
  lights.add({ from: uIn, to: uOut, pos: new THREE.Vector3(HW - 4, y0 + 5, -466), color: 0xc8d8ff, intensity: 10, distance: 12, flicker: 3 });

  optimize(arch);
  optimize(decor);

  const tmp = new THREE.Vector3();
  return {
    id: 'bedroom', group: g, show: [road.u(-450), road.u(SETS.rooftops.z0 - 40)], occluders: [arch], subjects: [],
    floor: (x, z) => (Math.abs(x) < HW && z > z1 - 2 ? y0 : y0 - 30),
    paintings: { group: paintings, chatter() { if (chatterT < 0) chatterT = 0; }, talking: () => chatterT >= 0 },
    pig: { group: pig, react() { if (pigT < 0) pigT = 0; }, busy: () => pigT >= 0 },
    album, window: new THREE.Vector3(0, y0, z1),
    update(dt, t, ride) {
      // the paintings: a glance at each other now and then, a proper conversation when asked
      const idleGlance = Math.sin(t * 0.4) > 0.93;
      if (chatterT >= 0) chatterT += dt;
      const talking = chatterT >= 0 && chatterT < 4;
      if (chatterT >= 4) chatterT = -1;
      const beat = Math.floor(t * 5) % 2 === 0;
      const dogTurn = Math.floor((chatterT < 0 ? 0 : chatterT) * 1.2) % 2 === 0;
      canv.dog.map = talking ? (dogTurn ? (beat ? portraitTex.dog.talk : portraitTex.dog.turn) : portraitTex.dog.turn) : idleGlance ? portraitTex.dog.turn : portraitTex.dog.rest;
      canv.goose.map = talking ? (!dogTurn ? (beat ? portraitTex.goose.talk : portraitTex.goose.turn) : portraitTex.goose.turn) : portraitTex.goose.rest;
      // the pig lamp: turns to look at the rider, reaches up, and switches itself off for a moment
      if (pigT >= 0) pigT += dt;
      const look = pigT >= 0 ? envelope(pigT, 0, 0.5, 3.2, 3.8) : 0;
      const reach = pigT >= 0 ? envelope(pigT, 0.6, 1.0, 2.6, 3.0) : 0;
      const off = pigT >= 0 && pigT > 1.0 && pigT < 2.6;
      if (pigT > 3.8) pigT = -1;
      camera.getWorldPosition(tmp);
      const want = Math.atan2(tmp.x - pig.position.x, tmp.z - pig.position.z) - pig.rotation.y;
      pigHead.rotation.y = lerp(Math.sin(t * 0.6) * 0.1, clamp(Math.atan2(Math.sin(want), Math.cos(want)), -1.2, 1.2), look);
      pigArm.rotation.z = lerp(0.4, 2.6, reach);
      pigShade.material = off ? pigShadeOff : pigShadeOn;
      lights.boost.set(pigLight, off ? 0.05 : 1);
      // curtains billow towards the room in slow gusts
      for (const c of curtains) {
        const pos = c.geometry.attributes.position as THREE.BufferAttribute, base = c.userData.base as Float32Array;
        for (let i = 0; i < pos.count; i++) {
          const bx = base[i * 3], by = base[i * 3 + 1];
          const k = (0.5 - by / (winH + 1)) * 0.5 + 0.5; // more at the bottom
          const gust = 0.8 + Math.sin(t * 0.7 + c.userData.side) * 0.6;
          pos.setZ(i, (Math.sin(t * 2.1 + bx * 1.3 + by * 0.4) * 0.4 + 1.6) * gust * k);
          pos.setX(i, bx + Math.sin(t * 1.3 + by * 0.5) * 0.2 * k);
        }
        pos.needsUpdate = true;
        c.geometry.computeVertexNormals();
      }
      // photos rise out of the album, swirl round the room and sail out of the window
      for (const p of photos) {
        const k = (t * 0.06 + p.phase) % 1;
        const from = album, to = new THREE.Vector3(0, y0 + 6, z1 - 30);
        const sw = Math.sin(k * Math.PI);
        p.m.position.set(
          lerp(from.x, to.x, smoothstep(0, 1, k)) + Math.sin(t * 0.9 + p.seed) * 3 * sw,
          lerp(from.y, to.y, k) + sw * 4 + Math.sin(t * 1.7 + p.seed) * 0.6,
          lerp(from.z, to.z, k * k) + Math.cos(t * 0.8 + p.seed) * 2.5 * sw,
        );
        p.m.rotation.set(Math.sin(t * 2.3 + p.seed) * 0.8, t * 0.9 + p.seed, Math.sin(t * 1.9 + p.seed * 2) * 0.6);
        p.m.visible = k > 0.02 && k < 0.98;
      }
      // the television: grainy black and white, a masked rider galloping across now and then
      if (t > tvTex.next) {
        tvTex.next = t + 0.08;
        const c = tvTex.canvas.getContext('2d')!;
        const img = c.createImageData(128, 96);
        for (let i = 0; i < img.data.length; i += 4) { const v = 90 + tvNoise.next() * 90; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 1.05; img.data[i + 3] = 255; }
        c.putImageData(img, 0, 0);
        const x = ((t * 30) % 180) - 30;
        c.fillStyle = 'rgba(10,10,10,0.9)';
        c.beginPath(); c.ellipse(x, 66, 22, 9, 0, 0, TAU); c.fill();
        c.fillRect(x - 14, 66, 4, 18); c.fillRect(x + 10, 66, 4, 18); c.fillRect(x + 16, 50, 6, 18);
        c.beginPath(); c.ellipse(x - 2, 46, 6, 12, 0, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(x - 6, 36); c.lineTo(x + 8, 36); c.lineTo(x + 1, 28); c.fill();
        c.beginPath(); c.moveTo(x - 4, 50); c.lineTo(x - 26, 70 + Math.sin(t * 20) * 4); c.lineTo(x - 2, 56); c.fill();
        tvTex.tex!.needsUpdate = true;
      }
      void ride; void css; void PAL; void green; void repeatUV;
    },
  };
}
