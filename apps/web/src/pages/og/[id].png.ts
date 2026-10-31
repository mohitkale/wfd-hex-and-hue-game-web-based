import type { APIRoute, GetStaticPaths } from "astro";
import { journeyPictures } from "../../lib/site";
import { ogPng } from "../../lib/images";

/** A 1200×630 share card per journey picture (blog posts that feature it), titled with its chapter. */
export const getStaticPaths: GetStaticPaths = () =>
  journeyPictures().map((p) => ({
    params: { id: p.entry.id },
    props: { art: p.art, chapter: p.entry.chapterName },
  }));

export const GET: APIRoute = ({ props }) => {
  const png = ogPng([props.art as Parameters<typeof ogPng>[0][number]], props.chapter as string);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
