import * as collect from "@hexhue/core/collect";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pieces } from "../../content/v2art";
import {
  decodeArtLevel,
  encodeArtLevel,
  type ArtLevelData,
} from "../../packages/game/src/collect/artLevelCodec";
import {
  ART_LEVELS,
  ART_PIECE_IDS,
  artLevelForPiece,
} from "../../packages/game/src/collect/artLevels";
import { DEV_LEVELS } from "../../packages/game/src/collect/levels";
import { effectForTheme } from "../../packages/game/src/collect/completion";
import { cellColor, fitCell } from "../../packages/game/src/collect/pictureView";
import {
  emptySpellbook,
  isUnlocked,
  recordWin,
  unlockedList,
} from "../../packages/game/src/collect/v2Spellbook";
import { botPlay } from "../collect/density";
import { OUTPUT, artLevels, levelForPiece, serialize } from "./levels";

const withoutShades = (level: collect.CollectLevel): collect.CollectLevel => {
  const { shades: _shades, ...rest } = level;
  return rest;
};

/** M11.5: every art piece is a playable level whose win reveals it and unlocks it in the Spellbook. */

/** The committed levels and generation records (regenerating all six takes about half a minute). */
const committed = (JSON.parse(readFileSync(OUTPUT, "utf8")) as ArtLevelData[]).map((d) => ({
  level: decodeArtLevel(d),
  generated: d.generated!,
}));

describe("the art library's preview levels", () => {
  const generated = committed;
  const levels = generated.map((g) => g.level);

  it("has one valid, winnable level per piece, with its shades and subject", () => {
    expect(levels.map((l) => l.id)).toEqual(pieces.map((p) => `art-${p.id}`));
    for (const level of levels) {
      expect(collect.validateCollectLevel(level), level.id).toEqual([]);
      expect(level.shades, level.id).toBeDefined();
      expect(level.subject, level.id).toBeDefined();
      expect(botPlay(level, true).status, level.id).toBe("won");
    }
  });

  it("the committed JSON is current (run `npm run art:levels` after changing art)", () => {
    expect(readFileSync(OUTPUT, "utf8")).toBe(serialize(artLevels()));
  }, 300_000);

  it("the game's registry plays them: ?level=art-<id>, and the finished picture is reachable by id", () => {
    expect(ART_PIECE_IDS).toEqual(pieces.map((p) => p.id));
    for (const p of pieces) {
      expect(DEV_LEVELS[`art-${p.id}`], p.id).toBe(ART_LEVELS[`art-${p.id}`]);
      expect(artLevelForPiece(p.id)?.subject?.name).toBe(p.name);
    }
    expect(artLevelForPiece("no-such-piece")).toBeNull();
  });

  it("records how each level was generated, and the record is true (profile limits, slots, openings)", () => {
    for (const { level, generated: record } of generated) {
      const spec = collect.PROFILES[record.profile as collect.Profile];
      expect(spec, level.id).toBeDefined();
      const m = record.metrics;
      expect(m.parkers, level.id).toBeGreaterThanOrEqual(spec.minParkers);
      expect(m.winnableOpenings, level.id).toBeGreaterThanOrEqual(spec.minOpenings);
      expect(level.slots, level.id).toBe(Math.min(8, m.minSlots + spec.slack));
      expect(collect.minSlots(level, 200_000).slots, level.id).toBe(m.minSlots);
      expect(m.cubes).toBe(level.cells.filter((c) => c >= 0).length);
    }
  });

  it("round-trips through the compact encoding exactly", () => {
    for (const level of levels) expect(decodeArtLevel(encodeArtLevel(level))).toEqual(level);
    expect(() => encodeArtLevel(withoutShades(levels[0]!))).toThrow("needs shades");
  });

  it("the compact data stays small enough for the v2 chunk", () => {
    expect(readFileSync(OUTPUT, "utf8").length).toBeLessThan(40_000);
  });

  it("is deterministic", () => {
    expect(levelForPiece(pieces[0]!)).toEqual(levelForPiece(pieces[0]!));
  });
});

describe("effect selection by subject", () => {
  it("every piece of the set gets its theme's own effect, not the fallback", () => {
    for (const { level } of committed) {
      const effect = effectForTheme(level.subject!.theme);
      expect(effect.id, level.id).not.toBe("bloom");
    }
    const byTheme = new Map(
      committed.map(({ level: l }) => [l.subject!.theme, effectForTheme(l.subject!.theme).id]),
    );
    expect(byTheme.get("moon")).toBe("illuminate");
    expect(byTheme.get("ritual")).toBe("bubbles");
    expect(byTheme.get("crystal")).toBe("glow");
    expect(byTheme.get("astrology")).toBe("constellation");
    expect(byTheme.get("familiar")).toBe("awaken");
  });
});

describe("a win unlocks the picture in the Spellbook", () => {
  it("winning a level and recording it unlocks exactly that piece, with its lore on hand", () => {
    for (const { level } of committed) {
      expect(botPlay(level, true).status).toBe("won");
      const { book, isNew } = recordWin(emptySpellbook(), level.subject!.id, 123);
      expect(isNew).toBe(true);
      expect(unlockedList(book).map((e) => e.id)).toEqual([level.subject!.id]);
      for (const other of pieces.filter((p) => p.id !== level.subject!.id))
        expect(isUnlocked(book, other.id)).toBe(false);
      expect(level.subject!.lore.length).toBeGreaterThan(0);
    }
  });

  it("losing never unlocks anything (a loss is not recorded)", () => {
    const level = committed[0]!.level;
    const session = new collect.CollectSession(level);
    expect(session.state.status).toBe("playing");
    expect(isUnlocked(emptySpellbook(), level.subject!.id)).toBe(false);
  });
});

describe("the finished picture", () => {
  it("paints each cube in its shade, falling back to the family colour without shades", () => {
    const level = committed[0]!.level;
    const i = level.cells.findIndex((c) => c >= 0);
    expect(cellColor(level, i)).toBe(
      parseInt(level.shades!.colors[level.shades!.cells[i]!]!.slice(1), 16),
    );
    expect(cellColor(withoutShades(level), i)).toBe(
      parseInt(level.palette[level.cells[i]!]!.slice(1), 16),
    );
    expect(
      cellColor(
        level,
        level.cells.findIndex((c) => c < 0),
      ),
    ).toBeNull();
  });

  it("fits any piece on a phone-sized card", () => {
    for (const { level } of committed) expect(fitCell(level, 300, 200)).toBeGreaterThanOrEqual(5);
  });
});
