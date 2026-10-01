package site.kapinda.courier.core.errors

/** Sunucunun döndürdüğü uygulama kodu (KPD_*) veya ağ hatası. Kullanıcıya iç hata metni gösterilmez. */
class AppException(val code: String, val hint: String? = null, cause: Throwable? = null) : Exception(code, cause)

object ErrorMessages {
    private val messages = mapOf(
        "KPD_AUTH_REQUIRED" to "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.",
        "KPD_FORBIDDEN" to "Bu işlem için yetkiniz yok.",
        "KPD_NOT_FOUND" to "Kayıt bulunamadı.",
        "KPD_DUPLICATE" to "Bu kayıt zaten mevcut.",
        "KPD_INVALID_INPUT" to "Girilen bilgiler geçersiz.",
        "KPD_RATE_LIMITED" to "Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.",
        "KPD_NETWORK" to "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.",
        "KPD_INTERNAL" to "Beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin.",
        "KPD_INVALID_CREDENTIALS" to "E-posta veya şifre hatalı.",
        "KPD_EMAIL_NOT_CONFIRMED" to "E-posta adresiniz doğrulanmamış.",
        "KPD_NOT_CONFIGURED" to "Uygulama yapılandırması eksik.",
        "KPD_COURIER_NOT_ACTIVE" to "Kurye hesabınız aktif değil.",
        "KPD_COURIER_OFFLINE" to "Görev almak için çevrimiçi ve müsait olmalısınız (kapasiteniz dolu olabilir).",
        "KPD_COURIER_INCIDENT_OPEN" to "Açık bir acil durum kaydınız var. Yönetici çözmeden çevrimiçi olamazsınız.",
        "KPD_COURIER_CAPACITY" to "Aktif sipariş sınırınız dolu.",
        "KPD_ORDER_ALREADY_TAKEN" to "Bu sipariş başka bir kuryeye atandı.",
        "KPD_RELEASE_AFTER_PICKUP" to "Teslim alınmış sipariş bırakılamaz. Yönetici ile iletişime geçin.",
        "KPD_REASON_REQUIRED" to "Lütfen bir gerekçe yazın.",
        "KPD_INVALID_TRANSITION" to "Sipariş bu aşamada bu işleme uygun değil.",
        "KPD_QR_INVALID" to "QR kod geçersiz.",
        "KPD_QR_EXPIRED" to "QR kodun süresi dolmuş. Müşteriden kodu yenilemesini isteyin.",
        "KPD_QR_REVOKED" to "Bu QR kod artık geçerli değil. Müşteriden yeni kod isteyin.",
        "KPD_QR_ALREADY_USED" to "Bu QR kod daha önce kullanıldı.",
        "KPD_QR_WRONG_COURIER" to "Bu sipariş size atanmamış.",
        "KPD_QR_ORDER_STATE" to "Sipariş teslim için uygun durumda değil (önce teslim alınmalı).",
        "KPD_INVALID_STORAGE_PATH" to "Fotoğraf yüklenemedi.",
        "KPD_STORAGE_UPLOAD_FAILED" to "Fotoğraf yüklenemedi. Teslimat bundan etkilenmez.",
    )

    fun of(t: Throwable?): String = when (t) {
        is AppException -> messages[t.code] ?: messages.getValue("KPD_INTERNAL")
        is java.io.IOException -> messages.getValue("KPD_NETWORK")
        else -> messages.getValue("KPD_INTERNAL")
    }
}
