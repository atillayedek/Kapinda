using System.Net;
using System.Text;
using Kapinda.Vendor.Core.Contracts;
using Kapinda.Vendor.Core.Models;
using Kapinda.Vendor.Core.Services;
using Kapinda.Vendor.Core.Supabase;
using Xunit;

namespace Kapinda.Vendor.Core.Tests;

internal sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
{
    public List<HttpRequestMessage> Requests { get; } = [];
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Requests.Add(request);
        return Task.FromResult(respond(request));
    }
}

public class CoreTests
{
    private static readonly SupabaseOptions Opts = new("https://test.supabase.co", "anon");
    private static HttpResponseMessage Json(HttpStatusCode code, string body) => new(code) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    private static AuthSession FreshSession(long expiresIn = 3600) => new("access", "refresh", DateTimeOffset.UtcNow.ToUnixTimeSeconds() + expiresIn, "u1", "a@b.co");

    [Fact]
    public void Sunucu_kodlari_korunur_ic_hatalar_gizlenir()
    {
        Assert.Equal("KPD_INVALID_TRANSITION", AppException.FromResponse(400, """{"code":"P0001","message":"KPD_INVALID_TRANSITION","hint":"a->b"}""").Code);
        Assert.Equal("KPD_DUPLICATE", AppException.FromResponse(409, """{"code":"23505","message":"duplicate key value violates unique constraint"}""").Code);
        Assert.Equal("KPD_FORBIDDEN", AppException.FromResponse(403, """{"code":"42501","message":"permission denied for table orders"}""").Code);
        Assert.Equal("KPD_QR_EXPIRED", AppException.FromResponse(400, """{"error":{"code":"KPD_QR_EXPIRED"}}""").Code);
        var internalError = AppException.FromResponse(500, "relation \"orders\" does not exist");
        Assert.Equal("KPD_INTERNAL", internalError.Code);
        Assert.DoesNotContain("relation", ErrorMessages.Of(internalError));
        Assert.Equal("Bu kayıt zaten mevcut.", ErrorMessages.Of(new AppException("KPD_DUPLICATE")));
    }

    [Theory]
    [InlineData("4006381333931", true)]
    [InlineData("4006381333932", false)]
    [InlineData("400638133393", false)]
    [InlineData("abcdefghijklm", false)]
    public void Ean13(string code, bool valid) => Assert.Equal(valid, Validation.IsValidEan13(code));

    [Fact]
    public void Urun_dogrulama()
    {
        var ok = new ProductInput("c", "Süt 1L", null, "4006381333931", 32.5m, "adet", true, 10, true);
        Assert.Empty(Validation.ValidateProduct(ok));
        Assert.NotEmpty(Validation.ValidateProduct(ok with { Price = 0 }));
        Assert.NotEmpty(Validation.ValidateProduct(ok with { Barcode = "123" }));
        Assert.NotEmpty(Validation.ValidateProduct(ok with { TrackStock = true, StockQuantity = null }));
    }

