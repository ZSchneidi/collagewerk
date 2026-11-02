import './style.css';
import { addPage, addPhotos, addPhotosToPage, moveAcross, newCollage, capacity, createCollage, deletePage, fitSheet, isSame, maxSlots, moveSlot, moveToPage, normalize, photoCount, prunePhotos, referencedPhotoIds, setCrop, setLastPageCount, setLayoutMode, setPhotoSize, setSamePhoto, setSlotCount, setTilt, slotToTray, trayToPage, trayToSlot, withDefaults } from '../model/collage';
import { clampCrop, defaultCrop, dpiLevel, effectiveDpi, mirror, pan, rotate, zoomAt } from '../model/crop';
import { parseFile, toFile } from '../model/fileformat';
import { History } from '../model/history';
import { collageSlots, computeSlots, PHOTO_SIZES, photoSizeDims, SHEET_PRESETS, sheetSize, templateFor, templatesFor } from '../model/layout';
import { hitsSlot, photoArea, styleActive, TILT_MAX, tiltFit, tiltOf } from '../model/style';
import { buildPdf, type PdfPage } from './pdf';
import type { Collage, Crop, Rect, Slot } from '../model/types';
import { isSupported, PhotoStore } from './photos';
import { drawPage, renderToCanvas } from './render';
import * as db from './storage';
import { registerEditorTab } from './tab';
import { hydrateIcons, icon, setIcon } from './icons';
import { fmtNum, t, translateDom } from './i18n';
import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';

// bundled Inter (rule 12) – no network
try {
  const face = new FontFace('Inter', `url(${interUrl}) format('woff2')`, { weight: '100 900', style: 'normal' });
  document.fonts.add(face);
  face.load().catch(() => {});
} catch {
  /* fall back to system font */
}
translateDom();
document.getElementById('tray-items')!.dataset.empty = t('Fotos ohne Platz landen hier – zum Einsetzen auf einen Platz ziehen.');
hydrateIcons();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- state ----------
let state: Collage = createCollage();
let selected: number | null = null;
/** current Page index (UI state) */
let page = 0;
const curSlots = () => state.pages[page]?.slots ?? [];
const history = new History<Collage>();
let coalesceKey: string | null = null;
const photos = new PhotoStore();
photos.onLoaded = () => {
  photosVersion++;
  requestRender();
};

/** Apply a change. Records undo history unless the same `key` is still coalescing (slider drags, gestures). */
function commit(next: Collage, key: string | null = null) {
  if (next === state) return;
  next = normalize(next);
  if (key === null || key !== coalesceKey) history.push(state);
  coalesceKey = key;
  state = next;
  changed();
}
const endCoalesce = () => (coalesceKey = null);

function changed() {
  page = Math.max(0, Math.min(page, state.pages.length - 1));
  if (selected !== null && selected >= curSlots().length) selected = null;
  scheduleSave();
  syncControls();
  renderTray();
  renderNow();
}

// ---------- persistence (rule 27) ----------
let saveTimer = 0;
let pendingSave: Promise<void> = Promise.resolve();
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    pendingSave = db.saveState(state).then(() => undefined, (e) => console.warn('autosave failed', e));
  }, 250);
}
function flushSave() {
  clearTimeout(saveTimer);
  pendingSave = db.saveState(state).then(() => undefined);
  return pendingSave;
}

async function restore() {
  const raw = await db.loadState().catch(() => undefined);
  if (!raw) return;
  const saved = withDefaults(raw);
  const ids = referencedPhotoIds(saved);
  for (const id of ids) {
    const blob = await db.loadPhoto(id);
    if (blob) photos.put(id, blob);
  }
  // drop references to photos whose data is missing
  saved.pages = saved.pages.map((pg) => ({ ...pg, slots: pg.slots.map((s) => (s && photos.has(s.photoId) ? s : null)) }));
  saved.tray = saved.tray.filter((t) => photos.has(t.photoId));
  state = normalize(prunePhotos(saved));
  // remove orphaned photo blobs
  const keys = (await db.photoKeys()) ?? [];
  for (const k of keys) if (!ids.has(String(k))) db.deletePhoto(String(k));
}

// ---------- adding photos (rules 11–15) ----------
async function addFiles(files: File[], target?: number, toPage?: number) {
  const bad = files.filter((f) => !isSupported(f)).map((f) => f.name);
  const metas = [];
  for (const f of files.filter((x) => isSupported(x))) {
    try {
      const m = await photos.add(f);
      metas.push(m);
      db.savePhoto(m.id, f).catch((e) => console.warn('photo save failed', e));
    } catch {
      bad.push(f.name);
    }
  }
  if (bad.length) toast(t('Nicht unterstützt: {files} (erlaubt: JPG, PNG, WebP, GIF)', { files: bad.join(', ') }));
  if (!metas.length) return;
  const before = state.pages.length;
  if (toPage !== undefined) commit(addPhotosToPage(state, metas, toPage));
  else commit(addPhotos(state, metas, files.length === 1 ? target : undefined, page));
  const added = state.pages.length - before;
  if (added > 0) toast(added === 1 ? t('1 neue Seite angelegt') : t('{n} neue Seiten angelegt', { n: added }), 'info');
}

// ---------- geometry: Page carousel (carousel rules 1–4) ----------
const stage = $('stage');
const sheetArea = $('sheet-area');
const track = $('track');
let view = { scale: 1 }; // css px per mm, same for every Page
const PAGE_GAP = 48;
const LABEL_H = 30;

interface PageEls {
  wrap: HTMLElement;
  sheetWrap: HTMLElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  label: HTMLElement;
  num: HTMLElement;
  sheetLabel: HTMLElement;
  /** what is currently drawn, to skip redundant redraws */
  drawn: string;
}
let pageEls: PageEls[] = [];

function buildPageEls() {
  const n = state.pages.length;
  while (pageEls.length > n) pageEls.pop()!.wrap.remove();
  while (pageEls.length < n) {
    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    const sheetWrap = document.createElement('div');
    sheetWrap.className = 'sheet-wrap';
    const canvas = document.createElement('canvas');
    canvas.className = 'sheet';
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    sheetWrap.append(canvas, overlay);
    const label = document.createElement('div');
    label.className = 'page-label';
    const num = document.createElement('span');
    const sheetLabel = document.createElement('span');
    label.append(num, ' · ', sheetLabel);
    wrap.append(sheetWrap, label);
    track.insertBefore(wrap, $('ghost-page'));
    pageEls.push({ wrap, sheetWrap, canvas, overlay, label, num, sheetLabel, drawn: '' });
  }
  pageEls.forEach((e, i) => {
    e.wrap.dataset.pw = String(i);
    const active = i === page;
    e.wrap.classList.toggle('active', active);
    // the Active Page carries the historic ids (tests, styles)
    e.canvas.id = active ? 'sheet' : '';
    e.overlay.id = active ? 'overlay' : '';
    e.sheetWrap.id = active ? 'sheet-wrap' : '';
    e.sheetLabel.id = active ? 'sheet-label' : '';
  });
}
const cv = () => pageEls[page]?.canvas ?? ($('sheet') as HTMLCanvasElement);

