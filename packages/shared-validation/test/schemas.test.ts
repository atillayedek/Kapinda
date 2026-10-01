import { describe, expect, it } from "vitest";
import { isValidEan13, ratingSchema, signupSchema } from "../src";

describe("EAN-13", () => {
  it("geçerli kontrol hanesini kabul eder", () => {
    expect(isValidEan13("8690504000016")).toBe(false);
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("400638133393")).toBe(false);
    expect(isValidEan13("4006381333932")).toBe(false);
  });
});

describe("signupSchema", () => {
  const base = {
    fullName: "Ayşe Yılmaz",
    email: "AYSE@ornek.com",
    phone: "0532 123 45 67",
    password: "guclusifre123",
    passwordConfirm: "guclusifre123",
    acceptKvkk: true,
    acceptExplicitConsent: true,
    acceptTerms: true,
  };
  it("telefonu canonical hale getirir", () => {
    const r = signupSchema.parse(base);
    expect(r.phone).toBe("+905321234567");
    expect(r.email).toBe("ayse@ornek.com");
  });
  it("sözleşme onayı zorunludur", () => {
    expect(signupSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
  });
});

describe("ratingSchema", () => {
  it("500 karakter sınırı", () => {
    expect(ratingSchema.safeParse({ score: 5, comment: "a".repeat(501) }).success).toBe(false);
    expect(ratingSchema.safeParse({ score: 0 }).success).toBe(false);
  });
});
