import type { PhotoMeta } from '../model/types';

export const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const EXT = /\.(jpe?g|png|webp|gif)$/i;

export function isSupported(f: File) {
  return f.type ? SUPPORTED_TYPES.includes(f.type) : EXT.test(f.name);
}

interface Entry {
  blob: Blob;
  bitmap?: ImageBitmap;
  url?: string;
  loading?: Promise<ImageBitmap>;
}

/** Photo pixel data, keyed by photo id. Kept for the whole session so undo can bring Photos back. */
export class PhotoStore {
  private map = new Map<string, Entry>();
  onLoaded: () => void = () => {};

  has(id: string) {
    return this.map.has(id);
  }
  blob(id: string) {
    return this.map.get(id)?.blob;
  }
  bitmap(id: string) {
    const e = this.map.get(id);
    if (!e) return undefined;
    if (!e.bitmap && !e.loading) {
      e.loading = decode(e.blob).then((b) => {
        e.bitmap = b;
        this.onLoaded();
        return b;
      });
    }
    return e.bitmap;
  }
  url(id: string) {
    const e = this.map.get(id);
    if (!e) return '';
    if (!e.url) e.url = URL.createObjectURL(e.blob);
    return e.url;
  }

  put(id: string, blob: Blob, bitmap?: ImageBitmap) {
    this.map.set(id, { blob, bitmap });
  }

  /** Decode a dropped file; EXIF orientation is applied (rule 15). Throws for undecodable files. */
  async add(file: File): Promise<PhotoMeta> {
    const bmp = await decode(file);
    const id = crypto.randomUUID();
    this.put(id, file, bmp);
    return { id, name: file.name, w: bmp.width, h: bmp.height };
  }

  async ensureAll(ids: Iterable<string>) {
    await Promise.all([...ids].map((id) => (this.bitmap(id), this.map.get(id)?.loading)));
  }
}

export function decode(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}
