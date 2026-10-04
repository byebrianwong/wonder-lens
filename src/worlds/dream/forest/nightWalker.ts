import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { charToon } from '../../../engine/Paint';
import { Rig, LookAt, Spring, envelope } from '../../../engine/Rig';
import { clamp, easeOutCubic, lerp, smoothstep } from '../../../engine/math';
import { spiritFace } from './textures';
import { headGeometry, antlerGeometry, ANTLER_BASE } from './spiritHead';

/*
 * The Night-Walker (Didarabotchi): the Forest Spirit's night form, a towering ghost of light about 90 units
 * tall to the top of its head. A huge hulking dome of a body on thick column legs, long thick arms that hang
 * to its knees, and on top, small against that bulk, the Forest Spirit's own face under great glowing antlers.
 *
 * The body is one smooth surface. It is described as a distance field (a dome, legs, arms and a neck, blended
 * into each other with a smooth minimum), turned into triangles once with marching cubes, and skinned to a
 * skeleton so it can walk. Its skin is a shader: milky translucent blue, a bright soft rim, slow ripples of
 * light and twinkling stars inside. Whatever is below the water (y 0) is not drawn, so it can rise out of the
 * pool and sink back into it. Fog fades it more gently than ordinary things, so it still shows at 120 units.
 *
 * Origin: on the water surface between its feet. Faces +z.
 */

export interface NightWalker {
  group: THREE.Group;
  /** the head (its +z is where the face looks) */
  head: THREE.Object3D;
  /** 0 under the water .. 1 standing at full height */
  rise: number;
  /** 0 standing still .. 1 walking */
  walk: number;
  /** distance walked so far; the legs step in time with it */
  walked: number;
  /** a world point to turn the head towards (it watches the rider), or null */
  lookTarget: THREE.Vector3 | null;
  /** turn the head and look down at `lookTarget` for a few seconds, glowing brighter */
  gaze(): void;
  /** world position of the middle of its chest */
  chest(out: THREE.Vector3): THREE.Vector3;
  update(dt: number, t: number, fog: THREE.FogExp2): void;
}

/** Height of the hips above the water; the head is at about 90, the antler tips at about 140. */
export const WALKER_HIPS = 36;
const STEP = 18;
/** How far down it starts, so even the antler tips are under the water. */
const SUNK = 152;

// ---------------- the body as a distance field ----------------
type P3 = [number, number, number];

/** Distance to a cone with rounded ends, from a (radius r1) to b (radius r2). After Inigo Quilez's sdRoundCone. */
function roundCone(a: P3, b: P3, r1: number, r2: number) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return (px: number, py: number, pz: number) => {
    const ax = px - a[0], ay = py - a[1], az = pz - a[2];
    const y = ax * bx + ay * by + az * bz, z = y - l2;
    const qx = ax * l2 - bx * y, qy = ay * l2 - by * y, qz = az * l2 - bz * y;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  };
}
/** Approximate distance to an ellipsoid. */
function ellipsoid(c: P3, r: P3) {
  return (px: number, py: number, pz: number) => {
    const x = px - c[0], y = py - c[1], z = pz - c[2];
    const k0 = Math.hypot(x / r[0], y / r[1], z / r[2]);
    const k1 = Math.hypot(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]));
    return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
  };
}
/** Smooth minimum: joins two shapes with a fillet about `k` wide instead of a crease. */
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

/** Where the joints are, in its own space (feet at y 0, facing +z). Limbs are given for the +x side. */
const J = {
  hip: [10.5, 36, 0] as P3, knee: [11, 19, 0.6] as P3, ankle: [11.5, 3, 1] as P3,
  shoulder: [20, 68, 1] as P3, elbow: [29, 45, 3] as P3, wrist: [30.5, 25, 5] as P3,
  neck: [0, 76, 4] as P3, head: [0, 86, 9] as P3,
};
const dome = ellipsoid([0, 54, 0], [19, 28, 15]);
const shoulders = ellipsoid([0, 66, -1], [20, 12, 13.5]);
const thigh = roundCone(J.hip, J.knee, 8.6, 7.4), shin = roundCone(J.knee, J.ankle, 7.4, 6.4);
const foot = ellipsoid([11.5, 2.4, 3.5], [6.6, 3.2, 9]);
const upperArm = roundCone(J.shoulder, J.elbow, 6.8, 5.0), foreArm = roundCone(J.elbow, J.wrist, 5.0, 3.3);
const hand = ellipsoid([30.8, 19.5, 5.5], [3.7, 6.2, 2.7]);
const neckCone = roundCone(J.neck, [0, 85, 8.5], 7.5, 4.6);

