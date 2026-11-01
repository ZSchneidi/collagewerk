import { describe, expect, it } from 'vitest';
import {
  addPage, addPhotos, addPhotosToPage, createCollage, deletePage, moveSlot, moveToPage, normalize, setLastPageCount, setSlotCount, slotToTray, trayToPage, trayToSlot, withDefaults,
} from '../../src/model/collage';
import type { Collage, PhotoMeta } from '../../src/model/types';

const p = (id: string): PhotoMeta => ({ id, name: id + '.jpg', w: 4000, h: 3000 });
const ps = (...ids: string[]) => ids.map(p);
const ids = (xs: ({ photoId: string } | null)[]) => xs.map((x) => (x ? x.photoId : null));
const pages = (c: Collage) => c.pages.map((pg) => ids(pg.slots));
/** apply an op and the derived constraints, like the editor's commit() */
const n = (c: Collage) => normalize(c);

describe('Adding Photos (v1 rule 11, pages rule 2)', () => {
  it('single drop onto a Slot replaces it, old one goes to tray', () => {
    let c = n(addPhotos(createCollage(), [p('a')], 2));
    expect(pages(c)).toEqual([[null, null, 'a', null]]);
    c = n(addPhotos(c, [p('b')], 2));
    expect(pages(c)).toEqual([[null, null, 'b', null]]);
    expect(ids(c.tray)).toEqual(['a']);
  });
  it('multi drop fills empty Slots, then appends Pages; last Page is auto-sized', () => {
    let c = n(addPhotos(createCollage(), [p('x')], 1));
    c = n(addPhotos(c, ps('a', 'b', 'c', 'd', 'e', 'f', 'g')));
    expect(pages(c)).toEqual([['a', 'x', 'b', 'c'], ['d', 'e', 'f', 'g']]);
    c = n(addPhotos(c, ps('h', 'i')));
    expect(pages(c)).toEqual([['a', 'x', 'b', 'c'], ['d', 'e', 'f', 'g'], ['h', 'i']]);
    expect(c.tray).toEqual([]);
  });
  it('10 Photos at 4 per Page give 4 + 4 + 2 (rule 3)', () => {
    const c = n(addPhotos(createCollage(), ps('1', '2', '3', '4', '5', '6', '7', '8', '9', '10')));
    expect(c.pages.map((pg) => pg.slots.length)).toEqual([4, 4, 2]);
  });
  it('filling starts at the current Page', () => {
    let c = n(addPhotos(createCollage(), ps('a', 'b', 'c', 'd', 'e')));
    c = n(slotToTray(c, 0, 1)); // hole on page 1
    c = n(addPhotos(c, [p('z')], undefined, 1));
    expect(pages(c)).toEqual([['a', null, 'c', 'd'], ['e', 'z']]);
  });
  it('a single Page always shows Photos per Page Slots', () => {
    const c = n(addPhotos(createCollage(), [p('a')]));
    expect(pages(c)).toEqual([['a', null, null, null]]);
  });
});

describe('Removing and Pages (rules 5, 7)', () => {
  it('a hole stays on earlier Pages; the last Page compacts; an emptied last Page disappears', () => {
    let c = n(addPhotos(createCollage(), ps('a', 'b', 'c', 'd', 'e', 'f')));
    c = n(slotToTray(c, 0, 0));
    expect(pages(c)).toEqual([[null, 'b', 'c', 'd'], ['e', 'f']]);
    c = n(slotToTray(c, 1, 0));
    expect(pages(c)).toEqual([[null, 'b', 'c', 'd'], ['f']]);
    c = n(slotToTray(c, 1, 0));
    expect(pages(c)).toEqual([[null, 'b', 'c', 'd']]);
    expect(ids(c.tray)).toEqual(['a', 'e', 'f']);
  });
  it('deletePage moves its Photos to the tray; the only Page is emptied', () => {
    let c = n(addPhotos(createCollage(), ps('a', 'b', 'c', 'd', 'e')));
    c = n(deletePage(c, 0));
    expect(pages(c)).toEqual([['e', null, null, null]]);
    expect(ids(c.tray)).toEqual(['a', 'b', 'c', 'd']);
    c = n(deletePage(c, 0));
    expect(pages(c)).toEqual([[null, null, null, null]]);
  });
  it('"+" appends an empty Page with full Slots that survives normalize', () => {
    let c = n(addPhotos(createCollage(), ps('a', 'b', 'c', 'd', 'e')));
    c = n(addPage(c));
    expect(pages(c)).toEqual([['a', 'b', 'c', 'd'], ['e', null, null, null], [null, null, null, null]]);
  });
});

