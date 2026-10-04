import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeStatic } from '../../../engine/Builders';
import { charToon, Painter } from '../../../engine/Paint';
import { outline } from '../../../engine/Rig';
import { TAU } from '../../../engine/math';
import { css } from '../textures';
import { FUTURA } from '../film';
import { HEAD_R, campaignHat, coonskinCap, makeAdult, makeKid, peakedCap, wear, beanie, type Adult, type AdultOpts, type Figure, type Kid, type KidOpts } from '../people';
import { MK } from './textures';

/*
 * The people of New Penzance, built on the shared figures in ../people.ts (the Ghibli children and the Amélie
 * grown-ups), dressed for 1965: the Khaki Scouts' shirts with neckerchiefs and merit badges, Suzy's pink dress
 * and blue eyeshadow, Sam's coonskin cap and glasses, Mr. Bishop's plaid trousers, Captain Sharp's police
 * blues, Social Services' navy cape, the Narrator's red parka.
 *
 * A figure is dozens of meshes; `bake` merges everything that does not move into one mesh per material and
 * each moving joint's own meshes likewise, so a character costs a handful of draw calls. The troop of
 * scouts goes further: one instanced mesh per part and material for the whole troop (see `Troop`).
 */

export const INK = 0x2a1e24;
const mats = new Map<string, THREE.Material>();
/** one material per key, shared by everyone who asks for it */
export const shared = <T extends THREE.Material>(key: string, make: () => T): T => { let m = mats.get(key) as T | undefined; if (!m) { m = make(); mats.set(key, m); } return m; };
export const flat = (c: number, rim = 0.3) => shared(`flat${c}${rim}`, () => charToon({ color: c, rim }));
const lined = (m: THREE.Mesh) => { outline(m, INK, 1.3, 0.014); return m; };

/** Kid figures are about 2.4 tall; these scales give 1965 children of the right heights next to adults. */
export const KID = { tall: 0.6, scout: 0.58, small: 0.48 };

// ---------------------------------------------------------------- baking
/**
 * Resample every finely divided sphere-based mesh under `root` (sculpted hair, skulls) onto a coarser grid of
 * the same layout, keeping its shape, normals and UVs. For figures seen from a distance.
 */
export function lighten(root: THREE.Object3D, ws = 36, hs = 24) {
  const swaps = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry as THREE.SphereGeometry;
    if (g.type !== 'SphereGeometry' || !g.parameters || g.parameters.widthSegments <= ws + 4) return;
    let lo = swaps.get(g);
    if (!lo) {
      const W0 = g.parameters.widthSegments, H0 = g.parameters.heightSegments;
      const src = g.attributes.position as THREE.BufferAttribute, srcN = g.attributes.normal as THREE.BufferAttribute;
      lo = new THREE.SphereGeometry(1, ws, hs);
      const pos = lo.attributes.position as THREE.BufferAttribute, nrm = lo.attributes.normal as THREE.BufferAttribute;
      for (let iy = 0; iy <= hs; iy++) for (let ix = 0; ix <= ws; ix++) {
        const j = Math.round((iy / hs) * H0) * (W0 + 1) + Math.round((ix / ws) * W0), k = iy * (ws + 1) + ix;
        pos.setXYZ(k, src.getX(j), src.getY(j), src.getZ(j));
        nrm.setXYZ(k, srcN.getX(j), srcN.getY(j), srcN.getZ(j));
      }
      lo.computeBoundingSphere();
      swaps.set(g, lo);
    }
    m.geometry = lo;
  });
  return root;
}

const vcMats = new Map<string, THREE.Material>();
/**
 * Give every plain-coloured cel material under `root` (charToon or toon, no map) one shared material per
 * shading style, with the colour moved into the geometry's vertex colours, so a merge can put a whole
 * room of furniture (or a figure's skin, socks and shoes) into one draw call. Geometries are cloned first,
 * since primitives are often shared.
 */
export function unify(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.keep) return;
    const mat = m.material as THREE.MeshToonMaterial;
    if (mat.type !== 'MeshToonMaterial' || mat.map || mat.vertexColors || mat.transparent || mat.emissiveMap) return;
    const rim = (mat.userData.rim as { value: number } | undefined)?.value;
    const key = `${rim ?? 'toon'}|${mat.emissive.getHexString()}|${mat.side}|${mat.gradientMap?.uuid}`;
    let shared = vcMats.get(key);
    if (!shared) {
      shared = rim !== undefined
        ? charToon({ color: 0xffffff, rim, emissive: mat.emissive.clone(), side: mat.side, gradientMap: mat.gradientMap, vertexColors: true })
        : new THREE.MeshToonMaterial({ color: 0xffffff, emissive: mat.emissive.clone(), side: mat.side, gradientMap: mat.gradientMap, vertexColors: true });
      vcMats.set(key, shared);
    }
    const g = m.geometry.clone();
    const n = g.attributes.position.count, c = mat.color, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    m.geometry = g;
    m.material = shared;
  });
  return root;
}

