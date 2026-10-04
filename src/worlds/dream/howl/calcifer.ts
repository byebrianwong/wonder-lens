import * as THREE from 'three';
import { mesh } from '../../../engine/Builders';
import { charToon, repeatUV } from '../../../engine/Paint';
import { sculpt, profileShape, envelope, Spring, LookAt } from '../../../engine/Rig';
import { Drift } from '../../../engine/Particles';
import { TAU, clamp, lerp } from '../../../engine/math';
import { barkTexture } from '../../ghibli/propTextures';
import { calciferEye, calciferMouth } from './paint';

/*
 * Calcifer, the fire demon in the hearth: a teardrop of flame with big round eyes and a wide mouth, sitting on
 * his logs. The flame is drawn by a shader (a hot yellow core, orange body and red edges, with streaks running
 * up it and tongues licking off the top), wrapped in layers of additive flame cards, with embers rising.
 * His own space: the top of the logs at the origin, facing +z.
 */

export interface Calcifer {
  group: THREE.Group;
  /** how bright he is right now (1 normal; more when he flares), for his light */
  glow: number;
  update(dt: number, t: number, camPos: THREE.Vector3): void;
  /** the ocarina: a wide grin, flickering up tall */
  grin(): void;
  /** an acorn: he gulps it down and flares up huge */
  swallow(): void;
}

const FLAME_VERT = /* glsl */ `
  uniform float uTime; uniform float uTall; uniform float uWide;
  varying vec3 vN; varying vec3 vView; varying float vH; varying vec3 vP;
  void main() {
    vec3 p = position;
    float h = clamp(p.y / 1.75, 0.0, 1.0);
    float w = smoothstep(0.3, 1.0, h);
    // the upper part licks from side to side and stretches up
    p.x += (sin(uTime * 7.3 + h * 6.0) * 0.08 + sin(uTime * 12.1 + h * 11.0) * 0.035) * w;
    p.z += cos(uTime * 6.1 + h * 5.0) * 0.06 * w;
    p.y *= mix(1.0, uTall, smoothstep(0.15, 1.0, h));
    p.xz *= uWide;
    vH = h; vP = position;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;
const FLAME_FRAG = /* glsl */ `
  uniform float uTime; uniform float uHeat;
  varying vec3 vN; varying vec3 vView; varying float vH; varying vec3 vP;
  ${NOISE}
  void main() {
    float facing = clamp(dot(normalize(vN), normalize(vView)), 0.0, 1.0);
    // streaks of flame running up the body
    float a = atan(vP.x, vP.z);
    float n = noise(vec2(a * 2.2, vH * 4.0 - uTime * 2.6)) * 0.6 + noise(vec2(a * 5.0 + 3.0, vH * 9.0 - uTime * 4.1)) * 0.4;
    vec3 core = vec3(1.0, 0.95, 0.62), mid = vec3(1.0, 0.55, 0.12), edge = vec3(0.86, 0.18, 0.05);
    float k = facing * (1.0 - vH * 0.55) + (n - 0.5) * 0.35;
    vec3 col = mix(edge, mid, smoothstep(0.1, 0.45, k));
    col = mix(col, core, smoothstep(0.5, 0.85, k));
    gl_FragColor = vec4(col * (1.25 + uHeat), 1.0);
  }
`;
const CARD_FRAG = /* glsl */ `
  uniform float uTime; uniform float uHeat; uniform float uSeed;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    // a tongue of flame: a soft teardrop, broken up by noise scrolling upward
    vec2 p = vUv * 2.0 - 1.0;
    float wob = (noise(vec2(vUv.y * 3.0 + uSeed, uTime * 1.7)) - 0.5) * 0.5 * vUv.y;
    float x = (p.x - wob) / max(0.05, 1.0 - vUv.y * 0.85);
    float shape = (1.0 - smoothstep(0.55, 1.0, abs(x))) * smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float n = noise(vec2(vUv.x * 4.0 + uSeed, vUv.y * 5.0 - uTime * 3.2));
    float a = shape * smoothstep(0.25, 0.7, n + (1.0 - vUv.y) * 0.4);
    vec3 col = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.75, 0.25), clamp(1.0 - vUv.y + n * 0.3, 0.0, 1.0));
    gl_FragColor = vec4(col * a * (0.9 + uHeat), 1.0);
  }
