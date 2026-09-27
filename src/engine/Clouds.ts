import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from './math';
import type { Placement } from './Builders';

/**
 * Painted-looking cumulus clouds.
 *
 * Each cloud is a cluster of smooth puffs with a flattened base. The shader lights it as one big soft volume:
 * normals are a blend of each puff's own normal and the direction from the cloud's centre. Sunlit tops go warm
 * white, the far side and the base take a cool sky-tinted shade, and edges catch a bright rim when the sun is
 * behind them. Colours are set every frame from the world's lighting via `update`.
 */
export class CumulusField {
  readonly group = new THREE.Group();
  readonly uniforms = {
    uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.5).normalize() },
    uLit: { value: new THREE.Color(1, 0.97, 0.92) },
    uShade: { value: new THREE.Color(0.55, 0.62, 0.78) },
    uRim: { value: new THREE.Color(1, 0.95, 0.85) },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.001 },
  };
  readonly material: THREE.ShaderMaterial;

  constructor(rng: Rng, placements: Placement[], opts: { variants?: number } = {}) {
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 cloudN;
        attribute float cloudH;
        varying vec3 vN; varying vec3 vWorld; varying float vH; varying float vFogDepth;
        void main() {
          mat4 m = modelMatrix;
          #ifdef USE_INSTANCING
            m = m * instanceMatrix;
          #endif
          vec4 wp = m * vec4(position, 1.0);
          vN = normalize(mat3(m) * normalize(normal * 0.5 + cloudN * 0.8));
          vH = cloudH;
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uRim;
        uniform vec3 uFogColor; uniform float uFogDensity;
        varying vec3 vN; varying vec3 vWorld; varying float vH; varying float vFogDepth;
        void main() {
          vec3 n = normalize(vN);
          float d = dot(n, uSunDir);
          // a wide soft terminator, then a gentle second step so the light side has painted bands
          float lit = smoothstep(-0.45, 0.55, d) * 0.8 + smoothstep(0.35, 0.8, d) * 0.2;
          vec3 col = mix(uShade, uLit, lit);
          // the flat underside sits in its own shadow
          col *= mix(0.78, 1.0, smoothstep(0.0, 0.45, vH));
          vec3 V = normalize(cameraPosition - vWorld);
          float rim = pow(1.0 - clamp(abs(dot(n, V)), 0.0, 1.0), 2.5);
          float back = pow(clamp(dot(-V, uSunDir), 0.0, 1.0), 2.0);
          col += uRim * rim * (0.12 + 0.6 * back);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const variants = opts.variants ?? 5;
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < variants; i++) geos.push(cumulusGeometry(rng, i % 2 === 0 ? 'tower' : 'bank'));
    // chunk along z so clouds far behind or ahead are culled
    const CHUNK = 500;
    const chunks = new Map<string, Placement[]>();
    placements.forEach((pl, i) => { const k = `${i % geos.length}_${Math.floor(pl.z / CHUNK)}`; if (!chunks.has(k)) chunks.set(k, []); chunks.get(k)!.push(pl); });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const [key, mine] of chunks) {
      const geo = geos[Number(key.split('_')[0])];
      const im = new THREE.InstancedMesh(geo, this.material, mine.length);
      mine.forEach((pl, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.rot);
        p.set(pl.x, pl.y, pl.z); s.setScalar(pl.scale);
        m.compose(p, q, s);
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }

  /** Pull colours from the current sky and sun. Call once per frame. */
  update(sky: { midColor: { value: THREE.Color }; bottomColor: { value: THREE.Color }; topColor: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color } }, fog: THREE.FogExp2, sunIntensity: number) {
    const u = this.uniforms;
    u.uSunDir.value.copy(sky.sunDir.value).normalize();
    const light = Math.min(1, sunIntensity / 2.2);
    // how bright the sky itself is: clouds at night are lit by the moon, not glowing
    const m = sky.midColor.value, skyLum = 0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b;
    const dayness = Math.min(1, Math.max(0, (skyLum - 0.01) / 0.2));
    // lit side: warm white tinted by the sun, dimmer when the sun is weak (rain, dusk) and at night
    u.uLit.value.setRGB(1, 1, 1).lerp(sky.sunColor.value, 0.35).multiplyScalar((0.55 + 0.4 * light) * (0.3 + 0.7 * dayness));
    // shade: the sky's own colour, a touch of lavender, darker
    u.uShade.value.copy(sky.midColor.value).lerp(sky.topColor.value, 0.25).lerp(new THREE.Color(0.62, 0.58, 0.72), 0.25).multiplyScalar(0.72 + 0.12 * light);
    u.uRim.value.copy(sky.sunColor.value).multiplyScalar(0.8 * light);
    u.uFogColor.value.copy(fog.color);
    u.uFogDensity.value = fog.density * 0.32;
  }
}

