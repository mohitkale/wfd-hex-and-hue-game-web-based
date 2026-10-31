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
        why: "Colour meanings vary between traditions; blue for peace and calm is a common one. Many witches also use a plain white candle in place of any colour; this rehearsal asks for the blue.",
      },
      {
        id: "cloth",
        prompt: "Lay the blue candle on the dressing cloth.",
        expects: [{ kind: "place", item: "blue-candle", spot: "cloth" }],
        order: "in-order",
        hint: "The blue one goes on the cloth, ready to dress.",
        why: "A candle is dressed before it goes in its holder, on a cloth that catches any oil.",
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
        why: "Dressing is a way of handling the candle with your intention in mind. Directions differ: middle outwards is one common way, and many draw towards themselves to call something in or away to send it off. A thin film of kitchen oil is enough; keep it off the wick.",
      },
      {
        id: "holder",
        prompt: "Stand the dressed candle in its holder on the plate.",
        expects: [{ kind: "place", item: "blue-candle", spot: "holder" }],
        order: "in-order",
        hint: "Move the blue candle from the cloth into the holder.",
        why: "A sturdy holder on a heat-proof plate keeps the flame upright and catches drips.",
      },
      {
        id: "herb",
        prompt: "Lay a pinch of lavender on the plate beside the holder.",
        expects: [{ kind: "place", item: "lavender", spot: "plate" }],
        order: "in-order",
        hint: "The lavender goes on the plate, not on the candle.",
        why: "Lavender is a kitchen herb long linked with calm and sleep. Herbs stay on the plate around the base: dried herbs on a candle can catch fire.",
      },
      {
        id: "light",
        prompt: "Wipe the oil off your fingers, then light the candle.",
        expects: [{ kind: "light", item: "blue-candle" }],
        order: "in-order",
        hint: "Tap the wick of the candle in the holder.",
        why: "Oily fingers catch fire easily, so wipe them first. Lighting the candle sets the spell going; many witches state their intention as the flame catches.",
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
        prompt: "Snuff the candle: tap it to lower the snuffer.",
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
    herbs: [{ item: "lavender", name: "Lavender (culinary)", safety: "kitchen-safe" }],
    tools: ["blue-candle", "red-candle", "red", "blue", "orange"],
  },
  review: { status: "draft" },
  altar: {
    spots: [
      { id: "cloth", label: "Dressing cloth", x: 0.28, y: 0.4 },
      { id: "holder", label: "Candle holder", x: 0.68, y: 0.4 },
      { id: "plate", label: "Plate", x: 0.5, y: 0.78 },
    ],
    tools: [
      { id: "blue-candle", label: "Blue candle", icon: "candle", color: "#3d7be0" },
      { id: "red-candle", label: "Red candle", icon: "candle", color: "#e8463c" },
      { id: "lavender", label: "Lavender", icon: "sprig" },
      { id: "bell", label: "Bell", icon: "bell" },
    ],
    traces: [
      { id: "dress-up", spot: "cloth", direction: "up", label: "Oil, upward" },
      { id: "dress-down", spot: "cloth", direction: "down", label: "Oil, downward" },
    ],
  },
};
