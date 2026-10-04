import * as THREE from 'three';
import { box, cyl, sphere, mesh, canvasTexture, glow } from '../../../engine/Builders';
import { Painter, repeatUV } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { boyWithApple, css } from '../textures';
import { FUTURA } from '../film';
import { lightShaft, ribbon, subCurve } from '../common';
import type { Road } from '../layout';
import { DESK, HOTEL, LIFT, LOBBY, STAIRS } from './plan';
import {
  balustrade, coffers, galleryFascia, GBH, keyCubbies, liftCab, liftDoor, lobbyCarpet, lobbyWall, marbleFloor, pinkMarble, runner, stainedGlass,
} from './textures';
import { sweep } from './funicular';
import { shade, tbox, type HotelMats } from './mats';

/*
 * The lobby of the Grand Budapest in 1932, built as a dollhouse set: a nave with a red carpet and the brass
 * rails down its middle, rows of pink marble columns carrying two galleries on each side, a coved ceiling
 * of stained glass, three chandeliers, the concierge desk with its wall of key cubbies on the left, the
 * rose-red lift in its gilded cage on the right, palms and velvet bornes, and at the far end the grand
 * staircase with a rack rail up its middle, two flights curving back up to the second gallery, and the
 * doors at the top under "Boy with Apple".
 */

const L = LOBBY, F = L.floor;
const WALL_TOP = L.glass + 1.0;

/** A horizontal rectangle at height y with world-unit UVs, facing up (or down). */
function hplane(x0: number, x1: number, z0: number, z1: number, y: number, mat: THREE.Material, tile: number, down = false, tileZ = tile) {
  const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
  const geo = new THREE.PlaneGeometry(w, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tileZ);
  geo.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
  return mesh(geo, mat, (x0 + x1) / 2, y, (z0 + z1) / 2);
}

/** A vertical rectangle along z at x, facing +x (side 1) or -x (side -1), with world-unit UVs. */
function zplane(x: number, z0: number, z1: number, y0: number, y1: number, mat: THREE.Material, tile: number, side: number, tileV = tile) {
  const d = Math.abs(z1 - z0), h = y1 - y0;
  const geo = new THREE.PlaneGeometry(d, h);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * d / tile, uv.getY(i) * h / tileV);
  geo.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
  return mesh(geo, mat, x, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** A vertical strip at x whose bottom runs straight from (z0, yb0) to (z1, yb1), h tall, facing +x or -x. */
function slopeStrip(x: number, z0: number, z1: number, yb0: number, yb1: number, h: number, mat: THREE.Material, tile: number, tileV: number, side: number) {
  const pos = [x, yb0, z0, x, yb0 + h, z0, x, yb1, z1, x, yb1 + h, z1];
  const len = Math.hypot(z1 - z0, yb1 - yb0);
  const uv = [0, 0, 0, h / tileV, len / tile, 0, len / tile, h / tileV];
  const forward = (z1 < z0) === (side > 0);
  const idx = forward ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// ---------------- painted pieces ----------------

/** A palm frond on a transparent canvas: a curved rib with leaflets either side. Base at the bottom. */
function frondTexture() {
  const W = 64, H = 256;
  const p = new Painter(W, H, 81);
  const g = p.g;
  g.strokeStyle = '#4a6a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 4); g.stroke();
  for (let y = H - 20; y > 6; y -= 7) {
    const t = 1 - y / H, len = 28 * Math.sin(Math.min(1, t * 1.2 + 0.1) * Math.PI) + 4;
    for (const s of [-1, 1]) {
      g.fillStyle = s > 0 ? '#5a8a3a' : '#4a7a32';
      g.beginPath(); g.moveTo(W / 2, y); g.quadraticCurveTo(W / 2 + s * len * 0.6, y - 4, W / 2 + s * len, y - 12); g.quadraticCurveTo(W / 2 + s * len * 0.5, y + 1, W / 2, y + 3); g.closePath(); g.fill();
    }
  }
  return p.texture({ wrap: false });
}

/** Blue and white porcelain for the palm pots. Wraps round a lathe. */
function porcelain() {
  const p = new Painter(256, 128, 83).fill('#f6f4f0');
  const g = p.g;
  g.fillStyle = '#2f4f9a'; g.fillRect(0, 8, 256, 6); g.fillRect(0, 112, 256, 6);
  g.strokeStyle = '#2f4f9a'; g.lineWidth = 3;
  for (let x = 16; x < 256; x += 64) {
    g.beginPath(); g.arc(x + 16, 62, 18, 0, TAU); g.stroke();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.beginPath(); g.ellipse(x + 16 + Math.cos(a) * 10, 62 + Math.sin(a) * 10, 6, 3, a, 0, TAU); g.stroke(); }
    g.beginPath(); g.moveTo(x + 40, 30); g.quadraticCurveTo(x + 52, 62, x + 44, 96); g.stroke();
  }
  return p.texture();
}

/** The desk's front: dark polished wood panels with gilt edges and a burgundy inlay. */
function deskFront() {
  const W = 512, H = 96;
  const p = new Painter(W, H, 85).fill(css(GBH.wood, 0.75));
  const g = p.g;
  for (let x = 8; x < W; x += 84) {
    g.fillStyle = css(GBH.wood, 0.95); g.fillRect(x, 12, 76, H - 24);
    g.strokeStyle = css(GBH.gold); g.lineWidth = 2.5; g.strokeRect(x + 4, 16, 68, H - 32);
    g.fillStyle = css(GBH.burgundy); g.beginPath(); g.ellipse(x + 38, H / 2, 12, 16, 0, 0, TAU); g.fill();
  }
  g.fillStyle = css(GBH.gold); g.fillRect(0, 0, W, 5); g.fillRect(0, H - 6, W, 6);
  return p.texture({ wrap: false });
}

/** A gilded lattice of diamonds for the lift's cage, on a transparent canvas. One tile = 1.2 units. */
function latticeTexture() {
  const S = 64;
  const p = new Painter(S, S, 87);
  const g = p.g;
  g.strokeStyle = css(GBH.gold); g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S / 2, 0); g.lineTo(S, S / 2); g.lineTo(S / 2, S); g.closePath(); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, 6, 0, TAU); g.stroke();
  g.lineWidth = 4; g.strokeRect(0, 0, S, S);
  return p.texture({ repeat: [1, 1] });
}

