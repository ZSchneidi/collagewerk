import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dropAndWait, openEditor, slotRects } from './helpers';

/** every user-facing string currently in the document: text nodes + tooltip/label attributes */
const allStrings = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => ((n.parentElement?.closest('script, style, #print-root') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)),
    });
    while (w.nextNode()) {
      const v = (w.currentNode.nodeValue ?? '').trim();
      if (v) out.push(v);
    }
    for (const el of document.querySelectorAll('[title], [data-tip], [aria-label], [data-empty]'))
      for (const a of ['title', 'data-tip', 'aria-label', 'data-empty']) {
        const v = el.getAttribute(a);
        if (v) out.push(v);
      }
    return out;
  });

const GERMAN = /[äöüÄÖÜß]|\b(Seite|Fotos?|Bogen|Rahmen|Drucken|Abbrechen|Ablage|Vorlage|Neigung|Abstand|Hintergrund|hinzufügen|Einstellungen|zurücksetzen|anzeigen|Stattdessen)\b/;

test.describe('English browser', () => {
  test.use({ locale: 'en-US' });

  test('the whole editor is English, including dialogs, chips and dynamic labels', async ({ page }) => {
    await openEditor(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
    await expect(page.locator('#welcome h2')).toHaveText('Drop photos here');
    await dropAndWait(page, Array.from({ length: 6 }, (_, i) => ({ name: `p${i}.jpg` })), { x: 600, y: 900 });
    await expect(page.locator('#toast')).toContainText('1 new page added');
    await expect(page.locator('#track .page-wrap.active .page-label')).toHaveText('Page 1 / 2 · A4 · 210 × 297 mm');
    const r = await slotRects(page);
    await page.mouse.click(r[0].cx, r[0].cy);
    await page.mouse.move(r[1].cx, r[1].cy);
    await page.click('#mode-fixed');
    await page.click('#mode-free');
    await page.locator('#gap').fill('2.5');
    await expect(page.locator('#gap-out')).toHaveText('2.5 mm');
    await page.click('#print');
    const strings = await allStrings(page);
    const german = strings.filter((s) => GERMAN.test(s) && !/^p\d\.jpg$/.test(s));
    expect(german).toEqual([]);
    await expect(page.locator('#print-card')).toContainText('Paper size');
    await expect(page.locator('#pc-pages')).toHaveText('1 page'); // the Passbild round-trip moved the other photos to the tray
  });

  test('fixed photo size and messages are English', async ({ page }) => {
    await openEditor(page);
    await page.click('#mode-fixed');
    await expect(page.locator('#photo-size [data-size="passbild"]')).toHaveText('Passport photo');
    await expect(page.locator('#photo-size [data-size="passbild"]')).toHaveAttribute('title', /digital photo/);
    const chooser = page.waitForEvent('filechooser');
    await page.click('#open-file');
    await (await chooser).setFiles({ name: 'x.collagewerk', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await expect(page.locator('#toast')).toContainText('Not a valid CollageWerk file.');
    const strings = await allStrings(page);
    expect(strings.filter((s) => GERMAN.test(s))).toEqual([]);
  });
});

test.describe('German browser', () => {
  test.use({ locale: 'de-AT' });
  test('any German locale gets German, decimal comma', async ({ page }) => {
    await openEditor(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('button', { name: 'Drucken', exact: true })).toBeVisible();
    await page.locator('#gap').fill('2.5');
    await expect(page.locator('#gap-out')).toHaveText('2,5 mm');
  });
});

test('Extension name and description are localised for both stores', () => {
  const m = JSON.parse(readFileSync('dist/firefox/manifest.json', 'utf8'));
  expect(m.name).toBe('__MSG_extName__');
  expect(m.default_locale).toBe('en');
  for (const l of ['en', 'de']) {
    const msgs = JSON.parse(readFileSync(`dist/chrome/_locales/${l}/messages.json`, 'utf8'));
    expect(Object.keys(msgs).sort()).toEqual(['actionTitle', 'extDescription', 'extName']);
  }
});
