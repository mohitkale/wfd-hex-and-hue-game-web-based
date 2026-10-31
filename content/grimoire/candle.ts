import type { GrimoireEntry } from "@hexhue/learn";
import { CANDLE_SAFETY } from "./altars";

/** F1, demo 2 (M17.3): a simple candle spell for calm. */
export const candleIntention: GrimoireEntry = {
  lesson: {
    id: "candle-intention",
    title: "A candle intention spell",
    branch: "elements",
    minutes: 5,
    intro:
      "One of the simplest spells there is: a candle, a colour and a clear intention. Rehearse a spell for calm and restful sleep, safely from start to finish.",
    steps: [
      {
        id: "colour",
        prompt:
          "Your intention is calm and restful sleep. Which candle colour do many witches choose for it?",
        expects: [{ kind: "choose", option: "blue" }],
        options: [
          { id: "red", label: "Red" },
          { id: "blue", label: "Blue" },
          { id: "orange", label: "Orange" },
        ],
        order: "in-order",
        hint: "Think of a still lake or the evening sky.",
        why: "Colour meanings vary between traditions; blue for peace and calm is a common one. A plain white candle can stand in for any colour.",
      },
      {
        id: "holder",
        prompt: "Stand the blue candle in its holder.",
        expects: [{ kind: "place", item: "blue-candle", spot: "holder" }],
        order: "in-order",
        hint: "The blue one goes in the holder on the plate.",
        why: "A sturdy holder on a heat-proof plate is the first part of every candle spell: it keeps the flame upright and catches drips.",
      },
      {
        id: "dress",
        prompt:
          "Dress the candle with a drop of oil: stroke from the middle up towards the wick, then from the middle down to the base.",
        expects: [
          { kind: "trace", shape: "dress-up" },
          { kind: "trace", shape: "dress-down" },
        ],
        order: "in-order",
        hint: "Start in the middle of the candle: first a stroke up, then a stroke down.",
        why: "Dressing is a way of handling the candle with your intention in mind. A thin film of kitchen oil is enough; keep it off the wick so the flame stays small.",
      },
      {
        id: "herb",
        prompt: "Lay a sprig of rosemary on the plate beside the holder.",
        expects: [{ kind: "place", item: "rosemary", spot: "plate" }],
        order: "in-order",
        hint: "The sprig goes on the plate, not on the candle.",
        why: "Rosemary is a kitchen herb often used for protection and rest. Herbs stay on the plate around the base: dried herbs on a candle can catch fire.",
      },
      {
        id: "light",
        prompt: "Light the candle.",
        expects: [{ kind: "light", item: "blue-candle" }],
        order: "in-order",
        hint: "Tap the wick of the candle in the holder.",
        why: "Lighting the candle sets the spell going; many witches state their intention as the flame catches.",
      },
      {
        id: "focus",
        prompt: "Watch the flame and breathe with it five times, holding calm in mind.",
        expects: [{ kind: "breathe", breaths: 5 }],
        order: "in-order",
        hint: "Hold while the light grows, let go while it fades.",
        why: "Focus is the heart of the spell: the candle is a point to rest your attention on while you picture the calm you want.",
      },
      {
        id: "speak",
        prompt:
          "Say your intention, aloud or silently, as if it is already true: I am calm, I sleep deeply. Tap when you have said it.",
        expects: [{ kind: "continue" }],
        order: "in-order",
        hint: "Tap when you have said it.",
        why: "Words in the present tense describe the outcome as real now, which many witches find gives an intention its strength.",
      },
      {
        id: "snuff",
        prompt: "Snuff the candle with the snuffer.",
        expects: [{ kind: "snuff", item: "blue-candle" }],
        order: "in-order",
        hint: "Tap the lit candle to snuff it.",
        why: "Many witches snuff rather than blow out a spell candle; it is tidier too, with no spattered wax. You can relight it on other nights, never leaving it alone.",
      },
    ],
  },
  topics: ["candle", "herbs", "meditation"],
  safety: {
    fire: CANDLE_SAFETY,
    herbs: [{ item: "rosemary", name: "Rosemary", safety: "kitchen-safe" }],
    tools: ["blue-candle", "red-candle", "white-candle", "red", "blue", "orange"],
  },
  review: { status: "draft" },
  altar: {
    spots: [
      { id: "holder", label: "Candle holder", x: 0.5, y: 0.42 },
      { id: "plate", label: "Plate", x: 0.5, y: 0.78 },
    ],
    tools: [
      { id: "blue-candle", label: "Blue candle", icon: "candle", color: "#3d7be0" },
      { id: "red-candle", label: "Red candle", icon: "candle", color: "#e8463c" },
      { id: "white-candle", label: "White candle", icon: "candle", color: "#f4f1ea" },
      { id: "rosemary", label: "Rosemary", icon: "sprig" },
      { id: "bell", label: "Bell", icon: "bell" },
    ],
    traces: [
      { id: "dress-up", spot: "holder", direction: "up", label: "Oil, upward" },
      { id: "dress-down", spot: "holder", direction: "down", label: "Oil, downward" },
    ],
  },
};
