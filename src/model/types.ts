/** Crop of a Photo, stored in the displayed frame (after rotation + mirror). */
export interface Crop {
  /** 1 = cover, up to MAX_ZOOM */
  zoom: number;
  /** clockwise rotation in degrees: 0 | 90 | 180 | 270 */
  rot: number;
  mirror: boolean;
  /** focus point = point of the displayed Photo at the Slot centre, normalised 0..1 */
  fx: number;
  fy: number;
}

export interface PhotoMeta {
  id: string;
  name: string;
  /** pixel size after EXIF orientation */
  w: number;
  h: number;
}

export interface Placed {
  photoId: string;
  crop: Crop;
}

export type Orientation = 'portrait' | 'landscape';

export interface Sheet {
  preset: string;
  /** size in mm, portrait base (w <= h is not enforced for custom) */
  w: number;
  h: number;
  orientation: Orientation;
}

export type LayoutMode = 'free' | 'fixed';

/** Fixed size of every Slot in the 'fixed' Layout mode (portrait base dimensions in mm). */
export interface PhotoSize {
  preset: string;
  w: number;
  h: number;
  orientation: Orientation;
}

export interface Collage {
  sheet: Sheet;
  mode: LayoutMode;
  photoSize: PhotoSize;
  /** Same photo mode (only effective in 'fixed') */
  samePhoto: boolean;
  /** Cut marks (only effective in 'fixed') */
  cutMarks: boolean;
  slotCount: number;
  templateIndex: number;
  gap: number;
  margin: number;
  background: string;
  slots: (Placed | null)[];
  tray: Placed[];
  photos: Record<string, PhotoMeta>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
