import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow, mesh } from '../../../engine/Builders';
import { boxUV, charToon, Painter, repeatUV } from '../../../engine/Paint';
import { clamp, Rng, smoothstep, TAU } from '../../../engine/math';
import { envelope, easeOutBack } from '../../../engine/Rig';
import { tiled } from '../kit';
import { css } from '../textures';
import { PACK, RIBBON, SHOP, WINDOW, Y } from './plan';
import { courtesan, courtesanCrowd, icedFacade } from './pastry';
import { machineMats } from './machines';
import { boxMaterials, ribbonStrip } from './box';
import { fitFont, MC, SCRIPT } from './textures';

/**
 * Dressing for the shop: Agatha's packing table at the end of the belt, display counters of pastries along
 * the walls, a wall of pink boxes on shelves, two cakes iced like buildings (the Grand Budapest itself, and
 * an onion-domed church of Nebelsbad), two giant Courtesans on pedestals flanking the window, the
 * ribbon-tying machine, and Mendl's delivery van, a painted cut-out that can drive past outside.
 */

const F = Y.floor;
const mats = new Map<string, THREE.Material>();
const M = <T extends THREE.Material>(k: string, make: () => T) => { let m = mats.get(k); if (!m) { m = make(); mats.set(k, m); } return m as T; };

/** A closed, tied Mendl's box at the rider's scale (3.6 across at s = 1), merged into a few meshes. */
export function closedBox(s = 1, bow = true) {
  const B = boxMaterials();
  const g = new THREE.Group();
  const w = 3.6 * s, h = 1.4 * s;
  const sideMats = [B.side, B.side, B.top, B.edge, B.side, B.side];
  g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, w), sideMats).translateY(h / 2));
  const rw = 0.26 * s;
  for (const r of [0, Math.PI / 2]) {
    const strip = ribbonStrip([new THREE.Vector3(-w / 2 - 0.01, 0.02, 0), new THREE.Vector3(-w / 2 - 0.01, h + 0.01, 0), new THREE.Vector3(w / 2 + 0.01, h + 0.01, 0), new THREE.Vector3(w / 2 + 0.01, 0.02, 0)],
      [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)], rw, B.ribbon);
    strip.rotation.y = r; g.add(strip);
  }
  if (bow) g.add(bowKnot(s, B.ribbon).translateY(h + 0.02));
  return g;
}

/** Two loops and two tails of ribbon, the knot at the origin. */
export function bowKnot(s: number, mat: THREE.Material) {
  const parts: THREE.BufferGeometry[] = [];
  for (const k of [-1, 1]) {
    const loop = new THREE.TorusGeometry(0.42 * s, 0.07 * s, 6, 18); loop.scale(1, 0.55, 0.35); loop.rotateZ(k * 0.35); loop.translate(k * 0.4 * s, 0.18 * s, 0); parts.push(loop);
    const tail = new THREE.BoxGeometry(0.2 * s, 0.03 * s, 0.75 * s); tail.rotateY(k * 0.5); tail.translate(k * 0.22 * s, 0.03 * s, 0.32 * s); parts.push(tail);
  }
  parts.push(new THREE.SphereGeometry(0.13 * s, 10, 8).scale(1, 0.8, 0.8).translate(0, 0.12 * s, 0));
  return new THREE.Mesh(mergeGeometries(parts.map((p) => (p.index ? p : p.setIndex(Array.from({ length: p.attributes.position.count }, (_, i) => i)))), false)!, mat);
}

