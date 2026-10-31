import type { GrimoireEntry } from "@hexhue/learn";
import { CANDLE_SAFETY, CENTRE, QUARTERS } from "./altars";

/** F1, demo 1 (M17.2): casting a circle and closing it again. */
export const castingCircle: GrimoireEntry = {
  lesson: {
    id: "casting-a-circle",
    title: "Casting and closing a circle",
    branch: "elements",
    minutes: 5,
    intro:
      "A circle marks out a space for magic: you open it before a working and close it after. Rehearse the whole shape of it here, quarter by quarter.",
    steps: [
      {
        id: "ground",
        prompt:
          "Stand at the centre. Breathe in as the light grows and out as it fades, three times.",
        expects: [{ kind: "breathe", breaths: 3 }],
        order: "in-order",
        hint: "Hold while the light grows, let go while it fades.",
        why: "Grounding first settles your attention, so the circle is cast by a calm mind rather than a rushed one.",
      },
      {
        id: "tools",
        prompt:
          "Set each element's tool by its quarter: air, water and earth. Fire already has its candle in the south.",
        expects: [
          { kind: "place", item: "feather", spot: "east" },
          { kind: "place", item: "chalice", spot: "west" },
          { kind: "place", item: "stone", spot: "north" },
        ],
        order: "any-order",
        hint: "Air rises in the east with the sun; water is in the west, earth in the north.",
        why: "The tools are reminders: each quarter holds something you can see and touch for its element.",
      },
      {
        id: "cast",
        prompt:
          "Cast the circle: trace it once sunwise round the altar with your finger (clockwise on this cloth, as the sun moves in the northern hemisphere).",
        expects: [{ kind: "walk", path: "sunwise" }],
        order: "in-order",
        hint: "Sunwise goes the way the sun moves: north, east, south, west, like a clock.",
        why: "Moving sunwise (deosil) is the common way to build or bless. In the northern hemisphere the sun moves clockwise; many southern-hemisphere witches cast anticlockwise, following their own sun. Many walk the circle, others point a finger or a wand; some cast it three times.",
      },
      {
        id: "call",
        prompt: "Welcome the quarters: light their candles, beginning in the east.",
        expects: [
          { kind: "light", item: "east-candle" },
          { kind: "light", item: "south-candle" },
          { kind: "light", item: "west-candle" },
          { kind: "light", item: "north-candle" },
        ],
        order: "in-order",
        hint: "East first, where the sun rises, then go on sunwise.",
        why: "Calling the quarters welcomes each element into the circle. Words differ widely: some greet the elements, some guardians or ancestors, some simply light the candle in silence.",
      },
      {
        id: "work",
        prompt:
          "The circle is cast. This is where your working happens: a spell, a meditation or a quiet moment. Tap when you are ready to close.",
        expects: [{ kind: "continue" }],
        order: "in-order",
        hint: "Tap to move on and close the circle.",
        why: "The circle holds whatever you do inside it; casting and closing are the frame around the working.",
      },
      {
        id: "release",
        prompt:
          "Thank and release the quarters: snuff their candles in reverse, beginning in the north.",
        expects: [
          { kind: "snuff", item: "north-candle" },
          { kind: "snuff", item: "west-candle" },
          { kind: "snuff", item: "south-candle" },
          { kind: "snuff", item: "east-candle" },
        ],
        order: "in-order",
        hint: "Undo what you did: the last candle lit is the first snuffed.",
        why: "Closing in the reverse order of opening is a common way to unwind a circle, thanking each quarter as you go.",
      },
      {
        id: "open",
        prompt: "Open the circle: trace it once widdershins, against the sun.",
        expects: [{ kind: "walk", path: "widdershins" }],
        order: "in-order",
        hint: "Widdershins goes the other way: north, west, south, east.",
        why: "Moving widdershins, against the sun, undoes what was built sunwise, so the space returns to everyday use. In the southern hemisphere the two directions swap.",
      },
      {
        id: "return",
        prompt:
          "Touch the floor, or have a sip of water, to come back to the everyday. Tap to finish.",
        expects: [{ kind: "continue" }],
        order: "in-order",
        hint: "Tap to finish.",
        why: "Grounding afterwards brings your attention back down; many witches eat or drink something small.",
      },
    ],
  },
  topics: ["circle", "elements", "candle", "meditation"],
  safety: { fire: CANDLE_SAFETY },
  review: { status: "draft" },
  altar: {
    spots: [...QUARTERS, CENTRE],
    tools: [
      { id: "feather", label: "Feather", icon: "feather" },
      { id: "chalice", label: "Cup of water", icon: "chalice" },
      { id: "stone", label: "Stone", icon: "stone" },
      { id: "bell", label: "Bell", icon: "bell" },
      { id: "salt", label: "Dish of salt", icon: "salt" },
    ],
    candles: [
      { id: "east-candle", spot: "east", color: "#f2c94c" },
      { id: "south-candle", spot: "south", color: "#e8463c" },
      { id: "west-candle", spot: "west", color: "#3d7be0" },
      { id: "north-candle", spot: "north", color: "#3fa45b" },
    ],
  },
};
