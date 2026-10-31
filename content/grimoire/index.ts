/**
 * The Grimoire's lessons (v3; docs/V3_PLAN.md). Each entry is checked by `npm run grimoire:check`
 * (packages/learn/src/grimoire.ts) and stays a draft, hidden from players, until a practitioner
 * has reviewed it.
 */
import type { GrimoireEntry } from "@hexhue/learn";
import { elementsWelcome } from "./elements";

export const GRIMOIRE: readonly GrimoireEntry[] = [elementsWelcome];
