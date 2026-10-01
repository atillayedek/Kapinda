using System.IO;
using System.Text.Json;
using Kapinda.Vendor.Core.Supabase;

namespace Kapinda.Vendor.App.Infrastructure;

public static class AppConfig
{
    /// <summary>appsettings.json (exe yanında) veya KAPINDA_SUPABASE_URL / KAPINDA_SUPABASE_ANON_KEY ortam değişkenleri.</summary>
    public static SupabaseOptions LoadSupabase()
    {
        string url = Environment.GetEnvironmentVariable("KAPINDA_SUPABASE_URL") ?? "";
        string key = Environment.GetEnvironmentVariable("KAPINDA_SUPABASE_ANON_KEY") ?? "";
        var file = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        if (File.Exists(file))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(file));
                if (doc.RootElement.TryGetProperty("Supabase", out var s))
                {
                    if (url.Length == 0 && s.TryGetProperty("Url", out var u)) url = u.GetString() ?? "";
                    if (key.Length == 0 && s.TryGetProperty("AnonKey", out var k)) key = k.GetString() ?? "";
                }
            }
            catch (JsonException)
            {
                // geçersiz yapılandırma → yapılandırılmamış sayılır
            }
        }
        return new SupabaseOptions(url.Trim(), key.Trim());
    }
}

/// <summary>Kullanıcı tercihleri (sesli uyarı vb.) — kritik olmayan yerel ayarlar.</summary>
public sealed class LocalPreferences
{
    private readonly string _path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Kapinda", "prefs.json");
    public bool SoundAlerts { get; set; } = true;
    public bool FlashWindow { get; set; } = true;
    public string? LastVendorId { get; set; }

    public static LocalPreferences Load()
    {
        var p = new LocalPreferences();
        try
        {
            if (File.Exists(p._path)) return JsonSerializer.Deserialize<LocalPreferences>(File.ReadAllText(p._path)) ?? p;
        }
        catch (Exception e) when (e is JsonException or IOException) { }
        return p;
    }

    public void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        File.WriteAllText(_path, JsonSerializer.Serialize(this));
    }
}
