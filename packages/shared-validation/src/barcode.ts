/** EAN-13 kontrol hanesi doğrulaması. */
export function isValidEan13(code: string | null | undefined): boolean {
  if (!code || !/^\d{13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
}
