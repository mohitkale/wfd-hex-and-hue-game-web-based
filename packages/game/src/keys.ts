import type { LaunchSource } from "@hexhue/core";

/**
 * Desktop shortcuts by physical key position (`KeyboardEvent.code`), so they work on any keyboard
 * layout: the 1–6 digit keys (or numpad) launch summon columns, the Q W E R T Y U I row relaunches
 * holding slots.
 */
const SLOT_CODES = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI"];

export function keyToSource(code: string, columns: number, slots: number): LaunchSource | null {
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (digit) {
    const n = Number(digit[1]);
    return n <= columns ? { kind: "column", index: n - 1 } : null;
  }
  const s = SLOT_CODES.indexOf(code);
  if (s !== -1 && s < slots) return { kind: "slot", index: s };
  return null;
}
