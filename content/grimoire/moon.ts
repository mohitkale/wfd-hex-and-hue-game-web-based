import type { GrimoireEntry, Phase, Step } from "@hexhue/learn";
import { CENTRE } from "./altars";

/**
 * F3, demo 1 (M18.2): one short quest for each phase of the moon, offered by the moon tracker on
 * the nights it fits. Flame-free, a couple of minutes each.
 */
function quest(id: string, title: string, intro: string, steps: Step[]): GrimoireEntry {
  return {
    lesson: { id, title, branch: "moon", minutes: 2, intro, steps },
    topics: ["moon"],
    safety: {},
    review: { status: "draft" },
    altar: { spots: [CENTRE], tools: [] },
  };
}

const breathe = (n: number, why: string): Step => ({
  id: "breathe",
  prompt: `Breathe with the moon: in as the light grows, out as it fades, ${n} times.`,
  expects: [{ kind: "breathe", breaths: n }],
  order: "in-order",
  hint: "Hold while the light grows, let go while it fades.",
  why,
});

const task = (prompt: string, why: string): Step => ({
  id: "task",
  prompt: `${prompt} Tap when you have.`,
  expects: [{ kind: "continue" }],
  order: "in-order",
  hint: "Tap when you are done.",
  why,
});

export const MOON_QUESTS: Record<Phase, GrimoireEntry> = {
  new: quest(
    "moon-new",
    "New moon: plant an intention",
    "The moon is dark and starting over. A good night to begin something.",
    [
      {
        id: "suits",
        prompt: "What do many witches save for the new moon?",
        expects: [{ kind: "choose", option: "begin" }],
        options: [
          { id: "release", label: "Letting go of something" },
          { id: "begin", label: "Starting something new" },
          { id: "harvest", label: "Celebrating what is done" },
        ],
        order: "in-order",
        hint: "The light is about to start growing again.",
        why: "As the moon's light grows from nothing, so can a new plan: the new moon is the classic time to set intentions.",
      },
      breathe(3, "A few slow breaths make room to choose one intention, not ten."),
      task(
        "Write one intention on a slip of paper, as if it is already true, and keep it until the full moon.",
        "Writing it down makes it concrete; reading it again at the full moon shows how it grew.",
      ),
    ],
  ),
  "waxing-crescent": quest(
    "moon-waxing-crescent",
    "Waxing crescent: a first step",
    "A thin bright edge is growing night by night.",
    [
      {
        id: "waxing",
        prompt: "When the moon is waxing, its light is…",
        expects: [{ kind: "choose", option: "growing" }],
        options: [
          { id: "growing", label: "Growing" },
          { id: "shrinking", label: "Shrinking" },
        ],
        order: "in-order",
        hint: "Wax is something that builds up.",
        why: "Waxing means growing, from new to full; waning means shrinking, from full back to new.",
      },
      task(
        "Do one small, real thing towards your new-moon intention today.",
        "Growing-moon work favours action: magic is said to work best alongside a practical step.",
      ),
    ],
  ),
  "first-quarter": quest(
    "moon-first-quarter",
    "First quarter: past the first hurdle",
    "Half the moon is lit, and plans meet their first resistance.",
    [
      {
        id: "half",
        prompt: "At first quarter, how much of the moon do you see lit?",
        expects: [{ kind: "choose", option: "half" }],
        options: [
          { id: "sliver", label: "A thin sliver" },
          { id: "half", label: "Half" },
          { id: "all", label: "All of it" },
        ],
        order: "in-order",
        hint: "It is a quarter of the way through its cycle.",
        why: "The quarters are named for the cycle, not the shape: a quarter of the way round, the moon shows half its face lit.",
      },
      task(
        "Name one thing in the way of your intention, and one way round it.",
        "Many treat the first quarter as a time for decisions and effort when the first excitement fades.",
      ),
    ],
  ),
  "waxing-gibbous": quest(
    "moon-waxing-gibbous",
    "Waxing gibbous: refine",
    "Nearly full, the moon bulges with light.",
    [
      {
        id: "gibbous",
        prompt: "A gibbous moon is…",
        expects: [{ kind: "choose", option: "more" }],
        options: [
          { id: "less", label: "Less than half lit" },
          { id: "more", label: "More than half lit" },
        ],
        order: "in-order",
        hint: "Gibbous comes from an old word for humped.",
        why: "Gibbous means more than half lit but not yet full, waxing before the full moon and waning after it.",
      },
      task(
        "Read your intention again and change one word so it fits you better.",
        "Before the peak is a time to adjust and polish, many witches say.",
      ),
    ],
  ),
  full: quest(
    "moon-full",
    "Full moon: gratitude and moon water",
    "The moon is at her brightest. A night for thanks, and for charging.",
    [
      {
        id: "charge",
        prompt: "What do many witches leave out under a full moon?",
        expects: [{ kind: "choose", option: "water" }],
        options: [
          { id: "water", label: "A jar of water and their stones" },
          { id: "seeds", label: "Seeds to plant" },
          { id: "salt", label: "A trail of salt" },
        ],
        order: "in-order",
        hint: "Something that can soak up the moonlight.",
        why: "Moon water is water left in moonlight overnight, then used to water plants or rinse the altar. Use a lid, and leave out stones that dissolve or flake, such as selenite.",
      },
      breathe(5, "Sitting with the full moon's light is a simple, old form of gratitude."),
      task(
        "Name three things you are thankful for this month.",
        "The full moon is the peak of the cycle: a time to notice what has grown.",
      ),
    ],
  ),
  "waning-gibbous": quest(
    "moon-waning-gibbous",
    "Waning gibbous: share",
    "The light begins to shrink. Time to pass on what you have.",
    [
      task(
        "Share something you learned or made this month with someone else.",
        "Many treat the waning gibbous as the time to give thanks outwardly and share the harvest.",
      ),
    ],
  ),
  "last-quarter": quest(
    "moon-last-quarter",
    "Last quarter: let go",
    "Half lit again, the other half, and shrinking.",
    [
      {
        id: "suits",
        prompt: "What suits the waning moon?",
        expects: [{ kind: "choose", option: "release" }],
        options: [
          { id: "begin", label: "Starting something new" },
          { id: "release", label: "Letting go of something" },
        ],
        order: "in-order",
        hint: "Its light is getting less.",
        why: "As the light shrinks, waning-moon work is about removing: habits, clutter, worries.",
      },
      task(
        "Write down one habit you want to release, then tear the paper up and throw it away.",
        "Tearing works as well as burning, with no flame needed.",
      ),
    ],
  ),
  "waning-crescent": quest(
    "moon-waning-crescent",
    "Waning crescent: rest",
    "The last thin sliver before the dark. The cycle's quiet end.",
    [
      breathe(
        5,
        "Rest is part of the cycle: the balsamic moon, as some call it, is for recovering.",
      ),
      task(
        "Go to bed a little earlier tonight, or take ten quiet minutes.",
        "Not every moon phase asks for work; this one asks you to recharge before the next new moon.",
      ),
    ],
  ),
};
