import { parseDeckProgress, type Deck, type DeckProgress } from "@hexhue/learn";

/** Card progress for every deck, on this device only, beside the practice save. */
export const CARDS_KEY = "hexhue.v3.cards";

type Store = Pick<Storage, "getItem" | "setItem"> | null;

function all(store: Store): Record<string, unknown> {
  try {
    const raw = store?.getItem(CARDS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function loadDeckProgress(deck: Deck, store: Store): DeckProgress {
  return parseDeckProgress(all(store)[deck.id], deck);
}

export function storeDeckProgress(deck: Deck, progress: DeckProgress, store: Store): boolean {
  try {
    if (!store) return false;
    store.setItem(CARDS_KEY, JSON.stringify({ ...all(store), [deck.id]: progress }));
    return true;
  } catch {
    return false;
  }
}
