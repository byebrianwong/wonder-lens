import * as THREE from 'three';
import { clamp } from '../engine/math';
import { softDot } from '../engine/Particles';
import type { BuiltWorld } from './types';
import type { Subject } from './Subject';

/** Where a throw is aimed. The game picks it from whatever is under the reticle. */
export interface ThrowTarget {
  point: THREE.Vector3;
  /**
   * - body: a character's middle. The item flies through the point, usually hitting them, and falls on.
   * - floor: ground, water, a deck or a roof. The item lands on the point.
   * - wall: the side of a building. The item knocks against the point and drops.
   */
  kind: 'body' | 'floor' | 'wall';
  /** outward surface normal, for walls */
  normal?: THREE.Vector3;
}

export type Surface = 'ground' | 'water' | 'wall';

export const GRAVITY = 24;
/** furthest point a throw is aimed at; past that the item flies through the point at this range and falls on */
export const THROW_RANGE = 80;

/** Seconds a throw takes to reach something `dist` away: a quick, low toss up close and a higher lob far off. */
export function flightTime(dist: number) { return clamp(0.35 + dist * 0.017, 0.35, 1.6); }

interface Projectile {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  age: number;
  spin: THREE.Vector3;
  prev: THREE.Vector3;
  target: ThrowTarget | null;
  /** seconds until it reaches its target */
  arrive: number;
  /** it has already struck something: now it only falls, and hits nothing else */
  spent: boolean;
}

const seg = new THREE.Vector3();
const toC = new THREE.Vector3();
const closest = new THREE.Vector3();
const center = new THREE.Vector3();
const normal = new THREE.Vector3();

/**
 * Thrown items (acorns, boxes, stones). A throw at a target follows the arc that reaches it; a throw at
 * nothing in particular is a plain lob. Items can strike a character in mid-air, and report where they land.
 */
export class Items {
  private list: Projectile[] = [];
  private world: BuiltWorld;
  private trail = new Trail();
  /** the item came down; `spent` items already hit something and land quietly */
  onLand: (pos: THREE.Vector3, surface: Surface, spent: boolean) => void;
  /** the item struck a subject in mid-air; return true if the subject reacted */
  onHit: (subject: Subject, pos: THREE.Vector3) => boolean;

  constructor(world: BuiltWorld, onLand: Items['onLand'], onHit: Items['onHit']) {
    this.world = world;
    this.onLand = onLand;
    this.onHit = onHit;
    world.scene.add(this.trail.points);
  }

