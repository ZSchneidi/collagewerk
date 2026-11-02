import { clampCrop, displayedSize, scaleFor } from '../model/crop';
import { pageLayout, sheetSize } from '../model/layout';
import { frameFill, frameInsets, photoArea, styleActive, tiltFit, tiltOf } from '../model/style';
import type { Collage, Decor, PhotoMeta, Placed, Rect, Slot } from '../model/types';
import { t } from './i18n';

export type ImageSource = CanvasImageSource & { width: number; height: number };

export interface RenderOptions {
  /** pixels per mm */
  scale: number;
  /** draw empty-Slot placeholders (editor only, never in output) */
  placeholders?: boolean;
  /** Slots in mm to draw into (editor animation); defaults to the computed layout */
  rects?: Slot[];
}

const scaleSlot = (r: Slot, k: number): Slot => ({
  x: r.x * k,
  y: r.y * k,
  w: r.w * k,
  h: r.h * k,
  poly: r.poly?.map((p) => ({ x: p.x * k, y: p.y * k })),
});

/** Outline path of a Slot (polygon, or rectangle with corner radius r, all in px). */
function shapePath(ctx: CanvasRenderingContext2D, s: Slot, r: number) {
  ctx.beginPath();
  if (s.poly) {
    s.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  } else if (r > 0) ctx.roundRect(s.x, s.y, s.w, s.h, Math.min(r, s.w / 2, s.h / 2));
  else ctx.rect(s.x, s.y, s.w, s.h);
}

function drawDecor(ctx: CanvasRenderingContext2D, decor: Decor[], k: number) {
  for (const d of decor) {
    ctx.beginPath();
    if (d.radius) ctx.roundRect(d.x * k, d.y * k, d.w * k, d.h * k, d.radius * k);
    else ctx.rect(d.x * k, d.y * k, d.w * k, d.h * k);
    if (d.fill) {
      ctx.fillStyle = d.fill;
      ctx.fill();
    }
    if (d.stroke) {
      ctx.strokeStyle = d.stroke;
      ctx.lineWidth = Math.max(1, (d.lineWidth ?? 0.3) * k);
      ctx.stroke();
    }
  }
}

/** Draw the Photo with its Crop into `area` (px), clipped by the current path set by the caller. */
function drawPhoto(ctx: CanvasRenderingContext2D, img: ImageSource, meta: PhotoMeta, it: Placed, area: Rect) {
  const crop = clampCrop(meta, it.crop, area);
  const d = displayedSize(meta, crop);
  const s = scaleFor(meta, crop, area);
  ctx.save();
  ctx.translate(area.x + area.w / 2, area.y + area.h / 2);
  ctx.scale(s, s);
  ctx.translate(-crop.fx * d.w + d.w / 2, -crop.fy * d.h + d.h / 2);
  if (crop.mirror) ctx.scale(-1, 1);
  ctx.rotate((crop.rot * Math.PI) / 180);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -meta.w / 2, -meta.h / 2, meta.w, meta.h);
  ctx.restore();
}

/** Photo with soft edges: rendered offscreen and masked with two gradient passes (pages rule 22). */
function drawSoftPhoto(ctx: CanvasRenderingContext2D, img: ImageSource, meta: PhotoMeta, it: Placed, area: Rect) {
  const w = Math.max(1, Math.round(area.w));
  const h = Math.max(1, Math.round(area.h));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const o = off.getContext('2d')!;
  drawPhoto(o, img, meta, it, { x: 0, y: 0, w, h });
  const f = Math.min(w, h) * 0.12;
  o.globalCompositeOperation = 'destination-in';
  const gx = o.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)');
  gx.addColorStop(f / w, 'rgba(0,0,0,1)');
  gx.addColorStop(1 - f / w, 'rgba(0,0,0,1)');
  gx.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = gx;
  o.fillRect(0, 0, w, h);
  const gy = o.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, 'rgba(0,0,0,0)');
  gy.addColorStop(f / h, 'rgba(0,0,0,1)');
  gy.addColorStop(1 - f / h, 'rgba(0,0,0,1)');
  gy.addColorStop(1, 'rgba(0,0,0,0)');
  o.fillStyle = gy;
  o.fillRect(0, 0, w, h);
  ctx.drawImage(off, area.x, area.y, area.w, area.h);
}

