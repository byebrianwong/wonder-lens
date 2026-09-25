import * as THREE from 'three';
import { toon, lambert, glow, box, cyl, cone, mesh, roofGeometry, pagodaRoofGeometry, facadeTextures, textTexture, sphere, instancedTrees, scatter, type Placement, canvasTexture, capsule } from '../../engine/Builders';
import { Rng, TAU, lerp } from '../../engine/math';

// ---------- Koriko (Kiki's seaside town) ----------
export function buildKorikoTown(rng: Rng, heightAt: (x: number, z: number) => number, trackDist: (x: number, z: number) => number) {
  const g = new THREE.Group();
  const walls = [0xf3e4c6, 0xf6d3b3, 0xe9c6bd, 0xd9e3e8, 0xf0e2a9, 0xe3d1e6, 0xf7efe0];
  const roofs = [0xb9573d, 0xc66a4b, 0x8f4a39, 0xa8563f, 0x4f7f6e];
  const facades = [
    facadeTextures({ wall: '#ffffff', window: '#e9f3ff', frame: '#f8f3e6', rows: 3, cols: 2, lit: 0.15, rng, shutters: '#5f8a6b', sill: true }),
    facadeTextures({ wall: '#ffffff', window: '#e6f0fa', frame: '#f8f3e6', rows: 4, cols: 3, lit: 0.1, rng, sill: true }),
    facadeTextures({ wall: '#ffffff', window: '#f0f6ff', frame: '#e8dfd0', rows: 3, cols: 3, lit: 0.2, rng, shutters: '#8a5a4a' }),
  ];
  const roofGeoCache = new Map<string, THREE.BufferGeometry>();
  const house = (x: number, z: number, w: number, d: number, h: number, faceAngle: number, wall: number, roof: number) => {
    const hg = new THREE.Group();
    const f = rng.pick(facades);
    const mat = new THREE.MeshLambertMaterial({ color: wall, map: f.map });
    const body = box(w, h, d, mat, 0, h / 2, 0);
    body.castShadow = true;
    hg.add(body);
    const key = `${w.toFixed(1)}_${d.toFixed(1)}`;
    let rg = roofGeoCache.get(key);
    if (!rg) { rg = roofGeometry(w, d, Math.min(w, d) * 0.5, 0.4); roofGeoCache.set(key, rg); }
    hg.add(mesh(rg, toon(roof), 0, h, 0));
    // chimney
    if (rng.chance(0.6)) hg.add(box(0.6, 1.4, 0.6, toon(0x8a7a6a), w * 0.25, h + 0.9, d * 0.2));
    hg.position.set(x, heightAt(x, z) - 0.3, z);
    hg.rotation.y = faceAngle;
    g.add(hg);
    return hg;
  };
  // hillside blocks on the left of the track (negative x), a few by the water on the right
  let placed = 0;
  let tries = 0;
  const spots: { x: number; z: number }[] = [];
  while (placed < 70 && tries < 2000) {
    tries++;
    const left = rng.chance(0.82);
    const x = left ? rng.range(-150, -11) : rng.range(12, 42);
    const z = rng.range(-560, 30);
    if (trackDist(x, z) < 9.5) continue;
    if (Math.abs(z + 6) < 16 && x > -16) continue; // station
    if (!left && heightAt(x, z) < 0.5) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 12)) continue;
    // keep the clock tower square clear
    if (Math.hypot(x + 46, z + 250) < 22) continue;
    spots.push({ x, z });
    const w = rng.range(5, 8), d = rng.range(6, 9), h = rng.range(7, 15);
    house(x, z, w, d, h, left ? Math.PI / 2 : -Math.PI / 2, rng.pick(walls), rng.pick(roofs));
    placed++;
  }
  // clock tower
  {
    const tx = -46, tz = -250;
    const base = heightAt(tx, tz) - 0.5;
    const t = new THREE.Group();
    const stone = toon(0xe6d9bf);
    const f = facadeTextures({ wall: '#ffffff', window: '#dce8f5', frame: '#efe6d3', rows: 6, cols: 2, lit: 0.1, rng, sill: true });
    t.add(box(10, 34, 10, new THREE.MeshLambertMaterial({ color: 0xe9dcc4, map: f.map }), 0, 17, 0));
    t.add(box(12, 3, 12, stone, 0, 35, 0));
    const clock = textTexture('', { w: 128, h: 128 });
    void clock;
    const face = canvasTexture(128, 128, (c) => {
      c.fillStyle = '#f7f2e4'; c.beginPath(); c.arc(64, 64, 58, 0, TAU); c.fill();
      c.strokeStyle = '#3a3a3a'; c.lineWidth = 4; c.stroke();
      c.lineWidth = 5; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 22); c.moveTo(64, 64); c.lineTo(94, 72); c.stroke();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.beginPath(); c.arc(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48, 2.5, 0, TAU); c.fill(); }
    });
    for (let i = 0; i < 4; i++) {
      const m = mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({ map: face }), 0, 30, 0);
      const a = (i / 4) * TAU;
      m.position.set(Math.sin(a) * 5.05, 30, Math.cos(a) * 5.05);
      m.rotation.y = a;
      t.add(m);
    }
    t.add(mesh(pagodaRoofGeometry(13, 9, 0.1), toon(0x4f7f6e), 0, 36.5, 0));
    t.add(cyl(0.15, 0.15, 5, toon(0xd8c090), 0, 47, 0));
    t.add(sphere(0.6, glow(0xffd888, 1.2), 0, 49.5, 0));
    t.position.set(tx, base, tz);
    t.children.forEach((c) => (c.castShadow = true));
    g.add(t);
    // plaza around it
    g.add(mesh(new THREE.CylinderGeometry(20, 20, 0.6, 24), lambert(0xd6c9b0), tx, base + 0.1, tz));
  }
  // church with a spire further up the hill
  {
    const cx = -120, cz = -140;
    const base = heightAt(cx, cz) - 0.5;
    const c = new THREE.Group();
    c.add(box(12, 12, 24, toon(0xf1e8d4), 0, 6, 0));
    c.add(mesh(roofGeometry(12, 24, 5, 0.4), toon(0x8f4a39), 0, 12, 0));
    c.add(box(6, 22, 6, toon(0xf1e8d4), 0, 11, 13));
    c.add(cone(4.6, 12, toon(0x4f7f6e), 0, 28, 13, 4));
    c.position.set(cx, base, cz);
    g.add(c);
  }
  // bakery by the track with a striped awning
  {
    const bx = 16, bz = -390;
    const base = heightAt(bx, bz) - 0.3;
    const b = new THREE.Group();
    b.add(box(9, 7, 8, toon(0xf4e9d8), 0, 3.5, 0));
    b.add(mesh(roofGeometry(9, 8, 3, 0.4), toon(0xb9573d), 0, 7, 0));
    const awning = canvasTexture(128, 32, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f7f3ea' : '#c94b3f'; c.fillRect(i * 16, 0, 16, 32); } });
    const aw = mesh(new THREE.PlaneGeometry(8, 2.2), new THREE.MeshLambertMaterial({ map: awning, side: THREE.DoubleSide }), 0, 4.2, -4.9);
    aw.rotation.x = -0.9 + Math.PI;
    b.add(aw);
    b.add(box(5, 3.2, 0.2, glow(0xffe0a8, 0.9), 0, 2.2, -4.05));
    const sign = textTexture('BAKERY', { font: 'bold 44px serif', color: '#3a2a20', bg: '#f7f3ea', w: 256, h: 64 });
    b.add(mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshBasicMaterial({ map: sign }), 0, 5.6, -4.05).rotateY(Math.PI));
    b.position.set(bx, base, bz);
    b.rotation.y = Math.PI;
    g.add(b);
  }
  return g;
}

