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
          // alnilam's dist imports dayjs subpaths without a file extension,
          // which node's ESM resolver rejects. Letting vite process it
          // resolves those the same way the app build does.
          inline: ['vuetify', '@nanase/alnilam'],
        },
      },
    },
  }),
);
