import * as THREE from 'three';
import { box, cone, cyl, glow, mesh, toon } from '../../../engine/Builders';
import { Painter, boxUV } from '../../../engine/Paint';
import { Rng, lerp } from '../../../engine/math';
import { css, facadeTile, fishScales } from '../textures';
import { PAL } from '../kit';
import { FUTURA } from '../film';
import { RING_C } from './terrain';

/*
 * The panorama: the Alps painted on three great rings round the mountain, like the painted backdrops of the
 * film's miniature sets. Each ring's painting covers half the circle and is mirrored for the other half, so
 * the range is symmetrical about the view straight down the run, with the tallest horn dead ahead. The
 * nearer ring is darker and sharper, the farther ones paler, as if seen through more air.
 *
 * In the valley straight ahead, small and far below, stands the Grand Budapest on its hill, with its
 * funicular and the roofs of Nebelsbad at its feet.
 */

interface Peak { x: number; h: number; w: number }
interface Tones { snowLit: string; snowShade: string; rockLit: string; rockShade: string; base: string; haze: string; hazeK: number; forest?: string }

/** Jagged line between two points (midpoint displacement), for ridges and snowlines. */
function jag(rng: Rng, ax: number, ay: number, bx: number, by: number, rough: number, depth = 5): Array<[number, number]> {
  if (depth === 0) return [[ax, ay], [bx, by]];
  const mx = (ax + bx) / 2 + rng.range(-0.15, 0.15) * Math.abs(bx - ax), my = (ay + by) / 2 + rng.range(-1, 1) * rough;
  const a = jag(rng, ax, ay, mx, my, rough * 0.55, depth - 1), b = jag(rng, mx, my, bx, by, rough * 0.55, depth - 1);
  return [...a.slice(0, -1), ...b];
}

/** Paint one range of peaks on a canvas whose bottom is the ring's base; the sky is left clear. */
function paintRange(W: number, H: number, peaks: Peak[], t: Tones, seed: number) {
  const p = new Painter(W, H, seed);
  const g = p.g, rng = p.rng;
  // each peak: a jagged silhouette; the face towards the right (straight ahead, at the canvas's right edge) is
  // lit, the left face in shadow; snow above a ragged snowline
  for (const k of peaks) {
    const top = H - k.h, L = k.x - k.w, R = k.x + k.w;
    const left = jag(rng, L, H + 4, k.x, top, k.w * 0.18), right = jag(rng, k.x, top, R, H + 4, k.w * 0.18);
    const outline = [...left, ...right.slice(1)];
    const path = () => { g.beginPath(); outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    // body in shadow
    path(); g.fillStyle = t.rockShade; g.fill();
    g.save(); path(); g.clip();
    // the lit face: from the summit down a spur to the right foot
    const spurX = k.x + rng.range(-0.15, 0.1) * k.w;
    const spur = jag(rng, k.x, top, spurX, H + 4, k.w * 0.12);
    g.beginPath(); g.moveTo(k.x, top); spur.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(R + 10, H + 4); g.lineTo(R + 10, top - 10); g.closePath();
    g.fillStyle = t.rockLit; g.fill();
    // snow above a ragged line, lit and shaded the same way
    const snowY = top + k.h * rng.range(0.42, 0.6);
    const sl = jag(rng, L - 20, snowY + rng.range(-10, 10), R + 20, snowY + rng.range(-10, 10), k.h * 0.12, 6);
    g.beginPath(); g.moveTo(L - 20, top - 20); sl.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(R + 20, top - 20); g.closePath();
    g.save(); g.clip();
    g.fillStyle = t.snowShade; g.fillRect(L - 20, top - 20, R - L + 40, k.h + 40);
    g.beginPath(); g.moveTo(k.x, top); spur.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(R + 20, H + 4); g.lineTo(R + 20, top - 20); g.closePath();
    g.fillStyle = t.snowLit; g.fill();
    // a few rock ribs showing through the snow
    g.strokeStyle = t.rockShade; g.globalAlpha = 0.5; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const x0 = k.x + rng.range(-0.6, 0.6) * k.w * 0.6, y0 = top + rng.range(0.1, 0.4) * k.h;
      g.beginPath(); jag(rng, x0, y0, x0 + rng.range(-0.2, 0.2) * k.w, y0 + rng.range(0.15, 0.35) * k.h, 6, 3).forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    }
    g.globalAlpha = 1;
    g.restore();
    // forests on the lower slopes of the nearest range
    if (t.forest) {
      g.fillStyle = t.forest;
      for (let i = 0; i < 70; i++) {
        const x = rng.range(L, R), y = H - rng.range(0, 0.22) * k.h;
        const s = rng.range(4, 9);
        g.beginPath(); g.moveTo(x, y - s * 2.2); g.lineTo(x - s * 0.7, y); g.lineTo(x + s * 0.7, y); g.closePath(); g.fill();
      }
    }
    g.restore();
    // a thin pale line along the lit ridge, the edge of the light
    g.strokeStyle = 'rgba(255,245,245,0.6)'; g.lineWidth = 1.5;
    g.beginPath(); right.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  }
  // the air: everything fades towards the haze lower down, and a little all over
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, `rgba(0,0,0,0)`);
  gr.addColorStop(0.55, t.haze.replace('A', (t.hazeK * 0.6).toFixed(2)));
  gr.addColorStop(1, t.haze.replace('A', Math.min(1, t.hazeK * 1.8).toFixed(2)));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = t.haze.replace('A', (t.hazeK * 0.5).toFixed(2)); g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  // the ring's foot is solid haze, so nothing shows under the painted range
  g.fillStyle = t.base; g.fillRect(0, H - 6, W, 6);
  const tex = p.texture();
  tex.wrapS = THREE.MirroredRepeatWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = 4;
  return tex;
}

