import * as THREE from 'three';
import { toon, lambert, glow, box, cyl, cone, mesh, sphere, roofGeometry, textTexture, canvasTexture, instanced, instancedTrees, ribbonGeometry, type Placement } from '../../engine/Builders';
import { Rng, TAU, clamp, lerp } from '../../engine/math';

/** A road sample: position, ride progress and the unit "right" vector across the road. */
export interface RoadSample { x: number; y: number; z: number; u: number; rx: number; rz: number; }
export type RoadAt = (z: number) => RoadSample;
export type HeightAt = (x: number, z: number) => number;

const toonE = (color: number, k = 0.15, opts: Partial<THREE.MeshToonMaterialParameters> = {}) => toon(color, { emissive: new THREE.Color(color).multiplyScalar(k), ...opts });
const yawTo = (dx: number, dz: number) => Math.atan2(dx, dz);

/** Builds a lookup from z to the road, valid because the road is monotonic in z. */
export function makeRoadLookup(curve: THREE.Curve<THREE.Vector3>, samples = 2400): RoadAt {
  const pts: RoadSample[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const r = new THREE.Vector3().crossVectors(t, up).normalize();
    pts.push({ x: p.x, y: p.y, z: p.z, u, rx: r.x, rz: r.z });
  }
  return (z: number) => {
    let lo = 0, hi = pts.length - 1;
    if (z >= pts[0].z) return pts[0];
    if (z <= pts[hi].z) return pts[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].z >= z) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi];
    const k = a.z === b.z ? 0 : (a.z - z) / (a.z - b.z);
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z, u: lerp(a.u, b.u, k), rx: lerp(a.rx, b.rx, k), rz: lerp(a.rz, b.rz, k) };
  };
}

/** A curve running parallel to the road at a lateral offset (positive = right). */
export function offsetCurve(curve: THREE.Curve<THREE.Vector3>, lat: number, segs: number, yOff = 0) {
  const up = new THREE.Vector3(0, 1, 0);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const r = new THREE.Vector3().crossVectors(t, up).normalize();
    pts.push(p.addScaledVector(r, lat).add(new THREE.Vector3(0, yOff, 0)));
  }
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  c.arcLengthDivisions = segs * 2;
  return c;
}

/** Vertical strip along a curve between two heights relative to the curve (quay walls, kerb faces). */
export function wallGeometry(curve: THREE.Curve<THREE.Vector3>, yBottom: number, yTop: number, segs: number, flip = false) {
  const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u);
    verts.push(p.x, p.y + yBottom, p.z, p.x, p.y + yTop, p.z);
    uvs.push(u * segs * 0.25, 0, u * segs * 0.25, 1);
    if (i < segs) { const k = i * 2; if (flip) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- textures ----------
export function cobbleTexture(rng: Rng) {
  return canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#3a3d40'; c.fillRect(0, 0, w, h);
    const cols = 12, rows = 14, cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
      const off = r % 2 ? cw / 2 : 0;
      const x = i * cw + off, y = r * ch;
      const l = rng.range(0.34, 0.5), hue = rng.range(190, 230), sat = rng.range(4, 12);
      c.fillStyle = `hsl(${hue},${sat}%,${l * 100}%)`;
      c.beginPath(); c.roundRect(x + 1.5, y + 1.5, cw - 3, ch - 3, 4); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); c.roundRect(x + 2.5, y + 2.5, cw - 5, ch * 0.35, 3); c.fill();
    }
    // a little grime and shine
    for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(${rng.chance(0.5) ? '0,0,0' : '200,220,200'},${rng.range(0.03, 0.09)})`; c.fillRect(rng.range(0, w), rng.range(0, h), rng.range(4, 30), rng.range(4, 30)); }
  }, [1, 1]);
}
export function pavingTexture(rng: Rng) {
  return canvasTexture(128, 128, (c, w, h) => {
    c.fillStyle = '#6a6c6a'; c.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) {
      c.fillStyle = `hsl(${rng.range(80, 110)},${rng.range(3, 8)}%,${rng.range(46, 56)}%)`;
      c.fillRect(i * s + 1, r * s + 1, s - 2, s - 2);
    }
  }, [1, 1]);
}
export function wickerTexture() {
  return canvasTexture(64, 64, (c, w, h) => {
    c.fillStyle = '#b8894a'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { c.fillStyle = ((x + y) / 8) % 2 ? '#d2a866' : '#8e6a36'; c.fillRect(x, y, 8, 8); c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x, y + 6, 8, 2); }
  }, [3, 2]);
}

/** Haussmann façade: cream stone, tall windows, iron balconies on the 2nd and 5th floors, shopfront or door at street level. */
export function parisFacade(rng: Rng, o: { wall: string; floors: number; cols: number; lit: number; shop?: boolean; awning?: string; balconies?: number[] }) {
  const W = 256, H = 64 * Math.max(4, o.floors + 1);
  const floors = o.floors, cols = o.cols;
  const fh = H / (floors + 1), cw = W / cols;
  const litMask: boolean[] = [];
  for (let i = 0; i < floors * cols; i++) litMask.push(rng.next() < o.lit);
  const balconies = o.balconies ?? [1, 4];
  const draw = (emissive: boolean) => canvasTexture(W, H, (g) => {
    g.fillStyle = emissive ? '#000' : o.wall; g.fillRect(0, 0, W, H);
    if (!emissive) {
      for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${rng.range(0.015, 0.05)})`; g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(2, 14), rng.range(2, 10)); }
      // floor lines
      for (let f = 1; f <= floors; f++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, H - f * fh - 1, W, 2); }
    }
    for (let f = 0; f < floors; f++) {
      const yTop = H - (f + 2) * fh; // canvas y of this floor's top (floor 0 is just above the ground floor)
      for (let c = 0; c < cols; c++) {
        const isLit = litMask[f * cols + c];
        const x = c * cw + cw * 0.28, y = yTop + fh * 0.18, w = cw * 0.44, h = fh * 0.62;
        if (emissive) { if (isLit) { g.fillStyle = rng.chance(0.8) ? '#ffd58a' : '#ffe9b8'; g.fillRect(x, y, w, h); } continue; }
        g.fillStyle = '#efe6d2'; g.fillRect(x - 3, y - 3, w + 6, h + 5);
        g.fillStyle = isLit ? '#ffcf7a' : '#2b3340'; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, y, w, h * 0.35);
        g.fillStyle = '#e6dcc4'; g.fillRect(x + w / 2 - 1, y, 2, h);
        if (isLit && rng.chance(0.4)) { g.fillStyle = 'rgba(180,60,60,0.35)'; g.fillRect(x, y, w * 0.4, h); }
        if (rng.chance(0.3)) { g.fillStyle = '#8fa39a'; g.fillRect(x - w * 0.36, y, w * 0.3, h); g.fillRect(x + w * 1.06, y, w * 0.3, h); }
      }
      if (!emissive && balconies.includes(f)) {
        const y = yTop + fh * 0.8;
        g.fillStyle = '#2a2d2a'; g.fillRect(0, y, W, 2.5);
        for (let x = 4; x < W; x += 7) g.fillRect(x, y - fh * 0.3, 1.6, fh * 0.3);
        g.fillRect(0, y - fh * 0.3, W, 1.5);
      } else if (!emissive) {
        // small individual balconies
        for (let c = 0; c < cols; c++) { const x = c * cw + cw * 0.22; g.fillStyle = '#2a2d2a'; g.fillRect(x, yTop + fh * 0.8, cw * 0.56, 2); for (let k = 0; k < 6; k++) g.fillRect(x + k * cw * 0.11, yTop + fh * 0.62, 1.4, fh * 0.18); }
      }
    }
    // ground floor
    const gy = H - fh;
    if (o.shop) {
      const glass = emissive ? '#ffd9a0' : '#ffd08a';
      g.fillStyle = emissive ? '#000' : (o.awning ?? '#7a1f1f'); g.fillRect(0, gy, W, fh);
      g.fillStyle = glass; g.fillRect(W * 0.06, gy + fh * 0.25, W * 0.36, fh * 0.6); g.fillRect(W * 0.58, gy + fh * 0.25, W * 0.36, fh * 0.6);
      if (!emissive) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(W * 0.06, gy + fh * 0.25, W * 0.36, fh * 0.2); g.fillRect(W * 0.58, gy + fh * 0.25, W * 0.36, fh * 0.2); g.fillStyle = '#3a2a20'; g.fillRect(W * 0.45, gy + fh * 0.3, W * 0.1, fh * 0.7); }
    } else {
      if (!emissive) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, gy, W, fh); g.fillStyle = '#3a3230'; g.fillRect(W * 0.42, gy + fh * 0.22, W * 0.16, fh * 0.78); g.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < 6; k++) g.fillRect(0, gy + k * fh / 6, W, 1.5); }
      for (const cx of [0.14, 0.78]) {
        const lit = rng.chance(0.5);
        if (emissive) { if (lit) { g.fillStyle = '#ffd58a'; g.fillRect(W * cx, gy + fh * 0.25, W * 0.12, fh * 0.55); } }
        else { g.fillStyle = lit ? '#ffcf7a' : '#2b3340'; g.fillRect(W * cx, gy + fh * 0.25, W * 0.12, fh * 0.55); }
      }
    }
  });
  return { map: draw(false), emissiveMap: draw(true) };
}

