import type { Collage, Decor, LayoutMode, PhotoSize, Point, Rect, Sheet, Slot } from './types';

export const SHEET_PRESETS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'A4', label: 'A4', w: 210, h: 297 },
  { id: 'A5', label: 'A5', w: 148, h: 210 },
  { id: 'A3', label: 'A3', w: 297, h: 420 },
  { id: 'Letter', label: 'Letter', w: 215.9, h: 279.4 },
  { id: '10x15', label: '10 × 15 cm', w: 100, h: 150 },
  { id: '13x18', label: '13 × 18 cm', w: 130, h: 180 },
  { id: '20x30', label: '20 × 30 cm', w: 200, h: 300 },
];

export const PHOTO_SIZES: { id: string; label: string; w: number; h: number; same: boolean; tip?: string }[] = [
  { id: 'passbild', label: 'Passbild', w: 35, h: 45, same: true, tip: 'Passbild 35 × 45 mm. Hinweis: Personalausweis und Reisepass brauchen seit Mai 2025 ein digitales Foto (Fotostudio oder Behörde).' },
  { id: 'bewerbung', label: 'Bewerbungsfoto', w: 45, h: 60, same: true },
  { id: 'us', label: 'US-Pass 2 × 2″', w: 50.8, h: 50.8, same: false },
  { id: 'square50', label: 'Quadrat 50', w: 50, h: 50, same: false },
  { id: '9x13', label: '9 × 13', w: 90, h: 130, same: false },
  { id: '10x15', label: '10 × 15', w: 100, h: 150, same: false },
  { id: '13x18', label: '13 × 18', w: 130, h: 180, same: false },
];

/** Photo size in mm as placed (orientation applied; square sizes ignore it). */
export function photoSizeDims(p: PhotoSize): { w: number; h: number } {
  const short = Math.min(p.w, p.h);
  const long = Math.max(p.w, p.h);
  return p.orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long };
}

/** How many fixed-size Slots fit on the Sheet (rule 3), capped at MAX_SLOTS. */
export function fixedCapacity(sheet: Sheet, margin: number, gap: number, ps: PhotoSize) {
  const { w: W, h: H } = sheetSize(sheet);
  const { w, h } = photoSizeDims(ps);
  const eps = 1e-6;
  const cols = Math.max(0, Math.floor((W - 2 * margin + gap + eps) / (w + gap)));
  const rows = Math.max(0, Math.floor((H - 2 * margin + gap + eps) / (h + gap)));
  return { cols, rows, max: Math.min(MAX_SLOTS, cols * rows) };
}

export const MIN_SLOTS = 1;
export const MAX_SLOTS = 12;

/** Sheet size in mm as printed (orientation applied). */
export function sheetSize(s: Sheet): { w: number; h: number } {
  const short = Math.min(s.w, s.h);
  const long = Math.max(s.w, s.h);
  return s.orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long };
}

/** Split tree. Defined for a landscape-like area ("row" = side by side). */
export type Node = { leaf: true } | { dir: 'row' | 'col'; parts: { weight: number; node: Node }[] };

const L: Node = { leaf: true };
const row = (...parts: (Node | [number, Node])[]): Node => ({ dir: 'row', parts: parts.map(norm) });
const col = (...parts: (Node | [number, Node])[]): Node => ({ dir: 'col', parts: parts.map(norm) });
function norm(p: Node | [number, Node]) {
  return Array.isArray(p) ? { weight: p[0], node: p[1] } : { weight: 1, node: p };
}

