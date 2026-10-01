// Bu dosya scripts/generate-contracts.mjs tarafından üretilmiştir. Elle düzenlemeyin.

export const AppRoleValues = ["admin","courier","vendor","customer"] as const;
export type AppRole = (typeof AppRoleValues)[number];
export const AppRoleLabels: Record<AppRole, string> = {
  "admin": "Yönetici",
  "courier": "Kurye",
  "vendor": "İşletme",
  "customer": "Müşteri"
};

export const OrderStatusValues = ["pending_payment","payment_confirmed","vendor_pending","vendor_accepted","preparing","ready_for_pickup","courier_assigned","picked_up","on_the_way","delivered","cancelled","rejected","failed"] as const;
export type OrderStatus = (typeof OrderStatusValues)[number];
export const OrderStatusLabels: Record<OrderStatus, string> = {
  "pending_payment": "Ödeme bekleniyor",
  "payment_confirmed": "Ödeme onaylandı",
  "vendor_pending": "İşletme onayı bekleniyor",
  "vendor_accepted": "İşletme kabul etti",
  "preparing": "Hazırlanıyor",
  "ready_for_pickup": "Teslim almaya hazır",
  "courier_assigned": "Kurye atandı",
  "picked_up": "Kurye teslim aldı",
  "on_the_way": "Yolda",
  "delivered": "Teslim edildi",
  "cancelled": "İptal edildi",
  "rejected": "İşletme reddetti",
  "failed": "Başarısız"
};

export const TransitionActorValues = ["system","customer","vendor","courier","admin","qr_verification"] as const;
export type TransitionActor = (typeof TransitionActorValues)[number];
export const TransitionActorLabels: Record<TransitionActor, string> = {
  "system": "Sistem",
  "customer": "Müşteri",
  "vendor": "İşletme",
  "courier": "Kurye",
  "admin": "Yönetici",
  "qr_verification": "QR doğrulama"
};

export const PaymentStatusValues = ["initiated","pending","succeeded","failed","refund_pending","refunded"] as const;
export type PaymentStatus = (typeof PaymentStatusValues)[number];
export const PaymentStatusLabels: Record<PaymentStatus, string> = {
  "initiated": "Başlatıldı",
  "pending": "Bekliyor",
  "succeeded": "Başarılı",
  "failed": "Başarısız",
  "refund_pending": "İade bekliyor",
  "refunded": "İade edildi"
};

export const OrderPaymentStateValues = ["pending","paid","failed","not_required","refund_pending","refunded"] as const;
export type OrderPaymentState = (typeof OrderPaymentStateValues)[number];
export const OrderPaymentStateLabels: Record<OrderPaymentState, string> = {
  "pending": "Bekliyor",
  "paid": "Ödendi",
  "failed": "Başarısız",
  "not_required": "Gerekli değil",
  "refund_pending": "İade bekliyor",
  "refunded": "İade edildi"
};

export const ProductPaymentMethodValues = ["cash","card_on_delivery"] as const;
export type ProductPaymentMethod = (typeof ProductPaymentMethodValues)[number];
export const ProductPaymentMethodLabels: Record<ProductPaymentMethod, string> = {
  "cash": "Kapıda nakit",
  "card_on_delivery": "Kapıda kredi kartı / POS"
};

export const SubstitutionPreferenceValues = ["find_alternative","notify_and_cancel","remove"] as const;
export type SubstitutionPreference = (typeof SubstitutionPreferenceValues)[number];
export const SubstitutionPreferenceLabels: Record<SubstitutionPreference, string> = {
  "find_alternative": "Alternatif ara",
  "notify_and_cancel": "Bana bildir ve iptal et",
  "remove": "Doğrudan çıkar"
};

export const ItemFulfillmentValues = ["pending","fulfilled","substituted","removed"] as const;
export type ItemFulfillment = (typeof ItemFulfillmentValues)[number];
export const ItemFulfillmentLabels: Record<ItemFulfillment, string> = {
  "pending": "Bekliyor",
  "fulfilled": "Hazırlandı",
  "substituted": "Alternatif ile değiştirildi",
  "removed": "Çıkarıldı"
};

export const IncidentTypeValues = ["accident","vehicle_breakdown","out_of_fuel","health_issue","security_issue","road_blocked","other"] as const;
export type IncidentType = (typeof IncidentTypeValues)[number];
export const IncidentTypeLabels: Record<IncidentType, string> = {
  "accident": "Kaza yaptım",
  "vehicle_breakdown": "Aracım arızalandı",
  "out_of_fuel": "Yakıtım bitti",
  "health_issue": "Sağlık sorunum var",
  "security_issue": "Güvenlik sorunu",
  "road_blocked": "Yol kapalı / trafik",
  "other": "Diğer"
};

export const CourierAvailabilityValues = ["offline","available","busy","unavailable"] as const;
export type CourierAvailability = (typeof CourierAvailabilityValues)[number];
export const CourierAvailabilityLabels: Record<CourierAvailability, string> = {
  "offline": "Çevrimdışı",
  "available": "Müsait",
  "busy": "Meşgul",
  "unavailable": "Kullanılamaz"
};

export const ApprovalStatusValues = ["pending","active","suspended","rejected"] as const;
export type ApprovalStatus = (typeof ApprovalStatusValues)[number];
export const ApprovalStatusLabels: Record<ApprovalStatus, string> = {
  "pending": "Onay bekliyor",
  "active": "Aktif",
  "suspended": "Askıya alındı",
  "rejected": "Reddedildi"
};

