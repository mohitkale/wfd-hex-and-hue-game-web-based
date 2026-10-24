import { describe, expect, it } from "vitest";
import { useV2 } from "./engineFlag";

describe("useV2 (the only thing the entry point reads)", () => {
  it("is the default: no flag, ?engine=v2, a misspelling or an empty value all run v2", () => {
    for (const search of [
      "",
      "?",
      "?level=moon",
      "?engine=v2",
      "?engine=",
      "?engine=V1",
      "?foo=engine=v1",
      "?level=slice&engine=v2&cb=1",
    ]) {
      expect(useV2(search), search).toBe(true);
    }
    expect(useV2("", undefined)).toBe(true);
    expect(useV2("", "v2")).toBe(true);
  });

  it("only ?engine=v1 or a PUBLIC_ENGINE=v1 build runs the old game", () => {
    expect(useV2("?engine=v1")).toBe(false);
    expect(useV2("?level=moon&engine=v1&cb=1")).toBe(false);
    expect(useV2("", "v1")).toBe(false);
  });

  it("an explicit choice in the URL wins over the build's default", () => {
    expect(useV2("?engine=v1", "v2")).toBe(false);
    expect(useV2("?engine=v2", "v1")).toBe(true);
    expect(useV2("", "v1")).toBe(false);
  });
});
