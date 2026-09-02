import { resolve } from 'path';
import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

const root = resolve(__dirname);

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      root,
      include: ['test/**/*.test.ts'],
      globals: true,
      coverage: {
        reporter: ['text', 'json'],
        include: ['src/**/*.{ts,vue}'],
        exclude: ['**/index.ts'],
      },
      server: {
        deps: {
          // @nanase/alnilam/components imports its own stylesheet, and node
          // cannot load .css. Only that entry needs vite to process it, but
          // inline does not match subpaths - '@nanase/alnilam/components'
          // alone was measured not to work - so the package is listed whole.
          inline: ['vuetify', '@nanase/alnilam'],
        },
      },
    },
  }),
);