/**
 * Merge a figure's meshes by material: the meshes of each part in `moving` stay with that part (so it can
 * still turn), everything else goes to `root`. Parts may nest (a forearm inside an upper arm).
 */
export function bake(root: THREE.Object3D, moving: THREE.Object3D[], castShadow = true) {
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline) m.castShadow = castShadow; });
  unify(root);
  const set = new Set(moving);
  const nearestMoving = (p: THREE.Object3D) => {
    const out: THREE.Object3D[] = [];
    const walk = (o: THREE.Object3D) => { for (const c of o.children) { if (set.has(c)) out.push(c); else walk(c); } };
    walk(p);
    return out;
  };
  for (const part of [root, ...moving]) {
    const kids = nearestMoving(part).map((c) => ({ c, parent: c.parent! }));
    for (const k of kids) k.parent.remove(k.c);
    mergeStatic(part);
    for (const k of kids) k.parent.add(k.c);
  }
  return root;
}

// ---------------------------------------------------------------- textures for the figures' clothes
/**
 * A shirt or jacket for the figures' lathe torsos, whose front is half way across the texture (u = 0.5) and
 * whose top row is the neck. Rows: the shoulders are at about 2/7 down, the waist at 5/7.
 */
export function torsoTexture(o: { color: number; pockets?: boolean; placket?: number; neckerchief?: number; badges?: boolean; collar?: number; cape?: boolean; stripes?: { color: number; n: number }; plaid?: number; zip?: boolean; seed?: number }) {
  const W = 512, H = 256, cx = W / 2;
  const p = new Painter(W, H, o.seed ?? 71).fill(css(o.color));
  const g = p.g;
  if (o.stripes) for (let i = 0; i < o.stripes.n; i++) { g.fillStyle = css(o.stripes.color); g.fillRect(0, H * 0.22 + i * (H * 0.72 / o.stripes.n), W, H * 0.3 / o.stripes.n); }
  p.lines({ n: 50, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.08], width: [1, 1.5], wobble: 0.5 });
  // side folds
  for (const u of [0.02, 0.25, 0.75, 0.98]) { const gr = g.createLinearGradient(u * W - 24, 0, u * W + 24, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(u * W - 24, 0, 48, H); }
  if (o.placket !== undefined) {
    g.fillStyle = css(o.color, 0.88); g.fillRect(cx - 5, H * 0.25, 10, H * 0.62);
    for (let i = 0; i < 4; i++) { g.fillStyle = css(o.placket); g.beginPath(); g.arc(cx, H * (0.34 + i * 0.13), 3.5, 0, TAU); g.fill(); }
  }
  if (o.zip) { g.fillStyle = css(o.color, 0.7); g.fillRect(cx - 2, H * 0.12, 4, H * 0.8); }
  if (o.pockets) for (const s of [-1, 1]) {
    const x = cx + s * 38;
    g.fillStyle = css(o.color, 0.84); g.fillRect(x - 17, H * 0.4, 34, 30);
    g.fillStyle = css(o.color, 0.74); g.fillRect(x - 18, H * 0.4 - 3, 36, 10);
    g.fillStyle = css(o.placket ?? o.color, 0.9); g.beginPath(); g.arc(x, H * 0.4 + 4, 2.5, 0, TAU); g.fill();
  }
  if (o.badges) {
    // merit badges on the left sleeve-side of the chest and a little row on the pocket
    const cols = ['#b0473a', '#3f8f8c', '#e2b33c', '#4a5a9a', '#f0a2a8', '#5a7a4a'];
    for (let i = 0; i < 6; i++) { g.fillStyle = cols[i]; g.beginPath(); g.arc(cx + 70 + (i % 3) * 14, H * 0.55 + Math.floor(i / 3) * 14, 6, 0, TAU); g.fill(); g.strokeStyle = '#f4ecda'; g.lineWidth = 1.5; g.stroke(); }
    // the troop number on the shoulder
    g.fillStyle = '#7a2a24'; g.font = `bold 14px ${FUTURA}`; g.textAlign = 'center'; g.fillText('55', cx + 92, H * 0.32);
  }
  if (o.collar !== undefined) {
    // a rounded Peter Pan collar
    g.fillStyle = css(o.collar);
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 22, H * 0.2, 26, 16, s * 0.2, 0, TAU); g.fill(); }
  }
  if (o.neckerchief !== undefined) {
    g.fillStyle = css(o.neckerchief);
    g.beginPath(); g.moveTo(cx - 54, H * 0.14); g.lineTo(cx + 54, H * 0.14); g.lineTo(cx, H * 0.6); g.closePath(); g.fill();
    g.fillStyle = css(o.neckerchief, 0.8); g.beginPath(); g.moveTo(cx - 54, H * 0.14); g.lineTo(cx + 54, H * 0.14); g.lineTo(cx, H * 0.24); g.closePath(); g.fill();
    // the woggle
    g.fillStyle = '#8a5a30'; g.beginPath(); g.ellipse(cx, H * 0.33, 9, 7, 0, 0, TAU); g.fill();
    // round the back of the neck
    g.fillStyle = css(o.neckerchief); g.fillRect(0, H * 0.1, W, H * 0.06);
  }
  if (o.cape) {
    // the cape's edge and its clasp
    g.fillStyle = css(o.color, 0.8); g.fillRect(cx - 3, H * 0.15, 6, H * 0.4);
    g.fillStyle = '#d8b25a'; g.beginPath(); g.arc(cx, H * 0.2, 6, 0, TAU); g.fill();
  }
  return p.texture();
}

