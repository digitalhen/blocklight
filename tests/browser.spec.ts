import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import type { CityMap } from '../packages/blocklight/src/map.js';
declare global { interface Window { blocklight: CityMap } }
const citywidePath = new URL('../playground/public/data/311-citywide.json', import.meta.url).pathname;
const cityReady = existsSync(new URL('../playground/public/data/city.json', import.meta.url));
const datasetName = cityReady ? '311-citywide.json' : '311-buildings.json';
const datasetPath = cityReady ? citywidePath : new URL('../playground/public/data/311-buildings.json', import.meta.url).pathname;
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
test('building-linked 311, click details, combined camera transitions, themes and teardown', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText(/Local data|Citywide data/, { timeout: 30000 });
  await expect(page.locator('#data-total')).toHaveText(`${dataset.summary.matchedRequests.toLocaleString()} linked requests`);
  expect(await page.evaluate(() => window.blocklight.map.getPitch())).toBe(57);
  await page.locator('#view2d').click();
  await expect.poll(() => page.evaluate(() => Math.round(window.blocklight.map.getPitch()))).toBe(0);
  await page.waitForFunction(() => window.blocklight.map.loaded());
  await expect(page.locator('#buildings')).toBeChecked();
  expect(await page.evaluate(() => window.blocklight.map.queryRenderedFeatures({ layers: ['blocklight-layer-footprints'] }).length)).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-results/311-desktop.png' });
  const hit = await page.evaluate(() => {
    const map = window.blocklight.map;
    for (let y = 100; y < map.getCanvas().clientHeight - 100; y += 9) for (let x = 30; x < map.getCanvas().clientWidth - 350; x += 9) {
      const feature = map.queryRenderedFeatures([x, y], { layers: ['blocklight-layer-footprints'] })[0];
      if (feature && Number(feature.properties.requests) > 0) return { x, y, count: Number(feature.properties.requests), id: feature.id };
    }
    throw new Error('No building with linked requests rendered');
  });
  const box = await page.locator('#map').boundingBox();
  await page.mouse.click(box!.x + hit.x, box!.y + hit.y);
  await expect(page.locator('#building-info')).toBeVisible();
  await expect(page.locator('.building-request-count')).toHaveText(hit.count.toLocaleString());
  await expect(page.locator('#building-info')).toContainText('All housing categories');
  await expect(page.locator('#building-info')).toContainText('All housing requests · matching');
  await page.screenshot({ path: 'test-results/311-building-details.png' });
  const selectedTitle = await page.locator('#building-info-title').textContent();
  await page.locator('#view3d').click();
  await expect.poll(() => page.evaluate(() => Math.round(window.blocklight.map.getPitch()))).toBe(57);
  await expect.poll(() => page.evaluate(() => Math.round(window.blocklight.map.getBearing()))).toBe(-28);
  await expect(page.locator('#building-info')).toBeVisible();
  await expect(page.locator('#building-info-title')).toHaveText(selectedTitle!);
  await expect(page.locator('.building-request-count')).toHaveText(hit.count.toLocaleString());
  expect(await page.evaluate(id => window.blocklight.map.getFeatureState({ source: 'blocklight-source-buildings', id: id! }).selected, hit.id)).toBe(true);
  await page.locator('#dataset-select').selectOption('heat');
  await expect(page.locator('#building-info-title')).toHaveText(selectedTitle!);
  await expect(page.locator('#building-info-body')).toContainText('Heating / hot water');
  expect(await page.evaluate(() => Math.round(window.blocklight.map.getPitch()))).toBe(57);
  const heatRecord = dataset.buildings.find((r: { buildingId: string }) => r.buildingId === String(hit.id));
  await expect(page.locator('.building-request-count')).toHaveText((heatRecord?.categories['HEAT/HOT WATER'] ?? 0).toLocaleString());
  await page.screenshot({ path: 'test-results/311-3d-details.png' });
  await page.evaluate(() => window.blocklight.map.jumpTo({ zoom: 11.8 }));
  await expect(page.getByRole('status')).toContainText('Overview');
  await expect.poll(() => page.evaluate(() => window.blocklight.map.queryRenderedFeatures({ layers: ['blocklight-layer-building-dots'] }).length)).toBeGreaterThan(100);
  expect(await page.evaluate(() => window.blocklight.map.queryRenderedFeatures({ layers: ['blocklight-layer-buildings'] }).length)).toBe(0);
  await expect(page.locator('#building-info-title')).toHaveText(selectedTitle!);
  expect(await page.evaluate(id => window.blocklight.map.getFeatureState({ source: 'blocklight-source-building-dots', id: id! }).selected, hit.id)).toBe(true);
  await page.locator('#dataset-select').selectOption('plumbing');
  await expect(page.locator('#building-info-title')).toHaveText(selectedTitle!);
  await page.screenshot({ path: 'test-results/building-dots-overview.png' });
  await page.evaluate(() => window.blocklight.map.jumpTo({ zoom: 14.8 }));
  await expect.poll(() => page.evaluate(() => window.blocklight.map.queryRenderedFeatures({ layers: ['blocklight-layer-buildings'] }).length)).toBeGreaterThan(100);
  await expect(page.locator('#building-info-title')).toHaveText(selectedTitle!);
  await page.locator('#dataset-select').selectOption('housing');
  await expect(page.locator('.building-request-count')).toHaveText(hit.count.toLocaleString());
  await page.locator('#view2d').click();
  await expect.poll(() => page.evaluate(() => Math.round(window.blocklight.map.getPitch()))).toBe(0);
  await expect(page.locator('#building-info-title')).toHaveText(selectedTitle!);
  expect(await page.evaluate(id => window.blocklight.map.getFeatureState({ source: 'blocklight-source-footprints', id: id! }).selected, hit.id)).toBe(true);
  await page.getByRole('button', { name: 'Close building details' }).click();
  await expect(page.locator('#building-info')).toBeHidden();
  await expect(page.locator('#data-legend')).toBeVisible();
  await page.locator('#view3d').click();
  await expect.poll(() => page.evaluate(() => Math.round(window.blocklight.map.getPitch()))).toBe(57);
  expect(await page.evaluate(() => JSON.stringify(window.blocklight.map.getPaintProperty('blocklight-layer-buildings', 'fill-extrusion-color')))).toContain('requests');
  await page.screenshot({ path: 'test-results/311-3d.png' });
  await expect(page.locator('#code')).toContainText('/data/311-citywide.json');
  await expect(page.locator('#code')).toContainText("record: 'buildingId'");
  await expect(page.locator('#example-city')).toHaveCount(0);
  await page.locator('#paper').click();
  expect(await page.evaluate(() => window.blocklight.map.getStyle().name)).toBe('blocklight');
  expect(await page.evaluate(() => window.blocklight.map.getPaintProperty('blocklight-background', 'background-color'))).toBe('#dfe4ed');
  await page.screenshot({ path: 'test-results/city-paper.png' });
  await page.locator('#buildings').uncheck();
  expect(await page.evaluate(() => window.blocklight.map.getLayoutProperty('blocklight-layer-buildings', 'visibility'))).toBe('none');
  await page.evaluate(() => { const map = window.blocklight; map.setData('places', { type: 'FeatureCollection', features: [] }); map.removeLayer('places'); map.destroy(); map.destroy(); });
  expect(errors).toEqual([]);
});
test('JSON can be downloaded and loaded; invalid files leave the current dataset intact', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText(/Local data|Citywide data/, { timeout: 30000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download JSON' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(datasetName);
  await page.locator('#json-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":9}') });
  await expect(page.locator('#json-error')).toContainText('Invalid building JSON');
  await expect(page.locator('#data-total')).toHaveText(`${dataset.summary.matchedRequests.toLocaleString()} linked requests`);
  await page.locator('#json-file').setInputFiles(datasetPath);
  await expect(page.getByRole('status')).toHaveText(`Loaded ${datasetName}`);
  await expect(page.locator('#json-error')).toBeHidden();
});
test('React Strict Mode supports changing theme, unmounting and remounting', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/react.html');
  await expect(page.getByRole('status')).toHaveText('Ready · React Strict Mode');
  await page.getByRole('button', { name: 'Switch theme' }).click();
  await page.getByRole('button', { name: 'Unmount map' }).click();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mount map' }).click();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveText('Ready · React Strict Mode');
  expect(errors).toEqual([]);
});
test('mobile view has no horizontal overflow and 3D really tilts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText(/Local data|Citywide data/, { timeout: 30000 });
  await expect(page.locator('#data-legend')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/311-mobile.png', fullPage: true });
  await page.locator('#view3d').click();
  await expect.poll(() => page.evaluate(() => Math.round(window.blocklight.map.getPitch()))).toBe(57);
});

