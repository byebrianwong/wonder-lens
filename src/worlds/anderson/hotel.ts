import * as THREE from 'three';
import { toon, glow, box, cyl, cone, sphere, mesh, canvasTexture, mergeStatic } from '../../engine/Builders';
import { boxUV, repeatUV } from '../../engine/Paint';
import { TAU } from '../../engine/math';
import { PAL, signBoard, topiary, mansardGeometry } from './environment';
import { facadeTile, fishScales, paving, stripes } from './textures';

/** One window bay and one storey, in world units. Wall widths are whole numbers of bays so windows stay symmetrical. */
const BAY = 2.4, STOREY = 3.4;

/** A box whose texture repeats every tileW x tileH units on every face. */
function tiled(w: number, h: number, d: number, mat: THREE.Material, tileW: number, tileH: number, x = 0, y = 0, z = 0) {
  return mesh(boxUV(new THREE.BoxGeometry(w, h, d), tileW, tileH), mat, x, y, z);
}

/** A stag's silhouette for the weathervane on the hotel's peak. */
function stagTexture() {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#d8b25a'; g.strokeStyle = '#d8b25a'; g.lineCap = 'round'; g.lineWidth = 5;
    g.beginPath(); g.ellipse(64, 84, 30, 13, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(88, 78); g.lineTo(100, 50); g.stroke();
    g.beginPath(); g.ellipse(104, 46, 11, 7, 0.4, 0, TAU); g.fill();
    for (const [x, y] of [[44, 96], [52, 98], [76, 98], [84, 96]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, 122); g.stroke(); }
    // antlers
    g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(100, 40); g.lineTo(92, 14); g.moveTo(96, 28); g.lineTo(84, 20); g.moveTo(94, 20); g.lineTo(100, 8);
    g.moveTo(104, 40); g.lineTo(114, 16); g.moveTo(110, 26); g.lineTo(122, 20); g.moveTo(112, 20); g.lineTo(108, 6); g.stroke();
    g.beginPath(); g.moveTo(36, 80); g.lineTo(28, 72); g.stroke();
  });
}

/**
 * The Grand Budapest Hotel: a candy-pink, symmetrical block with corner wings and turrets, a set-back upper
 * tier under a fish-scale mansard with dormers, an arcaded ground floor, the name on the roof and a stag on
 * the peak. Local +z is the facade; the origin is the terrace in front of the lobby. Static, and merged.
 */
