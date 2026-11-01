import type { Collage } from './types';
import { prunePhotos, withDefaults } from './collage';

export const FILE_FORMAT = 'collagewerk';
export const FILE_VERSION = 2;

export interface CollageFile {
  format: typeof FILE_FORMAT;
  version: number;
  collage: Collage;
  /** photoId → data URL */
  images: Record<string, string>;
}

export function toFile(c: Collage, images: Record<string, string>): CollageFile {
  const pruned = prunePhotos(c);
  const used: Record<string, string> = {};
  for (const id of Object.keys(pruned.photos)) used[id] = images[id];
  return { format: FILE_FORMAT, version: FILE_VERSION, collage: pruned, images: used };
}

export function parseFile(text: string): CollageFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Keine gültige CollageWerk-Datei.');
  }
  const f = data as CollageFile;
  if (!f || f.format !== FILE_FORMAT || typeof f.version !== 'number' || !f.collage || !f.images) {
    throw new Error('Keine gültige CollageWerk-Datei.');
  }
  if (f.version > FILE_VERSION) throw new Error('Diese Datei stammt aus einer neueren CollageWerk-Version.');
  for (const id of Object.keys(f.collage.photos ?? {})) {
    if (typeof f.images[id] !== 'string') throw new Error('Die Datei ist unvollständig (Foto fehlt).');
  }
  return { ...f, collage: withDefaults(f.collage) };
}
