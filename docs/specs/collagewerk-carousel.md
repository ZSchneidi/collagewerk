# CollageWerk – Page carousel and New collage

## Goal
Show all Pages side by side at full size in a Page carousel that can be edited directly, including dragging Photos between Pages. Add a "Neu" action to start over.

## Behaviour

### Page carousel
1. The stage shows all Pages on one horizontal track:
   - every Page at the same scale as the single-Page view (fit to the stage height/width)
   - 48 px between Pages
   - the Active Page centred, and its neighbours visible at the left/right edges where they fit
2. Under every Page a label reads "Seite n / N · <Sheet label>". The Active Page's label is emphasised.
3. Changing the Active Page slides the track to centre it in about 250 ms (eased) and ends exactly on that Page. With "reduce motion" the change is instant.
4. A dashed Ghost Page "+ Seite" follows the last Page, at Page size. Clicking it appends an empty Page (pages rule 8 "+") and makes it the Active Page. Dropping files on it appends a Page with them. It never appears in print, PNG or PDF. It is hidden in Same photo mode.

### Editing across Pages
5. Every visible Page is interactive:
   - hover shows the Slot toolbar, clicking selects, dragging pans or moves, and the wheel zooms
   - any interaction with a Slot on a non-active Page first makes that Page the Active Page, then continues the interaction
6. Dragging a Photo from a Slot on one Page onto a Slot on another Page swaps the two Photos with their Crops and Tilts, or moves the Photo if the target Slot is empty. This is undoable. If the source Page is the last one and becomes empty, the empty last Page is removed (pages rule 7).
7. Files dropped from the computer land on the Slot under the cursor, on whichever Page (v1 rules 11/12 apply to that Page). Dropping between Pages or on the stage background fills from the Active Page (pages rule 2).
8. Dragging from the tray onto a Slot of any visible Page places it there (v1 rule 18).
9. Only one Slot is selected at a time across all Pages. The Crop panel always acts on it. Selecting a Slot on another Page clears the previous selection.

### Navigation
10. Round ‹ › buttons at the left and right edge of the stage switch to the previous/next Page. They are disabled at the first/last Page and hidden with a single Page.
11. PageUp/PageDown always switch Pages. ←/→ switch Pages only when no Photo is selected; otherwise they keep nudging the Crop (v1 rule 21).
12. Horizontal scrolling (trackpad, Shift+wheel) moves the track and snaps to the nearest Page about 150 ms after the input stops.
13. A plain mouse wheel over a Photo zooms it (v1 rule 21). Over empty stage, a Ghost Page or a gap, it scrolls the carousel by one Page per notch.
14. The Page strip stays (thumbnails, label, delete, "Plätze" stepper); clicking a thumbnail centres that Page. Its delete and stepper act on the Active Page.

### New collage
15. A **Neu** button in the Top bar (left of Öffnen) opens a confirmation card: "Neue Collage beginnen? Alle Fotos, Seiten und die Ablage werden entfernt." It has three buttons:
    - **Einstellungen behalten** (default, focused): Sheet, Layout mode, Photo size, Photos per Page, Template, Gap, Margin, background and Style stay
    - **Alles zurücksetzen**: everything returns to the defaults of a fresh install
    - **Abbrechen**
16. After either option the Collage has one empty Page and an empty tray; the Welcome card shows. The action is one undo step (Ctrl+Z restores everything while the tab stays open).
17. Photo data that no longer belongs to the Collage is removed from browser storage only when the editor next starts (as now for orphans), so undo within the session still works.

## Out of scope
- Overview zoom (all Pages at once in a grid)
- Reordering Pages by drag & drop
- Vertical or 3D carousel effects

## Open risks
- Drawing many Pages at full size costs memory and time. Only Pages within one screen width of the Active Page are drawn at full resolution; the others show a cached low-resolution image until they come near.
- Drag gestures across Pages need hit-testing on several canvases. Pointer capture must move with the pointer across Pages.
- With the Crop panel open, the right neighbour Page is partly covered; that is accepted.

## Slices
- [x] 01 Model: moveAcross (swap/move between Pages), newCollage keep/reset (6, 15, 16) – blocked by: none
- [x] 02 Carousel view: track, per-Page canvases/overlays, labels, Ghost Page, slide, near/far resolution (1–4) – blocked by: 01
- [x] 03 Interaction across Pages: hit-testing, gestures, drops, selection (5–9) – blocked by: 02
- [x] 04 Navigation: buttons, keys, wheel (10–14) – blocked by: 02
- [x] 05 Neu card (15–17) – blocked by: 01
