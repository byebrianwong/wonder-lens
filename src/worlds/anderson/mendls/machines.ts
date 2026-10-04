import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow, mesh } from '../../../engine/Builders';
import { charToon, Painter, repeatUV } from '../../../engine/Paint';
import { clamp, Rng, smoothstep, TAU } from '../../../engine/math';
import { envelope, easeOutBack } from '../../../engine/Rig';
import { tiled } from '../kit';
import { css } from '../textures';
import { BAGS, HALL, MIXER, OVENS, RIVER, SIDE, TOWER, Y } from './plan';
import { courtesanCrowd, courtesanGeometry, courtesanMaterial, courtesanTower } from './pastry';
import { copper, creamFlow, logoSign, MC, ovenDoor, ovenTiles, SCRIPT, fitFont } from './textures';

/**
 * The machinery of Mendl's kitchen, at giant scale: twin stand mixers whose whisks turn in copper bowls and
 * spill cream into two rivers along the belt; piping bags as big as buses hanging from gantries, icing the
 * Courtesans that ride the side lines; the banks of ovens with doors that drop open; racks of pastries; the
 * box-folding machine at the back of the hall; and the tower of Courtesans on its turntable.
 *
 * Each builder adds its static parts to `statics` (merged later by the set) and returns its moving parts.
 */

const F = Y.floor;
const mats = new Map<string, THREE.Material>();
const M = <T extends THREE.Material>(k: string, make: () => T) => { let m = mats.get(k); if (!m) { m = make(); mats.set(k, m); } return m as T; };
export const machineMats = () => ({
  brass: M('brass', () => charToon({ color: 0xe0b860, rim: 0.7, shade: 0xa08a70, emissive: new THREE.Color(0x3a2808) })),
  steel: M('steel', () => charToon({ color: 0xdcdcd8, rim: 0.6, shade: 0x9098b0, emissive: new THREE.Color(0x1a1a1a) })),
  mint: M('mint', () => charToon({ color: 0xa8d8c8, rim: 0.45, shade: 0x8aa0c0, emissive: new THREE.Color(0x0a1a14) })),
  pink: M('mpink', () => charToon({ color: MC.pink, rim: 0.4, shade: 0xc0a0c0 })),
  cream: M('mcream', () => charToon({ color: 0xfbf4e6, rim: 0.5, shade: 0xc8bcc8, emissive: new THREE.Color(0x2a2620) })),
  copper: M('copper', () => charToon({ map: copper(), rim: 0.6, shade: 0xb08878, emissive: new THREE.Color(0x2a1408) })),
  dark: M('mdark', () => charToon({ color: 0x3a3036, rim: 0.2 })),
  silver: M('silver', () => charToon({ color: 0xe8e6f0, rim: 0.8, shade: 0x9aa0c0, emissive: new THREE.Color(0x24242c) })),
});

const ICINGS = [0xc3a8e2, 0xbfe0b0, 0xf6b6c8];

