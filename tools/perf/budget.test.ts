import { describe, expect, it } from "vitest";
import { BUDGETS, checkBudgets, scriptLeaks, type BuiltFile } from "./budget";

const file = (path: string, gzip: number, bytes = gzip * 3): BuiltFile => ({ path, gzip, bytes });

describe("performance budget", () => {
  it("passes a build like today's", () => {
    const results = checkBudgets([
      file("index.html", 2_000),
      file("play/index.html", 1_700),
      file("_astro/play.abc.js", 392_000, 1_563_000),
      file("_astro/hint.worker-x.js", 1_500),
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

  it("names the worst file for per-file budgets", () => {
    const html = checkBudgets([file("a.html", 1_000), file("blog/big/index.html", 30_000)])[1]!;
    expect(html).toMatchObject({ ok: false, file: "blog/big/index.html" });
  });

  it("keeps the hint worker out of the play JS total", () => {
    const [js] = checkBudgets([file("_astro/hint.worker-x.js", 500_000)]);
    expect(js!.value).toBe(0);
  });
});

describe("script leaks", () => {
  it("only the play page may load a script bundle", () => {
    const bundle = '<script type="module" src="/_astro/play.abc.js"></script>';
    expect(
      scriptLeaks([
        { path: "play/index.html", html: bundle },
        { path: "index.html", html: '<script type="module">setupPwa()</script>' },
        { path: "blog/x/index.html", html: bundle },
      ]),
    ).toEqual(["blog/x/index.html"]);
  });
});
