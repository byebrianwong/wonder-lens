import * as THREE from 'three';
import { buildTerrain, cyl, box, mesh, sphere, type Placement } from '../../../engine/Builders';
import { HeightGrid } from '../../../engine/HeightGrid';
import { addGroundDetail, paintedDetailTexture } from '../../../engine/Ground';
import { fluffyForest } from '../../../engine/Foliage';
import { Rng, clamp, smoothstep, TAU } from '../../../engine/math';
import { facadeTile } from '../textures';
import { FUNI, STATION, TOWN_Y, VIADUCT } from './plan';
import { forestBand, GBH, mountainBand, roofTiles, townWall } from './textures';
import { onionGeometry } from './station';
import { shade, tbox, type HotelMats } from './mats';

/*
 * The valley of Nebelsbad, built like a model railway layout seen from the train: snowy ground, a town of
 * pastel houses with snow on their roofs in tidy blocks, the spa's domed bathhouse and an onion-domed church
 * either side of the viaduct, a frozen pond, firs everywhere, the cliff up to the hotel, mountains round the
 * valley and a painted backdrop of the Alps, with Gabelmeister's Peak and its cable car.
 */

const PASTELS = [0xf6c6d2, 0xc8e6d8, 0xf6e8b0, 0xdacff2, 0xc8dcf4, 0xf8d6bc, 0xf6eee2, 0xf2b8c6, 0xb8e0e0];
const ROOFS = [0x8a2a3a, 0x4a5a7a, 0xb8604a, 0x3a6a6a, 0x6a3a5a];

