import * as THREE from 'three';
import { toon, lambert, glow, box, cyl, cone, mesh, roofGeometry, textTexture, sphere, scatter, type Placement, canvasTexture, capsule } from '../../engine/Builders';
import { Rng, TAU, lerp } from '../../engine/math';
import type { ExclusionMask } from '../../engine/Ground';
import { boxUV, repeatUV } from '../../engine/Paint';
import { trainPanels, creamPaint, trainRoof, deckPlanks, trainWindow, cabinPanels, plasterBay, slate, hullPlanks, sailCloth, barkTexture, vermilion, granite, jizoHead } from './propTextures';
import { ironTexture, woodGrain, lacquer, fabric } from './characterTextures';
import { fluffyForest, fluffyTree, type Blob } from '../../engine/Foliage';
import { buildKoriko } from './koriko';
import { buildFarmhouse, buildCottage } from './farmhouse';
import { buildBathhouse } from './bathhouse';

// ---------- Koriko (Kiki's seaside town) ----------
export function buildKorikoTown(_rng: Rng, heightAt: (x: number, z: number) => number, _trackDist: (x: number, z: number) => number, mask: ExclusionMask | undefined, trackX: (z: number) => number) {
  const g = new THREE.Group();
  // terraced rows of townhouses; leave room for the station, the clock tower square and the church
  const town = buildKoriko({
    rng: new Rng(1989), heightAt, trackX, mask,
    keepClear: (row, _x, z) =>
      (row === 0 && z > -28 && z < 16) ||
      (row === 1 && z > -274 && z < -226) ||
      (row === 4 && z > -162 && z < -116),
    tower: { x: trackX(-250) - 43, z: -250, square: { off0: 31, off1: 47, z0: -228, z1: -272 } },
    bakeryZ: -384,
    station: { x: trackX(-6) - 7, y: heightAt(-4.6, -6) + 1.0, z: -6 },
  });
  g.add(town.group);
  // the bakery sign
  if (town.bakery) {
    const b = town.bakery;
    const sign = textTexture('BAKERY', { font: 'bold 44px serif', color: '#3a2a20', bg: '#f7f3ea', w: 256, h: 64 });
    const sm = mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshLambertMaterial({ map: sign }));
    sm.position.set(b.x + Math.sin(b.rotY) * 0.35, b.y + 3.6, b.z + Math.cos(b.rotY) * 0.35);
    sm.rotation.y = b.rotY;
    g.add(sm);
  }
  // church with a spire further up the hill
  {
    const cz = -140, cx = trackX(cz) - 111;
    const base = heightAt(cx, cz) - 0.5;
    const c = new THREE.Group();
    // plaster walls with one row of tall arched windows along the nave, and a copper spire
    const wall = new THREE.MeshLambertMaterial({ map: plasterBay(0xf1e8d4, '#5f7898') });
    c.add(mesh(boxUV(new THREE.BoxGeometry(12, 12, 24), 6, 12), wall, 0, 6, 0));
    c.add(mesh(roofGeometry(12, 24, 5, 0.4), toon(0x8f4a39), 0, 12, 0));
    c.add(mesh(boxUV(new THREE.BoxGeometry(6, 22, 6), 6, 7.3), wall, 0, 11, 13));
    c.add(mesh(repeatUV(new THREE.ConeGeometry(4.6, 12, 4), 2, 3), new THREE.MeshLambertMaterial({ map: slate(0x5f8f7a) }), 0, 28, 13));
    c.position.set(cx, base, cz);
    g.add(c);
    mask?.rect(cx, cz + 2, 13, 30, 0, 0.5);
  }
  return g;
}

