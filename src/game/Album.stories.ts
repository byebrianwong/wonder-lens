import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent } from 'storybook/test';
import { DreamWorld } from '../worlds/dream/DreamWorld';
import { explorerRoll, guide, legendRoll } from '../stories/fixtures';
import { screen, VIEWPORTS } from '../stories/screen';
import { Album, summarize, type AlbumExtras } from './Album';
import { requests } from '../stories/bookFixtures';
import { WORLDS } from '../worlds';
import type { PhotoResult } from './Photo';

/*
 * The end-of-ride album. summarize() is the real scoring code, so the rank and totals
 * shown here are what a ride with these photos would earn.
 */
export default {
  title: 'UI/Album',
  parameters: { chromatic: { modes: VIEWPORTS } },
} satisfies Meta;

type Story = StoryObj;

function album(roll: () => PhotoResult[], o: { relax?: boolean; fullHeight?: boolean; extras?: AlbumExtras } = {}): Story {
  return {
    render: () => {
      const s = screen({ fullHeight: o.fullHeight ?? true });
      const a = new Album(s.box, summarize(roll(), guide), guide, DreamWorld.title, DreamWorld.accent, () => {}, () => {}, o.relax ?? false, o.extras);
      s.add(a.root);
      a.root.classList.add('show');
      return s.box;
    },
  };
}

export const Legend = album(legendRoll);
export const Explorer = album(explorerRoll);
export const NoPhotos = album(() => []);
export const RelaxRide = album(explorerRoll, { relax: true });
/** With the photo book and Granny's requests: ribbons on what the ride added, two of three requests done. */
export const WithBookAndRequests = album(explorerRoll, {
  extras: {
    fresh: new Map<string, 'new' | 'best'>([['s:kiki', 'new'], ['s:totoro', 'best'], ['s:catbus', 'new']]),
    book: { found: 14, total: 40, secretsFound: 1, secretsTotal: 5, stillsFound: 0, stillsTotal: 6 },
    onBook: () => {},
    requester: WORLDS.find((w) => w.id === 'dream')!.requester,
    requests: requests.map((r, i) => ({ ...r, done: i < 2 })),
  },
});
export const PhotoOpened: Story = {
  ...album(legendRoll, { fullHeight: false }),
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector('.album-photo.hero') as HTMLElement);
    await expect(canvasElement.querySelector('.lightbox')).toHaveClass('show');
  },
};
