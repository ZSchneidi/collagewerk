import { describe, expect, it } from 'vitest';
import { clampCrop, defaultCrop, dpiLevel, effectiveDpi, mirror, pan, rotate, scaleFor, zoomAt, displayedSize } from '../../src/model/crop';
import type { Crop, PhotoMeta, Rect } from '../../src/model/types';

const photo: PhotoMeta = { id: 'p', name: 'p', w: 4000, h: 3000 };
const slot: Rect = { x: 0, y: 0, w: 100, h: 100 };

/** visible window of the displayed Photo in normalised coords */
function visible(p: PhotoMeta, c: Crop, r: Rect) {
  const d = displayedSize(p, c);
  const s = scaleFor(p, c, r);
  const hx = r.w / s / d.w / 2, hy = r.h / s / d.h / 2;
  return { x0: c.fx - hx, x1: c.fx + hx, y0: c.fy - hy, y1: c.fy + hy };
}
function covers(p: PhotoMeta, c: Crop, r: Rect) {
  const v = visible(p, c, r);
  return v.x0 >= -1e-9 && v.y0 >= -1e-9 && v.x1 <= 1 + 1e-9 && v.y1 <= 1 + 1e-9;
}

describe('Cover (rule 19)', () => {
  it('zoom is clamped to 1..5', () => {
    expect(clampCrop(photo, { ...defaultCrop(), zoom: 0.3 }, slot).zoom).toBe(1);
    expect(clampCrop(photo, { ...defaultCrop(), zoom: 9 }, slot).zoom).toBe(5);
  });
  it('pan never reveals empty space', () => {
    let c = clampCrop(photo, defaultCrop(), slot);
    c = pan(photo, c, slot, 10000, -10000);
    expect(covers(photo, c, slot)).toBe(true);
    c = zoomAt(photo, c, slot, 3, 40, 40);
    c = pan(photo, c, slot, -5000, 5000);
    expect(covers(photo, c, slot)).toBe(true);
  });
  it('rotation and mirror keep cover', () => {
    let c = zoomAt(photo, defaultCrop(), slot, 1);
    c = pan(photo, c, slot, 1000, 0);
    c = rotate(photo, c, { x: 0, y: 0, w: 200, h: 50 }, 1);
    expect(covers(photo, c, { x: 0, y: 0, w: 200, h: 50 })).toBe(true);
    c = mirror(photo, c, slot);
    expect(covers(photo, c, slot)).toBe(true);
  });
});

describe('Wheel zoom around cursor (rule 21)', () => {
  it('keeps the point under the cursor fixed when not clamped', () => {
    const c0 = zoomAt(photo, defaultCrop(), slot, 2);
    const ox = 10, oy = -5;
    const d = displayedSize(photo, c0);
    const pt = (c: Crop) => ({ x: c.fx * d.w + ox / scaleFor(photo, c, slot), y: c.fy * d.h + oy / scaleFor(photo, c, slot) });
    const c1 = zoomAt(photo, c0, slot, 2.5, ox, oy);
    expect(pt(c1).x).toBeCloseTo(pt(c0).x, 6);
    expect(pt(c1).y).toBeCloseTo(pt(c0).y, 6);
  });
});

describe('Aspect change keeps focus (rule 23)', () => {
  it('re-clamps focus in a new slot shape', () => {
    let c = zoomAt(photo, defaultCrop(), slot, 2);
    c = pan(photo, c, slot, -30, 0); // look to the right
    const wide = clampCrop(photo, c, { x: 0, y: 0, w: 300, h: 60 });
    expect(wide.zoom).toBe(2);
    expect(covers(photo, wide, { x: 0, y: 0, w: 300, h: 60 })).toBe(true);
    expect(wide.fx).toBeGreaterThan(0.5);
  });
});

describe('Rotate twice = 180° with focus mirrored', () => {
  it('rot right then left restores', () => {
    const c0 = { ...defaultCrop(), zoom: 2, fx: 0.6, fy: 0.4 };
    const c = rotate(photo, rotate(photo, c0, slot, 1), slot, -1);
    expect(c.rot).toBe(0);
    expect(c.fx).toBeCloseTo(0.6);
    expect(c.fy).toBeCloseTo(0.4);
  });
  it('rotate right while mirrored decreases rot', () => {
    const c = rotate(photo, { ...defaultCrop(), mirror: true }, slot, 1);
    expect(c.rot).toBe(270);
  });
});

describe('DPI (rule 24)', () => {
  it('computes effective dpi from printed size and zoom', () => {
    // 3000 px high photo covering a 100 mm square: 3000 px over 100mm → 762 dpi at zoom 1
    expect(effectiveDpi(photo, defaultCrop(), slot)).toBeCloseTo(762, 0);
    expect(effectiveDpi(photo, { ...defaultCrop(), zoom: 4 }, slot)).toBeCloseTo(190.5, 0);
    expect(dpiLevel(250)).toBe('ok');
    expect(dpiLevel(150)).toBe('warn');
    expect(dpiLevel(100)).toBe('bad');
  });
});
