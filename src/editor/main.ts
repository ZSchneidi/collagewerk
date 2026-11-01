import './style.css';
import { addPhotos, createCollage, moveSlot, prunePhotos, referencedPhotoIds, setCrop, setSlotCount, slotToTray, trayToSlot } from '../model/collage';
import { clampCrop, defaultCrop, dpiLevel, effectiveDpi, mirror, pan, rotate, zoomAt } from '../model/crop';
import { parseFile, toFile } from '../model/fileformat';
import { History } from '../model/history';
import { collageSlots, computeSlots, MAX_SLOTS, SHEET_PRESETS, sheetSize, templatesFor } from '../model/layout';
import type { Collage, Crop, Rect } from '../model/types';
import { isSupported, PhotoStore } from './photos';
import { drawCollage, renderToCanvas } from './render';
import * as db from './storage';
import { registerEditorTab } from './tab';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- state ----------
let state: Collage = createCollage();
let selected: number | null = null;
const history = new History<Collage>();
let coalesceKey: string | null = null;
const photos = new PhotoStore();
photos.onLoaded = () => requestRender();

/** Apply a change. Records undo history unless the same `key` is still coalescing (slider drags, gestures). */
function commit(next: Collage, key: string | null = null) {
  if (next === state) return;
  if (key === null || key !== coalesceKey) history.push(state);
  coalesceKey = key;
  state = next;
  changed();
}
const endCoalesce = () => (coalesceKey = null);

function changed() {
  if (selected !== null && selected >= state.slotCount) selected = null;
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
  const saved = await db.loadState().catch(() => undefined);
  if (!saved) return;
  const ids = referencedPhotoIds(saved);
  for (const id of ids) {
    const blob = await db.loadPhoto(id);
    if (blob) photos.put(id, blob);
  }
  // drop references to photos whose data is missing
  saved.slots = saved.slots.map((s) => (s && photos.has(s.photoId) ? s : null));
  saved.tray = saved.tray.filter((t) => photos.has(t.photoId));
  state = prunePhotos(saved);
  // remove orphaned photo blobs
  const keys = (await db.photoKeys()) ?? [];
  for (const k of keys) if (!ids.has(String(k))) db.deletePhoto(String(k));
}

// ---------- adding photos (rules 11–15) ----------
async function addFiles(files: File[], target?: number) {
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
  if (bad.length) toast(`Nicht unterstützt: ${bad.join(', ')} (erlaubt: JPG, PNG, WebP, GIF)`);
  if (!metas.length) return;
  commit(addPhotos(state, metas, files.length === 1 ? target : undefined));
}

// ---------- geometry ----------
const canvas = $<HTMLCanvasElement>('sheet');
const ctx = canvas.getContext('2d')!;
const overlay = $('overlay');
const stage = $('stage');
let view = { scale: 1 }; // css px per mm

function fit() {
  const { w, h } = sheetSize(state.sheet);
  const pad = 32;
  const sw = stage.clientWidth - pad * 2;
  const sh = stage.clientHeight - pad * 2;
  view.scale = Math.max(0.5, Math.min(sw / w, sh / h));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${w * view.scale}px`;
  canvas.style.height = `${h * view.scale}px`;
  canvas.width = Math.round(w * view.scale * dpr);
  canvas.height = Math.round(h * view.scale * dpr);
}

function slotsMm(): Rect[] {
  return collageSlots(state);
}
/** Slot rect in css px relative to the canvas. */
const toPx = (r: Rect): Rect => ({ x: r.x * view.scale, y: r.y * view.scale, w: r.w * view.scale, h: r.h * view.scale });

function slotAt(clientX: number, clientY: number): number | null {
  const b = canvas.getBoundingClientRect();
  const x = (clientX - b.left) / view.scale;
  const y = (clientY - b.top) / view.scale;
  const i = slotsMm().findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  return i < 0 ? null : i;
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
function render() {
  raf = 0;
  fit();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawCollage(ctx, state, (id) => photos.bitmap(id), { scale: view.scale * dpr, placeholders: true });
  renderOverlay();
}

let dropTarget: number | null = null;
function renderOverlay() {
  const slots = slotsMm();
  overlay.replaceChildren();
  slots.forEach((r, i) => {
    const p = toPx(r);
    const el = document.createElement('div');
    el.className = 'slot-ui';
    el.dataset.slot = String(i);
    Object.assign(el.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` });
    if (i === selected) el.classList.add('selected');
    if (i === dropTarget) el.classList.add('drop-target');
    const it = state.slots[i];
    const meta = it && state.photos[it.photoId];
    if (it && meta) {
      const dpi = effectiveDpi(meta, clampCrop(meta, it.crop, r), r);
      const lvl = dpiLevel(dpi);
      el.dataset.dpi = String(Math.round(dpi));
      if (lvl !== 'ok') {
        const b = document.createElement('span');
        b.className = `dpi ${lvl}`;
        b.textContent = `${Math.round(dpi)} dpi`;
        b.title = `${Math.round(dpi)} dpi – ${lvl === 'bad' ? 'wird sehr wahrscheinlich unscharf' : 'kann unscharf wirken'}`;
        el.appendChild(b);
      }
    }
    overlay.appendChild(el);
  });
}

