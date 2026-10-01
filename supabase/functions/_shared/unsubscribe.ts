import { base64UrlEncode, hmacSha256, timingSafeEqual } from "./crypto.ts";

/** Abonelikten çıkış tokenı: <subscriptionId>.<HMAC> — veritabanında token saklanmaz. */
export async function unsubscribeToken(secret: string, subscriptionId: string): Promise<string> {
  return `${subscriptionId}.${base64UrlEncode(await hmacSha256(secret, `unsub|${subscriptionId}`))}`;
}

export async function verifyUnsubscribeToken(secret: string, token: string): Promise<string | null> {
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expected = (await unsubscribeToken(secret, id)).split(".")[1]!;
  return timingSafeEqual(expected, sig) ? id : null;
}
