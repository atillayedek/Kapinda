// Bu dosya scripts/generate-contracts.mjs tarafından üretilmiştir. Elle düzenlemeyin.
#nullable enable
namespace Kapinda.Vendor.Core.Contracts;

public enum AppRole
{
    Admin,
    Courier,
    Vendor,
    Customer
}

public static class AppRoleWire
{
    private static readonly System.Collections.Generic.Dictionary<AppRole, (string Wire, string Label)> Map = new()
    {
        [AppRole.Admin] = ("admin", "Yönetici"),
        [AppRole.Courier] = ("courier", "Kurye"),
        [AppRole.Vendor] = ("vendor", "İşletme"),
        [AppRole.Customer] = ("customer", "Müşteri")
    };

    public static string ToWire(this AppRole value) => Map[value].Wire;
    public static string ToLabel(this AppRole value) => Map[value].Label;

    public static AppRole? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum OrderStatus
{
    PendingPayment,
    PaymentConfirmed,
    VendorPending,
    VendorAccepted,
    Preparing,
    ReadyForPickup,
    CourierAssigned,
    PickedUp,
    OnTheWay,
    Delivered,
    Cancelled,
    Rejected,
    Failed
}

public static class OrderStatusWire
{
    private static readonly System.Collections.Generic.Dictionary<OrderStatus, (string Wire, string Label)> Map = new()
    {
        [OrderStatus.PendingPayment] = ("pending_payment", "Ödeme bekleniyor"),
        [OrderStatus.PaymentConfirmed] = ("payment_confirmed", "Ödeme onaylandı"),
        [OrderStatus.VendorPending] = ("vendor_pending", "İşletme onayı bekleniyor"),
        [OrderStatus.VendorAccepted] = ("vendor_accepted", "İşletme kabul etti"),
        [OrderStatus.Preparing] = ("preparing", "Hazırlanıyor"),
        [OrderStatus.ReadyForPickup] = ("ready_for_pickup", "Teslim almaya hazır"),
        [OrderStatus.CourierAssigned] = ("courier_assigned", "Kurye atandı"),
        [OrderStatus.PickedUp] = ("picked_up", "Kurye teslim aldı"),
        [OrderStatus.OnTheWay] = ("on_the_way", "Yolda"),
        [OrderStatus.Delivered] = ("delivered", "Teslim edildi"),
        [OrderStatus.Cancelled] = ("cancelled", "İptal edildi"),
        [OrderStatus.Rejected] = ("rejected", "İşletme reddetti"),
        [OrderStatus.Failed] = ("failed", "Başarısız")
    };

    public static string ToWire(this OrderStatus value) => Map[value].Wire;
    public static string ToLabel(this OrderStatus value) => Map[value].Label;

    public static OrderStatus? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum TransitionActor
{
    System,
    Customer,
    Vendor,
    Courier,
    Admin,
    QrVerification
}

public static class TransitionActorWire
{
    private static readonly System.Collections.Generic.Dictionary<TransitionActor, (string Wire, string Label)> Map = new()
    {
        [TransitionActor.System] = ("system", "Sistem"),
        [TransitionActor.Customer] = ("customer", "Müşteri"),
        [TransitionActor.Vendor] = ("vendor", "İşletme"),
        [TransitionActor.Courier] = ("courier", "Kurye"),
        [TransitionActor.Admin] = ("admin", "Yönetici"),
        [TransitionActor.QrVerification] = ("qr_verification", "QR doğrulama")
    };

    public static string ToWire(this TransitionActor value) => Map[value].Wire;
    public static string ToLabel(this TransitionActor value) => Map[value].Label;

    public static TransitionActor? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum PaymentStatus
{
    Initiated,
    Pending,
    Succeeded,
    Failed,
    RefundPending,
    Refunded
}

public static class PaymentStatusWire
{
    private static readonly System.Collections.Generic.Dictionary<PaymentStatus, (string Wire, string Label)> Map = new()
    {
        [PaymentStatus.Initiated] = ("initiated", "Başlatıldı"),
        [PaymentStatus.Pending] = ("pending", "Bekliyor"),
        [PaymentStatus.Succeeded] = ("succeeded", "Başarılı"),
        [PaymentStatus.Failed] = ("failed", "Başarısız"),
        [PaymentStatus.RefundPending] = ("refund_pending", "İade bekliyor"),
        [PaymentStatus.Refunded] = ("refunded", "İade edildi")
    };

