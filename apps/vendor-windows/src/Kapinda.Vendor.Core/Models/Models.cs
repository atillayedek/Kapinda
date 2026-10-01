using System.Text.Json;
using System.Text.Json.Serialization;

namespace Kapinda.Vendor.Core.Models;

public sealed record VendorInfo(
    string Id, string Slug, string Name, string BusinessType, string? Description, string? LogoPath, string? CoverPath,
    string Phone, string? Email, string AddressText, double? Lat, double? Lng, string CoverageAreaId, string Status, bool IsOpen,
    decimal RatingAvg, int RatingCount);

public sealed record Membership(string VendorId, string MemberRole, VendorInfo? Vendors);

public sealed record OrderRow(
    string Id, string OrderNumber, string Status, string CustomerName, string CustomerPhone,
    Dictionary<string, JsonElement> DeliveryAddress, decimal ProductSubtotal, decimal DeliveryFeePayable, int ItemCount,
    string ProductPaymentMethod, string? CustomerNote, string? CancelReason, DateTimeOffset CreatedAt, DateTimeOffset? VendorVisibleAt,
    DateTimeOffset? AcceptedAt, DateTimeOffset? ReadyAt, DateTimeOffset? DeliveredAt, string? CourierId, CourierRef? Couriers)
{
    public string AddressLine
    {
        get
        {
            string? F(string k) => DeliveryAddress.TryGetValue(k, out var v) && v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString()) ? v.GetString() : null;
            return string.Join(", ", new[] { F("neighborhood"), F("street"), F("building") is { } b ? $"No: {b}" : null, F("apartment"), F("floor") is { } f ? $"Kat {f}" : null, F("door_number") is { } d ? $"Daire {d}" : null }.Where(x => x is not null));
        }
    }

    public string? Directions => DeliveryAddress.TryGetValue("directions", out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}

public sealed record CourierRef(string DisplayName);

public sealed record OrderItemRow(
    string Id, string ProductId, string ProductName, string? Barcode, string Unit, decimal UnitPrice, int Quantity, decimal LineTotal,
    string SubstitutionPreference, string Fulfillment);

public sealed record CategoryRow(string Id, string Name, string Slug, bool IsAgeRestricted, bool IsOnlineSaleAllowed, bool IsActive, int SortOrder);

public sealed record ProductRow(
    string Id, string VendorId, string CategoryId, string Name, string? Description, string? Barcode, decimal Price, string Unit,
    bool TrackStock, int? StockQuantity, bool IsActive, bool IsAgeRestricted, List<ProductImageRow>? ProductImages)
{
    public string? FirstImagePath => ProductImages?.OrderBy(i => i.SortOrder).FirstOrDefault()?.StoragePath;
}

public sealed record ProductImageRow(string? Id, string StoragePath, int SortOrder);

public sealed record VendorHour(string? Id, string VendorId, int Weekday, string? OpensAt, string? ClosesAt, bool IsClosed);

public sealed record SalesSummary(int DeliveredOrders, int CancelledOrders, int ActiveOrders, decimal ProductGmv, decimal CommissionTotal);

public sealed record SettlementRow(
    string Id, DateOnly PeriodStart, DateOnly PeriodEnd, int OrderCount, decimal ProductGmv, decimal CommissionTotal, decimal AdjustmentTotal,
    decimal PayableAmount, string Status, DateTimeOffset GeneratedAt, DateTimeOffset? ApprovedAt, DateTimeOffset? PaidAt);

public sealed record CommissionRow(string Id, string OrderId, int EligibleItemCount, decimal UnitAmount, decimal TotalAmount, decimal ProductGmv, DateTimeOffset DeliveredAt, string? SettlementId);

public sealed record AddressBookEntry(
    string Id, string Phone, string? CustomerName, string Neighborhood, string Street, string Building, string? Apartment, string? Floor,
    string? DoorNumber, string? Directions, int UseCount, DateTimeOffset LastUsedAt)
{
    public string AddressLine => string.Join(", ", new[] { Neighborhood, Street, $"No: {Building}", Apartment, Floor is null ? null : $"Kat {Floor}", DoorNumber is null ? null : $"Daire {DoorNumber}" }.Where(x => !string.IsNullOrWhiteSpace(x)));
}

public sealed record NotificationRow(string Id, string Type, string Title, string Body, DateTimeOffset? ReadAt, DateTimeOffset CreatedAt);

public sealed record RoleRow(string Role);

public sealed record VendorApplicationRow(string Status, string? ReviewNote);

public sealed record ProductInput(
    string CategoryId, string Name, string? Description, string? Barcode, decimal Price, string Unit, bool TrackStock, int? StockQuantity, bool IsActive);
