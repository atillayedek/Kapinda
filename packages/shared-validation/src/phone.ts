/**
 * Türkiye telefon numarası normalizasyonu — tek ortak TypeScript implementasyonu.
 *
 * Canonical format: E.164 → "+90XXXXXXXXXX" (ülke kodu + 10 haneli ulusal numara).
 * Otorite PostgreSQL tarafındaki public.normalize_tr_phone() fonksiyonudur; bu modül aynı kuralları
 * uygular ve aynı test vektörleriyle (test/phone-vectors.json) doğrulanır.
 */

const NATIONAL_NUMBER = /^[2-58]\d{9}$/;

export function normalizeTrPhone(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Yalnız rakam, boşluk, +, -, (, ), . karakterlerine izin ver.
  if (!/^[\d\s+\-().]+$/.test(trimmed)) return null;
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");

  if (hasPlus) {
    if (!digits.startsWith("90")) return null;
    digits = digits.slice(2);
  } else if (digits.startsWith("0090")) {
    digits = digits.slice(4);
  } else if (digits.length === 12 && digits.startsWith("90")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (!NATIONAL_NUMBER.test(digits)) return null;
  return `+90${digits}`;
}

export function isValidTrPhone(input: string | null | undefined): boolean {
  return normalizeTrPhone(input) !== null;
}

/** "+905321234567" → "0532 123 45 67" */
export function formatTrPhone(canonical: string | null | undefined): string {
  const n = normalizeTrPhone(canonical);
  if (!n) return canonical ?? "";
  const d = n.slice(3);
  return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}

/** Gizlilik için maskeleme: "+905321234567" → "0532 *** ** 67" */
export function maskTrPhone(canonical: string | null | undefined): string {
  const n = normalizeTrPhone(canonical);
  if (!n) return "";
  const d = n.slice(3);
  return `0${d.slice(0, 3)} *** ** ${d.slice(8, 10)}`;
}
