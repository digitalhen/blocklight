import { chromium } from '@playwright/test';
import { stat, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const url = process.env.BLOCKLIGHT_URL ?? 'http://localhost:4317/';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  const start = performance.now();
  await page.goto(url);
  await page.getByRole('status').filter({ hasText: /Local data|Citywide data/ }).waitFor({ timeout: 60000 });
  await page.waitForFunction(() => window.blocklight.map.loaded(), { timeout: 60000 });
  const readyMs = performance.now() - start;
  const initial = await page.evaluate(() => performance.getEntriesByType('resource').map(r => ({ url: r.name, transferSize: r.transferSize, decodedBodySize: r.decodedBodySize })));
  const before = requests.length;
  await page.evaluate(() => window.blocklight.map.jumpTo({ zoom: 11.8 }));
  await page.waitForFunction(() => window.blocklight.map.queryRenderedFeatures({ layers: ['blocklight-layer-buildings-overview'] }).length > 100);
  await page.waitForFunction(() => window.blocklight.map.loaded());
  const result = { environment: 'Local Chrome with software WebGL; unthrottled network, cold browser context. Timing is not a mobile-device claim.', url, readyMs: Math.round(readyMs), initialDecodedMiB: +(initial.reduce((n, r) => n + r.decodedBodySize, 0) / 1024 / 1024).toFixed(2), initialDataMiB: +(initial.filter(r => r.url.includes('/data/')).reduce((n,r) => n+r.decodedBodySize,0)/1024/1024).toFixed(2), eagerOverviewRequests: initial.filter(r => /\/data\/.*overview/.test(r.url)).length, eagerDetailRequests: initial.filter(r => /city\/details/.test(r.url)).length, overviewTileRequests: requests.slice(before).filter(url => url.endsWith('.pbf')).length, full311Bytes: (await stat(new URL('playground/public/data/311-citywide.json',root))).size, compact311Bytes: (await stat(new URL('playground/public/data/311-metrics.json',root))).size };
  await mkdir(new URL('.cache/', root), { recursive: true });
  await writeFile(new URL('.cache/benchmark.json', root), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
