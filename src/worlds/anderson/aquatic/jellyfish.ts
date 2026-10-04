import * as THREE from 'three';
import { Rng, TAU, damp } from '../../../engine/math';
import { StopMotion } from '../stopmotion';
import { SEA } from './shaders';

/*
 * The electric jellyfish: glowing bells in candy colours drifting over the drop-off, trailing long ribbons. They
 * pulse on twos. Whistle and a wave of light runs out through them from the sub: they glow brighter and brighter.
 * Two instanced meshes (bells and tentacles) with additive, fogged glow shaders.
 */

const FOG = /* glsl */ `float aqFog(float d, float k) { return clamp(1.0 - exp(-k * k * d * d), 0.0, 1.0); }`;

function bellGeometry() {
  const g = new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI * 0.62);
  const p = g.attributes.position as THREE.BufferAttribute;
  const k = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // a frilled rim: scallops round the bottom edge
    const a = Math.atan2(z, x), rim = Math.max(0, 0.35 - y) / 0.7;
    const r = 1 + Math.sin(a * 8) * 0.08 * rim;
    p.setXYZ(i, x * r, y * 0.8, z * r);
    k[i] = y;
  }
  g.setAttribute('aY', new THREE.BufferAttribute(k, 1));
  g.computeVertexNormals();
  return g;
}