/** One ring: an open cylinder seen from inside, its painting mirrored about straight ahead. */
function ring(r: number, y0: number, y1: number, tex: THREE.Texture, order: number) {
  const geo = new THREE.CylinderGeometry(r, r, y1 - y0, 128, 1, true);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false }));
  m.position.set(RING_C.x, (y0 + y1) / 2, RING_C.z);
  m.renderOrder = order;
  m.frustumCulled = false;
  return m;
}

export function buildPanorama(ground: (x: number, z: number) => number) {
  const group = new THREE.Group();
  const W = 2048, H = 512;
  const rng = new Rng(611);
  // peak lists: x on the canvas (0 = behind the rider, W = straight ahead), height and half-width in pixels
  const range = (n: number, hMin: number, hMax: number, wMin: number, wMax: number, ahead: Peak) => {
    const out: Peak[] = [];
    for (let i = 0; i < n; i++) out.push({ x: rng.range(-40, W - 140), h: rng.range(hMin, hMax), w: rng.range(wMin, wMax) });
    out.sort((a, b) => b.h - a.h);
    out.push(ahead);
    return out;
  };
  const far = paintRange(W, H, range(14, 160, 330, 120, 220, { x: W - 10, h: 300, w: 170 }), {
    snowLit: '#fbe6ee', snowShade: '#b8c6ee', rockLit: '#c2a8cc', rockShade: '#8e9ad0', base: '#dcdff2', haze: 'rgba(220,223,242,A)', hazeK: 0.3,
  }, 612);
  const mid = paintRange(W, H, range(12, 150, 300, 100, 190, { x: W, h: 430, w: 150 }), {
    snowLit: '#ffe6ee', snowShade: '#a4b6ea', rockLit: '#b896bc', rockShade: '#6e7cc0', base: '#dcdff2', haze: 'rgba(220,223,242,A)', hazeK: 0.14,
  }, 613);
  const near = paintRange(W, H, range(16, 70, 170, 90, 200, { x: W - 330, h: 150, w: 170 }), {
    snowLit: '#fff0f2', snowShade: '#9eb2e6', rockLit: '#a07ea8', rockShade: '#545ea0', base: '#d8dcf0', haze: 'rgba(216,220,240,A)', hazeK: 0.08, forest: '#2e4e5e',
  }, 614);
  group.add(ring(980, -120, 560, far, -3), ring(820, -110, 430, mid, -2), ring(660, -100, 190, near, -1));

  // ---------- the Grand Budapest on its hill in the valley ----------
  const hotel = buildHotelMiniature(ground);
  group.add(hotel.group);
  return { group, hotel };
}