function fit() {
  const { w, h } = sheetSize(state.sheet);
  const cs = getComputedStyle(sheetArea);
  const padL = parseFloat(cs.paddingLeft);
  const padT = parseFloat(cs.paddingTop);
  const sw = sheetArea.clientWidth - padL - parseFloat(cs.paddingRight);
  const sh = sheetArea.clientHeight - padT - parseFloat(cs.paddingBottom) - LABEL_H;
  view.scale = Math.max(0.5, Math.min(sw / w, sh / h));
  const pw = w * view.scale;
  const ph = h * view.scale;
  for (const e of pageEls) {
    e.canvas.style.width = `${pw}px`;
    e.canvas.style.height = `${ph}px`;
  }
  const ghost = $('ghost-page');
  ghost.style.width = `${pw}px`;
  ghost.style.height = `${ph}px`;
  ghost.hidden = isSame(state) || state.slotCount === 0;
  track.style.gap = `${PAGE_GAP}px`;
  track.style.top = `${padT + Math.max(0, (sh - ph) / 2)}px`;
  trackX = padL + sw / 2 - (page * (pw + PAGE_GAP) + pw / 2);
}

/** Slide the track so the Active Page is centred (carousel rule 3). */
let trackX = 0;
let slidePending = false;
function placeTrack(animate: boolean) {
  track.classList.toggle('no-anim', !animate);
  track.style.transform = `translateX(${trackX}px)`;
}

function slotsMm(p = page): Slot[] {
  return collageSlots(state, p);
}
/** Slot rect in css px relative to its canvas. */
const toPx = (r: Rect): Rect => ({ x: r.x * view.scale, y: r.y * view.scale, w: r.w * view.scale, h: r.h * view.scale });

/** Page whose Sheet is under a client point. */
function pageAt(clientX: number, clientY: number): number | null {
  for (let p = 0; p < pageEls.length; p++) {
    const b = pageEls[p].canvas.getBoundingClientRect();
    if (clientX >= b.left && clientX <= b.right && clientY >= b.top && clientY <= b.bottom) return p;
  }
  return null;
}
/** Slot under a client point on Page p. */
function slotOn(p: number, clientX: number, clientY: number): number | null {
  const el = pageEls[p]?.canvas;
  if (!el) return null;
  const b = el.getBoundingClientRect();
  const x = (clientX - b.left) / view.scale;
  const y = (clientY - b.top) / view.scale;
  const slots = slotsMm(p);
  const ps = state.pages[p]?.slots ?? [];
  // topmost first: later Slots are drawn on top
  for (let i = slots.length - 1; i >= 0; i--) if (hitsSlot(slots[i], tiltOf(state, p, i, ps[i]), x, y)) return i;
  return null;
}
function slotAt(clientX: number, clientY: number): number | null {
  return slotOn(page, clientX, clientY);
}
/** Page + Slot under a point on any Page. */
function hitAt(clientX: number, clientY: number): { p: number; i: number | null } | null {
  const p = pageAt(clientX, clientY);
  return p === null ? null : { p, i: slotOn(p, clientX, clientY) };
}

// ---------- Slot animation (rule 17) ----------
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const ANIM_MS = 180;
let anim: { from: Slot[]; to: Slot[]; start: number } | null = null;
let lastLayoutKey = '';
let animationsStarted = 0;
let lastRects: Slot[] = [];
const layoutKey = (c: Collage) => JSON.stringify([page, c.sheet, c.pages[page]?.slots.length, c.templateId, c.slant, c.gap, c.margin, c.mode, c.photoSize]);
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function startAnimationIfNeeded() {
  const key = layoutKey(state);
  if (key === lastLayoutKey) return;
  const to = slotsMm();
  const samePage = lastLayoutKey.startsWith(`[${page},`);
  if (lastLayoutKey && samePage && !reducedMotion.matches && lastRects.length) {
    const from = to.map((r, i) => lastRects[i] ?? { x: r.x + r.w / 2, y: r.y + r.h / 2, w: 0, h: 0 });
    anim = { from, to, start: performance.now() };
    animationsStarted++;
  }
  lastLayoutKey = key;
}

/** Slot rectangles as currently drawn (animated); hit-testing always uses the final ones. */
function displayRects(): Slot[] {
  const to = slotsMm();
  if (!anim) return to;
  const t = Math.min(1, (performance.now() - anim.start) / ANIM_MS);
  if (t >= 1 || anim.to.length !== to.length) {
    anim = null;
    return to;
  }
  const e = ease(t);
  return to.map((r, i) => {
    const f = anim!.from[i];
    const poly =
      r.poly && f.poly && f.poly.length === r.poly.length
        ? r.poly.map((q, k) => ({ x: lerp(f.poly![k].x, q.x, e), y: lerp(f.poly![k].y, q.y, e) }))
        : r.poly;
    return { x: lerp(f.x, r.x, e), y: lerp(f.y, r.y, e), w: lerp(f.w, r.w, e), h: lerp(f.h, r.h, e), poly };
  });
}

// ---------- render ----------
let raf = 0;
function requestRender() {
  if (!raf) raf = requestAnimationFrame(render);
}
/** Synchronous render so geometry (hit-testing) is current right after a change. */
function renderNow() {
  if (raf) cancelAnimationFrame(raf);
  render();
}
let photosVersion = 0;
/** Pages within this distance of the Active Page are drawn at full resolution (carousel open risk). */
const NEAR = 2;
function render() {
  raf = 0;
  buildPageEls();
  fit();
  if (frozenX !== null) placeTrackFrozen();
  else placeTrack(!slideNow.instant);
  slideNow.instant = false;
  const dpr = window.devicePixelRatio || 1;
  startAnimationIfNeeded();
  const rects = displayRects();
  lastRects = rects;
  const base = JSON.stringify([state.sheet, state.mode, state.photoSize, state.templateId, state.slant, state.gap, state.margin, state.background, state.style, state.cutMarks, view.scale, dpr, photosVersion, state.photos]);
  pageEls.forEach((e, p) => {
    const near = Math.abs(p - page) <= NEAR;
    const k = near ? view.scale * dpr : view.scale * Math.min(dpr, 1) * 0.35;
    const key = JSON.stringify([base, state.pages[p], near]);
    if (p === page && anim) e.drawn = '';
    if (e.drawn !== key) {
      const { w, h } = sheetSize(state.sheet);
      e.canvas.width = Math.round(w * k);
      e.canvas.height = Math.round(h * k);
      const ctx = e.canvas.getContext('2d')!;
      drawPage(ctx, state, p, (id) => photos.bitmap(id), { scale: k, placeholders: true, rects: p === page ? rects : undefined });
      e.drawn = p === page && anim ? '' : key;
    }
    if (near) renderOverlay(p, p === page ? rects : slotsMm(p));
    else e.overlay.replaceChildren();
  });
  renderChrome();
  if (anim) requestRender();
}
const slideNow = { instant: true };

/** Sheet label, Welcome card, tray badge (rules 7, 13, 21). */
function renderChrome() {
  const { w, h } = sheetSize(state.sheet);
  const preset = SHEET_PRESETS.find((p) => p.id === state.sheet.preset);
  const fmt = (n: number) => fmtNum(n);
  let label = `${preset ? preset.label : t('Eigenes Format')} · ${fmt(w)} × ${fmt(h)} mm`;
  if (state.mode === 'fixed') {
    const d = photoSizeDims(state.photoSize);
    const ps = PHOTO_SIZES.find((p) => p.id === state.photoSize.preset);
    label += ` · ${state.slotCount} × ${ps ? t(ps.label) : t('Eigene Größe')} ${fmt(d.w)} × ${fmt(d.h)} mm`;
  }
  pageEls.forEach((e, i) => {
    e.sheetLabel.textContent = label;
    e.num.textContent = t('Seite {n} / {total}', { n: i + 1, total: pageEls.length });
  });
  ($('nav-prev') as HTMLButtonElement).disabled = page <= 0;
  ($('nav-next') as HTMLButtonElement).disabled = page >= state.pages.length - 1;
  $('nav-prev').hidden = $('nav-next').hidden = state.pages.length < 2;
  const empty = photoCount(state) === 0 && state.tray.length === 0;
  $('welcome').hidden = !empty;
  const badge = $('tray-count');
  badge.textContent = String(state.tray.length);
  badge.classList.toggle('has', state.tray.length > 0);
}