export function buildSailboats(rng: Rng, count: number, xMin: number, xMax: number, zMin: number, zMax: number) {
  const g = new THREE.Group();
  const hullMat = toon(0x4b5a6a), sailMat = toon(0xfff8ea, { side: THREE.DoubleSide });
  const boats: { g: THREE.Group; phase: number }[] = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const s = rng.range(1, 1.8);
    const hull = box(1.6 * s, 0.6 * s, 4.5 * s, hullMat, 0, 0.2, 0);
    b.add(hull);
    b.add(cyl(0.05, 0.05, 5 * s, toon(0x8a6a4a), 0, 2.7 * s, 0.4));
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
export function buildCountryside(rng: Rng, heightAt: (x: number, z: number) => number, trackDist: (x: number, z: number) => number) {
  const g = new THREE.Group();
  // Satsuki & Mei's house
  {
    const hx = 26, hz = -740;
    const base = heightAt(hx, hz) - 0.3;
    const h = new THREE.Group();
    const f = facadeTextures({ wall: '#ffffff', window: '#dbe8f2', frame: '#d9c9a8', rows: 2, cols: 3, lit: 0.2, rng, sill: true });
    h.add(box(10, 7, 9, new THREE.MeshLambertMaterial({ color: 0xf1e6d2, map: f.map }), 0, 3.5, 0));
    h.add(mesh(roofGeometry(10, 9, 3.6, 0.6), toon(0xb84a3a), 0, 7, 0));
    h.add(box(8, 4, 7, toon(0xd9c9a8), 8, 2, 1));
    h.add(mesh(roofGeometry(8, 7, 2.2, 0.7), toon(0x6f8b6a), 8, 4, 1));
    h.add(box(1.5, 6, 0.4, toon(0xc9b28a), -3, 3, 4.7)); // porch post
    h.add(box(3, 2.4, 0.2, glow(0xffe4b0, 0.6), 0, 2.4, 4.6));
    h.position.set(hx, base, hz);
    h.rotation.y = Math.PI * 0.05;
    h.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
    g.add(h);
    // a small vegetable patch and a fence
    for (let i = 0; i < 9; i++) g.add(box(0.12, 1.1, 0.12, toon(0xb8a78a), hx - 9 + i * 2.2, base + 0.55, hz + 8));
    g.add(box(18, 0.1, 0.1, toon(0xb8a78a), hx, base + 0.95, hz + 8));
  }
  // telephone poles along the right of the track
  {
    const poleMat = toon(0x6b5a4a);
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
    const trunkMat = toon(0x5a4636);
    const trunk = cyl(3.2, 5.5, 22, trunkMat, 0, 11, 0, 10);
    t.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const root = cyl(0.8, 1.8, 6, trunkMat, Math.cos(a) * 4.5, 1.5, Math.sin(a) * 4.5, 6);
      root.rotation.z = Math.cos(a) * 0.6; root.rotation.x = -Math.sin(a) * 0.6;
      t.add(root);
      const branch = cyl(0.7, 1.4, 14, trunkMat, Math.cos(a) * 6, 24, Math.sin(a) * 6, 6);
      branch.rotation.z = Math.cos(a) * 1.0; branch.rotation.x = -Math.sin(a) * 1.0;
      t.add(branch);
    }
    const canopyMat = toon(0x4e8a3f);
    const blobs = [[0, 34, 0, 19], [12, 30, 4, 12], [-13, 31, -3, 13], [4, 30, -12, 11], [-3, 29, 12, 12], [9, 38, -8, 9], [-9, 39, 7, 9]];
    for (const [x, y, z, r] of blobs) {
      const b = mesh(new THREE.IcosahedronGeometry(r, 1), canopyMat, x, y, z);
      b.scale.y = 0.8;
      b.castShadow = true;
      t.add(b);
    }
    t.position.set(tx, base - 1, tz);
    trunk.castShadow = true;
    g.add(t);
    // torii at the base of the hill facing the track
    const torii = new THREE.Group();
    const red = toon(0xc23a2a);
    torii.add(cyl(0.35, 0.4, 7, red, -2.6, 3.5, 0), cyl(0.35, 0.4, 7, red, 2.6, 3.5, 0));
    torii.add(box(8, 0.5, 0.6, toon(0x2a2a2a), 0, 7.2, 0), box(6.4, 0.4, 0.4, red, 0, 6.1, 0));
    const tox = -62, toz = -880;
    torii.position.set(tox, heightAt(tox, toz), toz);
    torii.rotation.y = Math.PI / 2 + 0.3;
    g.add(torii);
    // stone lanterns along the approach
    for (let i = 0; i < 4; i++) {
      const lx = -70 - i * 9, lz = -885 - i * 3;
      const ly = heightAt(lx, lz);
      const l = new THREE.Group();
      l.add(cyl(0.3, 0.4, 1.6, toon(0x9a9a92), 0, 0.8, 0), box(0.9, 0.7, 0.9, toon(0x8a8a82), 0, 1.95, 0), cone(0.8, 0.5, toon(0x8a8a82), 0, 2.55, 0, 4));
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
    // jizo statues with red bibs
    for (let i = 0; i < 6; i++) {
      const jx = 12 + i * 1.2, jz = -1140 + i * 0.6;
      const jy = heightAt(jx, jz);
      const j = new THREE.Group();
      j.add(capsule(0.28, 0.5, toon(0x8e8f88), 0, 0.6, 0));
      j.add(sphere(0.26, toon(0x8e8f88), 0, 1.1, 0));
      j.add(box(0.45, 0.35, 0.1, toon(0xc9302c), 0, 0.75, 0.25));
      j.add(box(3, 0.3, 1.6, toon(0x77786f), 0, -0.05, 0));
      j.position.set(jx, jy + 0.1, jz);
      j.rotation.y = -Math.PI / 2;
      g.add(j);
    }
  }
  return g;
}

/** Trees for the whole world, chosen by region. */
export function buildForests(rng: Rng, heightAt: (x: number, z: number) => number, trackDist: (x: number, z: number) => number) {
  const g = new THREE.Group();
  const okLand = (min: number) => (x: number, z: number) => trackDist(x, z) > min && heightAt(x, z) > 0.6;
  // Koriko: cypress on the hill, round trees in gardens
  g.add(instancedTrees({ trunk: 0x5a4636, canopy: [0x2f6b46, 0x3b7a4f, 0x2a5f40], shape: 'cone' }, scatter(rng, 90, -220, -12, -600, 40, (x, z) => okLand(10)(x, z) && Math.hypot(x + 46, z + 250) > 24, heightAt, [0.9, 1.6]), rng, true));
  g.add(instancedTrees({ trunk: 0x6a5040, canopy: [0x58a34a, 0x6ab35a, 0x4d9646], shape: 'round' }, scatter(rng, 60, -200, 44, -600, 40, (x, z) => okLand(12)(x, z), heightAt, [0.8, 1.3]), rng, true));
  // countryside: broad trees, groves, poplars along fields
  g.add(instancedTrees({ trunk: 0x6a5040, canopy: [0x4f9a3c, 0x62ad4a, 0x3f8a36, 0x7bb85a], shape: 'broad' }, scatter(rng, 160, -260, 200, -1340, -600, (x, z) => okLand(14)(x, z) && Math.hypot(x + 112, z + 900) > 30 && Math.hypot(x - 26, z + 740) > 16, heightAt, [0.9, 1.5]), rng, true));
  g.add(instancedTrees({ trunk: 0x6a5040, canopy: [0x3f8a36, 0x4f9a3c], shape: 'poplar' }, scatter(rng, 60, -240, 200, -1340, -600, (x, z) => okLand(16)(x, z), heightAt, [0.9, 1.4]), rng, false));
  // dense grove around the camphor hill
  g.add(instancedTrees({ trunk: 0x5a4636, canopy: [0x2f6b46, 0x3b7a4f, 0x35704a], shape: 'round' }, scatter(rng, 70, -170, -50, -960, -840, (x, z) => okLand(12)(x, z) && Math.hypot(x + 112, z + 900) > 22 && Math.hypot(x + 112, z + 900) < 62, heightAt, [0.8, 1.4]), rng, true));
  // spirit sea islands: dark pines
  g.add(instancedTrees({ trunk: 0x3a2e28, canopy: [0x1e3a34, 0x24443a, 0x1a3330], shape: 'cone' }, scatter(rng, 90, -200, 200, -2330, -1440, (x, z) => okLand(9)(x, z) && Math.hypot(x + 70, z + 1750) > 34, heightAt, [0.9, 1.7]), rng, true));
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
  // platforms: simple concrete slabs with a bench, a roof and lanterns
  const platform = (z: number, side: number, len = 16, roof = true) => {
    const p = trackPoint(z);
    const x = p.x + side * 5.2;
    const pg = new THREE.Group();
    pg.add(box(4.5, 1.0, len, lambert(0x8f8b83), 0, 0.5, 0));
    pg.add(box(4.5, 0.12, len, lambert(0xa9a49a), 0, 1.06, 0));
    if (roof) {
      for (const dz of [-len / 2 + 2, len / 2 - 2]) pg.add(cyl(0.12, 0.12, 4, toon(0x3f4a50), side * 1.5, 3.1, dz));
      pg.add(box(4.2, 0.2, len, toon(0x3f4a50), side * 0.4, 5.1, 0));
      pg.add(lantern(side * 1.5, 4.2, -len / 2 + 2, 0.9), lantern(side * 1.5, 4.2, len / 2 - 2, 0.9));
    }
    pg.add(box(2, 0.5, 0.5, toon(0x5a4a3a), side * 1.6, 1.4, 0)); // bench
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
    const _red = toon(0xb3372c); void _red;
    const greenRoof = toon(0x2f5d4f);
    const cream = toon(0xefe3c6);
    const f = facadeTextures({ wall: '#ffffff', window: '#ffd28a', frame: '#e8d0a0', rows: 3, cols: 8, lit: 0.85, rng });
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xb3372c, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.95 });
    const wallMatSide = new THREE.MeshLambertMaterial({ color: 0xb3372c, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.95 });
    const tiers: [number, number, number][] = [[44, 9, 30], [38, 8, 26], [32, 8, 22], [24, 7, 18], [16, 7, 12]];
    let y = 0;
    for (const [w, h, d] of tiers) {
      const mats = [wallMatSide, wallMatSide, cream, cream, wallMat, wallMat];
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      b.position.set(0, y + h / 2, 0);
      bath.add(b);
      const r = mesh(new THREE.BoxGeometry(w + 4, 1.2, d + 4), greenRoof, 0, y + h + 0.5, 0);
      bath.add(r);
      // eave lanterns
      for (let i = -w / 2 + 3; i <= w / 2 - 3; i += 6) bath.add(lantern(i, y + h - 0.5, d / 2 + 2.3, 0.8));
      y += h + 1.2;
    }
    bath.add(mesh(pagodaRoofGeometry(18, 7, 0.3), greenRoof, 0, y, 0));
    bath.add(cyl(0.3, 0.3, 6, toon(0xd8c090), 0, y + 8, 0));
    // the big sign
    const signTex = canvasTexture(128, 128, (c) => { c.fillStyle = '#8f2a20'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#ffd88a'; c.font = 'bold 96px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('油', 64, 70); });
    bath.add(mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: signTex }), 0, 30, 11.2));
    // chimney
    bath.add(cyl(1.6, 2, 26, toon(0x6a4a3a), -16, 13, -8));
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
    c.add(box(9, 5, 8, toon(0xd8c8a8), 0, 2.5, 0));
    c.add(mesh(roofGeometry(9, 8, 4.5, 0.6), toon(0x5a6f5a), 0, 5, 0));
    c.add(box(2.2, 2, 0.2, glow(0xffd58a, 1.4), -2, 2.6, 4.05), box(2.2, 2, 0.2, glow(0xffd58a, 1.4), 2, 2.6, 4.05));
    c.add(cyl(0.5, 0.6, 3, toon(0x6a5a4a), 3, 6.5, -1));
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
  const paint = toon(0x2d5a4a);
  const cream = toon(0xe8dcc0);
  const dark = toon(0x2a2c30);
  // car body behind the deck: local +z is forward. The front cabin is hollow so you can see the passengers.
  const car = new THREE.Group();
  // rear body (solid)
  car.add(box(3.2, 2.7, 8.0, paint, 0, 1.9, -8.7));
  car.add(box(3.3, 0.5, 8.1, cream, 0, 1.4, -8.7));
  // cabin side walls (z -1.1 .. -4.7)
  for (const sx of [-1, 1]) {
    car.add(box(0.1, 2.7, 3.6, paint, sx * 1.55, 1.9, -2.9));
    car.add(box(0.12, 0.5, 3.6, cream, sx * 1.6, 1.4, -2.9));
  }
  // front wall pieces around the window opening (y 1.7 .. 2.85, x -1.2 .. 1.2)
  car.add(box(3.2, 1.15, 0.3, paint, 0, 1.125, -0.95));
  car.add(box(3.3, 0.5, 0.32, cream, 0, 1.4, -0.95));
  car.add(box(3.2, 0.4, 0.3, paint, 0, 3.05, -0.95));
  car.add(box(0.4, 1.15, 0.3, paint, -1.4, 2.275, -0.95), box(0.4, 1.15, 0.3, paint, 1.4, 2.275, -0.95));
  const roof = mesh(new THREE.CylinderGeometry(1.7, 1.7, 12.2, 12, 1, false, 0, Math.PI), toon(0x3a3f44), 0, 3.25, -6.9);
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
  roof.scale.y = 1; roof.scale.x = 0.55;
  car.add(roof);
  const winMat = new THREE.MeshLambertMaterial({ color: 0xffe6b0, emissive: 0xffc070, emissiveIntensity: 0.9 });
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
  const panel = new THREE.MeshLambertMaterial({ color: 0xd9c9a0, emissive: 0x6a5230, emissiveIntensity: 0.6 });
  interior.add(box(3.0, 2.6, 0.1, panel, 0, 1.9, -4.65));
  interior.add(box(0.06, 2.6, 3.6, panel, -1.47, 1.9, -2.9), box(0.06, 2.6, 3.6, panel, 1.47, 1.9, -2.9));
  interior.add(box(3.0, 0.1, 3.7, toon(0x6a4e3a), 0, 0.62, -2.9));
  interior.add(box(3.0, 0.1, 3.7, panel, 0, 3.18, -2.9));
  interior.add(box(2.6, 0.14, 0.6, toon(0x7a5a3a), 0, 1.1, -2.1), box(2.6, 0.7, 0.12, toon(0x7a5a3a), 0, 1.4, -2.4));
  const shade = new THREE.MeshBasicMaterial({ color: 0x0a0c12, transparent: true, opacity: 0.7 });
  interior.add(capsule(0.26, 0.9, shade, 1.0, 1.75, -3.7), sphere(0.2, shade, 1.0, 2.45, -3.7), cyl(0.35, 0.35, 0.2, shade, 1.0, 2.7, -3.7));
  car.add(interior);
  // wheels / bogies
  for (const s of [-1, 1]) for (const z of [-2.5, -10.5]) car.add(box(0.5, 0.9, 2.6, dark, s * 1.3, 0.45, z));
  g.add(car);
  // open deck at the front with railings and a lantern
  const deck = new THREE.Group();
  deck.add(box(3.2, 0.3, 4.4, toon(0x6a4e3a), 0, 0.45, 1.8));
  deck.add(box(3.4, 0.08, 4.6, toon(0x8a6a4a), 0, 0.62, 1.8));
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
