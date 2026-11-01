# CollageWerk v1

## Goal
A Chrome/Firefox extension in which the user drops local Photos into a Collage of 1–12 Slots on a chosen Sheet, adjusts each Photo's Crop, and prints the result at 1:1 or exports it.

## Behaviour

### Shell
1. One Manifest V3 codebase installs as an unpacked extension in current Chrome and Firefox.
2. Clicking the toolbar icon opens the editor in a full tab (or focuses the editor tab if one is already open).
3. The UI is in German.
4. The editor has a left sidebar (Sheet, Slot count, Template, Gap, Margin, background, Save/Open/Print/Export), the Sheet in the centre scaled to fit the window, and the Photo tray as a bottom strip.

### Sheet & Template
5. Sheet presets: A4, A5, A3, Letter, 10×15, 13×18, 20×30 cm, plus a custom width/height in mm, each with a portrait/landscape toggle.
6. The Slot count slider ranges from 1 to 12.
7. Each Slot count offers the Templates of the catalogue:
   - 1: full
   - 2: side-by-side or stacked
   - 3: large+2 or row of 3
   - 4: 2×2 or large+3
   - 5–12: grid, hero, mosaic
8. Flipping the orientation mirrors each Template sensibly (side-by-side ↔ stacked).
9. Gap (mm), Margin (mm, default 5) and background colour apply to every Template. Changing the Sheet, Gap, Margin, Slot count or Template recomputes the Slots immediately.
10. Slots tile the area inside the Margin exactly, with Gap between neighbours and no overlap.

### Photos
11. Dropping a supported file (JPG, PNG, WebP, GIF) onto a Slot places it there. A previously placed Photo moves to the Photo tray.
12. Dropping several files at once, or dropping onto a non-Slot area, fills the empty Slots in Slot order; the rest go to the Photo tray.
13. "Fotos hinzufügen…" opens a file picker that behaves like rule 12.
14. Unsupported files (e.g. HEIC) are rejected with a visible message, and nothing else changes.
15. EXIF orientation is applied on load.
16. Increasing the Slot count keeps every placed Photo and its Crop in Slot order. Decreasing it moves the Photos of the removed Slots to the Photo tray; they are never deleted.
17. Dragging a Photo from Slot A onto occupied Slot B swaps them. Dragging it onto an empty Slot moves it there.
18. Dragging a Photo from the Photo tray onto a Slot places it there (the displaced Photo goes to the tray). Dragging a Photo from a Slot onto the tray removes it from the Slot.

### Crop
19. A Photo always fully covers its Slot. Zoom ranges from 100 % (cover) to 500 % and can never reveal empty space.
20. Clicking a Slot selects it. Its Crop controls appear in the sidebar: zoom slider, rotate 90° left/right, mirror, reset, remove to tray.
21. Dragging inside a selected Slot pans the Photo, clamped at the edges. The mouse wheel zooms around the cursor. Arrow keys nudge the pan.
22. Double-clicking resets the Crop. Delete moves the Photo to the tray. Esc or clicking empty space deselects.
23. When a Photo moves to a Slot of a different aspect ratio, it keeps its zoom, rotation, mirror and focus point, and the pan is re-clamped.

### Quality, history, persistence
24. Each occupied Slot shows its effective print resolution:
    - an orange badge below 200 dpi
    - a red badge below 120 dpi
    - a tooltip with the value
25. Badges and selection outlines never appear in the print or export output.
26. Ctrl+Z / Ctrl+Y undo and redo every Collage change (Crop, placement, swaps, Slot count, Template, Sheet, Gap, Margin, background), up to 50 steps.
27. The current Collage, including its Photos, autosaves to IndexedDB and is restored exactly after closing the tab or restarting the browser.
28. "Collage speichern" writes one file containing the Collage state and embedded Photos. "Collage öffnen" restores it identically, including the Crops and the Photo tray.

### Output
29. Print sets the page size to the Sheet with zero margins and prints the Collage at 1:1 in mm. A hint tells the user to choose "Ränder: Keine" and "Skalierung: 100 %".
30. "PNG exportieren" renders the Collage at 300 dpi of the Sheet size and has the same content as the print.

## Out of scope (v1)
- Text captions, frames, shadows, filters
- Freeform or resizable Slots, user-defined Templates
- "Fit" mode with empty bands, zoom below cover
- Library of multiple named Collages in the extension
- HEIC/RAW support
- PDF export
- Multi-page collages
- Store publishing (Chrome Web Store / AMO)

## Open risks
- Firefox print settings: `@page { size; margin:0 }` is not always honoured, so the user may have to set margins and scale by hand (mitigated by the hint in rule 29).
- Drag & drop from the OS into an extension page works in both browsers, but Firefox needs `preventDefault` on `dragover` for file drops; to be verified per browser.
- Memory: 12 full-resolution camera photos in IndexedDB plus 300 dpi export of A3 (~3500×4960 px) may be heavy; may need downscaled working copies alongside the originals.
- The size limit of IndexedDB storage per extension differs between Chrome and Firefox.
- EXIF orientation handling differs slightly between browsers' `createImageBitmap` implementations.

## Slices
- [ ] 01 Scaffold: Vite+TS, Chrome/Firefox manifests, background opens/focuses editor tab, vitest+playwright (rules 1–4) (blocked by: none)
- [ ] 02 Sheet & Template layout engine + canvas render (5–10) (blocked by: 01)
- [ ] 03 Photos: drop, picker, reject, EXIF, tray, swap, Slot count changes (11–18) (blocked by: 02)
- [ ] 04 Crop controls (19–23) (blocked by: 03)
- [ ] 05 DPI badges + undo/redo (24–26) (blocked by: 04)
- [ ] 06 Autosave + collage file (27–28) (blocked by: 03)
- [ ] 07 Print + PNG export (29–30) (blocked by: 02)
