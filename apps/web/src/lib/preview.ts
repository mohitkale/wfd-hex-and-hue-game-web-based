/**
 * Drafts (lessons a practitioner has not reviewed yet) are in the page but hidden; `?preview=1`
 * shows them, for the owner and reviewers. `astro dev` shows them without the flag.
 */
export function setupPreview(): void {
  if (new URLSearchParams(window.location.search).get("preview") !== "1") return;
  for (const el of document.querySelectorAll("[data-grimoire]")) el.classList.add("preview");
  // Keep the flag on links inside the Grimoire, so a reviewer can walk through it.
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href^='/grimoire/']")) {
    a.href = `${a.pathname}?preview=1`;
  }
}