/** Eight long ribbons and four frilly arms hanging from the bell, as thin strips (v runs down them). */
function tentacleGeometry(rng: Rng) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let base = 0;
  const strip = (x: number, z: number, len: number, w: number, seg: number) => {
    for (let i = 0; i <= seg; i++) {
      const v = i / seg, y = -v * len;
      pos.push(x - w, y, z, x + w, y, z);
      uv.push(0, v, 1, v);
      if (i < seg) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    base += (seg + 1) * 2;
  };
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; strip(Math.cos(a) * 0.75, Math.sin(a) * 0.75, rng.range(2.6, 4.2), 0.03, 10); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; strip(Math.cos(a) * 0.25, Math.sin(a) * 0.25, rng.range(1.4, 2.0), 0.13, 8); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class Jellyfish {
  readonly group = new THREE.Group();
  readonly anchor = new THREE.Object3D();
  /** how lit up they are (the set raises it in the dark) */
  level = 1;
  private bells: THREE.InstancedMesh;
  private tents: THREE.InstancedMesh;
  private jf: Array<{ p: THREE.Vector3; ph: number; s: number; c: THREE.Color; drift: number }> = [];
  private sm = new StopMotion(12, 1401);
  private glowT = 99;
  private from = new THREE.Vector3();
  readonly uniforms = { uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.03 }, uBoost: { value: 1 } };

  constructor(n: number, places: THREE.Vector3[]) {
    const rng = new Rng(1403);
    const bellMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aY; varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vFogD;
        void main() {
          vY = aY;
          vCol = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
            vCol = instanceColor;
          #endif
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vV = normalize(cameraPosition - w.xyz);
          vec4 mv = viewMatrix * w;
          vFogD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor; uniform float uFogDensity; uniform float uBoost;
        varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vFogD;
        ${FOG}
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          // the bell glows at its edge and its crown; four bright loops inside it
          float crown = smoothstep(0.55, 1.0, vY);
          float a = (0.12 + rim * 0.75 + crown * 0.35) * uBoost;
          vec3 col = vCol * a * 1.6 + vec3(1.0) * crown * 0.15 * uBoost;
          col *= 1.0 - aqFog(vFogD, uFogDensity);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const tentMat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, aqStep: SEA.step },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float aqStep; varying vec2 vUv; varying vec3 vCol; varying float vFogD;
        void main() {
          vUv = uv;
          vCol = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
            vCol = instanceColor;
          #endif
          vec3 p = position;
          float ph = dot(instanceMatrix[3].xyz, vec3(0.7, 0.3, 0.9));
          float v = uv.y;
          p.x += sin(aqStep * 1.7 + ph + v * 4.0 + p.z * 3.0) * 0.45 * v * v;
          p.z += cos(aqStep * 1.3 + ph * 1.3 + v * 3.0 + p.x * 3.0) * 0.4 * v * v;
          vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
          vFogD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor; uniform float uFogDensity; uniform float uBoost;
        varying vec2 vUv; varying vec3 vCol; varying float vFogD;
        ${FOG}
        void main() {
          float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float a = across * (1.0 - vUv.y) * 0.55 * uBoost;
          vec3 col = vCol * a * (1.0 - aqFog(vFogD, uFogDensity));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.bells = new THREE.InstancedMesh(bellGeometry(), bellMat, n);
    this.tents = new THREE.InstancedMesh(tentacleGeometry(rng), tentMat, n);
    for (const m of [this.bells, this.tents]) { m.frustumCulled = false; m.renderOrder = 6; this.group.add(m); }
    const cols = [0x6ff4ff, 0xff7ad8, 0xb48aff, 0x9cff8a, 0xffb05a, 0x7aa8ff];
    for (let i = 0; i < n; i++) {
      const p = places[i % places.length].clone();
      this.jf.push({ p, ph: rng.range(0, TAU), s: rng.range(0.55, 1.15), c: new THREE.Color(cols[i % cols.length]), drift: rng.range(0.15, 0.35) });
    }
    this.anchor.position.copy(places[0]);
    this.write(0, new THREE.Vector3());
  }

  /** a wave of light out through the jellies from a point */
  glow(from: THREE.Vector3) { this.glowT = 0; this.from.copy(from); }
  get glowing() { return this.glowT < 4; }

  update(dt: number, cam: THREE.Vector3, fog: THREE.FogExp2 | null) {
    this.glowT += dt;
    if (fog) { this.uniforms.uFogColor.value.copy(fog.color); this.uniforms.uFogDensity.value = fog.density; }
    this.uniforms.uBoost.value = damp(this.uniforms.uBoost.value, this.level, 2, dt);
    // the anchor sits among the jellies nearest the camera
    let best = 1e9;
    for (const j of this.jf) { const d = j.p.distanceToSquared(cam); if (d < best && j.p.z < cam.z) { best = d; this.anchor.position.copy(j.p); } }
    if (this.sm.tick(dt)) this.write(this.sm.t, cam);
  }

  private write(t: number, _cam: THREE.Vector3) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const col = new THREE.Color();
    this.jf.forEach((j, i) => {
      // a slow pulse: the bell squeezes and the jelly rises a little with each beat
      const beat = 0.5 + 0.5 * Math.sin(t * 2.0 + j.ph);
      p.set(j.p.x + Math.sin(t * 0.21 + j.ph) * 1.2, j.p.y + Math.sin(t * 0.5 + j.ph) * 0.6 + beat * 0.1, j.p.z + Math.cos(t * 0.17 + j.ph) * 1.2);
      e.set(Math.sin(t * 0.4 + j.ph) * 0.15, j.ph, Math.cos(t * 0.33 + j.ph) * 0.15);
      q.setFromEuler(e);
      s.set(j.s * (1 + beat * 0.12), j.s * (1 - beat * 0.16), j.s * (1 + beat * 0.12));
      m4.compose(p, q, s);
      this.bells.setMatrixAt(i, m4);
      this.tents.setMatrixAt(i, m4);
      // the wave of light from the whistle spreads at 9 units a second and fades
      const d = p.distanceTo(this.from);
      const wave = Math.exp(-Math.pow((this.glowT * 9 - d) / 4, 2)) * Math.max(0, 1 - this.glowT / 5);
      const after = this.glowT < 5 ? 0.6 * Math.max(0, 1 - this.glowT / 5) * (d < this.glowT * 9 ? 1 : 0) : 0;
      col.copy(j.c).multiplyScalar(0.75 + 0.25 * beat + wave * 2.2 + after);
      this.bells.setColorAt(i, col);
      this.tents.setColorAt(i, col);
    });
    for (const m of [this.bells, this.tents]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}