export const ApplicationStatusValues = ["pending","approved","rejected"] as const;
export type ApplicationStatus = (typeof ApplicationStatusValues)[number];
export const ApplicationStatusLabels: Record<ApplicationStatus, string> = {
  "pending": "İnceleniyor",
  "approved": "Onaylandı",
  "rejected": "Reddedildi"
};

export const SupportStatusValues = ["open","waiting","resolved"] as const;
export type SupportStatus = (typeof SupportStatusValues)[number];
export const SupportStatusLabels: Record<SupportStatus, string> = {
  "open": "Açık",
  "waiting": "Yanıt bekleniyor",
  "resolved": "Çözüldü"
};

export const SettlementStatusValues = ["draft","approved","paid","cancelled"] as const;
export type SettlementStatus = (typeof SettlementStatusValues)[number];
export const SettlementStatusLabels: Record<SettlementStatus, string> = {
  "draft": "Taslak",
  "approved": "Onaylandı",
  "paid": "Ödendi",
  "cancelled": "İptal"
};

export const DeviceAppValues = ["customer","courier","vendor","admin"] as const;
export type DeviceApp = (typeof DeviceAppValues)[number];
export const DeviceAppLabels: Record<DeviceApp, string> = {
  "customer": "Müşteri",
  "courier": "Kurye",
  "vendor": "İşletme",
  "admin": "Yönetici"
};

export const DevicePlatformValues = ["web","android","windows"] as const;
export type DevicePlatform = (typeof DevicePlatformValues)[number];
export const DevicePlatformLabels: Record<DevicePlatform, string> = {
  "web": "Web",
  "android": "Android",
  "windows": "Windows"
};

export const SeoErrorCodeValues = ["SITEMAP_FETCH_FAILED","INVALID_XML","HTTP_ERROR","CANONICAL_MISMATCH","ROBOTS_BLOCKED","NOINDEX_DETECTED","DUPLICATE_URL","MISSING_METADATA"] as const;
export type SeoErrorCode = (typeof SeoErrorCodeValues)[number];
export const SeoErrorCodeLabels: Record<SeoErrorCode, string> = {
  "SITEMAP_FETCH_FAILED": "Sitemap alınamadı",
  "INVALID_XML": "Geçersiz XML",
  "HTTP_ERROR": "HTTP hatası",
  "CANONICAL_MISMATCH": "Canonical uyuşmazlığı",
  "ROBOTS_BLOCKED": "robots.txt tarafından engellendi",
  "NOINDEX_DETECTED": "noindex tespit edildi",
  "DUPLICATE_URL": "Tekrarlanan URL",
  "MISSING_METADATA": "Eksik metadata"
};

export const HealthStatusValues = ["operational","degraded","unavailable"] as const;
export type HealthStatus = (typeof HealthStatusValues)[number];
export const HealthStatusLabels: Record<HealthStatus, string> = {
  "operational": "Çalışıyor",
  "degraded": "Kısmi sorun",
  "unavailable": "Erişilemiyor"
};

export const OrderTransitions: ReadonlyArray<readonly [OrderStatus, OrderStatus, TransitionActor]> = [["pending_payment","payment_confirmed","system"],["pending_payment","failed","system"],["pending_payment","cancelled","customer"],["pending_payment","cancelled","system"],["payment_confirmed","vendor_pending","system"],["vendor_pending","vendor_accepted","vendor"],["vendor_pending","rejected","vendor"],["vendor_pending","cancelled","customer"],["vendor_pending","cancelled","admin"],["vendor_pending","cancelled","system"],["vendor_accepted","preparing","vendor"],["vendor_accepted","cancelled","vendor"],["vendor_accepted","cancelled","admin"],["preparing","ready_for_pickup","vendor"],["preparing","cancelled","vendor"],["preparing","cancelled","admin"],["ready_for_pickup","courier_assigned","courier"],["ready_for_pickup","courier_assigned","admin"],["ready_for_pickup","courier_assigned","system"],["ready_for_pickup","cancelled","admin"],["courier_assigned","picked_up","courier"],["courier_assigned","ready_for_pickup","courier"],["courier_assigned","ready_for_pickup","admin"],["courier_assigned","ready_for_pickup","system"],["courier_assigned","cancelled","admin"],["picked_up","on_the_way","courier"],["picked_up","failed","admin"],["on_the_way","delivered","qr_verification"],["on_the_way","failed","admin"]] as const;

export const BusinessRules = {
  "minimumBasketTry": 250,
  "commissionPerItemTry": 20,
  "loyaltyOrderMilestone": 5,
  "loyaltyReferralMilestone": 5,
  "maxRatingCommentLength": 500,
  "deliveryPricingDefault": {
    "baseFeeTry": 120,
    "baseDistanceKm": 2,
    "perKmFeeTry": 10,
    "maxDistanceKm": 15
  },
  "seriousIncidentTypes": [
    "accident",
    "vehicle_breakdown",
    "out_of_fuel",
    "health_issue",
    "security_issue"
  ],
  "terminalOrderStatuses": [
    "delivered",
    "cancelled",
    "rejected",
    "failed"
  ],
  "activeCourierStatuses": [
    "courier_assigned",
    "picked_up",
    "on_the_way"
  ]
} as const;