    public static string ToWire(this PaymentStatus value) => Map[value].Wire;
    public static string ToLabel(this PaymentStatus value) => Map[value].Label;

    public static PaymentStatus? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum OrderPaymentState
{
    Pending,
    Paid,
    Failed,
    NotRequired,
    RefundPending,
    Refunded
}

public static class OrderPaymentStateWire
{
    private static readonly System.Collections.Generic.Dictionary<OrderPaymentState, (string Wire, string Label)> Map = new()
    {
        [OrderPaymentState.Pending] = ("pending", "Bekliyor"),
        [OrderPaymentState.Paid] = ("paid", "Ödendi"),
        [OrderPaymentState.Failed] = ("failed", "Başarısız"),
        [OrderPaymentState.NotRequired] = ("not_required", "Gerekli değil"),
        [OrderPaymentState.RefundPending] = ("refund_pending", "İade bekliyor"),
        [OrderPaymentState.Refunded] = ("refunded", "İade edildi")
    };

    public static string ToWire(this OrderPaymentState value) => Map[value].Wire;
    public static string ToLabel(this OrderPaymentState value) => Map[value].Label;

    public static OrderPaymentState? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum ProductPaymentMethod
{
    Cash,
    CardOnDelivery
}

public static class ProductPaymentMethodWire
{
    private static readonly System.Collections.Generic.Dictionary<ProductPaymentMethod, (string Wire, string Label)> Map = new()
    {
        [ProductPaymentMethod.Cash] = ("cash", "Kapıda nakit"),
        [ProductPaymentMethod.CardOnDelivery] = ("card_on_delivery", "Kapıda kredi kartı / POS")
    };

    public static string ToWire(this ProductPaymentMethod value) => Map[value].Wire;
    public static string ToLabel(this ProductPaymentMethod value) => Map[value].Label;

    public static ProductPaymentMethod? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum SubstitutionPreference
{
    FindAlternative,
    NotifyAndCancel,
    Remove
}

public static class SubstitutionPreferenceWire
{
    private static readonly System.Collections.Generic.Dictionary<SubstitutionPreference, (string Wire, string Label)> Map = new()
    {
        [SubstitutionPreference.FindAlternative] = ("find_alternative", "Alternatif ara"),
        [SubstitutionPreference.NotifyAndCancel] = ("notify_and_cancel", "Bana bildir ve iptal et"),
        [SubstitutionPreference.Remove] = ("remove", "Doğrudan çıkar")
    };

    public static string ToWire(this SubstitutionPreference value) => Map[value].Wire;
    public static string ToLabel(this SubstitutionPreference value) => Map[value].Label;

    public static SubstitutionPreference? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum ItemFulfillment
{
    Pending,
    Fulfilled,
    Substituted,
    Removed
}

public static class ItemFulfillmentWire
{
    private static readonly System.Collections.Generic.Dictionary<ItemFulfillment, (string Wire, string Label)> Map = new()
    {
        [ItemFulfillment.Pending] = ("pending", "Bekliyor"),
        [ItemFulfillment.Fulfilled] = ("fulfilled", "Hazırlandı"),
        [ItemFulfillment.Substituted] = ("substituted", "Alternatif ile değiştirildi"),
        [ItemFulfillment.Removed] = ("removed", "Çıkarıldı")
    };

    public static string ToWire(this ItemFulfillment value) => Map[value].Wire;
    public static string ToLabel(this ItemFulfillment value) => Map[value].Label;

