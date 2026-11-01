import { describe, expect, it } from 'vitest';
import {
  addPhotos, capacity, createCollage, fitSheet, normalize, setCrop, setLayoutMode, setPhotoSize, setSamePhoto, setSlotCount, slotToTray, trayToSlot, withDefaults,
} from '../../src/model/collage';
import { computeSlots, fixedCapacity, PHOTO_SIZES } from '../../src/model/layout';
import { parseFile } from '../../src/model/fileformat';
import type { Collage, PhotoMeta } from '../../src/model/types';

const p = (id: string): PhotoMeta => ({ id, name: id, w: 3000, h: 4000 });
const ids = (xs: ({ photoId: string } | null)[]) => xs.map((x) => (x ? x.photoId : null));
const sheet10x15 = { preset: '10x15', w: 100, h: 150, orientation: 'portrait' as const };
const passbild = { preset: 'passbild', w: 35, h: 45, orientation: 'portrait' as const };

function fixed(o: Partial<Collage> = {}): Collage {
  return normalize(setLayoutMode({ ...createCollage(), sheet: sheet10x15, ...o }, 'fixed'));
}

describe('Capacity and grid (rules 2–4)', () => {
  it('6 Passbilder fit on 10×15 with 5 mm margin and 2 mm gap', () => {
    expect(fixedCapacity(sheet10x15, 5, 2, passbild)).toMatchObject({ cols: 2, rows: 3, max: 6 });
  });
  it('caps at 12', () => {
    expect(fixedCapacity({ preset: 'A3', w: 297, h: 420, orientation: 'portrait' }, 5, 2, passbild).max).toBe(12);
  });
  it('entering fixed mode sets gap 2 and count to capacity', () => {
    const c = fixed();
    expect(c.gap).toBe(2);
    expect(c.slotCount).toBe(6);
  });
  it('slots are exact size, centred, filled row by row', () => {
    const c = setSlotCount(fixed(), 3);
    const r = computeSlots(c);
    expect(r).toHaveLength(3);
    for (const s of r) expect([s.w, s.h]).toEqual([35, 45]);
    expect(r[1].x - (r[0].x + 35)).toBeCloseTo(2);
    expect(r[2].y).toBeCloseTo(r[0].y + 47);
    expect(r[2].x).toBeCloseTo(r[0].x);
    // centred horizontally (2 columns used)
    expect(r[0].x).toBeCloseTo((100 - 72) / 2);
    // centred vertically (2 rows used)
    expect(r[0].y).toBeCloseTo((150 - 92) / 2);
  });
  it('landscape orientation swaps the size; square ignores it', () => {
    const c = setPhotoSize(fixed(), { ...passbild, orientation: 'landscape' });
    expect([computeSlots(c)[0].w, computeSlots(c)[0].h]).toEqual([45, 35]);
    const sq = setPhotoSize(fixed(), { preset: 'square50', w: 50, h: 50, orientation: 'landscape' });
    expect([computeSlots(sq)[0].w, computeSlots(sq)[0].h]).toEqual([50, 50]);
  });
});

describe('Capacity shrinks (rule 5) and mode switch back (rule 6)', () => {
  it('photos of removed Slots go to the tray', () => {
    let c = setSamePhoto(fixed(), false);
    c = addPhotos(c, ['a', 'b', 'c', 'd', 'e', 'f'].map(p));
    c = normalize({ ...c, margin: 20 }); // 60×110 → 1×2
    expect(capacity(c).max).toBe(2);
    expect(ids(c.slots)).toEqual(['a', 'b']);
    expect(ids(c.tray)).toEqual(['c', 'd', 'e', 'f']);
  });
  it('nothing fits → 0 Slots, all to tray; fitSheet finds the smallest preset', () => {
    let c = setSamePhoto(fixed(), false);
    c = addPhotos(c, [p('a')]);
    c = normalize(setPhotoSize(c, { preset: '13x18', w: 130, h: 180, orientation: 'portrait' }));
    expect(c.slotCount).toBe(0);
    expect(ids(c.tray)).toEqual(['a']);
    const f = fitSheet(c)!;
    expect(f.sheet.preset).toBe('A5');
    expect(f.slotCount).toBe(1);
  });
  it('switching back to free keeps Photos and restores the Template choice', () => {
    let c = { ...createCollage(), templateIndex: 1 };
    c = setLayoutMode(c, 'fixed');
    c = setLayoutMode(c, 'free');
    expect(c.templateIndex).toBe(1);
  });
});

