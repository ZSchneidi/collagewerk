import { expect, test } from '@playwright/test';
import { dropAndWait, getState, openEditor, slotNames, slotRects, trayNames } from './helpers';

const external: string[] = [];
test.beforeEach(async ({ page }) => {
  page.on('request', (r) => {
    if (!/^(http:\/\/localhost|data:|blob:)/.test(r.url())) external.push(r.url());
  });
  await openEditor(page);
});

test('Theme: system default, toggle overrides and is remembered (rules 1, 2)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  await page.click('#theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await bg()).not.toBe(light);
  await page.reload();
  await page.evaluate(() => (window as any).__cw.ready);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.click('#theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('Top bar order and icons with shortcut tooltips (rules 4, 9)', async ({ page }) => {
  const ids = await page.locator('#topbar button').evaluateAll((bs) => bs.map((b) => b.id));
  expect(ids).toEqual(['undo', 'redo', 'open-file', 'save-file', 'theme', 'export-png', 'export-pdf', 'print', 'print-info']);
  for (const id of ids) await expect(page.locator(`#${id} svg.ico`)).toHaveCount(1);
  await expect(page.locator('#undo')).toHaveAttribute('title', 'Rückgängig (Strg+Z)');
  await page.hover('#print-info');
  await expect(page.locator('#print-hint')).toHaveCSS('opacity', '1');
});

test('Cards collapse and remember it; preset chips and orientation segments (rules 5, 11)', async ({ page }) => {
  await page.click('#card-layout summary');
  await expect(page.locator('#count')).toBeHidden();
  // the 'toggle' event (which stores the state) fires asynchronously – wait for it before reloading
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cw.card.card-layout'))).toBe('closed');
  await page.reload();
  await page.evaluate(() => (window as any).__cw.ready);
  await expect(page.locator('#count')).toBeHidden();
  await page.click('#card-layout summary');
  await expect(page.locator('#count')).toBeVisible();

  await expect(page.locator('#preset button')).toHaveText(['A4', 'A5', 'A3', 'Letter', '10 × 15 cm', '13 × 18 cm', '20 × 30 cm', 'Eigene']);
  await page.click('#preset [data-preset="A3"]');
  await expect(page.locator('#preset [data-preset="A3"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#preset [data-preset="A4"]')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#sheet-label')).toHaveText('A3 · 297 × 420 mm');
  await page.click('#orient-landscape');
  await expect(page.locator('#sheet-label')).toHaveText('A3 · 420 × 297 mm');
});

test('Welcome card while empty; dropping on it fills in order; returns when empty (rules 21, 22)', async ({ page }) => {
  const welcome = page.locator('#welcome');
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText('JPG · PNG · WebP · GIF');
  const b = (await welcome.boundingBox())!;
  await dropAndWait(page, [{ name: 'a.jpg' }, { name: 'b.jpg' }], { x: b.x + b.width / 2, y: b.y + 20 });
  expect(await slotNames(page)).toEqual(['a.jpg', 'b.jpg', null, null]);
  await expect(welcome).toBeHidden();
  await page.keyboard.press('Control+z');
  await expect(welcome).toBeVisible();
});

test('Clicking an empty Slot opens the picker for that Slot (rule 14)', async ({ page }) => {
  await dropAndWait(page, [{ name: 'a.jpg' }], { slot: 0 });
  const r = (await slotRects(page))[3];
  // headless Chromium occasionally drops a file chooser under heavy parallel load; retry the click
  let chooser: Promise<import('@playwright/test').FileChooser> | null = null;
  for (let attempt = 0; attempt < 3 && !chooser; attempt++) {
    const wait = page.waitForEvent('filechooser', { timeout: 4000 });
    await page.mouse.click(r.cx, r.cy);
    chooser = await wait.then((c) => Promise.resolve(c), () => null) as any;
  }
  expect(chooser).not.toBeNull();
  const buf = await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = 600;
    cv.height = 400;
    cv.getContext('2d')!.fillRect(0, 0, 600, 400);
    const b: Blob = await new Promise((res) => cv.toBlob((x) => res(x!), 'image/jpeg'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await (await chooser!).setFiles({ name: 'picked.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buf) });
  await expect.poll(() => slotNames(page)).toEqual(['a.jpg', null, null, 'picked.jpg']);
});

test('Slot toolbar on hover; Crop panel slides in/out; tray badge (rules 6, 7, 15, 16)', async ({ page }) => {
  await dropAndWait(page, ['a', 'b', 'c', 'd'].map((n) => ({ name: `${n}.jpg` })), { slot: 0 });
  await expect(page.locator('#tray-count')).toHaveText('0');
  const r = (await slotRects(page))[1];
  await page.mouse.move(r.cx, r.cy);
  const tools = page.locator('[data-slot="1"] .slot-tools button');
  await expect(tools).toHaveCount(4);
  await tools.nth(1).click(); // rotate right
  expect((await getState(page)).pages[0].slots[1]!.crop.rot).toBe(90);
  expect(await page.evaluate(() => (window as any).__cw.selected)).toBe(1);
  await expect(page.locator('#crop-panel')).toBeVisible();
  await expect(page.locator('[data-slot="1"]')).toHaveClass(/selected/);
  await page.mouse.move(r.cx, r.cy + 1);
  await page.locator('[data-slot="1"] .slot-tools button').nth(3).click(); // to tray
  expect(await trayNames(page)).toEqual(['b.jpg']);
  await expect(page.locator('#tray-count')).toHaveText('1');
  await page.keyboard.press('Escape');
  await expect(page.locator('#crop-panel')).toBeHidden();
});

test('Slots animate on layout change, not with reduced motion (rules 17, 20)', async ({ page }) => {
  const firstLeft = () => page.locator('[data-slot="0"]').evaluate((e) => parseFloat((e as HTMLElement).style.width));
  const final = async () => (await slotRects(page))[0].w;
  const animating = () => page.evaluate(() => (window as any).__cw.animating);
  const started = () => page.evaluate(() => (window as any).__cw.animationsStarted);
  const n0 = await started();
  await page.locator('#count').fill('2');
  expect(await started()).toBe(n0 + 1);
  await expect.poll(async () => Math.abs((await firstLeft()) - (await final()))).toBeLessThan(0.5);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.evaluate(() => (window as any).__cw.ready);
  const n1 = await started();
  await page.locator('#count').fill('3');
  expect(await started()).toBe(n1);
  expect(await animating()).toBe(false);
  expect(Math.abs((await firstLeft()) - (await final()))).toBeLessThan(0.5);
});

test('Bundled font and no external requests (rule 12)', async ({ page }) => {
  await expect.poll(() => page.evaluate(() => document.fonts.check('14px Inter'))).toBe(true);
  await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Inter' && f.status === 'loaded'))).toBe(true);
  expect(external).toEqual([]);
});