/** Where nothing of the town may stand: the station terrace, the viaduct, the bathhouse, the church, the pond. */
const KEEP_OUT: Array<[number, number, number, number]> = [
  [-STATION.terraceHalf - 3, STATION.terraceHalf + 3, STATION.terraceZ1 - 4, STATION.terraceZ0 + 4],
  [-VIADUCT.half - 4, VIADUCT.half + 4, FUNI.cliffFoot - 4, STATION.terraceZ1 + 2],
  [-48, -9, -40, -6],
  [10, 38, -42, -10],
  [26, 62, 6, 38],
];
const kept = (x: number, z: number, pad = 0) => KEEP_OUT.some(([x0, x1, z0, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);

/** A unit gable roof: two slopes from the eaves (y 0, x +-0.56) to the ridge (y 1), running along z. */
function roofGeometry(snowOnly: boolean) {
  const e = 0.56, zz = 0.57, lift = snowOnly ? 0.035 : 0, from = snowOnly ? 0.28 : 0;
  const pos: number[] = [], uv: number[] = [];
  for (const s of [-1, 1]) {
    const x0 = s * e * (1 - from), y0 = from + lift, x1 = 0, y1 = 1 + lift;
    const quad = [[x0, y0, -zz], [x0, y0, zz], [x1, y1, zz], [x1, y1, -zz]];
    const order = s < 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of order) { pos.push(...quad[i]); uv.push(i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
/** The two gable triangles at the ends of a unit roof. */
function gableGeometry() {
  const pos = [-0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

interface House { x: number; y: number; z: number; w: number; d: number; h: number; rh: number; rot: number; wall: number; roof: number }

function instancedFrom(geo: THREE.BufferGeometry, mat: THREE.Material, list: House[], m4: (h: House, out: THREE.Matrix4) => void, color?: (h: House) => number) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  list.forEach((h, i) => { m4(h, m); im.setMatrixAt(i, m); if (color) im.setColorAt(i, c.set(color(h))); });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = true; im.receiveShadow = true;
  return im;
}

export interface Valley {
  group: THREE.Group;
  /** things that turn: the cable car */
  update(dt: number, t: number): void;
  grid: HeightGrid;
  /** large meshes for photo line-of-sight */
  occluders: THREE.Object3D[];
}

export function buildValley(m: HotelMats, height: (x: number, z: number) => number, lowDetail: boolean): Valley {
  const g = new THREE.Group();
  const rng = new Rng(1932);

  // ---------- the ground ----------
  const grid = new HeightGrid(-300, 300, -440, 340, 4, height);
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(groundMat, paintedDetailTexture(1932), { scaleA: 30, scaleB: 8, strength: 0.55 });
  const snowC = new THREE.Color(0xf4f2fa), snowShade = new THREE.Color(0xdcd8ee), rockC = new THREE.Color(0x8e7e8a), rockD = new THREE.Color(0x6a5e6e), townC = new THREE.Color(0xeeeaf4);
  const terrain = buildTerrain({
    xMin: -300, xMax: 300, zMin: -440, zMax: 340, res: 4, chunk: 260, height: (x, z) => grid.sample(x, z),
    color: (x, z, y, slope, out) => {
      const n = Math.sin(x * 0.11 + z * 0.07) * 0.5 + Math.sin(x * 0.031 - z * 0.05) * 0.5;
      out.copy(snowC).lerp(snowShade, clamp(0.35 + n * 0.3, 0, 1));
      if (y < TOWN_Y + 2) out.lerp(townC, 0.5);
      // rock shows where it is steep
      const rk = smoothstep(0.32, 0.55, slope + n * 0.06);
      out.lerp(rockC, rk).lerp(rockD, rk * smoothstep(0.5, 0.8, slope) * 0.6);
    },
    material: groundMat,
  });
  terrain.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.receiveShadow = true; mm.castShadow = false; } });
  g.add(terrain);
  const occluders: THREE.Object3D[] = [terrain];

  // ---------- the houses ----------
  const houses: House[] = [];
  for (let bx = -138; bx < 138; bx += 30) for (let bz = -60; bz < 190; bz += 26) {
    // a perimeter block: houses along its four sides, a garden in the middle
    const x0 = bx + 3, x1 = bx + 27, z0 = bz + 3, z1 = bz + 23;
    const centre = Math.hypot((x0 + x1) / 2, (z0 + z1) / 2 - 10);
    const tall = 1 - smoothstep(30, 120, centre);
    const tryHouse = (x: number, z: number, w: number, d: number, rot: number) => {
      const foot = FUNI.cliffFoot + x * x * 0.0016;
      if (z < foot + 5 || Math.abs(x) > 128 || kept(x, z, 1)) return;
      const y = grid.sample(x, z);
      if (y > TOWN_Y + 2.5) return;
      const h = rng.range(4.2, 6) + tall * rng.range(1.5, 3.5);
      houses.push({ x, y: y - 0.3, z, w, d, h, rh: rng.range(1.8, 2.8), rot, wall: rng.pick(PASTELS), roof: rng.pick(ROOFS) });
    };
    for (const zz of [z0 + 2.6, z1 - 2.6]) {
      let x = x0;
      while (x < x1 - 3) { const w = rng.range(4.6, 6.4); tryHouse(x + w / 2, zz, w, 5.2, zz < (z0 + z1) / 2 ? Math.PI : 0); x += w + rng.range(0, 0.6); }
    }
    for (const xx of [x0 + 2.6, x1 - 2.6]) {
      let z = z0 + 6;
      while (z < z1 - 6) { const w = rng.range(4.4, 5.4); tryHouse(xx, z + w / 2, w, 5.2, xx < (x0 + x1) / 2 ? -Math.PI / 2 : Math.PI / 2); z += w + 0.4; }
    }
  }
  const wallTex = townWall();
  wallTex.colorSpace = THREE.SRGBColorSpace;
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
  const plainMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshLambertMaterial({ map: roofTiles(), side: THREE.DoubleSide });
  const snowMat = new THREE.MeshLambertMaterial({ color: 0xf8f6fc, side: THREE.DoubleSide });
  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // the box's top and bottom faces show the wall picture squeezed: keep only the four sides
  const sides = unitBox.toNonIndexed();
  {
    const p = sides.attributes.position as THREE.BufferAttribute, u = sides.attributes.uv as THREE.BufferAttribute, n = sides.attributes.normal as THREE.BufferAttribute;
    const keepI: number[] = [];
    for (let i = 0; i < p.count; i += 3) if (Math.abs(n.getY(i)) < 0.5) keepI.push(i, i + 1, i + 2);
    const np: number[] = [], nu: number[] = [], nn: number[] = [];
    for (const i of keepI) { np.push(p.getX(i), p.getY(i), p.getZ(i)); nu.push(u.getX(i), u.getY(i)); nn.push(n.getX(i), n.getY(i), n.getZ(i)); }
    sides.setAttribute('position', new THREE.Float32BufferAttribute(np, 3));
    sides.setAttribute('uv', new THREE.Float32BufferAttribute(nu, 2));
    sides.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
  }
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const wallM = (h: House, out: THREE.Matrix4) => out.compose(pv.set(h.x, h.y, h.z), q.setFromAxisAngle(up, h.rot), sv.set(h.w, h.h, h.d));
  // the ridge runs along the house's depth when it is deeper than wide, else across
  const roofM = (h: House, out: THREE.Matrix4) => {
    const along = h.d >= h.w;
    return out.compose(pv.set(h.x, h.y + h.h, h.z), q.setFromAxisAngle(up, h.rot + (along ? 0 : Math.PI / 2)), sv.set(along ? h.w : h.d, h.rh, along ? h.d : h.w));
  };
  g.add(instancedFrom(sides, wallMat, houses, wallM, (h) => h.wall));
  g.add(instancedFrom(gableGeometry(), plainMat, houses, roofM, (h) => h.wall));
  g.add(instancedFrom(roofGeometry(false), roofMat, houses, roofM, (h) => h.roof));
  g.add(instancedFrom(roofGeometry(true), snowMat, houses, roofM));
  // chimneys
  const chim = new THREE.BoxGeometry(0.6, 1.6, 0.6).translate(0, 0.8, 0);
  const chimList = houses.filter((_, i) => i % 3 === 0);
  g.add(instancedFrom(chim, new THREE.MeshLambertMaterial({ color: 0xc8a8a0 }), chimList, (h, out) => out.compose(pv.set(h.x + Math.cos(h.rot) * h.w * 0.22, h.y + h.h + h.rh * 0.4, h.z - Math.sin(h.rot) * h.w * 0.22), q.identity(), sv.set(1, 1, 1))));

  // ---------- the bathhouse of Nebelsbad: colonnades and a copper dome ----------
  {
    const b = new THREE.Group();
    const bx = -28.5, bz = -23, by = TOWN_Y;
    const ft = facadeTile({ wall: 0xf4c2cf, frame: GBH.white, cornice: GBH.white, pilaster: 0xf8d8e0, arch: true, bays: 4, storeys: 1, lit: 0.5, seed: 61 });
    const fm = new THREE.MeshLambertMaterial({ map: ft.map, emissive: 0xffdcb0, emissiveMap: ft.emissive, emissiveIntensity: 0.5 });
    b.add(tbox(30, 8, 14, fm, 9.6, 0, by + 4, 0, 3.4 * 2.4));
    b.add(box(31, 0.6, 15, m.cream, 0, by + 8.2, 0));
    // a mint drum and a dome
    b.add(cyl(5.4, 5.6, 3.2, toon2(0xc8e8d8), 0, by + 10, 0, 24));
    b.add(cyl(5.9, 5.9, 0.4, m.cream, 0, by + 11.7, 0, 24));
    const dome = mesh(new THREE.SphereGeometry(5.6, 24, 12, 0, TAU, 0, Math.PI / 2), toon2(0x7ab8a8), 0, by + 11.8, 0);
    dome.scale.y = 0.9; b.add(dome);
    b.add(cyl(1.0, 1.2, 1.6, m.cream, 0, by + 17.6, 0, 12), sphere(0.6, m.gold, 0, by + 18.8, 0, 10, 8));
    // a colonnade on the viaduct side, and two little end pavilions
    for (let i = 0; i < 9; i++) b.add(cyl(0.32, 0.36, 5.2, m.white, -12 + i * 3, by + 2.6, 8.6, 8));
    b.add(box(28, 0.6, 3.4, m.cream, 0, by + 5.4, 8.2));
    b.add(box(28, 0.2, 3.6, m.snow, 0, by + 5.8, 8.2));
    for (const s of [-1, 1]) {
      b.add(tbox(6, 10, 6, fm, 9.6, s * 15, by + 5, 0, 3.4 * 2.4));
      b.add(mesh(onionGeometry(2.8, 5, 14), toon2(0x7ab8a8), s * 15, by + 10.2, 0));
    }
    // a steaming pool in front
    const pool = mesh(new THREE.CylinderGeometry(7, 7, 0.4, 28), new THREE.MeshLambertMaterial({ color: 0x9ad8d8, emissive: 0x2a5a5a }), 0, by + 0.2, 15);
    pool.scale.z = 0.45; b.add(pool);
    const rim = mesh(new THREE.TorusGeometry(7, 0.35, 6, 28), m.cream, 0, by + 0.35, 15);
    rim.rotation.x = Math.PI / 2; rim.scale.set(1, 0.45, 1); b.add(rim);
    b.position.set(bx, 0, bz);
    b.rotation.y = Math.PI / 2;
    g.add(b);
  }

  // ---------- the church: a tower with an onion dome ----------
  {
    const c = new THREE.Group();
    const cx = 24, cz = -27, cy = TOWN_Y;
    c.add(tbox(10, 9, 18, m.pink, 3, 0, cy + 4.5, 0));
    const nave = mesh(new THREE.CylinderGeometry(0.01, 7.6, 4, 4, 1).rotateY(Math.PI / 4), m.roof, 0, cy + 11, 0);
    nave.scale.set(1, 1, 1.8); c.add(nave);
    c.add(tbox(5, 20, 5, m.white, 3, 0, cy + 10, 10));
    for (const y of [cy + 9, cy + 15, cy + 20]) c.add(box(5.6, 0.4, 5.6, m.cream, 0, y, 10));
    c.add(mesh(onionGeometry(3, 6.4, 16), toon2(0x3a8a6a), 0, cy + 20.2, 10));
    const f = sphere(0.4, m.gold, 0, cy + 27, 10, 8, 6); c.add(f);
    c.add(cyl(0.06, 0.06, 2, m.gold, 0, cy + 28, 10, 5));
    const clock = mesh(new THREE.CircleGeometry(1.2, 20), m.white, 0, cy + 17, 12.55); c.add(clock);
    c.position.set(cx, 0, cz);
    c.rotation.y = -0.15;
    g.add(c);
  }

  // ---------- the frozen pond, with a little bandstand ----------
  {
    const ice = mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshLambertMaterial({ color: 0xcfe6f2, emissive: 0x30404a }), 44, TOWN_Y + 0.15, 22);
    ice.rotation.x = -Math.PI / 2; ice.scale.set(1.2, 0.85, 1); ice.receiveShadow = true;
    g.add(ice);
    const bs = new THREE.Group();
    bs.add(cyl(3, 3.2, 0.6, m.cream, 0, 0.3, 0, 16));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; bs.add(cyl(0.12, 0.12, 3, m.white, Math.cos(a) * 2.6, 2.1, Math.sin(a) * 2.6, 6)); }
    bs.add(mesh(new THREE.ConeGeometry(3.6, 2.4, 16), m.roofLav, 0, 4.7, 0));
    bs.add(mesh(new THREE.ConeGeometry(3.5, 1.4, 16), m.snow, 0, 5.4, 0));
    bs.position.set(30, TOWN_Y, 34);
    g.add(bs);
  }

  // ---------- trees: firs in the gardens, along the cliff and up the mountains ----------
  const trees: Placement[] = [];
  const small: Placement[] = [];
  const tr = new Rng(77);
  // in the town: in the middle of the blocks and along the pond
  for (let bx = -138; bx < 138; bx += 30) for (let bz = -60; bz < 190; bz += 26) {
    for (let k = 0; k < 2; k++) {
      const x = bx + 15 + tr.range(-5, 5), z = bz + 13 + tr.range(-4, 4);
      const foot = FUNI.cliffFoot + x * x * 0.0016;
      if (z < foot + 3 || kept(x, z) || Math.abs(x) > 130) continue;
      small.push({ x, y: grid.sample(x, z) - 0.2, z, scale: tr.range(0.45, 0.7), rot: tr.range(0, TAU) });
    }
  }
  // on the cliff and the mountains
  const nTrees = lowDetail ? 380 : 720;
  for (let i = 0; i < nTrees * 3 && trees.length < nTrees; i++) {
    const x = tr.range(-290, 290), z = tr.range(-430, 330);
    const y = grid.sample(x, z);
    const slope = grid.slope(x, z);
    if (slope > 0.62) continue;
    if (Math.abs(x) < 14 && z < FUNI.z0 + 8 && z > FUNI.cliffTop - 30) continue;
    if (kept(x, z, 4)) continue;
    // keep them out of the town itself, thick on the cliff and the lower mountains
    const inTown = y < TOWN_Y + 2.5 && Math.abs(x) < 128 && z > FUNI.cliffFoot;
    if (inTown && tr.next() > 0.08) continue;
    if (y > 150 && tr.next() < 0.7) continue;
    // nothing right in front of the hotel's terrace or across the view of the facade
    if (z < FUNI.cliffTop + 4 && z > -320 && Math.abs(x) < 52) continue;
    trees.push({ x, y: y - 0.3, z, scale: tr.range(0.75, 1.35) * (y > 60 ? 1.2 : 1), rot: tr.range(0, TAU) });
  }
  const firStyle = { shape: 'conifer' as const, trunk: 0x4a3a34, leaves: [0x2e4c48, 0x36544c, 0x2a4440, 0x3e5c52], snow: 0.85, density: 0.9 };
  g.add(fluffyForest(firStyle, trees, tr, { castShadow: false, variants: 3 }));
  g.add(fluffyForest({ ...firStyle, density: 0.8 }, small, tr, { castShadow: true, variants: 2 }));

  // ---------- the painted Alps behind everything, and Gabelmeister's Peak ----------
  const backdrop = new THREE.Group();
  const band = (r: number, h: number, y0: number, tex: THREE.Texture, repeat: number, cz: number) => {
    tex.repeat.set(repeat, 1);
    const geo = new THREE.CylinderGeometry(r, r, h, 64, 1, true);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false });
    const mm = mesh(geo, mat, 0, y0 + h / 2, cz);
    mm.renderOrder = -2;
    return mm;
  };
  backdrop.add(band(1050, 520, -60, mountainBand({ far: true, seed: 3 }), 3, -100));
  backdrop.add(band(860, 360, -50, mountainBand({ far: false, seed: 7, peak: 0.78 }), 2, -100));
  backdrop.add(band(700, 130, -30, forestBand(51), 5, -100));
  (backdrop.children[2] as THREE.Mesh).renderOrder = -1;
  g.add(backdrop);

  // Gabelmeister's Peak: a sharp white summit off to the left, the observatory on top, a cable car to it
  const peak = new THREE.Group();
  {
    const px = -330, pz = -520;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(Math.max(0.5, 150 * Math.pow(1 - t, 1.5)), t * 300)); }
    const geo = new THREE.LatheGeometry(pts, 9);
    const pp = geo.attributes.position as THREE.BufferAttribute;
    const prng = new Rng(5);
    const col: number[] = [];
    for (let i = 0; i < pp.count; i++) {
      const y = pp.getY(i);
      const k = 1 + prng.range(-0.18, 0.18) * Math.min(1, (300 - y) / 100);
      pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k);
      const c = new THREE.Color(y > 120 ? 0xf6f4fc : 0xb8b8d8).lerp(new THREE.Color(0x9a9ac8), prng.range(0, 0.25));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const pm = mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), px, -40, pz);
    peak.add(pm);
    // the observatory on the summit
    const obs = new THREE.Group();
    obs.add(box(12, 6, 10, m.cream, 0, 3, 0), cyl(4, 4, 3, m.pink, 0, 7.5, 0, 14));
    obs.add(mesh(new THREE.SphereGeometry(4, 14, 8, 0, TAU, 0, Math.PI / 2), m.white, 0, 9, 0));
    obs.position.set(px, 258, pz);
    peak.add(obs);
  }
  g.add(peak);
  // the cable car: two ropes from a valley station up to the summit, a red cabin going up and one coming down
  const cableA = new THREE.Vector3(-170, TOWN_Y + 12, -60), cableB = new THREE.Vector3(-330, 262, -520);
  const rope = new THREE.Group();
  for (const off of [-1.2, 1.2]) {
    const a = cableA.clone().add(new THREE.Vector3(off, 0, 0)), b = cableB.clone().add(new THREE.Vector3(off, 0, 0));
    const d = b.clone().sub(a);
    const r = mesh(new THREE.CylinderGeometry(0.18, 0.18, d.length(), 4), m.dark);
    r.position.copy(a).addScaledVector(d, 0.5); r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    rope.add(r);
  }
  // pylons
  for (const t of [0.3, 0.62]) {
    const p = cableA.clone().lerp(cableB, t);
    const gy = height(p.x, p.z);
    rope.add(box(1.2, p.y - gy + 2, 1.2, m.iron, p.x, (p.y + gy) / 2, p.z), box(5, 0.8, 1.2, m.iron, p.x, p.y + 0.5, p.z));
  }
  rope.add(tbox(10, 8, 8, m.pink, 3, cableA.x, cableA.y - 4, cableA.z + 2));
  g.add(rope);
  const cabins = [new THREE.Group(), new THREE.Group()];
  const cabinMat = new THREE.MeshLambertMaterial({ color: 0xd8323c, emissive: 0x401010 });
  for (const c of cabins) {
    c.add(box(4, 3.4, 5, cabinMat, 0, -4.2, 0), box(4.2, 1.2, 5.2, new THREE.MeshLambertMaterial({ color: 0xfff4e0, emissive: 0x806040 }), 0, -3.8, 0), box(0.3, 3, 0.3, m.dark, 0, -1.6, 0));
    c.add(box(4.4, 0.4, 5.4, m.cream, 0, -2.3, 0));
    g.add(c);
  }
  let cu = 0.15;

  shade(g, false, true);
  // the houses cast their shadows on the snow; the forest and the far mountains do not
  g.traverse((o) => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh && houses.length && im.count === houses.length) im.castShadow = true; });

  return {
    group: g, grid, occluders,
    update(dt) {
      cu = (cu + dt * 0.012) % 1;
      const e = (x: number) => x * x * (3 - 2 * x);
      for (let i = 0; i < 2; i++) {
        const u = e(i === 0 ? (cu < 0.5 ? cu * 2 : 2 - cu * 2) : 1 - (cu < 0.5 ? cu * 2 : 2 - cu * 2));
        cabins[i].position.copy(cableA).lerp(cableB, u).add(new THREE.Vector3(i === 0 ? -1.2 : 1.2, 0, 0));
        cabins[i].rotation.y = Math.atan2(cableB.x - cableA.x, cableB.z - cableA.z);
      }
    },
  };
}

const toonCache = new Map<number, THREE.Material>();
/** A Lambert colour, cached so look-alike parts share one material. */
function toon2(color: number) {
  let mm = toonCache.get(color);
  if (!mm) { mm = new THREE.MeshLambertMaterial({ color }); toonCache.set(color, mm); }
  return mm;
}