/** Red tartan for Mr. Bishop's trousers. Tiles. */
export function plaid(base = 0xb0372e, line1 = 0x2a2a3a, line2 = 0xe2b33c) {
  const S = 128;
  const p = new Painter(S, S, 73).fill(css(base));
  const g = p.g;
  g.globalAlpha = 0.55; g.fillStyle = css(line1);
  for (const o of [0, 64]) { g.fillRect(o + 10, 0, 18, S); g.fillRect(0, o + 10, S, 18); }
  g.globalAlpha = 0.8; g.fillStyle = css(line2);
  for (const o of [0, 64]) { g.fillRect(o + 44, 0, 3, S); g.fillRect(0, o + 44, S, 3); }
  g.globalAlpha = 1;
  const t = p.texture({ repeat: [3, 3] });
  return t;
}

/** A knee sock for a shin (limb UVs: the canvas top is the knee): bare knee, then the sock with a turned cuff. */
export function sockShin(skin: number, sock: number) {
  const p = new Painter(64, 128, 75).fill(css(sock));
  const g = p.g;
  g.fillStyle = css(skin); g.fillRect(0, 0, 64, 30);
  g.fillStyle = css(sock, 0.85); g.fillRect(0, 30, 64, 12);
  for (let x = 0; x < 64; x += 6) { g.fillStyle = css(sock, 0.9); g.fillRect(x, 42, 2, 86); }
  return p.texture();
}

/** Swap every use of one material under a root for another. */
export function swapMat(root: THREE.Object3D, from: THREE.Material, to: THREE.Material) {
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material === from) m.material = to; });
}
/** The figure's torso mesh (a lathe on the spine). */
export function torsoOf(f: Figure) {
  return f.spine.children.find((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.type === 'LatheGeometry') as THREE.Mesh;
}
/** Dress a figure's torso in a painted top (sleeves keep the plain cloth). */
export function dressTorso(f: Figure, tex: THREE.Texture) {
  const torso = torsoOf(f);
  torso.material = charToon({ map: tex, rim: 0.35, shade: 0x9aa0cc });
}

/** Paint Suzy's powder-blue eyeshadow onto a kid's face (both the open and the blinking face). */
export function eyeshadow(k: Kid, color = 0x7aaad8) {
  const skull = k.head.children.find((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.type === 'SphereGeometry') as THREE.Mesh;
  const mat = skull.material as THREE.MeshToonMaterial;
  const paint = (tex: THREE.Texture | null) => {
    const c = tex?.image as HTMLCanvasElement | undefined;
    if (!c || !c.getContext) return;
    const g = c.getContext('2d')!;
    const W = c.width, H = c.height, f = W / TAU, cx = W * 0.25, cy = H * 0.5;
    g.save(); g.globalAlpha = 0.7; g.fillStyle = css(color);
    for (const s of [-1, 1]) { const ex = cx + s * 0.33 * f, ey = cy + 0.02 * f; g.beginPath(); g.ellipse(ex, ey - 0.12 * f, 0.16 * f, 0.075 * f, 0, Math.PI, TAU); g.fill(); }
    g.restore();
    tex!.needsUpdate = true;
  };
  const open = mat.map;
  paint(open);
  // make it blink once to find the closed-eye face (the lids are fully down 0.064 s into a blink), paint
  // that too, then open the eyes again
  k.tick(30, 0, null);
  k.tick(0.064, 0, null);
  if (mat.map !== open) paint(mat.map);
  k.tick(1, 0, null);
}

// ---------------------------------------------------------------- props
export function glasses(head: THREE.Object3D, R: number, color = 0x2a2018) {
  const m = flat(color, 0.2);
  for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.035, 5, 14), m); r.position.set(s * R * 0.33, -R * 0.02, R * 0.97); head.add(r); }
  const br = new THREE.Mesh(new THREE.BoxGeometry(R * 0.22, R * 0.035, R * 0.035), m); br.position.set(0, 0, R * 1.0); head.add(br);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(R * 0.03, R * 0.03, R * 0.9), m); arm.position.set(s * R * 0.52, 0, R * 0.55); head.add(arm); }
}

