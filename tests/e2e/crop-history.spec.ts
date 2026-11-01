import { expect, test, type Page } from '@playwright/test';
import { dropAndWait, getState, openEditor, slotNames, slotRects, trayNames } from './helpers';

test.beforeEach(({ page }) => openEditor(page));

const crop0 = async (page: Page, i = 0) => (await getState(page)).pages[0].slots[i]!.crop;

async function selectSlot(page: Page, i: number) {
  const r = (await slotRects(page))[i];
  await page.mouse.click(r.cx, r.cy);
  expect(await page.evaluate(() => (window as any).__cw.selected)).toBe(i);
  await expect(page.locator('#crop-panel')).toBeVisible();
}

test('Select, wheel zoom, pan, nudge, reset, rotate, mirror (rules 19–22)', async ({ page }) => {
  await dropAndWait(page, [{ name: 'a.jpg', w: 3000, h: 2000 }], { slot: 0 });
  await selectSlot(page, 0);
  const r = (await slotRects(page))[0];
  await page.mouse.move(r.cx, r.cy);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await crop0(page)).zoom).toBeGreaterThan(1.3);
  // zoom slider capped at 500 %
  await page.locator('#zoom').fill('500');
  expect((await crop0(page)).zoom).toBe(5);
  await page.locator('#zoom').fill('200');
  expect((await crop0(page)).zoom).toBe(2);

  // drag pans (selected Slot) – clamped at the edge
  const fx0 = (await crop0(page)).fx;
  await page.mouse.move(r.cx, r.cy);
  await page.mouse.down();
  await page.mouse.move(r.cx + 2000, r.cy, { steps: 5 });
  await page.mouse.up();
  const c1 = await crop0(page);
  expect(c1.fx).toBeLessThan(fx0);
  expect(await slotNames(page)).toEqual(['a.jpg', null, null, null]); // panning did not move the Photo

  await page.keyboard.press('ArrowRight');
  expect((await crop0(page)).fx).toBeCloseTo(c1.fx, 6); // left edge already showing → clamped
  await page.keyboard.press('Shift+ArrowLeft');
  expect((await crop0(page)).fx).toBeGreaterThan(c1.fx);

  await page.click('#rot-right');
  expect((await crop0(page)).rot).toBe(90);
  await page.click('#mirror');
  expect((await crop0(page)).mirror).toBe(true);

  await page.mouse.dblclick(r.cx, r.cy);
  expect(await crop0(page)).toEqual({ zoom: 1, rot: 0, mirror: false, fx: 0.5, fy: 0.5 });

  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as any).__cw.selected)).toBe(null);
  await expect(page.locator('#crop-panel')).toBeHidden();

  await selectSlot(page, 0);
  await page.keyboard.press('Delete');
  expect(await slotNames(page)).toEqual([null, null, null, null]);
  expect(await trayNames(page)).toEqual(['a.jpg']);
});

test('Crop travels with the Photo into a differently shaped Slot (rule 23)', async ({ page }) => {
  await page.locator('#count').fill('3'); // large + 2: different aspects
  await dropAndWait(page, ['a', 'b'].map((n) => ({ name: `${n}.jpg`, w: 3000, h: 3000 })), { x: 600, y: 900 });
  await selectSlot(page, 0);
  await page.locator('#zoom').fill('250');
  await page.click('#rot-right');
  const r = await slotRects(page);
  await page.keyboard.press('Escape');
  await page.mouse.move(r[0].cx, r[0].cy);
  await page.mouse.down();
  await page.mouse.move(r[1].cx, r[1].cy, { steps: 6 });
  await page.mouse.up();
  const c = (await getState(page)).pages[0].slots[1]!.crop;
  expect(c).toMatchObject({ zoom: 2.5, rot: 90 });
});

test('Low-resolution Photo shows a dpi badge, only in the editor (rules 24, 25)', async ({ page }) => {
  await dropAndWait(page, [{ name: 'tiny.jpg', w: 300, h: 200 }], { slot: 0 });
  await dropAndWait(page, [{ name: 'mid.jpg', w: 1300, h: 1000 }], { slot: 1 });
  await dropAndWait(page, [{ name: 'big.jpg', w: 4000, h: 3000 }], { slot: 2 });
  await expect(page.locator('[data-slot="0"] .dpi.bad')).toBeVisible();
  await expect(page.locator('[data-slot="0"] .dpi')).toHaveAttribute('title', /dpi/);
  await expect(page.locator('[data-slot="1"] .dpi.warn')).toBeVisible();
  await expect(page.locator('[data-slot="2"] .dpi')).toHaveCount(0);
  // output canvas is drawn by the render function only → badges are DOM overlay, not part of it
  await page.evaluate(() => (window as any).__cw.preparePrint());
  await expect(page.locator('#print-root .dpi')).toHaveCount(0);
});

test('Undo/redo across different kinds of change (rule 26)', async ({ page }) => {
  const s0 = await getState(page);
  await dropAndWait(page, [{ name: 'a.jpg' }], { slot: 0 });
  await page.locator('#count').fill('6');
  await page.locator('#gap').fill('8');
  await page.click('#orient-landscape');
  await selectSlot(page, 0);
  await page.click('#rot-left');
  await page.keyboard.press('Control+z');
  expect((await crop0(page)).rot).toBe(0);
  await page.keyboard.press('Control+z');
  expect((await getState(page)).sheet.orientation).toBe('portrait');
  await page.keyboard.press('Control+z');
  expect((await getState(page)).gap).toBe(s0.gap);
  await page.keyboard.press('Control+z');
  expect((await getState(page)).slotCount).toBe(4);
  await page.keyboard.press('Control+z');
  expect(await slotNames(page)).toEqual([null, null, null, null]);
  await page.keyboard.press('Control+y');
  expect(await slotNames(page)).toEqual(['a.jpg', null, null, null]);
  await page.click('#redo');
  expect((await getState(page)).slotCount).toBe(6);
});
