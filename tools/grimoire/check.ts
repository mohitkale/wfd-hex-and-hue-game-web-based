/**
 * Checks every lesson in content/grimoire and every card deck in content/grimoire/decks against the
 * Grimoire's content rules (packages/learn: grimoire.ts, altar.ts, deck.ts): lesson structure and
 * altar, fire safety, herb safety badges, no closed practices, review records. Fails (exit 1) on any
 * problem.
 *
 *   npm run grimoire:check
 */
import { checkDeck, checkLibrary, isReviewed } from "@hexhue/learn";
import { GRIMOIRE } from "../../content/grimoire";
import { DECKS } from "../../content/grimoire/decks";

const problems = [
  ...checkLibrary(GRIMOIRE),
  ...DECKS.flatMap((d) => checkDeck(d).map((p) => `deck ${d.id}: ${p}`)),
];
const reviewed = GRIMOIRE.filter(isReviewed).length;
const cards = DECKS.reduce((n, d) => n + d.cards.length, 0);
for (const p of problems) console.error(`✗ ${p}`);
console.log(
  `${problems.length === 0 ? "✓" : "✗"} grimoire: ${GRIMOIRE.length} lesson(s) (${reviewed} reviewed), ${DECKS.length} deck(s) of ${cards} cards, ${problems.length} problem(s)`,
);
if (problems.length > 0) process.exit(1);
