import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { Puffs } from '../../../engine/Particles';
import { envelope } from '../../../engine/Rig';
import { Rng, smoothstep } from '../../../engine/math';
import { makeTotoro } from '../../ghibli/totoro';
import { makeSatsukiMei } from '../../ghibli/people';
import { mergeSiblings } from '../garden/cast';
import { FILMS, forwardOf } from '../common';
import { SPOTS } from './land';

/*
 * The bus stop in the rain (My Neighbor Totoro): night rain falls over the Inari-mae stop below the wire on
 * the left. Satsuki waits under her umbrella with Mei asleep on her back; Totoro stands beside her, a leaf on
 * his head, holding the umbrella she lent him. The Catbus the rider sits on is the bus they are waiting for.
 *
 * The shower is local: a box of rain streaks round the stop (one mesh, moved by its vertex shader), puddles
 * on the lane with rings where the drops land (one mesh), and splashes. Played the ocarina, or with an acorn
 * landing near him, Totoro hears the drops drum on his umbrella, looks up, jumps, and when he lands every
 * drop on the trees crashes down at once. Then he grins.
 *
 * Everything here is built at load; nothing compiles or appears for the first time during the ride.
 */

/** where the characters stand and which way they face (towards the road the bus comes along) */
const FACE = 0.3;
const FWD = new THREE.Vector3(Math.sin(FACE), 0, Math.cos(FACE));
/** a character's right-hand side (the viewer's left as they face you) */
const RIGHT = new THREE.Vector3(-Math.cos(FACE), 0, Math.sin(FACE));
const SIGN = SPOTS.busStop;
const at = (f: number, r: number) => new THREE.Vector3(SIGN.x, 0, SIGN.z).addScaledVector(FWD, f).addScaledVector(RIGHT, r);
/** side by side in front of the sign: Totoro nearer the lane, Satsuki on his right (seen from the wire, the Catbus's flank hides neither) */
export const RAIN_SPOTS = { satsuki: at(2.4, 1.8), totoro: at(0.8, -2.8) };
/** the shower: a box of rain over the stop and the wire above it */
const BOX = { x0: -24, x1: 11, z0: -494, z1: -544, y0: 0.4, y1: 22 };
/** the stretch of the ride where the shower is drawn */
export const RAIN_Z = { z0: -470, z1: -566 };
const TOTORO_SCALE = 1.1;

const rainVert = /* glsl */ `
  attribute vec2 corner;
  attribute vec4 seed;
  uniform float uTime; uniform float uAmount; uniform float uBurst; uniform float uBurstAge;
  uniform vec3 uMin; uniform vec3 uSize; uniform vec3 uBurstPos;
  uniform vec4 uShelter[2];
  uniform vec3 uLamp; uniform float uFogDensity;
  varying float vA; varying float vLamp; varying float vAcross;
  void main() {
    float burst = position.x;
    vec3 base; float len; float w; float a;
    if (burst < 0.5) {
      // the steady shower: each streak falls through the box and wraps round to the top
      float fall = uSize.y;
      float y = fract(seed.z - uTime * (17.0 + seed.w * 5.0) / fall) * fall;
      base = uMin + vec3(seed.x * uSize.x, y, seed.y * uSize.z);
      base.x += y * 0.06;
      len = 0.9 + seed.w * 0.6; w = 0.03;
      // soft edges to the shower
      float ex = min(seed.x, 1.0 - seed.x) * uSize.x, ez = min(seed.y, 1.0 - seed.y) * uSize.z;
      a = uAmount * (0.2 + 0.3 * seed.w) * smoothstep(0.0, 6.0, min(ex, ez));
      // the near drops round the burst get heavier while it lasts
      float d = length(base.xz - uBurstPos.xz);
      a *= 1.0 + 1.5 * uBurst * (1.0 - smoothstep(4.0, 9.0, d));
    } else {
      // the drops off the trees: one sheet of big drops coming down together round Totoro
      float ang = seed.x * 6.2832, r = sqrt(seed.y) * 6.5;
      float y = 10.0 + seed.z * 7.0 - uBurstAge * (19.0 + seed.w * 8.0);
      base = uBurstPos + vec3(cos(ang) * r, y, sin(ang) * r);
      len = 1.4 + seed.w; w = 0.05;
      a = uBurst * 0.85 * step(uMin.y + 0.1, base.y);
    }
    // no rain under the umbrellas
    for (int i = 0; i < 2; i++) {
      vec4 s = uShelter[i];
      if (length(base.xz - s.xy) < s.z && base.y < s.w) a = 0.0;
    }
    vec4 b = modelViewMatrix * vec4(base, 1.0);
    vec4 t = modelViewMatrix * vec4(base + vec3(0.04 * len, len, 0.0), 1.0);
    vec2 dir = t.xy - b.xy;
    float dl = length(dir);
    vec2 side = dl > 1e-5 ? vec2(-dir.y, dir.x) / dl : vec2(1.0, 0.0);
    vec4 p = mix(b, t, corner.y);
    p.xy += side * corner.x * w;
    float dist = -p.z;
    vLamp = 1.0 / (1.0 + dot(base - uLamp, base - uLamp) / 30.0);
    float fog = exp(-uFogDensity * uFogDensity * dist * dist);
    // fade the streaks close to the camera: zoomed in on Totoro, near ones read as thick grey bars
    vA = a * fog * smoothstep(3.0, 12.0, dist);
    vAcross = corner.x;
    gl_Position = projectionMatrix * p;
  }
`;
const rainFrag = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uLampColor;
  varying float vA; varying float vLamp; varying float vAcross;
  void main() {
    float a = vA * (1.0 - abs(vAcross));
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor + uLampColor * vLamp, a);
  }
