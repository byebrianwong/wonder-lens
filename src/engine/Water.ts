import * as THREE from 'three';
import type { HeightGrid } from './HeightGrid';

/**
 * Painterly sea.
 *
 * Reads the terrain height under each pixel to know the water depth: shallows turn clear turquoise over sand,
 * a line of foam laps at the shore, and deep water goes to ink blue. Small moving ripples break up the sky
 * reflection and scatter the sun into glitter. Colours are pushed in each frame with `update`.
 */
export class SeaMaterial {
  readonly material: THREE.ShaderMaterial;
  readonly uniforms = {
    uTime: { value: 0 },
    uHeightMap: { value: null as THREE.Texture | null },
    uHeightInfo: { value: new THREE.Vector4() },
    uWaterY: { value: 0 },
    uDeep: { value: new THREE.Color(0x14507a) },
    uShallow: { value: new THREE.Color(0x3fb3b8) },
    uSand: { value: new THREE.Color(0xd9c7a0) },
    uSkyTop: { value: new THREE.Color(0x3b7fd8) },
    uSkyHorizon: { value: new THREE.Color(0xd6e6f0) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.7, -0.3).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.96, 0.9) },
    uFoam: { value: 1 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.002 },
    uNight: { value: 0 },
  };

  constructor(heights: HeightGrid) {
    this.uniforms.uHeightMap.value = heights.texture();
    this.uniforms.uHeightInfo.value.set(heights.xMin, heights.zMin, heights.res, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorld; varying vec3 vSwellN; varying float vFogDepth;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          // long, slow swell
          float a = wp.x * 0.11 + wp.z * 0.05 + uTime * 0.7;
          float b = wp.z * 0.17 - wp.x * 0.04 - uTime * 0.55;
          wp.y += sin(a) * 0.09 + sin(b) * 0.06;
          vSwellN = normalize(vec3(-(cos(a) * 0.11 * 0.09 - cos(b) * 0.04 * 0.06), 1.0, -(cos(a) * 0.05 * 0.09 + cos(b) * 0.17 * 0.06)));
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform sampler2D uHeightMap; uniform vec4 uHeightInfo; uniform float uWaterY;
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSand; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon;
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uFoam; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uNight;
        varying vec3 vWorld; varying vec3 vSwellN; varying float vFogDepth;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        // height of a small ripple field, used for both glitter normals and foam break-up
        float ripples(vec2 p) {
          return noise(p * 0.9 + vec2(uTime * 0.35, uTime * 0.2)) * 0.6 + noise(p * 2.3 - vec2(uTime * 0.5, -uTime * 0.3)) * 0.4;
        }
        float ground(vec2 p) {
          ivec2 sz = textureSize(uHeightMap, 0);
          vec2 f = clamp((p - uHeightInfo.xy) / uHeightInfo.z, vec2(0.0), vec2(sz - 1) - 0.001);
          ivec2 i = ivec2(floor(f)); vec2 t = f - vec2(i);
          float h00 = texelFetch(uHeightMap, i, 0).r, h10 = texelFetch(uHeightMap, i + ivec2(1, 0), 0).r;
          float h01 = texelFetch(uHeightMap, i + ivec2(0, 1), 0).r, h11 = texelFetch(uHeightMap, i + ivec2(1, 1), 0).r;
          return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y);
        }
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float dist = length(cameraPosition - vWorld);
          // ripple normal from finite differences, fading out with distance so the far sea stays calm
          float e = 0.15;
          float r0 = ripples(vWorld.xz), rx = ripples(vWorld.xz + vec2(e, 0.0)), rz = ripples(vWorld.xz + vec2(0.0, e));
          float amp = 0.55 * (1.0 - smoothstep(20.0, 160.0, dist));
          vec3 n = normalize(vSwellN + vec3(-(rx - r0) / e, 0.0, -(rz - r0) / e) * amp * 0.35);
          float depth = max(uWaterY - ground(vWorld.xz), 0.0);
          float shallow = exp(-depth * 0.9);
          // water colour: deep ink blue, clear turquoise shallows over sand
          vec3 body = mix(uDeep, uShallow, smoothstep(0.02, 0.85, shallow));
          body = mix(body, uSand * 0.95, pow(shallow, 3.0) * 0.55 * (1.0 - uNight));
          // sky reflection, stronger at grazing angles
          vec3 R = reflect(-V, n);
          vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, R.y));
          float fres = 0.04 + 0.96 * pow(clamp(1.0 - dot(V, n), 0.0, 1.0), 5.0);
          vec3 col = mix(body, sky, clamp(fres * 0.9 + 0.12, 0.0, 1.0));
          // sun glitter
          vec3 H = normalize(V + uSunDir);
          float spec = pow(clamp(dot(n, H), 0.0, 1.0), 220.0);
          float glint = step(0.62, r0) * pow(clamp(dot(n, H), 0.0, 1.0), 40.0) * 0.35;
          col += uSunColor * (spec * 2.2 + glint) * (1.0 - smoothstep(250.0, 700.0, dist) * 0.7);
          // foam lapping at the shore, broken up by the ripples
          float band = 1.0 - smoothstep(0.0, 0.35, depth);
          float lap = 0.5 + 0.5 * sin(depth * 18.0 - uTime * 1.6 + r0 * 3.0);
          float foam = band * smoothstep(0.35, 0.75, r0 * 0.6 + lap * 0.6) * uFoam;
          col = mix(col, vec3(0.96, 0.98, 1.0) * mix(1.0, 0.35, uNight), foam * 0.85);
          float alpha = mix(0.96, 0.55, shallow) + foam * 0.3;
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
        }
      `,
    });
  }

  update(time: number, sky: { topColor: { value: THREE.Color }; midColor: { value: THREE.Color }; horizonColor: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color } }, fog: THREE.FogExp2, night: number) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uSkyTop.value.copy(sky.topColor.value).lerp(sky.midColor.value, 0.35);
    u.uSkyHorizon.value.copy(sky.midColor.value).lerp(sky.horizonColor.value, 0.5);
    u.uSunDir.value.copy(sky.sunDir.value).normalize();
    u.uSunColor.value.copy(sky.sunColor.value).multiplyScalar(1 + 1.6 * night);
    u.uFogColor.value.copy(fog.color);
    u.uFogDensity.value = fog.density;
    u.uNight.value = night;
    u.uDeep.value.setHex(0x14507a).lerp(new THREE.Color(0x0a1330), night);
    u.uShallow.value.setHex(0x3fb3b8).lerp(new THREE.Color(0x1d3f66), night);
  }
}