/** A cumulus made of merged puffs with a flat base. 'tower' is tall and heaped, 'bank' is long and low. */
export function cumulusGeometry(rng: Rng, kind: 'tower' | 'bank') {
  const puffs: THREE.BufferGeometry[] = [];
  const add = (x: number, y: number, z: number, r: number) => {
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate(x, y, z);
    puffs.push(g);
  };
  const len = kind === 'bank' ? rng.range(26, 36) : rng.range(16, 22);
  const dep = kind === 'bank' ? rng.range(10, 14) : rng.range(11, 15);
  // base layer
  const nBase = kind === 'bank' ? 14 : 10;
  for (let i = 0; i < nBase; i++) {
    const t = (i / (nBase - 1)) * 2 - 1;
    add(t * len * 0.5 + rng.range(-2, 2), rng.range(0.5, 2.5), rng.range(-dep, dep) * 0.35, rng.range(3.8, 5.8) * (1 - Math.abs(t) * 0.3));
  }
  // heaped middle
  const nMid = kind === 'bank' ? 10 : 12;
  for (let i = 0; i < nMid; i++) {
    const t = rng.range(-1, 1) * (kind === 'bank' ? 0.8 : 0.6);
    const h = (1 - Math.abs(t)) * (kind === 'bank' ? 6 : 10);
    add(t * len * 0.5, 3 + rng.range(0, h), rng.range(-dep, dep) * 0.25, rng.range(4, 6.5) * (1 - Math.abs(t) * 0.35));
  }
  // cauliflower top
  const nTop = kind === 'bank' ? 4 : 8;
  for (let i = 0; i < nTop; i++) {
    const a = rng.range(0, Math.PI * 2);
    add(Math.cos(a) * rng.range(0, len * 0.18), (kind === 'bank' ? 8 : 13) + rng.range(-1.5, 3.5), Math.sin(a) * rng.range(0, dep * 0.2), rng.range(3.2, 5.2));
  }
  const g = mergeGeometries(puffs.map((p) => { p.deleteAttribute('uv'); return p; }), false)!;
  // flatten the base, record height, and a centre-out normal for volume shading
  const pos = g.attributes.position as THREE.BufferAttribute;
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const baseY = 0.8;
  const cn = new Float32Array(pos.count * 3), ch = new Float32Array(pos.count);
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i);
    if (y < baseY) { y = baseY - (baseY - y) * 0.12; pos.setY(i, y); nrm.setXYZ(i, nrm.getX(i) * 0.3, -1, nrm.getZ(i) * 0.3); }
    const v = new THREE.Vector3((pos.getX(i) - ctr.x) / (size.x * 0.5), (y - ctr.y) / (size.y * 0.5) + 0.3, (pos.getZ(i) - ctr.z) / (size.z * 0.5)).normalize();
    cn.set([v.x, v.y, v.z], i * 3);
    ch[i] = (y - baseY) / Math.max(1, box.max.y - baseY);
  }
  g.setAttribute('cloudN', new THREE.BufferAttribute(cn, 3));
  g.setAttribute('cloudH', new THREE.BufferAttribute(ch, 1));
  g.computeBoundingSphere();
  return g;
}
