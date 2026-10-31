import type { AltarSpot } from "@hexhue/learn";

/**
 * The quarters of a round altar cloth, north at the top as on a map. Sunwise (the way the sun
 * moves across a northern-hemisphere sky) is then clockwise: north, east, south, west.
 */
export const QUARTERS: readonly AltarSpot[] = [
  { id: "north", label: "North", x: 0.5, y: 0.14 },
  { id: "east", label: "East", x: 0.86, y: 0.5 },
  { id: "south", label: "South", x: 0.5, y: 0.86 },
  { id: "west", label: "West", x: 0.14, y: 0.5 },
];

export const CENTRE: AltarSpot = { id: "centre", label: "Centre", x: 0.5, y: 0.5 };

/** Shared fire-safety note for every lesson that lights a candle. */
export const CANDLE_SAFETY =
  "Use a sturdy holder on a heat-proof plate, away from curtains, paper, pets and children. Tie back long hair and loose sleeves. Never leave a flame alone, and snuff it before you leave the room or go to sleep.";
