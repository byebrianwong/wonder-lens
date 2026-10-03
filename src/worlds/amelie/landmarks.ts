import * as THREE from 'three';
import { box, cyl, mergeStatic, mesh } from '../../engine/Builders';
import { charToon, Painter, repeatUV } from '../../engine/Paint';
import { Rng, TAU, lerp } from '../../engine/math';
import { explodeGroups } from './common';

/**
 * The two Paris landmarks seen from the air: the Sacré-Cœur (white travertine domes) and the Eiffel Tower
 * (a lattice of iron, lit gold at dusk).
 */

/** White travertine in courses, warm in the light. One tile = 4 x 4 units. */
function travertine(seed = 201) {
  const p = new Painter(256, 256, seed).fill('#f2eee4');
  const g = p.g, rng = p.rng;
  for (let r = 0; r < 10; r++) {
    let x = r % 2 ? -rng.range(10, 30) : 0;
    while (x < 256) { const w = rng.range(40, 80); g.fillStyle = `rgba(${rng.range(200, 240)},${rng.range(195, 232)},${rng.range(180, 220)},0.35)`; g.fillRect(x + 1, r * 25.6 + 1, w - 2, 23.6); x += w; }
    g.fillStyle = 'rgba(150,140,120,0.35)'; g.fillRect(0, r * 25.6, 256, 1.2);
  }
  p.dabs({ n: 60, colors: ['rgba(180,170,150,1)', 'rgba(255,255,250,1)'], r: [4, 20], alpha: [0.05, 0.12] });
  return p.texture({ repeat: [1, 1] });
}

/** A ring of arched windows between half-columns, for the drums under the domes. One tile = one arch. */
function arcade(seed = 203) {
  const p = new Painter(128, 256, seed).fill('#f0ebe0');
  const g = p.g;
  g.fillStyle = 'rgba(160,150,130,0.4)'; g.fillRect(0, 0, 14, 256); g.fillRect(114, 0, 14, 256);
  g.fillStyle = '#e8e2d6'; g.fillRect(2, 0, 10, 256); g.fillRect(116, 0, 10, 256);
  g.fillStyle = '#3a3428';
  g.beginPath(); g.moveTo(30, 230); g.lineTo(30, 90); g.arc(64, 90, 34, Math.PI, 0); g.lineTo(98, 230); g.fill();
  g.fillStyle = 'rgba(255,220,150,0.45)'; g.fillRect(36, 110, 56, 110);
  g.fillStyle = '#f0ebe0'; g.fillRect(62, 60, 4, 170);
  g.fillStyle = 'rgba(160,150,130,0.5)'; g.fillRect(0, 236, 128, 8); g.fillRect(0, 30, 128, 6);
  return p.texture({ repeat: [1, 1] });
}

