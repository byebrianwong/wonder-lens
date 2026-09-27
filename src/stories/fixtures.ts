import type { PhotoResult, SubjectShot } from '../game/Photo';
import type { Subject } from '../game/Subject';
import photoBathhouse from './fixtures/photo-bathhouse.jpg';
import photoCatbus from './fixtures/photo-catbus.jpg';
import photoHaku from './fixtures/photo-haku.jpg';
import photoKiki from './fixtures/photo-kiki.jpg';
import photoLaputa from './fixtures/photo-laputa.jpg';
import photoNoface from './fixtures/photo-noface.jpg';
import photoSoot from './fixtures/photo-soot.jpg';
import photoTotoro from './fixtures/photo-totoro.jpg';
export { default as rideBackdrop } from './fixtures/ride-backdrop.jpg';

/*
 * Fixed data for the HUD and album stories. The photos are saved renders from the asset
 * stories, so these screens do not change when a 3D model does.
 * Names, sources and hints are copied from GhibliWorld.ts.
 */

type FakeSubject = Pick<Subject, 'id' | 'name' | 'from' | 'hint' | 'base' | 'rarity'>;
const subject = (s: FakeSubject) => s as Subject;

export const subjects = {
  totoro: subject({ id: 'totoro', name: 'Totoro', from: 'My Neighbor Totoro', base: 1500, rarity: 'legendary', hint: 'Waits in the rain at the Inari-mae bus stop. Throw an acorn and he jumps; play the ocarina and he roars.' }),
  catbus: subject({ id: 'catbus', name: 'The Catbus', from: 'My Neighbor Totoro', base: 1250, rarity: 'rare', hint: 'Comes racing across the fields at dusk and pauses at the bus stop.' }),
  kiki: subject({ id: 'kiki', name: 'Kiki', from: "Kiki's Delivery Service", base: 950, rarity: 'rare', hint: 'Flies alongside the train as it leaves Koriko. Play the ocarina and she waves.' }),
  noface: subject({ id: 'noface', name: 'No-Face', from: 'Spirited Away', base: 1350, rarity: 'legendary', hint: 'Stands silently on the first platform in the sea. Call and he offers gold; throw something and he swallows it.' }),
  bathhouse: subject({ id: 'bathhouse', name: 'The bathhouse', from: 'Spirited Away', base: 900, rarity: 'common', hint: 'Lit up across the water, halfway through the night sea.' }),
  laputa: subject({ id: 'laputa', name: 'Laputa', from: 'Castle in the Sky', base: 1000, rarity: 'legendary', hint: 'Look high above the clouds near the end of the line.' }),
  soot: subject({ id: 'soot', name: 'Soot sprites', from: 'Spirited Away', base: 720, rarity: 'common', hint: 'A crowd of them hopping on a jetty. They swarm anything you throw and jump when you call.' }),
  haku: subject({ id: 'haku', name: 'Haku', from: 'Spirited Away', base: 1400, rarity: 'legendary', hint: 'A white dragon weaving over the night sea beside the train. Call him and he swoops in close.' }),
};

/** The subjects of the album's field guide, in ride order. */
export const guide: Subject[] = [subjects.kiki, subjects.totoro, subjects.catbus, subjects.noface, subjects.soot, subjects.haku, subjects.bathhouse, subjects.laputa];

const photos: Record<keyof typeof subjects, string> = {
  totoro: photoTotoro, catbus: photoCatbus, kiki: photoKiki, noface: photoNoface, bathhouse: photoBathhouse, laputa: photoLaputa, soot: photoSoot, haku: photoHaku,
};

let nextId = 1;

/** A photo of one subject. `stars` and `score` are set directly; the scoring maths is not what these stories test. */
export function photo(key: keyof typeof subjects, o: { score: number; stars: number; bonuses?: string[]; pose?: string; poseLabel?: string }): PhotoResult {
  const s = subjects[key];
  const shot: SubjectShot = { subject: s, score: o.score, size: 0.5, centering: 0.9, pose: o.pose ?? 'idle', poseLabel: o.poseLabel ?? '', facing: true };
  return { id: nextId++, dataUrl: photos[key], shots: [shot], primary: shot, total: o.score, stars: o.stars, bonuses: o.bonuses ?? [], u: 0.5, time: 60 };
}

/** A photo with nobody in it. */
export function sceneryPhoto(): PhotoResult {
  return { id: nextId++, dataUrl: photoLaputa, shots: [], primary: null, total: 0, stars: 0, bonuses: [], u: 0.9, time: 200 };
}

/** A strong ride: every guide subject photographed well. Scores total over 14,000, which earns "Legend". */
export function legendRoll(): PhotoResult[] {
  return [
    photo('totoro', { score: 2480, stars: 4, bonuses: ['The big roar', 'Eye contact', 'Legendary sighting'], pose: 'roar', poseLabel: 'The big roar' }),
    photo('noface', { score: 2210, stars: 4, bonuses: ['Offering gold', 'Legendary sighting'], pose: 'offer', poseLabel: 'Offering gold' }),
    photo('haku', { score: 1980, stars: 3, bonuses: ['Legendary sighting'] }),
    photo('catbus', { score: 1900, stars: 4, bonuses: ['Close-up', 'Rare sighting'] }),
    photo('kiki', { score: 1720, stars: 4, bonuses: ['Waving hello', 'Well framed'], pose: 'wave', poseLabel: 'Waving hello' }),
    photo('laputa', { score: 1450, stars: 3, bonuses: ['Legendary sighting'] }),
    photo('bathhouse', { score: 1180, stars: 3, bonuses: ['Well framed'] }),
    photo('soot', { score: 1100, stars: 3, bonuses: ['Swarming'], pose: 'swarm', poseLabel: 'Swarming' }),
  ];
}

/** A middling ride: half the subjects, a spare scenery shot, a weak duplicate. */
export function explorerRoll(): PhotoResult[] {
  return [
    photo('totoro', { score: 1320, stars: 3, bonuses: ['Legendary sighting'] }),
    photo('totoro', { score: 540, stars: 1 }),
    photo('kiki', { score: 810, stars: 2, bonuses: ['Rare sighting'] }),
    photo('bathhouse', { score: 690, stars: 2 }),
    photo('catbus', { score: 1010, stars: 3, bonuses: ['Rare sighting'] }),
    sceneryPhoto(),
  ];
}
