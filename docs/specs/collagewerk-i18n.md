# CollageWerk – English UI (follows the browser)

## Goal
The editor speaks English unless the browser's preferred language is German.

## Behaviour
1. The UI language is taken from the browser's first preferred language: any `de-*` → German, everything else → English. There is no manual switch.
2. Every user-facing string is translated: static labels, tooltips and aria-labels, chips (sheet/photo sizes), Template names, toasts, dialogs, dpi badges, the Biometric guide, the canvas placeholder text and the empty-tray hint.
3. Numbers use the language's decimal separator (2,5 mm / 2.5 mm). Sizes keep the "×" and "mm" notation.
4. The extension name, description and toolbar tooltip are localised via `_locales` (en default, de).
5. Collage files and autosaves are language-independent.

## Out of scope
- Manual language switch, further languages, localised store screenshots.
