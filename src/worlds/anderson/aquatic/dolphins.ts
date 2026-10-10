import * as THREE from 'three';
import { charToon } from '../../../engine/Paint';
import { outline } from '../../../engine/Rig';
import { TAU, clamp } from '../../../engine/math';

/*
 * The Belafonte's albino scout dolphins: three white dolphins with little cameras strapped to their heads, leaping
 * alongside the Deep Search on the surface stretch. They keep pace a little ahead of the rider, each on its own
 * rhythm; `together()` makes them leap side by side, higher, for a few seconds.
 */

const WHITE = 0xf6f0f2, BELLY = 0xf8d8de, INK = 0x3a2a34;

function dolphin() {
  const g = new THREE.Group();
  const skin = charToon({ color: WHITE, rim: 0.5, shade: 0xb8b0d0 });
  const belly = charToon({ color: BELLY, rim: 0.3 });
  const dark = charToon({ color: 0x2a2a30, rim: 0.4 });
  // body along +z (nose forward)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), skin);
  body.scale.set(0.8, 0.82, 2.1);
  g.add(body);
  outline(body, INK, 1.4, 0.02);
  const under = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8, 0, TAU, Math.PI * 0.55, Math.PI * 0.45), belly);
  under.scale.set(0.76, 0.8, 1.9);
  under.position.y = -0.02;
  g.add(under);
  const beak = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 0.4, 10), skin);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.08, 1.15);
  g.add(beak);
  // the dorsal fin, the flippers and the flukes
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 8), skin);
  fin.scale.set(0.3, 1, 1);
  fin.rotation.x = -0.55;
  fin.position.set(0, 0.48, -0.1);
  g.add(fin);
  for (const s of [-1, 1]) {
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), skin);
    fl.scale.set(1.4, 0.18, 0.7);
    fl.position.set(s * 0.42, -0.22, 0.35);
    fl.rotation.set(0, s * 0.5, s * -0.5);
    g.add(fl);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.02, -1.0);
  g.add(tail);
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.07, 0.5, 8), skin);
  stock.rotation.x = Math.PI / 2;
  stock.position.z = -0.15;
  tail.add(stock);
  const flukes = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6), skin);
  flukes.scale.set(1.9, 0.15, 0.75);
  flukes.position.z = -0.45;
  tail.add(flukes);
  // the camera on a strap, and a dark eye on each side
  const cam = new THREE.Group();
  cam.position.set(0, 0.42, 0.55);
  cam.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.26), charToon({ color: 0xe8b81e, rim: 0.4 })));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), dark);
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.16;
  cam.add(lens);
  g.add(cam);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 4, 18), dark);
  strap.position.set(0, 0.04, 0.55);
  strap.scale.set(1, 1.02, 0.3);
  g.add(strap);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), dark);
    eye.position.set(s * 0.33, 0.04, 0.78);
    g.add(eye);
  }
  return { group: g, tail };
}

export class ScoutDolphins {
  readonly group = new THREE.Group();
  /** a point in the middle of the three, for the photo subject */
  readonly anchor = new THREE.Object3D();
  private readonly pods: Array<{ group: THREE.Group; tail: THREE.Group; x: number; ahead: number; phase: number; rate: number }> = [];
  private togetherT = 99;

  constructor() {
    const lanes: Array<[number, number, number, number]> = [[5.0, 9, 0.0, 0.62], [6.6, 12, 0.37, 0.55], [8.2, 10.5, 0.71, 0.68]];
    for (const [x, ahead, phase, rate] of lanes) {
      const d = dolphin();
      this.group.add(d.group);
      this.pods.push({ group: d.group, tail: d.tail, x, ahead, phase, rate });
    }
    this.group.add(this.anchor);
  }

  get leapingTogether() { return this.togetherT < 4; }
  together() { this.togetherT = 0; }

  /**
   * `riderZ` is the ride's position along z. Each dolphin's leap is a half sine above the water
   * and a dive below it; under the water it is hidden.
   */
  update(dt: number, t: number, riderZ: number) {
    this.togetherT += dt;
    const sync = clamp(Math.min(this.togetherT, 4 - this.togetherT) * 2, 0, 1);
    let ax = 0, ay = 0, az = 0;
    for (const p of this.pods) {
      // in a leap together they share one rhythm and jump higher
      const ph = THREE.MathUtils.lerp((t * p.rate + p.phase) % 1, (this.togetherT * 0.7) % 1, sync);
      const air = 0.42;
      const k = ph / air;
      const up = ph < air;
      const h = up ? Math.sin(k * Math.PI) * (1.3 + 0.9 * sync) - 0.25 : -1.6;
      const z = riderZ - p.ahead - Math.sin(t * 0.3 + p.phase * TAU) * 1.5;
      p.group.position.set(p.x, h, z);
      p.group.visible = up;
      // nose up on the way out, down on the way back in (they swim towards -z)
      const slope = up ? Math.cos(k * Math.PI) : 0;
      p.group.rotation.set(slope * 0.85, Math.PI, 0);
      p.tail.rotation.x = Math.sin(t * 9 + p.phase * 5) * 0.3;
      ax += p.x; ay += Math.max(h, 0); az += z;
    }
    this.anchor.position.set(ax / 3, ay / 3 + 0.4, az / 3);
  }
}