/** Frustum with a rectangular base for zinc mansard roofs. */
export function mansardGeometry(w: number, d: number, h: number, inset: number) {
  const hw = w / 2, hd = d / 2, iw = Math.max(0.3, hw - inset), id = Math.max(0.3, hd - inset);
  const b = [[-hw, 0, hd], [hw, 0, hd], [hw, 0, -hd], [-hw, 0, -hd]];
  const t = [[-iw, h, id], [iw, h, id], [iw, h, -id], [-iw, h, -id]];
  const v: number[] = [];
  const quad = (a: number[], b2: number[], c: number[], d2: number[]) => { v.push(...a, ...b2, ...c, ...a, ...c, ...d2); };
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(b[i], b[j], t[j], t[i]); }
  quad(t[0], t[1], t[2], t[3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- the road ----------
export function buildRoad(curve: THREE.Curve<THREE.Vector3>, rng: Rng) {
  const g = new THREE.Group();
  const len = curve.getLength();
  const segs = Math.ceil(len / 2.5);
  const cobble = cobbleTexture(rng);
  const road = new THREE.Mesh(ribbonGeometry(curve, 7.4, segs, 0.03, len / 7.4), new THREE.MeshLambertMaterial({ map: cobble }));
  road.receiveShadow = true;
  g.add(road);
  const paving = pavingTexture(rng);
  const pavMat = new THREE.MeshLambertMaterial({ map: paving });
  const kerbMat = lambert(0x9a9c96);
  const kerbSide = lambert(0x7d7f7a, { side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const kerb = offsetCurve(curve, s * 3.95, Math.ceil(segs / 2));
    g.add(new THREE.Mesh(ribbonGeometry(kerb, 0.5, Math.ceil(segs / 2), 0.16), kerbMat));
    const face = offsetCurve(curve, s * 3.7, Math.ceil(segs / 2));
    g.add(new THREE.Mesh(wallGeometry(face, 0.02, 0.16, Math.ceil(segs / 2), s > 0), kerbSide));
    const pav = offsetCurve(curve, s * 5.7, Math.ceil(segs / 2));
    const pm = new THREE.Mesh(ribbonGeometry(pav, 3.0, Math.ceil(segs / 2), 0.15, len / 3), pavMat);
    pm.receiveShadow = true;
    g.add(pm);
  }
  return g;
}

// ---------- street lamps ----------
/** Paris lamp posts: instanced posts, glowing lanterns and caps. */
export function buildLamps(placements: Placement[]) {
  const g = new THREE.Group();
  if (!placements.length) return { group: g, lanternMat: new THREE.MeshBasicMaterial() };
  const post = new THREE.CylinderGeometry(0.07, 0.11, 4.4, 8); post.translate(0, 2.2, 0);
  const foot = new THREE.CylinderGeometry(0.16, 0.22, 0.5, 8); foot.translate(0, 0.25, 0);
  const lantern = new THREE.BoxGeometry(0.42, 0.55, 0.42); lantern.translate(0, 4.6, 0);
  const cap = new THREE.ConeGeometry(0.4, 0.32, 4); cap.translate(0, 5.03, 0); cap.rotateY(Math.PI / 4);
  const ironMat = toonE(0x2f3a34, 0.08);
  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd28a).multiplyScalar(1.3) });
  g.add(instanced(post, ironMat, placements), instanced(foot, ironMat, placements), instanced(lantern, lanternMat, placements), instanced(cap, ironMat, placements));
  return { group: g, lanternMat };
}

// ---------- Haussmann rows ----------
export interface RowSpec { zFrom: number; zTo: number; side: number; lat: number; floors?: [number, number]; skip?: Array<[number, number]>; shops?: number; walls?: number[]; }
export function buildHaussmannRows(rng: Rng, heightAt: HeightAt, roadAt: RoadAt, rows: RowSpec[]) {
  const g = new THREE.Group();
  const facades = [
    parisFacade(rng, { wall: '#efe4cc', floors: 5, cols: 4, lit: 0.55 }),
    parisFacade(rng, { wall: '#f1e8d6', floors: 6, cols: 5, lit: 0.5 }),
    parisFacade(rng, { wall: '#e9dcc2', floors: 5, cols: 3, lit: 0.6, shop: true, awning: '#7a1f1f' }),
    parisFacade(rng, { wall: '#f3ecdc', floors: 6, cols: 4, lit: 0.45, shop: true, awning: '#2f5d3f' }),
    parisFacade(rng, { wall: '#ead9c0', floors: 5, cols: 4, lit: 0.6, shop: true, awning: '#3b5f9c' }),
    parisFacade(rng, { wall: '#efe4cc', floors: 7, cols: 5, lit: 0.5 }),
  ];
  const facadeFloors = [5, 6, 5, 6, 5, 7];
  const sideTex = parisFacade(rng, { wall: '#e6dac4', floors: 6, cols: 3, lit: 0.3 });
  const zinc = toonE(0x6f7d84, 0.1), zincDark = toonE(0x5a666c, 0.08), pot = toonE(0xb4694a, 0.1), stack = toonE(0xd8c8a8, 0.1);
  const chimneys: Placement[] = [], pots: Placement[] = [];
  const shopNames = ['BOULANGERIE', 'TABAC', 'FROMAGERIE', 'PHARMACIE', 'BOUCHERIE', 'LIBRAIRIE', 'FLEURISTE', 'PÂTISSERIE', 'BAR', 'ÉPICERIE'];
  const signMats = shopNames.map((n) => new THREE.MeshBasicMaterial({ map: textTexture(n, { font: 'bold 40px serif', color: '#f6e2a8', bg: '#2a1a14', w: 512, h: 64 }) }));
  const awningMats = [0x7a1f1f, 0x2f5d3f, 0x3b5f9c, 0x8a5a2a].map((c) => toonE(c, 0.2, { side: THREE.DoubleSide }));
  const building = (cx: number, cz: number, w: number, d: number, floors: number, yaw: number, wallTint: number, shop: boolean) => {
    const b = new THREE.Group();
    const fi = shop ? rng.pick([2, 3, 4]) : rng.pick([0, 1, 5]);
    const f = facades[fi];
    const h = (floors + 1) * 3.1;
    const front = new THREE.MeshLambertMaterial({ color: wallTint, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.85 });
    const side = new THREE.MeshLambertMaterial({ color: wallTint, map: sideTex.map, emissive: 0xffffff, emissiveMap: sideTex.emissiveMap, emissiveIntensity: 0.6 });
    const plain = lambert(wallTint);
    void facadeFloors;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h + 2, d), [side, side, plain, plain, front, plain]);
    body.position.set(0, h / 2 - 1, 0);
    body.castShadow = true;
    b.add(body);
    // stone base band and cornice
    b.add(box(w + 0.16, 0.5, d + 0.16, toonE(0xd9ccb2, 0.05), 0, h - 0.2, 0));
    // mansard with a flat top
    const mans = mesh(mansardGeometry(w + 0.3, d + 0.3, 3.4, 1.4), zinc, 0, h, 0);
    mans.castShadow = true;
    b.add(mans);
    b.add(box(w - 2.6, 0.3, d - 2.6, zincDark, 0, h + 3.4, 0));
    // dormers
    const nd = Math.max(1, Math.floor(w / 4));
    for (let i = 0; i < nd; i++) {
      const x = -w / 2 + (i + 0.5) * (w / nd);
      b.add(box(1.1, 1.2, 1.4, toonE(0x8a949a, 0.1), x, h + 1.1, d / 2 - 0.6));
      b.add(box(0.7, 0.8, 0.1, glow(0xffd58a, rng.chance(0.5) ? 0.9 : 0.15), x, h + 1.1, d / 2 + 0.12));
    }
    // chimneys (instanced later, so record world placements)
    const nc = rng.int(1, 3);
    for (let i = 0; i < nc; i++) {
      const lx = rng.range(-w / 2 + 2, w / 2 - 2), lz = rng.range(-d / 2 + 2, d / 2 - 2);
      const wx = cx + Math.cos(yaw) * lx + Math.sin(yaw) * lz, wz = cz - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
      const y = heightAt(cx, cz) - 0.3 + h + 3.5;
      chimneys.push({ x: wx, y, z: wz, scale: 1, rot: yaw });
      for (let k = 0; k < 3; k++) pots.push({ x: wx + Math.cos(yaw) * (k - 1) * 0.32, y: y + 1.2, z: wz - Math.sin(yaw) * (k - 1) * 0.32, scale: 1, rot: 0 });
    }
    if (shop) {
      // awning and a sign over the ground floor
      const aw = mesh(new THREE.PlaneGeometry(w * 0.9, 1.8), rng.pick(awningMats), 0, 3.0, d / 2 + 0.9);
      aw.rotation.x = -Math.PI / 2 + 0.28; b.add(aw);
      b.add(mesh(new THREE.PlaneGeometry(w * 0.7, 0.75), rng.pick(signMats), 0, 3.55, d / 2 + 0.06));
    }
    b.position.set(cx, heightAt(cx, cz) - 0.3, cz);
    b.rotation.y = yaw;
    g.add(b);
  };
  for (const row of rows) {
    let z = row.zFrom;
    let count = 0;
    const walls = row.walls ?? [0xf2e8d4, 0xece0c6, 0xf6efe0, 0xe8dcc8, 0xf0e6cc];
    while (z > row.zTo) {
      const w = rng.range(9, 15);
      const zc = z - w / 2;
      if (row.skip?.some(([a, b]) => zc < a && zc > b)) { z -= w; continue; }
      const p = roadAt(zc);
      const d = rng.range(11, 16);
      const off = row.side * (row.lat + d / 2);
      const cx = p.x + p.rx * off, cz = p.z + p.rz * off;
      const yaw = yawTo(-p.rx * row.side, -p.rz * row.side);
      const [fmin, fmax] = row.floors ?? [4, 6];
      building(cx, cz, w, d, rng.int(fmin, fmax), yaw, rng.pick(walls), rng.chance(row.shops ?? 0.4));
      z -= w + 0.15;
      count++;
      if (count % rng.int(4, 7) === 0) z -= rng.range(5, 8); // a side street
    }
  }
  const stackGeo = new THREE.BoxGeometry(1.2, 1.4, 0.6); stackGeo.translate(0, 0.7, 0);
  const potGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.6, 6); potGeo.translate(0, 0.3, 0);
  if (chimneys.length) { g.add(instanced(stackGeo, stack, chimneys)); g.add(instanced(potGeo, pot, pots)); }
  return g;
}

