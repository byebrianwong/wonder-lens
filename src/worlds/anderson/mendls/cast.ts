import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon, Painter } from '../../../engine/Paint';
import { envelope, outline, outlineMaterial, taperedTube } from '../../../engine/Rig';
import { clamp, lerp, Rng, TAU } from '../../../engine/math';
import { mendlsBox } from '../kit';
import { HEAD_R, makeAdult, pillboxCap, poseArm, relax, wear, hold, type Adult } from '../people';
import { courtesan } from './pastry';

/**
 * The people of Mendl's. Agatha (the birthmark shaped like Mexico on her cheek, her hair pinned up in a
 * braided crown, a pale blue dress and a white apron), Herr Mendl (stout, a handlebar moustache, a tall
 * toque, a long baker's peel), Zero (the lobby boy's purple uniform and pillbox cap, the moustache he draws
 * on, a bouquet), and a row of bakers in white who roll pastry in unison.
 *
 * The named characters are built at life size (about 1.75 tall) on the shared adult figure, so they stand
 * on their own for the curtain call; the scene scales them up eight times. Each faces +z.
 */

const INK = 0x2a1e24;
const HR = HEAD_R.adult;
const tmpV = new THREE.Vector3();

/** A timed reaction: start() restarts it, `t` is the time since, -1 when idle. */
class Beat {
  t = -1;
  len: number;
  constructor(len: number) { this.len = len; }
  start() { this.t = 0; }
  step(dt: number) { if (this.t >= 0) { this.t += dt; if (this.t > this.len) this.t = -1; } return this.t; }
  get on() { return this.t >= 0; }
}

/** A curtain-call character: what the finale and the gallery need. */
export interface CastMember { group: THREE.Group; update(dt: number, t: number): void; bow(): void }

/** Thicken a figure's ink lines when it is shown at giant scale (the line's cap is in world units). */
export function inkForScale(root: THREE.Object3D, scale: number) {
  const mat = outlineMaterial(INK, 1.3, 0.014 * scale);
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.outline) m.material = mat; });
}

const mats = new Map<string, THREE.Material>();
const M = (k: string, make: () => THREE.Material) => { let m = mats.get(k); if (!m) { m = make(); mats.set(k, m); } return m; };

// ---------------------------------------------------------------- Agatha
/** The outline of Mexico (longitude, latitude), roughly, for Agatha's birthmark. */
const MEXICO: Array<[number, number]> = [
  [-117.1, 32.5], [-114.8, 32.6], [-111, 31.3], [-108.2, 31.3], [-106.5, 31.8], [-104.5, 29.6], [-103, 29], [-102.4, 29.8], [-101, 29.8], [-99.5, 27.5], [-97.5, 25.9],
  [-97.7, 24], [-97.3, 21.5], [-96.3, 19.5], [-95, 18.6], [-94.5, 18.2], [-92.5, 18.6], [-91, 18.9], [-90.4, 20.8], [-90, 21.3], [-87.1, 21.5], [-87.5, 19.5], [-88.3, 18.4],
  [-89.1, 17.8], [-91, 17.8], [-90.9, 16.8], [-92.2, 14.6], [-94, 16.1], [-96.5, 15.7], [-98.5, 16.3], [-100.5, 17.1], [-101.8, 17.9], [-103.5, 18.3], [-105.3, 19.6],
  [-105.6, 20.5], [-105.2, 21.5], [-105.7, 22.8], [-106.4, 23.4], [-108, 25], [-109.4, 26.2], [-110.6, 27.8], [-111.9, 29], [-112.8, 30.2], [-113.1, 31.2], [-114.6, 31.6],
  [-114.6, 30.5], [-114, 28.9], [-112.7, 27.5], [-111.6, 26], [-110.5, 24.4], [-109.4, 23.2], [-110.2, 23.5], [-111.6, 24.6], [-112.2, 25.9], [-114.1, 27.7], [-115.1, 28.4], [-115.9, 30.4],
];

