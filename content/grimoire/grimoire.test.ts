import { checkLibrary } from "@hexhue/learn";
import { describe, expect, it } from "vitest";
import { GRIMOIRE } from "./index";

describe("the Grimoire library", () => {
  it("passes every content rule", () => {
    expect(checkLibrary(GRIMOIRE)).toEqual([]);
  });
});
