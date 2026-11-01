# CollageWerk – Pages, PDF, more Templates and Style

## Goal
Any number of Photos flow onto as many Pages as needed and print in one go. Paper-size trouble when printing is reduced by a PDF with exact page sizes. More Templates and a Style card make collages more varied.

Fixtures: user screenshots of 2026-11-01. In the first, 4 Photos are left in the tray instead of going onto a second Page. In the second, the Firefox print dialog shows A4 while a 10 × 15 cm Sheet is chosen.

## Behaviour

### Pages
1. The Collage consists of Pages. All Pages share Sheet, Layout mode, Photos per Page, Template, Gap, Margin and Style.
2. When Photos are added (drop, picker, collage file):
   - they fill empty Slots starting at the current Page, then later Pages
   - if no empty Slot is left, new Pages are appended
   - nothing goes to the Photo tray (replaces v1 rule 12 overflow)
   - a single Photo dropped onto a Slot still replaces that Slot's Photo, which goes to the tray (v1 rule 11)
3. The last Page, if it is not the only Page, has only as many Slots as it holds Photos (at least 1). It uses the Template of that Slot count with the same Template choice, clamped. A Page that is the only Page always shows Photos per Page Slots.
4. On the last Page, the user can set its Slot count by hand (stepper in the Page strip, 1…Photos per Page). This overrides rule 3 until the Page fills up or Photos per Page changes.
5. Removing a Photo from a Page that is not the last one leaves an empty Slot; later Photos do not move up. On the last Page (auto-sized), the remaining Photos keep their order and the Page shrinks.
6. Changing Photos per Page repaginates: all placed Photos (in Page and Slot order, empty Slots skipped) are distributed anew. Crops stay with their Photos. This replaces v1 rule 16 (no Photos go to the tray).
7. An empty last Page is removed automatically, unless it is the only Page. "Seite löschen" on any Page moves its Photos to the tray and removes the Page (the only Page cannot be deleted, it is emptied instead).
8. The Page strip shows one thumbnail per Page with its number and a "+" button that appends an empty Page with Photos per Page Slots.
   - clicking a thumbnail shows that Page
   - dropping files or a tray Photo onto a thumbnail adds it to that Page's first empty Slot, or to a new Page after it if that Page is full
   - dragging a Photo from a Slot onto a thumbnail moves it there in the same way
9. In Same photo mode (Feste Fotogröße) the Collage has exactly one Page; rules 2–8 do not create Pages.
10. Undo/redo, autosave and the collage file cover Pages. Files of format version 1 open as one Page.

### Output
11. **Drucken** prints all Pages in order, each on its own page of Sheet size (`@page` + page breaks).
12. **PNG** downloads one file per Page, named `collage-<stamp>-<n>.png`. With a single Page it stays `collage-<stamp>.png`.
13. **PDF** (new button in the Top bar) downloads one PDF:
    - one PDF page per Page, with a media box exactly the Sheet size in mm (portrait/landscape as chosen)
    - each page is a 300-dpi JPEG of that Page
    - it contains no other content
14. On the first click of Drucken (and again until "nicht mehr anzeigen" is ticked), a card appears before the print dialog. It shows the exact settings to choose:
    - "Papiergröße: <Sheet name / mm>", "Ränder: Keine", "Skalierung: 100 %"
    - buttons "Drucken", "Stattdessen als PDF", "Abbrechen"
    - a sentence that browsers do not let the extension preselect the paper
15. If the printer paper is larger than the Sheet, the print still shows the Collage at true size (no stretching).

### Templates (Frei mode)
16. Additional Templates, offered where listed:
    - **Diagonal** (n ≥ 2): rows of Slots whose dividers are slanted by the Slant angle (5–20°, slider shown only for this Template, default 10°). The Gap is measured perpendicular to the divider. The outer edges stay straight.
    - **Filmstreifen** (2–12): Slots in one or more dark film bands, up to 4 per band, with white sprocket holes along the band edges. Bands and holes are printed.
    - **Mittelpunkt** (3–12): one large centre Slot (always Slot 1) with the others beside it along the long side of the Sheet, plus one above and one below from 7 Slots on.
    - **Spalten versetzt** (4–12): 2–4 columns of Slots with alternating heights so the rows do not line up.
    - **Streifen** (2–6): full-width horizontal bands, independent of orientation.
    - **Rahmen-Raster** (2–12): a grid inset by an extra border, with a thin double line around it that is printed.
17. All Slots of every Template stay inside the Margin and never overlap; Diagonal Slots are polygons.

### Style (Frei mode only)
18. A *Stil* card holds Frame, Ecken, Schatten, Kanten and Scatter. In Feste Fotogröße the card is disabled with the note "In fester Fotogröße nicht verfügbar" (the Photo size must stay exact).
19. **Frame**: Keiner / Weiß / Polaroid / Farbe (colour picker), width 1–10 mm (default 4).
    - The Photo is inset by the width; Polaroid uses 3.5 × the width at the bottom.
    - Crop, cover and dpi are computed for the inset Photo area.
20. **Ecken**: corner radius 0–15 mm for the Frame's outside or, without a Frame, for the Photo. With a Frame, the inner radius is max(0, radius − width).
21. **Schatten**: on/off. A soft drop shadow (about 2 mm offset, 4 mm blur, 35 % black) under each Photo/Frame, clipped to the Sheet.
22. **Kanten**:
    - Hart: default
    - Weich: the Photo fades into the background over 12 % of its short side
    - Vignette: corners darkened by up to 45 %
23. **Scatter**: on/off.
    - Each Photo with its Frame is tilted by a pseudo-random angle in [−6°, +6°], derived from a seed and its Page/Slot index, and shrunk so its tilted shape stays inside its Slot.
    - "Neu mischen" picks a new seed (undoable).
    - The Crop panel shows a Tilt slider (−15° … +15°) for the selected Photo; a hand-set Tilt travels with the Photo and survives "Neu mischen".
24. Hit-testing, the selection ring and the Slot toolbar follow the visible shape (polygon / tilted rectangle).
25. Style, Template additions and Slant are part of the Collage (undo, autosave, file) and appear in editor, print, PNG and PDF identically.

## Out of scope
- Different Templates or Styles per Page
- Torn-paper or other bitmap edge textures, filters, text
- Choosing the printer paper programmatically (not possible from a browser extension)
- Page reordering by drag & drop (can come later)

## Open risks
- 300-dpi JPEG pages for many A3 Pages make large PDFs (≈1–3 MB per Page) and use a lot of memory; pages are rendered one at a time.
- Firefox may still show A4 in its print dialog; the hint card and PDF are the mitigation, not a fix.
- Soft edges and shadows rendered at 300 dpi may be slow for 12 Slots × many Pages.
- Changing the data model from `slots` to `pages` touches almost all existing tests (deliberate, rules 2 and 6 replace v1 rules 12 and 16).

## Slices
- [x] 01 Model: Pages (fill, auto-sized last Page, holes, repaginate, add/delete, move to Page), v1 file migration (1–10) – blocked by: none
- [x] 02 Templates: Diagonal, Filmstreifen, Mittelpunkt, Spalten versetzt, Streifen, Rahmen-Raster + decoration (16, 17) – blocked by: none
- [x] 03 Style model + renderer: Frame, Ecken, Schatten, Kanten, Scatter/Tilt, shape hit-testing (18–25) – blocked by: 02
- [x] 04 Output: print all Pages, PNG per Page, PDF writer, print card (11–15) – blocked by: 01
- [x] 05 UI: Page strip, Style card, slant/tilt sliders, overlay shapes – blocked by: 01–04