/** Evenly filled grid for n cells in an area of aspect a (= w/h). Rows each span full width. */
export function gridNode(n: number, a: number): Node {
  if (n === 1) return L;
  let best = { rows: 1, score: Infinity };
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    const cellAspect = a * rows / cols;
    const empty = rows * cols - n;
    const score = Math.abs(Math.log(cellAspect / 1.33)) + empty * 0.15;
    if (score < best.score) best = { rows, score };
  }
  const rows = best.rows;
  const base = Math.floor(n / rows);
  let extra = n % rows;
  const rs: Node[] = [];
  for (let r = 0; r < rows; r++) {
    const k = base + (extra-- > 0 ? 1 : 0);
    rs.push(k === 1 ? L : row(...Array.from({ length: k }, () => L)));
  }
  return rs.length === 1 ? rs[0] : col(...rs);
}

function mosaicNode(n: number, a: number): Node {
  const rowsCount = Math.max(1, Math.round(Math.sqrt(n / Math.max(a, 0.5) / 1.1)));
  const rows = Math.min(rowsCount, n);
  const base = Math.floor(n / rows);
  let extra = n % rows;
  const rs: Node[] = [];
  for (let r = 0; r < rows; r++) {
    const k = base + (extra-- > 0 ? 1 : 0);
    const parts: [number, Node][] = Array.from({ length: k }, (_, i) => [(i + r) % 3 === 0 ? 1.7 : 1, L]);
    rs.push(k === 1 ? L : row(...parts));
  }
  return rs.length === 1 ? rs[0] : col(...rs);
}

function heroNode(n: number, a: number): Node {
  // hero takes ~55 % of the long side, the rest is a grid
  const restAspect = (a * 0.45);
  return row([1.25, L], [1, gridNode(n - 1, restAspect)]);
}

export interface Layout {
  slots: Slot[];
  decor: Decor[];
}

/** Content area in a "wide frame": u runs along the long side (length U), v along the short side (V). */
interface Frame {
  U: number;
  V: number;
  pt: (u: number, v: number) => Point;
  rect: (u: number, v: number, du: number, dv: number) => Rect;
}

function frameOf(area: Rect): Frame {
  const wide = area.w >= area.h;
  const U = wide ? area.w : area.h;
  const V = wide ? area.h : area.w;
  const pt = (u: number, v: number): Point => (wide ? { x: area.x + u, y: area.y + v } : { x: area.x + v, y: area.y + u });
  const rect = (u: number, v: number, du: number, dv: number): Rect =>
    wide ? { x: area.x + u, y: area.y + v, w: du, h: dv } : { x: area.x + v, y: area.y + u, w: dv, h: du };
  return { U, V, pt, rect };
}

const bbox = (poly: Point[]): Rect => {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

/** Split n cells into rows of a near-even grid for aspect a (= U/V). */
function gridRows(n: number, a: number): number[] {
  let best = { rows: 1, score: Infinity };
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    const score = Math.abs(Math.log((a * rows) / cols / 1.33)) + (rows * cols - n) * 0.15;
    if (score < best.score) best = { rows, score };
  }
  const base = Math.floor(n / best.rows);
  let extra = n % best.rows;
  return Array.from({ length: best.rows }, () => base + (extra-- > 0 ? 1 : 0));
}

function rowBands(count: number, V: number, gap: number) {
  const bh = (V - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, r) => ({ v0: r * (bh + gap), v1: r * (bh + gap) + bh }));
}

/** Diagonal: rows whose dividers are slanted by `slant` degrees, alternating per row (rule 16). */
function diagonalLayout(n: number, area: Rect, gap: number, slant: number): Layout {
  const f = frameOf(area);
  const rows = gridRows(n, f.U / f.V);
  const bands = rowBands(rows.length, f.V, gap);
  const ang = (Math.max(0, Math.min(30, slant)) * Math.PI) / 180;
  const g2 = gap / 2 / Math.cos(ang);
  const slots: Slot[] = [];
  rows.forEach((k, r) => {
    const { v0, v1 } = bands[r];
    const cw = (f.U - (k - 1) * gap) / k;
    const t = Math.min(((v1 - v0) / 2) * Math.tan(ang), Math.max(0, cw / 2 - g2 - 0.5)) * (r % 2 ? -1 : 1);
    const centre = (j: number) => j * cw + (j - 0.5) * gap; // divider j (1..k-1)
    for (let c = 0; c < k; c++) {
      const lt = c === 0 ? 0 : centre(c) + t + g2;
      const lb = c === 0 ? 0 : centre(c) - t + g2;
      const rt = c === k - 1 ? f.U : centre(c + 1) + t - g2;
      const rb = c === k - 1 ? f.U : centre(c + 1) - t - g2;
      const poly = [f.pt(lt, v0), f.pt(rt, v0), f.pt(rb, v1), f.pt(lb, v1)];
      slots.push({ ...bbox(poly), poly });
    }
  });
  return { slots, decor: [] };
}

