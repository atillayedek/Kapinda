// Build sonrası: herkese açık sayfaları SEO metadata'sıyla statik HTML'e yazar ve sitemap.xml üretir.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const template = readFileSync(resolve(dist, "index.html"), "utf8");
const { render, PRERENDER_ROUTES } = await import(pathToFileURL(resolve(root, "dist-ssr/entry-server.js")).href);
const site = (process.env.VITE_SITE_URL || "https://kapinda.site").replace(/\/$/, "");

for (const route of PRERENDER_ROUTES) {
  const { html, head } = render(route);
  const page = template.replace("<!--app-head-->", head).replace("<!--app-html-->", html);
  const out = route === "/" ? resolve(dist, "index.html") : resolve(dist, `.${route}/index.html`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, page);
  console.log(`prerender: ${route}`);
}

// SPA kabuğu (özel sayfalar için): metadata'sız, noindex
const shell = template
  .replace("<!--app-head-->", '<title>Kapında</title><meta name="robots" content="noindex, nofollow" />')
  .replace("<!--app-html-->", "");
writeFileSync(resolve(dist, "app-shell.html"), shell);

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PRERENDER_ROUTES.map((r) => `  <url><loc>${site}${r === "/" ? "/" : r}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
writeFileSync(resolve(dist, "sitemap.xml"), sitemap);
rmSync(resolve(root, "dist-ssr"), { recursive: true, force: true });
console.log(`sitemap: ${PRERENDER_ROUTES.length} URL`);
