/**
 * The v2 levels under the quality gate (docs/V2_LEVEL_GATE.md, M12.6): each with its level number
 * on the difficulty curve. `npm run levels:check` (part of `verify` and CI) fails on a level the
 * solver cannot win, one that cheap play beats where its tier forbids it, and one outside its tier
 * band or the curve, **unless that exact deviation is recorded here with a reason**. A recorded
 * deviation that stops occurring also fails, so the list is exactly today's known debt and cannot
 * go stale. Solvability and the cheap-player rules can never be waived.
 */
export interface KnownIssue {
  /** The exact message the gate prints. */
  message: string;
  /** Why it is accepted for now, and what removes it. */
  reason: string;
}

export interface PoolLevel {
  /** The level's id (`slice-moonlit-hat`, `art-<piece id>`). */
  id: string;
  /** Its 1-based number on the curve. */
  level: number;
  knownIssues: readonly KnownIssue[];
}

/** World-level repetition deviations accepted for now (none). */
export const KNOWN_WORLD_ISSUES: readonly string[] = [];

const ONE_SOLUTION = "solutions 1 outside 2..∞ for tutorial";

/** A generated picture has one way to win: its groups never need to park, so no two lines differ. */
const generatedOneLine: KnownIssue = {
  message: ONE_SOLUTION,
  reason:
    "single-layer picture: every colour is open from the start, so there is one kind of winning line (V2_GENERATOR.md); layered pictures or hand design remove it",
};

export const POOL: readonly PoolLevel[] = [
  { id: "art-crescent-moon", level: 1, knownIssues: [generatedOneLine] },
  { id: "art-triple-moon", level: 2, knownIssues: [generatedOneLine] },
  { id: "art-witchs-cauldron", level: 3, knownIssues: [generatedOneLine] },
  {
    id: "slice-moonlit-hat",
    level: 16,
    knownIssues: [
      {
        message: "doomedFirstShare 0.6666666666666666 outside −∞..0.35 for medium",
        reason:
          "hand-designed review level with a harsher opening than the medium band allows (V2_MEASURES.md)",
      },
      {
        message: "freeStepShare 0.8571428571428571 outside −∞..0.5 for medium",
        reason:
          "its traps are all in the first moves; after the first decisions it is forgiving (V2_SLICE.md, honest limit)",
      },
      {
        message: "solutions 1 outside 2..∞ for medium",
        reason: "one kind of winning line (nothing differs in which groups park)",
      },
      {
        message: "winningShare 1 outside −∞..0.5 for medium",
        reason: "doomed branches die before depth 3, so the depth-3 share is weak (V2_MEASURES.md)",
      },
    ],
  },
];