`;

const puddleVert = /* glsl */ `
  varying vec3 vW; varying vec2 vUv;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const puddleFrag = /* glsl */ `
  uniform float uTime; uniform float uAmount; uniform vec3 uSky; uniform vec3 uLamp; uniform vec3 uLampColor;
  uniform vec3 uFogColor; uniform float uFogDensity;
  varying vec3 vW; varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    // a soft, ragged edge
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q) + 0.12 * sin(atan(q.y, q.x) * 5.0 + vW.x);
    float edge = 1.0 - smoothstep(0.7, 1.0, r);
    // rings where drops land: one drop per small cell, each at its own pace
    vec2 cell = floor(vW.xz / 0.7);
    vec2 c = (cell + 0.2 + 0.6 * vec2(hash(cell), hash(cell + 7.1))) * 0.7;
    float ph = fract(uTime * (0.9 + hash(cell + 3.3)) + hash(cell + 1.7));
    float d = length(vW.xz - c);
    float ring = (1.0 - smoothstep(0.0, 0.035, abs(d - ph * 0.32))) * (1.0 - ph) * uAmount;
    // the lamp's light lying on the wet surface, brightest towards it
    vec3 toLamp = uLamp - vW;
    float glint = pow(clamp(1.0 - length(toLamp.xz) / 14.0, 0.0, 1.0), 2.0);
    vec3 col = uSky * 0.55 + uLampColor * (0.5 * glint + 0.5 * ring * (0.4 + glint));
    vec3 cam = cameraPosition - vW;
    float fog = exp(-uFogDensity * uFogDensity * dot(cam, cam));
    col = mix(uFogColor, col, fog);
    gl_FragColor = vec4(col, edge * 0.82 * uAmount);
  }
`;

export interface RainStop {
  group: THREE.Group;
  subjects: Subject[];
  update(dt: number, t: number, z: number, camPos: THREE.Vector3, fog: THREE.FogExp2 | null, sky: THREE.Color | null): void;
}

/**
 * Build the bus stop in the rain. `groundAt` is the fields' ground height; `lamp` is the bulb of the street
 * lamp on the pole by the stop (world).
 */
