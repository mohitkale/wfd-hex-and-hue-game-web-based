import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  FAMILIAR_H,
  FAMILIAR_W,
  FIXED,
  FRAMES,
  FRAME_NAMES,
  LEGEND,
  MIN_OUTLINE_CONTRAST,
  PANEL,
  badgeRect,
  contrast,
  familiarScale,
  frameRgba,
  palette,
  parseHex,
  type FrameName,
} from "../../packages/game/src/collect/familiarArt";
import {
  MAX_ATLAS_COLORS,
  MAX_ATLAS_SIDE,
  atlasFrameName,
  atlasKey,
  atlasLayout,
  atlasManifest,
  atlasRgba,
} from "../../packages/game/src/collect/familiarAtlas";
import { parseAsciiArt } from "@hexhue/core";
import { worlds } from "../../content/worlds";
import { distance, parseHex as parseRgb } from "../art/color";
import { SHEET_COLORS, phoneSheet, sheet } from "./sheet";

const alpha = (name: FrameName, color: string) => {
  const rgba = frameRgba(name, color);
  return Array.from({ length: FAMILIAR_W * FAMILIAR_H }, (_, i) => rgba[i * 4 + 3]!);
};
const count = (name: FrameName, ch: string) => FRAMES[name].join("").split(ch).length - 1;
const pixels = (name: FrameName) =>
  FRAMES[name].flatMap((row, y) => [...row].flatMap((ch, x) => (ch === "." ? [] : [{ x, y, ch }])));
const BODY = new Set(["l", "m", "d", "c"]);

/** Number of 8-connected components of the filled pixels. */
function components(name: FrameName): number {
  const filled = new Set(pixels(name).map((p) => p.y * FAMILIAR_W + p.x));
  const seen = new Set<number>();
  let n = 0;
  for (const start of filled) {
    if (seen.has(start)) continue;
    n++;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const c = stack.pop()!;
      const x = c % FAMILIAR_W;
      const y = Math.floor(c / FAMILIAR_W);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= FAMILIAR_W || ny >= FAMILIAR_H) continue;
          const k = ny * FAMILIAR_W + nx;
          if (filled.has(k) && !seen.has(k)) {
            seen.add(k);
            stack.push(k);
          }
        }
      }
    }
  }
  return n;
}

