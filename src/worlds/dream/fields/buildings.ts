import * as THREE from 'three';
import { box, cone, cyl, glow, mesh, roofGeometry } from '../../../engine/Builders';
import { fluffyTree, type Blob } from '../../../engine/Foliage';
import { charToon, Painter, repeatUV } from '../../../engine/Paint';
import { outline } from '../../../engine/Rig';
import { Rng, TAU } from '../../../engine/math';
import { hipGableRoof } from '../../ghibli/farmhouse';
import { roofTileTexture } from '../../ghibli/korikoAtlas';
import { barkTexture, granite, vermilion } from '../../ghibli/propTextures';
import { woodGrain } from '../../ghibli/characterTextures';
import type { HouseSpot } from './land';

/*
 * The buildings of the fields: farm houses with their paper doors lit from inside, a white storehouse, the
 * great camphor tree with its sacred rope and a little shrine at its foot, the Inari shrine with its red
 * gates and stone foxes, and the Inari-mae bus stop sign.
 *
 * Every builder works in its own frame (front towards +z, origin on the ground) and is placed by the scene.
 * Materials are made once and shared, so each kind of surface merges into one draw call.
 */

// ---------- painted textures ----------
/** One bay of wall, 2 units wide: plaster above a dark beam, dark boards with battens below. */
function wallTexture() {
  const p = new Painter(128, 256, 6101).fill('#ddd2b8');
  const g = p.g;
  p.dabs({ n: 30, colors: ['#c8bc9e', '#e8dfc8'], r: [6, 18], alpha: [0.15, 0.35], y: [0, 0.4] });
  g.fillStyle = '#3d2f23'; g.fillRect(0, 256 * 0.42, 128, 256 * 0.58);
  for (let x = 8; x < 128; x += 18) { g.fillStyle = 'rgba(15,8,4,0.5)'; g.fillRect(x, 256 * 0.42, 3, 256); g.fillStyle = 'rgba(140,110,80,0.15)'; g.fillRect(x + 3, 256 * 0.42, 2, 256); }
  g.fillStyle = '#2e2219'; g.fillRect(0, 256 * 0.4, 128, 9); g.fillRect(0, 0, 8, 256); g.fillRect(0, 0, 128, 7);
  return p.texture();
}
/** A paper door or window lit from inside: warm paper in a grid of thin wooden bars. */
function shojiTexture() {
  const p = new Painter(128, 128, 6102);
  const g = p.g;
  const gr = g.createRadialGradient(64, 70, 6, 64, 64, 96);
  gr.addColorStop(0, '#fff6e0'); gr.addColorStop(1, '#e8c890');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#4a3020';
  for (let i = 0; i <= 3; i++) g.fillRect(i * 41.3, 0, 4, 128);
  for (let j = 0; j <= 4; j++) g.fillRect(0, j * 31, 128, 4);
  // someone's shadow on one panel
  g.fillStyle = 'rgba(120,70,40,0.25)'; g.beginPath(); g.ellipse(90, 66, 14, 30, 0, 0, TAU); g.fill();
  return p.texture({ wrap: false });
}
/** Old straw thatch: strands running down the slope, darker patches and moss. */
function thatchTexture() {
  const p = new Painter(256, 256, 6103).fill('#7e6a48');
  p.lines({ n: 160, colors: ['#9a8458', '#5e4c32', '#a8926a', '#6e5a3c'], alpha: [0.3, 0.7], width: [1, 3], vertical: true, wobble: 2 });
  p.dabs({ n: 40, colors: ['#4a5a30', '#3a3020', '#5a6a3a'], r: [8, 26], alpha: [0.15, 0.35] });
  return p.texture({ repeat: [1, 1] });
}
/** Twisted straw rope, for the sacred rope round the camphor tree. */
function ropeTexture() {
  const p = new Painter(256, 32, 6104).fill('#c8b078');
  const g = p.g;
  for (let x = -32; x < 288; x += 16) { g.fillStyle = 'rgba(90,70,30,0.45)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 6, 0); g.lineTo(x + 22, 32); g.lineTo(x + 16, 32); g.closePath(); g.fill(); }
  return p.texture({ repeat: [1, 1] });
}
/** The bus stop sign: the stop's name in a ring, and its name in Roman letters underneath. */
function signTexture() {
  const p = new Painter(256, 256, 6105);
  const g = p.g;
  g.fillStyle = '#f2ecdc'; g.beginPath(); g.arc(128, 128, 126, 0, TAU); g.fill();
  g.strokeStyle = '#b82a2a'; g.lineWidth = 14; g.beginPath(); g.arc(128, 128, 112, 0, TAU); g.stroke();
  g.fillStyle = '#1f2f5a'; g.font = 'bold 66px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('稲荷前', 128, 116);
  g.font = 'bold 22px sans-serif'; g.fillText('INARI-MAE', 128, 172);
  g.fillStyle = '#b82a2a'; g.fillRect(64, 64, 128, 6);
  return p.texture({ wrap: false });
}

export interface FieldMats {
  wall: THREE.Material; plaster: THREE.Material; timber: THREE.Material; wood: THREE.Material; stone: THREE.Material;
  thatch: THREE.Material; tiles: THREE.Material; redTiles: THREE.Material; clap: THREE.Material;
  shoji: THREE.MeshBasicMaterial; lamp: THREE.MeshBasicMaterial; shutter: THREE.Material; red: THREE.Material; black: THREE.Material;
  /** white-painted stone for the Inari foxes, and their red bibs */
  fox: THREE.Material; bib: THREE.Material;
}
export function fieldMats(): FieldMats {
  const tileTex = roofTileTexture(17);
  return {
    wall: new THREE.MeshLambertMaterial({ map: wallTexture() }),
    plaster: new THREE.MeshLambertMaterial({ color: 0xe6dfcf, side: THREE.DoubleSide }),
    timber: new THREE.MeshLambertMaterial({ color: 0x3a2b1f }),
    wood: new THREE.MeshLambertMaterial({ map: woodGrain(0x6a5038, 6110) }),
    stone: new THREE.MeshLambertMaterial({ map: granite(0x8e8c84, 6111) }),
    thatch: new THREE.MeshLambertMaterial({ map: thatchTexture(), side: THREE.DoubleSide }),
    tiles: new THREE.MeshLambertMaterial({ map: tileTex, color: 0x606a76, side: THREE.DoubleSide }),
    redTiles: new THREE.MeshLambertMaterial({ map: tileTex, color: 0xb8503a, side: THREE.DoubleSide }),
    clap: new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }),
    shoji: new THREE.MeshBasicMaterial({ map: shojiTexture(), color: new THREE.Color(1.0, 0.8, 0.52).multiplyScalar(1.6) }),
    lamp: glow(0xffc870, 1.9),
    shutter: new THREE.MeshLambertMaterial({ color: 0x3a2c20 }),
    red: new THREE.MeshLambertMaterial({ map: vermilion() }),
    black: new THREE.MeshLambertMaterial({ color: 0x1e1c1c }),
    fox: charToon({ color: 0xe8e2d4, rim: 0.3 }),
    bib: new THREE.MeshLambertMaterial({ color: 0xc8302a, side: THREE.DoubleSide }),
  };
}

