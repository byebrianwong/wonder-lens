import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, TAU } from '../../../engine/math';

/*
 * Water for Laputa: waterfalls that pour off the terraces into the sky and fade into mist, puffs of that
 * mist, still pools that hold the sky, and the stream that runs to the edge. Every material here takes the
 * scene's fog through `fogColor` / `fogDensity` uniforms, which the set copies in each frame.
 */

const NOISE = /* glsl */ `
  float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;

export type FogUniforms = { fogColor: { value: THREE.Color }; fogDensity: { value: number }; time: { value: number } };
const fogU = (): FogUniforms => ({ fogColor: { value: new THREE.Color(0xc8dcea) }, fogDensity: { value: 0.0026 }, time: { value: 0 } });

// ---------------- waterfalls ----------------

/**
 * One fall: starts at `from`, shoots out along `out` (horizontal) and drops `drop` units, getting wider.
 * The cross-section is a flattened tube, so it reads from the side as well as from the front.
 */
export interface FallSpec { from: THREE.Vector3; out: THREE.Vector3; width: number; drop: number; throw?: number }

function fallGeometry(f: FallSpec) {
  const out = f.out.clone().setY(0).normalize();
  const side = new THREE.Vector3(-out.z, 0, out.x);
  const thr = f.throw ?? 2.5;
  // the centre line: a short arc outwards, then nearly straight down, drifting out a little
  const pts: THREE.Vector3[] = [];
  const N = 6;
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = -f.drop * t;
    const o = thr * Math.sqrt(t * 3) / Math.sqrt(3) + t * f.drop * 0.06;
    pts.push(f.from.clone().addScaledVector(out, o).add(new THREE.Vector3(0, y, 0)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const SEG = 40, RAD = 10;
  const pos: number[] = [], uv: number[] = [], k: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3();
  const len = curve.getLength();
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    curve.getPointAt(t, p);
    // the sheet spreads as it falls; its depth stays shallow
    const w = f.width * (0.5 + 0.9 * t), d = Math.min(w * 0.35, 0.6 + t * 2.5);
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * TAU;
      const sx = Math.cos(a) * w * 0.5, sz = Math.sin(a) * d * 0.5;
      pos.push(p.x + side.x * sx + out.x * sz, p.y, p.z + side.z * sx + out.z * sz);
      uv.push(j / RAD, t * len);
      k.push(t);
      if (i < SEG && j < RAD) { const q = i * (RAD + 1) + j, r = q + RAD + 1; idx.push(q, r, q + 1, q + 1, r, r + 1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('fallK', new THREE.Float32BufferAttribute(k, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** All the falls in one mesh: white water streaming down, thinning and fading into mist towards the bottom. */
export function waterfalls(specs: FallSpec[]) {
  const uniforms = fogU();
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float fallK;
      varying vec2 vUv; varying float vK; varying float vFogDepth; varying vec3 vN; varying vec3 vWorld;
      void main() {
        vUv = uv; vK = fallK;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time; uniform vec3 fogColor; uniform float fogDensity;
      varying vec2 vUv; varying float vK; varying float vFogDepth; varying vec3 vN; varying vec3 vWorld;
      ${NOISE}
      void main() {
        // streaks that run down the fall, quicker as the water speeds up
        float along = vUv.y * 0.12 - time * (0.9 + vK * 0.8);
        float s1 = wNoise(vec2(vUv.x * 14.0, along));
        float s2 = wNoise(vec2(vUv.x * 31.0 + 5.0, along * 2.3 + 1.7));
        float streak = clamp(s1 * 0.65 + s2 * 0.45, 0.0, 1.0);
        vec3 deep = vec3(0.56, 0.74, 0.86), foam = vec3(0.97, 0.99, 1.0);
        vec3 col = mix(deep, foam, smoothstep(0.35, 0.8, streak) * 0.8 + vK * 0.35);
        // light the side that faces the sun a little more
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = pow(clamp(1.0 - abs(dot(normalize(vN), V)), 0.0, 1.0), 2.0);
        col += rim * 0.12;
        // solid near the top, broken into threads and then gone into mist lower down
        float body = mix(0.85, 0.35, smoothstep(0.0, 0.7, vK));
        float threads = smoothstep(0.25 + vK * 0.45, 0.75 + vK * 0.2, streak);
        float a = mix(body, threads * 0.8, smoothstep(0.15, 0.6, vK));
        a *= 1.0 - smoothstep(0.5, 0.97, vK);
        a *= smoothstep(0.0, 0.08, vK + 0.02);
        float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }
    `,
  });
  const geo = mergeGeometries(specs.map(fallGeometry), false)!;
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.userData.keep = true;
  return { mesh, uniforms };
}

// ---------------- mist ----------------

/**
 * Soft white puffs that drift down and outwards from where the falls break up, grow and fade, on a loop.
 * Each puff is a camera-facing quad; all of them are one instanced draw.
 */