  throwFrom(camera: THREE.PerspectiveCamera, target: ThrowTarget | null = null) {
    const mesh = this.world.makeProjectile();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const pos = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 1.2);
    pos.y -= 0.35;
    mesh.position.copy(pos);
    let vel: THREE.Vector3;
    let arrive = -1;
    if (target) {
      // the launch velocity whose arc passes through the target after `arrive` seconds
      arrive = flightTime(pos.distanceTo(target.point));
      vel = target.point.clone().sub(pos).divideScalar(arrive);
      vel.y += 0.5 * GRAVITY * arrive;
    } else {
      vel = dir.clone().multiplyScalar(30);
      vel.y += 5.5;
    }
    this.world.scene.add(mesh);
    this.list.push({ mesh, vel, age: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), prev: pos.clone(), target, arrive, spent: false });
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const m = p.mesh.position;
      p.prev.copy(m);
      p.age += dt;
      p.vel.y -= GRAVITY * dt;
      m.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
      if (!p.spent) {
        this.trail.emit(m);
        const hit = this.hitTest(p);
        if (hit === 'swallowed') { this.remove(i); continue; }
      }
      const t = p.target;
      if (t && !p.spent && t.kind !== 'body' && p.age >= p.arrive) {
        m.copy(t.point);
        if (t.kind === 'floor') { this.land(i, this.surfaceAt(m)); continue; }
        // knock against the wall and drop down it
        this.onLand(m.clone(), 'wall', false);
        const n = t.normal ?? normal.set(0, 1, 0);
        m.addScaledVector(n, 0.3);
        p.vel.copy(n).multiplyScalar(2.5);
        p.vel.y += 1.5;
        p.spent = true;
      }
      const g = this.world.groundHeight(m.x, m.z);
      const floor = Math.max(g, this.world.waterLevel);
      if (m.y <= floor + 0.15 || p.age > 6) {
        m.y = Math.max(m.y, floor + 0.15);
        this.land(i, this.world.waterLevel > g ? 'water' : 'ground');
      }
    }
    this.trail.update(dt);
  }

  /** Did the item pass through a character since the last frame? Bounces it off, or swallows it. */
  private hitTest(p: Projectile): 'none' | 'bounced' | 'swallowed' {
    const m = p.mesh.position;
    seg.subVectors(m, p.prev);
    const len2 = seg.lengthSq();
    if (len2 < 1e-8) return 'none';
    for (const s of this.world.subjects) {
      if (!s.active || s.crowd || !s.reactsToItems) continue;
      s.center(center);
      const r = Math.max(0.6, s.radius * 0.9) + 0.2;
      const k = clamp(toC.subVectors(center, p.prev).dot(seg) / len2, 0, 1);
      closest.copy(p.prev).addScaledVector(seg, k);
      if (closest.distanceToSquared(center) > r * r) continue;
      const reacted = this.onHit(s, closest.clone());
      if (reacted && s.swallows) return 'swallowed';
      // bounce off the surface of the character's sphere, losing most of the speed
      normal.subVectors(closest, center);
      if (normal.lengthSq() < 1e-6) normal.set(0, 1, 0); else normal.normalize();
      m.copy(center).addScaledVector(normal, r);
      const vn = p.vel.dot(normal);
      if (vn < 0) p.vel.addScaledVector(normal, -1.6 * vn);
      p.vel.multiplyScalar(0.35);
      p.vel.y = Math.max(p.vel.y, 2.5);
      p.spent = true;
      return 'bounced';
    }
    return 'none';
  }

  private surfaceAt(pos: THREE.Vector3): Surface {
    const w = this.world;
    return w.waterLevel > w.groundHeight(pos.x, pos.z) && pos.y <= w.waterLevel + 0.3 ? 'water' : 'ground';
  }

  private land(i: number, surface: Surface) {
    const p = this.list[i];
    this.onLand(p.mesh.position.clone(), surface, p.spent);
    this.remove(i);
  }

  private remove(i: number) {
    this.world.scene.remove(this.list[i].mesh);
    this.list.splice(i, 1);
  }

  clear() {
    for (const p of this.list) this.world.scene.remove(p.mesh);
    this.list = [];
  }
}

/** Soft dots left behind a thrown item that fade in a moment, so its arc reads against busy scenery. */
class Trail {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private age: Float32Array;
  private next = 0;
  private alive = false;
  private static readonly N = 160;
  private static readonly LIFE = 0.32;

  constructor() {
    const N = Trail.N;
    this.pos = new Float32Array(N * 3);
    this.age = new Float32Array(N).fill(Trail.LIFE);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('age', new THREE.BufferAttribute(this.age, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, life: { value: Trail.LIFE }, color: { value: new THREE.Color(0xfff6e0) } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float age; uniform float life; varying float vA;
        void main(){
          vA = 1.0 - clamp(age / life, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(0.26 * 320.0 / max(-mv.z, 0.5) * (0.4 + 0.6 * vA), 26.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 color; varying float vA;
        void main(){
          float a = texture2D(map, gl_PointCoord).a * vA * 0.75;
          if (a < 0.01) discard;
          gl_FragColor = vec4(color, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  emit(p: THREE.Vector3) {
    const i = this.next;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.age[i] = 0;
    this.next = (i + 1) % Trail.N;
    this.alive = true;
  }

  update(dt: number) {
    if (!this.alive) return;
    let any = false;
    for (let i = 0; i < Trail.N; i++) {
      if (this.age[i] >= Trail.LIFE) continue;
      this.age[i] += dt;
      any = true;
    }
    this.alive = any;
    this.points.visible = any;
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.age.needsUpdate = true;
  }
}