export function buildGrandBudapest() {
  const hotel = new THREE.Group();
  const pinkT = facadeTile({ wall: 0xf0acbf, frame: 0xfbf4f0, curtain: 0xf4dce0, cornice: 0xfbf4f0, pilaster: 0xf7c6d2, balcony: true, bays: 4, storeys: 2, lit: 0.3, seed: 3 });
  const pink = new THREE.MeshLambertMaterial({ map: pinkT.map, emissive: 0xffdcb0, emissiveMap: pinkT.emissive, emissiveIntensity: 0.55 });
  const wingT = facadeTile({ wall: 0xeea2b6, frame: 0xfbf4f0, curtain: 0xf4dce0, cornice: 0xfbf4f0, arch: true, bays: 4, storeys: 2, lit: 0.3, seed: 4 });
  const wing = new THREE.MeshLambertMaterial({ map: wingT.map, emissive: 0xffdcb0, emissiveMap: wingT.emissive, emissiveIntensity: 0.55 });
  const groundT = facadeTile({ wall: 0xf8e6e2, frame: 0xfbf4f0, arch: true, bays: 1, storeys: 1, lit: 0.9, seed: 5 });
  const ground = new THREE.MeshLambertMaterial({ map: groundT.map, emissive: 0xffe0b0, emissiveMap: groundT.emissive, emissiveIntensity: 0.8 });
  const roofTex = fishScales(PAL.burgundy);
  const roof = new THREE.MeshLambertMaterial({ map: roofTex });
  const white = toon(PAL.white), cream = toon(PAL.cream), red = toon(PAL.red), brass = toon(PAL.brass), dark = toon(PAL.dark);
  const stone = new THREE.MeshLambertMaterial({ map: paving(0xeadfd0) });

  // --- the blocks: main (13 bays), two wings (4 bays each, a bay deeper), a set-back upper tier (9 bays) ---
  const GF = 5; // ground floor height
  const mainW = 13 * BAY, mainD = 7 * BAY, mainH = 4 * STOREY;
  const wingW = 4 * BAY, wingD = 8 * BAY, wingX = mainW / 2 + wingW / 2;
  const upW = 9 * BAY, upD = 5 * BAY, upH = 2 * STOREY;
  hotel.add(tiled(mainW, GF, mainD, ground, BAY, GF, 0, GF / 2, 0));
  hotel.add(tiled(mainW, mainH, mainD, pink, 4 * BAY, 2 * STOREY, 0, GF + mainH / 2, 0));
  for (const s of [-1, 1]) {
    hotel.add(tiled(wingW, GF, wingD, ground, BAY, GF, s * wingX, GF / 2, BAY / 2));
    hotel.add(tiled(wingW, mainH, wingD, wing, 4 * BAY, 2 * STOREY, s * wingX, GF + mainH / 2, BAY / 2));
  }
  const topY = GF + mainH;
  hotel.add(tiled(upW, upH, upD, pink, 4 * BAY, 2 * STOREY, 0, topY + upH / 2, -1));
  // cornices and string courses between the storeys and around the tops
  hotel.add(box(mainW + 0.8, 0.5, mainD + 0.8, white, 0, GF, 0));
  hotel.add(box(mainW + 1.0, 0.7, mainD + 1.0, white, 0, topY + 0.25, 0));
  for (const s of [-1, 1]) {
    hotel.add(box(wingW + 0.8, 0.5, wingD + 0.8, white, s * wingX, GF, BAY / 2));
    hotel.add(box(wingW + 1.0, 0.7, wingD + 1.0, white, s * wingX, topY + 0.25, BAY / 2));
  }
  hotel.add(box(upW + 0.8, 0.6, upD + 0.8, white, 0, topY + upH + 0.2, -1));
  // a balustrade round the roof terrace of the main block
  for (let x = -mainW / 2 + 0.6; x <= mainW / 2 - 0.5; x += 0.8) if (Math.abs(x) > upW / 2 + 0.4) hotel.add(cyl(0.12, 0.12, 0.8, white, x, topY + 1.0, mainD / 2 + 0.2, 6));
  hotel.add(box(mainW, 0.14, 0.3, white, 0, topY + 1.45, mainD / 2 + 0.2));

  // --- central entrance bay: projects a little, runs up through every storey, ends in a pediment with a clock ---
  {
    const bw = 4 * BAY, bz = mainD / 2 + 0.6;
    hotel.add(tiled(bw, mainH, 1.2, wing, 4 * BAY, 2 * STOREY, 0, GF + mainH / 2, bz));
    hotel.add(box(bw + 0.6, 0.7, 1.6, white, 0, topY + 0.25, bz));
    const ped = new THREE.Shape();
    ped.moveTo(-bw / 2 - 0.3, 0); ped.lineTo(bw / 2 + 0.3, 0); ped.lineTo(0, 3.4); ped.closePath();
    const pg = new THREE.ExtrudeGeometry(ped, { depth: 1.0, bevelEnabled: false });
    hotel.add(mesh(pg, white, 0, topY + 0.6, bz - 0.5));
    const inner = new THREE.Shape();
    inner.moveTo(-bw / 2 + 0.7, 0); inner.lineTo(bw / 2 - 0.7, 0); inner.lineTo(0, 2.5); inner.closePath();
    hotel.add(mesh(new THREE.ShapeGeometry(inner), toon(0xf7c6d2), 0, topY + 0.85, bz + 0.52));
    const clock = canvasTexture(128, 128, (g) => {
      g.fillStyle = '#fbf7f2'; g.beginPath(); g.arc(64, 64, 60, 0, TAU); g.fill();
      g.strokeStyle = '#d8b25a'; g.lineWidth = 8; g.stroke();
      g.fillStyle = '#2a2c30';
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.fillRect(64 + Math.cos(a) * 46 - 2, 64 + Math.sin(a) * 46 - 2, 4, 4); }
      g.strokeStyle = '#2a2c30'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 26); g.moveTo(64, 64); g.lineTo(90, 72); g.stroke();
    });
    hotel.add(mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ map: clock }), 0, topY + 1.7, bz + 0.54));
    // the lobby doors and the red awning out over the steps, with the name on its valance
    hotel.add(box(4.2, 3.8, 0.2, glow(0xfff0d8, 0.85), 0, 1.9, bz + 0.62));
    hotel.add(box(4.8, 0.3, 0.3, brass, 0, 3.9, bz + 0.7));
    hotel.add(box(6.4, 0.24, 4.6, red, 0, 4.4, bz + 2.8));
    const val = signBoard('GRAND BUDAPEST', 6.4, 0.62, { color: '#f0d27a', bg: '#b93a4c', texW: 512, texH: 60, frame: PAL.red });
    val.position.set(0, 4.05, bz + 5.12); hotel.add(val);
    for (const s of [-1, 1]) hotel.add(cyl(0.06, 0.06, 4.3, brass, s * 3.0, 2.2, bz + 4.95, 8), sphere(0.12, brass, s * 3.0, 4.4, bz + 4.95, 8, 6));
  }

  // --- roofs: fish-scale mansards with dormers on the wings and the upper tier ---
  const roofTop = topY + upH + 0.5;
  {
    const rw = upW + 1.2, rd = upD + 1.2, rh = 5.2;
    const geo = repeatUV(mansardGeometry(rw, rd, rh, 0.62), (rw + rd) * 2 / 1.5, rh / 1.5);
    const r = mesh(geo, roof, 0, roofTop, -1); r.castShadow = true; hotel.add(r);
    hotel.add(box(rw * 0.62 + 0.4, 0.3, rd * 0.62 + 0.4, white, 0, roofTop + rh, -1));
    // dormers: a little window with a round top, in a row across the front slope
    const dormerMat = new THREE.MeshLambertMaterial({ map: groundT.map, emissive: 0xffe0b0, emissiveMap: groundT.emissive, emissiveIntensity: 0.6 });
    for (let i = -3; i <= 3; i++) {
      const x = i * BAY * 1.2;
      const dz = rd / 2 - 1.3;
      hotel.add(tiled(1.4, 1.8, 1.4, dormerMat, 1.4, 1.8, x, roofTop + 1.3, -1 + dz));
      hotel.add(mesh(new THREE.CylinderGeometry(0.78, 0.78, 1.5, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), white, x, roofTop + 2.2, -1 + dz));
    }
    // the sign, standing on the roof between two posts, with a row of bulbs along the top
    const sign = signBoard('GRAND BUDAPEST HOTEL', 20, 2.3, { color: '#b93a4c', bg: '#fbf7f2', border: '#b93a4c', texW: 1024, texH: 118, frame: PAL.red });
    sign.position.set(0, roofTop + rh + 2.0, rd / 2 - 3.2); hotel.add(sign);
    for (const s of [-1, 1]) hotel.add(cyl(0.08, 0.08, 2.6, dark, s * 9.2, roofTop + rh + 1.0, rd / 2 - 3.3, 6));
    const bulb = glow(0xfff0c0, 1.3);
    for (let x = -9.6; x <= 9.61; x += 0.8) hotel.add(sphere(0.1, bulb, x, roofTop + rh + 3.3, rd / 2 - 3.1, 6, 4));
    // the peak: a little lantern cupola with the stag weathervane
    const pk = new THREE.Group();
    pk.add(cyl(1.2, 1.3, 1.6, cream, 0, 0.8, 0, 10));
    pk.add(cone(1.5, 1.6, roof, 0, 2.4, 0, 10));
    pk.add(cyl(0.05, 0.05, 1.6, brass, 0, 3.8, 0, 5));
    const stag = mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshLambertMaterial({ map: stagTexture(), alphaTest: 0.5, side: THREE.DoubleSide }), 0, 5.0, 0);
    pk.add(stag);
    pk.position.set(0, roofTop + rh + 0.15, -3.6);
    hotel.add(pk);
  }
  for (const s of [-1, 1]) {
    // wing mansards and a round turret with a pointed fish-scale cap
    const rw = wingW + 1.0, rd = wingD + 1.0, rh = 3.6;
    const geo = repeatUV(mansardGeometry(rw, rd, rh, 0.62), (rw + rd) * 2 / 1.5, rh / 1.5);
    const r = mesh(geo, roof, s * wingX, topY + 0.6, BAY / 2); r.castShadow = true; hotel.add(r);
    const tx = s * wingX, tz = BAY / 2 + wingD / 2 - 2.4;
    const turretT = repeatUV(new THREE.CylinderGeometry(2.1, 2.1, 4.4, 16), 3, 1);
    hotel.add(mesh(turretT, wing, tx, topY + rh + 2.4, tz));
    hotel.add(cyl(2.4, 2.4, 0.4, white, tx, topY + rh + 4.7, tz, 16));
    const cap = mesh(repeatUV(new THREE.ConeGeometry(2.5, 4.6, 16), 7, 3), roof, tx, topY + rh + 7.2, tz); cap.castShadow = true; hotel.add(cap);
    hotel.add(cyl(0.05, 0.05, 1.8, brass, tx, topY + rh + 10.2, tz, 5), sphere(0.2, brass, tx, topY + rh + 9.6, tz, 8, 6));
    hotel.add(mesh(new THREE.PlaneGeometry(1.4, 0.8), toon(PAL.red, { side: THREE.DoubleSide }), tx + 0.7, topY + rh + 10.6, tz));
    // chimneys, one pair per wing
    for (const cz of [-3, 3]) hotel.add(box(0.8, 2.2, 0.8, toon(0xe8c8cc), tx + s * 2.2, topY + 2.6, BAY / 2 + cz));
  }

  // --- plinth, steps, red carpet and a formal terrace ---
  const plinth = tiled(58, 1.2, 28, stone, 2, 2, 0, -0.6, 2);
  hotel.add(plinth);
  for (let i = 0; i < 4; i++) hotel.add(tiled(9 + i * 1.2, 0.25, 1.0, stone, 2, 2, 0, -0.125 - i * 0.25 - 1.2 + 1.2, mainD / 2 + 6.6 + i * 0.8));
  hotel.add(box(2.6, 0.04, 9, red, 0, 0.03, mainD / 2 + 4.6));
  hotel.add(box(2.4, 0.04, 6, red, 0, -0.97, mainD / 2 + 12));
  const tz0 = mainD / 2 + 12;
  hotel.add(cyl(2.6, 2.8, 0.6, cream, 0, -0.7, tz0 + 3, 20));
  hotel.add(cyl(2.3, 2.3, 0.05, toon(PAL.mint, { transparent: true, opacity: 0.8 }), 0, -0.4, tz0 + 3, 20));
  hotel.add(cyl(0.3, 0.5, 1.2, cream, 0, -0.1, tz0 + 3, 10), cyl(1.0, 1.0, 0.2, cream, 0, 0.5, tz0 + 3, 14));
  for (const s of [-1, 1]) for (const [tx, dz, k] of [[8, -1, 'cone'], [14, -1, 'ball'], [20, -1, 'cone'], [8, 3.5, 'double'], [14, 3.5, 'double']] as [number, number, 'cone' | 'ball' | 'double'][]) { const t = topiary(k); t.position.set(s * tx, -1, tz0 + dz); hotel.add(t); }
  for (const s of [-1, 1]) for (const dz of [-3, 1, 5]) hotel.add(cyl(0.06, 0.08, 3, white, s * 22, 0.5, tz0 + dz, 6), sphere(0.3, glow(0xfff0c8, 1.0), s * 22, 2.2, tz0 + dz, 10, 8));
  // striped awnings over the ground-floor arches of the wings
  const awnTex = stripes(PAL.pink, PAL.white, 5, true);
  const awnMat = new THREE.MeshLambertMaterial({ map: awnTex, side: THREE.DoubleSide, alphaTest: 0.5 });
  for (const s of [-1, 1]) {
    const aw = mesh(new THREE.PlaneGeometry(wingW - 0.4, 1.6), awnMat, s * wingX, 3.9, BAY / 2 + wingD / 2 + 0.6);
    aw.rotation.x = -0.7; hotel.add(aw);
  }
  hotel.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && !(m.material as THREE.Material).transparent) m.castShadow = true; });
  mergeStatic(hotel);
  return hotel;
}
