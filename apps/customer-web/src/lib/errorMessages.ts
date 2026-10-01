// Merkezi kullanıcı mesajları. Kullanıcıya SQL/PostgreSQL/Supabase iç hata metni veya stack trace GÖSTERİLMEZ.
import { AppError } from "./supabase";

const MESSAGES: Record<string, string> = {
  KPD_AUTH_REQUIRED: "Bu işlem için giriş yapmanız gerekiyor.",
  KPD_FORBIDDEN: "Bu işlem için yetkiniz yok.",
  KPD_NOT_FOUND: "Kayıt bulunamadı.",
  KPD_DUPLICATE: "Bu kayıt zaten mevcut.",
  KPD_INVALID_INPUT: "Girilen bilgiler geçersiz. Lütfen kontrol edin.",
  KPD_INVALID_PHONE: "Geçerli bir Türkiye telefon numarası girin.",
  KPD_INVALID_QUANTITY: "Geçersiz ürün adedi.",
  KPD_RATE_LIMITED: "Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.",
  KPD_NETWORK: "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.",
  KPD_INTERNAL: "Beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin.",
  KPD_PAYLOAD_TOO_LARGE: "Gönderilen veri çok büyük.",
  KPD_METHOD_NOT_ALLOWED: "Geçersiz istek.",
  KPD_ACCOUNT_BLOCKED: "Hesabınız kullanıma kapatılmış. Destek ekibiyle iletişime geçin.",
  KPD_CONSENT_REQUIRED: "Devam etmek için güncel sözleşmeleri onaylamanız gerekiyor.",
  KPD_EMAIL_NOT_VERIFIED: "Sipariş verebilmek için e-posta adresinizi doğrulamanız gerekiyor.",
  KPD_PLATFORM_CLOSED: "Kapında şu anda sipariş kabul etmiyor.",
  KPD_QUOTE_NOT_FOUND: "Teslimat ücreti bulunamadı. Lütfen tekrar hesaplayın.",
  KPD_QUOTE_USED: "Bu teslimat ücreti teklifi kullanıldı. Lütfen tekrar hesaplayın.",
  KPD_QUOTE_EXPIRED: "Teslimat ücreti teklifinin süresi doldu. Lütfen tekrar hesaplayın.",
  KPD_ADDRESS_NOT_FOUND: "Adres bulunamadı.",
  KPD_ADDRESS_OUT_OF_AREA: "Bu adres hizmet bölgemizin dışında.",
  KPD_OUT_OF_RANGE: "Bu adres işletmeye teslimat için çok uzak (en fazla 15 km).",
  KPD_AREA_INACTIVE: "Bu bölgede henüz hizmet vermiyoruz.",
  KPD_VENDOR_UNAVAILABLE: "Bu işletme şu anda hizmet vermiyor.",
  KPD_VENDOR_CLOSED: "İşletme şu anda kapalı.",
  KPD_VENDOR_LOCATION_MISSING: "İşletmenin konum bilgisi eksik.",
  KPD_VENDOR_NOT_ACTIVE: "İşletme hesabı aktif değil.",
  KPD_PRICING_NOT_FOUND: "Teslimat fiyatlandırması bulunamadı.",
  KPD_CART_EMPTY: "Sepetiniz boş.",
  KPD_PRODUCT_UNAVAILABLE: "Sepetinizdeki bir ürün artık satışta değil.",
  KPD_PRODUCT_NOT_SELLABLE_ONLINE: "Bu ürün mevzuat gereği online siparişe kapalıdır.",
  KPD_AGE_CONFIRMATION_REQUIRED: "18 yaş onayı gerekli.",
  KPD_OUT_OF_STOCK: "Sepetinizdeki bir ürünün stoğu yetersiz.",
  KPD_MIN_BASKET: "Sepet tutarı minimum sipariş tutarının altında.",
  KPD_INVALID_TRANSITION: "Sipariş bu aşamada bu işleme uygun değil.",
  KPD_REASON_REQUIRED: "Lütfen bir gerekçe yazın (en az 10 karakter).",
  KPD_PAYMENT_NOT_ALLOWED: "Bu sipariş için ödeme başlatılamaz.",
  KPD_PAYMENT_NOT_REQUIRED: "Bu sipariş için ödeme gerekmiyor.",
  KPD_PAYMENT_PROVIDER_ERROR: "Ödeme sağlayıcısına ulaşılamadı. Lütfen tekrar deneyin.",
  KPD_RATING_NOT_ALLOWED: "Yalnızca teslim edilmiş siparişler değerlendirilebilir.",
  KPD_ALREADY_RATED: "Bu siparişi zaten değerlendirdiniz.",
  KPD_QR_NOT_AVAILABLE: "QR kod, kurye atandıktan sonra oluşturulabilir.",
  KPD_QR_INVALID: "QR kod geçersiz.",
  KPD_QR_EXPIRED: "QR kodun süresi doldu. Yeni kod oluşturun.",
  KPD_QR_REVOKED: "Bu QR kod artık geçerli değil.",
  KPD_QR_ALREADY_USED: "Bu QR kod daha önce kullanıldı.",
  KPD_QR_WRONG_COURIER: "Bu sipariş size atanmamış.",
  KPD_DELIVERY_REQUIRES_QR: "Teslimat yalnızca kuryenin QR doğrulamasıyla tamamlanabilir.",
  KPD_COURIER_CAPACITY: "Kuryenin aktif sipariş sınırı dolu.",
  KPD_COURIER_NOT_ACTIVE: "Kurye aktif değil.",
  KPD_COURIER_AREA_MISMATCH: "Kurye bu bölgede çalışmıyor.",
  KPD_RELEASE_AFTER_PICKUP: "Teslim alınmış sipariş havuza döndürülemez; başka kuryeye devredin.",
  KPD_ROLE_VIA_APPLICATION: "İşletme ve kurye rolleri yalnızca başvuru onayıyla verilir.",
  KPD_CANNOT_REVOKE_SELF: "Kendi hesabınız üzerinde bu işlemi yapamazsınız.",
  KPD_LAST_ADMIN: "Sistemdeki son yönetici kaldırılamaz.",
  KPD_INVALID_SETTING: "Ayar değeri geçersiz veya izin verilen aralığın dışında.",
  KPD_SETTLEMENT_EXISTS: "Bu dönem için mutabakat zaten oluşturulmuş.",
  KPD_SETTLEMENT_LOCKED: "Onaylanmış mutabakat değiştirilemez.",
  KPD_IMMUTABLE_RECORD: "Bu kayıt değiştirilemez.",
  KPD_INVALID_STORAGE_PATH: "Dosya yolu geçersiz.",
  KPD_ITEM_UPDATE_NOT_ALLOWED: "Bu ürün bu aşamada güncellenemez.",
  KPD_NOT_CONFIGURED: "Bu özellik henüz yapılandırılmadı.",
  KPD_SUBSTITUTE_TOO_EXPENSIVE: "Alternatif ürün tutarı orijinal ürünün %25 fazlasını aşamaz.",
};

