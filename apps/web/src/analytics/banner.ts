import { CONSENT_EVENT, readConsent, writeConsent } from "@hexhue/game/analytics";

/**
 * Asks once whether anonymous play stats may be collected (only when analytics are configured,
 * and never when the browser sends a privacy signal: that already counts as "no"). Small and
 * dismissible: on the game page it sits at the top, clear of the thumb-zone controls.
 */
export function setupConsentBanner(): void {
  if (!import.meta.env.PUBLIC_POSTHOG_KEY || readConsent() !== "unknown") return;
  const banner = document.createElement("div");
  banner.className = "hh-consent";
  banner.dataset.position = "offline" in document.body.dataset ? "top" : "bottom";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Anonymous play stats");
  const text = document.createElement("p");
  text.append("May we count anonymous play stats (levels played and won) to improve the game? ");
  const link = document.createElement("a");
  link.href = "/privacy/";
  link.textContent = "Privacy";
  text.append(link);
  const actions = document.createElement("div");
  const choose = (granted: boolean) => () => {
    writeConsent(granted ? "granted" : "denied");
    banner.remove();
  };
  const allow = document.createElement("button");
  allow.type = "button";
  allow.className = "primary";
  allow.textContent = "Allow";
  allow.addEventListener("click", choose(true));
  const deny = document.createElement("button");
  deny.type = "button";
  deny.textContent = "No thanks";
  deny.addEventListener("click", choose(false));
  actions.append(allow, deny);
  banner.append(text, actions);
  document.body.append(banner);
  // Answered elsewhere (the game's settings, another tab): no need to ask here.
  window.addEventListener(CONSENT_EVENT, () => banner.remove(), { once: true });
}
