import { describe, expect, it } from "vitest";
import { defaultSave } from "../save/schema";
import { MOTION_OPTIONS, TOGGLES, noteFor, withMotion, withToggle } from "./settingsModel";

const base = () => defaultSave().settings;

describe("v2 settings", () => {
  it("each switch changes only its own setting and does not mutate the original", () => {
    const s = base();
    for (const row of TOGGLES) {
      const off = withToggle(s, row.id, false);
      expect(off[row.id]).toBe(false);
      expect({ ...off, [row.id]: s[row.id] }).toEqual(s);
    }
    expect(s).toEqual(base());
  });

  it("turning sound or music on never leaves it silent at volume 0", () => {
    const quiet = { ...base(), sound: false, music: false, sfxVolume: 0, musicVolume: 0 };
    expect(withToggle(quiet, "sound", true)).toMatchObject({ sound: true, sfxVolume: 0.8 });
    expect(withToggle(quiet, "music", true)).toMatchObject({ music: true, musicVolume: 0.5 });
    // A volume the player chose is kept.
    expect(withToggle({ ...quiet, sfxVolume: 0.3 }, "sound", true).sfxVolume).toBe(0.3);
  });

  it("reduced motion takes on, off or system, and anything else is system", () => {
    expect(MOTION_OPTIONS.map((o) => o.value)).toEqual(["system", "on", "off"]);
    expect(withMotion(base(), "on").reducedMotion).toBe("on");
    expect(withMotion(base(), "off").reducedMotion).toBe("off");
    expect(withMotion({ ...base(), reducedMotion: "on" }, "junk").reducedMotion).toBe("system");
  });

  it("says when vibration is not supported", () => {
    const haptics = TOGGLES.find((t) => t.id === "haptics")!;
    expect(noteFor(haptics, false)).toMatch(/Not supported/);
    expect(noteFor(haptics, true)).toBe("");
  });

  it("offers every accessibility setting the shipped game has, except volumes", () => {
    expect(TOGGLES.map((t) => t.id)).toEqual(["sound", "music", "haptics", "colorblind"]);
  });
});
