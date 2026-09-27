// Storybook shows the game's menus, HUD and 3D assets one at a time, with fixed data.
// Chromatic takes a screenshot of every story and flags any that changed.
import type { StorybookConfig } from '@storybook/html-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts'],
  framework: { name: '@storybook/html-vite', options: {} },
  core: { disableTelemetry: true },
};

export default config;
