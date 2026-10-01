namespace Kapinda.Vendor.Core.Supabase;

public sealed record AuthSession(string AccessToken, string RefreshToken, long ExpiresAt, string UserId, string? Email);

/// <summary>Oturum saklama soyutlaması. Windows uygulaması DPAPI (CurrentUser) ile şifreli dosya kullanır.</summary>
public interface ISessionStore
{
    AuthSession? Load();
    void Save(AuthSession session);
    void Clear();
}

public sealed class InMemorySessionStore : ISessionStore
{
    private AuthSession? _s;
    public AuthSession? Load() => _s;
    public void Save(AuthSession session) => _s = session;
    public void Clear() => _s = null;
}
