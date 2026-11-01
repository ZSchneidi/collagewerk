import { defaultCrop } from './crop';
import { fixedCapacity, MAX_SLOTS, MIN_SLOTS, PHOTO_SIZES, SHEET_PRESETS, templatesFor } from './layout';
import type { Collage, Crop, LayoutMode, PhotoMeta, PhotoSize, Placed } from './types';

export function createCollage(): Collage {
  return {
    sheet: { preset: 'A4', w: 210, h: 297, orientation: 'portrait' },
    mode: 'free',
    photoSize: { preset: 'passbild', w: 35, h: 45, orientation: 'portrait' },
    samePhoto: true,
    cutMarks: true,
    slotCount: 4,
    templateIndex: 0,
    gap: 3,
    margin: 5,
    background: '#ffffff',
    slots: [null, null, null, null],
    tray: [],
    photos: {},
  };
}

const clone = (c: Collage): Collage => structuredClone(c);

/** Fill in fields added after v1 so older autosaves and files open in 'free' mode (rule 20). */
export function withDefaults(c: Partial<Collage> & Pick<Collage, 'slots' | 'tray' | 'photos'>): Collage {
  const d = createCollage();
  return { ...d, ...c, photoSize: { ...d.photoSize, ...(c.photoSize ?? {}) } } as Collage;
}

export const isSame = (c: Collage) => c.mode === 'fixed' && c.samePhoto;
export const capacity = (c: Collage) => fixedCapacity(c.sheet, c.margin, c.gap, c.photoSize);

/** Upper limit for the Slot count in the current Layout mode. */
export function maxSlots(c: Collage) {
  return c.mode === 'fixed' ? capacity(c).max : MAX_SLOTS;
}

/** Same Placed in every Slot? the canonical one (first non-empty). */
const firstPlaced = (c: Collage) => c.slots.find((x) => x) ?? null;

/**
 * Derived constraints applied after every change:
 * fixed mode → Slot count never exceeds what fits (rule 5); Same photo mode → every Slot shows the same Photo + Crop (rules 12, 13).
 */
export function normalize(c0: Collage): Collage {
  let c = c0;
  if (c.mode === 'fixed') {
    const max = capacity(c).max;
    if (c.slotCount > max) c = setSlotCount(c, max);
  }
  if (isSame(c)) {
    const src = firstPlaced(c);
    if (src && c.slots.some((x) => !x || x.photoId !== src.photoId || JSON.stringify(x.crop) !== JSON.stringify(src.crop))) {
      c = clone(c);
      c.slots = c.slots.map(() => structuredClone(src));
    }
  }
  return c;
}

/** Switch Layout mode (rules 1, 6, 17). Entering 'fixed' sets Gap 2 mm and the Slot count to what fits. */
export function setLayoutMode(c0: Collage, mode: LayoutMode): Collage {
  if (c0.mode === mode) return c0;
  let c = clone(c0);
  c.mode = mode;
  if (mode === 'fixed') {
    c.gap = 2;
    c = setSlotCount(c, capacity(c).max);
    if (c.samePhoto) c = setSamePhoto({ ...c, samePhoto: false }, true);
  } else {
    if (c.slotCount < MIN_SLOTS) c = setSlotCount(c, MIN_SLOTS);
    c.templateIndex = Math.min(c.templateIndex, templatesFor(c.slotCount).length - 1);
  }
  return c;
}

/** Choose a Photo size (rules 7, 11): preset default for Same photo mode, Slot count back to what fits. */
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

/** Turn Same photo mode on/off (rules 11, 14). Turning on keeps the first Photo; other Photos go to the tray. */
export function setSamePhoto(c0: Collage, on: boolean): Collage {
  if (c0.samePhoto === on) return c0;
  const c = clone(c0);
  c.samePhoto = on;
  if (on && c.mode === 'fixed') {
    const src = firstPlaced(c);
    const seen = new Set(src ? [src.photoId] : []);
    for (const s of c.slots) if (s && !seen.has(s.photoId)) (seen.add(s.photoId), c.tray.push(s));
  }
  return c;
}