type At = { p: number; i: number };
let dropTarget: At | null = null;
let hovered: At | null = null;
const isAt = (a: At | null, p: number, i: number) => !!a && a.p === p && a.i === i;
function renderOverlay(pg: number, slots: Slot[]) {
  const overlay = pageEls[pg].overlay;
  const ps = state.pages[pg]?.slots ?? [];
  // reuse elements so hover toolbars and badges are not torn down while the pointer is on them
  while (overlay.children.length > slots.length) overlay.lastElementChild!.remove();
  slots.forEach((r, i) => {
    const p = toPx(r);
    let el = overlay.children[i] as HTMLElement | undefined;
    if (!el) {
      el = document.createElement('div');
      el.className = 'slot-ui';
      el.dataset.slot = String(i);
      overlay.appendChild(el);
    }
    const it = ps[i];
    // follow the visible shape: Tilt as a CSS transform, polygons as an SVG outline (pages rule 24)
    const tilt = tiltOf(state, pg, i, it);
    const f = tiltFit(p.w, p.h, tilt);
    Object.assign(el.style, {
      left: `${p.x}px`,
      top: `${p.y}px`,
      width: `${p.w}px`,
      height: `${p.h}px`,
      transform: tilt ? `rotate(${tilt}deg) scale(${f})` : '',
    });
    el.classList.toggle('poly', !!r.poly);
    let outline = el.querySelector<SVGSVGElement>(':scope > svg.outline');
    if (r.poly) {
      if (!outline) {
        outline = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        outline.classList.add('outline');
        outline.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'polygon'));
        el.prepend(outline);
      }
      outline.setAttribute('viewBox', `0 0 ${p.w} ${p.h}`);
      outline.firstElementChild!.setAttribute('points', r.poly.map((q) => `${q.x * view.scale - p.x},${q.y * view.scale - p.y}`).join(' '));
    } else outline?.remove();
    el.classList.toggle('selected', pg === page && i === selected);
    el.classList.toggle('drop-target', isAt(dropTarget, pg, i));
    const meta = it && state.photos[it.photoId];
    el.classList.toggle('occupied', !!(it && meta));

    let badgeKey = '';
    let dpi = 0;
    if (it && meta) {
      const area = photoArea(state, r);
      dpi = Math.round(effectiveDpi(meta, clampCrop(meta, it.crop, area), area));
      el.dataset.dpi = String(dpi);
      const lvl = dpiLevel(dpi);
      if (lvl !== 'ok') badgeKey = `${lvl}:${dpi}`;
    } else delete el.dataset.dpi;
    let badge = el.querySelector<HTMLElement>(':scope > .dpi');
    if ((badge?.dataset.key ?? '') !== badgeKey) {
      badge?.remove();
      badge = null;
      if (badgeKey) {
        const lvl = badgeKey.split(':')[0];
        badge = document.createElement('span');
        badge.className = `dpi ${lvl}`;
        badge.dataset.key = badgeKey;
        badge.append(icon('TriangleAlert', 13), `${dpi} dpi`);
        badge.title = lvl === 'bad' ? t('{dpi} dpi – wird sehr wahrscheinlich unscharf', { dpi }) : t('{dpi} dpi – kann unscharf wirken', { dpi });
        el.prepend(badge);
      }
    }

    const wantGuide = pg === page && i === selected && !!(it && meta) && isPassbildPortrait() && guideOn;
    const guide = el.querySelector(':scope > .bio-guide');
    if (wantGuide && !guide) el.appendChild(bioGuide());
    if (!wantGuide && guide) guide.remove();

    const wantTools = !!(it && meta) && isAt(hovered, pg, i) && !gesture && !wantGuide && p.w >= 120 && p.h >= 60;
    const tools = el.querySelector(':scope > .slot-tools');
    if (wantTools && !tools) el.appendChild(slotTools(pg, i));
    if (!wantTools && tools) tools.remove();
  });
}

// ---------- Biometric guide (photo sizes rules 18, 19) ----------
const isPassbildPortrait = () => state.mode === 'fixed' && state.photoSize.preset === 'passbild' && state.photoSize.orientation === 'portrait';
let guideOn = true;
const MM = 45; // Passbild height
function bioGuide() {
  const g = document.createElement('div');
  g.className = 'bio-guide';
  g.title = t('Ausrichtungshilfe – keine amtliche Prüfung');
  const band = (cls: string, from: number, to: number, label: string) => {
    const e = document.createElement('i');
    e.className = cls;
    Object.assign(e.style, { top: `${(from / MM) * 100}%`, height: `${((to - from) / MM) * 100}%` });
    if (label) {
      const b = document.createElement('b');
      b.textContent = t(label);
      b.style.top = '50%';
      e.appendChild(b);
    }
    g.appendChild(e);
  };
  band('band', 3, 7, 'Scheitel');
  band('eyes', 18, 23, 'Augen');
  band('band', 36, 40, 'Kinn');
  const c = document.createElement('i');
  c.className = 'center';
  g.appendChild(c);
  return g;
}

/** Slot toolbar (rule 15). */
function slotTools(pg: number, i: number) {
  const bar = document.createElement('div');
  bar.className = 'slot-tools';
  const add = (name: string, tip: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = tip;
    b.setAttribute('aria-label', tip);
    b.append(icon(name, 16));
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pg !== page) activatePage(pg);
      if (selected !== i) select(i);
      fn();
    });
    bar.appendChild(b);
  };
  add('RotateCcw', t('90° nach links'), () => updateCrop((s) => rotate(s.meta, s.crop, s.rect, -1)));
  add('RotateCw', t('90° nach rechts'), () => updateCrop((s) => rotate(s.meta, s.crop, s.rect, 1)));
  add('FlipHorizontal2', t('Spiegeln'), () => updateCrop((s) => mirror(s.meta, s.crop, s.rect)));
  add('Archive', t('In die Ablage (Entf)'), () => {
    commit(slotToTray(state, pg, i));
    hovered = null;
  });
  return bar;
}

track.addEventListener('pointermove', (e) => {
  if (gesture) return;
  const hit = hitAt(e.clientX, e.clientY);
  const h = hit && hit.i !== null && state.pages[hit.p]?.slots[hit.i] ? { p: hit.p, i: hit.i } : null;
  if (!(h ? isAt(hovered, h.p, h.i) : hovered === null)) {
    hovered = h;
    requestRender();
  }
});
track.addEventListener('pointerleave', () => {
  if (hovered !== null && !gesture) {
    hovered = null;
    requestRender();
  }
});

// ---------- controls ----------
const presetBox = $('preset');
for (const p of [...SHEET_PRESETS, { id: 'custom', label: 'Eigene' }]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.role = 'radio';
  b.dataset.preset = p.id;
  b.textContent = t(p.label);
  b.onclick = () => {
    const ps = SHEET_PRESETS.find((x) => x.id === p.id);
    const sheet = ps ? { ...state.sheet, preset: p.id, w: ps.w, h: ps.h } : { ...state.sheet, preset: 'custom' };
    commit({ ...state, sheet });
  };
  presetBox.appendChild(b);
}
const inp = (id: string) => $<HTMLInputElement>(id);