// ---------- Montmartre houses ----------
export function buildMontmartre(rng: Rng, heightAt: HeightAt, roadAt: RoadAt, avoid: (x: number, z: number) => boolean) {
  const g = new THREE.Group();
  const walls = [0xf4ead6, 0xf2dcc0, 0xe8c9b8, 0xf7f1e4, 0xead9a8, 0xd8dcd0];
  const roofs = [0x6f7d84, 0xa0563a, 0x8a4a3a, 0x6f7d84, 0x5a6a70];
  const facades = [
    parisFacade(rng, { wall: '#ffffff', floors: 2, cols: 2, lit: 0.55, balconies: [1] }),
    parisFacade(rng, { wall: '#ffffff', floors: 3, cols: 3, lit: 0.5, balconies: [2] }),
    parisFacade(rng, { wall: '#ffffff', floors: 2, cols: 3, lit: 0.6, balconies: [] }),
  ];
  const sideTex = parisFacade(rng, { wall: '#ffffff', floors: 3, cols: 2, lit: 0.35, balconies: [] });
  const chimneys: Placement[] = [];
  const spots: { x: number; z: number; r: number }[] = [];
  const house = (cx: number, cz: number, yaw: number) => {
    const w = rng.range(6, 10), d = rng.range(6, 9), floors = rng.int(2, 3);
    const h = (floors + 1) * 2.9;
    const fi = rng.int(0, facades.length - 1);
    const f = facades[fi];
    const tint = rng.pick(walls);
    const front = new THREE.MeshLambertMaterial({ color: tint, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.85 });
    const side = new THREE.MeshLambertMaterial({ color: tint, map: sideTex.map, emissive: 0xffffff, emissiveMap: sideTex.emissiveMap, emissiveIntensity: 0.6 });
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h + 2.5, d), [side, side, lambert(tint), lambert(tint), front, side]);
    body.position.y = h / 2 - 1.25; body.castShadow = true; b.add(body);
    const roofC = rng.pick(roofs);
    if (rng.chance(0.55)) { const r = mesh(roofGeometry(w, d, Math.min(w, d) * 0.42, 0.45), toonE(roofC, 0.08), 0, h, 0); r.castShadow = true; b.add(r); }
    else { b.add(mesh(mansardGeometry(w + 0.3, d + 0.3, 2.4, 1.2), toonE(roofC, 0.08), 0, h, 0)); b.add(box(w - 2.2, 0.25, d - 2.2, toonE(0x4a5458, 0.05), 0, h + 2.4, 0)); }
    // shutters / window boxes, a chimney
    if (rng.chance(0.7)) chimneys.push({ x: cx + Math.cos(yaw) * rng.range(-w / 3, w / 3), y: heightAt(cx, cz) - 0.3 + h + (rng.chance(0.5) ? 2.6 : 2.2), z: cz - Math.sin(yaw) * rng.range(-w / 3, w / 3), scale: 1, rot: yaw });
    if (rng.chance(0.5)) { const wb = box(1.4, 0.3, 0.3, toonE(0x6a3a2a, 0.1), rng.range(-w / 3, w / 3), 4.4, d / 2 + 0.15); b.add(wb); wb.add(box(1.3, 0.25, 0.25, toonE(rng.pick([0xe63b6a, 0xf4a020, 0xffffff, 0xd94a6a]), 0.35), 0, 0.25, 0)); }
    b.position.set(cx, heightAt(cx, cz) - 0.3, cz);
    b.rotation.y = yaw;
    g.add(b);
    spots.push({ x: cx, z: cz, r: Math.max(w, d) * 0.7 });
  };
  // houses lining the lane on both sides with gaps
  for (const side of [-1, 1]) {
    let z = -470;
    while (z > -1085) {
      const w = rng.range(6, 10);
      const zc = z - w / 2;
      const p = roadAt(zc);
      const lat = side * (8.6 + rng.range(0, 3) + 4);
      const cx = p.x + p.rx * lat, cz = p.z + p.rz * lat;
      if (!avoid(cx, cz)) house(cx, cz, yawTo(-p.rx * side, -p.rz * side));
      z -= w + rng.range(0.5, 6);
    }
  }
  // scattered houses down the slopes
  let tries = 0, placed = 0;
  while (placed < 70 && tries < 1500) {
    tries++;
    const z = rng.range(-1070, -480);
    const p = roadAt(z);
    const lat = rng.sign() * rng.range(22, 85);
    const cx = p.x + p.rx * lat, cz = p.z + p.rz * lat;
    if (avoid(cx, cz)) continue;
    if (spots.some((s) => Math.hypot(s.x - cx, s.z - cz) < s.r + 7)) continue;
    house(cx, cz, rng.range(0, TAU));
    placed++;
  }
  // low garden walls and steps along the lane
  const wallMat = toonE(0xcfc4ac, 0.05);
  for (let z = -480; z > -1080; z -= 4) {
    const p = roadAt(z);
    for (const side of [-1, 1]) {
      if (rng.chance(0.35)) continue;
      const lat = side * 7.6;
      const x = p.x + p.rx * lat, zz = p.z + p.rz * lat;
      if (avoid(x, zz)) continue;
      const w = box(0.5, 1.0, 3.6, wallMat, x, heightAt(x, zz) + 0.4, zz);
      w.rotation.y = yawTo(-p.rz, p.rx);
      g.add(w);
    }
  }
  const stackGeo = new THREE.BoxGeometry(0.8, 1.3, 0.5); stackGeo.translate(0, 0.65, 0);
  if (chimneys.length) g.add(instanced(stackGeo, toonE(0xc9b898, 0.08), chimneys));
  return g;
}

