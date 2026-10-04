import * as THREE from 'three';
import { charToon } from '../../engine/Paint';
import { outline } from '../../engine/Rig';
import { canvasTexture } from '../../engine/Builders';
import { makeAdult, poseArm, relax, sit, walk, type Adult, type AdultOpts } from '../amelie/figure';
import { makeKid, type Kid, type KidOpts } from '../ghibli/people';
import { FUTURA } from './film';

/**
 * People for the Zubrowka Express. The grown-ups are the Amélie world's figure (`makeAdult`: a painted face, a
 * sculpted hairdo, cel shading with a cool shadow tone, an ink line, joints at the shoulder, elbow, hip and
 * knee) and the children are the Ghibli world's (`makeKid`, with a bigger head), so every world's people
 * look like they belong to one game. This file adds the films' hats and caps, which sit on a figure's `head`
 * group. Build hats with the head radius of the figure they go on (`HEAD_R.adult` or `HEAD_R.kid`).
 *
 * Share materials between look-alikes (a troop of scouts, a row of lobby boys): every builder here caches
 * its materials by colour.
 */

export { makeAdult, makeKid, poseArm, relax, sit, walk, type Adult, type AdultOpts, type Kid, type KidOpts };
/** Either kind of figure: both have the same joints. */
export type Figure = Adult | Kid;

/** Head radius of each figure, for sizing hats. The head group's origin is the head's centre. */
export const HEAD_R = { adult: 0.18, kid: 0.29 };

const INK = 0x2a1e24;
const mats = new Map<string, THREE.Material>();
const mat = (key: string, make: () => THREE.Material) => { let m = mats.get(key); if (!m) { m = make(); mats.set(key, m); } return m; };
const plain = (color: number) => mat(`p${color}`, () => charToon({ color, rim: 0.35 }));
const lined = (m: THREE.Mesh, px = 1.3, max = 0.014) => { outline(m, INK, px, max); return m; };

/**
 * The Grand Budapest lobby boy's pillbox cap: a short drum with a flat top, a gold band, and LOBBY BOY
 * lettered in gold across the front (or other words).
 */
export function pillboxCap(R: number, color = 0x5a2a6a, band = 0xd8a840, text = 'LOBBY BOY') {
  const g = new THREE.Group();
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const tex = canvasTexture(512, 96, (c) => {
    c.fillStyle = hex(color); c.fillRect(0, 0, 512, 96);
    c.fillStyle = hex(band); c.fillRect(0, 0, 512, 10); c.fillRect(0, 86, 512, 10);
    c.font = `bold 34px ${FUTURA}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    // the lettering sits on the front quarter of the drum (cylinder UVs start at the back left)
    c.fillText(text, 512 * 0.5, 50);
  });
  const side = mat(`pill${color}${band}${text}`, () => charToon({ map: tex, rim: 0.3 }));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.78, R * 0.82, R * 0.62, 24, 1, true), side);
  // turn the lettering to the front (+z)
  drum.rotation.y = -Math.PI / 2;
  const top = new THREE.Mesh(new THREE.CircleGeometry(R * 0.78, 24), plain(color));
  top.rotation.x = -Math.PI / 2; top.position.y = R * 0.31;
  g.add(drum, top);
  lined(drum);
  g.position.set(0, R * 0.92, -R * 0.05);
  g.rotation.x = -0.12;
  return g;
}

/** Team Zissou's red knit beanie: a dome with a rolled brim. */
export function beanie(R: number, color = 0xc8202a) {
  const g = new THREE.Group();
  const m = mat(`knit${color}`, () => {
    const tex = canvasTexture(128, 128, (c) => {
      c.fillStyle = `#${color.toString(16).padStart(6, '0')}`; c.fillRect(0, 0, 128, 128);
      c.fillStyle = 'rgba(0,0,0,0.16)';
      for (let x = 0; x < 128; x += 8) c.fillRect(x, 0, 3, 128);
    }, [4, 1]);
    return charToon({ map: tex, rim: 0.35 });
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.08, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
  dome.scale.set(1, 0.95, 1); dome.position.y = R * 0.2;
  const brim = new THREE.Mesh(new THREE.TorusGeometry(R * 1.06, R * 0.13, 8, 26), m);
  brim.rotation.x = Math.PI / 2; brim.position.y = R * 0.24;
  g.add(dome, brim);
  lined(dome); lined(brim);
  return g;
}

