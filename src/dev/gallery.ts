/**
 * Dev-only character gallery: open /gallery.html while the dev server runs.
 * Shows one character (or the world's vehicle) at a time under the ride's own lighting, so painted
 * textures and materials can be checked up close. Drag to orbit, wheel to zoom.
 * URL: ?w=<ghibli | anderson>&c=<name>&u=<ride progress for the lighting>&yaw=&pitch=&dist=
 * From the console: view('catbus', { u: 0.4, yaw: 0.6, pitch: 0.2, dist: 14 }).
 */
import * as THREE from 'three';
import { Renderer } from '../engine/Renderer';
import { Sky } from '../engine/Sky';
import { Rng } from '../engine/math';
import { makeLighting } from '../game/lighting';
import type { LightingState } from '../game/types';
import { LIGHT_KEYS } from '../worlds/ghibli/GhibliWorld';
import { buildSeaTrain } from '../worlds/ghibli/environment';
import * as C from '../worlds/ghibli/characters';
import { LIGHT_KEYS as ANDERSON_KEYS } from '../worlds/anderson/AndersonWorld';
import { buildZubrowkaExpress } from '../worlds/anderson/environment';
import * as A from '../worlds/anderson/characters';

interface Entry { make: () => { group: THREE.Object3D; update?: (dt: number, t: number) => void; act?: () => void; follow?: () => THREE.Vector3 }; y: number; dist: number; u?: number }

const rng = () => new Rng(7);
const GHIBLI: Record<string, Entry> = {
  totoro: { make: () => { const c = C.makeTotoro({ umbrella: true }); return { ...c, act: () => c.roar() }; }, y: 2.8, dist: 12 },
  chu: { make: () => { const c = C.makeTotoro({ color: 0x5f7fa8, belly: 0xe8e2d0, scale: 0.62, chevrons: false, bag: true }); return c; }, y: 1.8, dist: 7 },
  chibi: { make: () => C.makeTotoro({ color: 0xf4f1ea, belly: -1, scale: 0.34, chevrons: false, leaf: true }), y: 1.0, dist: 4 },
  catbus: { make: () => C.makeCatbus(), y: 2.2, dist: 15 },
  kiki: { make: () => { const c = C.makeKiki(); c.group.position.y = 1.5; return { ...c, act: () => c.wave() }; }, y: 2.4, dist: 4.5 },
  noface: { make: () => { const c = C.makeNoFace(); return { ...c, act: () => c.offer() }; }, y: 2.9, dist: 8 },
  soot: { make: () => { const c = C.makeSootSprites(11, rng(), 3.2); return { ...c, act: () => c.jump() }; }, y: 0.5, dist: 7 },
  haku: {
    make: () => {
      const c = C.makeHaku();
      const tgt = new THREE.Vector3();
      return { group: c.group, act: () => c.swoop(), follow: () => c.head.position, update: (dt: number, t: number) => { tgt.set(Math.sin(t * 0.5) * 12, 5 + Math.sin(t * 0.9) * 2, Math.cos(t * 0.5) * 12); c.setTarget(tgt); c.update(dt, t); } };
    }, y: 5, dist: 30,
  },
  kodama: { make: () => { const c = C.makeKodama(14, rng(), 7); return { ...c, act: () => c.rattle() }; }, y: 0.8, dist: 8 },
  ponyo: { make: () => { const c = C.makePonyoSchool(14, rng()); return { ...c, act: () => c.leap() }; }, y: 0.6, dist: 12 },
  radish: { make: () => { const c = C.makeRadishSpirit(); return { ...c, act: () => c.bow() }; }, y: 2.6, dist: 9 },
  lamp: { make: () => C.makeHoppingLamp(), y: 1.6, dist: 6 },
  laputa: { make: () => C.makeLaputa(), y: 10, dist: 140 },
  howl: { make: () => { const c = C.makeHowlsCastle(); return { group: c.group, update: (dt: number, t: number) => { c.update(dt, t); c.group.position.z = 0; } }; }, y: 16, dist: 70 },
  passengers: { make: () => ({ group: C.makeShadowPassengers(4, rng(), 6) }), y: 1, dist: 7 },
  gulls: { make: () => C.makeSeagulls(9, rng()), y: 3, dist: 30 },
  blimp: { make: () => C.makeDirigible(), y: 0, dist: 45 },
  sisters: { make: () => { const c = C.makeSatsukiMei(); return { ...c, act: () => c.wave() }; }, y: 1.5, dist: 4.5 },
  chihiro: { make: () => { const c = C.makeChihiroSeated(); return { ...c, act: () => c.look() }; }, y: 1.2, dist: 3.2 },
  train: { make: () => { const t = buildSeaTrain(); return { group: t.group }; }, y: 1.8, dist: 16 },
};

