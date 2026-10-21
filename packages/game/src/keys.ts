import type { LaunchSource } from "@hexhue/core";

/** Desktop shortcuts: 1–6 launch summon columns, Q W E R T Y U I relaunch holding slots. */
const SLOT_KEYS = ["q", "w", "e", "r", "t", "y", "u", "i"];

export function keyToSource(key: string, columns: number, slots: number): LaunchSource | null {
  const k = key.toLowerCase();
  const n = Number.parseInt(k, 10);
  if (String(n) === k && n >= 1 && n <= columns) return { kind: "column", index: n - 1 };
  const s = SLOT_KEYS.indexOf(k);
  if (s !== -1 && s < slots) return { kind: "slot", index: s };
  return null;
}
