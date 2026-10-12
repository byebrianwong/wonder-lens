import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent } from 'storybook/test';
import { DreamWorld } from '../worlds/dream/DreamWorld';
import { bookImages, emptyBook, halfBook } from '../stories/bookFixtures';
import { screen, VIEWPORTS } from '../stories/screen';
import { BookView, type BookViewData } from './BookView';
import type { PhotoBookData } from './PhotoBook';

/*
 * The saved photo book, as opened from the world menu or from the album after a ride. The data is fixed
 * (see bookFixtures.ts) and the images are passed in, so the stories never touch the browser's storage.
 */
export default {
  title: 'UI/Photo book',
  parameters: { chromatic: { modes: VIEWPORTS } },
} satisfies Meta;

type Story = StoryObj;

function book(make: () => PhotoBookData, o: Partial<BookViewData> & { fullHeight?: boolean } = {}): Story {
  return {
    render: () => {
      const s = screen({ fullHeight: o.fullHeight ?? true });
      const data = make();
      const v = new BookView(s.box, { worldTitle: DreamWorld.title, accent: DreamWorld.accent, book: data, images: bookImages, saving: true, ...o }, {
        onClose: () => {},
        onClear: async () => ({ ...data, entries: {}, stills: {}, requests: [] }),
      });
      s.add(v.root);
      v.root.classList.add('show');
      return s.box;
    },
  };
}

/** Opened from the menu: found subjects, blank cards with hints, one secret found and one still unknown. */
export const FromMenu = book(halfBook);
/** Opened from the album: what this ride added or improved carries a ribbon. */
export const AfterRide = book(halfBook, { fresh: new Map<string, 'new' | 'best'>([['s:totoro', 'best'], ['s:kiki', 'new'], ['f:bus-stop', 'new']]) });
/** The world has been built but nothing photographed yet. */
export const Empty = book(emptyBook);
/** The world has never been ridden on this browser, so the book does not know its subjects. */
export const NeverRidden = book(() => ({ world: 'dream', catalog: null, entries: {}, stills: {}, requests: [] }));
/** Storage failed (a private window): the book says it only lasts for this page. */
export const NotSaving = book(halfBook, { saving: false, fullHeight: false });
export const ClearConfirm: Story = {
  ...book(halfBook, { fullHeight: false }),
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector('[data-act=clear]') as HTMLElement);
    await expect(canvasElement.querySelector('.book-confirm')).toBeVisible();
  },
};