const ANDERSON: Record<string, Entry> = {
  gustave: { make: () => { const c = A.makeGustaveZero(); return { ...c, act: () => c.bow() }; }, y: 1.2, dist: 5 },
  agatha: { make: () => { const c = A.makeAgatha(); return { ...c, act: () => c.catchBox() }; }, y: 1.0, dist: 3.5 },
  fox: { make: () => { const c = A.makeMrFox(); return { ...c, act: () => c.whistleClick() }; }, y: 1.0, dist: 4.5 },
  kylie: { make: () => { const c = A.makeKylie(); return { ...c, act: () => c.zoneOut() }; }, y: 0.8, dist: 3 },
  samsuzy: { make: () => { const c = A.makeSamSuzy(); return { ...c, act: () => c.moonrise() }; }, y: 0.8, dist: 3.5 },
  scouts: { make: () => { const c = A.makeScouts(7, rng()); return { ...c, act: () => c.salute() }; }, y: 0.8, dist: 10 },
  alien: { make: () => { const c = A.makeAlien(); c.group.visible = true; return { group: c.group }; }, y: 1.8, dist: 7 },
  ufo: { make: () => { const c = A.makeUfo(); return { ...c, act: () => c.setBeam(true, 12) }; }, y: 0, dist: 16 },
  belafonte: { make: () => A.makeBelafonte(), y: 3, dist: 50 },
  zissou: { make: () => { const c = A.makeTeamZissou(5, rng()); return { ...c, act: () => c.point() }; }, y: 1.0, dist: 8 },
  pele: { make: () => { const c = A.makePele(); return { ...c, act: () => c.play() }; }, y: 0.8, dist: 3.5 },
  shark: { make: () => { const c = A.makeJaguarShark(); c.surface(); return c; }, y: 0, dist: 22 },
  sub: { make: () => { const c = A.makeDeepSearch(); return { ...c, act: () => c.surface() }; }, y: 0.5, dist: 12 },
  roadrunner: { make: () => { const c = A.makeRoadrunner(); return { ...c, act: () => c.dance() }; }, y: 0.5, dist: 2.5 },
  crabs: { make: () => A.makeSugarCrabs(6, rng(), 0.6), y: 0.2, dist: 5 },
  van: { make: () => { const c = A.makeMendlsVan(); return { ...c, act: () => c.flash() }; }, y: 1.2, dist: 9 },
  train: { make: () => { const t = buildZubrowkaExpress(); return { group: t.group }; }, y: 2, dist: 16 },
};

const WORLD = new URLSearchParams(location.search).get('w') === 'anderson' ? 'anderson' : 'ghibli';
const ENTRIES = WORLD === 'anderson' ? ANDERSON : GHIBLI;
/** Lighting presets for the buttons: [label, ride progress]. */
const PRESETS: ReadonlyArray<readonly [string, number]> = WORLD === 'anderson'
  ? [['alps', 0.1], ['wood', 0.35], ['desert', 0.6], ['sea', 0.84], ['sundown', 0.99]]
  : [['day', 0], ['afternoon', 0.28], ['dusk', 0.4], ['rain', 0.5], ['night', 0.7]];

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const camera = new THREE.PerspectiveCamera(45, renderer.aspect, 0.1, 3000);
renderer.setScene(new THREE.Scene(), camera);
renderer.resize();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xd6e6f0, 0.002);
const sky = new Sky(1400);
scene.add(sky.mesh);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x6f8f5a, 0.8);
scene.add(hemi);
const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6f9a4a }));
ground.receiveShadow = true;
scene.add(ground);
renderer.setScene(scene, camera);

const lighting = makeLighting((WORLD === 'anderson' ? ANDERSON_KEYS : LIGHT_KEYS).map((k) => ({ ...k })));
const L: LightingState = {
  skyTop: new THREE.Color(), skyMid: new THREE.Color(), skyBottom: new THREE.Color(), fog: new THREE.Color(), fogDensity: 0.002,
  sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(), sunIntensity: 1, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
  hemiIntensity: 1, stars: 0, moon: 0, exposure: 1, bloom: 0.4, saturation: 1, tint: new THREE.Color(1, 1, 1),
  sunGlow: 0.6, sunSize: 0.02, horizonHeight: 0.08, cloudShadow: 0,
};

const params = new URLSearchParams(location.search);
const firstEntry = Object.keys(ENTRIES)[0];
const state = { focus: null as null | [number, number, number], name: params.get('c') ?? firstEntry, u: Number(params.get('u') ?? 0), yaw: Number(params.get('yaw') ?? 0.5), pitch: Number(params.get('pitch') ?? 0.12), dist: 0, paused: false };
let current: ReturnType<Entry['make']> | null = null;
let entry: Entry = ENTRIES[state.name] ?? ENTRIES[firstEntry];
state.dist = Number(params.get('dist') ?? 0) || entry.dist;

