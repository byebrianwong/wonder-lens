import * as THREE from 'three';
import type { BuiltWorld, RideState, WorldContext, WorldDef } from '../../game/types';
import { makeLighting, type LightKey } from '../../game/lighting';
import type { EnvLevels } from '../../engine/Audio';
import { Sky } from '../../engine/Sky';
import { Rng, clamp, damp, lerp, smoothstep } from '../../engine/math';
import { COVERS, FRAME, SETS, SET_ORDER, CAPTIONS_Z, captionIndexAtZ, makeCurve, makeRoad, speedAtZ, type SetId } from './layout';
import { LightPool, inZ, zWindow, type BuiltSet, type MountDef, type ScreenFx, type SetContext, type SetModule, type Shot, type ZLightKey } from './common';
import { FilmLens, paintCard } from './film';
import { buildTrain } from './train';
import { mendlsBox } from './kit';
import { HOTEL } from './sets/hotel';
import { MENDLS } from './sets/mendls';
import { SKI } from './sets/ski';
import { FOX } from './sets/fox';
import { MOONRISE } from './sets/moonrise';
import { ASTEROID } from './sets/asteroid';
import { ISLE } from './sets/isle';
import { AQUATIC } from './sets/aquatic';
import { FINALE } from './sets/finale';

/*
 * The Zubrowka Express: a ride in nine parts through the films of Wes Anderson (see layout.ts for the route).
 * This file owns what crosses scenes: the train and the other mounts, the screen covers and title cards
 * between scenes, the frame's shape, lighting and sound along the ride, and the captions. Each scene lives in
 * sets/<id>.ts and is built against the contract in common.ts.
 */

const SCENES: Record<SetId, SetModule> = {
  hotel: HOTEL, mendls: MENDLS, ski: SKI, fox: FOX, moonrise: MOONRISE, asteroid: ASTEROID, isle: ISLE, aquatic: AQUATIC, finale: FINALE,
};

/** Every scene's light, in ride order, keyed by z. */
const ALL_LIGHTS: ZLightKey[] = SET_ORDER.flatMap((id) => SCENES[id].lights).sort((a, b) => b.z - a.z);

/** A few of the ride's lights, keyed 0..1, for the dev character gallery: one from each scene. */
export const LIGHT_KEYS: LightKey[] = SET_ORDER.map((id, i) => {
  const k = SCENES[id].lights[Math.min(1, SCENES[id].lights.length - 1)];
  const { z: _z, ...rest } = k;
  return { ...rest, u: i / (SET_ORDER.length - 1) };
});

