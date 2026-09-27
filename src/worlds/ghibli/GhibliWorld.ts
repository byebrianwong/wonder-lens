import * as THREE from 'three';
import type { BuiltWorld, WorldContext, WorldDef, RideState } from '../../game/types';
import { Subject } from '../../game/Subject';
import { makeLighting } from '../../game/lighting';
import { Sky } from '../../engine/Sky';
import { Drift, Rain } from '../../engine/Particles';
import { Rng, clamp, damp, fbm, lerp, smoothstep, TAU } from '../../engine/math';
import { PathField, buildTerrain, buildDetailedTrack, mergeStatic, grassField, toon, glow, sphere, cyl, box, lambert, mesh, textTexture, canvasTexture, type Placement } from '../../engine/Builders';
import { HeightGrid } from '../../engine/HeightGrid';
import { SeaMaterial } from '../../engine/Water';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CumulusField } from '../../engine/Clouds';
import { flowerField } from '../../engine/Foliage';
import { GrassField } from '../../engine/Grass';
import { ExclusionMask, addGroundDetail, paintedDetailTexture } from '../../engine/Ground';
import { korikoTerrace } from './koriko';
import { buildKorikoTown, buildSailboats, buildCountryside, buildForests, buildSpiritSea, buildSeaTrain, scatterPlacements } from './environment';
import { makeTotoro, makeCatbus, makeKiki, makeNoFace, makeSootSprites, makeHaku, makeKodama, makePonyoSchool, makeRadishSpirit, makeHoppingLamp, makeLaputa, makeHowlsCastle, makeShadowPassengers, makeSeagulls, makeDirigible, makeSatsukiMei, makeChihiroSeated } from './characters';

const TRACK_PTS: [number, number, number][] = [
  [0, 6, 60], [0, 6, 0], [-6, 5.6, -120], [-2, 5.2, -260], [10, 4.6, -400], [4, 4.0, -520],
  [-10, 3.0, -640], [-30, 2.6, -760], [-40, 2.6, -900], [-25, 2.6, -1050], [-10, 2.6, -1160],
  [0, 3.0, -1290], [0, 3.6, -1360], [0, 3.6, -1430], [0, 1.4, -1475], [0, 0.45, -1520],
  [8, 0.45, -1650], [0, 0.45, -1800], [-12, 0.45, -1950], [0, 0.45, -2100], [0, 0.7, -2260], [0, 0.7, -2330],
];

