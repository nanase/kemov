import { resolve } from 'path';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import VueMacros from 'unplugin-vue-macros/vite';
import Vue from '@vitejs/plugin-vue';
import webfontDownload from 'vite-plugin-webfont-dl';
import injectHTML from 'vite-plugin-html-inject';

const root = resolve(import.meta.dirname);
const srcDir = resolve(root, 'src');

/**
 * Where the dev server forwards its own /api, when it is told to.
 *
 * Read here rather than inside a config function because vitest.config.ts
 * merges this object, and merging a function is not something it does.
 * Development's env files are the only ones that can carry it: a build has no
 * server to proxy with.
 */
const apiProxy = loadEnv('development', root, '').VITE_API_PROXY;

/**
 * Serves the member page at `/members/<channel id>` while developing.
 *
 * The deployment has a worker for this: no built file answers that path, so
 * the request reaches `worker/src/pages/index.ts`, which serves `/members/`
 * with the member's name written into its title (#137). The dev server has no
 * worker in front of it, so without this a member's own address is a 404 here
 * and only here - which is exactly the address every link on the page uses.
 */
const memberPages: PluginOption = {
  name: 'kemov-member-pages',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const url = request.url;
      const match = url === undefined ? null : /^\/members\/[\w-]+(?=$|\?)/.exec(url);

      if (match !== null && url !== undefined) request.url = `/members/${url.slice(match[0].length)}`;

      next();
    });
  },
};

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
    memberPages,
    injectHTML(),
  ],
  resolve: {
    // v3-infinite-loading's `browser` field points at a UMD build that
    // expects a global `Vue`. Vite 8's bundler picks that field over `module`
    // by default and the page it drives renders empty as a result, with
    // nothing thrown: `module` ahead of `browser` restores the ES build vite
    // 6 always used.
    mainFields: ['module', 'browser', 'main'],
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
        members: resolve(srcDir, 'members', 'index.html'),
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
    // VITE_API_PROXY sends this server's own /api to whatever answers it -
    // the deployment, or a wrangler dev on another port. The pages keep
    // asking their own origin, which is the only way a browser will read the
    // answer: the API sets no Access-Control-Allow-Origin, so pointing the
    // pages straight at another host with VITE_API_BASE has the browser
    // refuse every response before the page sees it.
    proxy: apiProxy ? { '/api': { target: apiProxy, changeOrigin: true } } : undefined,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