export function buildSailboats(rng: Rng, count: number, xMin: number, xMax: number, zMin: number, zMax: number) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ map: hullPlanks(0x4b5a6a, '#c8a040') }), sailMat = new THREE.MeshLambertMaterial({ map: sailCloth(), side: THREE.DoubleSide });
  const deckMat = new THREE.MeshLambertMaterial({ map: deckPlanks(0x9a7a56) });
  const mastMat = new THREE.MeshLambertMaterial({ map: woodGrain(0x8a6a4a, 319) });
  const hullMats = [hullMat, deckMat];
  /**
   * A box hull with a pointed bow (+z) and sides that narrow towards the keel. The faces are regrouped into
   * two draw groups, sides then deck (a box's default six groups would cost six draw calls per boat).
   */
  const hullGeo = (w: number, h: number, d: number) => {
    const geo = boxUV(new THREE.BoxGeometry(w, h, d, 2, 1, 4), 2, h);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i) / (d / 2), y = pos.getY(i) / (h / 2);
      const bow = z > 0 ? 1 - z * z : 1;
      pos.setX(i, pos.getX(i) * bow * (y < 0 ? 0.55 : 1));
    }
    geo.computeVertexNormals();
    // box face groups are +x, -x, +y (the deck), -y, +z, -z
    const index = Array.from(geo.index!.array), sides: number[] = [], deck: number[] = [];
    geo.groups.forEach((gr, k) => (k === 2 ? deck : sides).push(...index.slice(gr.start, gr.start + gr.count)));
    geo.setIndex([...sides, ...deck]);
    geo.clearGroups();
    geo.addGroup(0, sides.length, 0);
    geo.addGroup(sides.length, deck.length, 1);
    return geo;
  };
  const boats: { g: THREE.Group; phase: number }[] = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const s = rng.range(1, 1.8);
    const hull = new THREE.Mesh(hullGeo(1.6 * s, 0.6 * s, 4.5 * s), hullMats);
    hull.position.y = 0.2;
    b.add(hull);
    b.add(cyl(0.05, 0.05, 5 * s, mastMat, 0, 2.7 * s, 0.4));
    const sail = mesh(new THREE.PlaneGeometry(2.2 * s, 4.2 * s), sailMat, 0.05, 3 * s, -0.8 * s);
    sail.rotation.y = 0.3;
    b.add(sail);
    b.position.set(rng.range(xMin, xMax), 0, rng.range(zMin, zMax));
    b.rotation.y = rng.range(0, TAU);
    g.add(b);
    boats.push({ g: b, phase: rng.range(0, 10) });
  }
  return { group: g, update(t: number) { for (const b of boats) { b.g.position.y = Math.sin(t * 1.1 + b.phase) * 0.12; b.g.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.05; } } };
}