function build(ctx: WorldContext): BuiltWorld {
  const rng = new Rng(20260924);
  const scene = new THREE.Scene();
  const curve = new THREE.CatmullRomCurve3(TRACK_PTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal', 0.5);
  curve.arcLengthDivisions = 4000;
  const field = new PathField(curve, 2);
  const near = { dist: 0, y: 0, u: 0, x: 0, z: 0 };
  const trackDist = (x: number, z: number) => field.nearest(x, z, near).dist;
  const trackPoint = (z: number) => {
    // sample the curve for the point nearest to a given z (the curve is monotonic in z)
    const u = clamp((60 - z) / 2390, 0, 1);
    let best = curve.getPointAt(u), bestD = Math.abs(best.z - z);
    for (const du of [-0.01, -0.005, 0.005, 0.01]) { const p = curve.getPointAt(clamp(u + du, 0, 1)); const d = Math.abs(p.z - z); if (d < bestD) { best = p; bestD = d; } }
    return { x: best.x, y: best.y };
  };

  // track x and heading per unit of z, for fast distance-to-track estimates while building the grass maps
  const TZ0 = -2400, TZ1 = 142;
  const trackRow = new Float32Array((TZ1 - TZ0) * 2);
  for (let i = 0; i < TZ1 - TZ0; i++) {
    const z = TZ0 + i;
    const a = trackPoint(z), b = trackPoint(z - 2);
    trackRow[i * 2] = a.x;
    trackRow[i * 2 + 1] = 2 / Math.hypot(b.x - a.x, 2); // cos of the heading relative to -z
  }
  const approxTrackDist = (x: number, z: number) => {
    const i = clamp(Math.floor(z - TZ0), 0, TZ1 - TZ0 - 1);
    return Math.abs(x - trackRow[i * 2]) * trackRow[i * 2 + 1];
  };
  const trackXAt = (z: number) => trackRow[clamp(Math.floor(z - TZ0), 0, TZ1 - TZ0 - 1) * 2];


  // ---------- terrain ----------
  const WATER = 0;
  // Koriko's hill rises to the west (negative x); the town cuts it into terraces for its streets
  const korikoHill = (x: number, z: number) => 3 + Math.max(0, -x - 22) * 0.22 + fbm(x * 0.01, z * 0.01, 3) * 8 - 3;
  const rawHeight = (x: number, z: number) => {
    // region weights along z
    // z decreases along the ride: smoothstep(a, b, z) with a > b rises as we travel
    const toCountry = smoothstep(-560, -640, z);   // 0 in Koriko, 1 once inland
    const toSea = smoothstep(-1400, -1470, z);     // 0 on land, 1 out on the spirit sea
    const wKoriko = 1 - toCountry;
    const wCountry = toCountry * (1 - toSea);
    const wSea = toSea;
    let h = 0;
    if (wKoriko > 0) {
      // hill rising to the west (negative x), dropping into the sea to the east
      const hill = korikoTerrace(x, z, trackXAt(z), korikoHill);
      const shore = smoothstep(46, 24, x); // 1 on land
      let hk = lerp(-5 + fbm(x * 0.02, z * 0.02, 2) * 2, hill, shore);
      // sandy beach shelf
      if (x > 24 && x < 46) hk = lerp(hk, 0.6, smoothstep(24, 34, x) * (1 - smoothstep(38, 46, x)) * 0.6);
      h += wKoriko * hk;
    }
    if (wCountry > 0) {
      let hc = 2.6 + (fbm(x * 0.012, z * 0.012, 4) - 0.45) * 10;
      const camphor = Math.hypot(x + 112, z + 900);
      hc += 15 * (1 - smoothstep(20, 75, camphor));
      // tunnel ridge
      const ridge = Math.exp(-Math.pow((z + 1395) / 30, 2));
      hc += 16 * ridge;
      // distant hills east and west
      hc += Math.max(0, Math.abs(x) - 150) * 0.15;
      h += wCountry * hc;
    }
    if (wSea > 0) {
      let hs = -4 + fbm(x * 0.03, z * 0.03, 2) * 1.5;
      const bathIsle = Math.hypot(x + 70, z + 1750);
      hs += 9 * (1 - smoothstep(30, 62, bathIsle));
      const kodamaIsle = Math.hypot(x - 58, z + 2050);
      hs += 8 * (1 - smoothstep(16, 40, kodamaIsle));
      // far ridge to the west for the walking castle
      hs += Math.max(0, -x - 170) * 0.22 + Math.max(0, -x - 170) * fbm(x * 0.02, z * 0.02, 2) * 0.1;
      // land at the end of the line
      hs += 6 * smoothstep(-2225, -2262, z);
      h += wSea * hs;
    }
    return h;
  };
  const heightFn = (x: number, z: number) => {
    const n = field.nearest(x, z, near);
    const raw = rawHeight(x, z);
    // flatten a corridor under the track; in the sea the track sits above the water so leave the seabed alone
    const corridor = 1 - smoothstep(5, 18, n.dist);
    const trackY = n.y - 0.45;
    if (trackY < WATER + 0.3) return raw;
    return lerp(raw, Math.min(trackY, Math.max(trackY, raw - 8)), corridor);
  };
  // sample the height once on the terrain's own grid; everything placed on the ground uses this so it sits on the mesh
  const heights = new HeightGrid(-420, 420, -2400, 140, 4, heightFn);
  const heightAt = (x: number, z: number) => heights.sample(x, z);

  // ---------- ground colour ----------
  // Ghibli meadows: warm yellow-green in the light, cooler blue-green patches, streaks of straw
  const cLush = new THREE.Color(0x3f7d31), cLight = new THREE.Color(0x7aab45), cCool = new THREE.Color(0x2f6b4c), cDry = new THREE.Color(0xa99f5a);
  const cTown = new THREE.Color(0x5b9a40), cIsle = new THREE.Color(0x2f5a3c);
  const sand = new THREE.Color(0xd8c89a), seabed = new THREE.Color(0x22343a), rock = new THREE.Color(0x77705f), dark = new THREE.Color(0x1f3328);
  const meadow = (x: number, z: number, out: THREE.Color) => {
    const n1 = fbm(x * 0.016, z * 0.016, 3);
    const n2 = fbm(x * 0.06 + 31, z * 0.06 - 12, 2);
    out.copy(cLush).lerp(cLight, smoothstep(0.3, 0.75, n1));
    out.lerp(cCool, smoothstep(0.45, 0.78, n2) * 0.6);
    out.lerp(cDry, smoothstep(0.55, 0.85, fbm(x * 0.011 + 7, z * 0.011, 2)) * 0.55);
    // Koriko's lawns are kept shorter and brighter
    const town = 1 - smoothstep(-560, -640, z);
    if (town > 0) out.lerp(cTown, town * 0.35);
    // the spirit-sea islands: deep, cool greens
    const isle = smoothstep(-1420, -1460, z);
    if (isle > 0) out.lerp(cIsle, isle * 0.7);
    return out;
  };
  // grass is kept off the track bed, beaches, steep rock and anything registered in the mask below
  const grassMask = new ExclusionMask(-180, 170, TZ0, TZ1, 1);
  // country lanes and footpaths: bare earth where people walk, short grass along the verges
  const BUS_ROAD = [[60, -980], [40, -1040], [24, -1100], [16, -1150], [18, -1200], [40, -1250], [90, -1320], [160, -1380]];
  const HILL_PATH = [[-40, -800], [-44, -812], [-50, -834], [-58, -856], [-72, -876], [-90, -890]];
  const roadMask = new ExclusionMask(-180, 170, TZ0, TZ1, 1);
  const shortMask = new ExclusionMask(-180, 170, TZ0, TZ1, 1);
  {
    const along = (pts: number[][]) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z))).getSpacedPoints(120).map((p) => ({ x: p.x, z: p.z }));
    const bus = along(BUS_ROAD), hill = along(HILL_PATH);
    roadMask.path(bus, 3.6); shortMask.path(bus, 9);
    roadMask.path(hill, 1.6); shortMask.path(hill, 5);
    // the bus stop: a mown patch so Totoro and the girls are not lost in the grass
    shortMask.circle(10, -1154, 8);
    shortMask.rect(3, -1156, 26, 34, 0, 0);
    roadMask.circle(9.5, -1154, 2.8);
    roadMask.build(1.2); shortMask.build(2.5);
  }
  const tmpCol = new THREE.Color();
  const grassDensity = (x: number, z: number, y: number, slope: number) => {
    if (y < WATER + 0.55) return 0;
    // out on the spirit sea only the islands have grass, kept back from the shore
    if (z < -1432 && y < WATER + 1.2) return 0;
    let d = smoothstep(2.4, 3.6, approxTrackDist(x, z));
    d *= 1 - smoothstep(0.22, 0.45, slope);
    if (z > -600) d *= smoothstep(1.0, 2.0, y);
    // thin, bare patches here and there
    d *= 0.55 + 0.45 * smoothstep(0.3, 0.55, fbm(x * 0.05 - 3, z * 0.05 + 9, 2));
    return d * grassMask.at(x, z) * roadMask.at(x, z);
  };

  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const detailTex = paintedDetailTexture(20260926);
  addGroundDetail(terrainMat, detailTex, { scaleA: 30, scaleB: 8, strength: 0.75, roads: roadMask, roadColor: 0x9a8660 });
  const terrainColor = (x: number, z: number, y: number, slope: number, out: THREE.Color) => {
    const n = fbm(x * 0.05, z * 0.05, 3);
    if (y < WATER + 0.3) { out.copy(seabed).lerp(sand, smoothstep(-2, 0.3, y)); return; }
    if (z < -1430) { out.copy(dark).lerp(rock, slope * 1.5).offsetHSL(0, 0, (n - 0.5) * 0.08); return; }
    meadow(x, z, out);
    if (y < 1.4 && z > -600) out.lerp(sand, 0.7 * (1 - smoothstep(1.0, 1.4, y)));
    out.lerp(rock, smoothstep(0.3, 0.6, slope));
    // under dense grass the ground reads as the shadowed base of the blades
    out.multiplyScalar(0.86 + 0.14 * (1 - smoothstep(2.4, 3.6, approxTrackDist(x, z))));
  };
  const terrain = buildTerrain({
    xMin: -420, xMax: 420, zMin: -2400, zMax: 140, res: 4, chunk: 280,
    height: heightAt,
    color: terrainColor,
    material: terrainMat,
  });
  scene.add(terrain);

  // rice paddies: shallow water that catches the sky, grassy levees, and young rice planted in rows
  const paddies: THREE.Group = new THREE.Group();
  const mudMat = new THREE.MeshLambertMaterial({ color: 0x55503a });
  const paddyWater = new THREE.MeshPhongMaterial({ color: 0x9cc4c6, specular: 0xfff4e0, shininess: 140, transparent: true, opacity: 0.82, depthWrite: false });
  const leveeMat = new THREE.MeshLambertMaterial({ color: 0x5e9444 });
  const riceBlades: Placement[] = [];
  for (let i = 0; i < 26; i++) {
    const z = rng.range(-1300, -620);
    const side = rng.sign();
    const p = trackPoint(z);
    const x = p.x + side * rng.range(16, 60);
    const w = rng.range(14, 26), d = rng.range(14, 26);
    const y = heightAt(x, z);
    if (Math.abs(heightAt(x + w / 2, z + d / 2) - y) > 1.8 || Math.abs(heightAt(x - w / 2, z - d / 2) - y) > 1.8) continue;
    if (Math.hypot(x - 26, z + 740) < 20) continue;
    paddies.add(mesh(new THREE.BoxGeometry(w, 0.8, d), mudMat, x, y - 0.2, z));
    const water = mesh(new THREE.PlaneGeometry(w - 1.2, d - 1.2), paddyWater, x, y + 0.3, z);
    water.rotation.x = -Math.PI / 2;
    water.renderOrder = 1;
    paddies.add(water);
    for (const [lx, lz, lw, ld] of [[0, d / 2 - 0.45, w, 0.9], [0, -d / 2 + 0.45, w, 0.9], [w / 2 - 0.45, 0, 0.9, d], [-w / 2 + 0.45, 0, 0.9, d]]) {
      const lv = mesh(new THREE.BoxGeometry(lw, 0.5, ld), leveeMat, x + lx, y + 0.22, z + lz);
      lv.receiveShadow = true;
      paddies.add(lv);
    }
    grassMask.rect(x, z, w - 1.6, d - 1.6, 0, 0);
    // clumps of rice on a planting grid, a few blades each
    for (let rx = -w / 2 + 1.4; rx < w / 2 - 1.2; rx += 0.8) for (let rz = -d / 2 + 1.4; rz < d / 2 - 1.2; rz += 0.8) {
      const n = rng.int(3, 5);
      for (let k = 0; k < n; k++) riceBlades.push({ x: x + rx + rng.range(-0.08, 0.08), y: y + 0.26, z: z + rz + rng.range(-0.08, 0.08), scale: rng.range(0.7, 1.05), rot: rng.range(0, TAU) });
    }
  }
  mergeStatic(paddies);
  scene.add(paddies);
  const rice = grassField(riceBlades, { base: 0x3f7f30, tip: 0x9fcf5a, height: 0.72, width: 0.07 });
  scene.add(rice.mesh);
  // water
  const sea0 = new SeaMaterial(heights);
  const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2800, 140, 280), sea0.material);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(0, WATER, -1150);
  waterMesh.renderOrder = 1;
  scene.add(waterMesh);

  // track
  const track = buildDetailedTrack(curve, { gauge: 1.5 });
  scene.add(track);
  // tunnel through the ridge
  {
    const tun = new THREE.Group();
    const tunMat = lambert(0x3a3632, { side: THREE.BackSide });
    const geo = new THREE.CylinderGeometry(3.4, 3.4, 78, 16, 1, true);
    const inner = mesh(geo, tunMat, 0, 3.6 + 1.6, -1395);
    inner.rotation.x = Math.PI / 2;
    tun.add(inner);
    // stone portals: a dressed-stone face with an arched opening, a ring of voussoirs and a cornice
    const portalTex = canvasTexture(256, 256, (g, w, h) => {
      const r2 = new Rng(77);
      g.fillStyle = '#4e4a44'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 8; row++) {
        let x = row % 2 ? -28 : 0;
        while (x < w) {
          const bw = r2.range(44, 72), v = Math.round(r2.range(118, 150));
          g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(x + 2, row * 32 + 2, bw - 4, 28);
          g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 2, row * 32 + 2, bw - 4, 4);
          if (r2.chance(0.3)) { g.fillStyle = 'rgba(60,90,50,0.25)'; g.fillRect(x + 2, row * 32 + 20, bw - 4, 10); }
          x += bw;
        }
      }
    });
    portalTex.wrapS = portalTex.wrapT = THREE.RepeatWrapping;
    portalTex.repeat.set(0.18, 0.18);
    const portalMat = new THREE.MeshLambertMaterial({ map: portalTex });
    const ringMat = lambert(0x8e877c), capMat = lambert(0x6f6a62);
    for (const z of [-1356, -1434]) {
      const shape = new THREE.Shape();
      shape.moveTo(-9, -1); shape.lineTo(9, -1); shape.lineTo(9, 11.5); shape.lineTo(-9, 11.5); shape.closePath();
      const hole = new THREE.Path();
      hole.moveTo(3.45, -1); hole.lineTo(3.45, 5.2); hole.absarc(0, 5.2, 3.45, 0, Math.PI, false); hole.lineTo(-3.45, -1); hole.closePath();
      shape.holes.push(hole);
      const face = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false }), portalMat);
      face.position.set(0, 0, z - 0.7);
      face.castShadow = true; face.receiveShadow = true;
      tun.add(face);
      const ring = mesh(new THREE.TorusGeometry(3.85, 0.45, 6, 24, Math.PI), ringMat, 0, 5.2, z + (z > -1400 ? 0.75 : -0.75));
      tun.add(ring);
      tun.add(box(19, 0.7, 2.0, capMat, 0, 11.7, z));
      tun.add(box(1.0, 0.9, 1.7, ringMat, 0, 9.3, z + (z > -1400 ? 0.2 : -0.2)));
    }
    const innerTex = portalTex.clone(); innerTex.repeat.set(2, 16); innerTex.needsUpdate = true;
    (inner.material as THREE.MeshLambertMaterial).map = innerTex;
    (inner.material as THREE.MeshLambertMaterial).color.setHex(0x6a6258);
    // a few dim lamps inside
    for (let z = -1365; z > -1430; z -= 16) tun.add(sphere(0.16, new THREE.MeshBasicMaterial({ color: 0xffb060 }), 2.6, 7.0, z));
    scene.add(tun);
  }

  // ---------- sky, lights, fog ----------
  const sky = new Sky(1400);
  scene.add(sky.mesh);
  scene.fog = new THREE.FogExp2(0xd8e8f2, 0.0022);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x6f8f5a, 0.8);
  scene.add(hemi);

  // clouds: big cumulus banks around the horizon, a few overhead
  const cloudPl: Placement[] = [];
  const crng = new Rng(77);
  for (let i = 0; i < 44; i++) {
    const side = crng.sign();
    const far = crng.chance(0.75);
    cloudPl.push({
      x: side * (far ? crng.range(200, 620) : crng.range(40, 200)),
      y: far ? crng.range(45, 110) : crng.range(120, 180),
      z: crng.range(-2600, 250),
      scale: far ? crng.range(3.2, 6.5) : crng.range(1.6, 2.8),
      rot: crng.range(-0.4, 0.4) + (crng.chance(0.5) ? 0 : Math.PI),
    });
  }
  const clouds = new CumulusField(crng, cloudPl);
  scene.add(clouds.group);

  // ---------- places ----------
  const town = buildKorikoTown(rng, heightAt, trackDist, grassMask, trackXAt);
  scene.add(town);
  const boats = buildSailboats(rng, 9, 70, 220, -520, -40);
  scene.add(boats.group);
  scene.add(mergeStatic(buildCountryside(rng, heightAt, trackDist, grassMask)));
  scene.add(buildForests(rng, heightAt, trackDist, grassMask));
  const sea = buildSpiritSea(rng, heightAt, trackDist, trackPoint);
  mergeStatic(sea.bathhouse);
  mergeStatic(sea.group);
  scene.add(sea.group);
  // Koriko station at the start, a low stone wall along the town side of the track, and lamp posts
  {
    const st = new THREE.Group();
    const sx = -4.6, sz = -6;
    const sy = heightAt(sx, sz);
    // platform: stone edge, paving, and a canopy on slim green iron posts (the building itself is part of the town)
    st.add(box(4.6, 1, 26, lambert(0xb9ad98), sx - 0.3, sy + 0.5, sz));
    st.add(box(0.5, 0.12, 26, lambert(0xe8e0cc), sx + 1.8, sy + 1.02, sz));
    const iron = toon(0x2f4a40);
    for (const dz of [-9, -3, 3, 9]) { st.add(cyl(0.09, 0.11, 4, iron, sx + 1, sy + 3, sz + dz)); st.add(box(0.12, 0.12, 1.2, iron, sx + 1, sy + 4.7, sz + dz).rotateZ(0.6)); }
    st.add(box(4.8, 0.14, 22, toon(0x3f6a5a), sx - 0.2, sy + 5.0, sz));
    st.add(box(0.1, 0.35, 22, toon(0xf4efe4), sx + 2.2, sy + 4.85, sz));
    const sign = textTexture('KORIKO', { font: 'bold 54px serif', color: '#f4efe4', bg: '#1f3a6a', w: 256, h: 96 });
    st.add(mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: sign }), sx + 1.2, sy + 3.6, sz + 3).rotateY(Math.PI / 2));
    st.add(box(1.6, 0.5, 0.5, toon(0x5a4a3a), sx - 0.5, sy + 1.3, sz - 4));
    scene.add(mergeStatic(st));
    // low stone wall between the track and the town: one instanced mesh
    const stoneTex = canvasTexture(256, 96, (g, w, h) => {
      const r2 = new Rng(8);
      g.fillStyle = '#8a8070'; g.fillRect(0, 0, w, h);
      for (let row = 0; row < 3; row++) {
        let x = row % 2 ? -20 : 0;
        while (x < w) {
          const bw = r2.range(34, 56), v = Math.round(r2.range(170, 205));
          g.fillStyle = `rgb(${v},${v - 8},${v - 20})`;
          g.fillRect(x + 2, row * 32 + 2, bw - 4, 28);
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 2, row * 32 + 2, bw - 4, 5);
          x += bw;
        }
      }
    });
    const wallPl: THREE.Matrix4[] = [];
    for (let z = -20; z > -560; z -= 3) {
      const p = trackPoint(z);
      const x = p.x - 6.5;
      const y = heightAt(x, z);
      if (y < 0.5) continue;
      const rot = Math.atan2(trackPoint(z - 3).x - p.x, 3) * -1;
      wallPl.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.45, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1)));
    }
    const wallIm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 1.1, 3.1), new THREE.MeshLambertMaterial({ map: stoneTex }), wallPl.length);
    wallPl.forEach((m, i) => wallIm.setMatrixAt(i, m));
    wallIm.instanceMatrix.needsUpdate = true;
    wallIm.computeBoundingSphere();
    wallIm.receiveShadow = true; wallIm.castShadow = true;
    scene.add(wallIm);
    // street lamps on the sea side: merged into two meshes (iron and glass)
    const ironParts: THREE.BufferGeometry[] = [], glassParts: THREE.BufferGeometry[] = [];
    for (let z = -40; z > -560; z -= 60) {
      const p = trackPoint(z);
      const x = p.x + 6.2;
      const y = heightAt(x, z);
      if (y < 0.5) continue;
      const at = (geo: THREE.BufferGeometry, dy: number) => geo.translate(x, y + dy, z);
      ironParts.push(at(new THREE.CylinderGeometry(0.08, 0.12, 5, 8), 2.5), at(new THREE.BoxGeometry(0.5, 0.08, 0.5), 4.9), at(new THREE.BoxGeometry(0.5, 0.08, 0.5), 5.45), at(new THREE.ConeGeometry(0.45, 0.35, 4).rotateY(Math.PI / 4), 5.65));
      glassParts.push(at(new THREE.BoxGeometry(0.4, 0.5, 0.4), 5.2));
    }
    const lampIron = new THREE.Mesh(mergeGeometries(ironParts.map((g) => g.toNonIndexed()), false)!, toon(0x2f4a40));
    lampIron.castShadow = true;
    scene.add(lampIron, new THREE.Mesh(mergeGeometries(glassParts, false)!, glow(0xffe0a8, 0.9)));
  }
  // harbour wall and pier at Koriko
  {
    const pier = new THREE.Group();
    pier.add(box(30, 1.2, 4, lambert(0x8a8478), 60, 0.6, -140));
    for (let i = 0; i < 6; i++) pier.add(cyl(0.25, 0.3, 2.5, toon(0x5a4a3a), 47 + i * 5, 0.5, -142.3));
    scene.add(pier);
  }

  // station platform and building
  grassMask.rect(-6.5, -6, 10, 28, 0, 0.5);

  // ---------- grass ----------
  const grass = new GrassField({
    heights, xMin: -180, xMax: 170, zMin: TZ0, zMax: TZ1, res: 1,
    // low-end machines draw half the blades over a shorter distance
    bladesPerM2: ctx.lowDetail ? 14 : 28, radius: ctx.lowDetail ? 70 : 100,
    rowRange: (z) => { const i = clamp(Math.floor(z - TZ0), 0, TZ1 - TZ0 - 1); const x = trackRow[i * 2]; return [x - 118, x + 118]; },
    sample: (x, z, out) => {
      const y = heightAt(x, z);
      const d = grassDensity(x, z, y, heights.slope(x, z));
      out.density = d;
      if (d <= 0) return;
      meadow(x, z, tmpCol);
      out.r = tmpCol.r; out.g = tmpCol.g; out.b = tmpCol.b;
      // taller swathes in the countryside, shorter lawns in town
      const town = 1 - smoothstep(-560, -640, z);
      out.height = lerp(lerp(0.8, 1.4, smoothstep(0.35, 0.7, fbm(x * 0.03 + 50, z * 0.03, 2))), 0.7, town) * lerp(0.35, 1, shortMask.at(x, z));
    },
  });
  scene.add(grass.group);
  // wildflowers: drifts of daisies and buttercups, with clover and speedwell mixed in, peeking out of the grass
  const flowerPl: Placement[] = [], flowerKinds: number[] = [];
  {
    const frng = new Rng(314);
    let tries = 0;
    while (flowerPl.length < 9000 && tries < 60000) {
      tries++;
      const z = frng.range(-1340, 30);
      const x = trackXAt(z) + frng.sign() * frng.range(3.5, 75);
      // flowers grow in patches
      const patch = fbm(x * 0.045 + 13, z * 0.045 - 5, 2);
      if (patch < 0.5 || frng.next() > (patch - 0.5) * 3.2) continue;
      const y = heightAt(x, z);
      if (y < 1 || grassDensity(x, z, y, heights.slope(x, z)) < 0.4) continue;
      flowerPl.push({ x, y: y + frng.range(0.35, 0.75), z, scale: frng.range(0.75, 1.25), rot: 0 });
      // each patch leans towards one kind of flower
      const lean = Math.floor(fbm(x * 0.02 - 40, z * 0.02 + 7, 1) * 4) % 4;
      flowerKinds.push(frng.chance(0.65) ? lean : frng.int(0, 3));
    }
  }

  scene.add(flowerField(flowerPl, flowerKinds));

  // ---------- vehicle ----------
  const train = buildSeaTrain();
  const vehicle = train.group;
  scene.add(vehicle);
  const cameraAnchor = new THREE.Object3D();
  cameraAnchor.position.set(0, 2.35, 1.9);
  cameraAnchor.rotation.y = Math.PI; // camera looks down its -z; the vehicle's front is +z
  vehicle.add(cameraAnchor);

  // ---------- characters & subjects ----------
  const subjects: Subject[] = [];
  const chihiro = makeChihiroSeated();
  chihiro.group.position.set(-0.6, 0.62, -2.3);
  chihiro.group.rotation.y = 0;
  train.interior.add(chihiro.group);
  const noFaceAboard = makeNoFace();
  noFaceAboard.group.scale.setScalar(0.55);
  noFaceAboard.group.position.set(0.75, 0.62, -2.9);
  noFaceAboard.group.visible = false;
  train.interior.add(noFaceAboard.group);
  const updaters: Array<(dt: number, t: number, ride: RideState) => void> = [];
  const place = (g: THREE.Object3D, x: number, z: number, yOff = 0, rotY = 0) => { g.position.set(x, heightAt(x, z) + yOff, z); g.rotation.y = rotY; scene.add(g); };
  const fwd = (g: THREE.Object3D) => () => new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));

  const chihiroSubject = new Subject({
    id: 'chihiro', name: 'Chihiro', from: 'Spirited Away', group: chihiro.group, radius: 1.1, base: 900, rarity: 'rare',
    hint: 'She has been riding in the car behind you the whole time. Turn around.',
    poses: { look: { label: 'Looking up', mult: 1.5 }, company: { label: 'With No-Face', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 1.4, 0), facing: fwd(chihiro.group),
    onCall: () => { chihiro.look(); chihiroSubject.setPose(noFaceAboard.group.visible ? 'company' : 'look', 3); return true; }, maxDistance: 30,
  });
  subjects.push(chihiroSubject);
  updaters.push((dt, t, ride) => {
    chihiro.update(dt, t);
    const aboard = ride.u > 0.672;
    if (aboard && !noFaceAboard.group.visible) { noFaceAboard.group.visible = true; }
    if (aboard) noFaceAboard.update(dt, t);
  });

  // Kiki & Jiji: fly around the train in the first section
  const kiki = makeKiki();
  scene.add(kiki.group);
  const kikiState = { closeT: 0, prev: new THREE.Vector3() };
  const kikiSubject = new Subject({
    id: 'kiki', name: 'Kiki', from: "Kiki's Delivery Service", group: kiki.group, radius: 1.3, base: 950, rarity: 'rare',
    hint: 'Flies alongside the train as it leaves Koriko. Play the ocarina and she waves.',
    poses: { wave: { label: 'Waving hello', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 1.0, 0.2), facing: fwd(kiki.group),
    onCall: () => { kiki.wave(); kikiSubject.setPose('wave', 2.5); kikiState.closeT = 4; return true; },
    onItem: () => { kiki.startle(); jijiSubject.setPose('startled', 1.2); return true; }, reactRange: 12,
  });
  const jijiSubject = new Subject({
    id: 'jiji', name: 'Jiji', from: "Kiki's Delivery Service", group: kiki.group, radius: 0.45, base: 520,
    hint: 'Rides at the back of the broom. Something thrown nearby makes him jump.',
    poses: { startled: { label: 'Startled jump', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 0.35, -0.75), maxDistance: 60,
  });
  subjects.push(kikiSubject, jijiSubject);
  updaters.push((dt, t, ride) => {
    const active = ride.u < 0.26;
    kiki.group.visible = active; kikiSubject.active = active; jijiSubject.active = active;
    if (!active) return;
    kikiState.closeT = Math.max(0, kikiState.closeT - dt);
    const close = smoothstep(0, 1, kikiState.closeT);
    const tp = ride.position;
    const r = lerp(11, 5.5, close);
    const a = t * 0.55;
    const target = new THREE.Vector3(tp.x + Math.sin(a) * r + 1.5, tp.y + 3.8 + Math.sin(t * 0.9) * 1.6 - close * 1.2, tp.z - 12 + Math.cos(a * 0.8) * 16 * (1 - close * 0.6));
    kikiState.prev.copy(kiki.group.position);
    kiki.group.position.lerp(target, 1 - Math.exp(-dt * 1.6));
    const vel = kiki.group.position.clone().sub(kikiState.prev);
    if (vel.lengthSq() > 1e-6) {
      const look = kiki.group.position.clone().add(vel);
      kiki.group.lookAt(look);
      kiki.group.rotation.z = clamp(-vel.x * 4, -0.6, 0.6);
    }
    kiki.update(dt, t);
  });

  // seagulls over the harbour and the dirigible far out over the sea
  const gulls = makeSeagulls(9, rng);
  gulls.group.position.set(62, 14, -160);
  scene.add(gulls.group);
  subjects.push(new Subject({ id: 'gulls', name: 'Seagulls', from: "Kiki's Delivery Service", group: gulls.group, radius: 10, base: 320, hint: 'Circling above the harbour.', maxDistance: 160 }));
  updaters.push((dt, t) => gulls.update(dt, t));
  const blimp = makeDirigible();
  blimp.group.position.set(150, 62, -420);
  blimp.group.rotation.y = -0.6;
  scene.add(blimp.group);
  subjects.push(new Subject({ id: 'blimp', name: 'The dirigible', from: "Kiki's Delivery Service", group: blimp.group, radius: 14, base: 560, rarity: 'rare', hint: 'Look up and out to sea while leaving Koriko.', maxDistance: 520 }));
  updaters.push((dt, t) => { blimp.update(dt, t); blimp.group.position.x -= dt * 0.6; blimp.group.position.z += dt * 0.4; });
  // landmarks
  const towerAnchor = new THREE.Object3D(); towerAnchor.position.set(-46, heightAt(-46, -250) + 22, -250); scene.add(towerAnchor);
  subjects.push(new Subject({ id: 'tower', name: 'Koriko clock tower', from: "Kiki's Delivery Service", group: towerAnchor, radius: 18, base: 480, hint: 'The tall tower over the town square.', maxDistance: 400 }));
  const camphorAnchor = new THREE.Object3D(); camphorAnchor.position.set(-112, heightAt(-112, -900) + 28, -900); scene.add(camphorAnchor);
  subjects.push(new Subject({ id: 'camphor', name: 'The camphor tree', from: 'My Neighbor Totoro', group: camphorAnchor, radius: 30, base: 520, hint: 'A giant tree on a hill, with a shrine at its foot.', maxDistance: 420 }));
  const bathAnchor = new THREE.Object3D(); bathAnchor.position.set(-70, heightAt(-70, -1750) + 24, -1750); scene.add(bathAnchor);
  subjects.push(new Subject({ id: 'bathhouse', name: 'The bathhouse', from: 'Spirited Away', group: bathAnchor, radius: 30, base: 900, hint: 'Lit up across the water, halfway through the night sea.', maxDistance: 420 }));

  // Chu and Chibi Totoro near the camphor tree
  const chu = makeTotoro({ color: 0x5f7fa8, belly: 0xe8e2d0, scale: 0.62, chevrons: false, bag: true });
  const chibi = makeTotoro({ color: 0xf4f1ea, belly: -1, scale: 0.34, chevrons: false, leaf: true });
  const smallGroup = new THREE.Group();
  smallGroup.add(chu.group); chibi.group.position.set(1.4, 0, -0.6); smallGroup.add(chibi.group);
  const smallPath = [new THREE.Vector3(-44, 0, -812), new THREE.Vector3(-50, 0, -834), new THREE.Vector3(-58, 0, -856), new THREE.Vector3(-72, 0, -876)];
  const smallCurve = new THREE.CatmullRomCurve3(smallPath);
  let smallU = 0; let smallStop = 0;
  scene.add(smallGroup);
  const saplings: THREE.Mesh[] = [];
  const sapMat = toon(0x5fa346);
  for (let i = 0; i < 9; i++) { const s = mesh(new THREE.ConeGeometry(0.9, 2.6, 6), sapMat); s.visible = false; scene.add(s); saplings.push(s); }
  let sproutT = -1; let sproutPos = new THREE.Vector3();
  const smallSubject = new Subject({
    id: 'chu', name: 'Chu & Chibi Totoro', from: 'My Neighbor Totoro', group: smallGroup, radius: 1.4, base: 820, rarity: 'rare',
    hint: 'Two small friends hurrying up the camphor hill with a bag of acorns. Throw an acorn near them.',
    poses: { dance: { label: 'Growing trees', mult: 2.0 }, look: { label: 'Looking back', mult: 1.4 } }, centerOffset: new THREE.Vector3(0.6, 0.9, 0), facing: fwd(smallGroup),
    onItem: (pos) => { sproutT = 0; sproutPos.copy(pos); smallStop = 4; smallSubject.setPose('dance', 4); return true; },
    onCall: () => { smallStop = 2.5; smallSubject.setPose('look', 2.5); return true; }, reactRange: 14, maxDistance: 160,
  });
  subjects.push(smallSubject);
  updaters.push((dt, t, ride) => {
    const active = ride.u > 0.28 && ride.u < 0.5;
    smallGroup.visible = active; smallSubject.active = active;
    saplings.forEach((s) => (s.visible = s.visible && active));
    if (!active) return;
    if (smallStop > 0) smallStop -= dt; else smallU = Math.min(1, smallU + dt * 0.02);
    // walk back and forth on the path so there is always something to see
    const uu = smallU >= 1 ? 1 : smallU;
    const p = smallCurve.getPointAt(uu);
    smallGroup.position.set(p.x, heightAt(p.x, p.z), p.z);
    const ahead = smallCurve.getPointAt(Math.min(1, uu + 0.02));
    if (smallStop > 0 && smallSubject.pose === 'look') { const look = new THREE.Vector3(ride.position.x, smallGroup.position.y, ride.position.z); smallGroup.lookAt(look); }
    else smallGroup.lookAt(ahead.x, smallGroup.position.y, ahead.z);
    const hop = smallStop > 0 ? 0 : Math.abs(Math.sin(t * 7)) * 0.3;
    chu.group.position.y = hop; chibi.group.position.y = Math.abs(Math.sin(t * 8 + 1)) * 0.25 * (smallStop > 0 ? 0 : 1);
    if (smallSubject.pose === 'dance') { chu.group.position.y = Math.abs(Math.sin(t * 5)) * 0.6; chibi.group.position.y = Math.abs(Math.sin(t * 5 + 1.5)) * 0.5; }
    chu.update(dt, t); chibi.update(dt, t);
    if (sproutT >= 0) {
      sproutT += dt;
      saplings.forEach((s, i) => {
        const delay = i * 0.18;
        const k = clamp((sproutT - delay) / 1.2, 0, 1);
        s.visible = k > 0;
        const a = (i / saplings.length) * TAU;
        const x = sproutPos.x + Math.cos(a) * (2.2 + (i % 3)), z = sproutPos.z + Math.sin(a) * (2.2 + (i % 3));
        const grow = 1 - Math.pow(1 - k, 3);
        const sc = grow * (1 + (i % 4) * 0.35);
        s.position.set(x, heightAt(x, z) + 1.3 * sc, z);
        s.scale.set(sc, sc, sc);
      });
    }
  });

  // Big Totoro at the bus stop
  const totoro = makeTotoro({ umbrella: true });
  place(totoro.group, 9.5, -1157, 0, -Math.PI / 2 + 0.15);
  const totoroSubject = new Subject({
    id: 'totoro', name: 'Totoro', from: 'My Neighbor Totoro', group: totoro.group, radius: 3.2, base: 1500, rarity: 'legendary',
    hint: 'Waits in the rain at the Inari-mae bus stop. Throw an acorn and he jumps; play the ocarina and he roars.',
    poses: { roar: { label: 'The big roar', mult: 2.0 }, jump: { label: 'Rain-shaking jump', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 2.8, 0), facing: fwd(totoro.group),
    onItem: () => { totoro.jump(); totoroSubject.setPose('jump', 1.2); dropBurst = 1.2; return true; },
    onCall: () => { totoro.roar(); totoroSubject.setPose('roar', 1.6); return true; }, reactRange: 18, maxDistance: 140,
  });
  subjects.push(totoroSubject);
  const sisters = makeSatsukiMei();
  place(sisters.group, 8.2, -1153.2, 0, -Math.PI / 2 + 0.1);
  const sistersSubject = new Subject({
    id: 'satsuki', name: 'Satsuki & Mei', from: 'My Neighbor Totoro', group: sisters.group, radius: 1.5, base: 760, rarity: 'rare',
    hint: 'Waiting for the bus in the rain, right next to a very large neighbour. Frame all three together.',
    poses: { wave: { label: 'Waving', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.6, 0), facing: fwd(sisters.group),
    onCall: () => { sisters.wave(); sistersSubject.setPose('wave', 2.2); return true; }, maxDistance: 120,
  });
  subjects.push(sistersSubject);
  updaters.push((dt, t, ride) => { const a = ride.u > 0.38 && ride.u < 0.6; sisters.group.visible = a; sistersSubject.active = a; if (a) sisters.update(dt, t); });
  let dropBurst = 0;
  const drops = new Drift({ count: 160, color: 0xcfe6ff, size: 0.35, box: new THREE.Vector3(10, 8, 10), speed: new THREE.Vector3(0, -9, 0), wobble: 0.3, opacity: 0.9 });
  drops.points.position.copy(totoro.group.position).add(new THREE.Vector3(0, 6, 0));
  drops.intensity = 0;
  scene.add(drops.points);
  updaters.push((dt, t, ride) => {
    const active = ride.u > 0.38 && ride.u < 0.6;
    totoro.group.visible = active; totoroSubject.active = active;
    if (!active) { drops.intensity = 0; return; }
    totoro.update(dt, t);
    dropBurst = Math.max(0, dropBurst - dt);
    drops.intensity = damp(drops.intensity, dropBurst > 0 && dropBurst < 0.9 ? 1 : 0, 6, dt);
    drops.update(dt, t, totoro.group.position.clone().add(new THREE.Vector3(0, 6, 0)));
  });

  // Catbus: runs on a field road on the right, stops at the bus stop, then races off
  const catbus = makeCatbus();
  scene.add(catbus.group);
  const busPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(60, 0, -980), new THREE.Vector3(40, 0, -1040), new THREE.Vector3(24, 0, -1100), new THREE.Vector3(16, 0, -1150), new THREE.Vector3(18, 0, -1200), new THREE.Vector3(40, 0, -1250), new THREE.Vector3(90, 0, -1320), new THREE.Vector3(160, 0, -1380),
  ]);
  const busState = { u: 0, started: false, waited: 0, done: false };
  const catbusSubject = new Subject({
    id: 'catbus', name: 'The Catbus', from: 'My Neighbor Totoro', group: catbus.group, radius: 4.5, base: 1250, rarity: 'rare',
    hint: 'Comes racing across the fields at dusk and pauses at the bus stop.',
    poses: { stop: { label: 'At the bus stop', mult: 1.5 }, grin: { label: 'Big grin', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 2.2, 2.5), facing: fwd(catbus.group),
    onCall: () => { if (busState.u < 0.35 || busState.u > 0.6) return false; busState.waited -= 2; catbusSubject.setPose('grin', 3); return true; }, maxDistance: 200,
  });
  subjects.push(catbusSubject);
  updaters.push((dt, t, ride) => {
    if (!busState.started && ride.u > 0.44 && ride.u < 0.62) busState.started = true;
    if (ride.u > 0.64) busState.done = true;
    const active = busState.started && !busState.done;
    catbus.group.visible = active; catbusSubject.active = active;
    if (!active) return;
    const atStop = busState.u > 0.42 && busState.u < 0.45 && busState.waited < 5;
    if (atStop) { busState.waited += dt; if (catbusSubject.pose === 'idle') catbusSubject.setPose('stop', 5); }
    else busState.u += dt * (busState.u > 0.45 ? 0.09 : 0.06) * (0.6 + 0.4 * ride.speedMult);
    if (busState.u >= 1) { busState.done = true; return; }
    const p = busPath.getPointAt(busState.u);
    catbus.group.position.set(p.x, heightAt(p.x, p.z) + 0.2, p.z);
    const ahead = busPath.getPointAt(Math.min(1, busState.u + 0.01));
    catbus.group.lookAt(ahead.x, catbus.group.position.y, ahead.z);
    if (!atStop) catbus.update(dt, t);
  });
  // fireflies in the fields at dusk
  const fireflies = new Drift({ count: 220, color: 0xd6ff6a, size: 0.3, box: new THREE.Vector3(90, 8, 90), speed: new THREE.Vector3(0.3, 0.1, 0), wobble: 1.4, opacity: 0.9, blending: THREE.AdditiveBlending });
  fireflies.intensity = 0;
  scene.add(fireflies.points);
  // rain
  const rain = new Rain(1100);
  scene.add(rain.lines);
  // spirit lights over the night sea
  const sparks = new Drift({ count: 260, color: 0xbfe0ff, size: 0.28, box: new THREE.Vector3(120, 30, 120), speed: new THREE.Vector3(0.2, 0.35, 0), wobble: 0.8, opacity: 0.7, blending: THREE.AdditiveBlending });
  sparks.intensity = 0;
  scene.add(sparks.points);
  // petals in Koriko
  const petals = new Drift({ count: 180, color: 0xffd6e8, size: 0.32, box: new THREE.Vector3(80, 25, 80), speed: new THREE.Vector3(1.4, -0.7, 0.4), wobble: 1.2, opacity: 0.85 });
  scene.add(petals.points);

  // No-Face on the first sea platform
  const noFace = makeNoFace();
  const pNF = sea.platforms.noFace;
  noFace.group.position.set(pNF.x + 0.6, pNF.y, pNF.z - 2);
  noFace.group.rotation.y = -Math.PI / 2;
  scene.add(noFace.group);
  { const sp = makeShadowPassengers(3, rng, 8); sp.position.set(pNF.x + 0.5, pNF.y, pNF.z + 4); scene.add(sp); }
  const noFaceSubject = new Subject({
    id: 'noface', name: 'No-Face', from: 'Spirited Away', group: noFace.group, radius: 2.4, base: 1350, rarity: 'legendary',
    hint: 'Stands silently on the first platform in the sea. Call and he offers gold; throw something and he swallows it.',
    poses: { offer: { label: 'Offering gold', mult: 1.9 }, gulp: { label: 'Gulp', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 2.9, 0), facing: fwd(noFace.group),
    onCall: () => { noFace.offer(); noFaceSubject.setPose('offer', 4); return true; },
    onItem: () => { noFace.gulp(); noFaceSubject.setPose('gulp', 1.6); return true; }, reactRange: 14, maxDistance: 130,
  });
  subjects.push(noFaceSubject);
  updaters.push((dt, t, ride) => { const a = ride.u > 0.6 && ride.u < 0.76; noFace.group.visible = a; noFaceSubject.active = a; if (a) noFace.update(dt, t); });

  // soot sprites on the low jetty
  const soot = makeSootSprites(11, rng, 3.2);
  const pS = sea.platforms.soot;
  soot.group.position.set(pS.x, pS.y, pS.z);
  scene.add(soot.group);
  const sootSubject = new Subject({
    id: 'soot', name: 'Soot sprites', from: 'Spirited Away', group: soot.group, radius: 3.5, base: 720,
    hint: 'A crowd of them hopping on a jetty. They swarm anything you throw and jump when you call.',
    poses: { swarm: { label: 'Swarming', mult: 1.7 }, jump: { label: 'All jump', mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 0.6, 0),
    onItem: (pos) => { soot.swarmTo(pos); sootSubject.setPose('swarm', 5); return true; },
    onCall: () => { soot.jump(); sootSubject.setPose('jump', 1.2); return true; }, reactRange: 16, maxDistance: 120,
  });
  subjects.push(sootSubject);
  updaters.push((dt, t, ride) => { const a = ride.u > 0.62 && ride.u < 0.78; soot.group.visible = a; sootSubject.active = a; if (a) soot.update(dt, t); });

  // Haku the dragon over the water
  const haku = makeHaku();
  scene.add(haku.group);
  const hakuSubject = new Subject({
    id: 'haku', name: 'Haku', from: 'Spirited Away', group: haku.head, radius: 2.2, base: 1400, rarity: 'legendary',
    hint: 'A white dragon weaving over the night sea beside the train. Call him and he swoops in close.',
    poses: { swoop: { label: 'Swooping close', mult: 1.9 } }, centerOffset: new THREE.Vector3(0, 0, 0.3), facing: () => new THREE.Vector3(0, 0, 1).applyQuaternion(haku.head.quaternion),
    onCall: () => { haku.swoop(); hakuSubject.setPose('swoop', 3.5); return true; }, maxDistance: 200,
  });
  subjects.push(hakuSubject);
  const hakuTarget = new THREE.Vector3();
  updaters.push((dt, t, ride) => {
    const active = ride.u > 0.66 && ride.u < 0.9;
    haku.group.visible = active; hakuSubject.active = active;
    if (!active) return;
    const tp = ride.position;
    if (haku.state.swoopT > 0) {
      const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
      hakuTarget.copy(ctx.camera.position).addScaledVector(camDir, 9).add(new THREE.Vector3(0, 1.5 + Math.sin(t * 2) * 1.5, 0));
    } else {
      const side = Math.sin(t * 0.21) * 34;
      hakuTarget.set(tp.x + side, 6 + Math.sin(t * 0.7) * 4 + 3, tp.z - 30 + Math.cos(t * 0.33) * 40);
    }
    haku.setTarget(hakuTarget);
    haku.update(dt, t);
  });

  // Ponyo and her sisters running on the waves
  const ponyo = makePonyoSchool(14, rng);
  scene.add(ponyo.group);
  const ponyoSubject = new Subject({
    id: 'ponyo', name: 'Ponyo & her sisters', from: 'Ponyo', group: ponyo.group, radius: 4, base: 820, rarity: 'rare',
    hint: 'Little fish-girls racing along the waves on the right. Throw something into the water and they leap.',
    poses: { leap: { label: 'Leaping', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 0.6, 0),
    onItem: () => { ponyo.leap(); ponyoSubject.setPose('leap', 1.4); return true; }, reactRange: 18, maxDistance: 120,
  });
  subjects.push(ponyoSubject);
  updaters.push((dt, t, ride) => {
    const active = ride.u > 0.74 && ride.u < 0.86;
    ponyo.group.visible = active; ponyoSubject.active = active;
    if (!active) return;
    const tp = ride.position;
    const k = smoothstep(0.74, 0.77, ride.u) * (1 - smoothstep(0.84, 0.86, ride.u));
    ponyo.group.position.set(tp.x + 9 + (1 - k) * 30, WATER, tp.z - 4 + Math.sin(t * 0.8) * 5);
    ponyo.update(dt, t);
  });

  // Radish Spirit on a platform
  const radish = makeRadishSpirit();
  const pR = sea.platforms.radish;
  radish.group.position.set(pR.x - 0.3, pR.y, pR.z);
  radish.group.rotation.y = Math.PI / 2;
  scene.add(radish.group);
  const radishSubject = new Subject({
    id: 'radish', name: 'The Radish Spirit', from: 'Spirited Away', group: radish.group, radius: 2.4, base: 800,
    hint: 'A very large, very quiet passenger waiting on the left. He bows if you call politely.',
    poses: { bow: { label: 'Polite bow', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 2.6, 0), facing: fwd(radish.group),
    onCall: () => { radish.bow(); radishSubject.setPose('bow', 2.2); return true; }, maxDistance: 120,
  });
  subjects.push(radishSubject);
  updaters.push((dt, t, ride) => { const a = ride.u > 0.74 && ride.u < 0.88; radish.group.visible = a; radishSubject.active = a; if (a) radish.update(dt, t); });

  // Kodama on the forest island
  const kodama = makeKodama(14, rng, 7);
  kodama.group.position.set(52, heightAt(52, -2050) + 0.2, -2050);
  kodama.group.rotation.y = -Math.PI / 2;
  scene.add(kodama.group);
  const kodamaSubject = new Subject({
    id: 'kodama', name: 'Kodama', from: 'Princess Mononoke', group: kodama.group, radius: 4, base: 700, rarity: 'rare',
    hint: 'Pale tree spirits on a wooded island to the right. Call and their heads rattle.',
    poses: { rattle: { label: 'Rattling heads', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 0.8, 0),
    onCall: () => { kodama.rattle(); kodamaSubject.setPose('rattle', 2.5); return true; }, maxDistance: 120,
  });
  subjects.push(kodamaSubject);
  updaters.push((dt, t, ride) => { const a = ride.u > 0.8 && ride.u < 0.94; kodamaSubject.active = a; kodama.update(dt, t); });

  // Laputa in the sky, Howl's castle on the ridge
  const laputa = makeLaputa();
  laputa.group.position.set(150, 175, -2300);
  scene.add(laputa.group);
  subjects.push(new Subject({ id: 'laputa', name: 'Laputa', from: 'Castle in the Sky', group: laputa.group, radius: 40, base: 1000, rarity: 'legendary', hint: 'Look high above the clouds near the end of the line.', centerOffset: new THREE.Vector3(0, 10, 0), maxDistance: 800 }));
  updaters.push((dt, t) => laputa.update(dt, t));
  const castle = makeHowlsCastle();
  castle.group.position.set(-235, heightAt(-235, -2010) - 4, -2010);
  castle.group.rotation.y = 0.2;
  castle.group.scale.setScalar(1.6);
  scene.add(castle.group);
  subjects.push(new Subject({ id: 'howl', name: "Howl's moving castle", from: "Howl's Moving Castle", group: castle.group, radius: 30, base: 950, rarity: 'rare', hint: 'A walking silhouette on the far western ridge of the spirit sea.', centerOffset: new THREE.Vector3(0, 16, 0), maxDistance: 600 }));
  updaters.push((dt, t) => castle.update(dt, t));

  // hopping lamp at the last stop, leading the way to the cottage
  const lamp = makeHoppingLamp();
  const pE = sea.platforms.end;
  const lampRoot = new THREE.Group();
  lampRoot.position.set(pE.x + 3, heightAt(pE.x + 3, pE.z - 6) + 0.2, pE.z - 6);
  lampRoot.add(lamp.group);
  scene.add(lampRoot);
  subjects.push(new Subject({ id: 'lamp', name: 'The hopping lamp', from: 'Spirited Away', group: lampRoot, radius: 1.8, base: 620, hint: 'Hops along at the last station to light the way.', centerOffset: new THREE.Vector3(0, 2, 0), maxDistance: 100 }));
  updaters.push((dt, t, ride) => {
    lamp.update(dt, t);
    if (ride.u > 0.95) { lampRoot.position.z -= dt * 1.4 * Math.max(0, Math.sin(t * 2.6)); lampRoot.position.x += dt * 0.6 * Math.max(0, Math.sin(t * 2.6)); lampRoot.position.y = heightAt(lampRoot.position.x, lampRoot.position.z) + 0.2; }
  });
  // warm light on the last platform and on No-Face's platform
  for (const p of [pE, pNF]) { const pl = new THREE.PointLight(0xffb070, 18, 40, 1.5); pl.position.set(p.x, p.y + 4.5, p.z); scene.add(pl); }
  // shadow passengers waiting at the last station
  { const sp = makeShadowPassengers(4, rng, 14); sp.position.set(pE.x, pE.y, pE.z + 3); scene.add(sp); }

  // ---------- lighting ----------
  const lighting = makeLighting([
    { u: 0.0, skyTop: 0x3b7fd8, skyMid: 0xa6d3f5, skyBottom: 0xeaf2f4, fog: 0xd6e6f0, fogDensity: 0.0021, sunDir: [0.45, 0.75, -0.35], sunColor: 0xfff4de, sunIntensity: 2.3, hemiSky: 0xbfe0ff, hemiGround: 0x6f8f5a, hemiIntensity: 0.8, exposure: 1.0, bloom: 0.3, saturation: 1.1, cloudShadow: 0.38 },
    { u: 0.28, skyTop: 0x4a86d6, skyMid: 0xbcd6f0, skyBottom: 0xf7e0bc, fog: 0xe0e2e0, fogDensity: 0.0022, sunDir: [0.75, 0.45, -0.2], sunColor: 0xffe2b8, sunIntensity: 2.1, hemiSky: 0xbfd8f0, hemiGround: 0x7a8f55, hemiIntensity: 0.75, exposure: 1.0, bloom: 0.32, saturation: 1.1, cloudShadow: 0.34 },
    { u: 0.4, skyTop: 0x5b6fb5, skyMid: 0xe8a878, skyBottom: 0xffcf95, fog: 0xe8bb95, fogDensity: 0.0028, sunDir: [0.9, 0.16, -0.1], sunColor: 0xffa060, sunIntensity: 1.7, hemiSky: 0xd0a0a0, hemiGround: 0x5a5a40, hemiIntensity: 0.7, exposure: 1.0, bloom: 0.4, saturation: 1.12, cloudShadow: 0.14 },
    { u: 0.48, skyTop: 0x3c4160, skyMid: 0x707590, skyBottom: 0x968fa8, fog: 0x7c7f92, fogDensity: 0.0052, sunDir: [0.8, 0.2, 0.2], sunColor: 0xb8bccc, sunIntensity: 0.6, hemiSky: 0x9095b5, hemiGround: 0x3a3f42, hemiIntensity: 0.65, exposure: 0.98, bloom: 0.45, saturation: 0.98, sunGlow: 0.12, sunSize: 0.0 },
    { u: 0.575, skyTop: 0x1c2038, skyMid: 0x3a3e5e, skyBottom: 0x5e5a76, fog: 0x4b4e66, fogDensity: 0.0068, sunDir: [0.6, 0.3, 0.3], sunColor: 0x9aa0c0, sunIntensity: 0.35, hemiSky: 0x5a6090, hemiGround: 0x25282c, hemiIntensity: 0.55, exposure: 0.95, bloom: 0.5, saturation: 0.95, stars: 0.2, sunGlow: 0.0, sunSize: 0.0 },
    { u: 0.598, skyTop: 0x06060a, skyMid: 0x08080d, skyBottom: 0x0a0a10, fog: 0x07070b, fogDensity: 0.03, sunDir: [0.6, 0.3, 0.3], sunColor: 0x404050, sunIntensity: 0.1, hemiSky: 0x202030, hemiGround: 0x101014, hemiIntensity: 0.5, exposure: 0.9, bloom: 0.6, saturation: 0.9, sunGlow: 0.0, sunSize: 0.0 },
    { u: 0.622, skyTop: 0x0a1030, skyMid: 0x1a2a55, skyBottom: 0x34477a, fog: 0x1c2748, fogDensity: 0.0042, sunDir: [-0.4, 0.6, -0.6], sunColor: 0xb4c6ee, sunIntensity: 1.1, hemiSky: 0x4a5c92, hemiGround: 0x161c30, hemiIntensity: 0.95, stars: 1, moon: 1, exposure: 1.12, bloom: 0.6, saturation: 1.05, sunGlow: 0.0, sunSize: 0.0 },
    { u: 0.86, skyTop: 0x070c26, skyMid: 0x152148, skyBottom: 0x2e4070, fog: 0x172140, fogDensity: 0.0038, sunDir: [-0.5, 0.55, -0.6], sunColor: 0xb4c6ee, sunIntensity: 1.0, hemiSky: 0x465a90, hemiGround: 0x141a2c, hemiIntensity: 0.95, stars: 1, moon: 1, exposure: 1.12, bloom: 0.62, saturation: 1.05, sunGlow: 0.0, sunSize: 0.0 },
    { u: 1.0, skyTop: 0x070c26, skyMid: 0x152148, skyBottom: 0x2e4070, fog: 0x172140, fogDensity: 0.0038, sunDir: [-0.5, 0.55, -0.6], sunColor: 0xb4c6ee, sunIntensity: 1.0, hemiSky: 0x465a90, hemiGround: 0x141a2c, hemiIntensity: 0.95, stars: 1, moon: 1, exposure: 1.12, bloom: 0.62, saturation: 1.05, sunGlow: 0.0, sunSize: 0.0 },
  ]);

  const sunTint = new THREE.Color();
  const world: BuiltWorld = {
    scene, curve, speed: 10.5, vehicle, cameraAnchor, subjects, sky, sun, hemi, lighting,
    occluders: [terrain, sea.bathhouse],
    waterLevel: WATER,
    groundHeight: heightAt,
    makeProjectile: () => {
      const g = new THREE.Group();
      g.add(sphere(0.16, toon(0x8a5a2b), 0, 0, 0, 10, 8));
      g.add(cyl(0.12, 0.17, 0.08, toon(0x5a3a1a), 0, 0.14, 0, 8));
      g.add(cyl(0.02, 0.02, 0.1, toon(0x3a2a1a), 0, 0.22, 0, 5));
      return g;
    },
    ambience: {
      root: 60, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [-5, -1, 2, 7], [-7, -3, 0, 4]], padWave: 'triangle', padLevel: 0.11,
      melody: 'musicbox', melodyInterval: 2.4, melodyDensity: 0.55, melodyLevel: 0.16, chordSeconds: 11, vehicle: 'train',
    },
    env(u) {
      const day = 1 - smoothstep(0.42, 0.58, u);
      const tunnel = smoothstep(0.585, 0.6, u) * (1 - smoothstep(0.615, 0.63, u));
      const rainy = smoothstep(0.42, 0.5, u) * (1 - smoothstep(0.575, 0.6, u));
      return {
        sea: (0.45 * (1 - smoothstep(0.15, 0.3, u)) + 0.3 * smoothstep(0.6, 0.66, u)) * (1 - tunnel),
        wind: 0.25 + 0.35 * tunnel,
        rain: rainy * 0.8,
        birds: day * 0.9 * (1 - rainy),
        crickets: smoothstep(0.62, 0.7, u) * 0.6 + rainy * 0.15,
      };
    },
    captions: [
      [0.005, 'Koriko, a city by the sea'],
      [0.27, 'Inland, where the fields begin'],
      [0.36, 'The camphor tree'],
      [0.455, 'Rain at the Inari-mae bus stop'],
      [0.575, 'Into the tunnel'],
      [0.625, 'The sea of spirits'],
      [0.71, 'The bathhouse'],
      [0.93, 'Swamp Bottom, end of the line'],
    ],
    update(dt, ride) {
      const t = ride.time;
      for (const up of updaters) up(dt, t, ride);
      boats.update(t);
      // materials that need per-frame uniforms
      const fog = scene.fog as THREE.FogExp2;
      const night = smoothstep(0.42, 0.62, ride.u);
      sea0.update(t, sky.uniforms, fog, night);
      grass.update(t, ctx.camera);
      for (const gf of [rice]) {
        gf.uniforms.time.value = t;
        gf.uniforms.fogColor.value.copy(fog.color); gf.uniforms.fogDensity.value = fog.density;
        gf.uniforms.light.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.55).add(sunTint.copy(sun.color).multiplyScalar(sun.intensity * 0.32));
      }
      // particles
      const cam = ctx.camera.position;
      const dusk = smoothstep(0.38, 0.46, ride.u) * (1 - smoothstep(0.56, 0.6, ride.u));
      fireflies.intensity = dusk;
      fireflies.update(dt, t, new THREE.Vector3(cam.x, cam.y + 1, cam.z - 20));
      rain.intensity = smoothstep(0.43, 0.5, ride.u) * (1 - smoothstep(0.575, 0.6, ride.u));
      rain.update(dt, new THREE.Vector3(cam.x, cam.y + 6, cam.z - 10));
      sparks.intensity = smoothstep(0.62, 0.68, ride.u);
      sparks.update(dt, t, new THREE.Vector3(cam.x, cam.y + 4, cam.z - 30));
      petals.intensity = 1 - smoothstep(0.2, 0.3, ride.u);
      petals.update(dt, t, new THREE.Vector3(cam.x, cam.y + 6, cam.z - 20));
      // train lights come on at dusk
      const lit = smoothstep(0.38, 0.5, ride.u);
      train.winMat.emissiveIntensity = 0.15 + 0.9 * lit;
      train.light.intensity = 0.5 + 7 * lit;
      // lantern glow flickers a little
      const flick = 1.6 + Math.sin(t * 9.3) * 0.12 + Math.sin(t * 17.1) * 0.06;
      for (const l of sea.lanterns) (l.material as THREE.MeshBasicMaterial).color.setHex(0xffb36b).multiplyScalar(flick);
      // clouds slowly drift
      clouds.group.position.x = t * 0.6;
      clouds.update(sky.uniforms, fog, sun.intensity);
    },
    onItemLand() { /* subjects handle their own reactions */ },
    onCall() { /* nothing global */ },
    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
    },
  };
  return world;
}

export const GhibliWorld: WorldDef = {
  id: 'ghibli',
  title: 'The Sea Train',
  subtitle: 'Studio Ghibli',
  blurb: 'Leave Koriko by the sea, cross Totoro\'s rain-soaked countryside, and ride the flooded railway past the bathhouse under the stars.',
  vehicleName: 'The sea train',
  itemName: 'acorn',
  callName: 'ocarina',
  callKind: 'ocarina',
  accent: '#7fc7a4',
  accent2: '#2b4a6a',
  fov: 62,
  build,
};
export { scatterPlacements };