export function binoculars(s = 1) {
  const g = new THREE.Group();
  const body = flat(0x2a2a2e, 0.4), brass = flat(0xc8a050, 0.5);
  for (const x of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.04 * s, 0.16 * s, 10), body); b.rotation.x = Math.PI / 2; b.position.set(x * 0.05 * s, 0, 0); g.add(b);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 0.03 * s, 10), brass); lens.rotation.x = Math.PI / 2; lens.position.set(x * 0.05 * s, 0, 0.08 * s); g.add(lens);
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.03 * s, 0.08 * s), body));
  return g;
}

/** Mrs. Bishop's battery megaphone: a cream horn with a red ring, pointing along +z from a pistol grip. */
export function megaphone(s = 1) {
  const g = new THREE.Group();
  const cream = flat(0xf2ead6, 0.4), red = flat(0xb0372e, 0.4);
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * s, 0.05 * s, 0.38 * s, 18, 1, true), shared('mega', () => charToon({ color: 0xf2ead6, rim: 0.4, side: THREE.DoubleSide })));
  horn.rotation.x = -Math.PI / 2; horn.position.z = 0.22 * s; g.add(horn);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17 * s, 0.018 * s, 6, 20), red); ring.position.z = 0.41 * s; g.add(ring);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.12 * s, 12), cream); can.rotation.x = Math.PI / 2; g.add(can);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04 * s, 0.14 * s, 0.05 * s), red); grip.position.set(0, -0.08 * s, 0.02 * s); g.add(grip);
  lined(horn);
  return g;
}

let paperTex: THREE.Texture | null = null;
/** An open newspaper, held up: The New Penzance Gazette. Faces +z. */
export function newspaper(s = 1) {
  paperTex ??= (() => {
    const p = new Painter(256, 160, 77).fill('#ece4d0');
    const g = p.g;
    g.fillStyle = '#1e1a16'; g.font = 'bold 22px Georgia, serif'; g.textAlign = 'center'; g.fillText('The New Penzance Gazette', 128, 26);
    g.fillRect(10, 34, 236, 2);
    g.font = `bold 15px ${FUTURA}`; g.fillText('STORM EXPECTED ON SEPT. 5', 128, 54);
    for (let c = 0; c < 4; c++) for (let l = 0; l < 12; l++) g.fillRect(12 + c * 60, 66 + l * 7, 52 - (l % 5 === 4 ? 20 : 0), 3);
    g.fillStyle = '#9a9488'; g.fillRect(128, 0, 1, 160);
    return p.texture({ wrap: false });
  })();
  const geo = new THREE.PlaneGeometry(0.62 * s, 0.4 * s, 4, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -Math.abs(pos.getX(i)) * 0.3);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, shared('paper', () => charToon({ map: paperTex!, rim: 0.2, side: THREE.DoubleSide })));
  const g = new THREE.Group(); g.add(m);
  return g;
}

/** A portable record player: a powder-blue case, the turntable and arm. The record is returned so it can spin. */
export function recordPlayer(s = 1, caseColor = 0x7aa4c8) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.14 * s, 0.42 * s), flat(caseColor, 0.3)); body.position.y = 0.07 * s; g.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.4 * s, 0.03 * s), flat(caseColor, 0.3)); lid.position.set(0, 0.32 * s, -0.22 * s); lid.rotation.x = -0.25; g.add(lid);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.44 * s, 0.34 * s, 0.01 * s), flat(0xe8dcc0, 0.2)); inner.position.set(0, 0.32 * s, -0.2 * s); inner.rotation.x = -0.25; g.add(inner);
  const record = new THREE.Group(); record.position.set(-0.04 * s, 0.145 * s, 0.02 * s);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * s, 0.17 * s, 0.01 * s, 24), flat(0x141416, 0.6)); record.add(disc);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * s, 0.055 * s, 0.012 * s, 12), flat(0xc8402a, 0.3)); record.add(label);
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.013 * s, 0.012 * s), flat(0xf2e6c8, 0.2)); mark.position.x = 0.03 * s; record.add(mark);
  g.add(record);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.02 * s, 0.24 * s), flat(0xc8c4bc, 0.5)); arm.position.set(0.17 * s, 0.17 * s, 0.0); arm.rotation.y = 0.35; g.add(arm);
  lined(body);
  return { group: g, record };
}

