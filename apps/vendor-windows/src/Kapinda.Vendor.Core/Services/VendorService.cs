using System.Globalization;
using System.Text.Json.Nodes;
using Kapinda.Vendor.Core.Models;
using Kapinda.Vendor.Core.Supabase;

namespace Kapinda.Vendor.Core.Services;

/// <summary>
/// İşletme işlemleri. İşletme teslimat ücretini, platform komisyonunu ve sipariş tutarını DEĞİŞTİREMEZ:
/// bu alanlar için istemciye yazma yetkisi yoktur ve sunucu tetikleyicileri reddeder.
/// </summary>
public sealed class VendorService(SupabaseClient api)
{
    private static string E(string s) => Uri.EscapeDataString(s);
    private static string Iso(DateTimeOffset d) => E(d.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture));

    public SupabaseClient Api => api;

    public async Task<bool> HasVendorRoleAsync(CancellationToken ct = default)
    {
        var uid = api.Session?.UserId ?? throw new AppException("KPD_AUTH_REQUIRED");
        var rows = await api.SelectAsync<List<RoleRow>>("user_roles", $"select=role&user_id=eq.{E(uid)}&role=eq.vendor", ct);
        return rows.Count > 0;
    }

    public async Task<List<Membership>> MembershipsAsync(CancellationToken ct = default)
    {
        var uid = api.Session?.UserId ?? throw new AppException("KPD_AUTH_REQUIRED");
        return await api.SelectAsync<List<Membership>>("vendor_members",
            $"select=vendor_id,member_role,vendors(id,slug,name,business_type,description,logo_path,cover_path,phone,email,address_text,lat,lng,coverage_area_id,status,is_open,rating_avg,rating_count)&user_id=eq.{E(uid)}", ct);
    }

    public async Task<VendorApplicationRow?> LatestApplicationAsync(CancellationToken ct = default)
    {
        var uid = api.Session?.UserId ?? throw new AppException("KPD_AUTH_REQUIRED");
        var rows = await api.SelectAsync<List<VendorApplicationRow>>("vendor_applications", $"select=status,review_note&applicant_user_id=eq.{E(uid)}&order=created_at.desc&limit=1", ct);
        return rows.FirstOrDefault();
    }

    private const string OrderCols = "id,order_number,status,customer_name,customer_phone,delivery_address,product_subtotal,delivery_fee_payable,item_count," +
        "product_payment_method,customer_note,cancel_reason,created_at,vendor_visible_at,accepted_at,ready_at,delivered_at,courier_id,couriers(display_name)";

    /// <summary>RLS: işletme yalnız kendi, ödemesi tamamlanmış (vendor_visible_at dolu) siparişlerini görür.</summary>
    public Task<List<OrderRow>> OrdersAsync(string vendorId, IReadOnlyCollection<string>? statuses, int limit = 100, int offset = 0, CancellationToken ct = default)
    {
        var q = $"select={E(OrderCols)}&vendor_id=eq.{E(vendorId)}&order=created_at.desc&limit={limit}&offset={offset}";
        if (statuses is { Count: > 0 }) q += $"&status=in.({string.Join(',', statuses)})";
        return api.SelectAsync<List<OrderRow>>("orders", q, ct);
    }

    public async Task<OrderRow?> OrderAsync(string orderId, CancellationToken ct = default) =>
        (await api.SelectAsync<List<OrderRow>>("orders", $"select={E(OrderCols)}&id=eq.{E(orderId)}", ct)).FirstOrDefault();

    public Task<List<OrderItemRow>> OrderItemsAsync(string orderId, CancellationToken ct = default) =>
        api.SelectAsync<List<OrderItemRow>>("order_items", $"select=id,product_id,product_name,barcode,unit,unit_price,quantity,line_total,substitution_preference,fulfillment&order_id=eq.{E(orderId)}&order=created_at", ct);

    public Task<string> UpdateOrderStatusAsync(string orderId, string to, string? reason = null, CancellationToken ct = default) =>
        api.RpcAsync<string>("vendor_update_order_status", new { p_order_id = orderId, p_to = to, p_reason = reason }, ct);

    public Task<JsonNode?> MarkItemUnavailableAsync(string itemId, string? substituteProductId, int? substituteQuantity, CancellationToken ct = default) =>
        api.RpcAsync<JsonNode?>("vendor_mark_item_unavailable", new { p_item_id = itemId, p_substitute_product_id = substituteProductId, p_substitute_quantity = substituteQuantity }, ct);

    public Task<List<CategoryRow>> CategoriesAsync(CancellationToken ct = default) =>
        api.SelectAsync<List<CategoryRow>>("categories", "select=id,name,slug,is_age_restricted,is_online_sale_allowed,is_active,sort_order&is_active=eq.true&order=sort_order", ct);

    private const string ProductCols = "id,vendor_id,category_id,name,description,barcode,price,unit,track_stock,stock_quantity,is_active,is_age_restricted,product_images(id,storage_path,sort_order)";

    public Task<List<ProductRow>> ProductsAsync(string vendorId, string? search, int limit = 200, int offset = 0, CancellationToken ct = default)
    {
        var q = $"select={E(ProductCols)}&vendor_id=eq.{E(vendorId)}&deleted_at=is.null&order=name&limit={limit}&offset={offset}";
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q += Validation.IsValidEan13(s) ? $"&barcode=eq.{s}" : $"&name=ilike.{E("*" + s.Replace("*", "", StringComparison.Ordinal) + "*")}";
        }
        return api.SelectAsync<List<ProductRow>>("products", q, ct);
    }

    public async Task<ProductRow?> ProductByBarcodeAsync(string vendorId, string barcode, CancellationToken ct = default) =>
        (await api.SelectAsync<List<ProductRow>>("products", $"select={E(ProductCols)}&vendor_id=eq.{E(vendorId)}&barcode=eq.{E(barcode)}&deleted_at=is.null", ct)).FirstOrDefault();

    public async Task<ProductRow> SaveProductAsync(string vendorId, string? productId, ProductInput p, CancellationToken ct = default)
    {
        var errors = Validation.ValidateProduct(p);
        if (errors.Count > 0) throw new AppException("KPD_INVALID_INPUT", string.Join(" ", errors));
        var row = new
        {
            category_id = p.CategoryId,
            name = p.Name.Trim(),
            description = string.IsNullOrWhiteSpace(p.Description) ? null : p.Description.Trim(),
            barcode = string.IsNullOrWhiteSpace(p.Barcode) ? null : p.Barcode.Trim(),
            price = p.Price,
            unit = p.Unit,
            track_stock = p.TrackStock,
            stock_quantity = p.TrackStock ? p.StockQuantity : null,
            is_active = p.IsActive,
        };
        if (productId is null)
        {
            var created = await api.InsertAsync<List<ProductRow>>("products", new
            {
                vendor_id = vendorId, row.category_id, row.name, row.description, row.barcode, row.price, row.unit, row.track_stock, row.stock_quantity, row.is_active,
            }, ProductCols, ct);
            return created.Single();
        }
        var updated = await api.UpdateAsync<List<ProductRow>>("products", $"id=eq.{E(productId)}", row, ProductCols, ct);
        return updated.Single();
    }

    public Task SetStockAsync(string productId, int quantity, CancellationToken ct = default) =>
        quantity < 0 ? throw new AppException("KPD_INVALID_INPUT") :
        api.UpdateAsync<List<ProductRow>>("products", $"id=eq.{E(productId)}", new { stock_quantity = quantity }, "id", ct);

    public Task DeleteProductAsync(string productId, CancellationToken ct = default) =>
        api.UpdateAsync<List<JsonObject>>("products", $"id=eq.{E(productId)}", new { deleted_at = DateTimeOffset.UtcNow, is_active = false }, "id", ct);

    public async Task AddProductImageAsync(string vendorId, string productId, byte[] bytes, string contentType, CancellationToken ct = default)
    {
        if (bytes.Length > 3 * 1024 * 1024) throw new AppException("KPD_UPLOAD_TOO_LARGE");
        var ext = contentType switch { "image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp", _ => throw new AppException("KPD_UNSUPPORTED_IMAGE") };
        var path = $"{vendorId}/{productId}/{Guid.NewGuid():N}.{ext}";
        await api.UploadAsync("product-images", path, bytes, contentType, ct);
        await api.InsertAsync<List<JsonObject>>("product_images", new { product_id = productId, vendor_id = vendorId, storage_path = path, sort_order = 0 }, "id", ct);
    }

    public async Task<string> UploadVendorAssetAsync(string vendorId, string kind, byte[] bytes, string contentType, CancellationToken ct = default)
    {
        if (bytes.Length > 3 * 1024 * 1024) throw new AppException("KPD_UPLOAD_TOO_LARGE");
        var ext = contentType switch { "image/jpeg" => "jpg", "image/png" => "png", "image/webp" => "webp", _ => throw new AppException("KPD_UNSUPPORTED_IMAGE") };
        var path = $"{vendorId}/{kind}-{Guid.NewGuid():N}.{ext}";
        await api.UploadAsync("vendor-assets", path, bytes, contentType, ct);
        await api.UpdateAsync<List<JsonObject>>("vendors", $"id=eq.{E(vendorId)}", kind == "logo" ? new { logo_path = path } : (object)new { cover_path = path }, "id", ct);
        return path;
    }

    public Task UpdateStoreAsync(string vendorId, string? description, string phone, string? email, CancellationToken ct = default) =>
        api.UpdateAsync<List<JsonObject>>("vendors", $"id=eq.{E(vendorId)}", new { description, phone, email }, "id", ct);

    public Task SetOpenAsync(string vendorId, bool open, CancellationToken ct = default) =>
        api.UpdateAsync<List<JsonObject>>("vendors", $"id=eq.{E(vendorId)}", new { is_open = open }, "id", ct);

    public Task<List<VendorHour>> HoursAsync(string vendorId, CancellationToken ct = default) =>
        api.SelectAsync<List<VendorHour>>("vendor_hours", $"select=id,vendor_id,weekday,opens_at,closes_at,is_closed&vendor_id=eq.{E(vendorId)}&order=weekday", ct);

    public async Task SaveHoursAsync(string vendorId, IEnumerable<VendorHour> hours, CancellationToken ct = default)
    {
        foreach (var h in hours)
        {
            var row = new { vendor_id = vendorId, weekday = h.Weekday, opens_at = h.IsClosed ? null : h.OpensAt, closes_at = h.IsClosed ? null : h.ClosesAt, is_closed = h.IsClosed };
            if (h.Id is null) await api.InsertAsync<List<JsonObject>>("vendor_hours", row, "id", ct);
            else await api.UpdateAsync<List<JsonObject>>("vendor_hours", $"id=eq.{E(h.Id)}", row, "id", ct);
        }
    }

    public Task ClearHoursAsync(string vendorId, CancellationToken ct = default) => api.DeleteAsync("vendor_hours", $"vendor_id=eq.{E(vendorId)}", ct);

    public Task<SalesSummary> SalesSummaryAsync(string vendorId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct = default) =>
        api.RpcAsync<SalesSummary>("vendor_sales_summary", new { p_vendor_id = vendorId, p_from = from, p_to = to }, ct);

    public Task<List<SettlementRow>> SettlementsAsync(string vendorId, CancellationToken ct = default) =>
        api.SelectAsync<List<SettlementRow>>("vendor_settlements", $"select=id,period_start,period_end,order_count,product_gmv,commission_total,adjustment_total,payable_amount,status,generated_at,approved_at,paid_at&vendor_id=eq.{E(vendorId)}&order=period_start.desc", ct);

    public Task<List<CommissionRow>> CommissionsAsync(string vendorId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct = default) =>
        api.SelectAsync<List<CommissionRow>>("platform_commissions", $"select=id,order_id,eligible_item_count,unit_amount,total_amount,product_gmv,delivered_at,settlement_id&vendor_id=eq.{E(vendorId)}&delivered_at=gte.{Iso(from)}&delivered_at=lt.{Iso(to)}&order=delivered_at.desc", ct);

    /// <summary>Telefon normalizasyonu sunucuda (normalize_tr_phone) yapılır; tüm yazımlar aynı kayda eşleşir.</summary>
    public Task<List<AddressBookEntry>> AddressBookLookupAsync(string vendorId, string phone, CancellationToken ct = default) =>
        api.RpcAsync<List<AddressBookEntry>>("vendor_address_book_lookup", new { p_vendor_id = vendorId, p_phone = phone }, ct);

    public Task<List<NotificationRow>> NotificationsAsync(CancellationToken ct = default) =>
        api.SelectAsync<List<NotificationRow>>("notifications", "select=id,type,title,body,read_at,created_at&app=eq.vendor&order=created_at.desc&limit=50", ct);

    public Task MarkNotificationsReadAsync(CancellationToken ct = default) => api.RpcAsync<int>("mark_notifications_read", new { p_ids = (string[]?)null }, ct);

    public Task LogClientEventAsync(string type, string message) =>
        api.RpcAsync<JsonNode?>("log_client_event", new { p_source = "vendor_windows", p_type = type, p_severity = "warning", p_message = message, p_context = new { } });
}