/** Filmstreifen: dark bands with sprocket holes, up to 4 Slots per band (rule 16). */
function filmLayout(n: number, area: Rect, gap: number): Layout {
  const f = frameOf(area);
  const bandsN = Math.ceil(n / 4);
  const base = Math.floor(n / bandsN);
  let extra = n % bandsN;
  const counts = Array.from({ length: bandsN }, () => base + (extra-- > 0 ? 1 : 0));
  const bands = rowBands(bandsN, f.V, gap);
  const slots: Slot[] = [];
  const decor: Decor[] = [];
  counts.forEach((k, r) => {
    const { v0, v1 } = bands[r];
    const bh = v1 - v0;
    const strip = bh * 0.13;
    decor.push({ ...f.rect(0, v0, f.U, bh), fill: '#161616' });
    const hw = strip * 0.5;
    const hh = strip * 0.42;
    const pitch = hw * 2.2;
    const holes = Math.floor((f.U - hw) / pitch);
    const off = (f.U - (holes - 1) * pitch - hw) / 2;
    for (let i = 0; i < holes; i++)
      for (const vv of [v0 + (strip - hh) / 2, v1 - strip + (strip - hh) / 2])
        decor.push({ ...f.rect(off + i * pitch, vv, hw, hh), fill: '#f4f4f4', radius: hw * 0.2 });
    const inner = Math.max(gap, strip * 0.5);
    const cw = (f.U - 2 * inner - (k - 1) * inner) / k;
    for (let c = 0; c < k; c++) slots.push(f.rect(inner + c * (cw + inner), v0 + strip, cw, bh - 2 * strip));
  });
  return { slots, decor };
}

/** Rahmen-Raster: grid inset by an extra border with a printed double line (rule 16). */
function framedGridLayout(n: number, area: Rect, gap: number): Layout {
  const inset = Math.min(area.w, area.h) * 0.07;
  const inner: Rect = { x: area.x + inset, y: area.y + inset, w: area.w - 2 * inset, h: area.h - 2 * inset };
  const wide = inner.w >= inner.h;
  const a = wide ? inner.w / inner.h : inner.h / inner.w;
  let tree = gridNode(n, a);
  if (!wide) tree = transpose(tree);
  const slots: Rect[] = [];
  place(tree, inner, gap, slots);
  const line = (d: number): Decor => ({ x: area.x + d, y: area.y + d, w: area.w - 2 * d, h: area.h - 2 * d, stroke: '#3a3a3a', lineWidth: 0.35 });
  return { slots, decor: [line(inset * 0.25), line(inset * 0.5)] };
}

/** Streifen: full-width horizontal bands regardless of orientation (rule 16). */
function stripesLayout(n: number, area: Rect, gap: number): Layout {
  const slots: Rect[] = [];
  place(col(...Array.from({ length: n }, () => L)), area, gap, slots);
  return { slots, decor: [] };
}