export function clipboard(s = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.32 * s, 0.015 * s), flat(0x8a6040, 0.2)));
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.21 * s, 0.26 * s, 0.017 * s), flat(0xf4f0e4, 0.1)); paper.position.y = -0.02 * s; g.add(paper);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.03 * s, 0.03 * s), flat(0xb8b4ac, 0.5)); clip.position.y = 0.15 * s; g.add(clip);
  return g;
}

/** Sam's corncob pipe. */
export function pipe(s = 1) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.03 * s, 0.07 * s, 8), flat(0xd8b070, 0.2)); bowl.position.set(0, 0.035 * s, 0.1 * s); g.add(bowl);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * s, 0.008 * s, 0.12 * s, 5), flat(0x3a2a1a, 0.2)); stem.rotation.x = Math.PI / 2; stem.position.z = 0.05 * s; g.add(stem);
  return g;
}

/** A black umbrella, open; the handle at the origin, the canopy up. */
export function umbrella(s = 1, color = 0x1e1e26) {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.62 * s, 0.32 * s, 8, 1, true), shared(`umb${color}`, () => charToon({ color, rim: 0.4, side: THREE.DoubleSide })));
  canopy.position.y = 0.92 * s; g.add(canopy);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01 * s, 0.01 * s, 1.0 * s, 5), flat(0x2a2a2a)); shaft.position.y = 0.55 * s; g.add(shaft);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04 * s, 0.012 * s, 5, 10, Math.PI), flat(0x5a3a24)); handle.rotation.z = Math.PI; handle.position.set(0.04 * s, 0.06 * s, 0); g.add(handle);
  lined(canopy);
  return g;
}

/** Suzy's kitten in its wicker basket. */
export function kittenBasket(s = 1) {
  const g = new THREE.Group();
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.16 * s, 0.18 * s, 12, 1, true), shared('wicker', () => charToon({ map: (() => { const p = new Painter(64, 32, 79).fill('#b8884a'); for (let x = 0; x < 64; x += 4) { p.g.fillStyle = (x / 4) % 2 ? '#d8a860' : '#8a6030'; p.g.fillRect(x, 0, 2, 32); } return p.texture(); })(), rim: 0.3, side: THREE.DoubleSide })));
  basket.position.y = 0.09 * s; g.add(basket);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.16 * s, 12), flat(0x8a6030)); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.01 * s; g.add(bottom);
  const fur = flat(0xe8e0d0, 0.5);
  const head = new THREE.Group(); head.position.set(0, 0.22 * s, 0.02 * s); g.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 12, 10), fur));
  for (const x of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.06 * s, 6), fur); ear.position.set(x * 0.045 * s, 0.07 * s, 0); ear.rotation.z = -x * 0.3; head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012 * s, 6, 5), flat(0x2a3a2a, 0)); eye.position.set(x * 0.03 * s, 0.01 * s, 0.072 * s); head.add(eye);
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 10, 8), fur); body.scale.set(1, 0.8, 1.1); body.position.set(0, 0.15 * s, -0.03 * s); g.add(body);
  return { group: g, head };
}

// ---------------------------------------------------------------- figures
const kidBase = (o: Partial<KidOpts> & Pick<KidOpts, 'hair' | 'style' | 'top' | 'bottom' | 'seed'>): KidOpts => ({ sleeves: 'short', socks: 0xf2ece0, shoes: 0x3a2a20, ...o });

/** A Khaki Scout: shirt with neckerchief and badges, shorts, knee socks, campaign hat. Not yet baked. */
export function scoutKid(o: { hair: number; skin?: number; seed: number; hat?: boolean; sam?: boolean }): Kid {
  const k = makeKid(kidBase({
    skin: o.skin, hair: o.hair, style: 'short', top: MK.khaki, bottom: { kind: 'shorts', color: MK.khakiDark }, socks: MK.khaki, shoes: 0x4a3424, seed: o.seed,
    face: { mouth: 'small', blush: 0.35 },
  }));
  dressTorso(k, torsoTexture({ color: MK.khaki, pockets: true, placket: 0x7a6a44, neckerchief: MK.yellow, badges: true, seed: o.seed }));
  if (o.sam) { wear(k, coonskinCap(HEAD_R.kid)); glasses(k.head, HEAD_R.kid); }
  else if (o.hat !== false) wear(k, campaignHat(HEAD_R.kid, 0xb89a5a, 0x6a4a2a));
  return k;
}

