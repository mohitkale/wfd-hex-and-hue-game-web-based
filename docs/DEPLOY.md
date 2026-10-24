# Deploying Hex & Hue

The site is fully static: `npm run build` writes `apps/web/dist` (the landing page, Spellbook,
blog, the game at `/play/`, images, the offline service worker). Host it anywhere that serves
files; two ready setups follow.

## Settings

All are read **at build time** and baked into the static files.

| Variable              | Default                             | What it does                                                                                                                                                                                                            |
| --------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`            | Netlify's `URL`, else a placeholder | The public address, e.g. `https://play.example.com`. Used for canonical links, share cards, the sitemap and robots.txt. **Set it** on any host other than Netlify; the build warns if it falls back to the placeholder. |
| `PUBLIC_REWARDS`      | `none`                              | Rewarded ads: `none` (off; the game simply never offers them) or `mock` (a fake ad, for testing only). Real networks plug in behind the same interface.                                                                 |
| `PUBLIC_POSTHOG_KEY`  | empty                               | Optional anonymous analytics (PostHog project key). Empty = no analytics code path at all. With a key, nothing is sent until a player agrees in the consent banner or Settings.                                         |
| `PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com`          | PostHog region or your own proxy. If it is not under `*.posthog.com`, add it to `connect-src` in the CSP (both header files below).                                                                                     |

## Netlify

1. In Netlify, **Add new site → Import an existing project** and pick this repository.
2. Build settings come from `netlify.toml` (`npm run build && npm run budget`, publish
   `apps/web/dist`, Node 24). Netlify sets `URL` to the site's primary domain, so links follow your
   custom domain once it is set as primary.
3. Optional: add `PUBLIC_POSTHOG_KEY` (and `PUBLIC_POSTHOG_HOST`) under **Site configuration →
   Environment variables**, then redeploy.

Caching and security headers come from `apps/web/public/_headers`.

## VPS (Docker + nginx)

```bash
echo 'SITE_URL=https://play.example.com' > .env   # read by docker compose
docker compose up -d --build
```

This builds the site inside the image and serves it with nginx (unprivileged, port 8080) on
`127.0.0.1:8080`. Put a TLS-terminating proxy in front, for example Caddy running on the host
(in a container, point it at the `web` service on the Compose network instead of 127.0.0.1):

```
play.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

Without Compose: `docker build --build-arg SITE_URL=https://play.example.com -t hexhue .` then
`docker run -p 8080:8080 hexhue`. To redeploy after a `git pull`, run `docker compose up -d --build`
again.

nginx config: `deploy/nginx/default.conf` (routing, gzip, caching) and
`deploy/nginx/security-headers.conf` (CSP and friends). CI builds the image and smoke-tests it.

## Caching (both hosts)

| Path                                     | Cache                           | Why                                                         |
| ---------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| `/_astro/*`                              | 1 year, `immutable`             | Content-hashed bundles: a new build gets new file names.    |
| `/sw.js`, `/manifest.webmanifest`, pages | `no-cache` (always revalidated) | New versions reach players; the game then offers a refresh. |

## Security headers

A strict Content-Security-Policy (same-origin scripts only, no inline scripts: `npm run budget`
fails the build if one appears; the idle-hint worker is a same-origin file; PostHog for opt-in
analytics), `nosniff`, a referrer policy and a
permissions policy that turns off camera, microphone, location and payments. The two header files
must stay identical; `tools/deploy/headers.test.ts` fails CI if they drift.

When an ad network or another analytics host is added, extend the CSP in **both**
`apps/web/public/_headers` and `deploy/nginx/security-headers.conf`. To let game portals embed the
game in an iframe, change `frame-ancestors 'self'` to list them.

## Checklist before going live

- [ ] `SITE_URL` (or Netlify's primary domain) is the real address: open `/sitemap.xml` to check.
- [ ] HTTPS works (service workers and installs need it); on a VPS, enable HSTS at the TLS proxy.
- [ ] `/play/` loads, plays offline after one visit, and shows "A new version is ready" after the
      next deploy.
- [ ] Optional analytics: the consent banner appears once, and events reach PostHog after "Allow".

## The v2.0.0 switch and rolling back

v2 is the default engine in the release candidate (`packages/game/src/collect/engineFlag.ts`); there is
nothing new to configure. The v2 board is a hashed chunk in `_astro/`, precached by the service worker
like the rest of the shell (the earlier unhashed `v2/` path, its cache headers and nginx location were
removed).

To roll back without a code change, build with `PUBLIC_ENGINE=v1` (set it in the Netlify or Docker
build environment): `/play/` then runs the v1 game and never requests the v2 chunk. Players can also
use `/play/?engine=v1`. Saves are untouched either way (docs/V2_MIGRATION.md). Do not tag or deploy the
release without the owner's explicit approval (roadmap G4).
