import { clampCrop, displayedSize, scaleFor } from '../model/crop';
import { collageSlots, sheetSize } from '../model/layout';
import type { Collage, Rect } from '../model/types';

export type ImageSource = CanvasImageSource & { width: number; height: number };

export interface RenderOptions {
  /** pixels per mm */
  scale: number;
  /** draw empty-Slot placeholders (editor only, never in output) */
  placeholders?: boolean;
  /** Slot rectangles in mm to draw into (editor animation); defaults to the computed layout */
  rects?: Rect[];
}

/** Draw the Collage onto ctx with the Sheet's top-left at (0,0). Same function for editor, print and export. */
export function drawCollage(ctx: CanvasRenderingContext2D, c: Collage, images: (id: string) => ImageSource | undefined, o: RenderOptions) {
  const { w, h } = sheetSize(c.sheet);
  const k = o.scale;
  ctx.save();
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, w * k, h * k);
  const slots = o.rects ?? collageSlots(c);
  // Cut marks go under the Photos, so a mark reaching into a neighbouring Slot is covered by it (rule 16).
  if (c.mode === 'fixed' && c.cutMarks) drawCutMarks(ctx, slots, k);
  slots.forEach((r, i) => {
    const px: Rect = { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
    const it = c.slots[i];
    const meta = it && c.photos[it.photoId];
    const img = it && images(it.photoId);
    if (!it || !meta || !img) {
      if (o.placeholders) drawPlaceholder(ctx, px, !!it);
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

/** Editor-only look of an empty Slot: dashed outline, "+" and a short hint. */
function drawPlaceholder(ctx: CanvasRenderingContext2D, r: Rect, loading: boolean) {
  if (r.w < 2 || r.h < 2) return;
  const m = Math.min(r.w, r.h);
  const ins = Math.max(3, m * 0.03);
  ctx.save();
  ctx.fillStyle = 'rgba(79,70,229,0.05)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = 'rgba(79,70,229,0.45)';
  ctx.lineWidth = Math.max(1.5, m * 0.008);
  ctx.setLineDash([m * 0.03 + 4, m * 0.02 + 3]);
  ctx.beginPath();
  ctx.roundRect(r.x + ins, r.y + ins, r.w - 2 * ins, r.h - 2 * ins, Math.max(4, m * 0.03));
  ctx.stroke();
  ctx.setLineDash([]);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = Math.max(10, Math.min(28, m * 0.09));
  const showText = m > 90;
  const iconY = showText ? cy - rad * 0.55 : cy;
  ctx.fillStyle = 'rgba(79,70,229,0.12)';
  ctx.beginPath();
  ctx.arc(cx, iconY, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(79,70,229,0.9)';
  ctx.lineWidth = Math.max(1.5, rad * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const a = rad * 0.42;
  if (loading) {
    ctx.arc(cx, iconY, a, 0, Math.PI * 1.5);
  } else {
    ctx.moveTo(cx - a, iconY);
    ctx.lineTo(cx + a, iconY);
    ctx.moveTo(cx, iconY - a);
    ctx.lineTo(cx, iconY + a);
  }
  ctx.stroke();
  if (showText) {
    ctx.fillStyle = 'rgba(60,62,80,0.75)';
    ctx.font = `500 ${Math.max(11, Math.min(15, m * 0.045))}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(loading ? 'Lädt …' : 'Foto hierher ziehen', cx, iconY + rad + 8);
  }
  ctx.restore();
}

export const CUT_MARK = { len: 3, offset: 0.5, width: 0.2, color: '#888888' };

function drawCutMarks(ctx: CanvasRenderingContext2D, slots: Rect[], k: number) {
  const { len, offset, width, color } = CUT_MARK;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width * k);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const r of slots) {
    const xs = [r.x, r.x + r.w];
    const ys = [r.y, r.y + r.h];
    for (const x of xs)
      for (const y of ys) {
        const dx = x === r.x ? -1 : 1;
        const dy = y === r.y ? -1 : 1;
        // horizontal mark on the extension of the top/bottom edge
        ctx.moveTo((x + dx * offset) * k, y * k);
        ctx.lineTo((x + dx * (offset + len)) * k, y * k);
        // vertical mark on the extension of the left/right edge
        ctx.moveTo(x * k, (y + dy * offset) * k);
        ctx.lineTo(x * k, (y + dy * (offset + len)) * k);
      }
  }
  ctx.stroke();
  ctx.restore();
}
