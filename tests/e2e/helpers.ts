import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Collage } from '../../src/model/types';

export type FileSpec = { name: string; w?: number; h?: number; color?: string; type?: string; path?: string };

export async function openEditor(page: Page) {
  await page.goto('/editor.html');
  await page.evaluate(() => (window as any).__cw.ready);
  await expect(page.locator('#overlay .slot-ui').first()).toBeVisible();
}

export const getState = (page: Page) => page.evaluate(() => structuredClone((window as any).__cw.state)) as Promise<Collage>;
export const slotRects = (page: Page) =>
  page.evaluate(() => {
    const b = document.getElementById('sheet')!.getBoundingClientRect();
    return (window as any).__cw.slotRectsPx().map((r: any) => ({ x: r.x + b.left, y: r.y + b.top, w: r.w, h: r.h, cx: r.x + b.left + r.w / 2, cy: r.y + b.top + r.h / 2 }));
  }) as Promise<{ x: number; y: number; w: number; h: number; cx: number; cy: number }[]>;

/** Simulate dropping files from the OS at a point (slot centre or a free spot). */
export async function dropFiles(page: Page, files: FileSpec[], at: { slot: number } | { x: number; y: number }) {
  let x: number, y: number;
  if ('slot' in at) {
    const r = (await slotRects(page))[at.slot];
    x = r.cx;
    y = r.cy;
  } else ({ x, y } = at);
  const payload = files.map((f) => ({ ...f, data: f.path ? readFileSync(f.path).toString('base64') : undefined }));
  const before = await page.evaluate(() => Object.keys((window as any).__cw.state.photos).length);
  await page.evaluate(
    async ({ payload, x, y }) => {
      const dt = new DataTransfer();
      for (const f of payload) {
        let blob: Blob;
        if (f.data) {
          const bin = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
          blob = new Blob([bin], { type: f.type ?? '' });
        } else {
          const cv = document.createElement('canvas');
          cv.width = f.w ?? 1600;
          cv.height = f.h ?? 1200;
          const g = cv.getContext('2d')!;
          g.fillStyle = f.color ?? '#c33';
          g.fillRect(0, 0, cv.width, cv.height);
          g.fillStyle = '#fff';
          g.fillRect(0, 0, cv.width / 2, cv.height / 2);
          blob = await new Promise<Blob>((r) => cv.toBlob((b) => r(b!), 'image/jpeg', 0.9));
        }
        dt.items.add(new File([blob], f.name, { type: f.type ?? 'image/jpeg' }));
      }
      const target = document.elementFromPoint(x, y) ?? document.body;
      for (const type of ['dragenter', 'dragover', 'drop'])
        target.dispatchEvent(new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
    { payload, x, y },
  );
  return before;
}

export async function dropAndWait(page: Page, files: FileSpec[], at: { slot: number } | { x: number; y: number }, expectAdded = files.length) {
  const before = await dropFiles(page, files, at);
  await expect.poll(() => page.evaluate(() => Object.keys((window as any).__cw.state.photos).length)).toBe(before + expectAdded);
}

export const slotNames = async (page: Page) => {
  const s = await getState(page);
  return s.slots.map((x) => (x ? s.photos[x.photoId].name : null));
};
export const trayNames = async (page: Page) => {
  const s = await getState(page);
  return s.tray.map((x) => s.photos[x.photoId].name);
};
