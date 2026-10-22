/** 3★ for a clean win, 2★ with one or two assists (undo, boosters), 1★ beyond that. */
export function starsFor(assists: number): number {
  return assists === 0 ? 3 : assists <= 2 ? 2 : 1;
}