/** The lift's floor dial: a brass half-moon with the floors on it. The needle is separate. */
function dialTexture() {
  return canvasTexture(256, 140, (c) => {
    c.clearRect(0, 0, 256, 140);
    c.fillStyle = '#c89a3a'; c.beginPath(); c.arc(128, 128, 124, Math.PI, TAU); c.fill();
    c.fillStyle = '#f6eedc'; c.beginPath(); c.arc(128, 128, 110, Math.PI, TAU); c.fill();
    c.fillStyle = '#2a2420'; c.font = `bold 20px ${FUTURA}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const labels = ['R', '1', '2', '3', '4', '5', '6'];
    labels.forEach((t, i) => { const a = Math.PI + (i / (labels.length - 1)) * Math.PI; c.fillText(t, 128 + Math.cos(a) * 90, 128 + Math.sin(a) * 90); });
  });
}

/** The crest over the front doors inside: a sunburst with the crossed keys. */
function crestTexture() {
  return canvasTexture(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256);
    c.strokeStyle = '#d8b25a'; c.lineCap = 'round';
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; c.lineWidth = k % 2 ? 4 : 7; c.beginPath(); c.moveTo(128 + Math.cos(a) * 52, 128 + Math.sin(a) * 52); c.lineTo(128 + Math.cos(a) * (k % 2 ? 100 : 122), 128 + Math.sin(a) * (k % 2 ? 100 : 122)); c.stroke(); }
    c.fillStyle = '#7a2236'; c.beginPath(); c.arc(128, 128, 54, 0, TAU); c.fill();
    c.strokeStyle = '#f0d27a'; c.lineWidth = 5; c.beginPath(); c.arc(128, 128, 48, 0, TAU); c.stroke();
    c.lineWidth = 7;
    for (const s of [-1, 1]) { c.save(); c.translate(128, 128); c.rotate(s * 0.7); c.beginPath(); c.moveTo(0, -30); c.lineTo(0, 26); c.moveTo(0, 18); c.lineTo(10, 18); c.moveTo(0, 26); c.lineTo(12, 26); c.stroke(); c.beginPath(); c.arc(0, -36, 8, 0, TAU); c.stroke(); c.restore(); }
  });
}

/** Gold letters on burgundy: a small sign board. */
function goldSign(text: string, w = 512, h = 96) {
  return canvasTexture(w, h, (c) => {
    c.fillStyle = '#6a1c2c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d8b25a'; c.lineWidth = 4; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#f0d27a'; c.font = `bold ${Math.round(h * 0.46)}px ${FUTURA}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText([...text].join(' '), w / 2, h * 0.54);
  });
}

// ---------------- props ----------------

function makePalm(m: { trunk: THREE.Material; frond: THREE.Material; pot: THREE.Material; gold: THREE.Material }, rng: Rng, s = 1) {
  const g = new THREE.Group();
  const pot = new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0.75, 0.25), new THREE.Vector2(0.85, 0.7), new THREE.Vector2(0.7, 1.1), new THREE.Vector2(0.78, 1.2), new THREE.Vector2(0.001, 1.2)], 16);
  g.add(mesh(pot, m.pot));
  g.add(cyl(0.12, 0.16, 2.2, m.trunk, 0, 2.2, 0, 7));
  const n = 9;
  for (let i = 0; i < n; i++) {
    const geo = new THREE.PlaneGeometry(0.9, 2.8, 1, 5);
    const pp = geo.attributes.position as THREE.BufferAttribute;
    // bend each frond up from the crown and over
    for (let k = 0; k < pp.count; k++) { const y = pp.getY(k) + 1.4; const t = y / 2.8; pp.setY(k, Math.sin(t * 1.9) * 1.2); pp.setZ(k, -y * 0.9 + 0.0); pp.setX(k, pp.getX(k) * (1 - t * 0.3)); }
    geo.computeVertexNormals();
    const f = mesh(geo, m.frond);
    const a = (i / n) * TAU + rng.range(-0.2, 0.2);
    f.rotation.set(rng.range(-0.25, 0.15), a, 0, 'YXZ');
    f.position.set(0, 3.25, 0);
    g.add(f);
  }
  g.scale.setScalar(s);
  return g;
}

function makeChandelier(gold: THREE.Material, bulb: THREE.Material, crystal: THREE.Material) {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.06, 4, gold, 0, 2.6, 0, 5));
  g.add(cyl(0.18, 0.12, 2.2, gold, 0, -0.2, 0, 8));
  g.add(sphere(0.32, gold, 0, -1.4, 0, 10, 8), sphere(0.2, crystal, 0, -1.9, 0, 8, 6));
  for (const [r, y, n] of [[2.3, -0.9, 14], [1.5, 0.3, 10], [0.9, 1.1, 6]] as const) {
    const ring = mesh(new THREE.TorusGeometry(r, 0.07, 6, 32), gold, 0, y, 0); ring.rotation.x = Math.PI / 2; g.add(ring);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      g.add(cyl(0.05, 0.07, 0.3, gold, x, y + 0.15, z, 6), sphere(0.17, bulb, x, y + 0.42, z, 8, 6));
      // crystal drops hanging under the ring
      const drop = mesh(new THREE.ConeGeometry(0.07, 0.36, 5), crystal, x * 0.98, y - 0.3, z * 0.98); drop.rotation.x = Math.PI; g.add(drop);
    }
    // arms from the stem to the ring
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; const arm = cyl(0.04, 0.04, r, gold, Math.cos(a) * r / 2, y - 0.1, Math.sin(a) * r / 2, 5); arm.rotation.set(0, -a, Math.PI / 2); g.add(arm); }
  }
  g.add(mesh(new THREE.ConeGeometry(0.5, 0.8, 10), gold, 0, 1.8, 0));
  return g;
}

