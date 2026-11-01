import type { Collage } from '../model/types';

const DB = 'collagewerk';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('photos');
      r.result.createObjectStore('state');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= open());

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise((res, rej) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => res(req ? req.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }),
  );
}

export const savePhoto = (id: string, blob: Blob) => tx('photos', 'readwrite', (s) => s.put(blob, id));
export const loadPhoto = (id: string) => tx<Blob>('photos', 'readonly', (s) => s.get(id));
export const photoKeys = () => tx<IDBValidKey[]>('photos', 'readonly', (s) => s.getAllKeys());
export const deletePhoto = (id: string) => tx('photos', 'readwrite', (s) => s.delete(id));
export const saveState = (c: Collage) => tx('state', 'readwrite', (s) => s.put(c, 'current'));
export const loadState = () => tx<Collage>('state', 'readonly', (s) => s.get('current'));
