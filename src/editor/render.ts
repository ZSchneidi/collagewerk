import { clampCrop, displayedSize, scaleFor } from '../model/crop';
import { collageSlots, sheetSize } from '../model/layout';
import type { Collage, Rect } from '../model/types';

export type ImageSource = CanvasImageSource & { width: number; height: number };

export interface RenderOptions {
  /** pixels per mm */
  scale: number;
  /** draw empty-Slot placeholders (editor only, never in output) */
  placeholders?: boolean;
}

/** Draw the Collage onto ctx with the Sheet's top-left at (0,0). Same function for editor, print and export. */
export function drawCollage(ctx: CanvasRenderingContext2D, c: Collage, images: (id: string) => ImageSource | undefined, o: RenderOptions) {
  const { w, h } = sheetSize(c.sheet);
  const k = o.scale;
  ctx.save();
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, w * k, h * k);
  const slots = collageSlots(c);
  slots.forEach((r, i) => {
    const px: Rect = { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
    const it = c.slots[i];
    const meta = it && c.photos[it.photoId];
    const img = it && images(it.photoId);
    if (!it || !meta || !img) {
      if (o.placeholders) {
        ctx.fillStyle = 'rgba(120,130,150,0.18)';
        ctx.fillRect(px.x, px.y, px.w, px.h);
        ctx.fillStyle = 'rgba(80,90,110,0.7)';
        ctx.font = `${Math.max(10, Math.min(px.w, px.h) * 0.07)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(it ? 'Lädt …' : 'Foto hierher ziehen', px.x + px.w / 2, px.y + px.h / 2);
      }
      return;
    }
    const crop = clampCrop(meta, it.crop, px);
    const d = displayedSize(meta, crop);
    const s = scaleFor(meta, crop, px);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px.x, px.y, px.w, px.h);
    ctx.clip();
    ctx.translate(px.x + px.w / 2, px.y + px.h / 2);
    ctx.scale(s, s);
    ctx.translate(-crop.fx * d.w + d.w / 2, -crop.fy * d.h + d.h / 2);
    if (crop.mirror) ctx.scale(-1, 1);
    ctx.rotate((crop.rot * Math.PI) / 180);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -meta.w / 2, -meta.h / 2, meta.w, meta.h);
    ctx.restore();
  });
  ctx.restore();
}

/** Render the Collage to a new canvas at the given dpi (rule 30). */
export function renderToCanvas(c: Collage, images: (id: string) => ImageSource | undefined, dpi: number): HTMLCanvasElement {
  const { w, h } = sheetSize(c.sheet);
  const scale = dpi / 25.4;
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * scale);
  cv.height = Math.round(h * scale);
  const ctx = cv.getContext('2d')!;
  drawCollage(ctx, c, images, { scale });
  return cv;
}