// ---------- the Café des 2 Moulins ----------
export function buildCafe(rng: Rng) {
  const g = new THREE.Group();
  const w = 15, d = 13, h = 19;
  const f = parisFacade(rng, { wall: '#f1e6cf', floors: 5, cols: 4, lit: 0.7 });
  const sideF = parisFacade(rng, { wall: '#eadfc8', floors: 5, cols: 3, lit: 0.5 });
  const front = new THREE.MeshLambertMaterial({ color: 0xf1e6cf, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.9 });
  const side = new THREE.MeshLambertMaterial({ color: 0xeadfc8, map: sideF.map, emissive: 0xffffff, emissiveMap: sideF.emissiveMap, emissiveIntensity: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h + 2, d), [side, side, lambert(0xeadfc8), lambert(0xeadfc8), front, side]);
  body.position.y = h / 2 - 1; body.castShadow = true; g.add(body);
  g.add(mesh(mansardGeometry(w + 0.3, d + 0.3, 3.4, 1.4), toonE(0x6f7d84, 0.1), 0, h, 0));
  g.add(box(w - 2.6, 0.3, d - 2.6, toonE(0x5a666c, 0.08), 0, h + 3.4, 0));
  // the café ground floor wraps the corner: dark red panelling with big warm windows
  const red = toonE(0x8a2420, 0.25), gold = glow(0xffe0a0, 1.15);
  const groundFront = box(w + 0.4, 3.6, 0.5, red, 0, 1.8, d / 2 + 0.05);
  g.add(groundFront);
  const windows: THREE.Mesh[] = [];
  for (const x of [-5.2, -1.9, 3.2, 5.9]) { const win = box(2.4, 2.3, 0.2, gold, x, 1.95, d / 2 + 0.32); g.add(win); windows.push(win); }
  g.add(box(1.4, 2.8, 0.2, toonE(0x3a2a24, 0.1), 0.7, 1.4, d / 2 + 0.32)); // door
  g.add(box(1.2, 1.2, 0.1, gold, 0.7, 2.2, d / 2 + 0.36));
  const groundSide = box(0.5, 3.6, d + 0.4, red, -w / 2 - 0.05, 1.8, 0);
  g.add(groundSide);
  for (const z of [-3.5, 0, 3.5]) g.add(box(0.2, 2.3, 2.4, gold, -w / 2 - 0.32, 1.95, z));
  // red awning with the name in gold above it
  const awn = mesh(new THREE.PlaneGeometry(w + 0.2, 2.2), toonE(0xb3262a, 0.28, { side: THREE.DoubleSide }), 0, 3.5, d / 2 + 1.1);
  awn.rotation.x = -Math.PI / 2 + 0.3; g.add(awn);
  const awnS = mesh(new THREE.PlaneGeometry(d + 0.2, 2.2), toonE(0xb3262a, 0.28, { side: THREE.DoubleSide }), -w / 2 - 1.1, 3.5, 0);
  awnS.rotation.set(-Math.PI / 2 + 0.3, 0, 0); awnS.rotation.y = -Math.PI / 2; awnS.rotation.order = 'YXZ'; g.add(awnS);
  const nameTex = textTexture('CAFÉ DES 2 MOULINS', { font: 'bold 54px serif', color: '#f3c76a', bg: '#4a1410', w: 1024, h: 96, stroke: '#7a5a20' });
  g.add(mesh(new THREE.PlaneGeometry(12, 1.15), new THREE.MeshBasicMaterial({ map: nameTex }), 0, 4.55, d / 2 + 0.32));
  g.add(mesh(new THREE.PlaneGeometry(10, 1.0), new THREE.MeshBasicMaterial({ map: nameTex }), -w / 2 - 0.32, 4.55, 0).rotateY(-Math.PI / 2));
  // two little windmills painted on a board by the door (the café's sign)
  g.add(mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ map: textTexture('✳', { font: 'bold 80px serif', color: '#f3c76a', bg: '#7a1f1f', w: 128, h: 128 }) }), -4.5, 5.8, d / 2 + 0.34));
  // tables and chairs on the pavement
  const tableMat = toonE(0x3a3a3a, 0.08), seatMat = toonE(0x8a3a2a, 0.2);
  for (let i = 0; i < 5; i++) {
    const x = -5.5 + i * 2.6;
    const t = new THREE.Group();
    t.add(cyl(0.45, 0.45, 0.05, toonE(0xe9e2d2, 0.15), 0, 0.72, 0, 12), cyl(0.03, 0.03, 0.7, tableMat, 0, 0.36, 0, 6), cyl(0.25, 0.28, 0.04, tableMat, 0, 0.02, 0, 10));
    for (const s of [-1, 1]) {
      const c = new THREE.Group();
      c.add(box(0.42, 0.05, 0.42, seatMat, 0, 0.45, 0), box(0.42, 0.42, 0.05, seatMat, 0, 0.68, -0.2));
      for (const lx of [-0.17, 0.17]) for (const lz of [-0.17, 0.17]) c.add(cyl(0.015, 0.015, 0.45, tableMat, lx, 0.22, lz, 5));
      c.position.set(s * 0.75, 0, 0.1); c.rotation.y = s * Math.PI / 2;
      t.add(c);
    }
    t.position.set(x, 0.55, d / 2 + 2.2);
    g.add(t);
  }
  // planters at the corners
  for (const x of [-7.2, 7.2]) { g.add(box(0.7, 0.7, 0.7, toonE(0x2f5d3f, 0.15), x, 0.9, d / 2 + 1.4)); g.add(sphere(0.55, toonE(0x3f7a3f, 0.18), x, 1.6, d / 2 + 1.4, 10, 8)); }
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return { group: g, windows, depth: d, width: w };
}

// ---------- the Moulin Rouge ----------
export function buildMoulinRouge(rng: Rng) {
  const g = new THREE.Group();
  const red = toonE(0xc0262a, 0.28), darkRed = toonE(0x7a1a1c, 0.2);
  const f = parisFacade(rng, { wall: '#c8302e', floors: 3, cols: 5, lit: 0.8, shop: true, awning: '#5a0e10' });
  const front = new THREE.MeshLambertMaterial({ color: 0xffffff, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(18, 13, 14), [darkRed, darkRed, darkRed, darkRed, front, darkRed]);
  body.position.y = 6.5; g.add(body);
  g.add(box(18.4, 0.6, 14.4, red, 0, 13.2, 0));
  // windmill tower
  g.add(cyl(2.6, 3.4, 12, red, 0, 19, 2, 12));
  g.add(cone(3.0, 2.2, darkRed, 0, 26.1, 2, 12));
  const hub = new THREE.Group(); hub.position.set(0, 21.5, 5.0); g.add(hub);
  hub.add(cyl(0.5, 0.5, 1.0, darkRed, 0, 0, 0, 10).rotateX(Math.PI / 2));
  const sails = new THREE.Group(); hub.add(sails);
  const sailMat = toonE(0xd9342a, 0.3);
  const lattice = toonE(0xf4e0c0, 0.3);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const arm = new THREE.Group(); arm.rotation.z = a; sails.add(arm);
    arm.add(box(0.28, 8.5, 0.18, sailMat, 0, 4.25, 0));
    arm.add(box(1.6, 6.2, 0.08, lattice, 0.75, 5.2, 0.05));
    for (let k = 0; k < 5; k++) arm.add(box(1.7, 0.08, 0.12, sailMat, 0.75, 2.4 + k * 1.4, 0.1));
  }
  // glowing red lettering across the front
  const nameTex = textTexture('MOULIN ROUGE', { font: 'bold 72px serif', color: '#ff5a4a', bg: '#2a0808', w: 1024, h: 128, stroke: '#ffd0a0' });
  g.add(mesh(new THREE.PlaneGeometry(15, 1.9), new THREE.MeshBasicMaterial({ map: nameTex }), 0, 10.6, 7.15));
  // marquee bulbs along the roofline
  const bulbs: Placement[] = [];
  for (let i = 0; i < 22; i++) bulbs.push({ x: -8.4 + i * 0.8, y: 13.7, z: 7.2, scale: 1, rot: 0 });
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; bulbs.push({ x: Math.cos(a) * 3.4, y: 13.0, z: 2 + Math.sin(a) * 3.4, scale: 1, rot: 0 }); }
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a50).multiplyScalar(1.5) });
  g.add(instanced(new THREE.SphereGeometry(0.16, 6, 5), bulbMat, bulbs));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return { group: g, sails, bulbMat };
}

