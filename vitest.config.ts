import { resolve } from 'path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

const root = resolve(__dirname);

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      root,
      // The frontend and the scripts, which is why `yarn coverage` names those
      // two projects. The worker is left out because nothing can measure it
      // now that it runs on workerd: v8 coverage reads node:inspector, which
      // workerd does not implement and the pool rejects outright, and istanbul
      // was measured to report no worker file at all. scripts/ runs under bare
      // node and is unaffected. `yarn test` still runs all three projects.
      coverage: {
        reporter: ['text', 'json'],
        include: ['src/**/*.{ts,vue}', 'scripts/*.js'],
        // Barrel files. scripts/ has none, so the pattern stays scoped to src/.
        exclude: ['src/**/index.ts'],
      },
      // The frontend, the worker and the scripts share no runtime: a browser
      // bundle built by the vite config above, workerd, and a bare node
      // process. Keeping them as projects of one run means `yarn test` still
      // covers all three.
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
          // config's plugins, and the root and alias it sets both point at the
          // frontend's src/. The one plugin this project does need is named
          // below.
          plugins: [
            // Runs this project on workerd instead of node, with the bindings
            // wrangler.toml declares. env.DB is then the same kind of D1 the
            // deploy gets, so SQL only a mock would accept fails here too.
            //
            // The options are a function so that reading migrations/ is
            // deferred until this project actually runs. Read eagerly, a
            // migrations/ that cannot be read would take down the frontend
            // project as well, which does not use it.
            cloudflareTest(async () => ({
              wrangler: { configPath: resolve(root, 'wrangler.toml') },
              miniflare: {
                // Read here rather than in the tests because migrations/ is on
                // disk and worker code cannot open a file. The setup file
                // applies what this binding carries.
                bindings: { TEST_MIGRATIONS: await readD1Migrations(resolve(root, 'migrations')) },
              },
            })),
          ],
          test: {
            name: 'worker',
            root,
            include: ['worker/test/**/*.test.ts'],
            globals: true,
            setupFiles: ['./worker/test/setup.ts'],
          },
        },
        {
          // Left off for the same reason as the worker's, and the tests are
          // .js because what they exercise is: scripts/ runs under bare node
          // with nothing built first.
          test: {
            name: 'scripts',
            root,
            include: ['scripts/test/**/*.test.js'],
            environment: 'node',
            globals: true,
          },
        },
      ],
    },
  }),
);
