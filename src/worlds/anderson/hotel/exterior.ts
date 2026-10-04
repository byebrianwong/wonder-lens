import * as THREE from 'three';
import { box, cyl, sphere, mesh, canvasTexture, toon } from '../../../engine/Builders';
import { repeatUV } from '../../../engine/Paint';
import { TAU } from '../../../engine/math';
import { facadeTile } from '../textures';
import { topiary } from '../kit';
import { FUTURA } from '../film';
import { CORNICE, FUNI, HOTEL, LOBBY, TERRACE } from './plan';
import { GBH, hotelSign, frontDoor, balustrade } from './textures';
import { onionGeometry } from './station';
import { shade, tbox, tplane, type HotelMats } from './mats';

/*
 * The Grand Budapest Hotel from outside: a candy-pink, perfectly symmetrical confection on its terrace at
 * the top of the cliff. A cream arcade along the ground floor, five pink storeys with balconies, burgundy
 * mansards with dormers, square corner towers with lilac onion domes, a central pavilion with an attic and a
 * great dome, the name in red letters with bulbs on the roof, a red marquee over the doors. The doors swing
 * open into the lobby as the train arrives. Local frame = world (the hotel is placed where the plan says).
 */

const BAY = 2.4, ST = HOTEL.storey;
/** half widths, in bays: the central pavilion, the wings, the corner towers */
const PAV = 5 * BAY, WING = PAV + 8 * BAY, TOWER = WING + 3 * BAY;

