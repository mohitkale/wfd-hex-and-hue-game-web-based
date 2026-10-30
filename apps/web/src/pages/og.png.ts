import type { APIRoute } from "astro";
import { journeyPictures } from "../lib/site";
import { ogPng } from "../lib/images";

/** The site's social share card (1200×630), built at build time: four of the journey's finales. */
export const GET: APIRoute = () => {
  const finales = journeyPictures().filter((p) => p.entry.tier === "extreme");
  const png = ogPng([0, 2, 3, 5].map((i) => finales[i]!.art));
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
