import { assert, assertEquals } from "jsr:@std/assert@1";
import { newNonce, signQr, verifyQr } from "../_shared/qr.ts";

const SECRET = "test-secret-yalniz-test-icin-0123456789";
const tokenId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const now = 1_900_000_000;

Deno.test("geçerli QR doğrulanır", async () => {
  const nonce = newNonce();
  const qr = await signQr(SECRET, { tokenId, orderId, exp: now + 600, nonce });
  const r = await verifyQr(SECRET, qr, now);
  assert(r.ok);
  if (r.ok) assertEquals(r.claims, { tokenId, orderId, exp: now + 600, nonce });
});

Deno.test("süresi dolmuş QR reddedilir", async () => {
  const qr = await signQr(SECRET, { tokenId, orderId, exp: now - 1, nonce: newNonce() });
  assertEquals(await verifyQr(SECRET, qr, now), { ok: false, code: "KPD_QR_EXPIRED" });
});

Deno.test("manipüle edilmiş QR reddedilir (sipariş, süre, nonce, imza)", async () => {
  const nonce = newNonce();
  const qr = await signQr(SECRET, { tokenId, orderId, exp: now + 600, nonce });
  const parts = qr.split(".");
  const variants = [
    [parts[0], parts[1], "33333333-3333-4333-8333-333333333333", parts[3], parts[4], parts[5]],
    [parts[0], parts[1], parts[2], String(now + 99999), parts[4], parts[5]],
    [parts[0], parts[1], parts[2], parts[3], newNonce(), parts[5]],
    [parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]!.slice(0, -2) + "AA"],
    ["KPD2", ...parts.slice(1)],
  ];
  for (const v of variants) {
    const r = await verifyQr(SECRET, v.join("."), now);
    assertEquals(r.ok, false, v.join("."));
  }
});

Deno.test("farklı gizli anahtarla imzalanan QR reddedilir", async () => {
  const qr = await signQr("baska-anahtar-0123456789-0123456789", { tokenId, orderId, exp: now + 600, nonce: newNonce() });
  assertEquals((await verifyQr(SECRET, qr, now)).ok, false);
});

Deno.test("bozuk girdi güvenle reddedilir", async () => {
  for (const bad of ["", "KPD1", "a.b.c.d.e.f", "KPD1.....", "x".repeat(1000)]) {
    assertEquals((await verifyQr(SECRET, bad, now)).ok, false);
  }
});