/** A tufted round velvet seat (a borne) with a palm in the middle. */
function makeBorne(velvet: THREE.Material, gold: THREE.Material) {
  const g = new THREE.Group();
  g.add(cyl(2.0, 2.0, 0.5, velvet, 0, 0.3, 0, 24), cyl(2.05, 2.05, 0.08, gold, 0, 0.06, 0, 24));
  const seat = mesh(new THREE.SphereGeometry(2.0, 24, 6, 0, TAU, 0, Math.PI / 2), velvet, 0, 0.55, 0); seat.scale.y = 0.14; g.add(seat);
  g.add(cyl(0.9, 1.2, 1.3, velvet, 0, 1.0, 0, 18));
  return g;
}

function makeSofa(velvet: THREE.Material, wood: THREE.Material) {
  const g = new THREE.Group();
  g.add(box(3.2, 0.45, 1.1, velvet, 0, 0.55, 0), box(3.2, 1.0, 0.3, velvet, 0, 1.15, -0.45));
  for (const s of [-1, 1]) g.add(box(0.3, 0.75, 1.1, velvet, s * 1.6, 0.85, 0));
  for (const x of [-1.5, 1.5]) for (const z of [-0.45, 0.45]) g.add(cyl(0.06, 0.04, 0.35, wood, x, 0.17, z, 6));
  return g;
}

export interface Lobby {
  group: THREE.Group;
  /** moving parts */
  liftDoors: THREE.Object3D[];
  liftNeedle: THREE.Object3D;
  liftLamp: THREE.MeshBasicMaterial;
  topDoors: THREE.Object3D[];
  pictureLamp: THREE.MeshBasicMaterial;
  painting: THREE.Object3D;
  bell: THREE.Object3D;
  chandelierBulbs: THREE.MeshBasicMaterial;
  shafts: THREE.Group;
  occluders: THREE.Object3D[];
}

