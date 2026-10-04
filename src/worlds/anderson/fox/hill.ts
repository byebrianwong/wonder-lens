import * as THREE from 'three';
import { Rng, fbm, smoothstep, TAU } from '../../../engine/math';
import type { Road } from '../layout';
import { Batch, at, crossWall, rootTube, V3 } from './build';
import type { Mats } from './mats';
import { Y, Z } from './plan';
import { moonDisc, nightBackdrop } from './textures';

/*
 * The top of the hill at night. The tunnel comes out of the hillside in a cutting; ahead the hilltop runs
 * on to a far ridge, where the black wolf stands against a huge painted moon. Beyond, a painted panorama of
 * hills with the three farms' lights. Two of the farmers' excavators flank the track, their lamps glaring.
 */

export const PORTAL = Z.climb.z1 + 0.5;
export const RIDGE = { z: -1212, top: 9.2 };

export interface Hill {
  statics: THREE.Group;
  /** the ground height, for thrown items and placing things */
  ground(x: number, z: number): number;
  spots: { wolf: { pos: THREE.Vector3; yaw: number }; diggers: Array<{ pos: THREE.Vector3; yaw: number }> };
}

export function buildHill(road: Road, rng: Rng, m: Mats): Hill {
  const b = new Batch();
  const ground = (x: number, z: number) => {
    const ax = Math.abs(x);
    const p = road.at(Math.min(Z.hill.z0 + 6, Math.max(z, -1260)));
    // the hilltop: gentle swells that fall away to the sides
    let y = Y.hill - 0.06 - 0.0012 * x * x * smoothstep(4, 30, ax) + (fbm(x * 0.045 + 3, z * 0.045, 3) - 0.5) * 3 * smoothstep(4, 20, ax);
    // the hillside the tunnel comes out of
    y += smoothstep(-1126, -1108, z) * 15 * (0.6 + 0.4 * smoothstep(0, 30, ax));
    // the far ridge, cut through where the rails go on
    const ridge = RIDGE.top - Y.hill;
    y += ridge * Math.exp(-(((z - RIDGE.z) / 11) ** 2)) * (1 - smoothstep(40, 110, ax)) * smoothstep(3.5, 8, ax);
    // the cutting the train runs in near the portal, and the bed under the rails
    const bed = smoothstep(5.5, 2.8, ax);
    y = y + (p.y - 0.08 - y) * bed;
    return y;
  };
  // ---------------- terrain: a fine grid near the track, coarse further out ----------------
  {
    const xs: number[] = [];
    for (let x = -160; x < -22; x += 5) xs.push(x);
    for (let x = -22; x < 22; x += 1.1) xs.push(x);
    for (let x = 22; x <= 160; x += 5) xs.push(x);
    const zs: number[] = [];
    for (let z = Z.climb.z1 + 14; z > -1262; z -= 2.2) zs.push(z);
    const pos: number[] = [];
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
      const P = (a: number, c: number) => [xs[a], ground(xs[a], zs[c]), zs[c]];
      const A = P(i, j), B = P(i + 1, j), C = P(i, j + 1), D = P(i + 1, j + 1);
      // the tunnel's cutting: no ground over the hole itself
      if (zs[j] > PORTAL - 0.5 && Math.abs(xs[i]) < 4.2) continue;
      pos.push(...A, ...C, ...B, ...B, ...C, ...D);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    if ((g.attributes.normal as THREE.BufferAttribute).getY(0) < 0) {
      const pp = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i += 3) { const x = pp.getX(i + 1), y = pp.getY(i + 1), z = pp.getZ(i + 1); pp.setXYZ(i + 1, pp.getX(i + 2), pp.getY(i + 2), pp.getZ(i + 2)); pp.setXYZ(i + 2, x, y, z); }
      g.computeVertexNormals();
    }
    b.add(g, m.grass, 4);
  }
  // the portal: an earth face with the tunnel's round mouth, a timber frame, roots over it
  const pp = road.at(PORTAL);
  b.add(crossWall(PORTAL, -12, 12, pp.y - 1, pp.y + 16, -1, [{ x: 0, y: pp.y + 2.5, r: 3.5, flatBottom: pp.y - 0.3 }]), m.earth, 8);
  b.add(at(new THREE.TorusGeometry(3.6, 0.28, 6, 28, Math.PI + 0.3).rotateZ(-0.15), 0, pp.y + 2.5, PORTAL - 0.1), m.woodDark);
  for (let k = 0; k < 7; k++) { const x = rng.range(-5, 5); b.add(rootTube([V3(x, pp.y + 7, PORTAL - 0.2), V3(x + rng.range(-0.4, 0.4), pp.y + 6.3, PORTAL - 0.6), V3(x + rng.range(-0.6, 0.6), pp.y + rng.range(5, 6), PORTAL - 0.8)], 0.08, 0.02, 6), m.bark, 3); }

  // tall grass tufts near the track: thin dark blades, one instanced mesh
  let tufts: THREE.InstancedMesh;
  {
    const blade = new THREE.ConeGeometry(0.06, 1, 4).translate(0, 0.5, 0);
    const n = 900;
    const im = new THREE.InstancedMesh(blade, new THREE.MeshLambertMaterial({ color: 0x3a5034, emissive: 0x0a140a }), n);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const z = rng.range(PORTAL - 4, -1236), x = rng.sign() * rng.range(2.8, 26);
      const h = rng.range(0.5, 1.4);
      e.set(rng.range(-0.3, 0.3), rng.range(0, TAU), rng.range(-0.3, 0.3));
      mtx.compose(V3(x, ground(x, z) - 0.05, z), q.setFromEuler(e), V3(1, h, 1));
      im.setMatrixAt(i, mtx);
      im.setColorAt(i, c.setHSL(0.28 + rng.range(-0.03, 0.03), 0.35, rng.range(0.16, 0.3)));
    }
    im.instanceMatrix.needsUpdate = true; im.instanceColor!.needsUpdate = true; im.computeBoundingSphere();
    tufts = im;
  }
  // two bare trees on the ridge, a line of fence posts
  for (const tx of [-26, 34]) {
    const ty = ground(tx, RIDGE.z) - 0.2, tz = RIDGE.z - 2;
    b.add(rootTube([V3(tx, ty, tz), V3(tx + 0.3, ty + 4, tz), V3(tx - 0.2, ty + 7, tz)], 0.45, 0.15, 10), m.woodDark);
    for (let k = 0; k < 6; k++) {
      const a = rng.range(0, TAU), h = ty + rng.range(3.5, 6.5);
      b.add(rootTube([V3(tx, h, tz), V3(tx + Math.cos(a) * 1.6, h + 1.2, tz + Math.sin(a) * 1.2), V3(tx + Math.cos(a) * 3, h + rng.range(1.5, 3), tz + Math.sin(a) * 2)], 0.14, 0.03, 6), m.woodDark);
    }
  }
  for (let x = -60; x <= 60; x += 4.5) {
    if (Math.abs(x) < 9) continue;
    const z = RIDGE.z + 3.5, y = ground(x, z);
    b.add(at(new THREE.BoxGeometry(0.16, 1.5, 0.16), x, y + 0.6, z, 0, 0, rng.range(-0.08, 0.08)), m.woodDark);
  }
  b.castShadow(m.woodDark);

  // ---------------- the painted panorama and the moon ----------------
  const pano = new THREE.Mesh(
    new THREE.CylinderGeometry(175, 175, 60, 48, 1, true, Math.PI - 1.5, 3.0),
    new THREE.MeshBasicMaterial({ map: nightBackdrop(), transparent: true, fog: false, side: THREE.BackSide, depthWrite: false }),
  );
  pano.position.set(0, 18, -1145);
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: moonDisc(), transparent: true, fog: false, depthWrite: false, color: new THREE.Color(1.25, 1.2, 1.05) }));
  moon.position.set(8, 23, -1302);
  moon.renderOrder = -1; pano.renderOrder = -2;
  const statics = b.build();
  statics.add(tufts, pano, moon);
  return {
    statics, ground,
    spots: {
      wolf: { pos: V3(8, ground(8, RIDGE.z), RIDGE.z), yaw: -Math.PI / 2 },
      diggers: [
        { pos: V3(-17, ground(-17, -1146), -1146), yaw: Math.PI / 2 + 0.35 },
        { pos: V3(17, ground(17, -1152), -1152), yaw: -Math.PI / 2 - 0.35 },
      ],
    },
  };
}
