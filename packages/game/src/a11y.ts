/**
 * Accessibility helpers that don't need Phaser: colorblind symbols (one shape per palette color,
 * drawn on cubes and boxes so matching never depends on hue alone) and the reduced-motion
 * decision.
 */

/** One filled part of a symbol, in a unit box centered on 0,0 (coordinates within -1..1). */
export type SymbolPart =
  | { kind: "poly"; points: readonly (readonly [number, number])[] }
  | { kind: "circle"; r: number; hole?: number };

const regular = (n: number, r: number, rotate = -Math.PI / 2): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = rotate + (i * 2 * Math.PI) / n;
    return [r * Math.cos(a), r * Math.sin(a)];
  });

const star = (points: number, outer: number, inner: number): [number, number][] =>
  Array.from({ length: points * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 === 0 ? outer : inner;
    return [r * Math.cos(a), r * Math.sin(a)];
  });

const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Thick bar from the center at angle `a` (for plus / cross shapes). */
const bar = (a: number, len: number, w: number): [number, number][] => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [-len * c - w * s, -len * s + w * c],
    [len * c - w * s, len * s + w * c],
    [len * c + w * s, len * s - w * c],
    [-len * c + w * s, -len * s - w * c],
  ];
};

/**
 * Symbols in palette order: shapes that stay distinct when tiny and in any color. A level uses
 * at most 8 colors; there are 10 shapes.
 */
export const SYMBOLS: readonly (readonly SymbolPart[])[] = [
  [{ kind: "circle", r: 0.62 }],
  [{ kind: "poly", points: regular(3, 0.8, -Math.PI / 2) }],
  [{ kind: "poly", points: rect(-0.6, -0.6, 0.6, 0.6) }],
  [{ kind: "poly", points: regular(4, 0.78, -Math.PI / 2) }],
  [
    { kind: "poly", points: bar(0, 0.75, 0.24) },
    { kind: "poly", points: bar(Math.PI / 2, 0.75, 0.24) },
  ],
  [
    { kind: "poly", points: bar(Math.PI / 4, 0.75, 0.22) },
    { kind: "poly", points: bar(-Math.PI / 4, 0.75, 0.22) },
  ],
  [{ kind: "poly", points: star(5, 0.85, 0.36) }],
  [{ kind: "circle", r: 0.66, hole: 0.36 }],
  [{ kind: "poly", points: regular(3, 0.8, Math.PI / 2) }],
  [{ kind: "poly", points: regular(6, 0.7, 0) }],
];

/** The symbol for palette color `index`. */
export function symbolFor(index: number): readonly SymbolPart[] {
  return SYMBOLS[index % SYMBOLS.length]!;
}

/** The subset of the canvas 2D API the symbol painter uses. */
export interface PathContext {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, start: number, end: number, ccw?: boolean): void;
  closePath(): void;
  fill(rule?: "nonzero" | "evenodd"): void;
}

/** Fills symbol `index` centered at (cx, cy), `size` px across, with the context's fill style. */
export function paintSymbol(
  ctx: PathContext,
  index: number,
  cx: number,
  cy: number,
  size: number,
): void {
  const k = size / 2;
  const parts = symbolFor(index);
  // One path for all parts, so overlapping bars (plus, cross) fill once, not twice.
  ctx.beginPath();
  for (const part of parts) {
    if (part.kind === "circle") {
      ctx.arc(cx, cy, part.r * k, 0, Math.PI * 2);
      if (part.hole) {
        ctx.moveTo(cx + part.hole * k, cy);
        ctx.arc(cx, cy, part.hole * k, 0, Math.PI * 2, true);
      }
    } else {
      part.points.forEach(([x, y], i) =>
        i === 0 ? ctx.moveTo(cx + x * k, cy + y * k) : ctx.lineTo(cx + x * k, cy + y * k),
      );
      ctx.closePath();
    }
  }
  // Holes (the ring) need even-odd; crossing bars need nonzero so their overlap stays filled.
  ctx.fill(parts.some((p) => p.kind === "circle" && p.hole) ? "evenodd" : "nonzero");
}

export type MotionSetting = "system" | "on" | "off";

/** Reduce motion when the player asked for it, or (on "system") when the OS asks for it. */
export function reducedMotion(setting: MotionSetting, systemPrefersReduced: boolean): boolean {
  return setting === "on" || (setting === "system" && systemPrefersReduced);
}

/** The live reduced-motion flag a game keeps in its registry (see index.ts). */
export function isReducedMotion(scene: { registry: { get(key: string): unknown } }): boolean {
  return scene.registry.get("reducedMotion") === true;
}