// ---------- small street furniture ----------
export function buildPhotobooth() {
  const g = new THREE.Group();
  const cream = toonE(0xe9e1cf, 0.15), blue = toonE(0x3b5f9c, 0.2);
  g.add(box(1.7, 2.5, 1.7, cream, 0, 1.25, 0));
  g.add(box(1.74, 0.5, 1.74, blue, 0, 2.35, 0));
  g.add(box(0.06, 2.1, 0.7, toonE(0xd9532a, 0.3), 0.86, 1.05, 0.45)); // curtain
  g.add(box(0.7, 1.4, 0.06, glow(0xfff0c8, 1.2), -0.35, 1.3, 0.86)); // lit window
  const sign = textTexture('PHOTOMATON', { font: 'bold 44px sans-serif', color: '#fff3d0', bg: '#2a4a8a', w: 512, h: 80 });
  g.add(mesh(new THREE.PlaneGeometry(1.6, 0.34), new THREE.MeshBasicMaterial({ map: sign }), 0, 2.38, 0.88));
  g.add(box(1.8, 0.12, 1.8, glow(0xffd58a, 1.0), 0, 2.62, 0));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return g;
}
export function buildPhoneBox() {
  const g = new THREE.Group();
  const frame = toonE(0x6f7d84, 0.1);
  const glass = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.35 });
  g.add(box(1.1, 0.12, 1.1, frame, 0, 0.06, 0));
  for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) g.add(box(0.08, 2.4, 0.08, frame, x, 1.2, z));
  g.add(box(1.16, 0.25, 1.16, frame, 0, 2.45, 0));
  g.add(box(1.0, 2.2, 0.02, glass, 0, 1.25, 0.5), box(1.0, 2.2, 0.02, glass, 0, 1.25, -0.5), box(0.02, 2.2, 1.0, glass, -0.5, 1.25, 0), box(0.02, 2.2, 1.0, glass, 0.5, 1.25, 0));
  g.add(box(0.3, 0.4, 0.15, toonE(0x2a2a30, 0.1), 0.2, 1.4, -0.35));
  g.add(box(1.0, 0.18, 0.02, glow(0xffd58a, 1.0), 0, 2.3, 0.51));
  return g;
}
export function buildBench() {
  const g = new THREE.Group();
  const iron = toonE(0x2f3a34, 0.1), wood = toonE(0x6a4a30, 0.14);
  g.add(box(1.9, 0.06, 0.42, wood, 0, 0.46, 0));
  const back = box(1.9, 0.4, 0.05, wood, 0, 0.78, -0.22); back.rotation.x = 0.15; g.add(back);
  for (const s of [-1, 1]) { g.add(box(0.06, 0.46, 0.4, iron, s * 0.85, 0.23, 0)); g.add(box(0.06, 0.5, 0.06, iron, s * 0.85, 0.75, -0.22)); }
  return g;
}

/** Dufayel's house with a big lit ground-floor window; the interior anchor is where he sits. */
export function buildDufayelHouse(rng: Rng) {
  const g = new THREE.Group();
  const w = 11, d = 10, h = 9.5;
  const tint = 0xf0e2c8;
  const f = parisFacade(rng, { wall: '#ffffff', floors: 2, cols: 3, lit: 0.6, balconies: [1] });
  const wallMat = new THREE.MeshLambertMaterial({ color: tint, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.8 });
  const plain = lambert(tint);
  // the block, but with the ground floor of the front open in the middle
  const upper = new THREE.Mesh(new THREE.BoxGeometry(w, h - 3.4, d), [plain, plain, plain, plain, wallMat, plain]);
  upper.position.y = 3.4 + (h - 3.4) / 2; g.add(upper);
  // ground floor: a solid rear block, side blocks and a lintel, leaving the front room hollow so the painter is visible
  g.add(box(w, 4.9, d - 5.4, plain, 0, 1.2, -2.7));
  for (const sx of [-1, 1]) g.add(box((w - 4.4) / 2, 4.9, 4.7, plain, sx * (2.2 + (w - 4.4) / 4), 1.2, 2.15));
  g.add(box(4.4, 1.8, 4.7, plain, 0, 4.0, 2.15));
  g.add(box(3.2, 3.6, 0.8, plain, -3.9, 1.8, d / 2 - 0.4), box(3.2, 3.6, 0.8, plain, 3.9, 1.8, d / 2 - 0.4));
  g.add(box(4.6, 0.5, 0.8, plain, 0, 3.15, d / 2 - 0.4));
  g.add(box(4.6, 0.5, 0.8, toonE(0xd9ccb2, 0.05), 0, 0.25, d / 2 - 0.4));
  // interior: a warm room seen through the glass
  const room = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.6, 4.4), new THREE.MeshLambertMaterial({ color: 0xd9b078, emissive: 0x6a4020, side: THREE.BackSide }));
  room.position.set(0, 1.8, d / 2 - 2.6); g.add(room);
  g.add(sphere(0.25, glow(0xffd58a, 1.5), 0, 3.0, d / 2 - 2.6, 8, 6));
  g.add(cyl(0.5, 0.35, 0.4, toonE(0xe8c890, 0.5), 0, 2.85, d / 2 - 2.6, 10));
  g.add(box(1.4, 0.9, 0.3, toonE(0x6a4a30, 0.15), -1.5, 0.95, d / 2 - 4.5)); // dresser
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ color: [0xe0603a, 0x4f8fc9, 0xf4d94c][i] }), -1.5 + i * 0.9, 2.2, d / 2 - 4.78));
  // window glass with iron bars
  const glass = new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.16, depthWrite: false });
  g.add(box(4.6, 2.7, 0.04, glass, 0, 1.85, d / 2 - 0.02));
  for (const x of [-1.5, 0, 1.5]) g.add(box(0.06, 2.7, 0.08, toonE(0x2a2d2a, 0.05), x, 1.85, d / 2));
  g.add(box(4.6, 0.06, 0.08, toonE(0x2a2d2a, 0.05), 0, 1.9, d / 2));
  g.add(mesh(mansardGeometry(w + 0.3, d + 0.3, 2.6, 1.2), toonE(0x6f7d84, 0.1), 0, h, 0));
  g.add(box(w - 2.4, 0.25, d - 2.4, toonE(0x5a666c, 0.08), 0, h + 2.6, 0));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return { group: g, interior: new THREE.Vector3(0.3, 0.5, d / 2 - 2.9), windowPos: new THREE.Vector3(0, 2.2, d / 2 + 0.5), depth: d };
}

