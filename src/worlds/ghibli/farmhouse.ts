import * as THREE from 'three';
import { Rng } from '../../engine/math';
import { roofTileTexture } from './korikoAtlas';

/**
 * A 1950s Japanese country house: dark timber and white plaster walls, sliding glass doors onto a raised
 * veranda (engawa), a heavy grey tiled hip-and-gable roof, and a small Western-style annex with a red roof.
 * Local frame: the veranda side faces +z. Origin at ground level in the middle of the main house.
 */

function paintWall(kind: 'timber' | 'doors' | 'clapboard' | 'plaster') {
  const rng = new Rng(kind.length * 17);
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d')!;
  const W = 128, H = 256;
  if (kind === 'clapboard') {
    g.fillStyle = '#efe6cf'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 14) { g.fillStyle = 'rgba(80,60,40,0.18)'; g.fillRect(0, y + 11, W, 3); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, y, W, 2); }
  } else if (kind === 'plaster') {
    g.fillStyle = '#eee7d8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3f3026'; g.fillRect(0, 0, 10, H); g.fillRect(0, 0, W, 10); g.fillRect(0, H * 0.55, W, 8);
  } else {
    // upper plaster band with a beam, lower dark boards with battens, a post at the left edge
    const split = kind === 'doors' ? 0.22 : 0.38;
    g.fillStyle = '#ece5d4'; g.fillRect(0, 0, W, H * split);
    for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(120,100,70,${rng.range(0.03, 0.07)})`; g.beginPath(); g.ellipse(rng.range(0, W), rng.range(0, H * split), rng.range(6, 20), rng.range(4, 10), 0, 0, Math.PI * 2); g.fill(); }
    if (kind === 'timber') {
      g.fillStyle = '#4a382a'; g.fillRect(0, H * split, W, H * (1 - split));
      for (let x = 6; x < W; x += 16) { g.fillStyle = 'rgba(20,12,6,0.45)'; g.fillRect(x, H * split, 3, H); g.fillStyle = 'rgba(150,120,90,0.12)'; g.fillRect(x + 3, H * split, 2, H); }
      // a small high window
      g.fillStyle = '#2f2a24'; g.fillRect(40, H * 0.43, 50, 36);
      g.fillStyle = '#d9d2c0'; for (let k = 0; k < 4; k++) g.fillRect(44 + k * 12, H * 0.43 + 4, 8, 28);
    } else {
      // glass sliding doors in wooden frames, paper screens behind the upper panes
      g.fillStyle = '#5a4432'; g.fillRect(0, H * split, W, H * (1 - split));
      const x0 = 8, y0 = H * split + 8, dw = (W - 16) / 2, dh = H * (1 - split) - 22;
      for (let d = 0; d < 2; d++) {
        const dx = x0 + d * dw;
        g.fillStyle = '#6b523c'; g.fillRect(dx, y0, dw - 2, dh);
        for (let r = 0; r < 4; r++) for (let q = 0; q < 2; q++) {
          const px = dx + 5 + q * ((dw - 12) / 2), py = y0 + 5 + r * ((dh - 10) / 4), pw = (dw - 16) / 2, ph = (dh - 10) / 4 - 4;
          g.fillStyle = r < 2 ? '#e9e2cf' : '#3e4e5c';
          g.fillRect(px, py, pw, ph);
          if (r >= 2) { g.fillStyle = 'rgba(200,220,235,0.25)'; g.fillRect(px, py, pw * 0.4, ph); }
        }
      }
      g.fillStyle = '#3a2a1e'; g.fillRect(0, H - 14, W, 14);
    }
    g.fillStyle = '#35271d'; g.fillRect(0, 0, 9, H); g.fillRect(0, H * split - 5, W, 9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** A vertical wall plane w x h whose texture repeats every `bay` units across. */
function wall(w: number, h: number, mat: THREE.Material, bay: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (w / bay));
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * Hip-and-gable ("irimoya") roof over a w x d footprint: the lower half is hipped on all four sides,
 * the upper half ends in small upright gables under a ridge running along x.
 */
export function hipGableRoof(w: number, d: number, rise: number, tileMat: THREE.Material, gableMat: THREE.Material) {
  const g = new THREE.Group();
  const hw = w / 2, hd = d / 2, R = Math.max(0.6, hw - hd * 0.5), yg = rise * 0.5;
  const pos: number[] = [], uv: number[] = [];
  const s = 0.45; // tile uv scale
  const slopeLen = Math.hypot(hd, rise);
  const P = (x: number, y: number, z: number) => [x, y, z];
  const tri = (a: number[], b: number[], c: number[], uvf: (p: number[]) => number[]) => { pos.push(...a, ...b, ...c); uv.push(...uvf(a), ...uvf(b), ...uvf(c)); };
  // front and back: hexagons in the slope planes
  for (const sz of [1, -1]) {
    const uvf = (p: number[]) => [p[0] * s * sz, ((hd - Math.abs(p[2])) / hd) * slopeLen * s];
    const A = P(-hw * sz, 0, hd * sz), B = P(hw * sz, 0, hd * sz), C = P(R * sz, yg, (hd / 2) * sz), D = P(R * sz, rise, 0), E = P(-R * sz, rise, 0), F = P(-R * sz, yg, (hd / 2) * sz);
    tri(A, B, C, uvf); tri(A, C, D, uvf); tri(A, D, E, uvf); tri(A, E, F, uvf);
  }
  // hipped ends: trapezoids from the eave up to the foot of the gable
  const endLen = Math.hypot(hw - R, yg);
  for (const sx of [1, -1]) {
    const uvf = (p: number[]) => [p[2] * s * sx, ((hw - Math.abs(p[0])) / (hw - R)) * endLen * s];
    const A = P(hw * sx, 0, hd * sx), B = P(hw * sx, 0, -hd * sx), C = P(R * sx, yg, (-hd / 2) * sx), D = P(R * sx, yg, (hd / 2) * sx);
    tri(A, B, C, uvf); tri(A, C, D, uvf);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(geo, tileMat);
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);
  // upright gables with a timber frame
  for (const sx of [1, -1]) {
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute([R * sx, yg, (hd / 2) * sx, R * sx, yg, (-hd / 2) * sx, R * sx, rise, 0], 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 0.55], 2));
    tg.computeVertexNormals();
    g.add(new THREE.Mesh(tg, gableMat));
  }
  // heavy ridge with raised ends
  const ridgeMat = new THREE.MeshLambertMaterial({ color: 0x3e454c });
  const rb = new THREE.Mesh(new THREE.BoxGeometry(R * 2 + 0.7, 0.45, 0.6), ridgeMat);
  rb.position.set(0, rise + 0.12, 0); rb.castShadow = true;
  g.add(rb);
  for (const sx of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.8, 0.7), ridgeMat);
    end.position.set(sx * (R + 0.3), rise + 0.3, 0);
    g.add(end);
  }
  return g;
}

export function buildFarmhouse() {
  const g = new THREE.Group();
  const timber = new THREE.MeshLambertMaterial({ map: paintWall('timber') });
  const doors = new THREE.MeshLambertMaterial({ map: paintWall('doors') });
  const plaster = new THREE.MeshLambertMaterial({ map: paintWall('plaster'), side: THREE.DoubleSide });
  const clap = new THREE.MeshLambertMaterial({ map: paintWall('clapboard') });
  const tiles = roofTileTexture(11);
  const greyTiles = new THREE.MeshLambertMaterial({ map: tiles, color: 0x6a7480, side: THREE.DoubleSide });
  const redTiles = new THREE.MeshLambertMaterial({ map: tiles, color: 0xc4553a, side: THREE.DoubleSide });
  const wood = new THREE.MeshLambertMaterial({ color: 0x5a4432 });
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x3a2a1e });
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a948a });

  // main house: 13 x 9, raised on a stone footing
  const W = 13, D = 9, H = 3.4, base = 0.6;
  const footing = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, base + 1, D + 0.2), stone);
  footing.position.y = base / 2 - 0.5; footing.receiveShadow = true;
  g.add(footing);
  const front = wall(W, H, doors, 1.85); front.position.set(0, base + H / 2, D / 2); g.add(front);
  const back = wall(W, H, timber, 1.85); back.position.set(0, base + H / 2, -D / 2); back.rotation.y = Math.PI; g.add(back);
  for (const sx of [-1, 1]) { const s = wall(D, H, timber, 1.85); s.position.set(sx * W / 2, base + H / 2, 0); s.rotation.y = sx * Math.PI / 2; g.add(s); }
  // veranda (engawa) with posts carrying the eave
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.18, 1.5), wood);
  deck.position.set(0, base - 0.05, D / 2 + 0.75); deck.receiveShadow = true; deck.castShadow = true;
  g.add(deck);
  for (let i = 0; i <= 6; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, H + 0.2, 0.18), darkWood);
    post.position.set(-W / 2 + (i * W) / 6, base + H / 2, D / 2 + 1.45); post.castShadow = true;
    g.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.25, 0.25), darkWood);
  beam.position.set(0, base + H, D / 2 + 1.45);
  g.add(beam);
  // stepping stone at the veranda
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.8), stone);
  step.position.set(-2, 0.15, D / 2 + 2.0);
  g.add(step);
  // the roof, with deep eaves over the veranda
  const roof = hipGableRoof(W + 3.2, D + 4.2, 3.6, greyTiles, plaster);
  roof.position.set(0, base + H - 0.15, 0.55);
  g.add(roof);
  // soffit under the eaves, dark
  const soffit = new THREE.Mesh(new THREE.PlaneGeometry(W + 3.2, D + 4.2), new THREE.MeshLambertMaterial({ color: 0x2f241c, side: THREE.DoubleSide }));
  soffit.rotation.x = Math.PI / 2; soffit.position.set(0, base + H - 0.16, 0.55);
  g.add(soffit);

  // Western-style annex on the right: clapboard walls, white window, red tile roof
  const aw = 5, ad = 5.2, ah = 5.2;
  const ax = W / 2 + aw / 2 - 0.2, az = -0.6;
  const aFoot = new THREE.Mesh(new THREE.BoxGeometry(aw + 0.2, 1, ad + 0.2), stone);
  aFoot.position.set(ax, 0, az);
  g.add(aFoot);
  const af = wall(aw, ah, clap, 2.5); af.position.set(ax, 0.5 + ah / 2, az + ad / 2); g.add(af);
  const ab = wall(aw, ah, clap, 2.5); ab.position.set(ax, 0.5 + ah / 2, az - ad / 2); ab.rotation.y = Math.PI; g.add(ab);
  const as = wall(ad, ah, clap, 2.5); as.position.set(ax + aw / 2, 0.5 + ah / 2, az); as.rotation.y = Math.PI / 2; g.add(as);
  // white-framed windows on the annex
  const frame = new THREE.MeshLambertMaterial({ color: 0xf6f2e8 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x3e5064 });
  for (const [wx, wy, wz, ry] of [[ax, 3.6, az + ad / 2 + 0.03, 0], [ax + aw / 2 + 0.03, 3.6, az, Math.PI / 2], [ax, 1.8, az + ad / 2 + 0.03, 0]] as const) {
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.6), frame); fr.position.set(wx, wy, wz); fr.rotation.y = ry; g.add(fr);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.3), glass); gl.position.set(wx + (ry ? 0.01 : 0), wy, wz + (ry ? 0 : 0.01)); gl.rotation.y = ry; g.add(gl);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.3), frame); bar.position.copy(gl.position).add(new THREE.Vector3(ry ? 0.01 : 0, 0, ry ? 0 : 0.01)); bar.rotation.y = ry; g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.08), frame); bar2.position.copy(bar.position); bar2.rotation.y = ry; g.add(bar2);
  }
  // pyramid-ish red roof on the annex
  const aroof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(aw, ad) / 2 + 0.8, 2.8, 4, 1), redTiles);
  aroof.rotation.y = Math.PI / 4; aroof.position.set(ax, 0.5 + ah + 1.4, az); aroof.castShadow = true;
  g.add(aroof);
  // a little finial
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), frame); fin.position.set(ax, 0.5 + ah + 2.9, az); g.add(fin);

  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/**
 * A small cottage in the woods: half-timbered plaster walls on a stone base, a steep mossy roof,
 * warm lit windows, a chimney and a porch lamp. Local frame: the door faces +z.
 */
export function buildCottage() {
  const g = new THREE.Group();
  const plaster = new THREE.MeshLambertMaterial({ map: paintWall('plaster') });
  const tiles = roofTileTexture(29);
  const roofMat = new THREE.MeshLambertMaterial({ map: tiles, color: 0x5f7060, side: THREE.DoubleSide });
  const stone = new THREE.MeshLambertMaterial({ color: 0x77726a });
  const timber = new THREE.MeshLambertMaterial({ color: 0x3a2a1e });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc978).multiplyScalar(1.6) });
  const W = 8, D = 7, H = 3.6;
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 1.4, D + 0.4), stone);
  base.position.y = 0.1;
  g.add(base);
  const front = wall(W, H, plaster, 2); front.position.set(0, 0.8 + H / 2, D / 2); g.add(front);
  const back = wall(W, H, plaster, 2); back.position.set(0, 0.8 + H / 2, -D / 2); back.rotation.y = Math.PI; g.add(back);
  for (const sx of [-1, 1]) { const s = wall(D, H, plaster, 2); s.position.set(sx * W / 2, 0.8 + H / 2, 0); s.rotation.y = sx * Math.PI / 2; g.add(s); }
  // gable ends
  const rise = 4.2;
  for (const sz of [1, -1]) {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2 * sz, 0.8 + H, (D / 2) * sz, W / 2 * sz, 0.8 + H, (D / 2) * sz, 0, 0.8 + H + rise, (D / 2) * sz], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, W / 2, 0, W / 4, 1], 2));
    tri.computeVertexNormals();
    g.add(new THREE.Mesh(tri, plaster));
  }
  // steep roof with deep eaves
  const ov = 0.7, sl = Math.hypot(W / 2 + ov, rise + ov);
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(D + 1.6, sl), roofMat);
    const uv = r.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (D + 1.6) * 0.45, uv.getY(i) * sl * 0.45);
    r.position.set(sx * (W / 4 + ov / 2 - 0.05), 0.8 + H + rise / 2 - ov / 2 + 0.05, 0);
    r.rotation.order = 'YXZ';
    r.rotation.y = sx * Math.PI / 2;
    r.rotation.x = -(Math.PI / 2 - Math.atan2(rise + ov, W / 2 + ov));
    g.add(r);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, D + 1.8), timber);
  ridge.position.y = 0.8 + H + rise + 0.05;
  g.add(ridge);
  // windows and door
  for (const [x, y, z, ry, w, h] of [[-2, 2.6, D / 2 + 0.04, 0, 1.3, 1.4], [2, 2.6, D / 2 + 0.04, 0, 1.3, 1.4], [W / 2 + 0.04, 2.6, 0, Math.PI / 2, 1.3, 1.4], [0, 0.8 + H + 1.4, D / 2 + 0.04, 0, 0.9, 0.9]] as const) {
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, h + 0.3), timber); fr.position.set(x, y, z); fr.rotation.y = ry; g.add(fr);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glowMat);
    gl.position.set(x + (ry ? 0.01 : 0), y, z + (ry ? 0 : 0.01)); gl.rotation.y = ry; g.add(gl);
    const bars = new THREE.Mesh(new THREE.PlaneGeometry(0.07, h), timber); bars.position.copy(gl.position).add(new THREE.Vector3(ry ? 0.01 : 0, 0, ry ? 0 : 0.01)); bars.rotation.y = ry; g.add(bars);
    const bar2 = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.07), timber); bar2.position.copy(bars.position); bar2.rotation.y = ry; g.add(bar2);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.1), new THREE.MeshLambertMaterial({ color: 0x5a3a24 }));
  door.position.set(0, 0.8 + 1.05, D / 2 + 0.05); g.add(door);
  // porch roof on two posts and a lamp
  const porch = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 1.6), roofMat); porch.position.set(0, 3.5, D / 2 + 0.8); porch.rotation.x = 0.25; g.add(porch);
  for (const px of [-1.3, 1.3]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.8, 0.14), timber); p.position.set(px, 2.1, D / 2 + 1.45); g.add(p); }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), glowMat); lamp.position.set(0.9, 2.9, D / 2 + 0.2); g.add(lamp);
  // chimney with a stone stack
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.4, 0.9), stone); ch.position.set(-2.3, 0.8 + H + 2.6, -1.2); g.add(ch);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  glowMat.userData.glow = true;
  return g;
}
