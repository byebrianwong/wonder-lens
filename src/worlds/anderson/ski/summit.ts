import * as THREE from 'three';
import { box, cone, cyl, mergeStatic, mesh, roofGeometry, sphere, toon } from '../../../engine/Builders';
import { Painter, boxUV, repeatUV } from '../../../engine/Paint';
import { TAU, clamp } from '../../../engine/math';
import { facadeTile, fishScales, planks, stucco } from '../textures';
import { PAL, rod } from '../kit';
import { SPOT } from './plan';
import { bannerTexture, signTexture } from './textures';

/*
 * The summit of Gabelmeister's Peak: the start house of the run (straddling the path behind the rider), the
 * start gate, the observatory on its crag to the right with a great brass telescope poking out of its dome,
 * the monastery chapel on its terrace to the left with an onion-domed bell tower and the confessional
 * beside its door, and the cable car's summit station with two red gondolas on their cables down to the
 * valley.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const mats = new Map<string, THREE.Material>();
const m = (k: string, make: () => THREE.Material) => { let x = mats.get(k); if (!x) { x = make(); mats.set(k, x); } return x; };
const white = () => m('white', () => toon(0xfbf8f4));
const pinkT = () => m('pink', () => toon(0xf2b8c6));
const brass = () => m('brass', () => toon(PAL.brass));
const iron = () => m('iron', () => toon(0x2e3038));
const woodD = () => m('woodD', () => toon(0x7a4a30));

/** A flat painted panel (a sign, a clock face): the picture on the front, a frame behind. */
function panel(tex: THREE.Texture, w: number, h: number, frame = 0xfbf8f4) {
  const g = new THREE.Group();
  g.add(box(w + 0.14, h + 0.14, 0.1, m(`fr${frame}`, () => toon(frame)), 0, 0, -0.06));
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }), 0, 0, 0.001));
  return g;
}

