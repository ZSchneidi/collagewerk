import { describe, expect, it } from 'vitest';
import { addPhotos, createCollage, moveSlot, setSlotCount, slotToTray, trayToSlot } from '../../src/model/collage';
import type { PhotoMeta } from '../../src/model/types';

const p = (id: string): PhotoMeta => ({ id, name: id + '.jpg', w: 4000, h: 3000 });
const ids = (xs: ({ photoId: string } | null)[]) => xs.map((x) => (x ? x.photoId : null));

describe('Adding Photos (rules 11, 12)', () => {
  it('single drop onto a Slot replaces it, old one goes to tray', () => {
    let c = addPhotos(createCollage(), [p('a')], 2);
    expect(ids(c.slots)).toEqual([null, null, 'a', null]);
    c = addPhotos(c, [p('b')], 2);
    expect(ids(c.slots)).toEqual([null, null, 'b', null]);
    expect(ids(c.tray)).toEqual(['a']);
  });
  it('multi drop fills empty Slots in order, overflow to tray', () => {
    let c = addPhotos(createCollage(), [p('x')], 1);
    c = addPhotos(c, ['a', 'b', 'c', 'd'].map(p), 1);
    expect(ids(c.slots)).toEqual(['a', 'x', 'b', 'c']);
    expect(ids(c.tray)).toEqual(['d']);
  });
});

describe('Slot count (rule 16)', () => {
  it('increase keeps Photos, decrease moves extras to tray', () => {
    let c = addPhotos(createCollage(), ['a', 'b', 'c', 'd'].map(p));
    c.slots[0]!.crop.zoom = 2;
    c = setSlotCount(c, 6);
    expect(ids(c.slots)).toEqual(['a', 'b', 'c', 'd', null, null]);
    c = setSlotCount(c, 2);
    expect(ids(c.slots)).toEqual(['a', 'b']);
    expect(ids(c.tray)).toEqual(['c', 'd']);
    expect(c.slots[0]!.crop.zoom).toBe(2);
    expect(Object.keys(c.photos).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
  it('clamps template index to the new catalogue', () => {
    let c = setSlotCount(createCollage(), 6);
    c = { ...c, templateIndex: 2 };
    c = setSlotCount(c, 2);
    expect(c.templateIndex).toBe(1);
  });
});

describe('Moving (rules 17, 18)', () => {
  it('swaps occupied Slots and moves into empty ones, keeping Crop', () => {
    let c = addPhotos(createCollage(), ['a', 'b'].map(p));
    c.slots[0]!.crop.zoom = 3;
    c = moveSlot(c, 0, 1);
    expect(ids(c.slots)).toEqual(['b', 'a', null, null]);
    expect(c.slots[1]!.crop.zoom).toBe(3);
    c = moveSlot(c, 1, 3);
    expect(ids(c.slots)).toEqual(['b', null, null, 'a']);
  });
  it('tray ↔ Slot', () => {
    let c = addPhotos(createCollage(), ['a', 'b', 'c', 'd', 'e'].map(p));
    c = trayToSlot(c, 0, 0);
    expect(ids(c.slots)).toEqual(['e', 'b', 'c', 'd']);
    expect(ids(c.tray)).toEqual(['a']);
    c = slotToTray(c, 1);
    expect(ids(c.slots)).toEqual(['e', null, 'c', 'd']);
    expect(ids(c.tray)).toEqual(['a', 'b']);
  });
});
