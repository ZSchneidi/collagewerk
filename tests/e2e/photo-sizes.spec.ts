import { expect, test, type Page } from '@playwright/test';
import { dropAndWait, getState, openEditor, pageNames, slotNames, slotRects, trayNames } from './helpers';

test.beforeEach(({ page }) => openEditor(page));

async function passbildOn10x15(page: Page) {
  await page.click('#preset [data-preset="10x15"]');
  await page.click('#mode-fixed');
}

test('Fixed Photo size: exact Slots, capacity, Templates hidden (rules 1–4, 17)', async ({ page }) => {
  await expect(page.locator('#fixed-opts')).toBeHidden();
  await passbildOn10x15(page);
  await expect(page.locator('#mode-fixed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#templates')).toBeHidden();
  await expect(page.locator('#photo-size [data-size="passbild"]')).toHaveAttribute('aria-checked', 'true');
  const s = await getState(page);
  expect(s).toMatchObject({ mode: 'fixed', gap: 2, slotCount: 6 });
  await expect(page.locator('#count-out')).toHaveText('6 / 6');
  await expect(page.locator('#count')).toHaveAttribute('max', '6');
  await expect(page.locator('#sheet-label')).toContainText('6 × Passbild 35 × 45 mm');
  const r = await slotRects(page);
  const pxPerMm = await page.evaluate(() => (document.getElementById('sheet') as HTMLCanvasElement).clientWidth / 100);
  expect(r[0].w / pxPerMm).toBeCloseTo(35, 1);
  expect(r[0].h / pxPerMm).toBeCloseTo(45, 1);
  await page.locator('#count').fill('3');
  await expect(page.locator('#overlay .slot-ui')).toHaveCount(3);
  // undo returns to free mode in steps
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await getState(page)).mode).toBe('free');
});

test('Capacity shrink moves Photos onto further Pages; nothing fits shows the hint and "Bogen anpassen" (rules 5, 9)', async ({ page }) => {
  await passbildOn10x15(page);
  await page.locator('#same-photo').uncheck({ force: true });
  await dropAndWait(page, ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ name: `${n}.jpg` })), { x: 600, y: 900 });
  await page.locator('#margin').fill('20');
  expect(await pageNames(page)).toEqual([['a.jpg', 'b.jpg'], ['c.jpg', 'd.jpg'], ['e.jpg', 'f.jpg']]);
  expect(await trayNames(page)).toEqual([]);

  await page.click('#photo-size [data-size="13x18"]');
  await expect(page.locator('#fit-hint')).toBeVisible();
  await expect(page.locator('#overlay .slot-ui')).toHaveCount(0);
  await page.click('#fit-sheet');
  await expect(page.locator('#fit-hint')).toBeHidden();
  const s = await getState(page);
  expect(s.sheet.preset).toBe('20x30'); // smallest by area that fits 130 mm + 2 × 20 mm margin
  expect(s.sheet.orientation).toBe('portrait');
  expect(s.slotCount).toBeGreaterThanOrEqual(1);
});

test('Same photo mode: one drop fills all, Crop applies to all, to tray empties all (rules 11–15)', async ({ page }) => {
  await passbildOn10x15(page);
  await expect(page.locator('#same-photo')).toBeChecked();
  await dropAndWait(page, [{ name: 'me.jpg', w: 1500, h: 2000 }, { name: 'extra.jpg' }], { slot: 4 });
  expect(await slotNames(page)).toEqual(Array(6).fill('me.jpg'));
  expect(await trayNames(page)).toEqual(['extra.jpg']);
  const r = await slotRects(page);
  await page.mouse.click(r[2].cx, r[2].cy);
  await page.locator('#zoom').fill('150');
  await page.click('#rot-right');
  const s = await getState(page);
  expect(s.pages[0].slots.every((x) => x!.crop.zoom === 1.5 && x!.crop.rot === 90)).toBe(true);
  await page.keyboard.press('Delete');
  expect(await slotNames(page)).toEqual(Array(6).fill(null));
  expect(await trayNames(page)).toEqual(['extra.jpg', 'me.jpg']);

  // other presets default to individual photos
  await page.click('#photo-size [data-size="us"]');
  await expect(page.locator('#same-photo')).not.toBeChecked();
});

test('Cut marks in export, not over Photos; switchable (rule 16)', async ({ page }) => {
  await passbildOn10x15(page);
  await page.locator('#count').fill('1');
  await dropAndWait(page, [{ name: 'me.jpg', color: '#225588' }], { slot: 0 });
  const probe = () =>
    page.evaluate(async () => {
      const cw = (window as any).__cw;
      const cv: HTMLCanvasElement = await cw.renderOutput(300);
      const g = cv.getContext('2d')!;
      const k = 300 / 25.4;
      const r = cw.state;
      // single Slot centred: x = (100-35)/2 = 32.5, y = (150-45)/2 = 52.5
      const px = (x: number, y: number) => Array.from(g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data);
      return { mark: px(32.5, 52.5 - 2), beside: px(32.5 - 2, 52.5 - 2), photo: px(60, 90), mode: r.mode };
    });
  let p = await probe();
  expect(p.mark[0]).toBeLessThan(200); // grey mark on the extension of the left edge, above the corner
  expect(p.beside).toEqual([255, 255, 255, 255]);
  expect(p.photo[2]).toBeGreaterThan(p.photo[0]); // photo (blue-ish) not covered
  await page.locator('#cut-marks').uncheck({ force: true });
  p = await probe();
  expect(p.mark).toEqual([255, 255, 255, 255]);
});

test('Biometric guide only in the editor for Passbild, can be hidden (rules 18, 19)', async ({ page }) => {
  await passbildOn10x15(page);
  await dropAndWait(page, [{ name: 'me.jpg' }], { slot: 0 });
  const r = await slotRects(page);
  await page.mouse.click(r[0].cx, r[0].cy);
  const guide = page.locator('[data-slot="0"] .bio-guide');
  await expect(guide).toBeVisible();
  await expect(guide).toHaveAttribute('title', /keine amtliche Prüfung/);
  await expect(guide.locator('b')).toHaveText(['Scheitel', 'Augen', 'Kinn']);
  await page.evaluate(() => (window as any).__cw.preparePrint());
  await expect(page.locator('#print-root .bio-guide')).toHaveCount(0);
  await page.locator('#guide-toggle').uncheck({ force: true });
  await expect(guide).toHaveCount(0);
  await page.locator('#guide-toggle').check({ force: true });
  await page.click('#photo-size [data-size="bewerbung"]');
  await page.mouse.click(r[0].cx, r[0].cy);
  await expect(page.locator('.bio-guide')).toHaveCount(0);
  await expect(page.locator('#guide-row')).toBeHidden();
});

test('Passbild tooltip mentions digital ID photos (rule 10)', async ({ page }) => {
  await page.click('#mode-fixed');
  await expect(page.locator('#photo-size [data-size="passbild"]')).toHaveAttribute('title', /digitales Foto/);
});

test('Fixed-mode settings survive reload (rule 20)', async ({ page }) => {
  await passbildOn10x15(page);
  await page.click('#ps-landscape');
  await page.locator('#cut-marks').uncheck({ force: true });
  const before = await getState(page);
  await page.evaluate(() => (window as any).__cw.flushSave());
  await page.reload();
  await page.evaluate(() => (window as any).__cw.ready);
  expect(await getState(page)).toEqual(before);
  await expect(page.locator('#ps-landscape')).toHaveAttribute('aria-pressed', 'true');
});
