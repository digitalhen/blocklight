import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  console.log('Packed package installed, typechecked and built without workspace aliases.');
} finally { await rm(directory, { recursive: true, force: true }); }
