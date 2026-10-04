import * as THREE from 'three';
import { box, toon } from '../../../engine/Builders';
import { SETS } from '../layout';
import { emptySet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { makeAshAndKristofferson, makeBadger, makeKylie, makeMoles, makeMrFox, makeMrsFox, makeRabbit, makeRat, makeWolf } from '../fox/characters';

const R = SETS.fox;

export const LIGHTS: ZLightKey[] = [
  { z: -880, skyTop: 0x6a4a2a, skyMid: 0xc88a3a, skyBottom: 0xf0b048, fog: 0x5a3a1a, fogDensity: 0.008, sunDir: [0.2, 0.8, 0.6], sunColor: 0xffd8a0, sunIntensity: 1.4, hemiSky: 0xf0c080, hemiGround: 0x6a4a2a, hemiIntensity: 1.2, exposure: 1.05, bloom: 0.4, saturation: 1.1 },
];

function build(ctx: SetContext) {
  const set = emptySet('fox', ctx, R);
  set.group.add(box(40, 0.2, 30, toon(0xb08a5a), 0, -6.1, -930));
  set.group.add(box(40, 12, 0.5, toon(0xd8b070), 0, 0, -940));
  const T0 = performance.now();
  const tm = <T,>(name: string, f: () => T) => { const a = performance.now(); const r = f(); console.warn(name, Math.round(performance.now() - a)); return r; };
  const cast = [tm('mrfox', makeMrFox), tm('mrsfox', makeMrsFox), tm('boys', makeAshAndKristofferson), tm('kylie', makeKylie), tm('badger', makeBadger), tm('rat', makeRat), tm('rabbit', makeRabbit)];
  void T0;
  cast.forEach((c, i) => { c.group.position.set(-9 + i * 3, -6, -932); set.group.add(c.group); });
  const moles = makeMoles([{ pos: new THREE.Vector3(12, -6, -932), yaw: 0 }, { pos: new THREE.Vector3(13.2, -6, -932), yaw: -0.4 }]);
  set.group.add(moles.group);
  const wolf = makeWolf();
  wolf.group.position.set(0, -6, -936); wolf.group.rotation.y = Math.PI / 2;
  set.group.add(wolf.group);
  const cam = new THREE.Vector3();
  const q = new URLSearchParams(location.search);
  const act = q.get('act');
  let fired = false;
  set.update = (dt, t) => {
    ctx.camera.getWorldPosition(cam);
    if (!fired && t > 0.5 && act) {
      fired = true;
      const [mr, mrs, boys, kylie, badger, rat] = cast as [ReturnType<typeof makeMrFox>, ReturnType<typeof makeMrsFox>, ReturnType<typeof makeAshAndKristofferson>, ReturnType<typeof makeKylie>, ReturnType<typeof makeBadger>, ReturnType<typeof makeRat>];
      if (act === 'a') { mr.whistle(); mrs.greet(); boys.kata(); kylie.zoneOut(); badger.cuss(); rat.snap(); wolf.salute(); moles.startle(); }
      else { mr.catchBox(); boys.catchBox(); rat.blade(); }
    }
    for (const c of cast) c.update(dt, t, cam);
    moles.update(dt, t, cam);
    wolf.update(dt, t, cam);
  };
  return set;
}

export const FOX: SetModule = { build, lights: LIGHTS };