/** The basilica faces +z (its portico); origin at the middle of the parvis edge of its front steps, at floor level. */
export function sacreCoeur() {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ map: travertine(), emissive: 0x2a2620 });
  const stoneT = charToon({ color: 0xf2eee4, rim: 0.4, shade: 0xb8b0c8, emissive: new THREE.Color(0x1e1c18) });
  const dark = charToon({ color: 0x3a3428, rim: 0.2 });
  const arc = new THREE.MeshLambertMaterial({ map: arcade(), emissive: 0x2a2418 });
  // an ovoid dome: a lathe that swells from the drum and narrows to the lantern
  const dome = (r: number, h: number) => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; const a = t * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.max(0.001, r * Math.cos(a) * (1 + 0.12 * Math.sin(t * Math.PI))), h * Math.sin(a))); }
    return new THREE.LatheGeometry(pts, 28);
  };
  const domeOn = (x: number, z: number, r: number, base: number, drumH: number, domeH: number) => {
    const drum = mesh(repeatUV(new THREE.CylinderGeometry(r, r, drumH, 24, 1, true), 12, 1), arc, x, base + drumH / 2, z); g.add(drum);
    g.add(cyl(r + 0.6, r + 0.6, 0.8, stoneT, x, base + drumH, z, 24));
    g.add(cyl(r + 0.4, r + 0.4, 0.8, stoneT, x, base, z, 24));
    g.add(mesh(dome(r, domeH), stoneT, x, base + drumH + 0.4, z));
    // lantern on top
    const top = base + drumH + 0.4 + domeH;
    g.add(mesh(repeatUV(new THREE.CylinderGeometry(r * 0.22, r * 0.24, r * 0.5, 12, 1, true), 6, 1), arc, x, top + r * 0.25, z));
    g.add(mesh(dome(r * 0.26, r * 0.32), stoneT, x, top + r * 0.5, z));
    g.add(cyl(r * 0.03, r * 0.05, r * 0.4, stoneT, x, top + r * 0.95, z, 6));
    g.add(mesh(new THREE.SphereGeometry(r * 0.06, 8, 6), stoneT, x, top + r * 1.15, z));
  };
  // the main body: a cross of halls with apses, their walls lined with tall arched windows
  const tall = new THREE.MeshLambertMaterial({ map: arcade(), emissive: 0x2a2418 });
  const boxArc = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    // faces: +x, -x, +y, -y, +z, -z; one arch per 4.5 units along each wall, the walls' full height
    const reps = [d, d, w, w, w, w].map((l) => Math.max(1, Math.round(l / 4.5)));
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setX(i, uv.getX(i) * reps[f]); }
    return mesh(geo, [tall, tall, stone, stone, tall, tall] as unknown as THREE.Material, x, y, z);
  };
  g.add(boxArc(34, 18, 46, 0, 9, -26));
  g.add(boxArc(52, 16, 20, 0, 8, -28));
  for (const s of [-1, 1]) g.add(mesh(repeatUV(new THREE.CylinderGeometry(10, 10, 16, 20, 1, true, s > 0 ? 0 : Math.PI, Math.PI), 7, 1), tall, s * 26, 8, -28));
  g.add(mesh(repeatUV(new THREE.CylinderGeometry(14, 14, 18, 24, 1, true, Math.PI / 2, Math.PI), 10, 1), tall, 0, 9, -49));
  for (const s of [-1, 1]) g.add(mesh(new THREE.CircleGeometry(10, 20, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI), stone, s * 26, 16, -28).rotateX(-Math.PI / 2));
  g.add(mesh(new THREE.CircleGeometry(14, 24, Math.PI, Math.PI), stone, 0, 18, -49).rotateX(-Math.PI / 2));
  g.add(box(36, 1.2, 48, stoneT, 0, 18.6, -26));
  // the portico: three great arches under a gable, two bronze horsemen on top
  g.add(box(28, 14, 8, stone, 0, 7, -1));
  for (const x of [-8, 0, 8]) {
    const shape = new THREE.Shape(); shape.moveTo(-3, 0); shape.lineTo(-3, 6); shape.absarc(0, 6, 3, Math.PI, 0, true); shape.lineTo(3, 0); shape.closePath();
    const a = mesh(new THREE.ShapeGeometry(shape), dark, x, 0, 3.05); g.add(a);
    g.add(mesh(new THREE.TorusGeometry(3.3, 0.35, 6, 16, Math.PI), stoneT, x, 6, 3.1));
  }
  for (let i = 0; i < 4; i++) g.add(cyl(0.6, 0.7, 9, stoneT, -12 + i * 8, 4.5, 3.4, 10));
  {
    const ped = new THREE.Shape(); ped.moveTo(-14, 0); ped.lineTo(14, 0); ped.lineTo(0, 5); ped.closePath();
    const p = mesh(new THREE.ExtrudeGeometry(ped, { depth: 8, bevelEnabled: false }), stoneT, 0, 14, -5); g.add(p);
  }
  for (const s of [-1, 1]) {
    const horse = new THREE.Group(); horse.position.set(s * 11, 14, 1); g.add(horse);
    const bronze = charToon({ color: 0x4a5a48, rim: 0.4 });
    horse.add(box(1.4, 1.6, 3.4, bronze, 0, 1.4, 0), box(0.8, 1.6, 0.9, bronze, 0, 2.6, 1.6), cyl(0.4, 0.4, 1.8, bronze, 0, 3.2, -0.2, 6));
    for (const [x, z] of [[-0.5, -1.2], [0.5, -1.2], [-0.5, 1.2], [0.5, 1.2]]) horse.add(cyl(0.18, 0.15, 1.4, bronze, x, 0.4, z, 5));
  }
  // the domes: the great one in the middle, four small ones round it, a fifth over the apse
  domeOn(0, -24, 8.5, 18.6, 10, 15);
  for (const [x, z] of [[-11, -12], [11, -12], [-11, -38], [11, -38]]) domeOn(x, z, 3.6, 18.6, 4.5, 5.5);
  domeOn(0, -50, 4.4, 18, 5, 6);
  // the campanile at the back
  g.add(mesh(new THREE.BoxGeometry(8, 30, 8), stone, 0, 15, -66));
  g.add(mesh(repeatUV(new THREE.CylinderGeometry(4.6, 4.6, 6, 4, 1, true), 4, 1), arc, 0, 33, -66).rotateY(Math.PI / 4));
  g.add(box(9.4, 1, 9.4, stoneT, 0, 30.5, -66));
  g.add(mesh(dome(4.4, 6), stoneT, 0, 36, -66));
  g.add(cyl(0.2, 0.3, 3, stoneT, 0, 43, -66, 6));
  // a broad flight of steps up to the portico
  for (let i = 0; i < 6; i++) g.add(box(30 - i * 0.4, 0.4, 2, stoneT, 0, 0.2 + i * 0.4 - 2.4, 6.5 - i * 0.8));
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  explodeGroups(g);
  mergeStatic(g);
  return g;
}

