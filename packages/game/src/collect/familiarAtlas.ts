import {
  FAMILIAR_H,
  FAMILIAR_W,
  FRAME_NAMES,
  frameRgba,
  type FrameName,
  type Rect,
} from "./familiarArt";

/** One packed texture holds every colour of a level: colours down, frames across. */
export const MAX_ATLAS_COLORS = 16;
/** The atlas must stay well inside a single small texture (and one draw batch). */
export const MAX_ATLAS_SIDE = 512;

export interface AtlasLayout {
  width: number;
  height: number;
  /** The frame's rectangle for colour index `colorIndex`. */
  frame(colorIndex: number, name: FrameName): Rect;
}

/** Layout for `colorCount` colours (1..16): 8 frames across, one colour per row. */
export function atlasLayout(colorCount: number): AtlasLayout {
  if (!Number.isInteger(colorCount) || colorCount < 1 || colorCount > MAX_ATLAS_COLORS) {
    throw new Error(`atlas holds 1..${MAX_ATLAS_COLORS} colours, got ${colorCount}`);
  }
  return {
    width: FAMILIAR_W * FRAME_NAMES.length,
    height: FAMILIAR_H * colorCount,
    frame(colorIndex, name) {
      if (colorIndex < 0 || colorIndex >= colorCount) throw new Error(`no colour ${colorIndex}`);
      return {
        x: FRAME_NAMES.indexOf(name) * FAMILIAR_W,
        y: colorIndex * FAMILIAR_H,
        w: FAMILIAR_W,
        h: FAMILIAR_H,
      };
    },
  };
}

/** Phaser frame name for colour `colorIndex` and `name`: stable, unique per atlas. */
export const atlasFrameName = (colorIndex: number, name: FrameName): string =>
  `${colorIndex}:${name}`;

/** Texture key for an atlas of these colours (changes when the colours change). */
export const atlasKey = (colorsHex: readonly string[]): string =>
  `familiars:${colorsHex.map((c) => c.toLowerCase()).join(",")}`;

/** Every frame manifest entry: name → rectangle. */
export function atlasManifest(colorCount: number): Record<string, Rect> {
  const layout = atlasLayout(colorCount);
  const out: Record<string, Rect> = {};
  for (let c = 0; c < colorCount; c++) {
    for (const name of FRAME_NAMES) out[atlasFrameName(c, name)] = layout.frame(c, name);
  }
  return out;
}

/** The whole atlas as RGBA bytes (row-major). */
export function atlasRgba(colorsHex: readonly string[]): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const layout = atlasLayout(colorsHex.length);
  const data = new Uint8ClampedArray(layout.width * layout.height * 4);
  colorsHex.forEach((color, c) => {
    for (const name of FRAME_NAMES) {
      const rect = layout.frame(c, name);
      const rgba = frameRgba(name, color);
      for (let y = 0; y < rect.h; y++) {
        const src = y * FAMILIAR_W * 4;
        const dst = ((rect.y + y) * layout.width + rect.x) * 4;
        data.set(rgba.subarray(src, src + FAMILIAR_W * 4), dst);
      }
    }
  });
  return { width: layout.width, height: layout.height, data };
}
