import { CONSENT_EVENT, readConsent, writeConsent } from "@hexhue/game/analytics";

/**
 * Asks once whether anonymous play stats may be collected (only when analytics are configured,
 * and never when the browser sends a privacy signal: that already counts as "no"). Small and
 * dismissible: on the game page it sits at the top, clear of the thumb-zone controls.
 */
export function setupConsentBanner(): void {
  if (!import.meta.env.PUBLIC_POSTHOG_KEY || readConsent() !== "unknown") return;
  // In the game: a compact strip between Back and 2× (both stay reachable), clear of the board's
  // tap zones at the bottom. On content pages: a fuller banner at the bottom.
  const inGame = "offline" in document.body.dataset;
  const banner = document.createElement("div");
  banner.className = "hh-consent";
  banner.dataset.position = inGame ? "top" : "bottom";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Anonymous play stats");
  const text = document.createElement("p");
  const link = document.createElement("a");
  link.href = "/privacy/";
  if (inGame) {
    link.textContent = "play stats";
    text.append("Share anonymous ", link, "?");
  } else {
    link.textContent = "Privacy";
    text.append(
      "May we count anonymous play stats (levels played and won) to improve the game? ",
      link,
    );
  }
  const actions = document.createElement("div");
  const choose = (granted: boolean) => () => {
    writeConsent(granted ? "granted" : "denied");
    banner.remove();
  };
  const allow = document.createElement("button");
  allow.type = "button";
  allow.className = "primary";
  allow.textContent = inGame ? "Yes" : "Allow";
  allow.addEventListener("click", choose(true));
  const deny = document.createElement("button");
  deny.type = "button";
  deny.textContent = inGame ? "No" : "No thanks";
  deny.addEventListener("click", choose(false));
  actions.append(allow, deny);
  banner.append(text, actions);
  document.body.append(banner);
  // Answered elsewhere on this page (the game's settings): no need to ask any more.
  window.addEventListener(CONSENT_EVENT, () => banner.remove(), { once: true });
}
