/**
 * Which engine this page load runs (v2.0.0: the collect engine is the default). The shipped v1 track
 * game stays in the bundle as the fallback: `?engine=v1` in the URL, or a build made with
 * `PUBLIC_ENGINE=v1`, runs it. Anything else (no flag, `?engine=v2`, a misspelling) is v2, so a link
 * can never strand a player on the old game by accident. Kept free of imports so the entry point can
 * check it without loading any v2 code (the v2 board is a separate, lazily loaded chunk).
 */
export function useV2(search: string, envEngine?: string): boolean {
  const asked = new URLSearchParams(search).get("engine");
  // An explicit choice in the URL wins over the build's default.
  if (asked === "v1") return false;
  if (asked === "v2") return true;
  return envEngine !== "v1";
}
