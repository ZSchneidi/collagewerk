import { defaultCrop } from './crop';
import { fixedCapacity, MAX_SLOTS, MIN_SLOTS, PHOTO_SIZES, SHEET_PRESETS, templatesFor } from './layout';
import { defaultStyle } from './style';
import type { Collage, Crop, LayoutMode, Page, PhotoMeta, PhotoSize, Placed } from './types';

export function createCollage(): Collage {
  return {
    sheet: { preset: 'A4', w: 210, h: 297, orientation: 'portrait' },
    mode: 'free',
    photoSize: { preset: 'passbild', w: 35, h: 45, orientation: 'portrait' },
    samePhoto: true,
    cutMarks: true,
    slotCount: 4,
    templateId: 'grid',
    slant: 10,
    gap: 3,
    margin: 5,
    background: '#ffffff',
    style: defaultStyle(),
    pages: [{ slots: [null, null, null, null] }],
    tray: [],
    photos: {},
  };
}

const clone = (c: Collage): Collage => structuredClone(c);
const emptySlots = (n: number) => Array.from({ length: Math.max(0, n) }, () => null as Placed | null);
const placedOf = (p: Page) => p.slots.filter((x): x is Placed => !!x);
const allPlaced = (c: Collage) => c.pages.flatMap(placedOf);

type Legacy = Partial<Collage> & { slots?: (Placed | null)[]; templateIndex?: number };

/** Fill in fields added later; v1 single-page collages (`slots`, `templateIndex`) become one Page (pages rule 10). */
export function withDefaults(raw: Legacy): Collage {
  const d = createCollage();
  const c = { ...d, ...raw, photoSize: { ...d.photoSize, ...(raw.photoSize ?? {}) }, style: { ...d.style, ...(raw.style ?? {}) } } as Collage & Legacy;
  if (!raw.pages) c.pages = [{ slots: raw.slots ?? d.pages[0].slots }];
  if (!raw.templateId) {
    const n = raw.slotCount ?? d.slotCount;
    c.templateId = templatesFor(n)[Math.min(raw.templateIndex ?? 0, templatesFor(n).length - 1)]?.id ?? 'grid';
  }
  delete c.slots;
  delete c.templateIndex;
  return c;
}

export const isSame = (c: Collage) => c.mode === 'fixed' && c.samePhoto;
export const capacity = (c: Collage) => fixedCapacity(c.sheet, c.margin, c.gap, c.photoSize);

/** Upper limit for Photos per Page in the current Layout mode. */
export function maxSlots(c: Collage) {
  return c.mode === 'fixed' ? capacity(c).max : MAX_SLOTS;
}

const firstPlaced = (c: Collage) => allPlaced(c)[0] ?? null;
export const isLastPage = (c: Collage, p: number) => p === c.pages.length - 1;

/**
 * Derived constraints applied after every change:
 * - fixed mode: Photos per Page never exceed what fits (photo sizes rule 5)
 * - Same photo mode: one Page, every Slot the same Photo + Crop (photo sizes rules 12, 13; pages rule 9)
 * - Page sizes: every Page has Photos per Page Slots, the last of several is auto-sized (pages rules 3, 4)
 */
export function normalize(c0: Collage): Collage {
  let c = c0;
  if (c.mode === 'fixed' && c.slotCount > capacity(c).max) c = setSlotCount(c, capacity(c).max);
  c = clone(c);
  const n = c.slotCount;
  if (isSame(c)) {
    if (c.pages.length > 1) {
      const keep = firstPlaced(c);
      const seen = new Set(keep ? [keep.photoId] : []);
      for (const it of c.pages.slice(1).flatMap(placedOf)) if (!seen.has(it.photoId)) (seen.add(it.photoId), c.tray.push(it));
      c.pages = [c.pages[0]];
    }
    const src = firstPlaced(c);
    c.pages[0] = { slots: Array.from({ length: n }, () => (src ? structuredClone(src) : null)) };
    return c;
  }
  const last = c.pages.length - 1;
  c.pages = c.pages.map((pg, i) => {
    if (i < last || c.pages.length === 1) return { slots: fit(pg.slots, n, c) };
    if (pg.count !== undefined) {
      const count = Math.max(1, Math.min(n, pg.count));
      return { slots: fit(pg.slots, count, c), count };
    }
    const placed = placedOf(pg);
    return { slots: placed.length ? placed.slice(0, n) : [null] };
  });
  return c;
}

