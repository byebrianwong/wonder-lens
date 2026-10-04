import * as THREE from 'three';
import { envelope } from '../../../engine/Rig';
import { mendlsBox } from '../kit';
import { DOGS, DogLife, makeDog, type Dog, type DogOpts } from './dogs';
import { makeAtariPuppet } from './people';

/*
 * The leads of Part Seven, built so they work on their own (the curtain call, the character gallery):
 * Chief, the black stray, and Atari, the boy pilot. The scene uses the same builders.
 */

export interface Actor {
  group: THREE.Group;
  update(dt: number, t: number): void;
  bow(): void;
}

export interface Chief extends Actor {
  dog: Dog;
  life: DogLife;
  /** the camera or whatever he should look at (null: he looks about) */
  target: THREE.Vector3 | null;
  /** turn to the sound and bark twice */
  bark(): void;
  /** leap and catch a box in his mouth */
  catchBox(): void;
}

/**
 * Chief: lean, black and matted, ears up. He keeps himself to himself (he looks at you only now and then);
 * the whistle makes him turn and bark, a thrown box makes him leap and catch it in his jaws. His bow is a
 * dog's play bow: front down, tail up.
 */
export function makeChief(opts: Partial<DogOpts> = {}): Chief {
  const dog = makeDog({ ...DOGS.chief(), ...opts });
  const life = new DogLife(dog, 9101);
  life.attention = 0.35;
  const box = mendlsBox(1.5);
  box.visible = false;
  box.position.set(0, -0.05, 0.02);
  box.rotation.y = Math.PI / 4;
  // the box rides in his mouth, scaled back to world size inside the dog's scaled space
  box.scale.setScalar(1 / dog.opts.scale);
  dog.mouth.add(box);
  // the leap lifts the body inside the dog's group (in dog units), so the group stays where it was put
  const inner = dog.group.children[0];
  let barkT = 99, catchT = 99, bowT = 99;
  const chief: Chief = {
    group: dog.group, dog, life, target: null,
    bark() { barkT = 0; },
    catchBox() { catchT = 0; },
    bow() { bowT = 0; },
    update(dt) {
      barkT += dt; catchT += dt; bowT += dt;
      const barking = barkT < 2.6, catching = catchT < 5.2;
      life.attention = barking || catching ? 1 : 0.35;
      life.look.yaw.freq = barking ? 4 : 1.6; life.look.pitch.freq = barking ? 4 : 1.6;
      life.react = (P) => {
        // two barks: the head snaps forward and up, the jaw drops, the ears stay pricked
        if (barking) {
          const b = Math.max(0, Math.sin(Math.max(0, barkT - 0.35) * 9)) * (barkT > 0.35 && barkT < 1.75 ? 1 : 0);
          P.jaw = Math.max(P.jaw, b);
          P.headPitch -= b * 0.25;
          P.crouch = Math.max(P.crouch, 0.25 * envelope(barkT, 0.2, 0.4, 1.8, 2.4));
          P.tailUp = 1;
        }
        // the catch: a crouch to wind up, a leap with the head thrown up, jaws open, then shut on the box
        if (catching) {
          const wind = envelope(catchT, 0, 0.25, 0.35, 0.5);
          const air = envelope(catchT, 0.35, 0.6, 0.75, 1.05);
          P.crouch = Math.max(P.crouch, wind);
          P.rear = Math.max(P.rear, air * 0.55);
          P.headPitch -= air * 0.6;
          P.jaw = catchT > 0.4 && catchT < 0.72 ? 1 : 0;
          P.wag = Math.sin(catchT * 18) * 0.5 * envelope(catchT, 1.0, 1.4, 4.4, 5);
          P.tailUp = 1;
          inner.position.y = Math.sin(Math.min(1, Math.max(0, (catchT - 0.35) / 0.7)) * Math.PI) * 0.4;
        } else inner.position.y = 0;
        box.visible = catching && catchT > 0.7 && catchT < 4.8;
        // the play bow
        const bw = envelope(bowT, 0, 0.4, 1.6, 2.2);
        if (bw > 0) { P.crouch = Math.max(P.crouch, bw); P.tailUp = bw; P.wag = Math.sin(bowT * 14) * 0.4 * bw; P.headPitch += 0.2 * bw; }
      };
      life.update(dt, chief.target);
    },
  };
  return chief;
}

export interface AtariActor extends Actor {
  target: THREE.Vector3 | null;
  whistle(): void;
  catchBox(): void;
}

/** Atari Kobayashi in his silver flight suit and flying cap. Bows from the waist. */
export function makeAtari(): AtariActor {
  const a = makeAtariPuppet();
  const actor: AtariActor = {
    group: a.group, target: null,
    whistle: a.whistle, catchBox: a.catchBox, bow: a.bow,
    update(dt, t) { a.update(dt, t, actor.target); },
  };
  return actor;
}
