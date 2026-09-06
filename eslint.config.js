import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';

// Flat-config port of the former .eslintrc.cjs. The rule set is unchanged:
// vue3-essential, eslint:recommended, the Vue TypeScript config, and
// skip-formatting last so Prettier keeps ownership of formatting.
export default defineConfigWithVueTs(
  {
    // Build output and local wrangler state, not source. node_modules is
    // ignored by ESLint itself.
    ignores: ['dist/**', 'coverage/**', '.wrangler/**'],
  },
  {
    files: ['**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts,vue}'],
  },
  {
    // scripts/ is the only code here that runs as a node process rather than
    // in a browser or on workerd, so it is the only place these exist. Naming
    // the ones that are used keeps the rest undefined, which is the point of
    // no-undef.
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    // The other test suites are TypeScript, where tsconfig lists vitest/globals
    // and no-undef is off anyway. These are JavaScript, so the globals vitest
    // injects have to be named.
    files: ['scripts/test/**/*.test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        expect: 'readonly',
        test: 'readonly',
      },
    },
  },
  js.configs.recommended,
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  skipFormatting,
);