describe('Same photo mode (rules 11–15)', () => {
  it('presets set the default', () => {
    expect(PHOTO_SIZES.filter((x) => x.same).map((x) => x.id)).toEqual(['passbild', 'bewerbung']);
    const c = setPhotoSize(fixed(), { preset: 'us', w: 50.8, h: 50.8, orientation: 'portrait' });
    expect(c.samePhoto).toBe(false);
    expect(setPhotoSize(c, passbild).samePhoto).toBe(true);
  });
  it('one drop fills every Slot; extra Photos to tray; replacing sends the old one once', () => {
    let c = fixed();
    c = addPhotos(c, ['a', 'b'].map(p), 3);
    expect(ids(c.slots)).toEqual(['a', 'a', 'a', 'a', 'a', 'a']);
    expect(ids(c.tray)).toEqual(['b']);
    c = addPhotos(c, [p('x')], 2);
    expect(ids(c.slots)).toEqual(['x', 'x', 'x', 'x', 'x', 'x']);
    expect(ids(c.tray)).toEqual(['b', 'a']);
  });
  it('Crop applies to all; new Slots get the same Photo + Crop', () => {
    let c = addPhotos(setSlotCount(fixed(), 2), [p('a')]);
    c = setCrop(c, 1, { zoom: 2, rot: 90, mirror: true, fx: 0.4, fy: 0.6 });
    expect(c.slots.every((s) => s!.crop.zoom === 2 && s!.crop.rot === 90)).toBe(true);
    c = normalize(setSlotCount(c, 5));
    expect(ids(c.slots)).toEqual(['a', 'a', 'a', 'a', 'a']);
    expect(c.slots[4]!.crop.zoom).toBe(2);
  });
  it('to tray empties all Slots and puts one Photo in the tray; tray → Slot fills all', () => {
    let c = addPhotos(fixed(), [p('a')]);
    c = slotToTray(c, 2);
    expect(ids(c.slots)).toEqual([null, null, null, null, null, null]);
    expect(ids(c.tray)).toEqual(['a']);
    c = trayToSlot(c, 0, 4);
    expect(ids(c.slots)).toEqual(['a', 'a', 'a', 'a', 'a', 'a']);
    expect(c.tray).toEqual([]);
  });
  it('reducing the count does not duplicate the Photo into the tray', () => {
    let c = addPhotos(fixed(), [p('a')]);
    c = setSlotCount(c, 2);
    expect(c.tray).toEqual([]);
    c = setSlotCount(c, 0);
    expect(ids(c.tray)).toEqual(['a']);
  });
  it('turning off keeps copies and allows separate Crops; turning on keeps the first, others to tray', () => {
    let c = addPhotos(setSlotCount(fixed(), 3), [p('a')]);
    c = setSamePhoto(c, false);
    c = setCrop(c, 1, { zoom: 3, rot: 0, mirror: false, fx: 0.5, fy: 0.5 });
    expect(c.slots.map((s) => s!.crop.zoom)).toEqual([1, 3, 1]);
    c = addPhotos(c, [p('b')], 2);
    expect(ids(c.tray)).toEqual(['a']); // the replaced copy
    c = normalize(setSamePhoto(c, true));
    expect(ids(c.slots)).toEqual(['a', 'a', 'a']);
    expect(ids(c.tray)).toEqual(['a', 'b']);
  });
});

describe('Persistence defaults (rule 20)', () => {
  it('old collage without the new fields opens in free mode', () => {
    const old = { ...createCollage() } as Partial<Collage>;
    delete old.mode;
    delete old.photoSize;
    delete old.samePhoto;
    delete old.cutMarks;
    const f = parseFile(JSON.stringify({ format: 'collagewerk', version: 1, collage: old, images: {} }));
    expect(f.collage).toMatchObject({ mode: 'free', cutMarks: true, photoSize: passbild });
    expect(withDefaults(old as Collage).mode).toBe('free');
  });
});