    [Fact]
    public async Task Yapilandirma_yoksa_istek_gonderilmez()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, "[]"));
        var client = new SupabaseClient(new HttpClient(handler), new SupabaseOptions("", ""), new InMemorySessionStore());
        var ex = await Assert.ThrowsAsync<AppException>(() => client.SignInAsync("a@b.co", "x"));
        Assert.Equal("KPD_NOT_CONFIGURED", ex.Code);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task Rpc_401_sonrasi_token_yenilenir_ve_tekrar_denenir()
    {
        var store = new InMemorySessionStore();
        store.Save(FreshSession());
        var calls = 0;
        var handler = new FakeHandler(req =>
        {
            if (req.RequestUri!.AbsolutePath.StartsWith("/auth/v1/token", StringComparison.Ordinal))
                return Json(HttpStatusCode.OK, """{"access_token":"new","refresh_token":"r2","expires_in":3600,"user":{"id":"u1","email":"a@b.co"}}""");
            calls++;
            return calls == 1 ? Json(HttpStatusCode.Unauthorized, "{}") : Json(HttpStatusCode.OK, "\"vendor_accepted\"");
        });
        var client = new SupabaseClient(new HttpClient(handler), Opts, store);
        var status = await client.RpcAsync<string>("vendor_update_order_status", new { p_order_id = "x", p_to = "vendor_accepted" });
        Assert.Equal("vendor_accepted", status);
        Assert.Equal("new", store.Load()!.AccessToken);
        Assert.Equal("Bearer new", handler.Requests.Last().Headers.Authorization!.ToString());
        Assert.Equal("anon", handler.Requests.Last().Headers.GetValues("apikey").Single());
    }

    [Fact]
    public async Task Yenileme_reddedilirse_oturum_temizlenir()
    {
        var store = new InMemorySessionStore();
        store.Save(FreshSession(expiresIn: 10));
        var expired = false;
        var client = new SupabaseClient(new HttpClient(new FakeHandler(_ => Json(HttpStatusCode.BadRequest, """{"error":"invalid_grant"}"""))), Opts, store);
        client.SessionExpired += (_, _) => expired = true;
        var ex = await Assert.ThrowsAsync<AppException>(() => client.SelectAsync<List<RoleRow>>("user_roles", "select=role"));
        Assert.Equal("KPD_AUTH_REQUIRED", ex.Code);
        Assert.Null(store.Load());
        Assert.True(expired);
    }

    [Fact]
    public async Task Siparis_satiri_snake_case_ile_okunur()
    {
        var store = new InMemorySessionStore();
        store.Save(FreshSession());
        const string body = """
            [{"id":"o1","order_number":"KPD-261001-ABCDE","status":"vendor_pending","customer_name":"A B","customer_phone":"+905320000000",
            "delivery_address":{"neighborhood":"Merkez","street":"Cumhuriyet Cd.","building":"12","floor":"3","door_number":null},
            "product_subtotal":"820.00","delivery_fee_payable":140,"item_count":3,"product_payment_method":"cash","customer_note":null,"cancel_reason":null,
            "created_at":"2026-10-01T10:00:00+00:00","vendor_visible_at":"2026-10-01T10:01:00+00:00","accepted_at":null,"ready_at":null,"delivered_at":null,"courier_id":null,"couriers":null}]
            """;
        var client = new SupabaseClient(new HttpClient(new FakeHandler(_ => Json(HttpStatusCode.OK, body))), Opts, store);
        var svc = new VendorService(client);
        var orders = await svc.OrdersAsync("v1", ["vendor_pending"]);
        var o = Assert.Single(orders);
        Assert.Equal(820.00m, o.ProductSubtotal);
        Assert.Equal("Merkez, Cumhuriyet Cd., No: 12, Kat 3", o.AddressLine);
        Assert.Equal(OrderStatus.VendorPending, OrderStatusWire.FromWire(o.Status));
    }

    [Fact]
    public void Realtime_join_ve_degisiklik_ayristirma()
    {
        var rt = new RealtimeClient(new SupabaseClient(new HttpClient(), Opts, new InMemorySessionStore()));
        var join = rt.BuildJoin(["orders"], "tok");
        Assert.Contains("\"postgres_changes\":[{\"event\":\"*\",\"schema\":\"public\",\"table\":\"orders\"}]", join);
        Assert.Contains("\"access_token\":\"tok\"", join);
        var change = RealtimeClient.ParseChange("""{"event":"postgres_changes","payload":{"data":{"table":"orders","type":"UPDATE","record":{"id":"o1","status":"vendor_pending"}}}}""");
        Assert.NotNull(change);
        Assert.Equal("orders", change!.Table);
        Assert.Equal("vendor_pending", change.Record!["status"]!.GetValue<string>());
        Assert.Null(RealtimeClient.ParseChange("""{"event":"phx_reply"}"""));
    }

    [Fact]
    public void Contract_degerleri()
    {
        Assert.Equal("ready_for_pickup", OrderStatus.ReadyForPickup.ToWire());
        Assert.Equal(250m, BusinessRules.MinimumBasketTry);
        Assert.Equal(20m, BusinessRules.CommissionPerItemTry);
    }
}
