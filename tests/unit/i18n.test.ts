import { describe, expect, it } from 'vitest';
import { detectLang } from '../../src/editor/i18n';

describe('language detection', () => {
  it('German for any de-* locale, English otherwise', () => {
    expect(detectLang(['de-DE'])).toBe('de');
    expect(detectLang(['de-CH', 'en'])).toBe('de');
    expect(detectLang(['en-US', 'de'])).toBe('en');
    expect(detectLang(['fr-FR'])).toBe('en');
    expect(detectLang([])).toBe('en');
  });
});
