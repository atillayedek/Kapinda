namespace Kapinda.Vendor.Core.Services;

public static class Validation
{
    /// <summary>EAN-13 kontrol hanesi (sunucudaki is_valid_ean13 ile aynı kural).</summary>
    public static bool IsValidEan13(string? code)
    {
        if (code is null || code.Length != 13 || !code.All(char.IsAsciiDigit)) return false;
        var sum = 0;
        for (var i = 0; i < 12; i++) sum += (code[i] - '0') * (i % 2 == 0 ? 1 : 3);
        return (10 - sum % 10) % 10 == code[12] - '0';
    }

    public static IReadOnlyList<string> ValidateProduct(Models.ProductInput p)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(p.Name) || p.Name.Trim().Length < 2 || p.Name.Length > 160) errors.Add("Ürün adı 2–160 karakter olmalıdır.");
        if (string.IsNullOrWhiteSpace(p.CategoryId)) errors.Add("Kategori seçin.");
        if (p.Price <= 0 || p.Price > 100000) errors.Add("Fiyat 0'dan büyük ve 100.000 TL'den küçük olmalıdır.");
        if (!string.IsNullOrEmpty(p.Barcode) && !IsValidEan13(p.Barcode)) errors.Add("Barkod geçerli bir EAN-13 olmalıdır.");
        if (p.TrackStock && (p.StockQuantity is null || p.StockQuantity < 0)) errors.Add("Stok takibi açıkken stok miktarı girilmelidir.");
        if (p.Description is { Length: > 2000 }) errors.Add("Açıklama en fazla 2000 karakter olabilir.");
        if (p.Unit is not ("adet" or "kg" or "lt" or "paket" or "demet")) errors.Add("Geçersiz birim.");
        return errors;
    }
}
