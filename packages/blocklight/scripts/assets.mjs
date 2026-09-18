import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { copyFile } from 'node:fs/promises';
await build({ entryPoints: [fileURLToPath(import.meta.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs'))], bundle: true, format: 'esm', minify: true, outfile: new URL('../src/worker.js', import.meta.url).pathname });
await copyFile(new URL('../src/worker.js', import.meta.url), new URL('../dist/worker.js', import.meta.url));
await copyFile(new URL('../src/style.css', import.meta.url), new URL('../dist/style.css', import.meta.url));
