// SEO denetim yardımcıları (saf fonksiyonlar — birim testli)
export function extractSitemapUrls(xml: string): string[] | null {
  if (!/<urlset[\s>]/.test(xml) || !/<\/urlset>/.test(xml)) return null;
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!.trim());
}

export function robotsDisallows(robots: string, path: string, agent = "*"): boolean {
  // RFC 9309: ajana özel grup varsa yalnız o grup, yoksa "*" grubu uygulanır; en uzun eşleşen kural kazanır.
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: { agents: string[]; rules: { allow: boolean; path: string }[] } | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === "allow" || key === "disallow") && value) current.rules.push({ allow: key === "allow", path: value });
    }
  }
  const a = agent.toLowerCase();
  let applicable = groups.filter((g) => g.agents.includes(a));
  if (!applicable.length) applicable = groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const r of applicable.flatMap((g) => g.rules)) {
    const prefix = r.path.replace(/\*.*$/, "").replace(/\$$/, "");
    if (path.startsWith(prefix) && (!best || prefix.length > best.len || (prefix.length === best.len && r.allow))) {
      best = { allow: r.allow, len: prefix.length };
    }
  }
  return best ? !best.allow : false;
}

export interface PageMeta {
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  ogTitle: string | null;
  googleVerification: boolean;
  bingVerification: boolean;
  yandexVerification: boolean;
}

function metaContent(html: string, attr: "name" | "property", value: string): string | null {
  const re = new RegExp(`<meta[^>]*${attr}=["']${value}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1] ?? null;
}

export function parseMeta(html: string): PageMeta {
  return {
    title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null,
    description: metaContent(html, "name", "description"),
    canonical: html.match(/<link[^>]*rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1] ?? null,
    robots: metaContent(html, "name", "robots"),
    ogTitle: metaContent(html, "property", "og:title"),
    googleVerification: metaContent(html, "name", "google-site-verification") !== null,
    bingVerification: metaContent(html, "name", "msvalidate.01") !== null,
    yandexVerification: metaContent(html, "name", "yandex-verification") !== null,
  };
}

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    let s = url.toString();
    if (s.endsWith("/") && url.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return u;
  }
}
