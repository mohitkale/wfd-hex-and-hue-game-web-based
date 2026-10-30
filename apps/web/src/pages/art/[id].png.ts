import type { APIRoute, GetStaticPaths } from "astro";
import { journeyPictures } from "../../lib/site";
import { artPng } from "../../lib/images";

/** One PNG per journey picture, built at build time from the picture as drawn. */
export const getStaticPaths: GetStaticPaths = () =>
  journeyPictures().map((p) => ({ params: { id: p.entry.id }, props: { art: p.art } }));

export const GET: APIRoute = ({ props }) => {
  const png = artPng(props.art as Parameters<typeof artPng>[0], 16);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
