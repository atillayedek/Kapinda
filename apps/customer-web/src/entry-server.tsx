// Herkese açık sayfaların build sırasında statik HTML'e (SEO metadata dahil) prerender edilmesi.
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import type { HelmetServerState } from "react-helmet-async";
import { AppProviders, App, createQueryClient } from "./App";
export { PRERENDER_ROUTES } from "./routes";

export function render(url: string): { html: string; head: string } {
  const helmetContext: { helmet?: HelmetServerState } = {};
  const html = renderToString(
    <StaticRouter location={url}>
      <AppProviders client={createQueryClient()} helmetContext={helmetContext}>
        <App />
      </AppProviders>
    </StaticRouter>,
  );
  const h = helmetContext.helmet;
  const head = h ? [h.title.toString(), h.priority.toString(), h.meta.toString(), h.link.toString(), h.script.toString()].join("\n") : "";
  return { html, head };
}
