import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: [
    { find: 'blocklight/nyc', replacement: fileURLToPath(new URL('../packages/blocklight/src/nyc.ts', import.meta.url)) },
    { find: 'blocklight/react', replacement: fileURLToPath(new URL('../packages/blocklight/src/react.tsx', import.meta.url)) },
    { find: /^blocklight$/, replacement: fileURLToPath(new URL('../packages/blocklight/src/index.ts', import.meta.url)) },
  ] },
  build: { rollupOptions: { input: { basic: fileURLToPath(new URL('./examples/basic/index.html', import.meta.url)), datasets: fileURLToPath(new URL('./examples/datasets/index.html', import.meta.url)), chicago: fileURLToPath(new URL('./examples/chicago/index.html', import.meta.url)), docs: fileURLToPath(new URL('./docs.html', import.meta.url)), main: fileURLToPath(new URL('./index.html', import.meta.url)), react: fileURLToPath(new URL('./react.html', import.meta.url)) } } },
});
