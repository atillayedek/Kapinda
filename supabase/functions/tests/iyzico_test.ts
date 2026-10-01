import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  authHeaders,
  buildInitializeRequest,
  formatPrice,
  isSuccessfulRetrieve,
  verifyRetrieveSignature,
  verifyWebhookSignature,
} from "../_shared/iyzico.ts";
import { hmacSha256Hex } from "../_shared/crypto.ts";

const cfg = { apiKey: "test-api-key", secretKey: "test-secret-key", baseUrl: "https://sandbox-api.iyzipay.com" };

Deno.test("iyzico'ya yalnız teslimat ücreti gönderilir", () => {
  const req = buildInitializeRequest({
    conversationId: "KPD1",
    basketId: "KPD-261001-ABCDE",
    amount: 140,
    callbackUrl: "https://example.supabase.co/functions/v1/iyzico-callback?pid=x",
    buyer: {
      id: "u",
      name: "A",
      surname: "B",
      gsmNumber: "+905320000000",
      email: "a@b.co",
      identityNumber: "x",
      registrationAddress: "x",
      ip: "1.1.1.1",
      city: "Artvin",
      country: "Turkey",
    },
    address: { contactName: "A B", city: "Artvin", country: "Turkey", address: "x" },
  });
  assertEquals(req.price, "140.00");
  assertEquals(req.paidPrice, "140.00");
  assertEquals(req.basketItems.length, 1);
  assertEquals(req.basketItems[0]!.price, "140.00");
  assertEquals(req.basketItems[0]!.itemType, "VIRTUAL");
  assertEquals(req.currency, "TRY");
});

Deno.test("fiyat biçimi", () => {
  assertEquals(formatPrice(120), "120.00");
  assertEquals(formatPrice(140.005), "140.01");
});

Deno.test("IYZWSv2 yetkilendirme başlığı imzası", async () => {
  const body = '{"locale":"tr"}';
  const h = await authHeaders(cfg, "/payment/test", body, "123456");
  const decoded = atob(h.Authorization!.replace("IYZWSv2 ", ""));
  const sig = await hmacSha256Hex(cfg.secretKey, "123456" + "/payment/test" + body);
  assertEquals(decoded, `apiKey:test-api-key&randomKey:123456&signature:${sig}`);
  assertEquals(h["x-iyzi-rnd"], "123456");
});

Deno.test("ödeme sonucu tutar/conversation eşleşmesi zorunlu", () => {
  const ok = {
    status: "success" as const,
    paymentStatus: "SUCCESS",
    conversationId: "c1",
    basketId: "b1",
    currency: "TRY",
    paidPrice: 140,
    fraudStatus: 1,
  };
  const exp = { conversationId: "c1", amount: 140, basketId: "b1" };
  assert(isSuccessfulRetrieve(ok, exp));
  assert(!isSuccessfulRetrieve({ ...ok, paidPrice: 960 }, exp), "ürün+teslimat toplamı kabul edilmez");
  assert(!isSuccessfulRetrieve({ ...ok, conversationId: "c2" }, exp));
  assert(!isSuccessfulRetrieve({ ...ok, paymentStatus: "FAILURE" }, exp));
  assert(!isSuccessfulRetrieve({ ...ok, fraudStatus: -1 }, exp));
  assert(!isSuccessfulRetrieve({ ...ok, currency: "USD" }, exp));
});

Deno.test("retrieve imzası doğrulanır", async () => {
  const r = {
    status: "success" as const,
    paymentStatus: "SUCCESS",
    paymentId: "123",
    currency: "TRY",
    basketId: "b1",
    conversationId: "c1",
    paidPrice: 140,
    price: 140,
    token: "tok",
  };
  const signature = await hmacSha256Hex(cfg.secretKey, ["SUCCESS", "123", "TRY", "b1", "c1", "140", "140", "tok"].join(":"));
  assert(await verifyRetrieveSignature(cfg, { ...r, signature }));
  assert(!(await verifyRetrieveSignature(cfg, { ...r, paidPrice: 1, signature })));
  assert(!(await verifyRetrieveSignature(cfg, r)));
});

Deno.test("webhook imzası doğrulanır", async () => {
  const p = { iyziEventType: "CHECKOUT_FORM_AUTH", iyziPaymentId: 99, token: "tok", paymentConversationId: "c1", status: "SUCCESS" };
  const sig = await hmacSha256Hex(cfg.secretKey, cfg.secretKey + "CHECKOUT_FORM_AUTH" + "99" + "tok" + "c1" + "SUCCESS");
  assert(await verifyWebhookSignature(cfg, p, sig));
  assert(!(await verifyWebhookSignature(cfg, { ...p, status: "FAILURE" }, sig)));
  assert(!(await verifyWebhookSignature(cfg, p, null)));
});