export function suzyKid(seed = 101): Kid {
  const k = makeKid(kidBase({
    hair: 0x5a3020, style: 'bob', top: MK.pink, bottom: { kind: 'dress', color: MK.pink, length: 0.4 }, socks: 0xf6f2ea, shoes: 0x2a2024, seed,
    face: { mouth: 'small', blush: 0.25 },
  }));
  dressTorso(k, torsoTexture({ color: MK.pink, collar: 0xfbf8f2, seed }));
  eyeshadow(k);
  // a little white headband
  const band = new THREE.Mesh(new THREE.TorusGeometry(HEAD_R.kid * 1.06, 0.018, 5, 22, Math.PI), flat(0xfbf8f2, 0.3));
  band.rotation.set(0, Math.PI / 2, 0); band.position.set(0, HEAD_R.kid * 0.32, -0.02); band.rotation.z = 0; band.rotation.x = -0.35;
  k.head.add(band);
  return k;
}

export function brotherKid(i: number): Kid {
  const k = makeKid(kidBase({
    hair: [0x8a5a30, 0x6a4428, 0x9a6a38][i % 3], style: 'short', top: 0xf4ecda, stripes: { color: 0xb0473a, count: 7, width: 10 }, bottom: { kind: 'shorts', color: MK.navy }, socks: 0xf2ece0, shoes: 0x5a3a24, seed: 120 + i,
    face: { mouth: i === 1 ? 'open' : 'small', blush: 0.4 },
  }));
  return k;
}

const adultBase = (o: AdultOpts) => makeAdult(o);

export function mrsBishop(): Adult {
  return adultBase({ hair: 0x9a6a44, style: 'bob', fringe: 'none', top: 0xe8d4a8, sleeves: 'long', bottom: { kind: 'skirt', color: 0x5a6a7a, length: 0.6 }, shoes: 0x5a3a2a, coat: 0x8a9a7a, coatSkirt: false, seed: 201, scale: 0.94, face: { mouth: 'small' } });
}

export function mrBishop(): Adult {
  const a = adultBase({ hair: 0x9a8a7a, style: 'bald', top: 0xe8c86a, sleeves: 'short', bottom: { kind: 'trousers', color: 0xb0372e }, shoes: 0x4a3020, seed: 211, scale: 0.97, build: 1.12, face: { mouth: 'small' } });
  const tro = shared('plaid', () => charToon({ map: plaid(), rim: 0.35, shade: 0x9aa0cc, side: THREE.DoubleSide }));
  // the trousers' material is the one on the thighs
  const thigh = a.hip[0].children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
  swapMat(a.group, thigh.material as THREE.Material, tro);
  dressTorso(a, torsoTexture({ color: 0xe8c86a, placket: 0xc8a050, seed: 211 }));
  return a;
}

export function scoutMasterWard(): Adult {
  const a = adultBase({ hair: 0x5a3a24, style: 'short', top: MK.khaki, sleeves: 'short', bottom: { kind: 'trousers', color: MK.khakiDark }, shoes: 0x4a3020, seed: 221, face: { mouth: 'small' } });
  dressTorso(a, torsoTexture({ color: MK.khaki, pockets: true, placket: 0x7a6a44, neckerchief: MK.yellow, seed: 221 }));
  // shorts and knee socks: the shins become knee socks
  const sock = charToon({ map: sockShin(0xf1d2bc, MK.khaki), rim: 0.3 });
  for (const k of a.knee) { const shin = k.children.find((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.type === 'LatheGeometry') as THREE.Mesh; if (shin) shin.material = sock; }
  wear(a, campaignHat(HEAD_R.adult, 0xb89a5a, 0x6a4a2a));
  return a;
}

export function captainSharp(): Adult {
  const a = adultBase({ hair: 0x7a6a5a, style: 'bald', top: 0x9ab8d8, sleeves: 'short', bottom: { kind: 'trousers', color: MK.navy }, shoes: 0x1e1e22, glasses: true, seed: 231, face: { mouth: 'small' } });
  dressTorso(a, torsoTexture({ color: 0x9ab8d8, pockets: true, placket: 0xd8d8d0, seed: 231 }));
  wear(a, peakedCap(HEAD_R.adult, MK.navy, 0x1a1a22, 0xd8b25a));
  return a;
}

export function socialServices(): Adult {
  const a = adultBase({ hair: 0x3a2a20, style: 'bob', top: MK.navy, sleeves: 'long', bottom: { kind: 'skirt', color: MK.navy, length: 0.62 }, shoes: 0x141418, coat: 0x26304a, seed: 241, face: { mouth: 'small' } });
  dressTorso(a, torsoTexture({ color: 0x26304a, cape: true, seed: 241 }));
  // the cape: a bell of navy wool from the shoulders
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) { const k = i / 8; prof.push(new THREE.Vector2(0.12 + 0.2 * Math.pow(k, 0.7), 0.6 - k * 0.5)); }
  const cape = new THREE.Mesh(new THREE.LatheGeometry(prof.reverse(), 28), shared('cape', () => charToon({ color: 0x26304a, rim: 0.4, side: THREE.DoubleSide })));
  cape.scale.set(1, 1, 0.78);
  a.spine.add(cape); lined(cape);
  // a small navy hat with a brim
  const hat = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(HEAD_R.adult * 0.8, HEAD_R.adult * 0.95, HEAD_R.adult * 0.5, 18), flat(0x26304a, 0.4)); crown.position.y = HEAD_R.adult * 0.95; hat.add(crown);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(HEAD_R.adult * 1.35, HEAD_R.adult * 1.35, 0.012, 22), flat(0x26304a, 0.4)); brim.position.y = HEAD_R.adult * 0.72; hat.add(brim);
  lined(crown);
  wear(a, hat);
  return a;
}