let mexicoTex: THREE.Texture | null = null;
function mexicoMark() {
  if (mexicoTex) return mexicoTex;
  const W = 256, H = 192;
  const p = new Painter(W, H, 91);
  const g = p.g;
  const lon0 = -118, lon1 = -86, lat0 = 13.5, lat1 = 33.5;
  const sx = (lon: number) => 14 + ((lon - lon0) / (lon1 - lon0)) * (W - 28), sy = (lat: number) => 14 + ((lat1 - lat) / (lat1 - lat0)) * (H - 28);
  const path = () => { g.beginPath(); MEXICO.forEach(([lo, la], i) => { if (i === 0) g.moveTo(sx(lo), sy(la)); else g.lineTo(sx(lo), sy(la)); }); g.closePath(); };
  // a soft edge, then the mark itself, a little darker in the middle
  g.filter = 'blur(3px)';
  g.fillStyle = 'rgba(150,70,60,0.45)'; path(); g.fill();
  g.filter = 'none';
  g.fillStyle = 'rgba(140,58,48,0.85)'; path(); g.fill();
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createRadialGradient(W * 0.45, H * 0.45, 6, W * 0.45, H * 0.45, W * 0.5);
  gr.addColorStop(0, 'rgba(110,40,36,0.5)'); gr.addColorStop(1, 'rgba(170,90,80,0.2)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  mexicoTex = p.texture({ wrap: false });
  return mexicoTex;
}

/** A plait: strands crossing diagonally, for the braid round Agatha's head. */
function braidTexture(color: number) {
  const p = new Painter(256, 64, 93).fill('#' + new THREE.Color(color).multiplyScalar(0.7).getHexString());
  const g = p.g;
  const c = new THREE.Color(color);
  for (let i = -4; i < 40; i++) {
    const x = i * 12;
    for (const [dx, k] of [[0, 1.0], [6, 0.86]] as const) {
      g.fillStyle = `#${c.clone().multiplyScalar(k).getHexString()}`;
      g.beginPath(); g.ellipse(x + dx, 32, 9, 22, i % 2 ? 0.6 : -0.6, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(255,240,220,0.25)'; g.beginPath(); g.ellipse(x + 2, 26, 3, 10, i % 2 ? 0.6 : -0.6, 0, TAU); g.fill();
  }
  return p.texture();
}

export interface Agatha extends CastMember {
  adult: Adult;
  /** where she looks (the camera); null to look at her work */
  lookTarget: THREE.Vector3 | null;
  /** she holds out a Courtesan on her palm */
  present(): void;
  /** she catches a Mendl's box and keeps it for a moment */
  catchBox(): void;
  /** 0..1: she leans over the table to close a box's lid */
  reach: number;
}

export function makeAgatha(): Agatha {
  const hairC = 0xc98a5a;
  const a = makeAdult({ skin: 0xf6dccb, hair: hairC, style: 'short', fringe: 'none', top: 0x8fb2d4, sleeves: 'long', bottom: { kind: 'dress', color: 0x8fb2d4, length: 0.62 }, shoes: 0x3a2a24, apron: 0xfbf7f2, face: { mouth: 'small', blush: 0.5 }, hiRes: true, seed: 41 });
  const T = (k: string, o: Parameters<typeof charToon>[0]) => M(k, () => charToon(o));
  // the braided crown and a bun at the back
  const braid = new THREE.Mesh(new THREE.TorusGeometry(HR * 0.98, HR * 0.17, 10, 40), T('braid', { map: braidTexture(hairC), rim: 0.45 }));
  braid.rotation.x = Math.PI / 2 - 0.25; braid.position.set(0, HR * 0.42, -HR * 0.1); a.head.add(braid);
  outline(braid, INK, 1.3, 0.014);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(HR * 0.42, 16, 12), T('bun', { map: braidTexture(hairC), rim: 0.45 }));
  bun.position.set(0, HR * 0.15, -HR * 1.05); bun.scale.set(1.1, 0.9, 0.8); a.head.add(bun);
  outline(bun, INK, 1.3, 0.014);
  // the birthmark shaped like Mexico, high on her right cheek: a patch of the head's sphere
  const R = HR * 1.003;
  const mark = new THREE.Mesh(new THREE.SphereGeometry(R, 10, 8, Math.PI / 2 - 0.62, 0.36, Math.PI / 2 + 0.02, 0.28), M('mexico', () => new THREE.MeshLambertMaterial({ map: mexicoMark(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
  mark.scale.set(1, 1.05, 0.96); mark.renderOrder = 1;
  a.head.add(mark);
  // a white Peter Pan collar
  const collarGeo = new THREE.TorusGeometry(0.088, 0.026, 6, 18, Math.PI * 1.2); collarGeo.rotateX(Math.PI / 2); collarGeo.rotateY(0.1 * Math.PI); collarGeo.scale(1, 0.5, 0.8);
  const collar = new THREE.Mesh(collarGeo, T('collar', { color: 0xfdfaf4, rim: 0.3 }));
  collar.position.set(0, 0.54, 0.0); a.spine.add(collar);
  // the props: a Courtesan to present, a little Mendl's box to catch, a box she is tying on the table
  const offer = courtesan(0.2, true); offer.visible = false;
  hold(a, 0, offer, 0, -0.06, 0.04);
  const caught = mendlsBox(0.16); caught.visible = false;
  hold(a, 1, caught, -0.02, -0.05, 0.03);
  const present = new Beat(3.4), catchB = new Beat(3.2), bowB = new Beat(2.6);
  const ag: Agatha = {
    group: a.group, adult: a, lookTarget: null, reach: 0,
    present() { if (!present.on) { present.start(); a.setFace('smile'); } },
    catchBox() { if (!catchB.on) { catchB.start(); a.setFace('open'); } },
    bow() { bowB.start(); a.setFace('smile'); },
    update(dt, t) {
      const p = present.step(dt), c = catchB.step(dt), b = bowB.step(dt);
      relax(a, dt, 7);
      // idle: tying a ribbon on the box on her table, hands making little loops
      const work = (1 - ag.reach) * (p < 0 && c < 0 ? 1 : 0.3);
      poseArm(a, 0, -0.75 * work, 0.12, -1.0 * work);
      poseArm(a, 1, -0.75 * work, 0.12, -1.0 * work);
      a.elbow[0].rotation.z = Math.sin(t * 4.2) * 0.35 * work;
      a.elbow[1].rotation.z = -Math.sin(t * 4.2 + 1.2) * 0.35 * work;
      a.spine.rotation.x = 0.08 * work;
      // leaning over to close the lid
      if (ag.reach > 0) {
        const r = ag.reach;
        a.spine.rotation.x = 0.42 * r;
        a.pelvis.rotation.x = 0.1 * r;
        poseArm(a, 0, -1.25 * r, 0.22 * r, -0.35 * r);
        poseArm(a, 1, -1.25 * r, 0.22 * r, -0.35 * r);
      }
      if (p >= 0) {
        // the right hand comes up, palm up, with a Courtesan on it; a small nod
        const k = envelope(p, 0, 0.55, 2.6, 3.4);
        poseArm(a, 0, -1.3 * k, 0.32 * k, -0.55 * k);
        a.hand[0].parent!.rotation.y = -0.3 * k;
        a.spine.rotation.x = -0.05 * k + 0.1 * Math.max(0, Math.sin(p * 2.2)) * k;
        offer.visible = p > 0.25 && p < 3.1;
        a.head.rotation.z = 0.12 * k;
      } else offer.visible = false;
      if (c >= 0) {
        // both hands up, a little hop, then the box held to her chest
        const up = envelope(c, 0, 0.25, 0.6, 1.1), hug = envelope(c, 0.8, 1.2, 2.6, 3.2);
        poseArm(a, 0, -2.4 * up - 1.1 * hug, 0.3 * up, -0.3 * up - 1.6 * hug);
        poseArm(a, 1, -2.4 * up - 1.1 * hug, 0.3 * up, -0.3 * up - 1.6 * hug);
        a.pelvis.position.y = 0.98 + Math.sin(clamp(c / 0.5, 0, 1) * Math.PI) * 0.05;
        caught.visible = c > 0.45;
      } else caught.visible = false;
      if (b >= 0) {
        // a curtsy: knees bend, head down, a hand on the apron
        const k = envelope(b, 0, 0.6, 1.6, 2.6);
        a.spine.rotation.x = 0.35 * k; a.knee[0].rotation.x = 0.5 * k; a.knee[1].rotation.x = 0.5 * k;
        a.hip[0].rotation.x = -0.4 * k; a.hip[1].rotation.x = -0.4 * k; a.pelvis.position.y = 0.98 - 0.08 * k;
        poseArm(a, 0, 0.2 * k, 0.3 * k, -0.3 * k); poseArm(a, 1, 0.2 * k, 0.3 * k, -0.3 * k);
      }
      if (!present.on && !catchB.on && !bowB.on) a.setFace('normal');
      // she looks at the rider, more when she is doing something for them
      const lookW = present.on || catchB.on ? 1 : 0.75;
      if (ag.lookTarget) a.tick(dt, t, ag.lookTarget, lookW);
      else { a.tick(dt, t, a.group.localToWorld(tmpV.set(0, 0.6, 0.8)), 0.6); }
    },
  };
  return ag;
}

// ---------------------------------------------------------------- Herr Mendl
/** A chef's toque: a band and a tall pleated crown, puffed at the top. */
function toque(R: number) {
  const g = new THREE.Group();
  const tex = (() => { const p = new Painter(256, 64, 95).fill('#fdfaf6'); for (let x = 0; x < 256; x += 16) { const gr = p.g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(120,110,140,0.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(120,110,140,0.12)'); p.g.fillStyle = gr; p.g.fillRect(x, 0, 16, 64); } return p.texture(); })();
  const m = M('toque', () => charToon({ map: tex, rim: 0.4 }));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.08, R * 0.5, 24), m); band.position.y = R * 0.75;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.35, R * 1.05, R * 1.6, 24, 1, true), m); crown.position.y = R * 1.75;
  const puff = new THREE.Mesh(new THREE.SphereGeometry(R * 1.42, 24, 12, 0, TAU, 0, Math.PI * 0.55), m); puff.position.y = R * 2.4; puff.scale.y = 0.75;
  g.add(band, crown, puff);
  for (const x of [band, crown, puff]) outline(x, INK, 1.3, 0.014);
  return g;
}

export interface Mendl extends CastMember { adult: Adult; lookTarget: THREE.Vector3 | null; serve(): void; catchBox(): void; peel: THREE.Group }
export function makeMendl(): Mendl {
  const a = makeAdult({ skin: 0xf2c6ac, hair: 0x7a6a62, style: 'bald', top: 0xfbf8f2, coat: 0xfbf8f2, coatSkirt: false, sleeves: 'long', bottom: { kind: 'trousers', color: 0x4a4a56 }, shoes: 0x1e1a1a, face: { mouth: 'small', blush: 0.6 }, build: 1.45, seed: 51, hiRes: true });
  wear(a, toque(HEAD_R.adult));
  // a handlebar moustache, curled up at the ends
  const mm = M('mendlTache', () => charToon({ color: 0x4a3828, rim: 0.4 }));
  for (const s of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.055, 0.178), new THREE.Vector3(s * 0.06, -0.066, 0.17), new THREE.Vector3(s * 0.11, -0.05, 0.145), new THREE.Vector3(s * 0.125, -0.02, 0.13)]);
    const t = new THREE.Mesh(taperedTube(c, 0.022, 0.006, 10, 6), mm);
    a.head.add(t);
  }
  // the double row of buttons on his jacket
  const btn = M('btn', () => charToon({ color: 0xe8e0d0, rim: 0.4 }));
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), btn); b.position.set(s * 0.06, 0.18 + k * 0.1, 0.205 - k * 0.01); a.spine.add(b); }
  // the peel: a long handle and a paddle with three Courtesans on it
  const peel = new THREE.Group();
  const wood = M('peelWood', () => charToon({ color: 0xc89a62, rim: 0.3 }));
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.6, 8), wood); handle.position.y = 0.8; peel.add(handle);
  const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), wood); paddle.position.set(0, 1.62, 0.18); paddle.rotation.x = Math.PI / 2 - 0.1; peel.add(paddle);
  outline(handle, INK, 1.3, 0.014); outline(paddle, INK, 1.3, 0.014);
  for (const x of [-0.14, 0, 0.14]) { const c = courtesan(0.13, true); c.position.set(x, 1.66, 0.22); c.rotation.x = -0.1; peel.add(c); }
  peel.rotation.x = -0.6;
  hold(a, 0, peel, 0, -0.05, 0.02);
  const serve = new Beat(3.6), catchB = new Beat(2.6), bowB = new Beat(2.4);
  const mendl: Mendl = {
    group: a.group, adult: a, lookTarget: null, peel,
    serve() { if (!serve.on) { serve.start(); a.setFace('smile'); } },
    catchBox() { if (!catchB.on) { catchB.start(); a.setFace('open'); } },
    bow() { bowB.start(); a.setFace('smile'); },
    update(dt, t) {
      const s = serve.step(dt), c = catchB.step(dt), b = bowB.step(dt);
      relax(a, dt, 6);
      // idle: the peel held out in front, the free hand on his hip, a slow proud sway
      poseArm(a, 0, -0.55, 0.15, -0.9);
      poseArm(a, 1, 0.1, 0.55, -1.6);
      a.spine.rotation.z = Math.sin(t * 0.8) * 0.03;
      peel.rotation.x = -0.6 + Math.sin(t * 1.1) * 0.04;
      if (s >= 0) {
        // the peel goes up high with a flourish, then a bow of the head
        const up = envelope(s, 0, 0.6, 2.4, 3.6);
        poseArm(a, 0, -0.55 - 1.5 * up, 0.15 + 0.2 * up, -0.9 + 0.6 * up);
        peel.rotation.x = -0.6 + 0.3 * up;
        a.spine.rotation.x = -0.12 * up + 0.2 * envelope(s, 1.6, 2.0, 2.4, 2.9);
      }
      if (c >= 0) {
        const k = envelope(c, 0, 0.2, 1.4, 2.6);
        poseArm(a, 0, -0.55 - 0.7 * k, 0.15 - 0.3 * k, -0.9 + 0.5 * k);
        a.spine.rotation.y = -0.25 * k;
      }
      if (b >= 0) { const k = envelope(b, 0, 0.6, 1.4, 2.4); a.spine.rotation.x = 0.5 * k; poseArm(a, 1, -0.8 * k, 0.1, -1.6 * k); }
      if (!serve.on && !catchB.on && !bowB.on) a.setFace('normal');
      a.tick(dt, t, mendl.lookTarget, serve.on || catchB.on ? 1 : 0.5);
    },
  };
  return mendl;
}

