import * as THREE from 'three';
import { mergeStatic } from '../../../engine/Builders';
import { Painter, charToon } from '../../../engine/Paint';
import { envelope, LookAt, limbGeometry, outline, profileShape, sculpt, Spring } from '../../../engine/Rig';
import { Rng, TAU, clamp, damp, lerp } from '../../../engine/math';
import { StopMotion, ownMap } from '../stopmotion';
import { css } from '../textures';
import { HEAD_R, hold, makeAdult, makeKid, peakedCap, poseArm, relax, wear, type Adult, type Kid } from '../people';
import { boxAt, cylAt, merge } from './kit';
import { AC } from './plan';

/**
 * The people and creatures of Asteroid City. The alien and the roadrunner are stop-motion puppets (they move
 * on twos and their skin and feathers boil); the people are the world's painted figures. Every builder works
 * standalone (no scene needed), so the curtain call and the character gallery can use them too.
 */

const INK = 0x2a1e24;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// =========================================================================================================
// THE ALIEN
// =========================================================================================================

/** Pale grey-violet skin, mottled, with faint ridges over the cranium (sphere UV layout). */
function alienSkin(seed = 801) {
  const p = new Painter(512, 256, seed).fill('#d6d4d0');
  p.vgrad([[0, 'rgba(255,255,255,0.18)'], [0.55, 'rgba(0,0,0,0)'], [1, 'rgba(90,80,120,0.22)']]);
  p.dabs({ n: 160, colors: ['#c8c4c8', '#e4e2dc', '#bcb8c4', '#d8d0cc'], r: [4, 18], alpha: [0.18, 0.35] });
  p.dabs({ n: 260, colors: ['#a8a0b0', '#f0eee8'], r: [1, 2.5], alpha: [0.25, 0.5] });
  p.lines({ n: 26, colors: ['#b4aebc'], alpha: [0.2, 0.35], width: [1, 2.2], vertical: true, wobble: 3 });
  return p.texture();
}

export type AlienAct = 'idle' | 'float' | 'reach' | 'lift' | 'photo' | 'bow' | 'walk';

export interface Alien {
  group: THREE.Group;
  /** the right hand (the meteorite goes in it) */
  hand: THREE.Object3D;
  head: THREE.Group;
  /** play a pose; the puppet moves into it a frame at a time */
  act(a: AlienAct): void;
  readonly current: AlienAct;
  /** put the puppet's root here (applied on the puppet's own frames, so it moves on twos too) */
  place(p: THREE.Vector3, yaw: number): void;
  update(dt: number, t: number, lookAt: THREE.Vector3 | null): void;
}

interface AlienPose { spine: [number, number, number]; neck: [number, number, number]; head: [number, number, number]; sh: [[number, number, number], [number, number, number]]; el: [number, number]; hip: [[number, number], [number, number]]; kn: [number, number]; drop: number }

const POSES: Record<AlienAct, AlienPose> = {
  idle: { spine: [0.08, 0, 0], neck: [0.12, 0, 0], head: [0.05, 0, 0.12], sh: [[0.05, 0, 0.1], [0.05, 0, 0.1]], el: [-0.25, -0.2], hip: [[0, 0.02], [0, 0.02]], kn: [0.06, 0.06], drop: 0.02 },
  walk: { spine: [0.12, 0, 0], neck: [0.1, 0, 0], head: [0, 0, 0], sh: [[0.2, 0, 0.12], [-0.2, 0, 0.12]], el: [-0.35, -0.35], hip: [[-0.35, 0], [0.3, 0]], kn: [0.15, 0.45], drop: 0.04 },
  float: { spine: [-0.05, 0, 0], neck: [0.3, 0, 0], head: [0.25, 0, 0], sh: [[-0.15, 0, 0.6], [-0.15, 0, 0.6]], el: [-0.35, -0.35], hip: [[0.05, 0.04], [0.05, 0.04]], kn: [0.1, 0.12], drop: 0 },
  reach: { spine: [0.55, 0.1, 0], neck: [0.25, 0, 0], head: [0.3, 0, 0.1], sh: [[0.1, 0, 0.15], [-1.25, 0.1, 0.05]], el: [-0.4, -0.15], hip: [[-0.45, 0.02], [-0.45, 0.02]], kn: [0.55, 0.55], drop: 0.22 },
  lift: { spine: [0.05, 0, 0], neck: [0.05, 0, 0], head: [0.15, 0, -0.1], sh: [[0.1, 0, 0.1], [-0.75, 0, 0.1]], el: [-0.3, -1.45], hip: [[0, 0.02], [0, 0.02]], kn: [0.05, 0.05], drop: 0.02 },
  photo: { spine: [-0.04, 0.15, 0], neck: [0.0, 0, 0], head: [-0.05, 0, 0.28], sh: [[-0.35, 0, 1.15], [-0.55, 0, 0.12]], el: [-1.7, -1.35], hip: [[0.0, 0.0], [-0.3, 0.12]], kn: [0.0, 0.5], drop: 0.0 },
  bow: { spine: [0.85, 0, 0], neck: [0.25, 0, 0], head: [0.2, 0, 0], sh: [[-0.4, 0, 0.75], [-0.7, 0, 0.0]], el: [-0.5, -1.9], hip: [[-0.15, 0], [-0.15, 0]], kn: [0.12, 0.12], drop: 0.06 },
};

/**
 * The visitor from space: very tall and very thin, pale, with an egg-shaped head, huge black eyes set on a
 * slant and a lipless slit of a mouth; arms that reach its knees and three long fingers. A stop-motion
 * puppet: it holds each pose for two frames and its skin boils. About 3 units tall; faces +z.
 */
