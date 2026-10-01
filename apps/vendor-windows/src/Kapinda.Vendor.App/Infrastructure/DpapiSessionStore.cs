using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kapinda.Vendor.Core.Supabase;

namespace Kapinda.Vendor.App.Infrastructure;

/// <summary>Oturum, Windows DPAPI (CurrentUser) ile şifrelenmiş olarak kullanıcı profilinde saklanır.</summary>
public sealed class DpapiSessionStore : ISessionStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("kapinda.vendor.session.v1");
    private readonly string _path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Kapinda", "session.bin");
    private AuthSession? _cache;

    public AuthSession? Load()
    {
        if (_cache is not null) return _cache;
        try
        {
            if (!File.Exists(_path)) return null;
            var plain = ProtectedData.Unprotect(File.ReadAllBytes(_path), Entropy, DataProtectionScope.CurrentUser);
            _cache = JsonSerializer.Deserialize<AuthSession>(plain);
            return _cache;
        }
        catch (Exception e) when (e is CryptographicException or JsonException or IOException)
        {
            Clear();
            return null;
        }
    }

    public void Save(AuthSession session)
    {
        _cache = session;
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        File.WriteAllBytes(_path, ProtectedData.Protect(JsonSerializer.SerializeToUtf8Bytes(session), Entropy, DataProtectionScope.CurrentUser));
    }

    public void Clear()
    {
        _cache = null;
        try { if (File.Exists(_path)) File.Delete(_path); } catch (IOException) { }
    }
}