function syncControls() {
  const s = state.sheet;
  presetBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.preset === s.preset)));
  $('custom-size').hidden = s.preset !== 'custom';
  inp('custom-w').value = String(s.w);
  inp('custom-h').value = String(s.h);
  $('orient-portrait').setAttribute('aria-pressed', String(s.orientation === 'portrait'));
  $('orient-landscape').setAttribute('aria-pressed', String(s.orientation === 'landscape'));
  const fixed = state.mode === 'fixed';
  $('mode-free').setAttribute('aria-pressed', String(!fixed));
  $('mode-fixed').setAttribute('aria-pressed', String(fixed));
  $('fixed-opts').hidden = !fixed;
  $('free-opts').hidden = fixed;
  const max = maxSlots(state);
  inp('count').max = String(Math.max(1, max));
  inp('count').disabled = fixed && max === 0;
  inp('count').value = String(state.slotCount);
  $('count-out').textContent = fixed ? `${state.slotCount} / ${max}` : String(state.slotCount);
  const ps = state.photoSize;
  psBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.size === ps.preset)));
  $('ps-custom').hidden = ps.preset !== 'custom';
  inp('ps-w').value = String(ps.w);
  inp('ps-h').value = String(ps.h);
  $('ps-portrait').setAttribute('aria-pressed', String(ps.orientation === 'portrait'));
  $('ps-landscape').setAttribute('aria-pressed', String(ps.orientation === 'landscape'));
  inp('same-photo').checked = state.samePhoto;
  inp('cut-marks').checked = state.cutMarks;
  $('fit-hint').hidden = !(fixed && capacity(state).max === 0);
  $('guide-row').hidden = !isPassbildPortrait();
  inp('guide-toggle').checked = guideOn;
  inp('gap').value = String(state.gap);
  $('gap-out').textContent = `${fmtNum(state.gap)} mm`;
  inp('margin').value = String(state.margin);
  $('margin-out').textContent = `${fmtNum(state.margin)} mm`;
  inp('background').value = state.background;
  renderTemplates();
  const curTpl = templateFor(state.slotCount, state.templateId);
  $('slant-row').hidden = fixed || curTpl.id !== 'diagonal';
  inp('slant').value = String(state.slant);
  $('slant-out').textContent = `${state.slant}°`;
  syncStyle();
  const it = selected !== null ? curSlots()[selected] : null;
  $('crop-panel').classList.toggle('open', !!it);
  if (it) {
    inp('zoom').value = String(Math.round(it.crop.zoom * 100));
    $('zoom-out').textContent = `${Math.round(it.crop.zoom * 100)} %`;
    const scatter = styleActive(state) && state.style.scatter;
    $('tilt-row').hidden = !scatter;
    const tl = Math.round(tiltOf(state, page, selected!, it) * 10) / 10;
    inp('tilt').value = String(tl);
    $('tilt-out').textContent = `${fmtNum(tl)}°`;
  }
  renderPages();
  document.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(fillSlider);
  ($('undo') as HTMLButtonElement).disabled = !history.canUndo;
  ($('redo') as HTMLButtonElement).disabled = !history.canRedo;
}

