// Bu dosya scripts/generate-contracts.mjs tarafından üretilmiştir. Elle düzenlemeyin.
package site.kapinda.courier.core.contracts

enum class AppRole(val wire: String, val label: String) {
    ADMIN("admin", "Yönetici"),
    COURIER("courier", "Kurye"),
    VENDOR("vendor", "İşletme"),
    CUSTOMER("customer", "Müşteri");

    companion object {
        fun fromWire(value: String?): AppRole? = entries.firstOrNull { it.wire == value }
    }
}

enum class OrderStatus(val wire: String, val label: String) {
    PENDING_PAYMENT("pending_payment", "Ödeme bekleniyor"),
    PAYMENT_CONFIRMED("payment_confirmed", "Ödeme onaylandı"),
    VENDOR_PENDING("vendor_pending", "İşletme onayı bekleniyor"),
    VENDOR_ACCEPTED("vendor_accepted", "İşletme kabul etti"),
    PREPARING("preparing", "Hazırlanıyor"),
    READY_FOR_PICKUP("ready_for_pickup", "Teslim almaya hazır"),
    COURIER_ASSIGNED("courier_assigned", "Kurye atandı"),
    PICKED_UP("picked_up", "Kurye teslim aldı"),
    ON_THE_WAY("on_the_way", "Yolda"),
    DELIVERED("delivered", "Teslim edildi"),
    CANCELLED("cancelled", "İptal edildi"),
    REJECTED("rejected", "İşletme reddetti"),
    FAILED("failed", "Başarısız");

    companion object {
        fun fromWire(value: String?): OrderStatus? = entries.firstOrNull { it.wire == value }
    }
}

enum class TransitionActor(val wire: String, val label: String) {
    SYSTEM("system", "Sistem"),
    CUSTOMER("customer", "Müşteri"),
    VENDOR("vendor", "İşletme"),
    COURIER("courier", "Kurye"),
    ADMIN("admin", "Yönetici"),
    QR_VERIFICATION("qr_verification", "QR doğrulama");

    companion object {
        fun fromWire(value: String?): TransitionActor? = entries.firstOrNull { it.wire == value }
    }
}

enum class PaymentStatus(val wire: String, val label: String) {
    INITIATED("initiated", "Başlatıldı"),
    PENDING("pending", "Bekliyor"),
    SUCCEEDED("succeeded", "Başarılı"),
    FAILED("failed", "Başarısız"),
    REFUND_PENDING("refund_pending", "İade bekliyor"),
    REFUNDED("refunded", "İade edildi");

    companion object {
        fun fromWire(value: String?): PaymentStatus? = entries.firstOrNull { it.wire == value }
    }
}

enum class OrderPaymentState(val wire: String, val label: String) {
    PENDING("pending", "Bekliyor"),
    PAID("paid", "Ödendi"),
    FAILED("failed", "Başarısız"),
    NOT_REQUIRED("not_required", "Gerekli değil"),
    REFUND_PENDING("refund_pending", "İade bekliyor"),
    REFUNDED("refunded", "İade edildi");

    companion object {
        fun fromWire(value: String?): OrderPaymentState? = entries.firstOrNull { it.wire == value }
    }
}

enum class ProductPaymentMethod(val wire: String, val label: String) {
    CASH("cash", "Kapıda nakit"),
    CARD_ON_DELIVERY("card_on_delivery", "Kapıda kredi kartı / POS");

    companion object {
        fun fromWire(value: String?): ProductPaymentMethod? = entries.firstOrNull { it.wire == value }
    }
}

enum class SubstitutionPreference(val wire: String, val label: String) {
    FIND_ALTERNATIVE("find_alternative", "Alternatif ara"),
    NOTIFY_AND_CANCEL("notify_and_cancel", "Bana bildir ve iptal et"),
    REMOVE("remove", "Doğrudan çıkar");

    companion object {
        fun fromWire(value: String?): SubstitutionPreference? = entries.firstOrNull { it.wire == value }
    }
}

enum class ItemFulfillment(val wire: String, val label: String) {
    PENDING("pending", "Bekliyor"),
    FULFILLED("fulfilled", "Hazırlandı"),
    SUBSTITUTED("substituted", "Alternatif ile değiştirildi"),
    REMOVED("removed", "Çıkarıldı");

    companion object {
        fun fromWire(value: String?): ItemFulfillment? = entries.firstOrNull { it.wire == value }
    }
}

enum class IncidentType(val wire: String, val label: String) {
    ACCIDENT("accident", "Kaza yaptım"),
    VEHICLE_BREAKDOWN("vehicle_breakdown", "Aracım arızalandı"),
    OUT_OF_FUEL("out_of_fuel", "Yakıtım bitti"),
    HEALTH_ISSUE("health_issue", "Sağlık sorunum var"),
    SECURITY_ISSUE("security_issue", "Güvenlik sorunu"),
    ROAD_BLOCKED("road_blocked", "Yol kapalı / trafik"),
    OTHER("other", "Diğer");