/** A tiered cake iced like a building: storeys of iced windows, cream cornices, a tower or onion domes on top. */
function buildingCake(kind: 'hotel' | 'church', color: number, accent: number) {
  const m = machineMats();
  const g = new THREE.Group();
  const wall = M(`cake${color}`, () => charToon({ map: icedFacade(color, kind === 'hotel' ? 53 : 55), rim: 0.45, shade: 0xb8a8c8, emissive: new THREE.Color(0x1a1418) }));
  const cream = m.cream;
  const roofM = M(`roof${accent}`, () => charToon({ color: accent, rim: 0.5, emissive: new THREE.Color(accent).multiplyScalar(0.08) }));
  const tiers = kind === 'hotel' ? [[16, 5, 9], [12, 4.4, 7.4], [8, 4, 6]] : [[11, 5.5, 11], [8, 4.5, 8]];
  let y = 0;
  for (const [w, h, d] of tiers) {
    g.add(new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), 4, 4), wall).translateY(y + h / 2));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), cream).translateY(y + h + 0.25));
    // a row of piped pearls along each cornice
    const pearls: THREE.BufferGeometry[] = [];
    for (let x = -w / 2; x <= w / 2; x += 0.6) for (const zz of [-1, 1]) pearls.push(new THREE.SphereGeometry(0.2, 6, 4).translate(x, y + h + 0.55, zz * (d / 2 + 0.3)));
    g.add(new THREE.Mesh(mergeGeometries(pearls, false)!, cream));
    y += h + 0.5;
  }
  if (kind === 'hotel') {
    // the central pavilion with its pink roof and the little flag
    g.add(new THREE.Mesh(boxUV(new THREE.BoxGeometry(4, 3, 4), 4, 4), wall).translateY(y + 1.5));
    const r = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3, 4), roofM); r.rotation.y = Math.PI / 4; r.position.y = y + 4.5; g.add(r);
    for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.6, 12), roofM); t.position.set(s * 6.5, tiers[0][1] + tiers[1][1] + 1 + 1.3, 0); g.add(t); }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 4), m.brass).translateY(y + 7));
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), M('flag', () => charToon({ color: 0xc8323c, rim: 0.2, side: THREE.DoubleSide }))).translateY(y + 7.6).translateX(0.6));
  } else {
    for (const [x, sc] of [[0, 1.4], [-3.2, 0.8], [3.2, 0.8]] as const) {
      const dome = new THREE.Mesh(new THREE.LatheGeometry([[0.01, 3.4], [0.5, 3.0], [1.4, 2.0], [1.8, 1.0], [1.4, 0.2], [1.2, 0]].map(([r, yy]) => new THREE.Vector2(r * sc, yy * sc)), 18), roofM);
      dome.position.set(x, y, 0); g.add(dome);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22 * sc, 8, 6), m.brass).translateX(x).translateY(y + 3.5 * sc));
    }
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

/** Mendl's delivery van, painted flat on a cut-out like a piece of stage scenery. */
function vanCutout() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 111);
  const g = p.g;
  // body: a rounded pink van with a cream stripe
  g.fillStyle = css(MC.pink);
  g.beginPath(); g.moveTo(40, 200); g.lineTo(40, 90); g.quadraticCurveTo(44, 50, 100, 46); g.lineTo(360, 46); g.quadraticCurveTo(392, 48, 396, 80); g.lineTo(400, 110);
  g.lineTo(456, 118); g.quadraticCurveTo(486, 126, 488, 160); g.lineTo(490, 200); g.closePath(); g.fill();
  g.fillStyle = '#fbf4e6'; g.fillRect(40, 168, 450, 12);
  g.strokeStyle = css(MC.pink, 0.7); g.lineWidth = 4; g.stroke();
  // the cab window and a driver's cap in silhouette
  g.fillStyle = '#cfe0ee'; g.beginPath(); g.moveTo(370, 60); g.lineTo(392, 62); g.lineTo(396, 108); g.lineTo(370, 108); g.closePath(); g.fill();
  g.fillStyle = '#4a2a5a'; g.beginPath(); g.arc(382, 92, 10, 0, TAU); g.fill(); g.fillRect(372, 78, 22, 6);
  // the name on its side
  g.fillStyle = css(MC.navy); g.textAlign = 'center'; g.textBaseline = 'middle';
  fitFont(g, "Mendl's", 'italic bold', SCRIPT, 250, 72);
  g.fillText("Mendl's", 205, 112);
  g.font = 'bold 15px Georgia, serif'; g.fillText('PATISSERIE  NEBELSBAD', 205, 152);
  // bumpers, lamp, wheels with pink hubs
  g.fillStyle = '#d8b25a'; g.fillRect(480, 186, 22, 10); g.fillRect(30, 186, 20, 10);
  g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(482, 150, 8, 0, TAU); g.fill();
  for (const x of [120, 410]) { g.fillStyle = '#2a2428'; g.beginPath(); g.arc(x, 205, 32, 0, TAU); g.fill(); g.fillStyle = css(MC.pink, 0.9); g.beginPath(); g.arc(x, 205, 13, 0, TAU); g.fill(); g.fillStyle = '#d8b25a'; g.beginPath(); g.arc(x, 205, 5, 0, TAU); g.fill(); }
  return p.texture({ wrap: false });
}