// ---------- Sacré-Cœur and its steps ----------
export function buildSacreCoeur() {
  const g = new THREE.Group();
  const white = toonE(0xf4f1ea, 0.22), shade = toonE(0xe0dcd2, 0.2), lead = toonE(0xd8d8d0, 0.2);
  const dome = (r: number, x: number, y: number, z: number, drumH: number) => {
    g.add(cyl(r, r, drumH, white, x, y + drumH / 2, z, 16));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.add(box(0.7, drumH * 0.6, 0.3, glow(0xffd8a0, 0.5), x + Math.cos(a) * r, y + drumH / 2, z + Math.sin(a) * r).rotateY(-a)); }
    g.add(mesh(new THREE.SphereGeometry(r + 0.4, 18, 10, 0, TAU, 0, Math.PI / 2), lead, x, y + drumH, z));
    g.add(cyl(r * 0.28, r * 0.32, r * 0.5, white, x, y + drumH + r + 0.5, z, 8));
    g.add(cone(r * 0.3, r * 0.4, lead, x, y + drumH + r + 0.95, z, 8));
    g.add(sphere(r * 0.12, glow(0xfff0c8, 1.2), x, y + drumH + r + 1.25, z, 8, 6));
  };
  g.add(box(30, 14, 26, white, 0, 7, -4));
  g.add(box(32, 1.2, 28, shade, 0, 14.4, -4));
  // portico with three arches facing +z
  g.add(box(22, 8, 5, white, 0, 4, 9.5));
  for (const x of [-6.5, 0, 6.5]) {
    g.add(box(4.2, 5.2, 0.6, toonE(0x2a2620, 0.3), x, 2.6, 12.0));
    g.add(mesh(new THREE.CircleGeometry(2.1, 14, 0, Math.PI), toonE(0x2a2620, 0.3), x, 5.2, 12.31));
    g.add(box(4.6, 0.5, 0.7, shade, x, 8.1, 12.0));
  }
  for (let i = 0; i < 4; i++) g.add(cyl(0.5, 0.55, 8, white, -9.75 + i * 6.5, 4, 12.2, 10));
  g.add(box(23, 1.4, 5.4, shade, 0, 8.7, 9.5));
  // equestrian statues on the porch roof (simple silhouettes)
  for (const x of [-8, 8]) { g.add(box(1.2, 1.4, 2.6, toonE(0x5a6a5a, 0.1), x, 10.1, 9.5)); g.add(cyl(0.3, 0.3, 1.8, toonE(0x5a6a5a, 0.1), x, 11.7, 9.5, 6)); }
  // domes: the great central dome, two smaller at the front, one at the back
  dome(7.5, 0, 14.6, -4, 9);
  dome(3.4, -12, 14.6, 6, 4);
  dome(3.4, 12, 14.6, 6, 4);
  dome(2.6, 0, 14.6, -15, 3);
  // campanile at the back
  g.add(box(6, 34, 6, white, 0, 17, -22));
  for (let i = 0; i < 3; i++) g.add(box(2, 3.2, 0.4, glow(0xffd8a0, 0.5), 0, 23 + i * 4, -18.8));
  g.add(mesh(new THREE.SphereGeometry(3.6, 14, 8, 0, TAU, 0, Math.PI / 2), lead, 0, 34, -22));
  g.add(cone(0.4, 2, lead, 0, 38.5, -22, 6));
  // flood-lit warmth on the face
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return g;
}
/** A broad flight of steps from the square up to the basilica; `atLat(lat)` gives the terrain height along the flight. */
export function buildStairs(count: number, width: number, run: number, rise: number, lampEvery: number) {
  const g = new THREE.Group();
  const stone = toonE(0xd9d2c0, 0.12), riser = toonE(0xb9b2a0, 0.08);
  const lamps: Placement[] = [];
  const stepRun = run / count, stepRise = rise / count;
  for (let i = 0; i < count; i++) {
    const z = -(i + 0.5) * stepRun, y = (i + 1) * stepRise;
    g.add(box(width, stepRise + 0.02, stepRun + 0.02, i % 2 ? stone : riser, 0, y - stepRise / 2, z));
    if (i % lampEvery === 0) for (const s of [-1, 1]) lamps.push({ x: s * (width / 2 + 0.6), y, z, scale: 0.9, rot: 0 });
  }
  // balustrades
  for (const s of [-1, 1]) { const b = box(0.5, 0.9, run + 1, stone, s * (width / 2 + 0.25), rise / 2 + 0.45, -run / 2); b.rotation.x = Math.atan2(rise, run); g.add(b); }
  return { group: g, lamps };
}

// ---------- the Canal Saint-Martin ----------
export function buildCanal(rng: Rng, curve: THREE.Curve<THREE.Vector3>, roadAt: RoadAt, heightAt: HeightAt, zFrom: number, zTo: number, nearLat: number, farLat: number, bridgeZs: number[]) {
  const g = new THREE.Group();
  const uFrom = roadAt(zFrom).u, uTo = roadAt(zTo).u;
  // sub-curve for the canal stretch
  const pts: THREE.Vector3[] = [];
  const N = 120;
  for (let i = 0; i <= N; i++) pts.push(curve.getPointAt(lerp(uFrom, uTo, i / N)));
  const stretch = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  stretch.arcLengthDivisions = 600;
  const stoneTex = canvasTexture(128, 64, (c, w, h) => {
    c.fillStyle = '#4f5a52'; c.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) { const off = r % 2 ? 10 : 0; c.fillStyle = `hsl(${rng.range(90, 130)},${rng.range(6, 14)}%,${rng.range(28, 40)}%)`; c.fillRect(i * 21 + off + 1, r * 16 + 1, 19, 14); }
  }, [1, 1]);
  const quayMat = new THREE.MeshLambertMaterial({ map: stoneTex, side: THREE.DoubleSide });
  const copingMat = lambert(0x8f9488);
  for (const [lat, flip] of [[nearLat, true], [farLat, false]] as const) {
    const edge = offsetCurve(stretch, lat, 200);
    g.add(new THREE.Mesh(wallGeometry(edge, -4.5, -0.05, 200, flip), quayMat));
    g.add(new THREE.Mesh(ribbonGeometry(edge, 0.9, 200, -0.02), copingMat));
    // iron mooring rings and bollards
    for (let i = 0; i <= 200; i += 12) { const p = edge.getPointAt(i / 200); g.add(cyl(0.16, 0.2, 0.5, toonE(0x2f3a34, 0.08), p.x, p.y + 0.2, p.z, 8)); }
  }
  // canal bed
  const bed = new THREE.Mesh(ribbonGeometry(offsetCurve(stretch, (nearLat + farLat) / 2, 120), farLat - nearLat, 120, -4.3), lambert(0x1e2a24));
  g.add(bed);
  // green iron footbridges arching from the towpath to the far quay
  const green = toonE(0x2f5d3f, 0.18), greenDark = toonE(0x244a32, 0.12);
  const bridgeTops: THREE.Vector3[] = [];
  const span = farLat - nearLat + 1;
  for (const bz of bridgeZs) {
    const p = roadAt(bz);
    const b = new THREE.Group();
    const segsN = 14, riseH = 3.4;
    for (let i = 0; i < segsN; i++) {
      const t0 = i / segsN, t1 = (i + 1) / segsN;
      const z0 = t0 * span, z1 = t1 * span;
      const y0 = Math.sin(t0 * Math.PI) * riseH, y1 = Math.sin(t1 * Math.PI) * riseH;
      const len = Math.hypot(z1 - z0, y1 - y0);
      const deck = box(3.2, 0.18, len + 0.05, greenDark, 0, (y0 + y1) / 2 + 0.6, (z0 + z1) / 2);
      deck.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
      b.add(deck);
      for (const s of [-1, 1]) {
        const rail = box(0.06, 0.06, len + 0.05, green, s * 1.55, (y0 + y1) / 2 + 1.6, (z0 + z1) / 2);
        rail.rotation.x = deck.rotation.x; b.add(rail);
        b.add(box(0.05, 1.0, 0.05, green, s * 1.55, y0 + 1.1, z0));
        b.add(box(0.05, 0.5, 0.05, green, s * 1.55, y0 + 0.85, z0 + len * 0.5));
      }
      // the arch below the deck
      const arch = box(0.25, 0.5, len + 0.1, green, 0, (y0 + y1) / 2 * 0.85 + 0.1, (z0 + z1) / 2);
      arch.rotation.x = -Math.atan2((y1 - y0) * 0.85, z1 - z0); b.add(arch);
      for (const s of [-1, 1]) { const a2 = arch.clone(); a2.position.x = s * 1.4; b.add(a2); }
    }
    // stair blocks at each end
    b.add(box(3.6, 0.6, 2.2, greenDark, 0, 0.3, -0.6)); b.add(box(3.6, 0.6, 2.2, greenDark, 0, 0.3, span + 0.6));
    // lanterns on the crown
    for (const s of [-1, 1]) { b.add(cyl(0.05, 0.05, 1.6, green, s * 1.55, riseH + 1.4, span / 2, 6)); b.add(sphere(0.22, glow(0xffd28a, 1.3), s * 1.55, riseH + 2.3, span / 2, 8, 6)); }
    const y = heightAt(p.x + p.rx * (nearLat - 1.5), p.z + p.rz * (nearLat - 1.5));
    b.position.set(p.x + p.rx * (nearLat - 1), y - 0.05, p.z + p.rz * (nearLat - 1));
    b.rotation.y = yawTo(p.rx, p.rz);
    g.add(b);
    bridgeTops.push(new THREE.Vector3(0, riseH + 0.7, span / 2).applyMatrix4(new THREE.Matrix4().makeRotationY(b.rotation.y)).add(b.position));
  }
  // plane trees on both quays
  const trees: Placement[] = [];
  for (let z = zFrom - 6; z > zTo + 4; z -= 13) {
    for (const lat of [nearLat - 1.6, farLat + 2.2]) {
      if (bridgeZs.some((bz) => Math.abs(bz - z) < 5)) continue;
      const p = roadAt(z);
      const x = p.x + p.rx * lat, zz = p.z + p.rz * lat;
      trees.push({ x, y: heightAt(x, zz) - 0.1, z: zz, scale: rng.range(1.4, 1.9), rot: rng.range(0, TAU) });
    }
  }
  g.add(instancedTrees({ trunk: 0x9a9480, canopy: [0x4f7a3a, 0x5f8a44, 0x6a9a4a], shape: 'broad' }, trees, rng, true));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh && c !== bed) c.castShadow = true; });
  return { group: g, bridgeTops };
}