/** The Narrator: red hooded parka, green knit hat, a grey beard. */
export function narrator(): Adult {
  const a = adultBase({ hair: 0x8a8478, style: 'short', top: 0xc8402a, sleeves: 'long', bottom: { kind: 'trousers', color: 0x4a4a42 }, shoes: 0x3a2a20, coat: 0xc8402a, seed: 251, scale: 0.94, face: { mouth: 'small' } });
  dressTorso(a, torsoTexture({ color: 0xc8402a, zip: true, pockets: true, seed: 251 }));
  wear(a, beanie(HEAD_R.adult, 0x3f6a3a));
  const beard = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R.adult * 0.75, 14, 10, 0, TAU, Math.PI * 0.45, Math.PI * 0.4), flat(0x9a948a, 0.3));
  beard.position.set(0, -0.02, 0.04); beard.scale.set(1.12, 1, 1.08); a.head.add(beard);
  // the hood, down on his back
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.05, 6, 14), flat(0xb8382a)); hood.position.set(0, 0.6, -0.08); hood.rotation.x = Math.PI / 2 + 0.4; a.spine.add(hood);
  return a;
}

// ---------------------------------------------------------------- the troop, instanced
/**
 * The ink outline (see engine/Rig.ts) for instanced meshes: the shared outline shader skips the instance
 * matrix, so the troop gets its own.
 */