// ---------- countryside ----------
export function buildCountryside(_rng: Rng, heightAt: (x: number, z: number) => number, trackDist: (x: number, z: number) => number, mask?: ExclusionMask) {
  const g = new THREE.Group();
  // the country house among the fields, veranda turned towards the railway
  {
    const hx = 26, hz = -740;
    const rotY = -Math.PI / 2 + 0.5;
    const h = buildFarmhouse();
    h.position.set(hx, heightAt(hx, hz) - 0.1, hz);
    h.rotation.y = rotY;
    g.add(h);
    mask?.rect(hx + Math.cos(rotY) * 2.5, hz - Math.sin(rotY) * 2.5, 21, 14, rotY, 1.2);
    // a vegetable patch with a bamboo fence beside the house
    const fx = hx + 12, fz = hz + 6;
    const fence = new THREE.Group();
    const bamboo = toon(0xb8a778);
    for (let i = 0; i < 10; i++) fence.add(box(0.1, 1.1, 0.1, bamboo, -9 + i * 2, 0.55, 5));
    fence.add(box(18, 0.08, 0.08, bamboo, 0, 0.95, 5), box(18, 0.08, 0.08, bamboo, 0, 0.5, 5));
    const soil = toon(0x6a5238);
    for (let r = 0; r < 5; r++) fence.add(box(16, 0.25, 0.9, soil, 0, 0.05, -4 + r * 1.8));
    const leaf = toon(0x4f8a3a);
    const lrng = new Rng(55);
    for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) fence.add(sphere(lrng.range(0.25, 0.4), leaf, -7.5 + k * 1.15 + lrng.range(-0.1, 0.1), 0.35, -4 + r * 1.8, 7, 5));
    fence.position.set(fx, heightAt(fx, fz), fz);
    fence.rotation.y = rotY;
    g.add(fence);
    mask?.rect(fx, fz, 19, 12, rotY, 0.5);
  }
  // telephone poles along the right of the track
  {
    const poleMat = new THREE.MeshLambertMaterial({ map: woodGrain(0x7a6a5a, 320) });
    const wireMat = new THREE.LineBasicMaterial({ color: 0x2a2a2a });
    let prev: THREE.Vector3 | null = null;
    for (let z = -560; z > -1340; z -= 28) {
      // find a spot ~9 units right of the track by scanning
      let px = 0;
      for (let x = -80; x < 80; x += 0.5) { if (trackDist(x, z) < 9.5 && trackDist(x, z) > 8.5 && x > px) px = x; }
      if (px === 0) continue;
      const y = heightAt(px, z);
      const p = cyl(0.14, 0.18, 9, poleMat, px, y + 4.5, z);
      p.castShadow = true;
      g.add(p);
      g.add(box(2.2, 0.15, 0.15, poleMat, px, y + 8.6, z));
      const top = new THREE.Vector3(px, y + 8.6, z);
      if (prev) {
        for (const s of [-0.9, 0.9]) {
          const pts = [prev.clone().add(new THREE.Vector3(s, 0, 0)), prev.clone().lerp(top, 0.5).add(new THREE.Vector3(s, -0.8, 0)), top.clone().add(new THREE.Vector3(s, 0, 0))];
          g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(pts).getPoints(12)), wireMat));
        }
      }
      prev = top;
    }
  }
  // camphor tree on its hill with a torii and a small shrine
  {
    const tx = -112, tz = -900;
    const base = heightAt(tx, tz);
    const t = new THREE.Group();
    const trunkMat = new THREE.MeshLambertMaterial({ map: barkTexture(0x5a4636) });
    // bark UVs in world units: one tile wraps about 6 units of girth and 6 units of height
    const barkCyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, seg: number) => mesh(repeatUV(new THREE.CylinderGeometry(rt, rb, h, seg), Math.max(1, Math.round((TAU * (rt + rb)) / 2 / 6)), h / 6), trunkMat, x, y, z);
    const trunk = barkCyl(3.2, 5.5, 22, 0, 11, 0, 14);
    t.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const root = barkCyl(0.8, 1.8, 6, Math.cos(a) * 4.5, 1.5, Math.sin(a) * 4.5, 8);
      root.rotation.z = Math.cos(a) * 0.6; root.rotation.x = -Math.sin(a) * 0.6;
      t.add(root);
      const branch = barkCyl(0.7, 1.4, 14, Math.cos(a) * 6, 24, Math.sin(a) * 6, 8);
      branch.rotation.z = Math.cos(a) * 1.0; branch.rotation.x = -Math.sin(a) * 1.0;
      t.add(branch);
    }
    // the canopy: one huge soft crown made of many smaller clouds of leaves
    const crng = new Rng(1988);
    const blobs: Blob[] = [
      { c: new THREE.Vector3(0, 33, 0), r: new THREE.Vector3(17, 11, 17) },
      { c: new THREE.Vector3(13, 29, 5), r: new THREE.Vector3(10, 7.5, 10) },
      { c: new THREE.Vector3(-14, 30, -3), r: new THREE.Vector3(11, 8, 11) },
      { c: new THREE.Vector3(4, 29, -14), r: new THREE.Vector3(10, 7, 10) },
      { c: new THREE.Vector3(-4, 28, 13), r: new THREE.Vector3(10, 7.5, 10) },
      { c: new THREE.Vector3(9, 39, -7), r: new THREE.Vector3(8, 6, 8) },
      { c: new THREE.Vector3(-9, 40, 6), r: new THREE.Vector3(8, 6, 8) },
      { c: new THREE.Vector3(1, 44, 1), r: new THREE.Vector3(7, 5, 7) },
      { c: new THREE.Vector3(18, 25, -6), r: new THREE.Vector3(6, 4.5, 6) },
      { c: new THREE.Vector3(-17, 25, 9), r: new THREE.Vector3(6, 4.5, 6) },
    ];
    t.add(fluffyTree(blobs, 0x4a8a3c, crng, { density: 0.16, cardScale: 0.55 }));
    t.position.set(tx, base - 1, tz);
    trunk.castShadow = true;
    g.add(t);
    mask?.circle(tx, tz, 8);
    // torii at the base of the hill facing the track
    const torii = new THREE.Group();
    const post = new THREE.MeshLambertMaterial({ map: vermilion() });
    const red = new THREE.MeshLambertMaterial({ map: lacquer(0xc8402c) });
    torii.add(cyl(0.35, 0.4, 7, post, -2.6, 3.5, 0, 16), cyl(0.35, 0.4, 7, post, 2.6, 3.5, 0, 16));
    torii.add(box(8, 0.5, 0.6, toon(0x2a2a2a), 0, 7.2, 0), box(6.4, 0.4, 0.4, red, 0, 6.1, 0), box(0.5, 0.7, 0.3, red, 0, 6.65, 0));
    const tox = -62, toz = -880;
    torii.position.set(tox, heightAt(tox, toz), toz);
    mask?.path([{ x: tox, z: toz }, { x: -97, z: -894 }], 2.4);
    torii.rotation.y = Math.PI / 2 + 0.3;
    g.add(torii);
    // stone lanterns along the approach
    const stone = new THREE.MeshLambertMaterial({ map: granite(0x9a9a92) });
    for (let i = 0; i < 4; i++) {
      const lx = -70 - i * 9, lz = -885 - i * 3;
      const ly = heightAt(lx, lz);
      const l = new THREE.Group();
      l.add(cyl(0.3, 0.4, 1.6, stone, 0, 0.8, 0, 10), box(0.9, 0.7, 0.9, stone, 0, 1.95, 0), cone(0.8, 0.5, stone, 0, 2.55, 0, 4));
      l.add(box(0.5, 0.4, 0.5, glow(0xffd28a, 0.9), 0, 1.95, 0));
      l.position.set(lx, ly, lz);
      g.add(l);
    }
  }
  // bus stop with sign, and jizo statues
  {
    const sx = 8.5, sz = -1152;
    const y = heightAt(sx, sz);
    const s = new THREE.Group();
    s.add(cyl(0.06, 0.06, 3.2, toon(0x3a3a3a), 0, 1.6, 0));
    const signTex = canvasTexture(256, 128, (c, w, h) => {
      c.fillStyle = '#efe9da'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#2a5a9a'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = '#1f3a6a'; c.font = 'bold 54px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('稲荷前', w / 2, h / 2 - 8);
      c.font = '20px sans-serif'; c.fillText('INARI-MAE', w / 2, h - 24);
    });
    const plate = mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshLambertMaterial({ map: signTex, side: THREE.DoubleSide }), 0, 2.9, 0);
    plate.rotation.y = -Math.PI / 2;
    s.add(plate);
    s.position.set(sx, y, sz);
    g.add(s);
    mask?.circle(sx + 1, sz - 1, 3.2);
    mask?.path([{ x: 12, z: -1140 }, { x: 18, z: -1137 }], 2.2);
    // jizo statues with red bibs
    const jStone = new THREE.MeshLambertMaterial({ map: granite(0x8e8f88, 321) });
    const jFace = new THREE.MeshLambertMaterial({ map: jizoHead(0x8e8f88) });
    const bib = new THREE.MeshLambertMaterial({ map: fabric(0xc9302c, { hem: true, folds: 4, seed: 322 }), side: THREE.DoubleSide });
    const plinth = new THREE.MeshLambertMaterial({ map: granite(0x77786f, 323) });
    for (let i = 0; i < 6; i++) {
      const jx = 12 + i * 1.2, jz = -1140 + i * 0.6;
      const jy = heightAt(jx, jz);
      const j = new THREE.Group();
      j.add(capsule(0.28, 0.5, jStone, 0, 0.6, 0));
      j.add(sphere(0.26, jFace, 0, 1.1, 0, 20, 14));
      // a red cloth bib tied at the neck, flaring over the chest
      j.add(mesh(new THREE.CylinderGeometry(0.3, 0.37, 0.4, 12, 1, true, -1.25, 2.5), bib, 0, 0.72, 0));
      j.add(box(3, 0.3, 1.6, plinth, 0, -0.05, 0));
      j.position.set(jx, jy + 0.1, jz);
      j.rotation.y = -Math.PI / 2;
      g.add(j);
    }
  }
  return g;
}