function renderTemplates() {
  const box = $('templates');
  const tpls = templatesFor(state.slotCount);
  const key = `${state.slotCount}|${state.templateId}|${state.slant}|${state.sheet.orientation}|${state.sheet.w}|${state.sheet.h}|${state.gap}|${state.margin}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.replaceChildren();
  const { w, h } = sheetSize(state.sheet);
  const k = 56 / Math.max(w, h);
  const active = templateFor(state.slotCount, state.templateId).id;
  tpls.forEach((tp) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.template = tp.id;
    b.setAttribute('aria-pressed', String(tp.id === active));
    const rects = computeSlots({ ...state, mode: 'free', templateId: tp.id });
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(w * k));
    svg.setAttribute('height', String(h * k));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const rect = (x: number, y: number, rw: number, rh: number, attrs: Record<string, string>) => {
      const e = document.createElementNS(NS, 'rect');
      for (const [a, v] of Object.entries({ x: String(x), y: String(y), width: String(rw), height: String(rh), ...attrs })) e.setAttribute(a, v);
      svg.appendChild(e);
    };
    rect(0, 0, w, h, { fill: 'none', stroke: 'currentColor', 'stroke-width': String(2 / k) });
    for (const r of rects) {
      if (r.poly) {
        const e = document.createElementNS(NS, 'polygon');
        e.setAttribute('points', r.poly.map((q) => `${q.x},${q.y}`).join(' '));
        e.setAttribute('fill', 'currentColor');
        e.setAttribute('opacity', '.28');
        svg.appendChild(e);
      } else rect(r.x, r.y, r.w, r.h, { fill: 'currentColor', opacity: '.28', rx: String(1.5 / k) });
    }
    const label = document.createElement('span');
    label.textContent = t(tp.label);
    b.append(svg, label);
    b.title = t(tp.label);
    b.onclick = () => commit({ ...state, templateId: tp.id });
    box.appendChild(b);
  });
}

function fillSlider(el: HTMLInputElement) {
  const min = Number(el.min), max = Number(el.max);
  el.style.setProperty('--p', `${((Number(el.value) - min) / (max - min)) * 100}%`);
}
for (const id of ['custom-w', 'custom-h']) {
  inp(id).onchange = () => {
    const w = Math.max(20, Math.min(1000, Number(inp('custom-w').value) || state.sheet.w));
    const h = Math.max(20, Math.min(1000, Number(inp('custom-h').value) || state.sheet.h));
    commit({ ...state, sheet: { ...state.sheet, preset: 'custom', w, h } });
  };
}
$('orient-portrait').onclick = () => commit({ ...state, sheet: { ...state.sheet, orientation: 'portrait' } });
$('orient-landscape').onclick = () => commit({ ...state, sheet: { ...state.sheet, orientation: 'landscape' } });

function slider(id: string, apply: (v: number) => Collage) {
  const el = inp(id);
  el.addEventListener('input', () => {
    fillSlider(el);
    commit(apply(Number(el.value)), id);
  });
  el.addEventListener('change', endCoalesce);
}
slider('count', (v) => setSlotCount(state, v));
slider('gap', (v) => ({ ...state, gap: v }));
slider('margin', (v) => ({ ...state, margin: v }));
inp('background').addEventListener('input', () => commit({ ...state, background: inp('background').value }, 'background'));
inp('background').addEventListener('change', endCoalesce);
// ---------- Layout mode + Photo size (photo sizes rules 1–17) ----------
$('mode-free').onclick = () => commit(setLayoutMode(state, 'free'));
$('mode-fixed').onclick = () => commit(setLayoutMode(state, 'fixed'));
const psBox = $('photo-size');
for (const p of [...PHOTO_SIZES, { id: 'custom', label: 'Eigene', w: 0, h: 0, same: false, tip: 'Eigene Größe in mm' }]) {
  const b = document.createElement('button');
  b.type = 'button';
  b.role = 'radio';
  b.dataset.size = p.id;
  b.textContent = t(p.label);
  b.title = p.tip ? t(p.tip) : `${t(p.label)}: ${fmtNum(p.w)} × ${fmtNum(p.h)} mm`;
  b.onclick = () => {
    const ps = p.id === 'custom' ? { ...state.photoSize, preset: 'custom' } : { ...state.photoSize, preset: p.id, w: p.w, h: p.h };
    commit(setPhotoSize(state, ps));
  };
  psBox.appendChild(b);
}
for (const id of ['ps-w', 'ps-h']) {
  inp(id).onchange = () => {
    const clampMm = (v: number, d: number) => Math.max(10, Math.min(500, v || d));
    commit(setPhotoSize(state, { ...state.photoSize, preset: 'custom', w: clampMm(Number(inp('ps-w').value), state.photoSize.w), h: clampMm(Number(inp('ps-h').value), state.photoSize.h) }));
  };
}
$('ps-portrait').onclick = () => commit(setPhotoSize(state, { ...state.photoSize, orientation: 'portrait' }));
$('ps-landscape').onclick = () => commit(setPhotoSize(state, { ...state.photoSize, orientation: 'landscape' }));
inp('same-photo').onchange = () => commit(setSamePhoto(state, inp('same-photo').checked));
inp('cut-marks').onchange = () => commit({ ...state, cutMarks: inp('cut-marks').checked });
$('fit-sheet').onclick = () => {
  const next = fitSheet(state);
  if (next) commit(next);
  else toast(t('Diese Fotogröße passt auf keinen Standardbogen.'));
};
inp('guide-toggle').onchange = () => {
  guideOn = inp('guide-toggle').checked;
  prefs.set('guide', guideOn ? 'on' : 'off');
  renderNow();
};

// ---------- crop (rules 19–23) ----------
function selectedCtx(): { i: number; meta: Collage['photos'][string]; crop: Crop; rect: Rect } | null {
  if (selected === null) return null;
  const it = curSlots()[selected];
  const meta = it && state.photos[it.photoId];
  if (!it || !meta) return null;
  const slot = slotsMm()[selected];
  if (!slot) return null;
  const rect = photoArea(state, slot);
  return { i: selected, meta, crop: clampCrop(meta, it.crop, rect), rect };
}
function updateCrop(fn: (c: NonNullable<ReturnType<typeof selectedCtx>>) => Crop, key: string | null = null) {
  const s = selectedCtx();
  if (!s) return;
  commit(setCrop(state, page, s.i, fn(s)), key);
}
slider('zoom', (v) => {
  const s = selectedCtx();
  return s ? setCrop(state, page, s.i, zoomAt(s.meta, s.crop, s.rect, v / 100)) : state;
});
$('rot-left').onclick = () => updateCrop((s) => rotate(s.meta, s.crop, s.rect, -1));
$('rot-right').onclick = () => updateCrop((s) => rotate(s.meta, s.crop, s.rect, 1));
$('mirror').onclick = () => updateCrop((s) => mirror(s.meta, s.crop, s.rect));
$('reset-crop').onclick = () => updateCrop(() => defaultCrop());
$('to-tray').onclick = () => {
  if (selected !== null) commit(slotToTray(state, page, selected));
};
slider('tilt', (v) => (selected !== null ? setTilt(state, page, selected, Math.max(-TILT_MAX, Math.min(TILT_MAX, v))) : state));

function select(i: number | null) {
  selected = i;
  endCoalesce();
  syncControls();
  requestRender();
}

// ---------- Active Page (carousel rules 3, 5, 10–14) ----------
/** Make Page p the Active Page; slide now, or after the running gesture (rule 5). */
function activatePage(p: number, slide = true) {
  p = Math.max(0, Math.min(p, state.pages.length - 1));
  if (p !== page) {
    page = p;
    selected = null;
    hovered = null;
    anim = null;
    lastLayoutKey = '';
  }
  if (slide) {
    slidePending = false;
    frozenX = null;
  } else slidePending = true;
  syncControls();
  // keep the track where it is while a gesture runs on a neighbour Page
  if (!slide) {
    buildPageEls();
    renderNow();
    placeTrackFrozen();
  } else renderNow();
}
let frozenX: number | null = null;
function placeTrackFrozen() {
  if (frozenX === null) return;
  track.classList.add('no-anim');
  track.style.transform = `translateX(${frozenX}px)`;
}
function currentTrackX() {
  const m = /translateX\((-?[\d.]+)px\)/.exec(track.style.transform);
  return m ? parseFloat(m[1]) : 0;
}
function finishSlide() {
  if (!slidePending) return;
  slidePending = false;
  frozenX = null;
  renderNow();
}
$('nav-prev').onclick = () => activatePage(page - 1);
$('nav-next').onclick = () => activatePage(page + 1);
$('ghost-page').onclick = () => {
  commit(addPage(state));
  activatePage(state.pages.length - 1);
};

// pointer gestures on the Pages
type Gesture = { kind: 'pan' | 'move'; page: number; slot: number; x: number; y: number; moved: boolean; ghost?: HTMLElement };
let gesture: Gesture | null = null;

let emptyPress: At | null = null;
track.addEventListener('click', (e) => {
  const hit = hitAt(e.clientX, e.clientY);
  if (hit && hit.i !== null && emptyPress && isAt(emptyPress, hit.p, hit.i) && !state.pages[hit.p]?.slots[hit.i]) pickPhotos(hit.i, hit.p);
  emptyPress = null;
});
track.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement).closest('.slot-tools, #ghost-page')) return;
  const hit = hitAt(e.clientX, e.clientY);
  if (!hit) {
    select(null);
    return;
  }
  if (hit.p !== page) {
    frozenX = currentTrackX();
    activatePage(hit.p, false);
  }
  const i = hit.i;
  if (i === null) {
    select(null);
    finishSlide();
    return;
  }
  const wasSelected = selected === i;
  if (!curSlots()[i]) {
    // empty Slot: pick a file for exactly this Slot (UI v2 rule 14)
    select(null);
    emptyPress = { p: page, i };
    finishSlide();
    return;
  }
  select(i);
  track.setPointerCapture(e.pointerId);
  gesture = { kind: wasSelected ? 'pan' : 'move', page, slot: i, x: e.clientX, y: e.clientY, moved: false };
});

track.addEventListener('pointermove', (e) => {
  if (!gesture) return;
  const dx = e.clientX - gesture.x;
  const dy = e.clientY - gesture.y;
  if (!gesture.moved && Math.hypot(dx, dy) < 3) return;
  if (gesture.kind === 'pan') {
    gesture.moved = true;
    gesture.x = e.clientX;
    gesture.y = e.clientY;
    updateCrop((s) => pan(s.meta, s.crop, s.rect, dx / view.scale, dy / view.scale), 'pan');
  } else {
    if (!gesture.moved) {
      gesture.moved = true;
      const it = state.pages[gesture.page].slots[gesture.slot]!;
      const g = document.createElement('img');
      g.className = 'drag-ghost';
      g.src = photos.url(it.photoId);
      document.body.appendChild(g);
      gesture.ghost = g;
    }
    gesture.ghost!.style.left = `${e.clientX - 45}px`;
    gesture.ghost!.style.top = `${e.clientY - 45}px`;
    const hit = hitAt(e.clientX, e.clientY);
    const nt = hit && hit.i !== null && !(hit.p === gesture.page && hit.i === gesture.slot) ? { p: hit.p, i: hit.i } : null;
    if (!(nt ? isAt(dropTarget, nt.p, nt.i) : dropTarget === null)) {
      dropTarget = nt;
      requestRender();
    }
    $('tray').classList.toggle('drop-target', overTray(e.clientX, e.clientY));
    markThumb(thumbAt(e.clientX, e.clientY));
  }
});

/** Page thumbnail under a point (pages rule 8). */
function thumbAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('#pages [data-page]');
  return el ? Number(el.dataset.page) : null;
}
function markThumb(p: number | null) {
  document.querySelectorAll<HTMLElement>('#pages [data-page]').forEach((t) => t.classList.toggle('drop-target', Number(t.dataset.page) === p));
}

function overTray(x: number, y: number) {
  const r = $('tray').getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function endGesture(e: PointerEvent, cancelled = false) {
  const g = gesture;
  gesture = null;
  if (!g) return finishSlide();
  g.ghost?.remove();
  $('tray').classList.remove('drop-target');
  markThumb(null);
  dropTarget = null;
  endCoalesce();
  if (g.kind === 'move' && g.moved && !cancelled) {
    const tp = thumbAt(e.clientX, e.clientY);
    const hit = hitAt(e.clientX, e.clientY);
    if (overTray(e.clientX, e.clientY)) {
      commit(slotToTray(state, g.page, g.slot));
      select(null);
    } else if (tp !== null && tp !== g.page) {
      commit(moveToPage(state, g.page, g.slot, tp));
      select(null);
    } else if (hit && hit.i !== null && !(hit.p === g.page && hit.i === g.slot)) {
      // same Page: swap/move; another Page: swap/move across Pages (carousel rule 6)
      commit(moveAcross(state, g.page, g.slot, hit.p, hit.i));
      if (hit.p !== page) activatePage(Math.min(hit.p, state.pages.length - 1), false);
      if (state.pages[page]?.slots[hit.i]) select(hit.i);
    }
  }
  finishSlide();
  requestRender();
}
track.addEventListener('pointerup', (e) => endGesture(e));
track.addEventListener('pointercancel', (e) => endGesture(e, true));

track.addEventListener('dblclick', (e) => {
  const hit = hitAt(e.clientX, e.clientY);
  if (!hit || hit.i === null || !state.pages[hit.p]?.slots[hit.i]) return;
  if (hit.p !== page) activatePage(hit.p);
  select(hit.i);
  updateCrop(() => defaultCrop());
});

let wheelTimer = 0;
let wheelLock = 0;
let wheelAccum = 0;
/** One Page per wheel notch / swipe over empty stage (carousel rules 12, 13). */
function wheelStep(delta: number) {
  wheelAccum += delta;
  const now = performance.now();
  if (Math.abs(wheelAccum) < 30 || now < wheelLock) return;
  activatePage(page + Math.sign(wheelAccum));
  wheelAccum = 0;
  wheelLock = now + 350;
}
sheetArea.addEventListener(
  'wheel',
  (e) => {
    const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
    const hit = hitAt(e.clientX, e.clientY);
    if (!horizontal && hit && hit.i !== null && state.pages[hit.p]?.slots[hit.i]) {
      e.preventDefault();
      if (hit.p !== page) activatePage(hit.p);
      if (selected !== hit.i) select(hit.i);
      const s = selectedCtx()!;
      const b = cv().getBoundingClientRect();
      const ox = (e.clientX - b.left) / view.scale - (s.rect.x + s.rect.w / 2);
      const oy = (e.clientY - b.top) / view.scale - (s.rect.y + s.rect.h / 2);
      const factor = Math.exp(-e.deltaY * 0.0015);
      updateCrop(() => zoomAt(s.meta, s.crop, s.rect, s.crop.zoom * factor, ox, oy), 'wheel');
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(endCoalesce, 400);
      return;
    }
    if (state.pages.length < 2 && !horizontal) return;
    e.preventDefault();
    wheelStep(horizontal ? e.deltaX || e.deltaY : e.deltaY);
  },
  { passive: false },
);

// keyboard (rules 21, 22, 26)
window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  const typing = tag === 'INPUT' && !['range', 'button', 'color', 'checkbox', 'radio'].includes((e.target as HTMLInputElement).type);
  if ((e.ctrlKey || e.metaKey) && !typing) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) return e.preventDefault(), undo();
    if (k === 'y' || (k === 'z' && e.shiftKey)) return e.preventDefault(), redo();
    if (k === 'p') return e.preventDefault(), void $('print').click();
  }
  if (typing || tag === 'SELECT') return;
  if (e.key === 'Escape') return select(null);
  if (e.key === 'PageUp' || e.key === 'PageDown') {
    e.preventDefault();
    return activatePage(page + (e.key === 'PageDown' ? 1 : -1));
  }
  const s = selectedCtx();
  if (!s) {
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tag !== 'INPUT') {
      e.preventDefault();
      activatePage(page + (e.key === 'ArrowRight' ? 1 : -1));
    }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    commit(slotToTray(state, page, s.i));
    return;
  }
  const step = e.shiftKey ? 10 : 1;
  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (d && tag !== 'INPUT') {
    e.preventDefault();
    updateCrop((c) => pan(c.meta, c.crop, c.rect, d[0], d[1]), 'nudge');
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key.startsWith('Arrow')) endCoalesce();
});

stage.addEventListener('pointerdown', (e) => {
  if (e.target === stage || e.target === sheetArea || e.target === track) select(null);
});

// ---------- undo/redo (rule 26) ----------
function undo() {
  endCoalesce();
  const prev = history.undo(state);
  if (prev) (state = prev), changed();
}
function redo() {
  endCoalesce();
  const next = history.redo(state);
  if (next) (state = next), changed();
}
$('undo').onclick = undo;
$('redo').onclick = redo;

// ---------- drag & drop of files and tray items (rules 11, 12, 18) ----------
const TRAY_MIME = 'application/x-collagewerk-tray';
const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
const hasTray = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes(TRAY_MIME);

const welcome = $('welcome');
const overWelcome = (e: DragEvent) => !welcome.hidden && welcome.contains(e.target as Node);
/** Slot under a drag/drop, ignoring the Welcome card (dropping there fills in order, rule 22). */
const dropHit = (e: DragEvent) => (overWelcome(e) ? null : hitAt(e.clientX, e.clientY));
const overGhost = (e: DragEvent) => !!(e.target as HTMLElement | null)?.closest?.('#ghost-page');
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e) && !hasTray(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = hasTray(e) ? 'move' : 'copy';
  welcome.classList.toggle('drop-target', overWelcome(e));
  markThumb(thumbAt(e.clientX, e.clientY));
  $('ghost-page').classList.toggle('drop-target', overGhost(e));
  const h = dropHit(e);
  const t = h && h.i !== null ? { p: h.p, i: h.i } : null;
  if (!(t ? isAt(dropTarget, t.p, t.i) : dropTarget === null)) {
    dropTarget = t;
    requestRender();
  }
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) welcome.classList.remove('drop-target');
  if (e.relatedTarget === null && dropTarget !== null) {
    dropTarget = null;
    requestRender();
  }
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e) && !hasTray(e)) return;
  e.preventDefault();
  const h = dropHit(e);
  const tp = thumbAt(e.clientX, e.clientY);
  const ghost = overGhost(e);
  markThumb(null);
  welcome.classList.remove('drop-target');
  $('ghost-page').classList.remove('drop-target');
  dropTarget = null;
  // a drop onto another Page makes it the Active Page (carousel rule 7)
  if (h && h.p !== page) activatePage(h.p);
  const t = h ? h.i : null;
  if (hasTray(e)) {
    const idx = Number(e.dataTransfer!.getData(TRAY_MIME));
    if (ghost) {
      commit(addPage(state));
      commit(trayToPage(state, idx, state.pages.length - 1));
      activatePage(state.pages.length - 1);
    } else if (tp !== null) {
      commit(trayToPage(state, idx, tp));
      requestRender();
    } else if (t !== null) {
      commit(trayToSlot(state, idx, page, t));
      select(t);
    } else requestRender();
    return;
  }
  const files = [...e.dataTransfer!.files];
  if (ghost) {
    commit(addPage(state));
    const last = state.pages.length - 1;
    void addFiles(files, undefined, last).then(() => activatePage(state.pages.length - 1));
  } else if (tp !== null) addFiles(files, undefined, tp);
  else addFiles(files, t ?? undefined);
});

function renderTray() {
  const box = $('tray-items');
  box.replaceChildren();
  state.tray.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = 'tray-item';
    d.draggable = true;
    d.dataset.index = String(i);
    d.title = state.photos[it.photoId]?.name ?? '';
    const img = document.createElement('img');
    img.src = photos.url(it.photoId);
    img.alt = d.title;
    d.appendChild(img);
    d.addEventListener('dragstart', (e) => {
      e.dataTransfer!.setData(TRAY_MIME, String(i));
      e.dataTransfer!.effectAllowed = 'move';
    });
    box.appendChild(d);
  });
}

let pickTarget: number | undefined;
function pickPhotos(target?: number, p = page) {
  pickTarget = target;
  if (p !== page) activatePage(p);
  inp('file-photos').click();
}
$('add-photos').onclick = () => pickPhotos();
$('welcome-pick').onclick = () => pickPhotos();
inp('file-photos').onchange = () => {
  const files = [...(inp('file-photos').files ?? [])];
  inp('file-photos').value = '';
  addFiles(files, pickTarget);
  pickTarget = undefined;
};
$('deselect').onclick = () => select(null);

// ---------- collage file (rule 28) ----------
function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

$('save-file').onclick = async () => {
  const images: Record<string, string> = {};
  for (const id of referencedPhotoIds(state)) {
    const b = photos.blob(id);
    if (b) images[id] = await blobToDataUrl(b);
  }
  const f = toFile(state, images);
  download(new Blob([JSON.stringify(f)], { type: 'application/json' }), `collage-${stamp()}.collagewerk`);
};
$('open-file').onclick = () => inp('file-collage').click();
inp('file-collage').onchange = async () => {
  const file = inp('file-collage').files?.[0];
  inp('file-collage').value = '';
  if (!file) return;
  try {
    await openCollageText(await file.text());
  } catch (err) {
    toast(t((err as Error).message));
  }
};
async function openCollageText(text: string) {
  const f = parseFile(text);
  for (const [id, url] of Object.entries(f.images)) {
    const blob = await (await fetch(url)).blob();
    photos.put(id, blob);
    await db.savePhoto(id, blob);
  }
  await photos.ensureAll(Object.keys(f.images));
  select(null);
  commit(f.collage);
}

// ---------- output (v1 rules 29, 30; pages rules 11–15) ----------
async function renderOutput(dpi: number, p = page) {
  await photos.ensureAll(referencedPhotoIds(state));
  return renderToCanvas(state, p, (id) => photos.bitmap(id), dpi);
}
const toBlob = (cv: HTMLCanvasElement, type = 'image/png', q?: number) =>
  new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error(t('Export fehlgeschlagen')))), type, q));
const pageIndices = () => state.pages.map((_, i) => i);

$('export-png').onclick = async () => {
  const st = stamp();
  const multi = state.pages.length > 1;
  for (const p of pageIndices()) {
    const blob = await toBlob(await renderOutput(300, p));
    download(blob, multi ? `collage-${st}-${p + 1}.png` : `collage-${st}.png`);
  }
};

/** One PDF, one page per Page, media box = Sheet size (pages rule 13). */
async function buildCollagePdf(): Promise<Blob> {
  const { w, h } = sheetSize(state.sheet);
  const pages: PdfPage[] = [];
  for (const p of pageIndices()) {
    const cv = await renderOutput(300, p);
    const jpeg = new Uint8Array(await (await toBlob(cv, 'image/jpeg', 0.92)).arrayBuffer());
    pages.push({ wMm: w, hMm: h, jpeg, pxW: cv.width, pxH: cv.height });
    cv.width = cv.height = 0; // free memory before the next Page
  }
  return buildPdf(pages);
}
async function exportPdf() {
  download(await buildCollagePdf(), `collage-${stamp()}.pdf`);
}
$('export-pdf').onclick = () => void exportPdf();

async function preparePrint() {
  const { w, h } = sheetSize(state.sheet);
  const root = $('print-root');
  root.replaceChildren();
  for (const p of pageIndices()) {
    const blob = await toBlob(await renderOutput(300, p));
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    img.style.width = `${w}mm`;
    img.style.height = `${h}mm`;
    await img.decode();
    root.appendChild(img);
  }
  let st = document.getElementById('page-style');
  if (!st) {
    st = document.createElement('style');
    st.id = 'page-style';
    document.head.appendChild(st);
  }
  st.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; } @media print { html, body { width: ${w}mm; margin: 0; } #print-root img { break-after: page; } #print-root img:last-child { break-after: auto; } }`;
}
async function doPrint() {
  await preparePrint();
  window.print();
}

