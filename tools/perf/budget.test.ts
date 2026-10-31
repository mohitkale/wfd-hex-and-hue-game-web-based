import { describe, expect, it } from "vitest";
import {
  BUDGETS,
  checkBudgets,
  inlineScripts,
  scriptClosure,
  scriptLeaks,
  type BuiltFile,
} from "./budget";

const file = (path: string, gzip: number, bytes = gzip * 3): BuiltFile => ({ path, gzip, bytes });

describe("performance budget", () => {
  it("passes a build like today's", () => {
    const results = checkBudgets([
      file("index.html", 2_000),
      file("play/index.html", 1_700),
      file("_astro/play.abc.js", 392_000, 1_563_000),
      file("sw.js", 900),
      file("icons/icon-512.png", 700, 4_100),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results).toHaveLength(BUDGETS.length);
  });

  it("flags the play bundle growing past its gzip budget", () => {
    const [js] = checkBudgets([
      file("_astro/play.abc.js", 400_000),
      file("_astro/chunk.js", 80_000),
    ]);
    expect(js).toMatchObject({ label: "play page JS", value: 480_000, ok: false });
  });

  it("counts only the game's scripts once they are marked", () => {
    const js = checkBudgets([
      { ...file("_astro/play.abc.js", 400_000), play: true },
      { ...file("_astro/altar.js", 80_000), play: false },
    ]).find((r) => r.label === "play page JS")!;
    expect(js).toMatchObject({ value: 400_000, ok: true });
  });

  it("follows dynamic imports when asked", () => {
    const code: Record<string, string> = {
      "_astro/a.js": 'import "./b.js"; const c = () => import("./c.js");',
      "_astro/b.js": "",
      "_astro/c.js": "",
    };
    expect(scriptClosure(["_astro/a.js"], (p) => code[p]!)).toEqual(["_astro/a.js", "_astro/b.js"]);
    expect(scriptClosure(["_astro/a.js"], (p) => code[p]!, true)).toEqual([
      "_astro/a.js",
      "_astro/b.js",
      "_astro/c.js",
    ]);
  });

  it("names the worst file for per-file budgets", () => {
    const html = checkBudgets([file("a.html", 1_000), file("blog/big/index.html", 30_000)]).find(
      (r) => r.label === "each HTML page",
    )!;
    expect(html).toMatchObject({ ok: false, file: "blog/big/index.html" });
  });
});

describe("inline scripts", () => {
  it("flags executable inline scripts (blocked by the CSP), not files or JSON-LD", () => {
    expect(
      inlineScripts([
        { path: "a.html", html: '<script type="module" src="/_astro/x.js"></script>' },
        { path: "b.html", html: '<script type="application/ld+json">{}</script>' },
        { path: "c.html", html: "<script>alert(1)</script>" },
        { path: "d.html", html: '<script type="module">import "./x.js"</script>' },
      ]),
    ).toEqual(["c.html", "d.html"]);
  });
});

describe("content page scripts", () => {
  const bundles = new Map([
    ["_astro/base.js", { gzip: 900, code: 'import{a}from"./analytics.js";' }],
    ["_astro/analytics.js", { gzip: 1_000, code: "export const a=1;" }],
    ["_astro/play.js", { gzip: 397_000, code: 'import"./base.js";' }],
  ]);
  const page = (path: string, ...srcs: string[]) => ({
    path,
    html: srcs.map((s) => `<script type="module" src="/_astro/${s}"></script>`).join(""),
  });

  it("follows static imports between bundles", () => {
    expect(scriptClosure(["_astro/base.js"], (p) => bundles.get(p)?.code ?? "").sort()).toEqual([
      "_astro/analytics.js",
      "_astro/base.js",
    ]);
  });

  it("lets content pages load small shared scripts, but never the game bundle", () => {
    expect(
      scriptLeaks(
        [
          page("play/index.html", "play.js"),
          page("index.html", "base.js"),
          page("blog/x/index.html", "play.js"),
        ],
        bundles,
      ),
    ).toEqual([{ page: "blog/x/index.html", gzip: 397_000 + 900 + 1_000 }]);
  });
});
