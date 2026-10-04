import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, glow, mergeStatic, roofGeometry, sphere, toon, type Placement } from '../../../engine/Builders';
import { CumulusField, cumulusGeometry } from '../../../engine/Clouds';
import { fluffyForest } from '../../../engine/Foliage';
import { HeightGrid } from '../../../engine/HeightGrid';
import { Painter, boxUV } from '../../../engine/Paint';
import { SeaMaterial } from '../../../engine/Water';
import type { Sky } from '../../../engine/Sky';
import { Rng, TAU, clamp, lerp, noise2, smoothstep } from '../../../engine/math';
import { buildBathhouse } from '../../ghibli/bathhouse';
import { stoneWall } from '../../ghibli/characterTextures';
import { MoonGlitter, Streaks, haloTexture, starReflections } from './glints';
import { BATHHOUSE, ISLANDS, SEA_Y, TRACK, WATER_DROP, inPonyoWater, trackX } from './places';

/*
 * The night sea of spirits: still, shallow water to the horizon, the moon's glittering path on it, star
 * reflections, small islands each with a lone house with lit windows, lamp posts standing in the water,
 * the bathhouse glowing far behind, and a soft floor of cloud ahead that the rider falls into at the end.
 * Heights below are measured from the sea's surface (SEA_Y) unless they say otherwise.
 */

type SkyUniforms = Sky['uniforms'];

// ---------- islands ----------
type Island = (typeof ISLANDS)[number];
/** The island's radius in a direction: a lumpy outline rather than a circle. */
const radiusAt = (isl: Island, i: number, a: number) => isl.r * (1 + 0.1 * Math.sin(3 * a + i * 1.7) + 0.06 * Math.sin(5 * a + i * 4.1));
/** Height above the sea at a fraction `t` of the island's radius out from its middle: a flat top, a rounded shoulder, a low shore, then under water. */
function islandHeight(isl: Island, i: number, t: number, a: number) {
  if (t >= 1.35) return -9;
  if (t > 1) return lerp(-0.08, -1.6, (t - 1) / 0.35);
  const lumps = 0.18 * isl.top * (noise2(Math.cos(a) * 2 + i * 3.1, Math.sin(a) * 2 + t * 2) - 0.5) * smoothstep(1, 0.5, t) * smoothstep(0.2, 0.45, t);
  return -0.08 + (isl.top + 0.08) * smoothstep(1, 0.45, t) + lumps;
}
/** Sea bed below the surface: shallow everywhere, with gentle unevenness. */
const seabed = (x: number, z: number) => -1.15 + (noise2(x * 0.015, z * 0.015) - 0.5) * 0.5;

/** Solid height (sea bed or island) at a point, in world units. */
export function groundHeight(x: number, z: number) {
  let h = seabed(x, z);
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = ISLANDS[i];
    const dx = x - isl.x, dz = z - isl.z, lim = isl.r * 1.5;
    if (Math.abs(dx) > lim || Math.abs(dz) > lim) continue;
    const a = Math.atan2(dz, dx);
    const t = Math.hypot(dx, dz) / radiusAt(isl, i, a);
    h = Math.max(h, islandHeight(isl, i, t, a));
  }
  return SEA_Y + h;
}

