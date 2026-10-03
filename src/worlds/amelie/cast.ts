import * as THREE from 'three';
import type { RideState } from '../../game/types';
import { Subject } from '../../game/Subject';
import { Rng, clamp } from '../../engine/math';
import { FROM, forwardOf, setActive } from './common';
import { SETS, type Road } from './layout';
import {
  makeAmelieSkipping, makeAmelieWaitress, makeBlindPair, makeBlubber, makeBusker, makeCollignon, makeDufayel, makeGeorgette, makeGnome, makeJoseph,
  makeLovers, makeLucien, makeNinoCrouch, makeNinoTelescope, makePigeons, makeRiders, makeStranger, type Character,
} from './characters';
import type { buildStreet } from './sets/street';
import { GROCER } from './sets/street';
import type { Cafe } from './sets/cafe';
import { CAFE } from './sets/cafe';
import type { Bedroom } from './sets/bedroom';
import type { Rooftops } from './sets/rooftops';
import { BUTTE } from './sets/rooftops';
import type { Butte } from './sets/butte';
import type { Canal } from './sets/canal';
import type { Gare } from './sets/gare';
import { GARE } from './sets/gare';
import type { Finale } from './sets/finale';

/**
 * Everyone in the dream, placed in their scenes, with the photo subjects that score them and the reactions
 * the accordion and the skipping stone set off.
 */
export interface CastSets {
  street: ReturnType<typeof buildStreet>; cafe: Cafe; bedroom: Bedroom; rooftops: Rooftops; butte: Butte; canal: Canal; gare: Gare; finale: Finale;
}