/** A vertical wall plane w x h facing +z (rotate to place), its texture repeating every `bay` units across. */
function wallPlane(w: number, h: number, mat: THREE.Material, bay = 2) {
  const g = repeatUV(new THREE.PlaneGeometry(w, h), w / bay, 1);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * A farm house: walls of plaster over dark boards, paper doors along the front (some lit, some closed
 * behind wooden shutters), a deep veranda, a thatched or tiled roof. The tiled kind has a small
 * Western-style annex with a red roof. Returns the house and the spots where its windows glow.
 */
export function farmhouse(kind: HouseSpot['kind'], M: FieldMats, rng: Rng) {
  const g = new THREE.Group();
  const glows: THREE.Vector3[] = [];
  const small = kind === 'small';
  const W = small ? 7 : 12, D = small ? 5.5 : 8, H = small ? 2.7 : 3.2, base = 0.5;
  g.add(box(W + 0.3, base + 0.6, D + 0.3, M.stone, 0, (base - 0.6) / 2, 0));
  // walls
  const back = wallPlane(W, H, M.wall); back.position.set(0, base + H / 2, -D / 2); back.rotation.y = Math.PI; g.add(back);
  for (const s of [-1, 1]) { const w = wallPlane(D, H, M.wall); w.position.set(s * W / 2, base + H / 2, 0); w.rotation.y = s * Math.PI / 2; g.add(w); }
  const front = wallPlane(W, H, M.timber, W); front.position.set(0, base + H / 2, D / 2 - 0.02); g.add(front);
  // the front: a row of paper doors, about half of them lit, the rest closed behind shutters
  const n = Math.round(W / 1.0), pw = W / n;
  const door = small ? -1 : Math.floor(n / 2) - 1 + rng.int(0, 1);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (i + 0.5) * pw;
    const lit = i === door || rng.chance(small ? 0.6 : 0.5);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.08, H - 0.55), lit ? M.shoji : M.shutter);
    panel.position.set(x, base + (H - 0.55) / 2 + 0.05, D / 2 + 0.01);
    g.add(panel);
    if (lit) glows.push(new THREE.Vector3(x, base + 1.2, D / 2 + 0.1));
  }
  // the door stands open: a deep lit doorway
  if (door >= 0) {
    const x = -W / 2 + (door + 0.5) * pw;
    g.add(mesh(new THREE.PlaneGeometry(pw * 1.6, H - 0.6), M.lamp, x, base + (H - 0.6) / 2, D / 2 + 0.03));
  }
  // small lit windows high in the side walls and the back
  for (const s of [-1, 1]) if (rng.chance(0.7)) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), M.shoji);
    win.position.set(s * (W / 2 + 0.02), base + H * 0.62, rng.range(-D / 4, D / 4)); win.rotation.y = s * Math.PI / 2;
    g.add(win);
    glows.push(win.position.clone());
  }
  // the veranda: a deck of boards under the eaves, posts carrying a beam
  if (!small) {
    g.add(box(W, 0.14, 1.3, M.wood, 0, base - 0.05, D / 2 + 0.65));
    for (let i = 0; i <= 6; i++) g.add(box(0.16, H, 0.16, M.timber, -W / 2 + (i * W) / 6, base + H / 2, D / 2 + 1.25));
    g.add(box(W + 0.4, 0.22, 0.22, M.timber, 0, base + H - 0.1, D / 2 + 1.25));
    // stepping stone
    g.add(box(1.3, 0.3, 0.7, M.stone, -1.5, 0.12, D / 2 + 1.8));
  }
  // the roof
  if (kind === 'thatch') {
    const roof = hipGableRoof(W + 3.0, D + 3.6, 5.4, M.thatch, M.plaster);
    roof.position.set(0, base + H - 0.1, 0.3);
    g.add(roof);
    // the thatch is thick at the eaves
    const ex = (W + 3.0) / 2, ez = (D + 3.6) / 2;
    g.add(box(W + 3.0, 0.45, 0.6, M.thatch, 0, base + H - 0.25, 0.3 + ez - 0.3));
    g.add(box(W + 3.0, 0.45, 0.6, M.thatch, 0, base + H - 0.25, 0.3 - ez + 0.3));
    for (const s of [-1, 1]) g.add(box(0.6, 0.45, D + 3.6, M.thatch, s * (ex - 0.3), base + H - 0.25, 0.3));
  } else {
    const roof = hipGableRoof(W + 2.4, D + 2.9, small ? 2.6 : 3.4, M.tiles, M.plaster);
    roof.position.set(0, base + H - 0.1, small ? 0 : 0.4);
    g.add(roof);
  }
  // under the eaves it is dark
  const soffit = new THREE.Mesh(new THREE.PlaneGeometry(W + 2.4, D + 2.6), M.timber);
  soffit.rotation.x = Math.PI / 2; soffit.position.set(0, base + H - 0.12, 0.3);
  g.add(soffit);
  if (kind === 'tile') {
    // the Western-style annex on the right, with a red roof and a lit window
    const aw = 4.6, ad = 4.8, ah = 4.8, ax = W / 2 + aw / 2 - 0.2, az = -0.8;
    g.add(box(aw + 0.2, 1, ad + 0.2, M.stone, ax, 0, az));
    for (const [w, x, z, ry] of [[aw, ax, az + ad / 2, 0], [aw, ax, az - ad / 2, Math.PI], [ad, ax + aw / 2, az, Math.PI / 2]] as const) {
      const p = wallPlane(w, ah, M.clap, 2.4); p.position.set(x, 0.5 + ah / 2, z); p.rotation.y = ry; g.add(p);
    }
    for (const [y, z] of [[3.4, az + ad / 2 + 0.03], [1.7, az + ad / 2 + 0.03]] as const) {
      g.add(mesh(new THREE.PlaneGeometry(1.5, 1.5), M.clap, ax, y, z - 0.01));
      g.add(mesh(new THREE.PlaneGeometry(1.2, 1.2), M.shoji, ax, y, z));
      glows.push(new THREE.Vector3(ax, y, z + 0.1));
    }
    const ar = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(aw, ad) / 2 + 0.8, 2.8, 4, 1), M.redTiles);
    ar.rotation.y = Math.PI / 4; ar.position.set(ax, 0.5 + ah + 1.4, az); ar.castShadow = true;
    g.add(ar);
  }
  if (kind === 'thatch') {
    // the hand pump on its stone slab, and a stack of firewood under the eaves
    const px = W / 2 - 1.2, pz = D / 2 + 3.6;
    g.add(box(1.6, 0.3, 1.6, M.stone, px, 0.1, pz));
    g.add(cyl(0.14, 0.18, 1.3, M.black, px, 0.9, pz, 8));
    const handle = box(0.06, 0.06, 1.0, M.black, px, 1.5, pz + 0.4); handle.rotation.x = -0.4; g.add(handle);
    const spout = box(0.08, 0.08, 0.4, M.black, px, 1.2, pz - 0.25); g.add(spout);
    for (let i = 0; i < 9; i++) { const log = cyl(0.13, 0.13, 1.6, M.wood, -W / 2 + 0.6 + (i % 3) * 0.28, 0.2 + Math.floor(i / 3) * 0.24, -D / 2 - 0.5, 7); log.rotation.x = Math.PI / 2; g.add(log); }
  }
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== M.shoji && m.material !== M.lamp) { m.castShadow = true; m.receiveShadow = true; } });
  return { group: g, glows };
}

