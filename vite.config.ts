import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const root = resolve(__dirname, 'src');
const outDir = resolve(__dirname, 'docs');

// https://vitejs.dev/config/
export default defineConfig({
  root,
  base: '/kemov/',
  publicDir: '../public',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    devSourcemap: true,
  },
  build: {
    outDir,
    rollupOptions: {
      input: {
        stats: resolve(root, 'stats', 'index.html'),
        // genetMusic: resolve(root, 'genet', 'music', 'index.html'),
      },
    },
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
