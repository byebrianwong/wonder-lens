import * as THREE from 'three';
import { smoothstep } from '../../../engine/math';
import { WATER } from './plan';
import { waveLitAt, WAVE } from './wave';

/*
 * The still water of the spirit world at the bottom of the ravine: dark and glassy, reflecting the dusk sky,
 * a path of sunset light towards the sun, and long trembling streaks under the lanterns once they are lit.
 */

const MAX_LAMPS = 16;

export interface WaterLamp { p: THREE.Vector3; strength: number; d: number }

export function spiritWater(o: { x0: number; x1: number; z0: number; z1: number }) {
  const uniforms = {
    time: { value: 0 },
    deep: { value: new THREE.Color(0x07101e) },
    shallow: { value: new THREE.Color(0x183048) },
    skyLow: { value: new THREE.Color(0xc0684a) },
    skyHigh: { value: new THREE.Color(0x2a2a58) },
    sunDir: { value: new THREE.Vector3(0.25, 0.04, -0.97).normalize() },
    sunset: { value: 1 },
    fogColor: { value: new THREE.Color() },
    fogDensity: { value: 0.004 },
    lamps: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    lampColor: { value: new THREE.Color(0xffa860) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying float vFogDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform vec3 skyLow; uniform vec3 skyHigh;
      uniform vec3 sunDir; uniform float sunset; uniform vec3 fogColor; uniform float fogDensity;
      uniform vec4 lamps[${MAX_LAMPS}]; uniform vec3 lampColor;
      varying vec3 vWorld; varying float vFogDepth;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
      void main() {
        vec2 p = vWorld.xz;
        // a nearly still surface: slow, faint ripples
        float n1 = noise(p * 0.35 + vec2(time * 0.08, time * 0.05));
        float n2 = noise(p * 1.1 - vec2(time * 0.06, -time * 0.1));
        vec3 nrm = normalize(vec3((n1 - 0.5) * 0.12 + (n2 - 0.5) * 0.08, 1.0, (n2 - 0.5) * 0.1));
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 R = reflect(-V, nrm);
        float fres = pow(clamp(1.0 - dot(V, nrm), 0.0, 1.0), 3.0);
        // the sky in the water: warm low down towards the sunset, indigo higher up
        float toSun = clamp(dot(normalize(vec3(R.x, 0.0, R.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))) * 0.5 + 0.5, 0.0, 1.0);
        vec3 sky = mix(skyHigh, skyLow, clamp(1.0 - R.y * 2.5, 0.0, 1.0) * mix(0.35, 1.0, toSun * sunset));
        vec3 col = mix(deep, shallow, n1 * 0.4);
        col = mix(col, sky, clamp(fres * 0.9 + 0.15, 0.0, 1.0));
        // the path of light under the setting sun
        float glint = pow(clamp(dot(R, sunDir), 0.0, 1.0), 60.0) * smoothstep(0.45, 0.8, n2 + n1 * 0.3);
        col += vec3(1.0, 0.55, 0.3) * glint * 2.0 * sunset;
        // lantern streaks: from each lamp's foot towards the camera, broken by the ripples
        vec2 cam = cameraPosition.xz;
        for (int i = 0; i < ${MAX_LAMPS}; i++) {
          vec4 L = lamps[i];
          if (L.w <= 0.0) continue;
          vec2 foot = L.xz;
          vec2 toCam = cam - foot;
          float len = length(toCam);
          vec2 dir = toCam / max(len, 0.001);
          vec2 d = p - foot;
          float along = dot(d, dir);
          float across = abs(dot(d, vec2(-dir.y, dir.x)));
          float reach = L.y * 2.2 + len * 0.1;
          float w = 0.4 + along * 0.03;
          float streak = exp(-across * across / (w * w)) * smoothstep(-1.0, 0.6, along) * (1.0 - smoothstep(reach * 0.35, reach, along));
          float broken = smoothstep(0.3, 0.75, noise(vec2(along * 1.4 - time * 0.9, across * 2.0 + float(i))));
          col += lampColor * L.w * streak * (0.3 + 1.3 * broken);
        }
        float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const geo = new THREE.PlaneGeometry(o.x1 - o.x0, o.z0 - o.z1, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((o.x0 + o.x1) / 2, WATER, (o.z0 + o.z1) / 2);
  mesh.userData.keep = true;

  const lamps: WaterLamp[] = [];
  return {
    mesh, uniforms,
    /** a light source that shows in the water once the wave has reached it */
    addLamp(p: THREE.Vector3, strength = 1) { lamps.push({ p: p.clone(), strength, d: 0 }); },
    update(t: number, cam: THREE.Vector3, fog: THREE.FogExp2 | null, sunset: number) {
      uniforms.time.value = t;
      uniforms.sunset.value = sunset;
      if (fog) { uniforms.fogColor.value.copy(fog.color); uniforms.fogDensity.value = fog.density; }
      const r = WAVE.radius.value, c = WAVE.center.value;
      for (const l of lamps) l.d = l.p.distanceToSquared(cam);
      lamps.sort((a, b) => a.d - b.d);
      const arr = uniforms.lamps.value;
      for (let i = 0; i < MAX_LAMPS; i++) {
        const l = lamps[i];
        if (!l) { arr[i].set(0, 0, 0, 0); continue; }
        const lit = waveLitAt(l.p.distanceTo(c), r);
        arr[i].set(l.p.x, Math.max(0.5, l.p.y - WATER), l.p.z, l.strength * lit * smoothstep(300 * 300, 80 * 80, l.d));
      }
    },
  };
}
