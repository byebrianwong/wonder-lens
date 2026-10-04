import * as THREE from 'three';
import { CumulusField } from '../../../engine/Clouds';
import type { Placement } from '../../../engine/Builders';
import { Rng, TAU } from '../../../engine/math';
import { haloTexture, moonTexture } from './textures';

/*
 * The night sky over the treetop: a sea of cloud round the crown, a few cumulus heaped on it, and a huge
 * moon. Also `worldLight`, which finds the world's sky dome and sun in the scene so these can follow the
 * lighting.
 */

export interface WorldLight {
  sky: { topColor: { value: THREE.Color }; midColor: { value: THREE.Color }; bottomColor: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color }; moonDir?: { value: THREE.Vector3 } } | null;
  sun: THREE.DirectionalLight | null;
  fog: THREE.FogExp2 | null;
}

/** The world's sky dome uniforms (found by their names), its sun and its fog. */
export function worldLight(scene: THREE.Scene): WorldLight {
  let sky: WorldLight['sky'] = null, sun: THREE.DirectionalLight | null = null;
  for (const o of scene.children) {
    const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (m && (m as THREE.ShaderMaterial).uniforms?.starAmount && m.uniforms.midColor) sky = m.uniforms as unknown as WorldLight['sky'];
    if ((o as THREE.DirectionalLight).isDirectionalLight) sun = o as THREE.DirectionalLight;
  }
  return { sky, sun, fog: scene.fog instanceof THREE.FogExp2 ? scene.fog : null };
}

