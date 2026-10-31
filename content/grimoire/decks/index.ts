/** The Grimoire's card decks (F2; docs/V3_PLAN.md). Checked by `npm run grimoire:check`. */
import type { Deck } from "@hexhue/learn";
import { crystals } from "./crystals";
import { kitchenHerbs } from "./herbs";

export const DECKS: readonly Deck[] = [crystals, kitchenHerbs];
