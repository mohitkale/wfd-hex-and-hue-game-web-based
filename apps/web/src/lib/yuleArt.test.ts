import { describe, expect, it } from "vitest";
import { YULE_ART, yuleSvg } from "./yuleArt";

describe("the Yule picture", () => {
  it("is a tidy grid of known colours", () => {
    for (const row of YULE_ART) expect(row).toMatch(/^[.kbnrgeyowch]{20}$/);
    expect(yuleSvg()).toContain('viewBox="0 0 20 14"');
  });
});
