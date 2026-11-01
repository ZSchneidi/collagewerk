import { describe, expect, it } from 'vitest';
import { computeSlots, sheetSize, templatesFor, MAX_SLOTS, type LayoutInput } from '../../src/model/layout';
import type { Rect } from '../../src/model/types';

const base = (o: Partial<LayoutInput> = {}): LayoutInput => ({
  sheet: { preset: 'A4', w: 210, h: 297, orientation: 'portrait' },
  slotCount: 4,
  templateIndex: 0,
  gap: 3,
  margin: 5,
  ...o,
});

const area = (r: Rect) => r.w * r.h;
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

describe('Sheet (rule 5)', () => {
  it('applies orientation', () => {
    expect(sheetSize({ preset: 'A4', w: 210, h: 297, orientation: 'landscape' })).toEqual({ w: 297, h: 210 });
    expect(sheetSize({ preset: 'A4', w: 210, h: 297, orientation: 'portrait' })).toEqual({ w: 210, h: 297 });
  });
});

describe('Template catalogue (rule 7)', () => {
  it('has the agreed templates per Slot count', () => {
    expect(templatesFor(1).map((t) => t.id)).toEqual(['full']);
    expect(templatesFor(2).map((t) => t.id)).toEqual(['side', 'stack']);
    expect(templatesFor(3).map((t) => t.id)).toEqual(['large2', 'row3']);
    expect(templatesFor(4).map((t) => t.id)).toEqual(['grid', 'large3']);
    for (let n = 5; n <= 12; n++) expect(templatesFor(n).map((t) => t.id)).toEqual(['grid', 'hero', 'mosaic']);
  });
});

describe('Slots tile the content area (rules 9, 10)', () => {
  for (const orientation of ['portrait', 'landscape'] as const)
    for (let n = 1; n <= MAX_SLOTS; n++)
      for (let t = 0; t < templatesFor(n).length; t++)
        it(`${orientation} n=${n} t=${t}`, () => {
          const inp = base({ slotCount: n, templateIndex: t, sheet: { preset: 'A4', w: 210, h: 297, orientation } });
          const slots = computeSlots(inp);
          expect(slots).toHaveLength(n);
          const { w, h } = sheetSize(inp.sheet);
          for (const s of slots) {
            expect(s.x).toBeGreaterThanOrEqual(5 - 1e-6);
            expect(s.y).toBeGreaterThanOrEqual(5 - 1e-6);
            expect(s.x + s.w).toBeLessThanOrEqual(w - 5 + 1e-6);
            expect(s.y + s.h).toBeLessThanOrEqual(h - 5 + 1e-6);
            expect(s.w).toBeGreaterThan(0);
            expect(s.h).toBeGreaterThan(0);
          }
          for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlap(slots[i], slots[j])).toBeCloseTo(0, 6);
          // without gap, slots fill the area exactly
          const noGap = computeSlots({ ...inp, gap: 0 });
          const sum = noGap.reduce((s, r) => s + area(r), 0);
          expect(sum).toBeCloseTo((w - 10) * (h - 10), 3);
        });

  it('keeps the gap between neighbours', () => {
    const [a, b] = computeSlots(base({ slotCount: 2, templateIndex: 0, gap: 7, sheet: { preset: 'A4', w: 210, h: 297, orientation: 'landscape' } }));
    expect(b.x - (a.x + a.w)).toBeCloseTo(7);
  });
});

describe('Orientation mirrors templates (rule 8)', () => {
  it('side-by-side becomes stacked in portrait', () => {
    const land = computeSlots(base({ slotCount: 2, templateIndex: 0, sheet: { preset: 'A4', w: 210, h: 297, orientation: 'landscape' } }));
    const port = computeSlots(base({ slotCount: 2, templateIndex: 0 }));
    expect(land[0].y).toBeCloseTo(land[1].y); // side by side
    expect(port[0].x).toBeCloseTo(port[1].x); // stacked
  });
});
