import { defaultCrop } from './crop';
import { MAX_SLOTS, MIN_SLOTS, templatesFor } from './layout';
import type { Collage, Crop, PhotoMeta, Placed } from './types';

export function createCollage(): Collage {
  return {
    sheet: { preset: 'A4', w: 210, h: 297, orientation: 'portrait' },
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

/** Rule 11/12: place new Photos. A single Photo dropped onto `target` goes there; otherwise empty Slots fill in order. */
export function addPhotos(c0: Collage, metas: PhotoMeta[], target?: number): Collage {
  const c = clone(c0);
  for (const m of metas) c.photos[m.id] = m;
  const items: Placed[] = metas.map((m) => ({ photoId: m.id, crop: defaultCrop() }));
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
  n = Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, Math.round(n)));
  if (n < c.slots.length) {
    const removed = c.slots.splice(n);
    for (const r of removed) if (r) c.tray.push(r);
  } else {
    while (c.slots.length < n) c.slots.push(null);
  }
  c.slotCount = n;
  c.templateIndex = Math.min(c.templateIndex, templatesFor(n).length - 1);
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
  const old = c.slots[slot];
  c.slots[slot] = it;
  if (old) c.tray.push(old);
  return c;
}

export function slotToTray(c0: Collage, slot: number): Collage {
  const it = c0.slots[slot];
  if (!it) return c0;
  const c = clone(c0);
  c.slots[slot] = null;
  c.tray.push(it);
  return c;
}

export function setCrop(c0: Collage, slot: number, crop: Crop): Collage {
  const it = c0.slots[slot];
  if (!it) return c0;
  const c = clone(c0);
  c.slots[slot] = { ...it, crop };
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
