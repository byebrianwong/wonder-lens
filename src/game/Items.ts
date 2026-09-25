import * as THREE from 'three';
import type { BuiltWorld } from './types';

interface Projectile { mesh: THREE.Object3D; vel: THREE.Vector3; age: number; spin: THREE.Vector3; }

/** Simple ballistic throwables (acorns, boxes, pebbles) with a landing callback. */
export class Items {
  private list: Projectile[] = [];
  private world: BuiltWorld;
  private onLand: (pos: THREE.Vector3, water: boolean) => void;
  private gravity = -24;

  constructor(world: BuiltWorld, onLand: (pos: THREE.Vector3, water: boolean) => void) {
    this.world = world;
    this.onLand = onLand;
  }

  throwFrom(camera: THREE.PerspectiveCamera, speed = 30) {
    const mesh = this.world.makeProjectile();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const pos = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 1.2);
    pos.y -= 0.35;
    mesh.position.copy(pos);
    const vel = dir.clone().multiplyScalar(speed);
    vel.y += 5.5;
    this.world.scene.add(mesh);
    this.list.push({ mesh, vel, age: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      p.vel.y += this.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
      const g = this.world.groundHeight(p.mesh.position.x, p.mesh.position.z);
      const floor = Math.max(g, this.world.waterLevel);
      if (p.mesh.position.y <= floor + 0.15 || p.age > 6) {
        p.mesh.position.y = floor + 0.15;
        const water = this.world.waterLevel > g;
        this.onLand(p.mesh.position.clone(), water);
        this.world.scene.remove(p.mesh);
        this.list.splice(i, 1);
      }
    }
  }
  clear() {
    for (const p of this.list) this.world.scene.remove(p.mesh);
    this.list = [];
  }
}
