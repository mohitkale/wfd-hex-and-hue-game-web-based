import type { APIRoute } from "astro";
import { absolute, sitemapPaths } from "../lib/site";

/** Every content page (the game, the gallery, the blog), discovered from the pages directory. */
const pages = sitemapPaths(Object.keys(import.meta.glob("./**/*.{astro,md}")));

export const GET: APIRoute = ({ site }) => {
  const urls = pages.map((p) => `  <url><loc>${absolute(p, site)}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
};
