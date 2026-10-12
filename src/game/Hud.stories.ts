import type { Meta, StoryObj } from '@storybook/html-vite';
import { DreamWorld } from '../worlds/dream/DreamWorld';
import { legendRoll, photo, sceneryPhoto, subjects } from '../stories/fixtures';
import { screen, showAll, VIEWPORTS } from '../stories/screen';
import { requests } from '../stories/bookFixtures';
import { Hud } from './Hud';

/*
 * The in-ride overlay over a still of a Ghibli world, in the states it shows during a ride.
 * Each story builds a Hud and calls the same methods Game.ts calls.
 */
export default {
  title: 'UI/HUD',
  parameters: { chromatic: { modes: VIEWPORTS } },
} satisfies Meta;

type Story = StoryObj;
const W = DreamWorld;

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

export const StartOfRide = hud((h) => { h.setProgress(0.01); h.caption("Totoro's garden, at midnight"); });
export const SubjectInView = hud((h) => { h.tagSubject(subjects.totoro); h.caption('The tree that grew in one night'); h.setProgress(0.46); });
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
export const SubjectReacts = hud((h) => { h.centerMessage('Totoro · Rain-shaking jump'); h.tagSubject(subjects.totoro); });
/** A special moment is in the viewfinder: the reticle lights up and names it, so the player knows to take the shot. */
export const SpecialMoment = hud((h) => {
  h.centerMessage('Totoro · The big roar, +2 more');
  h.tagSubject(subjects.totoro, 'The big roar');
  h.setToolHints(true, true);
  h.setProgress(0.48);
});
/** The acorn and ocarina tools glow when the subject in the viewfinder would react to them. */
export const ToolHints = hud((h) => { h.tagSubject(subjects.noface); h.setToolHints(true, true); h.setProgress(0.66); });
export const LockHint = hud((h) => h.showLockHint(true));
/** The ride's three photo requests under the film counter, one just done. */
export const PhotoRequests = hud((h) => {
  h.setFilm(18, 24);
  h.setRequests('Granny', requests);
  h.tickRequest(1);
  h.toast('<b>Request done:</b> Haku · a first photo', 'request');
});
/** A sparkle over a subject about to do something by itself, and one just off the edge of the frame. */
export const MomentCue = hud((h) => {
  h.tagSubject(subjects.totoro);
  h.setCues([{ id: 'totoro', x: innerWidth * 0.44, y: innerHeight * 0.42, edge: false }, { id: 'laputa', x: innerWidth * 0.025, y: innerHeight * 0.22, edge: true }]);
  h.root.querySelectorAll('.cue').forEach((c) => c.classList.add('show'));
});
export const RelaxRide = hud((h) => { h.setMinimal(true); h.setFilm(Infinity, 24); h.caption("On Haku's back"); });
export const Touch: Story = {
  ...hud((h) => h.tagSubject(subjects.kiki), { touch: true }),
  parameters: { chromatic: { modes: { phone: VIEWPORTS.phone } } },
};