/** Iron lattice with a cut-out pattern, for an alpha-tested surface. */
function lattice(seed = 205) {
  const p = new Painter(128, 128, seed);
  const g = p.g;
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#4a3a2a'; g.lineWidth = 9;
  g.strokeRect(0, 0, 128, 128);
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 128); g.moveTo(128, 0); g.lineTo(0, 128); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  return p.texture({ repeat: [1, 1] });
}

/**
 * The Eiffel Tower, `height` tall: four latticed faces that curve in from the splayed legs to the spire, the
 * arches between the legs, two platforms, and a cage of little lights that twinkle at dusk.
 */
export function eiffelTower(height = 150) {
  const g = new THREE.Group();
  const H = height;
  const half = (y: number) => {
    const t = y / H;
    return lerp(H * 0.205, H * 0.012, Math.pow(t, 0.42));
  };
  const iron = new THREE.MeshLambertMaterial({ map: lattice(), alphaTest: 0.4, side: THREE.DoubleSide, color: 0x8a6040, emissive: 0x3a2010 });
  // four faces from the ground to the top, with an arch cut out between the legs
  const N = 40, M = 10;
  for (let f = 0; f < 4; f++) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const y = (i / N) * H, w = half(y);
      for (let j = 0; j <= M; j++) {
        const s = (j / M) * 2 - 1;
        pos.push(s * w, y, w);
        uv.push((s * w) / 3, y / 3);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
      const y = ((i + 0.5) / N) * H, s = ((j + 0.5) / M) * 2 - 1;
      // the great arch: no lattice between the legs below the first platform
      const archTop = H * 0.2 * Math.sqrt(Math.max(0, 1 - s * s / 0.55));
      if (y < archTop && Math.abs(s) < 0.74) continue;
      const a = i * (M + 1) + j, b = a + M + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, iron);
    m.rotation.y = (f / 4) * TAU;
    g.add(m);
  }
  const solid = charToon({ color: 0x6a4a30, rim: 0.4, emissive: new THREE.Color(0x201008) });
  for (const [y, k] of [[H * 0.19, 1.08], [H * 0.38, 1.1], [H * 0.9, 1.4]] as const) { const w = half(y) * 2 * k; g.add(box(w, H * 0.018, w, solid, 0, y, 0)); }
  g.add(cyl(H * 0.006, H * 0.012, H * 0.08, solid, 0, H * 1.03, 0, 6));
  // little lights over the whole frame
  const pts: number[] = [];
  const rng = new Rng(207);
  for (let i = 0; i < 240; i++) {
    const y = Math.pow(rng.next(), 0.9) * H, w = half(y), s = rng.range(-1, 1), f = rng.int(0, 3);
    const x = s * w, z = w;
    const c = Math.cos((f / 4) * TAU), sn = Math.sin((f / 4) * TAU);
    pts.push(x * c + z * sn, y, -x * sn + z * c);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lights = new THREE.Points(lg, new THREE.PointsMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(1.6), size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
  g.add(lights);
  const beacon = mesh(new THREE.SphereGeometry(H * 0.012, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d0).multiplyScalar(1.8) }), 0, H * 1.0, 0);
  g.add(beacon);
  return { group: g, lights: lights.material as THREE.PointsMaterial };
}
