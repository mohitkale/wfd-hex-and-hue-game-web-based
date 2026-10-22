import type { Art } from "@hexhue/core";
import { contrast, distance, parseHex, type Rgb } from "./color";

/** The play board's panel color (theme.panel): every fragment color must read against it. */
export const PANEL: Rgb = [0x0f, 0x08, 0x24];
/** Fragments must stand out from the dark panel (a collected cell). */
export const MIN_PANEL_CONTRAST = 1.6;
/** Two colors in one artwork must be clearly different: players match wisps to fragments by color. */
export const MIN_COLOR_DISTANCE = 90;

/** Readability problems with an artwork's palette; empty means it is fine to ship. */
export function artProblems(art: Pick<Art, "palette">): string[] {
  const problems: string[] = [];
  const colors = art.palette.map(parseHex);
  art.palette.forEach((hex, i) => {
    const c = contrast(colors[i]!, PANEL);
    if (c < MIN_PANEL_CONTRAST) {
      problems.push(`${hex} is too dark against the board (contrast ${c.toFixed(2)})`);
    }
    for (let j = i + 1; j < colors.length; j++) {
      const d = distance(colors[i]!, colors[j]!);
      if (d < MIN_COLOR_DISTANCE) {
        problems.push(`${hex} and ${art.palette[j]} look too similar (distance ${Math.round(d)})`);
      }
    }
  });
  return problems;
}
