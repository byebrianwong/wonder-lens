import * as THREE from 'three';
import { box, cyl, glow, mergeStatic, mesh, sphere } from '../../../engine/Builders';
import { boxUV, charToon, Painter, repeatUV } from '../../../engine/Paint';
import { envelope, Spring } from '../../../engine/Rig';
import { Rng, TAU, clamp, damp, lerp, smoothstep } from '../../../engine/math';
import { optimize } from '../common';
import { planks } from '../textures';
import { texMat } from '../kit';
import { FUTURA } from '../film';
import { HOUSE, LIGHTHOUSE, PY } from './plan';
import { MK, brittenSleeve, clapboard, houseBay, paintPaper, paintRoomWall, rug, shingles, wallShade, type PaperKind, type WallThing } from './textures';
import { KID, bake, binoculars, brotherKid, flat, megaphone, mrBishop, mrsBishop, newspaper, recordPlayer, suzyKid, swapMat, torsoOf, unify, lighten, type Kid } from './figures';

/*
 * Summer's End, the Bishops' red house, built like the film's opening: a dollhouse whose front has been taken
 * away so the camera can track past its rooms. Here the house stands across the track, shut, as the whip pan
 * clears; then its two halves roll apart on stage wagons and the train runs between them, past twelve rooms
 * and two attics open to the rails. At the end of the point stands the lighthouse, with Suzy on its gallery
 * watching the train through her binoculars.
 *
 * Each half is a group whose cut face is at its own x = 0 and which reaches HOUSE.depth outwards; the world
 * slides the groups apart. Inside a half, `l` is the distance out from the cut.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const F = HOUSE.floors;
const D = HOUSE.depth, ZF = HOUSE.front, ZB = HOUSE.back;
const ROOM_H = 3.3, WALL_T = 0.24;
const EAVE = F[2] + 0.25;
/** the brothers' size (kid figures are about 2.4 tall) */
const BRO = 0.56;

/** A painted material that carries a little of its own light, so rooms in shade still read. */
const paintMat = (map: THREE.Texture, k = 0.28) => new THREE.MeshLambertMaterial({ map, emissive: 0xfff0dc, emissiveMap: map, emissiveIntensity: k });

interface Room { side: -1 | 1; floor: 0 | 1; slot: 0 | 1 | 2; paper: PaperKind; base: number; ink: number; dado?: number; things: WallThing[]; rug?: [number, number] }

/** The rooms, front to back. Wall things are placed in units from the viewer's left as seen from the track. */
const ROOMS: Room[] = [
  // left half, ground floor: the living room, the hall and stairs, the kitchen
  { side: -1, floor: 0, slot: 0, paper: 'stripe', base: 0xd8dcc0, ink: 0x8aa080, dado: 0x6a8a6a, rug: [0x9a2a2a, 0x2a3a6a], things: [
    { k: 'shelf', x: 0.4, y: 0.16, w: 3.4, h: 2.8 }, { k: 'frame', x: 4.4, y: 1.5, w: 1.6, h: 1.1, art: 'sea' }, { k: 'window', x: 6.6, y: 1.0, w: 1.4, h: 1.7 }, { k: 'frame', x: 8.4, y: 1.7, w: 0.8, h: 1.0, art: 'portrait' },
  ] },
  { side: -1, floor: 0, slot: 1, paper: 'diamond', base: 0xe8c86a, ink: 0xb0473a, dado: 0x7a2a24, things: [
    { k: 'frame', x: 0.6, y: 1.6, w: 0.9, h: 1.2, art: 'portrait' }, { k: 'frame', x: 1.8, y: 1.6, w: 0.9, h: 1.2, art: 'portrait' }, { k: 'door', x: 3.4, w: 1.2, h: 2.4 }, { k: 'clock', x: 8.6, y: 2.5, r: 0.3 },
  ] },
  { side: -1, floor: 0, slot: 2, paper: 'check', base: 0xf6ecc4, ink: 0x6aa0a0, things: [
    { k: 'window', x: 3.0, y: 1.4, w: 1.6, h: 1.4 }, { k: 'shelf', x: 5.8, y: 1.7, w: 2.6, h: 1.1 }, { k: 'clock', x: 1.2, y: 2.6, r: 0.25 },
  ] },
  // left half, first floor: Suzy's room, the bathroom, the study
  { side: -1, floor: 1, slot: 0, paper: 'floral', base: 0xf6dce0, ink: 0x6a9ac8, rug: [0x7aa4c8, 0xf0a2a8], things: [
    { k: 'poster', x: 0.6, y: 1.3, w: 1.0, h: 1.4, title: 'FRANÇOISE', color: 0xe2b33c }, { k: 'window', x: 3.6, y: 1.1, w: 1.4, h: 1.6 }, { k: 'shelf', x: 6.0, y: 0.16, w: 1.6, h: 1.6 }, { k: 'frame', x: 8.2, y: 1.6, w: 1.0, h: 0.8, art: 'bird' },
  ] },
  { side: -1, floor: 1, slot: 1, paper: 'dots', base: 0xd8eaf2, ink: 0x3f8f8c, dado: 0xf4f0e6, things: [
    { k: 'window', x: 6.4, y: 1.4, w: 1.0, h: 1.2 }, { k: 'frame', x: 2.6, y: 1.5, w: 1.0, h: 1.2, art: 'boat' },
  ] },
  { side: -1, floor: 1, slot: 2, paper: 'stripe', base: 0xe6d6c0, ink: 0x7a2a24, things: [
    { k: 'shelf', x: 0.3, y: 0.16, w: 4.2, h: 2.9 }, { k: 'frame', x: 5.4, y: 1.4, w: 1.8, h: 1.2, art: 'map' }, { k: 'window', x: 7.8, y: 1.2, w: 1.2, h: 1.5 },
  ] },
  // right half, ground floor: Mr. Bishop's study, the dining room, the music room
  { side: 1, floor: 0, slot: 0, paper: 'stripe', base: 0xe8d0c0, ink: 0xb0473a, dado: 0x5a3a24, rug: [0x2a4a3a, 0xb0473a], things: [
    { k: 'shelf', x: 5.6, y: 0.16, w: 3.8, h: 2.9 }, { k: 'frame', x: 0.8, y: 1.5, w: 1.8, h: 1.2, art: 'lighthouse' }, { k: 'window', x: 3.3, y: 1.0, w: 1.3, h: 1.7 },
  ] },
  { side: 1, floor: 0, slot: 1, paper: 'boats', base: 0xf2ead6, ink: 0x2a3550, dado: 0x2a3550, things: [
    { k: 'frame', x: 1.0, y: 1.5, w: 2.0, h: 1.3, art: 'boat' }, { k: 'window', x: 4.4, y: 1.0, w: 1.4, h: 1.7 }, { k: 'frame', x: 7.0, y: 1.5, w: 2.0, h: 1.3, art: 'sea' },
  ] },
  { side: 1, floor: 0, slot: 2, paper: 'diamond', base: 0xdce6d0, ink: 0x3f8f8c, things: [
    { k: 'frame', x: 0.8, y: 1.7, w: 1.2, h: 0.9, art: 'portrait' }, { k: 'pennants', x: 3.0, y: 2.9, w: 4.2 }, { k: 'window', x: 7.6, y: 1.1, w: 1.3, h: 1.6 },
  ] },
  // right half, first floor: the parents' room, the boys' room, the toy room
  { side: 1, floor: 1, slot: 0, paper: 'diamond', base: 0xcfe0c8, ink: 0x6a8a5a, rug: [0xe2b33c, 0x7a2a24], things: [
    { k: 'frame', x: 2.0, y: 1.7, w: 1.2, h: 0.9, art: 'sea' }, { k: 'window', x: 4.4, y: 1.1, w: 1.3, h: 1.5 }, { k: 'frame', x: 6.6, y: 1.7, w: 1.2, h: 0.9, art: 'bird' },
  ] },
  { side: 1, floor: 1, slot: 1, paper: 'boats', base: 0xe0ecf2, ink: 0xb0473a, things: [
    { k: 'pennants', x: 0.4, y: 2.9, w: 4.0 }, { k: 'poster', x: 6.2, y: 1.2, w: 1.1, h: 1.5, title: 'SCOUTS', color: 0x3f6a3a }, { k: 'window', x: 8.0, y: 1.2, w: 1.2, h: 1.4 },
  ] },
  { side: 1, floor: 1, slot: 2, paper: 'check', base: 0xf2e2c8, ink: 0xe2b33c, rug: [0x3f8f8c, 0xe2b33c], things: [
    { k: 'shelf', x: 0.4, y: 0.16, w: 3.0, h: 1.6 }, { k: 'frame', x: 4.4, y: 1.6, w: 1.4, h: 1.0, art: 'map' }, { k: 'window', x: 7.0, y: 1.1, w: 1.3, h: 1.5 },
  ] },
];

