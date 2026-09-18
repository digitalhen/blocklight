import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Start the playground first; optionally pass its URL as the first argument.
const base = process.argv[2] ?? 'http://localhost:4317/';
const directory = new URL('../../docs/images/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(base);
  await page.locator('#data-total').filter({ hasText: 'linked requests' }).waitFor();
  async function settled() {
    await page.waitForFunction(() => window.blocklight.map.loaded() && !window.blocklight.map.isMoving());
    await page.evaluate(() => document.fonts.ready);
  }
  await settled();
  await page.screenshot({ path: fileURLToPath(new URL('nyc-3d.jpg', directory)), type: 'jpeg', quality: 88 });
  await page.locator('#paper').click();
  await page.locator('#dataset-select').selectOption('plumbing');
  await page.locator('#view2d').click();
  await settled();
  const point = await page.evaluate(() => {
    const map = window.blocklight.map;
    for (let y = 180; y < map.getCanvas().clientHeight - 180; y += 8) {
      for (let x = 200; x < map.getCanvas().clientWidth - 400; x += 8) {
        const feature = map.queryRenderedFeatures([x, y], { layers: ['blocklight-layer-buildings-footprints'] })[0];
        if (feature && Number(feature.properties.requests) > 0) return { x, y };
      }
    }
    throw new Error('No building with linked plumbing requests visible.');
  });
  await page.locator('.maplibregl-canvas').click({ position: point });
  await page.locator('#building-info-body').filter({ hasText: 'Roof height' }).waitFor();
  await settled();
  await page.mouse.move(10, 10);
  await page.screenshot({ path: fileURLToPath(new URL('nyc-2d-details.jpg', directory)), type: 'jpeg', quality: 88 });
  console.log('Saved 3D and 2D screenshots in docs/images.');
} finally {
  await browser.close();
}
