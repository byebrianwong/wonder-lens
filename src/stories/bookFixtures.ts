import type { Catalog, PhotoBookData } from '../game/PhotoBook';
import type { PhotoRequest } from '../game/Requests';
import { legendRoll, subjects } from './fixtures';

/*
 * Fixed data for the photo book and photo request stories: a Ghibli catalog built from the album
 * fixtures' subjects, plus two secrets and two film stills, and a book half filled from the legend roll.
 */

const poses: Record<string, Array<{ id: string; label: string }>> = {
  totoro: [{ id: 'roar', label: 'The big roar' }, { id: 'jump', label: 'Rain-shaking jump' }, { id: 'top', label: 'Flying on the spinning top' }],
  catbus: [{ id: 'grin', label: 'Grinning at you' }],
  kiki: [{ id: 'wave', label: 'Waving hello' }, { id: 'swerve', label: 'Wobbling broom' }],
  noface: [{ id: 'offer', label: 'Offering gold' }, { id: 'gulp', label: 'Gulp' }],
  soot: [{ id: 'swarm', label: 'Swarming' }, { id: 'scatter', label: 'Scattering' }],
  haku: [{ id: 'swoop', label: 'Swooping close' }],
  bathhouse: [{ id: 'lanterns', label: 'The lanterns lighting up' }],
  laputa: [],
};

const order = ['kiki', 'totoro', 'catbus', 'noface', 'soot', 'haku', 'bathhouse', 'laputa'] as const;

export const catalog: Catalog = {
  world: 'dream',
  savedAt: Date.UTC(2026, 9, 1),
  subjects: [
    ...order.map((k) => {
      const s = subjects[k];
      return { id: s.id, name: s.name, from: s.from, hint: s.hint, secret: false, rarity: s.rarity, reacts: true, poses: poses[k] };
    }),
    { id: 'jiji', name: 'Jiji in the toy shop', from: "Kiki's Delivery Service", hint: 'Throw something at the toy shop window.', secret: true, rarity: 'rare', reacts: true, poses: [] },
    { id: 'moro', name: 'Moro', from: 'Princess Mononoke', hint: 'Play the ocarina in the forest at night.', secret: true, rarity: 'legendary', reacts: true, poses: [] },
  ],
  stills: [
    { id: 'bus-stop', name: 'The bus stop in the rain', from: 'My Neighbor Totoro', hint: 'Totoro and the Catbus together at the bus stop.', bonus: 800 },
    { id: 'dragon', name: 'Haku over the water', from: 'Spirited Away', hint: 'Haku close, flying low over the sea.', bonus: 900 },
  ],
};

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 9, 10, 20);

/** Image keys mapped to the fixture photos. */
export const bookImages: Record<string, string> = {};

/** A book with five subjects, one secret, one film still and two requests done. */
export function halfBook(): PhotoBookData {
  const roll = legendRoll();
  const entries: PhotoBookData['entries'] = {};
  for (const id of ['totoro', 'noface', 'kiki', 'catbus', 'soot']) {
    const p = roll.find((x) => x.primary?.subject.id === id)!;
    const shot = p.primary!;
    const image = `dream/s/${id}`;
    bookImages[image] = p.dataUrl;
    entries[id] = { score: shot.score, stars: p.stars, pose: shot.pose, poseLabel: shot.poseLabel, date: T0 - 2 * DAY, image, poses: { idle: '', [shot.pose]: shot.poseLabel } };
  }
  entries.jiji = { ...entries.kiki, poses: { idle: '' }, image: 'dream/s/kiki', score: 640, stars: 3, pose: 'idle', poseLabel: '' };
  const still = roll.find((x) => x.primary?.subject.id === 'catbus')!;
  bookImages['dream/f/bus-stop'] = still.dataUrl;
  return {
    world: 'dream',
    catalog,
    entries,
    stills: { 'bus-stop': { score: 2700, date: T0 - DAY, image: 'dream/f/bus-stop' } },
    requests: [
      { text: 'Totoro · The big roar', date: T0 - 2 * DAY },
      { text: 'No-Face · Offering gold', date: T0 - DAY },
    ],
  };
}

/** A world built once but never photographed. */
export const emptyBook = (): PhotoBookData => ({ world: 'dream', catalog, entries: {}, stills: {}, requests: [] });

/** Three requests of each kind. */
export const requests: PhotoRequest[] = [
  { kind: 'pose', target: 'kiki', pose: 'swerve', title: 'Kiki', detail: 'Wobbling broom' },
  { kind: 'subject', target: 'haku', title: 'Haku', detail: 'a first photo' },
  { kind: 'still', target: 'dragon', title: 'Haku over the water', detail: 'film still' },
];
