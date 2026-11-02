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

## 2026-11-01 – Feste Fotogrößen / Passbilder (Spec `docs/specs/collagewerk-photo-sizes.md`)
- `normalize()` in `collage.ts` läuft nach jedem Commit: begrenzt die Slot-Anzahl auf das, was passt, und gleicht im Same photo mode alle Slots an.
- Schnittmarken werden *unter* die Fotos gezeichnet – so verdeckt ein Nachbarfoto automatisch Marken, die hineinragen würden.
- Biometrie-Hilfslinien: Scheitel 3–7 mm, Augen 18–23 mm, Kinn 36–40 mm von oben (nur Editor). Slot-Toolbar wird auf einem Slot mit Hilfslinien ausgeblendet.
- Hinweis im Passbild-Tooltip: Personalausweis/Reisepass seit Mai 2025 nur digital.
- Testhärtung: `__cw.animating` statt Pixel-Timing; Dateidialog-Test mit Wiederholung (headless Chromium verliert unter Last gelegentlich den Dialog).

## 2026-11-01 – Seiten, PDF, neue Vorlagen, Stil (Spec `docs/specs/collagewerk-pages-styles.md`)
- Datenmodell: `Collage.pages[]` statt `slots`; `templateId` statt `templateIndex`. `withDefaults()` migriert v1-Autosaves/-Dateien (Dateiformat jetzt Version 2, liest 1).
- `normalize()` hält: Seiten außer der letzten haben „Fotos pro Seite“ Plätze; die letzte (bei mehreren) schrumpft auf ihre Fotos, außer `count` ist von Hand gesetzt (gilt, bis sie voll ist).
- PDF ohne Bibliothek: `src/editor/pdf.ts` schreibt je Seite ein JPEG (DCTDecode) mit MediaBox = Bogen in pt; in Tests mit `qpdf --check` und `pdfinfo` geprüft.
- Firefox/Chrome können die Papiergröße nicht vorwählen → Druck-Karte vor dem Dialog + PDF-Weg.
- Vorlagen mit Polygonen (Diagonal) und Dekoration (Film, Rahmen-Raster) über `special`-Builder in einem „wide frame“ (u = lange Seite) und Rückabbildung je Ausrichtung.
- Stil wird nur im Modus „Frei“ angewendet (`styleActive`). Scatter-Winkel deterministisch aus Seed + Seite + Platz; Hand-Neigung in `Placed.tilt`.
- Bugfixes unterwegs: Strg+Z wirkte nicht, solange eine Checkbox fokussiert war; Seiten-Miniaturen verschoben die Leiste beim späten Zeichnen.

## 2026-11-01 – Seiten-Karussell + „Neu“ (Spec `docs/specs/collagewerk-carousel.md`)
- Jede Seite hat eigenes Canvas + Overlay in `#track`; die aktive Seite trägt die alten IDs (`#sheet`, `#overlay`, `#sheet-wrap`, `#sheet-label`), damit Styles/Tests weiter greifen.
- Seiten ±2 um die aktive werden in voller Auflösung gezeichnet, die übrigen mit 35 % Auflösung; ein Schlüssel pro Seite verhindert unnötiges Neuzeichnen.
- Klick/Ziehen auf einer Nachbarseite: Seite wird sofort aktiv, der Track bleibt aber stehen („frozenX“), bis die Geste endet – sonst würde die Seite unter dem Mauszeiger wegrutschen.
- Mausrad: über einem Foto Zoom, sonst eine Seite pro Raste (gesperrt 350 ms); horizontal/Shift immer Seitenwechsel. (Vereinfachung gegenüber Regel 12: Schritt statt freiem Scrollen mit Einrasten.)
- „Neu“ löscht Fotos/Seiten/Ablage als ein Undo-Schritt; verwaiste Fotos fliegen erst beim nächsten Start aus IndexedDB.

## 2026-11-02 – Englisch (Spec `docs/specs/collagewerk-i18n.md`)
- `src/editor/i18n.ts`: Deutsch ist Quellsprache; `t('deutscher Text', {vars})` schlägt die englische Übersetzung nach (fehlender Eintrag → Deutsch, nie ein Schlüssel). `translateDom()` übersetzt Textknoten und `title`/`data-tip`/`aria-label` der statischen HTML-Seite.
- Sprache = erste bevorzugte Browsersprache (`de-*` → de, sonst en). Playwright läuft standardmäßig mit `locale: 'de-DE'`; `tests/e2e/i18n.spec.ts` prüft Englisch auf übrig gebliebene deutsche Wörter.
- Manifest-Name/-Beschreibung über `public/_locales/{en,de}/messages.json`, `default_locale: en`.
