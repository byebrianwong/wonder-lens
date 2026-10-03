import * as THREE from 'three';
import { box, cyl, glow, mesh, type Placement } from '../../../engine/Builders';
import { fluffyForest } from '../../../engine/Foliage';
import { charToon, Painter, repeatUV } from '../../../engine/Paint';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { SETS, Y } from '../layout';
import { ribbon, subCurve, wallStrip, type BuiltSet, type SetContext, optimize } from '../common';
import { BAY, STOREY, parisBuilding, streetPalette, chimneyStacks, tiled } from '../buildings';
import { bench, parisLamps } from '../props';
import { ashlar, cobbles, css, PAL, pavement, lettering } from '../textures';
import { lightShaft } from '../lens';

/*
 * The Canal Saint-Martin at night: the moped glides on the dark green water between stone quays lined with
 * plane trees and lamps, under arched iron footbridges, past the Hôtel du Nord, and into the vaulted tunnel
 * where the canal runs under the boulevard, lit by moonbeams through round skylights.
 */

export const CANAL = { z0: -912, z1: -1162, tunnel0: -1162, tunnel1: -1228, half: 13, quayY: 3.2 };
const MAX_LAMPS = 16;

/** Night water: dark green with ripples, a little sky in it, and long shimmering streaks under every lamp. */
function nightWater() {
  const uniforms = {
    time: { value: 0 },
    deep: { value: new THREE.Color(0x0a1e1a) },
    shallow: { value: new THREE.Color(0x1e4a3e) },
    skyColor: { value: new THREE.Color(0x2a4a48) },
    fogColor: { value: new THREE.Color() },
    fogDensity: { value: 0.004 },
    lamps: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    lampColor: { value: new THREE.Color(0xffc878) },
    moon: { value: new THREE.Vector3(0, 0, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying float vFogDepth;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform vec3 skyColor; uniform vec3 fogColor; uniform float fogDensity;
      uniform vec4 lamps[${MAX_LAMPS}]; uniform vec3 lampColor; uniform vec3 moon;
      varying vec3 vWorld; varying float vFogDepth;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
      void main(){
        vec2 p = vWorld.xz;
        // ripples: two drifting layers of noise give a gently moving surface normal
        float n1 = noise(p * 0.55 + vec2(time * 0.25, time * 0.1));
        float n2 = noise(p * 1.4 - vec2(time * 0.18, -time * 0.32));
        vec3 nrm = normalize(vec3((n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.2, 1.0, (n2 - 0.5) * 0.3));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(clamp(1.0 - dot(V, nrm), 0.0, 1.0), 4.0);
        vec3 col = mix(deep, shallow, n1 * 0.5);
        col = mix(col, skyColor, clamp(fres * 0.8 + 0.12, 0.0, 1.0));
        // lamp reflections: a streak from each lamp's foot towards the camera, broken up by the ripples
        vec2 cam = cameraPosition.xz;
        for (int i = 0; i < ${MAX_LAMPS}; i++) {
          vec4 L = lamps[i];
          if (L.w <= 0.0) continue;
          vec2 foot = L.xz;
          vec2 toCam = cam - foot;
          float len = length(toCam);
          vec2 dir = toCam / max(len, 0.001);
          vec2 d = p - foot;
          float along = dot(d, dir);
          float across = abs(dot(d, vec2(-dir.y, dir.x)));
          float reach = L.y * 3.2 + len * 0.08;
          float w = 0.18 + along * 0.025;
          float streak = exp(-across * across / (w * w)) * smoothstep(-0.6, 0.4, along) * (1.0 - smoothstep(reach * 0.4, reach, along));
          float broken = smoothstep(0.35, 0.75, noise(vec2(along * 2.2 - time * 1.4, across * 3.0 + float(i))));
          col += lampColor * L.w * streak * (0.35 + 1.4 * broken);
        }
        // the moon's path
        if (moon.z > 0.0) {
          vec2 md = normalize(moon.xy);
          float off = abs(dot(p - cam, vec2(-md.y, md.x)));
          float ahead = dot(p - cam, md);
          float m = exp(-off * off / 40.0) * smoothstep(5.0, 30.0, ahead) * smoothstep(0.55, 0.85, n2);
          col += vec3(0.6, 0.75, 0.8) * m * moon.z;
        }
        float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return { material: mat, uniforms };
}

/** A foam wake in a V behind the moped, as a soft white texture. */
function wakeTexture() {
  const p = new Painter(128, 256, 401);
  const g = p.g;
  g.clearRect(0, 0, 128, 256);
  for (let k = 0; k < 140; k++) {
    const t = p.rng.next();
    for (const s of [-1, 1]) {
      const x = 64 + s * t * 58 + p.rng.range(-3, 3), y = t * 250;
      g.fillStyle = `rgba(230,245,240,${(1 - t) * p.rng.range(0.2, 0.5)})`;
      g.beginPath(); g.ellipse(x, y, p.rng.range(2, 6), p.rng.range(3, 9), 0, 0, TAU); g.fill();
    }
  }
  return p.texture({ wrap: false });
}

/** The green iron footbridge: an arched deck with a lattice rail, stairs at each end, lanterns on the crown. */
function footbridge(span: number) {
  const g = new THREE.Group();
  const green = charToon({ color: 0x2f5a3a, rim: 0.5, emissive: new THREE.Color(0x061408) });
  const greenD = charToon({ color: 0x23442c, rim: 0.4 });
  const rise = 5.2, segs = 18;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push(new THREE.Vector3(0, Math.sin(t * Math.PI) * rise, t * span - span / 2)); }
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[i + 1], len = a.distanceTo(b), mid = a.clone().lerp(b, 0.5);
    const ang = -Math.atan2(b.y - a.y, b.z - a.z);
    const deck = box(3.6, 0.25, len + 0.05, greenD, 0, mid.y + 0.4, mid.z); deck.rotation.x = ang; g.add(deck);
    // the arch girders below, with round cut-outs suggested by struts
    for (const s of [-1, 1]) {
      const gir = box(0.18, 0.7, len + 0.05, green, s * 1.75, mid.y - 0.05, mid.z); gir.rotation.x = ang; g.add(gir);
      const rail = box(0.08, 0.08, len + 0.05, green, s * 1.75, mid.y + 1.55, mid.z); rail.rotation.x = ang; g.add(rail);
      g.add(box(0.06, 1.2, 0.06, green, s * 1.75, a.y + 1.0, a.z));
      const x1 = box(0.04, 1.4, 0.04, green, s * 1.75, mid.y + 0.95, mid.z); x1.rotation.x = 0.8; g.add(x1);
      const x2 = box(0.04, 1.4, 0.04, green, s * 1.75, mid.y + 0.95, mid.z); x2.rotation.x = -0.8; g.add(x2);
    }
  }
  // stair landings at the ends
  for (const s of [-1, 1]) g.add(box(4.2, 0.6, 3, greenD, 0, 0.3, s * (span / 2 + 1.2)));
  // lanterns on the crown
  for (const s of [-1, 1]) {
    g.add(cyl(0.06, 0.06, 2.6, green, s * 1.75, rise + 2.4, 0, 6));
    g.add(mesh(new THREE.SphereGeometry(0.32, 10, 8), glow(0xffd890, 1.8), s * 1.75, rise + 3.8, 0));
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { group: g, crown: new THREE.Vector3(0, rise + 0.55, 0), lamps: [new THREE.Vector3(-1.75, rise + 3.8, 0), new THREE.Vector3(1.75, rise + 3.8, 0)] };
}

/** A tunnel vault: a half cylinder of dressed stone with round skylights cut in its crown. */
function vaultTexture(seed = 403) {
  const p = new Painter(256, 256, seed).fill('#8a8470');
  const g = p.g, rng = p.rng;
  for (let r = 0; r < 12; r++) { let x = r % 2 ? -14 : 0; while (x < 256) { const w = rng.range(30, 60); g.fillStyle = css(0x9a9480, rng.range(0.8, 1.1)); g.fillRect(x + 1, r * 21.3 + 1, w - 2, 19); x += w; } }
  p.dabs({ n: 60, colors: ['#3a4a3a', '#2a2a24', '#7a7a6a'], r: [6, 30], alpha: [0.08, 0.2] });
  p.vgrad([[0, 'rgba(0,0,0,0)'], [0.85, 'rgba(0,0,0,0)'], [1, 'rgba(40,70,50,0.5)']]);
  return p.texture({ repeat: [1, 1] });
}

export interface Canal extends BuiltSet {
  bridges: Array<{ crown: THREE.Vector3; yaw: number }>;
  /** spots along the quays (left is the towpath side) */
  quay(z: number, side: number, inset?: number): THREE.Vector3;
  water: ReturnType<typeof nightWater>;
}

export function buildCanal(ctx: SetContext): Canal {
  const { road, lights } = ctx;
  const rng = new Rng(6060);
  const g = new THREE.Group();
  const arch = new THREE.Group(), decor = new THREE.Group(), live = new THREE.Group();
  g.add(arch, decor, live);
  const C = CANAL, Q = C.quayY;
  const curve = subCurve(road, C.z0 + 6, C.tunnel1 - 4, 90);
  const segs = 160;

  // ---------- water, quay walls, towpaths ----------
  const water = nightWater();
  const wm = new THREE.Mesh(ribbon(curve, -C.half - 0.5, C.half + 0.5, segs, -0.02, 4), water.material);
  wm.receiveShadow = false;
  live.add(wm);
  const quayStone = new THREE.MeshLambertMaterial({ map: ashlar(0x8a8a78, 405) });
  const coping = new THREE.MeshLambertMaterial({ color: 0xb8b4a0 });
  const towpath = new THREE.MeshLambertMaterial({ map: cobbles(0x6a6a5a, 407) });
  const pave = new THREE.MeshLambertMaterial({ map: pavement(0x7a7a6a, 409) });
  const quayEnd = road.u(C.tunnel0 + 2);
  const qcurve = subCurve(road, C.z0 + 6, C.tunnel0 + 2, 70);
  for (const s of [-1, 1]) {
    arch.add(new THREE.Mesh(wallStrip(qcurve, s * C.half, -2, Q, segs, s < 0, 4), quayStone));
    arch.add(new THREE.Mesh(ribbon(qcurve, s > 0 ? C.half : -C.half - 0.8, s > 0 ? C.half + 0.8 : -C.half, segs, Q + 0.05, 1), coping));
    const tp = new THREE.Mesh(ribbon(qcurve, s > 0 ? C.half + 0.8 : -C.half - 9, s > 0 ? C.half + 9 : -C.half - 0.8, segs, Q, 4), towpath); tp.receiveShadow = true; arch.add(tp);
    const sw = new THREE.Mesh(ribbon(qcurve, s > 0 ? C.half + 9 : -C.half - 13, s > 0 ? C.half + 13 : -C.half - 9, segs, Q + 0.15, 4), pave); sw.receiveShadow = true; arch.add(sw);
  }
  void quayEnd;

  // ---------- buildings along both quays, windows lit ----------
  const pal = streetPalette(rng, { lit: 0.5, glass: 'night', litStrength: 1.1 });
  const chimneys: Placement[] = [];
  for (const s of [-1, 1]) {
    let z = C.z0 - 4;
    while (z > C.tunnel0 + 6) {
      const bays = rng.int(3, 5), w = bays * BAY, zc = z - w / 2;
      const p = road.side(zc, s * (C.half + 13.2));
      const yaw = road.faceRoad(zc, s);
      const isHotel = s > 0 && Math.abs(zc + 1075) < 7;
      const b = parisBuilding({
        bays, storeys: rng.int(4, 6), depth: 12, facade: pal.facades[pal.pick()], side: pal.sides[0],
        ground: isHotel ? { kind: 'shop', shop: { name: 'HÔTEL DU NORD', paint: 0x6a1a1c, goods: 'bottles', sub: 'Bar — Restaurant', seed: 411, w: 128 * bays * 2, h: 280 } } : rng.chance(0.4) ? { kind: 'shop', shop: { name: rng.pick(['BAR TABAC', 'BRASSERIE', 'ÉPICERIE', 'LIBRAIRIE', 'BOULANGERIE', 'CAFÉ']), paint: rng.pick([0x2f4a3a, 0x6a1a1c, 0x2a2a3a, 0x8a5a2a]), goods: rng.pick(['bottles', 'books', 'bread', 'tabac'] as const), seed: 420 + Math.round(z), w: 128 * bays * 2, h: 280 } } : { kind: 'door', mat: rng.pick(pal.doors) },
        balconies: [1, 4], flowers: 0.2, rng, shopGlow: 1.1, chimneys, place: { x: p.x, y: Q, z: p.z, yaw },
      });
      b.position.set(p.x, Q + 0.15, p.z); b.rotation.y = yaw;
      arch.add(b);
      z -= w + (rng.chance(0.15) ? rng.range(6, 10) : 0.1);
    }
  }
  decor.add(chimneyStacks(chimneys));
  // neon sign over the Hôtel du Nord
  {
    const p = road.side(-1075, C.half + 12.6, Q + 6.4);
    const neon = mesh(new THREE.PlaneGeometry(9, 1.3), new THREE.MeshBasicMaterial({ map: lettering('Hôtel du Nord', { fg: '#ff6a5a', bg: '#1a0808', w: 512, h: 80, italic: true }), color: new THREE.Color(1.4, 1.4, 1.4) }), p.x, p.y, p.z);
    neon.rotation.y = road.faceRoad(-1075, 1); decor.add(neon);
  }

  // ---------- plane trees, lamps and benches on the quays ----------
  const trees: Placement[] = [], lampPl: Placement[] = [];
  const lampFeet: THREE.Vector3[] = [];
  for (let z = C.z0 - 8; z > C.tunnel0 + 6; z -= 13) for (const s of [-1, 1]) {
    const p = road.side(z + rng.range(-2, 2), s * (C.half + 4.2));
    trees.push({ x: p.x, y: Q, z: p.z, scale: rng.range(1.6, 2.1), rot: rng.range(0, TAU) });
  }
  for (let z = C.z0 - 14, i = 0; z > C.tunnel0 + 6; z -= 18, i++) for (const s of [-1, 1]) {
    const p = road.side(z + (s > 0 ? 9 : 0), s * (C.half + 1.6));
    lampPl.push({ x: p.x, y: Q, z: p.z, scale: 1.05, rot: 0 });
    lampFeet.push(new THREE.Vector3(p.x - s * 0.8, 4.8, p.z));
  }
  decor.add(fluffyForest({ shape: 'broad', trunk: 0x9a9480, leaves: [0x3f6a32, 0x4a7a3a, 0x355e2a, 0x5a8a42] }, trees, rng, { castShadow: true, variants: 3 }));
  decor.add(parisLamps(lampPl));
  for (let z = C.z0 - 30; z > C.tunnel0 + 20; z -= 34) for (const s of [-1, 1]) { const p = road.side(z, s * (C.half + 2.6), Q); const b = bench(1.1); b.position.copy(p); b.rotation.y = road.faceRoad(z, s); decor.add(b); }

  // ---------- footbridges across the canal ----------
  const bridges: Canal['bridges'] = [];
  for (const bz of [-968, -1046, -1118]) {
    const fb = footbridge(C.half * 2 + 4);
    const p = road.at(bz);
    fb.group.position.set(p.x, Q, bz);
    const yaw = road.along(bz) + Math.PI / 2;
    fb.group.rotation.y = yaw;
    decor.add(fb.group);
    fb.group.updateMatrixWorld(true);
    bridges.push({ crown: fb.crown.clone().applyMatrix4(fb.group.matrixWorld), yaw });
    for (const l of fb.lamps) lampFeet.push(l.clone().applyMatrix4(fb.group.matrixWorld));
  }

  // ---------- the lock: two pairs of timber gates standing open ----------
  {
    const lz = -1005, p = road.at(lz);
    const timber = charToon({ color: 0x4a3a2a, rim: 0.3 });
    for (const s of [-1, 1]) {
      const gate = box(0.8, 5.6, 9, timber, p.x + s * (C.half - 0.6), 0.8, lz - s * 0.5);
      gate.rotation.y = s * 0.12; arch.add(gate);
      const beam = box(0.4, 0.4, 10, timber, p.x + s * (C.half + 2.5), Q + 1.1, lz + 5); beam.rotation.y = s * 1.2; decor.add(beam);
    }
    arch.add(box(C.half * 2 + 1.6, 0.6, 1.2, coping, p.x, Q - 0.2, lz - 5));
  }

  // ---------- the vaulted tunnel ----------
  const vault = new THREE.MeshLambertMaterial({ map: vaultTexture(), side: THREE.DoubleSide });
  {
    const tz0 = C.tunnel0, tz1 = C.tunnel1, len = tz0 - tz1, R = C.half + 1.5;
    const tube = mesh(repeatUV(new THREE.CylinderGeometry(R, R, len, 32, 1, true, -Math.PI / 2, Math.PI), 6, len / 8), vault, 0, Q - 1, (tz0 + tz1) / 2);
    tube.rotation.set(-Math.PI / 2, 0, 0);
    arch.add(tube);
    // the tunnel mouth: a stone face with the arch cut out
    const face = new THREE.Shape(); face.moveTo(-30, -6); face.lineTo(30, -6); face.lineTo(30, 26); face.lineTo(-30, 26); face.closePath();
    const hole = new THREE.Path(); hole.moveTo(R, Q - 1); hole.lineTo(R, -6); hole.lineTo(-R, -6); hole.lineTo(-R, Q - 1); hole.absarc(0, Q - 1, R, Math.PI, 0, true); face.holes.push(hole);
    const mouth = mesh(new THREE.ExtrudeGeometry(face, { depth: 2, bevelEnabled: false }), new THREE.MeshLambertMaterial({ map: ashlar(0x9a9480, 413) }), 0, 0, tz0);
    (mouth.geometry as THREE.BufferGeometry).computeVertexNormals();
    arch.add(mouth);
    // towpath ledges inside
    for (const s of [-1, 1]) arch.add(box(2.4, 0.4, len, coping, s * (C.half - 0.4), Q - 1.2, (tz0 + tz1) / 2));
    // little lanterns along both walls
    const lanternPl: THREE.Vector3[] = [];
    for (let z = tz0 - 6; z > tz1 + 2; z -= 11) for (const s of [-1, 1]) {
      const p = new THREE.Vector3(s * (C.half + 0.6), Q + 2.6, z + (s > 0 ? 5 : 0));
      decor.add(mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), glow(0xffc070, 1.6), p.x, p.y, p.z));
      decor.add(mesh(new THREE.BoxGeometry(0.9, 0.12, 0.7), charToon({ color: 0x24302a, rim: 0.3 }), p.x - s * 0.2, p.y + 0.42, p.z));
      lanternPl.push(new THREE.Vector3(p.x - s * 0.6, 3.2, p.z));
    }
    lampFeet.push(...lanternPl);
    // moonbeams through round skylights in the crown
    for (let z = tz0 - 12; z > tz1 + 6; z -= 16) {
      decor.add(mesh(new THREE.CircleGeometry(1.8, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8e0e8).multiplyScalar(1.4), side: THREE.DoubleSide }), 0, Q - 1 + R - 0.05, z).rotateX(Math.PI / 2));
      decor.add(lightShaft(new THREE.Vector3(0, Q - 1 + R - 0.2, z), new THREE.Vector3(0.6, 0, z - 2), 3.6, 0xa8d0e0, 0.32));
      lampFeet.push(new THREE.Vector3(0, R + 1, z));
    }
  }

  // the foam wake that follows the moped on the water
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 9), new THREE.MeshBasicMaterial({ map: wakeTexture(), transparent: true, depthWrite: false, opacity: 0.7 }));
  wake.rotation.x = -Math.PI / 2; wake.renderOrder = 2;
  live.add(wake);

  // ---------- light ----------
  const uIn = road.u(C.z0), uOut = road.u(C.tunnel0);
  lights.add({ from: uIn, to: road.u(-1040), pos: road.side(-985, -C.half - 2, 5), color: 0xffc070, intensity: 40, distance: 30 });
  lights.add({ from: road.u(-1030), to: uOut, pos: road.side(-1075, C.half + 4, 6), color: 0xff8a6a, intensity: 40, distance: 32 });
  lights.add({ from: road.u(C.tunnel0 + 10), to: road.u(SETS.canal.z1), pos: new THREE.Vector3(0, 9, -1195), color: 0xa8d0e0, intensity: 30, distance: 34 });

  optimize(arch);
  optimize(decor);

  const lampTmp: Array<{ p: THREE.Vector3; d: number }> = lampFeet.map((p) => ({ p, d: 0 }));
  void lerp; void PAL; void glow; void STOREY; void tiled; void Y; void clamp;
  return {
    id: 'canal', group: g, show: [road.u(-905), road.u(SETS.canal.z1 + 10)], occluders: [arch], subjects: [],
    floor: (x, z) => {
      const r = road.at(z);
      const lat = Math.abs((x - r.x) * r.rx + (z - r.z) * r.rz);
      if (z < C.tunnel0) return lat < C.half ? -2 : Q - 1;
      return lat < C.half ? -2 : Q;
    },
    bridges,
    quay: (z, side, inset = 2.4) => road.side(z, side * (C.half + inset), 0).setY(Q),
    water,
    update(_dt, t, ride) {
      const u = water.uniforms;
      u.time.value = t;
      // the nearest lamps light the water
      const cam = ctx.camera.position;
      for (const l of lampTmp) l.d = l.p.distanceToSquared(cam);
      lampTmp.sort((a, b) => a.d - b.d);
      for (let i = 0; i < MAX_LAMPS; i++) {
        const l = lampTmp[i];
        if (!l) { u.lamps.value[i].set(0, 0, 0, 0); continue; }
        u.lamps.value[i].set(l.p.x, l.p.y, l.p.z, smoothstep(140 * 140, 40 * 40, l.d) * (l.p.y > 10 ? 0.5 : 1));
      }
      // the wake trails the moped while it is on the water
      const onWater = ride.position.y < 0.6 && ride.position.z < C.z0 - 4;
      wake.visible = onWater;
      if (onWater) {
        wake.position.set(ride.position.x - ride.tangent.x * 5, 0.05, ride.position.z - ride.tangent.z * 5);
        wake.rotation.z = Math.atan2(ride.tangent.x, -ride.tangent.z);
        (wake.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 7) * 0.05;
      }
    },
  };
}