// ---------------------------------------------------------------- Zero
/** A bouquet: a cone of white paper, a ribbon, and a head of pink and white flowers. */
function bouquet() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 10, 1, true), M('paper', () => charToon({ color: 0xfbf8f2, rim: 0.3, side: THREE.DoubleSide })));
  paper.rotation.x = Math.PI; paper.position.y = 0.0; g.add(paper);
  const parts: THREE.BufferGeometry[] = [];
  const rng = new Rng(97);
  for (let i = 0; i < 9; i++) { const a = rng.range(0, TAU), r = rng.range(0, 0.07); parts.push(new THREE.SphereGeometry(0.04, 8, 6).translate(Math.cos(a) * r, 0.16 + rng.range(-0.02, 0.04), Math.sin(a) * r)); }
  const flowers = new THREE.Mesh(mergeGeometries(parts, false)!, M('flowers', () => charToon({ color: 0xf08aa8, rim: 0.5 })));
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), M('leaves', () => charToon({ color: 0x5a8a4a, rim: 0.3 }))); leaves.position.y = 0.12; leaves.scale.set(1, 0.5, 1);
  g.add(leaves, flowers);
  outline(paper, INK, 1.3, 0.014);
  return g;
}

export interface Zero extends CastMember { adult: Adult; lookTarget: THREE.Vector3 | null; offer(): void }
export function makeZero(): Zero {
  const purple = 0x5c2a6e;
  const a = makeAdult({ skin: 0xc4946c, hair: 0x181210, style: 'short', top: purple, coat: purple, coatSkirt: false, sleeves: 'long', bottom: { kind: 'trousers', color: purple }, shoes: 0x161214, face: { mouth: 'small', blush: 0.25 }, scale: 0.94, seed: 61 });
  wear(a, pillboxCap(HEAD_R.adult));
  // the pencil moustache he draws on
  const tache = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.007, 0.01), M('pencil', () => new THREE.MeshBasicMaterial({ color: 0x1a1210 })));
  tache.position.set(0, -0.056, HR * 0.965); tache.rotation.x = -0.3; a.head.add(tache);
  // gold buttons down the jacket
  const gold = M('zbtn', () => charToon({ color: 0xd8b25a, rim: 0.5 }));
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), gold); b.position.set(0, 0.12 + k * 0.1, 0.16 + k * 0.005); a.spine.add(b); }
  const flowers = bouquet();
  hold(a, 1, flowers, 0, -0.05, 0.03);
  const offer = new Beat(3.4), bowB = new Beat(2.4);
  const z: Zero = {
    group: a.group, adult: a, lookTarget: null,
    offer() { if (!offer.on) { offer.start(); a.setFace('smile'); } },
    bow() { bowB.start(); },
    update(dt, t) {
      const o = offer.step(dt), b = bowB.step(dt);
      relax(a, dt, 6);
      // idle: the flowers held shyly behind his back, a weight shift
      poseArm(a, 1, 0.55, 0.1, -0.6);
      poseArm(a, 0, 0.1, 0.12, -0.2);
      a.pelvis.rotation.z = Math.sin(t * 0.9) * 0.03;
      if (o >= 0) {
        const k = envelope(o, 0, 0.6, 2.6, 3.4);
        poseArm(a, 1, lerp(0.55, -1.35, k), 0.1, lerp(-0.6, -0.25, k));
        a.spine.rotation.x = 0.22 * envelope(o, 0.5, 0.9, 2.2, 2.8);
      }
      if (b >= 0) {
        // a salute, then a bow, like a lobby boy
        const k = envelope(b, 0, 0.4, 1.6, 2.4);
        poseArm(a, 0, -2.5 * k, 0.6 * k, -2.0 * k);
        a.spine.rotation.x = 0.2 * envelope(b, 1.0, 1.4, 1.8, 2.4);
      }
      if (!offer.on) a.setFace('normal');
      a.tick(dt, t, z.lookTarget, 0.8);
    },
  };
  return z;
}