export interface ShopParts {
  ribbon: { update(dt: number, t: number): void; react(): void; anchor: THREE.Vector3 };
  van: { update(dt: number): void; drive(): void; group: THREE.Object3D };
  /** the box on Agatha's table, which she ties */
  tableBox: THREE.Object3D;
  windowAnchor: THREE.Vector3;
}

export function buildShop(statics: THREE.Group, live: THREE.Group, rng: Rng): ShopParts {
  const m = machineMats();
  const marble = M('marble', () => { const p = new Painter(256, 256, 113).fill('#f6f0ea'); p.lines({ n: 26, colors: ['#d8c8d0', '#e8dce0'], alpha: [0.3, 0.6], width: [0.8, 2], wobble: 10 }); return new THREE.MeshLambertMaterial({ map: p.texture({ repeat: [1, 1] }) }); });
  const pinkPanel = M('counterPink', () => charToon({ color: 0xf2b4c4, rim: 0.3, shade: 0xc0a0c0 }));
  const glass = M('caseGlass', () => new THREE.MeshLambertMaterial({ color: 0xe8f4f8, transparent: true, opacity: 0.16, emissive: 0x303838, depthWrite: false }));
  const zc = (SHOP.back + SHOP.front) / 2;

  // ---------- Agatha's packing table at the end of the belt ----------
  {
    const z0 = PACK.z, z1 = PACK.z - PACK.depth, zt = (z0 + z1) / 2;
    statics.add(tiled(18, Y.belt - F - 0.6, PACK.depth, pinkPanel, 4, 4, 0, F + (Y.belt - F - 0.6) / 2, zt));
    statics.add(tiled(18.8, 0.6, PACK.depth + 0.6, marble, 4, 4, 0, Y.belt - 0.3, zt));
    for (const y of [F + 1, Y.belt - 1.2]) statics.add(tiled(18.2, 0.35, 0.3, m.brass, 4, 4, 0, y, z0 + 0.12));
    // stacked flat lids, a spool of ribbon and the box she is tying
    for (let k = 0; k < 5; k++) { const lid = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.09, 3.7), boxMaterials().side); lid.position.set(-6.2, Y.belt + 0.05 + k * 0.1, zt + rng.range(-0.1, 0.1)); lid.rotation.y = rng.range(-0.06, 0.06); statics.add(lid); }
    const spool = mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.1, 20), M('spool', () => charToon({ color: MC.blue, rim: 0.5 })), 6.4, Y.belt + 0.55, zt + 0.4); statics.add(spool);
    statics.add(mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.12, 20), m.cream, 6.4, Y.belt + 0.06, zt + 0.4), mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.12, 20), m.cream, 6.4, Y.belt + 1.16, zt + 0.4));
  }
  const tableBox = closedBox(0.85, true);
  tableBox.position.set(0, Y.belt, PACK.z - PACK.depth / 2 - 0.2);
  statics.add(tableBox);

  // ---------- display counters along both walls, glass fronted, full of pastries ----------
  const places: Array<[number, number, number, number, number]> = [];
  for (const s of [-1, 1]) {
    const x = s * (SHOP.halfW - 4), z0 = SHOP.back - 6, z1 = SHOP.front + 12, zl = z0 - z1, zm = (z0 + z1) / 2;
    statics.add(tiled(6, 3.4, zl, pinkPanel, 4, 4, x, F + 1.7, zm));
    statics.add(tiled(6.4, 0.4, zl + 0.4, m.brass, 4, 4, x, F + 3.6, zm));
    statics.add(tiled(6.2, 0.5, zl + 0.2, marble, 4, 4, x, F + 7.8, zm));
    const front = mesh(new THREE.PlaneGeometry(zl, 4), glass, x - s * 3.0, F + 5.8, zm); front.rotation.y = -s * Math.PI / 2; statics.add(front);
    for (let z = z0 - 2; z > z1 + 1; z -= 3.1) for (const dx of [-1, 1]) places.push([x + dx * 1.3, F + 3.85, z + rng.range(-0.3, 0.3), 1.4, rng.range(0, TAU)]);
    // a wall of pink boxes on shelves above
    const sx = s * (SHOP.halfW - 1.6);
    for (let k = 0; k < 4; k++) statics.add(tiled(3.4, 0.35, zl, M('shelf', () => charToon({ color: 0xf8eedc, rim: 0.2 })), 4, 4, sx, F + 12 + k * 4.6, zm));
    const boxes: THREE.BufferGeometry[] = [], ribbons: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) for (let z = z0 - 1.6; z > z1 + 1.4; z -= 3.3) {
      const h = 2.6 + rng.range(-0.3, 0.6) * (k === 3 ? 0 : 1), y = F + 12.18 + k * 4.6;
      const w = 3.0 + rng.range(-0.2, 0.2);
      const b = new THREE.BoxGeometry(2.8, Math.min(h, 4.0), w); b.translate(sx, y + Math.min(h, 4.0) / 2, z); boxes.push(b);
      const r = new THREE.BoxGeometry(2.86, Math.min(h, 4.0) + 0.06, 0.24); r.translate(sx, y + Math.min(h, 4.0) / 2, z); ribbons.push(r);
    }
    statics.add(new THREE.Mesh(mergeGeometries(boxes, false)!, M('shelfBox', () => charToon({ map: (() => { const p = new Painter(64, 64, 115).fill(css(MC.pink)); p.g.strokeStyle = css(MC.navy); p.g.lineWidth = 3; p.g.strokeRect(5, 5, 54, 54); p.g.fillStyle = css(MC.cream); p.g.beginPath(); p.g.ellipse(32, 32, 16, 11, 0, 0, TAU); p.g.fill(); p.g.strokeRect(16, 21, 32, 22); return p.texture(); })(), rim: 0.3, shade: 0xc0a0c0 }))));
    statics.add(new THREE.Mesh(mergeGeometries(ribbons, false)!, boxMaterials().ribbon));
  }
  statics.add(courtesanCrowd(places));

  // ---------- two cakes iced like buildings, on stands either side of the shop ----------
  for (const [s, kind, col, acc] of [[-1, 'hotel', 0xf2b0c2, 0xd8708e], [1, 'church', 0xc8e4c0, 0xb8a0dc]] as const) {
    const stand = new THREE.Group();
    stand.add(mesh(new THREE.CylinderGeometry(9, 9.4, 0.8, 32), m.silver, 0, 0.4, 0));
    stand.add(mesh(new THREE.CylinderGeometry(1.4, 2.2, 6, 16), m.silver, 0, -3, 0));
    stand.add(mesh(new THREE.CylinderGeometry(5, 5.6, 0.8, 24), m.silver, 0, -6.2, 0));
    const cake = buildingCake(kind, col, acc); cake.position.y = 0.8; stand.add(cake);
    stand.position.set(s * 15.5, F + 6.6, zc + 6);
    stand.rotation.y = s * 0.4;
    statics.add(stand);
  }

  // ---------- two giant Courtesans on pedestals flanking the window ----------
  for (const s of [-1, 1]) {
    const x = s * (WINDOW.halfW + 4.2);
    statics.add(tiled(5, 8, 5, pinkPanel, 4, 4, x, F + 4, SHOP.front + 4), tiled(5.8, 0.6, 5.8, m.brass, 4, 4, x, F + 8.3, SHOP.front + 4));
    const c = courtesan(9, true); c.position.set(x, F + 8.6, SHOP.front + 4); c.rotation.y = s * 0.5; c.castShadow = true; statics.add(c);
  }

  // ---------- globe lamps ----------
  {
    const lamps: THREE.BufferGeometry[] = [], cords: THREE.BufferGeometry[] = [];
    for (const [x, z] of [[-12, -512], [12, -512], [-12, -535], [12, -535]]) { lamps.push(new THREE.SphereGeometry(1.8, 16, 12).translate(x, SHOP.top - 14, z)); cords.push(new THREE.CylinderGeometry(0.08, 0.08, 12, 4).translate(x, SHOP.top - 6.2, z)); }
    statics.add(new THREE.Mesh(mergeGeometries(lamps, false)!, M('shopLamp', () => glow(0xfff0d8, 1.45))));
    statics.add(new THREE.Mesh(mergeGeometries(cords, false)!, m.dark));
  }

  // ---------- the ribbon-tying machine ----------
  const ribbonMachine = (() => {
    const g = new THREE.Group(); g.position.set(RIBBON.x, F, RIBBON.z); g.rotation.y = -Math.PI / 2;
    statics.add(g);
    // its table and frame: a mint gantry over a stack of three boxes
    g.add(tiled(12, Y.belt - F - 0.5, 7, M('mintPanel', () => charToon({ color: 0xa8d8c8, rim: 0.3 })), 4, 4, 0, (Y.belt - F - 0.5) / 2, 0));
    g.add(tiled(12.6, 0.5, 7.4, marble, 4, 4, 0, Y.belt - F - 0.25, 0));
    for (const sx of [-5.6, 5.6]) for (const sz of [-3, 3]) g.add(tiled(0.5, 13, 0.5, m.brass, 4, 4, sx, Y.belt - F + 6.5, sz));
    g.add(tiled(12, 1.0, 7, m.mint, 4, 4, 0, Y.belt - F + 13.2, 0));
    const stack = new THREE.Group(); stack.position.set(0, Y.belt - F, 0); g.add(stack);
    for (let k = 0; k < 3; k++) { const b = closedBox(0.62 - k * 0.07, false); b.position.y = k * 1.4 * (0.62 - (k - 0.5) * 0.07); b.rotation.y = k * 0.08; stack.add(b); }
    // bells and gauges on the frame
    for (const sx of [-3, 3]) { const gg = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 18), m.brass, sx, Y.belt - F + 13.2, 3.6); gg.rotation.x = Math.PI / 2; g.add(gg); }
    return g;
  })();
  // its moving parts: two spools paying out ribbon, and the bow-maker that comes down onto the stack
  const rm = new THREE.Group(); rm.position.copy(ribbonMachine.position); rm.rotation.copy(ribbonMachine.rotation); live.add(rm);
  const spools: THREE.Mesh[] = [];
  for (const sx of [-5.6, 5.6]) { const sp = mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.4, 20), M('spool', () => charToon({ color: MC.blue, rim: 0.5 })), sx, Y.belt - F + 10, 0); sp.rotation.x = Math.PI / 2; rm.add(sp); spools.push(sp); }
  const head = new THREE.Group(); head.position.set(0, Y.belt - F + 11.5, 0); rm.add(head);
  head.add(mesh(new THREE.CylinderGeometry(1.0, 1.3, 1.6, 16), m.brass));
  for (const s of [-1, 1]) { const arm = mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), m.brass, s * 1.3, -1.4, 0); arm.rotation.z = s * 0.4; head.add(arm); }
  const bow = bowKnot(1.6, boxMaterials().ribbon); bow.position.set(0, Y.belt - F + 4.05, 0); bow.scale.setScalar(0.001); rm.add(bow);
  let tieT = 9;

  // ---------- the van that drives past outside ----------
  const vanTex = vanCutout();
  const van = mesh(new THREE.PlaneGeometry(26, 13), M('van', () => new THREE.MeshBasicMaterial({ map: vanTex, transparent: true, alphaTest: 0.4, fog: false })), 0, F + 6.4, SHOP.front - 5);
  van.visible = false; live.add(van);
  let driveT = -1;

  return {
    tableBox,
    windowAnchor: new THREE.Vector3(0, (WINDOW.y0 + WINDOW.y1) / 2, SHOP.front),
    ribbon: {
      anchor: new THREE.Vector3(RIBBON.x, Y.belt + 6, RIBBON.z),
      update(dt, t) {
        tieT += dt;
        const k = envelope(tieT, 0, 0.5, 1.6, 2.2);
        head.position.y = Y.belt - F + 11.5 - 6.2 * k;
        head.rotation.y = tieT < 2.2 ? tieT * 9 * k : Math.sin(t * 0.8) * 0.2;
        spools.forEach((s, i) => { s.rotation.y += dt * (0.5 + 6 * k) * (i ? -1 : 1); });
        const b = tieT < 1.4 ? 0 : tieT < 2.0 ? easeOutBack((tieT - 1.4) / 0.6, 2.5) : tieT < 7 ? 1 : 1 - smoothstep(7, 7.6, tieT);
        bow.scale.setScalar(Math.max(0.001, b));
        bow.rotation.y = Math.sin(t * 2) * 0.05;
      },
      react() { if (tieT > 2.4) tieT = 0; },
    },
    van: {
      group: van,
      drive() { if (driveT < 0) driveT = 0; },
      update(dt) {
        if (driveT < 0) return;
        driveT += dt;
        const k = clamp(driveT / 5, 0, 1);
        van.visible = k < 1;
        van.position.x = -48 + 96 * k;
        van.position.y = F + 6.4 + Math.abs(Math.sin(driveT * 12)) * 0.15;
        if (k >= 1) driveT = -1;
      },
    },
  };
}

export { repeatUV, glow };