// ---------- Gare de l'Est and the Métro ----------
export function buildGare(rng: Rng) {
  const g = new THREE.Group();
  const cream = 0xefe6d2;
  const f = parisFacade(rng, { wall: '#efe6d2', floors: 3, cols: 8, lit: 0.6, balconies: [] });
  const wing = new THREE.MeshLambertMaterial({ color: cream, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.8 });
  const plain = lambert(cream);
  const stone = toonE(0xd9ccb2, 0.1);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 14), [plain, plain, plain, plain, wing, plain]);
    w.position.set(s * 27, 7, 0); g.add(w);
    g.add(mesh(mansardGeometry(30.4, 14.4, 3, 1.4), toonE(0x6f7d84, 0.1), s * 27, 14, 0));
    g.add(box(30.6, 0.7, 14.6, stone, s * 27, 14.2, 0));
  }
  // central pavilion with the great arched window and the clock
  g.add(box(26, 22, 16, plain, 0, 11, 0));
  g.add(box(26.6, 1.0, 16.6, stone, 0, 22.3, 0));
  g.add(mesh(mansardGeometry(26.6, 16.6, 4, 2), toonE(0x6f7d84, 0.1), 0, 22.6, 0));
  g.add(box(20, 1.2, 12, toonE(0x5a666c, 0.08), 0, 26.6, 0));
  const archGlow = new THREE.Mesh(new THREE.CircleGeometry(7.5, 24, 0, Math.PI), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd08a).multiplyScalar(1.05) }));
  archGlow.position.set(0, 9.5, 8.05); g.add(archGlow);
  g.add(box(15, 6.5, 0.1, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd08a).multiplyScalar(1.05) }), 0, 6.25, 8.05));
  // glazing bars
  for (let i = -3; i <= 3; i++) g.add(box(0.14, 13, 0.16, toonE(0x2a2d2a, 0.05), i * 2.2, 10, 8.1));
  for (let k = 0; k < 4; k++) g.add(box(15, 0.14, 0.16, toonE(0x2a2d2a, 0.05), 0, 4 + k * 3.2, 8.1));
  g.add(mesh(new THREE.TorusGeometry(7.7, 0.5, 8, 28, Math.PI), stone, 0, 9.5, 8.2));
  for (const x of [-8.2, 8.2]) g.add(box(1.4, 12, 1.4, stone, x, 6, 8.2));
  // clock in the pediment
  const face = canvasTexture(128, 128, (c) => {
    c.fillStyle = '#f7f2e4'; c.beginPath(); c.arc(64, 64, 58, 0, TAU); c.fill();
    c.strokeStyle = '#3a3a3a'; c.lineWidth = 4; c.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.fillStyle = '#3a3a3a'; c.beginPath(); c.arc(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48, 3, 0, TAU); c.fill(); }
    c.lineWidth = 5; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 24); c.moveTo(64, 64); c.lineTo(92, 78); c.stroke();
  });
  g.add(mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshBasicMaterial({ map: face }), 0, 19.5, 8.15));
  g.add(mesh(new THREE.TorusGeometry(2.7, 0.25, 6, 24), stone, 0, 19.5, 8.15));
  // lettering
  const name = textTexture("GARE DE L'EST", { font: 'bold 64px serif', color: '#3a2a20', bg: '#efe6d2', w: 1024, h: 112 });
  g.add(mesh(new THREE.PlaneGeometry(20, 2.2), new THREE.MeshBasicMaterial({ map: name }), 0, 17.0, 8.12));
  // a statue on top
  g.add(cone(0.9, 2.6, toonE(0x5a6a5a, 0.1), 0, 28.5, 0, 8));
  g.add(sphere(0.5, toonE(0x5a6a5a, 0.1), 0, 30.1, 0, 8, 6));
  // canopy over the entrances
  g.add(box(30, 0.3, 4, toonE(0x2f3a34, 0.1), 0, 5.2, 10));
  for (let i = -3; i <= 3; i++) g.add(cyl(0.12, 0.12, 5, toonE(0x2f3a34, 0.1), i * 4.5, 2.6, 11.8, 6));
  for (let i = -3; i <= 3; i++) g.add(box(0.5, 0.5, 0.5, glow(0xffd58a, 1.1), i * 4.5, 4.8, 11.5));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return g;
}
export function buildMetro() {
  const g = new THREE.Group();
  const green = toonE(0x3f6a45, 0.2);
  // stairwell
  g.add(box(2.6, 0.1, 5, toonE(0x1a1c1a, 0.0), 0, 0.02, 0));
  for (let i = 0; i < 6; i++) g.add(box(2.4, 0.16, 0.6, toonE(0x2a2f2a, 0.05), 0, -0.1 - i * 0.3, 0.3 + i * 0.7));
  // railings around the opening
  for (const s of [-1, 1]) { g.add(box(0.08, 0.9, 5, green, s * 1.4, 0.5, 0)); for (let i = 0; i < 9; i++) g.add(box(0.05, 0.9, 0.05, green, s * 1.4, 0.5, -2.3 + i * 0.58)); }
  g.add(box(2.9, 0.9, 0.08, green, 0, 0.5, -2.55));
  // the two curling stalks with red globes and the sign between them
  for (const s of [-1, 1]) {
    const pts = [new THREE.Vector3(s * 1.5, 0, -2.4), new THREE.Vector3(s * 1.7, 2.2, -2.5), new THREE.Vector3(s * 1.3, 3.4, -2.4), new THREE.Vector3(s * 0.9, 3.9, -2.3)];
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.09, 6, false), green);
    g.add(tube);
    g.add(sphere(0.32, glow(0xff5a3a, 1.5), s * 0.9, 4.15, -2.3, 10, 8));
    // leaf-like flourishes
    g.add(mesh(new THREE.ConeGeometry(0.3, 0.9, 5), green, s * 1.75, 2.7, -2.5).rotateZ(s * 0.5));
  }
  const sign = textTexture('MÉTROPOLITAIN', { font: 'italic bold 60px serif', color: '#f4e8c8', bg: '#2f4a33', w: 1024, h: 128 });
  const signMat = new THREE.MeshBasicMaterial({ map: sign, side: THREE.DoubleSide });
  g.add(mesh(new THREE.PlaneGeometry(3.6, 0.56), signMat, 0, 3.0, -2.45));
  g.add(box(3.7, 0.66, 0.12, green, 0, 3.0, -2.5));
  g.add(mesh(new THREE.PlaneGeometry(3.6, 0.56), signMat, 0, 3.0, -2.57).rotateY(Math.PI));
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return g;
}
/** A couple of parked Paris taxis for the station forecourt. */
export function buildCar(color: number) {
  const g = new THREE.Group();
  const paint = toonE(color, 0.12), dark = toon(0x1a1a1e);
  g.add(box(1.7, 0.55, 3.8, paint, 0, 0.55, 0));
  g.add(box(1.5, 0.5, 1.9, paint, 0, 1.05, -0.2));
  g.add(box(1.52, 0.4, 1.8, new THREE.MeshLambertMaterial({ color: 0x8fb0c0, emissive: 0x223344 }), 0, 1.1, -0.2));
  for (const s of [-1, 1]) for (const z of [-1.3, 1.3]) { const w = cyl(0.3, 0.3, 0.2, dark, s * 0.85, 0.3, z, 10); w.rotation.z = Math.PI / 2; g.add(w); }
  g.add(box(0.3, 0.15, 0.1, glow(0xffe0a0, 1.0), -0.6, 0.6, 1.92), box(0.3, 0.15, 0.1, glow(0xffe0a0, 1.0), 0.6, 0.6, 1.92));
  g.add(box(0.3, 0.12, 0.1, glow(0xff3a2a, 1.0), -0.6, 0.6, -1.92), box(0.3, 0.12, 0.1, glow(0xff3a2a, 1.0), 0.6, 0.6, -1.92));
  g.add(box(0.5, 0.2, 0.3, glow(0xffd58a, 0.9), 0, 1.4, -0.2));
  return g;
}

