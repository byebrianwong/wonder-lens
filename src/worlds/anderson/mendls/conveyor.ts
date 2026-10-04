import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon } from '../../../engine/Paint';
import { ribbon, wallStrip } from '../common';
import { panels } from '../textures';
import { beltTex } from './textures';

/**
 * A bakery conveyor at counter height: a canvas belt over rollers between two painted side frames with a
 * guide rail along the top, on square legs down to the floor. The belt's texture can be moved along so the
 * belt runs. Built along any curve whose points are on the belt's surface.
 */

export interface Conveyor {
  group: THREE.Group;
  belt: THREE.Mesh;
  /** move the belt's surface forward by `dist` units (the texture's tile is 10 units long) */
  run(dist: number): void;
}

const matCache = new Map<string, THREE.Material>();
const cached = (k: string, make: () => THREE.Material) => { let m = matCache.get(k); if (!m) { m = make(); matCache.set(k, m); } return m; };

export function conveyorMaterials(frame: number) {
  return {
    frame: cached(`frame${frame}`, () => new THREE.MeshLambertMaterial({ map: panels(frame, 61) })),
    rail: cached('rail', () => charToon({ color: 0xe8e4dc, rim: 0.6, shade: 0x9aa0b8, emissive: new THREE.Color(0x202020) })),
    dark: cached('dark', () => charToon({ color: 0x5a5560, rim: 0.2 })),
    roller: cached('roller', () => charToon({ color: 0xd8d4cc, rim: 0.5, shade: 0x9098b0 })),
  };
}

export function buildConveyor(curve: THREE.Curve<THREE.Vector3>, o: { width: number; floorY: number; frame: number; legsEvery?: number; segs?: number }): Conveyor {
  const g = new THREE.Group();
  const hw = o.width / 2;
  const len = curve.getLength();
  const segs = o.segs ?? Math.max(8, Math.ceil(len / 2));
  const M = conveyorMaterials(o.frame);
  // the belt (its own texture, so each conveyor runs at its own speed)
  const tex = beltTex();
  tex.repeat.set(1, 0.5);
  const beltMat = new THREE.MeshLambertMaterial({ map: tex });
  const belt = new THREE.Mesh(ribbon(curve, -hw, hw, segs, -0.004, o.width), beltMat);
  belt.receiveShadow = true;
  g.add(belt);
  // the return run underneath, in shadow
  const under = new THREE.Mesh(ribbon(curve, -hw, hw, Math.ceil(segs / 2), -1.05, o.width), M.dark);
  under.rotation.set(0, 0, 0);
  g.add(under);
  // side frames, guide rails along the top, a lip at the belt's edge
  for (const s of [-1, 1]) {
    const lat = s * (hw + 0.12);
    const plate = new THREE.Mesh(wallStrip(curve, lat, -1.3, 0.12, segs, s > 0, 1.6), M.frame);
    const plateIn = new THREE.Mesh(wallStrip(curve, lat - s * 0.04, -1.3, 0.12, segs, s < 0, 1.6), M.frame);
    plate.receiveShadow = true; plate.castShadow = true;
    g.add(plate, plateIn);
    const top = new THREE.Mesh(ribbon(curve, Math.min(lat, lat - s * 0.04) - 0.02, Math.max(lat, lat - s * 0.04) + 0.02, segs, 0.12, 1), M.frame);
    g.add(top);
    // a guide rail on short posts
    const railPts: THREE.Vector3[] = [];
    const n = Math.max(4, Math.ceil(len / 3));
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const side = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
      railPts.push(p.clone().addScaledVector(side, lat).add(new THREE.Vector3(0, 0.5, 0)));
    }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), n * 2, 0.07, 6, false), M.rail);
    rail.castShadow = true;
    g.add(rail);
  }
  // posts for the rails, roller ends along the frames, and legs, all merged
  const postParts: THREE.BufferGeometry[] = [], rollParts: THREE.BufferGeometry[] = [], legParts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const place = (geo: THREE.BufferGeometry, p: THREE.Vector3, yaw: number) => { geo.rotateY(yaw); geo.translate(p.x, p.y, p.z); return geo; };
  for (let d = 1.5; d < len; d += 3) {
    const u = d / len, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    const yaw = Math.atan2(t.x, t.z);
    for (const s of [-1, 1]) {
      postParts.push(place(new THREE.CylinderGeometry(0.045, 0.045, 0.4, 5).translate(0, 0.3, 0), p.clone().addScaledVector(side, s * (hw + 0.12)), yaw));
    }
  }
  for (let d = 0.8; d < len; d += 1.6) {
    const u = d / len, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    const yaw = Math.atan2(t.x, t.z);
    for (const s of [-1, 1]) {
      const cap = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10); cap.rotateZ(Math.PI / 2);
      rollParts.push(place(cap.translate(0, -0.25, 0), p.clone().addScaledVector(side, s * (hw + 0.16)), yaw));
    }
  }
  const every = o.legsEvery ?? 9;
  for (let d = every / 2; d < len; d += every) {
    const u = d / len, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    const yaw = Math.atan2(t.x, t.z);
    const h = p.y - 1.3 - o.floorY;
    for (const s of [-1, 1]) {
      const q = p.clone().addScaledVector(side, s * (hw - 0.3));
      legParts.push(place(new THREE.BoxGeometry(0.34, h, 0.34).translate(0, -1.3 - h / 2, 0), q, yaw));
      legParts.push(place(new THREE.BoxGeometry(0.6, 0.18, 0.6).translate(0, -1.3 - h + 0.09, 0), q, yaw));
    }
    legParts.push(place(new THREE.BoxGeometry(o.width - 0.6, 0.22, 0.22).translate(0, -1.3 - h * 0.62, 0), p, yaw));
  }
  if (postParts.length) g.add(new THREE.Mesh(mergeGeometries(postParts, false)!, M.rail));
  if (rollParts.length) g.add(new THREE.Mesh(mergeGeometries(rollParts, false)!, M.roller));
  if (legParts.length) { const legs = new THREE.Mesh(mergeGeometries(legParts, false)!, M.frame); legs.castShadow = true; g.add(legs); }
  return {
    group: g, belt,
    run(dist) { tex.offset.y = -dist / 10; },
  };
}