// ---------------------------------------------------------------- mixers and rivers
export interface Mixers { update(dt: number, t: number): void; react(): void }
export function buildMixers(statics: THREE.Group, live: THREE.Group): Mixers {
  const m = machineMats();
  const whisks: THREE.Group[] = [];
  const swirls: THREE.Mesh[] = [];
  const streams: THREE.Mesh[] = [];
  const flowTex = creamFlow();
  flowTex.repeat.set(1, 1 / 8);
  const flowMat = new THREE.MeshLambertMaterial({ map: flowTex, emissive: 0x3a3428 });
  const swirlTex = (() => {
    const p = new Painter(256, 256, 71).fill('#fbf4e6');
    const g = p.g;
    for (let i = 0; i < 7; i++) { g.strokeStyle = i % 2 ? 'rgba(220,196,160,0.6)' : 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.beginPath(); for (let a = 0; a < TAU * 3; a += 0.05) { const r = 8 + a * 6 + i * 4; g.lineTo(128 + Math.cos(a + i) * r, 128 + Math.sin(a + i) * r); } g.stroke(); }
    return p.texture({ wrap: false });
  })();
  const swirlMat = new THREE.MeshLambertMaterial({ map: swirlTex, emissive: 0x3a3428 });
  for (const s of [-1, 1]) {
    const x = s * MIXER.x, z = MIXER.z;
    const base = F + 1.6;
    // the base plate, the column behind the bowl and the head over it
    statics.add(tiled(8.4, 1.6, 13, m.mint, 4, 4, x, F + 0.8, z + 1.8));
    statics.add(mesh(new THREE.CylinderGeometry(1.9, 2.2, 18, 20), m.mint, x, base + 9, z + 5.6));
    const head = mesh(new THREE.CapsuleGeometry(2.5, 7.5, 8, 20), m.mint, x, base + 19.2, z + 1.6); head.rotation.x = Math.PI / 2; statics.add(head);
    const band = mesh(new THREE.TorusGeometry(2.55, 0.25, 8, 28), m.brass, x, base + 19.2, z + 0.4); statics.add(band);
    const nose = mesh(new THREE.CylinderGeometry(1.3, 1.6, 1.4, 18), m.brass, x, base + 16.6, z); statics.add(nose);
    // the badge on the head's side, facing the belt
    const badge = mesh(new THREE.PlaneGeometry(4.4, 2.2), M('badge', () => new THREE.MeshLambertMaterial({ map: logoSign(512, 256), transparent: true, alphaTest: 0.3, emissive: 0x302020 })), x - s * 2.56, base + 19.4, z + 1.6);
    badge.rotation.y = -s * Math.PI / 2; statics.add(badge);
    // the copper bowl, with a rolled rim
    const prof = [[0.01, 0], [2.4, 0], [3.5, 0.7], [4.05, 2.8], [4.2, 5.6], [4.3, 6.9], [4.05, 6.9], [3.9, 5.6], [3.7, 2.9], [3.2, 1.0], [0.01, 0.6]].map(([r, y]) => new THREE.Vector2(r, y));
    const bowl = mesh(repeatUV(new THREE.LatheGeometry(prof, 40), 2, 1), m.copper, x, base, z); bowl.castShadow = true; statics.add(bowl);
    const rim = mesh(new THREE.TorusGeometry(4.2, 0.2, 8, 40), m.copper, x, base + 6.95, z); rim.rotation.x = Math.PI / 2; statics.add(rim);
    // the cream inside, a slow swirl
    const swirl = mesh(new THREE.CircleGeometry(4.02, 36), swirlMat, x, base + 5.7, z); swirl.rotation.x = -Math.PI / 2; live.add(swirl); swirls.push(swirl);
    const peak = mesh(new THREE.ConeGeometry(1.8, 1.6, 20), m.cream, x, base + 6.4, z); statics.add(peak);
    // the whisk: a shaft and six long loops of wire, spinning
    const wh = new THREE.Group(); wh.position.set(x, base + 15.9, z);
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.3, 0.3, 3.2, 8).translate(0, -1.2, 0), new THREE.CylinderGeometry(0.7, 0.45, 1.0, 10).translate(0, -3.0, 0)];
    for (let k = 0; k < 6; k++) { const loop = new THREE.TorusGeometry(2.1, 0.09, 5, 30); loop.scale(0.62, 2.15, 1); loop.rotateY((k / 6) * Math.PI); loop.translate(0, -3.4 - 2.1 * 2.15 + 0.5, 0); parts.push(loop); }
    const whisk = new THREE.Mesh(mergeGeometries(parts, false)!, m.steel);
    wh.add(whisk); live.add(wh); whisks.push(wh);
    // a lip on the bowl's front, and the cream falling from it into the river
    statics.add(mesh(new THREE.BoxGeometry(1.6, 0.4, 1.4), m.copper, x, base + 6.8, z - 4.4));
    const fall = new THREE.Mesh(repeatUV(new THREE.CylinderGeometry(0.75, 0.95, base + 6.8 - F - 0.6, 14, 1, true), 1, 2), flowMat);
    fall.position.set(x, (base + 6.8 + F + 0.6) / 2, z - 5.0); live.add(fall); streams.push(fall);
    // the river: a trough of cream along the belt
    const len = RIVER.z0 - RIVER.z1 + (RIVER.z0 - (z - 5.0)) * 0;
    const rz = (z - 5.6 + RIVER.z1) / 2, rl = (z - 5.6) - RIVER.z1;
    const surf = mesh(repeatUV(new THREE.PlaneGeometry(RIVER.w, rl), 1, rl / 1), flowMat, x, F + 0.95, rz); surf.rotation.x = -Math.PI / 2; live.add(surf);
    for (const e of [-1, 1]) statics.add(tiled(0.35, 1.4, rl + 0.4, m.steel, 4, 4, x + e * (RIVER.w / 2 + 0.17), F + 0.7, rz));
    statics.add(tiled(RIVER.w + 0.7, 1.4, 0.35, m.steel, 4, 4, x, F + 0.7, z - 5.6 + 0.2));
    statics.add(tiled(RIVER.w + 0.7, 1.4, 0.35, m.steel, 4, 4, x, F + 0.7, RIVER.z1 - 0.2));
    void len;
  }
  let reactT = 9;
  return {
    update(dt, t) {
      reactT += dt;
      const boost = 1 + 3 * envelope(reactT, 0, 0.4, 2.2, 3.4);
      whisks.forEach((w, i) => { w.rotation.y += dt * 3.2 * boost * (i ? -1 : 1); w.position.x = (i ? 1 : -1) * MIXER.x + Math.sin(t * 1.3 + i) * 0.5; w.position.z = MIXER.z + Math.cos(t * 1.3 + i) * 0.5; });
      swirls.forEach((s, i) => { s.rotation.z += dt * 0.8 * boost * (i ? -1 : 1); });
      flowTex.offset.y -= dt * 0.25 * (0.6 + boost * 0.4);
      streams.forEach((s) => { s.scale.x = s.scale.z = 1 + 0.06 * Math.sin(t * 9) + (boost - 1) * 0.12; });
    },
    react() { reactT = 0; },
  };
}