/** Hint card before the print dialog (pages rule 14). */
const printCard = $<HTMLDialogElement>('print-card');
function sheetLabel() {
  const { w, h } = sheetSize(state.sheet);
  const preset = SHEET_PRESETS.find((p) => p.id === state.sheet.preset);
  const fmt = (n: number) => fmtNum(n);
  return `${preset ? preset.label + ' – ' : ''}${fmt(w)} × ${fmt(h)} mm`;
}
$('print').onclick = () => {
  if (prefs.get('printCard') === 'off') return void doPrint();
  $('pc-paper').textContent = sheetLabel();
  $('pc-pages').textContent = state.pages.length > 1 ? t('{n} Seiten', { n: state.pages.length }) : t('1 Seite');
  inp('pc-dontshow').checked = false;
  printCard.showModal();
};
function closeCard() {
  if (inp('pc-dontshow').checked) prefs.set('printCard', 'off');
  printCard.close();
}
$('pc-print').onclick = () => {
  closeCard();
  void doPrint();
};
$('pc-pdf').onclick = () => {
  closeCard();
  void exportPdf();
};
$('pc-cancel').onclick = () => closeCard();

// ---------- New collage (carousel rules 15–17) ----------
const newCard = $<HTMLDialogElement>('new-card');
$('new-collage').onclick = () => {
  newCard.showModal();
  $('nc-keep').focus();
};
function startNew(keep: boolean) {
  newCard.close();
  select(null);
  commit(newCollage(state, keep));
  activatePage(0);
  toast(t('Neue Collage begonnen – Strg+Z holt alles zurück.'), 'info');
}
$('nc-keep').onclick = () => startNew(true);
$('nc-reset').onclick = () => startNew(false);
$('nc-cancel').onclick = () => newCard.close();

