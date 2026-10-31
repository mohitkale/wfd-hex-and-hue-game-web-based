/**
 * Correspondence Cards (F2): decks of collectible cards learned through short match games. A card
 * is earned the first time the learner matches it, never bought. What was learned comes back for
 * review on a gentle Leitner schedule: a right answer moves a card up a box and further into the
 * future, a wrong one moves it down one box, and an earned card is never taken away
 * (docs/V3_PLAN.md, "No guilt mechanics").
 *
 * Days are local calendar dates (`YYYY-MM-DD`) and randomness comes from a seed, both passed in, so
 * this module stays deterministic.
 */
import { createRng } from "@hexhue/core/rng";
import { closedTermsIn, HERB_SAFETY, type HerbSafety, type Review } from "./grimoire";

export const ELEMENTS = ["air", "fire", "water", "earth"] as const;
export type Element = (typeof ELEMENTS)[number];

export interface Card {
  readonly id: string;
  readonly name: string;
  /** Words a match question can ask about ("calm", "protection"); at least two. */
  readonly uses: readonly string[];
  /** The element it is most often given, when there is a common one. */
  readonly element?: Element;
  /** A line about it, shown on the card. */
  readonly lore: string;
  /** Card colour (`#rrggbb`), for the pixel picture on the card. */
  readonly color: string;
  /** Herb cards: how it may be used. */
  readonly safety?: HerbSafety;
  /** Anything to know before handling it (a stone that dissolves in water, a skin irritant). */
  readonly caution?: string;
}

export interface Deck {
  readonly id: string;
  readonly name: string;
  readonly intro: string;
  /** "herbs" decks need a safety badge on every card. */
  readonly kind: "crystals" | "herbs";
  readonly cards: readonly Card[];
  readonly review: Review;
}

/** One match question: a prompt, three answers (one right) and what the answer teaches. */
export interface Question {
  readonly card: string;
  readonly prompt: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly answer: string;
  readonly teach: string;
}

/**
 * A question about `card`: which card is used for one of its uses, or which element it is given.
 * Wrong answers are cards that do not share that use (or element), so every question has exactly
 * one right answer. Null when the deck cannot make one.
 */