/** The Grand Budapest as the film's miniature: a pink palace on a crag above the spa town, with its funicular. */
export function buildHotelMiniature(ground: (x: number, z: number) => number = () => -62) {
  const GX = 0, GY = -44, GZ = -1085;
  const group = new THREE.Group();
  const anchor = new THREE.Object3D();
  const s = 1.6;
  const pink = facadeTile({ wall: 0xf0a8bc, frame: 0xfbf2ea, bays: 4, storeys: 2, cornice: 0xfbe6ea, pilaster: 0xf6c4d0, lit: 0.3, seed: 621 });
  const pinkMat = new THREE.MeshLambertMaterial({ map: pink.map, emissiveMap: pink.emissive, emissive: 0x000000 });
  const roofMat = new THREE.MeshLambertMaterial({ map: fishScales(0xa8a0d8, 622) });
  const trim = toon(0xfbf2ea), dark = toon(0x5a3a5a);
  const B = new THREE.Group();
  // the main block, two wings stepping back, and the upper storeys
  const block = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = mesh(boxUV(new THREE.BoxGeometry(w, h, d), 4 * 1.0, 2 * 1.2), pinkMat, x, y + h / 2, z);
    B.add(m);
    // a mansard of lavender fish scales on top, and a white cornice
    B.add(box(w + 0.3, 0.25, d + 0.3, trim, x, y + h + 0.12, z));
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(Math.SQRT1_2 * 0.82, Math.SQRT1_2, 1, 4, 1), roofMat);
    roof.rotation.y = Math.PI / 4; roof.scale.set(w, 1.4, d); roof.position.set(x, y + h + 0.95, z);
    B.add(roof);
  };
  block(22, 7.2, 8, 0, 0, 0);
  block(9, 6, 7, -14, 0, 1);
  block(9, 6, 7, 14, 0, 1);
  block(14, 4.8, 6, 0, 7.6, -0.5);
  block(6, 3.6, 4.5, 0, 13.6, -0.8);
  // the cupola and its flag
  B.add(cyl(1.2, 1.4, 1.8, pinkMat, 0, 19.2, -0.8, 12));
  B.add(cone(1.6, 2.2, roofMat, 0, 21.2, -0.8, 12));
  B.add(cyl(0.05, 0.05, 2.6, dark, 0, 23.4, -0.8, 4));
  B.add(box(1.4, 0.8, 0.05, toon(0xb93a4c), 0.7, 24.2, -0.8));
  // the name on the roof, in lit capitals
  const sign = new Painter(512, 64, 623);
  sign.g.fillStyle = '#fbe8b8'; sign.g.font = `bold 46px ${FUTURA}`; sign.g.textAlign = 'center'; sign.g.textBaseline = 'middle';
  sign.g.fillText('GRAND BUDAPEST', 256, 34);
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.6), new THREE.MeshBasicMaterial({ map: sign.texture({ wrap: false }), transparent: true, color: new THREE.Color(1.3, 1.2, 1.0) }));
  sm.position.set(0, 10.6, 4.4);
  B.add(sm);
  // the porte-cochère and the steps
  B.add(box(5, 2.2, 2.4, trim, 0, 1.1, 5.2));
  B.add(box(5.6, 0.3, 3, toon(0x7a2a36), 0, 2.35, 5.2));
  B.scale.setScalar(s);
  group.add(B);
  // the crag it stands on, and the hill below, with snow
  const rock = new THREE.MeshLambertMaterial({ color: 0x9890ae, flatShading: true });
  const snow = new THREE.MeshLambertMaterial({ color: 0xf6f4fa });
  const crag = new THREE.Mesh(new THREE.CylinderGeometry(30, 46, 26, 9, 2), rock);
  crag.position.set(0, -13, -2);
  group.add(crag);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(31, 30, 1.2, 9), snow);
  cap.position.set(0, -0.4, -2);
  group.add(cap);
  // the funicular: a straight track down the crag's face to the right, with its little red car
  const track = box(1.2, 0.3, 40, toon(0x5a3a2a), 0, 0, 0);
  const trackG = new THREE.Group();
  trackG.add(track);
  const car = box(1.8, 1.6, 2.6, toon(0xb93a4c), 0, 1.0, 6);
  trackG.add(car);
  trackG.position.set(26, -12, 16);
  trackG.rotation.set(-0.62, 0.5, 0);
  group.add(trackG);
  // the roofs of Nebelsbad at its feet
  const town = new THREE.Group();
  const trng = new Rng(624);
  const walls = [0xf6efe2, 0xf2c6b0, 0xbcd8c8, 0xf0dca0, 0xc8d0e8];
  for (let i = 0; i < 26; i++) {
    const a = trng.range(-1.2, 1.2) + (trng.chance(0.5) ? 0 : Math.PI);
    const r = trng.range(48, 70);
    const x = Math.sin(a) * r, z = Math.cos(a) * r * 0.6 + 6;
    const w = trng.range(3, 5), h = trng.range(3, 6);
    const y0 = ground(GX + x, GZ + z) - GY - 0.6;
    town.add(box(w, h, w * 0.9, toon(trng.pick(walls)), x, y0 + h / 2, z));
    const rf = cone(w * 0.78, 2.4, toon(trng.chance(0.5) ? 0x8a3a3a : 0x5a6a8a), x, y0 + h + 1.2, z, 4);
    rf.rotation.y = Math.PI / 4;
    town.add(rf);
  }
  group.add(town);
  group.position.set(GX, GY, GZ);
  anchor.position.set(0, 14, 0);
  group.add(anchor);
  // the windows light up when the whistle carries down the valley
  const lights = { set(k: number) { pinkMat.emissive.setScalar(lerp(0, 1.1, k)); } };
  void glow; void css; void PAL;
  return { group, anchor, lights };
}
