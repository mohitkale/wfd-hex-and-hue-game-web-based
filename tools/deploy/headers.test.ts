import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { headersFor, parseNetlifyHeaders, parseNginxAddHeaders } from "./headers";

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
const netlify = parseNetlifyHeaders(read("apps/web/public/_headers"));
const nginxSecurity = parseNginxAddHeaders(read("deploy/nginx/security-headers.conf"));
const nginxSite = read("deploy/nginx/default.conf");

describe("deploy headers", () => {
  it("Netlify and nginx send the same security headers", () => {
    const security = headersFor(netlify, "/play/");
    delete security["Cache-Control"];
    expect(nginxSecurity).toEqual(security);
  });

  it("hashed bundles are immutable; the worker and manifest always revalidate (both hosts)", () => {
    expect(headersFor(netlify, "/_astro/play.abc.js")["Cache-Control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(headersFor(netlify, "/sw.js")["Cache-Control"]).toBe("no-cache");
    expect(headersFor(netlify, "/manifest.webmanifest")["Cache-Control"]).toBe("no-cache");
    expect(nginxSite).toMatch(/location \/_astro\/ \{[^}]*max-age=31536000, immutable/);
    expect(nginxSite).toMatch(/location = \/sw\.js \{[^}]*no-cache/);
  });

  it("the CSP allows what the game needs and nothing broad", () => {
    const csp = headersFor(netlify, "/")["Content-Security-Policy"]!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("worker-src 'self' blob:"); // hint worker
    expect(csp).toContain("connect-src 'self' https://*.posthog.com"); // analytics (opt-in)
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/\s\*[;\s]/);
  });

  it("parses rules and matches paths", () => {
    const rules = parseNetlifyHeaders("/*\n  A: 1\n/x/*\n  B: 2\n");
    expect(headersFor(rules, "/x/y")).toEqual({ A: "1", B: "2" });
    expect(headersFor(rules, "/z")).toEqual({ A: "1" });
  });
});
