import * as THREE from 'three';
import { clamp, smoothstep } from '../../../engine/math';
import type { Sky } from '../../../engine/Sky';
import { Subject } from '../../../game/Subject';
import { makeNoFace, makePonyoSchool } from '../../ghibli/spirits';
import { FILMS, type BuiltSet, type SetContext } from '../common';
import { PONYO, SEA_Y } from '../haku/places';
import { buildHakuRider } from '../haku/rider';
import { buildNightSea } from '../haku/sea';
import { buildTrainLine } from '../haku/train';
import { secretsOf } from '../secrets';

/*
 * On Haku's back over the night sea of spirits (Spirited Away, Ponyo).
 *
 *  z -2046  Haku appears under the paper-bird cover; from -2052 the rider sits on his neck
 *  z -2066  out of the boiler room's back window over the still, shallow sea (y -30, the bathhouse's water),
 *           then a swoop down to about 26 above it: the moon huge ahead with its glittering path on the water,
 *           stars and their reflections, lamp posts standing in the water, small islands with lone lit houses,
 *           and (from -2079, when the bathhouse scene is hidden) a stand-in bathhouse glowing behind
 *  z -2094  Ponyo and her sisters rise and race in the moon's path ahead (an acorn in the water: they leap)
 *  z -2110  the sea train glides across the water far below on the right; the rider catches up with it by -2230.
 *           If the rider fed No-Face at the bathhouse, he stands on its open front deck (a secret)
 *  z -2272  at the top of a long climb Haku turns to look at the rider; his scales light up
 *  z -2286  the scales burst away into glittering flakes from the tail forward; the head goes last in a flash
 *           at -2302, where the world switches the mount to falling, and Haku is a boy falling beside you
 *  z -2302  the fall: flakes swirl round, the sea far below, the moon above, and a floor of cloud below that
 *           the rider sinks into as the world covers the screen white (-2362 to -2440)
 */