// ---------------------------------------------------------------- piping bags on gantries
function bagTexture(fill: number) {
  const p = new Painter(256, 256, 73).fill('#fbf8f4');
  const g = p.g;
  // fine blue stripes up the cloth
  for (let x = 0; x < 256; x += 32) { g.fillStyle = css(MC.blue, 1.05); g.fillRect(x + 12, 0, 5, 256); }
  // the icing seen through the cloth near the nozzle
  const gr = g.createLinearGradient(0, 256, 0, 90);
  gr.addColorStop(0, css(fill)); gr.addColorStop(0.55, css(fill, 1.05, 0xffffff, 0.3)); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 90, 256, 166);
  // soft folds
  for (let k = 0; k < 9; k++) { const x = k * 28 + 6; const f = g.createLinearGradient(x, 0, x + 20, 0); f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(0.5, 'rgba(80,60,90,0.12)'); f.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = f; g.fillRect(x, 0, 20, 256); }
  g.fillStyle = 'rgba(80,60,90,0.25)'; g.fillRect(0, 0, 256, 6);
  return p.texture();
}

export interface Bags { group: THREE.Group; update(dt: number, t: number): void; react(): void; anchor: THREE.Vector3 }
export function buildBags(statics: THREE.Group, live: THREE.Group, rng: Rng): Bags {
  const m = machineMats();
  const nozzleY = Y.belt + 2.6 + 1.3;
  const GANTRY = Y.hallTop - 13;
  const bags: Array<{ body: THREE.Mesh; hang: THREE.Group; stream: THREE.Mesh; phase: number; x: number }> = [];
  const bodyProf = [[0.75, 1.3], [1.55, 3], [2.5, 6], [2.95, 8.4], [2.9, 9.4], [2.3, 10.3], [1.3, 10.9], [0.9, 11.2]].map(([r, y]) => new THREE.Vector2(r, y));
  const bodyGeo = new THREE.LatheGeometry(bodyProf, 28);
  // the hardware, the same for every bag: a star nozzle, a clamp ring and three rods up to a carriage
  const hw: THREE.BufferGeometry[] = [];
  const noz = new THREE.CylinderGeometry(0.8, 0.22, 1.5, 8); noz.translate(0, 0.75, 0); hw.push(noz);
  const ring = new THREE.TorusGeometry(2.98, 0.22, 6, 28); ring.rotateX(Math.PI / 2); ring.translate(0, 9.4, 0); hw.push(ring);
  const twist = new THREE.ConeGeometry(0.9, 2.4, 10); twist.rotateX(Math.PI); twist.translate(0, 12.3, 0);
  const rodLen = GANTRY - (nozzleY + 9.4);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; const r = new THREE.CylinderGeometry(0.08, 0.08, rodLen, 4); r.translate(Math.cos(a) * 2.9, 9.4 + rodLen / 2, Math.sin(a) * 2.9); hw.push(r); }
  const carriage = new THREE.BoxGeometry(3.4, 1.6, 3.4); carriage.translate(0, 9.4 + rodLen, 0); hw.push(carriage);
  const hwGeo = mergeGeometries(hw, false)!;
  BAGS.forEach((z, i) => {
    // the gantry: a pistachio beam across the hall, with brass ends
    statics.add(tiled(HALL.halfW * 2, 2.2, 2.2, m.mint, 4, 4, 0, GANTRY + 1.9, z));
    statics.add(tiled(HALL.halfW * 2, 0.4, 2.6, m.brass, 4, 4, 0, GANTRY + 0.7, z));
    const fill = ICINGS[i % 3];
    const bagMat = M(`bag${fill}`, () => charToon({ map: bagTexture(fill), rim: 0.45, shade: 0xb8b0d0, emissive: new THREE.Color(0x1a1818) }));
    const iceMat = M(`ice${fill}`, () => charToon({ color: fill, rim: 0.5, emissive: new THREE.Color(fill).multiplyScalar(0.12) }));
    for (const s of [-1, 1]) {
      const hang = new THREE.Group(); hang.position.set(s * SIDE.x, nozzleY, z);
      const body = new THREE.Mesh(bodyGeo, bagMat); body.castShadow = true;
      const top = new THREE.Mesh(twist, bagMat);
      const hard = new THREE.Mesh(hwGeo, m.brass);
      const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 1, 10), iceMat);
      stream.position.y = -0.6; stream.scale.y = 1.2;
      hang.add(body, top, hard, stream);
      live.add(hang);
      bags.push({ body, hang, stream, phase: i * 0.7 + (s > 0 ? 0.35 : 0) + rng.range(0, 0.2), x: s * SIDE.x });
    }
  });
  let reactT = 9;
  return {
    group: live, anchor: new THREE.Vector3(SIDE.x, nozzleY + 5, BAGS[1]),
    update(dt, t) {
      reactT += dt;
      const big = envelope(reactT, 0, 0.35, 1.6, 2.6);
      for (const b of bags) {
        // a squeeze every two seconds or so, travelling down the hall
        const ph = ((t * 0.45 + b.phase) % 1);
        const sq = Math.max(envelope(ph, 0.0, 0.18, 0.32, 0.55), big);
        b.body.scale.set(1 - 0.08 * sq, 1 - 0.03 * sq, 1 - 0.08 * sq);
        b.body.rotation.y += dt * 0.2 * sq;
        b.stream.scale.set(0.6 + 0.6 * sq + big * 0.8, 0.4 + 1.0 * sq, 0.6 + 0.6 * sq + big * 0.8);
        b.stream.position.y = -0.2 - 0.5 * sq;
        b.hang.position.x = b.x + Math.sin(t * 0.9 + b.phase * 5) * 0.35;
        b.hang.rotation.z = Math.sin(t * 0.7 + b.phase * 3) * 0.02;
      }
    },
    react() { reactT = 0; },
  };
}

