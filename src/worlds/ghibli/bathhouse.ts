import * as THREE from 'three';
import { Rng } from '../../engine/math';
import { Acc } from './koriko';
import { hipGableRoof } from './farmhouse';
import { roofTileTexture } from './korikoAtlas';

/**
 * The bathhouse across the night sea: tiers of lacquered red timber with glowing paper screens, green tiled
 * skirt roofs between the tiers, balconies, and a hip-and-gable roof on top. Local frame: the front faces +z.
 */

const CW = 128, CH = 144, S = 512;

/** Colour and glow atlases for the timber-and-paper walls (4 x 3 cells, one bay by one storey each). */
function bathAtlas() {
  const rng = new Rng(1717);
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const colC = mk(), glowC = mk();
  const c = colC.getContext('2d')!, e = glowC.getContext('2d')!;
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  const cells: Array<{ u0: number; v0: number; u1: number; v1: number }> = [];
  const RED = '#8e2a1e', DARK = '#3a1712', BEAM = '#6e1f16';
  for (let i = 0; i < 12; i++) {
    const x0 = (i % 4) * CW, y0 = Math.floor(i / 4) * CH;
    const kind = i < 4 ? 'lit' : i < 6 ? 'dim' : i < 8 ? 'rail' : i === 8 ? 'door' : 'wood';
    // posts and beams
    c.fillStyle = RED; c.fillRect(x0, y0, CW, CH);
    c.fillStyle = BEAM; c.fillRect(x0, y0, CW, 12); c.fillRect(x0, y0 + CH - 16, CW, 16);
    c.fillStyle = DARK; c.fillRect(x0, y0, 10, CH); c.fillRect(x0 + CW - 4, y0, 4, CH);
    if (kind === 'lit' || kind === 'dim' || kind === 'rail') {
      const wx = x0 + 18, wy = y0 + 20, ww = CW - 34, wh = CH - (kind === 'rail' ? 64 : 44);
      const paper = kind === 'dim' ? '#6a5040' : '#f3dca6';
      c.fillStyle = paper; c.fillRect(wx, wy, ww, wh);
      // lattice
      c.fillStyle = DARK;
      for (let k = 0; k <= 4; k++) c.fillRect(wx + (ww * k) / 4 - 1.5, wy, 3, wh);
      for (let k = 0; k <= 5; k++) c.fillRect(wx, wy + (wh * k) / 5 - 1.5, ww, 3);
      // glow: warm, a little uneven, sometimes a guest's shadow on the paper
      if (kind !== 'dim') {
        const gr = e.createRadialGradient(wx + ww / 2, wy + wh / 2, 4, wx + ww / 2, wy + wh / 2, ww * 0.8);
        const hot = rng.range(0.75, 1);
        gr.addColorStop(0, `rgba(255,${Math.round(200 * hot)},${Math.round(120 * hot)},1)`); gr.addColorStop(1, 'rgba(255,150,70,0.75)');
        e.fillStyle = gr; e.fillRect(wx, wy, ww, wh);
        e.fillStyle = '#000';
        for (let k = 0; k <= 4; k++) e.fillRect(wx + (ww * k) / 4 - 1.5, wy, 3, wh);
        for (let k = 0; k <= 5; k++) e.fillRect(wx, wy + (wh * k) / 5 - 1.5, ww, 3);
        if (i === 2) {
          // a silhouette behind the screen
          for (const g of [c, e]) { g.fillStyle = g === c ? 'rgba(60,30,20,0.55)' : 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(wx + ww * 0.6, wy + wh * 0.35, 9, 11, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(wx + ww * 0.6, wy + wh * 0.8, 18, 26, 0, 0, Math.PI * 2); g.fill(); }
        }
      }
      if (kind === 'rail') {
        // balcony balustrade in front of the lower part of the bay
        const ry = y0 + CH - 44;
        c.fillStyle = RED; c.fillRect(x0, ry, CW, 8);
        for (let k = 0; k < 9; k++) { c.fillStyle = DARK; c.fillRect(x0 + 6 + k * 14, ry + 8, 4, 26); }
        c.fillStyle = RED; c.fillRect(x0, ry + 30, CW, 6);
      }
    } else if (kind === 'door') {
      // entrance: dark doorway behind a two-panel curtain
      c.fillStyle = '#1e0f0b'; c.fillRect(x0 + 16, y0 + 18, CW - 32, CH - 34);
      e.fillStyle = 'rgba(255,170,90,0.6)'; e.fillRect(x0 + 16, y0 + 60, CW - 32, CH - 76);
      for (let k = 0; k < 2; k++) { c.fillStyle = '#e8e0d0'; c.fillRect(x0 + 18 + k * 47, y0 + 20, 44, 46); c.fillStyle = '#b3372c'; c.beginPath(); c.arc(x0 + 40 + k * 47, y0 + 43, 11, 0, Math.PI * 2); c.fill(); }
    } else {
      // plain boarded wall
      for (let k = 18; k < CW - 6; k += 14) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x0 + k, y0 + 12, 2, CH - 28); }
    }
    cells.push({ u0: (x0 + 1) / S, u1: (x0 + CW - 1) / S, v0: 1 - (y0 + CH - 1) / S, v1: 1 - (y0 + 1) / S });
  }
  const tex = (cv: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  return { map: tex(colC), glow: tex(glowC), cells };
}

