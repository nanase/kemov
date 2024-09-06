/// <reference types="vitest" />
import { resolve } from 'path';
import { defineConfig } from 'vite';
import VueMacros from 'unplugin-vue-macros/vite';
import Vue from '@vitejs/plugin-vue';
import webfontDownload from 'vite-plugin-webfont-dl';

const root = resolve(__dirname);
const srcDir = resolve(root, 'src');

// https://vitejs.dev/config/
export default defineConfig({
  root: srcDir,
  base: '/kemov/',
  publicDir: resolve(root, 'public'),
  envDir: root,
  plugins: [
    VueMacros({
      plugins: {
        vue: Vue({
          script: {
            defineModel: true,
          },
          features: {
            propsDestructure: true,
          },
        }),
      },
    }),
    webfontDownload(),
  ],
  resolve: {
    alias: [{ find: '@', replacement: srcDir }],
  },
  css: {
    devSourcemap: true,
  },
  build: {
    outDir: resolve(root, 'docs'),
    rollupOptions: {
      input: {
        stats: resolve(srcDir, 'stats', 'index.html'),
        statsDetail: resolve(srcDir, 'stats', 'detail', 'index.html'),
        genetMusic: resolve(srcDir, 'genet', 'music', 'index.html'),
      },
      output: {
        chunkFileNames: 'assets/kemov-[name]-[hash].js',
      },
    },
    emptyOutDir: true,
  },
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
        inline: ['vuetify'],
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
