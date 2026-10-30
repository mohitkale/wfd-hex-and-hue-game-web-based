import { describe, expect, it, vi } from "vitest";
import * as collect from "@hexhue/core/collect";
import { fixtureB, randomLevel } from "../../packages/core/src/collect/fixtures";
import { ART_LEVELS } from "../../packages/game/src/collect/artLevels";
import { JOURNEY } from "../../packages/game/src/collect/journey";
import { TUTORIAL_IDS } from "../../packages/game/src/collect/tutorialLevels";
import { SHIPPED } from "../../content/v2art";
import { DEV_LEVELS } from "../../packages/game/src/collect/levels";
import { KNOWN, REPORT, checkAll, inventory, markdown, run, type Entry } from "./production";
import { readFileSync } from "node:fs";

/** M15.2: the production-level gate (docs/V2_PRODUCTION.md). */

const winnable = (): collect.CollectLevel => ({ ...fixtureB(), id: "fx-ok", slots: 3 });

/** A valid level the solver proves unwinnable, found deterministically. */
function unwinnable(): collect.CollectLevel {
  for (let seed = 1; seed < 500; seed++) {
    const level = randomLevel(seed, true);
    if (
      level &&
      collect.validateCollectLevel(level).length === 0 &&
      collect.solve(level).status === "unsolvable"
    )
      return { ...level, id: "fx-bad" };
  }
  throw new Error("no unsolvable level found");
}

// The real inventory is solved and played by nine cheap players plus 200 random runs per level; on a
// busy machine that takes longer than the default 30 s.
vi.setConfig({ testTimeout: 120_000 });

describe("the real inventory", () => {
  const entries = inventory();
  const result = checkAll(entries);

  it("holds every level a player can reach: the tutorial and the witch's journey (the map and the daily pool)", () => {
    const ids = entries.map((e) => e.level.id);
    expect(ids).toEqual([...TUTORIAL_IDS, ...JOURNEY.map((e) => e.id)]);
  });

  it("passes the gate, every level solved and replayed to a win", () => {
    expect(result.failures).toEqual([]);
    expect(result.rows.every((r) => r.solved)).toBe(true);
  });

  it("has a recorded reason for every deviation, and none that no longer occurs", () => {
    for (const reason of Object.values(KNOWN)) expect(reason.length).toBeGreaterThan(20);
    expect(result.rows.flatMap((r) => r.known).length).toBe(Object.keys(KNOWN).length);
  });

  it("every level the game loads by name is production or explicitly dev-only", () => {
    const DEV_ONLY: Record<string, string> = {
      parking: "slot-parking demo",
      purple12: "dev board",
      seals: "wax-seal tutorial: seals are not shipped in any level yet (docs/V2_VARIETY.md)",
      moon: "demo picture",
      swarm: "renderer stress board",
      dense: "density test board",
      dense24: "density test board",
      dense40: "density test board",
      big: "renderer worst case",
      slice: "the M10.5 vertical slice (gate G1), kept for the record; not on the journey",
      ...Object.fromEntries(
        Object.keys(ART_LEVELS).map((id) => [id, "art library preview, not on the journey"]),
      ),
    };
    const production = new Set(entries.map((e) => e.level.id));
    for (const [key, make] of Object.entries(DEV_LEVELS)) {
      const id = make().id;
      const listed = production.has(id) || Object.hasOwn(DEV_ONLY, key);
      expect(listed, `${key} (${id}) is loadable but neither production nor dev-only`).toBe(true);
    }
    for (const reason of Object.values(DEV_ONLY)) expect(reason.length).toBeGreaterThan(5);
  });

  it("a shipped level id must be in the inventory", () => {
    expect(checkAll(entries, KNOWN, [JOURNEY[0]!.id]).failures).toEqual([]);
    expect(checkAll(entries, KNOWN, ["nope"]).failures.join()).toMatch(/nope: shipped/);
  });

  it("covers every shipped piece (none yet)", () => {
    expect(SHIPPED).toEqual([]);
  });

  it("the committed report is the report of today's levels", () => {
    expect(readFileSync(REPORT, "utf8")).toBe(markdown(result));
  });

  it("never claims human approval", () => {
    expect(markdown(result)).toMatch(/Nothing here is human approval/);
    expect(result.rows.filter((r) => r.kind === "art").every((r) => r.human.length >= 2)).toBe(
      true,
    );
  });
});

