import { chromium, expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('Chrome build loads as an extension and serves the editor (rules 1, 2)', async () => {
  const ext = resolve('dist/chrome');
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'cw-')), {
    channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const id = new URL(sw.url()).host;
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/editor.html`);
    await page.evaluate(() => (window as any).__cw.ready);
    await expect(page.locator('#overlay .slot-ui')).toHaveCount(4);
    // the editor registers its tab so the toolbar button focuses it instead of opening another
    await expect.poll(() => sw.evaluate(async () => (await chrome.storage.session.get('editorTab')).editorTab)).toEqual(expect.any(Number));
  } finally {
    await ctx.close();
  }
});

test('Firefox manifest uses background scripts and a gecko id (rule 1)', () => {
  const m = JSON.parse(readFileSync('dist/firefox/manifest.json', 'utf8'));
  expect(m.manifest_version).toBe(3);
  expect(m.background).toEqual({ scripts: ['background.js'] });
  expect(m.browser_specific_settings.gecko.id).toBe('collagewerk@zschneidi');
  const c = JSON.parse(readFileSync('dist/chrome/manifest.json', 'utf8'));
  expect(c.background).toEqual({ service_worker: 'background.js' });
});
