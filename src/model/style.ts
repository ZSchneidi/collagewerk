import type { Collage, Placed, Point, Rect, Slot, Style } from './types';

export const defaultStyle = (): Style => ({
  frame: 'none',
  frameColor: '#1f2937',
  frameWidth: 4,
  radius: 0,
  shadow: false,
  edges: 'hard',
  scatter: false,
  seed: 1,
});

export const SCATTER_MAX = 6;
export const TILT_MAX = 15;

/** Style only applies in Frei mode (rule 18). */
export const styleActive = (c: Collage) => c.mode === 'free';

/** Deterministic pseudo-random number in [0,1) from seed, Page and Slot index (mulberry32). */
export function rand(seed: number, page: number, slot: number) {
  let t = (seed * 0x9e3779b1 + page * 0x85ebca6b + slot * 0xc2b2ae35) >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Tilt of a Photo in degrees (rule 23): hand-set or seeded in [−6°, +6°]; 0 without Scatter. */
export function tiltOf(c: Collage, page: number, slot: number, it: Placed | null | undefined): number {
  if (!styleActive(c) || !c.style.scatter) return 0;
  if (it && typeof it.tilt === 'number') return it.tilt;
  return (rand(c.style.seed, page, slot) * 2 - 1) * SCATTER_MAX;
}

/** Shrink factor so a w×h rectangle tilted by `deg` fits inside w×h (rule 23). */
export function tiltFit(w: number, h: number, deg: number) {
  if (!deg) return 1;
  const a = Math.abs((deg * Math.PI) / 180);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Math.min(w / (w * c + h * s), h / (w * s + h * c));
}

/** Frame insets in mm (top, right, bottom, left) for a Slot. Polygon Slots get a uniform inset. */
export function frameInsets(c: Collage, slot: Slot) {
  const st = c.style;
  if (!styleActive(c) || st.frame === 'none') return { t: 0, r: 0, b: 0, l: 0 };
  const w = Math.min(st.frameWidth, Math.min(slot.w, slot.h) / 4);
  const bottom = st.frame === 'polaroid' && !slot.poly ? Math.min(w * 3.5, slot.h / 3) : w;
  return { t: w, r: w, b: bottom, l: w };
}

/** The area the Photo fills inside its Slot (before Tilt): Slot minus Frame (rule 19). */
export function photoArea(c: Collage, slot: Slot): Rect {
  const i = frameInsets(c, slot);
  return { x: slot.x + i.l, y: slot.y + i.t, w: Math.max(1, slot.w - i.l - i.r), h: Math.max(1, slot.h - i.t - i.b) };
}

export function frameFill(st: Style) {
  return st.frame === 'color' ? st.frameColor : '#ffffff';
}

function pointInPoly(p: Point, poly: Point[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Is point (mm) inside the visible shape of a Slot (tilted rectangle or polygon)? (rule 24) */
export function hitsSlot(slot: Slot, tiltDeg: number, x: number, y: number) {
  const cx = slot.x + slot.w / 2;
  const cy = slot.y + slot.h / 2;
  let px = x - cx;
  let py = y - cy;
  if (tiltDeg) {
    const a = (-tiltDeg * Math.PI) / 180;
    const f = tiltFit(slot.w, slot.h, tiltDeg);
    [px, py] = [(px * Math.cos(a) - py * Math.sin(a)) / f, (px * Math.sin(a) + py * Math.cos(a)) / f];
  }
  const q = { x: px + cx, y: py + cy };
  if (slot.poly) return pointInPoly(q, slot.poly);
  return q.x >= slot.x && q.x <= slot.x + slot.w && q.y >= slot.y && q.y <= slot.y + slot.h;
}