export function buildCast(scene: THREE.Scene, road: Road, camera: THREE.Camera, S: CastSets) {
  const subjects: Subject[] = [];
  const chars: Array<{ c: Character; on: (u: number) => boolean }> = [];
  const extra: Array<(dt: number, t: number, ride: RideState) => void> = [];
  const camPos = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const U = (z: number) => road.u(z);
  const within = (z0: number, z1: number) => (u: number) => u > U(z0) && u < U(z1);
  const add = (c: Character, parent: THREE.Object3D, pos: THREE.Vector3, yaw: number, on: (u: number) => boolean, scale = 1.15) => {
    c.group.position.copy(pos); c.group.rotation.y = yaw; c.group.scale.multiplyScalar(scale);
    parent.add(c.group);
    chars.push({ c, on });
    return c;
  };
  const landmark = (id: string, name: string, pos: THREE.Vector3, radius: number, base: number, hint: string, maxDistance: number, parent: THREE.Object3D, on: (u: number) => boolean) => {
    const anchor = new THREE.Object3D(); anchor.position.copy(pos); parent.add(anchor);
    const s = new Subject({ id, name, from: FROM, group: anchor, radius, base, hint, maxDistance });
    subjects.push(s);
    extra.push((_dt, _t, ride) => { s.active = on(ride.u); });
    return s;
  };

  // ======================= the street and the grocer =======================
  const shopYaw = road.along(GROCER.front) + Math.PI;
  const G = S.street.grocer;
  landmark('marche', 'Au Marché de la Butte', G.front.clone().add(new THREE.Vector3(0, 12, 0)), 18, 650, 'The green grocer at the top of the lane, grown to the size of a station. The moped rides straight in through its open front.', 260, S.street.group, within(60, GROCER.front - 40));

  const lucien = add(makeLucien(), S.street.group, G.stallLeft, shopYaw + 0.3, within(60, GROCER.front - 30), 1.35) as ReturnType<typeof makeLucien>;
  const lucienS = new Subject({
    id: 'lucien', name: 'Lucien', from: FROM, group: lucien.group, radius: 1.0, base: 800, rarity: 'rare',
    hint: 'The kind assistant arranging fruit outside the grocer. Play the accordion and he holds up the perfect endive; a stone makes him fumble the apples.',
    poses: { endive: { label: 'The perfect endive', mult: 1.7 }, fumble: { label: 'Butterfingers', mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), facing: forwardOf(lucien.group),
    onCall: () => { lucien.endive(); lucienS.setPose('endive', 2.4); return true; },
    onItem: () => { lucien.fumble(); lucienS.setPose('fumble', 1.4); return true; }, reactRange: 10, maxDistance: 100,
  });
  subjects.push(lucienS);

  const coll = add(makeCollignon(), S.street.group, G.counter, shopYaw, within(GROCER.front + 20, GROCER.back - 4), 1.5) as ReturnType<typeof makeCollignon>;
  const collS = new Subject({
    id: 'collignon', name: 'Collignon the grocer', from: FROM, group: coll.group, radius: 1.1, base: 700,
    hint: 'Behind his till at the back of the shop, counting coins. The accordion gets a wagging finger; a stone makes him duck.',
    poses: { scowl: { label: 'Not in my shop!', mult: 1.5 }, flinch: { label: 'Collignon ducks', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 1.3, 0), facing: forwardOf(coll.group),
    onCall: () => { coll.scowl(); collS.setPose('scowl', 2.0); return true; },
    onItem: () => { coll.flinch(); collS.setPose('flinch', 1.2); return true; }, reactRange: 9, maxDistance: 80,
  });
  subjects.push(collS);

  const rng = new Rng(4040);
  const pigeons = add(makePigeons(11, rng, 2.6), S.street.group, S.street.pigeonSpot, 0, within(60, GROCER.front - 10), 1.3) as ReturnType<typeof makePigeons>;
  const pigS = new Subject({
    id: 'pigeons', name: 'Pigeons', from: FROM, group: pigeons.group, radius: 2.6, base: 300,
    hint: 'Pecking in the middle of the lane. A stone sends them up in a flurry.',
    poses: { scatter: { label: 'Scatter!', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 0.4, 0),
    onItem: () => { pigeons.scatter(); pigS.setPose('scatter', 2.0); return true; }, reactRange: 10, maxDistance: 80, crowd: true,
  });
  subjects.push(pigS);

  // the pair walk up the left pavement towards the moped, so you see their faces
  const blind = add(makeBlindPair(), S.street.group, S.street.walkPath(1), road.along(-90) + Math.PI, within(60, -120)) as ReturnType<typeof makeBlindPair>;
  let blindK = 0;
  const blindS = new Subject({
    id: 'blindman', name: 'The blind man', from: FROM, group: blind.group, radius: 1.3, base: 700,
    hint: 'Walking down the left pavement on Amélie\'s arm while she tells him everything she sees. The accordion makes him laugh and lift his cane.',
    poses: { laugh: { label: 'Seeing the street', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.1, 0), facing: forwardOf(blind.group),
    onCall: () => { blind.laugh(); blindS.setPose('laugh', 2.2); return true; }, maxDistance: 90,
  });
  subjects.push(blindS);
  extra.push((dt, _t, ride) => {
    if (!blindS.active) return;
    blind.walking = blindS.pose !== 'laugh' && blindK < 1;
    if (blind.walking) blindK = Math.min(1, blindK + dt * 0.02 * (ride.speedMult > 0.05 ? 1 : 0.5));
    const p = S.street.walkPath(1 - blindK);
    blind.group.position.copy(p);
  });

  // ======================= the café =======================
  const cs = S.cafe.spots;
  landmark('cafe', 'Café des 2 Moulins', new THREE.Vector3(0, 13, -296), 8, 600, 'Amélie\'s café: the zinc bar, the tobacco counter, green banquettes, yellow globes.', 90, S.cafe.group, within(-246, -342));
  const amelie = add(makeAmelieWaitress(), S.cafe.group, cs.bar, cs.barYaw, within(-240, -350), 1.45) as ReturnType<typeof makeAmelieWaitress>;
  const ameS = new Subject({
    id: 'amelie', name: 'Amélie', from: FROM, group: amelie.group, radius: 1.0, base: 1500, rarity: 'legendary',
    hint: 'Behind the bar of the Café des 2 Moulins, polishing a glass. Play the accordion and she smiles and waves; a stone at her feet makes her giggle.',
    poses: { wave: { label: 'That smile', mult: 2.0 }, giggle: { label: 'A giggle', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 1.3, 0), facing: forwardOf(amelie.group),
    onCall: () => { amelie.wave(); ameS.setPose('wave', 2.2); return true; },
    onItem: () => { amelie.giggle(); ameS.setPose('giggle', 1.6); return true; }, reactRange: 9, maxDistance: 70,
  });
  subjects.push(ameS);
  const georgette = add(makeGeorgette(), S.cafe.group, cs.tabac, cs.tabacYaw, within(-240, -330), 1.4) as ReturnType<typeof makeGeorgette>;
  const geoS = new Subject({
    id: 'georgette', name: 'Georgette', from: FROM, group: georgette.group, radius: 0.9, base: 600,
    hint: 'Behind the tobacco counter, sure she is coming down with something. The accordion gives her a dizzy spell.',
    poses: { swoon: { label: 'A dizzy spell', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.3, 0), facing: forwardOf(georgette.group),
    onCall: () => { georgette.swoon(); geoS.setPose('swoon', 2.4); return true; }, maxDistance: 60,
  });
  subjects.push(geoS);
  const joseph = add(makeJoseph(), S.cafe.group, new THREE.Vector3(CAFE.halfW - 1.3, 8.2, cs.joseph.z), -Math.PI / 2, within(-240, -335), 1.4) as ReturnType<typeof makeJoseph>;
  const josS = new Subject({
    id: 'joseph', name: 'Joseph', from: FROM, group: joseph.group, radius: 0.9, base: 500,
    hint: 'The jealous regular on the green banquette, taping everything on his little recorder. The accordion makes him lean in and press record.',
    poses: { record: { label: 'Every word recorded', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 1.1, 0), facing: forwardOf(joseph.group),
    onCall: () => { joseph.record(); josS.setPose('record', 2.6); return true; }, maxDistance: 60,
  });
  subjects.push(josS);
  const creme = S.cafe.creme;
  const cremeS = new Subject({
    id: 'creme', name: 'The crème brûlée', from: FROM, group: creme.group, radius: 3.6, base: 900, rarity: 'rare',
    hint: 'On the giant table, a teaspoon hovering over it. Amélie\'s favourite small pleasure: play the accordion or toss a stone and the spoon cracks the caramel.',
    poses: { crack: { label: 'Crack!', mult: 1.9 } }, centerOffset: new THREE.Vector3(0, 1.2, 0),
    onCall: () => { if (creme.cracked()) return false; creme.crack(); cremeS.setPose('crack', 3); return true; },
    onItem: () => { if (creme.cracked()) return false; creme.crack(); cremeS.setPose('crack', 3); return true; }, reactRange: 8, maxDistance: 60,
  });
  subjects.push(cremeS);
  extra.push((_dt, _t, ride) => { cremeS.active = within(-345, -452)(ride.u); });

  // ======================= the bedroom =======================
  const paint = S.bedroom.paintings;
  const paintS = new Subject({
    id: 'paintings', name: 'The talking paintings', from: FROM, group: paint.group, radius: 3.4, base: 900, rarity: 'rare',
    hint: 'The dog and the goose over Amélie\'s bed. At night they gossip about her. Play the accordion and they turn to each other and talk.',
    poses: { talk: { label: 'Gossiping', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 0, 0),
    onCall: () => { paint.chatter(); paintS.setPose('talk', 4); return true; }, maxDistance: 50,
  });
  subjects.push(paintS);
  const pig = S.bedroom.pig;
  const pigLampS = new Subject({
    id: 'piglamp', name: 'The pig lamp', from: FROM, group: pig.group, radius: 1.3, base: 850, rarity: 'rare',
    hint: 'On the bedside table, wearing its lampshade like a hat. Play the accordion or throw a stone and it looks round and switches itself off.',
    poses: { off: { label: 'Lights out', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 1.6, 0), facing: forwardOf(pig.group),
    onCall: () => { pig.react(); pigLampS.setPose('off', 3.5); return true; },
    onItem: () => { pig.react(); pigLampS.setPose('off', 3.5); return true; }, reactRange: 6, maxDistance: 45,
  });
  subjects.push(pigLampS);
  extra.push((_dt, _t, ride) => { const on = within(-450, -540)(ride.u); paintS.active = on; pigLampS.active = on; });

  // ======================= the rooftops =======================
  const R = S.rooftops;
  const duf = add(makeDufayel(), scene, R.dufayel.pos, R.dufayel.yaw + Math.PI / 2, within(-540, -660)) as ReturnType<typeof makeDufayel>;
  const dufS = new Subject({
    id: 'dufayel', name: 'Dufayel, the glass man', from: FROM, group: duf.group, radius: 1.2, base: 950, rarity: 'rare',
    hint: 'In a lit window right beside the flight, copying Renoir\'s boating party for the twentieth year. Play the accordion and he turns to look out at you.',
    poses: { look: { label: 'The glass man looks out', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 1.1, 0.3), facing: forwardOf(duf.group),
    onCall: () => { duf.turn(); dufS.setPose('look', 3); return true; }, maxDistance: 60,
  });
  subjects.push(dufS);
  const clouds = R.clouds;
  const cloudSubjects = ([['bear', 'A teddy-bear cloud', clouds.bear, new THREE.Vector3(0, 8, 0)], ['rabbit', 'A rabbit cloud', clouds.rabbit, new THREE.Vector3(0, 8, 0)], ['duck', 'A duck cloud', clouds.duck, new THREE.Vector3(0, 4, 0)]] as const).map(([id, name, cl, off]) => {
    const s = new Subject({
      id: `cloud-${id}`, name, from: FROM, group: cl.group, radius: 40, base: 550,
      hint: 'Little Amélie saw animals in the clouds. Look up during the flight: a teddy bear, a rabbit and a duck. Play the accordion and they wave back.',
      poses: { wave: { label: 'Waving back', mult: 1.6 } }, centerOffset: off, maxDistance: 520,
    });
    subjects.push(s);
    return s;
  });
  extra.push((_dt, _t, ride) => { const on = within(-532, -900)(ride.u); for (const s of cloudSubjects) s.active = on; });
  landmark('sacrecoeur', 'Sacré-Cœur', new THREE.Vector3(BUTTE.x, BUTTE.top + 26, BUTTE.z - 5), 28, 900, 'The white basilica on top of the Butte. The flight swoops past its domes and lands on its steps.', 420, scene, within(-532, -880));
  landmark('eiffel', 'The Eiffel Tower', R.tower.group.position.clone().add(new THREE.Vector3(0, 80, 0)), 40, 450, 'Far off in the sunset, twinkling, seen from over the rooftops.', 900, scene, within(-536, -760));

  // ======================= the Butte =======================
  const B = S.butte;
  const nino1 = add(makeNinoTelescope(), B.group, B.telescope.clone().add(new THREE.Vector3(0.25, 0, 0.95)), Math.PI, within(-780, -870)) as ReturnType<typeof makeNinoTelescope>;
  const nino1S = new Subject({
    id: 'nino-telescope', name: 'Nino at the telescope', from: FROM, group: nino1.group, radius: 1.0, base: 950, rarity: 'rare',
    hint: 'Bent over the coin telescope at the top of the steps, following Amélie\'s blue arrows. Play the accordion and he straightens up and waves his album.',
    poses: { wave: { label: 'Following the arrows', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), facing: forwardOf(nino1.group),
    onCall: () => { nino1.show(); nino1S.setPose('wave', 2.8); return true; }, maxDistance: 70,
  });
  subjects.push(nino1S);
  const carS = new Subject({
    id: 'carousel', name: 'The carousel', from: FROM, group: B.carousel.group, radius: 10, base: 700,
    hint: 'A two-tier merry-go-round at the foot of the steps. The accordion brings all its lights up and sets it spinning faster.',
    poses: { lights: { label: 'All lights on', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 7, 0),
    onCall: () => { B.carousel.lightsOn(); carS.setPose('lights', 6); return true; }, maxDistance: 160,
  });
  subjects.push(carS);
  extra.push((_dt, _t, ride) => { carS.active = within(-805, -908)(ride.u); });

  // ======================= the canal =======================
  const C = S.canal;
  const skipZ = -992;
  const ame2 = add(makeAmelieSkipping(), C.group, C.quay(skipZ, -1, 1.2), road.faceRoad(skipZ, -1) - 0.5, within(-910, -1060), 1.55) as ReturnType<typeof makeAmelieSkipping>;
  const ame2S = new Subject({
    id: 'amelie-canal', name: 'Amélie skipping stones', from: FROM, group: ame2.group, radius: 1.0, base: 1300, rarity: 'legendary',
    hint: 'On the quay of the Canal Saint-Martin, skipping stones across the water. Play the accordion and she sends one skipping right past you.',
    poses: { skip: { label: 'Ricochets', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), facing: forwardOf(ame2.group),
    onCall: () => { ame2.skip(); ame2S.setPose('skip', 2.4); return true; }, maxDistance: 80,
  });
  subjects.push(ame2S);
  const blubber = add(makeBlubber(), C.group, road.side(-1032, 6.5, 0).setY(0), road.along(-1032) + 1.2, within(-920, -1140), 1.6) as ReturnType<typeof makeBlubber>;
  const blubS = new Subject({
    id: 'blubber', name: 'Blubber', from: FROM, group: blubber.group, radius: 1.6, base: 950, rarity: 'rare',
    hint: 'A goldfish the size of a rowing boat, living in the canal near the middle footbridge. Skip a stone onto the water near him and he leaps.',
    poses: { leap: { label: "Blubber's leap", mult: 1.9 } }, centerOffset: new THREE.Vector3(0, 0.8, 0),
    onItem: (pos) => { if (pos.y > 0.6) return false; blubber.leap(); blubS.setPose('leap', 1.8); return true; }, reactRange: 16, maxDistance: 90,
  });
  subjects.push(blubS);
  const bz = C.bridges[1];
  const busker = add(makeBusker(), C.group, bz.crown.clone(), road.along(-1046) + Math.PI, within(-920, -1080)) as ReturnType<typeof makeBusker>;
  const buskS = new Subject({
    id: 'busker', name: 'The accordion player', from: FROM, group: busker.group, radius: 1.1, base: 600,
    hint: 'Playing on the crown of the middle footbridge as you glide underneath. Answer him with your accordion and he plays along.',
    poses: { play: { label: 'Playing along', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), facing: forwardOf(busker.group),
    onCall: () => { busker.play(); buskS.setPose('play', 2.8); return true; }, maxDistance: 90,
  });
  subjects.push(buskS);
  const lovers = add(makeLovers(), C.group, C.quay(-1092, 1, 2.6).add(new THREE.Vector3(0, 0.02, 0)), road.faceRoad(-1092, 1), within(-1000, -1160)) as ReturnType<typeof makeLovers>;
  const lovS = new Subject({
    id: 'lovers', name: 'Lovers on the quay', from: FROM, group: lovers.group, radius: 1.2, base: 400,
    hint: 'On a bench by the dark green water. The accordion makes them turn to each other.',
    poses: { kiss: { label: 'A kiss by the canal', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 0.9, 0), facing: forwardOf(lovers.group),
    onCall: () => { lovers.kiss(); lovS.setPose('kiss', 3); return true; }, maxDistance: 70,
  });
  subjects.push(lovS);
  landmark('hotelnord', 'Hôtel du Nord', road.side(-1075, 13 + 12, 10), 8, 450, 'The old hotel on the quay, its name in red neon.', 140, C.group, within(-940, -1150));

  // ======================= the station =======================
  const Gs = S.gare;
  const boardS = new Subject({
    id: 'board', name: 'The departures board', from: FROM, group: (() => { const o = new THREE.Object3D(); o.position.set(0, 1.4 + 15, GARE.concourse - 14 + 0.5); Gs.group.add(o); return o; })(), radius: 10, base: 700,
    hint: 'High over the concourse, its letters clattering. Play the accordion and every flap turns to spell out a message.',
    poses: { love: { label: 'A message on the board', mult: 1.8 } },
    onCall: () => { Gs.board.show(true); boardS.setPose('love', 8); return true; }, maxDistance: 120,
  });
  subjects.push(boardS);
  let boardBack = 0;
  extra.push((_dt, _t, ride) => { boardS.active = within(-1260, -1420)(ride.u); });
  extra.push((dt) => { if (boardS.pose === 'love') boardBack = 8; else if (boardBack > 0) { boardBack -= dt; if (boardBack <= 0) Gs.board.show(false); } });
  const stranger = add(makeStranger(), Gs.group, Gs.spots.stranger, Gs.spots.strangerYaw, within(-1290, -1432)) as ReturnType<typeof makeStranger>;
  const strS = new Subject({
    id: 'stranger', name: 'The man in the photo booths', from: FROM, group: stranger.group, radius: 1.1, base: 900, rarity: 'rare',
    hint: 'The bald man in the raincoat who turns up, torn, in every album page. He is only the repairman. Play the accordion and he turns to give you his famous blank look.',
    poses: { stare: { label: 'The mystery man', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 1.3, 0), facing: forwardOf(stranger.group),
    onCall: () => { stranger.stare(); strS.setPose('stare', 3); return true; }, maxDistance: 80,
  });
  subjects.push(strS);
  const nino2 = add(makeNinoCrouch(), Gs.group, Gs.spots.nino, Gs.spots.ninoYaw, within(-1290, -1432)) as ReturnType<typeof makeNinoCrouch>;
  const nino2S = new Subject({
    id: 'nino', name: 'Nino', from: FROM, group: nino2.group, radius: 1.0, base: 950, rarity: 'rare',
    hint: 'Crouched under a photo booth, fishing out the torn pictures people leave behind. Play the accordion and he stands to show you one.',
    poses: { photo: { label: 'The torn photo', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 0.8, 0), facing: forwardOf(nino2.group),
    onCall: () => { nino2.rise(); nino2S.setPose('photo', 3); return true; }, maxDistance: 80,
  });
  subjects.push(nino2S);
  landmark('gare', "Gare de l'Est", new THREE.Vector3(0, 20, GARE.back + 2), 28, 600, 'The great hall of the station at night, under its glass vault.', 220, Gs.group, within(-1230, -1420));
  landmark('photomaton', 'The giant photo booth', new THREE.Vector3(0, 8, GARE.booth - 7), 7, 650, 'At the end of the concourse a Photomaton as big as a house. Ride in and smile: four flashes.', 120, Gs.group, within(-1300, -1418));

  // ======================= the finale =======================
  const F = S.finale;
  const riders = add(makeRiders(), F.group, road.side(-1445, 0), road.along(-1445), within(-1430, -1720), 1.0) as ReturnType<typeof makeRiders>;
  const ridS = new Subject({
    id: 'finale', name: 'Amélie & Nino', from: FROM, group: riders.group, radius: 1.6, base: 1500, rarity: 'legendary',
    hint: 'Riding ahead of you on his red moped through the sunrise, her arms round him. Play the accordion and she turns, waves and leans her head on his back.',
    poses: { lean: { label: 'Together at last', mult: 2.0 } }, centerOffset: new THREE.Vector3(0, 1.3, -0.3),
    facing: () => new THREE.Vector3(0, 0, 1).applyQuaternion(riders.group.quaternion).negate(),
    onCall: () => { riders.lean(); ridS.setPose('lean', 3.2); return true; }, maxDistance: 70,
  });
  subjects.push(ridS);
  const tmpQ = new THREE.Quaternion(), mtx = new THREE.Matrix4();
  const ridersOn = within(-1428, -1720);
  extra.push((_dt, _t, ride) => {
    if (!ridersOn(ride.u)) return;
    // keep a little ahead of the rider, following the same path
    const z = F.leadZ(ride.position.z);
    const u = clamp(road.u(z), 0, 1);
    const p = road.curve.getPointAt(u), tan = road.curve.getTangentAt(u);
    riders.group.position.copy(p);
    mtx.lookAt(new THREE.Vector3(), tan.clone().setY(tan.y * 0.4).negate(), new THREE.Vector3(0, 1, 0));
    tmpQ.setFromRotationMatrix(mtx);
    riders.group.quaternion.copy(tmpQ);
  });

  // ======================= the travelling gnome =======================
  const gnome = makeGnome();
  gnome.group.scale.setScalar(1.6);
  scene.add(gnome.group);
  const tableY = 16.05;
  const spots: Array<{ until: number; pos: THREE.Vector3; yaw: number; pose: string }> = [
    { until: U(GROCER.front - 10), pos: G.gnomeSpot, yaw: shopYaw, pose: 'market' },
    { until: U(-452), pos: new THREE.Vector3(4.6, tableY + 1.5, -414), yaw: 0.6, pose: 'sugar' },
    { until: U(-700), pos: R.gnomeSpot.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), yaw: R.gnomeSpot.yaw, pose: 'roof' },
    { until: U(-910), pos: B.gnomeSpot.pos, yaw: B.gnomeSpot.yaw, pose: 'phone' },
    { until: U(-1160), pos: C.bridges[0].crown.clone().add(new THREE.Vector3(1.4, 0.02, 0)), yaw: road.along(-968) + Math.PI, pose: 'bridge' },
    { until: U(-1432), pos: new THREE.Vector3(-3.2, 1.4, GARE.booth + 2), yaw: Math.PI, pose: 'gare' },
    { until: 2, pos: F.terrace.gnome, yaw: F.terrace.gnomeYaw, pose: 'home' },
  ];
  let gnomeSpot = -1;
  const gnomeS = new Subject({
    id: 'gnome', name: 'The travelling gnome', from: FROM, group: gnome.group, radius: 0.6, base: 850, rarity: 'rare',
    hint: 'Amélie\'s father\'s garden gnome, off seeing the world. He keeps turning up ahead of you: on the fruit, on the giant table, on a chimney, by the phone box... Toss a stone and he tips his hat.',
    poses: {
      market: { label: 'Postcard from the market', mult: 1.3 }, sugar: { label: 'Postcard from the sugar bowl', mult: 1.35 }, roof: { label: 'Postcard from the rooftops', mult: 1.4 },
      phone: { label: 'Postcard from the phone box', mult: 1.3 }, bridge: { label: 'Postcard from the canal', mult: 1.35 }, gare: { label: 'Postcard from the station', mult: 1.3 },
      home: { label: 'Home again', mult: 1.5 }, hat: { label: 'Tipping his hat', mult: 1.6 },
    }, centerOffset: new THREE.Vector3(0, 0.45, 0), facing: forwardOf(gnome.group),
    onItem: () => { gnome.tipHat(); gnomeS.setPose('hat', 1.6); return true; }, reactRange: 9, maxDistance: 70,
  });
  subjects.push(gnomeS);
  extra.push((dt, t, ride) => {
    let i = 0;
    while (i < spots.length - 1 && ride.u > spots[i].until) i++;
    if (i !== gnomeSpot) { gnomeSpot = i; gnome.group.position.copy(spots[i].pos); gnome.group.rotation.y = spots[i].yaw; gnomeS.setPose(spots[i].pose, 9999); }
    if (gnomeS.pose === 'idle') gnomeS.setPose(spots[gnomeSpot].pose, 9999);
    gnome.update(dt, t);
  });

  return {
    subjects,
    /** the cloud animals wave when the accordion plays anywhere in the flight */
    call(u: number) {
      if (!within(-532, -900)(u)) return;
      clouds.bear.parts.armR.userData.wave = 3; clouds.rabbit.parts.earL.userData.wave = 3; clouds.duck.parts.head.userData.wave = 3;
      for (const s of cloudSubjects) s.setPose('wave', 3);
    },
    /** Amélie's skipped stones and the player's land on the canal */
    skipThrown: () => ame2.thrown(),
    amelieCanal: ame2,
    blubber: { subject: blubS, char: blubber },
    update(dt: number, t: number, ride: RideState) {
      camera.getWorldPosition(camPos);
      for (const x of extra) x(dt, t, ride);
      for (const { c, on } of chars) {
        // characters far down the road are left out until they matter
        const active = on(ride.u) && c.group.getWorldPosition(tmpP).distanceToSquared(camPos) < 130 * 130;
        c.group.visible = active;
        if (!active) continue;
        c.lookTarget = camPos;
        c.update(dt, t);
      }
      // subjects follow their characters' visibility
      for (const s of subjects) if (s.group.visible === false && s.active) s.active = false;
      for (const s of [lucienS, collS, pigS, blindS, ameS, geoS, josS, dufS, nino1S, ame2S, blubS, buskS, lovS, strS, nino2S, ridS]) s.active = s.group.visible;
      blubS.active = blubS.active && (blubber.up() || blubS.pose === 'leap');
    },
  };
}

void setActive; void SETS;