/** Pad with empty Slots or trim to length; trimmed Photos go to the tray (safety net). */
function fit(slots: (Placed | null)[], n: number, c: Collage) {
  const out = slots.slice(0, n);
  for (const it of slots.slice(n)) if (it) c.tray.push(it);
  while (out.length < n) out.push(null);
  return out;
}

/** Change Photos per Page and repaginate all placed Photos in order (pages rule 6). */
export function setSlotCount(c0: Collage, n: number): Collage {
  const c = clone(c0);
  const min = c.mode === 'fixed' ? 0 : MIN_SLOTS;
  n = Math.max(min, Math.min(maxSlots(c), Math.round(n)));
  c.slotCount = n;
  if (isSame(c)) {
    const src = firstPlaced(c);
    if (n === 0 && src) c.tray.push(src);
    c.pages = [{ slots: Array.from({ length: n }, () => (src && n ? structuredClone(src) : null)) }];
    return c;
  }
  const placed = allPlaced(c);
  if (n === 0) {
    c.tray.push(...placed);
    c.pages = [{ slots: [] }];
    return c;
  }
  const pages: Page[] = [];
  for (let i = 0; i < placed.length; i += n) pages.push({ slots: placed.slice(i, i + n) });
  c.pages = pages.length ? pages : [{ slots: emptySlots(n) }];
  return c;
}

/** Switch Layout mode (photo sizes rules 1, 6, 17). */
export function setLayoutMode(c0: Collage, mode: LayoutMode): Collage {
  if (c0.mode === mode) return c0;
  let c = clone(c0);
  c.mode = mode;
  if (mode === 'fixed') {
    c.gap = 2;
    c = setSlotCount(c, capacity(c).max);
    if (c.samePhoto) c = setSamePhoto({ ...c, samePhoto: false }, true);
  } else if (c.slotCount < MIN_SLOTS) c = setSlotCount(c, MIN_SLOTS);
  return c;
}

/** Choose a Photo size (photo sizes rules 7, 11). */
export function setPhotoSize(c0: Collage, ps: PhotoSize): Collage {
  let c = clone(c0);
  const presetChanged = ps.preset !== c.photoSize.preset;
  c.photoSize = ps;
  if (presetChanged) {
    const def = PHOTO_SIZES.find((p) => p.id === ps.preset);
    c = setSamePhoto(c, def ? def.same : false);
  }
  if (c.mode === 'fixed') c = setSlotCount(c, capacity(c).max);
  return c;
}

/** Same photo mode on/off (photo sizes rules 11, 14). Turning on keeps the first Photo; other Photos go to the tray. */
export function setSamePhoto(c0: Collage, on: boolean): Collage {
  if (c0.samePhoto === on) return c0;
  const c = clone(c0);
  c.samePhoto = on;
  if (on && c.mode === 'fixed') {
    const src = firstPlaced(c);
    const seen = new Set(src ? [src.photoId] : []);
    for (const s of allPlaced(c)) if (!seen.has(s.photoId)) (seen.add(s.photoId), c.tray.push(s));
    c.pages = [{ slots: c.pages[0]?.slots.map(() => (src ? structuredClone(src) : null)) ?? [] }];
  }
  return c;
}

/** Smallest preset Sheet (current orientation) on which at least one fixed Slot fits (photo sizes rule 9). */
export function fitSheet(c: Collage): Collage | null {
  const sorted = [...SHEET_PRESETS].sort((a, b) => a.w * a.h - b.w * b.h);
  for (const p of sorted) {
    const sheet = { ...c.sheet, preset: p.id, w: p.w, h: p.h };
    const max = fixedCapacity(sheet, c.margin, c.gap, c.photoSize).max;
    if (max >= 1) return setSlotCount({ ...c, sheet }, max);
  }
  return null;
}

/** Find (page, slot) of the first empty Slot from Page `from` onward, all Pages counted at full size. */
function firstEmpty(c: Collage, from: number): [number, number] | null {
  for (let p = Math.max(0, from); p < c.pages.length; p++) {
    const pg = c.pages[p];
    // a hand-set count holds until the Page fills up (rule 4)
    if (pg.count !== undefined && placedOf(pg).length >= pg.count) delete pg.count;
    const cap = pg.count !== undefined && isLastPage(c, p) ? pg.count : c.slotCount;
    while (pg.slots.length < cap) pg.slots.push(null);
    const i = pg.slots.findIndex((x) => !x);
    if (i >= 0 && i < cap) return [p, i];
  }
  return null;
}

