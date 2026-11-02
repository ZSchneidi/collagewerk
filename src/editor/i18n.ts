/**
 * UI language follows the browser: German for de-*, English for everything else.
 * German is the source language: strings in editor.html and the code are written in German and
 * looked up here for English ("gettext style"), so a missing entry falls back to German, never to a key.
 */
export type Lang = 'de' | 'en';

export function detectLang(languages: readonly string[] = navigator.languages?.length ? navigator.languages : [navigator.language]): Lang {
  const first = (languages[0] ?? 'en').toLowerCase();
  return first.startsWith('de') ? 'de' : 'en';
}

export const lang: Lang = typeof navigator === 'undefined' ? 'de' : detectLang();
export const locale = lang === 'de' ? 'de-DE' : 'en-GB';

const EN: Record<string, string> = {
  // top bar
  'Rückgängig (Strg+Z)': 'Undo (Ctrl+Z)',
  Rückgängig: 'Undo',
  'Wiederholen (Strg+Y)': 'Redo (Ctrl+Y)',
  Wiederholen: 'Redo',
  'Neue Collage beginnen': 'Start a new collage',
  Neu: 'New',
  'Gespeicherte Collage öffnen': 'Open a saved collage',
  Öffnen: 'Open',
  'Collage als Datei speichern': 'Save the collage as a file',
  Speichern: 'Save',
  'Dunkles Design': 'Dark theme',
  'Helles Design': 'Light theme',
  'Design umschalten': 'Switch theme',
  'Als PNG (300 dpi) exportieren – eine Datei pro Seite': 'Export as PNG (300 dpi) – one file per page',
  'Als PDF in exakter Bogengröße – alle Seiten': 'Export as PDF at the exact sheet size – all pages',
  'Collage drucken (Strg+P)': 'Print collage (Ctrl+P)',
  Drucken: 'Print',
  'Hinweis zum Drucken': 'Printing tip',
  'Im Druckdialog': 'In the print dialog choose',
  'Ränder: Keine': 'Margins: None',
  und: 'and',
  'Skalierung: 100 %': 'Scale: 100%',
  'wählen, damit die Collage maßstabsgetreu gedruckt wird.': 'so the collage prints at true size.',
  // sheet card
  Bogen: 'Sheet',
  Format: 'Format',
  Breite: 'Width',
  Höhe: 'Height',
  Ausrichtung: 'Orientation',
  Hochformat: 'Portrait',
  Querformat: 'Landscape',
  Eigene: 'Custom',
  'Eigenes Format': 'Custom size',
  // layout card
  Aufteilung: 'Layout mode',
  'Vorlagen füllen den Bogen': 'Templates fill the sheet',
  Frei: 'Free',
  'Alle Plätze in einer festen Fotogröße, z. B. Passbild': 'All places in one fixed photo size, e.g. passport photo',
  'Feste Fotogröße': 'Fixed photo size',
  Fotogröße: 'Photo size',
  'Ausrichtung der Fotos': 'Photo orientation',
  Hoch: 'Portrait',
  Quer: 'Landscape',
  'Alle Plätze mit demselben Foto': 'Same photo in every place',
  Schnittmarken: 'Cut marks',
  'Passt nicht auf den Bogen': 'Does not fit on the sheet',
  'Bogen anpassen': 'Fit sheet',
  'Anzahl Fotos': 'Photos per page',
  Vorlage: 'Template',
  Neigung: 'Tilt',
  Abstand: 'Spacing',
  Rand: 'Margin',
  Hintergrund: 'Background',
  'Diese Fotogröße passt auf keinen Standardbogen.': 'This photo size does not fit on any standard sheet.',
  'Eigene Größe': 'Custom size',
  'Eigene Größe in mm': 'Custom size in mm',
  // templates
  Vollflächig: 'Full page',
  Nebeneinander: 'Side by side',
  Übereinander: 'Stacked',
  'Groß + 2': 'Large + 2',
  Reihe: 'Row',
  '2 × 2': '2 × 2',
  'Groß + 3': 'Large + 3',
  Raster: 'Grid',
  Hero: 'Hero',
  Mosaik: 'Mosaic',
  Diagonal: 'Diagonal',
  Filmstreifen: 'Film strip',
  Mittelpunkt: 'Centrepiece',
  'Spalten versetzt': 'Staggered columns',
  Streifen: 'Stripes',
  'Rahmen-Raster': 'Framed grid',
  // photo sizes
  Passbild: 'Passport photo',
  Bewerbungsfoto: 'Application photo',
  'US-Pass 2 × 2″': 'US passport 2 × 2″',
  'Quadrat 50': 'Square 50',
  'Passbild 35 × 45 mm. Hinweis: Personalausweis und Reisepass brauchen seit Mai 2025 ein digitales Foto (Fotostudio oder Behörde).':
    'Passport photo 35 × 45 mm. Note: German ID cards and passports have required a digital photo (studio or authority) since May 2025.',
  // style card
  Stil: 'Style',
  'In fester Fotogröße nicht verfügbar – die Fotogröße muss exakt bleiben.': 'Not available with a fixed photo size – the photo size must stay exact.',
  Rahmen: 'Frame',
  Keiner: 'None',
  Weiß: 'White',
  Polaroid: 'Polaroid',
  Farbe: 'Colour',
  Rahmenfarbe: 'Frame colour',
  Rahmenbreite: 'Frame width',
  Ecken: 'Corners',
  Schatten: 'Shadow',
  Kanten: 'Edges',
  Hart: 'Hard',
  Weich: 'Soft',
  Vignette: 'Vignette',
  Verstreut: 'Scattered',
  'Neu mischen: neue zufällige Neigungen': 'Reshuffle: new random tilts',
  Mischen: 'Shuffle',
  'Fotos hinzufügen …': 'Add photos …',
  // pages
  Seiten: 'Pages',
  'Vorige Seite': 'Previous page',
  'Nächste Seite': 'Next page',
  'Seite hinzufügen': 'Add page',
  'Leere Seite anhängen': 'Append an empty page',
  Plätze: 'Places',
  'Weniger Plätze': 'Fewer places',
  'Mehr Plätze': 'More places',
  'Seite löschen': 'Delete page',
  'Seite anhängen – Fotos hierher ziehen oder klicken': 'Append a page – drop photos here or click',
  Seite: 'Page',
  'Vorige Seite (Bild ↑)': 'Previous page (Page Up)',
  'Nächste Seite (Bild ↓)': 'Next page (Page Down)',
  'Seite {n} / {total}': 'Page {n} / {total}',
  'Seite {n}': 'Page {n}',
  'Seite {n} löschen (Fotos in die Ablage)': 'Delete page {n} (photos go to the tray)',
  'Seite leeren (Fotos in die Ablage)': 'Empty page (photos go to the tray)',
  '1 Seite': '1 page',
  '{n} Seiten': '{n} pages',
  '1 neue Seite angelegt': '1 new page added',
  '{n} neue Seiten angelegt': '{n} new pages added',
  // welcome
  'Fotos hierher ziehen': 'Drop photos here',
  oder: 'or',
  'Fotos auswählen': 'Choose photos',
  'Ziehen zum Tauschen': 'Drag to swap',
  'Scrollen zum Zoomen': 'Scroll to zoom',
  'Doppelklick setzt zurück': 'Double-click to reset',
  'Foto hierher ziehen': 'Drop a photo here',
  'Lädt …': 'Loading …',
  // crop panel
  'Ausgewähltes Foto': 'Selected photo',
  Ausschnitt: 'Crop',
  'Auswahl aufheben (Esc)': 'Deselect (Esc)',
  'Auswahl aufheben': 'Deselect',
  Zoom: 'Zoom',
  '90° nach links': 'Rotate 90° left',
  '90° nach rechts': 'Rotate 90° right',
  Links: 'Left',
  Rechts: 'Right',
  Spiegeln: 'Mirror',
  'Zurücksetzen (Doppelklick)': 'Reset (double-click)',
  Reset: 'Reset',
  'Ausrichtungshilfe: Mittellinie, Bereich für Scheitel und Kinn (Kopfhöhe ca. 32–36 mm), ungefähre Augenhöhe. Keine amtliche Prüfung.':
    'Alignment aid: centre line, range for crown and chin (head height approx. 32–36 mm), approximate eye level. Not an official check.',
  'Biometrie-Hilfslinien': 'Biometric guides',
  'Ausrichtungshilfe – keine amtliche Prüfung': 'Alignment aid – not an official check',
  Scheitel: 'Crown',
  Augen: 'Eyes',
  Kinn: 'Chin',
  'In die Ablage (Entf)': 'Move to tray (Del)',
  'In die Ablage': 'Move to tray',
  'Ziehen verschiebt den Ausschnitt, Pfeiltasten feinjustieren (Umschalt = 10 mm).': 'Drag to move the crop, arrow keys fine-tune (Shift = 10 mm).',
  '{dpi} dpi – wird sehr wahrscheinlich unscharf': '{dpi} dpi – will very likely look blurry',
  '{dpi} dpi – kann unscharf wirken': '{dpi} dpi – may look blurry',
  // tray
  Ablage: 'Tray',
  'Fotos ohne Platz landen hier – zum Einsetzen auf einen Platz ziehen.': 'Photos without a place land here – drag one onto a place to use it.',
  // dialogs
  'Neue Collage beginnen?': 'Start a new collage?',
  'Alle Fotos, Seiten und die Ablage werden entfernt. Mit Strg+Z lässt sich das rückgängig machen, solange dieser Tab offen bleibt.':
    'All photos, pages and the tray will be removed. Ctrl+Z undoes this as long as this tab stays open.',
  Abbrechen: 'Cancel',
  'Auch Bogen, Layout und Stil auf Standard zurücksetzen': 'Also reset sheet, layout and style to the defaults',
  'Alles zurücksetzen': 'Reset everything',
  'Bogen, Layout und Stil bleiben': 'Sheet, layout and style stay',
  'Einstellungen behalten': 'Keep settings',
  'Neue Collage begonnen – Strg+Z holt alles zurück.': 'New collage started – Ctrl+Z brings everything back.',
  'Vor dem Drucken': 'Before printing',
  'Bitte im Druckdialog einstellen': 'Please set in the print dialog',
  Papiergröße: 'Paper size',
  Ränder: 'Margins',
  Keine: 'None',
  Skalierung: 'Scale',
  '100 %': '100%',
  'Browser erlauben Erweiterungen nicht, das Papier vorzuwählen. Zuverlässiger: als PDF speichern und aus dem PDF-Programm drucken („Papierquelle gemäß PDF-Seitengröße“).':
    'Browsers do not let extensions preselect the paper. More reliable: save as PDF and print from your PDF reader ("Choose paper source by PDF page size").',
  'Nicht mehr anzeigen': "Don't show again",
  'Stattdessen als PDF': 'PDF instead',
  // messages
  'Nicht unterstützt: {files} (erlaubt: JPG, PNG, WebP, GIF)': 'Not supported: {files} (allowed: JPG, PNG, WebP, GIF)',
  'Keine gültige CollageWerk-Datei.': 'Not a valid CollageWerk file.',
  'Diese Datei stammt aus einer neueren CollageWerk-Version.': 'This file comes from a newer CollageWerk version.',
  'Die Datei ist unvollständig (Foto fehlt).': 'The file is incomplete (a photo is missing).',
  'Export fehlgeschlagen': 'Export failed',
};

/** Translate a German source string; `{name}` placeholders are filled from vars. */
export function t(de: string, vars: Record<string, string | number> = {}): string {
  const s = lang === 'en' ? (EN[de] ?? de) : de;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Format a number for the UI (decimal comma in German, point in English). */
export const fmtNum = (n: number, digits = 1) => (Math.round(n * 10 ** digits) / 10 ** digits).toLocaleString(locale);

/** Translate the static editor.html: text nodes and the tooltip/label attributes (only needed for English). */
export function translateDom(root: ParentNode = document.body) {
  document.documentElement.lang = lang;
  if (lang === 'de') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const n of nodes) {
    const raw = n.nodeValue ?? '';
    const core = raw.trim();
    if (!core || !(core in EN)) continue;
    const lead = raw.slice(0, raw.indexOf(core));
    const trail = raw.slice(raw.indexOf(core) + core.length);
    n.nodeValue = lead + EN[core] + trail;
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-tip], [aria-label], [title]')) {
    for (const a of ['data-tip', 'aria-label', 'title']) {
      const v = el.getAttribute(a);
      if (v && v in EN) el.setAttribute(a, EN[v]);
    }
  }
}

export const ENGLISH = EN;
