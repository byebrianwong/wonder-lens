import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl } from '../../../engine/Builders';
import { boxUV, Painter, repeatUV } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { metalPlates, stoneWall } from '../../ghibli/characterTextures';
import { deckPlanks } from '../../ghibli/propTextures';
import { BOILER, COAL_HEAP, DAIS, FURNACE, KAMAJI, PODIUM, RAMP } from './plan';
import { boilerFloor, CELL, coalEmbers, coalTexture, drawerWall, lightPool, signTexture, sootyBoards, townAtlas } from './textures';
import { accMeshes, COLORS, newAccs } from './town';
import { LANTERN, waveLit, type LanternField } from './wave';
import type { BridgeMats } from './bridge';
import type { PlumeSource } from './steam';
import type { Road } from '../layout';
import { ribbon, subCurve } from '../common';

/*
 * The boiler room under the bathhouse: a tall, sooty timber hall. Kamaji's platform stands against the left
 * wall in front of his wall of herb drawers, with the furnace's mouth glowing in its front; the coal heap is
 * by the door; a great riveted boiler and its pipes fill the far right; a ramp climbs to a loading platform
 * under the high window in the back wall, through which the paper birds come in and Haku leaves. The roof
 * is open above the path there. Outside: brick walls with lit iron windows, and the tall chimney.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Top of the furnace's mouth in the front of Kamaji's platform. */
const MOUTH_TOP = DAIS.top - 0.3;
/** Bare bulbs hanging low over the work: above the coal heap, the soot sprites' path, Kamaji's platform, the door. */
export const BULBS: Array<[number, number, number]> = [[16, -6.5, -2004.5], [12, -6.2, -2014], [7.2, -5.6, -2030], [33, -6, -1999.5]];

/** The drawer wall's plane and grid, shared with Kamaji (who pulls its drawers). */
export const DRAWERS = { x: DAIS.x0 + 0.35, z0: -2004, z1: -2048, y0: BOILER.floor, y1: BOILER.ceiling, cell: 0.62 };

