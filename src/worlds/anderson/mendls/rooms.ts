import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow, mesh } from '../../../engine/Builders';
import { charToon, repeatUV } from '../../../engine/Paint';
import { TAU } from '../../../engine/math';
import { tiled } from '../kit';
import { lightShaft } from '../common';
import { HALL, ROT, SHOP, WINDOW, Y } from './plan';
import { archWindow, checkerFloor, coffers, logoSign, MC, plaster, shopPanels, streetBackdrop, wallTiles, windowLettering } from './textures';

/**
 * The rooms of Mendl's at giant scale: the long kitchen hall (checkerboard floor, white tiles, pink plaster,
 * tall arched windows of daylight, a coffered ceiling, enamel lamps), the octagonal rotunda with its painted
 * dome and oculus, and the shop with its panelling and the storefront window, whose gold lettering reads
 * backwards from inside, onto a painted street.
 */

const mats = new Map<string, THREE.Material>();
const M = <T extends THREE.Material>(k: string, make: () => T) => { let m = mats.get(k); if (!m) { m = make(); mats.set(k, m); } return m as T; };
export function roomMaterials() {
  return {
    floor: M('floor', () => new THREE.MeshLambertMaterial({ map: checkerFloor() })),
    tiles: M('tiles', () => new THREE.MeshLambertMaterial({ map: wallTiles() })),
    pink: M('pink', () => new THREE.MeshLambertMaterial({ map: plaster(MC.pink, 19) })),
    pistachio: M('pist', () => new THREE.MeshLambertMaterial({ map: plaster(0xcfe4c0, 20) })),
    cream: M('cream', () => charToon({ color: 0xf8eedc, rim: 0.2, shade: 0xc0b0b8 })),
    gold: M('gold', () => charToon({ color: MC.gold, rim: 0.6, shade: 0xa08a70, emissive: new THREE.Color(0x3a2a08) })),
    ceiling: M('ceil', () => new THREE.MeshLambertMaterial({ map: coffers() })),
    panels: M('panels', () => new THREE.MeshLambertMaterial({ map: shopPanels() })),
    window: M('win', () => { const t = archWindow(); return new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.85, alphaTest: 0.5 }); }),
    lamp: M('lamp', () => glow(0xfff0d0, 1.5)),
    blue: M('blue', () => charToon({ color: 0xa8c6e8, rim: 0.3 })),
  };
}

/** Divide an extruded shape's UVs (world units) by the tile size. */
function tileUV(geo: THREE.BufferGeometry, tile: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  return geo;
}

/**
 * A wall in the plane z = 0 from x0 to x1 and y0 to y1, `depth` thick (towards +z), with openings cut up
 * from its bottom edge (sorted by x): round-headed arches springing at `spring`, or square doors `top` high.
 * Openings are notched into the outline rather than made holes, so they can reach the floor.
 */
function wallWithOpenings(x0: number, x1: number, y0: number, y1: number, depth: number, notches: Array<{ x: number; w: number; spring?: number; top?: number }>, tile: number, holes: THREE.Path[] = []) {
  const s = new THREE.Shape();
  s.moveTo(x0, y0);
  for (const n of notches) {
    const r = n.w / 2;
    s.lineTo(n.x - r, y0);
    if (n.spring !== undefined) { s.lineTo(n.x - r, n.spring); s.absarc(n.x, n.spring, r, Math.PI, 0, true); }
    else { s.lineTo(n.x - r, n.top!); s.lineTo(n.x + r, n.top!); }
    s.lineTo(n.x + r, y0);
  }
  s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
  s.holes.push(...holes);
  return tileUV(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 20 }), tile);
}

export interface Rooms {
  statics: THREE.Group;
  /** shafts of daylight, one additive mesh */
  shafts: THREE.Object3D;
  /** the painted street outside the shop window, for the van and the snow to sit in front of */
  street: { z: number };
}