    public static ItemFulfillment? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum IncidentType
{
    Accident,
    VehicleBreakdown,
    OutOfFuel,
    HealthIssue,
    SecurityIssue,
    RoadBlocked,
    Other
}

public static class IncidentTypeWire
{
    private static readonly System.Collections.Generic.Dictionary<IncidentType, (string Wire, string Label)> Map = new()
    {
        [IncidentType.Accident] = ("accident", "Kaza yaptım"),
        [IncidentType.VehicleBreakdown] = ("vehicle_breakdown", "Aracım arızalandı"),
        [IncidentType.OutOfFuel] = ("out_of_fuel", "Yakıtım bitti"),
        [IncidentType.HealthIssue] = ("health_issue", "Sağlık sorunum var"),
        [IncidentType.SecurityIssue] = ("security_issue", "Güvenlik sorunu"),
        [IncidentType.RoadBlocked] = ("road_blocked", "Yol kapalı / trafik"),
        [IncidentType.Other] = ("other", "Diğer")
    };

    public static string ToWire(this IncidentType value) => Map[value].Wire;
    public static string ToLabel(this IncidentType value) => Map[value].Label;

    public static IncidentType? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum CourierAvailability
{
    Offline,
    Available,
    Busy,
    Unavailable
}

public static class CourierAvailabilityWire
{
    private static readonly System.Collections.Generic.Dictionary<CourierAvailability, (string Wire, string Label)> Map = new()
    {
        [CourierAvailability.Offline] = ("offline", "Çevrimdışı"),
        [CourierAvailability.Available] = ("available", "Müsait"),
        [CourierAvailability.Busy] = ("busy", "Meşgul"),
        [CourierAvailability.Unavailable] = ("unavailable", "Kullanılamaz")
    };

    public static string ToWire(this CourierAvailability value) => Map[value].Wire;
    public static string ToLabel(this CourierAvailability value) => Map[value].Label;

    public static CourierAvailability? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum ApprovalStatus
{
    Pending,
    Active,
    Suspended,
    Rejected
}

public static class ApprovalStatusWire
{
    private static readonly System.Collections.Generic.Dictionary<ApprovalStatus, (string Wire, string Label)> Map = new()
    {
        [ApprovalStatus.Pending] = ("pending", "Onay bekliyor"),
        [ApprovalStatus.Active] = ("active", "Aktif"),
        [ApprovalStatus.Suspended] = ("suspended", "Askıya alındı"),
        [ApprovalStatus.Rejected] = ("rejected", "Reddedildi")
    };

    public static string ToWire(this ApprovalStatus value) => Map[value].Wire;
    public static string ToLabel(this ApprovalStatus value) => Map[value].Label;

    public static ApprovalStatus? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum ApplicationStatus
{
    Pending,
    Approved,
    Rejected
}

public static class ApplicationStatusWire
{
    private static readonly System.Collections.Generic.Dictionary<ApplicationStatus, (string Wire, string Label)> Map = new()
    {
        [ApplicationStatus.Pending] = ("pending", "İnceleniyor"),
        [ApplicationStatus.Approved] = ("approved", "Onaylandı"),
        [ApplicationStatus.Rejected] = ("rejected", "Reddedildi")
    };

    public static string ToWire(this ApplicationStatus value) => Map[value].Wire;
    public static string ToLabel(this ApplicationStatus value) => Map[value].Label;

    public static ApplicationStatus? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum SupportStatus
{
    Open,
    Waiting,
    Resolved
}

public static class SupportStatusWire
{
    private static readonly System.Collections.Generic.Dictionary<SupportStatus, (string Wire, string Label)> Map = new()
    {
        [SupportStatus.Open] = ("open", "Açık"),
        [SupportStatus.Waiting] = ("waiting", "Yanıt bekleniyor"),
        [SupportStatus.Resolved] = ("resolved", "Çözüldü")
    };

    public static string ToWire(this SupportStatus value) => Map[value].Wire;
    public static string ToLabel(this SupportStatus value) => Map[value].Label;

    public static SupportStatus? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum SettlementStatus
{
    Draft,
    Approved,
    Paid,
    Cancelled
}

public static class SettlementStatusWire
{
    private static readonly System.Collections.Generic.Dictionary<SettlementStatus, (string Wire, string Label)> Map = new()
    {
        [SettlementStatus.Draft] = ("draft", "Taslak"),
        [SettlementStatus.Approved] = ("approved", "Onaylandı"),
        [SettlementStatus.Paid] = ("paid", "Ödendi"),
        [SettlementStatus.Cancelled] = ("cancelled", "İptal")
    };