/** Trees for the whole world, chosen by region. */
export function buildForests(rng: Rng, heightAt: (x: number, z: number) => number, trackDist: (x: number, z: number) => number, mask?: ExclusionMask) {
  const g = new THREE.Group();
  // clear of the track, above water, and not on a street, house or yard
  const okLand = (min: number) => (x: number, z: number) => trackDist(x, z) > min && heightAt(x, z) > 0.6 && (!mask || (mask.at(x, z) > 0.95 && mask.at(x + 2, z) > 0.9 && mask.at(x - 2, z) > 0.9 && mask.at(x, z + 2) > 0.9 && mask.at(x, z - 2) > 0.9));
  // Koriko: dark conifers on the hill, round trees in gardens
  g.add(fluffyForest({ shape: 'conifer', trunk: 0x5a4636, leaves: [0x2f6b46, 0x3b7a4f, 0x2a5f40] }, scatter(rng, 90, -220, -12, -600, 40, (x, z) => okLand(10)(x, z) && Math.hypot(x + 46, z + 250) > 24, heightAt, [0.9, 1.5]), rng, { castShadow: true }));
  g.add(fluffyForest({ shape: 'round', trunk: 0x6a5040, leaves: [0x5a9a44, 0x6aa84c, 0x4e8e40] }, scatter(rng, 60, -200, 44, -600, 40, (x, z) => okLand(12)(x, z), heightAt, [0.8, 1.25]), rng, { castShadow: true }));
  // countryside: broad trees, groves, poplars along fields
  g.add(fluffyForest({ shape: 'broad', trunk: 0x5e4838, leaves: [0x4c8d3a, 0x5a9a42, 0x3f7f36, 0x6ea24c] }, scatter(rng, 160, -260, 200, -1340, -600, (x, z) => okLand(14)(x, z) && Math.hypot(x + 112, z + 900) > 30 && Math.hypot(x - 26, z + 740) > 16, heightAt, [0.85, 1.4]), rng, { castShadow: true, variants: 4 }));
  g.add(fluffyForest({ shape: 'poplar', trunk: 0x6a5040, leaves: [0x3f8436, 0x4c9240] }, scatter(rng, 60, -240, 200, -1340, -600, (x, z) => okLand(16)(x, z), heightAt, [0.9, 1.35]), rng, { castShadow: false }));
  // dense grove around the camphor hill
  g.add(fluffyForest({ shape: 'round', trunk: 0x4f3e30, leaves: [0x2f6b40, 0x3b7a48, 0x35704a] }, scatter(rng, 70, -170, -50, -960, -840, (x, z) => okLand(12)(x, z) && Math.hypot(x + 112, z + 900) > 22 && Math.hypot(x + 112, z + 900) < 62, heightAt, [0.8, 1.35]), rng, { castShadow: true }));
  // the kodama's island: a dense old wood with a clearing for the tree spirits
  g.add(fluffyForest({ shape: 'broad', trunk: 0x3a2e28, leaves: [0x2a4a3a, 0x335a44, 0x2f5240] }, scatter(rng, 46, 18, 100, -2092, -2008, (x, z) => okLand(9)(x, z) && Math.hypot(x - 58, z + 2050) < 36 && Math.hypot(x - 52, z + 2050) > 10, heightAt, [1.0, 1.7]), rng, { castShadow: true }));
  // spirit sea islands: dark pines
  g.add(fluffyForest({ shape: 'conifer', trunk: 0x3a2e28, leaves: [0x1e3a34, 0x24443a, 0x1a3330] }, scatter(rng, 90, -200, 200, -2330, -1440, (x, z) => okLand(9)(x, z) && Math.hypot(x + 70, z + 1750) > 34, heightAt, [0.9, 1.6]), rng, { castShadow: true }));
  return g;
}