/** All the islands' ground as one mesh, coloured by height: dark wet rock, a pale stony shore, dark grass on top. */
function islandGeometry() {
  const RINGS = [0, 0.15, 0.3, 0.45, 0.55, 0.65, 0.75, 0.84, 0.92, 0.97, 1.0, 1.08, 1.2, 1.34];
  const SEG = 40;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const rock = new THREE.Color(0x3a3d3c), shore = new THREE.Color(0x7a735f), grass = new THREE.Color(0x2c4a37), grass2 = new THREE.Color(0x3e5c3c), c = new THREE.Color();
  ISLANDS.forEach((isl, i) => {
    const base = pos.length / 3;
    for (let r = 0; r < RINGS.length; r++) for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * TAU, t = RINGS[r];
      const R = radiusAt(isl, i, a) * t;
      const h = islandHeight(isl, i, t, a);
      pos.push(isl.x + Math.cos(a) * R, SEA_Y + h, isl.z + Math.sin(a) * R);
      const n = noise2(isl.x * 0.1 + Math.cos(a) * R * 0.4, isl.z * 0.1 + Math.sin(a) * R * 0.4);
      if (h < 0.2) c.copy(rock).lerp(shore, smoothstep(-0.6, 0.2, h) * 0.5);
      else if (h < 0.75) c.copy(shore).lerp(rock, n * 0.4);
      else c.copy(grass).lerp(grass2, n).lerp(shore, smoothstep(0.75, 1.2, h) * (1 - smoothstep(1.2, 1.8, h)) * 0.35);
      col.push(c.r, c.g, c.b);
    }
    for (let r = 0; r < RINGS.length - 1; r++) for (let s = 0; s < SEG; s++) {
      const a = base + r * (SEG + 1) + s, b = a + SEG + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the ground faces up
  const n = g.attributes.normal as THREE.BufferAttribute;
  if (n.getY(SEG + 2) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

/** A plastered wall between dark timber posts, with two paper windows lit from inside (colour map and glow map). */
function houseTextures() {
  const W = 256, H = 128;
  const col = new Painter(W, H, 611).fill('#c4b89c');
  col.dabs({ n: 40, colors: ['#b0a284', '#d2c6aa', '#a89a7c'], r: [6, 22], alpha: [0.15, 0.35], squash: 0.6 });
  const em = new Painter(W, H, 612).fill('#000');
  const g = col.g, e = em.g;
  const win = (x: number) => {
    const wx = x, wy = 34, ww = 62, wh = 54;
    g.fillStyle = '#f2d8a0'; g.fillRect(wx, wy, ww, wh);
    const gr = e.createRadialGradient(wx + ww / 2, wy + wh / 2, 4, wx + ww / 2, wy + wh / 2, ww * 0.7);
    gr.addColorStop(0, '#ffd890'); gr.addColorStop(1, '#e8903a');
    e.fillStyle = gr; e.fillRect(wx, wy, ww, wh);
    // lattice of the paper screen
    for (const p of [g, e]) {
      p.fillStyle = p === g ? '#3a2a1e' : '#000';
      for (let k = 0; k <= 3; k++) p.fillRect(wx + (ww * k) / 3 - 1.5, wy, 3, wh);
      for (let k = 0; k <= 3; k++) p.fillRect(wx, wy + (wh * k) / 3 - 1.5, ww, 3);
    }
  };
  win(30); win(W - 92);
  // timber frame: sill, beam, corner and middle posts
  g.fillStyle = '#3a2a1e';
  g.fillRect(0, 0, W, 12); g.fillRect(0, H - 14, W, 14); g.fillRect(0, 0, 10, H); g.fillRect(W - 10, 0, 10, H); g.fillRect(W / 2 - 5, 0, 10, H);
  g.fillRect(0, 24, W, 5);
  col.lines({ n: 14, colors: ['#4a3828', '#2a1e14'], alpha: [0.2, 0.4], width: [1, 2], vertical: true });
  return { map: col.texture({ wrap: false }), glow: em.texture({ wrap: false }) };
}

/** A lamp post standing in the water: an iron post with a lantern on top (iron and glowing glass as two geometries). */
function lampGeometries() {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number) => { g.translate(x, y, z); parts.push(g); };
  add(new THREE.CylinderGeometry(0.08, 0.12, 6.4, 6), 0, 1.9, 0);
  add(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8), 0, 4.95, 0);
  add(new THREE.BoxGeometry(0.62, 0.06, 0.62), 0, 5.0, 0);
  add(new THREE.BoxGeometry(0.66, 0.06, 0.66), 0, 5.56, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(new THREE.BoxGeometry(0.05, 0.56, 0.05), x * 0.28, 5.28, z * 0.28);
  add(new THREE.ConeGeometry(0.5, 0.42, 4).rotateY(Math.PI / 4), 0, 5.8, 0);
  add(new THREE.SphereGeometry(0.07, 6, 4), 0, 6.06, 0);
  const iron = mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p), false)!;
  const glass = new THREE.BoxGeometry(0.46, 0.5, 0.46).translate(0, 5.28, 0);
  return { iron, glass };
}

/**
 * The bathhouse as it is seen from the sea once the bathhouse scene is hidden: the same building in the same
 * place, its podium and the boiler room wing as dark blocks with a few lit windows, the high window Haku flew
 * out of glowing with the furnace, a warm haze round it all and its light on the water.
 */
function bathhouseStandIn() {
  const B = BATHHOUSE;
  const g = new THREE.Group();
  const paperMat = new THREE.MeshLambertMaterial({ color: 0xff6b4a, emissive: 0xff5a30, emissiveIntensity: 0.9 });
  const coreMat = glow(0xffb36b, 1.9), capMat = toon(0x2a2a2a);
  const lantern = (x: number, y: number, z: number, s = 1) => {
    const l = new THREE.Group();
    l.add(sphere(0.42 * s, paperMat, 0, 0, 0, 10, 8), sphere(0.22 * s, coreMat, 0, 0, 0, 8, 6), cyl(0.12 * s, 0.12 * s, 0.14 * s, capMat, 0, 0.46 * s, 0, 8));
    l.position.set(x, y, z);
    return l;
  };
  const house = buildBathhouse(lantern);
  house.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  mergeStatic(house.group);
  house.group.scale.setScalar(B.s);
  house.group.position.set(B.x, B.y, B.z);
  g.add(house.group);
  // the podium and the wing, in stone and dark timber
  const stone = stoneWall(0x6a6258, { seed: 181 });
  stone.wrapS = stone.wrapT = THREE.RepeatWrapping;
  const stoneMat = new THREE.MeshLambertMaterial({ map: stone, color: 0x9a948c });
  const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(boxUV(new THREE.BoxGeometry(x1 - x0, y1 - y0, z0 - z1), 6), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.add(m);
    return m;
  };
  for (const p of B.podium) block(p.x0, p.x1, B.bottom, B.y, p.z0, p.z1, stoneMat);
  const w = B.wing;
  const timber = toon(0x4a2a22);
  block(w.x0, w.x1, B.bottom, -16, w.z0, w.z1, stoneMat);
  block(w.x0, w.x1, -16, w.roof, w.z0, w.z1, timber);
  const roof = new THREE.Mesh(roofGeometry(w.x1 - w.x0, w.z0 - w.z1, 4, 0.8), toon(0x2a3038));
  roof.position.set((w.x0 + w.x1) / 2, w.roof, (w.z0 + w.z1) / 2);
  g.add(roof);
  // the boiler room's chimney
  g.add(cyl(1.6, 2.2, 30, toon(0x5a3a2e), w.x1 - 8, w.roof + 13, w.z0 - 14, 12));
  // small lit windows along the wing, and the big back window glowing with the furnace
  const winMat = glow(0xffb060, 1.4);
  for (let z = w.z0 - 6; z > w.z1 + 4; z -= 7) for (const x of [w.x0 - 0.05, w.x1 + 0.05]) g.add(box(0.1, 1.6, 2.2, winMat, x, -4, z));
  g.add(box(14, 14.8, 0.1, glow(0xff8a3a, 1.6), 6.5, -5.8, w.z1 - 0.06));
  mergeStatic(g);
  // a warm haze round it, and its light on the water towards the rider
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: 0xffa060, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
  halo.scale.set(160, 120, 1);
  halo.position.set(B.x, B.y + 30, B.z - 20);
  g.add(halo);
  const streaks = new Streaks().add(new THREE.Vector3(8, SEA_Y + 0.04, w.z1 - 2), 12, 110, 0xff9a50, 3.3);
  g.add(streaks.build());
  return { group: g, streaks };
}

export interface NightSea {
  group: THREE.Group;
  grid: HeightGrid;
  occluders: THREE.Object3D[];
  /** the moon's direction last frame (from the sky), for things that sit in its path */
  moonDir: THREE.Vector3;
  update(t: number, cam: THREE.Vector3, sky: SkyUniforms, fog: THREE.FogExp2, sunIntensity: number, z: number): void;
}

export function buildNightSea(rng: Rng, lowDetail: boolean): NightSea {
  const group = new THREE.Group();
  const occluders: THREE.Object3D[] = [];

  // ---------- the water ----------
  const grid = new HeightGrid(-520, 520, -2720, -1640, 4, groundHeight);
  const waterY = SEA_Y - WATER_DROP;
  const sea = new SeaMaterial(grid, { nightDeep: 0x081834, nightShallow: 0x1c4470, sand: 0x6a6a5a, waterY });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1300, 1250, 130, 125), sea.material);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, waterY, -2180);
  water.renderOrder = 1;
  water.frustumCulled = false;
  group.add(water);

  const stars = starReflections(new Rng(707), lowDetail ? 900 : 1800, -460, 460, -1700, -2720, SEA_Y + 0.06);
  group.add(stars.points);
  const glitter = new MoonGlitter(lowDetail ? 700 : 1400, 709, SEA_Y);
  group.add(glitter.points);
  const streaks = new Streaks();

  // ---------- islands with lone houses ----------
  const islands = new THREE.Group();
  const ground = new THREE.Mesh(islandGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  islands.add(ground);
  const tex = houseTextures();
  const wallMat = new THREE.MeshLambertMaterial({ map: tex.map, emissive: 0xffffff, emissiveMap: tex.glow, emissiveIntensity: 1.25 });
  const roofMat = toon(0x2a333c), woodMat = toon(0x3a2a1e), stoneMat = toon(0x5a5850);
  const lampGlow = glow(0xffc070, 1.8);
  const proxyMat = new THREE.MeshBasicMaterial();
  const trees: Placement[] = [];
  ISLANDS.forEach((isl, i) => {
    const r2 = new Rng(900 + i);
    // the house sits near the middle and faces the rider coming along the path
    const toPath = Math.atan2(0 - isl.x, 40);
    const hx = isl.x + Math.sin(toPath) * isl.r * 0.12, hz = isl.z + Math.cos(toPath) * isl.r * 0.12;
    if (isl.house) {
      const s = clamp(isl.r / 12, 0.8, 1.3);
      const h = new THREE.Group();
      const w = 4.4 * s, d = 3.4 * s, wh = 2.6 * s;
      const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wh, d), wallMat);
      walls.position.y = wh / 2;
      const roof = new THREE.Mesh(roofGeometry(w, d, 1.7 * s, 0.45 * s), roofMat);
      roof.position.y = wh;
      roof.rotation.y = Math.PI / 2;
      // a lean-to on one side, a chimney pipe, a step and a lantern by the door
      const lean = new THREE.Mesh(new THREE.BoxGeometry(1.6 * s, 1.8 * s, d * 0.8), wallMat);
      lean.position.set(-w / 2 - 0.8 * s, 0.9 * s, 0);
      const leanRoof = new THREE.Mesh(new THREE.BoxGeometry(2.0 * s, 0.14, d * 0.95), roofMat);
      leanRoof.position.set(-w / 2 - 0.8 * s, 1.85 * s, 0); leanRoof.rotation.z = 0.3;
      const chimney = cyl(0.14 * s, 0.14 * s, 1.6 * s, woodMat, w * 0.25, wh + 1.3 * s, -d * 0.2);
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.4 * s, 0.25, 0.7), stoneMat);
      step.position.set(0, 0.12, d / 2 + 0.35);
      const lamp = sphere(0.16 * s, lampGlow, 0.9 * s, 1.7 * s, d / 2 + 0.25);
      const post = cyl(0.04, 0.04, 1.6 * s, woodMat, 0.9 * s, 0.8 * s, d / 2 + 0.25);
      h.add(walls, roof, lean, leanRoof, chimney, step, lamp, post);
      h.position.set(hx, groundHeight(hx, hz) - 0.15, hz);
      h.rotation.y = toPath;
      islands.add(h);
      // the lit windows shine on the water towards the rider
      streaks.add(new THREE.Vector3(isl.x + Math.sin(toPath) * isl.r * 0.95, SEA_Y + 0.04, isl.z + Math.cos(toPath) * isl.r * 0.95), 1.6 * s, 10 + isl.r * 0.6, 0xff9a48, i * 1.3);
    }
    // dark pines round the top
    const n = Math.round(clamp(isl.r / 3.2, 2, 6));
    for (let k = 0; k < n; k++) {
      const a = r2.range(0, TAU), t = r2.range(0.25, 0.68);
      const x = isl.x + Math.cos(a) * isl.r * t, z = isl.z + Math.sin(a) * isl.r * t;
      if (isl.house && Math.hypot(x - hx, z - hz) < 4.5) continue;
      trees.push({ x, y: groundHeight(x, z) - 0.2, z, scale: r2.range(0.5, 0.85) * clamp(isl.r / 12, 0.7, 1.2), rot: r2.range(0, TAU) });
    }
    // an invisible box that can hide a subject behind the island (only out over the open sea, clear of the bathhouse scene)
    if (isl.z < -2100) {
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(isl.r * 1.6, isl.top + 1, isl.r * 1.6), proxyMat);
      proxy.position.set(isl.x, SEA_Y + isl.top / 2, isl.z);
      proxy.visible = false;
      proxy.updateMatrixWorld(true);
      occluders.push(proxy);
    }
  });
  mergeStatic(islands);
  group.add(islands);
  group.add(fluffyForest({ shape: 'conifer', trunk: 0x3a2e28, leaves: [0x1e3a34, 0x24443a, 0x1a3330] }, trees, rng, { variants: 2 }));

  // ---------- lamp posts standing in the water ----------
  const lampSpots: THREE.Vector3[] = [];
  // along the flooded line, on alternating sides
  let side = 1;
  for (let z = TRACK.z0 - 20; z > TRACK.z1 + 120; z -= 44) { lampSpots.push(new THREE.Vector3(trackX(z) + side * 3.6, SEA_Y, z)); side = -side; }
  // a row of lamps along a drowned road from the line out to the big island on the right
  for (let k = 1; k <= 8; k++) { const f = k / 9; lampSpots.push(new THREE.Vector3(lerp(trackX(-2110) + 6, 104, f), SEA_Y, lerp(-2108, -2114, f) + (k % 2 ? 2.4 : -2.4))); }
  // lone lamps here and there
  const lr = new Rng(731);
  for (let tries = 0; lampSpots.length < 52 && tries < 400; tries++) {
    const x = lr.range(-170, 170), z = lr.range(-2080, -2460);
    if (inPonyoWater(x, z) || Math.abs(x - trackX(z)) < 8 || Math.abs(x) < 10) continue;
    if (ISLANDS.some((isl) => Math.hypot(x - isl.x, z - isl.z) < isl.r * 1.4 + 3)) continue;
    lampSpots.push(new THREE.Vector3(x, SEA_Y, z));
  }
  const lg = lampGeometries();
  const ironMat = toon(0x23272c);
  const glassMat = glow(0xffc878, 1.7);
  const lampIron = new THREE.InstancedMesh(lg.iron, ironMat, lampSpots.length);
  const lampGlass = new THREE.InstancedMesh(lg.glass, glassMat, lampSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  lampSpots.forEach((p, i) => {
    m4.compose(p, q.setFromAxisAngle(up, lr.range(0, TAU)), one);
    lampIron.setMatrixAt(i, m4); lampGlass.setMatrixAt(i, m4);
    streaks.add(new THREE.Vector3(p.x, SEA_Y + 0.03, p.z), 0.55, 9, 0xffb468, i * 0.71);
  });
  lampIron.computeBoundingSphere(); lampGlass.computeBoundingSphere();
  group.add(lampIron, lampGlass);

  // ---------- the bathhouse, glowing behind (shown once the bathhouse scene is hidden) ----------
  const bath = bathhouseStandIn();
  bath.group.visible = false;
  group.add(bath.group);

  group.add(streaks.build());

  // ---------- the cloud floor ahead, which the rider falls into (heights here are world heights) ----------
  const field = new CumulusField(rng, []);
  const clouds = new THREE.Group();
  {
    const cr = new Rng(733);
    const geos = [cumulusGeometry(cr, 'bank'), cumulusGeometry(cr, 'bank'), cumulusGeometry(cr, 'bank')];
    const spots: Array<{ x: number; y: number; z: number; s: number; sy: number; rot: number }> = [];
    // big banks where the rider sinks in, their tops at about y 28-32
    for (const [x, z] of [[-14, -2392], [16, -2400], [-4, -2424], [30, -2440], [-34, -2420]]) spots.push({ x, y: 11, z, s: cr.range(2.3, 2.7), sy: 1.05, rot: cr.range(0, TAU) });
    const n = lowDetail ? 26 : 44;
    for (let tries = 0; spots.length < n && tries < 600; tries++) {
      const wide = cr.chance(0.3);
      const x = wide ? cr.range(-300, 300) : cr.range(-130, 130), z = cr.range(-2330, -2680);
      // leave the air clear round the falling rider until the very end
      if (Math.abs(x) < 36 && z > -2372) continue;
      spots.push({ x, y: cr.range(7, 11), z, s: cr.range(1.7, 2.8), sy: cr.range(0.7, 0.95), rot: cr.range(0, TAU) });
    }
    const p = new THREE.Vector3(), s = new THREE.Vector3();
    geos.forEach((geo, vi) => {
      const mine = spots.filter((_, i) => i % geos.length === vi);
      const im = new THREE.InstancedMesh(geo, field.material, mine.length);
      mine.forEach((c, i) => { m4.compose(p.set(c.x, c.y, c.z), q.setFromAxisAngle(up, c.rot), s.set(c.s, c.s * c.sy, c.s)); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      clouds.add(im);
    });
  }
  group.add(clouds);

  const moonDir = new THREE.Vector3(-0.2, 0.34, -0.92).normalize();
  return {
    group, grid, occluders, moonDir,
    update(t, cam, sky, fog, sunIntensity, z) {
      moonDir.copy(sky.moonDir.value).normalize();
      sea.update(t, sky, fog, 1);
      stars.update(t, fog);
      glitter.update(t, cam, moonDir, fog);
      streaks.update(t, fog);
      field.update(sky, fog, sunIntensity);
      // lanterns flicker a little
      const flick = 1 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 13.1) * 0.03;
      glassMat.color.setHex(0xffc878).multiplyScalar(1.7 * flick);
      streaks.uniforms.uGain.value = 0.85 * flick;
      // the bathhouse stand-in replaces the bathhouse scene once that is hidden
      bath.group.visible = z < BATHHOUSE.swapZ;
      if (bath.group.visible) bath.streaks.update(t, fog);
    },
  };
}