describe("bad levels fail", () => {
  const entry = (kind: Entry["kind"], level: collect.CollectLevel): Entry => ({ kind, level });

  it("a good level passes with no deviations", () => {
    expect(checkAll([entry("tutorial", winnable())], {}).failures).toEqual([]);
  });

  it("an unsolvable level fails, and nothing can waive it", () => {
    const bad = unwinnable();
    const key = `${bad.id}: unsolvable: the solver says unsolvable`;
    const r = checkAll([entry("tutorial", bad)], { [key]: "a reason that must not matter" });
    expect(r.rows[0]!.solved).toBe(false);
    // The issue itself fails, and the waiver offered for it is stale (it was never applied).
    expect(r.failures.some((f) => f.startsWith(`${bad.id}: unsolvable`))).toBe(true);
    expect(r.failures.join()).toMatch(/stale known deviation/);
  });

  it("an invalid level fails", () => {
    const r = checkAll([entry("tutorial", { ...winnable(), slots: 0 })], {});
    expect(r.failures.join()).toMatch(/invalid/);
  });

  it("a trivial level fails where its kind needs resistance to cheap play, and not as a tutorial", () => {
    // Fixture B with room for every waiting group is beaten by every cheap player.
    const easyOne = entry("slice", winnable());
    const r = checkAll([easyOne], {});
    expect(r.failures.join()).toMatch(/fx-ok: trivial/);
    expect(checkAll([entry("tutorial", winnable())], {}).failures).toEqual([]);
  });

  it("an art level without its picture is inconsistent", () => {
    const r = checkAll([entry("art", winnable())], {});
    expect(r.failures.join()).toMatch(/inconsistent: an art level has no subject/);
  });

  it("a level listed twice, or the same puzzle under two ids, fails", () => {
    const a = winnable();
    expect(checkAll([entry("tutorial", a), entry("tutorial", a)], {}).failures.join()).toMatch(
      /listed twice/,
    );
    const twin = { ...a, id: "fx-twin" };
    expect(checkAll([entry("tutorial", a), entry("tutorial", twin)], {}).failures.join()).toMatch(
      /same puzzle as fx-ok/,
    );
  });

  it("a recorded deviation that no longer occurs fails (the debt can only shrink)", () => {
    const r = checkAll([entry("tutorial", winnable())], {
      "fx-ok: trivial: gone": "was needed once, long ago",
    });
    expect(r.failures.join()).toMatch(/stale known deviation/);
  });

  it("a shipped level missing from the inventory fails, and an empty inventory fails", () => {
    expect(checkAll([entry("tutorial", winnable())], {}, ["art-nope"]).failures.join()).toMatch(
      /shipped but not in the production inventory/,
    );
    expect(checkAll([], {}).failures.join()).toMatch(/inventory is empty/);
  });
});

describe("the command", () => {
  const entries = [{ kind: "tutorial", level: winnable() } as Entry];
  const text = markdown(checkAll(entries, {}));

  it("--check passes when the report is current and fails when it is stale or missing", () => {
    // A current report passes (no deviations are recorded since the journey, M15.14).
    expect(Object.keys(KNOWN)).toEqual([]);
    expect(run(["--check"], entries, () => text).code).toBe(0);
    const real = run(["--check"]);
    expect(real.code).toBe(0);
    const stale = run(["--check"], inventory(), () => "old");
    expect(stale.code).toBe(1);
    expect(stale.out.join("\n")).toMatch(/out of date/);
    const missing = run(["--check"], inventory(), () => {
      throw new Error("ENOENT");
    });
    expect(missing.code).toBe(1);
  });

  it("--write writes the report and never fails by itself on a clean inventory", () => {
    let written = "";
    const r = run(
      ["--write"],
      inventory(),
      () => "",
      (t) => (written = t),
    );
    expect(r.code).toBe(0);
    expect(written).toBe(readFileSync(REPORT, "utf8"));
  });
});