// ---------- the far skyline and the Eiffel Tower ----------
export function buildSkyline(rng: Rng, roadAt: RoadAt, heightAt: HeightAt, zFrom: number, zTo: number) {
  const g = new THREE.Group();
  const f = parisFacade(rng, { wall: '#3a3f4a', floors: 7, cols: 6, lit: 0.45, balconies: [] });
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.7 });
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const n = 320;
  const im = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const c = new THREE.Color();
  let i = 0, tries = 0;
  while (i < n && tries < n * 6) {
    tries++;
    const z = rng.range(zTo - 200, zFrom + 120);
    const lat = rng.sign() * rng.range(95, 420);
    const rp = roadAt(clamp(z, zTo, zFrom));
    const x = rp.x + rp.rx * lat, zz = rp.z + rp.rz * lat + (z - rp.z);
    const w = rng.range(14, 30), d = rng.range(14, 30), h = rng.range(14, 30) + (rng.chance(0.08) ? rng.range(20, 50) : 0);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(-0.15, 0.15));
    p.set(x, heightAt(x, zz) - 1, zz); s.set(w, h, d);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
    c.setHSL(rng.range(0.55, 0.62), rng.range(0.08, 0.2), rng.range(0.22, 0.34));
    im.setColorAt(i, c);
    i++;
  }
  im.count = i;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  g.add(im);
  // the Eiffel Tower, far off to the south-west, twinkling
  const tower = new THREE.Group();
  const iron = toonE(0x4a3a2c, 0.35);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = cyl(0.9, 2.2, 42, iron, sx * 14, 20, sz * 14, 6);
    leg.rotation.z = -sx * 0.32; leg.rotation.x = sz * 0.32;
    tower.add(leg);
  }
  tower.add(box(36, 3, 36, iron, 0, 36, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const leg = cyl(0.7, 1.2, 30, iron, sx * 7, 51, sz * 7, 6); leg.rotation.z = -sx * 0.12; leg.rotation.x = sz * 0.12; tower.add(leg); }
  tower.add(box(20, 2.5, 20, iron, 0, 66, 0));
  tower.add(cyl(2.2, 5.5, 48, iron, 0, 90, 0, 8));
  tower.add(box(9, 3, 9, iron, 0, 114, 0));
  tower.add(cyl(0.3, 0.8, 14, iron, 0, 122, 0, 6));
  const lights: Placement[] = [];
  for (let k = 0; k < 90; k++) {
    const y = rng.range(4, 118);
    const spread = y < 36 ? lerp(16, 8, y / 36) : y < 66 ? lerp(8, 4, (y - 36) / 30) : lerp(4, 1.2, (y - 66) / 52);
    lights.push({ x: rng.range(-spread, spread), y, z: rng.range(-spread, spread), scale: rng.range(0.8, 1.4), rot: 0 });
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
  tower.add(instanced(new THREE.SphereGeometry(0.55, 5, 4), lightMat, lights));
  tower.add(sphere(1.2, glow(0xfff0c0, 1.6), 0, 129, 0, 8, 6));
  g.add(tower);
  return { group: g, tower, lightMat };
}

// ---------- the red moped ----------
export function buildMoped(opts: { light?: boolean } = {}) {
  const g = new THREE.Group();
  const red = toonE(0xd23a2a, 0.2), cream = toonE(0xf0e6d0, 0.15), chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.85, roughness: 0.3 });
  const rubber = toon(0x1e1e22), dark = toon(0x2a2a2e), leather = toonE(0x4a3020, 0.1);
  const wheel = (z: number) => {
    const w = new THREE.Group(); w.position.set(0, 0.32, z);
    const tyre = mesh(new THREE.TorusGeometry(0.26, 0.07, 8, 18), rubber); tyre.rotation.y = Math.PI / 2; w.add(tyre);
    w.add(cyl(0.2, 0.2, 0.06, cream, 0, 0, 0, 12).rotateZ(Math.PI / 2));
    w.add(cyl(0.05, 0.05, 0.14, chrome, 0, 0, 0, 8).rotateZ(Math.PI / 2));
    g.add(w);
    return w;
  };
  const front = wheel(0.95), rear = wheel(-0.72);
  // front mudguard and forks
  const guard = mesh(new THREE.TorusGeometry(0.34, 0.07, 6, 14, Math.PI), red, 0, 0.36, 0.95);
  guard.rotation.y = Math.PI / 2; g.add(guard);
  for (const s of [-1, 1]) { const f = cyl(0.025, 0.025, 0.7, chrome, s * 0.09, 0.62, 0.86, 6); f.rotation.x = 0.28; g.add(f); }
  // leg shield, floorboard, body and seat
  const shield = box(0.62, 0.72, 0.08, red, 0, 0.72, 0.6); shield.rotation.x = -0.25; g.add(shield);
  g.add(box(0.5, 0.06, 0.9, cream, 0, 0.3, 0.05));
  g.add(box(0.56, 0.05, 0.95, dark, 0, 0.26, 0.05));
  const body = mesh(new THREE.SphereGeometry(1, 14, 10), red, 0, 0.6, -0.4); body.scale.set(0.3, 0.3, 0.55); g.add(body);
  g.add(box(0.34, 0.14, 0.78, leather, 0, 0.9, -0.35));
  g.add(cyl(0.05, 0.05, 0.6, chrome, 0.2, 0.55, -0.15, 6).rotateX(Math.PI / 2)); // exhaust
  g.add(mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 14, Math.PI), red, 0, 0.36, -0.72).rotateY(Math.PI / 2));
  g.add(box(0.12, 0.08, 0.04, glow(0xff3a2a, 1.2), 0, 0.72, -1.02));
  g.add(box(0.36, 0.04, 0.3, chrome, 0, 0.98, -0.85)); // rear rack
  // handlebars with a round mirror, speedo and the headlamp
  const bars = new THREE.Group(); bars.position.set(0, 1.12, 0.7); g.add(bars);
  bars.add(cyl(0.022, 0.022, 0.72, chrome, 0, 0, 0, 8).rotateZ(Math.PI / 2));
  for (const s of [-1, 1]) bars.add(cyl(0.032, 0.032, 0.14, rubber, s * 0.32, 0, 0, 8).rotateZ(Math.PI / 2));
  bars.add(cyl(0.02, 0.02, 0.3, chrome, 0, -0.15, 0, 6));
  const stalk = cyl(0.012, 0.012, 0.4, chrome, -0.36, 0.2, 0, 5); stalk.rotation.z = 0.15; bars.add(stalk);
  const mirror = new THREE.Group(); mirror.position.set(-0.5, 0.36, 0.05); bars.add(mirror);
  mirror.add(cyl(0.065, 0.065, 0.02, chrome, 0, 0, 0, 16).rotateX(Math.PI / 2));
  mirror.add(mesh(new THREE.CircleGeometry(0.055, 16), new THREE.MeshStandardMaterial({ color: 0xbfd0e0, metalness: 1, roughness: 0.15, emissive: 0x334455 }), 0, 0, -0.012).rotateY(Math.PI));
  bars.add(cyl(0.07, 0.07, 0.03, dark, 0, 0.04, -0.06, 12).rotateX(-1.2));
  bars.add(mesh(new THREE.CircleGeometry(0.055, 12), new THREE.MeshBasicMaterial({ color: 0xdde8c8 }), 0, 0.055, -0.045).rotateX(-1.2 + Math.PI));
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(1.15) });
  const lamp = new THREE.Group(); lamp.position.set(0, -0.14, 0.22); bars.add(lamp);
  lamp.add(cyl(0.15, 0.13, 0.14, chrome, 0, 0, 0, 16).rotateX(Math.PI / 2));
  lamp.add(mesh(new THREE.CircleGeometry(0.125, 16), lampMat, 0, 0, 0.075));
  // wicker basket on the front
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.34), new THREE.MeshLambertMaterial({ map: wickerTexture(), emissive: 0x2a1a08 }));
  basket.position.set(0, 0.97, 1.1); g.add(basket);
  g.add(box(0.4, 0.05, 0.28, toonE(0xd9b070, 0.2), 0, 1.13, 1.1));
  g.add(mesh(new THREE.TorusGeometry(0.16, 0.02, 5, 12, Math.PI), toonE(0x8e6a36, 0.1), 0, 1.14, 1.1).rotateY(Math.PI / 2));
  // a baguette and a paper bag poking out
  g.add(cyl(0.05, 0.04, 0.6, toonE(0xd9a35a, 0.25), 0.12, 1.28, 1.05, 6).rotateZ(0.5).rotateX(0.4));
  g.add(box(0.16, 0.2, 0.12, toonE(0xe8d8b8, 0.2), -0.1, 1.2, 1.08));
  let light: THREE.PointLight | null = null;
  // the headlamp light sits well ahead of the basket so it lights the road, not the baguette
  if (opts.light !== false) { light = new THREE.PointLight(0xffd9a0, 3, 26, 1.5); light.position.set(0, 0.8, 2.8); g.add(light); }
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return { group: g, bars, frontWheel: front, rearWheel: rear, lampMat, light };
}
