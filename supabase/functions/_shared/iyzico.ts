// iyzico entegrasyonu — YALNIZ TESLİMAT ÜCRETİ tahsil edilir. Ürün bedeli kapıda işletmeye ödenir.
// Tutar her zaman veritabanındaki siparişten gelir; istemciden tutar kabul edilmez.
import { hmacSha256Hex, timingSafeEqual } from "./crypto.ts";

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string; // https://api.iyzipay.com veya https://sandbox-api.iyzipay.com
}

export function formatPrice(amount: number): string {
  // iyzico fiyatları ondalık nokta ile string ister ("140.0" / "140.00" kabul edilir)
  return (Math.round(amount * 100) / 100).toFixed(2);
}

export async function authHeaders(cfg: IyzicoConfig, uriPath: string, body: string, randomKey?: string): Promise<Record<string, string>> {
  const rnd = randomKey ?? `${Date.now()}${Math.floor(Math.random() * 1e9)}`;
  const signature = await hmacSha256Hex(cfg.secretKey, rnd + uriPath + body);
  const authorization = `apiKey:${cfg.apiKey}&randomKey:${rnd}&signature:${signature}`;
  return {
    Authorization: `IYZWSv2 ${btoa(authorization)}`,
    "x-iyzi-rnd": rnd,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function call<T>(cfg: IyzicoConfig, uriPath: string, payload: unknown, fetchImpl: typeof fetch = fetch): Promise<T> {
  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetchImpl(cfg.baseUrl + uriPath, {
      method: "POST",
      headers: await authHeaders(cfg, uriPath, body),
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`iyzico_invalid_response_${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export interface Buyer {
  id: string;
  name: string;
  surname: string;
  gsmNumber: string;
  email: string;
  identityNumber: string;
  registrationAddress: string;
  ip: string;
  city: string;
  country: string;
}

export interface InitializeInput {
  conversationId: string;
  basketId: string;
  amount: number;
  callbackUrl: string;
  buyer: Buyer;
  address: { contactName: string; city: string; country: string; address: string };
}

export interface InitializeResponse {
  status: "success" | "failure";
  errorCode?: string;
  errorMessage?: string;
  token?: string;
  checkoutFormContent?: string;
  paymentPageUrl?: string;
  tokenExpireTime?: number;
  conversationId?: string;
}

export function buildInitializeRequest(input: InitializeInput) {
  const price = formatPrice(input.amount);
  return {
    locale: "tr",
    conversationId: input.conversationId,
    price,
    paidPrice: price,
    currency: "TRY",
    basketId: input.basketId,
    paymentGroup: "PRODUCT",
    callbackUrl: input.callbackUrl,
    enabledInstallments: [1],
    buyer: input.buyer,
    shippingAddress: input.address,
    billingAddress: input.address,
    basketItems: [
      {
        id: "teslimat-ucreti",
        name: "Kapında Teslimat Hizmeti",
        category1: "Teslimat",
        itemType: "VIRTUAL",
        price,
      },
    ],
  };
}

export function initializeCheckoutForm(cfg: IyzicoConfig, input: InitializeInput, fetchImpl?: typeof fetch) {
  return call<InitializeResponse>(cfg, "/payment/iyzipos/checkoutform/initialize/auth/ecom", buildInitializeRequest(input), fetchImpl);
}

export interface RetrieveResponse {
  status: "success" | "failure";
  errorCode?: string;
  errorMessage?: string;
  paymentStatus?: string;
  paymentId?: string;
  price?: number;
  paidPrice?: number;
  currency?: string;
  basketId?: string;
  conversationId?: string;
  token?: string;
  fraudStatus?: number;
  signature?: string;
}

export function retrieveCheckoutForm(cfg: IyzicoConfig, conversationId: string, token: string, fetchImpl?: typeof fetch) {
  return call<RetrieveResponse>(cfg, "/payment/iyzipos/checkoutform/auth/ecom/detail", { locale: "tr", conversationId, token }, fetchImpl);
}

/** Checkout form sonuç imzası: HMAC-SHA256(secret, paymentStatus:paymentId:currency:basketId:conversationId:paidPrice:price:token) */
export async function verifyRetrieveSignature(cfg: IyzicoConfig, r: RetrieveResponse): Promise<boolean> {
  if (!r.signature) return false;
  const fields = [r.paymentStatus, r.paymentId, r.currency, r.basketId, r.conversationId, r.paidPrice, r.price, r.token]
    .map((v) => (v === undefined || v === null ? "" : String(v)));
  const expected = await hmacSha256Hex(cfg.secretKey, fields.join(":"));
  return timingSafeEqual(expected, r.signature.toLowerCase());
}

export interface WebhookPayload {
  paymentConversationId?: string;
  merchantId?: string | number;
  token?: string;
  status?: string;
  iyziReferenceCode?: string;
  iyziEventType?: string;
  iyziEventTime?: number;
  iyziPaymentId?: string | number;
}

/** X-IYZ-SIGNATURE-V3: HMAC-SHA256(secret, secret + eventType + paymentId + token + conversationId + status) */
export async function verifyWebhookSignature(cfg: IyzicoConfig, p: WebhookPayload, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const message = cfg.secretKey + (p.iyziEventType ?? "") + String(p.iyziPaymentId ?? "") + (p.token ?? "") +
    (p.paymentConversationId ?? "") + (p.status ?? "");
  const expected = await hmacSha256Hex(cfg.secretKey, message);
  return timingSafeEqual(expected, signature.toLowerCase());
}

export interface RefundResponse {
  status: "success" | "failure";
  errorCode?: string;
  errorMessage?: string;
  paymentId?: string;
  price?: number;
}

export function refundPayment(
  cfg: IyzicoConfig,
  conversationId: string,
  paymentId: string,
  amount: number,
  ip: string,
  fetchImpl?: typeof fetch,
) {
  return call<RefundResponse>(cfg, "/v2/payment/refund", {
    locale: "tr",
    conversationId,
    paymentId,
    price: formatPrice(amount),
    currency: "TRY",
    ip,
  }, fetchImpl);
}

/** Ödeme sonucu, beklenen tutar ve konuşma kimliğiyle birebir eşleşmeli. */
export function isSuccessfulRetrieve(r: RetrieveResponse, expected: { conversationId: string; amount: number; basketId: string }): boolean {
  return r.status === "success" &&
    r.paymentStatus === "SUCCESS" &&
    r.conversationId === expected.conversationId &&
    r.basketId === expected.basketId &&
    r.currency === "TRY" &&
    typeof r.paidPrice === "number" &&
    Math.round(r.paidPrice * 100) === Math.round(expected.amount * 100) &&
    (r.fraudStatus === undefined || r.fraudStatus === 1);
}

/** Saklanacak yanıt: kart/kimlik verisi olmadan asgari alanlar. */
export function sanitizeRetrieve(r: RetrieveResponse) {
  return {
    status: r.status,
    paymentStatus: r.paymentStatus,
    paymentId: r.paymentId,
    paidPrice: r.paidPrice,
    currency: r.currency,
    basketId: r.basketId,
    conversationId: r.conversationId,
    fraudStatus: r.fraudStatus,
    errorCode: r.errorCode,
  };
}
