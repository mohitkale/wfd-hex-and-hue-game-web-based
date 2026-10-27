import { FAMILIAR_H, FAMILIAR_W, FRAME_NAMES, SS, type FrameName, type Rect } from "./familiarArt";

/** One packed texture holds every colour of a level: colours down, frames across (smooth vector frames, `familiarDraw.ts`). */
export const MAX_ATLAS_COLORS = 16;
/** The atlas must stay one modest texture (and one draw batch): 512 x 896 for 16 colours. */
export const MAX_ATLAS_SIDE = 1024;

/** One frame's size in texture pixels (the sprite's units times the supersampling). */
export const FRAME_PX_W = FAMILIAR_W * SS;
export const FRAME_PX_H = FAMILIAR_H * SS;

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
    width: FRAME_PX_W * FRAME_NAMES.length,
    height: FRAME_PX_H * colorCount,
    frame(colorIndex, name) {
      if (colorIndex < 0 || colorIndex >= colorCount) throw new Error(`no colour ${colorIndex}`);
      return {
        x: FRAME_NAMES.indexOf(name) * FRAME_PX_W,
        y: colorIndex * FRAME_PX_H,
        w: FRAME_PX_W,
        h: FRAME_PX_H,
      };
    },
  };
}

/** Phaser frame name for colour `colorIndex` and `name`: stable, unique per atlas. */
export const atlasFrameName = (colorIndex: number, name: FrameName): string =>
  `${colorIndex}:${name}`;

/** Texture key for an atlas of these colours and species (changes when either changes). */
export const atlasKey = (colorsHex: readonly string[], species = "bat"): string =>
  `familiars:${species}:${colorsHex.map((c) => c.toLowerCase()).join(",")}`;

/** Every frame manifest entry: name → rectangle. */
export function atlasManifest(colorCount: number): Record<string, Rect> {
  const layout = atlasLayout(colorCount);
  const out: Record<string, Rect> = {};
  for (let c = 0; c < colorCount; c++) {
    for (const name of FRAME_NAMES) out[atlasFrameName(c, name)] = layout.frame(c, name);
  }
  return out;
}