function drawVignette(ctx: CanvasRenderingContext2D, area: Rect) {
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h / 2;
  const r = Math.hypot(area.w, area.h) / 2;
  const g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(area.x, area.y, area.w, area.h);
}

/** Draw Page p of the Collage with the Sheet's top-left at (0,0). Same function for editor, print, PNG and PDF. */
export function drawPage(ctx: CanvasRenderingContext2D, c: Collage, p: number, images: (id: string) => ImageSource | undefined, o: RenderOptions) {
  const { w, h } = sheetSize(c.sheet);
  const k = o.scale;
  const layout = pageLayout(c, p);
  const slots = o.rects ?? layout.slots;
  const page = c.pages[p];
  const st = c.style;
  const styled = styleActive(c);
  ctx.save();
  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, w * k, h * k);
  drawDecor(ctx, layout.decor, k);
  // Cut marks go under the Photos, so a mark reaching into a neighbouring Slot is covered by it.
  if (c.mode === 'fixed' && c.cutMarks) drawCutMarks(ctx, slots, k);
  slots.forEach((r, i) => {
    const it = page?.slots[i];
    const meta = it && c.photos[it.photoId];
    const img = it && images(it.photoId);
    const px = scaleSlot(r, k);
    if (!it || !meta || !img) {
      if (o.placeholders) drawPlaceholder(ctx, px, !!it);
      return;
    }
    ctx.save();
    const tilt = tiltOf(c, p, i, it);
    if (tilt) {
      const cx = px.x + px.w / 2;
      const cy = px.y + px.h / 2;
      const f = tiltFit(px.w, px.h, tilt);
      ctx.translate(cx, cy);
      ctx.rotate((tilt * Math.PI) / 180);
      ctx.scale(f, f);
      ctx.translate(-cx, -cy);
    }
    const radius = styled ? st.radius * k : 0;
    const framed = styled && st.frame !== 'none';
    if (styled && st.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 4 * k;
      ctx.shadowOffsetX = 1.4 * k;
      ctx.shadowOffsetY = 2 * k;
      shapePath(ctx, px, radius);
      ctx.fillStyle = framed ? frameFill(st) : c.background;
      ctx.fill();
      ctx.restore();
    }
    if (framed) {
      shapePath(ctx, px, radius);
      ctx.fillStyle = frameFill(st);
      ctx.fill();
    }
    const area = scaleSlot(photoArea(c, r), k);
    const ins = frameInsets(c, r);
    // clip: polygon Slots keep their shape (Frame drawn as an inner stroke), rectangles use the inset rect
    if (px.poly) shapePath(ctx, px, 0);
    else shapePath(ctx, area, framed ? Math.max(0, radius - ins.l * k) : radius);
    ctx.clip();
    if (styled && st.edges === 'soft') drawSoftPhoto(ctx, img, meta, it, px.poly ? px : area);
    else drawPhoto(ctx, img, meta, it, px.poly ? px : area);
    if (styled && st.edges === 'vignette') drawVignette(ctx, px.poly ? px : area);
    if (framed && px.poly) {
      shapePath(ctx, px, 0);
      ctx.strokeStyle = frameFill(st);
      ctx.lineWidth = ins.l * 2 * k;
      ctx.stroke();
    }
    ctx.restore();
  });
  ctx.restore();
}

/** Render Page p to a new canvas at the given dpi (v1 rule 30, pages rules 12, 13). */
export function renderToCanvas(c: Collage, p: number, images: (id: string) => ImageSource | undefined, dpi: number): HTMLCanvasElement {
  const { w, h } = sheetSize(c.sheet);
  const scale = dpi / 25.4;
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * scale);
  cv.height = Math.round(h * scale);
  const ctx = cv.getContext('2d')!;
  drawPage(ctx, c, p, images, { scale });
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
    ctx.fillText(loading ? t('Lädt …') : t('Foto hierher ziehen'), cx, iconY + rad + 8);
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