export function buildLobby(road: Road, m: HotelMats): Lobby {
  const g = new THREE.Group();
  const statics = new THREE.Group();
  g.add(statics);
  const add = (...o: THREE.Object3D[]) => { statics.add(...o); };
  const rng = new Rng(1932);
  const tex = (t: THREE.Texture, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map: t, ...o });
  const carpet = tex(lobbyCarpet()), marble = tex(marbleFloor()), wall = tex(lobbyWall()), coffer = tex(coffers());
  const fascia = tex(galleryFascia()), colMarble = tex(pinkMarble());
  const bal = new THREE.MeshLambertMaterial({ map: balustrade(GBH.cream, GBH.gold), alphaTest: 0.5, side: THREE.DoubleSide });
  const runTex = runner(); runTex.offset.x = 0.5;
  const run = tex(runTex);
  const velvet = new THREE.MeshLambertMaterial({ color: 0xa82438 });
  const stepMarble = new THREE.MeshLambertMaterial({ color: 0xf6ecdc });
  const redStep = new THREE.MeshLambertMaterial({ color: 0xa01e32 });
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x4a2a22 });
  const zc = (L.front + L.back) / 2, zl = L.front - L.back;

  // ---------- floors ----------
  add(hplane(-L.aisle, L.aisle, L.front, STAIRS.z0, F, carpet, 4));
  for (const s of [-1, 1]) {
    add(hplane(s * L.aisle, s * L.half, L.front, L.back, F, marble, 4));
    add(hplane(s * STAIRS.half, s * L.aisle, STAIRS.z0, L.back, F, marble, 4));
  }
  // the runner from under the marquee outside to the foot of the stairs, following the path
  {
    const geo = ribbon(subCurve(road, HOTEL.front + 9.5, STAIRS.z0 + 0.6, 40), -3, 3, 60, 0.03, 6);
    add(mesh(geo, run));
  }
  // brass rails on the runner, up the stairs on a stringer with a rack between them, and over the landing
  const brass = m.brass;
  for (const x of [-0.75, 0.75]) {
    add(sweep(road, HOTEL.front + 9.5, STAIRS.z0 + 0.5, x, 0.12, 0.12, 0.03, brass, 2));
    add(sweep(road, STAIRS.z0 + 0.5, STAIRS.landing + 0.5, x, 0.12, 0.14, 0.0, brass, 1.2));
  }
  add(sweep(road, STAIRS.z0 + 0.8, STAIRS.z1 - 0.2, 0, 2.2, 0.42, -0.42, darkWood, 1.2));
  {
    const rack = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 32; c.height = 64; const x = c.getContext('2d')!; x.fillStyle = '#6a5a2a'; x.fillRect(0, 0, 32, 64); for (let y = 0; y < 64; y += 32) { x.fillStyle = '#e8c45a'; x.fillRect(0, y + 4, 32, 14); } return c; })()) });
    rack.map!.wrapS = rack.map!.wrapT = THREE.RepeatWrapping;
    add(sweep(road, STAIRS.z0 + 0.8, STAIRS.z1 - 0.2, 0, 0.18, 0.12, -0.02, rack, 1.2, 0.5));
  }

  // ---------- walls ----------
  const wallH = WALL_TOP - F;
  for (const s of [-1, 1]) {
    add(zplane(s * L.half, L.front, L.back, F, WALL_TOP, wall, 4, -s, 8));
    // pilasters on the wall opposite each column
    for (const z of L.colZ) add(tbox(1.1, wallH, 0.4, m.cream, 3, s * (L.half - 0.2), F + wallH / 2, z));
  }
  // the front wall (inside face) round the doorway
  {
    const dh = HOTEL.doorHalf, dTop = F + HOTEL.doorH;
    const fw = (x0: number, x1: number, y0: number, y1: number) => {
      const p = mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), wall, (x0 + x1) / 2, (y0 + y1) / 2, L.front);
      const uv = p.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 4, (y0 - F + uv.getY(i) * (y1 - y0)) / 8);
      p.rotation.y = Math.PI;
      add(p);
    };
    fw(-L.half, -dh, F, WALL_TOP); fw(dh, L.half, F, WALL_TOP); fw(-dh, dh, dTop, WALL_TOP);
    // a gilt door frame and the crest above it
    add(box(0.5, HOTEL.doorH + 0.5, 0.3, m.gold, -dh - 0.25, F + HOTEL.doorH / 2, L.front - 0.1), box(0.5, HOTEL.doorH + 0.5, 0.3, m.gold, dh + 0.25, F + HOTEL.doorH / 2, L.front - 0.1), box(dh * 2 + 1, 0.5, 0.3, m.gold, 0, dTop + 0.25, L.front - 0.1));
    const crest = mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ map: crestTexture(), transparent: true, alphaTest: 0.2, emissive: 0x403010 }), 0, dTop + 4.2, L.front - 0.12);
    crest.rotation.y = Math.PI; add(crest);
    // tall windows either side, lit from outside
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffeccc });
    for (const s of [-1, 1]) for (const x of [7.5, 16.5]) for (const y of [F + 1.2, F + 9.2, F + 17.2]) {
      if (y > F + 2 && Math.abs(x) < 10) continue;
      const w = mesh(new THREE.PlaneGeometry(2.0, 4.6), winMat, s * x, y + 2.3, L.front - 0.06); w.rotation.y = Math.PI; add(w);
      const top = mesh(new THREE.CircleGeometry(1.0, 12, 0, Math.PI), winMat, s * x, y + 4.6, L.front - 0.06); top.rotation.y = Math.PI; add(top);
      add(box(2.5, 0.25, 0.4, m.cream, s * x, y - 0.1, L.front - 0.15));
      for (const dx of [-1.15, 1.15]) add(box(0.25, 4.8, 0.3, m.cream, s * x + dx, y + 2.4, L.front - 0.12));
      add(box(0.12, 4.6, 0.1, m.gold, s * x, y + 2.3, L.front - 0.1), box(2.0, 0.12, 0.1, m.gold, s * x, y + 2.6, L.front - 0.1));
    }
  }
  // the back wall, with the doors' opening and the painting above it
  {
    const dw = 2.7, dy0 = STAIRS.y1, dy1 = STAIRS.y1 + 7.6;
    const bw = (x0: number, x1: number, y0: number, y1: number) => {
      const p = mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), wall, (x0 + x1) / 2, (y0 + y1) / 2, L.back);
      const uv = p.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 4, (y0 - F + uv.getY(i) * (y1 - y0)) / 8);
      add(p);
    };
    bw(-L.half, -dw, F, WALL_TOP); bw(dw, L.half, F, WALL_TOP); bw(-dw, dw, dy1, WALL_TOP); bw(-dw, dw, F, dy0);
    add(box(0.6, dy1 - dy0 + 0.6, 0.4, m.gold, -dw - 0.3, (dy0 + dy1) / 2, L.back + 0.15), box(0.6, dy1 - dy0 + 0.6, 0.4, m.gold, dw + 0.3, (dy0 + dy1) / 2, L.back + 0.15), box(dw * 2 + 1.2, 0.6, 0.4, m.gold, 0, dy1 + 0.3, L.back + 0.15));
    // the light beyond the doors (Mendl's is through there)
    add(mesh(new THREE.PlaneGeometry(dw * 2 + 0.4, dy1 - dy0 + 0.4), new THREE.MeshBasicMaterial({ color: 0xfff0e8 }), 0, (dy0 + dy1) / 2, L.back - 1.5));
    for (const s of [-1, 1]) add(zplane(s * dw, L.back, L.back - 1.6, dy0, dy1, m.cream, 2, -s, 2));
    add(hplane(-dw, dw, L.back, L.back - 1.6, dy0 + 0.01, m.cream, 2));
  }

  // ---------- columns ----------
  for (const s of [-1, 1]) for (const z of L.colZ) {
    const x = s * L.aisle;
    const tiers: Array<[number, number, number]> = [[F, L.g1 - 0.75, 0.55], [L.g1, L.g2 - 0.75, 0.45], [L.g2, L.ceil - 0.6, 0.4]];
    for (const [y0, y1, r] of tiers) {
      add(mesh(repeatUV(new THREE.CylinderGeometry(r, r * 1.05, y1 - y0 - 0.6, 12), 1, (y1 - y0) / 6), colMarble, x, (y0 + y1) / 2 + 0.05, z));
      add(box(r * 2.6, 0.4, r * 2.6, m.cream, x, y0 + 0.2, z));
      add(cyl(r * 1.55, r, 0.5, m.gold, x, y1 - 0.25, z, 12), box(r * 3, 0.25, r * 3, m.gold, x, y1 + 0.1, z));
    }
  }

  // ---------- galleries, the aisles' ceilings, the coved cornice and the glass ----------
  const edge = L.aisle - 0.5;
  for (const s of [-1, 1]) {
    for (const gy of [L.g1, L.g2]) {
      const gz1 = gy === L.g1 ? L.back : STAIRS.z1 + 25;
      add(tbox(L.half - edge, 0.7, L.front - gz1, m.cream, 3, s * (edge + (L.half - edge) / 2), gy - 0.35, (L.front + gz1) / 2));
      add(hplane(s * edge, s * L.half, L.front, gz1, gy - 0.72, coffer, 3, true));
      add(hplane(s * edge, s * L.half, L.front, gz1, gy + 0.01, carpet, 4));
      add(zplane(s * (edge - 0.02), L.front, gz1, gy - 1.25, gy + 0.05, fascia, 4, -s, 1.3));
      // the balustrade, open where the side flights arrive
      const bz1 = gy === L.g1 ? STAIRS.z1 : STAIRS.z1 + 26;
      add(zplane(s * (edge + 0.15), L.front, bz1, gy, gy + 1.15, bal, 2.4, -s, 1.15));
      add(box(0.3, 0.14, L.front - bz1, m.gold, s * (edge + 0.15), gy + 1.2, (L.front + bz1) / 2));
    }
    add(tbox(L.half - edge, 0.6, zl, m.cream, 3, s * (edge + (L.half - edge) / 2), L.ceil + 0.3, zc));
    add(hplane(s * edge, s * L.half, L.front, L.back, L.ceil - 0.01, coffer, 3, true));
    add(zplane(s * (edge - 0.02), L.front, L.back, L.ceil - 1.0, L.ceil + 0.4, fascia, 4, -s, 1.4));
    // the cove up to the glass
    const cove = new THREE.PlaneGeometry(zl, 2.6);
    cove.rotateY(-s * Math.PI / 2);
    const cv = mesh(cove, m.cream, s * (edge - 0.9), (L.ceil + 0.4 + L.glass) / 2, zc);
    cv.rotation.z = s * 0.75;
    // tilt it in towards the middle of the nave
    add(cv);
  }
  // the coves at the front and the back
  for (const [z, dir] of [[L.front - 0.9, -1], [L.back + 0.9, 1]] as const) {
    const cv = mesh(new THREE.PlaneGeometry(edge * 2, 2.6), m.cream, 0, (L.ceil + 0.4 + L.glass) / 2, z);
    cv.rotation.x = dir * 0.75; if (dir < 0) cv.rotation.y = Math.PI;
    add(cv);
  }
  const glassTex = stainedGlass();
  const glassMat = new THREE.MeshLambertMaterial({ map: glassTex, emissive: 0xffffff, emissiveMap: glassTex, emissiveIntensity: 0.95 });
  const glass = hplane(-edge + 1.8, edge - 1.8, L.front - 1.8, L.back + 1.8, L.glass, glassMat, 8, true);
  glass.userData.noShadow = true;
  add(glass);
  // gilded ribs across the glass, and two along it
  for (let z = L.front - 1.8; z >= L.back + 1.8; z -= 8.4) add(box(edge * 2 - 3.6, 0.35, 0.3, m.gold, 0, L.glass - 0.2, z));
  for (const x of [-edge / 3, edge / 3]) add(box(0.3, 0.35, zl - 3.6, m.gold, x, L.glass - 0.2, zc));

  // ---------- the grand staircase ----------
  {
    const n = 25, d = (STAIRS.z0 - STAIRS.z1) / n, hw = STAIRS.half;
    for (let k = 1; k < n; k++) {
      const zf = STAIRS.z0 - k * d, top = road.at(zf).y;
      const zm = zf - d / 2, h = top - F;
      add(box(hw - 3, h, d, stepMarble, -(3 + (hw - 3) / 2), F + h / 2, zm), box(hw - 3, h, d, stepMarble, 3 + (hw - 3) / 2, F + h / 2, zm));
      add(box(6, h + 0.02, d, redStep, 0, F + h / 2 + 0.01, zm));
      // brass stair rods across the runner
      add(cyl(0.04, 0.04, 6.2, m.gold, 0, top + 0.05, zf - 0.12, 5).rotateZ(Math.PI / 2));
    }
    // the stringers: panelled sides of the flight
    for (const s of [-1, 1]) {
      const pts: number[] = [], idx: number[] = [], uvs: number[] = [];
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const z = STAIRS.z0 + 0.4 - (STAIRS.z0 + 0.4 - STAIRS.z1) * (i / steps), y = road.at(z).y + 0.35;
        pts.push(s * (hw + 0.02), F, z, s * (hw + 0.02), y, z);
        uvs.push((STAIRS.z0 - z) / 4, 0, (STAIRS.z0 - z) / 4, (y - F) / 1.3);
        if (i < steps) { const a = i * 2; if (s > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      add(new THREE.Mesh(geo, fascia));
      // the balustrade and handrail up the flight
      const bp: number[] = [], bi: number[] = [], bu: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const z = STAIRS.z0 + 0.2 - (STAIRS.z0 + 0.2 - STAIRS.z1) * (i / steps), y = road.at(z).y + 0.3;
        bp.push(s * (hw - 0.1), y, z, s * (hw - 0.1), y + 1.15, z);
        bu.push((STAIRS.z0 - z) / 2.4, 0, (STAIRS.z0 - z) / 2.4, 1);
        if (i < steps) { const a = i * 2; bi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2)); bg.setIndex(bi); bg.computeVertexNormals();
      add(new THREE.Mesh(bg, bal));
      add(sweep(road, STAIRS.z0 + 0.2, STAIRS.z1, s * (hw - 0.1), 0.26, 0.16, 1.4, m.gold, 1.2));
      // newel posts with candelabra at the foot and the top
      for (const [z, y] of [[STAIRS.z0 + 0.6, F], [STAIRS.z1 - 0.3, STAIRS.y1]] as const) {
        add(tbox(0.9, 1.6, 0.9, stepMarble, 2, s * (hw - 0.1), y + 0.8, z), box(1.1, 0.2, 1.1, m.gold, s * (hw - 0.1), y + 1.7, z));
        add(cyl(0.08, 0.12, 2.2, m.gold, s * (hw - 0.1), y + 2.9, z, 8));
        for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; add(sphere(0.22, m.lampWarm, s * (hw - 0.1) + Math.cos(a) * 0.45, y + 4.0, z + Math.sin(a) * 0.45, 8, 6)); }
        add(sphere(0.26, m.lampWarm, s * (hw - 0.1), y + 4.35, z, 8, 6));
      }
    }
    // the landing across the back, joining the first galleries
    add(tbox(L.half * 2, 0.8, STAIRS.z1 - L.back, stepMarble, 4, 0, STAIRS.y1 - 0.4, (STAIRS.z1 + L.back) / 2));
    add(hplane(-L.half, L.half, STAIRS.z1, L.back, STAIRS.y1 + 0.01, carpet, 4));
    add(hplane(-L.half, L.half, STAIRS.z1, L.back, STAIRS.y1 - 0.81, coffer, 3, true));
    // the side flights, curving back up to the second gallery
    const sf0 = STAIRS.z1, sf1 = STAIRS.z1 + 25, rise = L.g2 - STAIRS.y1, ns = 18, sd = (sf1 - sf0) / ns;
    for (const s of [-1, 1]) {
      const x0 = s * (hw + 1.0), x1 = s * (edge - 0.1), xm = (x0 + x1) / 2, w = Math.abs(x1 - x0);
      for (let k = 0; k < ns; k++) {
        const top = STAIRS.y1 + (k + 1) * (rise / ns), z = sf0 + (k + 0.5) * sd;
        add(box(w, 1.0, sd, stepMarble, xm, top - 0.5, z));
        add(box(w * 0.6, 1.02, sd, redStep, xm, top - 0.49, z));
      }
      // the soffit under the flight
      const len = Math.hypot(sf1 - sf0, rise), ang = Math.atan2(rise, sf1 - sf0);
      const sof = mesh(new THREE.PlaneGeometry(w, len), fascia, xm, STAIRS.y1 + rise / 2 - 1.05, (sf0 + sf1) / 2);
      sof.rotation.x = Math.PI / 2 - ang; add(sof);
      // its inner balustrade
      const bp: number[] = [], bi: number[] = [], bu: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const z = sf0 + (sf1 - sf0) * (i / 12), y = STAIRS.y1 + rise * (i / 12) + 0.3;
        bp.push(x0, y, z, x0, y + 1.15, z); bu.push((z - sf0) / 2.4, 0, (z - sf0) / 2.4, 1);
        if (i < 12) { const a = i * 2; bi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2)); bg.setIndex(bi); bg.computeVertexNormals();
      add(new THREE.Mesh(bg, bal));
      const hr = mesh(new THREE.BoxGeometry(0.26, 0.16, len), m.gold, x0, STAIRS.y1 + rise / 2 + 1.5, (sf0 + sf1) / 2); hr.rotation.x = -ang; add(hr);
      // the flight's inner side, panelled
      add(slopeStrip(x0, sf0, sf1, STAIRS.y1 - 1.05, L.g2 - 1.05, 1.1, fascia, 4, 1.1, -s));
    }
  }

  // ---------- the concierge desk and the wall of key cubbies (left aisle) ----------
  let bell: THREE.Object3D;
  {
    const dx = DESK.x, dz = DESK.z, len = DESK.len;
    const DH = 0.98;
    const front = mesh(new THREE.PlaneGeometry(len, DH), new THREE.MeshLambertMaterial({ map: deskFront() }), dx + 0.71, F + DH / 2, dz);
    front.rotation.y = Math.PI / 2; add(front);
    add(box(1.4, DH, len, darkWood, dx, F + DH / 2, dz));
    add(tbox(1.8, 0.12, len + 0.4, stepMarble, 2, dx + 0.1, F + DH + 0.06, dz));
    add(box(0.12, 0.08, len + 0.4, m.gold, dx + 1.0, F + DH + 0.01, dz));
    for (const s of [-1, 1]) add(box(1.4, DH, 0.12, m.gold, dx, F + DH / 2, dz + s * (len / 2 + 0.05)));
    // the wall of cubbies behind, with a cornice and the sign
    const wx = -L.half + 0.06;
    const cub = mesh(new THREE.PlaneGeometry(len + 1, 5), new THREE.MeshLambertMaterial({ map: keyCubbies() }), wx + 0.25, F + 3.1, dz);
    cub.rotation.y = Math.PI / 2; add(cub);
    add(box(0.5, 5.4, len + 1.4, darkWood, wx, F + 3.1, dz));
    add(box(0.9, 0.4, len + 1.8, m.gold, wx + 0.2, F + 5.9, dz));
    const sign = mesh(new THREE.PlaneGeometry(6, 0.95), new THREE.MeshBasicMaterial({ map: goldSign('CONCIERGE') }), wx + 0.42, F + 6.7, dz);
    sign.rotation.y = Math.PI / 2; add(sign);
    // on the desk: the register, a telephone, a lamp with a pink shade
    add(box(0.7, 0.08, 1.0, new THREE.MeshLambertMaterial({ color: 0x5a1a24 }), dx + 0.2, F + DH + 0.16, dz + 2.5), box(0.62, 0.02, 0.9, m.cream, dx + 0.2, F + DH + 0.21, dz + 2.5));
    add(cyl(0.1, 0.14, 0.05, m.dark, dx + 0.1, F + DH + 0.15, dz - 2.6, 10), cyl(0.03, 0.03, 0.5, m.dark, dx + 0.1, F + DH + 0.4, dz - 2.6, 6), cyl(0.07, 0.05, 0.12, m.dark, dx + 0.1, F + DH + 0.67, dz - 2.6, 8));
    add(cyl(0.12, 0.16, 0.05, m.gold, dx - 0.3, F + DH + 0.15, dz - 3.6, 10), cyl(0.03, 0.03, 0.8, m.gold, dx - 0.3, F + DH + 0.55, dz - 3.6, 6), cyl(0.18, 0.36, 0.4, new THREE.MeshLambertMaterial({ color: 0xf2a6b8, emissive: 0xa04050 }), dx - 0.3, F + DH + 1.0, dz - 3.6, 12));
    // the brass bell, separate so it can jump when rung
    const b = new THREE.Group();
    b.add(cyl(0.16, 0.18, 0.05, darkWood, 0, 0.025, 0, 14));
    const dome = mesh(new THREE.SphereGeometry(0.13, 14, 8, 0, TAU, 0, Math.PI / 2), m.brass, 0, 0.05, 0); b.add(dome);
    b.add(cyl(0.015, 0.015, 0.06, m.brass, 0, 0.2, 0, 5), sphere(0.03, m.brass, 0, 0.24, 0, 6, 5));
    b.position.set(dx + 0.45, F + DH + 0.12, dz + 0.4);
    g.add(b);
    bell = b;
  }

  // ---------- the lift (right aisle) ----------
  const liftDoors: THREE.Object3D[] = [];
  let liftNeedle: THREE.Object3D;
  const liftLamp = glow(0xffe0b0, 1.2);
  {
    const lx = LIFT.x, lz = LIFT.z, hw = 2.1, fx = lx - hw;
    const lattice = new THREE.MeshLambertMaterial({ map: latticeTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    // the cage: gilt corner posts and lattice sides all the way up, past the galleries
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(box(0.3, L.ceil - F, 0.3, m.gold, lx + cx * hw, (L.ceil + F) / 2, lz + cz * hw));
    add(zplane(lx + hw, lz - hw, lz + hw, F, L.ceil, lattice, 1.2, -1));
    add(zplane(fx, lz - hw, lz + hw, F + 4.6, L.ceil, lattice, 1.2, -1));
    for (const s of [-1, 1]) {
      const sd = mesh(new THREE.PlaneGeometry(hw * 2, L.ceil - F), lattice, lx, (L.ceil + F) / 2, lz + s * hw);
      const uv = sd.geometry.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * hw * 2 / 1.2, uv.getY(i) * (L.ceil - F) / 1.2);
      add(sd);
    }
    // the car: red velvet inside, a ceiling lamp, a brass rail
    const cabMat = new THREE.MeshLambertMaterial({ map: liftCab(), emissive: 0x401018 });
    add(zplane(lx + hw - 0.2, lz - hw + 0.2, lz + hw - 0.2, F + 0.1, F + 3.6, cabMat, hw * 2 - 0.4, -1, 3.5));
    for (const s of [-1, 1]) add(mesh(new THREE.PlaneGeometry(hw * 2 - 0.4, 3.5), cabMat, lx, F + 1.85, lz + s * (hw - 0.2)).rotateY(s > 0 ? Math.PI : 0));
    add(box(hw * 2, 0.3, hw * 2, new THREE.MeshLambertMaterial({ color: 0xb8283e }), lx, F + 3.75, lz));
    add(sphere(0.25, liftLamp, lx, F + 3.45, lz, 10, 8));
    add(hplane(lx - hw, lx + hw, lz - hw, lz + hw, F + 0.1, carpet, 2));
    add(box(hw * 2 + 0.4, 0.5, hw * 2 + 0.4, m.gold, lx, F + 4.1, lz));
    // the doors: two red leaves that slide apart along z
    const dm = new THREE.MeshLambertMaterial({ map: liftDoor() });
    for (const s of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.add(mesh(new THREE.BoxGeometry(0.1, 3.6, hw), dm, 0, 1.8, 0));
      leaf.position.set(fx - 0.15, F, lz + s * hw / 2);
      leaf.userData.side = s;
      g.add(leaf);
      liftDoors.push(leaf);
    }
    add(box(0.4, 0.5, hw * 2 + 0.8, m.gold, fx - 0.15, F + 3.85, lz));
    // the floor dial over the doors, and its needle
    const dial = mesh(new THREE.PlaneGeometry(2.0, 1.1), new THREE.MeshBasicMaterial({ map: dialTexture(), transparent: true, alphaTest: 0.3 }), fx - 0.4, F + 4.85, lz);
    dial.rotation.y = -Math.PI / 2; add(dial);
    const needle = new THREE.Group();
    needle.add(box(0.04, 0.8, 0.06, m.dark, 0, 0.4, 0));
    needle.position.set(fx - 0.45, F + 4.33, lz);
    g.add(needle);
    liftNeedle = needle;
    const sign = mesh(new THREE.PlaneGeometry(3.4, 0.6), new THREE.MeshBasicMaterial({ map: goldSign('ASCENSEUR', 512, 90) }), fx - 0.41, F + 5.75, lz);
    sign.rotation.y = -Math.PI / 2; add(sign);
  }

  // ---------- chandeliers ----------
  const bulbMat = glow(0xfff0c8, 1.5);
  const crystal = new THREE.MeshLambertMaterial({ color: 0xf8eef8, emissive: 0xc8b8d8, emissiveIntensity: 0.7 });
  for (const z of [-190, -217, -244]) {
    const c = makeChandelier(m.gold, bulbMat, crystal);
    c.position.set(0, L.glass - 5.6, z);
    add(c);
  }

  // ---------- palms, bornes, sofas ----------
  const palmMats = { trunk: new THREE.MeshLambertMaterial({ color: 0x7a5a3a }), frond: new THREE.MeshLambertMaterial({ map: frondTexture(), alphaTest: 0.5, side: THREE.DoubleSide }), pot: new THREE.MeshLambertMaterial({ map: porcelain() }), gold: m.gold };
  for (const s of [-1, 1]) {
    for (const [x, z] of [[8.8, -166], [9.2, -253.5], [16.5, -166.5], [20, -252]]) { const p = makePalm(palmMats, rng, 1.05); p.position.set(s * x, F, z); add(p); }
    const borne = makeBorne(velvet, m.gold); borne.position.set(s * 16.5, F, -181); add(borne);
    const bp = makePalm(palmMats, rng, 0.8); bp.position.set(s * 16.5, F + 1.65, -181); add(bp);
    for (const z of [-227, -239]) { const so = makeSofa(velvet, darkWood); so.position.set(s * 20.6, F, z); so.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; add(so); }
    // palms and a sofa on the galleries too
    for (const z of [-178, -232]) { const p = makePalm(palmMats, rng, 0.85); p.position.set(s * 19.5, L.g1, z); add(p); }
  }
  // tables between the sofas, with lamps
  for (const s of [-1, 1]) {
    add(cyl(0.5, 0.5, 0.06, stepMarble, s * 20.8, F + 0.9, -233, 14), cyl(0.06, 0.12, 0.86, m.gold, s * 20.8, F + 0.45, -233, 8));
    add(cyl(0.05, 0.05, 0.6, m.gold, s * 20.8, F + 1.25, -233, 6), cyl(0.18, 0.32, 0.36, new THREE.MeshLambertMaterial({ color: 0xf2a6b8, emissive: 0xa04050 }), s * 20.8, F + 1.7, -233, 12));
  }

  // ---------- Boy with Apple over the doors at the top, with its picture lamp ----------
  const painting = new THREE.Group();
  const pictureLamp = glow(0xfff2d0, 1.1);
  {
    const pw = 3.6, ph = 4.8;
    painting.add(mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshLambertMaterial({ map: boyWithApple(), emissive: 0x2a2010 }), 0, 0, 0.12));
    painting.add(box(pw + 0.2, ph + 0.2, 0.15, m.gold, 0, 0, 0));
    painting.add(box(1.6, 0.12, 0.3, m.brass, 0, ph / 2 + 0.35, 0.35), cyl(0.06, 0.06, 0.5, m.brass, 0, ph / 2 + 0.2, 0.15, 6));
    painting.add(mesh(new THREE.BoxGeometry(1.4, 0.06, 0.12), pictureLamp, 0, ph / 2 + 0.28, 0.44));
    painting.position.set(0, STAIRS.y1 + 7.6 + 0.9 + ph / 2, L.back + 0.12);
    g.add(painting);
  }

  // ---------- the doors at the top of the stairs ----------
  const topDoors: THREE.Object3D[] = [];
  {
    const dw = 2.7, dh = 7.6;
    const dTex = canvasTexture(128, 256, (c) => {
      c.fillStyle = '#f6eee0'; c.fillRect(0, 0, 128, 256);
      c.strokeStyle = '#d8b25a'; c.lineWidth = 5; c.strokeRect(12, 12, 104, 110); c.strokeRect(12, 136, 104, 108);
      c.lineWidth = 2; c.strokeRect(22, 22, 84, 90); c.strokeRect(22, 146, 84, 88);
      c.fillStyle = '#f2b2c4'; c.fillRect(26, 26, 76, 82); c.fillRect(26, 150, 76, 80);
      c.fillStyle = '#d8b25a'; c.fillRect(100, 124, 10, 18);
    });
    const dmat = new THREE.MeshLambertMaterial({ map: dTex });
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * dw, STAIRS.y1, L.back - 0.1);
      const leaf = mesh(new THREE.BoxGeometry(dw, dh, 0.16), dmat, -s * dw / 2, dh / 2, 0);
      pivot.add(leaf);
      g.add(pivot);
      topDoors.push(pivot);
    }
  }

  // ---------- soft beams of light from the glass ----------
  const shafts = new THREE.Group();
  for (const [x, z] of [[-3.5, -186], [4, -208], [-2, -236]]) shafts.add(lightShaft(new THREE.Vector3(x, L.glass - 0.3, z + 5), new THREE.Vector3(x * 1.4 + 2, F, z - 3), 6, 0xffe8c8, 0.09));
  g.add(shafts);

  // shadows: the solid set casts, the glass and the thin dressings do not
  statics.traverse((o) => {
    const mm = o as THREE.Mesh;
    if (!mm.isMesh) return;
    mm.receiveShadow = true;
    const mat = mm.material as THREE.Material;
    mm.castShadow = !mm.userData.noShadow && !mat.transparent && (mat as THREE.MeshLambertMaterial).alphaTest === 0 && mat !== glassMat;
  });
  shade(painting, false, true);
  for (const d of [...liftDoors, ...topDoors, bell]) shade(d, true, true);

  return { group: g, liftDoors, liftNeedle: liftNeedle!, liftLamp, topDoors, pictureLamp, painting, bell: bell!, chandelierBulbs: bulbMat, shafts, occluders: [] };
}