test('citywide footprints load in all five boroughs while opening in Midtown', async ({ page }) => {
  test.skip(!cityReady, 'Build citywide assets with npm run data:city.');
  test.setTimeout(120000);
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText(/Local data|Citywide data/, { timeout: 30000 });
  const opening = await page.evaluate(() => window.blocklight.map.getCenter());
  expect(opening.lng).toBeCloseTo(-73.9815, 3); expect(opening.lat).toBeCloseTo(40.7548, 3);
  await page.locator('#view2d').click();
  await expect.poll(() => page.evaluate(() => Math.round(window.blocklight.map.getPitch()))).toBe(0);
  for (const [prefix, lng, lat] of [['1', -73.9815, 40.7548], ['2', -73.918, 40.844], ['3', -73.944, 40.678], ['4', -73.83, 40.71], ['5', -74.115, 40.58]] as const) {
    await page.evaluate(({ lng, lat }) => window.blocklight.map.jumpTo({ center: [lng, lat], zoom: 15, pitch: 0, bearing: 0 }), { lng, lat });
    await page.waitForFunction(prefix => window.blocklight.map.queryRenderedFeatures({ layers: ['blocklight-layer-footprints'] }).some(f => String(f.properties.bin).startsWith(prefix)), prefix, { timeout: 30000 });
  }
});

test('documentation is linked and explains dataset switching', async ({ page }) => {
 await page.goto('/docs.html');
 await expect(page.getByRole('heading', { name: 'Multiple datasets and color schemes' })).toBeVisible();
 await expect(page.locator('main')).toContainText('layer.setDataset');
});