// ---------- spirit sea ----------
export function buildSpiritSea(rng: Rng, heightAt: (x: number, z: number) => number, _trackDist: (x: number, z: number) => number, trackPoint: (z: number) => { x: number; y: number }) {
  const g = new THREE.Group();
  const lanterns: THREE.Mesh[] = [];
  const lanternMat = glow(0xffb36b, 1.9);
  const paperMat = new THREE.MeshLambertMaterial({ color: 0xff6b4a, emissive: 0xff5a30, emissiveIntensity: 0.9 });
  const lantern = (x: number, y: number, z: number, s = 1) => {
    const l = new THREE.Group();
    l.add(mesh(new THREE.SphereGeometry(0.42 * s, 10, 8), paperMat, 0, 0, 0));
    const core = sphere(0.22 * s, lanternMat, 0, 0, 0);
    l.add(core);
    l.add(cyl(0.12 * s, 0.12 * s, 0.14 * s, toon(0x2a2a2a), 0, 0.46 * s, 0));
    l.position.set(x, y, z);
    lanterns.push(core);
    return l;
  };
  // signal posts and mile markers along the flooded track
  const postMat = toon(0x4a4f55);
  for (let z = -1470; z > -2240; z -= 55) {
    const p = trackPoint(z);
    const side = rng.sign();
    const x = p.x + side * 5.5;
    const post = new THREE.Group();
    post.add(cyl(0.12, 0.16, 4.5, postMat, 0, 2.25, 0));
    post.add(box(0.5, 0.5, 0.5, postMat, 0, 4.6, 0));
    post.add(box(0.3, 0.3, 0.3, glow(rng.chance(0.5) ? 0x7fe0a0 : 0xff7a5a, 1.6), 0, 4.6, 0));
    post.position.set(x, 0, z);
    g.add(post);
  }
  // platforms: stone-faced slabs standing in the water, a pitched shelter on slim posts, a name board and lanterns
  const stoneTex = canvasTexture(256, 128, (c, w, h) => {
    const r2 = new Rng(31);
    c.fillStyle = '#5f5a52'; c.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      let x = row % 2 ? -24 : 0;
      while (x < w) {
        const bw = r2.range(40, 64), v = Math.round(r2.range(120, 160));
        c.fillStyle = `rgb(${v},${v - 4},${v - 12})`; c.fillRect(x + 2, row * 32 + 2, bw - 4, 28);
        c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x + 2, row * 32 + 2, bw - 4, 4);
        x += bw;
      }
    }
    c.fillStyle = 'rgba(40,60,50,0.5)'; c.fillRect(0, h - 26, w, 26);
  });
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTex });
  const pavingMat = lambert(0x9d978c), edgeMat = lambert(0xe6e0cf), roofMat = toon(0x33413c), ironMat = toon(0x2a2f2c);
  const platform = (z: number, side: number, len = 16, roof = true) => {
    const p = trackPoint(z);
    const x = p.x + side * 5.2;
    const pg = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.2, len), stoneMat);
    const uv = body.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 4, uv.getY(i) * 0.8);
    body.position.y = -0.5;
    pg.add(body);
    pg.add(box(4.5, 0.12, len, pavingMat, 0, 1.06, 0));
    pg.add(box(0.35, 0.13, len, edgeMat, -side * 2.0, 1.07, 0));
    if (roof) {
      for (const dz of [-len / 2 + 2, 0, len / 2 - 2]) pg.add(cyl(0.1, 0.12, 3.9, ironMat, side * 1.4, 3.05, dz));
      const r = mesh(roofGeometry(3.6, len - 1, 1.1, 0.35), roofMat, side * 0.6, 5.0, 0);
      pg.add(r);
      pg.add(lantern(side * 1.4, 4.4, -len / 2 + 2, 0.9), lantern(side * 1.4, 4.4, len / 2 - 2, 0.9));
    }
    // station name board on two posts
    const nb = new THREE.Group();
    nb.add(cyl(0.06, 0.06, 2.2, ironMat, -0.9, 1.1, 0), cyl(0.06, 0.06, 2.2, ironMat, 0.9, 1.1, 0));
    nb.add(box(2.4, 0.7, 0.08, edgeMat, 0, 2.0, 0));
    nb.add(box(1.6, 0.12, 0.09, ironMat, 0, 2.05, 0));
    nb.position.set(side * 0.9, 1.1, len / 2 - 1.2);
    nb.rotation.y = Math.PI / 2;
    pg.add(nb);
    pg.add(box(2, 0.12, 0.6, toon(0x5a4a3a), side * 1.6, 1.55, 0), box(0.12, 0.45, 0.5, ironMat, side * 1.6 - 0.8, 1.3, 0), box(0.12, 0.45, 0.5, ironMat, side * 1.6 + 0.8, 1.3, 0)); // bench
    pg.position.set(x, 0, z);
    g.add(pg);
    return { x, z, y: 1.12, group: pg };
  };
  const p1 = platform(-1560, 1);
  const p2 = platform(-1640, -1, 12, false);
  const p3 = platform(-1900, -1, 10);
  const p4 = platform(-2270, 1, 22);
  // bathhouse island
  const bath = new THREE.Group();
  {
    const bx = -70, bz = -1750;
    const base = heightAt(bx, bz);
    const house = buildBathhouse(lantern);
    bath.add(house.group);
    // the big sign on the fourth tier
    const signTex = canvasTexture(128, 128, (c) => { c.fillStyle = '#8f2a20'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#e8c070'; c.lineWidth = 6; c.strokeRect(6, 6, 116, 116); c.fillStyle = '#ffd88a'; c.font = 'bold 88px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('油', 64, 70); });
    bath.add(mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: signTex, color: 0xdddddd }), 0, 30.8, 9.08));
    // red bridge out over the water towards the track
    const bridge = new THREE.Group();
    bridge.add(box(6, 0.6, 40, toon(0xc0392b), 0, 3.4, 0));
    for (let i = -18; i <= 18; i += 4) {
      bridge.add(cyl(0.12, 0.12, 2, toon(0xc0392b), -2.8, 4.7, i), cyl(0.12, 0.12, 2, toon(0xc0392b), 2.8, 4.7, i));
      bridge.add(lantern(-2.8, 5.9, i, 0.7), lantern(2.8, 5.9, i, 0.7));
      bridge.add(cyl(0.5, 0.6, 4, toon(0x6a5040), -2.5, 1.5, i), cyl(0.5, 0.6, 4, toon(0x6a5040), 2.5, 1.5, i));
    }
    bridge.add(box(0.15, 0.6, 40, toon(0xc0392b), -2.8, 5.6, 0), box(0.15, 0.6, 40, toon(0xc0392b), 2.8, 5.6, 0));
    bridge.position.set(38, -base, 8);
    bridge.rotation.y = Math.PI / 2;
    bath.add(bridge);
    bath.position.set(bx, base, bz);
    bath.rotation.y = Math.PI / 2 - 0.25;
    g.add(bath);
    // warm light spilling from the bathhouse
    const pl = new THREE.PointLight(0xffa860, 60, 140, 1.4);
    pl.position.set(bx + 10, base + 20, bz);
    g.add(pl);
  }
  // Zeniba's cottage past the final station
  {
    const cx = 26, cz = -2295;
    const base = heightAt(cx, cz);
    const c = new THREE.Group();
    c.add(buildCottage());
    // garden fence and gate
    for (let i = 0; i < 14; i++) c.add(box(0.15, 1.2, 0.15, toon(0xb8a78a), -8 + i * 1.25, 0.6, 7));
    c.add(box(17, 0.1, 0.1, toon(0xb8a78a), 0, 1.0, 7));
    c.position.set(cx, base, cz);
    c.rotation.y = Math.PI;
    g.add(c);
  }
  return { group: g, lanterns, platforms: { noFace: p1, soot: p2, radish: p3, end: p4 }, bathhouse: bath };
}

