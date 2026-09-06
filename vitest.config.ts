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
      coverage: {
        reporter: ['text', 'json'],
        include: ['src/**/*.{ts,vue}', 'worker/src/**/*.ts'],
        // Barrel files in the frontend. The worker's index.ts files hold real
        // code, so the pattern stays scoped to src/.
        exclude: ['src/**/index.ts'],
      },
      // The frontend and the worker share no runtime: one is a browser bundle
      // built by the vite config above, the other runs on workerd. Keeping them
      // as two projects of one run means `yarn test` still covers both.
      projects: [
        {
          extends: true,
          test: {
            name: 'frontend',
            root,
            include: ['test/**/*.test.ts'],
            globals: true,
            server: {
              deps: {
                // @nanase/alnilam/components imports its own stylesheet, and
                // node cannot load .css. Only that entry needs vite to process
                // it, but inline does not match subpaths - '@nanase/alnilam/components'
                // alone was measured not to work - so the package is listed whole.
                inline: ['vuetify', '@nanase/alnilam'],
              },
            },
          },
        },
        {
          // extends is left off on purpose: the worker needs none of the vite
          // plugins, and the root and alias the vite config sets both point at
          // the frontend's src/.
          test: {
            name: 'worker',
            root,
            include: ['worker/test/**/*.test.ts'],
            environment: 'node',
            globals: true,
          },
        },
      ],
    },
  }),
);
