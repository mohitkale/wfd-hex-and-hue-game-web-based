import { SPECIES, speciesFor, type Species } from "./familiarArt";
import type { KeyValueStore } from "./v2Spellbook";

/**
 * The familiar the player chose on the home screen (M15.13), kept in its own key. Local only; any bad
 * or missing value means "no choice" and the picture's own species is used. Never throws.
 */
export const FAMILIAR_KEY = "hexhue.v2.familiar";

export const isSpecies = (v: unknown): v is Species =>
  typeof v === "string" && (SPECIES as readonly string[]).includes(v);

export function readFamiliar(store: KeyValueStore | null): Species | null {
  try {
    const v = store?.getItem(FAMILIAR_KEY);
    return isSpecies(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveFamiliar(store: KeyValueStore | null, species: Species): void {
  try {
    store?.setItem(FAMILIAR_KEY, species);
  } catch {
    /* a choice that cannot be stored is still used for this visit */
  }
}

/** The familiar that plays a level: the player's choice, else the one its picture suggests. */
export const familiarFor = (chosen: Species | null, theme: string | undefined): Species =>
  chosen ?? speciesFor(theme);

/** The names shown under each choice. */
export const FAMILIAR_NAMES: Record<Species, string> = {
  bat: "Bat",
  cat: "Cat",
  ant: "Ant",
  owl: "Owl",
  frog: "Frog",
  spider: "Spider",
};
