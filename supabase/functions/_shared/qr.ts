// Teslimat QR formatı (v1):
//   KPD1.<tokenId>.<orderId>.<expUnix>.<nonceB64url>.<sigB64url>
// sig = HMAC-SHA256(QR_HMAC_SECRET, "KPD1|tokenId|orderId|expUnix|nonce")
// Veritabanında yalnız sha256(nonce) saklanır; ham nonce ve imza saklanmaz.
// Kurye bağlaması veritabanındaki qr_tokens.courier_id ile yapılır (devirde token iptal edilir).
import { base64UrlDecode, base64UrlEncode, hmacSha256, randomBytes, timingSafeEqual } from "./crypto.ts";

const PREFIX = "KPD1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface QrClaims {
  tokenId: string;
  orderId: string;
  exp: number;
  nonce: string;
}

export function newNonce(): string {
  return base64UrlEncode(randomBytes(32));
}

function signingInput(c: QrClaims): string {
  return [PREFIX, c.tokenId, c.orderId, String(c.exp), c.nonce].join("|");
}

export async function signQr(secret: string, claims: QrClaims): Promise<string> {
  const sig = base64UrlEncode(await hmacSha256(secret, signingInput(claims)));
  return [PREFIX, claims.tokenId, claims.orderId, claims.exp, claims.nonce, sig].join(".");
}

export type QrVerifyResult =
  | { ok: true; claims: QrClaims }
  | { ok: false; code: "KPD_QR_INVALID" | "KPD_QR_EXPIRED" };

export async function verifyQr(secret: string, payload: string, nowUnix = Math.floor(Date.now() / 1000)): Promise<QrVerifyResult> {
  if (typeof payload !== "string" || payload.length > 400) return { ok: false, code: "KPD_QR_INVALID" };
  const parts = payload.trim().split(".");
  if (parts.length !== 6 || parts[0] !== PREFIX) return { ok: false, code: "KPD_QR_INVALID" };
  const [, tokenId, orderId, expStr, nonce, sig] = parts as [string, string, string, string, string, string];
  if (!UUID.test(tokenId) || !UUID.test(orderId) || !/^\d{9,11}$/.test(expStr) || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) {
    return { ok: false, code: "KPD_QR_INVALID" };
  }
  try {
    base64UrlDecode(sig);
  } catch {
    return { ok: false, code: "KPD_QR_INVALID" };
  }
  const claims: QrClaims = { tokenId, orderId, exp: Number(expStr), nonce };
  const expected = base64UrlEncode(await hmacSha256(secret, signingInput(claims)));
  if (!timingSafeEqual(expected, sig)) return { ok: false, code: "KPD_QR_INVALID" };
  if (claims.exp <= nowUnix) return { ok: false, code: "KPD_QR_EXPIRED" };
  return { ok: true, claims };
}