export function makeAlienPuppet(seed = 7): Alien {
  const group = new THREE.Group();
  const puppet = new THREE.Group();
  group.add(puppet);
  const skinMat = ownMap(charToon({ map: alienSkin(), rim: 0.65, shade: 0x8c90c4, emissive: new THREE.Color(0x24242c) }));
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.12, metalness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xe8f4ff });
  const lineW = 1.4, lineMax = 0.02;
  const ink = (m: THREE.Mesh) => { outline(m, INK, lineW, lineMax); return m; };

  // ----- joints -----
  const pelvis = new THREE.Group(); pelvis.position.y = 1.42; puppet.add(pelvis);
  const spine = new THREE.Group(); spine.position.y = 0.03; pelvis.add(spine);
  const neck = new THREE.Group(); neck.position.y = 0.8; spine.add(neck);
  const head = new THREE.Group(); head.position.y = 0.36; neck.add(head);

  // ----- body: a narrow sculpted torso with a little pot belly and bony shoulders -----
  const torsoGeo = sculpt(profileShape([[0.86, 0.0], [0.82, 0.07], [0.76, 0.19], [0.62, 0.17], [0.42, 0.14], [0.25, 0.12], [0.1, 0.13], [-0.02, 0.12], [-0.08, 0.0]], { depth: 0.62, bulge: (d) => Math.max(0, d.z) * Math.max(0, 0.5 - Math.abs(d.y - 0.1)) * 0.05 }), 32, 24);
  const torso = ink(new THREE.Mesh(torsoGeo, skinMat)); spine.add(torso);
  const pelvisMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), skinMat); pelvisMesh.scale.set(1.05, 0.7, 0.8); pelvisMesh.position.y = -0.03; pelvis.add(pelvisMesh);
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 10), skinMat); neckMesh.position.y = 0.15; neck.add(neckMesh);
  // the head: a tall egg, wide over the brow, narrowing to a small chin
  const headGeo = sculpt(profileShape([[0.5, 0.0], [0.47, 0.13], [0.38, 0.24], [0.24, 0.28], [0.08, 0.27], [-0.06, 0.22], [-0.17, 0.15], [-0.25, 0.08], [-0.28, 0.0]], { depth: 0.9 }), 40, 30);
  const skull = ink(new THREE.Mesh(headGeo, skinMat)); skull.position.y = 0.12; head.add(skull);
  // the eyes: big glossy black almonds, slanting up and out, each with a point of light
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), eyeMat);
    e.scale.set(0.085, 0.125, 0.05); e.position.set(s * 0.105, 0.16, 0.225); e.rotation.set(-0.1, s * 0.35, s * -0.42);
    head.add(e);
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), shine); sp.position.set(s * 0.09 + 0.02, 0.21, 0.27); head.add(sp);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.01), new THREE.MeshBasicMaterial({ color: 0x4a4048 })); mouth.position.set(0, -0.03, 0.235); head.add(mouth);
  for (const s of [-1, 1]) { const n = new THREE.Mesh(new THREE.SphereGeometry(0.006, 4, 3), new THREE.MeshBasicMaterial({ color: 0x5a5058 })); n.position.set(s * 0.015, 0.04, 0.25); head.add(n); }

  // ----- arms: long and thin, three long fingers -----
  const shoulder: THREE.Group[] = [], elbow: THREE.Group[] = [];
  let rightHand: THREE.Object3D = new THREE.Object3D();
  const upperGeo = limbGeometry(0.042, 0.03, 0.56, 8, 4), foreGeo = limbGeometry(0.03, 0.022, 0.56, 8, 4);
  const handGeo = (() => {
    const parts: THREE.BufferGeometry[] = [];
    const palm = new THREE.SphereGeometry(0.045, 8, 6); palm.scale(1, 1.3, 0.55); palm.translate(0, -0.04, 0); parts.push(palm);
    for (let i = -1; i <= 1; i++) { const f = limbGeometry(0.012, 0.007, 0.2, 5, 3); f.rotateZ(i * 0.16); f.rotateX(-0.25); f.translate(i * 0.025, -0.08, 0.01); parts.push(f); }
    const th = limbGeometry(0.011, 0.007, 0.12, 5, 2); th.rotateZ(0.8); th.translate(0.03, -0.05, 0.02); parts.push(th);
    return merge(parts);
  })();
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.17, 0.74, 0); spine.add(sh);
    sh.add(ink(new THREE.Mesh(upperGeo, skinMat)));
    const el = new THREE.Group(); el.position.y = -0.56; sh.add(el);
    el.add(ink(new THREE.Mesh(foreGeo, skinMat)));
    const hand = new THREE.Group(); hand.position.y = -0.56; el.add(hand);
    const hg = handGeo.clone(); if (s < 0) hg.scale(-1, 1, 1);
    hand.add(new THREE.Mesh(hg, skinMat));
    shoulder.push(sh); elbow.push(el);
    if (s > 0) rightHand = hand;
  }
  // the right hand is index 1 (+x side): it is the figure's left; the meteorite hand is the one that reaches (index 1)

  // ----- legs: long shins, narrow feet -----
  const hip: THREE.Group[] = [], knee: THREE.Group[] = [];
  const thighGeo = limbGeometry(0.055, 0.04, 0.72, 8, 4), shinGeo = limbGeometry(0.04, 0.028, 0.68, 8, 4);
  for (const s of [-1, 1]) {
    const hp = new THREE.Group(); hp.position.set(s * 0.075, -0.04, 0); pelvis.add(hp);
    hp.add(ink(new THREE.Mesh(thighGeo, skinMat)));
    const kn = new THREE.Group(); kn.position.y = -0.72; hp.add(kn);
    kn.add(ink(new THREE.Mesh(shinGeo, skinMat)));
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), skinMat); foot.scale.set(0.045, 0.03, 0.15); foot.position.set(0, -0.68, 0.07); kn.add(foot);
    hip.push(hp); knee.push(kn);
  }
  puppet.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.outline) o.castShadow = true; });

  // ----- motion: poses blended a frame at a time on twos -----
  const sm = new StopMotion(12, seed);
  sm.boilAmount = 0.006;
  let act: AlienAct = 'idle', actT = 0;
  const look = new LookAt(1.0, 0.5);
  const target = new THREE.Vector3(), cur = new THREE.Vector3();
  let targetYaw = 0, curYaw = 0, placed = false;
  const rng = new Rng(seed);
  let twitch = 0, twitchT = 2;
  const set = (o: THREE.Object3D, r: [number, number, number], k: number) => { o.rotation.x = lerp(o.rotation.x, r[0], k); o.rotation.y = lerp(o.rotation.y, r[1], k); o.rotation.z = lerp(o.rotation.z, r[2], k); };
  const alien: Alien = {
    group, hand: rightHand, head,
    act(a) { if (a !== act) { act = a; actT = 0; } },
    get current() { return act; },
    place(p, yaw) { target.copy(p); targetYaw = yaw; if (!placed) { cur.copy(p); curYaw = yaw; placed = true; group.position.copy(p); group.rotation.y = yaw; } },
    update(dt, t, lookAt) {
      actT += dt;
      if (!sm.tick(dt)) return;
      const step = 1 / 12;
      // the root moves in steps too (only when a scene places it; otherwise whoever owns the group moves it)
      if (placed) {
        cur.lerp(target, 1 - Math.exp(-9 * step)); curYaw = lerp(curYaw, targetYaw, 1 - Math.exp(-6 * step));
        group.position.copy(cur); group.rotation.y = curYaw;
      }
      const P = POSES[act];
      const k = 1 - Math.exp(-5.5 * step);
      const st = sm.t;
      // little life on top of the pose: a sway, a breath, now and then a sudden tilt of the head
      twitchT -= step; if (twitchT <= 0) { twitchT = rng.range(1.2, 3.2); twitch = rng.range(-0.3, 0.3); }
      const walkPh = act === 'walk' ? Math.sin(st * 5) : 0;
      set(spine, [P.spine[0] + Math.sin(st * 1.3) * 0.02, P.spine[1], P.spine[2] + Math.sin(st * 0.9) * 0.03], k);
      set(neck, P.neck, k);
      const [ly, lp] = look.update(neck, lookAt, step, act === 'photo' || act === 'idle' ? 1 : 0.3);
      set(head, [P.head[0] + lp, P.head[1] + ly, P.head[2] + twitch * (act === 'idle' ? 1 : 0.3)], k);
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1;
        const sh = P.sh[i];
        set(shoulder[i], [sh[0] + (act === 'float' ? Math.sin(st * 2 + i) * 0.12 : 0) + walkPh * 0.25 * s, sh[1], s * sh[2]], k);
        set(elbow[i], [P.el[i], 0, 0], k);
        set(hip[i], [P.hip[i][0] + walkPh * 0.45 * s, 0, s * P.hip[i][1]], k);
        set(knee[i], [P.kn[i] + Math.max(0, walkPh * s) * 0.5, 0, 0], k);
      }
      pelvis.position.y = lerp(pelvis.position.y, 1.42 - P.drop + (act === 'float' ? Math.sin(st * 1.7) * 0.03 : 0), k);
      sm.boil([skinMat]);
      void t; void actT;
    },
  };
  return alien;
}