// ---------- controls ----------
const presetSel = $<HTMLSelectElement>('preset');
for (const p of SHEET_PRESETS) presetSel.add(new Option(p.label, p.id));
presetSel.add(new Option('Benutzerdefiniert', 'custom'));
const inp = (id: string) => $<HTMLInputElement>(id);

function syncControls() {
  const s = state.sheet;
  presetSel.value = s.preset;
  $('custom-size').hidden = s.preset !== 'custom';
  inp('custom-w').value = String(s.w);
  inp('custom-h').value = String(s.h);
  $('orient-portrait').setAttribute('aria-pressed', String(s.orientation === 'portrait'));
  $('orient-landscape').setAttribute('aria-pressed', String(s.orientation === 'landscape'));
  inp('count').value = String(state.slotCount);
  $('count-out').textContent = String(state.slotCount);
  inp('gap').value = String(state.gap);
  $('gap-out').textContent = `${state.gap} mm`;
  inp('margin').value = String(state.margin);
  $('margin-out').textContent = `${state.margin} mm`;
  inp('background').value = state.background;
  renderTemplates();
  const it = selected !== null ? state.slots[selected] : null;
  $('crop-panel').hidden = !it;
  if (it) {
    inp('zoom').value = String(Math.round(it.crop.zoom * 100));
    $('zoom-out').textContent = `${Math.round(it.crop.zoom * 100)} %`;
  }
  ($('undo') as HTMLButtonElement).disabled = !history.canUndo;
  ($('redo') as HTMLButtonElement).disabled = !history.canRedo;
}

function renderTemplates() {
  const box = $('templates');
  const tpls = templatesFor(state.slotCount);
  const key = `${state.slotCount}|${state.templateIndex}|${state.sheet.orientation}|${state.sheet.w}|${state.sheet.h}|${state.gap}|${state.margin}`;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.replaceChildren();
  const { w, h } = sheetSize(state.sheet);
  const k = 56 / Math.max(w, h);
  tpls.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.template = t.id;
    b.setAttribute('aria-pressed', String(i === state.templateIndex));
    const rects = computeSlots({ ...state, templateIndex: i });
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
    for (const r of rects) rect(r.x, r.y, r.w, r.h, { fill: 'currentColor', opacity: '.45' });
    const label = document.createElement('span');
    label.textContent = t.label;
    b.append(svg, label);
    b.onclick = () => commit({ ...state, templateIndex: i });
    box.appendChild(b);
  });
}

presetSel.onchange = () => {
  const id = presetSel.value;
  const p = SHEET_PRESETS.find((x) => x.id === id);
  const sheet = p ? { ...state.sheet, preset: id, w: p.w, h: p.h } : { ...state.sheet, preset: 'custom' };
  commit({ ...state, sheet });
};
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
  el.addEventListener('input', () => commit(apply(Number(el.value)), id));
  el.addEventListener('change', endCoalesce);
}
slider('count', (v) => setSlotCount(state, v));
slider('gap', (v) => ({ ...state, gap: v }));
slider('margin', (v) => ({ ...state, margin: v }));
inp('background').addEventListener('input', () => commit({ ...state, background: inp('background').value }, 'background'));
inp('background').addEventListener('change', endCoalesce);
inp('count').max = String(MAX_SLOTS);

