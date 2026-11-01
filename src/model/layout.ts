import type { Collage, LayoutMode, PhotoSize, Rect, Sheet } from './types';

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

export interface TemplateDef {
  id: string;
  label: string;
  build: (a: number) => Node;
}

/** Template catalogue per Slot count. `a` = long/short aspect of the content area (>= 1). */
export function templatesFor(n: number): TemplateDef[] {
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
  templateIndex: number;
  gap: number;
  margin: number;
}

/** Slot rectangles in mm, in Slot order. */
export function computeSlots(c: LayoutInput): Rect[] {
  if (c.mode === 'fixed' && c.photoSize) return fixedSlots(c as Required<Pick<LayoutInput, 'sheet' | 'photoSize'>> & LayoutInput);
  const { w, h } = sheetSize(c.sheet);
  const area: Rect = { x: c.margin, y: c.margin, w: Math.max(1, w - 2 * c.margin), h: Math.max(1, h - 2 * c.margin) };
  const tpls = templatesFor(c.slotCount);
  const tpl = tpls[Math.min(c.templateIndex, tpls.length - 1)];
  const wide = area.w >= area.h;
  const a = wide ? area.w / area.h : area.h / area.w;
  let tree = tpl.build(a);
  if (!wide) tree = transpose(tree);
  const out: Rect[] = [];
  place(tree, area, c.gap, out);
  return out;
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

export function collageSlots(c: Collage): Rect[] {
  return computeSlots(c);
}