export function buildRooms(lowDetail: boolean): Rooms {
  const R = roomMaterials();
  const st = new THREE.Group();
  const F = Y.floor, TOP = Y.hallTop;
  const add = (...o: THREE.Object3D[]) => { st.add(...o); return o[0]; };

  // ================= the kitchen hall =================
  const hallLen = HALL.back - HALL.front, hallZ = (HALL.back + HALL.front) / 2, HW = HALL.halfW;
  const floorGeo = repeatUV(new THREE.PlaneGeometry(HW * 2, hallLen), (HW * 2) / 12, hallLen / 12);
  const floor = mesh(floorGeo, R.floor, 0, F, hallZ); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; add(floor);
  const TILE_TOP = F + 16, PLASTER_TOP = TOP - 4;
  for (const s of [-1, 1]) {
    const x = s * (HW + 0.5);
    add(tiled(1, TILE_TOP - F, hallLen, R.tiles, 4.8, 4.8, x, (F + TILE_TOP) / 2, hallZ));
    add(tiled(1, PLASTER_TOP - TILE_TOP, hallLen, R.pink, 6, 6, x, (TILE_TOP + PLASTER_TOP) / 2, hallZ));
    // chair rail, cornice and a gilt line under it
    add(tiled(1.2, 1.0, hallLen, R.cream, 4, 4, x - s * 0.4, TILE_TOP + 0.5, hallZ));
    add(tiled(2.4, 3.2, hallLen, R.cream, 4, 4, x - s * 0.9, PLASTER_TOP + 1.6, hallZ));
    add(tiled(0.4, 0.5, hallLen, R.gold, 4, 4, x - s * 2.2, PLASTER_TOP - 0.5, hallZ));
    // pilasters and tall arched windows between them
    for (let z = HALL.back - 9; z > HALL.front + 4; z -= 18) {
      add(tiled(1.6, PLASTER_TOP - TILE_TOP - 1, 2.6, R.cream, 4, 4, x - s * 0.9, (TILE_TOP + PLASTER_TOP) / 2, z));
      add(tiled(2.0, 1.2, 3.2, R.gold, 4, 4, x - s * 1.0, PLASTER_TOP - 1.4, z));
      const wz = z - 9;
      if (wz > HALL.front + 6) {
        const win = mesh(new THREE.PlaneGeometry(9, 22), R.window, x - s * 0.52, TILE_TOP + 6 + 11, wz);
        win.rotation.y = -s * Math.PI / 2; add(win);
        add(tiled(1.0, 0.8, 11, R.cream, 4, 4, x - s * 0.8, TILE_TOP + 5.6, wz));
      }
    }
  }
  // the ceiling and its beams
  const ceil = mesh(repeatUV(new THREE.PlaneGeometry(HW * 2, hallLen), (HW * 2) / 8, hallLen / 8), R.ceiling, 0, TOP, hallZ); ceil.rotation.x = Math.PI / 2; add(ceil);
  for (let z = HALL.back - 9; z > HALL.front; z -= 18) add(tiled(HW * 2, 1.6, 2, R.cream, 4, 4, 0, TOP - 0.8, z));
  // the back wall (behind the start)
  add(tiled(HW * 2 + 2, TILE_TOP - F, 1, R.tiles, 4.8, 4.8, 0, (F + TILE_TOP) / 2, HALL.back + 0.5));
  add(tiled(HW * 2 + 2, TOP - TILE_TOP, 1, R.pink, 6, 6, 0, (TILE_TOP + TOP) / 2, HALL.back + 0.5));
  add(tiled(HW * 2, 1.0, 1.2, R.cream, 4, 4, 0, TILE_TOP + 0.5, HALL.back));
  // the front wall with the great arch into the rotunda (one piece, seen from both sides)
  {
    const geo = wallWithOpenings(-HW - 1, HW + 1, F, TOP, 1.2, [{ x: 0, w: 22, spring: F + 26 }], 6);
    const w = mesh(geo, R.pink, 0, 0, HALL.front - 0.6); add(w);
    // a tiled dado either side of the arch on the hall side, and the arch's gilt frame
    for (const s of [-1, 1]) add(tiled(HW - 11, TILE_TOP - F, 0.6, R.tiles, 4.8, 4.8, s * (11 + (HW - 11) / 2), (F + TILE_TOP) / 2, HALL.front + 0.9));
    const rim = mesh(new THREE.TorusGeometry(11.4, 0.7, 8, 40, Math.PI), R.gold, 0, F + 26, HALL.front + 0.7); add(rim);
    const rimB = rim.clone(); rimB.position.z = HALL.front - 0.7; add(rimB);
    for (const s of [-1, 1]) for (const dz of [0.7, -0.7]) add(tiled(1.4, 26, 1.4, R.gold, 4, 4, s * 11.4, F + 13, HALL.front + dz));
    // the cartouche over the arch
    const sign = mesh(new THREE.PlaneGeometry(24, 12), new THREE.MeshLambertMaterial({ map: logoSign(1024, 512), transparent: true, alphaTest: 0.3, emissive: 0x302020 }), 0, F + 43, HALL.front + 0.62);
    add(sign);
  }
  // enamel lamps hanging over the side lines
  {
    const lamps: THREE.BufferGeometry[] = [], shades: THREE.BufferGeometry[] = [], cords: THREE.BufferGeometry[] = [];
    for (let z = HALL.back - 18; z > HALL.front + 8; z -= 18) for (const x of [-13, 13]) {
      const y = TOP - 22;
      lamps.push(new THREE.SphereGeometry(1.6, 14, 10).translate(x, y - 1.2, z));
      shades.push(new THREE.CylinderGeometry(1.2, 4.2, 2.6, 18, 1, true).translate(x, y + 0.6, z));
      cords.push(new THREE.CylinderGeometry(0.08, 0.08, TOP - y, 4).translate(x, (TOP + y) / 2 + 1.9, z));
    }
    add(new THREE.Mesh(mergeGeometries(lamps, false)!, R.lamp));
    add(new THREE.Mesh(mergeGeometries(shades, false)!, M('shade', () => charToon({ color: 0x6aa898, rim: 0.4, side: THREE.DoubleSide, emissive: new THREE.Color(0x0c1a14) }))));
    add(new THREE.Mesh(mergeGeometries(cords, false)!, M('cord', () => charToon({ color: 0x2a2a2a, rim: 0.1 }))));
  }

  // ================= the rotunda =================
  const C = new THREE.Vector3(0, F, ROT.z);
  const faceW = 2 * ROT.a * Math.tan(Math.PI / 8);
  const rotFloor = mesh(repeatUV(new THREE.CircleGeometry(ROT.a / Math.cos(Math.PI / 8) + 0.5, 8, Math.PI / 8), 1, 1), R.floor, C.x, F + 0.002, C.z);
  // circle UVs are 0..1 across; spread the checker over it
  repeatUV(rotFloor.geometry, (ROT.a * 2) / 12, (ROT.a * 2) / 12);
  rotFloor.rotation.x = -Math.PI / 2; rotFloor.receiveShadow = true; add(rotFloor);
  for (let k = 1; k < 8; k++) {
    if (k === 4) continue;
    const a = (k / 8) * TAU, d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const g = new THREE.Group();
    g.position.copy(C).addScaledVector(d, ROT.a + 0.5); g.rotation.y = a + Math.PI;
    // panelling below, pink plaster above, a cornice and an arched window in the side faces
    g.add(tiled(faceW + 0.6, 24, 1, R.panels, 8, 12, 0, 12, 0));
    g.add(tiled(faceW + 0.6, ROT.wallTop - F - 24, 1, R.pink, 6, 6, 0, 24 + (ROT.wallTop - F - 24) / 2, 0));
    g.add(tiled(faceW + 0.8, 2.4, 2.2, R.cream, 4, 4, 0, ROT.wallTop - F - 1.2, 0.6));
    g.add(tiled(faceW + 0.8, 1, 1.6, R.cream, 4, 4, 0, 24.5, 0.4));
    if (k % 2 === 0) {
      const win = mesh(new THREE.PlaneGeometry(10, 26), R.window, 0, 41, 0.52); g.add(win);
    } else {
      // a gilt mirror panel on the diagonals
      g.add(mesh(new THREE.PlaneGeometry(9, 22), M('mirror', () => new THREE.MeshLambertMaterial({ color: 0xd8dce8, emissive: 0x404858 })), 0, 40, 0.52));
      g.add(tiled(10, 0.8, 0.6, R.gold, 4, 4, 0, 51.4, 0.6), tiled(10, 0.8, 0.6, R.gold, 4, 4, 0, 28.6, 0.6));
    }
    // a pilaster at the corner
    const corner = tiled(2.4, ROT.wallTop - F, 2.4, R.cream, 4, 4, faceW / 2, (ROT.wallTop - F) / 2, 0.4);
    g.add(corner);
    st.add(g);
  }
  // the dome: an octagonal cloister vault, pale blue with gilt ribs, open at the top
  {
    const rIn = ROT.a / Math.cos(Math.PI / 8);
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(ROT.oculus + (rIn - ROT.oculus) * Math.cos(t * Math.PI / 2), ROT.wallTop + (ROT.domeTop - ROT.wallTop) * Math.sin(t * Math.PI / 2))); }
    prof.reverse();
    const geo = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x, p.y - ROT.wallTop)).reverse(), 8, Math.PI / 8);
    const dome = mesh(geo, M('dome', () => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256;
      const g = c.getContext('2d')!;
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#dfeefa'); gr.addColorStop(1, '#9cc0e4');
      g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 80; i++) { const x = (i * 97) % 512, y = (i * 53) % 256; g.beginPath(); g.arc(x, y, 1.5 + (i % 3), 0, TAU); g.fill(); }
      g.fillStyle = '#d8b25a'; for (let k = 0; k < 8; k++) g.fillRect((k / 8) * 512 - 6, 0, 12, 256);
      g.strokeStyle = '#f4bccb'; g.lineWidth = 10; g.beginPath(); g.moveTo(0, 230); g.lineTo(512, 230); g.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
      return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide, emissive: 0x203040 });
    }), C.x, ROT.wallTop, C.z);
    add(dome);
    // the bright sky in the oculus, and a gilt ring round it
    const sky = mesh(new THREE.CircleGeometry(ROT.oculus + 0.4, 24), M('sky', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaf4ff).multiplyScalar(1.4), fog: false })), C.x, ROT.domeTop + 2, C.z);
    sky.rotation.x = Math.PI / 2; add(sky);
    add(mesh(new THREE.CylinderGeometry(ROT.oculus + 0.4, ROT.oculus + 0.4, 2.2, 24, 1, true), M('drum', () => charToon({ color: 0xf8eedc, rim: 0.2, side: THREE.DoubleSide })), C.x, ROT.domeTop + 1, C.z));
    const ring = mesh(new THREE.TorusGeometry(ROT.oculus + 0.5, 0.6, 8, 32), R.gold, C.x, ROT.domeTop, C.z); ring.rotation.x = Math.PI / 2; add(ring);
  }

  // ================= the shop =================
  const shopLen = SHOP.back - SHOP.front, shopZ = (SHOP.back + SHOP.front) / 2, SW = SHOP.halfW;
  const sf = mesh(repeatUV(new THREE.PlaneGeometry(SW * 2, shopLen), (SW * 2) / 12, shopLen / 12), R.floor, 0, F + 0.004, shopZ); sf.rotation.x = -Math.PI / 2; sf.receiveShadow = true; add(sf);
  for (const s of [-1, 1]) {
    add(tiled(1, 24, shopLen, R.panels, 8, 12, s * (SW + 0.5), F + 12, shopZ));
    add(tiled(1, SHOP.top - F - 24, shopLen, R.pink, 6, 6, s * (SW + 0.5), F + 24 + (SHOP.top - F - 24) / 2, shopZ));
    add(tiled(1.8, 2.4, shopLen, R.cream, 4, 4, s * (SW - 0.2), SHOP.top - 1.2, shopZ));
    add(tiled(1.2, 1, shopLen, R.cream, 4, 4, s * SW, F + 24.5, shopZ));
  }
  const sc = mesh(repeatUV(new THREE.PlaneGeometry(SW * 2, shopLen), (SW * 2) / 8, shopLen / 8), R.ceiling, 0, SHOP.top, shopZ); sc.rotation.x = Math.PI / 2; add(sc);
  // the back wall with the hatch the belt comes through
  {
    const geo = wallWithOpenings(-SW - 1, SW + 1, F, SHOP.top, 1.2, [{ x: 0, w: 18, spring: F + 14 }], 6);
    add(mesh(geo, R.pink, 0, 0, SHOP.back - 0.6));
    for (const s of [-1, 1]) add(tiled(SW - 9, 24, 0.5, R.panels, 8, 12, s * (9 + (SW - 9) / 2), F + 12, SHOP.back - 0.85));
    const rim = mesh(new THREE.TorusGeometry(9.3, 0.55, 8, 36, Math.PI), R.gold, 0, F + 14, SHOP.back - 0.9); add(rim);
    for (const s of [-1, 1]) add(tiled(1.1, 14, 1.1, R.gold, 4, 4, s * 9.3, F + 7, SHOP.back - 0.9));
  }
  // the storefront: the wall round the window, the window's frame and glazing bars, the lettering, the street
  const FZ = SHOP.front;
  {
    const W = WINDOW;
    const h = new THREE.Path(); h.moveTo(-W.halfW, W.y0); h.lineTo(W.halfW, W.y0); h.lineTo(W.halfW, W.y1); h.lineTo(-W.halfW, W.y1); h.closePath();
    // the door is on the left
    add(mesh(wallWithOpenings(-SW - 1, SW + 1, F, SHOP.top, 1.2, [{ x: -W.halfW - 5.75, w: 6.5, top: F + 22 }], 6, [h]), R.pink, 0, 0, FZ - 0.6));
    // panelling below the window, inside
    add(tiled(W.halfW * 2, W.y0 - F, 0.5, R.panels, 8, 12, 0, (F + W.y0) / 2, FZ + 0.85));
    const frame = M('frame', () => charToon({ color: 0x3a5a8a, rim: 0.3 }));
    // the window frame in Mendl's blue, with glazing bars
    add(tiled(W.halfW * 2 + 2, 1.4, 1.4, frame, 4, 4, 0, W.y0 - 0.2, FZ + 0.4), tiled(W.halfW * 2 + 2, 1.4, 1.4, frame, 4, 4, 0, W.y1 + 0.2, FZ + 0.4));
    for (const x of [-W.halfW, -W.halfW / 2, 0, W.halfW / 2, W.halfW]) add(tiled(x === 0 || Math.abs(x) === W.halfW ? 1.4 : 0.6, W.y1 - W.y0, 1.2, frame, 4, 4, x, (W.y0 + W.y1) / 2, FZ + 0.4));
    add(tiled(W.halfW * 2, 0.6, 1.0, frame, 4, 4, 0, W.y0 + (W.y1 - W.y0) * 0.68, FZ + 0.4));
    // the glass: faint, with the lettering painted on it
    add(mesh(new THREE.PlaneGeometry(W.halfW * 2, W.y1 - W.y0), M('glass', () => new THREE.MeshLambertMaterial({ color: 0xe8f0f4, transparent: true, opacity: 0.1, depthWrite: false })), 0, (W.y0 + W.y1) / 2, FZ - 0.1));
    const letters = mesh(new THREE.PlaneGeometry(W.halfW * 2 - 1, (W.halfW * 2 - 1) * 0.3125), M('letters', () => new THREE.MeshBasicMaterial({ map: windowLettering(), transparent: true, alphaTest: 0.05, fog: false, color: new THREE.Color(1.05, 1.0, 0.95) })), 0, W.y1 - 5.8, FZ + 0.05);
    letters.renderOrder = 2; add(letters);
    // a striped awning valance over the window, inside
    const door = mesh(new THREE.PlaneGeometry(6.5, 22), M('door', () => new THREE.MeshLambertMaterial({ color: 0x3a5a8a })), -W.halfW - 5.75, F + 11, FZ + 0.0); add(door);
    add(mesh(new THREE.PlaneGeometry(4.2, 12), M('doorGlass', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8eef8).multiplyScalar(1.1), fog: false })), -W.halfW - 5.75, F + 13.5, FZ + 0.05));
  }
  // the street outside, a painted flat
  const streetZ = FZ - 9;
  {
    const back = mesh(new THREE.PlaneGeometry(76, 38), M('street', () => new THREE.MeshBasicMaterial({ map: streetBackdrop(), fog: false })), 0, F + 18, streetZ);
    add(back);
    add(mesh(new THREE.PlaneGeometry(76, 10), M('snow', () => charToon({ color: 0xf0f2f8, rim: 0.1 })), 0, F - 0.02, (FZ + streetZ) / 2).rotateX(-Math.PI / 2));
  }

  // shafts of daylight through the hall's windows, the oculus and the shop window
  const shafts = new THREE.Group();
  {
    const list: Array<[THREE.Vector3, THREE.Vector3, number]> = [];
    if (!lowDetail) {
      for (let z = HALL.back - 18; z > HALL.front + 6; z -= 36) list.push([new THREE.Vector3(-HW, TILE_TOP + 20, z), new THREE.Vector3(-HW + 30, F, z - 12), 12]);
    }
    list.push([new THREE.Vector3(C.x, ROT.domeTop, C.z), new THREE.Vector3(C.x, F + 8, C.z), 20]);
    list.push([new THREE.Vector3(0, WINDOW.y1 - 4, FZ), new THREE.Vector3(0, F, FZ + 26), 30]);
    const parts: THREE.BufferGeometry[] = [];
    let mat: THREE.Material | null = null;
    for (const [a, b, w] of list) {
      const sh = lightShaft(a, b, w, 0xfff0d8, 0.09);
      mat ??= sh.userData.shaft as THREE.Material;
      sh.updateMatrixWorld(true);
      for (const c of sh.children) { const m = c as THREE.Mesh; parts.push(m.geometry.clone().applyMatrix4(m.matrixWorld)); }
    }
    const merged = new THREE.Mesh(mergeGeometries(parts, false)!, mat!);
    merged.renderOrder = 3;
    shafts.add(merged);
  }

  st.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.receiveShadow === false) m.receiveShadow = true; });
  return { statics: st, shafts, street: { z: streetZ } };
}