// =========================================================================================================
// THE UFO
// =========================================================================================================

/** Hull plating: pale sage metal in rings and segments with rivets. Lathe UVs: u around, v along the profile. */
function hullTex() {
  const W = 1024, H = 256;
  const p = new Painter(W, H, 811).fill('#b8c4bc');
  const g = p.g;
  p.dabs({ n: 120, colors: ['#c8d2ca', '#a8b4ac', '#bcc8c0'], r: [10, 40], alpha: [0.15, 0.3], squash: 0.4 });
  for (const y of [40, 90, 130, 170, 214]) { g.fillStyle = 'rgba(40,60,60,0.45)'; g.fillRect(0, y, W, 3); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, y + 3, W, 2); }
  for (let x = 0; x < W; x += 64) { g.fillStyle = 'rgba(40,60,60,0.35)'; g.fillRect(x, 40, 2, 174); }
  for (let x = 8; x < W; x += 16) for (const y of [46, 96, 136, 176]) { g.fillStyle = 'rgba(60,80,80,0.5)'; g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill(); }
  return p.texture();
}

/** A soft vertical fade for the tractor beam: bright at the top, fading to nothing at the bottom and edges. */
function beamTex() {
  const p = new Painter(64, 128, 813);
  const img = p.g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const v = y / 127, u = x / 63;
    const a = Math.pow(1 - v, 0.6) * (0.55 + 0.45 * Math.pow(Math.sin(u * Math.PI * 8) * 0.5 + 0.5, 3));
    const i = (y * 64 + x) * 4;
    img.data[i] = 220; img.data[i + 1] = 255; img.data[i + 2] = 240; img.data[i + 3] = Math.round(clamp(a, 0, 1) * 255);
  }
  p.g.putImageData(img, 0, 0);
  return p.texture();
}

export interface Ufo {
  group: THREE.Group;
  /** the beam's length below the hatch (0 hides it) and how bright it is (0..1) */
  beam(length: number, k: number): void;
  update(dt: number, t: number): void;
}

/**
 * The flying saucer: a broad, low disc of riveted sage plating with a rim of turquoise portholes, a glass
 * dome on top, a ring of running lights underneath and a hatch in the middle that opens into a beam of light.
 * About 11 across.
 */
export function makeUfo(): Ufo {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const prof: Array<[number, number]> = [[0.001, -1.0], [1.4, -0.95], [2.4, -0.7], [3.6, -0.42], [4.9, -0.12], [5.5, 0.0], [5.4, 0.12], [4.6, 0.3], [3.2, 0.6], [2.0, 0.82], [0.001, 0.9]];
  const hull = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48), new THREE.MeshLambertMaterial({ map: hullTex(), emissive: 0x1c2a28 }));
  hull.castShadow = true;
  body.add(hull);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.45, 0.14, 6, 64), new THREE.MeshLambertMaterial({ color: 0x7a8a84 }));
  rim.rotation.x = Math.PI / 2; body.add(rim);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.8, 24, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x9ae8e0, emissive: 0x2a8a80, emissiveIntensity: 0.6, transparent: true, opacity: 0.75 }));
  dome.position.y = 0.78; dome.scale.y = 0.75; body.add(dome);
  // portholes round the rim
  const holes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.22, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8af0e0).multiplyScalar(1.4) }), 20);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V(1, 1, 1);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    q.setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0));
    holes.setMatrixAt(i, m4.compose(V(Math.cos(a) * 4.62, 0.33, Math.sin(a) * 4.62), q, one));
  }
  body.add(holes);
  // running lights under the disc, chasing round
  const N = 16;
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  const lc = new THREE.Color();
  for (let i = 0; i < N; i++) { const a = (i / N) * TAU; lights.setMatrixAt(i, m4.makeTranslation(Math.cos(a) * 3.9, -0.42, Math.sin(a) * 3.9)); lights.setColorAt(i, lc.setHex(0xffe8a0)); }
  body.add(lights);
  const hatchMat = new THREE.MeshBasicMaterial({ color: 0x2a3a38 });
  const hatch = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), hatchMat);
  hatch.rotation.x = Math.PI / 2; hatch.position.y = -0.99; body.add(hatch);
  // the beam: an open cone hanging from the hatch, and a pool of light where it lands
  const beamMat = new THREE.MeshBasicMaterial({ map: beamTex(), color: 0xc8fff0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beamGeo = new THREE.CylinderGeometry(1.1, 4.4, 1, 32, 1, true); beamGeo.translate(0, -0.5, 0);
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.y = -1.0; beam.visible = false; beam.renderOrder = 3;
  group.add(beam);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex(), color: 0xb8ffe8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32), poolMat); pool.rotation.x = -Math.PI / 2; pool.visible = false; pool.renderOrder = 3;
  group.add(pool);
  let beamLen = 0, beamK = 0;
  return {
    group,
    beam(length, k) { beamLen = length; beamK = k; },
    update(dt, t) {
      body.rotation.y += dt * 0.25;
      body.rotation.z = Math.sin(t * 0.8) * 0.03; body.rotation.x = Math.cos(t * 0.6) * 0.03;
      for (let i = 0; i < N; i++) { const on = ((Math.floor(t * 8) + i) % 4) === 0; lights.setColorAt(i, lc.setHex(on ? 0xfff0b0 : 0x7a5a30).multiplyScalar(on ? 1.8 : 0.6)); }
      lights.instanceColor!.needsUpdate = true;
      const on = beamK > 0.01 && beamLen > 0.5;
      beam.visible = pool.visible = on;
      hatchMat.color.setHex(0x2a3a38).lerp(new THREE.Color(0xe8fff4), clamp(beamK * 1.2, 0, 1));
      if (on) {
        beam.scale.set(1, beamLen, 1);
        beamMat.opacity = beamK * (0.5 + Math.sin(t * 6) * 0.06);
        beam.rotation.y = t * 0.6;
        pool.position.y = -1.0 - beamLen + 0.08;
        poolMat.opacity = beamK * 0.7;
      }
    },
  };
}

