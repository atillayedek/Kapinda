import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { drivingDistance, haversineKm } from "../_shared/distance.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { extractSitemapUrls, normalizeUrl, parseMeta, robotsDisallows } from "../_shared/seo.ts";
import { renderEmail } from "../_shared/email-templates.ts";
import { unsubscribeToken, verifyUnsubscribeToken } from "../_shared/unsubscribe.ts";
import { parseServiceAccount, signJwt } from "../_shared/fcm.ts";
import { base64UrlDecode, base64UrlEncode } from "../_shared/crypto.ts";

const hopa = { lat: 41.4086, lng: 41.4283 };
const near = { lat: 41.4200, lng: 41.4400 };

Deno.test("haversine", () => {
  assertAlmostEquals(haversineKm(hopa, hopa), 0, 1e-9);
  assert(haversineKm(hopa, near) > 1.4 && haversineKm(hopa, near) < 1.8);
});

Deno.test("Google Maps başarılı yanıt", async () => {
  const fake =
    (() => Promise.resolve(new Response(JSON.stringify({ routes: [{ distanceMeters: 3420, duration: "420s" }] })))) as typeof fetch;
  const r = await drivingDistance(hopa, near, "key", fake);
  assertEquals(r.source, "google_maps");
  assertEquals(r.km, 3.42);
});

Deno.test("Maps hatası/zaman aşımı → Haversine tahmini (sipariş akışı çökmez)", async () => {
  const err500 = (() => Promise.resolve(new Response("x", { status: 500 }))) as typeof fetch;
  const r1 = await drivingDistance(hopa, near, "key", err500);
  assertEquals(r1.source, "haversine_estimate");
  const hang =
    ((_u: string, init?: RequestInit) =>
      new Promise<Response>((_res, rej) =>
        init?.signal?.addEventListener("abort", () => rej(new DOMException("x", "AbortError")))
      )) as typeof fetch;
  const r2 = await drivingDistance(hopa, near, "key", hang, 50);
  assertEquals(r2.source, "haversine_estimate");
  assertEquals(r2.fallbackReason, "maps_timeout");
  const r3 = await drivingDistance(hopa, near, undefined);
  assertEquals(r3.fallbackReason, "maps_key_missing");
});

Deno.test("timingSafeEqual", () => {
  assert(timingSafeEqual("abc", "abc"));
  assert(!timingSafeEqual("abc", "abd"));
  assert(!timingSafeEqual("abc", "abcd"));
});

Deno.test("sitemap ve robots ayrıştırma", () => {
  const xml =
    `<?xml version="1.0"?><urlset xmlns="x"><url><loc>https://kapinda.site/</loc></url><url><loc>https://kapinda.site/sss</loc></url></urlset>`;
  assertEquals(extractSitemapUrls(xml), ["https://kapinda.site/", "https://kapinda.site/sss"]);
  assertEquals(extractSitemapUrls("<html></html>"), null);
  const robots = "User-agent: *\nDisallow: /admin\nDisallow: /sepet\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /";
  assert(robotsDisallows(robots, "/admin/siparisler"));
  assert(!robotsDisallows(robots, "/isletmeler"));
  assert(robotsDisallows(robots, "/isletmeler", "GPTBot"));
  assertEquals(normalizeUrl("https://kapinda.site/sss/#x"), "https://kapinda.site/sss");
});

Deno.test("metadata ayrıştırma", () => {
  const html =
    `<html><head><title>Kapında</title><meta name="description" content="Hopa"><link rel="canonical" href="https://kapinda.site/">
  <meta property="og:title" content="K"><meta name="google-site-verification" content="abc"><meta name="robots" content="index,follow"></head></html>`;
  const m = parseMeta(html);
  assertEquals(m.title, "Kapında");
  assertEquals(m.canonical, "https://kapinda.site/");
  assert(m.googleVerification);
  assert(!m.bingVerification);
});

Deno.test("e-posta şablonu HTML kaçışı ve abonelikten çıkış bağlantısı", () => {
  const r = renderEmail("newsletter", { subject: "Duyuru", body: "<script>alert(1)</script>" }, "https://x/unsub?token=a");
  assert(!r.html.includes("<script>"));
  assert(r.html.includes("&lt;script&gt;"));
  assert(r.html.includes("Abonelikten") || r.html.includes("aboneliğinden"));
  const t = renderEmail("order_received", {
    order_number: "KPD-1",
    vendor_name: "<b>X</b>",
    product_subtotal: 820,
    delivery_fee_payable: 140,
  });
  assert(!t.html.includes("<b>X</b>"));
  assert(t.text.includes("140,00 TL"));
});

Deno.test("abonelikten çıkış tokenı", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const tok = await unsubscribeToken("s3cret-test", id);
  assertEquals(await verifyUnsubscribeToken("s3cret-test", tok), id);
  assertEquals(await verifyUnsubscribeToken("baska", tok), null);
  assertEquals(await verifyUnsubscribeToken("s3cret-test", tok.slice(0, -2) + "xx"), null);
});

Deno.test("FCM servis hesabı JWT (RS256) imzası doğrulanabilir", async () => {
  const kp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----\n`;
  const sa = parseServiceAccount(JSON.stringify({ project_id: "p", client_email: "svc@p.iam.gserviceaccount.com", private_key: pem }));
  const jwt = await signJwt(sa, 1_900_000_000);
  const [h, c, s] = jwt.split(".");
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", kp.publicKey, base64UrlDecode(s!), new TextEncoder().encode(`${h}.${c}`));
  assert(ok);
  const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(c!)));
  assertEquals(claims.scope, "https://www.googleapis.com/auth/firebase.messaging");
  assertEquals(base64UrlEncode(base64UrlDecode("YWJj")), "YWJj");
});