// ---------- Page strip (pages rules 1–8) ----------
function goPage(p: number) {
  activatePage(p);
}
let thumbsKey = '';
function renderPages() {
  const strip = $('pages');
  const box = $('page-thumbs');
  const n = state.pages.length;
  strip.hidden = isSame(state) || state.slotCount === 0;
  $('page-label').textContent = t('Seite {n} / {total}', { n: page + 1, total: n });
  ($('page-delete') as HTMLButtonElement).title = n > 1 ? t('Seite {n} löschen (Fotos in die Ablage)', { n: page + 1 }) : t('Seite leeren (Fotos in die Ablage)');
  const lastMulti = n > 1 && page === n - 1;
  $('page-count').hidden = !lastMulti;
  if (lastMulti) $('page-count-out').textContent = String(state.pages[page].slots.length);
  const key = JSON.stringify([n, page, state.sheet]);
  if (thumbsKey !== key || box.children.length !== n) {
    thumbsKey = key;
    box.replaceChildren(
      ...state.pages.map((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'page-thumb';
        b.dataset.page = String(i);
        b.title = t('Seite {n}', { n: i + 1 });
        b.setAttribute('aria-current', String(i === page));
        const cv = document.createElement('canvas');
        // size the thumbnail right away so the strip does not shift when it is drawn later
        const { w, h } = sheetSize(state.sheet);
        const k = 44 / Math.max(w, h);
        cv.style.width = `${w * k}px`;
        cv.style.height = `${h * k}px`;
        const num = document.createElement('span');
        num.textContent = String(i + 1);
        b.append(cv, num);
        b.onclick = () => goPage(i);
        return b;
      }),
    );
  }
  scheduleThumbs();
}
let thumbTimer = 0;
function scheduleThumbs() {
  clearTimeout(thumbTimer);
  thumbTimer = window.setTimeout(drawThumbs, 60);
}
function drawThumbs() {
  const { w, h } = sheetSize(state.sheet);
  const dpr = window.devicePixelRatio || 1;
  const k = 44 / Math.max(w, h);
  document.querySelectorAll<HTMLElement>('#page-thumbs [data-page]').forEach((b) => {
    const p = Number(b.dataset.page);
    if (!state.pages[p]) return;
    const cv = b.querySelector('canvas')!;
    cv.style.width = `${w * k}px`;
    cv.style.height = `${h * k}px`;
    cv.width = Math.round(w * k * dpr);
    cv.height = Math.round(h * k * dpr);
    drawPage(cv.getContext('2d')!, state, p, (id) => photos.bitmap(id), { scale: k * dpr });
  });
}
$('page-add').onclick = () => {
  commit(addPage(state));
  goPage(state.pages.length - 1);
};
$('page-delete').onclick = () => {
  commit(deletePage(state, page));
  goPage(Math.min(page, state.pages.length - 1));
};
$('page-prev').onclick = () => goPage(page - 1);
$('page-next').onclick = () => goPage(page + 1);
$('page-count-minus').onclick = () => commit(setLastPageCount(state, state.pages[page].slots.length - 1));
$('page-count-plus').onclick = () => commit(setLastPageCount(state, state.pages[page].slots.length + 1));

