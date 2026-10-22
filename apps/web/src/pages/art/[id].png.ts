import type { APIRoute, GetStaticPaths } from "astro";
import { worlds } from "@hexhue/game/levels";
import { artPng } from "../../lib/images";

/** One PNG per mosaic, built at build time from the shipped level data. */
export const getStaticPaths: GetStaticPaths = () =>
  worlds.flatMap((w) =>
    w.levels.map((l) => ({ params: { id: l.level.id }, props: { level: l.level } })),
  );

export const GET: APIRoute = ({ props }) => {
  const png = artPng(props.level as Parameters<typeof artPng>[0], 16);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
