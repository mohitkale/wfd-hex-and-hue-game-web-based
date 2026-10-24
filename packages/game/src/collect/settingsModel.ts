import type { Settings } from "../save/schema";

/**
 * The settings the v2 board lets a player change without leaving the level (M15.x, docs/QA.md "no
 * control inside the v2 screens"): pure data and rules, so they are tested without Phaser. They are
 * the same `Settings` the shipped game saves, so a change here is a change there.
 */

export type ToggleId = "sound" | "music" | "haptics" | "colorblind";

export interface ToggleRow {
  id: ToggleId;
  label: string;
  /** A short line under the label. */
  note: string;
}

export const TOGGLES: readonly ToggleRow[] = [
  { id: "sound", label: "Sound effects", note: "" },
  { id: "music", label: "Music", note: "" },
  { id: "haptics", label: "Vibration", note: "" },
  {
    id: "colorblind",
    label: "Colour symbols",
    note: "A shape for each colour on familiars and badges",
  },
];

export const MOTION_OPTIONS = [
  { label: "Auto", value: "system" },
  { label: "On", value: "on" },
  { label: "Off", value: "off" },
] as const;

/** `s` with one switch changed. Turning sound or music on never leaves its volume at 0. */
export function withToggle(s: Settings, id: ToggleId, value: boolean): Settings {
  const next = { ...s, [id]: value };
  if (value && id === "sound" && next.sfxVolume === 0) next.sfxVolume = 0.8;
  if (value && id === "music" && next.musicVolume === 0) next.musicVolume = 0.5;
  return next;
}

/** `s` with reduced motion set; anything but "on" or "off" means "system". */
export function withMotion(s: Settings, value: string): Settings {
  return { ...s, reducedMotion: value === "on" || value === "off" ? value : "system" };
}

/** The note for a row, which says so when the device cannot do what the switch controls. */
export function noteFor(row: ToggleRow, canVibrate: boolean): string {
  return row.id === "haptics" && !canVibrate ? "Not supported on this device" : row.note;
}
