# Notizen

## 2026-11-01 – v1 umgesetzt (Branch `feat/collagewerk-v1`)
- Alle 30 Regeln aus `docs/specs/collagewerk-v1.md` umgesetzt; 84 Unit- + 18 E2E-Tests grün, `web-ext lint` ohne Befund.
- Crop wird im angezeigten Rahmen gespeichert (Fokuspunkt fx/fy normiert, nach Drehung+Spiegelung); geklemmt wird beim Zeichnen, daher bleibt der Fokus beim Wechsel in einen anders geformten Slot erhalten.
- Bedienung: Erster Klick wählt einen Slot; Ziehen in einem *nicht* gewählten Slot verschiebt das Foto (Tausch/Ablage), Ziehen im *gewählten* Slot verschiebt den Ausschnitt.
- Druck = dieselbe Render-Funktion wie PNG-Export (300 dpi) als Bild auf einer `@page` in Bogengröße.
- Firefox nicht automatisch getestet (kein Firefox im Build-Container) – nur Manifest/Lint geprüft.
- Offen/Ideen: Arbeitskopien in reduzierter Auflösung bei vielen großen Fotos; PDF-Export; Signierung für Firefox.

## 2026-11-01 – UI v2 (Branch `feat/collagewerk-v1`, Spec `docs/specs/collagewerk-ui-v2.md`)
- Studio-Look mit Tokens (hell/dunkel + Umschalter), Top bar, einklappbare Karten, Preset-Chips, Lucide-Icons, Inter gebündelt.
- Overlay-DOM wird jetzt abgeglichen statt neu gebaut (sonst verschwand die Slot-Toolbar unter dem Mauszeiger).
- Bugfix: `#stage` hatte `overflow: hidden` → das versteckte Crop panel machte die Bühne scrollbar, ein Klick verschob den Bogen um ~270 px. Jetzt `overflow: clip`.
- Klick auf leeren Slot öffnet den Dateidialog im `click`-Event (im `pointerdown` blockiert Chrome den Dialog).
- Welcome card liegt über der Bogenmitte; Drops darauf füllen der Reihe nach (Spec-Regel 22), auch wenn darunter ein Slot liegt.
- `npm run build && node scripts/preview.mjs` erzeugt eine eigenständige HTML-Vorschau (Font inline).
