import { expect, test } from '@playwright/test';
import { dropAndWait, dropFiles, getState, openEditor, slotNames, slotRects, trayNames } from './helpers';

test.beforeEach(({ page }) => openEditor(page));

test('German editor with default A4 and 4 Slots (rules 3, 4)', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('button', { name: 'Drucken', exact: true })).toBeVisible();
  await expect(page.locator('#overlay .slot-ui')).toHaveCount(4);
  await expect(page.locator('#tray')).toBeVisible();
});

test('Sheet, Slot count, Template, Gap and Margin recompute Slots (rules 5–9)', async ({ page }) => {
  await expect(page.locator('#custom-size')).toBeHidden();
  await page.click('#preset [data-preset="A5"]');
  await page.click('#orient-landscape');
  let s = await getState(page);
  expect(s.sheet).toMatchObject({ preset: 'A5', orientation: 'landscape' });
  const box = await page.locator('#sheet').boundingBox();
  expect(box!.width).toBeGreaterThan(box!.height);

  await page.locator('#count').fill('6');
  await expect(page.locator('#overlay .slot-ui')).toHaveCount(6);
  await expect(page.locator('#templates button')).toHaveCount(3);
  await page.locator('#templates button[data-template=hero]').click();
  expect((await getState(page)).templateIndex).toBe(1);
  const before = await slotRects(page);
  await page.locator('#gap').fill('10');
  await page.locator('#margin').fill('15');
  const after = await slotRects(page);
  expect(after[0].x).toBeGreaterThan(before[0].x);

  await page.click('#preset [data-preset="custom"]');
  await expect(page.locator('#custom-size')).toBeVisible();
  await page.fill('#custom-w', '300');
  await page.fill('#custom-h', '120');
  await page.locator('#custom-h').blur();
  s = await getState(page);
  expect(s.sheet).toMatchObject({ preset: 'custom', w: 300, h: 120 });
});

test('Single drop onto a Slot; occupied Slot sends old Photo to tray (rule 11)', async ({ page }) => {
  await dropAndWait(page, [{ name: 'a.jpg' }], { slot: 2 });
  expect(await slotNames(page)).toEqual([null, null, 'a.jpg', null]);
  await dropAndWait(page, [{ name: 'b.jpg', color: '#3c3' }], { slot: 2 });
  expect(await slotNames(page)).toEqual([null, null, 'b.jpg', null]);
  expect(await trayNames(page)).toEqual(['a.jpg']);
  await expect(page.locator('.tray-item')).toHaveCount(1);
});

test('Multi drop fills empty Slots in order, overflow to tray (rule 12)', async ({ page }) => {
  const r3 = (await slotRects(page))[3]; // corner of Slot 3, clear of the Welcome card
  await dropAndWait(page, [{ name: 'x.jpg' }], { x: r3.x + r3.w - 10, y: r3.y + r3.h - 10 });
  await dropAndWait(page, ['a', 'b', 'c', 'd'].map((n) => ({ name: `${n}.jpg` })), { x: 600, y: 900 });
  expect(await slotNames(page)).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'x.jpg']);
  expect(await trayNames(page)).toEqual(['d.jpg']);
});

test('Unsupported file is rejected with a message (rule 14)', async ({ page }) => {
  const before = await getState(page);
  await dropFiles(page, [{ name: 'iphone.heic', path: 'tests/fixtures/not-a-photo.heic', type: 'image/heic' }], { slot: 0 });
  await expect(page.locator('#toast')).toContainText('Nicht unterstützt: iphone.heic');
  expect(await getState(page)).toEqual(before);
});

test('EXIF orientation is applied (rule 15)', async ({ page }) => {
  await dropAndWait(page, [{ name: 'exif.jpg', path: 'tests/fixtures/exif-orient6.jpg', type: 'image/jpeg' }], { slot: 0 });
  const s = await getState(page);
  const meta = Object.values(s.photos)[0];
  expect([meta.w, meta.h]).toEqual([200, 400]);
});

test('Slot count change keeps Photos, removed ones go to tray (rule 16)', async ({ page }) => {
  await dropAndWait(page, ['a', 'b', 'c', 'd'].map((n) => ({ name: `${n}.jpg` })), { x: 600, y: 900 });
  await page.locator('#count').fill('2');
  expect(await slotNames(page)).toEqual(['a.jpg', 'b.jpg']);
  expect(await trayNames(page)).toEqual(['c.jpg', 'd.jpg']);
  await page.locator('#count').fill('5');
  expect(await slotNames(page)).toEqual(['a.jpg', 'b.jpg', null, null, null]);
});

test('Drag between Slots swaps; drag to tray removes (rules 17, 18)', async ({ page }) => {
  await dropAndWait(page, ['a', 'b'].map((n) => ({ name: `${n}.jpg` })), { x: 600, y: 900 });
  const r = await slotRects(page);
  await page.mouse.move(r[0].cx, r[0].cy);
  await page.mouse.down();
  await page.mouse.move(r[1].cx, r[1].cy, { steps: 8 });
  await page.mouse.up();
  expect(await slotNames(page)).toEqual(['b.jpg', 'a.jpg', null, null]);
  // move into empty Slot
  await page.keyboard.press('Escape');
  await page.mouse.move(r[1].cx, r[1].cy);
  await page.mouse.down();
  await page.mouse.move(r[3].cx, r[3].cy, { steps: 8 });
  await page.mouse.up();
  expect(await slotNames(page)).toEqual(['b.jpg', null, null, 'a.jpg']);
  // to tray
  await page.keyboard.press('Escape');
  const tray = (await page.locator('#tray').boundingBox())!;
  await page.mouse.move(r[0].cx, r[0].cy);
  await page.mouse.down();
  await page.mouse.move(tray.x + tray.width / 2, tray.y + tray.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await slotNames(page)).toEqual([null, null, null, 'a.jpg']);
  expect(await trayNames(page)).toEqual(['b.jpg']);
  // tray → Slot
  const cb = (await page.locator('#sheet').boundingBox())!;
  await page.locator('.tray-item').first().dragTo(page.locator('#sheet'), { targetPosition: { x: r[1].cx - cb.x, y: r[1].cy - cb.y } });
  expect(await slotNames(page)).toEqual([null, 'b.jpg', null, 'a.jpg']);
  expect(await trayNames(page)).toEqual([]);
});
