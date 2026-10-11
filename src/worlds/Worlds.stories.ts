import type { Meta, StoryObj } from '@storybook/html-vite';
import { rideView, whenDrawn, type RideViewOptions } from '../stories/ride';
import { STAGE_PARAMETERS } from '../stories/stage';
import { AmelieWorld } from './amelie/AmelieWorld';
import { DreamWorld } from './dream/DreamWorld';
import { AndersonWorld } from './anderson/AndersonWorld';
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
  parameters: STAGE_PARAMETERS,
} satisfies Meta<RideViewOptions>;

type Story = StoryObj<RideViewOptions>;
const view = (def: WorldDef, beat: number): Story => ({
  args: { beat },
  render: (args) => rideView(def, args),
  play: ({ canvasElement }) => whenDrawn(canvasElement),
});

export const DreamGarden = view(DreamWorld, 0);
export const DreamTreeGrowing = view(DreamWorld, 1);
export const DreamTreeTop = view(DreamWorld, 2);
export const DreamPowerLines = view(DreamWorld, 3);
export const DreamForestSpirit = view(DreamWorld, 4);
export const DreamAboveTheClouds = view(DreamWorld, 5);
export const DreamLaputa = view(DreamWorld, 6);
export const DreamHowlsMeadow = view(DreamWorld, 7);
export const DreamBathhouse = view(DreamWorld, 8);
export const DreamHaku = view(DreamWorld, 9);
export const DreamHome = view(DreamWorld, 10);

export const AndersonNebelsbad = view(AndersonWorld, 0);
export const AndersonFunicular = view(AndersonWorld, 1);
export const AndersonLobby = view(AndersonWorld, 2);
export const AndersonMendls = view(AndersonWorld, 3);
export const AndersonCourtesanTower = view(AndersonWorld, 4);
export const AndersonAgathaPacks = view(AndersonWorld, 5);
export const AndersonGabelmeistersPeak = view(AndersonWorld, 6);
export const AndersonTobogganChase = view(AndersonWorld, 7);
export const AndersonCliffEdge = view(AndersonWorld, 8);
export const AndersonFoxBurrow = view(AndersonWorld, 9);
export const AndersonCiderCellar = view(AndersonWorld, 10);
export const AndersonHilltopAtNight = view(AndersonWorld, 11);
export const AndersonSummersEnd = view(AndersonWorld, 12);
export const AndersonTidalInlet = view(AndersonWorld, 13);
export const AndersonStJacksChurch = view(AndersonWorld, 14);
// parked just after the lightning flash clears: the default point is so close under the arch that the camera looks up into the canopy
export const AndersonAsteroidCity: Story = { ...view(AndersonWorld, 15), args: { beat: 15, after: 0.004 } };
export const AndersonStargazerConvention = view(AndersonWorld, 16);
export const AndersonStargazing = view(AndersonWorld, 17);
export const AndersonTrashIsland = view(AndersonWorld, 18);
export const AndersonTrashMountains = view(AndersonWorld, 19);
export const AndersonCableLetsGo = view(AndersonWorld, 20);
export const AndersonUnderTheSea = view(AndersonWorld, 21);
export const AndersonJaguarShark = view(AndersonWorld, 22);
export const AndersonBelafonte = view(AndersonWorld, 23);
export const AndersonCurtainCall = view(AndersonWorld, 24);

export const AmelieRueDesTroisFreres = view(AmelieWorld, 0);
export const AmelieGrocer = view(AmelieWorld, 1);
export const AmelieCafe = view(AmelieWorld, 2);
export const AmelieCremeBrulee = view(AmelieWorld, 3);
export const AmelieBedroom = view(AmelieWorld, 4);
export const AmelieRooftops = view(AmelieWorld, 5);
export const AmelieSacreCoeur = view(AmelieWorld, 6);
export const AmelieCanal = view(AmelieWorld, 7);
export const AmelieGareDeLEst = view(AmelieWorld, 8);
export const AmelieSunrise = view(AmelieWorld, 9);
