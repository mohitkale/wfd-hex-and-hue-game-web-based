/**
 * Grimoire entries: a lesson plus what the Grimoire needs to ship it safely: its topics, its safety
 * notes and its review record. `checkEntry` holds the content rules that `npm run grimoire:check`
 * applies to everything in `content/grimoire/` (docs/V3_PLAN.md, "Principles for v3"):
 *
 * - the lesson is structurally sound (`checkLesson`);
 * - a lesson with a flame (a candle or fire topic, a light or snuff step, or a candle, incense or
 *   other flame item) carries fire safety;
 * - every herb has a safety badge: in a herbs or herbs-and-stones lesson every handled item is a
 *   listed herb or a listed tool, and a "do-not-use" herb is never handled or taught as an answer;
 * - no closed-practice topic appears anywhere in the text;
 * - a review record exists, and a reviewed lesson names its reviewer and date.
 *
 * Drafts are built only into development and preview builds (`GRIMOIRE_PREVIEW=1`, set for Netlify
 * deploy previews); a production build contains reviewed lessons only.
 */
import { checkAltar, type AltarLayout } from "./altar";
import { checkLesson, type Action, type Lesson } from "./lesson";

export const TOPICS = [
  "circle",
  "elements",
  "candle",
  "fire",
  "herbs",
  "crystals",
  "moon",
  "sabbat",
  "tarot",
  "sigil",
  "astrology",
  "meditation",
] as const;
export type Topic = (typeof TOPICS)[number];

/**
 * How a herb may be used. "kitchen-safe": safe to cook with in normal amounts; "external-only": not
 * for eating or drinking; "do-not-use": toxic, named only to warn.
 */
export const HERB_SAFETY = ["kitchen-safe", "external-only", "do-not-use"] as const;
export type HerbSafety = (typeof HERB_SAFETY)[number];

export interface Herb {
  /** The item id the lesson's steps use. */
  readonly item: string;
  readonly name: string;
  readonly safety: HerbSafety;
}

export type Review =
  | { readonly status: "draft" }
  | {
      readonly status: "reviewed";
      /** The practitioner who checked it (a real person; simulated or AI review never counts). */
      readonly by: string;
      /** ISO date, `YYYY-MM-DD`. */
      readonly date: string;
    };

export interface GrimoireEntry {
  readonly lesson: Lesson;
  readonly topics: readonly Topic[];
  readonly safety: {
    /** Fire safety, shown before the lesson starts; required for any lesson with a flame. */
    readonly fire?: string;
    readonly herbs?: readonly Herb[];
    /**
     * Items a herbs or herbs-and-stones lesson handles that are not herbs (a bowl, a crystal, a
     * cloth), so that in those lessons nothing unlisted, and so unbadged, is handled.
     */
    readonly tools?: readonly string[];
  };
  readonly review: Review;
  /** The altar the lesson is rehearsed on (F1); a lesson without one is read through only. */
  readonly altar?: AltarLayout;
}

/**
 * Closed or initiatory practices the Grimoire does not teach (docs/V3_PLAN.md). Matched as whole
 * words, ignoring case, accents, hyphens and underscores; a trailing `*` matches any ending (smudge,
 * smudged, smudging). White sage smudging is included: it is a closed Indigenous practice for many
 * nations, and the open alternatives (incense, sound, a broom) are taught instead.
 */
export const CLOSED_TERMS = [
  "hoodoo",
  "rootwork",
  "vodou",
  "vodun",
  "voodoo",
  "santeria",
  "lucumi",
  "palo mayombe",
  "quimbanda",
  "candomble",
  "obeah",
  "smudg*",
  "white sage",
  "orisha",
  "loa",
  "lwa",
] as const;

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-_]/g, " ");
}

/** Closed-practice words found in `text`, as written there (lower case, accents dropped). */
export function closedTermsIn(text: string): string[] {
  const t = plain(text);
  return CLOSED_TERMS.flatMap((term) => {
    const word = term.endsWith("*") ? `${term.slice(0, -1)}[a-z]*` : term;
    const found = new RegExp(`(?:^|[^a-z])(${word})(?:[^a-z]|$)`).exec(t);
    return found?.[1] ? [found[1]] : [];
  });
}

/** The names an action carries (items, spots, paths, shapes, options). */
function actionNames(a: Action): string[] {
  switch (a.kind) {
    case "place":
      return [a.item, a.spot];
    case "light":
    case "snuff":
      return [a.item];
    case "walk":
      return [a.path];
    case "trace":
      return [a.shape];
    case "choose":
      return [a.option];
    case "breathe":
    case "continue":
      return [];
  }
}