const FLOOR_VERT = /* glsl */ `
  varying vec3 vW; varying float vDepth;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const FLOOR_FRAG = /* glsl */ `
  uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uFog; uniform float uFogDensity; uniform float uOpacity; uniform float uTime;
  uniform vec3 uMoon; uniform vec3 uHoleC; uniform vec2 uHoleR;
  varying vec3 vW; varying float vDepth;
  float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y); }
  float billow(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  void main() {
    vec2 p = vW.xz * 0.018 + vec2(uTime * 0.004, uTime * 0.002);
    float h = billow(p);
    float hx = billow(p + vec2(0.06, 0.0)), hz = billow(p + vec2(0.0, 0.06));
    // lumpy cloud tops lit by the moon: a normal from the slope of the billows
    vec3 n = normalize(vec3((h - hx) * 9.0, 1.0, (h - hz) * 9.0));
    float lit = clamp(dot(n, normalize(uMoon)) * 0.6 + 0.45, 0.0, 1.0);
    vec3 col = mix(uShade, uLit, lit) * mix(0.72, 1.12, smoothstep(0.3, 0.75, h));
    if (!gl_FrontFacing) col = uShade * 0.75;
    // thin places let the dark land show through; a hole where the crown rises out of the cloud
    float a = smoothstep(0.26, 0.42, h);
    vec2 hd = (vW.xz - uHoleC.xz) / uHoleR;
    a *= smoothstep(0.9, 1.08, length(hd) + (h - 0.5) * 0.25);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
    col = mix(col, uFog, clamp(fog, 0.0, 1.0));
    a *= uOpacity * (1.0 - smoothstep(900.0, 1200.0, length(vW.xz - uHoleC.xz)));
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export interface CloudSea {
  group: THREE.Group;
  /** the flat sea of cloud */
  floor: THREE.Mesh;
  cumulus: CumulusField;
  /** 0..1, how much of the sea of cloud is there */
  opacity: number;
  update(t: number, light: WorldLight): void;
}

/**
 * A sea of cloud at height `y`, round a hole (the crown rises through it), with cumulus heaped on it.
 * `avoid` drops cumulus that would hide the moon from the garden or sit in the path of the dive.
 */
export function buildCloudSea(o: { y: number; hole: THREE.Vector3; holeR: [number, number]; avoid: (p: THREE.Vector3, r: number) => boolean }): CloudSea {
  const group = new THREE.Group();
  const uniforms = {
    uLit: { value: new THREE.Color(0.62, 0.68, 0.82) }, uShade: { value: new THREE.Color(0.2, 0.24, 0.36) }, uFog: { value: new THREE.Color() },
    uFogDensity: { value: 0.002 }, uOpacity: { value: 0 }, uTime: { value: 0 }, uMoon: { value: new THREE.Vector3(-0.38, 0.42, -0.82) },
    uHoleC: { value: o.hole.clone() }, uHoleR: { value: new THREE.Vector2(o.holeR[0], o.holeR[1]) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400).rotateX(-Math.PI / 2), mat);
  floor.position.set(o.hole.x, o.y, o.hole.z);
  floor.frustumCulled = false;
  group.add(floor);

  // cumulus heaped on the sea: some near the crown, a ring of big banks further off
  const rng = new Rng(7070);
  const pl: Placement[] = [];
  const tryAdd = (r0: number, r1: number, s0: number, s1: number, n: number) => {
    let tries = 0;
    while (n > 0 && tries++ < n * 30) {
      const a = rng.range(0, TAU), r = rng.range(r0, r1);
      const scale = rng.range(s0, s1);
      const p = new THREE.Vector3(o.hole.x + Math.cos(a) * r * (o.holeR[0] / o.holeR[1]), o.y - 9 * scale, o.hole.z + Math.sin(a) * r);
      if (o.avoid(p.clone().add(new THREE.Vector3(0, 9 * scale, 0)), 16 * scale)) continue;
      if (pl.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 26 * (q.scale + scale))) continue;
      pl.push({ x: p.x, y: p.y, z: p.z, scale, rot: rng.range(0, TAU) });
      n--;
    }
  };
  tryAdd(125, 260, 1.0, 1.6, 16);
  tryAdd(300, 700, 2.2, 3.6, 22);
  const cumulus = new CumulusField(rng, pl, { variants: 4 });
  group.add(cumulus.group);

  const tint = new THREE.Color(0.78, 0.84, 1.0);
  const sea: CloudSea = {
    group, floor, cumulus,
    get opacity() { return uniforms.uOpacity.value; },
    set opacity(v: number) { uniforms.uOpacity.value = v; floor.visible = v > 0.005; },
    update(t, light) {
      uniforms.uTime.value = t;
      if (light.sky && light.fog && light.sun) {
        cumulus.update(light.sky, light.fog, light.sun.intensity);
        // moonlit: silver on top, deep blue in the shade
        const cu = cumulus.uniforms;
        cu.uLit.value.lerp(tint, 0.4).multiplyScalar(1.25);
        uniforms.uLit.value.copy(cu.uLit.value).multiplyScalar(1.05);
        uniforms.uShade.value.copy(cu.uShade.value).multiplyScalar(0.95);
        uniforms.uFog.value.copy(light.fog.color);
        uniforms.uFogDensity.value = light.fog.density * 0.6;
        uniforms.uMoon.value.copy(light.sky.sunDir.value);
      }
    },
  };
  sea.opacity = 0;
  return sea;
}

/**
 * A huge moon: a painted disc with a soft halo, kept far away in the moon's direction so it never gets
 * nearer. It is drawn behind everything near and in front of the sky; `opacity` fades it.
 */
export function buildMoon(radiusDeg: number) {
  const group = new THREE.Group();
  const D = 1100;
  const size = 2 * D * Math.tan(THREE.MathUtils.degToRad(radiusDeg));
  const discMat = new THREE.MeshBasicMaterial({ map: moonTexture(), color: new THREE.Color(1.25, 1.22, 1.1), transparent: true, depthWrite: false, fog: false });
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTexture(), color: new THREE.Color(0.55, 0.62, 0.8), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(size, size), discMat);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(size * 4.2, size * 4.2), haloMat);
  halo.position.z = -1;
  group.add(halo, disc);
  group.renderOrder = -900;
  disc.renderOrder = -899; halo.renderOrder = -900;
  const dir = new THREE.Vector3();
  return {
    group,
    set opacity(v: number) { discMat.opacity = v; haloMat.opacity = v * 0.8; group.visible = v > 0.005; },
    /** place it from the camera along the moon's direction */
    update(camPos: THREE.Vector3, moonDir: THREE.Vector3) {
      dir.copy(moonDir).normalize();
      group.position.copy(camPos).addScaledVector(dir, D);
      group.lookAt(camPos);
    },
  };
}
