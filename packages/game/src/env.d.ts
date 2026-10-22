interface ImportMetaEnv {
  /** "none" | "mock" — see apps/web/.env.example. */
  readonly PUBLIC_REWARDS?: string;
  /** PostHog project key; unset = no analytics. See apps/web/.env.example. */
  readonly PUBLIC_POSTHOG_KEY?: string;
  /** PostHog host, e.g. https://eu.i.posthog.com (the default). */
  readonly PUBLIC_POSTHOG_HOST?: string;
}