export function questionFor(deck: Deck, cardId: string, seed: number): Question | null {
  const rng = createRng(seed);
  const card = deck.cards.find((c) => c.id === cardId);
  if (!card) return null;
  const others = (keep: (c: Card) => boolean) => rng.shuffle(deck.cards.filter(keep)).slice(0, 2);

  const byElement = card.element !== undefined && rng.next() < 0.3;
  if (byElement && card.element) {
    const wrong = rng.shuffle(ELEMENTS.filter((e) => e !== card.element)).slice(0, 2);
    const options = rng.shuffle([card.element, ...wrong]).map((e) => ({ id: e, label: cap(e) }));
    return {
      card: card.id,
      prompt: `Which element is ${card.name} most often given?`,
      options,
      answer: card.element,
      teach: `${card.name} is usually linked with ${card.element}. ${card.lore}`,
    };
  }
  const use = card.uses[rng.int(0, card.uses.length - 1)] as string;
  const wrong = others((c) => c.id !== card.id && !c.uses.includes(use));
  if (wrong.length < 2) return null;
  const options = rng.shuffle([card, ...wrong]).map((c) => ({ id: c.id, label: c.name }));
  return {
    card: card.id,
    prompt: `Which ${deck.kind === "herbs" ? "herb" : "stone"} do many witches use ${forUse(use)}?`,
    options,
    answer: card.id,
    teach: `${card.name}: ${card.uses.join(", ")}. ${card.lore}`,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "calm" → "for calm"; a use already shaped as a phrase ("in dream work") is kept. */
const forUse = (use: string) => (/^(in|at|on|when|to) /.test(use) ? use : `for ${use}`);

// --- what a learner knows: earned cards and review boxes ---------------------------------------

/** Days until a card in box 1…5 comes back. */
export const BOX_DAYS = [0, 1, 3, 7, 14] as const;

export interface CardProgress {
  /** Leitner box, 1…5. */
  readonly box: number;
  /** The day it is next due (`YYYY-MM-DD`). */
  readonly due: string;
  /** The day it was earned. */
  readonly earned: string;
}

export type DeckProgress = Readonly<Record<string, CardProgress>>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` plus `n` days. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Records an answer about `card` on `day`. A right answer earns it (once) and moves it up. */
export function answerCard(
  progress: DeckProgress,
  card: string,
  right: boolean,
  day: string,
): DeckProgress {
  if (!DAY.test(day)) return progress;
  const was = progress[card];
  if (!was) {
    if (!right) return progress; // nothing to lose, and nothing earned yet
    return { ...progress, [card]: { box: 2, due: addDays(day, BOX_DAYS[1]), earned: day } };
  }
  const box = Math.max(1, Math.min(5, was.box + (right ? 1 : -1)));
  return { ...progress, [card]: { ...was, box, due: addDays(day, BOX_DAYS[box - 1]!) } };
}

/**
 * The cards for a practice round of up to `size`: due earned cards first (the longest overdue
 * first), then cards not yet earned, in deck order. Never empty while the deck has cards.
 */
export function practiceRound(deck: Deck, progress: DeckProgress, day: string, size = 6): string[] {
  const due = deck.cards
    .filter((c) => progress[c.id] && (progress[c.id] as CardProgress).due <= day)
    .sort((a, b) => (progress[a.id]!.due < progress[b.id]!.due ? -1 : 1))
    .map((c) => c.id);
  const fresh = deck.cards.filter((c) => !progress[c.id]).map((c) => c.id);
  const round = [...due, ...fresh].slice(0, size);
  if (round.length > 0) return round;
  // Everything earned and nothing due: a short round of the soonest due, for anyone keen.
  return [...deck.cards]
    .sort((a, b) => (progress[a.id]!.due < progress[b.id]!.due ? -1 : 1))
    .slice(0, Math.min(size, 3))
    .map((c) => c.id);
}

export const earnedCount = (deck: Deck, progress: DeckProgress) =>
  deck.cards.filter((c) => progress[c.id]).length;

/** Reads stored progress, dropping anything broken or for cards the deck no longer has. */
export function parseDeckProgress(raw: unknown, deck: Deck): DeckProgress {
  const out: Record<string, CardProgress> = {};
  if (typeof raw !== "object" || raw === null) return out;
  const ids = new Set(deck.cards.map((c) => c.id));
  for (const [id, p] of Object.entries(raw)) {
    if (!ids.has(id) || typeof p !== "object" || p === null) continue;
    const { box, due, earned } = p as Record<string, unknown>;
    if (
      Number.isInteger(box) &&
      (box as number) >= 1 &&
      (box as number) <= 5 &&
      typeof due === "string" &&
      DAY.test(due) &&
      typeof earned === "string" &&
      DAY.test(earned)
    ) {
      out[id] = { box: box as number, due, earned };
    }
  }
  return out;
}

/** Content problems in a deck; empty when it may ship. */
export function checkDeck(deck: Deck): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  if (deck.cards.length < 3) problems.push("a deck needs at least three cards");
  for (const c of deck.cards) {
    const at = `card "${c.id}"`;
    if (ids.has(c.id)) problems.push(`duplicate card id "${c.id}"`);
    ids.add(c.id);
    if (!c.name.trim() || !c.lore.trim()) problems.push(`${at} needs a name and lore`);
    if (c.uses.length < 2) problems.push(`${at} needs at least two uses`);
    if (!/^#[0-9a-f]{6}$/i.test(c.color)) problems.push(`${at} has a bad colour`);
    if (deck.kind === "herbs") {
      if (!c.safety || !HERB_SAFETY.includes(c.safety)) problems.push(`${at} has no safety badge`);
      if (c.safety === "do-not-use") problems.push(`${at} is toxic: it cannot be a match answer`);
    }
    // Every use must leave two other cards to be wrong answers, or no question can be asked.
    for (const use of c.uses) {
      const wrong = deck.cards.filter((o) => o.id !== c.id && !o.uses.includes(use)).length;
      if (wrong < 2) problems.push(`${at}: too many cards share "${use}" to ask about it`);
    }
    const text = [c.name, c.lore, c.caution ?? "", ...c.uses].join("\n");
    for (const term of closedTermsIn(text)) {
      problems.push(`${at} mentions "${term}", a closed practice the Grimoire does not teach`);
    }
  }
  if (deck.review.status === "reviewed" && !deck.review.by.trim()) {
    problems.push("a reviewed deck must name its reviewer");
  }
  return problems;
}
