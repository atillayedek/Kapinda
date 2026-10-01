using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Kapinda.Vendor.Core.Supabase;

public sealed record RealtimeChange(string Table, string Type, JsonObject? Record);

/// <summary>
/// Supabase Realtime (Phoenix). postgres_changes yalnız RLS'in bu kullanıcıya izin verdiği satırları iletir
/// (işletme yalnız kendi ödenmiş siparişlerini alır). Kopmada üstel geri çekilmeyle yeniden bağlanır.
/// </summary>
public sealed class RealtimeClient : IAsyncDisposable
{
    private readonly SupabaseClient _supabase;
    private CancellationTokenSource? _cts;
    private int _ref = 1;

    public event Action<RealtimeChange>? Changed;
    public event Action<bool>? ConnectionChanged;

    public RealtimeClient(SupabaseClient supabase) => _supabase = supabase;

    public void Start(IReadOnlyList<string> tables)
    {
        if (!_supabase.Options.IsConfigured || _cts is not null) return;
        _cts = new CancellationTokenSource();
        _ = RunAsync(tables, _cts.Token);
    }

    public void Stop()
    {
        _cts?.Cancel();
        _cts = null;
    }

    private async Task RunAsync(IReadOnlyList<string> tables, CancellationToken ct)
    {
        var backoff = TimeSpan.FromSeconds(1);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var ws = new ClientWebSocket();
                ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
                var url = _supabase.Options.BaseUrl.Replace("https://", "wss://", StringComparison.Ordinal) +
                          $"/realtime/v1/websocket?apikey={Uri.EscapeDataString(_supabase.Options.AnonKey)}&vsn=1.0.0";
                await ws.ConnectAsync(new Uri(url), ct);
                var token = await _supabase.AccessTokenAsync(ct: ct);
                await SendAsync(ws, BuildJoin(tables, token), ct);
                ConnectionChanged?.Invoke(true);
                backoff = TimeSpan.FromSeconds(1);
                using var hbCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                var heartbeat = HeartbeatAsync(ws, hbCts.Token);
                await ReceiveLoopAsync(ws, ct);
                await hbCts.CancelAsync();
                await heartbeat.ContinueWith(_ => { }, TaskScheduler.Default);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception)
            {
                // yeniden bağlanılacak
            }
            ConnectionChanged?.Invoke(false);
            try { await Task.Delay(backoff, ct); } catch (OperationCanceledException) { break; }
            backoff = TimeSpan.FromSeconds(Math.Min(backoff.TotalSeconds * 2, 60));
        }
    }

    internal string BuildJoin(IReadOnlyList<string> tables, string token)
    {
        var changes = new JsonArray(tables.Select(t => (JsonNode)new JsonObject { ["event"] = "*", ["schema"] = "public", ["table"] = t }).ToArray());
        return new JsonObject
        {
            ["topic"] = "realtime:vendor",
            ["event"] = "phx_join",
            ["payload"] = new JsonObject { ["config"] = new JsonObject { ["postgres_changes"] = changes }, ["access_token"] = token },
            ["ref"] = Interlocked.Increment(ref _ref).ToString(System.Globalization.CultureInfo.InvariantCulture),
        }.ToJsonString();
    }

    private async Task HeartbeatAsync(ClientWebSocket ws, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
        {
            await Task.Delay(TimeSpan.FromSeconds(25), ct);
            var r = Interlocked.Increment(ref _ref);
            await SendAsync(ws, $$"""{"topic":"phoenix","event":"heartbeat","payload":{},"ref":"{{r}}"}""", ct);
            var token = await _supabase.AccessTokenAsync(ct: ct);
            await SendAsync(ws, new JsonObject
            {
                ["topic"] = "realtime:vendor",
                ["event"] = "access_token",
                ["payload"] = new JsonObject { ["access_token"] = token },
                ["ref"] = Interlocked.Increment(ref _ref).ToString(System.Globalization.CultureInfo.InvariantCulture),
            }.ToJsonString(), ct);
        }
    }

    private async Task ReceiveLoopAsync(ClientWebSocket ws, CancellationToken ct)
    {
        var buffer = new byte[64 * 1024];
        var sb = new StringBuilder();
        while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            var result = await ws.ReceiveAsync(buffer, ct);
            if (result.MessageType == WebSocketMessageType.Close) return;
            sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
            if (!result.EndOfMessage) continue;
            var text = sb.ToString();
            sb.Clear();
            var change = ParseChange(text);
            if (change is not null) Changed?.Invoke(change);
        }
    }

    internal static RealtimeChange? ParseChange(string text)
    {
        try
        {
            var msg = JsonNode.Parse(text)?.AsObject();
            if (msg?["event"]?.GetValue<string>() != "postgres_changes") return null;
            var data = msg["payload"]?["data"]?.AsObject();
            if (data is null) return null;
            return new RealtimeChange(data["table"]?.GetValue<string>() ?? "", data["type"]?.GetValue<string>() ?? "", data["record"] as JsonObject);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static Task SendAsync(ClientWebSocket ws, string text, CancellationToken ct) =>
        ws.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, ct);

    public ValueTask DisposeAsync()
    {
        Stop();
        return ValueTask.CompletedTask;
    }
}