function poolTex() {
  const p = new Painter(128, 128, 815);
  const gr = p.g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  p.g.fillStyle = gr; p.g.fillRect(0, 0, 128, 128);
  return p.texture({ wrap: false });
}

// =========================================================================================================
// THE ROADRUNNER
// =========================================================================================================

/** Roadrunner feathers: streaky brown and cream with dark shafts, a pale belly (sphere UVs). */
function featherTex(seed = 821) {
  const p = new Painter(256, 128, seed).fill('#8a6a4a');
  p.fur({ n: 520, colors: ['#5a3e28', '#c8b08c', '#e8dcc4', '#3a2a1c', '#a08060'], len: [6, 14], width: [2, 4], alpha: [0.5, 0.85], angle: () => Math.PI * 0.55, jitter: 0.25 });
  p.vgrad([[0, 'rgba(0,0,0,0)'], [0.62, 'rgba(0,0,0,0)'], [0.75, 'rgba(236,226,206,0.85)'], [1, 'rgba(240,232,214,0.95)']]);
  return p.texture();
}

export interface Roadrunner {
  group: THREE.Group;
  /** 0 standing .. 1 running flat out */
  running: number;
  dance(): void;
  dancing(): boolean;
  peck(): void;
  update(dt: number, t: number): void;
}

/**
 * The roadrunner, a rod puppet in the film: streaky feathers, a shaggy crest, a blue and orange patch behind
 * the eye, a long tail held up, long legs that blur when it runs. Stop-motion. About 1 unit tall; faces +z.
 */
export function makeRoadrunner(seed = 31): Roadrunner {
  const group = new THREE.Group();
  const feathers = ownMap(charToon({ map: featherTex(), rim: 0.4 }));
  const dark = charToon({ color: 0x2a2420, rim: 0.2 });
  const legM = charToon({ color: 0x7a8a9a, rim: 0.2 });
  const ink = (m: THREE.Mesh) => { outline(m, INK, 1.3, 0.012); return m; };
  const rig = new THREE.Group(); rig.position.y = 0.55; group.add(rig);
  const body = ink(new THREE.Mesh(sculpt(profileShape([[0.2, 0], [0.18, 0.1], [0.08, 0.17], [-0.06, 0.16], [-0.16, 0.1], [-0.2, 0]], { depth: 1 }), 24, 16), feathers));
  body.rotation.x = Math.PI / 2 - 0.25; body.scale.set(0.95, 1.6, 0.95); rig.add(body);
  const neck = new THREE.Group(); neck.position.set(0, 0.1, 0.24); rig.add(neck);
  const nm = ink(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 0.28, 10), feathers)); nm.position.y = 0.12; nm.rotation.x = 0.35; neck.add(nm);
  const head = new THREE.Group(); head.position.set(0, 0.27, 0.06); neck.add(head);
  head.add(ink(new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), feathers)));
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.24, 8), dark); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.015, 0.17); head.add(beak);
  const crest: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) { const c = new THREE.ConeGeometry(0.022, 0.16, 5); c.rotateX(-1.0 - i * 0.12); c.translate((i % 2 ? 1 : -1) * 0.012, 0.08 + i * 0.004, -0.02 - i * 0.025); crest.push(c); }
  head.add(new THREE.Mesh(merge(crest), dark));
  for (const s of [-1, 1]) {
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6).translate(s * 0.058, 0.02, 0.045), charToon({ color: 0xf6efe0, rim: 0.1 })));
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4).translate(s * 0.07, 0.022, 0.055), dark));
    const patch = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), charToon({ color: s > 0 ? 0x5ab4e0 : 0x5ab4e0, rim: 0.2 })); patch.scale.set(0.01, 0.022, 0.04); patch.position.set(s * 0.078, 0.02, -0.02); head.add(patch);
    const orange = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), charToon({ color: 0xf08a3a, rim: 0.2 })); orange.scale.set(0.01, 0.018, 0.03); orange.position.set(s * 0.076, 0.0, -0.06); head.add(orange);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.04, -0.28); rig.add(tail);
  const tm = ink(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.58), feathers)); tm.position.z = -0.27; tail.add(tm);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(s * 0.06, 0.0, 0.02); rig.add(lg);
    lg.add(new THREE.Mesh(limbGeometry(0.03, 0.014, 0.28, 6, 2), feathers));
    const shin = new THREE.Group(); shin.position.y = -0.26; lg.add(shin);
    shin.add(new THREE.Mesh(limbGeometry(0.012, 0.01, 0.3, 5, 2), legM));
    for (const a of [-0.5, 0, 0.5, Math.PI]) { const toe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.09), legM); toe.position.set(Math.sin(a) * 0.035, -0.3, Math.cos(a) * 0.04); toe.rotation.y = a; shin.add(toe); }
    legs.push(lg);
  }
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.outline) o.castShadow = true; });
  group.scale.setScalar(1.35);
  const sm = new StopMotion(12, seed);
  let danceT = 0, peckT = 0;
  const rr: Roadrunner = {
    group, running: 0,
    dance() { danceT = 3.4; },
    dancing: () => danceT > 0,
    peck() { peckT = 2.2; },
    update(dt) {
      if (danceT > 0) danceT -= dt;
      if (peckT > 0) peckT -= dt;
      if (!sm.tick(dt)) return;
      const t = sm.t, run = rr.running;
      if (danceT > 0) {
        // side to side hops, tail flicking, head bobbing, wings (the body) shaking
        const ph = t * 8;
        rig.position.y = 0.55 + Math.abs(Math.sin(ph)) * 0.12;
        rig.rotation.set(-0.1, Math.sin(ph * 0.5) * 0.5, Math.sin(ph) * 0.3);
        tail.rotation.x = -0.9 + Math.sin(ph * 2) * 0.35;
        neck.rotation.x = Math.sin(ph * 2) * 0.3;
        head.rotation.set(0, 0, Math.sin(ph) * 0.3);
        legs[0].rotation.x = Math.sin(ph) * 0.6; legs[1].rotation.x = -Math.sin(ph) * 0.6;
      } else if (peckT > 0) {
        const ph = t * 10;
        rig.position.y = 0.55; rig.rotation.set(0.55, 0, 0);
        neck.rotation.x = 0.9 + Math.max(0, Math.sin(ph)) * 0.6;
        tail.rotation.x = -0.9; head.rotation.set(0, 0, 0);
        legs[0].rotation.x = -0.4; legs[1].rotation.x = -0.4;
      } else {
        // a blur of legs when it runs, body flat and tail out; standing, it looks about
        const ph = t * 26;
        legs[0].rotation.x = Math.sin(ph) * 1.0 * run; legs[1].rotation.x = -Math.sin(ph) * 1.0 * run;
        rig.rotation.set(0.45 * run, 0, 0);
        rig.position.y = 0.55 + Math.abs(Math.sin(ph)) * 0.04 * run;
        tail.rotation.x = run > 0.5 ? -0.05 : -0.75 + Math.sin(t * 2) * 0.05;
        neck.rotation.x = run > 0.5 ? -0.3 : Math.max(0, Math.sin(t * 2.6)) * 0.35;
        head.rotation.set(0, run > 0.5 ? 0 : Math.sin(t * 1.4) * 0.7, 0);
      }
      sm.boil([feathers]);
    },
  };
  return rr;
}