export function buildRainStop(groundAt: (x: number, z: number) => number, lamp: THREE.Vector3, lowDetail: boolean): RainStop {
  const group = new THREE.Group();
  const rng = new Rng(1988);

  // ---------- the characters ----------
  // the umbrella is her father's black one; drawn slate grey so it still reads against the wood at night
  const totoro = makeTotoro({ umbrella: true, leaf: true, umbrellaColor: 0x4a5266 });
  totoro.group.scale.setScalar(TOTORO_SCALE);
  const sisters = makeSatsukiMei();
  sisters.group.scale.setScalar(1.12);
  for (const c of [totoro.group, sisters.group]) {
    mergeSiblings(c);
    // the moon is behind the rain cloud: no shadows here, which also keeps the draw calls down
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  }
  const T = RAIN_SPOTS.totoro, S = RAIN_SPOTS.satsuki;
  totoro.group.position.set(T.x, groundAt(T.x, T.z) - 0.05, T.z);
  totoro.group.rotation.y = FACE - 0.1;
  sisters.group.position.set(S.x, groundAt(S.x, S.z) - 0.02, S.z);
  sisters.group.rotation.y = FACE + 0.1;
  group.add(totoro.group, sisters.group);

  // ---------- rain: one mesh of streaks, all moved in the vertex shader ----------
  const nRain = lowDetail ? 1100 : 2200, nBurst = lowDetail ? 260 : 480, n = nRain + nBurst;
  const pos = new Float32Array(n * 4 * 3), corner = new Float32Array(n * 4 * 2), seed = new Float32Array(n * 4 * 4);
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = [rng.next(), rng.next(), rng.next(), rng.next()];
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos[v * 3] = i < nRain ? 0 : 1;
      corner[v * 2] = k % 2 ? 1 : -1; corner[v * 2 + 1] = k < 2 ? 0 : 1;
      seed.set(s, v * 4);
    }
    const v = i * 4;
    index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainGeo.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  rainGeo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  rainGeo.setIndex(index);
  const ru = {
    uTime: { value: 0 }, uAmount: { value: 0 }, uBurst: { value: 0 }, uBurstAge: { value: 0 },
    uMin: { value: new THREE.Vector3(BOX.x0, BOX.y0, BOX.z1) }, uSize: { value: new THREE.Vector3(BOX.x1 - BOX.x0, BOX.y1 - BOX.y0, BOX.z0 - BOX.z1) },
    uBurstPos: { value: new THREE.Vector3(T.x, groundAt(T.x, T.z), T.z) },
    uShelter: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uLamp: { value: lamp.clone() }, uFogDensity: { value: 0.004 },
    uColor: { value: new THREE.Color(0.55, 0.62, 0.75) }, uLampColor: { value: new THREE.Color(1.0, 0.82, 0.55) },
  };
  const rain = new THREE.Mesh(rainGeo, new THREE.ShaderMaterial({ uniforms: ru, vertexShader: rainVert, fragmentShader: rainFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  rain.frustumCulled = false;
  rain.renderOrder = 3;
  group.add(rain);

  // ---------- puddles in the clearing round the stop, and on the lane before and after it ----------
  const puddleGeos: THREE.BufferGeometry[] = [];
  const PUDDLES: Array<[number, number, number, number, number]> = [
    // x, z, length, width, turn
    [-4.4, -510, 3.2, 1.6, 0.2], [-8.2, -521.2, 2.6, 1.4, 0.6], [-11.6, -521.4, 2.0, 1.1, -0.2], [-15.8, -520.6, 2.4, 1.2, 0.3], [-11.2, -529.6, 2.2, 1.2, -0.4], [-5.2, -536, 3.4, 1.7, 0.1],
  ];
  for (const [x, z, l, w, r] of PUDDLES) {
    const g = new THREE.PlaneGeometry(l, w, 1, 1).rotateX(-Math.PI / 2).rotateY(r);
    g.translate(x, groundAt(x, z) + 0.05, z);
    puddleGeos.push(g);
  }
  const pu = {
    uTime: { value: 0 }, uAmount: { value: 0 }, uSky: { value: new THREE.Color(0x1a2a40) }, uLamp: { value: lamp.clone() }, uLampColor: { value: new THREE.Color(1.0, 0.82, 0.55) },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.004 },
  };
  const merged = new THREE.BufferGeometry();
  {
    const p: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const g of puddleGeos) {
      const base = p.length / 3;
      p.push(...(g.attributes.position.array as Float32Array));
      uv.push(...(g.attributes.uv.array as Float32Array));
      for (const i of g.index!.array as Uint16Array) idx.push(base + i);
    }
    merged.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    merged.setIndex(idx);
  }
  const puddles = new THREE.Mesh(merged, new THREE.ShaderMaterial({ uniforms: pu, vertexShader: puddleVert, fragmentShader: puddleFrag, transparent: true, depthWrite: false }));
  puddles.renderOrder = 1;
  group.add(puddles);

  // ---------- splashes ----------
  const splash = new Puffs(0xb8c8dc, 40, 1989);
  group.add(splash.group);

  // ---------- subjects ----------
  /** the reaction: hear the drops drum (0..1.4 s), jump (1.4), the crash of drops on landing, then the grin */
  let reactT = -1, crashT = -1;
  const camPos = new THREE.Vector3(), tmp = new THREE.Vector3(), umbTop = new THREE.Vector3(), lookAhead = new THREE.Vector3();
  const react = () => {
    if (reactT >= 0) return false;
    reactT = 0;
    totoroS.setPose('drip', 1.45);
    return true;
  };
  const totoroS: Subject = new Subject({
    id: 'totoro-rain', name: 'Totoro at the bus stop', from: FILMS.totoro, group: totoro.group, radius: 3.3, base: 1600, rarity: 'legendary',
    hint: 'Waiting in the rain at the Inari-mae bus stop, below the wire on the left, with the umbrella Satsuki lent him and a leaf on his head. Play the ocarina or toss an acorn by him, and listen to the rain on his umbrella.',
    poses: {
      waiting: { label: 'Waiting for the bus', mult: 1.3 },
      drip: { label: 'Drip, drop, on the umbrella', mult: 1.6 },
      jump: { label: 'Every drop comes down at once', mult: 2.1 },
      grin: { label: "Totoro's big grin", mult: 1.9 },
    },
    centerOffset: new THREE.Vector3(0, 2.8, 0), facing: forwardOf(totoro.group), maxDistance: 160, reactRange: 12,
    onCall: react,
    onItem: react,
  });
  const girlsAnchor = new THREE.Object3D();
  girlsAnchor.position.set(0, 1.5, 0);
  sisters.group.add(girlsAnchor);
  const girlsS: Subject = new Subject({
    id: 'satsuki-rain', name: 'Satsuki and Mei at the bus stop', from: FILMS.totoro, group: girlsAnchor, radius: 1.5, base: 850, rarity: 'rare',
    hint: 'Waiting for their father\'s bus in the rain at Inari-mae, Mei asleep on Satsuki\'s back. Satsuki looks round when Totoro does something surprising.',
    poses: { waiting: { label: 'Waiting for the bus', mult: 1.3 }, look: { label: 'Satsuki looks up at Totoro', mult: 1.6 } },
    facing: forwardOf(sisters.group), maxDistance: 120,
  });
  const subjects = [totoroS, girlsS];
  for (const s of subjects) s.active = false;

  const pose: NonNullable<typeof totoro.pose> = {};
  const umbQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), tiltQ = new THREE.Quaternion(), tiltE = new THREE.Euler();
  let dripNext = 0;

  return {
    group, subjects,
    update(dt, t, z, cam, fog, sky) {
      camPos.copy(cam);
      const on = z <= RAIN_Z.z0 && z > RAIN_Z.z1;
      group.visible = on;
      totoroS.active = girlsS.active = z < -476 && z > -556;
      if (!on) { reactT = -1; crashT = -1; return; }

      // ---- the shower: it fades in and out at the ends of its stretch ----
      const amount = smoothstep(RAIN_Z.z0, RAIN_Z.z0 - 18, z) * (1 - smoothstep(RAIN_Z.z1 + 18, RAIN_Z.z1, z));
      ru.uTime.value = t; ru.uAmount.value = amount;
      pu.uTime.value = t; pu.uAmount.value = Math.max(0.4, amount);
      if (fog) { ru.uFogDensity.value = fog.density; pu.uFogDensity.value = fog.density; pu.uFogColor.value.copy(fog.color); }
      if (sky) pu.uSky.value.copy(sky);

      // ---- the reaction ----
      let drum = 0, grin = 0, look = 0;
      if (reactT >= 0) {
        reactT += dt;
        const r = reactT;
        drum = envelope(r, 0, 0.3, 1.3, 1.6);
        // a few fat drops land on his umbrella, one after another
        if (r < 1.4 && r > dripNext) {
          dripNext = r + 0.32;
          totoro.umbrella?.getWorldPosition(umbTop);
          splash.burst(umbTop.add(tmp.set(0, 1.9 * TOTORO_SCALE, 0)), 3, 0xc8d8ec, 1.6, 1.4, 0.5);
        }
        if (r >= 1.4 && r - dt < 1.4) {
          totoroS.setPose('jump', 1.6);
          totoro.jump(() => {
            // landing: every drop on the trees comes down at once
            crashT = 0;
            const g = totoro.group.position;
            for (let i = 0; i < 5; i++) splash.burst(tmp.set(g.x + rng.range(-3, 3), g.y + 0.3, g.z + rng.range(-3, 3)), 4, 0xc8d8ec, 3, 2.4, 1.0);
            totoro.umbrella?.getWorldPosition(umbTop);
            splash.burst(umbTop.add(tmp.set(0, 1.9 * TOTORO_SCALE, 0)), 10, 0xd8e4f4, 4, 2.2, 1.0);
          });
        }
        grin = envelope(r, 2.5, 2.8, 4.9, 5.6);
        look = envelope(r, 1.5, 1.9, 4.8, 5.6);
        if (r > 2.5 && r < 2.6 && totoroS.pose !== 'grin') totoroS.setPose('grin', 2.6);
        if (r > 1.7 && r < 1.8 && girlsS.pose !== 'look') girlsS.setPose('look', 3.6);
        if (r > 6) { reactT = -1; dripNext = 0; }
      }
      if (crashT >= 0) { crashT += dt; if (crashT > 2.2) crashT = -1; }
      ru.uBurst.value = crashT >= 0 ? envelope(crashT, 0, 0.05, 0.9, 1.6) : 0;
      ru.uBurstAge.value = Math.max(0, crashT);
      // the scene itself is the pose; renewed before it runs out, so a photo never finds them 'idle'
      for (const s of subjects) if (s.pose === 'idle' || (s.pose === 'waiting' && s.poseTimer < 0.25)) s.setPose('waiting', 0.5);

      // ---- Totoro: looks up the road, at the Catbus as it comes, up at his umbrella while it drums ----
      const near = camPos.distanceTo(totoro.group.position) < 34;
      lookAhead.copy(totoro.group.position).addScaledVector(FWD, 20).setY(totoro.group.position.y + 4);
      totoro.lookTarget = drum > 0.3 ? null : near ? camPos : lookAhead;
      pose.head = -0.5 * drum - 0.15 * grin;
      // (any opening at all shows his teeth, so the mouth stays shut until the grin)
      pose.mouth = 1.05 * grin;
      pose.stretch = 0.03 * drum;
      pose.lean = -0.06 * drum;
      totoro.pose = totoro.roarTime > 0 ? null : pose;
      totoro.update(dt, t);
      // hold the umbrella tipped back a little, so the rider above can see his face under it; it bobs as drops hit
      if (totoro.umbrella) {
        const u = totoro.umbrella;
        u.parent!.updateWorldMatrix(true, false);
        u.parent!.getWorldQuaternion(parentQ).invert();
        totoro.group.getWorldQuaternion(umbQ).multiply(tiltQ.setFromEuler(tiltE.set(-0.32 + Math.sin(t * 0.8) * 0.03 + drum * Math.sin(t * 23) * 0.04, 0, 0.22)));
        u.quaternion.copy(parentQ.multiply(umbQ));
      }

      // ---- Satsuki: looks up the road for the bus, at the Catbus as it passes, and round at Totoro when he jumps ----
      sisters.lookTarget = look > 0.3 ? tmp.copy(totoro.group.position).setY(totoro.group.position.y + 4.6) : near ? camPos : lookAhead;
      sisters.update(dt, t);

      // ---- no rain under the umbrellas ----
      ru.uShelter.value[0].set(T.x + FWD.x * 0.3, T.z + FWD.z * 0.3, 1.7 * TOTORO_SCALE, totoro.group.position.y + 7.2 * TOTORO_SCALE);
      ru.uShelter.value[1].set(S.x - FWD.x * 0.2, S.z - FWD.z * 0.2, 1.15, sisters.group.position.y + 3.4);
      splash.update(dt);
    },
  };
}