// ---------- Style (pages rules 18–23) ----------
function syncStyle() {
  const st = state.style;
  const active = styleActive(state);
  ($('style-fields') as HTMLFieldSetElement).disabled = !active;
  $('style-note').hidden = active;
  document.querySelectorAll<HTMLElement>('#frame-kind [data-frame]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.frame === st.frame)));
  $('frame-color-row').hidden = st.frame !== 'color';
  inp('frame-color').value = st.frameColor;
  $('frame-width-row').hidden = st.frame === 'none';
  inp('frame-width').value = String(st.frameWidth);
  $('frame-width-out').textContent = `${fmtNum(st.frameWidth)} mm`;
  inp('radius').value = String(st.radius);
  $('radius-out').textContent = `${fmtNum(st.radius)} mm`;
  inp('shadow').checked = st.shadow;
  document.querySelectorAll<HTMLElement>('#edge-kind [data-edge]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.edge === st.edges)));
  inp('scatter').checked = st.scatter;
  ($('reshuffle') as HTMLButtonElement).disabled = !st.scatter;
}
const setStyle = (patch: Partial<Collage['style']>, key: string | null = null) => commit({ ...state, style: { ...state.style, ...patch } }, key);
document.querySelectorAll<HTMLElement>('#frame-kind [data-frame]').forEach((b) => (b.onclick = () => setStyle({ frame: b.dataset.frame as Collage['style']['frame'] })));
document.querySelectorAll<HTMLElement>('#edge-kind [data-edge]').forEach((b) => (b.onclick = () => setStyle({ edges: b.dataset.edge as Collage['style']['edges'] })));
inp('frame-color').addEventListener('input', () => setStyle({ frameColor: inp('frame-color').value }, 'frame-color'));
inp('frame-color').addEventListener('change', endCoalesce);
slider('frame-width', (v) => ({ ...state, style: { ...state.style, frameWidth: v } }));
slider('radius', (v) => ({ ...state, style: { ...state.style, radius: v } }));
slider('slant', (v) => ({ ...state, slant: v }));
inp('shadow').onchange = () => setStyle({ shadow: inp('shadow').checked });
inp('scatter').onchange = () => setStyle({ scatter: inp('scatter').checked });
$('reshuffle').onclick = () => setStyle({ seed: (state.style.seed * 7919 + 104729) % 2147483647 || 1 });

// ---------- toast ----------
let toastTimer = 0;
function toast(msg: string, kind: 'error' | 'info' = 'error') {
  const t = $('toast');
  t.replaceChildren(icon(kind === 'error' ? 'CircleAlert' : 'CircleCheck', 18), msg);
  t.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 4000);
}

// ---------- theme + remembered card state (UI v2 rules 2, 5) ----------
const prefs = {
  get(k: string) {
    try {
      return localStorage.getItem(`cw.${k}`);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(`cw.${k}`, v);
    } catch {
      /* ignore */
    }
  },
};
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
function effectiveTheme() {
  return document.documentElement.dataset.theme ?? (systemDark.matches ? 'dark' : 'light');
}
function syncThemeButton() {
  const dark = effectiveTheme() === 'dark';
  const b = $('theme');
  setIcon(b, dark ? 'Sun' : 'Moon');
  b.title = dark ? t('Helles Design') : t('Dunkles Design');
}
guideOn = prefs.get('guide') !== 'off';
const savedTheme = prefs.get('theme');
if (savedTheme === 'dark' || savedTheme === 'light') document.documentElement.dataset.theme = savedTheme;
syncThemeButton();
systemDark.addEventListener('change', syncThemeButton);
$('theme').onclick = () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  prefs.set('theme', next);
  syncThemeButton();
};
document.querySelectorAll<HTMLDetailsElement>('details.card').forEach((d) => {
  if (prefs.get(`card.${d.id}`) === 'closed') d.open = false;
  d.addEventListener('toggle', () => prefs.set(`card.${d.id}`, d.open ? 'open' : 'closed'));
});

// ---------- boot ----------
window.addEventListener('resize', requestRender);
window.addEventListener('pagehide', () => void flushSave());

/** Test hook (also handy for debugging in the console). */
(window as unknown as { __cw: unknown }).__cw = {
  get state() {
    return state;
  },
  get selected() {
    return selected;
  },
  get page() {
    return page;
  },
  goPage,
  buildPdf: buildCollagePdf,
  get animationsStarted() {
    return animationsStarted;
  },
  get animating() {
    return anim !== null;
  },
  slotRectsPx: () => slotsMm().map(toPx),
  slotRectsPxOf: (p: number) => slotsMm(p).map(toPx),
  flushSave,
  preparePrint,
  renderOutput,
  ready: (async () => {
    syncControls();
    renderTray();
    requestRender();
    // never let a slow/blocked IndexedDB keep the editor from working
    await Promise.race([restore().catch((e) => console.warn('restore failed', e)), new Promise((r) => setTimeout(r, 3000))]);
    syncControls();
    renderTray();
    requestRender();
  })(),
};
registerEditorTab();
