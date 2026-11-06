import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, 'web');
const pages = Object.fromEntries(
  readdirSync(root)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), resolve(root, f)]),
);

export default defineConfig({
  root,
  publicDir: resolve(import.meta.dirname, 'public'),
  resolve: { alias: { '@shared': resolve(import.meta.dirname, 'shared') } },
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: pages },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '/media': 'http://127.0.0.1:8787' } },
});