// ---------------------------------------------------------------- Courtesans riding the side lines
export interface SideLines { update(beltDist: number): void }
export function buildSideLines(live: THREE.Group): SideLines {
  const spacing = 4.4, len = SIDE.z0 - SIDE.z1, per = Math.floor(len / spacing);
  const im = new THREE.InstancedMesh(courtesanGeometry(0), courtesanMaterial(), per * 2);
  im.castShadow = true; im.frustumCulled = false;
  live.add(im);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  return {
    update(d) {
      let n = 0;
      for (const s of [-1, 1]) for (let i = 0; i < per; i++) {
        const k = ((d + i * spacing) % len + len) % len;
        const z = SIDE.z0 - k;
        const edge = smoothstep(0, 3, k) * smoothstep(len, len - 3, k);
        p.set(s * SIDE.x, Y.belt + 0.02, z);
        q.setFromAxisAngle(up, i * 1.7 + s);
        sc.setScalar(2.6 * Math.max(0.001, edge));
        im.setMatrixAt(n++, mtx.compose(p, q, sc));
      }
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- ovens
export interface Ovens { update(dt: number, t: number): void; react(): void; puffAt: THREE.Vector3[]; anchor: THREE.Vector3; opened(): number }
export function buildOvens(statics: THREE.Group, live: THREE.Group): Ovens {
  const m = machineMats();
  const tilesMat = M('ovenTiles', () => new THREE.MeshLambertMaterial({ map: ovenTiles() }));
  const door = ovenDoor();
  const doorMat = new THREE.MeshLambertMaterial({ map: door.map, emissive: 0xffffff, emissiveMap: door.emissive, emissiveIntensity: 1.0, side: THREE.DoubleSide });
  const mouthMat = glow(0xff8a3a, 1.25);
  const cols = [-404.5, -414.5, -424.5, -434.5], rows = [F + 3.4, F + 10.4];
  const DW = 8.2, DH = 5.8;
  const doorGeo = new THREE.PlaneGeometry(DW, DH); doorGeo.translate(0, DH / 2, 0);
  const banks: THREE.InstancedMesh[] = [];
  const puffAt: THREE.Vector3[] = [];
  const mouths: THREE.BufferGeometry[] = [];
  const zc = (OVENS.z0 + OVENS.z1) / 2, zl = OVENS.z0 - OVENS.z1;
  for (const s of [-1, 1]) {
    const face = s * OVENS.x;
    // the masonry: green tiles round the doors, a cream cornice, a copper hood band, a brass name rail
    const depth = HALL.halfW - OVENS.x;
    const top = F + 19;
    statics.add(tiled(depth, 2.4, zl, tilesMat, 3, 3, s * (OVENS.x + depth / 2), F + 1.2, zc));
    statics.add(tiled(depth, top - (rows[1] + DH) , zl, tilesMat, 3, 3, s * (OVENS.x + depth / 2), (rows[1] + DH + top) / 2, zc));
    statics.add(tiled(depth, rows[1] - rows[0] - DH, zl, tilesMat, 3, 3, s * (OVENS.x + depth / 2), (rows[0] + DH + rows[1]) / 2, zc));
    for (let k = 0; k <= cols.length; k++) {
      const zA = k === 0 ? OVENS.z0 : cols[k - 1] - DW / 2, zB = k === cols.length ? OVENS.z1 : cols[k] + DW / 2;
      const w = zA - zB; if (w <= 0.01) continue;
      statics.add(tiled(depth, top - F, w, tilesMat, 3, 3, s * (OVENS.x + depth / 2), (F + top) / 2, (zA + zB) / 2));
    }
    statics.add(tiled(depth + 1.6, 2.2, zl + 1.6, m.cream, 4, 4, s * (OVENS.x + depth / 2 - 0.8), top + 1.1, zc));
    statics.add(tiled(depth + 0.8, 3.4, zl + 0.8, m.copper, 4, 4, s * (OVENS.x + depth / 2 - 0.4), top + 3.9, zc));
    statics.add(tiled(0.4, 0.5, zl, m.brass, 4, 4, face - s * 0.3, rows[0] - 0.9, zc));
    // the name over the bank
    const nameTex = (() => { const p = new Painter(1024, 128, 75); const g = p.g; g.fillStyle = '#d8b25a'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFont(g, "Mendl's Backstube", 'italic bold', SCRIPT, 900, 100); g.fillText("Mendl's Backstube", 512, 66); return p.texture({ wrap: false }); })();
    const name = mesh(new THREE.PlaneGeometry(26, 3.2), M(`ovenName${s}`, () => new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, alphaTest: 0.2 })), face - s * 0.82, top + 3.9, zc);
    name.rotation.y = -s * Math.PI / 2; statics.add(name);
    // doors: one instanced plane per bank, hinged at the bottom
    const im = new THREE.InstancedMesh(doorGeo, doorMat, cols.length * rows.length);
    im.frustumCulled = false;
    banks.push(im); live.add(im);
    for (const z of cols) for (const y of rows) {
      // the glowing mouth behind each door
      const mo = new THREE.PlaneGeometry(DW - 0.8, DH - 0.6); mo.rotateY(-s * Math.PI / 2); mo.translate(face + s * 0.7, y + DH / 2, z); mouths.push(mo);
      puffAt.push(new THREE.Vector3(face - s * 1.5, y + DH * 0.7, z));
    }
  }
  statics.add(new THREE.Mesh(mergeGeometries(mouths, false)!, mouthMat));
  const openT = new Array(16).fill(9);
  let seqT = 9, idleT = 2;
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const place = () => {
    banks.forEach((im, b) => {
      const s = b === 0 ? -1 : 1;
      let i = 0;
      for (const z of cols) for (const y of rows) {
        const idx = b * 8 + i;
        const t = openT[idx];
        const k = t < 0 ? 0 : t < 0.35 ? easeOutBack(t / 0.35, 2.2) : t < 2.3 ? 1 : t < 2.8 ? 1 - smoothstep(2.3, 2.8, t) : 0;
        p.set(s * (OVENS.x - 0.18), y, z);
        e.set(0, -s * Math.PI / 2, 0, 'YXZ');
        q.setFromEuler(e);
        // the door drops forward, outwards from the wall, about its bottom edge
        const drop = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), clamp(k, 0, 1.08) * 1.45);
        q.multiply(drop);
        im.setMatrixAt(i, mtx.compose(p, q, sc));
        i++;
      }
      im.instanceMatrix.needsUpdate = true;
    });
  };
  place();
  let opened = 0;
  return {
    puffAt, anchor: new THREE.Vector3(OVENS.x - 2, rows[1], zc),
    opened: () => opened,
    update(dt, t) {
      opened = 0;
      for (let i = 0; i < 16; i++) { const before = openT[i]; openT[i] += dt; if (before < 0 && openT[i] >= 0) opened |= 1 << i; }
      seqT += dt;
      // now and then a single door opens on its own (a tray coming out)
      idleT -= dt;
      if (idleT <= 0) { idleT = 4 + (Math.sin(t) + 1) * 2; const i = Math.floor((t * 7.3) % 16); if (openT[i] > 3) openT[i] = 0; opened |= 1 << i; }
      place();
    },
    react() {
      // every door in turn, top row then bottom, down both banks at once
      seqT = 0;
      for (let b = 0; b < 2; b++) for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) openT[b * 8 + c * 2 + r] = -(c * 0.22 + (1 - r) * 0.11) - 0.05;
    },
  };
}