/** A mansard over a w x d block: steep slopes rising h, the top inset by k of the half sizes. */
function mansard(w: number, d: number, h: number, k: number, mat: THREE.Material) {
  const geo = new THREE.CylinderGeometry(Math.SQRT1_2 * k, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
  geo.scale(w, h, d);
  repeatUV(geo, (w + d) * 2 / 1.5, h / 1.2);
  const mm = mesh(geo, mat);
  return mm;
}

function flagTexture() {
  return canvasTexture(128, 80, (c) => {
    c.fillStyle = '#f2b2c4'; c.fillRect(0, 0, 128, 80);
    c.fillStyle = '#7a2236'; c.fillRect(0, 0, 128, 10); c.fillRect(0, 70, 128, 10);
    c.strokeStyle = '#d8b25a'; c.lineWidth = 5; c.lineCap = 'round';
    for (const s of [-1, 1]) { c.save(); c.translate(64, 40); c.rotate(s * 0.7); c.beginPath(); c.moveTo(0, -20); c.lineTo(0, 18); c.moveTo(0, 14); c.lineTo(6, 14); c.stroke(); c.beginPath(); c.arc(0, -24, 5, 0, TAU); c.stroke(); c.restore(); }
  });
}

/** "GRAND BUDAPEST" in gold on red, for the marquee's valance. */
function marqueeName() {
  return canvasTexture(1024, 96, (c) => {
    c.fillStyle = '#b32638'; c.fillRect(0, 0, 1024, 96);
    c.fillStyle = '#f0d27a'; c.font = `bold 60px ${FUTURA}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('G R A N D   B U D A P E S T', 512, 52);
    c.fillRect(0, 6, 1024, 4); c.fillRect(0, 86, 1024, 4);
  });
}

export interface Exterior {
  group: THREE.Group;
  /** the two front doors, pivoting at their hinges (left, right) */
  doors: THREE.Object3D[];
  /** the rooftop sign's material, to flash its bulbs */
  sign: THREE.MeshLambertMaterial;
  flag: THREE.Object3D;
  /** a point on the facade for the landmark subject */
  centre: THREE.Vector3;
  occluder: THREE.Mesh;
}

export function buildExterior(m: HotelMats): Exterior {
  const g = new THREE.Group();
  const base = HOTEL.base, gfTop = base + HOTEL.gf, front = HOTEL.front, back = HOTEL.back;
  const depth = front - back, zc = (front + back) / 2;

  // ---------- materials: facades with lit windows ----------
  const pinkT = facadeTile({ wall: GBH.pink, frame: GBH.white, curtain: 0xf6dce2, cornice: GBH.white, pilaster: 0xf8ccd8, balcony: true, bays: 4, storeys: 2, lit: 0.32, seed: 3 });
  const pink = new THREE.MeshLambertMaterial({ map: pinkT.map, emissive: 0xffdcb0, emissiveMap: pinkT.emissive, emissiveIntensity: 0.6 });
  const pavT = facadeTile({ wall: 0xeea0b6, frame: GBH.white, curtain: 0xf6dce2, cornice: GBH.white, pilaster: 0xf6c0d0, arch: true, balcony: true, bays: 4, storeys: 2, lit: 0.4, seed: 4 });
  const pav = new THREE.MeshLambertMaterial({ map: pavT.map, emissive: 0xffdcb0, emissiveMap: pavT.emissive, emissiveIntensity: 0.6 });
  const towT = facadeTile({ wall: 0xc8b4e2, frame: GBH.white, curtain: 0xf2e6f4, cornice: GBH.white, arch: true, bays: 3, storeys: 2, lit: 0.3, seed: 5 });
  const tow = new THREE.MeshLambertMaterial({ map: towT.map, emissive: 0xffdcb0, emissiveMap: towT.emissive, emissiveIntensity: 0.6 });
  const arcT = facadeTile({ wall: GBH.cream, frame: GBH.white, arch: true, bays: 1, storeys: 1, lit: 0.85, seed: 6, cornice: 0xf2e6d4 });
  const arcade = new THREE.MeshLambertMaterial({ map: arcT.map, emissive: 0xffe0b0, emissiveMap: arcT.emissive, emissiveIntensity: 0.8 });
  const dormT = facadeTile({ wall: GBH.white, frame: GBH.white, arch: true, bays: 1, storeys: 1, lit: 0.6, seed: 7 });
  const dorm = new THREE.MeshLambertMaterial({ map: dormT.map, emissive: 0xffe0b0, emissiveMap: dormT.emissive, emissiveIntensity: 0.6 });
  const TILE_W = 4 * BAY, TILE_H = 2 * ST;

  // ---------- the shell: a front facade, side and back walls (the lobby fills the inside) ----------
  const upH = HOTEL.storey * HOTEL.storeys;
  const inner = LOBBY.front, wallD = front - inner;
  for (const s of [-1, 1]) {
    // the wings' fronts, between the pavilion and the towers
    const ww = WING - PAV, wx = s * (PAV + ww / 2);
    g.add(tbox(ww, HOTEL.gf, wallD, arcade, BAY, wx, base + HOTEL.gf / 2, front - wallD / 2, HOTEL.gf));
    g.add(tbox(ww, upH, wallD, pink, TILE_W, wx, gfTop + upH / 2, front - wallD / 2, TILE_H));
    // the side walls, from behind the towers to the back
    const sz0 = front - 7.2, sl = sz0 - back;
    g.add(tbox(2.4, HOTEL.gf, sl, arcade, BAY, s * (TOWER - 1.2), base + HOTEL.gf / 2, sz0 - sl / 2, HOTEL.gf));
    g.add(tbox(2.4, upH, sl, pink, TILE_W, s * (TOWER - 1.2), gfTop + upH / 2, sz0 - sl / 2, TILE_H));
  }
  g.add(tbox(TOWER * 2, HOTEL.gf + upH, 2.4, pink, TILE_W, 0, base + (HOTEL.gf + upH) / 2, back + 1.2, TILE_H));
  // the pavilion: ground floor around the doorway, storeys above, projecting forward
  const pf = front + HOTEL.pavOut, pd = pf - inner, pzc = pf - pd / 2;
  {
    const dh = HOTEL.doorHalf, dTop = base + HOTEL.doorH;
    for (const s of [-1, 1]) g.add(tbox(PAV - dh, HOTEL.gf, pd, arcade, BAY, s * (dh + (PAV - dh) / 2), base + HOTEL.gf / 2, pzc, HOTEL.gf));
    g.add(tbox(dh * 2, gfTop - dTop, pd, m.cream, 3, 0, (gfTop + dTop) / 2, pzc));
    g.add(tbox(PAV * 2, upH, pd, pav, TILE_W, 0, gfTop + upH / 2, pzc, TILE_H));
    // the doorway: an arch of cream voussoirs, a fanlight, a keystone
    const arch = mesh(new THREE.TorusGeometry(dh + 0.35, 0.5, 8, 24, Math.PI), m.cream, 0, dTop, pf + 0.15);
    g.add(arch);
    g.add(box(1.0, 1.3, 0.6, m.gold, 0, dTop + dh + 0.3, pf + 0.2));
    // the doorway's reveal (the passage through the thick wall)
    for (const s of [-1, 1]) g.add(tbox(0.3, HOTEL.doorH, pd, m.pinkDeep, 3, s * (dh + 0.15), base + HOTEL.doorH / 2, pzc));
    g.add(box(dh * 2 + 0.6, 0.3, pd, m.cream, 0, dTop + 0.15, pzc));
  }
  // cornices and string courses round the front and along the sides (a frame, not a slab: the lobby is inside)
  g.add(box(TOWER * 2 + 1.0, 0.5, 1.2, m.white, 0, gfTop, front + 0.3));
  g.add(box(PAV * 2 + 0.8, 0.5, 1.0, m.white, 0, gfTop, pf + 0.2));
  g.add(box(TOWER * 2 + 1.2, 0.8, 3.4, m.white, 0, CORNICE + 0.3, front - 1.1));
  for (const s of [-1, 1]) g.add(box(3.4, 0.8, depth, m.white, s * (TOWER - 1.0), CORNICE + 0.3, zc));
  g.add(box(PAV * 2 + 1.0, 0.8, 1.2, m.white, 0, CORNICE + 0.3, pf + 0.1));
  // a flat roof over everything above the lobby's glass, under the mansards
  g.add(box(TOWER * 2, 0.4, depth, m.snow, 0, LOBBY.glass + 0.9, zc));

  // ---------- striped awnings over the arcade windows of the wings ----------
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const x = s * (PAV + BAY * (i + 0.5));
      const aw = mesh(new THREE.PlaneGeometry(BAY - 0.3, 1.5), m.awning, x, base + 6.0, front + 0.75);
      aw.rotation.x = -0.75;
      g.add(aw);
    }
  }

  // ---------- the corner towers ----------
  for (const s of [-1, 1]) {
    const tx = s * (WING + (TOWER - WING) / 2), tw = TOWER - WING, tz = front - tw / 2 + 1.2, th = 36;
    g.add(tbox(tw, HOTEL.gf, tw, arcade, BAY, tx, base + HOTEL.gf / 2, tz, HOTEL.gf));
    g.add(tbox(tw, th - HOTEL.gf, tw, tow, 3 * BAY, tx, gfTop + (th - HOTEL.gf) / 2, tz, TILE_H));
    for (const y of [gfTop, CORNICE + 0.3, base + th]) g.add(box(tw + 0.8, 0.6, tw + 0.8, m.white, tx, y, tz));
    // a belvedere of columns, then the onion dome and a gold finial
    const by = base + th + 0.3;
    g.add(box(tw - 1.6, 3.2, tw - 1.6, m.dark, tx, by + 1.6, tz));
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) g.add(cyl(0.3, 0.34, 3.2, m.white, tx + cx * (tw / 2 - 0.7), by + 1.6, tz + cz * (tw / 2 - 0.7), 8));
    g.add(box(tw + 0.4, 0.5, tw + 0.4, m.white, tx, by + 3.4, tz));
    g.add(mesh(onionGeometry(tw * 0.5, 9, 16), m.roofLav, tx, by + 3.6, tz));
    g.add(sphere(0.5, m.gold, tx, by + 12.9, tz, 10, 8), cyl(0.07, 0.12, 2.4, m.gold, tx, by + 14.3, tz, 6));
  }

  // ---------- roofs: mansards with dormers over the wings, the pavilion's attic and the great dome ----------
  const roofY = CORNICE + 0.7, rh = 6.4;
  for (const s of [-1, 1]) {
    const ww = WING - PAV + 1, wx = s * (PAV + (WING - PAV) / 2);
    const r = mansard(ww + 0.4, depth + 0.6, rh, 0.72, m.roof); r.position.set(wx, roofY + rh / 2, zc); g.add(r);
    g.add(box(ww * 0.72, 0.3, (depth + 0.6) * 0.72 + 0.4, m.snow, wx, roofY + rh + 0.12, zc));
    for (let i = 0; i < 4; i++) {
      const dx = wx + (i - 1.5) * BAY * 1.9;
      const dz = front - 1.2;
      g.add(tbox(1.6, 2.2, 1.6, dorm, 1.6, dx, roofY + 1.7, dz, 2.2));
      g.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), m.white, dx, roofY + 2.8, dz));
      g.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.9, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), m.snow, dx, roofY + 2.95, dz - 0.05));
    }
    // chimney stacks
    for (const cz of [-12, -40, -70]) g.add(tbox(1.2, 4, 2.4, m.pinkDeep, 3, wx + s * 3, roofY + 6, front + cz), box(1.6, 0.4, 2.8, m.white, wx + s * 3, roofY + 8.1, front + cz));
  }
  // the pavilion's attic storey and its pediment
  const attTop = roofY + 4.6;
  g.add(tbox(PAV * 2, attTop - roofY, pd, pav, TILE_W, 0, (attTop + roofY) / 2, pzc, TILE_H));
  g.add(box(PAV * 2 + 1, 0.7, pd + 0.8, m.white, 0, attTop + 0.3, pzc));
  // a mansard over the middle of the main block, behind the pavilion, to carry the dome
  {
    const r = mansard(PAV * 2 + 1, depth - 8, rh, 0.72, m.roof); r.position.set(0, roofY + rh / 2, zc - 4); g.add(r);
  }
  // the great dome on a drum, a lantern, the flag
  const domeZ = pf - 14, domeY = attTop + 0.6;
  g.add(cyl(8.4, 8.6, 4.2, pav, 0, domeY + 2.1, domeZ, 28));
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; g.add(cyl(0.3, 0.3, 4.2, m.white, Math.sin(a) * 8.7, domeY + 2.1, domeZ + Math.cos(a) * 8.7, 6)); }
  g.add(cyl(9.2, 9.2, 0.6, m.white, 0, domeY + 4.4, domeZ, 28));
  const domeGeo = repeatUV(new THREE.SphereGeometry(8.6, 28, 14, 0, TAU, 0, Math.PI / 2), 18, 6);
  const dome = mesh(domeGeo, m.roofLav, 0, domeY + 4.6, domeZ); dome.scale.y = 1.15; g.add(dome);
  // gilded ribs on the dome
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const rib = mesh(new THREE.TorusGeometry(8.65, 0.12, 4, 16, Math.PI / 2), m.gold, 0, domeY + 4.6, domeZ);
    rib.rotation.set(0, a, 0); rib.scale.set(1, 1.15, 1);
    // a quarter torus in the xy plane rising from the rim to the top
    g.add(rib);
  }
  const lanY = domeY + 4.6 + 8.6 * 1.15;
  g.add(cyl(1.6, 1.8, 3, m.white, 0, lanY + 1.2, domeZ, 12), mesh(onionGeometry(1.9, 3.6, 12), m.roofLav, 0, lanY + 2.7, domeZ));
  g.add(cyl(0.08, 0.1, 7, m.gold, 0, lanY + 9, domeZ, 6), sphere(0.3, m.gold, 0, lanY + 12.6, domeZ, 8, 6));
  const flag = new THREE.Group();
  const fl = mesh(new THREE.PlaneGeometry(4, 2.5, 6, 1), new THREE.MeshLambertMaterial({ map: flagTexture(), side: THREE.DoubleSide }), 2.0, 0, 0);
  flag.add(fl);
  flag.position.set(0.08, lanY + 11.0, domeZ);
  g.add(flag);

  // ---------- the rooftop sign ----------
  const st = hotelSign('GRAND BUDAPEST');
  const signMat = new THREE.MeshLambertMaterial({ map: st.map, emissive: 0xffffff, emissiveMap: st.emissive, emissiveIntensity: 0.9, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  const signW = 34, signH = signW / 8;
  const sign = mesh(new THREE.PlaneGeometry(signW, signH), signMat, 0, attTop + 1.2 + signH / 2 + 0.4, pf - 1.0);
  g.add(sign);
  // its iron frame
  for (const x of [-signW * 0.4, -signW * 0.13, signW * 0.13, signW * 0.4]) g.add(box(0.25, signH + 1.4, 0.25, m.iron, x, attTop + 0.9 + signH / 2, pf - 1.4));
  g.add(box(signW + 0.4, 0.2, 0.2, m.iron, 0, attTop + 1.4, pf - 1.4), box(signW + 0.4, 0.2, 0.2, m.iron, 0, attTop + 1.2 + signH + 0.4, pf - 1.4));

  // ---------- the marquee over the doors ----------
  {
    const mz0 = pf, mz1 = pf + 7.5, my = base + HOTEL.doorH + 0.8, mw = HOTEL.doorHalf * 2 + 2.4;
    g.add(box(mw, 0.5, mz1 - mz0, m.red, 0, my, (mz0 + mz1) / 2));
    g.add(box(mw + 0.2, 0.14, mz1 - mz0 + 0.2, m.gold, 0, my + 0.3, (mz0 + mz1) / 2));
    const name = mesh(new THREE.PlaneGeometry(mw, 0.95), new THREE.MeshBasicMaterial({ map: marqueeName() }), 0, my - 0.2, mz1 + 0.27);
    g.add(name);
    const val = mesh(repeatUV(new THREE.PlaneGeometry(mw, 0.6), mw / 0.9, 1), new THREE.MeshLambertMaterial({ map: m.scallop.map, color: GBH.red, alphaTest: 0.5, side: THREE.DoubleSide }), 0, my - 0.95, mz1 + 0.26);
    g.add(val);
    for (const s of [-1, 1]) {
      const sv = mesh(repeatUV(new THREE.PlaneGeometry(mz1 - mz0, 0.6), (mz1 - mz0) / 0.9, 1), val.material as THREE.Material, s * (mw / 2 + 0.02), my - 0.55, (mz0 + mz1) / 2);
      sv.rotation.y = Math.PI / 2; g.add(sv);
      g.add(cyl(0.1, 0.12, my - base, m.gold, s * (mw / 2 - 0.15), (my + base) / 2, mz1 - 0.15, 10), sphere(0.2, m.gold, s * (mw / 2 - 0.15), my + 0.5, mz1 - 0.15, 10, 8));
    }
    // a pair of lanterns either side of the doorway
    for (const s of [-1, 1]) {
      g.add(box(0.5, 0.8, 0.5, m.lampWarm, s * (HOTEL.doorHalf + 1.6), base + 4.4, pf + 0.45), box(0.7, 0.12, 0.7, m.gold, s * (HOTEL.doorHalf + 1.6), base + 4.86, pf + 0.45));
    }
  }

  // ---------- the terrace ----------
  {
    const tz0 = TERRACE.z0, tz1 = front, ty = TERRACE.y, half = TERRACE.half;
    const gapL = -2.2, gapR = FUNI.x + 2.1;
    const blocks: Array<[number, number]> = [[-half, gapL], [gapR, half]];
    for (const [x0, x1] of blocks) {
      g.add(tbox(x1 - x0, 14, tz0 - tz1, m.ashlar, 4, (x0 + x1) / 2, ty - 7.08, (tz0 + tz1) / 2, 2));
      g.add(tbox(x1 - x0, 0.12, tz0 - tz1 - 0.5, m.paving, 2, (x0 + x1) / 2, ty - 0.02, (tz0 + tz1) / 2 - 0.25));
      // the front balustrade along the cliff edge
      const bal = tplane(x1 - x0, 1.2, new THREE.MeshLambertMaterial({ map: balustrade(GBH.cream, GBH.cream), alphaTest: 0.5, side: THREE.DoubleSide }), 2.4, 1.2);
      bal.position.set((x0 + x1) / 2, ty + 0.6, tz0 - 0.3);
      g.add(bal);
      g.add(box(x1 - x0, 0.16, 0.5, m.cream, (x0 + x1) / 2, ty + 1.24, tz0 - 0.3));
    }
    // between the funicular and the doors, a strip of paving the rails run over
    g.add(tbox(gapR - gapL, 0.12, tz0 - tz1 - 1, m.paving, 2, (gapL + gapR) / 2, ty - 0.66, (tz0 + tz1) / 2 - 0.5));
    // under the sides of the hotel, the terrace continues as the base the building stands on
    g.add(tbox(half * 2, 10, depth, m.ashlarDark, 4, 0, ty - 5.06, zc, 2));
    // lamp standards and tubs of topiary along the front, symmetric
    for (const s of [-1, 1]) {
      for (const x of [12, 24, 36]) {
        const lx = s * x + (s > 0 ? 2.3 : 0) * 0;
        g.add(cyl(0.1, 0.14, 4.4, m.iron, lx, ty + 2.2, tz0 - 1.2, 8), cyl(0.3, 0.36, 0.3, m.iron, lx, ty + 0.15, tz0 - 1.2, 8));
        g.add(sphere(0.38, m.lamp, lx, ty + 4.7, tz0 - 1.2, 10, 8), cyl(0.2, 0.3, 0.2, m.brass, lx, ty + 4.35, tz0 - 1.2, 8));
      }
      for (const x of [7.5, 18, 30]) {
        const t = topiary(x === 18 ? 'ball' : 'cone', 0x5f8a6c, 0xf2e2d6);
        t.position.set(s * x + (s > 0 ? 2.3 : 0), ty, front + 3.2);
        g.add(t);
      }
    }
  }

  // ---------- the front doors (separate: they open) ----------
  const doorTex = frontDoor();
  const doors: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * HOTEL.doorHalf, base, pf - 0.35);
    const leaf = mesh(new THREE.BoxGeometry(HOTEL.doorHalf, HOTEL.doorH, 0.22), new THREE.MeshLambertMaterial({ map: doorTex, emissive: 0xffe0b0, emissiveMap: doorTex, emissiveIntensity: 0.25 }), -s * HOTEL.doorHalf / 2, HOTEL.doorH / 2, 0);
    if (s > 0) leaf.scale.x = -1;
    pivot.add(leaf);
    pivot.add(sphere(0.12, m.gold, -s * (HOTEL.doorHalf - 0.4), HOTEL.doorH * 0.45, 0.2, 8, 6));
    doors.push(pivot);
  }

  shade(g, true, true);
  // the rooftop sign and the awnings do not need to cast
  sign.castShadow = false;
  for (const d of doors) { shade(d, true, true); g.add(d); }

  const occluder = mesh(new THREE.BoxGeometry(TOWER * 2, CORNICE - base + 10, depth), new THREE.MeshBasicMaterial(), 0, (CORNICE + base + 10) / 2, zc);
  occluder.visible = false;
  return { group: g, doors, sign: signMat, flag, centre: new THREE.Vector3(0, CORNICE + 4, pf), occluder };
}

export const HOTEL_DIMS = { PAV, WING, TOWER };
void toon;