/** A white plastered storehouse (kura) with a dark base, a heavy tiled roof and a small shuttered window. */
export function storehouse(M: FieldMats) {
  const g = new THREE.Group();
  g.add(box(4.8, 5.2, 4.8, M.plaster, 0, 2.6, 0));
  g.add(box(4.9, 1.2, 4.9, M.black, 0, 0.6, 0));
  g.add(box(1.0, 0.8, 0.1, M.black, 0, 4.0, 2.45));
  const roof = hipGableRoof(6.2, 6.2, 2.6, M.tiles, M.plaster);
  roof.position.y = 5.15;
  g.add(roof);
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

/** A vermilion torii gate, `w` between its posts and `h` tall, facing +z. */
export function torii(w: number, h: number, M: FieldMats) {
  const g = new THREE.Group();
  const r = h * 0.055;
  for (const s of [-1, 1]) g.add(mesh(repeatUV(new THREE.CylinderGeometry(r, r * 1.1, h, 12), 1, 1), M.red, s * w / 2, h / 2, 0));
  g.add(box(w + h * 0.5, h * 0.08, h * 0.12, M.black, 0, h + h * 0.04, 0));
  g.add(box(w + h * 0.36, h * 0.07, h * 0.1, M.red, 0, h - h * 0.05, 0));
  g.add(box(w + h * 0.1, h * 0.06, h * 0.06, M.red, 0, h * 0.8, 0));
  g.add(box(h * 0.08, h * 0.16, h * 0.05, M.red, 0, h * 0.9, 0));
  // the upturned ends of the top beam
  for (const s of [-1, 1]) { const tip = box(h * 0.2, h * 0.07, h * 0.12, M.black, s * (w / 2 + h * 0.3), h + h * 0.07, 0); tip.rotation.z = s * 0.25; g.add(tip); }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

/** A granite lantern with a lit fire box. Returns the lantern and where its light is (local). */
export function stoneLantern(M: FieldMats, s = 1) {
  const g = new THREE.Group();
  g.add(box(0.9 * s, 0.25 * s, 0.9 * s, M.stone, 0, 0.12 * s, 0));
  g.add(cyl(0.18 * s, 0.24 * s, 1.2 * s, M.stone, 0, 0.85 * s, 0, 8));
  g.add(box(0.75 * s, 0.15 * s, 0.75 * s, M.stone, 0, 1.5 * s, 0));
  g.add(box(0.5 * s, 0.45 * s, 0.5 * s, M.lamp, 0, 1.8 * s, 0));
  g.add(cone(0.65 * s, 0.45 * s, M.stone, 0, 2.25 * s, 0, 4).rotateY(Math.PI / 4));
  g.add(mesh(new THREE.SphereGeometry(0.1 * s, 8, 6), M.stone, 0, 2.55 * s, 0));
  return { group: g, light: new THREE.Vector3(0, 1.8 * s, 0) };
}

/** A small wooden wayside shrine on a stone plinth, its doors faintly lit, under a little gabled roof. */
export function wayShrine(M: FieldMats, s = 1) {
  const g = new THREE.Group();
  g.add(box(1.7 * s, 0.6 * s, 1.5 * s, M.stone, 0, 0.3 * s, 0));
  g.add(box(1.1 * s, 1.0 * s, 0.9 * s, M.timber, 0, 1.1 * s, 0));
  g.add(mesh(new THREE.PlaneGeometry(0.7 * s, 0.7 * s), M.shoji, 0, 1.1 * s, 0.46 * s));
  const roof = new THREE.Mesh(roofGeometry(1.5 * s, 1.4 * s, 0.6 * s, 0.25 * s), M.tiles);
  roof.rotation.y = Math.PI / 2; roof.position.y = 1.6 * s;
  g.add(roof);
  g.add(box(0.12 * s, 0.12 * s, 2.0 * s, M.black, 0, 2.22 * s, 0));
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

/** A stone Inari fox sitting up, a red bib at its neck, eyes that can glint. Faces +z. */
export function stoneFox(M: FieldMats, eyes: THREE.Material) {
  const g = new THREE.Group();
  const white = M.fox;
  g.add(box(0.7, 0.5, 0.9, M.stone, 0, 0.25, 0));
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), white); body.scale.set(0.24, 0.42, 0.3); body.position.set(0, 0.88, -0.05); g.add(body);
  const head = new THREE.Group(); head.position.set(0, 1.38, 0.06); g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.17, 14, 10), white));
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 10), white); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.03, 0.2); head.add(snout);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), white); ear.position.set(s * 0.09, 0.18, -0.02); ear.rotation.z = -s * 0.25; head.add(ear);
    head.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), eyes, s * 0.07, 0.04, 0.14));
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.08, 8, 14, Math.PI * 1.2), white); tail.position.set(0.12, 0.85, -0.3); tail.rotation.set(0, Math.PI / 2, 0.6); g.add(tail);
  const bib = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.26, 12, 1, true, -1.2, 2.4), M.bib);
  bib.position.set(0, 1.12, 0.03);
  g.add(bib);
  outline(body, 0x2a2420, 1.2, 0.015);
  return g;
}

