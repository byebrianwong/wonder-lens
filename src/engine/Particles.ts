import * as THREE from 'three';

/** Pool of soft puffs used for landings, sprouting trees and reaction bursts. */
export class Puffs {
  readonly group = new THREE.Group();
  private pool: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number; grow: number }[] = [];
  private mat: THREE.MeshBasicMaterial;

  constructor(color = 0xffffff, count = 48) {
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false });
    const geo = new THREE.SphereGeometry(0.35, 10, 8);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, this.mat.clone());
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, vel: new THREE.Vector3(), life: 0, max: 1, grow: 1 });
    }
  }
  burst(pos: THREE.Vector3, n = 10, color?: THREE.ColorRepresentation, spread = 2.5, up = 2.5, size = 1) {
    let spawned = 0;
    for (const p of this.pool) {
      if (p.life > 0) continue;
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.mesh.scale.setScalar(0.2 * size);
      p.vel.set((Math.random() - 0.5) * spread, Math.random() * up + 0.5, (Math.random() - 0.5) * spread);
      p.life = p.max = 0.6 + Math.random() * 0.5;
      p.grow = (1.5 + Math.random()) * size;
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      if (color !== undefined) m.color.set(color);
      m.opacity = 0.85;
      if (++spawned >= n) break;
    }
  }
  update(dt: number) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.vel.y -= 2.5 * dt;
      p.vel.multiplyScalar(1 - 2 * dt);
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = 1 - p.life / p.max;
      p.mesh.scale.setScalar((0.2 + t * p.grow) * 0.9);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t) * (1 - t);
    }
  }
}

/**
 * Drifting point particles (petals, fireflies, embers, snow, dust) inside a box that
 * follows an anchor. Cheap: one Points object.
 */
export class Drift {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private seeds: Float32Array;
  private count: number;
  private box: THREE.Vector3;
  private material: THREE.ShaderMaterial;
  private speed: THREE.Vector3;
  private wobble: number;
  intensity = 1;

  constructor(opts: { count: number; color: THREE.ColorRepresentation; size: number; box: THREE.Vector3; speed: THREE.Vector3; wobble?: number; opacity?: number; texture?: THREE.Texture; blending?: THREE.Blending }) {
    this.count = opts.count;
    this.box = opts.box;
    this.speed = opts.speed;
    this.wobble = opts.wobble ?? 1;
    this.positions = new Float32Array(this.count * 3);
    this.seeds = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * this.box.x;
      this.positions[i * 3 + 1] = (Math.random() - 0.5) * this.box.y;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
      this.seeds[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = driftMaterial(opts.color, opts.size, opts.opacity ?? 0.8, opts.texture ?? softDot(), opts.blending ?? THREE.NormalBlending);
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
  }
  update(dt: number, time: number, anchor: THREE.Vector3) {
    const p = this.positions;
    const hx = this.box.x / 2, hy = this.box.y / 2, hz = this.box.z / 2;
    for (let i = 0; i < this.count; i++) {
      const s = this.seeds[i];
      p[i * 3] += (this.speed.x + Math.sin(time * 0.7 + s) * this.wobble) * dt;
      p[i * 3 + 1] += (this.speed.y + Math.cos(time * 0.9 + s * 1.3) * this.wobble * 0.5) * dt;
      p[i * 3 + 2] += (this.speed.z + Math.sin(time * 0.5 + s * 0.7) * this.wobble) * dt;
      // wrap inside the box around the anchor
      if (p[i * 3] < -hx) p[i * 3] += this.box.x; else if (p[i * 3] > hx) p[i * 3] -= this.box.x;
      if (p[i * 3 + 1] < -hy) p[i * 3 + 1] += this.box.y; else if (p[i * 3 + 1] > hy) p[i * 3 + 1] -= this.box.y;
      if (p[i * 3 + 2] < -hz) p[i * 3 + 2] += this.box.z; else if (p[i * 3 + 2] > hz) p[i * 3 + 2] -= this.box.z;
    }
    this.points.position.copy(anchor);
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.material.uniforms.intensity.value = this.intensity;
    this.points.visible = this.intensity > 0.01;
  }
}

/** Soft sprite points that fade out when they get close to the lens and never grow past a few pixels. */
function driftMaterial(color: THREE.ColorRepresentation, size: number, opacity: number, map: THREE.Texture, blending: THREE.Blending) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, size: { value: size }, opacity: { value: opacity }, intensity: { value: 1 }, map: { value: map } },
    transparent: true, depthWrite: false, blending,
    vertexShader: /* glsl */ `
      uniform float size; varying float vFade;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = -mv.z;
        vFade = smoothstep(1.5, 6.0, dist);
        float px = size * 320.0 / max(dist, 0.5);
        gl_PointSize = min(px, 42.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform float opacity; uniform float intensity; uniform sampler2D map; varying float vFade;
      void main(){
        vec4 t = texture2D(map, gl_PointCoord);
        float a = t.a * opacity * intensity * vFade;
        if (a < 0.01) discard;
        gl_FragColor = vec4(color * t.rgb, a);
      }
    `,
  });
}

let _softDot: THREE.Texture | null = null;
export function softDot() {
  if (_softDot) return _softDot;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  _softDot = new THREE.CanvasTexture(c);
  return _softDot;
}

/** Rain streaks: vertical line segments falling around the anchor. */
export class Rain {
  readonly lines: THREE.LineSegments;
  private positions: Float32Array;
  private count: number;
  private box = new THREE.Vector3(60, 30, 60);
  intensity = 0;
  private material: THREE.LineBasicMaterial;
  constructor(count = 900) {
    this.count = count;
    this.positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) this.reset(i, true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({ color: 0xbfd4e6, transparent: true, opacity: 0.35, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
  }
  private reset(i: number, randomY = false) {
    const x = (Math.random() - 0.5) * this.box.x;
    const y = randomY ? (Math.random() - 0.5) * this.box.y : this.box.y / 2;
    const z = (Math.random() - 0.5) * this.box.z;
    const len = 0.6 + Math.random() * 0.9;
    this.positions.set([x, y, z, x + 0.08, y - len, z], i * 6);
  }
  update(dt: number, anchor: THREE.Vector3) {
    this.lines.visible = this.intensity > 0.02;
    if (!this.lines.visible) return;
    const p = this.positions;
    const fall = 26 * dt;
    for (let i = 0; i < this.count; i++) {
      p[i * 6 + 1] -= fall; p[i * 6 + 4] -= fall;
      if (p[i * 6 + 4] < -this.box.y / 2) this.reset(i);
    }
    this.lines.position.copy(anchor);
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.material.opacity = 0.4 * this.intensity;
  }
}