/** Signed distance to the whole body (negative inside). Arms and legs are mirrored across x = 0. */
function bodyDistance(x: number, y: number, z: number) {
  const ax = Math.abs(x);
  let d = smin(dome(x, y, z), shoulders(x, y, z), 6);
  const leg = smin(smin(thigh(ax, y, z), shin(ax, y, z), 3), foot(ax, y, z), 2.5);
  d = smin(d, leg, 7);
  // the arms join the body only at the shoulder, so they hang free below it
  const arm = smin(smin(upperArm(ax, y, z), foreArm(ax, y, z), 3), hand(ax, y, z), 2);
  d = smin(d, arm, lerp(0.6, 7, smoothstep(56, 66, y)));
  return smin(d, neckCone(x, y, z), 5);
}

/** The body's surface as triangles: marching cubes over the distance field, then merged and given smooth normals. */
function bodyGeometry(res = 64) {
  // the box the body fits in
  // (marching cubes leaves out the outermost cells, a little more on the + side, so the box has room to spare)
  const C = [0, 45, 0], H = [40, 50, 19];
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 90000);
  mc.isolation = 0;
  const f = mc.field;
  for (let k = 0; k < res; k++) {
    const z = C[2] + ((k - res / 2) / (res / 2)) * H[2];
    for (let j = 0; j < res; j++) {
      const y = C[1] + ((j - res / 2) / (res / 2)) * H[1];
      for (let i = 0; i < res; i++) {
        const x = C[0] + ((i - res / 2) / (res / 2)) * H[0];
        // positive inside, as marching cubes expects
        f[i + j * res + k * res * res] = -bodyDistance(x, y, z);
      }
    }
  }
  mc.update();
  const n = mc.count;
  const pos = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    pos[v * 3] = C[0] + mc.positionArray[v * 3] * H[0];
    pos[v * 3 + 1] = C[1] + mc.positionArray[v * 3 + 1] * H[1];
    pos[v * 3 + 2] = C[2] + mc.positionArray[v * 3 + 2] * H[2];
  }
  mc.geometry.dispose();
  const soup = new THREE.BufferGeometry();
  soup.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const geo = mergeVertices(soup, 1e-3);
  // smooth normals from the distance field itself
  const p = geo.attributes.position as THREE.BufferAttribute;
  const nrm = new Float32Array(p.count * 3), e = 0.3;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const gx = bodyDistance(x + e, y, z) - bodyDistance(x - e, y, z);
    const gy = bodyDistance(x, y + e, z) - bodyDistance(x, y - e, z);
    const gz = bodyDistance(x, y, z + e) - bodyDistance(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    nrm.set([gx / l, gy / l, gz / l], i * 3);
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** Which bones move each point of the body at rest (shares are normalised by the rig). */
function bodyWeights(p: THREE.Vector3): Record<string, number> {
  const ax = Math.abs(p.x), s = p.x < 0 ? 'L' : 'R';
  // below the dome and away from the middle: a leg
  const leg = (1 - smoothstep(28, 38, p.y)) * smoothstep(1, 5, ax);
  // outside the dome below the shoulder: an arm
  const domeHalf = 19 * Math.sqrt(Math.max(0, 1 - ((p.y - 54) / 28) ** 2));
  const arm = (1 - leg) * smoothstep(domeHalf + 0.5, domeHalf + 3.5, ax) * (1 - smoothstep(66, 72, p.y));
  const body = Math.max(0, 1 - leg - arm);
  const knee = smoothstep(27, 15, p.y), elbow = 1 - smoothstep(42, 52, p.y), wrist = smoothstep(29, 22, p.y);
  const chest = smoothstep(42, 60, p.y), neck = smoothstep(74, 80, p.y) * (1 - smoothstep(11, 15, ax));
  return {
    hips: body * (1 - chest), chest: body * chest * (1 - neck), neck: body * chest * neck,
    ['hip' + s]: leg * (1 - knee), ['knee' + s]: leg * knee,
    ['sh' + s]: arm * (1 - elbow), ['el' + s]: arm * elbow * (1 - wrist), ['wr' + s]: arm * wrist,
  };
}

// ---------------- the skin of light ----------------
/** Milky translucent blue with a soft bright rim, slow ripples of light and stars (see the note at the top). */
function nightSkin(bright: number) {
  const uniforms = {
    uTime: { value: 0 },
    uGlow: { value: new THREE.Color(0.42, 0.68, 1.0) },
    uBase: { value: new THREE.Color(0.2, 0.34, 0.62) },
    uStar: { value: new THREE.Color(0.92, 0.96, 1.0) },
    uBright: { value: bright },
    uVis: { value: 1 },
    uClipY: { value: 0 },
    uFogDensity: { value: 0.008 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    // premultiplied: the colour is added, the alpha veils what is behind a little
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vNormalV; varying vec3 vViewPos;
      void main() {
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <skinning_vertex>
        vLocal = position;
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vViewPos = mv.xyz;
        vNormalV = normalize(normalMatrix * objectNormal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uGlow; uniform vec3 uBase; uniform vec3 uStar; uniform float uBright; uniform float uVis;
      uniform float uClipY; uniform float uFogDensity;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vNormalV; varying vec3 vViewPos;
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise3(vec3 p) {
        vec3 i = floor(p), f = fract(p); vec3 w = f * f * (3.0 - 2.0 * f);
        float a = mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), w.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), w.x), w.y);
        float b = mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), w.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), w.x), w.y);
        return mix(a, b, w.z);
      }
      void main() {
        // nothing below the water is drawn
        if (vWorld.y < uClipY) discard;
        vec3 N = normalize(vNormalV);
        vec3 V = normalize(-vViewPos);
        float edge = clamp(1.0 - abs(dot(N, V)), 0.0, 1.0);
        float rim = pow(edge, 1.6);
        // slow ripples of light rising through the body, bent by drifting noise
        float n = noise3(vWorld * 0.045 + vec3(0.0, -uTime * 0.05, uTime * 0.03));
        float ripple = 0.5 + 0.5 * sin(vWorld.y * 0.22 - uTime * 0.9 + n * 6.0 + vWorld.x * 0.05);
        float light = smoothstep(0.45, 0.9, n * 0.7 + ripple * 0.45);
        // stars: a point in some cells of a grid in the body's own space, so they move with it
        vec3 sp = vLocal * 0.42;
        vec3 cell = floor(sp), fr = fract(sp);
        float h = hash3(cell);
        vec3 c = vec3(hash3(cell + 1.7), hash3(cell + 3.1), hash3(cell + 5.3)) * 0.7 + 0.15;
        float star = step(0.55, h) * (1.0 - smoothstep(0.02, 0.1, length(fr - c))) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0));
        // the mist fades it, but only about half as fast as ordinary things
        float fk = uFogDensity * 0.55 * length(vViewPos);
        float keep = exp(-fk * fk);
        // a bright line where it meets the water
        float wl = exp(-max(vWorld.y - uClipY, 0.0) * 0.5);
        float a = clamp((0.34 + 0.4 * rim) * keep * uVis, 0.0, 0.85);
        vec3 milk = uBase * (0.6 + 0.5 * light);
        vec3 glow = uGlow * (rim * 1.3 + light * 0.45 + wl * 0.9) + uStar * star * 1.6;
        gl_FragColor = vec4(milk * a + glow * sqrt(keep) * uVis * uBright, a);
      }
    `,
  });
  return { mat, uniforms };
}

let bodyGeoCache: THREE.BufferGeometry | null = null;

export function makeNightWalker(): NightWalker {
  const g = new THREE.Group();
  const lift = new THREE.Group();
  g.add(lift);
  const skin = nightSkin(1), crown = nightSkin(1.8);

  // ----- skeleton and the one smooth body -----
  const mirror = (p: P3): P3 => [-p[0], p[1], p[2]];
  const rig = new Rig(lift, [
    { name: 'root', at: [0, 0, 0] },
    { name: 'hips', parent: 'root', at: [0, WALKER_HIPS, 0] },
    { name: 'chest', parent: 'hips', at: [0, 58, 0] },
    { name: 'neck', parent: 'chest', at: J.neck },
    { name: 'head', parent: 'neck', at: J.head },
    { name: 'hipL', parent: 'hips', at: mirror(J.hip) }, { name: 'kneeL', parent: 'hipL', at: mirror(J.knee) },
    { name: 'hipR', parent: 'hips', at: J.hip }, { name: 'kneeR', parent: 'hipR', at: J.knee },
    { name: 'shL', parent: 'chest', at: mirror(J.shoulder) }, { name: 'elL', parent: 'shL', at: mirror(J.elbow) }, { name: 'wrL', parent: 'elL', at: mirror(J.wrist) },
    { name: 'shR', parent: 'chest', at: J.shoulder }, { name: 'elR', parent: 'shR', at: J.elbow }, { name: 'wrR', parent: 'elR', at: J.wrist },
  ]);
  const B = rig.bones;
  bodyGeoCache ??= bodyGeometry();
  const body = rig.skin(bodyGeoCache, skin.mat, bodyWeights);
  body.frustumCulled = false;

  // ----- the Forest Spirit's face on top, small against the body, under great glowing antlers -----
  const faceTex = spiritFace();
  const faceMat = charToon({ map: faceTex, emissive: 0x6a5a66, emissiveMap: faceTex, rim: 0.6, shade: 0x8a90c0 });
  const FACE = 7, HORNS = 15.5;
  const face = new THREE.Mesh(headGeometry(1.2), faceMat);
  face.scale.setScalar(FACE);
  face.position.set(0, 2.6, 1.4);
  B.head.add(face);
  const antlers = new THREE.Mesh(antlerGeometry(2203, { spread: 1.3, height: 1.15, radius: 0.07, radial: 7, tines: 11, fork: 1, twigs: true }), crown.mat);
  antlers.scale.setScalar(HORNS);
  // the antler bases sit on the face's crown, although the antlers are drawn larger than the face
  const baseMid = ANTLER_BASE[0].clone().add(ANTLER_BASE[1]).multiplyScalar(0.5);
  antlers.position.copy(face.position).addScaledVector(baseMid, FACE - HORNS);
  B.head.add(antlers);

  // ----- animation -----
  const look = new LookAt(1.0, 0.75);
  const sp = { walk: new Spring(0, 0.6, 0.95), gaze: new Spring(0, 0.9, 0.85) };
  let gazeT = -1;
  const ch: NightWalker = {
    group: g, head: B.head, rise: 1, walk: 0, walked: 0, lookTarget: null,
    gaze() { gazeT = 0; },
    chest(out) { return B.chest.localToWorld(out.set(0, 2, 0)); },
    update(dt, t, fog) {
      const r = clamp(ch.rise, 0, 1);
      // it rises straight up out of the pool, slowing as it reaches full height
      lift.position.y = lerp(-SUNK, 0, easeOutCubic(r));
      const w = clamp(sp.walk.update(ch.walk, dt), 0, 1);
      const ph = (ch.walked / STEP) * Math.PI;
      for (const [s, off] of [['L', 0], ['R', Math.PI]] as Array<[string, number]>) {
        const sw = Math.sin(ph + off);
        B['hip' + s].rotation.x = -0.26 * sw * w;
        // the knee folds while the leg swings forward
        B['knee' + s].rotation.x = Math.max(0, Math.cos(ph + off)) * 0.45 * w;
        // the long arms swing a little against the legs and hang straight when it stands
        B['sh' + s].rotation.set(0.12 * sw * w + Math.sin(t * 0.6 + off) * 0.02, 0, (s === 'L' ? -1 : 1) * Math.sin(t * 0.4 + off) * 0.02);
        B['el' + s].rotation.x = 0.06 + 0.08 * Math.max(0, -sw) * w;
      }
      // the body dips between steps, sways, and breathes slowly when still
      B.hips.position.y = WALKER_HIPS - 1.4 * Math.pow(Math.sin(ph), 2) * w + Math.sin(t * 0.5) * 0.3;
      B.chest.rotation.set(0.08 + Math.sin(t * 0.45) * 0.02, Math.sin(ph) * 0.05 * w, Math.sin(ph) * 0.03 * w);
      // the head watches the rider a little all the time; on a gaze it turns fully and bows towards them
      let gz = 0;
      if (gazeT >= 0) { gazeT += dt; gz = envelope(gazeT, 0, 1.2, 3.6, 5.2); if (gazeT > 5.4) gazeT = -1; }
      const k = sp.gaze.update(gz, dt);
      B.neck.rotation.x = 0.1 + 0.2 * k;
      const [ly, lp] = look.update(B.head, ch.lookTarget, dt, lerp(0.35, 1, k));
      B.head.rotation.set(lerp(0.12, 0, k) + lp, ly, Math.sin(t * 0.3) * 0.03);
      // light and fog
      const vis = clamp(r * 1.4, 0, 1);
      for (const m of [skin, crown]) {
        m.uniforms.uTime.value = t;
        m.uniforms.uFogDensity.value = fog.density;
        m.uniforms.uVis.value = vis;
      }
      skin.uniforms.uBright.value = 1 + 0.6 * k;
      crown.uniforms.uBright.value = 1.8 + 1.2 * k;
      g.visible = r > 0.001;
    },
  };
  return ch;
}
