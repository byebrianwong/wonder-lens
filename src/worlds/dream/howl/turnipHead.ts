import * as THREE from 'three';
import { mergeStatic, mesh } from '../../../engine/Builders';
import { charToon, repeatUV } from '../../../engine/Paint';
import { Spring, envelope, easeInOut, outline } from '../../../engine/Rig';
import { TAU, clamp } from '../../../engine/math';
import { woodGrain, leafTexture } from '../../ghibli/characterTextures';
import { raggedCoat, turnipFace } from './paint';

/*
 * Turnip Head, the scarecrow from Howl's Moving Castle: a white turnip with a purple crown for a head, a
 * painted face, a black top hat, a raggedy patched coat hung on a crossbar for arms, and one stick leg that it
 * hops on. Its own space: the tip of the stick on the ground at the origin, facing +z, about 3.3 tall.
 */

export interface TurnipHead {
  group: THREE.Group;
  /** distance moved along the ground this frame: it hops in time with it */
  stride: number;
  update(dt: number, t: number): void;
  /** the ocarina: bows, and its hat tips off its head and back */
  bow(): void;
  /** an acorn: spins round on its stick */
  spin(): void;
}

const HOP = 2.4, HOP_H = 0.65;

export function makeTurnipHead(): TurnipHead {
  const g = new THREE.Group();
  const hopper = new THREE.Group();
  g.add(hopper);
  const ink = 0x2a1e1a;
  const stick = charToon({ map: woodGrain(0x8a6a44, 1301), rim: 0.3 });
  const coatMat = charToon({ map: raggedCoat(0xb08a4a, 1303), alphaTest: 0.5, side: THREE.DoubleSide, rim: 0.35 });
  const headMat = charToon({ map: turnipFace(), rim: 0.45, shade: 0xa8a0c0 });
  const hatMat = charToon({ color: 0x1e1c22, rim: 0.5 });
  const bandMat = charToon({ color: 0x6a2a2a, rim: 0.3 });
  const scarf = charToon({ color: 0x4a6a8a, rim: 0.3 });
  const leafMat = charToon({ map: leafTexture(0x4a8a3a), alphaTest: 0.5, side: THREE.DoubleSide, rim: 0.3 });

  // the leg: one stick from the ground to the coat
  const leg = mesh(repeatUV(new THREE.CylinderGeometry(0.05, 0.065, 1.45, 8), 1, 2), stick, 0, 0.72, 0);
  hopper.add(leg);
  // everything above the leg bows and spins about the top of the stick
  const upper = new THREE.Group(); upper.position.y = 1.35;
  hopper.add(upper);
  // the coat, scarf and crossbar never move on their own, so they go in one group that is merged
  const still = new THREE.Group(); upper.add(still);
  const U = (o: THREE.Object3D, x: number, y: number, z: number) => { o.position.set(x, y - 1.35, z); still.add(o); return o; };
  // the coat: a flared tube with a torn hem, open at the bottom
  const coat = U(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.56, 1.05, 18, 1, true), coatMat), 0, 1.58, 0) as THREE.Mesh;
  outline(coat, ink, 1.4, 0.03);
  // a scarf at the neck
  U(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 8, 16), scarf), 0, 2.1, 0).rotation.x = Math.PI / 2;
  { const tail = U(new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.5), scarf), 0.16, 1.92, 0.2); tail.rotation.set(0.2, 0.3, 0.25); (tail as THREE.Mesh).material = charToon({ color: 0x4a6a8a, rim: 0.3, side: THREE.DoubleSide }); }
  // the crossbar arms, with twig hands at both ends
  U(mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.3, 6), stick), 0, 2.0, 0).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) for (const a of [-0.5, 0.1, 0.6]) {
    const tw = U(mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.28, 4), stick), s * 1.2, 2.0, 0);
    tw.rotation.z = s * (Math.PI / 2 + a); tw.position.x += s * 0.08; tw.position.y += Math.cos(Math.PI / 2 + a) * 0.1;
  }
  // sleeves: ragged tubes along the crossbar, each on its own pivot at the shoulder so they can swing
  const sleeves: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * 0.22, 2.0 - 1.35, 0);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.21, 0.78, 12, 1, true), coatMat);
    sl.rotation.z = s * Math.PI / 2; sl.position.set(s * 0.39, -0.03, 0);
    piv.add(sl);
    outline(sl, ink, 1.3, 0.025);
    upper.add(piv); sleeves.push(piv);
  }
  // the head: a turnip, its root tip pointing down for a chin
  const headG = new THREE.Group(); headG.position.set(0, 2.5 - 1.35, 0); upper.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 22), headMat);
  head.scale.set(0.33, 0.37, 0.32);
  headG.add(head);
  outline(head, ink, 1.6, 0.03);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 10), headMat);
  tip.rotation.x = Math.PI; tip.position.set(0, -0.42, 0.02);
  headG.add(tip);
  // leaves sprouting from the top, out from under the back of the hat
  for (const [a, tilt] of [[-0.6, 0.5], [0.2, 0.7], [0.9, 0.45]] as const) {
    const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.7).translate(0, 0.35, 0), leafMat);
    lf.position.set(Math.sin(a) * 0.12, 0.3, -0.12); lf.rotation.set(-tilt, a, 0);
    headG.add(lf);
  }
  // the top hat, which can lift off for the bow
  const hat = new THREE.Group(); hat.position.set(0, 0.3, 0); headG.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.035, 22), hatMat); brim.position.y = 0.02; hat.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.52, 18), hatMat); crown.position.y = 0.28; hat.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.08, 18), bandMat); band.position.y = 0.08; hat.add(band);
  outline(crown, ink, 1.4, 0.025); outline(brim, ink, 1.4, 0.025);
  hat.rotation.z = -0.12;
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline) m.castShadow = true; });
  mergeStatic(still);

  // ---------- motion ----------
  let hopPh = 0, bowT = -1, spinT = -1, spin0 = 0;
  const sp = { sleeve: new Spring(0, 2.2, 0.35), squash: new Spring(1, 5, 0.4) };
  const th: TurnipHead = {
    group: g, stride: 0,
    bow() { bowT = 0; },
    spin() { spinT = 0; spin0 = hopper.rotation.y; },
    update(dt, t) {
      // hops in time with the ground covered; standing still it gives a small bounce now and then
      hopPh += th.stride / HOP;
      const moving = th.stride > 0.002;
      const hopK = moving ? Math.abs(Math.sin(hopPh * Math.PI)) : Math.pow(Math.max(0, Math.sin(t * 2.6)), 6) * 0.35;
      hopper.position.y = hopK * HOP_H;
      // squash a little at each landing
      const land = moving ? 1 - Math.pow(Math.abs(Math.cos(hopPh * Math.PI)), 12) * 0.1 : 1;
      hopper.scale.y = sp.squash.update(land, dt);
      // the sleeves lag behind the hops; they flare out in a spin
      let flare = 0;
      if (spinT >= 0) {
        spinT += dt;
        const k = clamp(spinT / 1.2, 0, 1);
        hopper.rotation.y = spin0 + easeInOut(k) * TAU * 2;
        flare = envelope(spinT, 0, 0.3, 0.9, 1.4);
        if (spinT > 1.5) { spinT = -1; hopper.rotation.y = spin0; }
      }
      const droop = sp.sleeve.update((moving ? -Math.cos(hopPh * TAU) * 0.18 : Math.sin(t * 1.7) * 0.05) + flare * 0.45, dt);
      sleeves[0].rotation.z = -droop; sleeves[1].rotation.z = droop;
      coat.scale.set(1 + flare * 0.18, 1, 1 + flare * 0.18);
      // the bow: tip forward from the top of the stick; the hat lifts off, tips, and settles back
      let bow = 0, hatUp = 0;
      if (bowT >= 0) {
        bowT += dt;
        bow = envelope(bowT, 0, 0.35, 0.95, 1.5);
        hatUp = envelope(bowT, 0.15, 0.45, 0.85, 1.3);
        if (bowT > 1.6) bowT = -1;
      }
      upper.rotation.x = bow * 0.6 + Math.sin(t * 1.3) * 0.03;
      upper.rotation.z = Math.sin(t * 0.9 + 1) * 0.04;
      headG.rotation.x = bow * 0.25;
      headG.rotation.y = Math.sin(t * 0.6) * 0.12;
      hat.position.set(0, 0.3 + hatUp * 0.35, hatUp * 0.28);
      hat.rotation.set(hatUp * 0.9, 0, -0.12 + hatUp * 0.1);
    },
  };
  return th;
}
