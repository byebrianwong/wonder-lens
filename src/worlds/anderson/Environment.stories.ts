import type { Meta } from '@storybook/html-vite';
import * as THREE from 'three';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, STAGE_PARAMETERS, type StageArgs } from '../../stories/stage';
import { buildTrain } from './train';
import { makeFunicularCar } from './hotel/funicular';
import { buildPastryBox } from './mendls/box';
import { buildToboggan } from './ski/toboggan';
import { buildDeepSearch } from './aquatic/sub';
import { buildBelafonte } from './aquatic/belafonte';
import { buildDollhouse } from './finale/dollhouse';
import { topiary } from './kit';

/*
 * The Zubrowka Express's vehicles and big set pieces: the train's observation car, the mounts the rider
 * changes to (funicular car, pastry box, toboggan, Deep Search), the Belafonte and the finale's dollhouse.
 */

export default {
  title: 'Anderson/Buildings and props',
  args: DEFAULT_ARGS,
  argTypes: STAGE_ARG_TYPES,
  parameters: STAGE_PARAMETERS,
} satisfies Meta<StageArgs>;

/** Wrap a piece built in world coordinates so its footprint is centred on the stage and its base is at y 0. */
function centred(o: THREE.Object3D, base?: number) {
  const box = new THREE.Box3().setFromObject(o);
  const c = box.getCenter(new THREE.Vector3());
  o.position.sub(new THREE.Vector3(c.x, base ?? box.min.y, c.z));
  return new THREE.Group().add(o);
}

export const ObservationCar = asset(() => { const t = buildTrain(); return { group: t.group, update: (dt: number, t2: number) => t.update(dt, t2, 0) }; }, { yaw: 35 });
export const FunicularCar = asset(() => makeFunicularCar(0), { yaw: 40 });
export const PastryBox = asset(() => { const b = buildPastryBox(true); b.setLid(0); return { group: b.group, update: (dt: number, t: number) => b.update(dt, t, 0) }; }, { yaw: 30, pitch: 20 });
export const Toboggan = asset(() => { const b = buildToboggan({ rider: false }); return { group: b.group, update: (dt: number, t: number) => b.update(dt, t, 0) }; }, { yaw: 40, pitch: 16 });
export const DeepSearch = asset(() => buildDeepSearch().mount.group, { ground: false, yaw: 40 });
// the port side, cut open like the film's set; the ship stands on its waterline
export const Belafonte = asset(() => {
  const b = buildBelafonte();
  return { group: centred(b.group, 0), update: (dt: number, t: number) => b.update(dt, t) };
}, { ground: false, light: 'dusk', yaw: -90, pitch: 6 });
export const BelafonteFromTheStern = asset(() => {
  const b = buildBelafonte();
  return { group: centred(b.group, 0), update: (dt: number, t: number) => b.update(dt, t) };
}, { ground: false, light: 'dusk', yaw: -30, pitch: 12 });
export const Dollhouse = asset(() => {
  const d = buildDollhouse();
  d.setGlow(1);
  return { group: centred(d.group), update: (dt: number, t: number) => d.update(dt, t) };
}, { light: 'night', yaw: 0, pitch: 6 });
export const Topiary = asset(() => {
  const g = new THREE.Group();
  (['ball', 'cone', 'double'] as const).forEach((k, i) => { const t = topiary(k); t.position.x = (i - 1) * 2.4; g.add(t); });
  return g;
});