/** The Spirited Away style sea train: railcar behind an open front deck for the photographer. */
export function buildSeaTrain() {
  const g = new THREE.Group();
  // painted steel in panels with riveted seams; UVs are in world units so every panel is the same size
  const paint = new THREE.MeshLambertMaterial({ map: trainPanels(0x2d5a4a) });
  const cream = new THREE.MeshLambertMaterial({ map: creamPaint(0xe8dcc0) });
  const dark = new THREE.MeshLambertMaterial({ map: ironTexture(0x2a2c30, 308) });
  const B = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => mesh(boxUV(new THREE.BoxGeometry(w, h, d), 1.6), mat, x, y, z);
  // car body behind the deck: local +z is forward. The front cabin is hollow so you can see the passengers.
  const car = new THREE.Group();
  // rear body (solid)
  car.add(B(3.2, 2.7, 8.0, paint, 0, 1.9, -8.7));
  car.add(B(3.3, 0.5, 8.1, cream, 0, 1.4, -8.7));
  // cabin side walls (z -1.1 .. -4.7)
  for (const sx of [-1, 1]) {
    car.add(B(0.1, 2.7, 3.6, paint, sx * 1.55, 1.9, -2.9));
    car.add(B(0.12, 0.5, 3.6, cream, sx * 1.6, 1.4, -2.9));
  }
  // front wall pieces around the window opening (y 1.7 .. 2.85, x -1.2 .. 1.2)
  car.add(B(3.2, 1.15, 0.3, paint, 0, 1.125, -0.95));
  car.add(B(3.3, 0.5, 0.32, cream, 0, 1.4, -0.95));
  car.add(B(3.2, 0.4, 0.3, paint, 0, 3.05, -0.95));
  car.add(B(0.4, 1.15, 0.3, paint, -1.4, 2.275, -0.95), B(0.4, 1.15, 0.3, paint, 1.4, 2.275, -0.95));
  const roofGeo = repeatUV(new THREE.CylinderGeometry(1.7, 1.7, 12.2, 16, 1, false, 0, Math.PI), 1, 10);
  const roof = mesh(roofGeo, new THREE.MeshLambertMaterial({ map: trainRoof(0x3a3f44) }), 0, 3.25, -6.9);
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
  roof.scale.y = 1; roof.scale.x = 0.55;
  car.add(roof);
  const win = trainWindow();
  const winMat = new THREE.MeshLambertMaterial({ map: win.map, emissive: 0xffffff, emissiveMap: win.glow, emissiveIntensity: 0.9 });
  const windows: THREE.Mesh[] = [];
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
    const w = box(0.06, 1.1, 1.4, winMat, s * 1.62, 2.25, -2.5 - i * 2.1);
    car.add(w); windows.push(w);
  }
  // glass in the opening
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ea, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0, depthWrite: false });
  car.add(box(2.4, 1.15, 0.03, glass, 0, 2.275, -0.95));
  // interior: warm panels, a bench facing forward, and the passengers
  const interior = new THREE.Group();
  const panel = new THREE.MeshLambertMaterial({ map: cabinPanels(), emissive: 0x6a5230, emissiveIntensity: 0.6 });
  const P = (w: number, h: number, d: number, x: number, y: number, z: number) => mesh(boxUV(new THREE.BoxGeometry(w, h, d), 1.3), panel, x, y, z);
  interior.add(P(3.0, 2.6, 0.1, 0, 1.9, -4.65));
  interior.add(P(0.06, 2.6, 3.6, -1.47, 1.9, -2.9), P(0.06, 2.6, 3.6, 1.47, 1.9, -2.9));
  interior.add(mesh(boxUV(new THREE.BoxGeometry(3.0, 0.1, 3.7), 1), new THREE.MeshLambertMaterial({ map: deckPlanks(0x6a4e3a) }), 0, 0.62, -2.9));
  interior.add(box(3.0, 0.1, 3.7, lambert(0xd9c9a0, { emissive: 0x6a5230, emissiveIntensity: 0.6 }), 0, 3.18, -2.9));
  const benchWood = new THREE.MeshLambertMaterial({ map: woodGrain(0x7a5a3a, 309) });
  interior.add(box(2.6, 0.14, 0.6, benchWood, 0, 1.1, -2.1), box(2.6, 0.7, 0.12, benchWood, 0, 1.4, -2.4));
  const shade = new THREE.MeshBasicMaterial({ color: 0x0a0c12, transparent: true, opacity: 0.7 });
  interior.add(capsule(0.26, 0.9, shade, 1.0, 1.75, -3.7), sphere(0.2, shade, 1.0, 2.45, -3.7), cyl(0.35, 0.35, 0.2, shade, 1.0, 2.7, -3.7));
  car.add(interior);
  // wheels / bogies
  for (const s of [-1, 1]) for (const z of [-2.5, -10.5]) car.add(B(0.5, 0.9, 2.6, dark, s * 1.3, 0.45, z));
  g.add(car);
  // open deck at the front with railings and a lantern; the boards are right under the camera
  const deck = new THREE.Group();
  deck.add(mesh(boxUV(new THREE.BoxGeometry(3.2, 0.3, 4.4), 1), new THREE.MeshLambertMaterial({ map: deckPlanks(0x5a4230) }), 0, 0.45, 1.8));
  deck.add(mesh(boxUV(new THREE.BoxGeometry(3.4, 0.08, 4.6), 1), new THREE.MeshLambertMaterial({ map: deckPlanks(0x8a6a4a) }), 0, 0.62, 1.8));
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 0.8, roughness: 0.35 });
  const post = (x: number, z: number) => deck.add(cyl(0.035, 0.035, 1.05, railMat, x, 1.15, z));
  for (const x of [-1.5, 1.5]) { post(x, 0.2); post(x, 2.0); post(x, 3.9); }
  post(-0.9, 3.95); post(0.9, 3.95);
  for (const x of [-1.5, 1.5]) { const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.8, 6), railMat, x, 1.68, 2.05); r.rotation.x = Math.PI / 2; deck.add(r); }
  { const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 6), railMat, 0, 1.68, 3.95); r.rotation.z = Math.PI / 2; deck.add(r); }
  const lamp = new THREE.Group();
  // a tall corner pole with a hanging lantern, kept above the eyeline so it never blocks a shot
  lamp.add(cyl(0.03, 0.035, 2.6, dark, 0, 1.9, 0), cyl(0.02, 0.02, 0.5, dark, -0.25, 3.15, 0).rotateZ(Math.PI / 2), cyl(0.012, 0.012, 0.3, dark, -0.5, 3.0, 0));
  lamp.add(box(0.15, 0.2, 0.15, dark, -0.5, 2.78, 0), box(0.11, 0.15, 0.11, glow(0xffd28a, 1.05), -0.5, 2.78, 0), cone(0.12, 0.08, dark, -0.5, 2.91, 0, 4));
  lamp.position.set(1.5, 0, 3.9);
  deck.add(lamp);
  const light = new THREE.PointLight(0xffc88a, 2.2, 11, 1.6);
  light.position.set(1.0, 2.75, 3.7);
  deck.add(light);
  g.add(deck);
  const cabinLight = new THREE.PointLight(0xffd9a0, 3, 6, 1.4);
  cabinLight.position.set(0, 2.7, -2.4);
  car.add(cabinLight);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return { group: g, windows, winMat, light, interior, cabinLight };
}

export function scatterPlacements(rng: Rng, n: number, cx: number, cz: number, r: number, heightAt: (x: number, z: number) => number): Placement[] {
  const out: Placement[] = [];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), d = Math.sqrt(rng.next()) * r;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    out.push({ x, y: heightAt(x, z), z, scale: rng.range(0.7, 1.3), rot: rng.range(0, TAU) });
  }
  return out;
}
export { lerp };
