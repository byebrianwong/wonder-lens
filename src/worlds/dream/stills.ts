import * as THREE from 'three';
import type { FilmStill } from '../../game/types';
import type { PhotoResult, SubjectShot } from '../../game/Photo';
import { FILMS } from './common';

/*
 * Film stills for "Catbus to Anywhere": famous frames from the films that the ride can give, if the rider
 * frames the shot the way the film did. Each one names its subjects (the first is the main one) and, where
 * the film's angle matters, tests the camera's direction.
 */

const dir = new THREE.Vector3(), to = new THREE.Vector3(), cam = new THREE.Vector3(), c = new THREE.Vector3();
const shotOf = (p: PhotoResult, id: string): SubjectShot | undefined => p.shots.find((s) => s.subject.id === id);
/** How far the camera looks up (+) or down (-), in radians. */
const pitchOf = (camera: THREE.PerspectiveCamera) => Math.asin(Math.max(-1, Math.min(1, camera.getWorldDirection(dir).y)));
/** The angle between the line from the camera to a subject's centre and a direction, in radians. */
function angleTo(camera: THREE.PerspectiveCamera, s: SubjectShot, d: THREE.Vector3) {
  camera.getWorldPosition(cam);
  s.subject.center(c);
  return to.subVectors(c, cam).normalize().angleTo(d);
}

/**
 * `zu` turns a z on the path into ride progress; `moonDir` is the sky's moon direction (it moves with the
 * lighting, so it is read when the photo is taken).
 */
export function filmStills(zu: (z: number) => number, moonDir: () => THREE.Vector3): FilmStill[] {
  return [
    {
      id: 'bus-stop', name: 'Waiting for the bus in the rain', from: FILMS.totoro, bonus: 1200,
      hint: 'Over the fields, the Catbus slows past a bus stop in the rain below the wire on the left. Get Totoro and Satsuki in the shot together, under their umbrellas.',
      subjects: ['totoro-rain', 'satsuki-rain'], size: [0.07, 0.9], u: [zu(-476), zu(-556)],
      // both of them well inside the frame, not one cut off at its edge
      test: (p) => (shotOf(p, 'totoro-rain')?.centering ?? 0) > 0.3 && (shotOf(p, 'satsuki-rain')?.centering ?? 0) > 0.3,
    },
    {
      id: 'top-moon', name: 'Flying past the moon', from: FILMS.totoro, bonus: 1000,
      hint: 'In the garden, as the tree bursts up out of the ground, Totoro rises on his spinning top in front of the full moon. Look up and catch him crossing it.',
      subjects: ['totoro'], pose: 'flying', u: [zu(-22), zu(-150)],
      test: (p, camera) => {
        const s = shotOf(p, 'totoro');
        return !!s && pitchOf(camera) > 0.08 && angleTo(camera, s, moonDir()) < 0.16;
      },
    },
    {
      id: 'night-walker', name: 'The Night-Walker crosses the pool', from: FILMS.mononoke, bonus: 900,
      hint: 'In the Forest Spirit\'s wood, before dawn, the Night-Walker rises out of the spirit pool. Look up at it as it walks across, all of it in the frame.',
      subjects: ['night-walker'], size: [0.25, 1.4],
      test: (p, camera) => pitchOf(camera) > 0.22 && (shotOf(p, 'night-walker')?.centering ?? 0) > 0.45,
    },
    {
      id: 'laputa-whole', name: 'Laputa through the storm', from: FILMS.laputa, bonus: 900,
      hint: 'Just as the Catbus comes out of the storm wall, the whole floating castle hangs ahead in the calm. Take it in the middle of the frame, without zooming in, before you land on it.',
      subjects: ['laputa'], size: [0.3, 1.0], u: [zu(-1244), zu(-1290)],
      test: (p) => (shotOf(p, 'laputa')?.centering ?? 0) > 0.6,
    },
    {
      id: 'robot-flower', name: 'A flower from the robot', from: FILMS.laputa, bonus: 900,
      hint: 'In Laputa\'s garden, play the ocarina to the robot gardener and take him face on as he holds out his flower.',
      subjects: ['robot'], pose: 'flower', size: [0.12, 1.3],
      test: (p) => !!shotOf(p, 'robot')?.facing,
    },
    {
      id: 'calcifer-hearth', name: 'Calcifer in the hearth', from: FILMS.howl, bonus: 600,
      hint: 'Inside Howl\'s castle, the fire demon in the hearth on the left. Look him in the eyes, close up.',
      subjects: ['calcifer'], size: [0.12, 1.0],
      test: (p) => !!shotOf(p, 'calcifer')?.facing,
    },
    {
      id: 'noface-bridge', name: 'No-Face on the bridge', from: FILMS.spirited, bonus: 800,
      hint: 'On the red bridge at dusk, No-Face stands by the railing with the bathhouse behind. Take them both, before you pass him.',
      subjects: ['noface', 'bathhouse'], size: [0.04, 0.9], u: [zu(-1793), zu(-1860)],
    },
    {
      id: 'haku-name', name: 'Haku remembers his name', from: FILMS.spirited, bonus: 1000,
      hint: 'At the top of the long climb over the night sea, Haku turns to look at you and remembers his name. Take his head, close and in the middle, as it happens.',
      subjects: ['haku-ride'], pose: 'remembering', size: [0.2, 1.5],
      test: (p) => (shotOf(p, 'haku-ride')?.centering ?? 0) > 0.6,
    },
  ];
}