/** Smallest preset Sheet (current orientation) on which at least one fixed Slot fits (rule 9). */
export function fitSheet(c: Collage): Collage | null {
  const sorted = [...SHEET_PRESETS].sort((a, b) => a.w * a.h - b.w * b.h);
  for (const p of sorted) {
    const sheet = { ...c.sheet, preset: p.id, w: p.w, h: p.h };
    if (fixedCapacity(sheet, c.margin, c.gap, c.photoSize).max >= 1) {
      const next = { ...c, sheet };
      return setSlotCount(next, Math.max(1, Math.min(fixedCapacity(sheet, c.margin, c.gap, c.photoSize).max, c.slotCount || 1)));
    }
  }
  return null;
}

/** Rule 11/12: place new Photos. A single Photo dropped onto `target` goes there; otherwise empty Slots fill in order. */
export function addPhotos(c0: Collage, metas: PhotoMeta[], target?: number): Collage {
  const c = clone(c0);
  for (const m of metas) c.photos[m.id] = m;
  const items: Placed[] = metas.map((m) => ({ photoId: m.id, crop: defaultCrop() }));
  if (isSame(c) && c.slots.length) {
    const old = firstPlaced(c);
    if (old) c.tray.push(old);
    c.slots = c.slots.map(() => structuredClone(items[0]));
    c.tray.push(...items.slice(1));
    return c;
  }
  if (target !== undefined && items.length === 1 && target >= 0 && target < c.slotCount) {
    const old = c.slots[target];
    if (old) c.tray.push(old);
    c.slots[target] = items[0];
    return c;
  }
  for (const it of items) {
    const free = c.slots.findIndex((s) => s === null);
    if (free >= 0) c.slots[free] = it;
    else c.tray.push(it);
  }
  return c;
}

/** Rule 16. */
export function setSlotCount(c0: Collage, n: number): Collage {
  const c = clone(c0);
  const min = c.mode === 'fixed' ? 0 : MIN_SLOTS;
  n = Math.max(min, Math.min(maxSlots(c), Math.round(n)));
  if (n < c.slots.length) {
    const removed = c.slots.splice(n);
    if (isSame(c)) {
      // copies of one Photo: it only goes to the tray once nothing shows it any more
      const first = removed.find((r) => r);
      if (first && !c.slots.some((x) => x)) c.tray.push(first);
    } else for (const r of removed) if (r) c.tray.push(r);
  } else {
    while (c.slots.length < n) c.slots.push(null);
  }
  c.slotCount = n;
  if (c.mode === 'free') c.templateIndex = Math.min(c.templateIndex, templatesFor(n).length - 1);
  return c;
}

/** Rule 17: swap or move between Slots. */
export function moveSlot(c0: Collage, from: number, to: number): Collage {
  if (from === to) return c0;
  const c = clone(c0);
  [c.slots[from], c.slots[to]] = [c.slots[to], c.slots[from]];
  return c;
}

/** Rule 18: tray → Slot; the displaced Photo goes to the tray. */
export function trayToSlot(c0: Collage, trayIndex: number, slot: number): Collage {
  const c = clone(c0);
  const [it] = c.tray.splice(trayIndex, 1);
  if (!it) return c0;
  if (isSame(c)) {
    const prev = firstPlaced(c);
    c.slots = c.slots.map(() => structuredClone(it));
    if (prev) c.tray.push(prev);
    return c;
  }
  const old = c.slots[slot];
  c.slots[slot] = it;
  if (old) c.tray.push(old);
  return c;
}

export function slotToTray(c0: Collage, slot: number): Collage {
  const it = c0.slots[slot];
  if (!it) return c0;
  const c = clone(c0);
  if (isSame(c)) c.slots = c.slots.map(() => null);
  else c.slots[slot] = null;
  c.tray.push(it);
  return c;
}

export function setCrop(c0: Collage, slot: number, crop: Crop): Collage {
  const it = c0.slots[slot];
  if (!it) return c0;
  const c = clone(c0);
  if (isSame(c)) c.slots = c.slots.map((x) => (x ? { ...x, crop: { ...crop } } : x));
  else c.slots[slot] = { ...it, crop };
  return c;
}

/** Photo ids referenced by the Collage (Slots + tray). */
export function referencedPhotoIds(c: Collage): Set<string> {
  const ids = new Set<string>();
  for (const s of c.slots) if (s) ids.add(s.photoId);
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
