import type { APIRoute } from "astro";
import { worlds } from "@hexhue/game/levels";
import { ogPng } from "../lib/images";

/** The site's social share card (1200×630), built at build time. */
export const GET: APIRoute = () => {
  const pick = (w: number, l: number) => worlds[w]!.levels[l]!.level;
  const png = ogPng([pick(0, 0), pick(1, 4), pick(2, 0), pick(0, 2)]);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