// ---------- crop (rules 19–23) ----------
function selectedCtx(): { i: number; meta: Collage['photos'][string]; crop: Crop; rect: Rect } | null {
  if (selected === null) return null;
  const it = state.slots[selected];
  const meta = it && state.photos[it.photoId];
  if (!it || !meta) return null;
  const rect = slotsMm()[selected];
  return { i: selected, meta, crop: clampCrop(meta, it.crop, rect), rect };
}
function updateCrop(fn: (c: NonNullable<ReturnType<typeof selectedCtx>>) => Crop, key: string | null = null) {
  const s = selectedCtx();
  if (!s) return;
  commit(setCrop(state, s.i, fn(s)), key);
}
slider('zoom', (v) => {
  const s = selectedCtx();
  return s ? setCrop(state, s.i, zoomAt(s.meta, s.crop, s.rect, v / 100)) : state;
});
$('rot-left').onclick = () => updateCrop((s) => rotate(s.meta, s.crop, s.rect, -1));
$('rot-right').onclick = () => updateCrop((s) => rotate(s.meta, s.crop, s.rect, 1));
$('mirror').onclick = () => updateCrop((s) => mirror(s.meta, s.crop, s.rect));
$('reset-crop').onclick = () => updateCrop(() => defaultCrop());
$('to-tray').onclick = () => {
  if (selected !== null) commit(slotToTray(state, selected));
};

function select(i: number | null) {
  selected = i;
  endCoalesce();
  syncControls();
  requestRender();
}

// pointer gestures on the Sheet
type Gesture = { kind: 'pan' | 'move'; slot: number; x: number; y: number; moved: boolean; ghost?: HTMLElement };
let gesture: Gesture | null = null;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const i = slotAt(e.clientX, e.clientY);
  if (i === null) {
    select(null);
    return;
  }
  const wasSelected = selected === i;
  select(i);
  if (!state.slots[i]) return;
  canvas.setPointerCapture(e.pointerId);
  gesture = { kind: wasSelected ? 'pan' : 'move', slot: i, x: e.clientX, y: e.clientY, moved: false };
});

canvas.addEventListener('pointermove', (e) => {
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
      const it = state.slots[gesture.slot]!;
      const g = document.createElement('img');
      g.className = 'drag-ghost';
      g.src = photos.url(it.photoId);
      document.body.appendChild(g);
      gesture.ghost = g;
    }
    gesture.ghost!.style.left = `${e.clientX - 45}px`;
    gesture.ghost!.style.top = `${e.clientY - 45}px`;
    const t = slotAt(e.clientX, e.clientY);
    const nt = t !== gesture.slot ? t : null;
    if (nt !== dropTarget) {
      dropTarget = nt;
      requestRender();
    }
    $('tray').classList.toggle('drop-target', overTray(e.clientX, e.clientY));
  }
});

