import '../src/style.css';
import type { Preview } from '@storybook/html-vite';

/**
 * Stories must draw the same picture on every run, but some game code calls Math.random
 * (particles, blinking, camera shake). Before each story, Math.random is replaced with a
 * seeded generator (mulberry32) so those calls return the same numbers every time.
 */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: { disable: true },
  },
  beforeEach() {
    Math.random = seededRandom(20260927);
  },
};

export default preview;
