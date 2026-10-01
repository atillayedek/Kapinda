import { z } from "zod";
import { normalizeTrPhone } from "./phone";
import { isValidEan13 } from "./barcode";

const trimmed = (max: number) => z.string().trim().max(max, `En fazla ${max} karakter olabilir.`);
const required = (max: number, label: string) => trimmed(max).min(1, `${label} zorunludur.`);

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Telefon numarası zorunludur.")
  .transform((v, ctx) => {
    const n = normalizeTrPhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Geçerli bir Türkiye telefon numarası girin." });
      return z.NEVER;
    }
    return n;
  });

export const emailSchema = z.string().trim().toLowerCase().email("Geçerli bir e-posta adresi girin.").max(254);

export const passwordSchema = z
  .string()
  .min(10, "Şifre en az 10 karakter olmalıdır.")
  .max(72, "Şifre en fazla 72 karakter olabilir.")
  .regex(/[A-Za-zÇĞİÖŞÜçğıöşü]/, "Şifre en az bir harf içermelidir.")
  .regex(/\d/, "Şifre en az bir rakam içermelidir.");

export const signupSchema = z
  .object({
    fullName: required(120, "Ad soyad"),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    referralCode: trimmed(16).optional().or(z.literal("")),
    acceptKvkk: z.literal(true, { errorMap: () => ({ message: "KVKK Aydınlatma Metni onaylanmalıdır." }) }),
    acceptExplicitConsent: z.literal(true, { errorMap: () => ({ message: "Açık Rıza Metni onaylanmalıdır." }) }),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "Kullanıcı Sözleşmesi onaylanmalıdır." }) }),
  })
  .refine((v) => v.password === v.passwordConfirm, { path: ["passwordConfirm"], message: "Şifreler eşleşmiyor." });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Şifre zorunludur."),
});

export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const addressSchema = z.object({
  label: trimmed(40).optional(),
  districtId: z.string().uuid("İlçe seçin."),
  neighborhood: required(120, "Mahalle"),
  street: required(160, "Cadde/Sokak"),
  building: required(60, "Bina"),
  apartment: trimmed(80).optional(),
  floor: trimmed(10).optional(),
  doorNumber: trimmed(10).optional(),
  directions: trimmed(500).optional(),
  recipientName: required(120, "Alıcı adı"),
  phone: phoneSchema,
  lat: z.number({ required_error: "Haritada konum işaretleyin." }).min(-90).max(90),
  lng: z.number({ required_error: "Haritada konum işaretleyin." }).min(-180).max(180),
  isDefault: z.boolean().default(false),
});

export const barcodeSchema = z
  .string()
  .trim()
  .refine((v) => isValidEan13(v), "Geçerli bir EAN-13 barkodu girin.");

export const productSchema = z.object({
  name: required(160, "Ürün adı"),
  description: trimmed(2000).optional(),
  categoryId: z.string().uuid("Kategori seçin."),
  barcode: barcodeSchema.optional().or(z.literal("")),
  price: z.number().positive("Fiyat sıfırdan büyük olmalıdır.").max(100000),
  trackStock: z.boolean(),
  stockQuantity: z.number().int().min(0).nullable(),
  unit: z.enum(["adet", "kg", "lt", "paket", "demet"]),
  isActive: z.boolean(),
});

export const ratingSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: trimmed(500).optional(),
});

export const supportMessageSchema = z.object({
  body: required(4000, "Mesaj"),
});

export const vendorApplicationSchema = z.object({
  businessName: required(160, "İşletme adı"),
  businessType: z.enum(["market", "tekel", "manav", "kasap", "firin", "kuruyemis", "sarkuteri", "diger"]),
  ownerName: required(120, "Yetkili adı"),
  taxNumber: z
    .string()
    .trim()
    .regex(/^\d{10,11}$/, "Vergi/TC kimlik numarası 10 veya 11 haneli olmalıdır."),
  phone: phoneSchema,
  email: emailSchema,
  districtId: z.string().uuid("İlçe seçin."),
  address: required(500, "Adres"),
  notes: trimmed(1000).optional(),
});

export const courierApplicationSchema = z.object({
  fullName: required(120, "Ad soyad"),
  phone: phoneSchema,
  email: emailSchema,
  districtId: z.string().uuid("İlçe seçin."),
  vehicleType: z.enum(["motosiklet", "bisiklet", "otomobil", "yaya"]),
  hasLicense: z.boolean(),
  notes: trimmed(1000).optional(),
});

export const checkoutSchema = z.object({
  addressId: z.string().uuid(),
  productPaymentMethod: z.enum(["cash", "card_on_delivery"]),
  customerNote: trimmed(500).optional(),
  ageConfirmed: z.boolean(),
});

export const adminReasonSchema = z.object({
  reason: z.string().trim().min(10, "Gerekçe en az 10 karakter olmalıdır.").max(1000),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type VendorApplicationInput = z.infer<typeof vendorApplicationSchema>;
export type CourierApplicationInput = z.infer<typeof courierApplicationSchema>;
