import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dropAndWait, dropFiles, getState, openEditor, pageNames, slotNames, slotRects, trayNames } from './helpers';

test.beforeEach(({ page }) => openEditor(page));

const ten = Array.from({ length: 10 }, (_, i) => ({ name: `p${i + 1}.jpg`, color: `hsl(${i * 36} 70% 50%)` }));
const cur = (page: Page) => page.evaluate(() => (window as any).__cw.page);

test('Fixture: Photos beyond one Page flow onto new Pages, 4 + 4 + 2 (pages rules 1–3)', async ({ page }) => {
  await dropAndWait(page, ten, { x: 600, y: 900 });
  const pages = await pageNames(page);
  expect(pages.map((p) => p.length)).toEqual([4, 4, 2]);
  expect(await trayNames(page)).toEqual([]);
  await expect(page.locator('#page-thumbs .page-thumb')).toHaveCount(3);
  await expect(page.locator('#page-label')).toHaveText('Seite 1 / 3');
  await page.locator('#page-thumbs [data-page="2"]').click();
  expect(await cur(page)).toBe(2);
  await expect(page.locator('#overlay .slot-ui')).toHaveCount(2);
  expect((await getState(page)).templateId).toBe('grid');
  await expect(page.locator('#page-count')).toBeVisible();
  await page.click('#page-count-plus');
  await expect(page.locator('#overlay .slot-ui')).toHaveCount(3);
  await page.click('#page-prev');
  expect(await cur(page)).toBe(1);
  await expect(page.locator('#page-count')).toBeHidden();
});

test('Removing leaves a hole; drop on a Page thumbnail; drag a Photo onto another Page (rules 5, 8)', async ({ page }) => {
  await dropAndWait(page, ten.slice(0, 6), { x: 600, y: 900 });
  const r = await slotRects(page);
  await page.mouse.click(r[1].cx, r[1].cy);
  await page.keyboard.press('Delete');
  expect(await pageNames(page)).toEqual([['p1.jpg', null, 'p3.jpg', 'p4.jpg'], ['p5.jpg', 'p6.jpg']]);
  // files dropped onto thumbnail 1 (= Page 2) land there
  const t2 = (await page.locator('#page-thumbs [data-page="1"]').boundingBox())!;
  await dropAndWait(page, [{ name: 'q.jpg' }], { x: t2.x + t2.width / 2, y: t2.y + t2.height / 2 });
  expect((await pageNames(page))[1]).toEqual(['p5.jpg', 'p6.jpg', 'q.jpg']);
  // drag Photo from Slot 0 of Page 1 onto thumbnail of Page 2
  await page.keyboard.press('Escape');
  await page.mouse.move(r[0].cx, r[0].cy);
  await page.mouse.down();
  await page.mouse.move(t2.x + t2.width / 2, t2.y + t2.height / 2, { steps: 10 });
  await page.mouse.up();
  expect(await pageNames(page)).toEqual([[null, null, 'p3.jpg', 'p4.jpg'], ['p5.jpg', 'p6.jpg', 'q.jpg', 'p1.jpg']]);
});

test('"+" adds an empty Page; deleting a Page moves its Photos to the tray (rules 7, 8)', async ({ page }) => {
  await dropAndWait(page, ten.slice(0, 5), { x: 600, y: 900 });
  await page.click('#page-add');
  expect(await cur(page)).toBe(2);
  await expect(page.locator('#overlay .slot-ui')).toHaveCount(4);
  await page.locator('#page-thumbs [data-page="0"]').click();
  await page.click('#page-delete');
  expect(await pageNames(page)).toEqual([['p5.jpg', null, null, null], [null, null, null, null]]);
  expect(await trayNames(page)).toEqual(['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg']);
  await page.keyboard.press('Control+z');
  expect((await pageNames(page))[0]).toEqual(['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg']);
});

