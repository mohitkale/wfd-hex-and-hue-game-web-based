import type { APIRoute, GetStaticPaths } from "astro";
import { worlds } from "@hexhue/game/levels";
import { ogPng } from "../../lib/images";

/** A 1200×630 share card per mosaic (blog posts that feature it), titled with its world. */
export const getStaticPaths: GetStaticPaths = () =>
  worlds.flatMap((w) =>
    w.levels.map((l) => ({ params: { id: l.level.id }, props: { level: l.level, world: w.name } })),
  );

export const GET: APIRoute = ({ props }) => {
  const png = ogPng([props.level as Parameters<typeof ogPng>[0][number]], props.world as string);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