    companion object {
        fun fromWire(value: String?): IncidentType? = entries.firstOrNull { it.wire == value }
    }
}

enum class CourierAvailability(val wire: String, val label: String) {
    OFFLINE("offline", "Çevrimdışı"),
    AVAILABLE("available", "Müsait"),
    BUSY("busy", "Meşgul"),
    UNAVAILABLE("unavailable", "Kullanılamaz");

    companion object {
        fun fromWire(value: String?): CourierAvailability? = entries.firstOrNull { it.wire == value }
    }
}

enum class ApprovalStatus(val wire: String, val label: String) {
    PENDING("pending", "Onay bekliyor"),
    ACTIVE("active", "Aktif"),
    SUSPENDED("suspended", "Askıya alındı"),
    REJECTED("rejected", "Reddedildi");

    companion object {
        fun fromWire(value: String?): ApprovalStatus? = entries.firstOrNull { it.wire == value }
    }
}

enum class ApplicationStatus(val wire: String, val label: String) {
    PENDING("pending", "İnceleniyor"),
    APPROVED("approved", "Onaylandı"),
    REJECTED("rejected", "Reddedildi");

    companion object {
        fun fromWire(value: String?): ApplicationStatus? = entries.firstOrNull { it.wire == value }
    }
}

enum class SupportStatus(val wire: String, val label: String) {
    OPEN("open", "Açık"),
    WAITING("waiting", "Yanıt bekleniyor"),
    RESOLVED("resolved", "Çözüldü");

    companion object {
        fun fromWire(value: String?): SupportStatus? = entries.firstOrNull { it.wire == value }
    }
}

enum class SettlementStatus(val wire: String, val label: String) {
    DRAFT("draft", "Taslak"),
    APPROVED("approved", "Onaylandı"),
    PAID("paid", "Ödendi"),
    CANCELLED("cancelled", "İptal");

    companion object {
        fun fromWire(value: String?): SettlementStatus? = entries.firstOrNull { it.wire == value }
    }
}

enum class DeviceApp(val wire: String, val label: String) {
    CUSTOMER("customer", "Müşteri"),
    COURIER("courier", "Kurye"),
    VENDOR("vendor", "İşletme"),
    ADMIN("admin", "Yönetici");

    companion object {
        fun fromWire(value: String?): DeviceApp? = entries.firstOrNull { it.wire == value }
    }
}

enum class DevicePlatform(val wire: String, val label: String) {
    WEB("web", "Web"),
    ANDROID("android", "Android"),
    WINDOWS("windows", "Windows");

    companion object {
        fun fromWire(value: String?): DevicePlatform? = entries.firstOrNull { it.wire == value }
    }
}

enum class SeoErrorCode(val wire: String, val label: String) {
    SITEMAP_FETCH_FAILED("SITEMAP_FETCH_FAILED", "Sitemap alınamadı"),
    INVALID_XML("INVALID_XML", "Geçersiz XML"),
    HTTP_ERROR("HTTP_ERROR", "HTTP hatası"),
    CANONICAL_MISMATCH("CANONICAL_MISMATCH", "Canonical uyuşmazlığı"),
    ROBOTS_BLOCKED("ROBOTS_BLOCKED", "robots.txt tarafından engellendi"),
    NOINDEX_DETECTED("NOINDEX_DETECTED", "noindex tespit edildi"),
    DUPLICATE_URL("DUPLICATE_URL", "Tekrarlanan URL"),
    MISSING_METADATA("MISSING_METADATA", "Eksik metadata");

    companion object {
        fun fromWire(value: String?): SeoErrorCode? = entries.firstOrNull { it.wire == value }
    }
}

enum class HealthStatus(val wire: String, val label: String) {
    OPERATIONAL("operational", "Çalışıyor"),
    DEGRADED("degraded", "Kısmi sorun"),
    UNAVAILABLE("unavailable", "Erişilemiyor");

    companion object {
        fun fromWire(value: String?): HealthStatus? = entries.firstOrNull { it.wire == value }
    }
}

object BusinessRules {
    const val MINIMUM_BASKET_TRY = 250
    const val COMMISSION_PER_ITEM_TRY = 20
    const val MAX_RATING_COMMENT_LENGTH = 500
    val SERIOUS_INCIDENT_TYPES: Set<IncidentType> = setOf(IncidentType.ACCIDENT, IncidentType.VEHICLE_BREAKDOWN, IncidentType.OUT_OF_FUEL, IncidentType.HEALTH_ISSUE, IncidentType.SECURITY_ISSUE)
    val ACTIVE_COURIER_STATUSES: Set<OrderStatus> = setOf(OrderStatus.COURIER_ASSIGNED, OrderStatus.PICKED_UP, OrderStatus.ON_THE_WAY)
    val TERMINAL_ORDER_STATUSES: Set<OrderStatus> = setOf(OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.FAILED)
}