describe('Photos per Page and the last Page (rules 4, 6)', () => {
  it('changing Photos per Page repaginates, keeping order and Crops, nothing to tray', () => {
    let c = n(addPhotos(createCollage(), ps('a', 'b', 'c', 'd', 'e', 'f')));
    c.pages[0].slots[0]!.crop.zoom = 2;
    c = n(slotToTray(c, 0, 1)); // hole is skipped
    c = n(setSlotCount(c, 2));
    expect(pages(c)).toEqual([['a', 'c'], ['d', 'e'], ['f']]);
    expect(c.pages[0].slots[0]!.crop.zoom).toBe(2);
    expect(ids(c.tray)).toEqual(['b']);
    c = n(setSlotCount(c, 6));
    expect(pages(c)).toEqual([['a', 'c', 'd', 'e', 'f', null]]);
  });
  it('hand-set Slot count of the last Page, never below its Photos', () => {
    let c = n(addPhotos(createCollage(), ps('a', 'b', 'c', 'd', 'e')));
    c = n(setLastPageCount(c, 3));
    expect(pages(c)).toEqual([['a', 'b', 'c', 'd'], ['e', null, null]]);
    c = n(addPhotos(c, ps('f', 'g', 'h')));
    // once the Page is full the hand-set count ends and it grows to Photos per Page
    expect(pages(c)).toEqual([['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']]);
    c = n(setLastPageCount(c, 0));
    expect(c.pages[1].slots.length).toBe(4);
  });
});

describe('Moving (v1 rules 17, 18; pages rule 8)', () => {
  it('swaps within a Page and keeps Crop', () => {
    let c = n(addPhotos(createCollage(), ps('a', 'b')));
    c.pages[0].slots[0]!.crop.zoom = 3;
    c = n(moveSlot(c, 0, 0, 1));
    expect(pages(c)).toEqual([['b', 'a', null, null]]);
    expect(c.pages[0].slots[1]!.crop.zoom).toBe(3);
  });
  it('move to another Page fills its first empty Slot or inserts a Page after it', () => {
    let c = n(addPhotos(createCollage(), ps('a', 'b', 'c', 'd', 'e')));
    c = n(moveToPage(c, 0, 1, 1));
    expect(pages(c)).toEqual([['a', null, 'c', 'd'], ['e', 'b']]);
    c = n(addPhotos(c, ps('f', 'g'), undefined, 1));
    c = n(moveToPage(c, 0, 0, 1));
    expect(pages(c)).toEqual([[null, null, 'c', 'd'], ['e', 'b', 'f', 'g'], ['a']]);
  });
  it('tray ↔ Slot / Page', () => {
    let c = n(addPhotos(createCollage(), ps('a', 'b', 'c', 'd', 'e')));
    c = n(slotToTray(c, 0, 1));
    c = n(trayToSlot(c, 0, 0, 0));
    expect(pages(c)).toEqual([['b', null, 'c', 'd'], ['e']]);
    expect(ids(c.tray)).toEqual(['a']);
    c = n(trayToPage(c, 0, 1));
    expect(pages(c)).toEqual([['b', null, 'c', 'd'], ['e', 'a']]);
    c = n(addPhotosToPage(c, [p('q')], 0));
    expect(pages(c)).toEqual([['b', 'q', 'c', 'd'], ['e', 'a']]);
  });
});

describe('Legacy v1 collage (rule 10)', () => {
  it('slots + templateIndex become one Page + templateId', () => {
    const old = { ...createCollage(), slotCount: 6, slots: [null, null, null, null, null, null], templateIndex: 1 } as Partial<Collage> & { slots: null[]; templateIndex: number };
    delete (old as Partial<Collage>).pages;
    delete (old as Partial<Collage>).templateId;
    const c = withDefaults(old);
    expect(c.pages).toHaveLength(1);
    expect(c.templateId).toBe('hero');
    expect('slots' in c).toBe(false);
  });
});
