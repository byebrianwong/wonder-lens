import * as THREE from 'three';
import { mergeStatic } from '../../../engine/Builders';
import { boxUV } from '../../../engine/Paint';
import type { Mats } from './mats';

/*
 * The farmers' excavators: giant tracked diggers that gnaw at the hill to get at the foxes. Built big (about
 * 11 units to the top of the boom), menacing in silhouette against the dusk: crawler tracks, a house with a
 * cab whose lamps glare, a long boom, a stick and a toothed bucket on pivots that chew in a slow rhythm.
 * Faces +z (the boom reaches forward); origin on the ground under the middle of the tracks.
 */

export interface Excavator {
  group: THREE.Group;
  /** chew at `phase` 0..1 of the bite, with `reach` 0..1 (how far down the boom goes) */
  pose(t: number, reach: number): void;
  /** the glass of the cab and the lamps, so the set can brighten them at night */
  lamps: THREE.Object3D[];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function makeExcavator(m: Mats, seed = 0): Excavator {
  const g = new THREE.Group();
  const paint = m.excavator, dark = m.iron;
  const rubber = new THREE.MeshLambertMaterial({ color: 0x24221f });
  const glass = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.7) });
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 2.2) });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const me = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), 3), mat);
    me.position.set(x, y, z); me.castShadow = true;
    return me;
  };
  // ----- tracks -----
  const under = new THREE.Group(); g.add(under);
  for (const s of [-1, 1]) {
    under.add(box(1.6, 1.6, 7.4, rubber, s * 2.4, 0.8, 0));
    for (const z of [-3.7, 3.7]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 14).rotateZ(Math.PI / 2), rubber); w.position.set(s * 2.4, 0.8, z); under.add(w); }
    for (let k = -3; k <= 3; k++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.7, 10).rotateZ(Math.PI / 2), dark); r.position.set(s * 2.4, 0.55, k * 1.05); under.add(r); }
  }
  under.add(box(3.4, 0.8, 4.0, dark, 0, 1.5, 0));
  mergeStatic(under);
  // ----- the house turns on the tracks -----
  const house = new THREE.Group(); house.position.y = 2.0; g.add(house);
  const body = new THREE.Group(); house.add(body);
  body.add(box(5.6, 2.6, 6.4, paint, 0, 1.3, -0.6));
  body.add(box(5.8, 1.2, 1.6, dark, 0, 0.9, -4.2));
  body.add(box(2.4, 2.8, 2.6, paint, -1.5, 4.0, 1.4));
  // the cab's windows, lit from inside, and a stack
  const win = box(2.0, 1.6, 0.05, glass, -1.5, 4.3, 2.72); win.castShadow = false; body.add(win);
  const side = box(0.05, 1.5, 1.9, glass, -2.72, 4.3, 1.4); side.castShadow = false; body.add(side);
  body.add(box(2.6, 0.2, 2.8, dark, -1.5, 5.5, 1.4));
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 2.2, 8), dark); stack.position.set(1.8, 3.6, -2.4); body.add(stack);
  // a lamp bar on the roof
  const lampsG = new THREE.Group();
  for (const x of [-2.3, -0.7]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 12).rotateX(Math.PI / 2), lamp); l.position.set(x, 5.9, 2.7); lampsG.add(l); const hood = box(0.8, 0.5, 0.4, dark, x, 5.9, 2.45); lampsG.add(hood); }
  body.add(lampsG);
  mergeStatic(body);
  // ----- the boom, the stick, the bucket -----
  const boomPivot = new THREE.Group(); boomPivot.position.set(1.1, 2.2, 2.6); house.add(boomPivot);
  const boom = new THREE.Group(); boomPivot.add(boom);
  // the boom is bent like a banana: two beams, the elbow high
  const beam = (a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, parent: THREE.Object3D) => {
    const d = b.clone().sub(a);
    const me = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d.length()), 3), paint);
    me.position.copy(a).addScaledVector(d, 0.5);
    me.quaternion.setFromUnitVectors(V(0, 0, 1), d.normalize());
    me.castShadow = true;
    parent.add(me);
  };
  const elbow = V(0, 4.2, 5.6), tip = V(0, 3.2, 9.6);
  beam(V(0, 0, 0), elbow, 1.0, 1.3, boom);
  beam(elbow, tip, 0.9, 1.1, boom);
  // hydraulic rams along the boom
  const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 5.4, 8).rotateX(Math.PI / 2 - 0.62), dark); ram.position.set(0, 0.6, 2.4); boom.add(ram);
  mergeStatic(boom);
  const stickPivot = new THREE.Group(); stickPivot.position.copy(tip); boom.add(stickPivot);
  const stick = new THREE.Group(); stickPivot.add(stick);
  beam(V(0, 0.6, -0.4), V(0, -5.6, 1.2), 0.8, 0.9, stick);
  mergeStatic(stick);
  const bucketPivot = new THREE.Group(); bucketPivot.position.set(0, -5.6, 1.2); stick.add(bucketPivot);
  const bucket = new THREE.Group(); bucketPivot.add(bucket);
  {
    // a scoop: back plate, two sides, a row of teeth
    const scoop = paint.clone(); scoop.side = THREE.DoubleSide;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 14, 1, true, Math.PI * 0.2, Math.PI * 0.9).rotateZ(Math.PI / 2), scoop);
    back.position.set(0, -0.4, 0.9); back.castShadow = true;
    bucket.add(back);
    for (const s of [-1, 1]) { const sd = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.1, 14, 1, false, Math.PI * 0.2, Math.PI * 0.9).rotateZ(Math.PI / 2), dark); sd.position.set(s * 1.3, -0.4, 0.9); bucket.add(sd); }
    for (let k = 0; k < 5; k++) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 6), dark); t.position.set(-1.0 + k * 0.5, -1.8, 1.35); t.rotation.x = Math.PI - 0.3; bucket.add(t); }
  }
  mergeStatic(bucket);
  const ph = seed * 1.7;
  return {
    group: g,
    lamps: [win, side, lampsG],
    pose(t, reach) {
      // a slow bite: the boom dips, the stick pulls in, the bucket curls, then everything lifts
      const c = (Math.sin(t * 0.55 + ph) + 1) / 2, c2 = (Math.sin(t * 0.55 + ph - 1.1) + 1) / 2;
      boomPivot.rotation.x = -0.15 + reach * 0.35 + c * 0.25;
      stickPivot.rotation.x = 0.2 - c2 * 0.7 + reach * 0.2;
      bucketPivot.rotation.x = -0.4 + c2 * 1.2;
      house.rotation.y = Math.sin(t * 0.13 + ph) * 0.08;
    },
  };
}
