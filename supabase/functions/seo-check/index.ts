// SEO denetimi: robots.txt, sitemap.xml, sayfa metadata, canonical, noindex ve özel sayfa koruması.
// Sonuçlar Supabase'e yazılır (geçmiş yalnız tarayıcıda tutulmaz).
import { handlePreflight } from "../_shared/cors.ts";
import { optionalEnv } from "../_shared/env.ts";
import { errorResponse, json, readJson } from "../_shared/http.ts";
import { requireCronOrAdmin } from "../_shared/cron.ts";
import { adminClient } from "../_shared/supabase.ts";
import { extractSitemapUrls, normalizeUrl, parseMeta, robotsDisallows } from "../_shared/seo.ts";

const PRIVATE_PATHS = ["/admin", "/sepet", "/checkout", "/profil", "/siparislerim", "/siparis-takip"];

interface Issue {
  url: string;
  error_code: string;
  message: string;
  recommendation: string;
}

async function get(url: string): Promise<{ status: number; text: string; headers: Headers } | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8000);
  try {
    const res = await fetch(url, { signal: c.signal, redirect: "follow", headers: { "User-Agent": "KapindaSeoCheck/1.0" } });
    return { status: res.status, text: await res.text(), headers: res.headers };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    const caller = await requireCronOrAdmin(req);
    const db = adminClient();
    const body = req.method === "POST" ? await readJson<{ trigger?: string }>(req).catch(() => ({ trigger: undefined })) : {};
    const scheduled = caller === "cron" || body.trigger === "scheduled";
    if (scheduled) {
      const { data: setting } = await db.from("settings").select("value").eq("key", "seo.check_interval_minutes").maybeSingle();
      const interval = Number(setting?.value ?? 60);
      const { data: last } = await db.from("seo_checks").select("started_at").order("started_at", { ascending: false }).limit(1)
        .maybeSingle();
      if (last && Date.now() - new Date(last.started_at).getTime() < interval * 60_000) return json(req, { skipped: true });
    }
    const site = (optionalEnv("PUBLIC_SITE_URL") ?? "https://kapinda.site").replace(/\/$/, "");
    const { data: check } = await db.from("seo_checks").insert({ trigger_source: scheduled ? "scheduled" : "manual" }).select("id")
      .single();
    const issues: Issue[] = [];

    const robots = await get(`${site}/robots.txt`);
    const robotsOk = !!robots && robots.status === 200 && /sitemap:\s*https?:\/\//i.test(robots.text);
    if (!robots || robots.status !== 200) {
      issues.push({
        url: `${site}/robots.txt`,
        error_code: "HTTP_ERROR",
        message: `robots.txt alınamadı (${robots?.status ?? "bağlantı yok"})`,
        recommendation: "robots.txt dosyasının yayında olduğunu doğrulayın.",
      });
    }

    const sitemap = await get(`${site}/sitemap.xml`);
    let urls: string[] = [];
    let sitemapOk = false;
    if (!sitemap || sitemap.status !== 200) {
      issues.push({
        url: `${site}/sitemap.xml`,
        error_code: "SITEMAP_FETCH_FAILED",
        message: `sitemap.xml alınamadı (${sitemap?.status ?? "bağlantı yok"})`,
        recommendation: "Build çıktısında sitemap.xml üretildiğini ve yayınlandığını kontrol edin.",
      });
    } else {
      const parsed = extractSitemapUrls(sitemap.text);
      if (!parsed) {
        issues.push({
          url: `${site}/sitemap.xml`,
          error_code: "INVALID_XML",
          message: "sitemap.xml geçerli bir urlset değil",
          recommendation: "Sitemap üreticisini kontrol edin.",
        });
      } else {
        sitemapOk = true;
        urls = parsed;
        const seen = new Set<string>();
        for (const u of urls) {
          const n = normalizeUrl(u);
          if (seen.has(n)) {
            issues.push({
              url: u,
              error_code: "DUPLICATE_URL",
              message: "Sitemap'te tekrarlanan URL",
              recommendation: "Tekrarlanan girdiyi kaldırın.",
            });
          }
          seen.add(n);
          const path = new URL(u).pathname;
          if (robots && robotsDisallows(robots.text, path)) {
            issues.push({
              url: u,
              error_code: "ROBOTS_BLOCKED",
              message: "Sitemap URL'i robots.txt tarafından engelleniyor",
              recommendation: "robots.txt kurallarını veya sitemap'i düzeltin.",
            });
          }
        }
      }
    }

    let googleVerification = false;
    let bingVerification = false;
    let yandexVerification = false;
    for (const u of urls.slice(0, 60)) {
      const page = await get(u);
      if (!page || page.status >= 400) {
        issues.push({
          url: u,
          error_code: "HTTP_ERROR",
          message: `HTTP ${page?.status ?? "bağlantı yok"}`,
          recommendation: "Sayfanın erişilebilir olduğunu doğrulayın.",
        });
        continue;
      }
      const meta = parseMeta(page.text);
      if (normalizeUrl(u) === normalizeUrl(site + "/")) {
        googleVerification = meta.googleVerification;
        bingVerification = meta.bingVerification;
        yandexVerification = meta.yandexVerification;
      }
      if (!meta.title || !meta.description || !meta.ogTitle) {
        issues.push({
          url: u,
          error_code: "MISSING_METADATA",
          message: "title/description/og:title eksik",
          recommendation: "Sayfada SEOHead bileşeniyle metadata tanımlayın ve prerender edildiğini doğrulayın.",
        });
      }
      if (!meta.canonical || normalizeUrl(meta.canonical) !== normalizeUrl(u)) {
        issues.push({
          url: u,
          error_code: "CANONICAL_MISMATCH",
          message: `Canonical: ${meta.canonical ?? "yok"}`,
          recommendation: "Canonical URL'i sayfa adresiyle eşleştirin.",
        });
      }
      const xRobots = page.headers.get("x-robots-tag") ?? "";
      if (/noindex/i.test(meta.robots ?? "") || /noindex/i.test(xRobots)) {
        issues.push({
          url: u,
          error_code: "NOINDEX_DETECTED",
          message: "Herkese açık sayfada noindex",
          recommendation: "Herkese açık sayfadan noindex'i kaldırın.",
        });
      }
    }

    let indexProtectionOk = true;
    for (const p of PRIVATE_PATHS) {
      const page = await get(site + p);
      if (!page) continue;
      const meta = parseMeta(page.text);
      const protectedPage = /noindex/i.test(page.headers.get("x-robots-tag") ?? "") || /noindex/i.test(meta.robots ?? "") ||
        (robots ? robotsDisallows(robots.text, p) : false);
      if (!protectedPage) {
        indexProtectionOk = false;
        issues.push({
          url: site + p,
          error_code: "MISSING_METADATA",
          message: "Özel sayfa indekslemeye karşı korunmuyor",
          recommendation: "X-Robots-Tag: noindex başlığı ve robots.txt Disallow ekleyin.",
        });
      }
    }

    const searchEngines = {
      google: googleVerification ? "verification_meta_present" : "verification_meta_missing",
      bing: bingVerification ? "verification_meta_present" : "not_configured",
      yandex: yandexVerification ? "verification_meta_present" : "not_configured",
      note: "İndeksleme durumu arama motoru API kimlik bilgileri olmadan doğrulanamaz.",
    };

    // Önceki açık hataları kapat, yenilerini aç
    await db.from("seo_error_logs").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("status", "open");
    const unique = [...new Map(issues.map((i) => [`${i.url}|${i.error_code}`, i])).values()];
    if (unique.length) {
      await db.from("seo_error_logs").insert(
        unique.map((i) => ({ ...i, check_id: check!.id, status: "open", detected_at: new Date().toISOString() })),
      );
    }
    await db.from("seo_checks").update({
      robots_ok: robotsOk,
      sitemap_ok: sitemapOk,
      url_count: urls.length,
      error_count: unique.length,
      index_protection_ok: indexProtectionOk,
      search_engines: searchEngines,
      details: { site },
      finished_at: new Date().toISOString(),
    }).eq("id", check!.id);
    return json(req, {
      check_id: check!.id,
      robots_ok: robotsOk,
      sitemap_ok: sitemapOk,
      url_count: urls.length,
      error_count: unique.length,
      index_protection_ok: indexProtectionOk,
      search_engines: searchEngines,
    });
  } catch (err) {
    return errorResponse(req, err);
  }
});