export function mistPuffs(specs: FallSpec[], perFall: number, rng: Rng) {
  const uniforms = fogU();
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const offs: number[] = [], drift: number[] = [], info: number[] = [];
  for (const f of specs) {
    const out = f.out.clone().setY(0).normalize();
    for (let i = 0; i < perFall; i++) {
      // most puffs gather in the lower part of the fall, where it breaks up
      const t = 0.3 + 0.7 * Math.pow(rng.next(), 0.7);
      const o = (f.throw ?? 2.5) + t * f.drop * 0.06;
      const p = f.from.clone().addScaledVector(out, o + rng.range(-1, 2)).add(new THREE.Vector3(rng.range(-1, 1) * f.width, -f.drop * t, rng.range(-1, 1) * f.width));
      offs.push(p.x, p.y, p.z);
      drift.push(out.x * rng.range(1, 3) + rng.range(-1, 1), -rng.range(4, 9), out.z * rng.range(1, 3) + rng.range(-1, 1));
      // size, phase, speed of the loop, opacity
      info.push(f.width * rng.range(1.4, 2.8) * (0.6 + t), rng.next(), rng.range(0.05, 0.1), rng.range(0.35, 0.6));
    }
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offs), 3));
  geo.setAttribute('aDrift', new THREE.InstancedBufferAttribute(new Float32Array(drift), 3));
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(info), 4));
  geo.instanceCount = offs.length / 3;
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aOffset; attribute vec3 aDrift; attribute vec4 aInfo;
      uniform float time;
      varying vec2 vUv; varying float vA; varying float vFogDepth;
      void main() {
        float ph = fract(time * aInfo.z + aInfo.y);
        vec3 c = aOffset + aDrift * ph * 3.0;
        vec4 mv = viewMatrix * modelMatrix * vec4(c, 1.0);
        float size = aInfo.x * (0.7 + ph * 0.9);
        mv.xy += position.xy * size;
        vUv = uv;
        // fade in, hold, fade out; and fade when very close to the lens
        vA = aInfo.w * sin(ph * 3.14159) * smoothstep(2.0, 9.0, -mv.z);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 fogColor; uniform float fogDensity;
      varying vec2 vUv; varying float vA; varying float vFogDepth;
      void main() {
        vec2 d = vUv - 0.5;
        float r = clamp(1.0 - length(d) * 2.0, 0.0, 1.0);
        float a = r * r * (3.0 - 2.0 * r) * vA;
        if (a < 0.005) discard;
        vec3 col = vec3(0.97, 0.98, 1.0);
        float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.userData.keep = true;
  return { mesh, uniforms };
}

// ---------------- still and running water ----------------

/**
 * Clear garden water that holds the morning sky: deep teal looking down, the sky at a slant, small
 * ripples and a glint of sun. With `flow` > 0 the ripples run along the strip's v direction (a stream).
 */
export function gardenWater(flow = 0) {
  const uniforms = {
    ...fogU(),
    deep: { value: new THREE.Color(0x1f5a5a) },
    shallow: { value: new THREE.Color(0x4a8a78) },
    skyTop: { value: new THREE.Color(0x3a76d8) },
    skyLow: { value: new THREE.Color(0xc8e0f0) },
    sunDir: { value: new THREE.Vector3(0.45, 0.62, -0.5).normalize() },
    flow: { value: flow },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec2 vUv; varying float vFogDepth;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time; uniform vec3 fogColor; uniform float fogDensity;
      uniform vec3 deep; uniform vec3 shallow; uniform vec3 skyTop; uniform vec3 skyLow; uniform vec3 sunDir; uniform float flow;
      varying vec3 vWorld; varying vec2 vUv; varying float vFogDepth;
      ${NOISE}
      float rip(vec2 p) {
        vec2 q = flow > 0.0 ? vec2(vUv.x * 3.0, vUv.y * 0.6 - time * flow) : p;
        return wNoise(q * 1.3 + vec2(time * 0.12, time * 0.07)) * 0.6 + wNoise(q * 3.1 - vec2(time * 0.2, -time * 0.15)) * 0.4;
      }
      void main() {
        vec2 p = vWorld.xz;
        float e = 0.12;
        float r0 = rip(p), rx = rip(p + vec2(e, 0.0)), rz = rip(p + vec2(0.0, e));
        float amp = flow > 0.0 ? 0.6 : 0.18;
        vec3 n = normalize(vec3(-(rx - r0) / e * amp, 1.0, -(rz - r0) / e * amp));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.05 + 0.95 * pow(clamp(1.0 - dot(V, n), 0.0, 1.0), 4.0);
        vec3 R = reflect(-V, n);
        vec3 sky = mix(skyLow, skyTop, smoothstep(0.0, 0.7, R.y));
        vec3 body = mix(deep, shallow, 0.3 + 0.4 * r0);
        vec3 col = mix(body, sky, clamp(fres + 0.15, 0.0, 1.0));
        float spec = pow(clamp(dot(R, sunDir), 0.0, 1.0), 120.0);
        col += vec3(1.0, 0.97, 0.9) * spec * 1.6;
        if (flow > 0.0) col = mix(col, vec3(0.92, 0.97, 1.0), smoothstep(0.62, 0.85, r0) * 0.45);
        float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 0.9);
      }
    `,
  });
  return { material: mat, uniforms };
}
