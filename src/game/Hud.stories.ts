import type { Meta, StoryObj } from '@storybook/html-vite';
import { GhibliWorld } from '../worlds/ghibli/GhibliWorld';
import { legendRoll, photo, sceneryPhoto, subjects } from '../stories/fixtures';
import { screen, showAll, VIEWPORTS } from '../stories/screen';
import { Hud } from './Hud';

/*
 * The in-ride overlay over a still of the Ghibli world, in the states it shows during a ride.
 * Each story builds a Hud and calls the same methods Game.ts calls.
 */
export default {
  title: 'UI/HUD',
  parameters: { chromatic: { modes: VIEWPORTS } },
} satisfies Meta;

type Story = StoryObj;
const W = GhibliWorld;

function hud(setup: (h: Hud) => void, o: { touch?: boolean } = {}): Story {
  return {
    render: () => {
      const s = screen({ backdrop: true });
      const h = new Hud(s.box, W.title, W.itemName, W.callName, W.accent, o.touch);
      h.persist = true;
      h.setFilm(24, 24);
      h.setZoom(0);
      h.setProgress(0.3);
      h.setCooldowns(0, 0);
      setup(h);
      showAll(h.root);
      return s.box;
    },
  };
}

export const StartOfRide = hud((h) => { h.setProgress(0.01); h.caption('The Sea Train departing…'); });
export const SubjectInView = hud((h) => { h.tagSubject(subjects.totoro); h.caption('Rain at the Inari-mae bus stop'); h.setProgress(0.46); });
export const Zoomed = hud((h) => { h.setZoom(0.7); h.tagSubject(subjects.catbus); });
export const Cooldowns = hud((h) => h.setCooldowns(0.55, 0.85));
export const LowFilm = hud((h) => { h.setFilm(3, 24); h.setProgress(0.8); });
export const OutOfFilm = hud((h) => { h.setFilm(0, 24); h.flashWarning('Out of film'); });
export const PhotoCard = hud((h) => {
  h.setFilm(17, 24);
  h.showPhoto(legendRoll()[0]);
  h.toast('<b>New in your field guide:</b> Totoro', 'discover');
});
export const PhotoCardsStacked = hud((h) => {
  h.setFilm(14, 24);
  h.showPhoto(photo('kiki', { score: 810, stars: 2, bonuses: ['Rare sighting'] }));
  h.showPhoto(sceneryPhoto());
  h.showPhoto(photo('noface', { score: 2210, stars: 4, bonuses: ['Offering gold', 'Legendary sighting'] }));
});
export const SubjectReacts = hud((h) => { h.centerMessage('Totoro reacts!'); h.tagSubject(subjects.totoro); });
export const LockHint = hud((h) => h.showLockHint(true));
export const RelaxRide = hud((h) => { h.setMinimal(true); h.setFilm(Infinity, 24); h.caption('The sea of spirits'); });
export const Touch: Story = {
  ...hud((h) => h.tagSubject(subjects.kiki), { touch: true }),
  parameters: { chromatic: { modes: { phone: VIEWPORTS.phone } } },
};