// =========================================================================================================
// PEOPLE
// =========================================================================================================

const pm = new Map<string, THREE.Material>();
const pmat = (k: string, make: () => THREE.Material) => { let m = pm.get(k); if (!m) { m = make(); pm.set(k, m); } return m; };

/** A 1950s press camera: a box with bellows, a lens, a viewfinder and a big round flash reflector with its bulb. */
function pressCamera() {
  const g = new THREE.Group();
  const black = pmat('camBlack', () => charToon({ color: 0x1e1e22, rim: 0.3 }));
  const chromeM = pmat('camChrome', () => charToon({ color: 0xd8dce0, rim: 0.7, emissive: new THREE.Color(0x202428) }));
  g.add(new THREE.Mesh(boxAt(0.2, 0.16, 0.14, 0, 0, 0), black));
  g.add(new THREE.Mesh(boxAt(0.16, 0.14, 0.1, 0, 0, 0.11), pmat('bellows', () => charToon({ color: 0x3a3030, rim: 0.2 }))));
  const lens = new THREE.CylinderGeometry(0.045, 0.05, 0.06, 12); lens.rotateX(Math.PI / 2); lens.translate(0, 0, 0.19);
  g.add(new THREE.Mesh(lens, chromeM));
  g.add(new THREE.Mesh(boxAt(0.06, 0.05, 0.08, 0, 0.1, 0.02), chromeM));
  const refl = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 16, 1, true).rotateX(-Math.PI / 2).translate(0.15, 0.1, 0.13), pmat('reflector', () => charToon({ color: 0xe8ecf0, rim: 0.8, side: THREE.DoubleSide, emissive: new THREE.Color(0x303438) })));
  g.add(refl, new THREE.Mesh(cylAt(0.012, 0.012, 0.12, 0.15, 0.04, 0.1, 5), chromeM));
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xc8d8e0 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), bulbMat); bulb.position.set(0.15, 0.1, 0.12);
  g.add(bulb);
  g.userData.bulb = bulbMat;
  return g;
}

export interface Augie {
  fig: Adult;
  group: THREE.Group;
  /** the flashbulb fires; returns nothing, the bulb glows and fades */
  snap(): void;
  /** seconds since the last flash (large when never) */
  readonly sinceFlash: number;
  /** turn towards a point (world) to photograph it, or null to look about */
  aim: THREE.Vector3 | null;
  bow(): void;
  update(dt: number, t: number, lookAt: THREE.Vector3 | null): void;
}

/**
 * Augie Steenbeck, war photographer: dark hair, a tan jacket over a pale blue shirt, a pipe, and his press
 * camera with its flash. He looks about with the camera at his chest; to take a picture he raises it to his
 * eye and the bulb fires.
 */