export function buildHaku(ctx: SetContext): BuiltSet {
  const { road, rng } = ctx;
  const group = new THREE.Group();

  const sea = buildNightSea(rng, ctx.lowDetail);
  group.add(sea.group);
  const line = buildTrainLine(rng);
  group.add(line.group);
  const rider = buildHakuRider(ctx);
  group.add(rider.group);

  // ---------- Ponyo and her sisters, racing in the moon's path ----------
  const ponyo = makePonyoSchool(14, rng);
  const ponyoRoot = new THREE.Group();
  ponyoRoot.add(ponyo.group);
  ponyoRoot.scale.setScalar(3);
  ponyoRoot.visible = false;
  group.add(ponyoRoot);
  const leap = () => { ponyo.leap(); ponyoSubject.setPose('leap', 1.6); return true; };
  const ponyoSubject = new Subject({
    id: 'ponyo', name: 'Ponyo & her sisters', from: FILMS.ponyo, group: ponyoRoot, radius: 7, base: 820, rarity: 'rare',
    hint: "Little fish-girls racing along the moon's path on the water just after you leave the bathhouse. Drop an acorn in the sea near them and they leap.",
    poses: { leap: { label: 'Leaping in the moonlight', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 0.6, 0),
    onItem: leap, onCall: leap, reactRange: 22, maxDistance: 120, crowd: true,
    // just before their first leap of their own accord
    cue: () => leaps === 0 && nextLeap > 0 && nextLeap - nowT < 1.5,
  });
  ponyoSubject.active = false;
  let surface = 0, nextLeap = 0, nowT = 0, leaps = 0;

  // ---------- No-Face on the sea train's front deck: there only if the rider fed him at the bathhouse ----------
  const secrets = secretsOf(ctx);
  const train = line.subject.group;
  const noFace = makeNoFace();
  noFace.group.scale.setScalar(0.8);
  // on the deck boards (the train is drawn 1.25 times its built size; its deck top is 0.66 up, 1.8 forward)
  noFace.group.position.set(0.3, 0.66 * 1.25, 1.6 * 1.25);
  noFace.group.visible = false;
  train.add(noFace.group);
  const nfLocal = new THREE.Vector3();
  let nfYaw = 0.9;
  const noFaceS: Subject = new Subject({
    id: 'noface-train', name: 'No-Face on the sea train', from: FILMS.spirited, group: noFace.group, radius: 1.7, base: 1150, rarity: 'legendary', secret: true,
    hint: 'Give No-Face something to eat on the bathhouse bridge, and he takes the sea train after you. Look down to the right for him on its front deck while Haku is still low over the sea.',
    poses: { offer: { label: 'No-Face offers gold', mult: 1.8 }, riding: { label: 'Riding the sea train', mult: 1.3 } },
    centerOffset: new THREE.Vector3(0, 2.9, 0), facing: () => new THREE.Vector3(0, 0, 1).applyQuaternion(noFace.group.getWorldQuaternion(new THREE.Quaternion())),
    maxDistance: 170, reactRange: 14,
    onCall: () => { noFace.offer(); noFaceS.setPose('offer', 4); return true; },
  });
  noFaceS.active = false;


  // the sky, the sun and the fog belong to the world; the sea and the clouds read their colours every frame
  let sky: Sky['uniforms'] | null = null;
  let sun: THREE.DirectionalLight | null = null;
  const findSky = () => {
    for (const o of ctx.scene.children) {
      const m = o as THREE.Mesh;
      const u = m.isMesh ? (m.material as THREE.ShaderMaterial).uniforms : undefined;
      if (u && u.moonDir && u.starAmount) sky = u as unknown as Sky['uniforms'];
      if ((o as THREE.DirectionalLight).isDirectionalLight) sun = o as THREE.DirectionalLight;
    }
  };
  const moonXZ = new THREE.Vector2();

  return {
    id: 'haku', group, show: [road.u(-2040), road.u(-2430)],
    occluders: sea.occluders,
    subjects: [rider.subject, line.subject, ponyoSubject, noFaceS],
    floor: (x, z) => sea.grid.sample(x, z),
    water: SEA_Y,
    update(dt, t, ride) {
      const z = ride.position.z;
      const fog = ctx.scene.fog as THREE.FogExp2;
      if (!sky) findSky();
      rider.update(dt, t, ride);
      if (sky) sea.update(t, ctx.camera.position, sky, fog, (sun as THREE.DirectionalLight | null)?.intensity ?? 1, z);
      line.update(dt, t, z, fog);
      nowT = t;

      // No-Face on the train turns slowly to look up at the rider
      noFace.group.visible = secrets.noFace;
      noFaceS.active = secrets.noFace && line.subject.active;
      if (secrets.noFace) {
        train.updateMatrixWorld(true);
        train.worldToLocal(ctx.camera.getWorldPosition(nfLocal));
        const want = Math.atan2(nfLocal.x - noFace.group.position.x, nfLocal.z - noFace.group.position.z);
        nfYaw += Math.atan2(Math.sin(want - nfYaw), Math.cos(want - nfYaw)) * (1 - Math.exp(-dt * 1.2));
        noFace.group.rotation.y = nfYaw;
        noFace.update(dt, t);
        if (noFaceS.poseTimer <= 0) noFaceS.setPose('riding', 0.3);
      }

      // Ponyo: they rise out of the sea ahead, race in the moon's path keeping pace with the rider, and dive away
      const on = z <= PONYO.z0 + 4 && z > PONYO.z1 - 6;
      ponyoRoot.visible = on;
      if (on) {
        surface = smoothstep(PONYO.z0, PONYO.z0 - 12, z) * (1 - smoothstep(PONYO.z1 + 16, PONYO.z1, z));
        ponyo.surface = surface;
        moonXZ.set(sea.moonDir.x, sea.moonDir.z);
        if (moonXZ.lengthSq() < 1e-6) moonXZ.set(0, -1); else moonXZ.normalize();
        const h = Math.max(1, ride.position.y + 1.25 - SEA_Y);
        const dist = clamp(16 + h * 0.9, 20, 46);
        ponyoRoot.position.set(ride.position.x + moonXZ.x * dist + Math.sin(t * 0.4) * 2, SEA_Y - (1 - surface) * 2.5, ride.position.z + moonXZ.y * dist);
        ponyoRoot.rotation.y = road.along(z) + Math.PI;
        // now and then the whole school leaps of its own accord
        if (surface > 0.95) {
          if (nextLeap === 0) nextLeap = t + 2;
          else if (t > nextLeap) { ponyo.leap(); ponyoSubject.setPose('leap', 1.6); nextLeap = t + 4.5; leaps++; }
        }
        ponyo.update(dt, t);
      }
      ponyoSubject.active = on && surface > 0.4;
    },
  };
}
