import { expect, test, type Page } from '@playwright/test';
import { dropAndWait, dropFiles, getState, openEditor, pageNames, slotRects } from './helpers';

test.beforeEach(({ page }) => openEditor(page));

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `p${i + 1}.jpg`, color: `hsl(${i * 36} 70% 50%)` }));
const active = (page: Page) => page.evaluate(() => (window as any).__cw.page);
const wraps = (page: Page) => page.locator('#track .page-wrap');
/** settle the 250 ms slide */
const settle = (page: Page) => page.waitForTimeout(350);
/** centre of Slot i on Page p (client coords) */
async function slotCentre(page: Page, p: number, i: number) {
  return page.evaluate(
    ([p, i]) => {
      const cw = (window as any).__cw;
      const cv = document.querySelectorAll<HTMLCanvasElement>('#track .page-wrap canvas')[p];
      const b = cv.getBoundingClientRect();
      const r = cw.slotRectsPxOf(p)[i];
      return { x: b.left + r.x + r.w / 2, y: b.top + r.y + r.h / 2 };
    },
    [p, i],
  );
}

test('All Pages side by side at full size, Active Page centred, labels (carousel rules 1, 2)', async ({ page }) => {
  await dropAndWait(page, photos(10), { x: 600, y: 900 });
  await expect(wraps(page)).toHaveCount(3);
  await settle(page);
  const boxes = await page.locator('#track .page-wrap canvas').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  // same size, 48 px apart
  expect(boxes[1].width).toBeCloseTo(boxes[0].width, 0);
  expect(boxes[1].x - (boxes[0].x + boxes[0].width)).toBeCloseTo(48, 0);
  // Active Page centred in the stage's content box; right neighbour peeks in
  const area = await page.locator('#sheet-area').evaluate((e) => {
    const b = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { centre: b.left + parseFloat(cs.paddingLeft) + (b.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / 2, right: b.right };
  });
  expect(boxes[0].x + boxes[0].width / 2).toBeCloseTo(area.centre, 0);
  expect(boxes[1].x).toBeLessThan(area.right);
  await expect(page.locator('#track .page-wrap.active .page-label')).toHaveText('Seite 1 / 3 · A4 · 210 × 297 mm');
  await expect(wraps(page).nth(2).locator('.page-label')).toContainText('Seite 3 / 3');
  // the ghost page follows the last Page
  await expect(page.locator('#ghost-page')).toBeVisible();
});

test('Navigation: buttons, PageUp/PageDown, arrows without selection, wheel over empty stage (rules 3, 10–13)', async ({ page }) => {
  await dropAndWait(page, photos(10), { x: 600, y: 900 });
  await expect(page.locator('#nav-prev')).toBeDisabled();
  await page.click('#nav-next');
  expect(await active(page)).toBe(1);
  await settle(page);
  const c1 = await page.locator('#sheet').boundingBox();
  const prevCentre = c1!.x + c1!.width / 2;
  await page.keyboard.press('PageDown');
  expect(await active(page)).toBe(2);
  await expect(page.locator('#nav-next')).toBeDisabled();
  await page.keyboard.press('PageUp');
  await page.keyboard.press('ArrowLeft');
  expect(await active(page)).toBe(0);
  await settle(page);
  const c0 = await page.locator('#sheet').boundingBox();
  expect(c0!.x + c0!.width / 2).toBeCloseTo(prevCentre, 0); // each Active Page ends up in the same centred spot
  // with a Photo selected, arrows nudge the Crop instead
  const r = await slotRects(page);
  await page.mouse.click(r[0].cx, r[0].cy);
  await page.keyboard.press('ArrowRight');
  expect(await active(page)).toBe(0);
  await page.keyboard.press('Escape');
  // wheel over empty stage (below the Pages) switches Page; over a Photo it zooms
  const area = (await page.locator('#sheet-area').boundingBox())!;
  await page.mouse.move(area.x + 10, area.y + 40);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => active(page)).toBe(1);
  await settle(page);
  const s1 = await slotRects(page);
  await page.mouse.move(s1[0].cx, s1[0].cy);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => (await getState(page)).pages[1].slots[0]!.crop.zoom).toBeGreaterThan(1.2);
  expect(await active(page)).toBe(1);
});