export function makeAugieFigure(seed = 61): Augie {
  const fig = makeAdult({ hair: 0x2a1e18, style: 'short', top: 0xcfe0ee, coat: 0xbca27a, coatSkirt: true, bottom: { kind: 'trousers', color: 0x6a5a4a }, shoes: 0x3a2618, hiRes: true, face: { mouth: 'small' }, seed, build: 1.0 });
  const cam = pressCamera();
  hold(fig, 1, cam, -0.02, -0.08, 0.08);
  cam.rotation.set(Math.PI / 2, 0, 0);
  // the pipe
  const pipe = new THREE.Group();
  const wood = pmat('pipe', () => charToon({ color: 0x5a3018, rim: 0.3 }));
  pipe.add(new THREE.Mesh(cylAt(0.008, 0.008, 0.11, 0, 0, 0.05, 5).rotateX(Math.PI / 2 - 0.3), wood));
  pipe.add(new THREE.Mesh(cylAt(0.024, 0.02, 0.05, 0, -0.02, 0.105, 8), wood));
  pipe.position.set(0.04, -0.075, 0.17); fig.head.add(pipe);
  const bulb = cam.userData.bulb as THREE.MeshBasicMaterial;
  let since = 99, raise = new Spring(0, 2.2, 0.75), bowT = 9;
  const turn = new Spring(0, 1.2, 0.8);
  const tmp = new THREE.Vector3();
  const a: Augie = {
    fig, group: fig.group, aim: null,
    snap() { since = 0; },
    get sinceFlash() { return since; },
    bow() { bowT = 0; },
    update(dt, t, lookAt) {
      since += dt; bowT += dt;
      // the camera comes up to his eye shortly before the flash and stays a moment after
      const up = since < 1.8 ? 1 : 0;
      const r = raise.update(up, dt);
      // turn the whole body a little towards what he is photographing
      let want = 0;
      if (a.aim) { tmp.copy(a.aim); fig.group.parent?.worldToLocal(tmp); const p = fig.group.position; want = clamp(Math.atan2(tmp.x - p.x, tmp.z - p.z) - (fig.group.userData.yaw0 ?? 0), -1.2, 1.2); }
      fig.spine.rotation.y = turn.update(want * 0.5, dt);
      relax(fig, dt, 5);
      // right arm (index 1) holds the camera; both hands bring it up to the face
      poseArm(fig, 1, lerp(-0.55, -1.5, r), lerp(0.1, 0.35, r), lerp(-1.3, -1.75, r));
      poseArm(fig, 0, lerp(-0.2, -1.35, r), lerp(0.12, 0.55, r), lerp(-0.4, -1.9, r));
      const k = envelope(bowT, 0, 0.4, 1.2, 1.9);
      fig.spine.rotation.x = k * 0.7;
      // the bulb: a blinding flash that fades to an ember
      const f = since < 0.12 ? 1 : Math.exp(-(since - 0.12) * 4);
      bulb.color.setRGB(0.78 + f * 2.6, 0.84 + f * 2.5, 0.88 + f * 2.2);
      fig.tick(dt, t, r > 0.5 ? null : lookAt, 0.8);
      if (r > 0.3) fig.head.rotation.x = lerp(fig.head.rotation.x, 0.1, r);
    },
  };
  return a;
}

/** Round spectacles on a figure's head (Woodrow's). */
function glasses(head: THREE.Group, R: number) {
  const m = pmat('specs', () => charToon({ color: 0x2a2420, rim: 0.2 }));
  for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(R * 0.2, R * 0.03, 5, 16), m); r.position.set(s * R * 0.3, 0.0, R * 0.95); head.add(r); }
  const br = new THREE.Mesh(new THREE.BoxGeometry(R * 0.18, R * 0.03, R * 0.03), m); br.position.set(0, R * 0.02, R * 1.0); head.add(br);
}

export interface Stargazers {
  group: THREE.Group;
  kids: Kid[];
  /** 'look' up at the sky, 'wave' at the rider, 'point' at something overhead */
  cue(c: 'look' | 'wave' | 'point' | 'stand'): void;
  update(dt: number, t: number, lookAt: THREE.Vector3 | null): void;
}

/**
 * Three Junior Stargazers: Woodrow with his spectacles, Dinah with her ponytail in a mint dress, and Clifford
 * in a striped shirt. The group's origin is between them on the ground; they stand in a shallow arc.
 */
export function makeStargazers(): Stargazers {
  const group = new THREE.Group();
  const woodrow = makeKid({ hair: 0x3a2a1e, style: 'short', top: 0xf6f2e8, sleeves: 'long', bottom: { kind: 'shorts', color: 0x2f4a7e }, socks: 0xf6f2e8, shoes: 0x2a2020, seed: 71 });
  glasses(woodrow.head, 0.29);
  const dinah = makeKid({ hair: 0x8a4a28, style: 'ponytail', top: AC.mint, sleeves: 'short', bottom: { kind: 'dress', color: AC.mint, length: 0.5 }, socks: 0xf6f2e8, shoes: 0x7a2a2a, seed: 73 });
  const clifford = makeKid({ hair: 0xc8a060, style: 'short', top: AC.coral, stripes: { color: 0xfbf6ec, count: 6, width: 14 }, sleeves: 'short', bottom: { kind: 'shorts', color: 0xb8a070 }, socks: 0x2f4a7e, shoes: 0x3a2a20, seed: 75 });
  const kids = [woodrow, dinah, clifford];
  const spots: Array<[number, number, number]> = [[-1.2, 0.3, 0.25], [0, 0, 0], [1.25, 0.25, -0.3]];
  kids.forEach((k, i) => { k.group.scale.setScalar(0.62); k.group.position.set(spots[i][0], 0, spots[i][1]); k.group.rotation.y = spots[i][2]; group.add(k.group); });
  let cue: 'look' | 'wave' | 'point' | 'stand' = 'stand', cueT = 0;
  const lift = kids.map(() => new Spring(0, 1.6, 0.7));
  return {
    group, kids,
    cue(c) { cue = c; cueT = 0; },
    update(dt, t, lookAt) {
      cueT += dt;
      kids.forEach((k, i) => {
        relax(k as unknown as Adult, dt, 5);
        const ph = t * 1.3 + i * 2.1;
        if (cue === 'wave' && cueT < 3) {
          // one arm up, waving from the elbow
          k.shoulder[1].rotation.set(-0.3, 0, 2.5); k.elbow[1].rotation.set(-0.3 - Math.abs(Math.sin(t * 9 + i)) * 0.6, 0, 0);
          k.tick(dt, t, lookAt, 1);
        } else if (cue === 'point') {
          k.shoulder[i === 1 ? 0 : 1].rotation.set(-2.6, 0, (i === 1 ? -1 : 1) * 0.2); k.elbow[i === 1 ? 0 : 1].rotation.set(-0.1, 0, 0);
          k.tick(dt, t, null, 0);
          k.head.rotation.x = lift[i].update(-0.65, dt);
        } else if (cue === 'look') {
          // gazing up, hands behind their backs
          for (const s of [0, 1]) { k.shoulder[s].rotation.set(0.35, 0, (s ? 1 : -1) * 0.2); k.elbow[s].rotation.set(-0.6, 0, 0); }
          k.tick(dt, t, null, 0);
          k.head.rotation.x = lift[i].update(-0.55 + Math.sin(ph) * 0.05, dt);
          k.head.rotation.y = Math.sin(ph * 0.7) * 0.3;
        } else {
          k.tick(dt, t, lookAt, 0.8);
          lift[i].update(0, dt);
        }
      });
    },
  };
}

