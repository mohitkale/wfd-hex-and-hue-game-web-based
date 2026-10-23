/**
 * Whether this page load asked for the v2 engine: `?engine=v2` in the URL, or a build made with
 * `PUBLIC_ENGINE=v2` (review builds). Kept free of imports so the shipped game's entry point can
 * check it without loading any v2 code (the v2 board is a separate, lazily loaded chunk).
 */
export function v2Requested(search: string, envEngine?: string): boolean {
  return new URLSearchParams(search).get("engine") === "v2" || envEngine === "v2";
}