// ---------------------------------------------------------------- bakers
/**
 * A row of bakers in white, rolling pastry in unison: simple puppets whose parts are instanced, so the
 * whole row costs a handful of draw calls. They face local +z of their spot; `react()` makes them stop,
 * straighten and lift their rolling pins together.
 */
export interface Bakers { group: THREE.Group; update(dt: number, t: number): void; react(): void }
export function buildBakers(spots: Array<{ pos: THREE.Vector3; yaw: number }>, scale: number): Bakers {
  const group = new THREE.Group();
  const n = spots.length;
  const white = M('bakerWhite', () => charToon({ color: 0xfbf8f2, rim: 0.4, shade: 0xa8b0d0 }));
  const check = M('bakerCheck', () => {
    const p = new Painter(64, 64, 99).fill('#e8e8ec');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) { p.g.fillStyle = '#3a3a48'; p.g.fillRect(i * 8, j * 8, 8, 8); }
    return charToon({ map: p.texture({ repeat: [3, 6] }), rim: 0.3 });
  });
  const face = M('bakerFace', () => {
    const p = new Painter(256, 128, 101).fill('#f2ccb0');
    const g = p.g;
    // u 0.25 is the front of a sphere
    const cx = 64, cy = 66;
    g.fillStyle = '#2a1c18'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 11, cy - 2, 3, 4.5, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#5a3a2a'; g.beginPath(); g.ellipse(cx, cy + 12, 12, 4, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(230,120,120,0.4)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 17, cy + 7, 6, 4, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#6a4a3a'; g.fillRect(0, 0, 256, 34); g.fillRect(102, 0, 154, 128); g.fillRect(0, 0, 26, 128);
    return charToon({ map: p.texture(), rim: 0.35 });
  });
  const woodM = M('pinWood', () => charToon({ color: 0xd8a868, rim: 0.4 }));
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, count = n) => { const im = new THREE.InstancedMesh(geo, mat, count); im.frustumCulled = false; im.castShadow = true; group.add(im); return im; };
  // legs and trousers, the jacket, the head, the toque, the arms, the rolling pin
  const legs = mk(mergeGeometries([new THREE.CylinderGeometry(0.075, 0.06, 0.95, 10).translate(-0.09, 0.48, 0), new THREE.CylinderGeometry(0.075, 0.06, 0.95, 10).translate(0.09, 0.48, 0), new THREE.CylinderGeometry(0.17, 0.15, 0.2, 14).translate(0, 0.92, 0)], false)!, check);
  const jacket = mk(new THREE.LatheGeometry([[0.001, -0.08], [0.2, -0.06], [0.22, 0.2], [0.23, 0.42], [0.18, 0.56], [0.06, 0.62], [0.001, 0.63]].map(([r, y]) => new THREE.Vector2(r, y)), 18).scale(1, 1, 0.75), white);
  const head = mk(new THREE.SphereGeometry(0.17, 18, 14).scale(1, 1.06, 0.95), face);
  const hat = mk(mergeGeometries([new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16).translate(0, 0.13, 0), new THREE.CylinderGeometry(0.22, 0.16, 0.26, 16, 1, true).translate(0, 0.3, 0), new THREE.SphereGeometry(0.23, 16, 8, 0, TAU, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.42, 0)], false)!, white);
  const armGeo = mergeGeometries([new THREE.CylinderGeometry(0.055, 0.05, 0.3, 8).translate(0, -0.15, 0), new THREE.CylinderGeometry(0.048, 0.042, 0.28, 8).translate(0, -0.14, 0).rotateX(-1.0).translate(0, -0.3, 0), new THREE.SphereGeometry(0.05, 8, 6).translate(0, -0.3 - 0.14 * Math.cos(1.0) * 2, 0.14 * Math.sin(1.0) * 2)], false)!;
  const arms = mk(armGeo, white, n * 2);
  const pin = mk(mergeGeometries([new THREE.CylinderGeometry(0.06, 0.06, 0.5, 12), new THREE.CylinderGeometry(0.022, 0.022, 0.78, 6)], false)!.rotateZ(Math.PI / 2), woodM);
  const base = new THREE.Matrix4(), m = new THREE.Matrix4(), tor = new THREE.Matrix4(), tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const R = (x: number, y: number, z: number) => tmp.makeRotationFromEuler(e.set(x, y, z, 'YXZ'));
  const Tr = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
  let reactT = 9;
  const update = (_dt: number, t: number) => {
    const k = envelope(reactT, 0, 0.5, 2.6, 3.4);
    spots.forEach((s, i) => {
      base.compose(s.pos, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw), p.set(scale, scale, scale));
      legs.setMatrixAt(i, base);
      // rolling: arms push forward and back together; the body leans into it
      const ph = Math.sin(t * 2.4);
      const lean = (0.28 + 0.08 * ph) * (1 - k) - 0.05 * k;
      tor.copy(base).multiply(Tr(0, 0.98, 0)).multiply(R(lean, 0, 0));
      jacket.setMatrixAt(i, tor);
      m.copy(tor).multiply(Tr(0, 0.75, 0)).multiply(R(0.25 * (1 - k) - 0.2 * k, 0.5 * k * (i % 2 ? 1 : -1) * 0.3, 0));
      head.setMatrixAt(i, m);
      hat.setMatrixAt(i, m);
      const sw = lerp(-0.55 + 0.22 * ph, -2.7, k);
      for (const side of [0, 1]) {
        m.copy(tor).multiply(Tr(side ? 0.21 : -0.21, 0.5, 0)).multiply(R(sw, 0, side ? 0.12 : -0.12));
        arms.setMatrixAt(i * 2 + side, m);
      }
      m.copy(tor).multiply(Tr(0, 0.5, 0)).multiply(R(sw, 0, 0)).multiply(Tr(0, -0.3 - 0.28 * Math.cos(1.0), 0.28 * Math.sin(1.0) + 0.02));
      pin.setMatrixAt(i, m);
    });
    for (const im of [legs, jacket, head, hat, arms, pin]) im.instanceMatrix.needsUpdate = true;
  };
  update(0, 0);
  void one;
  return {
    group,
    update(dt, t) { reactT += dt; update(dt, t); },
    react() { reactT = 0; },
  };
}