export interface General {
  fig: Adult;
  group: THREE.Group;
  salute(): void;
  update(dt: number, t: number, lookAt: THREE.Vector3 | null): void;
}

/** General Gibson at the lectern: an olive uniform with ribbons, a peaked cap, making his speech. */
export function makeGeneral(): General {
  const fig = makeAdult({ skin: 0x8a5a3e, hair: 0x1a1414, style: 'short', top: 0x7a7a4a, coat: 0x6a6a3c, coatSkirt: false, bottom: { kind: 'trousers', color: 0x6a6a3c }, shoes: 0x1a1414, seed: 81, build: 1.12 });
  wear(fig, peakedCap(HEAD_R.adult, 0x6a6a3c, 0x2a2a1a, 0xd8a840));
  const rib = [0xc8323c, 0x2f4a7e, 0xf6dc8a, 0x52b8b4, 0xf6f2e8, 0xc8323c];
  rib.forEach((c, i) => { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.012), pmat(`rib${c}`, () => charToon({ color: c, rim: 0.2 }))); r.position.set(-0.08 + (i % 3) * 0.05, 0.42 - Math.floor(i / 3) * 0.026, 0.13); fig.spine.add(r); });
  let salT = 9;
  return {
    fig, group: fig.group,
    salute() { salT = 0; },
    update(dt, t, lookAt) {
      salT += dt;
      relax(fig, dt, 4);
      const s = envelope(salT, 0, 0.3, 2.0, 2.5);
      if (s > 0.01) {
        poseArm(fig, 0, lerp(0, -1.1, s), lerp(0.1, 1.2, s), lerp(0, -2.2, s));
      } else {
        // speechifying: one hand chopping the air now and then, the other on the lectern
        const g = Math.max(0, Math.sin(t * 0.9)) ** 2;
        poseArm(fig, 0, -0.5 - g * 0.9, 0.25, -1.0 - Math.sin(t * 5) * 0.2 * g);
      }
      poseArm(fig, 1, -0.6, 0.12, -0.9);
      fig.tick(dt, t, lookAt, 0.7);
    },
  };
}

/** A cowboy hat: a wide brim curled up at the sides and a tall creased crown with a band. */
function cowboyHat(R: number, color: number) {
  const g = new THREE.Group();
  const m = pmat(`hat${color}`, () => charToon({ color, rim: 0.35 }));
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 2.0, R * 2.0, R * 0.06, 28, 1), m);
  const bp = brim.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i); const r = Math.hypot(x, z); if (r > R * 1.1) bp.setY(i, bp.getY(i) + Math.pow(Math.abs(x) / (R * 2), 2) * R * 0.7 - (z > 0 ? 0.0 : 0)); }
  brim.geometry.computeVertexNormals();
  brim.position.y = R * 0.6; g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R * 1.05, R * 1.0, 20), m);
  const cp = crown.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i); if (y > 0) cp.setY(i, y - Math.max(0, 1 - Math.abs(x) / (R * 0.5)) * R * 0.25); }
  crown.geometry.computeVertexNormals();
  crown.position.y = R * 1.1; g.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.06, R * 0.15, 20), pmat('hatband', () => charToon({ color: 0x3a2418, rim: 0.2 })));
  band.position.y = R * 0.72; g.add(band);
  outline(brim, INK, 1.3, 0.014); outline(crown, INK, 1.3, 0.014);
  return g;
}

/** An acoustic guitar for a cowboy to hold across his body. */
function guitar() {
  const g = new THREE.Group();
  const wood = pmat('gtrWood', () => charToon({ color: 0xc88a48, rim: 0.4 }));
  const dark = pmat('gtrDark', () => charToon({ color: 0x3a2014, rim: 0.2 }));
  const lower = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8), wood); lower.scale.set(1, 1, 0.3); g.add(lower);
  const upper = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8), wood); upper.scale.set(1, 1, 0.3); upper.position.y = 0.24; g.add(upper);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), dark); hole.position.set(0, 0.12, 0.062); g.add(hole);
  g.add(new THREE.Mesh(boxAt(0.05, 0.5, 0.03, 0, 0.6, 0.02), dark), new THREE.Mesh(boxAt(0.08, 0.12, 0.03, 0, 0.9, 0.02), dark));
  return g;
}

export interface Cowboys {
  group: THREE.Group;
  update(dt: number, t: number): void;
  /** a big finish: hats raised */
  finale(): void;
}

/**
 * The singing cowboys with their guitars, three in a row. Their bodies are merged (they stand still while they
 * sing); only the strumming arms and the heads move.
 */
export function makeCowboys(): Cowboys {
  const group = new THREE.Group();
  const shirts = [0x9ac8e8, 0xf2b8b8, 0xf6e6c8];
  const hats = [0xe8dcc0, 0x6a4a2e, 0x2a2420];
  const strum: THREE.Group[] = [], heads: THREE.Group[] = [];
  const hatGroups: THREE.Object3D[] = [];
  shirts.forEach((c, i) => {
    const f = makeAdult({ hair: [0x6a4a2a, 0x2a1e18, 0xc8a060][i], style: 'short', top: c, bottom: { kind: 'trousers', color: 0x3a4a6a }, shoes: 0x6a3a1e, seed: 91 + i * 3, moustache: i === 1 ? 0x2a1e18 : undefined });
    const hat = cowboyHat(HEAD_R.adult, hats[i]);
    wear(f, hat); hatGroups.push(hat);
    const gt = guitar(); gt.position.set(0.02, 0.28, 0.2); gt.rotation.set(0.1, 0, 1.0); f.spine.add(gt);
    // the fretting arm reaches along the neck, the strumming arm crosses the body
    poseArm(f, 0, -0.9, 0.5, -0.9);
    poseArm(f, 1, -0.4, 0.2, -1.4);
    f.group.position.set((i - 1) * 1.15, 0, i === 1 ? 0.3 : 0);
    f.group.rotation.y = (1 - i) * 0.18;
    group.add(f.group);
    strum.push(f.shoulder[1]); heads.push(f.head);
  });
  // lift the moving parts out, merge everything else, and put them back
  const movers: Array<[THREE.Object3D, THREE.Object3D]> = [...strum, ...heads].map((o) => [o, o.parent!]);
  const saved = movers.map(([o, p]) => { p.remove(o); return { o, p }; });
  group.updateMatrixWorld(true);
  mergeStatic(group);
  for (const { o, p } of saved) p.add(o);
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.outline) o.castShadow = true; });
  let finT = 9;
  return {
    group,
    finale() { finT = 0; },
    update(dt, t) {
      finT += dt;
      strum.forEach((s, i) => { s.rotation.x = -0.4 + Math.sin(t * 9 + i) * 0.12; s.rotation.z = 0.2 + Math.sin(t * 9 + i) * 0.06; });
      heads.forEach((h, i) => { h.rotation.y = Math.sin(t * 0.8 + i * 1.7) * 0.25; h.rotation.x = -0.1 + Math.sin(t * 2.2 + i) * 0.05; h.rotation.z = Math.sin(t * 1.1 + i) * 0.06; });
      const k = envelope(finT, 0, 0.3, 1.6, 2.2);
      hatGroups.forEach((hg, i) => { hg.position.y = k * (0.12 + i * 0.02); hg.rotation.x = -k * 0.3; });
    },
  };
}

