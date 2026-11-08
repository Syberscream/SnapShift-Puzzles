// Build for the game-portal edition (see docs/game-portals.md). Run with: npm run build:portal
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'portal'),
  base: './',
  publicDir: resolve(import.meta.dirname, 'portal/public'),
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'shared'), '@web': resolve(import.meta.dirname, 'web/src') } },
  build: {
    outDir: resolve(import.meta.dirname, 'dist-portal/app'),
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
