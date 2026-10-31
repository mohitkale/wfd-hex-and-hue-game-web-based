import { describe, expect, it } from "vitest";
import {
  FAMILIAR_H,
  FAMILIAR_W,
  FIXED,
  FRAME_NAMES,
  SPECIES,
  SS,
  badgeRect,
  contrast,
  mix,
  palette,
  parseHex,
  speciesFor,
  type Rgb,
} from "../../packages/game/src/collect/familiarArt";
import {
  MAX_ATLAS_COLORS,
  MAX_ATLAS_SIDE,
  atlasFrameName,
  atlasKey,
  atlasLayout,
  atlasManifest,
} from "../../packages/game/src/collect/familiarAtlas";
import {
  FACE_BOTTOM_PX,
  FRAME_H,
  FRAME_W,
  POSES,
  drawFrame,
  type Gradient,
  type Painter,
} from "../../packages/game/src/collect/familiarDraw";
import { PICTURE_PALETTE } from "../../packages/game/src/collect/pictureBoard";
import { distance, parseHex as parseRgb } from "../art/color";

const SHEET_COLORS = ["#e24a4a", "#4ae26b", "#4a6be2", "#f2c94c", "#b44ae2", "#4ae2d8"];

/** A painter that records every call (and the points it touches), so drawing is tested without a browser. */
function recorder() {
  const ops: string[] = [];
  const points: [number, number][] = [];
  /** The points of each filled shape, with its fill colour. */
  const shapes: { style: string; pts: [number, number][] }[] = [];
  let current: [number, number][] = [];
  const grad: Gradient = { addColorStop: () => undefined };
  let sx = 1;
  let ox = 0;
  const stack: [number, number][] = [];
  const pt = (x: number, y: number) => {
    points.push([ox + x * sx, y]);
    current.push([ox + x * sx, y]);
  };
  const p: Painter = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    save: () => {
      ops.push("save");
      stack.push([sx, ox]);
    },
    restore: () => {
      ops.push("restore");
      [sx, ox] = stack.pop() ?? [1, 0];
    },
    translate: (x) => {
      ops.push("translate");
      ox += x * sx;
    },
    scale: (x) => {
      ops.push("scale");
      sx *= x;
    },
    beginPath: () => (ops.push("begin"), (current = [])),
    closePath: () => ops.push("close"),
    moveTo: (x, y) => (ops.push("move"), pt(x, y)),
    lineTo: (x, y) => (ops.push("line"), pt(x, y)),
    quadraticCurveTo: (_cx, _cy, x, y) => (ops.push("quad"), pt(x, y)),
    bezierCurveTo: (_a, _b, _c, _d, x, y) => (ops.push("bezier"), pt(x, y)),
    ellipse: (x, y, rx, ry) => {
      ops.push("ellipse");
      pt(x - rx, y - ry);
      pt(x + rx, y + ry);
    },
    fill: () => {
      ops.push(`fill ${String(p.fillStyle)}`);
      shapes.push({ style: String(p.fillStyle), pts: [...current] });
    },
    stroke: () => ops.push("stroke"),
    createLinearGradient: () => grad,
  };
  return { p, ops, points, shapes };
}

/** The shape of a drawing: every call without the colours. */
const shape = (ops: string[]) => ops.map((o) => (o.startsWith("fill") ? "fill" : o)).join(",");

