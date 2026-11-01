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
  /** hand-set Tilt in degrees (Scatter); undefined = seeded random */
  tilt?: number;
}

/** One printed Sheet with its own Slots. `count` = hand-set Slot count of the last Page (rule 4). */
export interface Page {
  slots: (Placed | null)[];
  count?: number;
}

export type FrameKind = 'none' | 'white' | 'polaroid' | 'color';
export type EdgeKind = 'hard' | 'soft' | 'vignette';

export interface Style {
  frame: FrameKind;
  frameColor: string;
  /** mm */
  frameWidth: number;
  /** corner radius in mm */
  radius: number;
  shadow: boolean;
  edges: EdgeKind;
  scatter: boolean;
  seed: number;
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
  /** Photos per Page */
  slotCount: number;
  templateId: string;
  /** Diagonal Template divider angle in degrees */
  slant: number;
  gap: number;
  margin: number;
  background: string;
  style: Style;
  pages: Page[];
  tray: Placed[];
  photos: Record<string, PhotoMeta>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A Slot: bounding rectangle plus, for non-rectangular Templates, its polygon. */
export interface Slot extends Rect {
  poly?: Point[];
}

/** Printed Template decoration (film bands, sprocket holes, frame lines). */
export interface Decor {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  radius?: number;
}
