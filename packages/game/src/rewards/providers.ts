import type { AdResult, Placement, RewardsProvider } from "./types";

/** No ads at all (the default until an ad network is approved). Every offer simply isn't shown. */
export class NoneProvider implements RewardsProvider {
  readonly name = "none";
  isAvailable(_placement?: Placement): boolean {
    return false;
  }
  async show(_placement?: Placement): Promise<AdResult> {
    return "unavailable";
  }
}

/**
 * Development stand-in: a full-screen "sponsored" panel with a short countdown. Closing early is a
 * dismissal; waiting it out is a reward. Lets every ad path be played without a real network.
 */
export class MockProvider implements RewardsProvider {
  readonly name = "mock";
  constructor(
    private readonly seconds = 3,
    private readonly doc: Document | null = typeof document !== "undefined" ? document : null,
  ) {}

  isAvailable(_placement?: Placement): boolean {
    return this.doc !== null;
  }

  show(placement: Placement): Promise<AdResult> {
    const doc = this.doc;
    if (!doc) return Promise.resolve("unavailable");
    return new Promise((resolve) => {
      const panel = doc.createElement("div");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Sponsored message");
      panel.style.cssText =
        "position:fixed;inset:0;z-index:9999;display:grid;place-content:center;gap:16px;" +
        "background:rgba(10,6,24,.94);color:#f5efff;font:600 18px system-ui;text-align:center";
      const label = doc.createElement("div");
      const close = doc.createElement("button");
      close.textContent = "Close ✕";
      close.style.cssText =
        "justify-self:center;padding:10px 20px;border-radius:999px;border:1px solid #c9b8ff;" +
        "background:transparent;color:#f5efff;font:inherit;min-height:44px";
      panel.append(label, close);
      doc.body.append(panel);
      let left = this.seconds;
      const render = () => (label.textContent = `Mock ad for “${placement}” — reward in ${left}s`);
      render();
      const finish = (result: AdResult) => {
        clearInterval(timer);
        panel.remove();
        resolve(result);
      };
      const timer = setInterval(() => {
        left--;
        if (left <= 0) finish("rewarded");
        else render();
      }, 1000);
      close.addEventListener("click", () => finish("dismissed"));
    });
  }
}

/**
 * Picks the provider from `PUBLIC_REWARDS` ("mock" | "none"). Unset: the mock in development, none in
 * production, so a production build never shows fake ads.
 */
export function createRewards(env: {
  PUBLIC_REWARDS?: string | undefined;
  DEV?: boolean | undefined;
}): RewardsProvider {
  const choice = env.PUBLIC_REWARDS ?? (env.DEV ? "mock" : "none");
  return choice === "mock" ? new MockProvider() : new NoneProvider();
}

/** Wraps a provider so `show` always settles: a hang or throw becomes "unavailable". */
export function safeShow(
  provider: RewardsProvider,
  placement: Placement,
  timeoutMs = 90_000,
): Promise<AdResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("unavailable"), timeoutMs);
    provider.show(placement).then(
      (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      () => {
        clearTimeout(timer);
        resolve("unavailable");
      },
    );
  });
}
