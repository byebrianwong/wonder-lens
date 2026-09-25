import * as THREE from 'three';
import type { BuiltWorld, WorldContext, WorldDef, RideState } from '../../game/types';
import { Subject } from '../../game/Subject';
import { makeLighting } from '../../game/lighting';
import { Sky } from '../../engine/Sky';
import { Drift } from '../../engine/Particles';
import { Rng, clamp, fbm, lerp, smoothstep, TAU } from '../../engine/math';
import { PathField, buildTerrain, waterMaterial, toon, glow, sphere, box, lambert, mesh, instancedTrees, type Placement } from '../../engine/Builders';
import {
  makeRoadLookup, buildRoad, buildLamps, buildHaussmannRows, buildMontmartre, buildCafe, buildMoulinRouge, buildPhotobooth, buildPhoneBox, buildBench,
  buildDufayelHouse, buildSacreCoeur, buildStairs, buildCanal, buildGare, buildMetro, buildCar, buildSkyline, buildMoped, parisFacade, mansardGeometry, pavingTexture,
} from './environment';
import {
  makeAmelie, makeGrocers, makePigeons, makeNino, makeGnome, makeBlindPair, makeDufayel, makeCat, makeCarousel, makeBlubber, makeBusker, makeLovers, makeFinale, toonE,
} from './characters';

const ROAD_PTS: [number, number, number][] = [
  [0, 4.0, 60], [0, 4.0, 0], [-4, 4.2, -120], [6, 4.6, -250], [-5, 5.2, -380], [0, 6.5, -450],
  [9, 10.5, -540], [-7, 15.5, -640], [-12, 21, -730], [0, 26, -800], [13, 23.5, -870], [6, 17, -950], [-8, 10, -1030], [0, 5, -1100],
  [0, 3.5, -1180], [-6, 3.5, -1300], [4, 3.5, -1450], [-4, 3.5, -1580], [0, 3.5, -1650],
  [0, 3.5, -1760], [-4, 3.5, -1880], [0, 3.5, -1960], [0, 3.5, -2010], [0, 3.5, -2040],
];
const FROM = 'Amélie';

const dampAngle = (a: number, b: number, lambda: number, dt: number) => {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * (1 - Math.exp(-lambda * dt));
};