export function buildBathhouse(lantern: (x: number, y: number, z: number, s?: number) => THREE.Object3D) {
  const g = new THREE.Group();
  const atlas = bathAtlas();
  const wallMat = new THREE.MeshLambertMaterial({ map: atlas.map, emissive: 0xffffff, emissiveMap: atlas.glow, emissiveIntensity: 1.25 });
  const tiles = roofTileTexture(21);
  const roofMat = new THREE.MeshLambertMaterial({ map: tiles, color: 0x3f7a66, side: THREE.DoubleSide });
  const trimMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const walls = new Acc(), roofs = new Acc(), trim = new Acc();
  const I = new THREE.Matrix4();
  walls.setMatrix(I); roofs.setMatrix(I); trim.setMatrix(I);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const rng = new Rng(4);
  const cells = atlas.cells;
  const RED = new THREE.Color(0x8e2a1e), UNDER = new THREE.Color(0x2a1410), STONE = new THREE.Color(0x6a655c);
  const tiers: [number, number, number][] = [[44, 9, 30], [38, 8, 26], [32, 8, 22], [24, 7, 18], [16, 7, 12]];
  const BW = 3.2;
  // stone base
  trim.box(-24, 24, -6, 1.2, -17, 17, STONE);
  let y = 1.2;
  tiers.forEach(([w, h, d], ti) => {
    const floors = 2, fh = h / floors;
    // four walls, bay by bay
    const side = (len: number, place: (a: number, b: number, y0: number, y1: number) => [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3], front: boolean) => {
      const bays = Math.max(1, Math.round(len / BW)), bw = len / bays;
      for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
        const a = -len / 2 + b * bw;
        const [p0, p1, p2, p3] = place(a, a + bw, y + f * fh, y + (f + 1) * fh);
        let cell = cells[rng.chance(0.82) ? rng.int(0, 3) : rng.int(4, 5)];
        if (f === 0 && ti > 0) cell = cells[6 + rng.int(0, 1)];
        if (ti === 0 && f === 0 && front && Math.abs(a + bw / 2) < bw) cell = cells[8];
        walls.quad(p0, p1, p2, p3, cell, RED);
      }
    };
    side(w, (a, b, y0, y1) => [V(a, y0, d / 2), V(b, y0, d / 2), V(b, y1, d / 2), V(a, y1, d / 2)], true);
    side(w, (a, b, y0, y1) => [V(-a, y0, -d / 2), V(-b, y0, -d / 2), V(-b, y1, -d / 2), V(-a, y1, -d / 2)], false);
    side(d, (a, b, y0, y1) => [V(w / 2, y0, -a), V(w / 2, y0, -b), V(w / 2, y1, -b), V(w / 2, y1, -a)], false);
    side(d, (a, b, y0, y1) => [V(-w / 2, y0, a), V(-w / 2, y0, b), V(-w / 2, y1, b), V(-w / 2, y1, a)], false);
    // balcony floor between the two storeys
    trim.box(-w / 2 - 0.9, w / 2 + 0.9, y + fh - 0.2, y + fh, -d / 2 - 0.9, d / 2 + 0.9, RED);
    y += h;
    // skirt roof from this tier out past its walls and up to the next tier's walls
    const next = tiers[ti + 1];
    const ov = 2.4, rise = next ? 2.2 : 0;
    if (next) {
      const [nw, , nd] = next;
      const ow = w / 2 + ov, od = d / 2 + ov, iw = nw / 2, id = nd / 2;
      const y0 = y - 0.6, y1 = y + rise;
      const t = 0.45;
      const sl = Math.hypot(od - id, rise + 0.6) * t;
      roofs.quad(V(-ow, y0, od), V(ow, y0, od), V(iw, y1, id), V(-iw, y1, id), [0, 0, 2 * ow * t, 0, (ow + iw) * t, sl, (ow - iw) * t, sl], new THREE.Color(1, 1, 1));
      roofs.quad(V(ow, y0, -od), V(-ow, y0, -od), V(-iw, y1, -id), V(iw, y1, -id), [0, 0, 2 * ow * t, 0, (ow + iw) * t, sl, (ow - iw) * t, sl], new THREE.Color(1, 1, 1));
      roofs.quad(V(ow, y0, od), V(ow, y0, -od), V(iw, y1, -id), V(iw, y1, id), [0, 0, 2 * od * t, 0, (od + id) * t, sl, (od - id) * t, sl], new THREE.Color(1, 1, 1));
      roofs.quad(V(-ow, y0, -od), V(-ow, y0, od), V(-iw, y1, id), V(-iw, y1, -id), [0, 0, 2 * od * t, 0, (od + id) * t, sl, (od - id) * t, sl], new THREE.Color(1, 1, 1));
      // dark underside and a fascia along the eaves
      trim.quad(V(-ow, y0 - 0.02, od), V(-ow, y0 - 0.02, -od), V(ow, y0 - 0.02, -od), V(ow, y0 - 0.02, od), [0, 0, 1, 0, 1, 1, 0, 1], UNDER);
      trim.box(-ow, ow, y0 - 0.45, y0, od - 0.25, od, RED);
      trim.box(-ow, ow, y0 - 0.45, y0, -od, -od + 0.25, RED);
      // lanterns hanging under the eaves
      for (let x = -ow + 3; x <= ow - 3; x += 5) g.add(lantern(x, y0 - 1.1, od - 0.6, 0.8), lantern(x, y0 - 1.1, -od + 0.6, 0.8));
      for (let z = -od + 4; z <= od - 4; z += 6) g.add(lantern(ow - 0.6, y0 - 1.1, z, 0.8), lantern(-ow + 0.6, y0 - 1.1, z, 0.8));
    }
  });
  // crowning roof
  const top = hipGableRoof(16 + 6, 12 + 6, 6.5, roofMat, new THREE.MeshLambertMaterial({ color: 0x8e2a1e, side: THREE.DoubleSide }));
  top.position.y = y - 0.7;
  g.add(top);
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 5, 8), new THREE.MeshLambertMaterial({ color: 0xd8b860, emissive: 0x2a1a06 }));
  finial.position.y = y + 8.2;
  g.add(finial);
  // tall brick chimney at the back
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.1, 34, 12), new THREE.MeshLambertMaterial({ color: 0x5a3a2e }));
  chim.position.set(-17, 17, -9);
  g.add(chim);
  for (const [a, mat] of [[walls, wallMat], [roofs, roofMat], [trim, trimMat]] as const) {
    const m = new THREE.Mesh(a.build(), mat);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  }
  return { group: g, height: y };
}