`;

export function makeCalcifer(): Calcifer {
  const g = new THREE.Group();
  // ---- logs and embers ----
  const bark = charToon({ map: barkTexture(0x5a4030), rim: 0.1, emissive: new THREE.Color(0x200804) });
  for (const [x, z, ry] of [[0, 0, 0.3], [0.15, -0.25, -0.9], [-0.1, 0.25, 1.6]] as const) {
    const lg = mesh(repeatUV(new THREE.CylinderGeometry(0.17, 0.19, 1.5, 10), 1, 1), bark, x, -0.18, z);
    lg.rotation.set(Math.PI / 2, ry, 0, 'YXZ');
    g.add(lg);
  }
  const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 0.12) });
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const e = mesh(new THREE.SphereGeometry(0.09, 8, 6), ember, Math.cos(a) * 0.45, -0.28, Math.sin(a) * 0.35); e.scale.y = 0.5; g.add(e); }
  g.add(mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.06, 18), new THREE.MeshLambertMaterial({ color: 0x3a3430 }), 0, -0.38, 0));

  // ---- the flame body ----
  const fire = new THREE.Group();
  g.add(fire);
  const bodyU = { uTime: { value: 0 }, uTall: { value: 1 }, uWide: { value: 1 }, uHeat: { value: 0 } };
  const bodyGeo = sculpt(profileShape([[1.75, 0], [1.5, 0.16], [1.2, 0.38], [0.9, 0.62], [0.6, 0.78], [0.32, 0.8], [0.1, 0.6], [0.0, 0.0]], { depth: 0.85 }), 32, 24);
  const body = new THREE.Mesh(bodyGeo, new THREE.ShaderMaterial({ uniforms: bodyU, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG }));
  fire.add(body);
  // flame cards: crossed pairs round and above the body, additive
  const cardGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const cards: Array<{ m: THREE.Mesh; u: Record<string, THREE.IUniform>; base: THREE.Vector3; s: number }> = [];
  const cardSpec: Array<[number, number, number, number, number]> = [
    [0, 0.8, 0, 1.7, 2.3], [0.3, 0.9, -0.1, 1.0, 1.7], [-0.32, 0.85, 0.05, 1.0, 1.6], [0.05, 1.3, -0.15, 0.8, 1.6], [0, 0.2, 0.1, 2.1, 1.9],
  ];
  cardSpec.forEach(([x, y, z, w, h], i) => {
    const u = { uTime: { value: 0 }, uHeat: { value: 0 }, uSeed: { value: i * 3.7 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: CARD_FRAG,
    });
    for (const ry of [0, Math.PI / 2]) {
      const m = new THREE.Mesh(cardGeo, mat);
      m.position.set(x, y - 0.6, z); m.rotation.y = ry + i * 0.4; m.scale.set(w, h, 1);
      m.renderOrder = 5;
      fire.add(m);
      cards.push({ m, u, base: m.position.clone(), s: h });
    }
  });
  // ---- face: two big round eyes and a wide mouth ----
  const face = new THREE.Group(); fire.add(face);
  const eyeMat = new THREE.MeshBasicMaterial({ map: calciferEye() });
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), eyeMat);
    e.scale.set(0.2, 0.26, 0.13); e.position.set(s * 0.25, 0.86, 0.6);
    face.add(e); eyes.push(e);
  }
  const mouthGeo = new THREE.PlaneGeometry(0.72, 0.36, 12, 1);
  { const p = mouthGeo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, -x * x * 0.55); } }
  const mouth = new THREE.Mesh(mouthGeo, new THREE.MeshBasicMaterial({ map: calciferMouth(), transparent: true, alphaTest: 0.3, depthWrite: false }));
  mouth.position.set(0, 0.5, 0.7);
  mouth.renderOrder = 6;
  face.add(mouth);
  // ---- embers rising ----
  const sparks = new Drift({ count: 40, color: 0xffa040, size: 0.07, box: new THREE.Vector3(1.4, 2.6, 1.2), speed: new THREE.Vector3(0, 0.9, 0), wobble: 0.35, blending: THREE.AdditiveBlending, seed: 1331 });
  g.add(sparks.points);
  const sparkAt = new THREE.Vector3(0, 1.5, 0);

  // ---- motion ----
  let grinT = -1, gulpT = -1;
  const sp = { tall: new Spring(1, 2.2, 0.45), wide: new Spring(1, 2.5, 0.4), heat: new Spring(0, 2, 0.6) };
  const look = new LookAt(0.7, 0.4);
  const tmp = new THREE.Vector3();
  const cal: Calcifer = {
    group: g, glow: 1,
    grin() { grinT = 0; },
    swallow() { gulpT = 0; },
    update(dt, t, camPos) {
      let tall = 1 + Math.sin(t * 3.1) * 0.05 + Math.sin(t * 7.7) * 0.03, wide = 1, heat = 0, open = 0.35 + Math.sin(t * 2.3) * 0.1, grinW = 1, squint = 1;
      if (grinT >= 0) {
        grinT += dt;
        const k = envelope(grinT, 0, 0.25, 1.3, 1.8);
        tall += 0.4 * k; heat += 0.4 * k; open = lerp(open, 0.9, k); grinW = 1 + 0.35 * k; squint = 1 - 0.35 * k;
        if (grinT > 1.9) grinT = -1;
      }
      if (gulpT >= 0) {
        gulpT += dt;
        // mouth wide open, gulp (squash), then a roaring flare that settles
        const gape = envelope(gulpT, 0, 0.15, 0.3, 0.45);
        const gulp = envelope(gulpT, 0.35, 0.45, 0.5, 0.65);
        const flare = envelope(gulpT, 0.55, 0.85, 1.6, 2.6);
        open = lerp(open, 1.3, gape) * (1 - gulp * 0.8);
        wide += 0.2 * gulp - 0.1 * gape + 0.5 * flare;
        tall += -0.25 * gulp + 1.3 * flare;
        heat += 1.6 * flare;
        squint = 1 - 0.4 * flare;
        if (gulpT > 2.8) gulpT = -1;
      }
      const T = sp.tall.update(tall, dt), Wd = sp.wide.update(wide, dt), Ht = sp.heat.update(heat, dt);
      bodyU.uTime.value = t; bodyU.uTall.value = T; bodyU.uWide.value = Wd; bodyU.uHeat.value = Ht;
      cal.glow = 1 + Ht * 1.4 + Math.sin(t * 9) * 0.05;
      for (const c of cards) {
        c.u.uTime.value = t; c.u.uHeat.value = Ht;
        c.m.position.set(c.base.x * Wd, c.base.y * T, c.base.z * Wd);
        c.m.scale.y = c.s * (0.85 + 0.15 * T + Math.sin(t * 5 + c.base.x * 9) * 0.06);
      }
      // the face rides up with the flame
      face.position.y = (T - 1) * 0.45;
      face.scale.setScalar(Wd > 1.2 ? 1 + (Wd - 1.2) * 0.4 : 1);
      mouth.scale.set(grinW, clamp(open, 0.1, 1.4), 1);
      // eyes follow the camera, and blink
      g.updateMatrixWorld(true);
      const [yaw, pitch] = look.update(face, camPos, dt);
      const blink = (t % 4.3) < 0.14 ? 0.15 : 1;
      for (const e of eyes) { e.rotation.set(pitch, yaw, 0); e.scale.y = 0.26 * squint * blink; }
      sparks.intensity = 1 + Ht;
      tmp.copy(sparkAt).setY(1.2 + T * 0.4);
      sparks.update(dt, t, tmp);
    },
  };
  return cal;
}
