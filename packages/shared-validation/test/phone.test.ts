import { describe, expect, it } from "vitest";
import vectors from "./phone-vectors.json";
import { formatTrPhone, maskTrPhone, normalizeTrPhone } from "../src/phone";

describe("normalizeTrPhone", () => {
  it.each(vectors.valid as [string, string][])("%s → %s", (input, expected) => {
    expect(normalizeTrPhone(input)).toBe(expected);
  });

  it.each(vectors.invalid)("geçersiz: %s", (input) => {
    expect(normalizeTrPhone(input)).toBeNull();
  });

  it("biçimlendirir ve maskeler", () => {
    expect(formatTrPhone("+905321234567")).toBe("0532 123 45 67");
    expect(maskTrPhone("05321234567")).toBe("0532 *** ** 67");
  });
});
