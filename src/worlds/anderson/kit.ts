import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, glow, box, cyl, cone, sphere, mesh, canvasTexture, instanced, type Placement } from '../../engine/Builders';
import { boxUV } from '../../engine/Paint';

/**
 * Small shared pieces for the Zubrowka Express scenes: the pastel palette, painted-map materials, boxes whose
 * texture keeps its size on every face, sign boards, topiary, and props instanced in stretches along z.
 * Painted textures are in textures.ts (walls, roofs, paving, planks, awnings) and characterTextures.ts.
 */

/** The pastel palette shared by every scene. */
export const PAL = { pink: 0xf2b8c6, deepPink: 0xe58fa6, burgundy: 0x7a2a36, red: 0xb93a4c, mint: 0xa8d8c8, mustard: 0xe8c04a, powder: 0xa9c8e8, cream: 0xf6efe2, white: 0xfbf8f4, brass: 0xd8b25a, dark: 0x2a2c30, sage: 0x7fa58a, turquoise: 0x6fc4c0, orange: 0xe8743a };

/** A Lambert material with a painted map. */
export const texMat = (map: THREE.Texture, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map, ...o });

export function tiled(w: number, h: number, d: number, mat: THREE.Material, tileW: number, tileH: number, x = 0, y = 0, z = 0) {
  return mesh(boxUV(new THREE.BoxGeometry(w, h, d), tileW, tileH), mat, x, y, z);
}

export function signBoard(text: string, w: number, h: number, o: { color?: string; bg?: string; border?: string; font?: string; texW?: number; texH?: number; sub?: string; frame?: number } = {}) {
  const texW = o.texW ?? 512, texH = o.texH ?? 128;
  const tex = canvasTexture(texW, texH, (c) => {
    c.fillStyle = o.bg ?? '#fbf7f2'; c.fillRect(0, 0, texW, texH);
    if (o.border) { const lw = Math.max(3, Math.round(texH * 0.05)); c.strokeStyle = o.border; c.lineWidth = lw; c.strokeRect(lw * 1.5, lw * 1.5, texW - lw * 3, texH - lw * 3); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    // painted letters with a faint drop shade, like sign-writer's enamel
    const letters = (font: string, t: string, y: number) => {
      c.font = font;
      c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillText(t, texW / 2 + texH * 0.015, y + texH * 0.02);
      c.fillStyle = o.color ?? '#7a2a36'; c.fillText(t, texW / 2, y);
    };
    if (o.sub) {
      letters(o.font ?? `bold ${Math.round(texH * 0.4)}px Georgia, serif`, text, texH * 0.38);
      letters(`italic ${Math.round(texH * 0.2)}px Georgia, serif`, o.sub, texH * 0.76);
    } else letters(o.font ?? `bold ${Math.round(texH * 0.5)}px Georgia, serif`, text, texH * 0.53);
  });
  const g = new THREE.Group();
  g.add(box(w + 0.16, h + 0.16, 0.08, toon(o.frame ?? PAL.white), 0, 0, -0.05));
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), 0, 0, 0.001));
  return g;
}

export function signPost(text: string, w: number, h: number, postH: number, postColor: number, o: Parameters<typeof signBoard>[3] = {}) {
  const g = new THREE.Group();
  g.add(cyl(0.06, 0.08, postH, toon(postColor), 0, postH / 2, 0, 6));
  const b = signBoard(text, w, h, o);
  b.position.set(0, postH + h / 2 - 0.1, 0.06);
  g.add(b);
  return g;
}

export function topiary(kind: 'ball' | 'cone' | 'double', color = PAL.sage, potColor = 0xe0d0c0) {
  const g = new THREE.Group();
  g.add(cyl(0.45, 0.35, 0.7, toon(potColor), 0, 0.35, 0, 10));
  g.add(cyl(0.06, 0.06, 0.8, toon(0x5a4a3a), 0, 1.0, 0, 6));
  const m = toon(color);
  if (kind === 'cone') g.add(cone(0.62, 1.9, m, 0, 2.15, 0, 10));
  else if (kind === 'ball') g.add(sphere(0.72, m, 0, 1.95, 0, 12, 9));
  else { g.add(sphere(0.6, m, 0, 1.6, 0, 12, 9)); g.add(cyl(0.05, 0.05, 0.5, toon(0x5a4a3a), 0, 2.4, 0, 6)); g.add(sphere(0.4, m, 0, 2.85, 0, 10, 8)); }
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return g;
}