/**
 * The great camphor tree on its mound: a vast gnarled trunk with buttress roots and a hollow at its foot,
 * the sacred rope (shimenawa) with its white paper streamers round the trunk, great limbs, and a crown of
 * leaves that rises far above the power lines. Origin at the foot of the trunk; the hollow faces -x (the lane).
 */
export function camphorTree(rng: Rng) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ map: barkTexture(0x5a4838) });
  const bark = (rt: number, rb: number, h: number, seg: number) => repeatUV(new THREE.CylinderGeometry(rt, rb, h, seg), Math.max(1, Math.round((TAU * (rt + rb)) / 2 / 6)), h / 6);
  const wood = new THREE.Group();
  g.add(wood);
  const up = new THREE.Vector3(0, 1, 0);
  /** turn a cylinder so its axis points along `d` */
  const aim = (m: THREE.Mesh, d: THREE.Vector3) => m.quaternion.setFromUnitVectors(up, d.normalize());
  const trunk = new THREE.Mesh(bark(3.6, 5.6, 28, 18), trunkMat); trunk.position.y = 13; wood.add(trunk);
  // a second, leaning stem fused into the first, so the trunk is not a plain column
  const stem = new THREE.Mesh(bark(2.4, 3.8, 18, 14), trunkMat); stem.position.set(1.6, 18, 1.2); stem.rotation.set(0.12, 0, -0.16); wood.add(stem);
  // buttress roots, leaning in to the trunk (none straight in front of the hollow, which faces -x)
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * TAU + rng.range(-0.1, 0.1);
    const root = new THREE.Mesh(bark(2.0, 0.6, 8, 8), trunkMat);
    root.position.set(Math.cos(a) * 5.0, 1.4, Math.sin(a) * 5.0);
    aim(root, new THREE.Vector3(-Math.cos(a) * Math.sin(0.95), Math.cos(0.95), -Math.sin(a) * Math.sin(0.95)));
    wood.add(root);
  }
  // great limbs reaching out and up into the crown
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rng.range(-0.25, 0.25);
    const len = rng.range(14, 19), tilt = rng.range(0.75, 1.05);
    const d = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    const limb = new THREE.Mesh(bark(0.6, 1.7, len, 9), trunkMat);
    limb.position.set(0, 23 + rng.range(-2, 3), 0).addScaledVector(d, len / 2);
    aim(limb, d);
    wood.add(limb);
  }
  wood.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // the hollow at the foot, facing the lane
  const hollow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
  hollow.scale.set(1.3, 2.0, 1); hollow.position.set(-5.45, 2.1, 0.2); hollow.rotation.y = -Math.PI / 2;
  g.add(hollow);
  // the sacred rope with its zigzag paper streamers
  const ropeMat = new THREE.MeshLambertMaterial({ map: ropeTexture() });
  const rope = new THREE.Mesh(repeatUV(new THREE.TorusGeometry(5.45, 0.34, 8, 72), 24, 1), ropeMat);
  rope.rotation.x = Math.PI / 2; rope.position.y = 3.4;
  g.add(rope);
  const paper = new THREE.MeshLambertMaterial({ color: 0xf6f4ee, emissive: 0x2a2a30, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i - 3) * 0.32;
    const shide = new THREE.Group();
    for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3), paper); p.position.set((k % 2) * 0.16, -0.3 - k * 0.28, 0); shide.add(p); }
    shide.position.set(Math.cos(a) * 5.75, 3.2, Math.sin(a) * 5.75);
    shide.rotation.y = -a + Math.PI / 2;
    g.add(shide);
  }
  // the crown: one vast soft cloud of leaves made of many smaller ones
  const blobs: Blob[] = [
    { c: new THREE.Vector3(0, 42, 0), r: new THREE.Vector3(22, 13, 22) },
    { c: new THREE.Vector3(2, 55, -2), r: new THREE.Vector3(13, 8, 13) },
  ];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rng.range(-0.2, 0.2), d = rng.range(17, 23);
    blobs.push({ c: new THREE.Vector3(Math.cos(a) * d, rng.range(32, 38), Math.sin(a) * d), r: new THREE.Vector3(rng.range(10, 13), rng.range(7, 9), rng.range(10, 13)) });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4, d = rng.range(25, 29);
    blobs.push({ c: new THREE.Vector3(Math.cos(a) * d, rng.range(26, 29), Math.sin(a) * d), r: new THREE.Vector3(7, 5, 7) });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 1.1;
    blobs.push({ c: new THREE.Vector3(Math.cos(a) * 10, rng.range(50, 54), Math.sin(a) * 10), r: new THREE.Vector3(9, 6.5, 9) });
  }
  const crown = new THREE.Group();
  crown.add(fluffyTree(blobs, 0x3c7434, rng, { density: 0.12, cardScale: 0.62 }));
  g.add(crown);
  return { group: g, crown, wood };
}

