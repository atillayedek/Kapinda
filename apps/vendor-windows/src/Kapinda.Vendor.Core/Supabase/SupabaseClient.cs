using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Kapinda.Vendor.Core.Supabase;

/// <summary>
/// Supabase Auth, PostgREST, RPC ve Storage için ince istemci. Yetkilendirme sunucuda (RLS + SECURITY DEFINER RPC) yapılır.
/// </summary>
public sealed class SupabaseClient
{
    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
    };

    private readonly HttpClient _http;
    private readonly SupabaseOptions _options;
    private readonly ISessionStore _sessions;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    public event EventHandler? SessionExpired;

    public SupabaseClient(HttpClient http, SupabaseOptions options, ISessionStore sessions)
    {
        _http = http;
        _options = options;
        _sessions = sessions;
    }

    public SupabaseOptions Options => _options;
    public AuthSession? Session => _sessions.Load();

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        if (!_options.IsConfigured) throw new AppException("KPD_NOT_CONFIGURED");
        var req = new HttpRequestMessage(method, _options.BaseUrl + path);
        req.Headers.Add("apikey", _options.AnonKey);
        req.Headers.Add("X-Client-Info", "kapinda-vendor-windows");
        return req;
    }

    // ------------------------------------------------------------------ Auth
    public async Task<AuthSession> SignInAsync(string email, string password, CancellationToken ct = default)
    {
        var req = Request(HttpMethod.Post, "/auth/v1/token?grant_type=password");
        req.Content = JsonContent(new { email = email.Trim().ToLowerInvariant(), password });
        using var res = await SendRaw(req, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new AppException(body.Contains("email_not_confirmed", StringComparison.Ordinal) ? "KPD_EMAIL_NOT_CONFIRMED"
                : res.StatusCode == HttpStatusCode.TooManyRequests ? "KPD_RATE_LIMITED"
                : (int)res.StatusCode is 400 or 401 ? "KPD_INVALID_CREDENTIALS" : "KPD_INTERNAL");
        }
        var session = ParseSession(body);
        _sessions.Save(session);
        return session;
    }

    internal static AuthSession ParseSession(string body)
    {
        var o = JsonNode.Parse(body)!.AsObject();
        var expiresAt = o["expires_at"]?.GetValue<long>() ?? DateTimeOffset.UtcNow.ToUnixTimeSeconds() + (o["expires_in"]?.GetValue<long>() ?? 3600);
        return new AuthSession(
            o["access_token"]!.GetValue<string>(),
            o["refresh_token"]!.GetValue<string>(),
            expiresAt,
            o["user"]!["id"]!.GetValue<string>(),
            o["user"]!["email"]?.GetValue<string>());
    }

    public async Task<string> AccessTokenAsync(bool forceRefresh = false, CancellationToken ct = default)
    {
        await _refreshLock.WaitAsync(ct);
        try
        {
            var s = _sessions.Load() ?? throw new AppException("KPD_AUTH_REQUIRED");
            if (!forceRefresh && s.ExpiresAt - DateTimeOffset.UtcNow.ToUnixTimeSeconds() > 60) return s.AccessToken;
            var req = Request(HttpMethod.Post, "/auth/v1/token?grant_type=refresh_token");
            req.Content = JsonContent(new { refresh_token = s.RefreshToken });
            using var res = await SendRaw(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                if ((int)res.StatusCode is >= 400 and < 500)
                {
                    _sessions.Clear();
                    SessionExpired?.Invoke(this, EventArgs.Empty);
                    throw new AppException("KPD_AUTH_REQUIRED");
                }
                throw new AppException("KPD_INTERNAL");
            }
            var session = ParseSession(body);
            _sessions.Save(session);
            return session.AccessToken;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    public async Task SignOutAsync()
    {
        var s = _sessions.Load();
        if (s is not null && _options.IsConfigured)
        {
            try
            {
                var req = Request(HttpMethod.Post, "/auth/v1/logout");
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", s.AccessToken);
                using var _ = await _http.SendAsync(req);
            }
            catch (HttpRequestException)
            {
                // ağ yoksa yerel oturum yine de silinir
            }
        }
        _sessions.Clear();
    }

    // ------------------------------------------------------------------ Data
    public Task<T> RpcAsync<T>(string fn, object? args = null, CancellationToken ct = default) =>
        SendAuthed<T>(() =>
        {
            var r = Request(HttpMethod.Post, $"/rest/v1/rpc/{fn}");
            r.Content = JsonContent(args ?? new { });
            return r;
        }, ct);

    public Task<T> SelectAsync<T>(string table, string query, CancellationToken ct = default) =>
        SendAuthed<T>(() => Request(HttpMethod.Get, $"/rest/v1/{table}?{query}"), ct);

    /// <summary>INSERT (RLS + kolon yetkileri sunucuda uygulanır)</summary>
    public Task<T> InsertAsync<T>(string table, object row, string select = "*", CancellationToken ct = default) =>
        SendAuthed<T>(() =>
        {
            var r = Request(HttpMethod.Post, $"/rest/v1/{table}?select={Uri.EscapeDataString(select)}");
            r.Headers.Add("Prefer", "return=representation");
            r.Content = JsonContent(row);
            return r;
        }, ct);

    public Task<T> UpdateAsync<T>(string table, string filter, object patch, string select = "*", CancellationToken ct = default) =>
        SendAuthed<T>(() =>
        {
            var r = Request(HttpMethod.Patch, $"/rest/v1/{table}?{filter}&select={Uri.EscapeDataString(select)}");
            r.Headers.Add("Prefer", "return=representation");
            r.Content = JsonContent(patch);
            return r;
        }, ct);

    public Task<JsonNode?> DeleteAsync(string table, string filter, CancellationToken ct = default) =>
        SendAuthed<JsonNode?>(() => Request(HttpMethod.Delete, $"/rest/v1/{table}?{filter}"), ct);

    public Task<JsonNode?> UploadAsync(string bucket, string path, byte[] bytes, string contentType, CancellationToken ct = default) =>
        SendAuthed<JsonNode?>(() =>
        {
            var r = Request(HttpMethod.Post, $"/storage/v1/object/{bucket}/{path}");
            r.Headers.Add("x-upsert", "false");
            r.Content = new ByteArrayContent(bytes);
            r.Content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
            return r;
        }, ct);

    public string PublicUrl(string bucket, string path) => $"{_options.BaseUrl}/storage/v1/object/public/{bucket}/{path}";

    private async Task<T> SendAuthed<T>(Func<HttpRequestMessage> build, CancellationToken ct)
    {
        var token = await AccessTokenAsync(ct: ct);
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var req = build();
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var res = await SendRaw(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (res.StatusCode == HttpStatusCode.Unauthorized && attempt == 0)
            {
                token = await AccessTokenAsync(forceRefresh: true, ct: ct);
                continue;
            }
            if (!res.IsSuccessStatusCode) throw AppException.FromResponse((int)res.StatusCode, body);
            if (string.IsNullOrWhiteSpace(body)) return default!;
            return JsonSerializer.Deserialize<T>(body, Json)!;
        }
        throw new AppException("KPD_AUTH_REQUIRED");
    }

    private async Task<HttpResponseMessage> SendRaw(HttpRequestMessage req, CancellationToken ct)
    {
        try
        {
            return await _http.SendAsync(req, ct);
        }
        catch (HttpRequestException e)
        {
            throw new AppException("KPD_NETWORK", inner: e);
        }
        catch (TaskCanceledException e) when (!ct.IsCancellationRequested)
        {
            throw new AppException("KPD_NETWORK", inner: e);
        }
    }

    private static StringContent JsonContent(object value) =>
        new(JsonSerializer.Serialize(value, Json), Encoding.UTF8, "application/json");
}