function instancedOutline(color: THREE.Color) {
  return shared(`ioutline${color.getHexString()}`, () => {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', /* glsl */ `
        vec4 mvPosition = vec4( transformed, 1.0 );
        vec3 olN = normal;
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          olN = mat3( instanceMatrix ) * olN;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        vec3 olVN = normalize( normalMatrix * olN );
        mvPosition.xyz += olVN * min( 0.00143 * -mvPosition.z, 0.014 );
        gl_Position = projectionMatrix * mvPosition;`);
    };
    m.customProgramCacheKey = () => 'inkOutlineInstanced1';
    return m;
  });
}
const isOutline = (m: THREE.Material) => m.type === 'MeshBasicMaterial' && m.side === THREE.BackSide;
interface PartDef { name: string; root: THREE.Object3D; parent: string | null; exclude: THREE.Object3D[] }
interface Part { name: string; parent: number; local: THREE.Matrix4; meshes: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }> }

/** The meshes under `root` (but not under any of `exclude`) merged per material, in root's space. */
function collect(root: THREE.Object3D, exclude: THREE.Object3D[]) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const walk = (o: THREE.Object3D) => {
    if (exclude.includes(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material)) {
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const mat = m.material as THREE.Material;
      if (!by.has(mat)) by.set(mat, []);
      by.get(mat)!.push(g);
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return [...by].map(([mat, list]) => ({ mat, geo: mergeGeometries(list, false)! }));
}

export interface ScoutPose {
  /** in the troop group's space */
  pos: THREE.Vector3; yaw: number; scale: number;
  head: { yaw: number; pitch: number };
  /** right arm: shoulder [x, z], elbow x; left arm swing; legs swing */
  armR: [number, number, number]; armL: number; legs: number; bob: number;
}

/**
 * A troop of scouts drawn with one instanced mesh per part and material. Built from two template scouts
 * (heads differ), parts: body, head, right upper arm, right forearm, left arm, legs. Pose each scout with
 * `pose[i]` and call `update()`.
 */
export class Troop {
  readonly group = new THREE.Group();
  readonly pose: ScoutPose[] = [];
  private parts: Part[] = [];
  private meshes: Array<{ part: number; variant: number | null; im: THREE.InstancedMesh; idx: number[] }> = [];
  private variantOf: number[];
  private m = Array.from({ length: 8 }, () => new THREE.Matrix4());
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();

  constructor(count: number, variants: number[], bounds: THREE.Sphere) {
    this.variantOf = variants;
    const templates = [scoutKid({ hair: 0x6a4428, seed: 301 }), scoutKid({ hair: 0xc89a58, skin: 0xf6dcc4, seed: 307 }), scoutKid({ hair: 0x2a1e18, skin: 0xc89070, seed: 311 })];
    const t0 = templates[0];
    const defs = (k: Kid): PartDef[] => [
      { name: 'body', root: k.group, parent: null, exclude: [k.head, k.shoulder[0], k.shoulder[1], k.hip[0], k.hip[1]] },
      { name: 'head', root: k.head, parent: 'body', exclude: [] },
      { name: 'upperR', root: k.shoulder[0], parent: 'body', exclude: [k.elbow[0]] },
      { name: 'foreR', root: k.elbow[0], parent: 'upperR', exclude: [] },
      { name: 'armL', root: k.shoulder[1], parent: 'body', exclude: [] },
      { name: 'legR', root: k.hip[0], parent: 'body', exclude: [] },
      { name: 'legL', root: k.hip[1], parent: 'body', exclude: [] },
    ];
    for (const t of templates) { lighten(t.group, 32, 20); unify(t.group); t.group.updateWorldMatrix(true, true); }
    const d0 = defs(t0);
    d0.forEach((d, i) => {
      const parent = d.parent ? d0.findIndex((x) => x.name === d.parent) : -1;
      const pm = parent >= 0 ? d0[parent].root.matrixWorld : t0.group.matrixWorld;
      const local = new THREE.Matrix4().copy(pm).invert().multiply(d.root.matrixWorld);
      this.parts.push({ name: d.name, parent, local, meshes: d.name === 'head' ? [] : collect(d.root, d.exclude) });
      void i;
    });
    const headPart = this.parts.findIndex((p) => p.name === 'head');
    this.parts.forEach((p, pi) => {
      if (pi === headPart) {
        templates.forEach((t, v) => {
          const idx = variants.map((vv, i) => (vv === v ? i : -1)).filter((i) => i >= 0);
          if (!idx.length) return;
          for (const { geo, mat } of collect(t.head, [])) {
            const im = new THREE.InstancedMesh(geo, mat, idx.length);
            im.boundingSphere = bounds.clone(); im.castShadow = true;
            this.group.add(im); this.meshes.push({ part: pi, variant: v, im, idx });
          }
        });
      } else {
        const idx = Array.from({ length: count }, (_, i) => i);
        for (const { geo, mat } of p.meshes) {
          const im = new THREE.InstancedMesh(geo, mat, count);
          im.boundingSphere = bounds.clone(); im.castShadow = true;
          this.group.add(im); this.meshes.push({ part: pi, variant: null, im, idx });
        }
      }
    });
    // outlines: the instancing-aware shader, and no shadow
    for (const e of this.meshes) {
      const m = e.im.material as THREE.MeshBasicMaterial;
      if (isOutline(m)) { e.im.material = instancedOutline(m.color); e.im.castShadow = false; }
    }
    for (let i = 0; i < count; i++) this.pose.push({ pos: new THREE.Vector3(), yaw: 0, scale: KID.scout, head: { yaw: 0, pitch: 0 }, armR: [0, 0, 0], armL: 0, legs: 0, bob: 0 });
  }

  /** world matrices of every part for scout i, into this.m */
  private solve(i: number) {
    const P = this.pose[i];
    const base = this.tmp.compose(this.s.copy(P.pos).setY(P.pos.y + P.bob), this.q.setFromEuler(this.e.set(0, P.yaw, 0)), new THREE.Vector3(P.scale, P.scale, P.scale));
    this.parts.forEach((p, pi) => {
      const parent = p.parent >= 0 ? this.m[p.parent] : base;
      const out = this.m[pi].multiplyMatrices(parent, p.local);
      let rx = 0, ry = 0, rz = 0;
      switch (p.name) {
        case 'head': ry = P.head.yaw; rx = P.head.pitch; break;
        case 'upperR': rx = P.armR[0]; rz = P.armR[1]; break;
        case 'foreR': rx = P.armR[2]; break;
        case 'armL': rx = P.armL; break;
        case 'legR': rx = P.legs; break;
        case 'legL': rx = -P.legs; break;
      }
      if (rx || ry || rz) out.multiply(new THREE.Matrix4().makeRotationFromEuler(this.e.set(rx, ry, rz, 'YXZ')));
    });
  }

  update() {
    const n = this.pose.length;
    const slots = new Map<THREE.InstancedMesh, number>();
    for (let i = 0; i < n; i++) {
      this.solve(i);
      for (const e of this.meshes) {
        if (e.variant !== null && this.variantOf[i] !== e.variant) continue;
        const k = slots.get(e.im) ?? 0;
        e.im.setMatrixAt(k, this.m[e.part]);
        slots.set(e.im, k + 1);
      }
    }
    for (const e of this.meshes) e.im.instanceMatrix.needsUpdate = true;
  }
}

export type { Figure, Kid, Adult };
