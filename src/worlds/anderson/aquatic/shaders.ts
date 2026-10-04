import * as THREE from 'three';
import { charToon, type CharToonOpts } from '../../../engine/Paint';
import { Rng } from '../../../engine/math';

/*
 * Shared shader pieces for the Life Aquatic scene.
 *
 * Every reef material gets two patches:
 *  - caustics: the dancing web of light from the surface, projected down onto anything under water, strongest
 *    on upward faces and in the shallows, fading with depth;
 *  - sway: coral fronds, anemones and kelp moving in the swell. The sway runs on the stepped clock (`SEA.step`,
 *    12 poses a second), so the whole reef moves "on twos" like Henry Selick's stop-motion creatures.
 * The uniforms are shared objects, so one update per frame moves every material.
 */

export const SEA = {
  /** smooth time, for light and water */
  time: { value: 0 },
  /** stepped time (12 steps a second), for anything that should look animated by hand */
  step: { value: 0 },
  caustic: { value: null as THREE.Texture | null },
  causticColor: { value: new THREE.Color(0xd8fff4) },
  /** 0 above the water (and for the deep), 1 in the shallows */
  causticAmount: { value: 1 },
};

/** Advance the shared clocks (call once a frame). */
export function tickSea(t: number) {
  SEA.time.value = t;
  SEA.step.value = Math.floor(t * 12) / 12;
}

let causticTex: THREE.Texture | null = null;
/**
 * A tiling web of bright lines (the edges of a wobbly Voronoi pattern), soft at the edges. Two copies drifting
 * past each other at different scales make the caustic shimmer.
 */
export function causticTexture() {
  if (causticTex) return causticTex;
  const S = 128, N = 14;
  const rng = new Rng(4242);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) pts.push([rng.range(0, S), rng.range(0, S)]);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let f1 = 1e9, f2 = 1e9;
    for (const [px, py] of pts) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const dx = x - (px + ox * S), dy = y - (py + oy * S);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    const e = f2 - f1;
    const v = Math.max(0, 1 - e / 5.5);
    const k = (y * S + x) * 4;
    const b = Math.round(255 * Math.pow(v, 1.6));
    data[k] = data[k + 1] = data[k + 2] = b; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  causticTex = t;
  SEA.caustic.value = t;
  return t;
}

export interface ReefOpts extends CharToonOpts {
  /** sway amplitude (units of sideways movement per unit of height squared); 0 for rigid things */
  sway?: number;
  /** 'kelp' sways in a wave travelling up the stalk; 'tip' bends more towards the tip */
  swayMode?: 'tip' | 'kelp';
  /** caustic strength (default 1) */
  caustics?: number;
}

/**
 * A cel-shaded reef material (charToon's ramp and rim) with the caustic and sway patches. Works on plain
 * meshes and instanced meshes, with or without vertex colours.
 */
export function reefMat(o: ReefOpts = {}) {
  const { sway = 0, swayMode = 'tip', caustics = 1, ...rest } = o;
  causticTexture();
  const m = charToon({ rim: 0.25, ...rest });
  const base = m.onBeforeCompile;
  const amt = { value: caustics };
  const swayU = { value: sway };
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.uniforms.aqTime = SEA.time; sh.uniforms.aqStep = SEA.step;
    sh.uniforms.aqCaustic = SEA.caustic; sh.uniforms.aqCausticColor = SEA.causticColor;
    sh.uniforms.aqCausticAmt = SEA.causticAmount; sh.uniforms.aqMatCaustic = amt; sh.uniforms.aqSway = swayU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', /* glsl */ `#include <common>
        uniform float aqStep; uniform float aqSway;
        varying vec3 aqWorld; varying vec3 aqWN;`)
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        {
          vec3 aqIP = vec3(0.0);
          #ifdef USE_INSTANCING
            aqIP = instanceMatrix[3].xyz;
          #endif
          aqIP += vec3(modelMatrix[3].x, 0.0, modelMatrix[3].z);
          float aqPh = dot(aqIP, vec3(0.37, 0.11, 0.29));
          float aqH = max(transformed.y, 0.0);
          ${swayMode === 'kelp' ? `
            float aqS = aqSway * aqH;
            transformed.x += (sin(aqStep * 0.9 + aqPh - aqH * 0.22) + 0.35 * sin(aqStep * 2.1 + aqPh * 1.7 - aqH * 0.5)) * aqS;
            transformed.z += cos(aqStep * 0.7 + aqPh * 1.3 - aqH * 0.18) * aqS * 0.6;` : `
            float aqS = aqSway * aqH * aqH;
            transformed.x += sin(aqStep * 1.3 + aqPh) * aqS;
            transformed.z += cos(aqStep * 1.05 + aqPh * 1.3) * aqS * 0.7;`}
        }`)
      .replace('#include <project_vertex>', /* glsl */ `#include <project_vertex>
        {
          vec4 aqW = vec4(transformed, 1.0);
          vec3 aqN = objectNormal;
          #ifdef USE_INSTANCING
            aqW = instanceMatrix * aqW;
            aqN = mat3(instanceMatrix) * aqN;
          #endif
          aqW = modelMatrix * aqW;
          aqWorld = aqW.xyz;
          aqWN = normalize(mat3(modelMatrix) * aqN);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        uniform sampler2D aqCaustic; uniform float aqTime; uniform vec3 aqCausticColor; uniform float aqCausticAmt; uniform float aqMatCaustic;
        varying vec3 aqWorld; varying vec3 aqWN;`)
      .replace('#include <opaque_fragment>', /* glsl */ `
        {
          float aqK = aqCausticAmt * aqMatCaustic * step(aqWorld.y, 0.0);
          if (aqK > 0.001) {
            vec2 p = aqWorld.xz + aqWorld.y * vec2(0.22, 0.12);
            float a = texture2D(aqCaustic, p * 0.105 + vec2(aqTime * 0.019, aqTime * 0.011)).r;
            float b = texture2D(aqCaustic, p * 0.071 + vec2(-aqTime * 0.014, aqTime * 0.017) + 0.37).r;
            float c = clamp(a * b * 2.6 + (a + b) * 0.12, 0.0, 1.5);
            float depth = clamp(-aqWorld.y, 0.0, 120.0);
            float up = 0.3 + 0.7 * clamp(normalize(aqWN).y, 0.0, 1.0);
            outgoingLight += aqCausticColor * diffuseColor.rgb * c * up * exp(-depth * 0.06) * aqK * 0.9;
          }
        }
        #include <opaque_fragment>`);
  };
  const key = `aqReef|${sway > 0 ? swayMode : 'rigid'}`;
  m.customProgramCacheKey = () => key;
  return m;
}