test('PNG per Page and one PDF with exact page size (pages rules 12, 13)', async ({ page }) => {
  await page.click('#preset [data-preset="10x15"]');
  await dropAndWait(page, ten.slice(0, 6), { x: 600, y: 900 });
  const names: string[] = [];
  page.on('download', (d) => names.push(d.suggestedFilename()));
  await page.click('#export-png');
  await expect.poll(() => names.length).toBe(2);
  expect(names[0]).toMatch(/^collage-\d+-1\.png$/);
  expect(names[1]).toMatch(/^collage-\d+-2\.png$/);

  const dl = page.waitForEvent('download');
  await page.click('#export-pdf');
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/\.pdf$/);
  const file = await d.path();
  execFileSync('qpdf', ['--check', file]); // throws on a broken PDF
  const info = execFileSync('pdfinfo', [file]).toString();
  expect(info).toMatch(/Pages:\s+2/);
  expect(info).toMatch(/Page size:\s+283\.46\d* x 425\.19\d* pts/);
  expect(readFileSync(file).subarray(0, 5).toString()).toBe('%PDF-');
});

test('Print card shows the exact settings, offers PDF and can be switched off (pages rule 14)', async ({ page }) => {
  await page.click('#preset [data-preset="10x15"]');
  await dropAndWait(page, ten.slice(0, 5), { x: 600, y: 900 });
  await page.evaluate(() => ((window as any).print = () => ((window as any).__printed = ((window as any).__printed ?? 0) + 1)));
  await page.click('#print');
  const card = page.locator('#print-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('10 × 15 cm – 100 × 150 mm');
  await expect(card).toContainText('Keine');
  await expect(card).toContainText('100 %');
  await expect(card).toContainText('2 Seiten');
  const dl = page.waitForEvent('download');
  await page.click('#pc-pdf');
  expect((await dl).suggestedFilename()).toMatch(/\.pdf$/);
  await expect(card).toBeHidden();
  await page.click('#print');
  await page.locator('#pc-dontshow').check();
  await page.click('#pc-print');
  await expect.poll(() => page.evaluate(() => (window as any).__printed)).toBe(1);
  await page.click('#print');
  await expect.poll(() => page.evaluate(() => (window as any).__printed)).toBe(2);
  await expect(card).toBeHidden();
});

test('Diagonal Template: slant slider, polygon hit-testing (pages rules 16, 24)', async ({ page }) => {
  await page.click('#orient-landscape');
  await page.locator('#count').fill('2');
  await page.locator('#templates button[data-template=diagonal]').click();
  await expect(page.locator('#slant-row')).toBeVisible();
  await page.locator('#slant').fill('20');
  expect((await getState(page)).slant).toBe(20);
  await dropAndWait(page, [{ name: 'a.jpg' }, { name: 'b.jpg' }], { x: 600, y: 900 });
  // near the top of the divider the left polygon reaches further right than its bounding box centre suggests
  const poly = await page.evaluate(() => {
    const cw = (window as any).__cw;
    const b = document.getElementById('sheet')!.getBoundingClientRect();
    const k = b.width / 297;
    const s = cw.state;
    return { k, left: b.left, top: b.top, slots: s, r: (window as any).__cw.slotRectsPx() };
  });
  const r = poly.r as { x: number; y: number; w: number; h: number }[];
  // a point just right of the left slot's top-right corner belongs to slot 1 at the bottom, slot 0 at the top
  const xMid = poly.left + (r[0].x + r[0].w + r[1].x) / 2;
  await page.mouse.click(xMid, poly.top + r[0].y + 4);
  const topSel = await page.evaluate(() => (window as any).__cw.selected);
  await page.keyboard.press('Escape');
  await page.mouse.click(xMid, poly.top + r[0].y + r[0].h - 4);
  const bottomSel = await page.evaluate(() => (window as any).__cw.selected);
  expect(new Set([topSel, bottomSel])).toEqual(new Set([0, 1]));
  await expect(page.locator('.slot-ui.poly svg.outline')).toHaveCount(2);
});

test('Style: Frame, corners, shadow, edges render into the output; undoable (pages rules 19–22, 25)', async ({ page }) => {
  await page.locator('#count').fill('1');
  await dropAndWait(page, [{ name: 'a.jpg', color: '#203080' }], { slot: 0 });
  const px = (x: number, y: number) =>
    page.evaluate(
      async ([x, y]) => {
        const cv: HTMLCanvasElement = await (window as any).__cw.renderOutput(100);
        const k = 100 / 25.4;
        return Array.from(cv.getContext('2d')!.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data);
      },
      [x, y],
    );
  // Polaroid: white border, wider at the bottom (A4: slot 5..205 × 5..292, width 4 → bottom 14 mm)
  await page.click('#frame-kind [data-frame=polaroid]');
  expect(await px(7, 150)).toEqual([255, 255, 255, 255]); // left border
  expect(await px(105, 285)).toEqual([255, 255, 255, 255]); // wide bottom
  expect((await px(150, 200))[2]).toBeGreaterThan(100); // photo (blue-ish)
  await page.click('#frame-kind [data-frame=color]');
  await page.locator('#frame-color').fill('#ff0000');
  const red = await px(7, 150);
  expect(red[0]).toBeGreaterThan(200);
  expect(red[1]).toBeLessThan(40);
  // corners: radius 15 → the very corner is background
  await page.locator('#radius').fill('15');
  expect(await px(5.6, 5.6)).toEqual([255, 255, 255, 255]);
  // vignette darkens the photo corners vs. centre
  await page.click('#frame-kind [data-frame=none]');
  await page.locator('#radius').fill('0');
  const before = await px(200, 288);
  await page.click('#edge-kind [data-edge=vignette]');
  const after = await px(200, 288);
  expect(after[0] + after[1] + after[2]).toBeLessThan(before[0] + before[1] + before[2] - 20);
  // soft edges fade into the white background
  await page.click('#edge-kind [data-edge=soft]');
  const edge = await px(6, 150);
  expect(edge[0]).toBeGreaterThan(200);
  // shadow toggles
  await page.locator('#shadow').check({ force: true });
  expect((await getState(page)).style.shadow).toBe(true);
  // undo walks back
  await page.keyboard.press('Control+z');
  expect((await getState(page)).style.shadow).toBe(false);
});

test('Scatter tilts Photos, Tilt per Photo, "Neu mischen"; Style off in fixed size (pages rules 18, 23)', async ({ page }) => {
  await dropAndWait(page, ten.slice(0, 4), { x: 600, y: 900 });
  await page.locator('#scatter').check({ force: true });
  const transforms = await page.locator('#overlay .slot-ui').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform));
  expect(transforms.every((t) => /rotate\(-?\d/.test(t))).toBe(true);
  const seed = (await getState(page)).style.seed;
  await page.click('#reshuffle');
  expect((await getState(page)).style.seed).not.toBe(seed);
  const r = await slotRects(page);
  await page.mouse.click(r[0].cx, r[0].cy);
  await expect(page.locator('#tilt-row')).toBeVisible();
  await page.locator('#tilt').fill('12');
  expect((await getState(page)).pages[0].slots[0]!.tilt).toBe(12);
  await page.click('#reshuffle');
  expect((await getState(page)).pages[0].slots[0]!.tilt).toBe(12); // hand-set Tilt survives
  await page.keyboard.press('Escape');
  await page.click('#mode-fixed');
  expect((await getState(page)).mode).toBe('fixed');
  await expect(page.locator('#style-fields')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#style-note')).toBeVisible();
  await expect(page.locator('#pages')).toBeHidden(); // Same photo mode: one Page
});

test('Old v1 collage file opens as one Page (pages rule 10)', async ({ page }) => {
  const img = await page.evaluate(async () => {
    const cv = document.createElement('canvas');
    cv.width = 40;
    cv.height = 30;
    cv.getContext('2d')!.fillRect(0, 0, 40, 30);
    return cv.toDataURL('image/png');
  });
  const v1 = {
    format: 'collagewerk',
    version: 1,
    collage: {
      sheet: { preset: 'A4', w: 210, h: 297, orientation: 'portrait' },
      slotCount: 2,
      templateIndex: 1,
      gap: 3,
      margin: 5,
      background: '#ffffff',
      slots: [{ photoId: 'x', crop: { zoom: 1, rot: 0, mirror: false, fx: 0.5, fy: 0.5 } }, null],
      tray: [],
      photos: { x: { id: 'x', name: 'old.png', w: 40, h: 30 } },
    },
    images: { x: img },
  };
  const chooser = page.waitForEvent('filechooser');
  await page.click('#open-file');
  await (await chooser).setFiles({ name: 'old.collagewerk', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v1)) });
  await expect.poll(async () => (await getState(page)).templateId).toBe('stack');
  expect(await slotNames(page)).toEqual(['old.png', null]);
  expect((await getState(page)).pages).toHaveLength(1);
});
