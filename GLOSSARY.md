# Glossary

**Collage**: The whole printable composition: one Sheet with its Template, Slots, Photos and global parameters.
_Avoid_: project, page, layout

**Sheet**: The physical paper the Collage is printed on, defined by a size preset (A4, A5, A3, Letter, 10×15, 13×18, 20×30 cm) or custom mm values, plus portrait/landscape orientation.
_Avoid_: canvas, page, paper

**Slot count**: The number of Slots in the Collage, set by the slider (1–12).
_Avoid_: photo count, number of images

**Template**: One arrangement of Slots for a given Slot count (e.g. uniform grid, one large + small). Several Templates exist per Slot count; the user cycles through them. It is recomputed whenever the Sheet, Gap or Margin changes.
_Avoid_: layout, grid, preset

**Slot**: One rectangular cell produced by the Template. It holds at most one Photo, which always fills it completely.
_Avoid_: cell, frame, box, tile

**Photo**: An image file the user dropped in. It lives either in a Slot or in the Photo tray.
_Avoid_: image, picture, foto

**Photo tray**: The holding area for Photos that are not in a Slot, e.g. extra drops or Photos pushed out when the Slot count is reduced.
_Avoid_: library, gallery, bin

**Crop**: How a Photo sits in its Slot: pan offset, zoom (100 % = cover, up to 500 %), rotation in 90° steps and mirroring. It stays with the Photo when the Photo moves between Slots.
_Avoid_: framing, fit, transform

**Gap**: The spacing between neighbouring Slots, in mm.
_Avoid_: gutter, padding, spacing

**Margin**: The empty border between the Sheet edge and the outermost Slots, in mm.
_Avoid_: border, padding, bleed

**Top bar**: The always-visible bar across the top of the editor with logo, undo/redo, open/save, PNG export and the primary Print button.
_Avoid_: header, toolbar, menu bar

**Crop panel**: The right-hand panel that slides in while a Slot with a Photo is selected and holds that Photo's Crop controls.
_Avoid_: inspector, properties, selection panel

**Slot toolbar**: The small floating set of buttons (rotate, mirror, remove) shown on an occupied Slot while the pointer is over it.
_Avoid_: hover menu, quick actions

**Welcome card**: The card on the stage shown while the Collage has no Photos at all, with a large drop zone and short tips.
_Avoid_: empty state, onboarding, splash

**Layout mode**: How Slots get their size: *Frei* (the Template fills the area inside the Margin) or *Feste Fotogröße* (every Slot has the same fixed Photo size).
_Avoid_: layout type, sizing

**Photo size**: The fixed size in mm that every Slot has in the *Feste Fotogröße* Layout mode, e.g. Passbild 35 × 45 mm. Not the paper size, which is the Sheet.
_Avoid_: picture format, format, Fotoformat

**Same photo mode**: In the *Feste Fotogröße* Layout mode, all Slots show one Photo and share one Crop, so a change to one applies to all.
_Avoid_: copy mode, duplicate, clone

**Cut marks**: Thin lines printed outside each Slot corner showing where to cut.
_Avoid_: crop marks, trim lines, Schneidelinien

**Biometric guide**: An editor-only overlay on a Passbild Slot (centre line, chin-to-crown band, eye-line zone) to help align a face. Never printed and not an official check.
_Avoid_: face guide, template overlay, Passbild-Prüfung

**Page**: One printed Sheet of the Collage with its own Slots and Photos. A Collage has one or more Pages; all Pages share the Sheet, Layout mode, Template, Gap, Margin and Style.
_Avoid_: sheet (that is the paper format), side, Blatt, Seite (in code/docs)

**Photos per Page**: The Slot count every Page uses, set by the slider. Only the last Page may have fewer Slots.
_Avoid_: slot count (when talking about all Pages), photos per sheet

**Page strip**: The row of small Page thumbnails under the stage used to switch Pages, drop Photos onto another Page and add or delete Pages.
_Avoid_: pager, page bar, tabs

**Style**: The look applied to every Photo in Frei mode: Frame, corner radius, shadow, edge effect and Scatter.
_Avoid_: theme, effect, filter

**Frame**: A border drawn around the Photo inside its Slot (white, Polaroid with a wider bottom, or a colour); the Photo shrinks to make room.
_Avoid_: border (alone), passepartout, Rand (that is the Margin)

**Scatter**: Style option that tilts every Photo by a small random angle, like prints lying on a table. Each Photo's Tilt can be set by hand.
_Avoid_: random rotation, chaos, Verstreuen-Modus

**Tilt**: The angle by which a Photo with its Frame is turned within its Slot under Scatter. Not the 90° rotation of the picture inside the Crop.
_Avoid_: rotation, angle (alone)