// ---------------------------------------------------------------- racks of pastries
export function buildRacks(statics: THREE.Group, spots: Array<[number, number]>, rng: Rng) {
  const m = machineMats();
  const places: Array<[number, number, number, number, number]> = [];
  for (const [x, z] of spots) {
    const W = 5.2, D = 4.2, H = 15;
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) statics.add(tiled(0.3, H, 0.3, m.steel, 4, 4, x + dx * W / 2, F + H / 2 + 0.6, z + dz * D / 2));
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) statics.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 10).rotateX(Math.PI / 2), m.dark, x + dx * W / 2, F + 0.4, z + dz * D / 2));
    for (let k = 0; k < 6; k++) {
      const y = F + 1.8 + k * 2.3;
      statics.add(tiled(W + 0.4, 0.18, D + 0.2, m.steel, 4, 4, x, y, z));
      statics.add(tiled(W - 0.2, 0.12, D - 0.4, M('tray', () => charToon({ color: 0xf4ece0, rim: 0.2 })), 4, 4, x, y + 0.14, z));
      for (let j = 0; j < 3; j++) places.push([x + (j - 1) * 1.55, y + 0.2, z + rng.range(-0.5, 0.5), 1.05 + rng.range(-0.05, 0.05), rng.range(0, TAU)]);
    }
  }
  statics.add(courtesanCrowd(places));
}