export function chunkedParts(parts: THREE.BufferGeometry[], mat: THREE.Material, placements: Placement[], o: { castShadow?: boolean; chunk?: number; color?: (i: number, out: THREE.Color) => void } = {}) {
  const g = new THREE.Group();
  g.userData.chunked = true;
  if (!placements.length) return g;
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false)!;
  const chunk = o.chunk ?? 120;
  const by = new Map<number, number[]>();
  placements.forEach((p, i) => { const k = Math.floor(p.z / chunk); if (!by.has(k)) by.set(k, []); by.get(k)!.push(i); });
  for (const idx of by.values()) {
    const im = instanced(geo, mat, idx.map((i) => placements[i]), o.color ? (j, c) => o.color!(idx[j], c) : undefined);
    im.castShadow = !!o.castShadow; im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

export function lampPosts(placements: Placement[], o: { height: number; color: number; lamp: number; head: 'globe' | 'lantern' }) {
  const g = new THREE.Group();
  g.userData.chunked = true;
  if (!placements.length) return g;
  const parts: THREE.BufferGeometry[] = [];
  const pole = new THREE.CylinderGeometry(0.07, 0.11, o.height, 8); pole.translate(0, o.height / 2, 0); parts.push(pole);
  const base = new THREE.CylinderGeometry(0.26, 0.32, 0.3, 8); base.translate(0, 0.15, 0); parts.push(base);
  const collar = new THREE.CylinderGeometry(0.14, 0.14, 0.18, 8); collar.translate(0, o.height * 0.35, 0); parts.push(collar);
  if (o.head === 'lantern') { const cap = new THREE.ConeGeometry(0.44, 0.32, 4); cap.rotateY(Math.PI / 4); cap.translate(0, o.height + 0.58, 0); parts.push(cap); const sole = new THREE.BoxGeometry(0.4, 0.06, 0.4); sole.translate(0, o.height + 0.07, 0); parts.push(sole); }
  else { const ring = new THREE.CylinderGeometry(0.2, 0.14, 0.12, 8); ring.translate(0, o.height, 0); parts.push(ring); }
  const metal = mergeGeometries(parts, false)!;
  const lampGeo = o.head === 'lantern' ? new THREE.BoxGeometry(0.32, 0.42, 0.32) : new THREE.SphereGeometry(0.32, 12, 9);
  lampGeo.translate(0, o.height + 0.3, 0);
  const metalMat = toon(o.color), lampMat = glow(o.lamp, 1.05);
  const by = new Map<number, Placement[]>();
  for (const p of placements) { const k = Math.floor(p.z / 120); if (!by.has(k)) by.set(k, []); by.get(k)!.push(p); }
  for (const pl of by.values()) {
    const c = new THREE.Group();
    const m = instanced(metal, metalMat, pl); m.castShadow = true; m.computeBoundingSphere();
    const l = instanced(lampGeo, lampMat, pl); l.computeBoundingSphere();
    c.add(m, l);
    g.add(c);
  }
  return g;
}

export function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, seg = 5) {
  const d = b.clone().sub(a);
  const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

let mendlsFace: THREE.Texture | null = null;
const boxMats = new Map<string, THREE.Material>();
/**
 * A Mendl's box: pink card with the shop's name in red script, tied with a pale blue ribbon and a bow.
 * `s` scales it (1 is a box about a third of a unit across, the thrown item).
 */
export function mendlsBox(s = 1) {
  const g = new THREE.Group();
  const face = mendlsFace ??= canvasTexture(128, 128, (c) => {
    c.fillStyle = '#f4bccb'; c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, 128, 10);
    c.fillStyle = '#c8323c'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'italic bold 30px Georgia, serif'; c.fillText("Mendl's", 64, 56);
    c.font = '11px Georgia, serif'; c.fillText('NEBELSBAD', 64, 82);
    c.fillStyle = '#6a9fd8'; c.fillRect(61, 0, 6, 20); c.fillRect(61, 108, 6, 20);
  });
  const card = boxMats.get('card') ?? boxMats.set('card', toon(0xffffff, { map: face })).get('card')!;
  const blue = boxMats.get('blue') ?? boxMats.set('blue', toon(0x6a9fd8)).get('blue')!;
  g.add(box(0.34 * s, 0.26 * s, 0.34 * s, card, 0, 0.13 * s, 0));
  g.add(box(0.345 * s, 0.012 * s, 0.03 * s, blue, 0, 0.262 * s, 0), box(0.03 * s, 0.012 * s, 0.345 * s, blue, 0, 0.262 * s, 0));
  const bow = new THREE.Group();
  for (const x of [-0.05, 0.05]) { const l = sphere(0.04 * s, blue, x * s, 0, 0, 8, 6); l.scale.set(1.5, 0.75, 0.6); bow.add(l); }
  bow.add(sphere(0.02 * s, blue, 0, 0, 0, 6, 4));
  bow.position.set(0, 0.28 * s, 0);
  g.add(bow);
  return g;
}
