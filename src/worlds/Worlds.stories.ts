import type { Meta, StoryObj } from '@storybook/html-vite';
import { rideView, whenDrawn, type RideViewOptions } from '../stories/ride';
import { AmelieWorld } from './amelie/AmelieWorld';
import { AndersonWorld } from './anderson/AndersonWorld';
import { GhibliWorld } from './ghibli/GhibliWorld';
import type { WorldDef } from '../game/types';

/*
 * Each world from the rider's seat, parked just after each story beat (the captions in
 * each world file). The camera turns to the nearest character, like the idle camera does.
 * These catch changes that only show in context: lighting, fog, grass, water, clouds, placement.
 *
 * Each one builds a whole world, and the first frame compiles every shader. In a software
 * renderer that takes 4-12 s on an M5, so the frame is drawn in `play` (see ride.ts).
 */
export default {
  title: 'Worlds/Ride views',
} satisfies Meta<RideViewOptions>;

type Story = StoryObj<RideViewOptions>;
const view = (def: WorldDef, beat: number): Story => ({
  args: { beat },
  render: (args) => rideView(def, args),
  play: ({ canvasElement }) => whenDrawn(canvasElement),
});

export const GhibliKoriko = view(GhibliWorld, 0);
export const GhibliFields = view(GhibliWorld, 1);
export const GhibliCamphorTree = view(GhibliWorld, 2);
export const GhibliRainyBusStop = view(GhibliWorld, 3);
export const GhibliTunnel = view(GhibliWorld, 4);
export const GhibliSpiritSea = view(GhibliWorld, 5);
export const GhibliBathhouse = view(GhibliWorld, 6);
export const GhibliSwampBottom = view(GhibliWorld, 7);

export const AndersonNebelsbad = view(AndersonWorld, 0);
export const AndersonGrandBudapest = view(AndersonWorld, 1);
export const AndersonAutumnWood = view(AndersonWorld, 2);
export const AndersonCampIvanhoe = view(AndersonWorld, 3);
export const AndersonAsteroidCity = view(AndersonWorld, 4);
export const AndersonCrater = view(AndersonWorld, 5);
export const AndersonCauseway = view(AndersonWorld, 6);
export const AndersonBelafonte = view(AndersonWorld, 7);
export const AndersonPortAuPatois = view(AndersonWorld, 8);

export const AmelieRueLepic = view(AmelieWorld, 0);
export const AmelieCafe = view(AmelieWorld, 1);
export const AmelieMontmartre = view(AmelieWorld, 2);
export const AmelieSacreCoeur = view(AmelieWorld, 3);
export const AmelieCanal = view(AmelieWorld, 4);
export const AmelieGareDeLEst = view(AmelieWorld, 5);
export const AmelieLastStreetLamp = view(AmelieWorld, 6);