function overTray(x: number, y: number) {
  const r = $('tray').getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function endGesture(e: PointerEvent, cancelled = false) {
  const g = gesture;
  gesture = null;
  if (!g) return;
  g.ghost?.remove();
  $('tray').classList.remove('drop-target');
  dropTarget = null;
  endCoalesce();
  if (g.kind === 'move' && g.moved && !cancelled) {
    if (overTray(e.clientX, e.clientY)) {
      commit(slotToTray(state, g.slot));
      select(null);
    } else {
      const t = slotAt(e.clientX, e.clientY);
      if (t !== null && t !== g.slot) {
        commit(moveSlot(state, g.slot, t));
        select(t);
      }
    }
  }
  requestRender();
}
canvas.addEventListener('pointerup', (e) => endGesture(e));
canvas.addEventListener('pointercancel', (e) => endGesture(e, true));

canvas.addEventListener('dblclick', (e) => {
  const i = slotAt(e.clientX, e.clientY);
  if (i === null || !state.slots[i]) return;
  select(i);
  updateCrop(() => defaultCrop());
});

let wheelTimer = 0;
canvas.addEventListener(
  'wheel',
  (e) => {
    const i = slotAt(e.clientX, e.clientY);
    if (i === null || !state.slots[i]) return;
    e.preventDefault();
    if (selected !== i) select(i);
    const s = selectedCtx()!;
    const b = canvas.getBoundingClientRect();
    const ox = (e.clientX - b.left) / view.scale - (s.rect.x + s.rect.w / 2);
    const oy = (e.clientY - b.top) / view.scale - (s.rect.y + s.rect.h / 2);
    const factor = Math.exp(-e.deltaY * 0.0015);
    updateCrop(() => zoomAt(s.meta, s.crop, s.rect, s.crop.zoom * factor, ox, oy), 'wheel');
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(endCoalesce, 400);
  },
  { passive: false },
);

// keyboard (rules 21, 22, 26)
window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  const typing = tag === 'INPUT' && !['range', 'button', 'color'].includes((e.target as HTMLInputElement).type);
  if ((e.ctrlKey || e.metaKey) && !typing) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) return e.preventDefault(), undo();
    if (k === 'y' || (k === 'z' && e.shiftKey)) return e.preventDefault(), redo();
  }
  if (typing || tag === 'SELECT') return;
  if (e.key === 'Escape') return select(null);
  const s = selectedCtx();
  if (!s) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    commit(slotToTray(state, s.i));
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
  if (e.target === stage) select(null);
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

window.addEventListener('dragover', (e) => {
  if (!hasFiles(e) && !hasTray(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = hasTray(e) ? 'move' : 'copy';
  const t = slotAt(e.clientX, e.clientY);
  if (t !== dropTarget) {
    dropTarget = t;
    requestRender();
  }
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null && dropTarget !== null) {
    dropTarget = null;
    requestRender();
  }
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e) && !hasTray(e)) return;
  e.preventDefault();
  const t = slotAt(e.clientX, e.clientY);
  dropTarget = null;
  if (hasTray(e)) {
    const idx = Number(e.dataTransfer!.getData(TRAY_MIME));
    if (t !== null) {
      commit(trayToSlot(state, idx, t));
      select(t);
    } else requestRender();
    return;
  }
  const files = [...e.dataTransfer!.files];
  addFiles(files, t ?? undefined);
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

$('add-photos').onclick = () => inp('file-photos').click();
inp('file-photos').onchange = () => {
  const files = [...(inp('file-photos').files ?? [])];
  inp('file-photos').value = '';
  addFiles(files);
};

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
    toast((err as Error).message);
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

// ---------- output (rules 29, 30) ----------
async function renderOutput(dpi: number) {
  await photos.ensureAll(referencedPhotoIds(state));
  return renderToCanvas(state, (id) => photos.bitmap(id), dpi);
}
const toBlob = (cv: HTMLCanvasElement) => new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Export fehlgeschlagen'))), 'image/png'));

$('export-png').onclick = async () => {
  const blob = await toBlob(await renderOutput(300));
  download(blob, `collage-${stamp()}.png`);
};

async function preparePrint() {
  const { w, h } = sheetSize(state.sheet);
  const blob = await toBlob(await renderOutput(300));
  const root = $('print-root');
  root.replaceChildren();
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  img.style.width = `${w}mm`;
  img.style.height = `${h}mm`;
  await img.decode();
  root.appendChild(img);
  let st = document.getElementById('page-style');
  if (!st) {
    st = document.createElement('style');
    st.id = 'page-style';
    document.head.appendChild(st);
  }
  st.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; } @media print { html, body { width: ${w}mm; height: ${h}mm; overflow: hidden; } }`;
}
$('print').onclick = async () => {
  await preparePrint();
  window.print();
};

// ---------- toast ----------
let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 4000);
}

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
  slotRectsPx: () => slotsMm().map(toPx),
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