function centreNode(n: number): Node {
  const others = n - 1;
  if (others <= 5) {
    const left = Math.ceil(others / 2);
    const right = others - left;
    const side = (k: number) => (k === 1 ? L : col(...Array.from({ length: k }, () => L)));
    return right ? row([1, side(left)], [2.2, L], [1, side(right)]) : row([2.2, L], [1, side(left)]);
  }
  const rest = others - 2; // one above, one below the centre
  const left = Math.ceil(rest / 2);
  const right = rest - left;
  const side = (k: number) => (k === 1 ? L : col(...Array.from({ length: k }, () => L)));
  return row([1, side(left)], [2.2, col([1, L], [2.4, L], [1, L])], [1, side(right)]);
}

function masonryNode(n: number): Node {
  const cols = n <= 5 ? 2 : n <= 9 ? 3 : 4;
  const base = Math.floor(n / cols);
  let extra = n % cols;
  const pattern = [1.35, 1, 1.15, 0.85];
  return row(
    ...Array.from({ length: cols }, (_, c) => {
      const k = base + (extra-- > 0 ? 1 : 0);
      const parts: [number, Node][] = Array.from({ length: k }, (_, i) => [pattern[(i + c * 2) % pattern.length], L]);
      return k === 1 ? L : col(...parts);
    }),
  );
}

export interface TemplateDef {
  id: string;
  label: string;
  build?: (a: number) => Node;
  special?: (n: number, area: Rect, gap: number, slant: number) => Layout;
  /** put the largest Slot first (Mittelpunkt) */
  largestFirst?: boolean;
}

/** Template catalogue per Slot count (v1 + rule 16). */
export function templatesFor(n: number): TemplateDef[] {
  const base: TemplateDef[] = (() => {
    switch (n) {
      case 1:
        return [{ id: 'full', label: 'Vollflächig', build: () => L }];
      case 2:
        return [
          { id: 'side', label: 'Nebeneinander', build: () => row(L, L) },
          { id: 'stack', label: 'Übereinander', build: () => col(L, L) },
        ];
      case 3:
        return [
          { id: 'large2', label: 'Groß + 2', build: () => row([2, L], [1, col(L, L)]) },
          { id: 'row3', label: 'Reihe', build: () => row(L, L, L) },
        ];
      case 4:
        return [
          { id: 'grid', label: '2 × 2', build: () => col(row(L, L), row(L, L)) },
          { id: 'large3', label: 'Groß + 3', build: () => row([2, L], [1, col(L, L, L)]) },
        ];
      default:
        return [
          { id: 'grid', label: 'Raster', build: (a) => gridNode(n, a) },
          { id: 'hero', label: 'Hero', build: (a) => heroNode(n, a) },
          { id: 'mosaic', label: 'Mosaik', build: (a) => mosaicNode(n, a) },
        ];
    }
  })();
  const extra: TemplateDef[] = [];
  if (n >= 2) extra.push({ id: 'diagonal', label: 'Diagonal', special: (k, a, g, s) => diagonalLayout(k, a, g, s) });
  if (n >= 2) extra.push({ id: 'film', label: 'Filmstreifen', special: (k, a, g) => filmLayout(k, a, g) });
  if (n >= 3) extra.push({ id: 'centre', label: 'Mittelpunkt', build: () => centreNode(n), largestFirst: true });
  if (n >= 4) extra.push({ id: 'masonry', label: 'Spalten versetzt', build: () => masonryNode(n) });
  if (n >= 2 && n <= 6) extra.push({ id: 'stripes', label: 'Streifen', special: (k, a, g) => stripesLayout(k, a, g) });
  if (n >= 2) extra.push({ id: 'framed', label: 'Rahmen-Raster', special: (k, a, g) => framedGridLayout(k, a, g) });
  return [...base, ...extra];
}

/** The Template used for a Slot count: the chosen id if offered, otherwise the first one ("same choice, clamped"). */
export function templateFor(n: number, id: string): TemplateDef {
  const t = templatesFor(n);
  return t.find((x) => x.id === id) ?? t[0];
}