export function errorMessage(err: unknown): string {
  if (err instanceof AppError) {
    if (err.code === "KPD_MIN_BASKET" && err.hint) {
      const missing = Number(err.hint);
      if (Number.isFinite(missing)) return `Sepet alt limitine ulaşmak için ${formatTry(missing)} daha ekleyin.`;
    }
    return MESSAGES[err.code] ?? MESSAGES.KPD_INTERNAL!;
  }
  if (err && typeof err === "object" && "message" in err) {
    const msg = String((err as { message: unknown }).message);
    if (MESSAGES[msg]) return MESSAGES[msg]!;
    if (/invalid login credentials/i.test(msg)) return "E-posta veya şifre hatalı.";
    if (/email not confirmed/i.test(msg)) return "E-posta adresiniz henüz doğrulanmadı. Gelen kutunuzu kontrol edin.";
    if (/user already registered/i.test(msg)) return "Bu e-posta adresiyle kayıtlı bir hesap zaten var.";
    if (/password should be/i.test(msg)) return "Şifre güvenlik gereksinimlerini karşılamıyor.";
    if (/rate limit|too many/i.test(msg)) return MESSAGES.KPD_RATE_LIMITED!;
    if (/fetch|network/i.test(msg)) return MESSAGES.KPD_NETWORK!;
  }
  return MESSAGES.KPD_INTERNAL!;
}

function formatTry(n: number): string {
  return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

export { MESSAGES as ERROR_MESSAGES };