function applyLight(u: number) {
  lighting(u, L);
  const s = sky.uniforms;
  s.topColor.value.copy(L.skyTop); s.midColor.value.copy(L.skyMid); s.bottomColor.value.copy(L.skyBottom);
  s.sunDir.value.copy(L.sunDir).normalize(); s.sunColor.value.copy(L.sunColor);
  s.starAmount.value = L.stars; s.moonAmount.value = L.moon; s.sunGlow.value = L.sunGlow; s.sunSize.value = L.sunSize;
  s.moonDir.value.copy(L.sunDir).normalize(); s.horizonColor.value.copy(L.fog); s.horizonHeight.value = L.horizonHeight;
  const fog = scene.fog as THREE.FogExp2;
  fog.color.copy(L.fog); fog.density = L.fogDensity * 0.5;
  sun.color.copy(L.sunColor); sun.intensity = L.sunIntensity;
  hemi.color.copy(L.hemiSky); hemi.groundColor.copy(L.hemiGround); hemi.intensity = L.hemiIntensity;
  renderer.renderer.toneMappingExposure = L.exposure;
  renderer.bloom.strength = L.bloom;
  renderer.grade.uniforms.saturation.value = L.saturation;
  (renderer.grade.uniforms.tint.value as THREE.Color).copy(L.tint);
  renderer.fx.uniforms.cloudShadow.value = 0;
}

function show(name: string) {
  if (current) scene.remove(current.group);
  entry = ENTRIES[name] ?? ENTRIES[firstEntry];
  state.name = name;
  current = entry.make();
  current.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(current.group);
  buildBar();
}

const bar = document.getElementById('bar')!;
function buildBar() {
  bar.innerHTML = '';
  for (const n of Object.keys(ENTRIES)) {
    const b = document.createElement('button');
    b.textContent = n; if (n === state.name) b.className = 'on';
    b.onclick = () => { state.dist = ENTRIES[n].dist; state.focus = null; show(n); };
    bar.appendChild(b);
  }
  for (const [label, u] of PRESETS) {
    const b = document.createElement('button');
    b.textContent = label; if (Math.abs(state.u - u) < 0.001) b.className = 'on';
    b.onclick = () => { state.u = u; buildBar(); };
    bar.appendChild(b);
  }
  const act = document.createElement('button');
  act.textContent = 'act'; act.onclick = () => current?.act?.();
  bar.appendChild(act);
}

// orbit controls
let dragging = false, lx = 0, ly = 0;
canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  state.yaw -= (e.clientX - lx) * 0.006; state.pitch = Math.max(-0.4, Math.min(1.4, state.pitch + (e.clientY - ly) * 0.005));
  lx = e.clientX; ly = e.clientY;
});
canvas.addEventListener('wheel', (e) => { state.dist *= Math.exp(e.deltaY * 0.001); e.preventDefault(); }, { passive: false });

const target = new THREE.Vector3();
let last = performance.now(), time = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!state.paused) time += dt;
  step(dt);
  requestAnimationFrame(frame);
}
function step(dt: number) {
  applyLight(state.u);
  current?.update?.(dt, time);
  if (state.focus) target.fromArray(state.focus); else if (current?.follow) target.copy(current.follow()); else target.set(0, entry.y, 0);
  camera.position.set(target.x + Math.sin(state.yaw) * Math.cos(state.pitch) * state.dist, target.y + Math.sin(state.pitch) * state.dist, target.z + Math.cos(state.yaw) * Math.cos(state.pitch) * state.dist);
  camera.lookAt(target);
  camera.aspect = renderer.aspect; camera.updateProjectionMatrix();
  sun.position.copy(L.sunDir).normalize().multiplyScalar(Math.max(60, state.dist * 2)).add(target);
  sun.target.position.copy(target);
  const ext = Math.max(12, entry.dist * 0.8);
  const sc = sun.shadow.camera;
  if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.far = ext * 8; sc.updateProjectionMatrix(); }
  sky.update(camera.position, time);
  renderer.render(time);
}

show(state.name);
requestAnimationFrame(frame);

/** Console helpers for scripted checks (also work when requestAnimationFrame is paused). */
Object.assign(window, {
  view(name: string, o: { u?: number; yaw?: number; pitch?: number; dist?: number; focus?: [number, number, number] } = {}) {
    if (name !== state.name) show(name);
    state.focus = o.focus ?? null;
    state.u = o.u ?? state.u; state.yaw = o.yaw ?? state.yaw; state.pitch = o.pitch ?? state.pitch; state.dist = o.dist ?? entry.dist;
    buildBar();
    step(0.016);
    return 'ok';
  },
  act() { current?.act?.(); },
  /** advance the animation by `sec` seconds in 1/60 s steps (for when the tab is hidden and frames stop) */
  advance(sec: number) { for (let i = 0; i < Math.round(sec * 60); i++) { time += 1 / 60; step(1 / 60); } return time; },
  gallery: { state, step, scene, camera },
});
