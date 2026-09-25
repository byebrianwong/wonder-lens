import * as THREE from 'three';
import type { BuiltWorld, WorldContext, WorldDef, RideState } from '../../game/types';
import { Subject } from '../../game/Subject';
import { makeLighting } from '../../game/lighting';
import { Sky } from '../../engine/Sky';
import { Drift, Puffs } from '../../engine/Particles';
import { Rng, clamp, damp, fbm, lerp, smoothstep, TAU } from '../../engine/math';
import { PathField, buildTerrain, buildTrack, waterMaterial, cloudField, cyl, toon, type Placement } from '../../engine/Builders';
import { SPOTS, buildAlpine, buildForest, buildDesert, buildSea, buildTrees, buildZubrowkaExpress } from './environment';
import { makeGustaveZero, makeAgatha, makeMrFox, makeSamSuzy, makeScouts, makeAlien, makeUfo, makeBelafonte, makeTeamZissou, makeJaguarShark, makeDeepSearch, makeFunicular, makeMendlsVan, makeGulls, makeBirdFlock, makeMendlsBox } from './characters';

// A dead-straight line: every subject can be framed head-on from the track.
const TRACK_PTS: [number, number, number][] = [
  [0, 8, 60], [0, 8, 0], [0, 7.6, -200], [0, 6.6, -400], [0, 5.6, -600], [0, 4.6, -800], [0, 4.0, -1000], [0, 3.5, -1150],
  [0, 3.0, -1400], [0, 2.4, -1650], [0, 1.6, -1720], [0, 1.4, -1900], [0, 1.4, -2100], [0, 1.6, -2200], [0, 1.6, -2262],
];
const Z0 = 60, LEN = 2322;
/** Ride progress for a z position (the track is monotonic in z). */
const uAt = (z: number) => clamp((Z0 - z) / LEN, 0, 1);

