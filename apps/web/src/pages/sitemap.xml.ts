import type { APIRoute } from "astro";
import { absolute } from "../lib/site";

/** Every content page (the game, the gallery, the blog), discovered from the pages directory. */
const pages = Object.keys(import.meta.glob("./**/*.{astro,md}"))
  .map((f) => f.replace(/^\.\//, "/").replace(/\.(astro|md)$/, ""))
  .filter((p) => !p.includes("[") && !p.endsWith("/404"))
  .map((p) => (p.endsWith("/index") ? p.slice(0, -"index".length) : p))
  // Pages build as directories (/faq/index.html): list them the way their canonical links do.
  .map((p) => (p.endsWith("/") ? p : `${p}/`))
  .sort();

export const GET: APIRoute = ({ site }) => {
  const urls = pages.map((p) => `  <url><loc>${absolute(p, site)}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
};
