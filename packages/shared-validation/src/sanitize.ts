/** Serbest metin girişlerinden kontrol karakterlerini temizler. HTML render edilmez; React zaten escape eder. */
export function sanitizeText(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}
