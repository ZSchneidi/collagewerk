# CollageWerk – fixed Photo sizes (Passbilder etc.)

## Goal
Let the user print several photos of an exact standard size (e.g. Passbild 35 × 45 mm) on one Sheet, typically many copies of one photo, with Cut marks and an editor-only Biometric guide.

## Behaviour

### Layout mode
1. The *Layout* card has a Layout mode switch: **Frei** (default, v1 behaviour) and **Feste Fotogröße**.
2. In *Feste Fotogröße*:
   - every Slot is exactly the Photo size in mm
   - Slots form a grid centred on the Sheet inside the Margin, with Gap between them
   - Templates are hidden
3. The Slot count maximum is how many Slots fit: columns × rows with `cols = floor((W − 2·Margin + Gap) / (w + Gap))`, rows analogous. The slider is limited to that maximum, capped at 12. On entering the mode, the Slot count is set to the maximum.
4. Slots fill row by row (left→right, top→bottom), leaving fewer Slots in the last row when the count is below the maximum.
5. When the Sheet, Margin, Gap or Photo size changes and fewer Slots fit, the Slot count drops to the new maximum. Photos in removed Slots go to the Photo tray (v1 rule 16).
6. Switching back to *Frei* keeps the Slot count and Photos and restores the previous Template choice.

### Photo size presets
7. Presets:
   - Passbild 35 × 45 mm
   - Bewerbungsfoto 45 × 60 mm
   - US-Pass 2 × 2 in (50.8 × 50.8 mm)
   - Quadrat 50 × 50 mm
   - 9 × 13 cm, 10 × 15 cm, 13 × 18 cm
   - Eigene (width × height in mm, 10–500)
8. Each Photo size has a portrait/landscape toggle; square sizes ignore it.
9. If no Slot fits (maximum = 0), the editor shows "Passt nicht auf den Bogen" and a button "Bogen anpassen". The button switches to the smallest preset Sheet (by area, current orientation) on which at least one Slot fits. The orientation is never flipped automatically.
10. The Passbild preset is not labelled as valid for German Personalausweis/Reisepass. Its tooltip mentions that those documents need a digital photo.

### Same photo mode
11. In *Feste Fotogröße* a toggle "Alle Plätze mit demselben Foto" is shown. It is on by default when the Passbild or Bewerbungsfoto preset is chosen, and off for the others.
12. While Same photo mode is on:
    - dropping or picking one Photo puts it into every Slot
    - dropping several Photos uses the first and sends the others to the Photo tray
    - a Photo already in a Slot is replaced in all Slots, and the previous Photo goes to the Photo tray once
13. While Same photo mode is on, every Crop change (zoom, pan, rotate, mirror, reset) on any Slot applies to all Slots. Increasing the Slot count fills the new Slots with the same Photo and Crop.
14. Turning Same photo mode off keeps all copies; from then on, each Slot's Crop is edited separately.
15. In Same photo mode, dragging a Photo between Slots or to the tray acts on all copies at once ("In die Ablage" empties all Slots and puts one Photo in the tray).

### Cut marks
16. In *Feste Fotogröße*, "Schnittmarken" (default on) draws hairline cut marks into print and PNG export:
    - 0.2 mm wide, grey (#888), 3 mm long
    - at each Slot corner, extending outward from the Slot edges, never over a Photo
    - marks are clipped to the Sheet and skipped where they would fall inside a neighbouring Slot
17. Entering *Feste Fotogröße* sets the Gap to 2 mm (undoable). The user can change it afterwards.

### Biometric guide
18. When a Slot with the Passbild size is selected, the editor overlays (never in print/export):
    - a vertical centre line
    - a horizontal band for the chin-to-crown height (head top between 3 and 7 mm from the top edge, chin at 36–40 mm, i.e. a head height of 32–36 mm)
    - an eye-line zone
19. The guide has a tooltip saying it is an alignment aid, not an official check, and can be hidden with a toggle in the Crop panel.

### Persistence
20. Layout mode, Photo size, orientation, Same photo mode and Cut marks are part of the Collage: autosave, collage file and undo/redo cover them. Older collage files without these fields open in *Frei* mode.

## Out of scope
- Automatic face detection, background removal or biometric validation
- Country-specific visa presets beyond the list in rule 7
- Mixed sizes on one Sheet
- Digital (E-Passbild) submission

## Open risks
- Printers and print dialogs may scale slightly despite "100 %", and for passport photos even 1 mm matters. The print hint stays; a test print is recommended (could add a 50 mm calibration line later).
- The biometric band values are a common guideline; real requirements differ by country and authority.

## Slices
- [x] 01 Model: Layout mode, Photo size presets, capacity grid, fitSheet, defaults for old files (1–10, 20) – blocked by: none
- [x] 02 Same photo mode ops + normalize (11–15) – blocked by: 01
- [x] 03 Cut marks in renderer (16, 17) – blocked by: 01
- [x] 04 UI: mode switch, size chips, toggles, fit hint, Biometric guide (1, 7–11, 18, 19) – blocked by: 01–03
