# CollageWerk

Browser extension (Chrome + Firefox, Manifest V3) for laying out several photos on one sheet, cropping each one and printing the collage at true size. Spec: `docs/specs/collagewerk-v1.md`, vocabulary: `GLOSSARY.md`.

## Build

```bash
npm install
npm run build        # → dist/chrome and dist/firefox (unpacked extensions)
```

## Install (unpacked)

- **Chrome / Edge**: `chrome://extensions` → enable developer mode → "Entpackte Erweiterung laden" → `dist/chrome`.
- **Firefox**: `about:debugging#/runtime/this-firefox` → "Temporäres Add-on laden" → `dist/firefox/manifest.json` (removed again when Firefox restarts until the add-on is signed).

Click the toolbar icon to open the editor in a tab.

## Test

```bash
npm run typecheck
npm test             # unit tests (vitest): layout, crop maths, collage ops, history, file format
npm run test:e2e     # Playwright (Chromium) against the built editor + loads dist/chrome as extension
npm run test:all     # everything incl. build
npx web-ext lint -s dist/firefox   # Firefox/AMO manifest + code lint
```

## Structure

- `src/model/` – pure logic: `layout.ts` (Sheet presets, Template catalogue, Slot rectangles), `crop.ts` (cover/pan/zoom/rotate/mirror, dpi), `collage.ts` (placing/moving Photos, Slot count), `history.ts`, `fileformat.ts`.
- `src/editor/` – the editor page: `main.ts` (UI + interactions), `render.ts` (one draw function for editor, print and PNG), `photos.ts` (decoding, EXIF), `storage.ts` (IndexedDB autosave), `tab.ts`.
- `src/background.ts` – toolbar button opens/focuses the editor tab.
- `scripts/build.mjs` – Vite build + per-browser manifests.
