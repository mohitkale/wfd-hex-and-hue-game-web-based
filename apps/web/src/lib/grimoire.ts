import {
  BRANCHES,
  isReviewed,
  visibleEntries,
  type Branch,
  type GrimoireEntry,
} from "@hexhue/learn";
import { GRIMOIRE } from "../../../../content/grimoire";

/** The Path's branches as the Grimoire shows them. */
export const BRANCH_INFO: Record<Branch, { name: string; blurb: string }> = {
  elements: { name: "Elements", blurb: "Air, fire, water, earth, and the circle that holds them." },
  moon: { name: "Moon", blurb: "Phases, signs and the work each one suits." },
  "herbs-stones": { name: "Herbs & Stones", blurb: "Correspondences you can hold, used safely." },
  divination: { name: "Divination", blurb: "Tarot and other ways of asking." },
  symbols: { name: "Symbols", blurb: "Sigils, runes and the shapes of intent." },
  sabbats: { name: "Sabbats", blurb: "The Wheel of the Year, festival by festival." },
};

export interface BranchGroup {
  branch: Branch;
  name: string;
  blurb: string;
  entries: GrimoireEntry[];
}

/** Lessons grouped by branch, in Path order; branches without lessons left out. */
export function lessonsByBranch(entries: readonly GrimoireEntry[] = GRIMOIRE): BranchGroup[] {
  return BRANCHES.map((branch) => ({
    branch,
    ...BRANCH_INFO[branch],
    entries: entries.filter((e) => e.lesson.branch === branch),
  })).filter((g) => g.entries.length > 0);
}

export const lessonUrl = (id: string) => `/grimoire/${id}/`;

/**
 * Whether this build includes drafts: `astro dev`, or a preview build (`GRIMOIRE_PREVIEW=1`, set
 * for Netlify deploy previews in netlify.toml). A production build has reviewed lessons only, so an
 * unreviewed lesson never reaches a player's page, share preview or offline cache.
 */
export function previewBuild(
  dev: boolean = import.meta.env.DEV,
  env: string | undefined = typeof process === "undefined"
    ? undefined
    : process.env.GRIMOIRE_PREVIEW,
): boolean {
  return dev || env === "1";
}

/** The lessons this build contains. */
export const builtLessons = (preview: boolean = previewBuild()): GrimoireEntry[] =>
  visibleEntries(GRIMOIRE, preview);

export { GRIMOIRE, isReviewed };