/**
 * Place new Photos (pages rule 2): a single Photo onto `target` replaces that Slot (old one to tray);
 * otherwise empty Slots fill from Page `page` onward and new Pages are appended. Same photo mode: one Photo everywhere.
 */
export function addPhotos(c0: Collage, metas: PhotoMeta[], target?: number, page = 0): Collage {
  const c = clone(c0);
  for (const m of metas) c.photos[m.id] = m;
  const items: Placed[] = metas.map((m) => ({ photoId: m.id, crop: defaultCrop() }));
  if (!items.length) return c;
  if (isSame(c)) {
    const old = firstPlaced(c);
    if (old) c.tray.push(old);
    c.pages = [{ slots: c.pages[0].slots.map(() => structuredClone(items[0])) }];
    c.tray.push(...items.slice(1));
    return c;
  }
  const pg = c.pages[page];
  if (target !== undefined && items.length === 1 && pg && target >= 0 && target < pg.slots.length) {
    const old = pg.slots[target];
    if (old) c.tray.push(old);
    pg.slots[target] = items[0];
    return c;
  }
  placeInOrder(c, items, page);
  return c;
}

function placeInOrder(c: Collage, items: Placed[], from: number) {
  for (const it of items) {
    if (c.slotCount <= 0) {
      c.tray.push(it);
      continue;
    }
    const at = firstEmpty(c, from);
    if (at) c.pages[at[0]].slots[at[1]] = it;
    else {
      const last = c.pages[c.pages.length - 1];
      if (last) delete last.count;
      c.pages.push({ slots: [it, ...emptySlots(c.slotCount - 1)] });
    }
  }
}

/** Put Placed items onto Page p: its first empty Slot, otherwise a new Page right after it (pages rule 8). */
function placeOnPage(c: Collage, items: Placed[], p: number) {
  let target = p;
  for (const it of items) {
    const pg = c.pages[target];
    const cap = pg.count !== undefined && isLastPage(c, target) ? pg.count : c.slotCount;
    while (pg.slots.length < cap) pg.slots.push(null);
    const i = pg.slots.findIndex((x) => !x);
    if (i >= 0 && i < cap) pg.slots[i] = it;
    else {
      c.pages.splice(target + 1, 0, { slots: [it, ...emptySlots(c.slotCount - 1)] });
      target++;
    }
  }
}

export function addPhotosToPage(c0: Collage, metas: PhotoMeta[], p: number): Collage {
  if (isSame(c0)) return addPhotos(c0, metas);
  const c = clone(c0);
  for (const m of metas) c.photos[m.id] = m;
  placeOnPage(c, metas.map((m) => ({ photoId: m.id, crop: defaultCrop() })), p);
  return c;
}

/** Drop the last Page when a removal left it empty (pages rule 7). */
function dropIfEmptyLast(c: Collage, p: number) {
  if (c.pages.length > 1 && isLastPage(c, p) && placedOf(c.pages[p]).length === 0) c.pages.pop();
}

/** Swap or move between Slots of one Page (v1 rule 17). */
export function moveSlot(c0: Collage, p: number, from: number, to: number): Collage {
  if (from === to) return c0;
  const c = clone(c0);
  const s = c.pages[p].slots;
  [s[from], s[to]] = [s[to], s[from]];
  return c;
}

/** Move a Photo from a Slot onto another Page (pages rule 8). */
export function moveToPage(c0: Collage, fp: number, from: number, tp: number): Collage {
  if (fp === tp || isSame(c0)) return c0;
  const c = clone(c0);
  const it = c.pages[fp].slots[from];
  if (!it) return c0;
  c.pages[fp].slots[from] = null;
  placeOnPage(c, [it], tp);
  dropIfEmptyLast(c, fp);
  return c;
}