describe("familiar frames (vector bats and cats)", () => {
  it("has the documented frames and species, a 16 x 14 unit sprite drawn SS times larger", () => {
    expect([...FRAME_NAMES]).toEqual([
      "idle0",
      "idle1",
      "walk0",
      "walk1",
      "walk2",
      "walk3",
      "walk4",
      "walk5",
      "carry0",
      "carry1",
      "carry2",
      "carry3",
      "carry4",
      "carry5",
      "pickup",
      "deliver",
    ]);
    expect([...SPECIES]).toEqual(["bat", "cat", "ant", "owl", "frog", "spider"]);
    expect(FRAME_W).toBe(FAMILIAR_W * SS);
    expect(FRAME_H).toBe(FAMILIAR_H * SS);
    expect(Object.keys(POSES).sort()).toEqual([...FRAME_NAMES].sort());
  });

  it.each(SPECIES)(
    "%s: every frame draws something, balanced, and stays inside its cell",
    (species) => {
      for (const name of FRAME_NAMES) {
        const { p, ops, points } = recorder();
        drawFrame(p, name, "#4a6be2", species);
        expect(ops.filter((o) => o.startsWith("fill")).length, name).toBeGreaterThan(8);
        expect(ops.filter((o) => o === "save").length).toBe(
          ops.filter((o) => o === "restore").length,
        );
        for (const [x, y] of points) {
          expect(x, `${species} ${name} x`).toBeGreaterThanOrEqual(-0.5);
          expect(x, `${species} ${name} x`).toBeLessThanOrEqual(FRAME_W + 0.5);
          expect(y, `${species} ${name} y`).toBeGreaterThanOrEqual(-0.5);
          expect(y, `${species} ${name} y`).toBeLessThanOrEqual(FRAME_H + 0.5);
        }
      }
    },
  );

  it.each(SPECIES)(
    "%s: the drawing is deterministic and the silhouette does not depend on the colour",
    (species) => {
      for (const name of FRAME_NAMES) {
        const a = recorder();
        const b = recorder();
        const c = recorder();
        drawFrame(a.p, name, "#e24a4a", species);
        drawFrame(b.p, name, "#e24a4a", species);
        drawFrame(c.p, name, "#4ae2d8", species);
        expect(b.ops).toEqual(a.ops);
        expect(shape(c.ops), `${species} ${name}`).toBe(shape(a.ops));
        expect(c.points).toEqual(a.points);
      }
    },
  );

  it.each(SPECIES)("%s: the poses are clearly different from each other", (species) => {
    const seen = new Map<string, string>();
    for (const name of FRAME_NAMES) {
      const { p, points } = recorder();
      drawFrame(p, name, "#4a6be2", species);
      const key = points.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(";");
      expect(seen.get(key), `${species} ${name} equals ${seen.get(key)}`).toBeUndefined();
      seen.set(key, name);
    }
  });

  it.each(SPECIES)(
    "%s: the pose families differ as documented (carry has arms, deliver sparkles, pickup sinks)",
    (species) => {
      const draw = (name: (typeof FRAME_NAMES)[number]) => {
        const r = recorder();
        drawFrame(r.p, name, "#4a6be2", species);
        return r;
      };
      // Arms add two outlined strokes each: more strokes than an idle pose.
      const strokes = (name: (typeof FRAME_NAMES)[number]) =>
        draw(name).ops.filter((o) => o === "stroke").length;
      expect(strokes("carry0")).toBeGreaterThan(strokes("idle0"));
      expect(strokes("deliver")).toBeGreaterThan(strokes("idle0"));
      // Delivering throws sparkles in the glow colour.
      const glow = `rgba(${FIXED.glow.join(",")},1)`;
      expect(draw("deliver").ops).toContain(`fill ${glow}`);
      expect(draw("idle0").ops).not.toContain(`fill ${glow}`);
      // Picking up crouches: the lowest drawn point is lower than when standing is not the test, the
      // body's top is: nothing is drawn above where a standing familiar's head ends.
      const top = (name: (typeof FRAME_NAMES)[number]) =>
        Math.min(...draw(name).points.map(([, y]) => y));
      expect(top("pickup")).toBeGreaterThan(top("idle0"));
    },
  );

  it("is left-right symmetric where it should be: the bat's wings and ears are mirrored about the centre", () => {
    const { p, points } = recorder();
    drawFrame(p, "idle0", "#4a6be2", "bat");
    const xs = points.map(([x]) => x);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(FRAME_W, 0);
  });

  it("uses cats for the familiar pictures and bats for every other", () => {
    expect(speciesFor("familiar")).toBe("cat");
    for (const theme of ["moon", "ritual", "crystal", "astrology", "other", undefined])
      expect(speciesFor(theme)).toBe("bat");
  });
});

