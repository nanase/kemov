import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';

// Flat-config port of the former .eslintrc.cjs. The rule set is unchanged:
// vue3-essential, eslint:recommended, the Vue TypeScript config, and
// skip-formatting last so Prettier keeps ownership of formatting.
export default defineConfigWithVueTs(
  {
    // Replaces ignorePatterns: ['/docs/*']. docs/ is committed build output,
    // not source. node_modules is ignored by ESLint itself.
    ignores: ['docs/**', 'coverage/**'],
  },
  {
    files: ['**/*.{js,jsx,cjs,mjs,ts,tsx,cts,mts,vue}'],
  },
  js.configs.recommended,
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  skipFormatting,
);
