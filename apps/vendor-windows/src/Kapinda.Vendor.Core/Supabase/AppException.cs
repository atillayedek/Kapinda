using System.Text.Json;
using System.Text.RegularExpressions;

namespace Kapinda.Vendor.Core.Supabase;

/// <summary>Sunucunun uygulama kodu (KPD_*). Kullanıcıya iç SQL/sunucu hata metni gösterilmez.</summary>
public sealed class AppException(string code, string? hint = null, Exception? inner = null) : Exception(code, inner)
{
    public string Code { get; } = code;
    public string? Hint { get; } = hint;

    private static readonly Regex KpdCode = new("^KPD_[A-Z_]+$", RegexOptions.Compiled);

    public static AppException FromResponse(int status, string body)
    {
        string? message = null, pgCode = null, hint = null;
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                if (root.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.Object && err.TryGetProperty("code", out var fc))
                    message = fc.GetString();
                if (message is null && root.TryGetProperty("message", out var m)) message = m.GetString();
                if (root.TryGetProperty("code", out var c) && c.ValueKind == JsonValueKind.String) pgCode = c.GetString();
                if (root.TryGetProperty("hint", out var h) && h.ValueKind == JsonValueKind.String) hint = h.GetString();
            }
        }
        catch (JsonException)
        {
            // gövde JSON değil
        }
        if (message is not null && KpdCode.IsMatch(message)) return new AppException(message, hint);
        return new AppException(pgCode switch
        {
            "23505" => "KPD_DUPLICATE",
            "42501" => "KPD_FORBIDDEN",
            "23514" or "22023" or "22P02" => "KPD_INVALID_INPUT",
            _ => status switch
            {
                401 => "KPD_AUTH_REQUIRED",
                403 => "KPD_FORBIDDEN",
                404 => "KPD_NOT_FOUND",
                429 => "KPD_RATE_LIMITED",
                _ => "KPD_INTERNAL",
            },
        });
    }
}

public static class ErrorMessages
{
    private static readonly Dictionary<string, string> Map = new()
    {
        ["KPD_AUTH_REQUIRED"] = "Oturumunuz sona erdi. Lütfen tekrar giriş yapın.",
        ["KPD_FORBIDDEN"] = "Bu işlem için yetkiniz yok.",
        ["KPD_NOT_FOUND"] = "Kayıt bulunamadı.",
        ["KPD_DUPLICATE"] = "Bu kayıt zaten mevcut.",
        ["KPD_INVALID_INPUT"] = "Girilen bilgiler geçersiz. Lütfen kontrol edin.",
        ["KPD_INVALID_PHONE"] = "Geçerli bir Türkiye telefon numarası girin.",
        ["KPD_RATE_LIMITED"] = "Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.",
        ["KPD_NETWORK"] = "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.",
        ["KPD_INTERNAL"] = "Beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin.",
        ["KPD_NOT_CONFIGURED"] = "Uygulama yapılandırması eksik (appsettings.json).",
        ["KPD_INVALID_CREDENTIALS"] = "E-posta veya şifre hatalı.",
        ["KPD_EMAIL_NOT_CONFIRMED"] = "E-posta adresiniz doğrulanmamış.",
        ["KPD_INVALID_TRANSITION"] = "Sipariş bu aşamada bu işleme uygun değil.",
        ["KPD_REASON_REQUIRED"] = "Lütfen bir gerekçe yazın.",
        ["KPD_VENDOR_NOT_ACTIVE"] = "İşletme hesabınız aktif değil.",
        ["KPD_ITEM_UPDATE_NOT_ALLOWED"] = "Bu ürün bu aşamada güncellenemez.",
        ["KPD_PRODUCT_UNAVAILABLE"] = "Seçilen ürün satışta değil.",
        ["KPD_PRODUCT_NOT_SELLABLE_ONLINE"] = "Bu ürün mevzuat gereği online siparişe kapalıdır.",
        ["KPD_OUT_OF_STOCK"] = "Seçilen ürünün stoğu yetersiz.",
        ["KPD_INVALID_QUANTITY"] = "Geçersiz adet.",
        ["KPD_INVALID_STORAGE_PATH"] = "Dosya yolu geçersiz.",
        ["KPD_IMMUTABLE_RECORD"] = "Bu kayıt değiştirilemez.",
        ["KPD_UPLOAD_TOO_LARGE"] = "Görsel en fazla 3 MB olabilir.",
        ["KPD_UNSUPPORTED_IMAGE"] = "Yalnız JPEG, PNG veya WebP görsel yüklenebilir.",
    };

    public static string Of(Exception e) => e switch
    {
        AppException a => Map.TryGetValue(a.Code, out var m) ? m : Map["KPD_INTERNAL"],
        HttpRequestException or TaskCanceledException or IOException => Map["KPD_NETWORK"],
        _ => Map["KPD_INTERNAL"],
    };
}