describe("familiar colour", () => {
  it("rejects colours that are not #rrggbb", () => {
    expect(() => parseHex("e24a4a")).toThrow("#rrggbb");
    expect(() => parseHex("#abc")).toThrow("#rrggbb");
    expect(parseHex("#e24a4a")).toEqual([226, 74, 74]);
  });

  it("every colour a level is played in reads on the light board and the wooden table: the outline stands out", () => {
    const colors = new Set(Object.values(PICTURE_PALETTE).map((c) => c.toLowerCase()));
    expect(colors.size).toBe(19);
    // The picture's tray (frosted white over the wood) and the bare table round it (M15.7 look).
    const wood: Rgb = [0xeb, 0xbf, 0x91];
    const board = mix(wood, [0xfa, 0xf4, 0xec], 0.55);
    for (const color of colors) {
      const p = palette(color);
      expect(contrast(p.outline, board), `${color} outline on the board`).toBeGreaterThanOrEqual(2);
      expect(contrast(p.outline, wood), `${color} outline on the table`).toBeGreaterThanOrEqual(2);
      // The face is carried by the dark pupils inside the white of the eyes, whatever the body
      // colour (white eyes alone are weak on pale bodies such as yellow, so the pupils matter).
      expect(contrast(FIXED.pupil, FIXED.eyeWhite), `${color} pupil`).toBeGreaterThanOrEqual(7);
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
  it.each(SPECIES)(
    "%s: sits below the face, inside the sprite, big enough for a symbol",
    (species) => {
      for (const name of FRAME_NAMES) {
        const r = badgeRect(name, species);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(FAMILIAR_W);
        expect(r.y + r.h).toBeLessThanOrEqual(FAMILIAR_H);
        // Below the eyes (the only face) of the standing figure (a crouched frame sinks 5 px).
        expect(r.y * SS, `${species} ${name}`).toBeGreaterThanOrEqual(FACE_BOTTOM_PX[species]);
        expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(2);
      }
    },
  );

  it.each(SPECIES)(
    "%s: the eyes (white shapes) end above FACE_BOTTOM_PX, which the badge clears",
    (species) => {
      const { p, shapes } = recorder();
      drawFrame(p, "idle0", "#4a6be2", species);
      const eyes = shapes.filter((x) => x.style === "rgba(255,255,255,1)" && x.pts.length === 2);
      expect(eyes.length).toBeGreaterThanOrEqual(2);
      const lowest = Math.max(...eyes.flatMap((e) => e.pts.map(([, y]) => y)));
      expect(lowest).toBeLessThanOrEqual(FACE_BOTTOM_PX[species] + 0.5);
      expect(lowest).toBeGreaterThan(FACE_BOTTOM_PX[species] - 3);
    },
  );
});

describe("atlas", () => {
  it("fits one texture for every possible level and has a complete, unique manifest", () => {
    for (let n = 1; n <= MAX_ATLAS_COLORS; n++) {
      const layout = atlasLayout(n);
      expect(layout.width).toBe(FRAME_NAMES.length * FAMILIAR_W * SS);
      expect(layout.height).toBe(n * FAMILIAR_H * SS);
      expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(MAX_ATLAS_SIDE);
      const manifest = atlasManifest(n);
      expect(Object.keys(manifest)).toHaveLength(n * FRAME_NAMES.length);
      const used = new Set<string>();
      for (const [name, r] of Object.entries(manifest)) {
        expect(r.w).toBe(FRAME_W);
        expect(r.h).toBe(FRAME_H);
        expect(r.x + r.w, name).toBeLessThanOrEqual(layout.width);
        expect(r.y + r.h, name).toBeLessThanOrEqual(layout.height);
        const key = `${r.x},${r.y}`;
        expect(used.has(key), `${name} overlaps`).toBe(false);
        used.add(key);
      }
    }
    expect(() => atlasLayout(0)).toThrow();
    expect(() => atlasLayout(MAX_ATLAS_COLORS + 1)).toThrow();
    expect(atlasFrameName(3, "carry1")).toBe("3:carry1");
  });

  it("keys the atlas by colours (case-insensitive) and species", () => {
    expect(atlasKey(["#AABBCC", "#112233"])).toBe(atlasKey(["#aabbcc", "#112233"]));
    expect(atlasKey(["#aabbcc"])).not.toBe(atlasKey(["#aabbcd"]));
    expect(atlasKey(["#aabbcc"], "bat")).not.toBe(atlasKey(["#aabbcc"], "cat"));
  });
});
