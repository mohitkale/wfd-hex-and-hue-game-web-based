/**
 * Checks every lesson in content/grimoire against the Grimoire's content rules
 * (packages/learn/src/grimoire.ts): lesson structure, fire safety, herb safety badges, no closed
 * practices, a review record. Fails (exit 1) on any problem.
 *
 *   npm run grimoire:check
 */
import { checkLibrary, isReviewed } from "@hexhue/learn";
import { GRIMOIRE } from "../../content/grimoire";

const problems = checkLibrary(GRIMOIRE);
const reviewed = GRIMOIRE.filter(isReviewed).length;
for (const p of problems) console.error(`✗ ${p}`);
console.log(
  `${problems.length === 0 ? "✓" : "✗"} grimoire: ${GRIMOIRE.length} lesson(s), ${reviewed} reviewed, ${GRIMOIRE.length - reviewed} draft(s), ${problems.length} problem(s)`,
);
if (problems.length > 0) process.exit(1);