function transpose(nd: Node): Node {
  if ('leaf' in nd) return nd;
  return { dir: nd.dir === 'row' ? 'col' : 'row', parts: nd.parts.map((p) => ({ weight: p.weight, node: transpose(p.node) })) };
}

function place(nd: Node, r: Rect, gap: number, out: Rect[]) {
  if ('leaf' in nd) {
    out.push(r);
    return;
  }
  const horiz = nd.dir === 'row';
  const total = (horiz ? r.w : r.h) - gap * (nd.parts.length - 1);
  const wsum = nd.parts.reduce((s, p) => s + p.weight, 0);
  let pos = horiz ? r.x : r.y;
  nd.parts.forEach((p, i) => {
    const last = i === nd.parts.length - 1;
    const end = horiz ? r.x + r.w : r.y + r.h;
    const len = last ? end - pos : (total * p.weight) / wsum;
    const sub: Rect = horiz ? { x: pos, y: r.y, w: len, h: r.h } : { x: r.x, y: pos, w: r.w, h: len };
    place(p.node, sub, gap, out);
    pos += len + gap;
  });
}

export interface LayoutInput {
  sheet: Sheet;
  mode?: LayoutMode;
  photoSize?: PhotoSize;
  slotCount: number;
  templateId?: string;
  slant?: number;
  gap: number;
  margin: number;
}

/** Slots (mm, Slot order) and printed decoration of one Page. */
export function computeLayout(c: LayoutInput): Layout {
  if (c.mode === 'fixed' && c.photoSize) return { slots: fixedSlots(c as LayoutInput & { photoSize: PhotoSize }), decor: [] };
  if (c.slotCount <= 0) return { slots: [], decor: [] };
  const { w, h } = sheetSize(c.sheet);
  const area: Rect = { x: c.margin, y: c.margin, w: Math.max(1, w - 2 * c.margin), h: Math.max(1, h - 2 * c.margin) };
  const tpl = templateFor(c.slotCount, c.templateId ?? '');
  if (tpl.special) return tpl.special(c.slotCount, area, c.gap, c.slant ?? 10);
  const wide = area.w >= area.h;
  const a = wide ? area.w / area.h : area.h / area.w;
  let tree = tpl.build!(a);
  if (!wide) tree = transpose(tree);
  const out: Rect[] = [];
  place(tree, area, c.gap, out);
  if (tpl.largestFirst) {
    const i = out.reduce((b, r, k) => (r.w * r.h > out[b].w * out[b].h ? k : b), 0);
    out.unshift(...out.splice(i, 1));
  }
  return { slots: out, decor: [] };
}

/** Slot rectangles in mm, in Slot order. */
export function computeSlots(c: LayoutInput): Slot[] {
  return computeLayout(c).slots;
}

/** Fixed-size grid, centred, filled row by row (rules 2, 4). */
function fixedSlots(c: LayoutInput & { photoSize: PhotoSize }): Rect[] {
  const { cols, max } = fixedCapacity(c.sheet, c.margin, c.gap, c.photoSize);
  const n = Math.min(c.slotCount, max);
  if (n <= 0) return [];
  const { w: W, h: H } = sheetSize(c.sheet);
  const { w, h } = photoSizeDims(c.photoSize);
  const usedCols = Math.min(cols, n);
  const usedRows = Math.ceil(n / cols);
  const x0 = (W - (usedCols * w + (usedCols - 1) * c.gap)) / 2;
  const y0 = (H - (usedRows * h + (usedRows - 1) * c.gap)) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (w + c.gap), y: y0 + Math.floor(i / cols) * (h + c.gap), w, h }));
}

/** Layout of Page p (its own Slot count, shared Template choice). */
export function pageLayout(c: Collage, p: number): Layout {
  const page = c.pages[p];
  return computeLayout({ ...c, slotCount: page ? page.slots.length : 0 });
}

export function collageSlots(c: Collage, p: number): Slot[] {
  return pageLayout(c, p).slots;
}