test('Clicking a Slot on a neighbour Page selects it and centres that Page (rule 5)', async ({ page }) => {
  await dropAndWait(page, photos(6), { x: 600, y: 900 });
  await settle(page);
  const target = await slotCentre(page, 1, 0);
  await page.mouse.click(target.x, target.y);
  expect(await active(page)).toBe(1);
  expect(await page.evaluate(() => (window as any).__cw.selected)).toBe(0);
  await expect(page.locator('#crop-panel')).toBeVisible();
  await expect(page.locator('#overlay [data-slot="0"]')).toHaveClass(/selected/);
});

test('Drag a Photo from one Page onto a Slot of another swaps them (rule 6)', async ({ page }) => {
  await dropAndWait(page, photos(6), { x: 600, y: 900 });
  await settle(page);
  const from = await slotCentre(page, 0, 2);
  // drop on page 2, slot 0 – only a narrow part peeks in, use its visible left edge
  const cv1 = (await page.locator('#track .page-wrap canvas').nth(1).boundingBox())!;
  const to = { x: cv1.x + 20, y: cv1.y + 30 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  expect(await pageNames(page)).toEqual([['p1.jpg', 'p2.jpg', 'p5.jpg', 'p4.jpg'], ['p3.jpg', 'p6.jpg']]);
  await page.keyboard.press('Control+z');
  expect(await pageNames(page)).toEqual([['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg'], ['p5.jpg', 'p6.jpg']]);
});

test('Files dropped onto a Slot of a neighbour Page land there (rule 7)', async ({ page }) => {
  await dropAndWait(page, photos(6), { x: 600, y: 900 });
  await settle(page);
  const cv1 = (await page.locator('#track .page-wrap canvas').nth(1).boundingBox())!;
  await dropAndWait(page, [{ name: 'new.jpg' }], { x: cv1.x + 20, y: cv1.y + 30 });
  expect((await pageNames(page))[1]).toEqual(['new.jpg', 'p6.jpg']);
  expect(await active(page)).toBe(1);
});

test('Ghost Page: click appends a Page, dropping files appends a Page with them (rule 4)', async ({ page }) => {
  await dropAndWait(page, photos(4), { x: 600, y: 900 });
  await expect(page.locator('#nav-next')).toBeHidden(); // single Page: no nav buttons
  await page.locator('#ghost-page').click();
  expect(await active(page)).toBe(1);
  expect((await getState(page)).pages).toHaveLength(2);
  await settle(page);
  // drop files on the ghost (now right of Page 2)
  const g = (await page.locator('#ghost-page').boundingBox())!;
  const visibleX = Math.min(g.x + 20, 1380);
  await dropFiles(page, [{ name: 'g1.jpg' }, { name: 'g2.jpg' }], { x: visibleX, y: g.y + g.height / 2 });
  await expect.poll(async () => (await pageNames(page))[2]).toEqual(['g1.jpg', 'g2.jpg', null, null]);
  // never printed
  await page.evaluate(() => (window as any).__cw.preparePrint());
  await expect(page.locator('#print-root img')).toHaveCount(3);
});

test('Neu: keep settings / reset everything / cancel; undo restores (rules 15–17)', async ({ page }) => {
  await page.click('#preset [data-preset="A3"]');
  await page.click('#frame-kind [data-frame=white]');
  await dropAndWait(page, photos(6), { x: 600, y: 900 });
  await page.click('#new-collage');
  await expect(page.locator('#new-card')).toBeVisible();
  await expect(page.locator('#nc-keep')).toBeFocused();
  await page.click('#nc-cancel');
  expect((await getState(page)).pages).toHaveLength(2);

  await page.click('#new-collage');
  await page.click('#nc-keep');
  let s = await getState(page);
  expect(s.pages).toEqual([{ slots: [null, null, null, null] }]);
  expect(s.tray).toEqual([]);
  expect(s.sheet.preset).toBe('A3');
  expect(s.style.frame).toBe('white');
  await expect(page.locator('#welcome')).toBeVisible();
  await page.keyboard.press('Control+z');
  expect((await getState(page)).pages).toHaveLength(2);

  await page.click('#new-collage');
  await page.click('#nc-reset');
  s = await getState(page);
  expect(s.sheet.preset).toBe('A4');
  expect(s.style.frame).toBe('none');
  expect(s.pages).toHaveLength(1);
});
