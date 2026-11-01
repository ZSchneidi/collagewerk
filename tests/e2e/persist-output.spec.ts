import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dropAndWait, getState, openEditor, pageNames, slotNames, slotRects, trayNames } from './helpers';

test.beforeEach(({ page }) => openEditor(page));

async function setup(page: import('@playwright/test').Page) {
  await page.locator('#count').fill('3');
  await page.click('#preset [data-preset="13x18"]');
  await dropAndWait(page, ['a', 'b', 'c', 'd'].map((n) => ({ name: `${n}.jpg` })), { x: 600, y: 900 });
  const r = (await slotRects(page))[1];
  await page.mouse.click(r.cx, r.cy);
  await page.locator('#zoom').fill('180');
  await page.click('#mirror');
}

/** colour at the centre of slot i on the visible canvas */
const isRed = (px: number[]) => px[0] > 180 && px[1] < 80 && px[2] < 80 && px[3] === 255;
const centrePixel = (page: import('@playwright/test').Page, i: number) =>
  page.evaluate((i) => {
    const cv = document.getElementById('sheet') as HTMLCanvasElement;
    const r = (window as any).__cw.slotRectsPx()[i];
    const k = cv.width / cv.clientWidth;
    return Array.from(cv.getContext('2d')!.getImageData(Math.round((r.x + r.w * 0.75) * k), Math.round((r.y + r.h * 0.75) * k), 1, 1).data);
  }, i);

test('Autosave restores the Collage after reload (rule 27)', async ({ page }) => {
  await setup(page);
  const before = await getState(page);
  await page.evaluate(() => (window as any).__cw.flushSave());
  await page.reload();
  await page.evaluate(() => (window as any).__cw.ready);
  expect(await getState(page)).toEqual(before);
  await expect(page.locator('#page-thumbs .page-thumb')).toHaveCount(2);
  // the Photo pixels are back too (red quadrant of the generated image)
  await expect.poll(async () => isRed(await centrePixel(page, 0))).toBe(true);
});

test('Save and open a collage file (rule 28)', async ({ page, browser }) => {
  await setup(page);
  const before = await getState(page);
  const dl = page.waitForEvent('download');
  await page.click('#save-file');
  const file = await (await dl).path();
  expect((await dl).suggestedFilename()).toMatch(/\.collagewerk$/);

  const fresh = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  await openEditor(fresh);
  const chooser = fresh.waitForEvent('filechooser');
  await fresh.click('#open-file');
  await (await chooser).setFiles(file);
  await expect.poll(async () => (await getState(fresh)).slotCount).toBe(3);
  expect(await getState(fresh)).toEqual(before);
  expect(await pageNames(fresh)).toEqual([['a.jpg', 'b.jpg', 'c.jpg'], ['d.jpg']]);
  expect(await trayNames(fresh)).toEqual([]);
  await expect.poll(async () => isRed(await centrePixel(fresh, 0))).toBe(true);

  // garbage file → message, nothing changes
  const ch2 = fresh.waitForEvent('filechooser');
  await fresh.click('#open-file');
  await (await ch2).setFiles({ name: 'x.collagewerk', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
  await expect(fresh.locator('#toast')).toContainText('Keine gültige CollageWerk-Datei');
});

test('Print prepares a 1:1 page with zero margins and the hint (rule 29)', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#print-hint')).toContainText('Ränder: Keine');
  await expect(page.locator('#print-hint')).toContainText('Skalierung: 100 %');
  await page.evaluate(() => ((window as any).print = () => ((window as any).__printed = true)));
  await page.click('#print');
  await expect(page.locator('#print-card')).toBeVisible();
  await expect(page.locator('#pc-paper')).toHaveText('13 × 18 cm – 130 × 180 mm');
  await page.click('#pc-print');
  await expect.poll(() => page.evaluate(() => (window as any).__printed)).toBe(true);
  const style = await page.locator('#page-style').textContent();
  expect(style).toContain('@page { size: 130mm 180mm; margin: 0; }');
  await expect(page.locator('#print-root img')).toHaveCount(2); // one per Page (pages rule 11)
  expect(style).toContain('break-after: page');
  const img = page.locator('#print-root img').first();
  await expect(img).toHaveCSS('width', /px$/);
  const st = await img.evaluate((e: HTMLImageElement) => ({ w: e.style.width, h: e.style.height, nw: e.naturalWidth, nh: e.naturalHeight }));
  expect(st).toEqual({ w: '130mm', h: '180mm', nw: 1535, nh: 2126 });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#app')).toBeHidden();
  await expect(img).toBeVisible();
});

test('PNG export renders at 300 dpi (rule 30)', async ({ page }) => {
  await page.click('#preset [data-preset="A4"]');
  await dropAndWait(page, [{ name: 'a.jpg' }], { slot: 0 });
  const dl = page.waitForEvent('download');
  await page.click('#export-png');
  const buf = readFileSync(await (await dl).path());
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([2480, 3508]);
});
