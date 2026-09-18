import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url).pathname;
const directory = await mkdtemp(join(tmpdir(), 'blocklight-consumer-'));
try {
  execFileSync('npm', ['run', 'build', '-w', 'blocklight'], { cwd: root, stdio: 'inherit' });
  const result = JSON.parse(execFileSync('npm', ['pack', '-w', 'blocklight', '--json', '--pack-destination', directory], { cwd: root, encoding: 'utf8' }));
  const app = join(directory, 'app');
  await cp(join(root, 'playground/examples/datasets'), app, { recursive: true });
  execFileSync('npm', ['install', join(directory, result[0].filename), '--no-audit', '--no-fund'], { cwd: app, stdio: 'inherit' });
  await writeFile(join(app, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'], types: ['vite/client'], skipLibCheck: false, noEmit: true }, include: ['main.ts'] }));
  execFileSync('npx', ['tsc', '--noEmit'], { cwd: app, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: app, stdio: 'inherit' });
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      const file = join(app, 'dist', path === '/' ? 'index.html' : path);
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/json');
      response.end(await readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const errors = []; const workers = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('worker', worker => workers.push(worker.url()));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('status').filter({ hasText: 'Ready' }).waitFor();
    await page.getByRole('combobox', { name: 'Dataset' }).selectOption('plumbing');
    await page.getByRole('button', { name: 'Show 2D' }).click();
    await page.getByRole('button', { name: 'Show 3D' }).waitFor();
    if (!workers.length || errors.length) throw new Error(`Worker/browser check failed: ${errors.join('; ')}`);
    console.log('Packed package installed, typechecked, built, and rendered with its bundled worker.');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
} finally { await rm(directory, { recursive: true, force: true }); }
