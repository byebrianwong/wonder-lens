import type { Meta, StoryObj } from '@storybook/html-vite';
import { WORLDS } from '../worlds';
import { screen, VIEWPORTS } from '../stories/screen';
import { loadingElement, menuElement, pauseElement } from './Screens';

/** The title menu, the loading card and the pause menu. */
export default {
  title: 'UI/Screens',
  parameters: { chromatic: { modes: VIEWPORTS } },
} satisfies Meta;

type Story = StoryObj;
// by id, so adding a world to the list does not change which world each story shows
const world = (id: string) => WORLDS.find((w) => w.id === id)!;
const ghibli = world('ghibli'), anderson = world('anderson'), amelie = world('amelie');

const menu = (selected = ghibli, relax = false, mouseLock = true): Story => ({
  render: () => {
    const s = screen({ fullHeight: true });
    s.add(menuElement({ worlds: WORLDS, selected, relax, mouseLock })).classList.add('show');
    return s.box;
  },
});

export const Menu = menu();
export const MenuAndersonRelax = menu(anderson, true, false);

const loading = (def = ghibli, relax = false): Story => ({
  render: () => {
    const s = screen();
    s.add(loadingElement(def, relax));
    return s.box;
  },
});

export const LoadingGhibli = loading(ghibli);
export const LoadingAnderson = loading(anderson);
export const LoadingAmelieRelax = loading(amelie, true);

export const Pause: Story = {
  render: () => {
    const s = screen({ backdrop: true });
    s.add(pauseElement({ title: ghibli.title, hudHidden: false, mouseMode: 'lock', muted: false })).classList.add('show');
    return s.box;
  },
};