    public static string ToWire(this SettlementStatus value) => Map[value].Wire;
    public static string ToLabel(this SettlementStatus value) => Map[value].Label;

    public static SettlementStatus? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum DeviceApp
{
    Customer,
    Courier,
    Vendor,
    Admin
}

public static class DeviceAppWire
{
    private static readonly System.Collections.Generic.Dictionary<DeviceApp, (string Wire, string Label)> Map = new()
    {
        [DeviceApp.Customer] = ("customer", "Müşteri"),
        [DeviceApp.Courier] = ("courier", "Kurye"),
        [DeviceApp.Vendor] = ("vendor", "İşletme"),
        [DeviceApp.Admin] = ("admin", "Yönetici")
    };

    public static string ToWire(this DeviceApp value) => Map[value].Wire;
    public static string ToLabel(this DeviceApp value) => Map[value].Label;

    public static DeviceApp? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum DevicePlatform
{
    Web,
    Android,
    Windows
}

public static class DevicePlatformWire
{
    private static readonly System.Collections.Generic.Dictionary<DevicePlatform, (string Wire, string Label)> Map = new()
    {
        [DevicePlatform.Web] = ("web", "Web"),
        [DevicePlatform.Android] = ("android", "Android"),
        [DevicePlatform.Windows] = ("windows", "Windows")
    };

    public static string ToWire(this DevicePlatform value) => Map[value].Wire;
    public static string ToLabel(this DevicePlatform value) => Map[value].Label;

    public static DevicePlatform? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum SeoErrorCode
{
    SitemapFetchFailed,
    InvalidXml,
    HttpError,
    CanonicalMismatch,
    RobotsBlocked,
    NoindexDetected,
    DuplicateUrl,
    MissingMetadata
}

public static class SeoErrorCodeWire
{
    private static readonly System.Collections.Generic.Dictionary<SeoErrorCode, (string Wire, string Label)> Map = new()
    {
        [SeoErrorCode.SitemapFetchFailed] = ("SITEMAP_FETCH_FAILED", "Sitemap alınamadı"),
        [SeoErrorCode.InvalidXml] = ("INVALID_XML", "Geçersiz XML"),
        [SeoErrorCode.HttpError] = ("HTTP_ERROR", "HTTP hatası"),
        [SeoErrorCode.CanonicalMismatch] = ("CANONICAL_MISMATCH", "Canonical uyuşmazlığı"),
        [SeoErrorCode.RobotsBlocked] = ("ROBOTS_BLOCKED", "robots.txt tarafından engellendi"),
        [SeoErrorCode.NoindexDetected] = ("NOINDEX_DETECTED", "noindex tespit edildi"),
        [SeoErrorCode.DuplicateUrl] = ("DUPLICATE_URL", "Tekrarlanan URL"),
        [SeoErrorCode.MissingMetadata] = ("MISSING_METADATA", "Eksik metadata")
    };

    public static string ToWire(this SeoErrorCode value) => Map[value].Wire;
    public static string ToLabel(this SeoErrorCode value) => Map[value].Label;

    public static SeoErrorCode? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public enum HealthStatus
{
    Operational,
    Degraded,
    Unavailable
}

public static class HealthStatusWire
{
    private static readonly System.Collections.Generic.Dictionary<HealthStatus, (string Wire, string Label)> Map = new()
    {
        [HealthStatus.Operational] = ("operational", "Çalışıyor"),
        [HealthStatus.Degraded] = ("degraded", "Kısmi sorun"),
        [HealthStatus.Unavailable] = ("unavailable", "Erişilemiyor")
    };

    public static string ToWire(this HealthStatus value) => Map[value].Wire;
    public static string ToLabel(this HealthStatus value) => Map[value].Label;

    public static HealthStatus? FromWire(string? wire)
    {
        foreach (var pair in Map)
        {
            if (pair.Value.Wire == wire) return pair.Key;
        }
        return null;
    }
}

public static class BusinessRules
{
    public const decimal MinimumBasketTry = 250m;
    public const decimal CommissionPerItemTry = 20m;
}