/** Every piece of text in the entry; ids too, since the altar can show them as labels. */
export function entryText(entry: GrimoireEntry): string {
  const l = entry.lesson;
  return [
    l.title,
    l.intro,
    ...l.steps.flatMap((s) => [s.prompt, s.hint, s.why, ...s.expects.flatMap(actionNames)]),
    entry.safety.fire ?? "",
    ...(entry.safety.herbs ?? []).flatMap((h) => [h.name, h.item]),
    ...(entry.safety.tools ?? []),
    ...l.steps.flatMap((s) => (s.options ?? []).map((o) => o.label)),
    ...(entry.altar?.tools ?? []).map((t) => t.label),
    ...(entry.altar?.spots ?? []).map((t) => t.label),
    ...(entry.altar?.traces ?? []).map((t) => t.label),
  ].join("\n");
}

/** Items the lesson handles or teaches as an answer: places, lights, snuffs and chosen options. */
function handledItems(lesson: Lesson): Set<string> {
  const items = new Set<string>();
  for (const s of lesson.steps) {
    for (const a of s.expects) {
      if (a.kind === "place" || a.kind === "light" || a.kind === "snuff") items.add(a.item);
      if (a.kind === "choose") items.add(a.option);
    }
  }
  return items;
}

/** Item names that mean a flame or smoke, whatever the lesson's topics say. */
const FLAME_ITEM = /candle|incense|charcoal|flame|match|lighter|taper|torch|bonfire/;

export function hasFlame(entry: GrimoireEntry): boolean {
  return (
    entry.topics.includes("candle") ||
    entry.topics.includes("fire") ||
    entry.lesson.steps.some((s) =>
      s.expects.some((a) => a.kind === "light" || a.kind === "snuff"),
    ) ||
    [...handledItems(entry.lesson)].some((item) => FLAME_ITEM.test(plain(item)))
  );
}

/** Content-rule problems for one entry (lesson structure included); empty when it may ship. */
export function checkEntry(entry: GrimoireEntry): string[] {
  const problems = checkLesson(entry.lesson);
  if (entry.altar) problems.push(...checkAltar(entry.lesson, entry.altar));
  for (const t of entry.topics) {
    if (!TOPICS.includes(t)) problems.push(`unknown topic "${t}"`);
  }
  if (entry.topics.length === 0) problems.push("entry has no topics");

  if (hasFlame(entry) && !entry.safety.fire?.trim()) {
    problems.push("a lesson with a flame needs fire safety");
  }

  const herbs = entry.safety.herbs ?? [];
  if (entry.topics.includes("herbs") && herbs.length === 0) {
    problems.push('a "herbs" lesson must list its herbs with safety badges');
  }
  const handled = handledItems(entry.lesson);
  if (entry.topics.includes("herbs") || entry.lesson.branch === "herbs-stones") {
    const known = new Set([...herbs.map((h) => h.item), ...(entry.safety.tools ?? [])]);
    for (const item of handled) {
      if (!known.has(item)) {
        problems.push(`"${item}" is neither a listed herb (with a safety badge) nor a listed tool`);
      }
    }
  }
  for (const h of herbs) {
    if (!HERB_SAFETY.includes(h.safety)) problems.push(`herb "${h.item}" has no safety badge`);
    if (!h.name.trim()) problems.push(`herb "${h.item}" has no name`);
    if (h.safety === "do-not-use" && handled.has(h.item)) {
      problems.push(`herb "${h.item}" is marked do-not-use but a step handles it`);
    }
  }

  for (const term of closedTermsIn(entryText(entry))) {
    problems.push(`mentions "${term}", a closed practice the Grimoire does not teach`);
  }

  const r = entry.review;
  if (r.status === "reviewed") {
    if (!r.by.trim()) problems.push("a reviewed lesson must name its reviewer");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) problems.push("review date must be YYYY-MM-DD");
  } else if (r.status !== "draft") {
    problems.push("entry has no review record");
  }
  return problems;
}

/** Problems across a whole library, each prefixed with its lesson id; includes duplicate ids. */
export function checkLibrary(entries: readonly GrimoireEntry[]): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const e of entries) {
    const id = e.lesson.id;
    if (seen.has(id)) problems.push(`${id}: duplicate lesson id`);
    seen.add(id);
    for (const p of checkEntry(e)) problems.push(`${id}: ${p}`);
  }
  return problems;
}

export function isReviewed(entry: GrimoireEntry): boolean {
  return entry.review.status === "reviewed";
}

/** What a build contains: reviewed lessons, plus drafts in development and preview builds. */
export function visibleEntries(
  entries: readonly GrimoireEntry[],
  preview: boolean,
): GrimoireEntry[] {
  return entries.filter((e) => preview || isReviewed(e));
}
