import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent } from 'storybook/test';
import { GhibliWorld } from '../worlds/ghibli/GhibliWorld';
import { explorerRoll, guide, legendRoll } from '../stories/fixtures';
import { screen, VIEWPORTS } from '../stories/screen';
import { Album, summarize } from './Album';
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

function album(roll: () => PhotoResult[], o: { relax?: boolean; fullHeight?: boolean } = {}): Story {
  return {
    render: () => {
      const s = screen({ fullHeight: o.fullHeight ?? true });
      const a = new Album(s.box, summarize(roll(), guide), guide, GhibliWorld.title, GhibliWorld.accent, () => {}, () => {}, o.relax ?? false);
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
export const PhotoOpened: Story = {
  ...album(legendRoll, { fullHeight: false }),
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector('.album-photo.hero') as HTMLElement);
    await expect(canvasElement.querySelector('.lightbox')).toHaveClass('show');
  },
};