const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function build(ctx: WorldContext): BuiltWorld {
  const rng = new Rng(19320301);
  const scene = new THREE.Scene();
  const curve = makeCurve();
  const road = makeRoad(curve);
  const lights = new LightPool(scene, 4);
  const K = (z: number) => road.u(z);

  // ---------- sky, sun, fog ----------
  const sky = new Sky(1400);
  scene.add(sky.mesh);
  scene.fog = new THREE.FogExp2(0xefdce6, 0.004);
  const sun = new THREE.DirectionalLight(0xfff0e2, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60; sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xd6e2f8, 0xe6d6e2, 0.9);
  scene.add(hemi);

  // ---------- screen effects and camera moves: sets ask each frame, the strongest request wins ----------
  const fxState = { flash: 0, flashColor: new THREE.Color(1, 1, 1), wash: 0, washColor: new THREE.Color(1, 1, 1) };
  const fx: ScreenFx = {
    flash(a, c) { if (a > fxState.flash) { fxState.flash = a; fxState.flashColor.set(c ?? 0xffffff); } },
    wash(a, c) { if (a > fxState.wash) { fxState.wash = a; fxState.washColor.set(c ?? 0xffffff); } },
  };
  const shot: Shot = { offset: new THREE.Vector3(), pitch: 0, yaw: 0, roll: 0 };

  // ---------- the vehicle: an empty group the ride moves; the train and the other mounts ride in it ----------
  const vehicle = new THREE.Group();
  scene.add(vehicle);
  const train = buildTrain();
  vehicle.add(train.group);
  const cameraAnchor = new THREE.Object3D();
  cameraAnchor.rotation.y = Math.PI;
  vehicle.add(cameraAnchor);
  const lens = new FilmLens();
  cameraAnchor.add(lens.mesh);

  // ---------- the scenes ----------
  const sctx: SetContext = { rng, road, lights, camera: ctx.camera, lowDetail: ctx.lowDetail, scene, fx, shot, vehicle };
  const captions: Array<[number, string]> = CAPTIONS_Z.map(([z, text]) => [z > 50 ? 0.003 : K(z), text]);
  // A Storybook ride view sees one point of the ride, so it builds only the scenes that can be drawn there
  // (a scene is drawn from up to 460 units before its stretch to 340 after it); the game builds them all.
  const focus = ctx.focusCaption !== undefined ? curve.getPointAt(clamp(captions[Math.min(ctx.focusCaption, captions.length - 1)][0] + 0.012, 0, 1)).z : null;
  const near = (id: SetId) => focus === null || (focus <= SETS[id].z0 + 460 && focus >= SETS[id].z1 - 340);
  const skip = (id: SetId): BuiltSet => ({ id, group: new THREE.Group(), show: [2, 2], occluders: [], subjects: [], water: -Infinity, floor: (_x, z) => road.at(z).y - 0.5, update() { /* not built */ } });
  const sets = Object.fromEntries(SET_ORDER.map((id) => {
    if (!near(id)) return [id, skip(id)];
    try { return [id, SCENES[id].build(sctx)]; } catch (e) {
      // one broken scene should not take the whole ride down with it
      console.error(`[anderson] the ${id} scene failed to build`, e);
      return [id, skip(id)];
    }
  })) as Record<SetId, BuiltSet>;
  const list = SET_ORDER.map((id) => sets[id]);
  for (const s of list) scene.add(s.group);
  const setAt = (z: number) => list.find((s) => inZ(z, SETS[s.id])) ?? (z > SETS.hotel.z0 ? sets.hotel : sets.finale);
  let current: BuiltSet = sets.hotel;

  // ---------- mounts ----------
  const mounts: MountDef[] = list.flatMap((s) => s.mounts ?? []);
  for (const m of mounts) { m.group.visible = false; vehicle.add(m.group); }
  const mountAt = (z: number) => mounts.find((m) => z <= m.z0 && z > m.z1) ?? null;
  let mount: MountDef | null = null;

  const subjects = list.flatMap((s) => s.subjects);
  const occluders = list.flatMap((s) => s.occluders);

  // ---------- light and colour along the ride ----------
  const keys: LightKey[] = ALL_LIGHTS.map(({ z, ...k }) => ({ ...k, u: z >= SETS.hotel.z0 ? 0 : K(z) }));
  const lighting = makeLighting(keys);

  // ---------- title cards, painted when first needed ----------
  const cardTex = COVERS.map(() => null as THREE.Texture | null);

  // ---------- per-frame state ----------
  const tan = new THREE.Vector3(), prevTan = new THREE.Vector3(0, 0, -1);
  const xAxis = new THREE.Vector3(1, 0, 0);
  let bank = 0;
  const seat = new THREE.Vector3();

  /** the frame's shape at a z: [aspect, amount] */
  const frameAt = (z: number): [number, number] => {
    if (z >= FRAME[0][0]) return [FRAME[0][1], FRAME[0][2]];
    for (let i = 0; i < FRAME.length - 1; i++) {
      const [za, aa, ka] = FRAME[i], [zb, ab, kb] = FRAME[i + 1];
      if (z <= za && z >= zb) { const t = smoothstep(za, zb, z); return [lerp(aa, ab, t), lerp(ka, kb, t)]; }
    }
    const last = FRAME[FRAME.length - 1];
    return [last[1], last[2]];
  };

  const world: BuiltWorld = {
    scene, curve, speed: 12, vehicle, cameraAnchor, subjects, occluders, sky, sun, hemi, lighting,
    get waterLevel() { return current.water; },
    groundHeight: (x, z) => current.floor(x, z),
    speedAt: (u) => speedAtZ(curve.getPointAt(clamp(u, 0, 1)).z),
    vehicleAt: (u) => {
      const z = curve.getPointAt(clamp(u, 0, 1)).z;
      return mountAt(z) ? 0 : 1;
    },
    makeProjectile: () => mendlsBox(1),
    ambience: {
      root: 62, scale: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [2, 5, 9]], padWave: 'triangle', padLevel: 0.07,
      melody: 'pluck', melodyInterval: 0.75, melodyDensity: 0.8, melodyLevel: 0.15, chordSeconds: 6, vehicle: 'train',
    },
    env(u) {
      const z = curve.getPointAt(clamp(u, 0, 1)).z;
      const s = setAt(z);
      const base: EnvLevels = { wind: 0.15, sea: 0, rain: 0, birds: 0, crickets: 0 };
      return { ...base, ...(SCENES[s.id].env?.(z) ?? {}) };
    },
    captions,
    update(dt, ride) {
      const t = ride.time, u = ride.u, z = ride.position.z;
      fxState.flash = 0; fxState.wash = 0;
      shot.offset.set(0, 0, 0); shot.pitch = 0; shot.yaw = 0; shot.roll = 0;
      tan.copy(ride.tangent).setY(0).normalize();
      current = setAt(z);

      // ---- which mount: the train unless a scene supplies one here ----
      const m = mountAt(z);
      if (m !== mount) {
        if (mount) mount.group.visible = false;
        mount = m;
        if (mount) mount.group.visible = true;
        train.group.visible = !mount;
      }

      // ---- banking into turns (before the scenes update, so they see the final vehicle) ----
      const turn = dt > 0 ? (prevTan.x * tan.z - prevTan.z * tan.x) / dt : 0;
      prevTan.copy(tan);
      const limit = mount?.bank ?? 0.04;
      bank = damp(bank, clamp(-turn * 2.4, -limit, limit), 2.5, dt);
      vehicle.rotateZ(bank);
      vehicle.updateMatrixWorld(true);

      // ---- the mount takes the rest of the slope the ride levels out ----
      if (mount) {
        const flat = Math.hypot(ride.tangent.x, ride.tangent.z);
        const extra = Math.atan2(ride.tangent.y, flat) - Math.atan2(ride.tangent.y * 0.35, flat);
        mount.group.position.set(0, 0, 0);
        mount.group.quaternion.setFromAxisAngle(xAxis, -extra * (mount.tilt ?? 0));
      }

      // ---- scenes; a hidden scene's subjects are switched off so they cannot be photographed ----
      for (const s of list) {
        const on = u >= s.show[0] && u <= s.show[1];
        s.group.visible = on;
        if (on) s.update(dt, t, ride);
        else for (const sub of s.subjects) sub.active = false;
      }
      lights.update(u, t);
      if (mount) mount.update?.(dt, t, ride);

      // ---- the camera: the mount's seat, a jolt, the scene's camera move, and the whip pans ----
      seat.copy(mount ? mount.seat : train.seat);
      if (mount && mount.tilt) seat.applyQuaternion(mount.group.quaternion);
      let whipYaw = 0;
      let lensFx = { iris: 1, wash: fxState.wash, washColor: fxState.washColor.getHex(), bubbles: 0, whip: 0, whipDir: 1, whipA: 0xffffff, whipB: 0xffffff, curtain: 0, card: 0, cardMap: null as THREE.Texture | null };
      COVERS.forEach((c, i) => {
        const k = zWindow(z, c.a, c.b, c.c, c.d);
        if (k <= 0) return;
        if (c.card) {
          cardTex[i] ??= paintCard(c.card);
          const fade = c.cardIn ?? 3;
          const ck = zWindow(z, c.b, c.b - fade, c.c + 3, c.c);
          if (ck > lensFx.card) { lensFx.card = ck; lensFx.cardMap = cardTex[i]; }
        }
        switch (c.kind) {
          case 'whip': {
            const dir = i % 2 ? 1 : -1;
            // swing away, accelerating, then swing in from the other side, slowing
            const out = z > c.b ? ease((c.a - z) / (c.a - c.b)) : 1;
            const back = z < c.c ? 1 - ease((c.c - z) / (c.c - c.d)) : 1;
            whipYaw = z > c.b ? dir * out * out * 1.3 : z < c.c ? -dir * back * back * 1.3 : 0;
            lensFx = { ...lensFx, whip: Math.max(lensFx.whip, Math.pow(k, 0.7)), whipDir: dir, whipA: c.color, whipB: c.color2 ?? c.color };
            break;
          }
          case 'black': case 'white': if (k > lensFx.wash) { lensFx.wash = k; lensFx.washColor = c.color; } break;
          case 'splash': if (k > lensFx.wash) { lensFx.wash = k; lensFx.washColor = c.color; lensFx.bubbles = 1; } break;
          case 'curtain': lensFx.curtain = Math.max(lensFx.curtain, k); break;
          case 'iris': lensFx.iris = Math.min(lensFx.iris, 1 - k); break;
        }
      });
      const anchor = cameraAnchor.position;
      anchor.copy(seat).add(shot.offset);
      anchor.y += current.bump?.(z) ?? 0;
      cameraAnchor.rotation.set(shot.pitch, Math.PI + shot.yaw + whipYaw, shot.roll, 'YXZ');

      // ---- the train's lamps and bell ----
      const dusk = clamp(1 - sun.intensity / 1.6, 0, 1);
      if (!mount) train.update(dt, t, dusk);

      // ---- the lens ----
      const [aspect, frame] = frameAt(z);
      lens.fit(ctx.camera, t);
      lens.set({ ...lensFx, flash: fxState.flash, flashColor: fxState.flashColor, frame, frameAspect: aspect });
    },
    onItemLand(pos) { current.onItemLand?.(pos); },
    onCall(_pos, ride) {
      if (!mount) train.ring();
      current.onCall?.(ride);
    },
    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
    },
  };
  return world;
}

export const AndersonWorld: WorldDef = {
  id: 'anderson',
  title: 'The Zubrowka Express',
  subtitle: 'Wes Anderson',
  blurb: "A ride in nine parts through the films of Wes Anderson: up the funicular into the Grand Budapest, through Mendl's, down Gabelmeister's Peak on a toboggan, under Mr. Fox's hill, across New Penzance in the storm, into the play of Asteroid City, over Trash Island, under the sea to the Belafonte, and on to the curtain call.",
  vehicleName: 'The Zubrowka Express',
  itemName: "Mendl's box",
  callName: 'whistle',
  callKind: 'whistle',
  accent: '#f2a8bc',
  accent2: '#b93a4c',
  fov: 58,
  build,
};

export { captionIndexAtZ };
export type { RideState };
