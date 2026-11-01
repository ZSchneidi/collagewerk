import type { Crop, PhotoMeta, Rect } from './types';

export const MAX_ZOOM = 5;
export const DPI_WARN = 200;
export const DPI_BAD = 120;

export const defaultCrop = (): Crop => ({ zoom: 1, rot: 0, mirror: false, fx: 0.5, fy: 0.5 });

/** Size of the Photo in its displayed frame (rotation applied), in px. */
export function displayedSize(p: PhotoMeta, c: Crop) {
  return c.rot % 180 === 0 ? { w: p.w, h: p.h } : { w: p.h, h: p.w };
}

/** Scale in slot-units per photo pixel (slot units = whatever unit the Rect is in). */
export function scaleFor(p: PhotoMeta, c: Crop, slot: Rect) {
  const d = displayedSize(p, c);
  return Math.max(slot.w / d.w, slot.h / d.h) * c.zoom;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Clamp zoom and focus so the Photo always covers the Slot. */
export function clampCrop(p: PhotoMeta, c: Crop, slot: Rect): Crop {
  const zoom = clamp(c.zoom, 1, MAX_ZOOM);
  const cc = { ...c, zoom };
  const d = displayedSize(p, cc);
  const s = scaleFor(p, cc, slot);
  const hx = slot.w / s / d.w / 2; // half visible extent, normalised
  const hy = slot.h / s / d.h / 2;
  return { ...cc, fx: clamp(c.fx, hx, 1 - hx), fy: clamp(c.fy, hy, 1 - hy) };
}

/** Pan by a delta in slot units (positive dx moves the Photo right). */
export function pan(p: PhotoMeta, c: Crop, slot: Rect, dx: number, dy: number): Crop {
  const d = displayedSize(p, c);
  const s = scaleFor(p, c, slot);
  return clampCrop(p, { ...c, fx: c.fx - dx / s / d.w, fy: c.fy - dy / s / d.h }, slot);
}

/** Zoom keeping the point at offset (ox, oy) from the Slot centre (slot units) fixed. */
export function zoomAt(p: PhotoMeta, c: Crop, slot: Rect, zoom: number, ox = 0, oy = 0): Crop {
  const d = displayedSize(p, c);
  const s0 = scaleFor(p, c, slot);
  const px = c.fx * d.w + ox / s0;
  const py = c.fy * d.h + oy / s0;
  const nz = clamp(zoom, 1, MAX_ZOOM);
  const s1 = scaleFor(p, { ...c, zoom: nz }, slot);
  return clampCrop(p, { ...c, zoom: nz, fx: (px - ox / s1) / d.w, fy: (py - oy / s1) / d.h }, slot);
}

/** Rotate the displayed Photo by 90° (dir = 1 clockwise, -1 counter-clockwise). */
export function rotate(p: PhotoMeta, c: Crop, slot: Rect, dir: 1 | -1): Crop {
  const eff = c.mirror ? -dir : dir;
  const rot = (((c.rot + eff * 90) % 360) + 360) % 360;
  const f = dir === 1 ? { fx: 1 - c.fy, fy: c.fx } : { fx: c.fy, fy: 1 - c.fx };
  return clampCrop(p, { ...c, rot, ...f }, slot);
}

export function mirror(p: PhotoMeta, c: Crop, slot: Rect): Crop {
  return clampCrop(p, { ...c, mirror: !c.mirror, fx: 1 - c.fx }, slot);
}

/** Effective print resolution in dpi for a Slot measured in mm. */
export function effectiveDpi(p: PhotoMeta, c: Crop, slotMm: Rect) {
  const mmPerPx = scaleFor(p, c, slotMm);
  return 25.4 / mmPerPx;
}

export function dpiLevel(dpi: number): 'ok' | 'warn' | 'bad' {
  return dpi < DPI_BAD ? 'bad' : dpi < DPI_WARN ? 'warn' : 'ok';
}