describe("familiar frames", () => {
  it("has the documented frames, exactly the sprite size, only legend characters", () => {
    expect(FRAME_NAMES).toEqual([
      "idle0",
      "idle1",
      "walk0",
      "walk1",
      "carry0",
      "carry1",
      "pickup",
      "deliver",
    ]);
    for (const name of FRAME_NAMES) {
      expect(FRAMES[name], name).toHaveLength(FAMILIAR_H);
      for (const row of FRAMES[name]) {
        expect(row, name).toHaveLength(FAMILIAR_W);
        for (const ch of row) expect(ch === "." || ch in LEGEND, `${name}: '${ch}'`).toBe(true);
      }
    }
  });

  it("keeps the last row empty, stands on one baseline and is horizontally centred", () => {
    for (const name of FRAME_NAMES) {
      expect(FRAMES[name][FAMILIAR_H - 1], `${name} bottom margin`).toBe(".".repeat(FAMILIAR_W));
      const lowest = Math.max(...pixels(name).map((p) => p.y));
      expect(lowest, `${name} baseline`).toBe(12);
      const cols = pixels(name)
        .filter((p) => p.ch === "o")
        .map((p) => p.x);
      const centre = (Math.min(...cols) + Math.max(...cols)) / 2;
      expect(Math.abs(centre - (FAMILIAR_W - 1) / 2), `${name} centred`).toBeLessThanOrEqual(1.5);
    }
  });

  it("is one connected creature in every frame (no floating limbs or stray pixels)", () => {
    for (const name of FRAME_NAMES) expect(components(name), name).toBe(1);
  });

  it("wings and arms are left-right symmetric in every frame", () => {
    for (const name of FRAME_NAMES) {
      for (const row of FRAMES[name]) {
        for (const ch of ["x", "w"]) {
          const left = [...row].flatMap((c, x) => (c === ch ? [x] : []));
          const right = [...row]
            .flatMap((c, x) => (c === ch ? [FAMILIAR_W - 1 - x] : []))
            .sort((a, b) => a - b);
          expect(left, `${name} ${ch}`).toEqual(right);
        }
      }
    }
  });

  it("every frame is a recognisable creature", () => {
    for (const name of FRAME_NAMES) {
      expect(
        count(name, "m") + count(name, "l") + count(name, "d"),
        `${name} body`,
      ).toBeGreaterThanOrEqual(30);
      expect(count(name, "e"), `${name} eyes`).toBeGreaterThanOrEqual(6);
      expect(count(name, "p"), `${name} pupils`).toBe(2);
      expect(count(name, "g"), `${name} glow`).toBeGreaterThanOrEqual(2);
    }
  });

  it("poses are clearly different from each other (at least 12 pixels apart)", () => {
    for (let i = 0; i < FRAME_NAMES.length; i++) {
      for (let j = i + 1; j < FRAME_NAMES.length; j++) {
        const a = FRAMES[FRAME_NAMES[i]!];
        const b = FRAMES[FRAME_NAMES[j]!];
        let diff = 0;
        for (let y = 0; y < FAMILIAR_H; y++)
          for (let x = 0; x < FAMILIAR_W; x++) if (a[y]![x] !== b[y]![x]) diff++;
        expect(diff, `${FRAME_NAMES[i]} vs ${FRAME_NAMES[j]}`).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it("action poses are distinguishable: carry has arms in a V, deliver throws them up, pickup crouches", () => {
    // Carry: arm pixels ('m' outside the 4..11 body columns) at the hand rows, V-shaped (further out higher up).
    const armCols = (name: FrameName, y: number) =>
      [...FRAMES[name][y]!].flatMap((c, x) => (x < 4 && (c === "m" || c === "o") ? [x] : []));
    expect(armCols("carry0", 2).length).toBeGreaterThan(0);
    expect(Math.min(...armCols("carry0", 2))).toBeLessThan(Math.min(...armCols("carry0", 7)));
    // Deliver: arms rise to row 1 with a sparkle above; carry's hands start lower.
    expect(armCols("deliver", 1).length).toBeGreaterThan(0);
    expect(armCols("carry0", 1)).toEqual([]);
    expect(count("deliver", "g")).toBeGreaterThan(count("carry0", "g"));
    // Pickup: the torso is shorter and the arms reach the bottom rows.
    expect(armCols("pickup", 11).length + armCols("pickup", 12).length).toBeGreaterThan(0);
    const bodyRows = (name: FrameName) =>
      new Set(
        pixels(name)
          .filter((p) => p.ch === "d")
          .map((p) => p.y),
      ).size;
    expect(bodyRows("pickup")).toBeLessThanOrEqual(bodyRows("idle0"));
    // Walking alternates the feet between apart and together.
    expect(FRAMES.walk0[12]).not.toBe(FRAMES.walk1[12]);
  });
});

describe("familiar colour", () => {
  it("silhouette is independent of the cube colour; fixed parts are identical across colours", () => {
    for (const name of FRAME_NAMES) {
      const base = alpha(name, SHEET_COLORS[0]!);
      for (const color of SHEET_COLORS)
        expect(alpha(name, color), `${name} ${color}`).toEqual(base);
    }
    for (const color of SHEET_COLORS) {
      const p = palette(color);
      for (const role of ["wing", "wingEdge", "eyeWhite", "pupil", "glow", "cheek"] as const) {
        expect(p[role], `${color} ${role}`).toEqual(FIXED[role]);
      }
    }
  });

  it("rejects colours that are not #rrggbb", () => {
    expect(() => parseHex("e24a4a")).toThrow("#rrggbb");
    expect(() => parseHex("#abc")).toThrow("#rrggbb");
    expect(parseHex("#e24a4a")).toEqual([226, 74, 74]);
  });

  it("every colour used by the shipped world art reads on the board: outline lighter than the panel, body distinct from its outline", () => {
    const colors = new Set<string>();
    for (const world of worlds) {
      for (const level of world.levels)
        for (const c of parseAsciiArt(level.art).palette) colors.add(c.toLowerCase());
    }
    expect(colors.size).toBeGreaterThan(30);
    for (const color of colors) {
      const p = palette(color);
      expect(contrast(p.outline, PANEL), `${color} outline`).toBeGreaterThanOrEqual(
        MIN_OUTLINE_CONTRAST - 0.01,
      );
      expect(contrast(p.mid, PANEL), `${color} body`).toBeGreaterThanOrEqual(1.5);
      // The face is carried by the dark pupils inside the white of the eyes, whatever the body
      // colour (white eyes alone are weak on pale bodies such as yellow, so the pupils matter).
      expect(contrast(p.pupil, p.eyeWhite), `${color} pupil`).toBeGreaterThanOrEqual(7);
    }
  });

  it("sheet colours are clearly different in normal vision; under deuteranopia some fall below that bar, so the chest badge is required", () => {
    const mids = SHEET_COLORS.map((c) => parseRgb(c));
    mids.forEach((a, i) => {
      for (let j = i + 1; j < mids.length; j++)
        expect(distance(a, mids[j]!)).toBeGreaterThanOrEqual(90);
    });
    // Deuteranopia simulation (Machado et al., severity 1): the closest pair of cube colours falls
    // below the distance (90) this art requires in normal vision, which is why the chest badge
    // (the M6.5 symbol) is required in colour-blind mode.
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const gam = (v: number) =>
      Math.round(
        255 * Math.max(0, Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)),
      );
    const deut = (c: readonly number[]): [number, number, number] => {
      const [r, g, b] = [lin(c[0]!), lin(c[1]!), lin(c[2]!)];
      return [
        gam(0.367322 * r + 0.860646 * g - 0.227968 * b),
        gam(0.280085 * r + 0.672501 * g + 0.047413 * b),
        gam(-0.01182 * r + 0.04294 * g + 0.968881 * b),
      ];
    };
    let min = Infinity;
    const sim = mids.map((c) => deut(c));
    sim.forEach((a, i) => {
      for (let j = i + 1; j < sim.length; j++) min = Math.min(min, distance(a, sim[j]!));
    });
    expect(min).toBeLessThan(90);
    expect(min).toBeGreaterThan(0);
  });
});

describe("colourblind badge anchor", () => {
  it("lies entirely on body pixels (not eyes, wings or arms) in every frame", () => {
    for (const name of FRAME_NAMES) {
      const r = badgeRect(name);
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          expect(
            BODY.has(FRAMES[name][y]![x]!),
            `${name} (${x},${y}) is '${FRAMES[name][y]![x]}'`,
          ).toBe(true);
        }
      }
      expect(r.w * r.h).toBeGreaterThanOrEqual(12);
    }
  });
});

describe("phone scale", () => {
  it("picks whole-number device scales that give 20-28 CSS px at common densities", () => {
    expect([1, 2, 3].map((dpr) => familiarScale(dpr))).toEqual([2, 3, 5]);
    for (const dpr of [2, 2.625, 3, 3.5]) {
      const css = (FAMILIAR_W * familiarScale(dpr)) / dpr;
      expect(css, `dpr ${dpr}`).toBeGreaterThanOrEqual(20);
      expect(css, `dpr ${dpr}`).toBeLessThanOrEqual(28);
    }
    // dpr 1 (desktop) rounds up to 32 px rather than using an unevenly scaled 24.
    expect(familiarScale(1) * FAMILIAR_W).toBe(32);
    expect(familiarScale(0.5)).toBeGreaterThanOrEqual(1);
  });
});

describe("atlas", () => {
  it("fits one small texture for every possible level and has a complete, unique manifest", () => {
    for (let n = 1; n <= MAX_ATLAS_COLORS; n++) {
      const layout = atlasLayout(n);
      expect(layout.width).toBe(128);
      expect(layout.height).toBe(14 * n);
      expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(MAX_ATLAS_SIDE);
      const manifest = atlasManifest(n);
      expect(Object.keys(manifest)).toHaveLength(n * FRAME_NAMES.length);
      // Rectangles never overlap and stay inside the texture.
      const used = new Set<string>();
      for (const [name, r] of Object.entries(manifest)) {
        expect(r.x + r.w, name).toBeLessThanOrEqual(layout.width);
        expect(r.y + r.h, name).toBeLessThanOrEqual(layout.height);
        const key = `${r.x},${r.y}`;
        expect(used.has(key), `${name} overlaps`).toBe(false);
        used.add(key);
      }
    }
    expect(atlasLayout(MAX_ATLAS_COLORS).height).toBe(224);
    expect(() => atlasLayout(0)).toThrow();
    expect(() => atlasLayout(MAX_ATLAS_COLORS + 1)).toThrow();
    expect(atlasFrameName(3, "carry1")).toBe("3:carry1");
  });

  it("packs each frame's pixels exactly where the manifest says", () => {
    const colors = SHEET_COLORS.slice(0, 3);
    const atlas = atlasRgba(colors);
    const layout = atlasLayout(colors.length);
    colors.forEach((color, c) => {
      for (const name of FRAME_NAMES) {
        const r = layout.frame(c, name);
        const frame = frameRgba(name, color);
        for (let y = 0; y < r.h; y++) {
          for (let x = 0; x < r.w; x++) {
            const a = ((r.y + y) * atlas.width + r.x + x) * 4;
            const f = (y * FAMILIAR_W + x) * 4;
            expect([...atlas.data.subarray(a, a + 4)], `${c}:${name} (${x},${y})`).toEqual([
              ...frame.subarray(f, f + 4),
            ]);
          }
        }
      }
    });
    expect(atlasKey(["#AABBCC", "#112233"])).toBe(atlasKey(["#aabbcc", "#112233"]));
    expect(atlasKey(["#aabbcc"])).not.toBe(atlasKey(["#aabbcd"]));
  });
});

describe("contact sheets", () => {
  it("are generated at the documented sizes", () => {
    const small = sheet(2);
    expect(small.width).toBe(FRAME_NAMES.length * (FAMILIAR_W * 2 + 4) + 4);
    expect(small.height).toBe(SHEET_COLORS.length * (FAMILIAR_H * 2 + 4) + 4);
    expect(phoneSheet().height).toBeGreaterThan(FAMILIAR_H * 5);
  });

  it("the committed PNGs match the generator (re-run `npm run familiar:sheet` after art changes)", () => {
    const check = (file: string, png: PNG) => {
      const committed = PNG.sync.read(
        readFileSync(new URL(`../../docs/art/${file}`, import.meta.url)),
      );
      expect(committed.width, file).toBe(png.width);
      expect(committed.height, file).toBe(png.height);
      expect(Buffer.compare(committed.data, png.data), `${file} is stale`).toBe(0);
    };
    check("familiar-sheet.png", sheet(10));
    check("familiar-sheet-mobile.png", sheet(2));
    check("familiar-sheet-phone.png", phoneSheet());
  });
});
