namespace Kapinda.Vendor.Core.Supabase;

/// <summary>Yalnız herkese açık (anon/publishable) anahtar. service_role anahtarı uygulamaya ASLA girmez.</summary>
public sealed record SupabaseOptions(string Url, string AnonKey)
{
    public bool IsConfigured => Url.StartsWith("https://", StringComparison.Ordinal) && !string.IsNullOrWhiteSpace(AnonKey);
    public string BaseUrl => Url.TrimEnd('/');
}
