import type { GrimoireEntry } from "@hexhue/learn";
import { QUARTERS } from "./altars";

/** A first, flame-free lesson: the four elements and where many witches place them. */
export const elementsWelcome: GrimoireEntry = {
  lesson: {
    id: "four-elements",
    title: "The four elements",
    branch: "elements",
    minutes: 3,
    intro:
      "Air, fire, water and earth turn up in almost every modern practice. Meet each one, and the direction many witches give it.",
    steps: [
      {
        id: "air",
        prompt: "Air is breath, thought and new beginnings. Which tool often stands for air?",
        expects: [{ kind: "choose", option: "feather" }],
        options: [
          { id: "feather", label: "A feather" },
          { id: "stone", label: "A stone" },
          { id: "chalice", label: "A cup" },
        ],
        order: "in-order",
        hint: "Think of something light that rides the wind.",
        why: "A feather (or incense smoke) is a common sign of air: it moves with the breeze, as thoughts and words move between people.",
      },
      {
        id: "fire",
        prompt: "Fire is will, courage and change. Which tool often stands for fire?",
        expects: [{ kind: "choose", option: "candle" }],
        options: [
          { id: "chalice", label: "A cup" },
          { id: "candle", label: "A candle" },
          { id: "stone", label: "A stone" },
        ],
        order: "in-order",
        hint: "Which one gives light and warmth?",
        why: "A candle holds fire safely on an altar. Many practices use a wand for fire too; others give the wand to air. Both are fine.",
      },
      {
        id: "water",
        prompt: "Water is feeling, dreams and healing. Which tool often stands for water?",
        expects: [{ kind: "choose", option: "chalice" }],
        options: [
          { id: "feather", label: "A feather" },
          { id: "stone", label: "A stone" },
          { id: "chalice", label: "A cup" },
        ],
        order: "in-order",
        hint: "Which one could you drink from?",
        why: "A cup or chalice holds water, and with it the idea of receiving and feeling.",
      },
      {
        id: "earth",
        prompt: "Earth is body, home and steadiness. Which tool often stands for earth?",
        expects: [{ kind: "choose", option: "stone" }],
        options: [
          { id: "stone", label: "A stone" },
          { id: "candle", label: "A candle" },
          { id: "feather", label: "A feather" },
        ],
        order: "in-order",
        hint: "Which one is heavy and still?",
        why: "A stone, a dish of salt or a pentacle stands for earth: solid things you can hold.",
      },
      {
        id: "directions",
        prompt: "Place each element in the direction many witches give it.",
        expects: [
          { kind: "place", item: "feather", spot: "east" },
          { kind: "place", item: "candle", spot: "south" },
          { kind: "place", item: "chalice", spot: "west" },
          { kind: "place", item: "stone", spot: "north" },
        ],
        order: "any-order",
        hint: "Air with the rising sun in the east, fire with the midday sun in the south.",
        why: "This is the common northern-hemisphere layout. Witches in the southern hemisphere often swap fire and earth, and many traditions have their own. Use the one that fits where you live.",
      },
      {
        id: "close",
        prompt: "You have met the four elements. Tap to finish.",
        expects: [{ kind: "continue" }],
        order: "in-order",
        hint: "Tap anywhere to finish.",
        why: "The circle, candle and moon lessons all build on these four.",
      },
    ],
  },
  topics: ["elements", "circle"],
  safety: {
    fire: "This lesson only places a candle, it does not light it. Whenever you do light one: use a sturdy holder on a heat-proof surface, keep it clear of hair, sleeves, paper and curtains, and never leave a flame alone.",
  },
  review: { status: "draft" },
  altar: {
    spots: QUARTERS,
    tools: [
      { id: "feather", label: "Feather", icon: "feather" },
      { id: "candle", label: "Candle", icon: "candle", color: "#e8463c" },
      { id: "chalice", label: "Cup", icon: "chalice" },
      { id: "stone", label: "Stone", icon: "stone" },
      { id: "bell", label: "Bell", icon: "bell" },
    ],
  },
};
