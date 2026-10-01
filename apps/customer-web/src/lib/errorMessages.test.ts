import { describe, expect, it } from "vitest";
import { errorMessage } from "./errorMessages";
import { AppError, toAppError } from "./supabase";

describe("errorMessage", () => {
  it("iç veritabanı hatasını kullanıcıya göstermez", () => {
    const e = toAppError({ message: 'duplicate key value violates unique constraint "x"', code: "23505" });
    expect(errorMessage(e)).toBe("Bu kayıt zaten mevcut.");
    const internal = toAppError({ message: 'relation "orders" does not exist', code: "42P01" });
    expect(errorMessage(internal)).not.toMatch(/relation|orders/);
  });
  it("minimum sepet eksik tutarını gösterir", () => {
    expect(errorMessage(new AppError("KPD_MIN_BASKET", "40"))).toBe("Sepet alt limitine ulaşmak için 40,00 TL daha ekleyin.");
  });
  it("uygulama kodlarını Türkçe mesaja çevirir", () => {
    expect(errorMessage(toAppError({ message: "KPD_QR_ALREADY_USED" }))).toBe("Bu QR kod daha önce kullanıldı.");
    expect(errorMessage(new Error("Invalid login credentials"))).toBe("E-posta veya şifre hatalı.");
    expect(errorMessage(new Error("stack trace at foo.ts:1"))).toBe("Beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin.");
  });
});