/** A clock face with Roman hours, at ten past ten. */
function clockTexture() {
  const p = new Painter(128, 128, 701).fill('#fbf6ea');
  const g = p.g;
  g.strokeStyle = '#2a2c30'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 58, 0, TAU); g.stroke();
  g.fillStyle = '#2a2c30'; g.font = `bold 14px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const R = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  R.forEach((r, i) => { const a = (i / 12) * TAU; g.fillText(r, 64 + Math.sin(a) * 45, 64 - Math.cos(a) * 45); });
  g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(TAU * 10 / 12) * 26, 64 - Math.cos(TAU * 10 / 12) * 26); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(TAU * 2 / 12) * 40, 64 - Math.cos(TAU * 2 / 12) * 40); g.stroke();
  return p.texture({ wrap: false });
}

/** A flagpole with a long banner that the set flutters (returned so it can move). */
export function flagpole(h: number, field: number, trim: number, kind: 'keys' | 'stripe' | 'plain' = 'stripe') {
  const g = new THREE.Group();
  g.add(cyl(0.07, 0.1, h, white(), 0, h / 2, 0, 6));
  g.add(sphere(0.14, brass(), 0, h + 0.1, 0, 8, 6));
  const flag = new THREE.Group();
  flag.position.set(0, h - 0.2, 0);
  const geo = new THREE.PlaneGeometry(1.1, 2.4, 4, 6);
  geo.translate(0.55, -1.2, 0);
  const f = new THREE.Mesh(geo, m(`ban${field}${trim}${kind}`, () => toon(0xffffff, { map: bannerTexture(field, trim, kind), side: THREE.DoubleSide, alphaTest: 0.5 })));
  // the banner moves, so merging leaves it alone; the pole merges with the rest of the scenery
  f.userData.keep = true;
  flag.add(f);
  g.add(flag);
  return { group: g, flag };
}

// ---------------- the start house ----------------
/** A timber start house over the run, its arch facing down the mountain, with a clock and START lettering. */
export function buildStartHut() {
  const g = new THREE.Group();
  const wall = m('hutwall', () => new THREE.MeshLambertMaterial({ map: stucco(0xf6dfe4, 702) }));
  const timber = m('timber', () => toon(0x8a5034));
  const roofM = m('hutroof', () => new THREE.MeshLambertMaterial({ map: fishScales(0x7a2a36, 703) }));
  // two piers either side of the run and a bridge storey over it
  for (const s of [-1, 1]) g.add(mesh(boxUV(new THREE.BoxGeometry(4.2, 6, 6), 3), wall, s * 4.6, 3, 0));
  g.add(mesh(boxUV(new THREE.BoxGeometry(13.4, 3.4, 6), 3), wall, 0, 7.7, 0));
  // half-timbering on the front (facing -z)
  for (const x of [-6.6, -2.6, 2.6, 6.6]) g.add(box(0.3, 9.4, 0.2, timber, x, 4.7, -3.05));
  g.add(box(13.6, 0.3, 0.2, timber, 0, 6.1, -3.05), box(13.6, 0.3, 0.2, timber, 0, 9.3, -3.05));
  // the arch over the run, its keystone, and a red-and-white striped lintel
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.32, 6, 18, Math.PI), white());
  arch.position.set(0, 4.2, -3.1);
  g.add(arch);
  g.add(box(0.7, 0.9, 0.5, pinkT(), 0, 6.8, -3.2));
  // the roof
  const r2 = new THREE.Mesh(roofGeometry(6, 13.4, 3.6, 0.8), roofM);
  r2.rotation.y = Math.PI / 2; r2.position.set(0, 9.4, 0);
  g.add(r2);
  // clock in the gable and the name board
  const ck = panel(clockTexture(), 2, 2);
  ck.position.set(0, 10.7, -3.4); ck.rotation.y = Math.PI;
  g.add(ck);
  const sign = panel(signTexture('START', { bg: '#7a2a36', fg: '#fbe8c8', sub: 'Gabelmeister Bobbahn' }), 5.2, 1.3, 0xf6efe2);
  sign.position.set(0, 7.8, -3.25); sign.rotation.y = Math.PI;
  g.add(sign);
  // flower boxes of red geraniums under two windows, and the windows themselves
  const win = m('hutwin', () => toon(0x3a4a6a));
  for (const s of [-1, 1]) {
    g.add(box(1.6, 1.8, 0.1, white(), s * 4.6, 3.6, -3.06), box(1.3, 1.5, 0.12, win, s * 4.6, 3.6, -3.08));
    g.add(box(1.8, 0.4, 0.4, woodD(), s * 4.6, 2.5, -3.2));
    for (let i = 0; i < 5; i++) g.add(sphere(0.17, m('geranium', () => toon(0xd8323c)), s * 4.6 - 0.7 + i * 0.35, 2.8, -3.3, 6, 5));
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------------- the start gate ----------------
/** Two candy-striped poles and a banner board across the run, with pennants on a line between them. */
export function buildGate() {
  const g = new THREE.Group();
  const stripeTex = (() => { const p = new Painter(16, 64, 711).fill('#fbf8f4'); p.g.fillStyle = '#c8323c'; for (let y = 0; y < 64; y += 32) p.g.fillRect(0, y, 16, 16); return p.texture({ repeat: [1, 1] }); })();
  const poleM = new THREE.MeshLambertMaterial({ map: stripeTex });
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(repeatUV(new THREE.CylinderGeometry(0.16, 0.2, 7.2, 10), 1, 7), poleM);
    pole.position.set(s * 4.4, 3.6, 0);
    g.add(pole);
    g.add(sphere(0.3, brass(), s * 4.4, 7.35, 0, 10, 8));
  }
  const board = panel(signTexture("GABELMEISTER'S PEAK", { bg: '#2a3a6a', fg: '#f6efe2', w: 1024, h: 128, sub: 'Bobbahn · Sprungschanze · 2,018 m' }), 8.2, 1.2, 0xf6efe2);
  // the name faces the rider arriving from the start; GUTE FAHRT is on the back
  board.position.set(0, 6.3, 0.07);
  g.add(board);
  const back = panel(signTexture('GUTE FAHRT', { bg: '#2a3a6a', fg: '#f6efe2', w: 1024, h: 128 }), 8.2, 1.2, 0xf6efe2);
  back.position.set(0, 6.3, -0.07); back.rotation.y = Math.PI;
  g.add(back);
  // pennants on a line below the board
  const cols = [0xc8323c, 0xf2b8c6, 0x5d3a8a, 0xf6efe2, 0x6a9fd8];
  for (let i = 0; i < 13; i++) {
    const x = -4 + i * (8 / 12);
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 3), m(`pen${cols[i % 5]}`, () => toon(cols[i % 5])));
    p.rotation.x = Math.PI; p.position.set(x, 5.25 - Math.sin((i / 12) * Math.PI) * 0.35, 0);
    g.add(p);
  }
  g.add(box(8.8, 0.03, 0.03, iron(), 0, 5.5, 0));
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

// ---------------- the observatory ----------------
/** Drum tower wall: white stucco, pink pilasters and arched windows; wraps once round a cylinder. */
function drumTexture() {
  const W = 1024, H = 256;
  const p = new Painter(W, H, 721).fill('#f8f2f0');
  const g = p.g;
  p.dabs({ n: 80, colors: ['#ffffff', '#ece4e8'], r: [10, 40], alpha: [0.1, 0.2], squash: 0.6 });
  const bays = 10;
  for (let i = 0; i < bays; i++) {
    const x0 = (i / bays) * W;
    g.fillStyle = '#f2b8c6'; g.fillRect(x0, 0, 14, H);
    const cx = x0 + W / bays / 2;
    // an arched window with a pale frame and dark glass
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(cx - 24, 200); g.lineTo(cx - 24, 110); g.arc(cx, 110, 24, Math.PI, 0); g.lineTo(cx + 24, 200); g.closePath(); g.fill();
    g.fillStyle = '#4a5a80'; g.beginPath(); g.moveTo(cx - 17, 196); g.lineTo(cx - 17, 112); g.arc(cx, 112, 17, Math.PI, 0); g.lineTo(cx + 17, 196); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.fillRect(cx - 1.5, 96, 3, 100); g.fillRect(cx - 17, 150, 34, 3);
  }
  g.fillStyle = '#f2b8c6'; g.fillRect(0, 0, W, 22); g.fillRect(0, H - 18, W, 18);
  g.fillStyle = '#fbe6ea'; g.fillRect(0, 22, W, 6);
  return p.texture({ repeat: [1, 1] });
}

/** The dome: riveted silver panels in ribs, with the open slit painted dark. Sphere UVs (top at the top). */
function domeTexture() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 722).fill('#c8cee0');
  const g = p.g;
  for (let i = 0; i < 24; i++) {
    const x = (i / 24) * W;
    g.fillStyle = i % 2 ? '#d6dcea' : '#bcc4d8'; g.fillRect(x, 0, W / 24, H);
    g.fillStyle = 'rgba(80,90,120,0.4)'; g.fillRect(x, 0, 2, H);
  }
  for (let y = 20; y < H; y += 24) { g.fillStyle = 'rgba(80,90,120,0.25)'; g.fillRect(0, y, W, 1.5); }
  // the slit, facing the front of the sphere (+z is a quarter of the way across)
  g.fillStyle = '#1e2234'; g.fillRect(W * 0.25 - 26, 0, 52, H * 0.5);
  return p.texture({ repeat: [1, 1] });
}

export interface Observatory {
  group: THREE.Group;
  /** turns with the dome; the telescope sits in it */
  dome: THREE.Group;
  telescope: THREE.Group;
  anchor: THREE.Object3D;
}

export function buildObservatory(): Observatory {
  const g = new THREE.Group();
  const wallM = m('obswall', () => new THREE.MeshLambertMaterial({ map: stucco(0xf8f2f0, 723) }));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.3, 9, 40, 1, true), new THREE.MeshLambertMaterial({ map: drumTexture(), side: THREE.DoubleSide }));
  drum.position.y = 4.5;
  g.add(drum);
  g.add(cyl(6.6, 6.6, 0.5, white(), 0, 9.1, 0, 40), cyl(6.5, 6.8, 0.6, pinkT(), 0, 0.3, 0, 40));
  // the dome turns; the telescope comes out of its slit
  const dome = new THREE.Group();
  dome.position.y = 9.3;
  const dm = new THREE.Mesh(new THREE.SphereGeometry(6.2, 40, 16, 0, TAU, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ map: domeTexture() }));
  dome.add(dm);
  // shutters standing either side of the slit
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(6.35, 6, 10, 0, 0.16, 0, Math.PI / 2), m('shut', () => toon(0xa8b0c8, { side: THREE.DoubleSide })));
    sh.rotation.y = s * 0.22 - 0.08 + (s > 0 ? -0.0 : 0);
    dome.add(sh);
  }
  dome.add(sphere(0.35, brass(), 0, 6.2, 0, 10, 8));
  // the great brass telescope, much too big for its dome
  const telescope = new THREE.Group();
  telescope.position.set(0, 1.2, 0);
  {
    const tube = new THREE.Group();
    tube.add(cyl(1.0, 1.25, 15, brass(), 0, 4.5, 0, 20));
    tube.add(cyl(1.42, 1.42, 1.2, m('brassD', () => toon(0xb08a3a)), 0, 11.6, 0, 20));
    tube.add(cyl(1.32, 1.32, 0.3, m('brassD', () => toon(0xb08a3a)), 0, 7.0, 0, 20));
    tube.add(cyl(1.32, 1.32, 0.3, m('brassD', () => toon(0xb08a3a)), 0, 2.0, 0, 20));
    tube.add(cyl(1.18, 1.18, 0.25, m('lens', () => toon(0x3a5a8a)), 0, 12.15, 0, 20));
    tube.add(cyl(0.3, 0.4, 2.2, brass(), 0, -3.5, 0, 10));
    tube.add(cyl(0.45, 0.45, 0.4, iron(), 0, -4.6, 0, 10));
    // a little finder scope on the side
    tube.add(cyl(0.22, 0.22, 3.4, brass(), 1.3, 7, 0, 8));
    tube.rotation.x = 0.85;
    telescope.add(tube);
    telescope.add(cyl(0.6, 0.9, 2.4, iron(), 0, -0.6, 0, 10));
  }
  dome.add(telescope);
  g.add(dome);
  // the front wing towards the run, with the door and the name board
  const fac = facadeTile({ wall: 0xf8f2f0, frame: 0xfbf8f4, bays: 3, storeys: 1, arch: true, cornice: 0xf2b8c6, pilaster: 0xf2c6d0, lit: 0, glass: 'night', seed: 724 });
  const facM = new THREE.MeshLambertMaterial({ map: fac.map });
  g.add(mesh(boxUV(new THREE.BoxGeometry(11.4, 4.6, 5), 11.4, 4.6), facM, 0, 2.3, 7.4));
  g.add(box(12, 0.5, 5.6, white(), 0, 4.85, 7.4));
  // a balustrade on the wing's roof
  for (let i = 0; i < 17; i++) g.add(cyl(0.12, 0.16, 0.8, white(), -5.6 + i * 0.7, 5.5, 9.9, 6));
  g.add(box(12, 0.2, 0.3, white(), 0, 6.0, 9.9));
  g.add(box(2.2, 3.2, 0.3, m('door', () => toon(0x5a3a5a)), 0, 1.6, 9.95));
  const name = panel(signTexture('OBSERVATORIUM', { bg: '#f6efe2', fg: '#2a3a6a', w: 768, h: 128 }), 6.4, 1.0, 0xf2b8c6);
  name.position.set(0, 4.0, 10.0);
  g.add(name);
  // two small domed turrets either side of the wing
  for (const s of [-1, 1]) {
    g.add(cyl(1.6, 1.7, 6.4, wallM, s * 7.2, 3.2, 6.8, 16));
    g.add(cyl(1.85, 1.85, 0.35, pinkT(), s * 7.2, 6.5, 6.8, 16));
    const sd = new THREE.Mesh(new THREE.SphereGeometry(1.75, 16, 8, 0, TAU, 0, Math.PI / 2), m('domeS', () => new THREE.MeshLambertMaterial({ map: domeTexture() })));
    sd.position.set(s * 7.2, 6.65, 6.8); sd.rotation.y = s * 0.6;
    g.add(sd);
    const ts = cyl(0.22, 0.3, 3, brass(), s * 7.6, 8.4, 7.6, 10);
    ts.rotation.set(0.7, 0, -s * 0.4);
    g.add(ts);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const anchor = new THREE.Object3D();
  anchor.position.set(0, 9, 3);
  g.add(anchor);
  // the dome and the telescope move: merge each one's parts, and keep them out of the scene-wide merge
  mergeStatic(telescope);
  telescope.traverse((o) => { o.userData.keep = true; });
  mergeStatic(dome);
  dome.traverse((o) => { o.userData.keep = true; });
  return { group: g, dome, telescope, anchor };
}

// ---------------- the chapel ----------------
/** The monastery chapel: white walls, pink trim, a shingled roof and an onion-domed bell tower over the door. */
export function buildChapel() {
  const g = new THREE.Group();
  const wallM = m('chwall', () => new THREE.MeshLambertMaterial({ map: stucco(0xfaf6f2, 731) }));
  const roofM = m('chroof', () => new THREE.MeshLambertMaterial({ map: fishScales(0x6a5a8a, 732) }));
  const onion = m('onion', () => toon(0x6aa898));
  // the nave, its long axis along local z, the front (with the door) at +z
  g.add(mesh(boxUV(new THREE.BoxGeometry(8, 6.4, 13), 3), wallM, 0, 3.2, 0));
  const roof = new THREE.Mesh(roofGeometry(8, 13, 3.4, 0.7), roofM);
  roof.position.set(0, 6.4, 0);
  g.add(roof);
  // the front gable, the door and a round window
  const gable = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([V(-4, 6.4, 6.52), V(4, 6.4, 6.52), V(0, 9.8, 6.52)]), wallM);
  gable.geometry.computeVertexNormals();
  g.add(gable);
  g.add(box(8.2, 0.35, 0.3, pinkT(), 0, 6.45, 6.6));
  for (const s of [-1, 1]) g.add(box(0.5, 6.4, 0.3, pinkT(), s * 3.9, 3.2, 6.62));
  const door = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 16, 1, false, -Math.PI / 2, Math.PI), m('chdoor', () => toon(0x6a3a2a)));
  door.rotation.x = Math.PI / 2; door.position.set(0, 2.4, 6.6);
  g.add(door, box(2.2, 2.4, 0.3, m('chdoor', () => toon(0x6a3a2a)), 0, 1.2, 6.6));
  g.add(cyl(0.8, 0.8, 0.2, m('rose', () => toon(0x4a5a8a)), 0, 4.8, 6.62, 16).rotateX(Math.PI / 2));
  // tall windows down the sides
  for (const s of [-1, 1]) for (const z of [-3.5, 0, 3.5]) g.add(box(0.12, 2.4, 1.1, m('chwin', () => toon(0x4a5a80)), s * 4.02, 3.6, z));
  // the bell tower rising from the front, with the bell in its open lantern and the onion dome
  const tw = new THREE.Group();
  tw.position.set(0, 6.4, 5.2);
  tw.add(mesh(boxUV(new THREE.BoxGeometry(3, 6, 3), 3), wallM, 0, 3, 0));
  tw.add(box(3.3, 0.3, 3.3, pinkT(), 0, 6.1, 0));
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) tw.add(box(0.4, 2.2, 0.4, white(), x, 7.3, z));
  tw.add(box(3.3, 0.3, 3.3, pinkT(), 0, 8.5, 0));
  const bell = new THREE.Group();
  bell.position.set(0, 8.2, 0);
  bell.add(cone(0.7, 1.1, brass(), 0, -0.6, 0, 12));
  bell.add(sphere(0.18, brass(), 0, -1.2, 0, 6, 5));
  tw.add(bell);
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; prof.push(new THREE.Vector2(Math.max(0.02, 1.6 * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - t * 0.45) + (t > 0.85 ? 0 : 0)), t * 3.6)); }
  const on = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), onion);
  on.position.y = 8.65;
  tw.add(on);
  tw.add(cyl(0.05, 0.05, 1.4, brass(), 0, 12.9, 0, 4), box(0.7, 0.08, 0.08, brass(), 0, 13.1, 0), sphere(0.15, brass(), 0, 12.3, 0, 8, 6));
  // a clock on the tower's face
  const ck = panel(clockTexture(), 1.6, 1.6);
  ck.position.set(0, 4.3, 1.56);
  tw.add(ck);
  g.add(tw);
  // the confessional to the right of the door: a little wooden booth with a latticed window
  const conf = new THREE.Group();
  conf.position.set(3.0, 0, 8.4);
  // Serge X.'s anxious eyes peering out through the lattice
  const lat = (() => { const p = new Painter(64, 64, 733).fill('#3a2418'); for (const x of [24, 40]) { p.g.fillStyle = '#f6efe2'; p.g.beginPath(); p.g.ellipse(x, 30, 6, 4, 0, 0, TAU); p.g.fill(); p.g.fillStyle = '#1a1210'; p.g.beginPath(); p.g.arc(x + 1, 30, 2.4, 0, TAU); p.g.fill(); } p.g.strokeStyle = '#a8784a'; p.g.lineWidth = 3; for (let i = -64; i < 128; i += 10) { p.g.beginPath(); p.g.moveTo(i, 0); p.g.lineTo(i + 64, 64); p.g.stroke(); p.g.beginPath(); p.g.moveTo(i + 64, 0); p.g.lineTo(i, 64); p.g.stroke(); } return p.texture({ wrap: false }); })();
  const cw = m('confwood', () => new THREE.MeshLambertMaterial({ map: planks(0x9a6038, 734) }));
  conf.add(mesh(boxUV(new THREE.BoxGeometry(2.6, 2.6, 1.3), 1), cw, 0, 1.3, 0));
  conf.add(box(2.9, 0.25, 1.6, woodD(), 0, 2.7, 0));
  conf.add(cone(0.35, 0.6, woodD(), 0, 3.1, 0, 4));
  conf.add(mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshLambertMaterial({ map: lat }), 0.55, 1.6, 0.66));
  conf.add(box(0.9, 1.9, 0.06, m('curtain', () => toon(0x8a2a3a)), -0.6, 1.05, 0.67));
  g.add(conf);
  // the name over the door
  const name = panel(signTexture('KLOSTER', { bg: '#faf6f2', fg: '#7a2a36', w: 512, h: 128 }), 2.6, 0.65, 0xf2b8c6);
  name.position.set(0, 3.85, 6.78);
  g.add(name);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, bell };
}

// ---------------- the cable car ----------------
export interface CableCar {
  group: THREE.Group;
  /** the climbing gondola (the photo subject) */
  car: THREE.Group;
  other: THREE.Group;
  /** the gondola's place along its cable, 0 at the summit station */
  place(t: number, swing: number, t2: number): void;
}

/** The cable's point at t (0 at the summit, 1 in the valley), sagging between its ends. */
export function cablePoint(a: THREE.Vector3, b: THREE.Vector3, t: number, sag: number, out = new THREE.Vector3()) {
  out.lerpVectors(a, b, t);
  out.y -= sag * 4 * t * (1 - t);
  return out;
}

/** One red gondola: a box with big windows, the line's name on its side, a hanger and a wheeled carriage. */
function gondola() {
  const g = new THREE.Group();
  const red = m('gred', () => toon(0xc8323c));
  const cream = m('gcream', () => toon(0xf6efe2));
  const glass = m('gglass', () => toon(0x3a4a6a));
  // the cabin and its hanger swing together from the carriage on the cable
  const hang = new THREE.Group();
  g.add(hang);
  g.userData.swing = hang;
  const body = new THREE.Group();
  body.position.y = -5.2;
  body.add(box(6.4, 3.8, 4.4, red, 0, 0, 0));
  body.add(box(6.6, 0.4, 4.6, cream, 0, 2.0, 0), box(6.6, 0.4, 4.6, cream, 0, -2.0, 0));
  // windows all round, with a little conductor at the front one
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) body.add(box(1.5, 1.5, 0.08, glass, -2 + i * 2, 0.45, s * 2.22));
    body.add(box(0.08, 1.5, 3.2, glass, s * 3.22, 0.45, 0));
    const name = panel(signTexture('GABELMEISTER', { bg: '#c8323c', fg: '#f6efe2', w: 512, h: 96 }), 4.6, 0.62, 0xf6efe2);
    name.position.set(0, -1.15, s * 2.28); if (s < 0) name.rotation.y = Math.PI;
    body.add(name);
  }
  // a conductor in a peaked cap inside
  const man = new THREE.Group();
  man.add(cyl(0.38, 0.45, 1.2, m('gcoat', () => toon(0x2a3a6a)), 0, -0.6, 0, 8));
  man.add(sphere(0.3, m('gskin', () => toon(0xf1cfb4)), 0, 0.25, 0, 10, 8));
  man.add(cyl(0.32, 0.3, 0.2, m('gcoat', () => toon(0x2a3a6a)), 0, 0.52, 0, 10));
  man.position.set(2.1, 0.2, 1.3);
  body.add(man);
  // the roof, the hanger arm and the carriage on the cable
  body.add(box(5.8, 0.5, 3.8, cream, 0, 2.4, 0));
  hang.add(body);
  hang.add(box(0.3, 3.2, 0.3, iron(), 0, -1.6, 0));
  g.add(box(2.6, 0.5, 0.5, iron(), 0, 0, 0));
  for (const x of [-1, 1]) g.add(cyl(0.38, 0.38, 0.3, iron(), x, 0.2, 0, 10).rotateX(Math.PI / 2));
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  // the cabin swings and the whole gondola travels: merge its parts, and keep them out of the scene-wide merge
  mergeStatic(hang);
  const carriage = new THREE.Group();
  for (const c of [...g.children]) if (c !== hang) carriage.add(c);
  g.add(carriage);
  mergeStatic(carriage);
  g.traverse((o) => { o.userData.keep = true; });
  return g;
}

export const CABLE = { a: V(48, 69, -606), b: V(250, -30, -760), sag: 16, gap: 4 };

export function buildCableCar(): CableCar {
  const group = new THREE.Group();
  // the summit station: a pink platform house on the observatory's crag, with the great wheel
  const st = new THREE.Group();
  st.position.copy(SPOT.station);
  const wallM = m('stwall', () => new THREE.MeshLambertMaterial({ map: stucco(0xf2c6d0, 741) }));
  st.add(mesh(boxUV(new THREE.BoxGeometry(9, 7, 8), 3), wallM, 0, 3.5, 0));
  const roof = new THREE.Mesh(roofGeometry(9, 8, 2.6, 0.6), m('stroof', () => new THREE.MeshLambertMaterial({ map: fishScales(0x5a6a9a, 742) })));
  roof.position.set(0, 7, 0);
  st.add(roof);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.22, 6, 28), iron());
  wheel.rotation.x = Math.PI / 2; wheel.position.set(3.4, 8.6, -3.6);
  st.add(wheel);
  st.add(box(1.2, 4, 1.2, iron(), 3.4, 6.6, -3.6));
  const name = panel(signTexture('SEILBAHN', { bg: '#2a3a6a', fg: '#f6efe2', w: 512, h: 128 }), 4, 0.9, 0xf6efe2);
  name.position.set(0, 5.6, 4.06);
  st.add(name);
  st.rotation.y = -0.7;
  group.add(st);
  // two cables (up and down) and the support towers part way down
  const side = new THREE.Vector3().subVectors(CABLE.b, CABLE.a).setY(0).normalize();
  const across = V(-side.z, 0, side.x).multiplyScalar(CABLE.gap / 2);
  const cableM = m('cable', () => toon(0x24262c));
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) pts.push(cablePoint(CABLE.a, CABLE.b, i / 40, CABLE.sag).addScaledVector(across, s));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.09, 4, false), cableM));
  }
  for (const t of [0.42]) {
    const p = cablePoint(CABLE.a, CABLE.b, t, CABLE.sag);
    const foot = p.clone(); foot.y = -40;
    const tw = rod(foot, p.clone().add(V(0, 1, 0)), 0.7, iron(), 6);
    group.add(tw);
    group.add(box(0.6, 0.6, CABLE.gap + 2, iron(), p.x, p.y + 0.8, p.z).rotateY(Math.atan2(side.x, side.z)));
  }
  const car = gondola(), other = gondola();
  group.add(car, other);
  const yaw = Math.atan2(side.x, side.z);
  return {
    group, car, other,
    place(t, swing, t2) {
      const p = cablePoint(CABLE.a, CABLE.b, clamp(t, 0, 1), CABLE.sag).addScaledVector(across, 1);
      car.position.copy(p); car.rotation.set(0, yaw + Math.PI / 2, 0);
      (car.userData.swing as THREE.Group).rotation.x = swing;
      const q = cablePoint(CABLE.a, CABLE.b, clamp(t2, 0, 1), CABLE.sag).addScaledVector(across, -1);
      other.position.copy(q); other.rotation.set(0, yaw + Math.PI / 2, 0);
      (other.userData.swing as THREE.Group).rotation.x = Math.sin(t2 * 40) * 0.02;
    },
  };
}

