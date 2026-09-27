import { rideBackdrop } from './fixtures';

/** The window sizes Chromatic snapshots the overlay screens at: a laptop and a phone. */
export const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 } },
};

/**
 * A window-sized box that stands in for the game's #ui layer, so the overlay screens
 * (which are positioned to fill #ui) lay out the same way they do in the game.
 * `backdrop` puts a still frame of the ride behind them.
 * `fullHeight` lets a scrolling screen (menu, album) grow to its full length, so the
 * snapshot shows all of it instead of the first window's worth.
 */
export function screen(o: { backdrop?: boolean; fullHeight?: boolean } = {}) {
  const box = document.createElement('div');
  box.style.cssText = `position: relative; width: 100vw; overflow: hidden; background: #0b0e14; ${o.fullHeight ? 'min-height: 100vh;' : 'height: 100vh;'}`;
  if (o.backdrop) {
    const img = document.createElement('img');
    img.src = rideBackdrop;
    img.alt = '';
    img.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;';
    box.appendChild(img);
  }
  return {
    box,
    /** Add a screen element. With fullHeight, it stops scrolling inside itself and takes its natural height. */
    add(el: HTMLElement) {
      if (o.fullHeight) { el.style.position = 'relative'; el.style.overflow = 'visible'; el.style.minHeight = '100vh'; }
      box.appendChild(el);
      return el;
    },
  };
}

/** Show everything the game fades in on the next animation frame, straight away. */
export function showAll(root: HTMLElement) {
  root.classList.add('show');
  root.querySelectorAll('.card, .toast, .caption, .subject-tag, .center-msg').forEach((e) => {
    if (e.textContent || e.children.length) e.classList.add('show');
  });
}