/** The Khaki Scouts' campaign hat: a wide flat brim and a tall crown pinched into four dents. */
export function campaignHat(R: number, color = 0xb89a5a, band = 0x6a4a2a) {
  const g = new THREE.Group();
  const m = plain(color);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.75, R * 1.75, R * 0.05, 28), m);
  brim.position.y = R * 0.55;
  const crownGeo = new THREE.ConeGeometry(R * 0.95, R * 1.0, 4, 1);
  crownGeo.rotateY(Math.PI / 4);
  const crown = new THREE.Mesh(crownGeo, m);
  crown.position.y = R * 1.05;
  const bandM = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.93, R * 0.95, R * 0.14, 20), plain(band));
  bandM.position.y = R * 0.64;
  g.add(brim, crown, bandM);
  lined(brim); lined(crown);
  return g;
}

/** Sam Shakusky's coonskin cap: a fur drum with a striped tail hanging down the back. */
export function coonskinCap(R: number) {
  const g = new THREE.Group();
  const fur = mat('coon', () => {
    const tex = canvasTexture(128, 64, (c) => {
      c.fillStyle = '#8a6a4a'; c.fillRect(0, 0, 128, 64);
      for (let i = 0; i < 500; i++) { c.fillStyle = Math.random() < 0.5 ? 'rgba(60,40,24,0.5)' : 'rgba(200,170,130,0.35)'; c.fillRect(Math.random() * 128, Math.random() * 64, 1, 3 + Math.random() * 4); }
    });
    return charToon({ map: tex, rim: 0.45 });
  });
  const drum = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), fur);
  drum.scale.set(1, 1.05, 1); drum.position.y = R * 0.12;
  g.add(drum);
  lined(drum);
  const tail = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(R * (0.24 - i * 0.015), 10, 8), i % 2 ? plain(0x2a1c14) : plain(0xb89a74));
    seg.scale.set(1, 1.3, 1); seg.position.set(0, -i * R * 0.42, 0);
    tail.add(seg);
  }
  tail.position.set(0, R * 0.2, -R * 1.05);
  tail.rotation.x = -0.25;
  g.add(tail);
  return g;
}

/** A peaked cap (a captain, a conductor, a police inspector): a flat round top, a band, a black peak. */
export function peakedCap(R: number, color = 0x2a3a6a, band = 0x1a1a1a, badge = 0xd8a840) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 0.92, R * 0.42, 24), plain(color));
  top.position.y = R * 0.78;
  const bandM = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.94, R * 0.94, R * 0.2, 24), plain(band));
  bandM.position.y = R * 0.55;
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, R * 0.05, 20, 1, false, -Math.PI * 0.42, Math.PI * 0.84), plain(0x141414));
  peak.position.set(0, R * 0.47, R * 0.22); peak.rotation.x = 0.22;
  const pin = new THREE.Mesh(new THREE.SphereGeometry(R * 0.11, 8, 6), plain(badge));
  pin.scale.z = 0.4; pin.position.set(0, R * 0.62, R * 0.95);
  g.add(top, bandM, peak, pin);
  lined(top); lined(peak);
  return g;
}

/** Put a hat on a figure (it is a child of the head, so it turns and nods with it). */
export function wear(f: Figure, hat: THREE.Object3D) { f.head.add(hat); return hat; }

/**
 * Hold a prop in a hand. The hand mesh is squashed, so the prop goes on the forearm (the hand's parent) at
 * the hand's place, offset in the forearm's space (y runs up the arm, so a negative y is past the fingers).
 */
export function hold(f: Figure, side: 0 | 1, prop: THREE.Object3D, x = 0, y = -0.04, z = 0.04) {
  const h = f.hand[side];
  prop.position.set(h.position.x + x, h.position.y + y, h.position.z + z);
  h.parent!.add(prop);
  return prop;
}