function build(ctx: WorldContext): BuiltWorld {
  const rng = new Rng(19320214);
  const dens = ctx.lowDetail ? 0.55 : 1;
  const scene = new THREE.Scene();
  const curve = new THREE.CatmullRomCurve3(TRACK_PTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal', 0.5);
  curve.arcLengthDivisions = 4000;
  const field = new PathField(curve, 2);
  const near = { dist: 0, y: 0, u: 0, x: 0, z: 0 };
  const trackDist = (x: number, z: number) => field.nearest(x, z, near).dist;
  const trackPoint = (z: number) => {
    const u = uAt(z);
    let best = curve.getPointAt(u), bestD = Math.abs(best.z - z);
    for (const du of [-0.01, -0.005, 0.005, 0.01]) { const p = curve.getPointAt(clamp(u + du, 0, 1)); const d = Math.abs(p.z - z); if (d < bestD) { best = p; bestD = d; } }
    return { x: best.x, y: best.y };
  };

  // ---------- terrain ----------
  const WATER = 0;
  // region blends along z (z decreases along the ride, so smoothstep(a, b, z) with a > b rises as we travel)
  const toForest = (z: number) => smoothstep(-560, -640, z);
  const toDesert = (z: number) => smoothstep(-1110, -1190, z);
  const toSea = (z: number) => smoothstep(-1660, -1720, z);
  const rawHeight = (x: number, z: number) => {
    const f = toForest(z), d = toDesert(z), s = toSea(z);
    const wA = 1 - f, wF = f * (1 - d), wD = d * (1 - s), wS = s;
    const ax = Math.abs(x);
    let h = 0;
    if (wA > 0) {
      // symmetrical mountains on both sides, with a flat shelf carved for the hotel on the left
      let ha = 7.5 + smoothstep(20, 64, ax) * 22 + Math.max(0, ax - 64) * 0.45 + (fbm(x * 0.02, z * 0.02, 3) - 0.45) * 7 * smoothstep(14, 40, ax);
      const shelf = (1 - smoothstep(21, 26, Math.abs(x - SPOTS.hotel.x))) * (1 - smoothstep(26, 34, Math.abs(z - SPOTS.hotel.z)));
      ha = lerp(ha, SPOTS.hotel.y, shelf);
      h += wA * ha;
    }
    if (wF > 0) {
      let hf = 4.6 + (fbm(x * 0.012, z * 0.012, 3) - 0.45) * 9 + Math.max(0, ax - 140) * 0.22;
      const dl = Math.hypot(x - SPOTS.lake.x, z - SPOTS.lake.z);
      hf = lerp(SPOTS.lake.bottom, hf, smoothstep(14, 30, dl));
      h += wF * hf;
    }
    if (wD > 0) {
      let hd = 2.8 + (fbm(x * 0.01, z * 0.01, 2) - 0.5) * 2.4;
      for (const [mx, mz, r, mh] of SPOTS.mesas) { const dm = Math.hypot(x - mx, z - mz); hd += mh * (1 - smoothstep(r * 0.55, r, dm)); }
      const dc = Math.hypot(x - SPOTS.crater.x, z - SPOTS.crater.z);
      hd += -3.2 * (1 - smoothstep(4, SPOTS.crater.r, dc)) + 1.3 * Math.exp(-Math.pow((dc - SPOTS.crater.r) / 3.5, 2));
      hd += 4 * (1 - smoothstep(10, 24, Math.hypot(x - SPOTS.observatory.x, z - SPOTS.observatory.z)));
      hd += Math.max(0, ax - 240) * 0.12;
      h += wD * hd;
    }
    if (wS > 0) {
      let hs = -6 + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 1.5;
      const di = Math.hypot(x - SPOTS.island.x, z - SPOTS.island.z);
      hs += 9 * (1 - smoothstep(SPOTS.island.r * 0.5, SPOTS.island.r, di));
      hs += 8.5 * smoothstep(-2150, -2195, z);
      hs += Math.max(0, ax - 260) * 0.2;
      h += wS * hs;
    }
    return h;
  };
  const heightAt = (x: number, z: number) => {
    const n = field.nearest(x, z, near);
    const raw = rawHeight(x, z);
    const s = toSea(z);
    // flatten a corridor under the track; in the sea it is narrower and becomes the causeway
    const corridor = 1 - smoothstep(lerp(5, 4.5, s), lerp(18, 9, s), n.dist);
    return lerp(raw, n.y - 0.45, corridor);
  };

  const snow = new THREE.Color(0xf8f3f6), snowShade = new THREE.Color(0xe8dfe8), rockA = new THREE.Color(0xb7a6b3);
  const ochre = new THREE.Color(0xc9a860), ochre2 = new THREE.Color(0xa8823f), leaf = new THREE.Color(0xd08a3a), rockF = new THREE.Color(0x8f7f6a), lakebed = new THREE.Color(0x6f7a58);
  const sand = new THREE.Color(0xe6c8a2), sand2 = new THREE.Color(0xf0d8c0), mesaRock = new THREE.Color(0xd08a6a), mesaTop = new THREE.Color(0xe0a888);
  const seabed = new THREE.Color(0x4f93b0), shoal = new THREE.Color(0xe8dcc0), stone = new THREE.Color(0xd9d0c2), harbourLand = new THREE.Color(0xe3d6bd), harbourGrass = new THREE.Color(0xb9c98a);
  const cA = new THREE.Color(), cF = new THREE.Color(), cD = new THREE.Color(), cS = new THREE.Color();
  const terrain = buildTerrain({
    xMin: -420, xMax: 420, zMin: -2420, zMax: 140, res: 4, chunk: 280,
    height: heightAt,
    color: (x, z, y, slope, out) => {
      const n = fbm(x * 0.05, z * 0.05, 3);
      const f = toForest(z), d = toDesert(z), s = toSea(z);
      cA.copy(snow).lerp(snowShade, n * 0.6).lerp(rockA, smoothstep(0.42, 0.72, slope));
      if (f > 0) {
        cF.copy(ochre).lerp(ochre2, n).lerp(leaf, smoothstep(0.5, 0.8, fbm(x * 0.02, z * 0.02, 2)) * 0.5).lerp(rockF, smoothstep(0.5, 0.8, slope));
        if (y < SPOTS.lake.level + 0.3 && Math.hypot(x - SPOTS.lake.x, z - SPOTS.lake.z) < 32) cF.copy(lakebed);
      }
      if (d > 0) cD.copy(sand).lerp(sand2, n).lerp(mesaRock, smoothstep(0.3, 0.6, slope)).lerp(mesaTop, smoothstep(14, 20, y) * (1 - smoothstep(0.2, 0.4, slope)));
      if (s > 0) {
        if (y < WATER + 0.4) cS.copy(seabed).lerp(shoal, smoothstep(-5, 0.4, y));
        else cS.copy(harbourLand).lerp(harbourGrass, smoothstep(0.5, 0.8, n) * smoothstep(1.4, 2.4, y)).lerp(stone, 1 - smoothstep(4.5, 7, trackDist(x, z)));
      }
      out.copy(cA);
      if (f > 0) out.lerp(cF, f);
      if (d > 0) out.lerp(cD, d);
      if (s > 0) out.lerp(cS, s);
    },
  });
  scene.add(terrain);

  // water: the sea at the end, and the small lake in the forest (same shader, different colours)
  const sea = waterMaterial({ shallow: 0x7fc4d8, deep: 0x3a8ab0, sky: 0xdcecf6, opacity: 0.92 });
  const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1000, 50, 40), sea.material);
  seaMesh.rotation.x = -Math.PI / 2; seaMesh.position.set(0, WATER, -2100); seaMesh.renderOrder = 1;
  scene.add(seaMesh);
  const lake = waterMaterial({ shallow: 0x8fc4b8, deep: 0x3f7f86, sky: 0xf2e6ee, opacity: 0.9, waveScale: 1.6 });
  const lakeMesh = new THREE.Mesh(new THREE.CircleGeometry(30, 36), lake.material);
  lakeMesh.rotation.x = -Math.PI / 2; lakeMesh.position.set(SPOTS.lake.x, SPOTS.lake.level, SPOTS.lake.z); lakeMesh.renderOrder = 1;
  scene.add(lakeMesh);

  // track
  scene.add(buildTrack(curve, { gauge: 1.5, ballast: true, railColor: 0x8a8378, sleeperColor: 0x8a6a52 }));

  // ---------- sky, lights, fog ----------
  const sky = new Sky(1400);
  scene.add(sky.mesh);
  scene.fog = new THREE.FogExp2(0xf1e3ea, 0.0026);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xd8e8f8, 0xe8d8dc, 1.0);
  scene.add(hemi);
  // tidy, evenly spaced clouds
  const cloudPl: Placement[] = [];
  for (let i = 0; i < 40; i++) cloudPl.push({ x: rng.range(-500, 500), y: rng.range(80, 150), z: rng.range(-2500, 200), scale: rng.range(1.2, 2.4), rot: rng.range(0, TAU) });
  const clouds = cloudField(rng, cloudPl, 0xfff8fa);
  scene.add(clouds);

  // ---------- places ----------
  const alps = buildAlpine(rng, heightAt, trackPoint);
  scene.add(alps.group);
  const forest = buildForest(rng, heightAt);
  scene.add(forest.group);
  const desert = buildDesert(rng, heightAt);
  scene.add(desert.group);
  const shore = buildSea(rng, heightAt, trackPoint);
  scene.add(shore.group);
  scene.add(buildTrees(rng, heightAt, trackDist, dens));
  // warm light spilling from the hotel lobby
  {
    const pl = new THREE.PointLight(0xffe0b0, 30, 50, 1.5);
    pl.position.set(SPOTS.hotel.x + 11, SPOTS.hotel.y + 4, SPOTS.hotel.z);
    scene.add(pl);
  }

  // ---------- vehicle ----------
  const train = buildZubrowkaExpress();
  const vehicle = train.group;
  scene.add(vehicle);
  const cameraAnchor = new THREE.Object3D();
  cameraAnchor.position.set(0, 2.35, 1.9);
  cameraAnchor.rotation.y = Math.PI; // camera looks down its -z; the vehicle's front is +z
  vehicle.add(cameraAnchor);

  // ---------- characters & subjects ----------
  const subjects: Subject[] = [];
  const updaters: Array<(dt: number, t: number, ride: RideState) => void> = [];
  const fwd = (g: THREE.Object3D) => () => new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));
  const anchor = (x: number, y: number, z: number) => { const o = new THREE.Object3D(); o.position.set(x, y, z); scene.add(o); return o; };
  const span = (subject: Subject, group: THREE.Object3D | null, z0: number, z1: number) => {
    const u0 = uAt(z0), u1 = uAt(z1);
    return (ride: RideState) => { const a = ride.u >= u0 && ride.u <= u1; subject.active = a; if (group) group.visible = a; return a; };
  };

  // --- alps ---
  subjects.push(new Subject({ id: 'hotel', name: 'The Grand Budapest Hotel', from: 'The Grand Budapest Hotel', group: anchor(SPOTS.hotel.x, SPOTS.hotel.y + 22, SPOTS.hotel.z), radius: 26, base: 900, hint: 'Pink, tiered and perfectly symmetrical, on the cliff to the left after Nebelsbad.', maxDistance: 520 }));

  const funicular = makeFunicular(alps.funicularBottom, alps.funicularTop);
  scene.add(funicular.group);
  {
    // trestle posts where the rail leaves the ground
    const postMat = toon(0x8a7a6a);
    const dir = alps.funicularTop.clone().sub(alps.funicularBottom);
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    for (let k = 1; k < 10; k++) {
      const p = alps.funicularBottom.clone().lerp(alps.funicularTop, k / 10);
      for (const s of [-1.4, 1.4]) {
        const x = p.x + side.x * s, z = p.z + side.z * s;
        const gy = heightAt(x, z), h = p.y - 0.3 - gy;
        if (h < 0.6) continue;
        scene.add(cyl(0.12, 0.16, h, postMat, x, gy + h / 2, z, 6));
      }
    }
  }
  const funicularSubject = new Subject({
    id: 'funicular', name: 'The funicular', from: 'The Grand Budapest Hotel', group: funicular.carA, radius: 1.8, base: 500,
    hint: 'Two little cars counterbalanced on a slanted rail up to the hotel. Whistle and the bell rings.',
    poses: { ring: { label: 'Bell rung', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), maxDistance: 160,
    onCall: () => { funicular.ring(); funicularSubject.setPose('ring', 2.5); return true; },
  });
  subjects.push(funicularSubject);
  const funWin = span(funicularSubject, null, 60, -520);
  updaters.push((dt, t, ride) => { if (funWin(ride)) funicular.update(dt, t); });

  const gustave = makeGustaveZero();
  gustave.group.position.copy(alps.gustaveSpot);
  gustave.group.rotation.y = Math.PI / 2;
  scene.add(gustave.group);
  const gustaveSubject = new Subject({
    id: 'gustave', name: 'M. Gustave & Zero', from: 'The Grand Budapest Hotel', group: gustave.group, radius: 1.6, base: 1400, rarity: 'legendary',
    hint: 'Concierge and lobby boy on the red steps of the funicular pavilion, left of the track. Whistle for a bow; throw a box and he will take it.',
    poses: { bow: { label: 'A perfect bow', mult: 1.9 }, finger: { label: 'Take the box', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 1.1, 0), facing: fwd(gustave.group),
    onCall: () => { gustave.bow(); gustaveSubject.setPose('bow', 2.6); return true; },
    onItem: () => { gustave.finger(); gustaveSubject.setPose('finger', 2.8); return true; }, reactRange: 16, maxDistance: 120,
  });
  subjects.push(gustaveSubject);
  const gusWin = span(gustaveSubject, gustave.group, 60, -560);
  updaters.push((dt, t, ride) => { if (!gusWin(ride)) return; gustave.setLook(Math.abs(ride.position.z - SPOTS.pavilion.z) < 60 ? ride.position : null); gustave.update(dt, t); });

  const agatha = makeAgatha();
  agatha.group.position.copy(alps.agathaSpot);
  agatha.group.rotation.y = -Math.PI / 2;
  scene.add(agatha.group);
  const agathaSubject = new Subject({
    id: 'agatha', name: 'Agatha', from: 'The Grand Budapest Hotel', group: agatha.group, radius: 1.2, base: 800, rarity: 'rare',
    hint: "On the right platform at Nebelsbad with a Mendl's box. Throw her one and she catches it.",
    poses: { catch: { label: 'Courtesan au chocolat', mult: 1.8 }, present: { label: "Mendl's, of course", mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 1.0, 0), facing: fwd(agatha.group),
    onItem: () => { agatha.catchBox(); agathaSubject.setPose('catch', 2.4); return true; },
    onCall: () => { agatha.lift(); agathaSubject.setPose('present', 2.2); return true; }, reactRange: 14, maxDistance: 110,
  });
  subjects.push(agathaSubject);
  const agWin = span(agathaSubject, agatha.group, 60, -260);
  updaters.push((dt, t, ride) => { if (agWin(ride)) agatha.update(dt, t); });

  const vans = alps.vanSpots.map((s) => { const v = makeMendlsVan(); v.group.position.set(s.x, heightAt(s.x, s.z), s.z); v.group.rotation.y = s.rot; scene.add(v.group); return v; });
  const vanSubject = new Subject({
    id: 'van', name: "Mendl's delivery van", from: 'The Grand Budapest Hotel', group: vans[0].group, radius: 2.6, base: 350,
    hint: 'A pink van, one parked on each side of the station forecourt. Whistle and the lights flash.',
    poses: { flash: { label: 'Headlights', mult: 1.3 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), maxDistance: 100,
    onCall: () => { for (const v of vans) v.flash(); vanSubject.setPose('flash', 1.6); return true; },
  });
  subjects.push(vanSubject);
  const vanWin = span(vanSubject, null, 60, -300);
  updaters.push((dt, t, ride) => { if (vanWin(ride)) for (const v of vans) v.update(dt, t); });

  // --- forest ---
  subjects.push(new Subject({ id: 'foxtree', name: 'The tree with a door', from: 'Fantastic Mr. Fox', group: anchor(SPOTS.foxTree.x, heightAt(SPOTS.foxTree.x, SPOTS.foxTree.z) + 9, SPOTS.foxTree.z), radius: 10, base: 450, hint: 'A big autumn tree on the right with a little red door and a mailbox at its foot.', maxDistance: 260 }));
  const fox = makeMrFox();
  fox.group.position.copy(forest.foxSpot);
  fox.group.rotation.y = -Math.PI / 2;
  scene.add(fox.group);
  const foxSubject = new Subject({
    id: 'fox', name: 'Mr. Fox', from: 'Fantastic Mr. Fox', group: fox.group, radius: 1.4, base: 1000, rarity: 'rare',
    hint: 'In his corduroy suit on the road with his bicycle, right of the track. Whistle for his trademark whistle-and-click.',
    poses: { whistle: { label: 'Whistle and click', mult: 1.9 }, catch: { label: 'Caught it', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.1, 0), facing: fwd(fox.group),
    onCall: () => { fox.whistleClick(); foxSubject.setPose('whistle', 3.2); return true; },
    onItem: () => { fox.catchBox(); foxSubject.setPose('catch', 2.0); return true; }, reactRange: 16, maxDistance: 120,
  });
  subjects.push(foxSubject);
  const foxWin = span(foxSubject, fox.group, -600, -930);
  updaters.push((dt, t, ride) => { if (foxWin(ride)) fox.update(dt, t); });

  const samSuzy = makeSamSuzy();
  const samRoot = new THREE.Group();
  samRoot.position.copy(forest.samSuzySpot);
  samRoot.rotation.y = Math.PI / 2; // facing the track from the left; their idle yaw of PI looks out over the lake
  samRoot.add(samSuzy.group);
  scene.add(samRoot);
  const samSubject = new Subject({
    id: 'samsuzy', name: 'Sam & Suzy', from: 'Moonrise Kingdom', group: samSuzy.group, radius: 1.3, base: 950, rarity: 'rare',
    hint: 'Camped by the lake on the left, looking out over the water. Whistle and they turn to face you, holding hands.',
    poses: { moonrise: { label: 'Moonrise', mult: 1.8 }, binoc: { label: 'Through the binoculars', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 0.9, 0), facing: fwd(samSuzy.group),
    onCall: () => { samSuzy.moonrise(); samSubject.setPose('moonrise', 4.5); return true; },
    onItem: () => { samSuzy.binoculars(); samSubject.setPose('binoc', 2.8); return true; }, reactRange: 18, maxDistance: 120,
  });
  subjects.push(samSubject);
  const samWin = span(samSubject, samRoot, -700, -1060);
  updaters.push((dt, t, ride) => { if (samWin(ride)) samSuzy.update(dt, t); });

  const scouts = makeScouts(7, rng);
  scene.add(scouts.group);
  const trail = forest.scoutsPath;
  const scoutState = { z: trail.z0 - 10, dir: -1 };
  const scoutsSubject = new Subject({
    id: 'scouts', name: 'The Khaki Scouts', from: 'Moonrise Kingdom', group: scouts.group, radius: 3.5, base: 600,
    hint: 'Troop 55 marching in perfect file along the trail on the left. Whistle and they salute as one.',
    poses: { salute: { label: 'Salute in unison', mult: 1.7 }, halt: { label: 'Halt!', mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 0.8, -3.5),
    onCall: () => { scouts.salute(); scoutsSubject.setPose('salute', 2.8); return true; },
    onItem: () => { scouts.halt(); scoutsSubject.setPose('halt', 2.4); return true; }, reactRange: 18, maxDistance: 130,
  });
  subjects.push(scoutsSubject);
  const scoutWin = span(scoutsSubject, scouts.group, -780, -1170);
  updaters.push((dt, t, ride) => {
    if (!scoutWin(ride)) return;
    if (scouts.marching) scoutState.z += scoutState.dir * dt * 1.35;
    if (scoutState.z < trail.z1) scoutState.dir = 1;
    if (scoutState.z > trail.z0 - 10) scoutState.dir = -1;
    scouts.group.position.set(trail.x, heightAt(trail.x, scoutState.z) + 0.05, scoutState.z);
    const target = scoutState.dir < 0 ? Math.PI : 0;
    let r = scouts.group.rotation.y;
    r = damp(r, target, 2.5, dt);
    scouts.group.rotation.y = r;
    scouts.update(dt, t);
  });
  subjects.push(new Subject({ id: 'lookout', name: 'The lookout tower', from: 'Moonrise Kingdom', group: anchor(SPOTS.tower.x, heightAt(SPOTS.tower.x, SPOTS.tower.z) + 11, SPOTS.tower.z), radius: 5, base: 400, hint: 'A wooden fire tower with a red roof, right of the track near the end of the wood.', maxDistance: 220 }));

  const flock = makeBirdFlock(9);
  flock.group.position.set(-40, 34, -1150);
  scene.add(flock.group);
  const flockSubject = new Subject({ id: 'flock', name: 'A skein of geese', from: 'Moonrise Kingdom', group: flock.group, radius: 6, base: 250, hint: 'Look up over the autumn wood.', maxDistance: 240 });
  subjects.push(flockSubject);
  updaters.push((dt, t, ride) => {
    const a = ride.u > uAt(-560) && ride.u < uAt(-1200);
    flock.group.visible = a; flockSubject.active = a;
    if (!a) return;
    flock.update(dt, t);
    if (flock.group.position.z > -600) { flock.group.position.set(rng.range(-60, 60), rng.range(28, 40), -1170); }
  });

  // --- desert ---
  subjects.push(new Subject({ id: 'citysign', name: 'Asteroid City, pop. 87', from: 'Asteroid City', group: anchor(SPOTS.citySign.x, heightAt(SPOTS.citySign.x, SPOTS.citySign.z) + 6, SPOTS.citySign.z), radius: 5.5, base: 350, hint: 'The town sign, right of the track as the desert begins.', maxDistance: 200 }));
  subjects.push(new Subject({ id: 'diner', name: 'The diner', from: 'Asteroid City', group: anchor(SPOTS.diner.x, heightAt(SPOTS.diner.x, SPOTS.diner.z) + 3, SPOTS.diner.z), radius: 8, base: 400, hint: 'Cream and turquoise, with a red sign and a station wagon out front.', maxDistance: 200 }));
  subjects.push(new Subject({ id: 'observatory', name: 'The observatory', from: 'Asteroid City', group: anchor(SPOTS.observatory.x, heightAt(SPOTS.observatory.x, SPOTS.observatory.z) + 6, SPOTS.observatory.z), radius: 7, base: 450, hint: 'A white dome on a rise to the left, past the motel.', maxDistance: 260 }));

  const ufo = makeUfo();
  ufo.group.position.set(SPOTS.crater.x, 0, SPOTS.crater.z);
  ufo.hover = desert.craterY + 24;
  scene.add(ufo.group);
  const alien = makeAlien();
  const alienRoot = new THREE.Group();
  alienRoot.position.set(SPOTS.crater.x, 0, SPOTS.crater.z);
  alienRoot.rotation.y = -Math.PI / 2; // faces the track once it stops turning
  alienRoot.add(alien.group);
  scene.add(alienRoot);
  const beamLen = ufo.hover - desert.craterY + 0.6;
  let alienCooldown = 0;
  const startAlien = () => {
    if (alien.state.phase !== 0 || alienCooldown > 0) return false;
    alien.start(ufo.hover - 2.0, desert.craterY + 0.15);
    ufo.setBeam(true, beamLen);
    ufoSubject.setPose('beam', 5);
    alienCooldown = 30;
    return true;
  };
  const ufoSubject = new Subject({
    id: 'ufo', name: 'The flying saucer', from: 'Asteroid City', group: ufo.group, radius: 5, base: 700, rarity: 'rare',
    hint: 'Hovers over the meteorite crater, right of the track. Whistle within range and something comes down on a beam of light.',
    poses: { beam: { label: 'Beam of light', mult: 1.6 } }, maxDistance: 220,
    onCall: () => startAlien(),
  });
  subjects.push(ufoSubject);
  const alienSubject = new Subject({
    id: 'alien', name: 'The alien', from: 'Asteroid City', group: alien.group, radius: 2.4, base: 1500, rarity: 'legendary',
    hint: 'Invisible until you whistle near the crater. It descends, freezes in an awkward pose with the meteorite, and leaves after a few seconds.',
    poses: { descend: { label: 'Descending', mult: 1.5 }, pose: { label: 'The alien', mult: 2.0 }, leave: { label: 'Leaving with the meteorite', mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 1.9, 0), facing: fwd(alien.group), maxDistance: 160,
  });
  subjects.push(alienSubject);
  let alienPhase = 0;
  const ufoWin = span(ufoSubject, ufo.group, -1200, -1690);
  updaters.push((dt, t, ride) => {
    alienCooldown = Math.max(0, alienCooldown - dt);
    if (!ufoWin(ride)) { alienSubject.active = false; return; }
    ufo.update(dt, t);
    alien.update(dt, t);
    alienSubject.active = alien.visible;
    if (alien.state.phase !== alienPhase) {
      alienPhase = alien.state.phase;
      if (alienPhase === 1) alienSubject.setPose('descend', 4.6);
      else if (alienPhase === 2) alienSubject.setPose('pose', 8.2);
      else if (alienPhase === 3) { alienSubject.setPose('leave', 3.3); ufo.setBeam(false, beamLen); }
    }
  });

  // --- sea ---
  const belafonte = makeBelafonte();
  belafonte.group.position.set(SPOTS.belafonte.x, 0, SPOTS.belafonte.z);
  scene.add(belafonte.group);
  const belafonteSubject = new Subject({
    id: 'belafonte', name: 'The Belafonte', from: 'The Life Aquatic', group: belafonte.group, radius: 22, base: 900,
    hint: "Steve Zissou's research vessel moored beside the causeway on the right, helicopter on the aft deck. Whistle and the rotor starts.",
    poses: { horn: { label: 'Helicopter warming up', mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 5, 0), maxDistance: 320,
    onCall: () => { belafonte.horn(); belafonteSubject.setPose('horn', 4); return true; },
  });
  subjects.push(belafonteSubject);
  const crew = makeTeamZissou(5, rng);
  crew.group.position.set(-2.6, belafonte.deckY, -1);
  crew.group.rotation.y = -Math.PI / 2; // the row faces the track side of the ship
  belafonte.group.add(crew.group);
  const crewSubject = new Subject({
    id: 'zissou', name: 'Team Zissou', from: 'The Life Aquatic', group: crew.group, radius: 3.6, base: 1000, rarity: 'rare',
    hint: 'Five in light blue with red beanies, in a row on the deck. Whistle and they all point at the sea together.',
    poses: { point: { label: 'Team Zissou', mult: 1.8 }, salute: { label: 'Salute', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), facing: fwd(crew.group),
    onCall: () => { crew.point(); crewSubject.setPose('point', 3.6); return true; },
    onItem: () => { crew.salute(); crewSubject.setPose('salute', 2.4); return true; }, reactRange: 26, maxDistance: 150,
  });
  subjects.push(crewSubject);
  const belWin = span(belafonteSubject, null, -1650, -2262);
  const crewWin = span(crewSubject, null, -1700, -2000);
  updaters.push((dt, t, ride) => { crewWin(ride); if (belWin(ride)) { belafonte.update(dt, t); crew.update(dt, t); } });

  const shark = makeJaguarShark(rng);
  shark.group.position.set(-16, -10, -1960);
  scene.add(shark.group);
  const sharkSubject = new Subject({
    id: 'shark', name: 'The jaguar shark', from: 'The Life Aquatic', group: shark.group, radius: 7, base: 1400, rarity: 'legendary',
    hint: 'Somewhere under the causeway. Whistle out on the sea and it surfaces slowly on the left, spots glowing, then goes down again.',
    poses: { rising: { label: 'Surfacing', mult: 1.6 }, cruise: { label: 'The jaguar shark', mult: 2.0 } }, centerOffset: new THREE.Vector3(0, 0.6, 0), maxDistance: 170,
  });
  subjects.push(sharkSubject);
  let sharkPhase = 0, sharkCooldown = 0;
  const startShark = (ride: RideState) => {
    if (shark.state.phase !== 0 || sharkCooldown > 0) return;
    shark.group.position.set(ride.position.x - 15, shark.state.hidden, ride.position.z - 58);
    shark.group.rotation.y = Math.PI; // nose pointing down the line
    shark.surface();
    sharkCooldown = 40;
  };
  updaters.push((dt, t) => {
    sharkCooldown = Math.max(0, sharkCooldown - dt);
    shark.update(dt, t);
    sharkSubject.active = shark.visible;
    if (shark.state.phase === 2) shark.group.position.z -= dt * 4.5;
    if (shark.state.phase !== sharkPhase) {
      sharkPhase = shark.state.phase;
      if (sharkPhase === 1) sharkSubject.setPose('rising', 5);
      else if (sharkPhase === 2) sharkSubject.setPose('cruise', 7);
    }
  });

  const sub = makeDeepSearch();
  sub.group.position.set(SPOTS.sub.x, 0, SPOTS.sub.z);
  scene.add(sub.group);
  const subSubject = new Subject({
    id: 'deepsearch', name: 'Deep Search', from: 'The Life Aquatic', group: sub.group, radius: 3, base: 600,
    hint: 'The yellow submarine, half under at the little jetty on the left. Whistle and it surfaces properly.',
    poses: { surface: { label: 'Surfacing', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 0.8, 0), maxDistance: 120,
    onCall: () => { sub.surface(); subSubject.setPose('surface', 5); return true; },
  });
  subjects.push(subSubject);
  const subWin = span(subSubject, sub.group, -1650, -1960);
  updaters.push((dt, t, ride) => { if (subWin(ride)) sub.update(dt, t); });

  subjects.push(new Subject({ id: 'lighthouse', name: 'The striped lighthouse', from: 'The Life Aquatic', group: anchor(SPOTS.island.x, shore.islandY + 9, SPOTS.island.z), radius: 8, base: 400, hint: 'Red and white, on a little island right of the harbour.', maxDistance: 420 }));
  const gulls = makeGulls(8, rng);
  gulls.group.position.set(SPOTS.island.x, shore.islandY + 12, SPOTS.island.z);
  scene.add(gulls.group);
  const gullSubject = new Subject({
    id: 'gulls', name: 'Harbour gulls', from: 'The Life Aquatic', group: gulls.group, radius: 12, base: 300,
    hint: 'Circling the lighthouse. Whistle and they scatter.',
    poses: { scatter: { label: 'Scattering', mult: 1.3 } }, maxDistance: 170,
    onCall: () => { gulls.scatter(); gullSubject.setPose('scatter', 3); return true; },
  });
  subjects.push(gullSubject);
  const gullWin = span(gullSubject, gulls.group, -1800, -2262);
  updaters.push((dt, t, ride) => { if (gullWin(ride)) gulls.update(dt, t); });

  // ---------- particles ----------
  const snowfall = new Drift({ count: Math.round(520 * dens), color: 0xffffff, size: 0.3, box: new THREE.Vector3(90, 34, 90), speed: new THREE.Vector3(0.3, -1.6, 0), wobble: 0.8, opacity: 0.85 });
  scene.add(snowfall.points);
  const leaves = new Drift({ count: Math.round(200 * dens), color: 0xe8973a, size: 0.34, box: new THREE.Vector3(80, 26, 80), speed: new THREE.Vector3(1.2, -0.9, 0.3), wobble: 1.4, opacity: 0.85 });
  leaves.intensity = 0;
  scene.add(leaves.points);
  const dust = new Drift({ count: Math.round(120 * dens), color: 0xf2dcc0, size: 0.4, box: new THREE.Vector3(90, 14, 90), speed: new THREE.Vector3(2.2, 0.1, 0.4), wobble: 0.9, opacity: 0.35 });
  dust.intensity = 0;
  scene.add(dust.points);
  const puffs = new Puffs(0xf2b8c6, 32);
  scene.add(puffs.group);

  // ---------- lighting: one calm daylight mood, the palette shifting by region ----------
  const lighting = makeLighting([
    { u: 0.0, skyTop: 0x9ec5ee, skyMid: 0xf4dfe6, skyBottom: 0xfbeef1, fog: 0xf1e3ea, fogDensity: 0.0026, sunDir: [0.2, 0.9, -0.35], sunColor: 0xfff6ea, sunIntensity: 1.4, hemiSky: 0xd8e8f8, hemiGround: 0xe8d8dc, hemiIntensity: 1.0, exposure: 0.94, bloom: 0.22, saturation: 1.15, sunGlow: 0.25, sunSize: 0.02 },
    { u: 0.22, skyTop: 0x9ec5ee, skyMid: 0xf4dfe6, skyBottom: 0xfbeef1, fog: 0xf1e3ea, fogDensity: 0.0026, sunDir: [0.2, 0.9, -0.35], sunColor: 0xfff6ea, sunIntensity: 1.4, hemiSky: 0xd8e8f8, hemiGround: 0xe8d8dc, hemiIntensity: 1.0, exposure: 0.94, bloom: 0.22, saturation: 1.15, sunGlow: 0.25, sunSize: 0.02 },
    { u: 0.32, skyTop: 0xa8c8e8, skyMid: 0xf6e2c8, skyBottom: 0xfaeedc, fog: 0xf0e0c8, fogDensity: 0.0026, sunDir: [0.3, 0.85, -0.35], sunColor: 0xfff0d8, sunIntensity: 1.4, hemiSky: 0xd8e4f4, hemiGround: 0xd8b070, hemiIntensity: 1.0, exposure: 0.94, bloom: 0.22, saturation: 1.15, sunGlow: 0.25, sunSize: 0.02 },
    { u: 0.48, skyTop: 0xa8c8e8, skyMid: 0xf6e2c8, skyBottom: 0xfaeedc, fog: 0xf0e0c8, fogDensity: 0.0026, sunDir: [0.3, 0.85, -0.35], sunColor: 0xfff0d8, sunIntensity: 1.4, hemiSky: 0xd8e4f4, hemiGround: 0xd8b070, hemiIntensity: 1.0, exposure: 0.94, bloom: 0.22, saturation: 1.15, sunGlow: 0.25, sunSize: 0.02 },
    { u: 0.56, skyTop: 0xa6cbe6, skyMid: 0xf8dcc0, skyBottom: 0xfbe6d2, fog: 0xf4dcc4, fogDensity: 0.0022, sunDir: [0.15, 0.92, -0.3], sunColor: 0xfff2dc, sunIntensity: 1.5, hemiSky: 0xd4e6f6, hemiGround: 0xe0c0a0, hemiIntensity: 1.0, exposure: 0.96, bloom: 0.22, saturation: 1.2, sunGlow: 0.25, sunSize: 0.022 },
    { u: 0.72, skyTop: 0xa6cbe6, skyMid: 0xf8dcc0, skyBottom: 0xfbe6d2, fog: 0xf4dcc4, fogDensity: 0.0022, sunDir: [0.15, 0.92, -0.3], sunColor: 0xfff2dc, sunIntensity: 1.5, hemiSky: 0xd4e6f6, hemiGround: 0xe0c0a0, hemiIntensity: 1.0, exposure: 0.96, bloom: 0.22, saturation: 1.2, sunGlow: 0.25, sunSize: 0.022 },
    { u: 0.8, skyTop: 0x8fbfe6, skyMid: 0xd8ecf6, skyBottom: 0xeaf4fa, fog: 0xdcecf4, fogDensity: 0.0024, sunDir: [0.25, 0.85, -0.4], sunColor: 0xfff8f0, sunIntensity: 1.4, hemiSky: 0xc8e4f8, hemiGround: 0x7fb0c8, hemiIntensity: 1.0, exposure: 0.94, bloom: 0.22, saturation: 1.15, sunGlow: 0.25, sunSize: 0.02 },
    { u: 1.0, skyTop: 0x8fbfe6, skyMid: 0xd8ecf6, skyBottom: 0xeaf4fa, fog: 0xdcecf4, fogDensity: 0.0024, sunDir: [0.25, 0.85, -0.4], sunColor: 0xfff8f0, sunIntensity: 1.4, hemiSky: 0xc8e4f8, hemiGround: 0x7fb0c8, hemiIntensity: 1.0, exposure: 0.94, bloom: 0.22, saturation: 1.15, sunGlow: 0.25, sunSize: 0.02 },
  ]);

  const world: BuiltWorld = {
    scene, curve, speed: 10.5, vehicle, cameraAnchor, subjects, sky, sun, hemi, lighting,
    occluders: [terrain, alps.hotel],
    waterLevel: WATER,
    groundHeight: heightAt,
    makeProjectile: () => makeMendlsBox(0.7),
    ambience: {
      root: 62, scale: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [2, 5, 9]], padWave: 'triangle', padLevel: 0.07,
      melody: 'pluck', melodyInterval: 0.75, melodyDensity: 0.8, melodyLevel: 0.15, chordSeconds: 6, vehicle: 'train',
    },
    env(u) {
      const forestU = smoothstep(0.26, 0.3, u) * (1 - smoothstep(0.5, 0.54, u));
      const seaU = smoothstep(0.74, 0.78, u);
      return { wind: 0.3, birds: 0.5 * forestU + 0.15 * seaU, sea: 0.5 * seaU, rain: 0, crickets: 0 };
    },
    captions: [
      [0.005, 'Nebelsbad, Republic of Zubrowka'],
      [0.1, 'The Grand Budapest Hotel'],
      [0.29, 'The autumn wood'],
      [0.37, 'Camp Ivanhoe, New Penzance'],
      [0.53, 'Asteroid City, pop. 87'],
      [0.63, 'The crater'],
      [0.77, 'The causeway'],
      [0.84, 'The Belafonte'],
      [0.95, 'Port-au-Patois, end of the line'],
    ],
    update(dt, ride) {
      const t = ride.time;
      for (const up of updaters) up(dt, t, ride);
      const fog = scene.fog as THREE.FogExp2;
      for (const w of [sea, lake]) {
        w.uniforms.time.value = t;
        w.uniforms.fogColor.value.copy(fog.color); w.uniforms.fogDensity.value = fog.density;
        w.uniforms.skyColor.value.copy(sky.uniforms.midColor.value);
        w.uniforms.sunDir.value.copy(sky.uniforms.sunDir.value);
        w.uniforms.sunColor.value.copy(sky.uniforms.sunColor.value);
      }
      const cam = ctx.camera.position;
      snowfall.intensity = 1 - smoothstep(0.24, 0.29, ride.u);
      snowfall.update(dt, t, new THREE.Vector3(cam.x, cam.y + 8, cam.z - 20));
      leaves.intensity = smoothstep(0.27, 0.31, ride.u) * (1 - smoothstep(0.49, 0.53, ride.u));
      leaves.update(dt, t, new THREE.Vector3(cam.x, cam.y + 6, cam.z - 18));
      dust.intensity = smoothstep(0.52, 0.56, ride.u) * (1 - smoothstep(0.74, 0.77, ride.u));
      dust.update(dt, t, new THREE.Vector3(cam.x, cam.y + 2, cam.z - 24));
      puffs.update(dt);
      clouds.position.x = t * 0.5;
      const flick = 1.05 + Math.sin(t * 7.3) * 0.04;
      for (const m of train.lampMats) m.color.setHex(0xfff0c8).multiplyScalar(flick);
    },
    onItemLand(pos) { puffs.burst(pos, 7, 0xf2b8c6, 1.6, 1.4, 0.6); },
    onCall(pos, ride) {
      // the two hidden legends only answer the whistle from within range
      if (Math.hypot(pos.x - SPOTS.crater.x, pos.z - SPOTS.crater.z) < 90) startAlien();
      if (ride.u > uAt(-1730) && ride.u < uAt(-2150)) startShark(ride);
    },
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

export const AndersonWorld: WorldDef = {
  id: 'anderson',
  title: 'The Zubrowka Express',
  subtitle: 'Wes Anderson',
  blurb: 'Leave a snowy pink alp beneath the Grand Budapest, cross an autumn wood and a pastel desert, and roll out along a causeway to where the Belafonte is moored.',
  vehicleName: 'The Zubrowka Express',
  itemName: "Mendl's box",
  callName: 'whistle',
  callKind: 'whistle',
  accent: '#f2a8bc',
  accent2: '#b93a4c',
  fov: 58,
  build,
};
