import {
  Archive, ChevronDown, CircleAlert, CircleCheck, Crop, FileImage, FlipHorizontal2, FolderOpen, ImageDown, ImagePlus, Images, Info,
  LayoutGrid, Moon, MousePointerClick, Move, Plus, Printer, RectangleHorizontal, RectangleVertical, Redo2, RotateCcw, RotateCw, Ruler, Save,
  Scan, Sun, TriangleAlert, Undo2, X, ZoomIn, FileDown, Sparkles, Shuffle, ChevronLeft, ChevronRight, Trash2, FilePlus, Check, createElement, type IconNode,
} from 'lucide';

const ICONS: Record<string, IconNode> = {
  Archive, ChevronDown, CircleAlert, CircleCheck, Crop, FileImage, FlipHorizontal2, FolderOpen, ImageDown, ImagePlus, Images, Info,
  LayoutGrid, Moon, MousePointerClick, Move, Plus, Printer, RectangleHorizontal, RectangleVertical, Redo2, RotateCcw, RotateCw, Ruler, Save,
  Scan, Sun, TriangleAlert, Undo2, X, ZoomIn, FileDown, Sparkles, Shuffle, ChevronLeft, ChevronRight, Trash2, FilePlus, Check,
};

export type IconName = keyof typeof ICONS;

export function icon(name: string, size = 18): SVGElement {
  const node = ICONS[name];
  if (!node) throw new Error(`unknown icon ${name}`);
  const el = createElement(node);
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('stroke-width', '1.75');
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('ico');
  return el;
}

/** Put the icon named in data-icon in front of the element's content; data-tip becomes the tooltip. */
export function hydrateIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => setIcon(el, el.dataset.icon!));
  root.querySelectorAll<HTMLElement>('[data-tip]').forEach((el) => (el.title = el.dataset.tip!));
}

export function setIcon(el: HTMLElement, name: string) {
  el.querySelector(':scope > svg.ico')?.remove();
  el.prepend(icon(name, el.classList.contains('welcome-icon') ? 40 : 18));
  el.dataset.icon = name;
}