/** A flat quad from a to b (left to right as seen from its front) between heights y0 and y1, UVs in world units / tile. */
function quad(a: THREE.Vector3, b: THREE.Vector3, y0: number, y1: number, tile: number) {
  const w = a.distanceTo(b), h = y1 - y0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y1, a.z], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w / tile, 0, w / tile, h / tile, 0, h / tile], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  return geo;
}
/** A horizontal rectangle at height y, facing up (or down). */
function flat(x0: number, x1: number, z0: number, z1: number, y: number, tile: number, down = false) {
  const g = new THREE.PlaneGeometry(x1 - x0, Math.abs(z0 - z1)).rotateX(down ? Math.PI / 2 : -Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return repeatUV(g, (x1 - x0) / tile, Math.abs(z0 - z1) / tile);
}

function fireTexture() {
  const p = new Painter(128, 128, 7991);
  const g = p.g;
  const gr = g.createRadialGradient(64, 92, 4, 64, 80, 70);
  gr.addColorStop(0, '#fff4c0'); gr.addColorStop(0.3, '#ffb040'); gr.addColorStop(0.65, '#d84a10'); gr.addColorStop(1, '#3a0a02');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  // tongues of flame and glowing coals at the bottom
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,${180 + p.rng.int(0, 60)},90,0.5)`; const x = p.rng.range(10, 118); g.beginPath(); g.moveTo(x - 8, 120); g.quadraticCurveTo(x + p.rng.range(-10, 10), p.rng.range(30, 70), x + 8, 120); g.fill(); }
  for (let i = 0; i < 30; i++) { g.fillStyle = p.rng.pick(['#ffe080', '#ff8a20', '#601a04']); g.beginPath(); g.arc(p.rng.range(4, 124), p.rng.range(104, 126), p.rng.range(3, 8), 0, TAU); g.fill(); }
  return p.texture({ wrap: false });
}

export interface BoilerRoom {
  group: THREE.Group;
  occluders: THREE.Object3D[];
  /** the fire in the furnace's mouth; its colour flickers */
  fire: THREE.MeshBasicMaterial;
  /** the shutters of the high window, blown open by the paper birds */
  shutters: THREE.Group[];
  plumes: PlumeSource[];
  waterLamps: THREE.Vector3[];
}

export function buildBoilerRoom(road: Road, m: BridgeMats, lanterns: LanternField): BoilerRoom {
  const rng = new Rng(9393);
  const g = new THREE.Group();
  const B = BOILER, W = B.window, H = B.hatch, dr = B.door;
  const plumes: PlumeSource[] = [];
  const waterLamps: THREE.Vector3[] = [];
  /** a soft additive pool of coloured light lying on the floor or standing just in front of a wall facing +x */
  const poolTex = lightPool();
  const glow = (at: THREE.Vector3, w: number, h: number, on: 'floor' | 'wall', color: number, opacity: number) => {
    const geo = new THREE.PlaneGeometry(w, h);
    if (on === 'floor') geo.rotateX(-Math.PI / 2); else geo.rotateY(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: poolTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.position.copy(at);
    mesh.userData.keep = true;
    g.add(mesh);
  };

  // ---------- the hall: floor, inner walls, ceiling with the hatch, beams ----------
  const boards = new THREE.MeshLambertMaterial({ map: sootyBoards() });
  const inner: THREE.BufferGeometry[] = [
    // front wall, inside, round the door
    quad(V(B.x1, 0, B.z0), V(dr.x1, 0, B.z0), B.floor, B.ceiling, 4), quad(V(dr.x0, 0, B.z0), V(B.x0, 0, B.z0), B.floor, B.ceiling, 4),
    quad(V(dr.x1, 0, B.z0), V(dr.x0, 0, B.z0), dr.top, B.ceiling, 4),
    // right wall
    quad(V(B.x1, 0, B.z1), V(B.x1, 0, B.z0), B.floor, B.ceiling, 4),
    // back wall round the high window
    quad(V(B.x0, 0, B.z1), V(W.x0, 0, B.z1), B.floor, B.ceiling, 4), quad(V(W.x1, 0, B.z1), V(B.x1, 0, B.z1), B.floor, B.ceiling, 4),
    quad(V(W.x0, 0, B.z1), V(W.x1, 0, B.z1), B.floor, W.y0, 4), quad(V(W.x0, 0, B.z1), V(W.x1, 0, B.z1), W.y1, B.ceiling, 4),
    // left wall where the drawers are not
    quad(V(B.x0, 0, B.z0), V(B.x0, 0, DRAWERS.z0), B.floor, B.ceiling, 4), quad(V(B.x0, 0, DRAWERS.z1), V(B.x0, 0, B.z1), B.floor, B.ceiling, 4),
    // ceiling, with the hatch over the path left open
    flat(B.x0, H.x0, B.z0, B.z1, B.ceiling, 4, true), flat(H.x1, B.x1, B.z0, B.z1, B.ceiling, 4, true), flat(H.x0, H.x1, B.z0, H.z0, B.ceiling, 4, true),
  ];
  const hall = new THREE.Mesh(mergeGeometries(inner)!, boards);
  hall.receiveShadow = true; hall.userData.keep = true;
  g.add(hall);
  const floor = new THREE.Mesh(flat(B.x0, B.x1, B.z0, B.z1, B.floor, 5), new THREE.MeshLambertMaterial({ map: boilerFloor() }));
  floor.receiveShadow = true; floor.userData.keep = true;
  g.add(floor);
  // heavy beams under the ceiling, and posts along the walls
  for (let z = B.z0 - 6; z > B.z1 + 2; z -= 9) {
    const overHatch = z < H.z0;
    if (overHatch) { g.add(box(H.x0 - B.x0, 0.8, 0.8, m.dark, (B.x0 + H.x0) / 2, B.ceiling - 0.4, z), box(B.x1 - H.x1, 0.8, 0.8, m.dark, (H.x1 + B.x1) / 2, B.ceiling - 0.4, z)); }
    else g.add(box(B.x1 - B.x0, 0.8, 0.8, m.dark, (B.x0 + B.x1) / 2, B.ceiling - 0.4, z));
    g.add(box(0.7, B.ceiling - B.floor, 0.7, m.dark, B.x1 - 0.35, (B.ceiling + B.floor) / 2, z));
  }

  // ---------- outside: foundation, brick walls with lit iron windows, the roof with its hatch ----------
  {
    const A = newAccs();
    const I = new THREE.Matrix4();
    A.wall.setMatrix(I); A.trim.setMatrix(I); A.roof.setMatrix(I);
    const cells = townAtlas().cells, white = new THREE.Color(1, 1, 1);
    const wq = (a: THREE.Vector3, b: THREE.Vector3, y0: number, y1: number, cell: (r: number, k: number) => number) => {
      const len = a.distanceTo(b), bays = Math.max(1, Math.round(len / 4.2)), rows = Math.max(1, Math.round((y1 - y0) / 4.6));
      const d = b.clone().sub(a).divideScalar(bays), rh = (y1 - y0) / rows;
      for (let r = 0; r < rows; r++) for (let k = 0; k < bays; k++) {
        const p0 = a.clone().addScaledVector(d, k), p1 = a.clone().addScaledVector(d, k + 1);
        A.wall.quad(V(p0.x, y0 + r * rh, p0.z), V(p1.x, y0 + r * rh, p1.z), V(p1.x, y0 + (r + 1) * rh, p1.z), V(p0.x, y0 + (r + 1) * rh, p0.z), cells[cell(r, k)], white);
      }
    };
    const brickWin = (r: number, k: number) => (r === 1 || r === 3) && k % 2 === 0 ? CELL.ironWindow : CELL.brick;
    // front (the part beside the podium, round the door)
    const zf = B.z0 + 0.02;
    wq(V(dr.x1, 0, zf), V(B.x1, 0, zf), B.floor, B.roof, (r) => (r === 1 ? CELL.ironWindow : CELL.brick));
    wq(V(dr.x0, 0, zf), V(dr.x1, 0, zf), dr.top, B.roof, () => CELL.brick);
    wq(V(PODIUM.back.x1, 0, zf), V(dr.x0, 0, zf), B.floor, B.roof, () => CELL.brick);
    // right side, back (round the window) and left side
    wq(V(B.x1 + 0.02, 0, B.z0), V(B.x1 + 0.02, 0, B.z1), B.floor, B.roof, brickWin);
    const zb = B.z1 - 0.02;
    wq(V(B.x1, 0, zb), V(W.x1, 0, zb), B.floor, B.roof, brickWin);
    wq(V(W.x0, 0, zb), V(B.x0, 0, zb), B.floor, B.roof, brickWin);
    wq(V(W.x1, 0, zb), V(W.x0, 0, zb), W.y1, B.roof, () => CELL.brick);
    wq(V(W.x1, 0, zb), V(W.x0, 0, zb), B.floor, W.y0, () => CELL.brick);
    wq(V(B.x0 - 0.02, 0, B.z1), V(B.x0 - 0.02, 0, B.z0), B.floor, B.roof, brickWin);
    // stone foundation down to the water
    wq(V(B.x1 + 0.02, 0, B.z0 - 0.02), V(B.x1 + 0.02, 0, B.z1), PODIUM.bottom, B.floor, () => CELL.stone);
    wq(V(B.x1, 0, zb), V(B.x0, 0, zb), PODIUM.bottom, B.floor, () => CELL.stone);
    wq(V(B.x0 - 0.02, 0, B.z1), V(B.x0 - 0.02, 0, B.z0), PODIUM.bottom, B.floor, () => CELL.stone);
    wq(V(40.6, 0, zf), V(B.x1, 0, zf), PODIUM.bottom, B.floor, () => CELL.stone);
    // the door's frame, a lantern and a sign over it
    A.trim.box(dr.x0 - 0.5, dr.x0, B.floor, dr.top + 0.5, B.z0 - 0.3, B.z0 + 0.4, COLORS.red);
    A.trim.box(dr.x1, dr.x1 + 0.5, B.floor, dr.top + 0.5, B.z0 - 0.3, B.z0 + 0.4, COLORS.red);
    A.trim.box(dr.x0 - 0.5, dr.x1 + 0.5, dr.top, dr.top + 0.6, B.z0 - 0.3, B.z0 + 0.45, COLORS.red);
    // the window's frame
    A.trim.box(W.x0 - 0.5, W.x1 + 0.5, W.y1, W.y1 + 0.6, B.z1 - 0.3, B.z1 + 0.3, COLORS.darkWood);
    A.trim.box(W.x0 - 0.5, W.x1 + 0.5, W.y0 - 0.5, W.y0, B.z1 - 0.3, B.z1 + 0.3, COLORS.darkWood);
    for (const x of [W.x0 - 0.25, W.x1 + 0.25]) A.trim.box(x - 0.25, x + 0.25, W.y0 - 0.5, W.y1 + 0.6, B.z1 - 0.3, B.z1 + 0.3, COLORS.darkWood);
    // a broken lattice bar left across the top of the window
    A.trim.box(W.x0, W.x0 + 4.5, W.y1 - 1.4, W.y1 - 1.2, B.z1 - 0.1, B.z1 + 0.1, COLORS.darkWood);
    g.add(accMeshes(A, { cast: true }));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), waveLit(new THREE.MeshLambertMaterial({ map: signTexture('釜', { vertical: false, w: 256, h: 84 }), emissive: 0xffe0a0, emissiveIntensity: 0.5 }), 'bath-boiler-sign-1', { dim: 0.8 }));
    (sign.material as THREE.MeshLambertMaterial).emissiveMap = (sign.material as THREE.MeshLambertMaterial).map;
    sign.position.set((dr.x0 + dr.x1) / 2, dr.top + 1.6, B.z0 + 0.5);
    g.add(sign);
    lanterns.add(V(dr.x0 - 1.1, dr.top + 0.2, B.z0 + 0.9), 1.1, LANTERN.red);
    lanterns.add(V(dr.x1 + 1.1, dr.top + 0.2, B.z0 + 0.9), 1.1, LANTERN.red);
    waterLamps.push(V(B.x1, -6, B.z0 - 20), V(B.x1, -6, B.z0 - 50), V(20, -6, B.z1));
    // the roof: dark tiles, with the hatch open above the path
    const tiles = new THREE.MeshLambertMaterial({ map: stoneWall(0x4a4440, { seed: 191 }) });
    const roof = new THREE.Mesh(mergeGeometries([flat(B.x0, H.x0, B.z0, B.z1, B.roof, 6), flat(H.x1, B.x1, B.z0, B.z1, B.roof, 6), flat(H.x0, H.x1, B.z0, H.z0, B.roof, 6)])!, tiles);
    roof.castShadow = true; roof.receiveShadow = true;
    g.add(roof);
    // the roof's edges, so the hatch has thickness
    g.add(box(H.x1 - H.x0, B.roof - B.ceiling, 0.3, m.dark, (H.x0 + H.x1) / 2, (B.roof + B.ceiling) / 2, H.z0));
    for (const x of [H.x0, H.x1]) g.add(box(0.3, B.roof - B.ceiling, H.z0 - H.z1, m.dark, x, (B.roof + B.ceiling) / 2, (H.z0 + H.z1) / 2));
    // the hatch's lid, thrown open on its hinge
    const lid = box(H.x1 - H.x0, 0.25, 6, m.dark, (H.x0 + H.x1) / 2, B.roof + 2.6, H.z0 + 2.2);
    lid.rotation.x = -1.1;
    g.add(lid);
  }

  // ---------- the tall chimney ----------
  {
    const brick = new THREE.MeshLambertMaterial({ map: stoneWall(0x8a4a34, { seed: 197 }) });
    const ch = new THREE.Mesh(repeatUV(new THREE.CylinderGeometry(2.3, 3.0, 68, 18, 1, true), 4, 12), brick);
    ch.position.set(30, B.roof + 34, -2044);
    ch.castShadow = true;
    g.add(ch);
    for (const y of [B.roof + 66, B.roof + 40]) g.add(cyl(2.6, 2.6, 1.2, m.dark, 30, y, -2044, 18));
    plumes.push({ p: V(30, B.roof + 69, -2044), n: 40, rise: 46, spread: 10, size: 9, speed: 2.4, alpha: 0.42, color: 0x3a3438 });
  }

  // ---------- Kamaji's platform with the furnace mouth, and the drawer wall ----------
  {
    const A = newAccs();
    const I = new THREE.Matrix4();
    A.wall.setMatrix(I); A.trim.setMatrix(I);
    const cells = townAtlas().cells, white = new THREE.Color(1, 1, 1);
    const D = DAIS;
    // brick sides, the front with the furnace in it
    const bricks = (a: THREE.Vector3, b: THREE.Vector3) => {
      const n = Math.max(1, Math.round(a.distanceTo(b) / 2.6));
      const d = b.clone().sub(a).divideScalar(n);
      for (let k = 0; k < n; k++) { const p0 = a.clone().addScaledVector(d, k), p1 = a.clone().addScaledVector(d, k + 1); A.wall.quad(V(p0.x, B.floor, p0.z), V(p1.x, B.floor, p1.z), V(p1.x, D.top, p1.z), V(p0.x, D.top, p0.z), cells[CELL.brick], white); }
    };
    const fz = FURNACE.z, fw = 1.3, mt = MOUTH_TOP;
    bricks(V(D.x1, 0, D.z0), V(D.x1, 0, fz + fw));
    bricks(V(D.x1, 0, fz - fw), V(D.x1, 0, D.z1));
    A.wall.quad(V(D.x1, mt, fz + fw), V(D.x1, mt, fz - fw), V(D.x1, D.top, fz - fw), V(D.x1, D.top, fz + fw), cells[CELL.brick], white);
    bricks(V(D.x0, 0, D.z0), V(D.x1, 0, D.z0));
    bricks(V(D.x1, 0, D.z1), V(D.x0, 0, D.z1));
    // the furnace's iron frame and hood
    A.trim.box(D.x1, D.x1 + 0.35, B.floor, mt + 0.15, fz + fw, fz + fw + 0.35, new THREE.Color(0x24262a));
    A.trim.box(D.x1, D.x1 + 0.35, B.floor, mt + 0.15, fz - fw - 0.35, fz - fw, new THREE.Color(0x24262a));
    A.trim.box(D.x1, D.x1 + 0.5, mt, D.top - 0.02, fz - fw - 0.5, fz + fw + 0.5, new THREE.Color(0x24262a));
    // the platform's top
    A.trim.box(D.x0, D.x1 + 0.3, D.top, D.top + 0.18, D.z1, D.z0, new THREE.Color(0x6a4a30));
    // Kamaji's cushion
    A.trim.box(KAMAJI.x - 1.4, KAMAJI.x + 1.4, D.top + 0.18, D.top + 0.36, KAMAJI.z - 1.4, KAMAJI.z + 1.4, new THREE.Color(0x8a2a24));
    // bowls, jars and bundles of herbs along the platform's edge
    for (let i = 0; i < 9; i++) {
      const z = D.z0 - 1.2 - i * 2.6, x = D.x1 - rng.range(0.4, 1.2);
      if (Math.abs(z - KAMAJI.z) < 3.4) continue;
      A.trim.box(x - 0.25, x + 0.25, D.top + 0.18, D.top + 0.18 + rng.range(0.3, 0.7), z - 0.25, z + 0.25, new THREE.Color(rng.pick([0x9a5a3a, 0xc8b890, 0x5a6a3a, 0x3a3a44])));
    }
    // a tall ladder leaning on the drawer wall
    for (const z of [-2045.5, -2046.7]) {
      const rail = box(0.12, 19, 0.12, m.dark, DRAWERS.x + 1.6, B.floor + 9.4, z);
      rail.rotation.z = 0.16;
      g.add(rail);
    }
    for (let y = B.floor + 1; y < B.ceiling - 1; y += 0.8) g.add(box(0.1, 0.08, 1.2, m.dark, DRAWERS.x + 1.6 + (B.floor + 9.4 - y) * Math.tan(0.16), y, -2046.1));
    g.add(accMeshes(A, { cast: true }));
  }
  // the fire in the furnace's mouth
  const fire = new THREE.MeshBasicMaterial({ map: fireTexture(), color: new THREE.Color(2.2, 1.4, 1.0) });
  {
    const mh = MOUTH_TOP - B.floor;
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(2.6, mh).rotateY(Math.PI / 2), fire);
    mouth.position.set(DAIS.x1 - 0.4, B.floor + mh / 2, FURNACE.z);
    g.add(mouth);
    // the inside of the firebox: dark sides so the opening has depth
    g.add(box(0.1, mh, 2.7, m.dark, DAIS.x1 - 0.5, B.floor + mh / 2, FURNACE.z));
    // the furnace's light thrown across the floor: a bright fan in front of the mouth inside a wide, faint pool
    glow(V(DAIS.x1 + 4.5, B.floor + 0.03, FURNACE.z), 12, 9, 'floor', 0xff8a3a, 0.75);
    glow(V(DAIS.x1 + 7, B.floor + 0.02, FURNACE.z - 2), 30, 24, 'floor', 0xff7020, 0.3);
    // and up the drawer wall behind the platform: the lower rows catch the orange light
    glow(V(DRAWERS.x + 0.06, DAIS.top + 1.5, FURNACE.z), 34, 9, 'wall', 0xff7a2a, 0.55);
  }
  // the drawer wall: hundreds of little drawers from the floor to the ceiling, in a timber frame
  {
    const Dw = DRAWERS, tile = Dw.cell * 6;
    const geo = quad(V(Dw.x, 0, Dw.z0), V(Dw.x, 0, Dw.z1), Dw.y0, Dw.y1, tile);
    const wall = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: drawerWall() }));
    wall.receiveShadow = true; wall.userData.keep = true;
    g.add(wall);
    for (const z of [Dw.z0, Dw.z1]) g.add(box(0.5, Dw.y1 - Dw.y0, 0.5, m.dark, Dw.x + 0.1, (Dw.y0 + Dw.y1) / 2, z));
    for (let y = Dw.y0 + tile; y < Dw.y1; y += tile * 1.5) g.add(box(0.3, 0.16, Dw.z0 - Dw.z1, m.dark, Dw.x + 0.12, y, (Dw.z0 + Dw.z1) / 2));
  }

  // ---------- the coal heap by the door, with lumps scattered round it ----------
  {
    const coal = new THREE.MeshLambertMaterial({ map: coalTexture() });
    // the heap glows here and there with embers
    const heapMat = new THREE.MeshLambertMaterial({ map: coalTexture(), emissive: 0xff7030, emissiveMap: coalEmbers(), emissiveIntensity: 1.8 });
    const heap = new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2);
    const hp = heap.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i); const k = 1 + Math.sin(x * 7 + z * 5) * 0.06 + Math.sin(z * 11) * 0.04; hp.setXYZ(i, x * 4.2 * k, y * 2.1 * k, z * 3.4 * k); }
    heap.computeVertexNormals();
    const hm = new THREE.Mesh(repeatUV(heap, 4, 2), heapMat);
    hm.position.copy(COAL_HEAP);
    hm.receiveShadow = true;
    g.add(hm);
    // a few red-hot lumps on its surface, and a warm glow on the floor round it
    const hot: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 16; i++) {
      const a = rng.range(0, TAU), up = rng.range(0.15, 0.8);
      const d = V(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up));
      hot.push(new THREE.DodecahedronGeometry(rng.range(0.14, 0.26), 0).translate(COAL_HEAP.x + d.x * 4.1, COAL_HEAP.y + d.y * 2.05, COAL_HEAP.z + d.z * 3.3));
    }
    const hl = new THREE.Mesh(mergeGeometries(hot)!, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.9, 0.3) }));
    hl.userData.keep = true;
    g.add(hl);
    glow(V(COAL_HEAP.x, B.floor + 0.025, COAL_HEAP.z), 12, 10, 'floor', 0xff6a20, 0.32);
    const lump = new THREE.DodecahedronGeometry(0.22, 0);
    const lumps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 70; i++) {
      const a = rng.range(0, TAU), r = rng.range(3.4, 6.5);
      const l = lump.clone().scale(rng.range(0.6, 1.5), rng.range(0.6, 1.2), rng.range(0.6, 1.5)).rotateY(rng.range(0, 3)).translate(COAL_HEAP.x + Math.cos(a) * r * 1.1, B.floor + 0.12, COAL_HEAP.z + Math.sin(a) * r * 0.85);
      lumps.push(l);
    }
    const lm = new THREE.Mesh(mergeGeometries(lumps)!, coal);
    lm.userData.keep = true;
    g.add(lm);
    // a coal shovel stuck in the heap
    const handle = box(0.1, 2.4, 0.1, m.dark, COAL_HEAP.x + 2.4, B.floor + 2.0, COAL_HEAP.z + 0.6);
    handle.rotation.z = -0.5;
    g.add(handle);
  }

  // ---------- the great boiler, a smaller tank, pipes, valves ----------
  {
    const iron = new THREE.MeshLambertMaterial({ map: metalPlates(0x4a4a4e, 0x7a3a1a, 199) });
    const pipe = new THREE.MeshLambertMaterial({ color: 0x3a3634 });
    const red = new THREE.MeshLambertMaterial({ color: 0xb02a20 });
    const big = new THREE.Mesh(repeatUV(new THREE.CylinderGeometry(5, 5.2, 16, 28), 6, 3), iron);
    big.position.set(34, B.floor + 8, -2047);
    big.castShadow = true;
    g.add(big);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 28, 10, 0, TAU, 0, Math.PI / 2), iron);
    dome.scale.y = 0.45; dome.position.set(34, B.floor + 16, -2047);
    g.add(dome);
    for (const y of [B.floor + 2, B.floor + 8, B.floor + 14]) g.add(cyl(5.25, 5.25, 0.4, m.dark, 34, y, -2047, 28));
    const small = new THREE.Mesh(repeatUV(new THREE.CylinderGeometry(2.4, 2.4, 9, 20), 3, 2), iron);
    small.position.set(40.5, B.floor + 4.5, -2016);
    g.add(small);
    // pipes: up from the boiler and across under the ceiling to Kamaji's furnace, down the right wall, up through the roof
    const tubes: THREE.BufferGeometry[] = [];
    const tube = (pts: THREE.Vector3[], r: number) => tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), pts.length * 8, r, 10, false));
    // (it comes down at the platform's front corner, out of the way of the view of Kamaji)
    tube([V(34, B.floor + 17, -2047), V(34, B.ceiling - 1.5, -2047), V(24, B.ceiling - 1.5, -2036), V(12, B.ceiling - 1.5, -2018), V(DAIS.x1 + 0.4, B.ceiling - 1.6, DAIS.z0 - 0.6), V(DAIS.x1 + 0.4, -6, DAIS.z0 - 0.6), V(DAIS.x1 + 0.4, DAIS.top + 0.3, DAIS.z0 - 0.6)], 0.45);
    tube([V(31, B.floor + 15, -2043), V(31, B.ceiling + 6, -2043)], 0.6);
    tube([V(B.x1 - 1, B.ceiling - 1, -2000), V(B.x1 - 1, B.floor + 2, -2000), V(B.x1 - 1, B.floor + 2, -2040), V(38, B.floor + 2, -2046)], 0.38);
    tube([V(40.5, B.floor + 9, -2016), V(40.5, B.ceiling - 2.5, -2016), V(20, B.ceiling - 2.5, -2016), V(-1, B.ceiling - 2.5, -2016)], 0.3);
    tube([V(B.x1 - 0.6, B.floor + 6, B.z0 - 1), V(B.x1 - 0.6, B.floor + 6, B.z1 + 1)], 0.5);
    const pm = new THREE.Mesh(mergeGeometries(tubes)!, pipe);
    pm.userData.keep = true;
    g.add(pm);
    // valve wheels, with steam leaking from some
    for (const [x, y, z] of [[30.8, B.floor + 9, -2043], [B.x1 - 1.2, B.floor + 6, -2010], [B.x1 - 1.2, B.floor + 6, -2030], [40.5, B.floor + 9.8, -2016], [B.x1 - 1.2, B.floor + 3.5, -2000]]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 6, 16), red);
      w.position.set(x, y, z); w.rotation.y = Math.PI / 2;
      g.add(w);
      plumes.push({ p: V(x - 0.4, y + 0.3, z), n: 8, rise: 6, spread: 1.6, size: 1.6, speed: 1.6, alpha: 0.32, color: 0xd8d0c8 });
    }
    plumes.push({ p: V(34, B.floor + 18, -2047), n: 10, rise: 8, spread: 2.5, size: 2.4, speed: 1.4, alpha: 0.3, color: 0xd8d0c8 });
  }
  // lanterns hanging high from the ceiling on long cords
  for (const [x, z] of [[20, -2004], [28, -2026], [14, -2038], [36, -2034], [4, -2008]]) {
    g.add(box(0.04, 5, 0.04, m.dark, x, B.ceiling - 2.5, z));
    lanterns.add(V(x, B.ceiling - 5.6, z), 0.9, LANTERN.yellow);
  }
  // working lights: bare bulbs under tin shades, low over the heap, the soot sprites' path, Kamaji and the door,
  // each with a pool of light on the floor below
  {
    const tin = new THREE.MeshLambertMaterial({ color: 0x3a3a36, side: THREE.DoubleSide });
    const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 1.1) });
    for (const [x, y, z] of BULBS) {
      g.add(box(0.05, B.ceiling - y, 0.05, m.dark, x, (B.ceiling + y) / 2, z));
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.55, 14, 1, true), tin);
      shade.position.set(x, y - 0.25, z);
      g.add(shade);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bulb).translateX(x).translateY(y - 0.55).translateZ(z));
      glow(V(x, B.floor + 0.02, z), 9, 9, 'floor', 0xffc070, 0.32);
    }
  }

  // ---------- the ramp and the loading platform under the high window ----------
  {
    const planks = new THREE.MeshLambertMaterial({ map: deckPlanks(0x6a4a2e) });
    const ramp = new THREE.Mesh(ribbon(subCurve(road, RAMP.z0, RAMP.z1 + 0.5, 24), -2.8, 2.8, 24, -0.02, 2), planks);
    ramp.receiveShadow = true;
    g.add(ramp);
    const top = road.at(RAMP.z1).y - 0.02;
    const plat = new THREE.Mesh(boxUV(new THREE.BoxGeometry(W.x1 - W.x0 + 1, top - B.floor, RAMP.z1 - RAMP.platformZ), 2), planks);
    plat.position.set((W.x0 + W.x1) / 2, (top + B.floor) / 2, (RAMP.z1 + RAMP.platformZ) / 2);
    g.add(plat);
    // trestle legs under the ramp
    for (let z = RAMP.z0 - 4; z > RAMP.z1; z -= 5) {
      const p = road.at(z);
      for (const s of [-1, 1]) g.add(box(0.25, p.y - B.floor, 0.25, m.dark, p.x + s * 2.6, (p.y + B.floor) / 2, z));
    }
  }
  // the window's shutters: two boards on hinges at its sides, shut until the birds burst in
  const shutters: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s < 0 ? W.x0 : W.x1, (W.y0 + W.y1) / 2, B.z1 - 0.1);
    const board = new THREE.Mesh(boxUV(new THREE.BoxGeometry((W.x1 - W.x0) / 2, W.y1 - W.y0, 0.2), 2), new THREE.MeshLambertMaterial({ map: deckPlanks(0x4a3424) }));
    board.position.x = -s * (W.x1 - W.x0) / 4;
    hinge.add(board);
    // shut at first, they open outwards
    hinge.rotation.y = 0;
    g.add(hinge);
    shutters.push(hinge);
  }

  // ---------- occluders: the hall's outer walls ----------
  const occluders: THREE.Object3D[] = [];
  const proxyMat = new THREE.MeshBasicMaterial();
  const wall = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, Math.abs(z1 - z0)), proxyMat);
    b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); b.visible = false; b.updateMatrixWorld(true);
    occluders.push(b);
  };
  wall(B.x1 - 0.3, B.x1, B.floor, B.roof, B.z1, B.z0);
  wall(B.x0, B.x0 + 0.3, B.floor, B.roof, B.z1, B.z0);
  wall(dr.x1, B.x1, B.floor, B.roof, B.z0 - 0.3, B.z0);
  wall(B.x0, dr.x0, B.floor, B.roof, B.z0 - 0.3, B.z0);
  wall(W.x1, B.x1, B.floor, B.roof, B.z1, B.z1 + 0.3);
  return { group: g, occluders, fire, shutters, plumes, waterLamps };
}