/** The bus stop sign: a round sign on a post, a timetable board under it, on a concrete foot. Faces +z. */
export function busStopSign(M: FieldMats) {
  const g = new THREE.Group();
  const post = new THREE.MeshLambertMaterial({ color: 0xd8d4c8 });
  g.add(cyl(0.3, 0.34, 0.25, M.stone, 0, 0.12, 0, 12));
  g.add(cyl(0.05, 0.05, 2.7, post, 0, 1.35, 0, 8));
  const sign = new THREE.Group(); sign.position.y = 2.75; g.add(sign);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.52, 28), new THREE.MeshLambertMaterial({ map: signTexture(), side: THREE.DoubleSide, emissive: 0x141418 }));
  sign.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.025, 6, 28), post); sign.add(rim);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.6), new THREE.MeshLambertMaterial({ map: timetableTexture(), side: THREE.DoubleSide }));
  board.position.y = 1.55; g.add(board);
  return { group: g, sign };
}

function timetableTexture() {
  const p = new Painter(64, 96, 6106).fill('#ece6d4');
  const g = p.g;
  g.fillStyle = '#1f2f5a'; g.fillRect(0, 0, 64, 14);
  g.fillStyle = 'rgba(30,30,40,0.7)';
  for (let r = 0; r < 9; r++) { g.fillRect(6, 20 + r * 8, 14, 3); g.fillRect(26, 20 + r * 8, 30 * (0.4 + ((r * 37) % 10) / 16), 3); }
  return p.texture({ wrap: false });
}

/** A plain wooden bench. */
export function bench(M: FieldMats) {
  const g = new THREE.Group();
  g.add(box(1.8, 0.08, 0.42, M.wood, 0, 0.46, 0));
  for (const s of [-1, 1]) g.add(box(0.08, 0.46, 0.38, M.timber, s * 0.75, 0.23, 0));
  g.add(box(1.8, 0.3, 0.05, M.wood, 0, 0.8, -0.2));
  return g;
}

