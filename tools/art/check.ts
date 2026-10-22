import type { Art } from "@hexhue/core";
import { theme } from "../../packages/game/src/theme";
import { contrast, distance, parseHex, type Rgb } from "./color";

/** The play board's panel color (from the game theme): every fragment must read against it. */
export const PANEL: Rgb = [(theme.panel >> 16) & 255, (theme.panel >> 8) & 255, theme.panel & 255];
/** Fragments must stand out from the dark panel (a collected cell). */
export const MIN_PANEL_CONTRAST = 1.6;
/** Two colors in one artwork must be clearly different: players match wisps to fragments by color. */
export const MIN_COLOR_DISTANCE = 90;

/**
 * Readability problems with an artwork's palette; empty means it is fine to ship. A baseline, not
 * an accessibility guarantee: redmean distance ignores color-vision deficiency, which the
 * colorblind symbol mode (GAME_DESIGN §6, M6.5) covers.
 */
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
