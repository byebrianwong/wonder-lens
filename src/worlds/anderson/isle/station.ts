import * as THREE from 'three';
import { box, cyl, glow, mesh } from '../../../engine/Builders';
import { repeatUV } from '../../../engine/Paint';
import type { Road } from '../layout';
import { lightShaft } from '../common';
import { texMat, tiled } from '../kit';
import { CABLE_H, RETURN_X, STATION } from './plan';
import { corrugated, hazard, jpSign, rustIron } from './paint';

/*
 * Trash Island Transfer Station No. 7, where the curtain opens: a long iron shed over the two gondola lines,
 * centred between them. Concrete platforms either side of the channels the cars hang in, stacks of bales
 * waiting, a row of green enamel lamps, light falling through the skylights, the operator's booth, the big
 * bull wheel at the back that turns the cable round, and a framed view out through the open front onto the
 * trash mountains with the cable climbing into them.
 */

export interface Station {
  group: THREE.Group;
  /** the bull wheel (turned by the scene as the cable runs) */
  wheel: THREE.Object3D;
  /** the light shafts */
  shafts: THREE.Object3D[];
}

export function buildStation(road: Road, baleMat: THREE.Material): Station {
  const g = new THREE.Group();
  const { cx, half, z0: Z0, z1: Z1, eave: EAVE, ridge: RIDGE } = STATION;
  const X0 = cx - half, X1 = cx + half, FLOOR = 2;
  const zc = (Z0 + Z1) / 2, L = Z0 - Z1;
  const steel = texMat(rustIron(0x4a5450, 301, 0.5));
  const girder = texMat(rustIron(0x5a6a62, 303, 0.6));
  const wallMat = texMat(corrugated(0x7a8678, 305));
  const roofMat = texMat(corrugated(0x8a8a80, 307), { side: THREE.DoubleSide });
  const concrete = texMat(rustIron(0xb2ac9e, 309, 0.18));
  const brick = texMat(rustIron(0x8a5a44, 311, 0.3));
  const haz = texMat(hazard());
  const cream = texMat(rustIron(0xe2d8c0, 313, 0.2));
  const lampShade = texMat(rustIron(0x3e5a48, 315, 0.35));
  const bulb = glow(0xffe2a8, 1.5);
  const glass = new THREE.MeshBasicMaterial({ color: 0xd8dcc8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const add = (...o: THREE.Object3D[]) => { g.add(...o); };

  // ---- floors: concrete platforms on the bales, the channels' concrete beds, hazard edges ----
  const plats: Array<[number, number]> = [[X0, -2], [2, RETURN_X - 3], [RETURN_X + 3, X1]];
  for (const [a, b] of plats) add(tiled(b - a, 0.14, L, concrete, 3, 3, (a + b) / 2, FLOOR + 0.07, zc));
  for (const [a, b] of [[-2, 2], [RETURN_X - 3, RETURN_X + 3]]) {
    add(tiled(b - a, 1.6, L + 2, concrete, 3, 3, (a + b) / 2, -0.3, zc));
    for (const x of [a, b]) add(box(0.45, 0.04, L, haz, x + (x === a ? -0.23 : 0.23), FLOOR + 0.16, zc));
    // channel walls (the bales' sides would show through otherwise)
    for (const x of [a, b]) { const w = tiled(0.2, 2.2, L, concrete, 3, 3, x, 0.95, zc); add(w); }
  }
  // ---- walls ----
  for (const x of [X0, X1]) {
    // brick plinth, corrugated sheeting, a band of clerestory windows
    add(tiled(0.3, 2.2, L, brick, 2, 2, x, FLOOR + 1.1, zc));
    add(tiled(0.12, 4.6, L, wallMat, 2, 2, x, FLOOR + 2.2 + 2.3, zc));
    add(tiled(0.12, 2.0, L, wallMat, 2, 2, x, EAVE - 1.0, zc));
    for (let z = Z0 - 2.6; z > Z1 + 1; z -= 5.2) {
      const pane = mesh(new THREE.PlaneGeometry(3.6, 2.6), glass, x + (x < cx ? 0.08 : -0.08), FLOOR + 8.1, z);
      pane.rotation.y = Math.PI / 2;
      add(pane);
      const fr = new THREE.Group();
      fr.add(box(0.16, 0.14, 3.8, steel, 0, 1.35, 0), box(0.16, 0.14, 3.8, steel, 0, -1.35, 0), box(0.16, 2.8, 0.12, steel, 0, 0, 0), box(0.16, 0.1, 3.8, steel, 0, 0.4, 0));
      fr.position.set(x, FLOOR + 8.1, z);
      add(fr);
    }
  }
  // back wall, and the front's gable above the opening
  add(tiled(X1 - X0, EAVE - FLOOR, 0.12, wallMat, 2, 2, cx, (EAVE + FLOOR) / 2, Z0));
  const gable = (z: number) => {
    const s = new THREE.Shape();
    s.moveTo(X0, EAVE); s.lineTo(X1, EAVE); s.lineTo(cx, RIDGE); s.closePath();
    const geo = new THREE.ShapeGeometry(s);
    const uv = geo.attributes.uv as THREE.BufferAttribute, pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 2, pos.getY(i) / 2);
    const m = mesh(geo, new THREE.MeshLambertMaterial({ map: corrugated(0x7a8678, 305), side: THREE.DoubleSide }), 0, 0, z);
    add(m);
  };
  gable(Z0); gable(Z1);
  // the front: wall strips either side of the opening and a deep header carrying the sign
  const OPEN0 = X0 + 1.6, OPEN1 = X1 - 1.6, OPEN_TOP = FLOOR + 8.6;
  add(tiled(OPEN0 - X0, EAVE - FLOOR, 0.5, wallMat, 2, 2, (X0 + OPEN0) / 2, (EAVE + FLOOR) / 2, Z1));
  add(tiled(X1 - OPEN1, EAVE - FLOOR, 0.5, wallMat, 2, 2, (X1 + OPEN1) / 2, (EAVE + FLOOR) / 2, Z1));
  add(box(X1 - X0 + 0.6, EAVE - OPEN_TOP, 1.0, girder, cx, (EAVE + OPEN_TOP) / 2, Z1));
  for (const x of [OPEN0, OPEN1]) add(box(0.7, OPEN_TOP - FLOOR, 1.1, girder, x, (OPEN_TOP + FLOOR) / 2, Z1));
  add(box(OPEN1 - OPEN0, 0.25, 0.6, haz, cx, OPEN_TOP - 0.1, Z1 - 0.3));
  // the big signs over the opening, inside and out
  const signIn = jpSign('ゴミ島 第七転送所', 'TRASH ISLAND  ·  TRANSFER STATION No. 7', { w: 1024, h: 192, bg: '#ece2c8', fg: '#b02a24' });
  const signOut = jpSign('ゴミ島', 'TRASH ISLAND', { w: 1024, h: 256, bg: '#b02a24', fg: '#f2e8d0' });
  { const s = mesh(new THREE.PlaneGeometry(15, 2.8), new THREE.MeshLambertMaterial({ map: signIn }), cx, (EAVE + OPEN_TOP) / 2, Z1 + 0.52); add(s); }
  { const s = mesh(new THREE.PlaneGeometry(13, 3.2), new THREE.MeshLambertMaterial({ map: signOut }), cx, (EAVE + OPEN_TOP) / 2 + 0.2, Z1 - 0.52); s.rotation.y = Math.PI; add(s); }

  // ---- portal frames and roof trusses ----
  const roofY = (x: number) => EAVE + (RIDGE - EAVE) * (1 - Math.abs(x - cx) / half);
  for (let z = Z0 - 1.2; z >= Z1 + 1; z -= (L - 2.4) / 6) {
    for (const x of [X0 + 0.35, X1 - 0.35]) add(box(0.4, EAVE - FLOOR, 0.5, girder, x, (EAVE + FLOOR) / 2, z));
    // rafters from each eave to the ridge, a tie beam, and three struts each side
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(cx + s * half, EAVE, z), b = new THREE.Vector3(cx, RIDGE, z);
      add(beam(a, b, 0.32, girder));
      for (let k = 1; k <= 3; k++) { const x = cx + s * half * (1 - k / 4); add(beam(new THREE.Vector3(x, EAVE - 0.4, z), new THREE.Vector3(x, roofY(x), z), 0.14, steel)); }
      add(beam(new THREE.Vector3(cx + s * half * 0.75, EAVE - 0.4, z), new THREE.Vector3(cx + s * half * 0.5, roofY(cx + s * half * 0.5), z), 0.12, steel));
    }
    add(box(half * 2, 0.26, 0.26, girder, cx, EAVE - 0.4, z));
    // a lamp over each platform, hanging from the tie beam
    for (const x of [X0 + 2.6, cx, X1 - 2])
      add(cyl(0.02, 0.02, 2.6, steel, x, EAVE - 1.7, z, 4), mesh(new THREE.ConeGeometry(0.6, 0.42, 14, 1, true), lampShade, x, EAVE - 3.1, z), mesh(new THREE.SphereGeometry(0.2, 10, 8), bulb, x, EAVE - 3.3, z));
  }
  // the roof: corrugated slopes with a row of skylights down each side
  for (const s of [-1, 1]) {
    const w = Math.hypot(half, RIDGE - EAVE);
    const ang = Math.atan2(RIDGE - EAVE, half);
    const roof = new THREE.Group();
    const strip = (from: number, to: number, mat: THREE.Material) => {
      const m = mesh(repeatUV(new THREE.PlaneGeometry(to - from, L + 1.2), (to - from) / 2, (L + 1.2) / 2), mat, (from + to) / 2, 0, 0);
      m.rotation.x = -Math.PI / 2; roof.add(m);
    };
    strip(0, w * 0.42, roofMat); strip(w * 0.42, w * 0.56, glass); strip(w * 0.56, w, roofMat);
    roof.position.set(cx + s * half, EAVE + 0.15, zc);
    roof.rotation.z = s > 0 ? Math.PI - ang : ang;
    if (s > 0) roof.rotation.x = Math.PI;
    add(roof);
  }
  // ---- the station rails the grips' wheels run on, hung from the trusses ----
  const pathY = road.at(-1810).y;
  for (const x of [-0.4, RETURN_X + 0.4]) {
    add(box(0.2, 0.18, L - 3, steel, x, pathY + CABLE_H + 0.48, zc - 0.5));
    for (let z = Z0 - 3; z > Z1 + 2; z -= 6) add(box(0.06, EAVE - 0.4 - (pathY + CABLE_H + 0.5), 0.06, steel, x, (EAVE - 0.4 + pathY + CABLE_H + 0.5) / 2, z));
  }

  // ---- the bull wheel at the back, turning the cable round ----
  const wheel = new THREE.Group();
  const wy = road.at(-1800).y + CABLE_H;
  {
    const R = RETURN_X / 2;
    const rim = mesh(new THREE.TorusGeometry(R, 0.2, 8, 40), girder);
    rim.rotation.x = Math.PI / 2; wheel.add(rim);
    const groove = mesh(new THREE.TorusGeometry(R + 0.08, 0.08, 6, 40), steel);
    groove.rotation.x = Math.PI / 2; wheel.add(groove);
    for (let k = 0; k < 8; k++) { const sp = box(R * 2, 0.16, 0.24, girder, 0, 0, 0); sp.rotation.y = (k / 8) * Math.PI; wheel.add(sp); }
    wheel.add(cyl(0.6, 0.6, 0.6, steel, 0, 0, 0, 16));
    wheel.position.set(cx, wy, -1790);
  }
  g.add(wheel);
  // its shaft and the motor house under it, with a warning sign
  add(cyl(0.3, 0.3, wy - FLOOR, steel, cx, (wy + FLOOR) / 2, -1790, 10));
  add(tiled(4.6, 3.2, 3.8, cream, 2, 2, cx, FLOOR + 1.6, -1790));
  add(box(4.8, 0.3, 4.0, girder, cx, FLOOR + 3.3, -1790));
  { const s = mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshLambertMaterial({ map: jpSign('危険', 'DANGER', { w: 256, h: 128, bg: '#f2c830', fg: '#1a1a1a' }) }), cx, FLOOR + 1.9, -1790 - 1.92); s.rotation.y = Math.PI; add(s); }

  // ---- the operator's booth on the left platform, its window lit ----
  {
    const b = new THREE.Group();
    b.add(tiled(3.6, 3.0, 4.2, cream, 2, 2, 0, 1.5, 0));
    b.add(box(4.0, 0.25, 4.6, girder, 0, 3.1, 0));
    const win = mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0a0).multiplyScalar(1.15) }), 1.81, 1.9, 0);
    win.rotation.y = Math.PI / 2; b.add(win);
    b.add(box(0.12, 0.12, 2.4, steel, 1.84, 2.5, 0), box(0.12, 0.12, 2.4, steel, 1.84, 1.33, 0), box(0.12, 1.2, 0.1, steel, 1.84, 1.9, 0));
    const sign = mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshLambertMaterial({ map: jpSign('運転室', 'OPERATOR', { w: 256, h: 80 }) }), 1.83, 2.75, 0);
    sign.rotation.y = Math.PI / 2; b.add(sign);
    b.position.set(X0 + 2.4, FLOOR + 0.14, -1822);
    add(b);
  }
  // a hanging line sign over the rider's line
  {
    const s = new THREE.Group();
    const face = jpSign('七号線 ▶', 'LINE 7  TO MEGASAKI', { w: 512, h: 160, bg: '#f2ead6', fg: '#1e3a6a' });
    for (const ry of [0, Math.PI]) { const p = mesh(new THREE.PlaneGeometry(3.4, 1.06), new THREE.MeshLambertMaterial({ map: face }), 0, 0, ry ? -0.04 : 0.04); p.rotation.y = ry; s.add(p); }
    s.add(box(3.5, 1.14, 0.06, steel, 0, 0, 0));
    for (const x of [-1.4, 1.4]) s.add(cyl(0.02, 0.02, 1.8, steel, x, 1.4, 0, 4));
    s.position.set(-3.6, EAVE - 2.7, -1812);
    add(s);
  }

  // ---- bales waiting on the platforms (whole bales on the grid, so the bale shader lines them up) ----
  const stack = (x0: number, x1: number, za: number, zb: number, layers: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, layers * 2, za - zb), baleMat);
    m.position.set((x0 + x1) / 2, FLOOR + layers, (za + zb) / 2);
    m.castShadow = true; m.receiveShadow = true;
    add(m);
  };
  stack(-6, -2.5 + 0.5, -1794, -1802, 2); stack(-6, -4, -1802, -1806, 1); stack(-6, -2, -1808, -1812, 3);
  stack(14, 16, -1792, -1800, 3); stack(12.5 + 0.5, 16, -1804, -1810, 2); stack(13, 16, -1814, -1818, 1); stack(14, 16, -1820, -1826, 2);
  stack(2.5 + 0.5, 6, -1796, -1800, 1);
  // pallets under the stacks are implied; a few loose drums and a hand truck by the booth
  const drumMat = texMat(rustIron(0x3a5a7a, 317, 0.6));
  for (const [x, z, r] of [[-3, -1816, 0], [-3.4, -1817.2, 0.4], [3.4, -1806, 0], [14.8, -1828, 0.2]] as const) { const d = cyl(0.42, 0.42, 1.2, drumMat, x, FLOOR + 0.74, z, 14); d.rotation.y = r; add(d); }

  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== glass && m.material !== bulb) { m.castShadow = true; m.receiveShadow = true; } });

  // ---- light falling through the skylights onto the platforms ----
  const shafts: THREE.Object3D[] = [];
  for (const [x, z] of [[X0 + 3.5, -1797], [X0 + 3.5, -1815], [X1 - 3.5, -1806], [X1 - 3.5, -1822]]) {
    const sh = lightShaft(new THREE.Vector3(x + 1.5, RIDGE - 2, z), new THREE.Vector3(x - 0.5, FLOOR, z - 0.6), 3.2, 0xffe8c0, 0.16);
    shafts.push(sh);
  }
  g.remove(wheel);
  return { group: g, wheel, shafts };
}

function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, mat: THREE.Material) {
  const d = b.clone().sub(a);
  const m = mesh(new THREE.BoxGeometry(w, d.length(), w), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