function build(ctx: WorldContext): BuiltWorld {
  const rng = new Rng(20011206);
  const scene = new THREE.Scene();
  const curve = new THREE.CatmullRomCurve3(ROAD_PTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal', 0.5);
  curve.arcLengthDivisions = 4000;
  const field = new PathField(curve, 2);
  const near = { dist: 0, y: 0, u: 0, x: 0, z: 0 };
  const roadAt = makeRoadLookup(curve);
  const uAt = (z: number) => roadAt(z).u;
  /** world position at a lateral offset from the road (positive = right) */
  const at = (z: number, lat: number, yOff = 0) => { const p = roadAt(z); const x = p.x + p.rx * lat, zz = p.z + p.rz * lat; return new THREE.Vector3(x, heightAt(x, zz) + yOff, zz); };
  /** yaw that makes local +z face the road from the given side */
  const faceRoad = (z: number, side: number) => { const p = roadAt(z); return Math.atan2(-p.rx * side, -p.rz * side); };
  /** yaw along the direction of travel */
  const alongRoad = (z: number) => { const p = roadAt(z); return Math.atan2(p.rz, -p.rx); };

  // ---------- terrain ----------
  const WATER = 0;
  /** height of the pavement surface above heightAt() */
  const PAV = 0.27;
  const GARE_Y = roadAt(-2040).y - 0.1;
  const MOULIN = { x: roadAt(-300).x + 42, z: -300 };
  const heightAt = (x: number, z: number) => {
    const n = field.nearest(x, z, near);
    const lat = x - n.x;
    const dist = n.dist;
    const roadY = n.y - 0.1;
    const hillW = smoothstep(-460, -540, z) * (1 - smoothstep(-1040, -1110, z));
    const canalW = smoothstep(-1100, -1125, z) * (1 - smoothstep(-1635, -1655, z));
    const far = smoothstep(8, 40, dist);
    let h = roadY + (fbm(x * 0.01, z * 0.01, 3) - 0.5) * 6 * far * (1 - hillW);
    if (hillW > 0) {
      let hh = roadY - Math.min(dist, 90) * 0.24 - Math.max(0, dist - 90) * 0.1 + (fbm(x * 0.02, z * 0.02, 2) - 0.5) * 3 * far;
      const sc = Math.hypot(x + 66, z + 800);
      hh = lerp(hh, roadY + 12.5, 1 - smoothstep(24, 40, sc));
      const plaza = (1 - smoothstep(20, 30, Math.abs(z + 800))) * smoothstep(-24, -20, lat) * (1 - smoothstep(-6, -4, lat));
      hh = lerp(hh, roadY + 1.0, plaza);
      const stair = (1 - smoothstep(11.5, 14, Math.abs(z + 800))) * smoothstep(-42, -40, lat) * (1 - smoothstep(-20, -18, lat));
      hh = lerp(hh, roadY + 1.0 + 11.5 * clamp((-20 - lat) / 20, 0, 1), stair);
      h = lerp(h, hh, hillW);
    }
    // flat pads: the Moulin Rouge yard and the station forecourt
    h = lerp(h, roadY, 1 - smoothstep(16, 30, Math.hypot(x - MOULIN.x, z - MOULIN.z)));
    h = lerp(h, GARE_Y, smoothstep(-1940, -1965, z) * (1 - smoothstep(-2110, -2140, z)) * (1 - smoothstep(70, 90, Math.abs(lat))));
    const corridor = 1 - smoothstep(7.5, 22, dist);
    h = lerp(h, roadY, corridor);
    if (canalW > 0) {
      const inCanal = smoothstep(9.0, 10.5, lat) * (1 - smoothstep(29.5, 31, lat));
      h = lerp(h, -2.6, canalW * inCanal);
    }
    return h;
  };
  const asphalt = new THREE.Color(0x474b47), pave = new THREE.Color(0x5c605a), grass1 = new THREE.Color(0x4f7f3a), grass2 = new THREE.Color(0x6f9a48), dry = new THREE.Color(0x9a8a56), bed = new THREE.Color(0x14241e), city = new THREE.Color(0x30363a);
  const terrain = buildTerrain({
    xMin: -480, xMax: 480, zMin: -2260, zMax: 160, res: 4, chunk: 320,
    height: heightAt,
    color: (x, z, y, slope, out) => {
      const n = fbm(x * 0.05, z * 0.05, 3);
      if (y < WATER + 0.4) { out.copy(bed); return; }
      const d = field.nearest(x, z, near).dist;
      const hill = smoothstep(-460, -540, z) * (1 - smoothstep(-1040, -1110, z));
      if (hill > 0.5 && d > 8) { out.copy(grass1).lerp(grass2, n).lerp(dry, smoothstep(0.5, 0.8, fbm(x * 0.03, z * 0.03, 2)) * 0.5).lerp(pave, smoothstep(0.4, 0.7, slope)); return; }
      out.copy(asphalt).lerp(pave, smoothstep(6, 12, d)).offsetHSL(0, 0, (n - 0.5) * 0.06);
      out.lerp(city, smoothstep(60, 140, d));
    },
  });
  scene.add(terrain);

  // ---------- the road ----------
  scene.add(buildRoad(curve, rng));

  // ---------- sky, lights, fog ----------
  const sky = new Sky(1400);
  scene.add(sky.mesh);
  scene.fog = new THREE.FogExp2(0x6b6a80, 0.0035);
  const sun = new THREE.DirectionalLight(0xffb070, 1.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0x8f86b0, 0x5a4a30, 0.9);
  scene.add(hemi);

  // ---------- Rue Lepic ----------
  const cafe = buildCafe(rng);
  {
    const p = at(-22, 8.6 + cafe.depth / 2, -0.3);
    cafe.group.position.copy(p); cafe.group.rotation.y = faceRoad(-22, 1);
    scene.add(cafe.group);
  }
  const rowsLepic = buildHaussmannRows(rng, heightAt, roadAt, [
    { zFrom: 92, zTo: -455, side: -1, lat: 8.6, floors: [4, 6], shops: 0.45 },
    { zFrom: 92, zTo: -455, side: 1, lat: 8.6, floors: [4, 6], shops: 0.45, skip: [[-2, -42], [-288, -314]] },
  ]);
  scene.add(rowsLepic);
  const moulin = buildMoulinRouge(rng);
  moulin.group.position.set(MOULIN.x, heightAt(MOULIN.x, MOULIN.z) - 0.3, MOULIN.z);
  moulin.group.rotation.y = faceRoad(-300, 1);
  scene.add(moulin.group);
  // a short cobbled side street leading down to it
  {
    const p = roadAt(-301);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 30), new THREE.MeshLambertMaterial({ map: pavingTexture(rng) }));
    s.rotation.x = -Math.PI / 2; s.rotation.z = -Math.atan2(p.rx, p.rz);
    s.position.set(p.x + p.rx * 19, heightAt(p.x + p.rx * 19, p.z) + 0.08, p.z + p.rz * 19);
    scene.add(s);
  }

  // ---------- Montmartre ----------
  const booth = buildPhotobooth();
  { const p = at(-522, 6.6, PAV - 0.03); booth.position.copy(p); booth.rotation.y = faceRoad(-522, 1); scene.add(booth); }
  const phoneBox = buildPhoneBox();
  { const p = at(-560, -6.6, PAV - 0.03); phoneBox.position.copy(p); phoneBox.rotation.y = faceRoad(-560, -1); scene.add(phoneBox); }
  const bench1 = buildBench();
  { const p = at(-690, -6.6, PAV); bench1.position.copy(p); bench1.rotation.y = faceRoad(-690, -1); scene.add(bench1); }
  const dufHouse = buildDufayelHouse(rng);
  { const p = at(-700, 8.6 + dufHouse.depth / 2, -0.3); dufHouse.group.position.copy(p); dufHouse.group.rotation.y = faceRoad(-700, 1); scene.add(dufHouse.group); }
  // the cat's house: a small pink house with a lit window and a deep sill
  const catHouse = new THREE.Group();
  {
    const f = parisFacade(rng, { wall: '#ffffff', floors: 2, cols: 2, lit: 0.5, balconies: [1] });
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xe8c9b8, map: f.map, emissive: 0xffffff, emissiveMap: f.emissiveMap, emissiveIntensity: 0.8 });
    const plain = lambert(0xe8c9b8);
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 11, 8), [plain, plain, plain, plain, wallMat, plain]);
    body.position.y = 4.5; catHouse.add(body);
    catHouse.add(mesh(mansardGeometry(8.3, 8.3, 2.2, 1.1), toonE(0x8a4a3a, 0.08), 0, 9, 0));
    catHouse.add(box(2.0, 1.8, 0.2, glow(0xffd58a, 1.0), -1.6, 2.4, 4.05));
    for (const s of [-1, 1]) catHouse.add(box(0.5, 1.9, 0.12, toonE(0x2f5d3f, 0.2), -1.6 + s * 1.35, 2.4, 4.08));
    catHouse.add(box(2.6, 0.16, 0.6, toonE(0xd9ccb2, 0.1), -1.6, 1.45, 4.25));
    catHouse.add(box(1.2, 2.4, 0.15, toonE(0x3a2a24, 0.1), 2.2, 1.2, 4.05));
    catHouse.add(box(1.5, 1.5, 1.7, toonE(0x8a949a, 0.1), 2.2, 11.7, 3.3));
    catHouse.add(box(0.8, 0.9, 0.1, glow(0xffd58a, 0.8), 2.2, 11.7, 4.2));
    const p = at(-745, -(8.6 + 4), -0.3); catHouse.position.copy(p); catHouse.rotation.y = faceRoad(-745, -1); scene.add(catHouse);
  }
  const sacre = buildSacreCoeur();
  sacre.position.set(-66, heightAt(-66, -800) - 0.4, -800);
  sacre.rotation.y = Math.PI / 2;
  scene.add(sacre);
  const stairs = buildStairs(12, 22, 20, 11.5, 3);
  stairs.group.position.set(-20, roadAt(-800).y - 0.1 + 1.0, -800);
  stairs.group.rotation.y = Math.PI / 2;
  scene.add(stairs.group);
  const carouselPos = at(-790, -13, 0);
  const avoid = (x: number, z: number) => {
    if (Math.hypot(x - booth.position.x, z - booth.position.z) < 9) return true;
    if (Math.hypot(x - phoneBox.position.x, z - phoneBox.position.z) < 6) return true;
    if (Math.hypot(x - dufHouse.group.position.x, z - dufHouse.group.position.z) < 13) return true;
    if (Math.hypot(x - catHouse.position.x, z - catHouse.position.z) < 10) return true;
    if (Math.hypot(x - carouselPos.x, z - carouselPos.z) < 12) return true;
    if (x < -10 && Math.abs(z + 800) < 48) return true;
    if (Math.hypot(x + 66, z + 800) < 52) return true;
    return false;
  };
  const montmartre = buildMontmartre(rng, heightAt, roadAt, avoid);
  scene.add(montmartre);
  // trees in the gardens and on the slopes below the basilica
  {
    const pl: Placement[] = [];
    let tries = 0;
    while (pl.length < 90 && tries < 1500) {
      tries++;
      const z = rng.range(-1075, -475);
      const p = roadAt(z);
      const lat = rng.sign() * rng.range(12, 90);
      const x = p.x + p.rx * lat, zz = p.z + p.rz * lat;
      if (avoid(x, zz) && !(Math.hypot(x + 66, zz + 800) < 52 && Math.abs(zz + 800) > 16)) continue;
      if (Math.abs(zz + 800) < 16 && x < -10 && x > -50) continue;
      pl.push({ x, y: heightAt(x, zz) - 0.2, z: zz, scale: rng.range(0.8, 1.4), rot: rng.range(0, TAU) });
    }
    scene.add(instancedTrees({ trunk: 0x4a3a2c, canopy: [0x2f6b46, 0x3b7a4f, 0x35704a], shape: 'round' }, pl, rng, true));
  }

  // ---------- Canal Saint-Martin ----------
  const canal = buildCanal(rng, curve, roadAt, heightAt, -1115, -1640, 9.5, 30, [-1200, -1380, -1560]);
  scene.add(canal.group);
  const water = waterMaterial({ shallow: 0x3a7f66, deep: 0x183f34, sky: 0x2a4d48, opacity: 0.94, waveScale: 1.6 });
  const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(90, 600, 24, 120), water.material);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(roadAt(-1380).x + 20, WATER, -1380);
  waterMesh.renderOrder = 1;
  scene.add(waterMesh);
  const rowsCanal = buildHaussmannRows(rng, heightAt, roadAt, [
    { zFrom: -1118, zTo: -1640, side: -1, lat: 8.6, floors: [4, 6], shops: 0.3 },
    { zFrom: -1118, zTo: -1640, side: 1, lat: 34, floors: [4, 6], shops: 0.25, walls: [0xece0c6, 0xe4d6bc, 0xf0e6cc] },
  ]);
  scene.add(rowsCanal);

  // ---------- Gare de l'Est ----------
  const rowsGare = buildHaussmannRows(rng, heightAt, roadAt, [
    { zFrom: -1655, zTo: -1950, side: -1, lat: 8.6, floors: [5, 7], shops: 0.4 },
    { zFrom: -1655, zTo: -1950, side: 1, lat: 8.6, floors: [5, 7], shops: 0.4 },
  ]);
  scene.add(rowsGare);
  const gare = buildGare(rng);
  gare.position.set(roadAt(-2040).x, GARE_Y - 0.2, -2072);
  scene.add(gare);
  const forecourt = new THREE.Mesh(new THREE.BoxGeometry(110, 0.24, 130), new THREE.MeshLambertMaterial({ map: pavingTexture(rng) }));
  forecourt.position.set(roadAt(-2040).x, GARE_Y - 0.02, -2010);
  forecourt.receiveShadow = true;
  scene.add(forecourt);
  for (const [lat, z, col] of [[16, -2035, 0xf3e9c8], [21, -2028, 0x1a1a1e], [-18, -2032, 0xf3e9c8]] as const) {
    const car = buildCar(col); const p = at(z, lat, 0.12); car.position.copy(p); car.rotation.y = alongRoad(z) + (lat > 0 ? 0.35 : -0.35); scene.add(car);
  }
  const metro = buildMetro();
  { const p = at(-1905, 5.6, PAV); metro.position.copy(p); metro.rotation.y = alongRoad(-1905); scene.add(metro); }
  // far skyline and the Eiffel Tower
  const skyline = buildSkyline(rng, roadAt, heightAt, 60, -2040);
  { const p = roadAt(-1400); skyline.tower.position.set(p.x + 640, heightAt(p.x + 640, -1400) - 2, -1400); }
  scene.add(skyline.group);

  // ---------- street lamps ----------
  const lampPl: Placement[] = [];
  const lampAt = (z: number, lat: number, scale = 1, yOff = PAV) => { const p = at(z, lat, yOff); lampPl.push({ x: p.x, y: p.y, z: p.z, scale, rot: 0 }); };
  for (let z = 40, i = 0; z > -450; z -= 30, i++) lampAt(z, i % 2 ? 6.9 : -6.9);
  for (let z = -470, i = 0; z > -1090; z -= 34, i++) { if (Math.abs(z + 790) < 20 || Math.abs(z + 522) < 6) continue; lampAt(z, i % 2 ? 6.9 : -6.9); }
  for (let z = -1120; z > -1640; z -= 26) { lampAt(z, -6.9); lampAt(z, 31.8, 1, 0.05); }
  for (let z = -1660, i = 0; z > -1960; z -= 28, i++) lampAt(z, i % 2 ? 6.9 : -6.9);
  for (const lat of [-30, -12, 12, 30]) lampAt(-2030, lat, 1.1, 0.12);
  lampAt(-1990, -7.2);
  lampAt(-812, -8.0, 1, 0.05); lampAt(-778, -8.0, 1, 0.05);
  {
    // the stair lamps live in the stairs' local frame
    stairs.group.updateMatrixWorld(true);
    for (const l of stairs.lamps) { const v = new THREE.Vector3(l.x, l.y, l.z).applyMatrix4(stairs.group.matrixWorld); lampPl.push({ x: v.x, y: v.y, z: v.z, scale: l.scale, rot: 0 }); }
  }
  const lamps = buildLamps(lampPl);
  scene.add(lamps.group);
  // hero point lights (6 in total, the moped headlamp included)
  const addLight = (p: THREE.Vector3, color: number, intensity: number, dist: number) => { const l = new THREE.PointLight(color, intensity, dist, 1.5); l.position.copy(p); scene.add(l); return l; };
  addLight(at(-22, 6.5, 3.6), 0xffb86a, 40, 36);
  addLight(booth.position.clone().add(new THREE.Vector3(0, 3.0, 0)), 0xffd9a0, 18, 24);
  const carouselLight = addLight(carouselPos.clone().add(new THREE.Vector3(0, 6.5, 0)), 0xffc070, 22, 40);
  { dufHouse.group.updateMatrixWorld(true); addLight(dufHouse.windowPos.clone().applyMatrix4(dufHouse.group.matrixWorld), 0xffd08a, 7, 18); }
  addLight(at(-1990, -7.2, 4.6), 0xffd9a0, 26, 30);

  // ---------- vehicle: Nino's red moped ----------
  const moped = buildMoped();
  const vehicle = new THREE.Group();
  vehicle.add(moped.group);
  scene.add(vehicle);
  const cameraAnchor = new THREE.Object3D();
  cameraAnchor.position.set(0, 1.64, -0.42);
  cameraAnchor.rotation.y = Math.PI; // camera looks down its -z; the moped's front is +z
  vehicle.add(cameraAnchor);

  // ---------- characters & subjects ----------
  const subjects: Subject[] = [];
  const updaters: Array<(dt: number, t: number, ride: RideState) => void> = [];
  const fwd = (g: THREE.Object3D) => () => new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));
  const setActive = (s: Subject, on: boolean) => { s.active = on; s.group.visible = on; };
  const camPos = new THREE.Vector3();
  const lookAtCamera = (g: THREE.Object3D, restYaw: number, turning: boolean, dt: number) => {
    let target = restYaw;
    if (turning) { ctx.camera.getWorldPosition(camPos); target = Math.atan2(camPos.x - g.position.x, camPos.z - g.position.z); }
    g.rotation.y = dampAngle(g.rotation.y, target, 6, dt);
  };

  // Amélie by the café door
  const amelie = makeAmelie();
  cafe.group.updateMatrixWorld(true);
  amelie.group.position.copy(new THREE.Vector3(0.9, 0.56, cafe.depth / 2 + 1.0).applyMatrix4(cafe.group.matrixWorld));
  const amelieRest = cafe.group.rotation.y;
  amelie.group.rotation.y = amelieRest;
  scene.add(amelie.group);
  let amelieTurn = 0;
  const amelieSubject = new Subject({
    id: 'amelie', name: 'Amélie', from: FROM, group: amelie.group, radius: 1.1, base: 1500, rarity: 'legendary',
    hint: 'Waits by the door of the Café des 2 Moulins at the very start. Play the accordion and she turns to smile at you; a stone at her feet makes her giggle.',
    poses: { wave: { label: 'That smile', mult: 2.0 }, giggle: { label: 'A giggle', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 1.1, 0), facing: fwd(amelie.group),
    onCall: () => { amelie.wave(); amelieTurn = 2.4; amelieSubject.setPose('wave', 2.0); return true; },
    onItem: () => { amelie.giggle(); amelieTurn = 1.8; amelieSubject.setPose('giggle', 1.5); return true; }, reactRange: 12, maxDistance: 110,
  });
  subjects.push(amelieSubject);
  updaters.push((dt, t, ride) => {
    const active = ride.u < uAt(-130);
    setActive(amelieSubject, active);
    if (!active) return;
    amelieTurn = Math.max(0, amelieTurn - dt);
    lookAtCamera(amelie.group, amelieRest, amelieTurn > 0, dt);
    amelie.update(dt, t);
  });
  // the café itself, the Moulin Rouge
  const cafeAnchor = new THREE.Object3D(); cafeAnchor.position.copy(new THREE.Vector3(0, 4, cafe.depth / 2).applyMatrix4(cafe.group.matrixWorld)); scene.add(cafeAnchor);
  const cafeSubject = new Subject({ id: 'cafe', name: 'Café des 2 Moulins', from: FROM, group: cafeAnchor, radius: 7, base: 700, hint: 'The corner café with the red awning where the ride begins.', maxDistance: 160 });
  subjects.push(cafeSubject);
  const moulinSubject = new Subject({ id: 'moulin', name: 'The Moulin Rouge', from: FROM, group: moulin.group, radius: 12, base: 600, hint: 'Its red sails turn at the end of a side street on the right.', centerOffset: new THREE.Vector3(0, 16, 2), maxDistance: 220 });
  subjects.push(moulinSubject);
  updaters.push((dt, t, ride) => {
    setActive(cafeSubject, ride.u < uAt(-200));
    moulinSubject.active = ride.u < uAt(-430);
    moulin.sails.rotation.z += dt * 0.35;
    moulin.bulbMat.color.setHex(0xff6a50).multiplyScalar(1.3 + Math.sin(t * 5) * 0.25);
    void t;
  });

  // Lucien & Collignon at the greengrocer's
  const grocers = makeGrocers(rng);
  { const p = at(-175, -6.3, PAV); grocers.group.position.copy(p); grocers.group.rotation.y = faceRoad(-175, -1); scene.add(grocers.group); }
  const grocerSubject = new Subject({
    id: 'grocer', name: 'Lucien & Collignon', from: FROM, group: grocers.group, radius: 2.6, base: 800, rarity: 'rare',
    hint: 'The greengrocer and his kind assistant at the stall on the left. The accordion makes Lucien show off an endive; a stone makes Collignon flinch.',
    poses: { endive: { label: 'The perfect endive', mult: 1.7 }, flinch: { label: 'Collignon flinches', mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 1.2, -0.4), facing: fwd(grocers.group),
    onCall: () => { grocers.endive(); grocerSubject.setPose('endive', 1.7); return true; },
    onItem: () => { grocers.flinch(); grocerSubject.setPose('flinch', 1.4); return true; }, reactRange: 13, maxDistance: 110,
  });
  subjects.push(grocerSubject);
  updaters.push((dt, t, ride) => { const a = ride.u < uAt(-320); setActive(grocerSubject, a); if (a) grocers.update(dt, t); });

  // pigeons pecking on the right pavement
  const pigeons = makePigeons(9, rng, 2.4);
  { const p = at(-238, 5.2, PAV); pigeons.group.position.copy(p); scene.add(pigeons.group); }
  const pigeonSubject = new Subject({
    id: 'pigeons', name: 'Pigeons', from: FROM, group: pigeons.group, radius: 2.4, base: 300,
    hint: 'Pecking at crumbs on the right. A stone sends them up in a flurry.',
    poses: { scatter: { label: 'Scatter!', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 0.5, 0),
    onItem: () => { pigeons.scatter(); pigeonSubject.setPose('scatter', 1.8); return true; }, reactRange: 12, maxDistance: 90,
  });
  subjects.push(pigeonSubject);
  updaters.push((dt, t, ride) => { const a = ride.u < uAt(-360); setActive(pigeonSubject, a); if (a) pigeons.update(dt, t); });

  // the photo booth and Nino
  const boothAnchor = new THREE.Object3D(); boothAnchor.position.copy(booth.position).add(new THREE.Vector3(0, 1.4, 0)); scene.add(boothAnchor);
  const boothSubject = new Subject({ id: 'photobooth', name: 'The photo booth', from: FROM, group: boothAnchor, radius: 1.8, base: 500, hint: 'Glowing on a corner as the lane starts to climb.', maxDistance: 120 });
  subjects.push(boothSubject);
  const nino = makeNino();
  { const p = at(-518, 5.4, PAV); nino.group.position.copy(p); nino.group.rotation.y = faceRoad(-518, 1) + 0.6; scene.add(nino.group); }
  const ninoSubject = new Subject({
    id: 'nino', name: 'Nino', from: FROM, group: nino.group, radius: 1.2, base: 900, rarity: 'rare',
    hint: 'Crouched by the photo booth gathering torn photos. Play the accordion and he stands to show you one.',
    poses: { photo: { label: 'The torn photo', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 0.8, 0), facing: fwd(nino.group),
    onCall: () => { nino.stand(); ninoSubject.setPose('photo', 1.7); return true; }, maxDistance: 110,
  });
  subjects.push(ninoSubject);
  updaters.push((dt, t, ride) => {
    const a = ride.u > uAt(-380) && ride.u < uAt(-620);
    setActive(boothSubject, a); setActive(ninoSubject, a);
    if (a) nino.update(dt, t);
  });

  // the travelling gnome: one subject that hops between spots ahead of the moped
  const gnome = makeGnome();
  scene.add(gnome.group);
  const gnomeSpots: { pos: THREE.Vector3; yaw: number; pose: string; until: number }[] = [];
  {
    const p1 = at(-561, -5.8, PAV); gnomeSpots.push({ pos: p1, yaw: faceRoad(-561, -1) + 0.4, pose: 'phone', until: uAt(-575) });
    bench1.updateMatrixWorld(true);
    const p2 = new THREE.Vector3(0.35, 0.49, 0.05).applyMatrix4(bench1.matrixWorld); gnomeSpots.push({ pos: p2, yaw: bench1.rotation.y, pose: 'bench', until: uAt(-704) });
    catHouse.updateMatrixWorld(true);
    const p3 = new THREE.Vector3(2.2, 12.45, 3.3).applyMatrix4(catHouse.matrixWorld); gnomeSpots.push({ pos: p3, yaw: catHouse.rotation.y, pose: 'roof', until: uAt(-760) });
    const p4 = at(-813, -21.5, 0.05); gnomeSpots.push({ pos: p4, yaw: faceRoad(-813, -1) + 0.3, pose: 'steps', until: uAt(-840) });
    const top = canal.bridgeTops[1]; const p = roadAt(-1380); const bx = new THREE.Vector3(p.rz, 0, -p.rx).normalize();
    const p5 = top.clone().addScaledVector(bx, 1.1).add(new THREE.Vector3(0, 0.0, 0)); gnomeSpots.push({ pos: p5, yaw: faceRoad(-1380, 1), pose: 'bridge', until: uAt(-1400) });
    const p6 = at(-2030, 12, 0.12).add(new THREE.Vector3(0, 0, 3)); gnomeSpots.push({ pos: p6, yaw: faceRoad(-2030, 1) + 0.4, pose: 'gare', until: 2 });
  }
  let gnomeSpot = -1;
  const gnomeSubject = new Subject({
    id: 'gnome', name: 'The travelling gnome', from: FROM, group: gnome.group, radius: 0.7, base: 850, rarity: 'rare',
    hint: 'A red-hatted garden gnome who keeps turning up ahead of you: by a phone box, on a bench, on a roof, at the foot of the steps... Toss a stone and he tips his hat.',
    poses: {
      phone: { label: 'Postcard from the phone box', mult: 1.3 }, bench: { label: 'Postcard from the bench', mult: 1.3 }, roof: { label: 'Postcard from the rooftop', mult: 1.35 },
      steps: { label: 'Postcard from Sacré-Cœur', mult: 1.4 }, bridge: { label: 'Postcard from the canal', mult: 1.35 }, gare: { label: 'Postcard from the station', mult: 1.3 },
      hat: { label: 'Tipping his hat', mult: 1.6 },
    }, centerOffset: new THREE.Vector3(0, 0.45, 0), facing: fwd(gnome.group),
    onItem: () => { gnome.tipHat(); gnomeSubject.setPose('hat', 1.6); return true; }, reactRange: 12, maxDistance: 90,
  });
  subjects.push(gnomeSubject);
  updaters.push((dt, t, ride) => {
    let i = 0;
    while (i < gnomeSpots.length - 1 && ride.u > gnomeSpots[i].until) i++;
    if (i !== gnomeSpot) {
      gnomeSpot = i;
      const s = gnomeSpots[i];
      gnome.group.position.copy(s.pos); gnome.group.rotation.y = s.yaw;
      gnomeSubject.setPose(s.pose, 9999);
    }
    if (gnomeSubject.pose === 'idle') gnomeSubject.setPose(gnomeSpots[gnomeSpot].pose, 9999);
    gnome.update(dt, t);
  });

  // the blind man guided by a small Amélie, walking down the left pavement
  const blind = makeBlindPair();
  scene.add(blind.group);
  const blindState = { z: -608 };
  const blindSubject = new Subject({
    id: 'blindman', name: 'The blind man', from: FROM, group: blind.group, radius: 1.4, base: 700,
    hint: 'Being walked down the lane while Amélie describes everything she sees. The accordion makes him laugh and raise his cane.',
    poses: { laugh: { label: 'Seeing the street', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.1, 0), facing: fwd(blind.group),
    onCall: () => { blind.laugh(); blindSubject.setPose('laugh', 1.6); return true; }, maxDistance: 100,
  });
  subjects.push(blindSubject);
  updaters.push((dt, t, ride) => {
    const a = ride.u > uAt(-470) && ride.u < uAt(-740);
    setActive(blindSubject, a);
    if (!a) return;
    const moving = blindSubject.pose !== 'laugh' && blindState.z > -672;
    blind.walking = moving;
    if (moving) blindState.z -= dt * 0.55;
    const p = at(blindState.z, -5.7, PAV);
    blind.group.position.copy(p);
    blind.group.rotation.y = alongRoad(blindState.z);
    blind.update(dt, t);
  });

  // Dufayel inside his lit window
  const dufayel = makeDufayel();
  dufayel.group.position.copy(dufHouse.interior); dufayel.group.rotation.y = -0.35;
  dufHouse.group.add(dufayel.group);
  const dufSubject = new Subject({
    id: 'dufayel', name: 'Dufayel, the glass man', from: FROM, group: dufayel.group, radius: 1.3, base: 900, rarity: 'rare',
    hint: 'Painting his boating party behind the big lit window on the right. Play the accordion and he turns to look out at you.',
    poses: { look: { label: 'The glass man looks out', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.1, 0), facing: fwd(dufayel.group),
    onCall: () => { dufayel.turn(); dufSubject.setPose('look', 1.6); return true; }, maxDistance: 80,
  });
  subjects.push(dufSubject);
  updaters.push((dt, t, ride) => { const a = ride.u > uAt(-560) && ride.u < uAt(-790); dufSubject.active = a; if (a) dufayel.update(dt, t); });

  // a cat on the windowsill
  const cat = makeCat();
  cat.group.position.set(-1.7, 1.55, 4.3); cat.group.rotation.y = 0.3;
  catHouse.add(cat.group);
  const catSubject = new Subject({ id: 'cat', name: 'A cat on a windowsill', from: FROM, group: cat.group, radius: 0.5, base: 400, hint: 'Watching the lane from a pink house on the left, halfway up the hill.', centerOffset: new THREE.Vector3(0, 0.35, 0), facing: fwd(cat.group), maxDistance: 70 });
  subjects.push(catSubject);
  updaters.push((dt, t, ride) => { const a = ride.u > uAt(-640) && ride.u < uAt(-830); catSubject.active = a; if (a) cat.update(dt, t); });

  // the carousel and the basilica above it
  const carousel = makeCarousel(rng);
  carousel.group.position.copy(carouselPos); scene.add(carousel.group);
  const carouselSubject = new Subject({
    id: 'carousel', name: 'The carousel', from: FROM, group: carousel.group, radius: 6, base: 650,
    hint: 'A two-tier merry-go-round at the foot of the Sacré-Cœur steps. The accordion brings its lights up and sets it spinning.',
    poses: { lights: { label: 'Lights on', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 4.5, 0),
    onCall: () => { carousel.lightsOn(); carouselSubject.setPose('lights', 1.8); return true; }, maxDistance: 150,
  });
  subjects.push(carouselSubject);
  const sacreAnchor = new THREE.Object3D(); sacreAnchor.position.set(-66, heightAt(-66, -800) + 16, -800); scene.add(sacreAnchor);
  const sacreSubject = new Subject({ id: 'sacrecoeur', name: 'Sacré-Cœur', from: FROM, group: sacreAnchor, radius: 22, base: 900, hint: 'The white basilica at the top of the broad steps, seen from the crest of the hill.', maxDistance: 320 });
  subjects.push(sacreSubject);
  updaters.push((dt, t, ride) => {
    const a = ride.u > uAt(-600) && ride.u < uAt(-930);
    carouselSubject.active = a; sacreSubject.active = ride.u > uAt(-540) && ride.u < uAt(-980);
    carousel.update(dt, t);
    carouselLight.intensity = 14 + carousel.lit * 30 + Math.sin(t * 7) * 1.5;
  });

  // Blubber the goldfish in the canal, and the skipping-stone rings
  const blubber = makeBlubber();
  blubber.group.position.copy(at(-1400, 19, 0)); blubber.group.position.y = WATER;
  scene.add(blubber.group);
  const blubberSubject = new Subject({
    id: 'blubber', name: 'Blubber', from: FROM, group: blubber.group, radius: 1.0, base: 950, rarity: 'rare',
    hint: 'A goldfish living in the canal near the middle footbridge. Skip a stone onto the water near him and he leaps.',
    poses: { leap: { label: "Blubber's leap", mult: 1.9 } }, centerOffset: new THREE.Vector3(0, 0.8, 0),
    onItem: (pos) => { if (heightAt(pos.x, pos.z) > WATER - 0.5) return false; blubber.leap(pos); blubberSubject.setPose('leap', 1.9); return true; }, reactRange: 18, maxDistance: 90,
  });
  subjects.push(blubberSubject);
  updaters.push((dt, t, ride) => {
    const inRange = ride.u > uAt(-1130) && ride.u < uAt(-1640);
    blubber.group.visible = inRange;
    blubberSubject.active = inRange && blubber.up();
    if (inRange) blubber.update(dt, t);
  });
  const rings: { m: THREE.Mesh; t: number; life: number }[] = [];
  {
    const geo = new THREE.RingGeometry(0.45, 0.6, 24);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xcfe8d8, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2;
      scene.add(m); rings.push({ m, t: -1, life: 1.3 });
    }
  }
  const spawnSkip = (pos: THREE.Vector3, dir: THREE.Vector3) => {
    let n = 0;
    for (const r of rings) {
      if (r.t >= 0) continue;
      r.m.position.set(pos.x + dir.x * n * 1.9, WATER + 0.05, pos.z + dir.z * n * 1.9);
      r.t = -n * 0.22; r.life = 1.3 - n * 0.12;
      if (++n >= 4) break;
    }
  };
  const ridePos = new THREE.Vector3(0, 4, 60);

  // the busker on the middle bridge and the lovers on the towpath
  const busker = makeBusker();
  busker.group.position.copy(canal.bridgeTops[1]); busker.group.rotation.y = faceRoad(-1380, 1);
  scene.add(busker.group);
  const buskerSubject = new Subject({
    id: 'busker', name: 'The accordion player', from: FROM, group: busker.group, radius: 1.2, base: 600,
    hint: 'Playing alone on the crown of the middle footbridge. Answer him with your accordion and he plays along.',
    poses: { play: { label: 'Playing along', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.1, 0), facing: fwd(busker.group),
    onCall: () => { busker.play(); buskerSubject.setPose('play', 1.6); return true; }, maxDistance: 110,
  });
  subjects.push(buskerSubject);
  const lovers = makeLovers();
  { const p = at(-1470, 7.3, PAV); lovers.group.position.copy(p); lovers.group.rotation.y = faceRoad(-1470, -1) + 0.5; scene.add(lovers.group); }
  const loversSubject = new Subject({ id: 'lovers', name: 'Lovers on the quay', from: FROM, group: lovers.group, radius: 1.3, base: 350, hint: 'Sharing a bench by the dark green water.', centerOffset: new THREE.Vector3(0, 0.9, 0), facing: fwd(lovers.group), maxDistance: 80 });
  subjects.push(loversSubject);
  updaters.push((dt, t, ride) => {
    const a = ride.u > uAt(-1180) && ride.u < uAt(-1520);
    setActive(buskerSubject, a); if (a) busker.update(dt, t);
    const b = ride.u > uAt(-1330) && ride.u < uAt(-1580);
    setActive(loversSubject, b); if (b) lovers.update(dt, t);
  });

  // the station, the Métro, and the finale under the last lamp
  const gareAnchor = new THREE.Object3D(); gareAnchor.position.copy(gare.position).add(new THREE.Vector3(0, 12, 8)); scene.add(gareAnchor);
  const gareSubject = new Subject({ id: 'gare', name: "Gare de l'Est", from: FROM, group: gareAnchor, radius: 24, base: 600, hint: 'The great arched façade with its clock, where the road ends.', maxDistance: 320 });
  subjects.push(gareSubject);
  const metroSubject = new Subject({ id: 'metro', name: 'Métropolitain', from: FROM, group: metro, radius: 2.4, base: 450, hint: 'An Art Nouveau entrance with green ironwork and red lamps, on the right before the station.', centerOffset: new THREE.Vector3(0, 2.2, -2), maxDistance: 100 });
  subjects.push(metroSubject);
  const parked = buildMoped({ light: false });
  const finalePos = at(-1992, -6.3, PAV), finaleYaw = alongRoad(-1992) - 0.9;
  parked.group.position.copy(finalePos); parked.group.rotation.y = finaleYaw; scene.add(parked.group);
  const finale = makeFinale();
  finale.group.position.copy(finalePos); finale.group.rotation.y = finaleYaw; scene.add(finale.group);
  const finaleSubject = new Subject({
    id: 'finale', name: 'Amélie & Nino', from: FROM, group: finale.group, radius: 1.5, base: 1300, rarity: 'legendary',
    hint: 'Together on a parked moped under the last street lamp before the station. Play the accordion and they lean in.',
    poses: { lean: { label: 'Lean in', mult: 2.0 } }, centerOffset: new THREE.Vector3(0, 1.3, -0.2), facing: fwd(finale.group),
    onCall: () => { finale.leanIn(); finaleSubject.setPose('lean', 2.0); return true; }, maxDistance: 100,
  });
  subjects.push(finaleSubject);
  updaters.push((dt, t, ride) => {
    gareSubject.active = ride.u > uAt(-1700);
    metroSubject.active = ride.u > uAt(-1760) && ride.u < uAt(-1965);
    const a = ride.u > 0.92;
    setActive(finaleSubject, a); parked.group.visible = a;
    if (a) finale.update(dt, t);
  });

  // golden dust drifting in the lamp light
  const dust = new Drift({ count: 260, color: 0xffd28a, size: 0.3, box: new THREE.Vector3(50, 14, 50), speed: new THREE.Vector3(0.2, -0.15, 0), wobble: 0.8, opacity: 0.7, blending: THREE.AdditiveBlending });
  dust.intensity = 0.3;
  scene.add(dust.points);

  // ---------- lighting ----------
  const TINT = 0xdff3c8;
  const lighting = makeLighting([
    { u: 0.0, skyTop: 0x2a3d6e, skyMid: 0x7a6f9a, skyBottom: 0xe0a070, fog: 0x6b6a80, fogDensity: 0.0034, sunDir: [0.55, 0.14, 0.55], sunColor: 0xffb070, sunIntensity: 1.1, hemiSky: 0x8f86b0, hemiGround: 0x6a5634, hemiIntensity: 1.0, stars: 0.12, moon: 0.15, exposure: 1.0, bloom: 0.5, saturation: 1.25, tint: TINT, sunGlow: 0.5, sunSize: 0.03, horizonHeight: 0.1 },
    { u: 0.19, skyTop: 0x22355e, skyMid: 0x6a6390, skyBottom: 0xd09068, fog: 0x62627a, fogDensity: 0.0036, sunDir: [0.6, 0.08, 0.55], sunColor: 0xffa060, sunIntensity: 0.9, hemiSky: 0x847da8, hemiGround: 0x6a5634, hemiIntensity: 1.05, stars: 0.25, moon: 0.25, exposure: 1.0, bloom: 0.52, saturation: 1.25, tint: TINT, sunGlow: 0.35, sunSize: 0.03, horizonHeight: 0.1 },
    { u: 0.34, skyTop: 0x14283a, skyMid: 0x3a4a66, skyBottom: 0x9a7060, fog: 0x455060, fogDensity: 0.0042, sunDir: [0.3, 0.3, 0.2], sunColor: 0xc8a8a0, sunIntensity: 0.6, hemiSky: 0x4a7a80, hemiGround: 0x6a5634, hemiIntensity: 1.15, stars: 0.55, moon: 0.45, exposure: 1.0, bloom: 0.55, saturation: 1.25, tint: TINT, sunGlow: 0.1, sunSize: 0.02, horizonHeight: 0.1 },
    { u: 0.5, skyTop: 0x0b1f22, skyMid: 0x1e3b3a, skyBottom: 0x2e4c44, fog: 0x203a36, fogDensity: 0.0046, sunDir: [-0.4, 0.55, -0.6], sunColor: 0x8fb0c0, sunIntensity: 0.4, hemiSky: 0x3d7a74, hemiGround: 0x6a5634, hemiIntensity: 1.2, stars: 0.9, moon: 0.6, exposure: 1.06, bloom: 0.55, saturation: 1.25, tint: TINT, sunGlow: 0.0, sunSize: 0.0, horizonHeight: 0.1 },
    { u: 1.0, skyTop: 0x0b1f22, skyMid: 0x1e3b3a, skyBottom: 0x2e4c44, fog: 0x203a36, fogDensity: 0.0046, sunDir: [-0.4, 0.55, -0.6], sunColor: 0x8fb0c0, sunIntensity: 0.4, hemiSky: 0x3d7a74, hemiGround: 0x6a5634, hemiIntensity: 1.2, stars: 0.9, moon: 0.6, exposure: 1.06, bloom: 0.55, saturation: 1.25, tint: TINT, sunGlow: 0.0, sunSize: 0.0, horizonHeight: 0.1 },
  ]);

  const uCanalIn = uAt(-1110), uCanalOut = uAt(-1650);
  const world: BuiltWorld = {
    scene, curve, speed: 9.5, vehicle, cameraAnchor, subjects, sky, sun, hemi, lighting,
    occluders: [terrain, rowsLepic, rowsCanal, rowsGare, montmartre, cafe.group, sacre, gare, dufHouse.group, catHouse],
    waterLevel: WATER,
    groundHeight: heightAt,
    makeProjectile: () => {
      const g = new THREE.Group();
      const s = sphere(0.15, toon(0x8a8c86), 0, 0, 0, 10, 7);
      s.scale.set(1, 0.42, 0.85);
      g.add(s);
      return g;
    },
    ambience: {
      root: 57, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], padWave: 'sawtooth', padLevel: 0.05,
      melody: 'piano', melodyInterval: 0.45, melodyDensity: 0.85, melodyLevel: 0.13, chordSeconds: 5, vehicle: 'moped',
    },
    env(u) {
      const night = smoothstep(0.32, 0.5, u);
      const canalW = smoothstep(uCanalIn - 0.02, uCanalIn + 0.02, u) * (1 - smoothstep(uCanalOut - 0.02, uCanalOut + 0.02, u));
      return { wind: 0.15, sea: 0.2 * canalW, rain: 0, birds: 0.3 * (1 - smoothstep(0.12, 0.24, u)), crickets: 0.25 * night };
    },
    captions: [
      [0.005, 'Rue Lepic at blue hour'],
      [uAt(-70), 'The Café des 2 Moulins'],
      [uAt(-470), 'Up the Butte Montmartre'],
      [uAt(-690), 'Sacré-Cœur, at the top of the steps'],
      [uAt(-1110), 'Down to the Canal Saint-Martin'],
      [uAt(-1665), "Gare de l'Est"],
      [0.93, 'Under the last street lamp'],
    ],
    update(dt, ride) {
      const t = ride.time;
      ridePos.copy(ride.position);
      for (const up of updaters) up(dt, t, ride);
      // the moped: handlebar wobble, wheels rolling, headlamp brightening as night falls
      moped.bars.rotation.y = Math.sin(t * 1.7) * 0.035 + Math.sin(t * 5.3) * 0.012;
      moped.bars.rotation.z = Math.sin(t * 2.3) * 0.01;
      const spin = (9.5 * ride.speedMult) / 0.32 * dt;
      moped.frontWheel.rotation.x += spin; moped.rearWheel.rotation.x += spin;
      moped.group.position.y = Math.sin(t * 38) * 0.004 * ride.speedMult;
      const night = smoothstep(0.2, 0.45, ride.u);
      if (moped.light) moped.light.intensity = 1.5 + 7 * night;
      moped.lampMat.color.setHex(0xfff0c0).multiplyScalar(1.1 + night * 0.8);
      // materials that need per-frame uniforms
      water.uniforms.time.value = t;
      const fog = scene.fog as THREE.FogExp2;
      water.uniforms.fogColor.value.copy(fog.color); water.uniforms.fogDensity.value = fog.density;
      // the canal reflects lamp-lit sky, a touch lighter than the real sky so the water reads as water at night
      water.uniforms.skyColor.value.copy(sky.uniforms.midColor.value).lerp(new THREE.Color(0x4a8a7a), 0.6);
      water.uniforms.sunDir.value.copy(sky.uniforms.sunDir.value);
      water.uniforms.sunColor.value.copy(sky.uniforms.sunColor.value).multiplyScalar(2.2);
      // skipping-stone rings
      for (const r of rings) {
        if (r.t < -1) continue;
        r.t += dt;
        if (r.t < 0) { r.m.visible = false; continue; }
        const k = r.t / r.life;
        if (k >= 1) { r.t = -2; r.m.visible = false; continue; }
        r.m.visible = true;
        const s = 0.4 + k * 4.5; r.m.scale.set(s, s, 1);
        (r.m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k) * (1 - k);
      }
      // lamps flicker a little; the tower twinkles; dust thickens with the dark
      const flick = 1.3 + Math.sin(t * 9.3) * 0.05 + Math.sin(t * 17.1) * 0.03;
      lamps.lanternMat.color.setHex(0xffd28a).multiplyScalar(flick);
      skyline.lightMat.color.setHex(0xfff0c0).multiplyScalar(0.7 + Math.max(0, Math.sin(t * 9)) * 1.2 * (Math.sin(t * 0.37) > 0 ? 1 : 0.25));
      const cam = ctx.camera.position;
      dust.intensity = lerp(0.3, 1, night);
      dust.update(dt, t, new THREE.Vector3(cam.x, cam.y + 3, cam.z - 14));
    },
    onItemLand(pos) {
      if (heightAt(pos.x, pos.z) < WATER - 0.5) {
        const dir = new THREE.Vector3(pos.x - ridePos.x, 0, pos.z - ridePos.z);
        if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0); else dir.normalize();
        spawnSkip(pos, dir);
        // a stone in the water wakes Blubber even while he is under the surface, so the game's item check can reach him
        const bc = blubberSubject.center();
        if (bc.distanceTo(pos) < blubberSubject.reactRange && ridePos.distanceTo(bc) < 90) blubberSubject.active = true;
      }
    },
    onCall() { /* subjects handle their own reactions */ },
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

export const AmelieWorld: WorldDef = {
  id: 'amelie',
  title: 'Montmartre by Moped',
  subtitle: 'Amélie',
  blurb: 'Ride Nino\'s red moped from the Café des 2 Moulins up the lamp-lit lanes of Montmartre, down to the green water of the canal, and on to the last street lamp before the Gare de l\'Est.',
  vehicleName: 'The red moped',
  itemName: 'skipping stone',
  callName: 'accordion',
  callKind: 'accordion',
  accent: '#e0563c',
  accent2: '#2f5d3f',
  fov: 64,
  build,
};
