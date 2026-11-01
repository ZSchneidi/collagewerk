# CollageWerk UI v2 – modern look

## Goal
Give the editor a calm, modern "photo studio" look with a clear screen structure, bundled icons and font, and subtle motion. All v1 behaviour (rules 1–30 of `collagewerk-v1.md`) stays intact.

## Behaviour

### Theme
1. Light theme by default:
   - warm-grey stage, white floating panels with soft shadows and 12 px radius
   - one indigo accent for selection, primary buttons and slider fills
2. A dark theme follows the system setting. A sun/moon toggle in the Top bar overrides it, and the choice is remembered across sessions.
3. All colours come from CSS tokens. Text and controls meet WCAG AA contrast in both themes.

### Structure
4. The Top bar is always visible and holds, in this order:
   - logo + name
   - undo / redo
   - Öffnen / Speichern
   - theme toggle
   - PNG exportieren
   - the primary Drucken button
5. The left panel holds collapsible cards:
   - *Bogen*: format chips, custom size, orientation
   - *Layout*: Slot count, Template, Gap, Margin, background
   The open/closed state of the cards is remembered.
6. The Crop panel slides in from the right while a Slot with a Photo is selected, and slides out when the selection ends.
7. The Photo tray is a floating dock at the bottom of the stage and shows a count badge.
8. The print hint stays reachable: a small info icon next to Drucken shows it as a tooltip/popover.

### Controls & type
9. Every button has a bundled outline SVG icon and a tooltip; tooltips include the shortcut where one exists (e.g. "Rückgängig (Strg+Z)").
10. Sliders are custom-styled with a filled track and show their value next to the label.
11. Paper presets are chips (A4, A5, A3, Letter, 10×15, 13×18, 20×30, Eigene) instead of a dropdown. Orientation is a two-icon segmented control.
12. The UI uses the bundled Inter font (no network requests).

### Sheet & Slots
13. The Sheet sits on the stage with a paper shadow and a label below it showing the format and size in mm, e.g. "A4 · 297 × 210 mm".
14. Empty Slots show a dashed outline, a "+" icon and "Foto hierher ziehen". **Clicking an empty Slot opens the file picker, and the chosen file goes into that Slot** (new behaviour; with several files chosen, rule 12 of v1 applies).
15. Hovering an occupied Slot shows the Slot toolbar (rotate left/right, mirror, remove to tray) on the Slot and a move cursor. Using the Slot toolbar selects that Slot.
16. The selected Slot has an accent ring. Dpi badges are small pills with a warning icon. Neither appears in the print or export output.

### Motion & feedback
17. When the Template, Slot count, Gap, Margin or Sheet changes, Slots animate from their old to their new rectangles in about 180 ms. The output render is never animated.
18. Panels slide in and out, tray items lift on hover, and drop targets glow while something is dragged over them.
19. Messages appear as toast cards with an icon and disappear on their own after a few seconds.
20. With "reduce motion" enabled in the system, all transitions and animations are off.

### Welcome card
21. While the Collage has no Photos (Slots and tray empty), a Welcome card over the stage shows:
    - a large drop zone with the "Fotos auswählen" button
    - the supported formats
    - three short tips: drag to swap, scroll to zoom, double-click to reset
22. Dropping files onto the Welcome card behaves like dropping them onto the stage (empty Slots fill in order). The card disappears as soon as the first Photo is added and returns when the Collage is empty again.

## Out of scope
- Additional themes or user-selectable accent colours
- Changes to layout, Crop maths, persistence or output (v1 behaviour)
- Responsive/mobile layout below 1024 px width (the editor stays usable but not optimised)
- Localisation beyond German

## Open risks
- Slot animation plus canvas rendering: animating means re-rendering the canvas every frame for ~180 ms, which may stutter with 12 large Photos (fallback: animate overlay outlines only).
- Inter font adds ~100–300 KB to the extension.
- Hover toolbars on small Slots (e.g. 12 Slots on 10×15) may not fit; they then shrink to icon-only or are skipped.

## Slices
- [x] 01 Tokens, themes, Top bar, cards, chips, icons, font (1–5, 8–13) – blocked by: none
- [x] 02 Crop panel slide-in, tray dock + badge, Slot toolbar, dpi pills (6, 7, 14–16) – blocked by: 01
- [x] 03 Slot animation, toasts, reduced motion (17–20) – blocked by: 01
- [x] 04 Welcome card (21–22) – blocked by: 01
