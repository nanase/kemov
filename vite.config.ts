import { resolve } from 'path';
import { defineConfig } from 'vite';
import VueMacros from 'unplugin-vue-macros/vite';
import Vue from '@vitejs/plugin-vue';
import webfontDownload from 'vite-plugin-webfont-dl';
import injectHTML from 'vite-plugin-html-inject';

const root = resolve(__dirname);
const srcDir = resolve(root, 'src');

// https://vitejs.dev/config/
export default defineConfig({
  root: srcDir,
  // The site has its own host now rather than a directory of another one, so
  // every asset and every link it writes for itself is rooted here. #70's pull
  // request notes that nanase.cc/kemov/ needs a redirect set up outside this
  // repository, because the old paths are the ones people have.
  base: '/',
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
    injectHTML(),
  ],
  resolve: {
    alias: [{ find: '@', replacement: srcDir }],
  },
  css: {
    devSourcemap: true,
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
  build: {
    outDir: resolve(root, 'dist'),
    rollupOptions: {
      input: {
        stats: resolve(srcDir, 'stats', 'index.html'),
        statsDetail: resolve(srcDir, 'stats', 'detail', 'index.html'),
        statsRanking: resolve(srcDir, 'stats', 'ranking', 'index.html'),
        genetMusic: resolve(srcDir, 'genet', 'music', 'index.html'),
      },
      output: {
        chunkFileNames: 'assets/kemov-[name]-[hash].js',
      },
    },
    emptyOutDir: true,
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
