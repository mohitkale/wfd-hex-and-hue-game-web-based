import type { GrimoireEntry } from "@hexhue/learn";
import { CANDLE_SAFETY } from "./altars";

/** F3, demo 2 (M18.3): Yule, the winter solstice, on the Wheel of the Year. */
export const yule: GrimoireEntry = {
  lesson: {
    id: "yule",
    title: "Yule: welcoming back the light",
    branch: "sabbats",
    minutes: 4,
    intro:
      "Yule is the winter solstice, the longest night of the year. From here the days grow longer again, and many witches light a candle to welcome the sun's return.",
    steps: [
      {
        id: "when",
        prompt: "When is Yule?",
        expects: [{ kind: "choose", option: "solstice" }],
        options: [
          { id: "equinox", label: "When day and night are equal" },
          { id: "solstice", label: "The longest night of the year" },
          { id: "harvest", label: "The first harvest" },
        ],
        order: "in-order",
        hint: "It is the darkest point, the turn towards light.",
        why: "Yule falls at the winter solstice, around 21 December in the northern hemisphere and 21 June in the southern.",
      },
      {
        id: "green",
        prompt: "Bring in the evergreen and set out the oranges studded with cloves.",
        expects: [
          { kind: "place", item: "pine", spot: "west" },
          { kind: "place", item: "oranges", spot: "east" },
        ],
        order: "any-order",
        hint: "The pine goes west, the bowl of oranges east.",
        why: "Evergreens stay green through the dark, a promise that life goes on; clove oranges are a fragrant midwinter charm. Holly and mistletoe berries are poisonous: keep them away from children and pets.",
      },
      {
        id: "dark",
        prompt: "Sit with the dark for a moment: breathe slowly three times.",
        expects: [{ kind: "breathe", breaths: 3 }],
        order: "in-order",
        hint: "Hold while the light grows, let go while it fades.",
        why: "Honouring the long night before lighting the candle is part of the ritual: rest and darkness have their place.",
      },
      {
        id: "light",
        prompt: "Light the sun candle to welcome the light back.",
        expects: [{ kind: "light", item: "sun-candle" }],
        order: "in-order",
        hint: "Tap the gold candle in the centre.",
        why: "A candle lit on the longest night stands for the sun being reborn; the Yule log is an older, larger form of the same idea.",
      },
      {
        id: "carry",
        prompt:
          "Think of one thing you want to carry into the lighter half of the year. Tap when you have it.",
        expects: [{ kind: "continue" }],
        order: "in-order",
        hint: "Tap when you have it.",
        why: "Many treat Yule as a time to plant hopes for the coming year, as the days lengthen.",
      },
      {
        id: "snuff",
        prompt: "Snuff the candle. You can relight it on each of the Yule nights.",
        expects: [{ kind: "snuff", item: "sun-candle" }],
        order: "in-order",
        hint: "Tap the lit candle to snuff it.",
        why: "Never leave a candle burning alone. Many witches relight the Yule candle each night until the twelfth, or let it burn while they sit with it.",
      },
    ],
  },
  topics: ["sabbat", "candle"],
  safety: { fire: CANDLE_SAFETY },
  review: { status: "draft" },
  altar: {
    spots: [
      { id: "centre", label: "Centre", x: 0.5, y: 0.5 },
      { id: "west", label: "West", x: 0.18, y: 0.5 },
      { id: "east", label: "East", x: 0.82, y: 0.5 },
    ],
    tools: [
      { id: "pine", label: "Pine sprig", icon: "sprig" },
      { id: "oranges", label: "Clove oranges", icon: "bowl" },
      { id: "bell", label: "Bell", icon: "bell" },
    ],
    candles: [{ id: "sun-candle", spot: "centre", color: "#f2c94c" }],
  },
};
