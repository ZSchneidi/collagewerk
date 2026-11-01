import { describe, expect, it } from 'vitest';
import { computeLayout, computeSlots, sheetSize, templatesFor, MAX_SLOTS, type LayoutInput } from '../../src/model/layout';
import { hitsSlot } from '../../src/model/style';
import type { Slot } from '../../src/model/types';
import type { Rect } from '../../src/model/types';

const base = (o: Partial<LayoutInput> = {}): LayoutInput => ({
  sheet: { preset: 'A4', w: 210, h: 297, orientation: 'portrait' },
  slotCount: 4,
  templateId: 'grid',
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

describe('Template catalogue (v1 rule 7, pages rule 16)', () => {
  it('has the agreed templates per Slot count', () => {
    expect(templatesFor(1).map((t) => t.id)).toEqual(['full']);
    expect(templatesFor(2).map((t) => t.id)).toEqual(['side', 'stack', 'diagonal', 'film', 'stripes', 'framed']);
    expect(templatesFor(3).map((t) => t.id)).toEqual(['large2', 'row3', 'diagonal', 'film', 'centre', 'stripes', 'framed']);
    expect(templatesFor(4).map((t) => t.id)).toEqual(['grid', 'large3', 'diagonal', 'film', 'centre', 'masonry', 'stripes', 'framed']);
    expect(templatesFor(6).map((t) => t.id)).toEqual(['grid', 'hero', 'mosaic', 'diagonal', 'film', 'centre', 'masonry', 'stripes', 'framed']);
    for (let n = 7; n <= 12; n++) expect(templatesFor(n).map((t) => t.id)).toEqual(['grid', 'hero', 'mosaic', 'diagonal', 'film', 'centre', 'masonry', 'framed']);
  });
});

const shoelace = (s: Slot) =>
  s.poly ? Math.abs(s.poly.reduce((a, p, i) => a + p.x * s.poly![(i + 1) % s.poly!.length].y - s.poly![(i + 1) % s.poly!.length].x * p.y, 0)) / 2 : s.w * s.h;

/** sample points: no point may lie in two Slots (polygons included) */
function overlapping(slots: Slot[], w: number, h: number) {
  for (let x = 0.7; x < w; x += 2.3)
    for (let y = 0.9; y < h; y += 2.3) {
      let k = 0;
      for (const s of slots) if (hitsSlot(s, 0, x, y)) k++;
      if (k > 1) return { x, y };
    }
  return null;
}

describe('Slots tile the content area (rules 9, 10)', () => {
  for (const orientation of ['portrait', 'landscape'] as const)
    for (let n = 1; n <= MAX_SLOTS; n++)
      for (let t = 0; t < templatesFor(n).length; t++)
        it(`${orientation} n=${n} t=${t}`, () => {
          const inp = base({ slotCount: n, templateId: templatesFor(n)[t].id, sheet: { preset: 'A4', w: 210, h: 297, orientation } });
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
          const id = templatesFor(n)[t].id;
          if (id === 'diagonal') expect(overlapping(slots, w, h)).toBeNull();
          else for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlap(slots[i], slots[j])).toBeCloseTo(0, 6);
          // without gap, tiling Templates fill the area exactly (film / framed leave room for their decoration)
          if (id !== 'film' && id !== 'framed') {
            const noGap = computeSlots({ ...inp, gap: 0 });
            const sum = noGap.reduce((s, r) => s + shoelace(r), 0);
            expect(sum).toBeCloseTo((w - 10) * (h - 10), 3);
          }
        });

  it('keeps the gap between neighbours', () => {
    const [a, b] = computeSlots(base({ slotCount: 2, templateId: 'side', gap: 7, sheet: { preset: 'A4', w: 210, h: 297, orientation: 'landscape' } }));
    expect(b.x - (a.x + a.w)).toBeCloseTo(7);
  });
});

describe('Orientation mirrors templates (rule 8)', () => {
  it('side-by-side becomes stacked in portrait', () => {
    const land = computeSlots(base({ slotCount: 2, templateId: 'side', sheet: { preset: 'A4', w: 210, h: 297, orientation: 'landscape' } }));
    const port = computeSlots(base({ slotCount: 2, templateId: 'side' }));
    expect(land[0].y).toBeCloseTo(land[1].y); // side by side
    expect(port[0].x).toBeCloseTo(port[1].x); // stacked
  });
});

describe('New Templates (pages rule 16)', () => {
  const land = { preset: 'A4', w: 210, h: 297, orientation: 'landscape' as const };
  it('Diagonal: slanted dividers, gap measured perpendicular, outer edges straight', () => {
    const slots = computeSlots(base({ slotCount: 2, templateId: 'diagonal', slant: 10, gap: 4, sheet: land }));
    const [a, b] = slots;
    expect(a.poly).toHaveLength(4);
    // divider edges are parallel and 4 mm apart perpendicular to them
    const [p1, p2] = [a.poly![1], a.poly![2]]; // right edge of a (top, bottom)
    const q = b.poly![0]; // top-left of b
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const dist = Math.abs(dx * (q.y - p1.y) - dy * (q.x - p1.x)) / Math.hypot(dx, dy);
    expect(dist).toBeCloseTo(4, 1);
    expect(Math.abs((Math.atan2(dx, dy) * 180) / Math.PI)).toBeCloseTo(10, 0);
    expect(a.poly![0].x).toBeCloseTo(5); // straight outer edge
    expect(a.poly![3].x).toBeCloseTo(5);
  });
  it('Filmstreifen: dark bands with sprocket holes, up to 4 per band', () => {
    const l = computeLayout(base({ slotCount: 6, templateId: 'film', sheet: land }));
    expect(l.slots).toHaveLength(6);
    const bands = l.decor.filter((d) => d.fill === '#161616');
    expect(bands).toHaveLength(2);
    expect(l.decor.filter((d) => d.fill === '#f4f4f4').length).toBeGreaterThan(20);
    for (const s of l.slots) expect(bands.some((b) => s.x >= b.x && s.y >= b.y && s.x + s.w <= b.x + b.w && s.y + s.h <= b.y + b.h)).toBe(true);
  });
  it('Mittelpunkt: largest Slot first and in the middle', () => {
    const s = computeSlots(base({ slotCount: 7, templateId: 'centre', sheet: land }));
    const areas = s.map((r) => r.w * r.h);
    expect(areas[0]).toBe(Math.max(...areas));
    expect(s[0].x + s[0].w / 2).toBeCloseTo(297 / 2, -1);
  });
  it('Spalten versetzt: rows do not line up between neighbouring columns', () => {
    const s = computeSlots(base({ slotCount: 6, templateId: 'masonry', sheet: land }));
    const tops = (x: number) => s.filter((r) => Math.abs(r.x - x) < 0.01).map((r) => Math.round(r.y * 10) / 10);
    const xs = [...new Set(s.map((r) => Math.round(r.x * 100) / 100))];
    expect(xs.length).toBeGreaterThanOrEqual(2);
    expect(tops(xs[0]).slice(1)).not.toEqual(tops(xs[1]).slice(1));
  });
  it('Streifen: full-width horizontal bands in both orientations', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
      const sh = { preset: 'A4', w: 210, h: 297, orientation };
      const s = computeSlots(base({ slotCount: 3, templateId: 'stripes', sheet: sh }));
      for (const r of s) expect(r.w).toBeCloseTo(sheetSize(sh).w - 10);
    }
  });
  it('Rahmen-Raster: inset grid plus two printed lines', () => {
    const l = computeLayout(base({ slotCount: 4, templateId: 'framed' }));
    expect(l.decor.filter((d) => d.stroke)).toHaveLength(2);
    for (const r of l.slots) expect(r.x).toBeGreaterThan(5 + 10);
  });
});