// ---------------------------------------------------------------- the box-folding machine at the back
export interface Folder { update(dt: number, t: number): void }
export function buildFolder(statics: THREE.Group, live: THREE.Group): Folder {
  const m = machineMats();
  const z0 = HALL.back + 1, D = 7, zc = z0 - D / 2, W = 15, H = 15;
  const housing = M('folderPink', () => new THREE.MeshLambertMaterial({ map: (() => { const p = new Painter(128, 128, 77).fill(css(MC.pink)); p.g.strokeStyle = css(MC.pink, 0.8); p.g.lineWidth = 3; p.g.strokeRect(4, 4, 120, 120); p.g.fillStyle = css(MC.gold); for (const [x, y] of [[12, 12], [116, 12], [12, 116], [116, 116]]) { p.g.beginPath(); p.g.arc(x, y, 4, 0, TAU); p.g.fill(); } return p.texture({ repeat: [1, 1] }); })() }));
  // a block either side of the belt's mouth and a lintel over it
  const mouthW = 6.4, mouthH = 5;
  for (const s of [-1, 1]) statics.add(tiled((W - mouthW) / 2, H, D, housing, 3, 3, s * (mouthW / 2 + (W - mouthW) / 4), F + H / 2, zc));
  statics.add(tiled(mouthW, H - (Y.belt - F) - mouthH, D, housing, 3, 3, 0, Y.belt + mouthH + (H - (Y.belt - F) - mouthH) / 2, zc));
  statics.add(tiled(mouthW, Y.belt - F - 1.3, D, housing, 3, 3, 0, F + (Y.belt - F - 1.3) / 2, zc));
  statics.add(mesh(new THREE.PlaneGeometry(mouthW, mouthH), m.dark, 0, Y.belt + mouthH / 2, zc - 1));
  // a scalloped brass frame round the mouth, gauges and a nameplate on the face
  statics.add(tiled(mouthW + 1, 0.6, 0.6, m.brass, 4, 4, 0, Y.belt + mouthH + 0.3, z0 - D - 0.2));
  for (const s of [-1, 1]) statics.add(tiled(0.6, mouthH + 0.6, 0.6, m.brass, 4, 4, s * (mouthW / 2 + 0.3), Y.belt + mouthH / 2, z0 - D - 0.2));
  for (const x of [-5, -3.2, 3.2, 5]) { const g = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.4, 20), m.brass, x, Y.belt + 7.5, z0 - D - 0.1); g.rotation.x = Math.PI / 2; statics.add(g); const f = mesh(new THREE.CircleGeometry(0.6, 20), m.cream, x, Y.belt + 7.5, z0 - D - 0.32); f.rotation.y = Math.PI; statics.add(f); }
  const plate = mesh(new THREE.PlaneGeometry(7, 3.5), M('folderSign', () => new THREE.MeshLambertMaterial({ map: logoSign(512, 256), transparent: true, alphaTest: 0.3, emissive: 0x302020 })), 0, Y.belt + 10.5, z0 - D - 0.05);
  plate.rotation.y = Math.PI; statics.add(plate);
  statics.add(tiled(W + 0.8, 1, D + 0.8, m.cream, 4, 4, 0, F + H + 0.5, zc));
  // the roll of pink card on top, feeding a sheet down into the machine
  const roll = new THREE.Group(); roll.position.set(0, F + H + 4.6, zc + 0.5); live.add(roll);
  const cardRoll = mesh(new THREE.CylinderGeometry(3.4, 3.4, 11, 28), m.pink); cardRoll.rotation.z = Math.PI / 2; roll.add(cardRoll);
  for (const s of [-1, 1]) { const end = mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 16), m.brass, s * 5.8, 0, 0); end.rotation.z = Math.PI / 2; roll.add(end); }
  for (const s of [-1, 1]) statics.add(tiled(0.6, 5, 0.6, m.brass, 4, 4, s * 6.2, F + H + 2.5, zc + 0.5));
  const sheet = mesh(new THREE.PlaneGeometry(10, 5), M('sheet', () => charToon({ color: MC.pink, rim: 0.2, side: THREE.DoubleSide })), 0, F + H + 2.0, zc - 2.6);
  sheet.rotation.x = -0.5; statics.add(sheet);
  // two pistons that stamp the folds
  const pistons: THREE.Mesh[] = [];
  for (const s of [-1, 1]) { const pz = mesh(new THREE.CylinderGeometry(0.7, 0.7, 4, 14), m.steel, s * 4.6, F + H + 2, zc - 2); live.add(pz); pistons.push(pz); statics.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.2, 14), m.brass, s * 4.6, F + H + 0.6, zc - 2)); }
  return {
    update(_dt, t) {
      cardRoll.rotation.x = t * 0.6;
      pistons.forEach((p, i) => { p.position.y = F + H + 2.4 + Math.pow(Math.abs(Math.sin(t * 2.2 + i * Math.PI / 2)), 6) * -1.6; });
    },
  };
}

