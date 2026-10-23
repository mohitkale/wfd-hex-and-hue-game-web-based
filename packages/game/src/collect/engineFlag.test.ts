import { describe, expect, it } from "vitest";
import { v2Requested } from "./engineFlag";

describe("v2Requested (the only thing the shipped game's entry point reads)", () => {
  it("is false for every v1 URL, so nothing of v2 is requested", () => {
    for (const search of [
      "",
      "?",
      "?level=moon",
      "?engine=v1",
      "?engine=",
      "?engine=V2",
      "?foo=engine=v2",
    ]) {
      expect(v2Requested(search), search).toBe(false);
    }
    expect(v2Requested("", undefined)).toBe(false);
    expect(v2Requested("", "v1")).toBe(false);
  });

  it("is true only for ?engine=v2 or a PUBLIC_ENGINE=v2 build", () => {
    expect(v2Requested("?engine=v2")).toBe(true);
    expect(v2Requested("?level=moon&engine=v2&cb=1")).toBe(true);
    expect(v2Requested("", "v2")).toBe(true);
  });
});
