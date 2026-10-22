import type { AsciiArt } from "@hexhue/core";

/**
 * A tiny pixel canvas for authoring level art in code. Each cell holds one legend character
 * ("." is empty). Shapes use cell centers, so `disc(5.5, 5.5, 4, "y")` is a symmetric circle on an
 * even grid. Later calls paint over earlier ones.
 */
export class Canvas {
  private readonly grid: string[][];

  constructor(
    readonly width: number,
    readonly height: number,
    fill = ".",
  ) {
    this.grid = Array.from({ length: height }, () => new Array<string>(width).fill(fill));
  }

  set(x: number, y: number, ch: string): this {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi >= 0 && yi >= 0 && xi < this.width && yi < this.height) this.grid[yi]![xi] = ch;
    return this;
  }

  get(x: number, y: number): string {
    return this.grid[y]?.[x] ?? ".";
  }

  /** Paints every cell whose center satisfies `inside`. */
  where(inside: (x: number, y: number) => boolean, ch: string): this {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) if (inside(x, y)) this.grid[y]![x] = ch;
    }
    return this;
  }

  rect(x: number, y: number, w: number, h: number, ch: string): this {
    return this.where((px, py) => px >= x && px < x + w && py >= y && py < y + h, ch);
  }

  disc(cx: number, cy: number, r: number, ch: string): this {
    return this.where((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, ch);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, ch: string): this {
    return this.where((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, ch);
  }

  ring(cx: number, cy: number, r: number, thickness: number, ch: string): this {
    return this.where((x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      return d <= r && d > r - thickness;
    }, ch);
  }

  /**
   * Filled polygon (even-odd rule) through cell-space points. Cells whose center lies exactly on
   * an edge count as inside on every side, so symmetric shapes stay symmetric.
   */
  poly(points: [number, number][], ch: string): this {
    const onEdge = (x: number, y: number) =>
      points.some(([xi, yi], i) => {
        const [xj, yj] = points[(i + 1) % points.length]!;
        const cross = (xj - xi) * (y - yi) - (yj - yi) * (x - xi);
        const within =
          x >= Math.min(xi, xj) - 1e-9 &&
          x <= Math.max(xi, xj) + 1e-9 &&
          y >= Math.min(yi, yj) - 1e-9 &&
          y <= Math.max(yi, yj) + 1e-9;
        return within && Math.abs(cross) < 1e-9;
      });
    return this.where((x, y) => {
      if (onEdge(x, y)) return true;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i]!;
        const [xj, yj] = points[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, ch);
  }

  /** Filled star with `n` points, outer radius `r1`, inner radius `r2`, first point up. */
  star(cx: number, cy: number, r1: number, r2: number, n: number, ch: string): this {
    const pts: [number, number][] = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 === 0 ? r1 : r2;
      const a = -Math.PI / 2 + (i * Math.PI) / n;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return this.poly(pts, ch);
  }

  /** Line of cells from (x0, y0) to (x1, y1), both ends included. */
  line(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    const steps = Math.max(Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))), 1);
    for (let i = 0; i <= steps; i++) {
      this.set(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, ch);
    }
    return this;
  }

  /** Overlays ASCII rows at (x, y); "." in the stamp is transparent. */
  stamp(x: number, y: number, rows: string[]): this {
    rows.forEach((row, dy) =>
      [...row].forEach((ch, dx) => {
        if (ch !== ".") this.set(x + dx, y + dy, ch);
      }),
    );
    return this;
  }

  /** Replaces every `from` cell with `to` (e.g. recolor a region). */
  swap(from: string, to: string): this {
    return this.where((x, y) => this.grid[y]![x] === from, to);
  }

  /** Mirrors the left half onto the right half. */
  mirrorX(): this {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < Math.floor(this.width / 2); x++) {
        this.grid[y]![this.width - 1 - x] = this.grid[y]![x]!;
      }
    }
    return this;
  }

  rows(): string[] {
    return this.grid.map((r) => r.join(""));
  }

  art(legend: Record<string, string>): AsciiArt {
    return { legend, rows: this.rows() };
  }
}

/** Deterministic scatter (no Math.random in content): cells chosen by a hash of their position. */
export function sprinkle(
  canvas: Canvas,
  ch: string,
  density: number,
  seed: number,
  onlyOver = "",
): Canvas {
  return canvas.where((x, y) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h % 1000) / 1000 < density && (onlyOver === "" || canvas.get(x, y) === onlyOver);
  }, ch);
}