// ---------------------------------------------------------------- the tower of Courtesans
export interface Tower { group: THREE.Group; spinner: THREE.Group; update(dt: number, t: number): void; react(): void; centre: THREE.Vector3; top: number }
export function buildTower(statics: THREE.Group, live: THREE.Group): Tower {
  const m = machineMats();
  const x = TOWER.x, z = TOWER.z;
  // the cake stand: a silver foot and stem; the plate turns with the tower
  const stand = [[9.5, 0], [9.6, 0.5], [8.2, 1.1], [3.0, 2.0], [2.1, 3.5], [1.9, 6.0], [2.6, 7.2], [2.0, TOWER.standTop - F - 1.4], [0.01, TOWER.standTop - F - 1.4]].map(([r, y]) => new THREE.Vector2(r, y));
  statics.add(mesh(new THREE.LatheGeometry(stand.slice().reverse(), 40), m.silver, x, F, z));
  const spinner = new THREE.Group(); spinner.position.set(x, TOWER.standTop - 1.4, z); live.add(spinner);
  const plate = [[0.01, 0], [10.6, 0], [11.0, 0.9], [10.7, 1.4], [0.01, 1.4]].map(([r, y]) => new THREE.Vector2(r, y));
  const pl = mesh(new THREE.LatheGeometry(plate.slice().reverse(), 48), m.silver); pl.castShadow = true; spinner.add(pl);
  // a scalloped edge of beads round the plate
  const beads: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 64; i++) { const a = (i / 64) * TAU; beads.push(new THREE.SphereGeometry(0.34, 6, 4).translate(Math.cos(a) * 10.95, 0.95, Math.sin(a) * 10.95)); }
  spinner.add(new THREE.Mesh(mergeGeometries(beads, false)!, m.silver));
  const tower = courtesanTower({ baseR: TOWER.baseR, rings: TOWER.rings, each: 3.4, seed: 909 });
  tower.group.position.y = 1.4;
  spinner.add(tower.group);
  // a piping bag high above, dribbling icing onto the crown
  const bagY = TOWER.standTop + tower.top + 4;
  const bag = new THREE.Group(); bag.position.set(x, bagY, z); live.add(bag);
  const prof = [[0.9, 1.5], [2.0, 4], [3.2, 8], [3.6, 11], [2.8, 12.5], [1.2, 13.4]].map(([r, y]) => new THREE.Vector2(r, y));
  bag.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 24), M('bag0xfbf8f4', () => charToon({ map: bagTexture(0xfdfaf4), rim: 0.45, shade: 0xb8b0d0, emissive: new THREE.Color(0x1a1818) }))));
  bag.add(mesh(new THREE.CylinderGeometry(1.0, 0.28, 1.8, 8).translate(0, 0.9, 0), m.brass));
  bag.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, Y.hallTop + 40 - bagY, 4).translate(0, (Y.hallTop + 40 - bagY) / 2 + 13, 0), m.dark));
  const drip = mesh(new THREE.CylinderGeometry(0.28, 0.22, 1, 8), m.cream); bag.add(drip);
  let spin = 0.08, reactT = 9;
  const centre = new THREE.Vector3(x, TOWER.standTop + tower.top * 0.45, z);
  return {
    group: tower.group, spinner, centre, top: TOWER.standTop + tower.top,
    update(dt, t) {
      reactT += dt;
      const want = 0.08 + 1.5 * envelope(reactT, 0, 0.6, 2.4, 4.2);
      spin += (want - spin) * Math.min(1, dt * 3);
      spinner.rotation.y += spin * dt;
      // the bean pops up on a spring when the tower is called, then settles
      const pop = reactT < 2.6 ? Math.sin(Math.min(1, reactT / 0.35) * Math.PI / 2) * Math.exp(-Math.max(0, reactT - 0.35) * 2.2) : 0;
      tower.beanPivot.position.y = 0.995 * 3.4 * 2.2 + pop * 3.2;
      tower.beanPivot.rotation.y = reactT < 2.6 ? reactT * 9 : 0;
      const k = (t * 0.5) % 1;
      drip.scale.y = bagY - (TOWER.standTop + tower.top - 0.6);
      drip.position.y = -drip.scale.y / 2;
      drip.scale.x = drip.scale.z = 0.8 + 0.3 * Math.sin(k * TAU);
    },
    react() { reactT = 0; },
  };
}
