import { describe, expect, it } from 'vitest';
import { History, HISTORY_LIMIT } from '../../src/model/history';
import { parseFile, toFile } from '../../src/model/fileformat';
import { addPhotos, createCollage, setSlotCount } from '../../src/model/collage';

describe('History (rule 26)', () => {
  it('undo/redo and limit of 50', () => {
    const h = new History<number>();
    let cur = 0;
    for (let i = 1; i <= 60; i++) {
      h.push(cur);
      cur = i;
    }
    let n = 0;
    for (;;) {
      const prev = h.undo(cur);
      if (prev === null) break;
      cur = prev;
      n++;
    }
    expect(n).toBe(HISTORY_LIMIT);
    expect(cur).toBe(10);
    cur = h.redo(cur)!;
    expect(cur).toBe(11);
  });
  it('a new change clears redo', () => {
    const h = new History<number>();
    h.push(0);
    h.undo(1);
    h.push(0);
    expect(h.canRedo).toBe(false);
  });
});

describe('Collage file (rule 28)', () => {
  it('round-trips state including tray, prunes unused photos', () => {
    let c = addPhotos(createCollage(), ['a', 'b', 'c'].map((id) => ({ id, name: id, w: 10, h: 10 })));
    c = setSlotCount(c, 2);
    c.photos.zzz = { id: 'zzz', name: 'z', w: 1, h: 1 };
    const f = toFile(c, { a: 'data:a', b: 'data:b', c: 'data:c', zzz: 'data:z' });
    const back = parseFile(JSON.stringify(f));
    expect(back.collage.slots.map((s) => s?.photoId)).toEqual(['a', 'b']);
    expect(back.collage.tray.map((s) => s.photoId)).toEqual(['c']);
    expect(Object.keys(back.images).sort()).toEqual(['a', 'b', 'c']);
  });
  it('rejects garbage', () => {
    expect(() => parseFile('nope')).toThrow();
    expect(() => parseFile('{"format":"x"}')).toThrow();
  });
});