/** Tray → Slot; the displaced Photo goes to the tray (v1 rule 18). */
export function trayToSlot(c0: Collage, trayIndex: number, p: number, slot: number): Collage {
  const c = clone(c0);
  const [it] = c.tray.splice(trayIndex, 1);
  if (!it) return c0;
  if (isSame(c)) {
    const prev = firstPlaced(c);
    c.pages = [{ slots: c.pages[0].slots.map(() => structuredClone(it)) }];
    if (prev) c.tray.push(prev);
    return c;
  }
  const pg = c.pages[p];
  const old = pg.slots[slot];
  pg.slots[slot] = it;
  if (old) c.tray.push(old);
  return c;
}

export function trayToPage(c0: Collage, trayIndex: number, p: number): Collage {
  if (isSame(c0)) return trayToSlot(c0, trayIndex, 0, 0);
  const c = clone(c0);
  const [it] = c.tray.splice(trayIndex, 1);
  if (!it) return c0;
  placeOnPage(c, [it], p);
  return c;
}

export function slotToTray(c0: Collage, p: number, slot: number): Collage {
  const it = c0.pages[p]?.slots[slot];
  if (!it) return c0;
  const c = clone(c0);
  if (isSame(c)) c.pages[0].slots = c.pages[0].slots.map(() => null);
  else c.pages[p].slots[slot] = null;
  c.tray.push(it);
  dropIfEmptyLast(c, p);
  return c;
}

export function setCrop(c0: Collage, p: number, slot: number, crop: Crop): Collage {
  const it = c0.pages[p]?.slots[slot];
  if (!it) return c0;
  const c = clone(c0);
  if (isSame(c)) c.pages[0].slots = c.pages[0].slots.map((x) => (x ? { ...x, crop: { ...crop } } : x));
  else c.pages[p].slots[slot] = { ...it, crop };
  return c;
}

/** Hand-set Tilt of one Photo (pages rule 23). */
export function setTilt(c0: Collage, p: number, slot: number, deg: number): Collage {
  const it = c0.pages[p]?.slots[slot];
  if (!it) return c0;
  const c = clone(c0);
  c.pages[p].slots[slot] = { ...it, tilt: deg };
  return c;
}

/** "+" in the Page strip: an empty Page with Photos per Page Slots (pages rule 8). */
export function addPage(c0: Collage): Collage {
  if (isSame(c0) || c0.slotCount <= 0) return c0;
  const c = clone(c0);
  const last = c.pages[c.pages.length - 1];
  if (last) delete last.count;
  c.pages.push({ slots: emptySlots(c.slotCount), count: c.slotCount });
  return c;
}

/** "Seite löschen": Photos to the tray; the only Page is emptied instead (pages rule 7). */
export function deletePage(c0: Collage, p: number): Collage {
  const c = clone(c0);
  const pg = c.pages[p];
  if (!pg) return c0;
  const seen = new Set<string>();
  for (const it of placedOf(pg)) if (!isSame(c) || !seen.has(it.photoId)) (seen.add(it.photoId), c.tray.push(it));
  if (c.pages.length === 1) c.pages = [{ slots: emptySlots(c.slotCount) }];
  else c.pages.splice(p, 1);
  return c;
}

/** Hand-set Slot count of the last Page (pages rule 4). */
export function setLastPageCount(c0: Collage, count: number): Collage {
  if (c0.pages.length < 2) return c0;
  const c = clone(c0);
  const pg = c.pages[c.pages.length - 1];
  const n = Math.max(1, Math.min(c.slotCount, Math.round(count)));
  // never drops Photos: the Page keeps at least as many Slots as it holds Photos
  pg.count = Math.max(n, placedOf(pg).length);
  pg.slots = [...placedOf(pg), ...emptySlots(pg.count - placedOf(pg).length)];
  return c;
}

/** Photo ids referenced by the Collage (Pages + tray). */
export function referencedPhotoIds(c: Collage): Set<string> {
  const ids = new Set<string>();
  for (const it of allPlaced(c)) ids.add(it.photoId);
  for (const t of c.tray) ids.add(t.photoId);
  return ids;
}

/** Drop photo metadata no longer referenced. */
export function prunePhotos(c0: Collage): Collage {
  const ids = referencedPhotoIds(c0);
  const c = clone(c0);
  for (const id of Object.keys(c.photos)) if (!ids.has(id)) delete c.photos[id];
  return c;
}

export const photoCount = (c: Collage) => allPlaced(c).length;