/** A flat quad through four corners (any winding; drawn on both sides), with UVs in units / tile. */
function quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, mat: THREE.Material, tile = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, d].flatMap((v) => [v.x, v.y, v.z]), 3));
  const w = a.distanceTo(b) / tile, h = b.distanceTo(c) / tile;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w, 0, w, h, 0, h], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** A z range for a room slot. */
const slotZ = (slot: number): [number, number] => [ZF - WALL_T - slot * 10 + (slot ? 0 : 0), ZF - (slot + 1) * 10];

export interface SummersEnd {
  /** the two halves (left, right) */
  halves: THREE.Group[];
  lighthouse: THREE.Group;
  /** anchor at the middle of the house front, for the landmark subject */
  anchor: THREE.Object3D;
  suzy: { group: THREE.Group; head: THREE.Object3D; call(): void; lowered(): boolean };
  brothers: { group: THREE.Group; call(): void; skip(): void };
  mother: { group: THREE.Group; call(): void };
  father: { group: THREE.Group };
  /** how far apart the halves are (0 shut .. 1 open) */
  open: number;
  update(dt: number, t: number, z: number, cam: THREE.Vector3): void;
}

export function buildSummersEnd(): SummersEnd {
  const rng = new Rng(7101);
  const halves: THREE.Group[] = [];

  // ---------- shared materials ----------
  const section = charToon({ color: 0xf4ead6, rim: 0.1, emissive: new THREE.Color(0x2a241c) });
  const sectionDark = charToon({ color: 0x5a2a22, rim: 0.1 });
  const floorMat = paintMat(planks(0xb08a5e, 7111), 0.22);
  const atticFloor = paintMat(planks(0x9a7a56, 7112), 0.18);
  const ceilMat = new THREE.MeshLambertMaterial({ color: 0xf6efe0, emissive: 0x3a342a });
  const atticCeil = paintMat(planks(0xb89a72, 7113), 0.2);
  atticCeil.side = THREE.DoubleSide;
  const outerWall = texMat(houseBay({ wall: MK.red, trim: MK.trim, shutter: 0x2f4a3a, seed: 7114 }));
  const roofMat = texMat(shingles(0x4a4a46, 7115));
  const trimMat = flat(MK.trim, 0.2);
  const wood = flat(0x7a5236, 0.3), woodLight = flat(0xb08a5e, 0.3), white = flat(0xf4f0e6, 0.25), brass = flat(0xd8b25a, 0.5);
  const fabric = (c: number) => flat(c, 0.3);

  // ---------- the facades, painted as one canvas for the whole front (the halves split it) ----------
  const facade = (front: boolean) => {
    const s = 44, Hu = HOUSE.ridge - PY + 0.1, W = Math.round(D * 2 * s), H = Math.round(Hu * s);
    const p = new Painter(W, H, front ? 7121 : 7122).fill(`#${MK.red.toString(16)}`);
    const g = p.g;
    const Y = (y: number) => H - (y - (PY - 0.1)) * s, X = (x: number) => (x + D) * s;
    // clapboard
    for (let y = 0; y < H; y += s * 0.25) { g.fillStyle = 'rgba(255,240,230,0.08)'; g.fillRect(0, y, W, s * 0.12); g.fillStyle = 'rgba(60,10,10,0.35)'; g.fillRect(0, y + s * 0.22, W, 2); }
    p.dabs({ n: 60, colors: ['rgba(255,255,255,1)', 'rgba(0,0,0,1)'], r: [8, 30], alpha: [0.03, 0.07], squash: 0.3 });
    const trim = '#f4ecda';
    const win = (cx: number, y0: number, w: number, h: number) => {
      g.fillStyle = '#2f4a3a'; g.fillRect(X(cx - w / 2) - s * 0.5, Y(y0 + h), s * 0.4, h * s); g.fillRect(X(cx + w / 2) + s * 0.1, Y(y0 + h), s * 0.4, h * s);
      g.fillStyle = trim; g.fillRect(X(cx - w / 2) - 6, Y(y0 + h) - 10, w * s + 12, h * s + 16);
      const gl = g.createLinearGradient(0, Y(y0 + h), 0, Y(y0)); gl.addColorStop(0, '#5a7a8a'); gl.addColorStop(1, '#2f4656');
      g.fillStyle = gl; g.fillRect(X(cx - w / 2), Y(y0 + h), w * s, h * s);
      g.fillStyle = trim; g.fillRect(X(cx) - 2, Y(y0 + h), 4, h * s); g.fillRect(X(cx - w / 2), Y(y0 + h / 2) - 2, w * s, 5);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(X(cx + w * 0.15), Y(y0 + h) + 4, 5, h * s - 8);
    };
    for (const sd of [-1, 1]) {
      win(sd * 3.9, F[0] + 0.9, 1.3, 1.8);
      win(sd * 1.9, F[1] + 0.9, 1.2, 1.7); win(sd * 4.6, F[1] + 0.9, 1.1, 1.6);
    }
    if (front) {
      // the front door (it splits down the middle) under a little pediment, and the porch light
      g.fillStyle = trim; g.fillRect(X(-0.95), Y(F[0] + 2.6), 1.9 * s, 2.6 * s);
      g.fillStyle = '#2f4a3a'; g.fillRect(X(-0.75), Y(F[0] + 2.4), 1.5 * s, 2.4 * s);
      g.fillStyle = '#26402f'; for (const yy of [0.3, 1.3]) for (const xx of [-0.6, 0.1]) g.fillRect(X(xx), Y(F[0] + yy + 0.9), 0.5 * s, 0.9 * s);
      g.fillStyle = '#d8b25a'; g.beginPath(); g.arc(X(-0.2), Y(F[0] + 1.2), 4, 0, TAU); g.arc(X(0.2), Y(F[0] + 1.2), 4, 0, TAU); g.fill();
      g.fillStyle = trim; g.beginPath(); g.moveTo(X(-1.3), Y(F[0] + 2.7)); g.lineTo(X(0), Y(F[0] + 3.3)); g.lineTo(X(1.3), Y(F[0] + 2.7)); g.closePath(); g.fill();
      // the house's name on a board across the gable
      g.fillStyle = trim; g.fillRect(X(-2.6), Y(F[2] + 1.15), 5.2 * s, 0.85 * s);
      g.fillStyle = '#7a2a24'; g.font = `bold ${Math.round(0.52 * s)}px ${FUTURA}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText("SUMMER'S  END", X(0), Y(F[2] + 0.73));
    }
    // a round attic window at the peak
    g.fillStyle = trim; g.beginPath(); g.arc(X(0), Y(F[2] + 2.6), 0.75 * s, 0, TAU); g.fill();
    g.fillStyle = '#3a5262'; g.beginPath(); g.arc(X(0), Y(F[2] + 2.6), 0.6 * s, 0, TAU); g.fill();
    g.fillStyle = trim; g.fillRect(X(0) - 2, Y(F[2] + 3.2), 4, 1.2 * s); g.fillRect(X(-0.6), Y(F[2] + 2.6) - 2, 1.2 * s, 4);
    // corner boards and the base
    g.fillStyle = trim; g.fillRect(0, 0, 10, H); g.fillRect(W - 10, 0, 10, H);
    g.fillStyle = '#5a2a22'; g.fillRect(0, Y(PY + 0.15), W, 0.25 * s);
    return p.texture({ wrap: false });
  };
  const frontTex = facade(true), backTex = facade(false);

  // ---------- one half ----------
  const buildHalf = (side: -1 | 1) => {
    const g = new THREE.Group();
    const X = (l: number) => side * l;
    const add = (o: THREE.Object3D) => { g.add(o); return o; };
    const zc = (ZF + ZB) / 2, len = ZF - ZB;
    // the wagon: a dark red skirt and the ground-floor slab, with wheels
    add(box(D + 0.1, 0.5, len, sectionDark, X((D + 0.1) / 2), PY - 0.1, zc));
    add(box(D, 0.08, len - 0.1, section, X(D / 2), F[0] - 0.04, zc));
    for (const l of [1.0, 3.2, 5.4]) for (const z of [ZF - 1, zc, ZB + 1]) { const w = cyl(0.22, 0.22, 0.12, wood, X(l), PY - 0.2, z + 0.32 * side, 10); w.rotation.x = Math.PI / 2; w.rotation.z = Math.PI / 2; add(w); }
    // the outer wall
    const ow = new THREE.Mesh(boxUV(new THREE.BoxGeometry(WALL_T, EAVE - PY + 0.1, len), 2.5, 3.5), outerWall);
    ow.position.set(X(D - WALL_T / 2), (EAVE + PY - 0.1) / 2, zc);
    // line the bays up with the storeys: the box's UVs start at its bottom
    add(ow);
    // the gable ends
    for (const front of [true, false]) {
      const shape = new THREE.Shape();
      const pts = [V(0, PY - 0.1, 0), V(X(D), PY - 0.1, 0), V(X(D), EAVE, 0), V(0, HOUSE.ridge, 0)];
      shape.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false });
      const uv = geo.attributes.uv as THREE.BufferAttribute, pos = geo.attributes.position as THREE.BufferAttribute;
      const xmin = side < 0 ? -D : 0;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - xmin) / D, (pos.getY(i) - (PY - 0.1)) / (HOUSE.ridge - PY + 0.1));
      const tex = (front ? frontTex : backTex).clone(); tex.needsUpdate = true;
      tex.repeat.set(0.5, 1); tex.offset.set(side < 0 ? 0 : 0.5, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
      m.position.z = front ? ZF - WALL_T : ZB;
      add(m);
      // white trim along the rake
      const rake = new THREE.Vector2(X(D) - 0, EAVE - HOUSE.ridge);
      const r = box(Math.hypot(rake.x, rake.y) + 0.5, 0.22, 0.1, trimMat, X(D / 2), (EAVE + HOUSE.ridge) / 2 + 0.12, front ? ZF + 0.05 : ZB - 0.05);
      r.rotation.z = Math.atan2(rake.y, rake.x) + (side < 0 ? Math.PI : 0);
      add(r);
    }
    // the roof: one slope from the ridge (at the cut) out over the eave
    {
      const run = D + 0.6, drop = HOUSE.ridge - (EAVE - 0.35);
      const w = Math.hypot(run, drop), ang = Math.atan2(drop, run);
      const roof = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, 0.22, len + 1.0), 1.5), roofMat);
      roof.position.set(X(run / 2), HOUSE.ridge - drop / 2 + 0.12, zc);
      roof.rotation.z = -side * ang;
      add(roof);
      // the attic's sloped ceiling under it
      add(quad(V(0, HOUSE.ridge - 0.12, ZF - WALL_T), V(X(D - WALL_T), EAVE - 0.05, ZF - WALL_T), V(X(D - WALL_T), EAVE - 0.05, ZB + WALL_T), V(0, HOUSE.ridge - 0.12, ZB + WALL_T), atticCeil, 2));
      // the fascia board along the eave
      add(box(0.12, 0.3, len + 1.0, trimMat, X(run - 0.02), EAVE - 0.42, zc));
    }
    // the chimney (right half)
    if (side > 0) {
      const brick = flat(0x8a3a2e, 0.2);
      add(box(1.0, 4.6, 1.2, brick, X(2.2), HOUSE.ridge + 0.4, ZB + 4));
      add(box(1.2, 0.2, 1.4, white, X(2.2), HOUSE.ridge + 2.75, ZB + 4));
    }
    // floors, ceilings and the slabs' cut edges
    for (let f = 0; f < 3; f++) {
      const fl = new THREE.Mesh(repeatUV(new THREE.PlaneGeometry(len - 2 * WALL_T, D - WALL_T), (len - 2 * WALL_T) / 2, D - WALL_T), f === 2 ? atticFloor : floorMat);
      fl.rotation.x = -Math.PI / 2; fl.rotation.z = Math.PI / 2; fl.position.set(X((D - WALL_T) / 2), F[f] + 0.005, zc);
      fl.receiveShadow = true;
      add(fl);
      if (f < 2) {
        const ce = mesh(new THREE.PlaneGeometry(D - WALL_T, len - 2 * WALL_T), ceilMat, X((D - WALL_T) / 2), F[f] + ROOM_H, zc);
        ce.rotation.x = Math.PI / 2; add(ce);
        add(box(D - WALL_T, F[f + 1] - F[f] - ROOM_H, len, section, X((D - WALL_T) / 2), (F[f] + ROOM_H + F[f + 1]) / 2, zc));
      }
    }
    // partitions with their cut edges
    for (let f = 0; f < 2; f++) for (const k of [1, 2]) {
      const z = ZF - k * 10;
      add(box(D - WALL_T, ROOM_H, 0.2, section, X((D - WALL_T) / 2), F[f] + ROOM_H / 2, z));
    }
    // attic partitions are open; a low knee wall at the eave side
    add(box(0.15, 0.9, len - 2 * WALL_T, section, X(D - 0.9), F[2] + 0.45, zc));
    // the cut edges of the outer wall, the gables and the roof show as a cream frame
    add(box(0.12, HOUSE.ridge - PY, 0.3, section, X(0.06), (HOUSE.ridge + PY) / 2, ZF - 0.1));
    add(box(0.12, HOUSE.ridge - PY, 0.3, section, X(0.06), (HOUSE.ridge + PY) / 2, ZB + 0.1));
    return g;
  };

  for (const side of [-1, 1] as const) halves.push(buildHalf(side));
  const halfOf = (side: number) => halves[side < 0 ? 0 : 1];

  // ---------- the rooms: each floor of each half paints all its walls into one canvas ----------
  {
    const S = 44, AW = 2048, AH = 2 * Math.ceil(ROOM_H * S) + 4, rowH = Math.ceil(ROOM_H * S);
    const atlases = new Map<string, { p: Painter; mat: THREE.MeshLambertMaterial; backX: number; sideX: number }>();
    const atlasOf = (side: number, floor: number) => {
      const k = `${side}${floor}`;
      let a = atlases.get(k);
      if (!a) { const p = new Painter(AW, AH, 7140 + floor * 2 + (side > 0 ? 1 : 0)); a = { p, mat: paintMat(p.texture({ wrap: false })), backX: 0, sideX: 0 }; atlases.set(k, a); }
      return a;
    };
    /** a plane whose UVs pick a pixel region of an atlas */
    const atlasPlane = (w: number, h: number, mat: THREE.Material, px: number, py: number, pw: number, ph: number) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (px + uv.getX(i) * pw) / AW, 1 - (py + (1 - uv.getY(i)) * ph) / AH);
      return new THREE.Mesh(geo, mat);
    };
    const rugP = [new Painter(512, 320, 7161), new Painter(512, 320, 7162)];
    const rugMats = rugP.map((p) => paintMat(p.texture({ wrap: false }), 0.2));
    const rugSlot = [0, 0];
    for (const r of ROOMS) {
      const g = halfOf(r.side);
      const X = (l: number) => r.side * l;
      const y0 = F[r.floor];
      const z0 = ZF - WALL_T - r.slot * 10 + (r.slot ? 0.1 : 0), z1 = ZF - (r.slot + 1) * 10 + (r.slot < 2 ? 0.1 : WALL_T);
      const w = z0 - z1, zm = (z0 + z1) / 2;
      const a = atlasOf(r.side, r.floor);
      const bw = Math.round(w * S);
      // the painted back wall
      paintRoomWall(a.p.g, a.p.rng, { w, h: ROOM_H, paper: r.paper, base: r.base, ink: r.ink, dado: r.dado, things: r.things }, a.backX, 0, S);
      const back = atlasPlane(w, ROOM_H, a.mat, a.backX, 0, bw, rowH);
      back.position.set(X(D - WALL_T - 0.01), y0 + ROOM_H / 2, zm);
      back.rotation.y = r.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(back);
      a.backX += bw + 4;
      // wallpaper on the side walls
      for (const [z, face] of [[z0 - 0.002, -1], [z1 + 0.002, 1]] as const) {
        const sw = Math.round((D - WALL_T) * S);
        a.p.g.save(); a.p.g.translate(a.sideX, rowH + 4);
        paintPaper(a.p.g, a.p.rng, r.paper, r.base, r.ink, 0, 0, sw, rowH, S);
        if (r.dado !== undefined) { a.p.g.fillStyle = `#${r.dado.toString(16).padStart(6, '0')}`; a.p.g.fillRect(0, rowH - S, sw, S); a.p.g.fillStyle = 'rgba(255,255,255,0.2)'; a.p.g.fillRect(0, rowH - S - 3, sw, 3); }
        a.p.g.fillStyle = '#6a4a34'; a.p.g.fillRect(0, rowH - 0.16 * S, sw, 0.16 * S);
        wallShade(a.p.g, sw, rowH);
        a.p.g.restore();
        const m = atlasPlane(D - WALL_T - 0.02, ROOM_H, a.mat, a.sideX, rowH + 4, sw, rowH);
        m.position.set(X((D - WALL_T) / 2), y0 + ROOM_H / 2, z);
        m.rotation.y = face < 0 ? Math.PI : 0;
        g.add(m);
        a.sideX += sw + 4;
      }
      if (r.rug) {
        const hi = r.side < 0 ? 0 : 1, k = rugSlot[hi]++;
        const img = rug(r.rug[0], r.rug[1], 7160 + r.slot).image as HTMLCanvasElement;
        rugP[hi].g.drawImage(img, (k % 2) * 256, Math.floor(k / 2) * 160);
        const rg = atlasPlane(w * 0.55, (D - WALL_T) * 0.55, rugMats[hi], (k % 2) * 256, Math.floor(k / 2) * 160, 256, 160);
        // the atlas helper assumes the 2048 x AH canvas: rescale to the rug canvas
        const uv = rg.geometry.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * AW) / 512, 1 - ((1 - uv.getY(i)) * AH) / 320);
        rg.position.set(X((D - WALL_T) * 0.5), y0 + 0.02, zm);
        rg.rotation.x = -Math.PI / 2; rg.rotation.z = Math.PI / 2; rg.receiveShadow = true;
        g.add(rg);
      }
    }
  }

  // ---------- furniture (in each half's own space: X(l) is l out from the cut) ----------
  const furnish = (side: -1 | 1, floor: 0 | 1 | 2, slot: number, fill: (add: (o: THREE.Object3D) => void, X: (l: number) => number, y: number, z0: number, z1: number) => void) => {
    const g = halfOf(side);
    const [z0, z1] = slotZ(slot);
    fill((o) => { g.add(o); }, (l) => side * l, F[floor], z0, z1);
  };
  const faceCut = (side: number) => (side < 0 ? Math.PI / 2 : -Math.PI / 2);
  const armchair = (c: number) => {
    const a = new THREE.Group(), m = fabric(c);
    a.add(box(0.9, 0.45, 0.85, m, 0, 0.32, 0), box(0.9, 0.85, 0.2, m, 0, 0.75, -0.35), box(0.18, 0.6, 0.85, m, -0.45, 0.5, 0), box(0.18, 0.6, 0.85, m, 0.45, 0.5, 0));
    for (const [x, z] of [[-0.38, 0.35], [0.38, 0.35], [-0.38, -0.35], [0.38, -0.35]]) a.add(box(0.07, 0.12, 0.07, wood, x, 0.06, z));
    return a;
  };
  const table = (w: number, d: number, h: number, m = wood) => {
    const t = new THREE.Group();
    t.add(box(w, 0.06, d, m, 0, h, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) t.add(box(0.06, h, 0.06, m, x * (w / 2 - 0.08), h / 2, z * (d / 2 - 0.08)));
    return t;
  };
  const chair = (c: number) => {
    const t = new THREE.Group(), m = flat(c, 0.25);
    t.add(box(0.42, 0.05, 0.42, m, 0, 0.45, 0), box(0.42, 0.5, 0.05, m, 0, 0.72, -0.19));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) t.add(box(0.04, 0.45, 0.04, m, x * 0.18, 0.22, z * 0.18));
    return t;
  };
  const bed = (w: number, l: number, cover: number) => {
    const b = new THREE.Group();
    b.add(box(w, 0.35, l, wood, 0, 0.25, 0), box(w * 0.94, 0.16, l * 0.97, flat(cover, 0.3), 0, 0.5, 0.02), box(w * 0.8, 0.12, 0.35, white, 0, 0.62, -l / 2 + 0.3));
    b.add(box(w, 0.9, 0.06, wood, 0, 0.45, -l / 2), box(w, 0.6, 0.06, wood, 0, 0.3, l / 2));
    return b;
  };
  const lamp = (h: number, shade = 0xf2e0b0) => {
    const l = new THREE.Group();
    l.add(cyl(0.18, 0.2, 0.05, brass, 0, 0.025, 0, 10), cyl(0.02, 0.02, h, brass, 0, h / 2, 0, 5));
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 12, 1, true), glow(shade, 1.0)); sh.position.y = h; l.add(sh);
    return l;
  };
  const place = (o: THREE.Object3D, x: number, y: number, z: number, yaw = 0) => { o.position.set(x, y, z); o.rotation.y = yaw; return o; };

  // living room (left, ground, front): an armchair, a lamp, a piano bench, the boys' rug
  furnish(-1, 0, 0, (add, X, y, z0, z1) => {
    add(place(armchair(0x6a8a6a), X(4.6), y, z0 - 1.6, faceCut(-1) - 0.5));
    add(place(lamp(1.5), X(5.4), y, z0 - 0.7));
    add(place(armchair(0xb0473a), X(4.8), y, z1 + 1.5, faceCut(-1) + 0.4));
    add(place(table(0.8, 0.5, 0.45), X(4.3), y, (z0 + z1) / 2 + 2.2));
    add(place(box(0.26, 0.05, 0.26, flat(0xe2b33c), 0, 0, 0), X(4.3), y + 0.5, (z0 + z1) / 2 + 2.2));
  });
  // hall (left, ground, mid): the stairs up along the back wall, a hall table, a coat stand
  const stairs = new THREE.Group();
  furnish(-1, 0, 1, (add, X, y, z0, z1) => {
    const n = 12, run = 7.2, rise = ROOM_H;
    for (let i = 0; i < n; i++) {
      const zz = z0 - 1.2 - (i + 0.5) * (run / n);
      add(box(1.5, (i + 1) * (rise / n), run / n, i % 2 ? woodLight : wood, X(D - WALL_T - 0.8), y + ((i + 1) * (rise / n)) / 2, zz));
    }
    // the banister
    const a = V(X(D - WALL_T - 1.55), y + 1.0, z0 - 1.2), b = V(X(D - WALL_T - 1.55), y + rise + 0.95, z0 - 1.2 - run);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, a.distanceTo(b), 6), wood);
    rail.position.copy(a).lerp(b, 0.5); rail.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); add(rail);
    for (let i = 0; i <= n; i += 2) { const zz = z0 - 1.2 - i * (run / n), hy = y + i * (rise / n); add(box(0.04, 0.95, 0.04, white, X(D - WALL_T - 1.55), hy + 0.48, zz)); }
    add(place(table(1.0, 0.4, 0.8), X(1.6), y, z0 - 0.6));
    add(place(cyl(0.12, 0.16, 0.3, flat(0x3f8f8c), 0, 0, 0, 10), X(1.6), y + 0.98, z0 - 0.6));
    const stand = new THREE.Group(); stand.add(cyl(0.03, 0.04, 1.9, wood, 0, 0.95, 0, 6), sphere(0.2, flat(0x8a6a3a), 0.12, 1.65, 0, 8, 6), cyl(0.18, 0.28, 0.9, flat(0x3a4a5a), -0.1, 1.2, 0.05, 8));
    add(place(stand, X(1.2), y, z1 + 0.8));
  });
  void stairs;
  // kitchen (left, ground, back): counter and stove along the back, a table with chairs, a hanging lamp
  furnish(-1, 0, 2, (add, X, y, z0, z1) => {
    add(box(0.8, 0.9, 6.2, white, X(D - WALL_T - 0.4), y + 0.45, (z0 + z1) / 2 - 1.2));
    add(box(0.82, 0.05, 6.22, flat(0x3f8f8c, 0.3), X(D - WALL_T - 0.4), y + 0.92, (z0 + z1) / 2 - 1.2));
    add(box(0.8, 0.95, 0.9, flat(0xf2e6c8, 0.3), X(D - WALL_T - 0.4), y + 0.48, z0 - 1.4));
    for (const dz of [-0.2, 0.2]) add(cyl(0.12, 0.12, 0.03, flat(0x2a2a2a), X(D - WALL_T - 0.45), y + 0.97, z0 - 1.4 + dz, 10));
    add(place(cyl(0.18, 0.15, 0.22, flat(0xb0473a, 0.4), 0, 0, 0, 12), X(D - WALL_T - 0.45), y + 1.08, z0 - 1.2));
    const tz = (z0 + z1) / 2 + 0.5;
    add(place(table(1.6, 1.0, 0.75, flat(0xe2b33c, 0.3)), X(2.8), y, tz));
    for (const [dx, dz, yaw] of [[0, -0.85, 0], [0, 0.85, Math.PI], [-1.05, 0, Math.PI / 2], [1.05, 0, -Math.PI / 2]] as const) add(place(chair(0xf2e6c8), X(2.8) + dx, y, tz + dz, yaw));
    add(place(cyl(0.02, 0.02, 1.0, flat(0x2a2a2a), 0, 0, 0, 4), X(2.8), y + ROOM_H - 0.5, tz));
    add(place(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 14, 1, true), flat(0xb0473a, 0.3)), X(2.8), y + ROOM_H - 1.05, tz));
    add(place(sphere(0.12, glow(0xffe0a0, 1.3), 0, 0, 0, 8, 6), X(2.8), y + ROOM_H - 1.15, tz));
  });
  // Suzy's room (left, first, front): her bed, a suitcase, a stack of library books, a record player
  furnish(-1, 1, 0, (add, X, y, z0, z1) => {
    add(place(bed(1.2, 2.2, MK.pink), X(D - WALL_T - 1.3), y, z0 - 1.6, Math.PI / 2));
    add(place(box(0.7, 0.45, 0.25, flat(0xe2b33c, 0.3), 0, 0, 0), X(3.0), y + 0.23, z1 + 1.4, 0.3));
    const cols = [0xb0473a, 0x3f8f8c, 0xe2b33c, 0x2a3550, 0xf0a2a8, 0x6a8a5a];
    for (let i = 0; i < 6; i++) add(place(box(0.42, 0.07, 0.3, flat(cols[i]), 0, 0, 0), X(2.0), y + 0.035 + i * 0.072, (z0 + z1) / 2 + 0.6, rng.range(-0.3, 0.3)));
    add(place(table(0.9, 0.6, 0.75), X(D - WALL_T - 0.7), y, z1 + 2.6));
  });
  // bathroom (left, first, mid): a claw-foot tub, a sink with a mirror
  furnish(-1, 1, 1, (add, X, y, z0, z1) => {
    const tub = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 6, 14), white); tb.rotation.x = Math.PI / 2; tb.scale.set(1, 1, 0.75); tb.position.y = 0.48; tub.add(tb);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16), flat(0x9ccad8, 0.3)); water.rotation.x = -Math.PI / 2; water.scale.set(1, 2.6, 1); water.position.y = 0.72; tub.add(water);
    for (const [x, z] of [[-0.3, -0.6], [0.3, -0.6], [-0.3, 0.6], [0.3, 0.6]]) tub.add(sphere(0.07, brass, x, 0.07, z, 6, 5));
    add(place(tub, X(3.2), y, (z0 + z1) / 2 + 1.5));
    add(place(cyl(0.3, 0.12, 0.85, white, 0, 0, 0, 12), X(D - WALL_T - 0.4), y + 0.43, z1 + 2.2));
    add(place(box(0.05, 0.8, 0.6, flat(0xc8dce4, 0.6), 0, 0, 0), X(D - WALL_T - 0.05), y + 1.6, z1 + 2.2));
  });
  // the study (left, first, back): a desk with a typewriter and a lamp
  furnish(-1, 1, 2, (add, X, y, z0, z1) => {
    add(place(table(1.8, 0.8, 0.78), X(3.4), y, (z0 + z1) / 2));
    add(place(box(0.5, 0.18, 0.42, flat(0x2a2a2e, 0.4), 0, 0, 0), X(3.4), y + 0.9, (z0 + z1) / 2));
    add(place(lamp(0.5, 0x6aa080), X(3.4), y + 0.8, (z0 + z1) / 2 - 0.7));
    add(place(chair(0x5a3a24), X(2.4), y, (z0 + z1) / 2, -Math.PI / 2));
  });
  // Mr. Bishop's study (right, ground, front): his armchair, a side table with a wine bottle, a standing lamp
  furnish(1, 0, 0, (add, X, y, z0, z1) => {
    add(place(table(0.6, 0.6, 0.6), X(3.4), y, (z0 + z1) / 2 + 1.4));
    add(place(cyl(0.06, 0.07, 0.36, flat(0x3a1a2a, 0.5), 0, 0, 0, 8), X(3.4), y + 0.81, (z0 + z1) / 2 + 1.35));
    add(place(lamp(1.6, 0xf6d8a0), X(4.6), y, (z0 + z1) / 2 + 1.8));
    add(place(armchair(0x8a6a4a), X(5.0), y, z1 + 1.4, faceCut(1) - 0.6));
  });
  // dining room (right, ground, mid): a long table, chairs, a sideboard, a chandelier
  furnish(1, 0, 1, (add, X, y, z0, z1) => {
    const tz = (z0 + z1) / 2;
    add(place(table(1.2, 4.2, 0.78), X(3.2), y, tz));
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) add(place(chair(0x7a2a24), X(3.2) + s * 0.85 * 1, y, tz - 1.5 + i, s > 0 ? -Math.PI / 2 : Math.PI / 2));
    add(box(0.5, 0.9, 2.4, wood, X(D - WALL_T - 0.3), y + 0.45, tz + 2.6));
    add(place(cyl(0.015, 0.015, 0.9, brass, 0, 0, 0, 4), X(3.2), y + ROOM_H - 0.45, tz));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; add(place(sphere(0.08, glow(0xffe8b0, 1.2), 0, 0, 0, 6, 5), X(3.2) + Math.cos(a) * 0.4, y + ROOM_H - 0.95, tz + Math.sin(a) * 0.4)); }
    add(place(new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 4, 18), brass), X(3.2), y + ROOM_H - 1.0, tz).rotateX(Math.PI / 2));
    for (let k = 0; k < 6; k++) add(place(cyl(0.16, 0.16, 0.02, white, 0, 0, 0, 10), X(3.2) + (k % 2 ? 0.35 : -0.35), y + 0.82, tz - 1.4 + Math.floor(k / 2) * 1.4));
  });
  // music room (right, ground, back): an upright piano and the instruments of the orchestra on stands
  furnish(1, 0, 2, (add, X, y, z0, z1) => {
    const pz = (z0 + z1) / 2 - 1.5;
    add(box(0.65, 1.3, 1.6, flat(0x2a1e1a, 0.4), X(D - WALL_T - 0.35), y + 0.65, pz));
    add(box(0.3, 0.05, 1.4, white, X(D - WALL_T - 0.75), y + 0.78, pz));
    add(place(box(0.35, 0.45, 0.8, flat(0x2a1e1a, 0.3), 0, 0, 0), X(D - WALL_T - 1.4), y + 0.23, pz));
    // a cello, a violin, a drum, a trumpet, a flute
    const cello = new THREE.Group(); const cb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), flat(0x9a4a1a, 0.4)); cb.scale.set(1, 1.6, 0.4); cb.position.y = 0.65; cello.add(cb); cello.add(cyl(0.03, 0.03, 0.9, flat(0x1e1414), 0, 1.4, 0, 5));
    add(place(cello, X(2.4), y, pz + 3.0, faceCut(1)));
    const drum = new THREE.Group(); drum.add(cyl(0.36, 0.36, 0.4, flat(0xb0473a, 0.3), 0, 0.55, 0, 16), cyl(0.37, 0.37, 0.03, white, 0, 0.76, 0, 16)); for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; drum.add(box(0.03, 0.4, 0.03, brass, Math.cos(a) * 0.25, 0.2, Math.sin(a) * 0.25)); }
    add(place(drum, X(3.4), y, pz + 4.4));
    const tr = new THREE.Group(); tr.add(cyl(0.02, 0.02, 0.5, brass, 0, 0, 0, 6).rotateZ(Math.PI / 2)); const bell = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 10, 1, true), brass); bell.rotation.z = Math.PI / 2; bell.position.x = 0.32; tr.add(bell);
    add(place(tr, X(2.0), y + 0.9, pz + 4.6, 0.4));
    add(place(table(0.5, 0.5, 0.8), X(2.0), y, pz + 4.6));
  });
  // the parents' room (right, first, front): twin beds with a nightstand between them
  furnish(1, 1, 0, (add, X, y, z0, z1) => {
    const zm = (z0 + z1) / 2;
    for (const dz of [-1.0, 1.0]) add(place(bed(1.0, 2.0, 0xe8e0c8), X(D - WALL_T - 1.05), y, zm + dz, -Math.PI / 2));
    add(place(box(0.5, 0.6, 0.5, wood, 0, 0, 0), X(D - WALL_T - 0.3), y + 0.3, zm));
    add(place(lamp(0.35, 0xf2e0b0), X(D - WALL_T - 0.3), y + 0.6, zm));
  });
  // the boys' room (right, first, mid): a triple bunk bed, a small tent pitched on the floor
  furnish(1, 1, 1, (add, X, y, z0, z1) => {
    const zm = (z0 + z1) / 2;
    const bunk = new THREE.Group();
    for (let i = 0; i < 3; i++) { bunk.add(box(1.0, 0.12, 2.0, wood, 0, 0.35 + i * 0.95, 0), box(0.94, 0.12, 1.94, flat([0xb0473a, 0x3f8f8c, 0xe2b33c][i], 0.3), 0, 0.47 + i * 0.95, 0)); }
    for (const [x, z] of [[-0.48, -0.98], [0.48, -0.98], [-0.48, 0.98], [0.48, 0.98]]) bunk.add(box(0.08, 3.1, 0.08, wood, x, 1.55, z));
    add(place(bunk, X(D - WALL_T - 0.6), y, zm + 2.0));
    const tent = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 4, 1, true), flat(MK.khaki, 0.3)); tent.rotation.y = Math.PI / 4; tent.scale.set(1, 1, 1.4);
    add(place(tent, X(2.6), y + 0.6, zm - 1.8));
  });
  // the toy room (right, first, back): a model railway with a little pink train on it
  furnish(1, 1, 2, (add, X, y, z0, z1) => {
    const zm = (z0 + z1) / 2;
    add(place(table(2.6, 2.6, 0.5, flat(0x4a7a4a, 0.3)), X(3.2), y, zm));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 4, 32), flat(0x5a5a5a, 0.4)); ring.rotation.x = Math.PI / 2; add(place(ring, X(3.2), y + 0.55, zm));
    for (let k = 0; k < 4; k++) { const a = (k / 4) * 1.4; add(place(box(0.14, 0.12, 0.3, flat(k ? 0xf2b8c6 : 0x7a2a36, 0.4), 0, 0, 0), X(3.2) + Math.cos(a) * 1.0, y + 0.62, zm + Math.sin(a) * 1.0, -a)); }
    add(place(sphere(0.35, flat(0x3f8f8c, 0.3), 0, 0, 0, 12, 10), X(D - WALL_T - 0.6), y + 1.1, z1 + 1.0));
  });
  // the attics: trunks, a dress form, a rocking horse, a lifebuoy, a canoe paddle
  furnish(-1, 2, 0, (add, X, y, z0, z1) => {
    for (const [l, z, c] of [[3.2, z0 - 3, 0x5a3a24], [3.6, z0 - 5, 0x2a4a5a], [2.8, z1 - 10, 0x7a2a24]] as const) add(place(box(0.9, 0.55, 0.6, flat(c, 0.3), 0, 0, 0), X(l), y + 0.28, z));
    const form = new THREE.Group(); form.add(cyl(0.02, 0.02, 1.0, wood, 0, 0.5, 0, 5)); const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.35, 4, 10), flat(0xe8d0b0)); torso.position.y = 1.25; form.add(torso);
    add(place(form, X(2.4), y, z0 - 8));
    const horse = new THREE.Group(); horse.add(box(0.2, 0.3, 0.8, flat(0xf4f0e6), 0, 0.65, 0), box(0.16, 0.36, 0.2, flat(0xf4f0e6), 0, 0.92, 0.38), box(0.06, 0.06, 1.1, flat(0xb0473a), 0, 0.12, 0));
    add(place(horse, X(3.0), y, z0 - 13));
  });
  furnish(1, 2, 0, (add, X, y, z0) => {
    const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.12, 8, 18), flat(0xe8584a, 0.3)); add(place(buoy, X(3.5), y + 0.8, z0 - 4).rotateY(Math.PI / 2));
    add(place(box(0.08, 0.05, 1.8, wood, 0, 0, 0), X(3.0), y + 0.05, z0 - 9, 0.3));
    for (const [l, z] of [[3.6, z0 - 14], [3.0, z0 - 20]]) add(place(box(0.9, 0.6, 0.7, flat(0x6a5a3a, 0.3), 0, 0, 0), X(l), y + 0.3, z));
  });

  // ---------- the record sleeve, propped against the wall in the living room ----------
  {
    const sleeve = mesh(new THREE.PlaneGeometry(0.62, 0.62), paintMat(brittenSleeve(), 0.25), -(D - WALL_T - 0.06), F[0] + 0.33, ZF - 6.2);
    sleeve.rotation.y = Math.PI / 2; sleeve.rotation.z = 0.08;
    halves[0].add(sleeve);
  }

  // ---------- the family ----------
  // the three brothers, lying on the living-room rug, chins in hands, before the record player
  const brosG = new THREE.Group();
  const bros: Kid[] = [];
  const rp = recordPlayer(1.4);
  {
    // the record player in front of them, between the boys and the track, turned so they can see the record
    rp.group.position.set(4.5, 0, 1.3); rp.group.rotation.y = -Math.PI / 2 - 0.5; brosG.add(rp.group);
    for (let i = 0; i < 3; i++) {
      const k = brotherKid(i);
      k.group.scale.setScalar(BRO);
      // lying on the stomach, head towards the cut (local +x of brosG), propped on the elbows
      const holder = new THREE.Group();
      holder.add(k.group);
      // head towards +x, face down: the kid's y becomes +x, its z becomes -y
      k.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, -1), V(1, 0, 0), V(0, -1, 0)));
      k.group.position.set(-1.12 * BRO, 0.16 * BRO / 0.48, 0);
      k.neck.rotation.x = -1.15;
      k.shoulder.forEach((s, j) => { s.rotation.set(-1.45, 0, (j ? 1 : -1) * 0.3); });
      k.elbow.forEach((e) => { e.rotation.set(-1.6, 0, 0); });
      k.knee.forEach((kn, j) => { kn.rotation.x = 1.5 + (j ? 0.4 : -0.2) + i * 0.15; });
      k.hip.forEach((h, j) => { h.rotation.z = (j ? 1 : -1) * 0.12; });
      holder.position.set(2.6 + (i === 1 ? 0.35 : 0), 0, (i - 1) * 0.95);
      holder.rotation.y = (i - 1) * -0.18;
      brosG.add(holder);
      bros.push(k);
    }
    // the brothers dress alike: give them the same cloth so their bodies merge into one
    const top0 = torsoOf(bros[0]).material as THREE.Material;
    const bot0 = (bros[0].pelvis.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh).material as THREE.Material;
    for (const k of bros.slice(1)) {
      swapMat(k.group, torsoOf(k).material as THREE.Material, top0);
      swapMat(k.group, (k.pelvis.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh).material as THREE.Material, bot0);
    }
    lighten(brosG);
    bake(brosG, [...bros.map((k) => k.head), rp.record], false);
    // the half's +x points into the house (its cut faces +x); the boys' heads point at the cut
    brosG.position.set(-(D - WALL_T) + 0.6, F[0], ZF - 5.2);
    halves[0].add(brosG);
  }
  // Mrs. Bishop on the stairs with her megaphone
  const mom = mrsBishop();
  {
    const n = 12, run = 7.2, stepZ0 = slotZ(1)[0] - 1.2;
    const i = 5;
    mom.group.position.set(-(D - WALL_T - 0.8), F[0] + (i + 1) * (ROOM_H / n), stepZ0 - (i + 0.5) * (run / n));
    mom.group.rotation.y = Math.PI / 2;
    const mg = megaphone(1.1);
    // pointing past the fingers, held by its grip
    mg.position.set(0, -0.33, 0.1); mg.rotation.x = Math.PI / 2;
    mom.elbow[0].add(mg);
    halves[0].add(mom.group);
    mom.group.scale.multiplyScalar(1.12);
    lighten(mom.group);
    bake(mom.group, [mom.head, mom.shoulder[0], mom.elbow[0]], false);
  }
  // Mr. Bishop in his armchair, reading the paper
  const dad = mrBishop();
  {
    const n = newspaper(1.35);
    n.position.set(0.17, -0.32, 0.2); n.rotation.set(-0.1, 0.1, 0);
    dad.elbow[0].add(n);
    dad.pelvis.position.y = 0.55;
    for (let i = 0; i < 2; i++) { dad.hip[i].rotation.x = -1.45; dad.knee[i].rotation.x = 1.4; }
    dad.shoulder.forEach((s, i) => s.rotation.set(-0.85, 0, (i ? 1 : -1) * 0.3));
    dad.elbow.forEach((e) => e.rotation.set(-1.1, 0, 0));
    dad.group.position.set(5.0 - 0.15, F[0] + 0.05, ZF - 10 + 1.4);
    dad.group.rotation.y = -Math.PI / 2 - 0.6;
    halves[1].add(dad.group);
    dad.group.scale.multiplyScalar(1.15);
    lighten(dad.group);
    bake(dad.group, [dad.head, dad.elbow[0], dad.elbow[1]], false);
  }

  // ---------- the lighthouse ----------
  const lighthouse = new THREE.Group();
  const lhStatic = new THREE.Group();
  lighthouse.add(lhStatic);
  {
    const L = LIGHTHOUSE;
    const towerH = L.gallery - PY;
    const tw = texMat(clapboard(0xf4f0e6, 7171));
    const tower = new THREE.Mesh(repeatUV(new THREE.CylinderGeometry(L.r * 0.74, L.r, towerH, 28, 1, true), 5, towerH / 2), tw);
    tower.position.y = PY + towerH / 2; lhStatic.add(tower);
    lhStatic.add(cyl(L.r + 0.3, L.r + 0.45, 0.6, flat(0x7a7a70), 0, PY + 0.1, 0, 28));
    lhStatic.add(cyl(L.r * 0.74 + 0.04, L.r * 0.78 + 0.04, 0.7, flat(MK.red, 0.3), 0, L.gallery - 0.6, 0, 28));
    // the door and little windows up the tower, facing the track
    const door = new THREE.Group(); door.add(box(1.0, 1.9, 0.3, flat(0x2f4a3a), 0, 0.95, 0), box(1.25, 0.2, 0.32, white, 0, 1.95, 0));
    door.position.set(-L.r + 0.12, PY + 0.4, 0); door.rotation.y = -Math.PI / 2; lhStatic.add(door);
    for (const [y, a] of [[PY + 4.2, -Math.PI / 2 - 0.4], [PY + 7.0, -Math.PI / 2 + 0.5], [PY + 5.4, 0.6]] as const) {
      const r = lerp(L.r, L.r * 0.74, (y - PY) / towerH) - 0.02;
      const w = new THREE.Group(); w.add(box(0.55, 0.85, 0.12, white, 0, 0, 0), box(0.4, 0.68, 0.14, flat(0x3a5262, 0.5), 0, 0, 0.01));
      w.position.set(Math.sin(a) * r, y, Math.cos(a) * r); w.rotation.y = a; lhStatic.add(w);
    }
    // the gallery: a deck, an iron railing
    lhStatic.add(cyl(L.r + 0.35, L.r * 0.8, 0.3, flat(0x2a2c2a, 0.3), 0, L.gallery, 0, 28));
    const iron = flat(0x2a2c2a, 0.4);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(L.r + 0.28, 0.04, 5, 36), iron); rail.rotation.x = Math.PI / 2; rail.position.y = L.gallery + 1.0; lhStatic.add(rail);
    for (let k = 0; k < 20; k++) { const a = (k / 20) * TAU; lhStatic.add(box(0.04, 1.0, 0.04, iron, Math.cos(a) * (L.r + 0.28), L.gallery + 0.5, Math.sin(a) * (L.r + 0.28))); }
    // the lantern room: glass between iron mullions, the lamp, a red dome with a vent ball
    const glassMat = new THREE.MeshLambertMaterial({ color: 0xcfe6ee, transparent: true, opacity: 0.35, emissive: 0x405058, depthWrite: false, side: THREE.DoubleSide });
    const glassMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 2.0, 16, 1, true), glassMat); glassMesh.position.y = L.gallery + 1.2; glassMesh.userData.keep = true; lighthouse.add(glassMesh);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; lhStatic.add(box(0.07, 2.0, 0.07, iron, Math.cos(a) * 1.36, L.gallery + 1.2, Math.sin(a) * 1.36)); }
    lhStatic.add(cyl(1.45, 1.45, 0.16, iron, 0, L.gallery + 2.25, 0, 20));
    lhStatic.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 8, 0, TAU, 0, Math.PI / 2), flat(MK.red, 0.4)).translateY(L.gallery + 2.3));
    lhStatic.add(sphere(0.25, iron, 0, L.gallery + 3.95, 0, 10, 8));
    lhStatic.add(cyl(0.05, 0.05, 0.8, iron, 0, L.gallery + 4.4, 0, 5));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 12), glow(0xfff2c0, 1.25)); lens.position.y = L.gallery + 1.15; lighthouse.add(lens);
    lighthouse.position.set(L.x, 0, L.z);
    // rocks round the foot
    const rockM = flat(0x8a8276, 0.2);
    for (let k = 0; k < 14; k++) { const a = rng.range(0, TAU), r = rng.range(L.r + 1.2, L.r + 4.5); const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(rng.range(0.4, 1.1), 0), rockM); rk.position.set(Math.cos(a) * r, PY - 0.3, Math.sin(a) * r); rk.rotation.set(rng.range(0, 3), rng.range(0, 3), 0); rk.scale.y = 0.6; lhStatic.add(rk); }
  }
  // Suzy on the gallery, watching through her binoculars
  const suzy = suzyKid();
  const suzyG = new THREE.Group();
  const bino = binoculars(1.6);
  {
    suzy.group.scale.setScalar(KID.tall);
    suzyG.add(suzy.group);
    suzyG.position.set(0, LIGHTHOUSE.gallery + 0.15, LIGHTHOUSE.r - 0.25);
    lighthouse.add(suzyG);
    bino.position.set(0, -0.02, 0.36);
    lighten(suzy.group, 48, 32);
    bake(suzy.group, [suzy.head, suzy.shoulder[0], suzy.shoulder[1], suzy.elbow[0], suzy.elbow[1]]);
    mergeStatic(bino);
    bino.traverse((o) => { o.userData.keep = true; });
    suzy.head.add(bino);
  }

  // ---------- optimise the static parts: only the shell casts shadows ----------
  const shellMats = new Set<THREE.Material>([section, sectionDark, outerWall, roofMat, trimMat]);
  for (const h of halves) {
    h.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = shellMats.has(m.material as THREE.Material) || (m.material as THREE.Material).type === 'MeshLambertMaterial' && !!(m.material as THREE.MeshLambertMaterial).map && m.geometry.type === 'ExtrudeGeometry'; m.receiveShadow = true; } });
    unify(h);
  }
  // the characters move, so keep them out of the merge
  const keepOut = [brosG, mom.group, dad.group];
  for (const k of keepOut) { k.userData.p = k.parent; k.parent!.remove(k); }
  for (const h of halves) optimize(h);
  halves[0].add(brosG, mom.group); halves[1].add(dad.group);
  optimize(lhStatic);

  const anchor = new THREE.Object3D();
  anchor.position.set(0, PY + 5.5, ZF);

  // ---------- life ----------
  const sp = { binoc: new Spring(1, 1.6, 0.75), mega: new Spring(0, 2.2, 0.6), bros: new Spring(0, 1.8, 0.7) };
  let suzyT = -1, momT = -1, brosT = -1, skipT = -1, open = 0;
  const camLocal = new THREE.Vector3(), tmp = new THREE.Vector3();
  let suzyYaw = 0;

  return {
    halves, lighthouse, anchor,
    suzy: { group: suzyG, head: suzy.head, call() { suzyT = 0; }, lowered: () => sp.binoc.x < 0.5 },
    brothers: { group: brosG, call() { brosT = 0; }, skip() { skipT = 0; } },
    mother: { group: mom.group, call() { momT = 0; } },
    father: { group: dad.group },
    get open() { return open; },
    update(dt, t, z, cam) {
      // the halves roll apart on their wagons as the train comes
      open = smoothstep(HOUSE.openZ0, HOUSE.openZ1, z);
      const k = open * open * (3 - 2 * open);
      halves[0].position.x = -HOUSE.gap * k;
      halves[1].position.x = HOUSE.gap * k;
      // a little shudder as they set off and stop
      const shudder = Math.sin(t * 40) * 0.015 * Math.sin(Math.PI * open);
      halves[0].position.y = halves[1].position.y = shudder;

      // ---- Suzy: tracks the train through her binoculars; called, she lowers them and looks at you ----
      let lower = 0;
      if (suzyT >= 0) { suzyT += dt; lower = envelope(suzyT, 0, 0.5, 3.6, 4.4); if (suzyT > 4.4) suzyT = -1; }
      const b = sp.binoc.update(1 - lower, dt);
      suzyG.updateWorldMatrix(true, false);
      camLocal.copy(cam); suzyG.worldToLocal(camLocal);
      const want = clamp(Math.atan2(camLocal.x, camLocal.z) + suzyYaw, -1.6, 1.6);
      suzyYaw = damp(suzyYaw, want, 1.5, dt);
      suzy.group.rotation.y = suzyYaw;
      suzy.tick(dt, t, cam, 1);
      // binoculars up: both hands at the eyes; down: hanging at the chest
      const up = clamp(b, 0, 1);
      suzy.shoulder.forEach((s, i) => s.rotation.set(lerp(-0.25, -1.25, up), 0, (i ? 1 : -1) * lerp(0.12, -0.42, up)));
      suzy.elbow.forEach((e) => e.rotation.set(lerp(-0.5, -1.75, up), 0, 0));
      bino.visible = up > 0.35;
      // the binoculars move the head a little, as if steadying them
      suzy.head.rotation.z = Math.sin(t * 0.9) * 0.04 * up;

      // ---- the brothers: heads nod to Britten; called, they all look round at you ----
      rp.record.rotation.y -= dt * 3.5 * (skipT >= 0 ? 0.2 : 1);
      if (skipT >= 0) { skipT += dt; if (skipT > 1.5) skipT = -1; }
      let look = 0;
      if (brosT >= 0) { brosT += dt; look = envelope(brosT, 0, 0.35, 3.0, 3.6); if (brosT > 3.6) brosT = -1; }
      const lk = sp.bros.update(look, dt);
      brosG.updateWorldMatrix(true, false);
      tmp.copy(cam); brosG.worldToLocal(tmp);
      bros.forEach((kd, i) => {
        const nod = Math.sin(t * 4.2 + i * 0.7) * 0.12 * (1 - lk);
        const turn = Math.atan2(-tmp.z, tmp.x - 2.6) * 0.8;
        kd.head.rotation.set(nod + (skipT >= 0 ? -0.3 * Math.sin(Math.PI * Math.min(1, skipT / 1.5)) : 0), clamp(turn, -0.9, 0.9) * lk, Math.sin(t * 2.1 + i) * 0.05);
      });

      // ---- Mrs. Bishop: called, she raises the megaphone at you ----
      let m = 0;
      if (momT >= 0) { momT += dt; m = envelope(momT, 0, 0.4, 2.8, 3.4); if (momT > 3.4) momT = -1; }
      const mg = sp.mega.update(m, dt);
      mom.tick(dt, t, cam, 1);
      mom.shoulder[0].rotation.set(lerp(-0.2, -1.45, mg), 0, lerp(-0.12, -0.15, mg));
      mom.elbow[0].rotation.set(lerp(-0.45, -0.25, mg), 0, 0);

      // ---- Mr. Bishop: now and then he lowers the paper to look over it ----
      const peek = envelope((t % 9) , 5.5, 6.1, 7.4, 8.0);
      dad.elbow.forEach((e) => e.rotation.set(lerp(-1.1, -0.55, peek), 0, 0));
      dad.tick(dt, t, peek > 0.5 ? cam : null, peek);
    },
  };
}