// =========================================================================================================
// THE CAR CHASE
// =========================================================================================================

const carMats = new Map<string, THREE.Material>();
const cm = (k: string, make: () => THREE.Material) => { let m = carMats.get(k); if (!m) { m = make(); carMats.set(k, m); } return m; };

/** A 1950s sedan, rounded and chromed. Faces +z. Police cars are black and white with a red light on top. */
function sedan(police: boolean) {
  const g = new THREE.Group();
  const black = cm('black', () => charToon({ color: 0x1c1c22, rim: 0.6, emissive: new THREE.Color(0x0a0a10) }));
  const white = cm('white', () => charToon({ color: 0xf2f0ea, rim: 0.4 }));
  const chrome = cm('chrome', () => charToon({ color: 0xd8dce0, rim: 0.8, emissive: new THREE.Color(0x303438) }));
  const glass = cm('glass', () => charToon({ color: 0x9ab8c8, rim: 0.5, emissive: new THREE.Color(0x1a2a30) }));
  const tyre = cm('tyre', () => charToon({ color: 0x141416, rim: 0.2 }));
  const lamp = cm('lamp', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(1.3) }));
  const body = new THREE.SphereGeometry(1, 20, 10); body.scale(1.05, 0.42, 2.6); body.translate(0, 0.78, 0);
  const lowerBody = boxAt(2.1, 0.5, 5.0, 0, 0.62, 0);
  const cabin = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2); cabin.scale(0.92, 0.62, 1.35); cabin.translate(0, 1.0, -0.3);
  g.add(new THREE.Mesh(merge([body, lowerBody]), black));
  if (police) { const door = boxAt(2.14, 0.42, 1.8, 0, 0.7, -0.1); g.add(new THREE.Mesh(door, white)); }
  g.add(new THREE.Mesh(cabin, glass));
  const roof = new THREE.SphereGeometry(1, 16, 6, 0, TAU, 0, Math.PI / 2); roof.scale(0.85, 0.5, 1.0); roof.translate(0, 1.22, -0.35);
  g.add(new THREE.Mesh(roof, police ? white : black));
  const bumpers = merge([boxAt(2.2, 0.2, 0.25, 0, 0.45, 2.55), boxAt(2.2, 0.2, 0.25, 0, 0.45, -2.55), boxAt(1.2, 0.3, 0.1, 0, 0.75, 2.62)]);
  g.add(new THREE.Mesh(bumpers, chrome));
  const tyres: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) for (const z of [-1.55, 1.55]) { const w = new THREE.CylinderGeometry(0.4, 0.4, 0.32, 12); w.rotateZ(Math.PI / 2); w.translate(s * 0.98, 0.4, z); tyres.push(w); }
  g.add(new THREE.Mesh(merge(tyres), tyre));
  g.add(new THREE.Mesh(merge([new THREE.SphereGeometry(0.15, 8, 6).translate(-0.72, 0.78, 2.5), new THREE.SphereGeometry(0.15, 8, 6).translate(0.72, 0.78, 2.5)]), lamp));
  let siren: THREE.MeshBasicMaterial | null = null;
  if (police) {
    siren = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    const s = new THREE.Mesh(cylAt(0.16, 0.18, 0.25, 0, 1.55, -0.3, 10), siren); g.add(s);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return { g, siren };
}

export interface CarChase {
  group: THREE.Group;
  /** start a run along x from z0 to z1 (both world z) */
  run(x: number, z0: number, z1: number, speed: number): void;
  readonly active: boolean;
  /** z of the lead car */
  readonly z: number;
  update(dt: number, t: number): void;
}

/** Asteroid City's recurring car chase: a black sedan with two police cars on its tail, sirens going. */
export function makeCarChase(): CarChase {
  const group = new THREE.Group();
  const lead = sedan(false), cops = [sedan(true), sedan(true)];
  group.add(lead.g, ...cops.map((c) => c.g));
  const st = { active: false, z: 0, z1: 0, x: 0, dir: -1, speed: 22 };
  group.visible = false;
  return {
    group,
    get active() { return st.active; },
    get z() { return st.z; },
    run(x, z0, z1, speed) { st.active = true; st.z = z0; st.z1 = z1; st.x = x; st.dir = Math.sign(z1 - z0); st.speed = speed; group.visible = true; },
    update(dt, t) {
      if (!st.active) { group.visible = false; return; }
      st.z += st.dir * st.speed * dt;
      if ((st.z - st.z1) * st.dir > 0) { st.active = false; group.visible = false; return; }
      const yaw = st.dir < 0 ? Math.PI : 0;
      const cars = [lead.g, cops[0].g, cops[1].g];
      cars.forEach((c, i) => {
        const zz = st.z - st.dir * i * 8;
        const sway = Math.sin(t * 3.1 + i * 1.3) * 0.5;
        c.position.set(st.x + sway + (i === 2 ? 0.8 : i === 1 ? -0.6 : 0), Math.abs(Math.sin(t * 15 + i)) * 0.05, zz);
        c.rotation.set(0, yaw + Math.cos(t * 3.1 + i * 1.3) * 0.06, Math.sin(t * 6 + i) * 0.02);
      });
      const on = Math.sin(t * 16) > 0;
      cops[0].siren!.color.setHex(on ? 0xff2020 : 0x501010).multiplyScalar(on ? 1.6 : 1);
      cops[1].siren!.color.setHex(!on ? 0xff2020 : 0x501010).multiplyScalar(!on ? 1.6 : 1);
    },
  };
}

void css; void damp;
