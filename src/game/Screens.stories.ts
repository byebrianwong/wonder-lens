import type { Meta, StoryObj } from '@storybook/html-vite';
import { WORLDS } from '../worlds';
import { screen, VIEWPORTS } from '../stories/screen';
import { requests } from '../stories/bookFixtures';
import { loadingElement, menuElement, pauseElement } from './Screens';

/** The title menu, the loading card and the pause menu. */
export default {
  title: 'UI/Screens',
  parameters: { chromatic: { modes: VIEWPORTS } },
} satisfies Meta;

type Story = StoryObj;
// by id, so adding a world to the list does not change which world each story shows
const world = (id: string) => WORLDS.find((w) => w.id === id)!;
const dream = world('dream'), anderson = world('anderson'), amelie = world('amelie');

const menu = (selected = dream, relax = false, mouseLock = true): Story => ({
  render: () => {
    const s = screen({ fullHeight: true });
    s.add(menuElement({ worlds: WORLDS, selected, relax, mouseLock })).classList.add('show');
    return s.box;
  },
});

export const Menu = menu();
export const MenuAndersonRelax = menu(anderson, true, false);

/** After a few rides: each card's photo book count, and Granny's three requests for the next ride. */
export const MenuWithRequests: Story = {
  render: () => {
    const s = screen({ fullHeight: true });
    const books = {
      dream: { found: 23, total: 40, secretsFound: 2, secretsTotal: 5, stillsFound: 1, stillsTotal: 6 },
      anderson: { found: 7, total: 83, secretsFound: 0, secretsTotal: 0, stillsFound: 0, stillsTotal: 0 },
      amelie: null,
    };
    s.add(menuElement({ worlds: WORLDS, selected: dream, relax: false, mouseLock: true, books, requests })).classList.add('show');
    return s.box;
  },
};

const loading = (def = dream, relax = false): Story => ({
  render: () => {
    const s = screen();
    s.add(loadingElement(def, relax));
    return s.box;
  },
});

export const LoadingDream = loading(dream);
export const LoadingAnderson = loading(anderson);
export const LoadingAmelieRelax = loading(amelie, true);

export const Pause: Story = {
  render: () => {
    const s = screen({ backdrop: true });
    s.add(pauseElement({ title: dream.title, hudHidden: false, mouseMode: 'lock', muted: false })).classList.add('show');
    return s.box;
  },
};
