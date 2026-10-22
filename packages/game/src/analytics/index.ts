import { NoneAnalytics } from "./providers";
import type { AnalyticsProvider, EventName, EventProps } from "./types";

export {
  CONSENT_EVENT,
  CONSENT_KEY,
  privacySignal,
  readConsent,
  writeConsent,
  type Consent,
} from "./consent";
export { NoneAnalytics, PostHogAnalytics, createAnalytics, type AnalyticsEnv } from "./providers";
export type { AnalyticsProvider, EventName, EventProps } from "./types";

const none = new NoneAnalytics();

/** The game's analytics provider (a no-op one if none was registered). */
export function getAnalytics(scene: {
  registry: { get(key: string): unknown };
}): AnalyticsProvider {
  return (scene.registry.get("analytics") as AnalyticsProvider | undefined) ?? none;
}

/** Records an event; never throws (analytics must not affect play). */
export function track<E extends EventName>(
  scene: { registry: { get(key: string): unknown } },
  event: E,
  props: EventProps[E],
): void {
  try {
    getAnalytics(scene).track(event, props);
  } catch {
    // ignore
  }
}
